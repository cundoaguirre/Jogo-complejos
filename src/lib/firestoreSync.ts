import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  deleteField,
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  increment, 
  writeBatch,
  runTransaction,
  limit,
  arrayUnion,
  arrayRemove 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType as FirestoreOpType } from './firebase';
import type { 
  User, Court, Match, Product, ProductCategory, InventoryMovement, ProductBatch,
  POSTransaction, TransactionPayment, TransactionItem, SupportTicket,
  OperationDocument, FinancialMovementDocument, IdempotencyRecord,
  ComplexCountersDocument, OperationType, OperationPaymentStatus,
  FinancialMovementCategory, FinancialPaymentMethod, FinancialMovementFlow,
  CreateOperationParams, RegisterOperationPaymentParams,
  RegisterHistoricalDebtPaymentParams, CancelOperationParams,
  OperationResult, PaymentRegistrationResult, HistoricalDebtPaymentResult,
  ExpenseEntity, ExpenseEntityType, BookingCreatedSource
} from '../types';
import {
  calculateFinancialBalances,
  validateStateTransition,
  calculateCurrentAccountAssignment,
  calculateCurrentAccountClearing,
  calculateHistoricalDebtSettlement,
  validateIdempotencyRequest,
  formatTicketCode
} from './financialMath';
import { calculateCancellationFinancialPlan } from './cancellationPolicy';
import { isBookingPlayed } from './userMetrics';
import { consumeProductBatchesFifo, restoreProductBatches, type FifoConsumeResult } from './inventoryFifo';
import { 
  normalizeUnifiedCourt, 
  resolveUnifiedSchedule, 
  hoursToWeeklySchedule, 
  doesCrossMidnight 
} from './complexProfileSync';
import {
  findMatchingLocalUser,
  isSameComplex,
  normalizePhoneNumber,
  isGenericPlaceholderName,
  getComplexAliasIds,
  isUserHiddenForComplex
} from './crmActivityIndex';
import { getCourtPriceForDuration, sanitizePricesByDuration } from './scheduleUtils';

export const COMPLEJOS_COLLECTION = 'complejos';
export const BOOKINGS_COLLECTION = 'bookings';
export const USERS_COLLECTION = 'users';
export const COLLABORATORS_COLLECTION = 'collaborators';
export const PRODUCTS_COLLECTION = 'products';
export const TRANSACTIONS_COLLECTION = 'transactions';
export const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';
export const CATEGORIES_COLLECTION = 'categories';
export const BOOKING_LOCKS_COLLECTION = 'booking_locks';
export const SUPPORT_TICKETS_COLLECTION = 'support_tickets';
export const OPERATIONS_COLLECTION = 'operations';
export const FINANCIAL_MOVEMENTS_COLLECTION = 'financial_movements';
export const IDEMPOTENCY_COLLECTION = 'idempotency_keys';
export const COMPLEX_COUNTERS_COLLECTION = 'complex_counters';
export const EXPENSE_ENTITIES_COLLECTION = 'categories';


/**
 * Returns current complexId for scoping data to the active complex (no unauthorized fallbacks)
 */
export function getActiveComplexId(user?: any, customComplexId?: string): string {
  if (customComplexId && customComplexId !== 'complejo_central') {
    return customComplexId;
  }
  if (user && user.activeComplexId) {
    return user.activeComplexId;
  }
  return '';
}

/**
 * Sanitiza recursivamente un documento u objeto eliminando cualquier clave cuyo valor sea 'undefined',
 * garantizando compatibilidad absoluta con Transaction.set(), setDoc() y updateDoc() en Firebase Firestore.
 */
export function cleanFirestoreDocument<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && typeof (value as any).toDate !== 'function') {
        result[key] = cleanFirestoreDocument(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export type SharedSubscriptionFn<T> = ((key: string, cb: (val: T) => void) => () => void) & {
  getCached: (key: string) => T | undefined;
};

export function createSharedSubscription<T>(
  subscribeFn: (key: string, emit: (val: T) => void) => () => void
): SharedSubscriptionFn<T> {
  const channels = new Map<string, {
    listeners: Set<(val: T) => void>;
    hasValue: boolean;
    lastValue?: T;
    unsub?: () => void;
  }>();

  const subscribe = ((key: string, cb: (val: T) => void) => {
    let ch = channels.get(key);
    if (!ch) {
      ch = { listeners: new Set(), hasValue: false };
      channels.set(key, ch);
      ch.unsub = subscribeFn(key, (val: T) => {
        const entry = channels.get(key);
        if (!entry) return;
        entry.hasValue = true;
        entry.lastValue = val;
        entry.listeners.forEach(fn => {
          try {
            fn(val);
          } catch (e) {
            console.warn('[FirestoreSharedSub] Listener error:', e);
          }
        });
      });
    }

    ch.listeners.add(cb);
    if (ch.hasValue) {
      try {
        cb(ch.lastValue as T);
      } catch (e) {
        console.warn('[FirestoreSharedSub] Initial replay error:', e);
      }
    }

    return () => {
      const entry = channels.get(key);
      if (!entry) return;
      entry.listeners.delete(cb);
      if (entry.listeners.size === 0) {
        try {
          entry.unsub?.();
        } catch {}
        channels.delete(key);
      }
    };
  }) as SharedSubscriptionFn<T>;

  subscribe.getCached = (key: string): T | undefined => {
    const ch = channels.get(key);
    return ch && ch.hasValue ? ch.lastValue : undefined;
  };

  return subscribe;
}

const subscribeToComplejoDoc = createSharedSubscription<{ exists: boolean; id: string; data: any }>(
  (targetId, emit) => {
    try {
      const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
      return onSnapshot(
        compRef,
        (snap) => {
          emit({ exists: snap.exists(), id: snap.id, data: snap.exists() ? snap.data() : null });
        },
        (err) => {
          console.warn(`[Firestore] Error en snapshot compartido complejos/${targetId}:`, err);
          emit({ exists: false, id: targetId, data: null });
        }
      );
    } catch (e) {
      console.warn(`[Firestore] Error al suscribir complejos/${targetId}:`, e);
      emit({ exists: false, id: targetId, data: null });
      return () => {};
    }
  }
);

export const NON_MONETARY_PAYMENT_METHODS = new Set([
  'pendiente',
  'pending',
  'fiado',
  'cuenta corriente',
  'cuenta_corriente',
  'cta cte',
  'cta. cte.',
  'ctacte',
  'account',
  'unpaid',
  'other',
  'otro',
  'ninguno',
  'none'
]);

export function normalizeMonetaryPaymentMethod(rawMethod?: string | null): FinancialPaymentMethod | null {
  const m = String(rawMethod || '').toLowerCase().trim();
  if (!m || NON_MONETARY_PAYMENT_METHODS.has(m)) return null;
  if (m === 'cash' || m === 'efectivo' || m.includes('efect')) return 'cash';
  if (m === 'transfer' || m === 'transferencia' || m.includes('transf')) return 'transfer';
  if (m === 'mercado_pago' || m === 'mercadopago' || m === 'mp' || m.includes('mercado')) return 'mercado_pago';
  if (m === 'debit' || m.includes('débit') || m.includes('debit')) return 'debit';
  if (m === 'credit' || m === 'card' || m === 'tarjeta' || m.includes('tarj') || m.includes('crédit') || m.includes('credit')) return 'credit';
  if (m === 'mixed' || m === 'mixto') return 'mixed';
  return null;
}

function formatMethodLabel(method?: string): string {
  const norm = normalizeMonetaryPaymentMethod(method);
  if (norm === 'transfer') return 'Transferencia';
  if (norm === 'mercado_pago') return 'Mercado Pago';
  if (norm === 'debit' || norm === 'credit') return 'Tarjeta';
  if (norm === 'cash') return 'Efectivo';
  return 'Otro';
}

function buildSingleMovementPayload(params: {
  payments: Array<{ amount: number; paymentMethod?: FinancialPaymentMethod | string; method?: string; notes?: string }>;
  complexId: string;
  operationId?: string | null;
  ticketCode: string;
  flow: FinancialMovementFlow;
  category: FinancialMovementCategory;
  responsibleName: string;
  userId?: string | null;
  userPhone?: string;
  bookingId?: string | null;
  operatorId: string;
  notes?: string;
  idempotencyKey: string;
  clearedCurrentAccountDebt?: number;
  expenseCategoryId?: string | null;
  expenseCategoryName?: string | null;
  expenseConceptId?: string | null;
  expenseConceptName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: string | null;
}): {
  movId: string;
  totalAmount: number;
  paymentMethod: FinancialPaymentMethod;
  movDocData: FinancialMovementDocument;
} | null {
  const realPayments = (Array.isArray(params.payments) ? params.payments : [])
    .map(p => {
      const rawMethod = p?.paymentMethod !== undefined ? p.paymentMethod : p?.method;
      const normalized = normalizeMonetaryPaymentMethod(rawMethod);
      return {
        amount: Math.max(0, Number(p?.amount) || 0),
        paymentMethod: normalized,
        notes: p?.notes
      };
    })
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null
    );

  if (realPayments.length === 0) {
    return null;
  }

  const totalAmount = realPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const paymentMethod: FinancialPaymentMethod = realPayments.length === 1
    ? realPayments[0].paymentMethod
    : 'mixed';
  const paymentLines = realPayments.map(p => ({
    method: formatMethodLabel(p.paymentMethod),
    paymentMethod: p.paymentMethod,
    amount: Number(p.amount)
  }));

  const nowIso = new Date().toISOString();
  const movId = generateUUID();
  const cleanUserId = params.userId && String(params.userId).trim() !== '' && String(params.userId) !== '0'
    ? String(params.userId).trim()
    : null;
  const cleanName = params.responsibleName || 'NN';
  const cleanPhone = params.userPhone || '';
  const resolvedNotes = params.notes || (realPayments.length === 1 ? realPayments[0].notes : '') || '';

  const movDocData: FinancialMovementDocument = {
    id: movId,
    complexId: params.complexId,
    complejoId: params.complexId,
    operationId: params.operationId ?? null,
    ...(params.bookingId ? { bookingId: String(params.bookingId) } : {}),
    ticketCode: params.ticketCode,
    idempotencyKey: params.idempotencyKey,
    flow: params.flow,
    category: params.category,
    amount: totalAmount,
    paymentMethod,
    paymentLines,
    effectiveDate: nowIso,
    userId: cleanUserId,
    clientId: cleanUserId,
    responsibleName: cleanName,
    userName: cleanName,
    clientName: cleanName,
    userPhone: cleanPhone,
    clientPhone: cleanPhone,
    clearedCurrentAccountDebt: Number(params.clearedCurrentAccountDebt || 0),
    ...(params.expenseCategoryId !== undefined ? { expenseCategoryId: params.expenseCategoryId } : {}),
    ...(params.expenseCategoryName !== undefined ? { expenseCategoryName: params.expenseCategoryName } : {}),
    ...(params.expenseConceptId !== undefined ? { expenseConceptId: params.expenseConceptId } : {}),
    ...(params.expenseConceptName !== undefined ? { expenseConceptName: params.expenseConceptName } : {}),
    ...(params.entityId !== undefined ? { entityId: params.entityId } : {}),
    ...(params.entityName !== undefined ? { entityName: params.entityName } : {}),
    ...(params.entityType !== undefined ? { entityType: params.entityType as any } : {}),
    notes: resolvedNotes,
    operatorId: params.operatorId || 'pos_operator',
    createdAt: nowIso
  };

  return {
    movId,
    totalAmount,
    paymentMethod,
    movDocData
  };
}

export function isJogoBillingOperation(op: any): boolean {
  if (!op) return false;
  const id = String(op.id || '');
  const concept = String(op.concept || op.userName || op.clientName || '').trim();
  return Boolean(
    op.paymentTrack ||
    op.obligationId ||
    op.metadata?.obligationId ||
    id.startsWith('op_jogo_') ||
    id.startsWith('op_servicio_jogo_') ||
    ['Suscripción Jogo', 'Comisión Jogo', 'Servicio Jogo'].includes(concept)
  );
}

/**
 * Calculates duration in minutes between two "HH:mm" strings
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return 60;
  let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (diff <= 0) diff += 24 * 60; // Crosses midnight
  return diff;
}

/**
 * Valores considerados genéricos o placeholders que deben ser ignorados para buscar el nombre real.
 */
const PLACEHOLDER_NAMES = new Set([
  'nn',
  'n/n',
  'cliente',
  'cliente mostrador',
  'cliente registrado',
  'cliente no identificado',
  'no identificado',
  'sin identificar',
  'anónimo',
  'anonimo',
  'sin nombre',
  'anonymous',
  'consumidor final'
]);

export function isGenericClientPlaceholder(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const clean = name.trim().toLowerCase();
  return clean === '' || clean === 'nn' || clean === 'n/n' || PLACEHOLDER_NAMES.has(clean);
}

/**
 * Resuelve de forma unificada y determinista el nombre real del cliente para operaciones,
 * reservas, ventas POS, movimientos y tickets según el orden de prioridad estricto:
 * 1. Nombre explícito en el documento o registro vinculado (ignorando placeholders).
 * 2. Búsqueda por identificador (userId, clientId, host_id, etc.) en el padrón de usuarios (users).
 * 3. Búsqueda por teléfono en el padrón de usuarios si está disponible.
 * 4. Respaldo taxativo final: 'NN'.
 */
export function resolveClientName(
  docOrRecord?: any,
  users?: Array<{ id?: string | number; name?: string; phone?: string; [key: string]: any }> | null,
  linkedDocOrBooking?: any
): string {
  if (!docOrRecord && !linkedDocOrBooking) return 'NN';

  // 0. Si se provee la lista de usuarios del complejo, la ficha local tiene prioridad absoluta para mostrar el nombre
  if (Array.isArray(users) && users.length > 0) {
    const rawId = docOrRecord?.userId || docOrRecord?.clientId || docOrRecord?.host_id || docOrRecord?.user_id ||
                  linkedDocOrBooking?.userId || linkedDocOrBooking?.clientId || linkedDocOrBooking?.host_id;
    const rawCanon = docOrRecord?.canonicalId || docOrRecord?.canonicalUserId || linkedDocOrBooking?.canonicalId || linkedDocOrBooking?.canonicalUserId;
    const rawHist = docOrRecord?.historicalId || linkedDocOrBooking?.historicalId;
    const rawHistList = docOrRecord?.historicalIds || linkedDocOrBooking?.historicalIds;
    const rawPhone = docOrRecord?.userPhone || docOrRecord?.clientPhone || docOrRecord?.host_phone || docOrRecord?.phone ||
                     linkedDocOrBooking?.userPhone || linkedDocOrBooking?.clientPhone || linkedDocOrBooking?.phone;
    const rawEmail = docOrRecord?.userEmail || docOrRecord?.clientEmail || docOrRecord?.email ||
                     linkedDocOrBooking?.userEmail || linkedDocOrBooking?.clientEmail || linkedDocOrBooking?.email;

    const matchedUser = findMatchingLocalUser(users as User[], {
      id: rawId,
      canonicalId: rawCanon,
      historicalId: rawHist,
      historicalIds: rawHistList,
      phone: rawPhone,
      email: rawEmail
    });
    if (matchedUser && matchedUser.name && !isGenericClientPlaceholder(matchedUser.name)) {
      return matchedUser.name.trim();
    }
  }

  // 1. Nombre explícito en el documento principal
  const directFields = [
    docOrRecord?.clientName,
    docOrRecord?.userName,
    docOrRecord?.host_name,
    docOrRecord?.user_name,
    docOrRecord?.customerName,
    docOrRecord?.responsibleName,
    docOrRecord?.name
  ];

  for (const field of directFields) {
    if (typeof field === 'string' && !isGenericClientPlaceholder(field)) {
      return field.trim();
    }
  }

  // Nombre explícito en el documento vinculado (ej: booking u operación asociada)
  if (linkedDocOrBooking) {
    const linkedFields = [
      linkedDocOrBooking?.clientName,
      linkedDocOrBooking?.userName,
      linkedDocOrBooking?.host_name,
      linkedDocOrBooking?.user_name,
      linkedDocOrBooking?.customerName,
      linkedDocOrBooking?.responsibleName,
      linkedDocOrBooking?.name
    ];
    for (const field of linkedFields) {
      if (typeof field === 'string' && !isGenericClientPlaceholder(field)) {
        return field.trim();
      }
    }
  }

  // 2. Búsqueda por ID en el padrón de usuarios (users)
  const candidateIds = [
    docOrRecord?.userId,
    docOrRecord?.clientId,
    docOrRecord?.host_id,
    docOrRecord?.user_id,
    linkedDocOrBooking?.userId,
    linkedDocOrBooking?.clientId,
    linkedDocOrBooking?.host_id,
    linkedDocOrBooking?.user_id
  ];

  if (Array.isArray(users) && users.length > 0) {
    for (const rawId of candidateIds) {
      if (rawId !== undefined && rawId !== null) {
        const idStr = String(rawId).trim();
        if (idStr !== '' && idStr !== '0' && idStr !== 'anon' && idStr !== 'null' && idStr !== 'undefined') {
          const found = users.find(u => String(u.id).trim() === idStr || String((u as any).userId).trim() === idStr);
          if (found && typeof found.name === 'string' && !isGenericClientPlaceholder(found.name)) {
            return found.name.trim();
          }
        }
      }
    }

    // 3. Búsqueda secundaria por teléfono en padrón de usuarios
    const candidatePhones = [
      docOrRecord?.userPhone,
      docOrRecord?.clientPhone,
      docOrRecord?.host_phone,
      docOrRecord?.phone,
      linkedDocOrBooking?.userPhone,
      linkedDocOrBooking?.clientPhone,
      linkedDocOrBooking?.host_phone,
      linkedDocOrBooking?.phone
    ];
    for (const rawPhone of candidatePhones) {
      if (rawPhone && typeof rawPhone === 'string') {
        const cleanPhone = rawPhone.replace(/\D/g, '');
        if (cleanPhone.length >= 6) {
          const found = users.find(u => u.phone && String(u.phone).replace(/\D/g, '').includes(cleanPhone));
          if (found && typeof found.name === 'string' && !isGenericClientPlaceholder(found.name)) {
            return found.name.trim();
          }
        }
      }
    }
  }

  // 4. Respaldo final: 'NN'
  return 'NN';
}

/**
 * Resuelve de forma unificada el teléfono del cliente para el comprobante (ticket)
 */
export function resolveClientPhone(
  docOrRecord?: any,
  users?: Array<{ id?: string | number; name?: string; phone?: string; [key: string]: any }> | null,
  linkedDocOrBooking?: any
): string {
  if (!docOrRecord && !linkedDocOrBooking) return '';

  const directPhones = [
    docOrRecord?.userPhone,
    docOrRecord?.clientPhone,
    docOrRecord?.host_phone,
    docOrRecord?.phone,
    docOrRecord?.user_phone,
    linkedDocOrBooking?.userPhone,
    linkedDocOrBooking?.clientPhone,
    linkedDocOrBooking?.host_phone,
    linkedDocOrBooking?.phone,
    linkedDocOrBooking?.user_phone
  ];

  for (const phone of directPhones) {
    if (typeof phone === 'string' && phone.trim() !== '') {
      return phone.trim();
    }
  }

  const candidateIds = [
    docOrRecord?.userId,
    docOrRecord?.clientId,
    docOrRecord?.host_id,
    docOrRecord?.user_id,
    linkedDocOrBooking?.userId,
    linkedDocOrBooking?.clientId,
    linkedDocOrBooking?.host_id,
    linkedDocOrBooking?.user_id
  ];

  if (Array.isArray(users) && users.length > 0) {
    for (const rawId of candidateIds) {
      if (rawId !== undefined && rawId !== null) {
        const idStr = String(rawId).trim();
        if (idStr !== '' && idStr !== '0' && idStr !== 'anon' && idStr !== 'null' && idStr !== 'undefined') {
          const found = users.find(u => String(u.id).trim() === idStr || String((u as any).userId).trim() === idStr);
          if (found && typeof found.phone === 'string' && found.phone.trim() !== '') {
            return found.phone.trim();
          }
        }
      }
    }
  }

  return '';
}

/**
 * Normalizes a booking from Firestore into the Match structure required by UI
 */
export function formatBookingToMatch(b: any, users?: User[]): Match {
  const startHour = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '18:00');
  const endHour = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '19:00');
  const dateStr = b.date || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[0] : new Date().toISOString().split('T')[0]);

  const price = Number(b.price ?? b.price_total ?? 0);
  const deposit = Number(b.deposit ?? b.amount_paid ?? 0);

  let payment_status = b.paymentStatus || b.payment_status || 'pending';
  if (payment_status === 'pagado') payment_status = 'paid';
  else if (payment_status === 'seña') payment_status = 'partial';
  else if (payment_status === 'pendiente') payment_status = 'pending';
  else if (deposit >= price && price > 0) payment_status = 'paid';
  else if (deposit > 0) payment_status = 'partial';

  const resolvedName = resolveClientName(b, users);
  const resolvedPhone = resolveClientPhone(b, users);
  const resolvedEmail = (b.userEmail || b.clientEmail || b.email || '').trim();
  const rawUserId = b.userId || b.host_id || b.user_id || b.clientId || '';
  const resolvedUserId = (rawUserId && String(rawUserId) !== '0') ? String(rawUserId) : undefined;

  const resolvedSource: BookingCreatedSource = b.createdSource === 'jogo' ? 'jogo' : 'complejo';

  return {
    id: b.id,
    court_id: b.courtId || b.court_id || (b.courtName ? b.courtName : '1'),
    courtId: b.courtId || b.court_id || (b.courtName ? b.courtName : '1'),
    complexId: b.complejoId || b.complexId || 'B',
    complejoId: b.complejoId || b.complexId || 'B',
    complejoName: b.complejoName || 'Colo loco',
    date: dateStr,
    startTime: startHour,
    endTime: endHour,
    start_time: `${dateStr}T${startHour.length === 5 ? `${startHour}:00` : startHour}`,
    end_time: `${dateStr}T${endHour.length === 5 ? `${endHour}:00` : endHour}`,
    durationMinutes: Number(b.durationMinutes) || calculateDurationMinutes(startHour, endHour),
    host_id: resolvedUserId || resolvedPhone || (resolvedName !== 'NN' ? resolvedName : '0'),
    userId: resolvedUserId,
    host_name: resolvedName,
    userName: resolvedName,
    clientName: resolvedName,
    host_phone: resolvedPhone,
    userPhone: resolvedPhone,
    clientPhone: resolvedPhone,
    userEmail: resolvedEmail,
    clientEmail: resolvedEmail,
    court_name: b.courtName || b.court_name || 'Cancha',
    courtName: b.courtName || b.court_name || 'Cancha',
    price,
    price_total: price,
    deposit,
    amount_paid: deposit,
    payment_status,
    paymentStatus: payment_status,
    status: b.status === 'jugado' ? 'jugado' : (b.status === 'cancelado' ? 'cancelado' : (b.status || 'confirmado')),
    notes: b.notes || '',
    ownerId: b.ownerId || '',
    adminId: b.adminId || '',
    createdSource: resolvedSource,
    cancelledSource: b.cancelledSource || (b.status === 'cancelado' && b.createdSource === 'complejo' ? 'complejo' : b.cancelledSource),
    cancelledAt: b.cancelledAt || undefined,
    cancellationReason: b.cancellationReason || undefined,
    retainedAmount: Number(b.retainedAmount ?? 0),
    totalRefunded: Number(b.totalRefunded ?? 0),
    canonicalId: b.canonicalId || b.canonicalUserId || b.personId || b.erpUserId || undefined,
    canonicalUserId: b.canonicalUserId || b.canonicalId || b.personId || b.erpUserId || undefined,
    canonicalName: b.canonicalName || undefined,
    personId: b.personId || b.canonicalId || undefined,
    erpUserId: b.erpUserId || b.canonicalUserId || undefined,
    historicalId: b.historicalId || b.historicalUserId || undefined,
    historicalIds: Array.isArray(b.historicalIds) ? b.historicalIds : (b.historicalId ? [String(b.historicalId)] : undefined),
    is_open: false,
    mode: b.mode || 'complete',
    max_players: b.max_players || 10,
    player_count: b.player_count || 1,
    players: b.players || []
  };
}

// =========================================================================
// 2.1. Colección Canónica: complejos & Manejo de Canchas (courts array)
// =========================================================================

export const defaultComplexHours = [
  { day: 'Lunes', open: true, start: '14:00', end: '00:00' },
  { day: 'Martes', open: true, start: '14:00', end: '00:00' },
  { day: 'Miércoles', open: true, start: '14:00', end: '00:00' },
  { day: 'Jueves', open: true, start: '14:00', end: '00:00' },
  { day: 'Viernes', open: true, start: '14:00', end: '00:00' },
  { day: 'Sábado', open: true, start: '14:00', end: '00:00' },
  { day: 'Domingo', open: true, start: '14:00', end: '00:00' }
];

/**
 * Escucha las canchas del complejo activo leyendo EXCLUSIVAMENTE
 * desde el array courts del documento complejos/{activeComplejoId}
 */
export function subscribeToCourts(
  complexId: string, 
  onUpdate: (courts: Court[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return subscribeToComplejoDoc(targetId, ({ exists, data }) => {
    if (exists && data) {
      const courtsArray = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
      const mappedCourts: Court[] = courtsArray.map((c: any, idx: number) => normalizeUnifiedCourt(c, idx) as unknown as Court);
      onUpdate(mappedCourts);
    } else {
      onUpdate([]);
    }
  });
}

/**
 * Guarda o edita una Cancha actualizando el array courts en complejos/{activeComplejoId}
 */
export async function saveCourtInFirestore(
  complexId: string, 
  court: Partial<Court>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  const courtId = court.id ? String(court.id) : `c_${Date.now()}`;

  const cSnap = await getDoc(compRef);
  let existingCourts: any[] = [];
  if (cSnap.exists()) {
    const data = cSnap.data();
    if (Array.isArray(data.courts)) {
      existingCourts = [...data.courts];
    } else if (Array.isArray(data.canchas)) {
      existingCourts = [...data.canchas];
    }
  }

  const normalizedBlockedCourts = Array.isArray((court as any).blockedCourts)
    ? (court as any).blockedCourts.map(String)
    : [];

  const cleanedPricesByDuration = sanitizePricesByDuration((court as any).pricesByDuration);
  const resolvedHourPrice = cleanedPricesByDuration
    ? cleanedPricesByDuration[60] ??
      getCourtPriceForDuration(
        {
          defaultDurationMinutes: Number((court as any).defaultDurationMinutes) || 60,
          pricesByDuration: cleanedPricesByDuration,
        },
        60
      )
    : getCourtPriceForDuration(court, 60);

  const courtItem: Record<string, any> = {
    id: courtId,
    name: (court.name || 'Cancha').trim(),
    sport: court.sport || court.type || 'fútbol 5',
    type: court.sport || court.type || 'fútbol 5',
    surface: court.surface || 'sintético',
    price: Number(resolvedHourPrice || 0),
    price_per_hour: Number(resolvedHourPrice || 0),
    status: court.status === 'inactiva' ? 'inactiva' : 'activa',
    is_roofed: Boolean(court.is_roofed ?? (court as any).isCovered),
    isCovered: Boolean(court.is_roofed ?? (court as any).isCovered),
    blockedCourts: normalizedBlockedCourts,
    defaultDurationMinutes: Number((court as any).defaultDurationMinutes) || 60,
    ...(cleanedPricesByDuration ? { pricesByDuration: cleanedPricesByDuration } : {}),
  };

  const idx = existingCourts.findIndex(c => String(c.id) === String(courtId));
  if (idx >= 0) {
    const mergedCourt = { ...existingCourts[idx], ...courtItem };
    if (!cleanedPricesByDuration) {
      delete mergedCourt.pricesByDuration;
    }
    existingCourts[idx] = mergedCourt;
  } else {
    existingCourts.push(courtItem);
  }

  // Guardado bidireccional y simétrico de canchas superpuestas (bloqueo mutuo)
  existingCourts = existingCourts.map(otherCourt => {
    const otherId = String(otherCourt.id);
    if (otherId === String(courtId)) return otherCourt;

    let otherBlocked: string[] = Array.isArray(otherCourt.blockedCourts)
      ? otherCourt.blockedCourts.map(String)
      : [];

    if (normalizedBlockedCourts.includes(otherId)) {
      if (!otherBlocked.includes(String(courtId))) {
        otherBlocked = [...otherBlocked, String(courtId)];
      }
    } else {
      otherBlocked = otherBlocked.filter(id => id !== String(courtId));
    }

    return {
      ...otherCourt,
      blockedCourts: otherBlocked
    };
  });

  await setDoc(compRef, { 
    courts: existingCourts, 
    updatedAt: new Date().toISOString() 
  }, { merge: true });

  console.log('[Firestore] Cancha guardada en complejos/' + targetId + ' courts array:', courtId);
  return courtId;
}

/**
 * Elimina una Cancha del array courts en complejos/{activeComplejoId}
 */
export async function deleteCourtInFirestore(courtId: string | number, complexId?: string): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const strId = String(courtId);
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);

  const cSnap = await getDoc(compRef);
  if (cSnap.exists()) {
    const data = cSnap.data();
    let existingCourts = Array.isArray(data.courts) ? [...data.courts] : (Array.isArray(data.canchas) ? [...data.canchas] : []);
    existingCourts = existingCourts
      .filter(c => String(c.id) !== strId)
      .map(c => ({
        ...c,
        blockedCourts: Array.isArray(c.blockedCourts) ? c.blockedCourts.filter((bId: any) => String(bId) !== strId) : []
      }));
    await setDoc(compRef, { 
      courts: existingCourts, 
      updatedAt: new Date().toISOString() 
    }, { merge: true });
    console.log('[Firestore] Cancha removida de complejos/' + targetId + ' courts array:', strId);
  }
}

/**
 * Escucha el perfil de la sede deportiva en complejos/{activeComplejoId}
 */
export function subscribeToVenueProfile(
  complexId: string,
  onUpdate: (profile: any) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return subscribeToComplejoDoc(targetId, ({ exists, id, data }) => {
    if (exists && data) {
      const { hours, weeklySchedule, openTime, closeTime, crossesMidnight } = resolveUnifiedSchedule(data);
      const profile = {
        id,
        name: data.name || data.company || '',
        company: data.company || data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        instagram: data.instagram || '',
        description: data.description || data.notes || '',
        alias: data.alias || '',
        ownerName: data.ownerName || '',
        ownerPhone: data.ownerPhone || '',
        ownerEmail: data.ownerEmail || '',
        managerName: data.managerName || '',
        managerPhone: data.managerPhone || '',
        managerEmail: data.managerEmail || '',
        contactChannel: data.contactChannel || 'WhatsApp',
        hours,
        weeklySchedule,
        openTime,
        closeTime,
        crossesMidnight,
        services: data.services || {},
        photos: Array.isArray(data.photos) ? data.photos : [],
        courts: Array.isArray(data.courts) ? data.courts.map(normalizeUnifiedCourt) : []
      };
      onUpdate(profile);
    }
  });
}

/**
 * Guarda los datos del Complejo en complejos/{activeComplejoId}
 */
export async function saveVenueProfileInFirestore(
  complexId: string,
  profile: any
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  const rawHours = Array.isArray(profile.hours) ? profile.hours : defaultComplexHours;
  const weeklySchedule = hoursToWeeklySchedule(rawHours);
  const openDays = rawHours.filter((h: any) => h.open !== false);
  const openTime = openDays[0]?.start || '14:00';
  const closeTime = openDays[0]?.end || '00:00';
  const crossesMidnight = openDays.some((h: any) => doesCrossMidnight(h.start, h.end));

  await setDoc(compRef, {
    name: profile.name || '',
    company: profile.name || profile.company || '',
    phone: profile.phone || '',
    email: profile.email || '',
    address: profile.address || '',
    instagram: profile.instagram || '',
    description: profile.description || '',
    alias: profile.alias || '',
    ownerName: profile.ownerName || '',
    ownerPhone: profile.ownerPhone || '',
    ownerEmail: profile.ownerEmail || '',
    managerName: profile.managerName || '',
    managerPhone: profile.managerPhone || '',
    managerEmail: profile.managerEmail || '',
    hours: rawHours,
    weeklySchedule,
    openTime,
    closeTime,
    crossesMidnight,
    services: profile.services || {},
    photos: Array.isArray(profile.photos) ? profile.photos : [],
    hoursUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

// =========================================================================
// 2.2. Colección Canónica: bookings (Reservas con complejoId estricto)
// =========================================================================

/**
 * Escucha reservas filtrando por complejoId / complexId == targetId y opcionalmente por date == selectedDate,
 * fusionando ambas consultas para garantizar sincronización 100% en tiempo real en Vercel y entornos locales.
 */
const sharedSubscribeBookings = createSharedSubscription<Match[]>((compositeKey, emit) => {
  const sepIdx = compositeKey.indexOf('::');
  const targetId = sepIdx >= 0 ? compositeKey.slice(0, sepIdx) : compositeKey;
  const rawDate = sepIdx >= 0 ? compositeKey.slice(sepIdx + 2) : '*';
  const selectedDate = rawDate && rawDate !== '*' ? rawDate : undefined;
  const targetIds = (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];

  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    const maps = targetIds.flatMap(() => [new Map<string, Match>(), new Map<string, Match>()]);
    const unsubs: Array<() => void> = [];

    const emitMerged = () => {
      const merged = new Map<string, Match>();
      maps.forEach(m => {
        m.forEach((val, key) => merged.set(key, val));
      });
      let list = Array.from(merged.values());
      if (selectedDate) {
        list = list.filter(b => b.date === selectedDate || (b.startTime && String(b.startTime).startsWith(selectedDate)));
      }
      emit(list);
    };

    let mapIdx = 0;
    targetIds.forEach(tId => {
      const idx1 = mapIdx++;
      const constraints1: any[] = [where('complexId', '==', tId)];
      if (selectedDate) {
        constraints1.push(where('date', '==', selectedDate));
      }
      const q1 = query(colRef, ...constraints1);
      unsubs.push(
        onSnapshot(q1, (snap) => {
          maps[idx1].clear();
          snap.forEach(d => {
            maps[idx1].set(d.id, formatBookingToMatch({ id: d.id, ...d.data() }));
          });
          emitMerged();
        }, (err) => {
          console.warn(`[Firestore] Error escuchando bookings (q1 complexId: ${tId}):`, err);
        })
      );

      const idx2 = mapIdx++;
      const constraints2: any[] = [where('complejoId', '==', tId)];
      if (selectedDate) {
        constraints2.push(where('date', '==', selectedDate));
      }
      const q2 = query(colRef, ...constraints2);
      unsubs.push(
        onSnapshot(q2, (snap) => {
          maps[idx2].clear();
          snap.forEach(d => {
            maps[idx2].set(d.id, formatBookingToMatch({ id: d.id, ...d.data() }));
          });
          emitMerged();
        }, (err) => {
          console.warn(`[Firestore] Error escuchando bookings (q2 complejoId: ${tId}):`, err);
        })
      );
    });

    return () => {
      unsubs.forEach(u => u());
    };
  } catch (err) {
    console.error('[Firestore] Error subscribiendo a bookings:', err);
    emit([]);
    return () => {};
  }
});

export function subscribeToBookings(
  complexId: string, 
  onUpdate: (bookings: Match[]) => void,
  selectedDate?: string
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeBookings(`${targetId}::${selectedDate || '*'}`, onUpdate);
}

/**
 * Sincroniza las métricas y estado del usuario en Firestore a partir de sus reservas reales
 */
export async function syncUserMetricsWithBookings(
  userId: string | number,
  userPhone?: string,
  complexId?: string,
  preloadedUserData?: any
): Promise<void> {
  const uId = String(userId || '');
  if ((!uId || uId === '0') && !userPhone) return;

  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    let bookings: any[] = [];
    const normalizedComplexKey = complexId ? (complexId === 'complejo_central' ? 'B' : complexId) : undefined;

    // Buscar doc de usuario primero en memoria (rawClientsByComplexMap) antes de ir a Firestore
    let targetDocRef = uId && uId !== '0' ? doc(db, USERS_COLLECTION, uId) : null;
    let uData: any = preloadedUserData || null;
    let resolvedUserDocId: string = uId;

    if (!uData && uId && uId !== '0' && normalizedComplexKey) {
      const cachedRaw = rawClientsByComplexMap.get(normalizedComplexKey)?.get(uId);
      if (cachedRaw) uData = cachedRaw;
    }

    if (!uData) {
      let uSnap = targetDocRef ? await getDoc(targetDocRef) : null;

      // Si no se encontró por ID pero hay userPhone, buscar en caché primero y luego en Firestore
      if ((!uSnap || !uSnap.exists()) && userPhone) {
        const cleanPhone = String(userPhone).trim();
        if (normalizedComplexKey) {
          const cachedMap = rawClientsByComplexMap.get(normalizedComplexKey);
          if (cachedMap) {
            const matchedCached = Array.from(cachedMap.values()).find(
              u => String(u.phone || '').trim() === cleanPhone
            );
            if (matchedCached?.id) {
              targetDocRef = doc(db, USERS_COLLECTION, String(matchedCached.id));
              uData = matchedCached;
              resolvedUserDocId = String(matchedCached.id);
            }
          }
        }
        if (!uData) {
          const usersCol = collection(db, USERS_COLLECTION);
          const qUser = query(usersCol, where('phone', '==', cleanPhone));
          const userSnap = await getDocs(qUser);
          if (!userSnap.empty) {
            let bestDoc = userSnap.docs[0];
            if (complexId) {
              const matched = userSnap.docs.find(d => {
                const org = d.data().originComplejoId || d.data().complejoId;
                return org && isSameComplex(org, complexId);
              });
              if (matched) bestDoc = matched;
            }
            targetDocRef = doc(db, USERS_COLLECTION, bestDoc.id);
            uSnap = bestDoc;
          }
        }
      }

      if (!uData) {
        if (!targetDocRef || !uSnap || !uSnap.exists()) return;
        uData = uSnap.data();
        resolvedUserDocId = uSnap.id;
      }
    }

    if (!targetDocRef || !uData) return;

    const effectiveComplexId = complexId || uData.originComplejoId || uData.originComplexId || uData.complejoId || uData.complexId;
    const effectiveCacheKey = effectiveComplexId ? (effectiveComplexId === 'complejo_central' ? 'B' : effectiveComplexId) : undefined;
    const cachedBookings = effectiveCacheKey ? sharedSubscribeBookings.getCached(`${effectiveCacheKey}::*`) : undefined;

    if (cachedBookings) {
      // 0 lecturas a Firestore: usar caché en tiempo real de bookings ya suscripta
      bookings = cachedBookings.filter(b => {
        const matchId = uId && uId !== '0' && String((b as any).userId || (b as any).host_id || '') === uId;
        const matchPhone = userPhone && String((b as any).userPhone || (b as any).host_phone || '').trim() === String(userPhone).trim();
        return matchId || matchPhone;
      });
    } else {
      if (uId && uId !== '0') {
        const q = effectiveCacheKey
          ? query(colRef, where('complejoId', '==', effectiveCacheKey), where('userId', '==', uId))
          : query(colRef, where('userId', '==', uId));
        const snap = await getDocs(q);
        bookings = snap.docs.map(d => d.data());
      }

      if (bookings.length === 0 && userPhone) {
        const cleanPhone = String(userPhone).trim();
        const qPhone = effectiveCacheKey
          ? query(colRef, where('complejoId', '==', effectiveCacheKey), where('userPhone', '==', cleanPhone))
          : query(colRef, where('userPhone', '==', cleanPhone));
        const snapPhone = await getDocs(qPhone);
        bookings = snapPhone.docs.map(d => d.data());
      }
    }

    // Filtrar estrictamente por complejo para aislar las métricas del jugador
    if (effectiveComplexId) {
      bookings = bookings.filter(b => {
        const bComp = b.complejoId || b.complexId;
        return !bComp || isSameComplex(bComp, effectiveComplexId);
      });
    }

    const totalBookings = bookings.length;
    const validBookings = bookings.filter(b => {
      const st = String(b.status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'cancelado';
    });

    const now = new Date();
    const totalPlayed = validBookings.filter(b => isBookingPlayed(b, now)).length;

    const dates = validBookings.map(b => b.date).filter(Boolean).sort();
    const firstDate = dates[0] || null;
    const lastDate = dates[dates.length - 1] || '';

    const existingActivationDate = uData.activationDate || null;
    const activationDate = existingActivationDate || firstDate;
    const lastGameDate = (!uData.lastGameDate || (lastDate && lastDate > uData.lastGameDate)) ? (lastDate || uData.lastGameDate || '') : uData.lastGameDate;

    await updateDoc(targetDocRef, {
      totalBookings,
      totalMatchesPlayed: totalPlayed,
      matches_played: totalPlayed,
      isActivated: Boolean(activationDate),
      activationDate,
      lastGameDate,
      updatedAt: new Date().toISOString()
    });
    console.log(`[Firestore] Métricas de ciclo de vida actualizadas para usuario ${resolvedUserDocId}: ${totalBookings} reservas, ${totalPlayed} jugados`);
  } catch (err) {
    console.warn('[Firestore] Error sincronizando métricas de usuario:', err);
  }
}

/**
 * Helper to convert "HH:mm" time string into minutes since 00:00 (handling 24h wraps)
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1] || '0', 10) || 0;
  return h * 60 + m;
}

/**
 * Mathematically evaluates if two half-open time intervals [startA, endA) and [startB, endB) overlap
 */
export function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  const normEndA = endA <= startA ? endA + 1440 : endA;
  const normEndB = endB <= startB ? endB + 1440 : endB;
  return Math.max(startA, startB) < Math.min(normEndA, normEndB);
}

/**
 * Identifies all courts that physically share space with targetCourtId
 * (e.g. 1 large court that can be split into 2 smaller courts)
 */
export function getOverlappingCourtIdsFromList(data: any, targetCourtId: string): string[] {
  const targetStr = String(targetCourtId);
  if (!data || typeof data !== 'object') return [targetStr];
  const courtsList = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
  const overlapping = new Set<string>([targetStr]);

  const targetCourt = courtsList.find((c: any) => String(c.id) === targetStr);
  if (targetCourt && Array.isArray(targetCourt.blockedCourts)) {
    targetCourt.blockedCourts.forEach((id: any) => overlapping.add(String(id)));
  }

  courtsList.forEach((c: any) => {
    if (Array.isArray(c.blockedCourts) && c.blockedCourts.some((id: any) => String(id) === targetStr)) {
      overlapping.add(String(c.id));
    }
  });

  return Array.from(overlapping);
}

export async function getOverlappingCourtIds(complexId: string, targetCourtId: string): Promise<string[]> {
  try {
    const cacheKey = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
    const cachedComp = subscribeToComplejoDoc.getCached(cacheKey) || subscribeToComplejoDoc.getCached(complexId);
    if (cachedComp) {
      return cachedComp.exists && cachedComp.data
        ? getOverlappingCourtIdsFromList(cachedComp.data, targetCourtId)
        : [String(targetCourtId)];
    }
    const compRef = doc(db, COMPLEJOS_COLLECTION, cacheKey);
    const snap = await getDoc(compRef);
    if (!snap.exists()) return [String(targetCourtId)];
    return getOverlappingCourtIdsFromList(snap.data(), targetCourtId);
  } catch (e) {
    console.warn('[BookingLock] Error reading overlapping courts:', e);
    return [String(targetCourtId)];
  }
}

/**
 * Creates a booking atomically with guaranteed mutual exclusion.
 * Prevents double-booking even under concurrent writes by locking
 * a deterministic schedule lock document per court and date inside runTransaction.
 */
export async function createBookingInFirestore(data: {
  complejoId: string;
  complejoName?: string;
  courtName: string;
  courtId?: string | number;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  price: number;
  deposit?: number;
  status?: string;
  paymentStatus?: string;
  userId?: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  notes?: string;
  ownerId?: string;
  adminId?: string;
  [key: string]: any;
}): Promise<string> {
  const targetComplexId = (!data.complejoId || data.complejoId === 'complejo_central') ? 'B' : data.complejoId;
  const resolvedCourtId = String(data.courtId || data.court_id || '').trim();
  if (!resolvedCourtId) {
    throw new Error('Identificador de cancha (courtId) inválido o ausente.');
  }
  const resolvedCourtName = data.courtName || data.court_name || 'Cancha 1';
  const startTime = data.startTime || '18:00';
  const endTime = data.endTime || '19:00';
  const durationMinutes = Number(data.durationMinutes) || calculateDurationMinutes(startTime, endTime);
  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);
  const price = Math.max(0, Number(data.price) || 0);
  const deposit = Math.max(0, Number(data.deposit) || 0);
  if (price > 0 && deposit > price + 0.01) {
    throw new Error(`La seña o pago inicial ($${deposit.toLocaleString()}) no puede superar el precio de la reserva ($${price.toLocaleString()}).`);
  }

  const paymentStatus = data.paymentStatus
    ? (data.paymentStatus === 'paid' ? 'pagado' : (data.paymentStatus === 'partial' ? 'seña' : data.paymentStatus))
    : (deposit >= price && price > 0 ? 'pagado' : (deposit > 0 ? 'seña' : 'pendiente'));

  const status = data.status === 'confirmed' ? 'confirmado' : (data.status === 'cancelled' ? 'cancelado' : (data.status || 'confirmado'));
  const rawUserIdInput = String(data.userId || data.host_id || '0').trim();
  let resolvedUserId = rawUserIdInput;
  let resolvedUserName = resolveClientName(data);

  if (!resolvedUserId || resolvedUserId === '0' || resolvedUserId.startsWith('derived_')) {
    const cachedMatch = findHiddenOrExistingClientInCache(targetComplexId, {
      id: rawUserIdInput,
      phone: data.userPhone || data.clientPhone,
      canonicalId: data.canonicalId || (data as any).canonicalUserId
    });
    if (cachedMatch?.id && !String(cachedMatch.id).startsWith('derived_')) {
      resolvedUserId = String(cachedMatch.id);
      if (resolvedUserName === 'NN' && cachedMatch.name && !isGenericClientPlaceholder(cachedMatch.name)) {
        resolvedUserName = cachedMatch.name.trim();
      }
    }
  }

  const effectiveReactivateUserId = (resolvedUserId && resolvedUserId !== '0' && !resolvedUserId.startsWith('derived_'))
    ? resolvedUserId
    : null;

  if (resolvedUserName === 'NN' && effectiveReactivateUserId) {
    try {
      const uSnap = await getDoc(doc(db, USERS_COLLECTION, effectiveReactivateUserId));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (uData.name && !isGenericClientPlaceholder(uData.name)) {
          resolvedUserName = uData.name.trim();
        }
      }
    } catch (e) {
      console.warn('[Booking] Notice reading user profile:', e);
    }
  }

  const affectedCourts = await getOverlappingCourtIds(targetComplexId, resolvedCourtId);

  let initialBookingsSeed: Record<string, any> = {};
  try {
    const qExisting = query(
      collection(db, BOOKINGS_COLLECTION),
      where('complejoId', '==', targetComplexId),
      where('date', '==', data.date)
    );
    const snapExisting = await getDocs(qExisting);
    snapExisting.docs.forEach(docSnap => {
      const b = docSnap.data();
      const st = String(b.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelled') return;
      const bCourtId = String(b.courtId || b.court_id || '');
      if (affectedCourts.includes(bCourtId)) {
        const bStart = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '18:00');
        const bEnd = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '19:00');
        initialBookingsSeed[docSnap.id] = {
          bookingId: docSnap.id,
          courtId: bCourtId,
          courtName: b.courtName || b.court_name || 'Cancha',
          startTime: bStart,
          endTime: bEnd,
          startMin: timeStringToMinutes(bStart),
          endMin: timeStringToMinutes(bEnd),
          userName: b.userName || b.clientName || 'NN',
          status: b.status || 'confirmado'
        };
      }
    });
  } catch (seedErr) {
    console.warn('[BookingLock] Notice pre-reading existing bookings:', seedErr);
  }

  const newBookingRef = doc(collection(db, BOOKINGS_COLLECTION));
  const newBookingId = newBookingRef.id;

  const rawCanonId = data.canonicalId || (data as any).canonicalUserId || (data as any).personId || (data as any).erpUserId;
  const validCanonId = typeof rawCanonId === 'string' && rawCanonId.trim() ? rawCanonId.trim() : (typeof rawCanonId === 'number' ? String(rawCanonId) : null);

  const rawCanonName = (data as any).canonicalName;
  const validCanonName = typeof rawCanonName === 'string' && rawCanonName.trim() ? rawCanonName.trim() : null;

  const rawHistId = (data as any).historicalId;
  const validHistId = typeof rawHistId === 'string' && rawHistId.trim() ? rawHistId.trim() : (typeof rawHistId === 'number' ? String(rawHistId) : null);

  const rawHistIds = (data as any).historicalIds;
  const validHistIds = Array.isArray(rawHistIds)
    ? rawHistIds.map((h: any) => String(h || '').trim()).filter(Boolean)
    : [];

  const bookingPhone = (data.userPhone || data.clientPhone || '').trim();
  const bookingClientId = (resolvedUserId && resolvedUserId !== '0') ? resolvedUserId : null;
  const ticketCode = `B-${newBookingId.slice(0, 6).toUpperCase()}`;
  const idemKey = data.idempotencyKey ? String(data.idempotencyKey) : `booking_dep_${newBookingId}`;

  const rawPayments: Array<{ amount: number; paymentMethod?: FinancialPaymentMethod | string; method?: string; notes?: string }> =
    Array.isArray(data.payments)
      ? data.payments
      : (deposit > 0 ? [{ amount: deposit, paymentMethod: data.paymentMethod !== undefined ? data.paymentMethod : 'cash' }] : []);

  const movCategory: FinancialMovementCategory = deposit >= price && price > 0 ? 'booking_settlement' : 'booking_deposit';
  const built = (price > 0 || deposit > 0)
    ? buildSingleMovementPayload({
        payments: rawPayments,
        complexId: targetComplexId,
        operationId: `${newBookingId}-booking`,
        bookingId: newBookingId,
        ticketCode,
        flow: 'income',
        category: movCategory,
        responsibleName: resolvedUserName,
        userId: bookingClientId,
        userPhone: bookingPhone,
        operatorId: auth.currentUser?.uid || data.ownerId || 'pos_operator',
        notes: data.notes || `Cobro reserva ${resolvedCourtName} ${data.date} ${startTime}`,
        idempotencyKey: idemKey
      })
    : null;

  const actualCollected = built ? built.totalAmount : (Array.isArray(data.payments) ? 0 : deposit);
  const trackedKeys = built ? [idemKey] : [];

  const payload: Record<string, any> = {
    id: newBookingId,
    complejoId: targetComplexId,
    complexId: targetComplexId,
    complejoName: data.complejoName || 'Colo loco',
    courtId: resolvedCourtId,
    court_id: resolvedCourtId,
    courtName: resolvedCourtName,
    court_name: resolvedCourtName,
    date: data.date,
    startTime,
    endTime,
    durationMinutes,
    price,
    deposit: actualCollected,
    amount_paid: actualCollected,
    status,
    paymentStatus: actualCollected >= price && price > 0 ? 'pagado' : (actualCollected > 0 ? 'seña' : 'pendiente'),
    payment_status: actualCollected >= price && price > 0 ? 'paid' : (actualCollected > 0 ? 'partial' : 'pending'),
    userId: resolvedUserId,
    host_id: resolvedUserId,
    userName: resolvedUserName,
    clientName: resolvedUserName,
    host_name: resolvedUserName,
    userPhone: bookingPhone,
    clientPhone: bookingPhone,
    userEmail: (data.userEmail || data.clientEmail || '').trim(),
    clientEmail: (data.userEmail || data.clientEmail || '').trim(),
    notes: data.notes || '',
    createdSource: data.createdSource === 'jogo' ? 'jogo' : 'complejo',
    retainedAmount: Number(data.retainedAmount ?? 0),
    totalRefunded: Number(data.totalRefunded ?? 0),
    ...(trackedKeys.length > 0 ? { idempotencyKey: idemKey, idempotencyKeys: trackedKeys } : {}),
    ...(validCanonId ? { canonicalId: validCanonId, canonicalUserId: validCanonId } : {}),
    ...(validCanonName ? { canonicalName: validCanonName } : {}),
    ...(validHistId ? { historicalId: validHistId } : {}),
    ...(validHistIds.length > 0 ? { historicalIds: validHistIds } : {}),
    ownerId: auth.currentUser?.uid || data.ownerId || '',
    adminId: data.adminId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await runTransaction(db, async (transaction) => {
    const lockRefs = affectedCourts.map(cid =>
      doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${data.date}`)
    );
    const userRef = effectiveReactivateUserId ? doc(db, USERS_COLLECTION, effectiveReactivateUserId) : null;

    const [lockSnaps, userSnap] = await Promise.all([
      Promise.all(lockRefs.map(ref => transaction.get(ref))),
      userRef ? transaction.get(userRef) : Promise.resolve(null)
    ]);

    const activeMap: Record<string, any> = { ...initialBookingsSeed };

    lockSnaps.forEach(snap => {
      if (snap.exists()) {
        const lockData = snap.data();
        if (lockData.bookings && typeof lockData.bookings === 'object') {
          Object.entries(lockData.bookings).forEach(([bId, bData]: [string, any]) => {
            const st = String(bData.status || '').toLowerCase();
            if (st !== 'cancelado' && st !== 'cancelled') {
              activeMap[bId] = bData;
            } else {
              delete activeMap[bId];
            }
          });
        }
      }
    });

    for (const [existingId, existing] of Object.entries(activeMap)) {
      if (existingId === newBookingId) continue;
      const exStartMin = existing.startMin ?? timeStringToMinutes(existing.startTime);
      const exEndMin = existing.endMin ?? timeStringToMinutes(existing.endTime);

      if (intervalsOverlap(startMin, endMin, exStartMin, exEndMin)) {
        const cName = existing.courtName || resolvedCourtName;
        throw new Error(
          `Conflicto de turno: La cancha "${cName}" ya se encuentra reservada para la fecha ${data.date} entre las ${existing.startTime} y ${existing.endTime} hs (${existing.userName || 'Cliente'}).`
        );
      }
    }

    const newLockEntry = {
      bookingId: newBookingId,
      courtId: resolvedCourtId,
      courtName: resolvedCourtName,
      startTime,
      endTime,
      startMin,
      endMin,
      userName: resolvedUserName,
      status: 'confirmado'
    };

    for (let i = 0; i < affectedCourts.length; i++) {
      const cid = affectedCourts[i];
      const snap = lockSnaps[i];
      const existingBookings = snap.exists() ? (snap.data().bookings || {}) : {};

      transaction.set(lockRefs[i], {
        complexId: targetComplexId,
        complejoId: targetComplexId,
        courtId: cid,
        date: data.date,
        bookings: {
          ...existingBookings,
          [newBookingId]: newLockEntry
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    transaction.set(newBookingRef, cleanFirestoreDocument(payload));

    if (price > 0 || actualCollected > 0) {
      const opRef = doc(db, OPERATIONS_COLLECTION, `${newBookingId}-booking`);
      const amountPending = Math.max(0, price - actualCollected);
      const initialPaymentStatus: OperationPaymentStatus =
        actualCollected >= price && price > 0 ? 'paid' : (actualCollected > 0 ? 'partial' : 'unpaid');

      transaction.set(opRef, {
        id: `${newBookingId}-booking`,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        ticketCode,
        operationType: 'court_booking',
        bookingId: newBookingId,
        responsibleType: bookingClientId ? 'user' : 'anonymous',
        userId: bookingClientId,
        clientId: bookingClientId,
        userName: resolvedUserName,
        clientName: resolvedUserName,
        userPhone: bookingPhone,
        clientPhone: bookingPhone,
        contractualAmount: price,
        totalCollected: actualCollected,
        totalRefunded: 0,
        netCollected: actualCollected,
        retainedAmount: 0,
        amountPending,
        paymentStatus: initialPaymentStatus,
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        ...(trackedKeys.length > 0 ? { idempotencyKey: idemKey, idempotencyKeys: trackedKeys } : {}),
        notes: payload.notes || `Reserva ${resolvedCourtName} ${data.date} ${startTime}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || payload.ownerId || 'pos_operator'
      });

      if (built) {
        const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, built.movId);
        transaction.set(movRef, built.movDocData);

        const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);
        transaction.set(idemRef, {
          idempotencyKey: idemKey,
          complexId: targetComplexId,
          complejoId: targetComplexId,
          operationId: `${newBookingId}-booking`,
          bookingId: newBookingId,
          amount: built.totalAmount,
          paymentMethod: built.paymentMethod,
          flow: 'income',
          status: 'completed',
          movementId: built.movId,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    }

    // Reactivar usuario si estaba oculto o sin asociar en este complejo (sin alterar su origen ni otros complejos)
    if (userRef && userSnap && userSnap.exists()) {
      const reactivatePatch = buildUserReactivationPatch(userSnap.data(), targetComplexId);
      if (reactivatePatch) {
        transaction.update(userRef, reactivatePatch);
      }
    }
  });

  console.log('[Firestore] Reserva creada atómicamente sin colisiones en bookings/', newBookingId);
  
  if (payload.userId && payload.userId !== '0') {
    syncUserMetricsWithBookings(payload.userId, payload.userPhone);
  } else if (payload.userPhone) {
    syncUserMetricsWithBookings('', payload.userPhone);
  }

  return newBookingId;
}

/**
 * Actualiza una reserva en la colección canónica 'bookings'.
 * Si se modifica fecha, cancha, horario o estado, actualiza atómicamente
 * el candado de horarios para liberar o reasignar bloques sin colisiones.
 */
export async function updateBookingInFirestore(
  bookingId: string | number, 
  patch: Record<string, any>
): Promise<void> {
  const strBookingId = String(bookingId);
  const docRef = doc(db, BOOKINGS_COLLECTION, strBookingId);
  const opRef = doc(db, OPERATIONS_COLLECTION, `${strBookingId}-booking`);

  const isScheduleChange = Boolean(
    patch.date !== undefined ||
    patch.courtId !== undefined ||
    patch.court_id !== undefined ||
    patch.startTime !== undefined ||
    patch.endTime !== undefined ||
    patch.status !== undefined
  );

  const editIdemKey = patch.idempotencyKey ? String(patch.idempotencyKey).trim() : null;
  const idemRef = editIdemKey ? doc(db, IDEMPOTENCY_COLLECTION, editIdemKey) : null;

  await runTransaction(db, async (transaction) => {
    // --- FASE 1: TODAS LAS LECTURAS ANTES DE CUALQUIER ESCRITURA ---
    const bSnap = await transaction.get(docRef);
    if (!bSnap.exists()) {
      throw new Error('Reserva no encontrada');
    }

    const curr = bSnap.data();
    const targetComplexId = (!curr.complejoId && !curr.complexId)
      ? (patch.complejoId || patch.complexId || 'B')
      : ((curr.complejoId === 'complejo_central' ? 'B' : curr.complejoId) || (curr.complexId === 'complejo_central' ? 'B' : curr.complexId));

    const opSnap = await transaction.get(opRef);
    const opData = opSnap.exists() ? opSnap.data() : null;
    const idemSnap = idemRef ? await transaction.get(idemRef) : null;
    const compSnap = isScheduleChange
      ? await transaction.get(doc(db, COMPLEJOS_COLLECTION, targetComplexId))
      : null;

    let effectiveUserId = String(patch.userId || curr.userId || opData?.userId || '').trim();
    if (!effectiveUserId || effectiveUserId === '0' || effectiveUserId.startsWith('derived_')) {
      const cachedMatch = findHiddenOrExistingClientInCache(targetComplexId, {
        id: effectiveUserId,
        phone: patch.userPhone || patch.clientPhone || curr.userPhone || curr.clientPhone,
        canonicalId: patch.canonicalId || curr.canonicalId
      });
      if (cachedMatch?.id && !String(cachedMatch.id).startsWith('derived_')) {
        effectiveUserId = String(cachedMatch.id);
      }
    }
    const userRef = (effectiveUserId && effectiveUserId !== '0' && !effectiveUserId.startsWith('derived_'))
      ? doc(db, USERS_COLLECTION, effectiveUserId)
      : null;
    const userSnap = userRef ? await transaction.get(userRef) : null;

    const oldCourtId = String(curr.courtId || curr.court_id || 'c_1');
    const oldDate = curr.date;
    const newCourtId = String(patch.courtId || patch.court_id || oldCourtId);
    const newDate = patch.date || oldDate;
    const newStart = patch.startTime || curr.startTime || '18:00';
    const newEnd = patch.endTime || curr.endTime || '19:00';
    const newStatus = patch.status !== undefined ? patch.status : curr.status;
    const isCancelled = newStatus === 'cancelado' || newStatus === 'cancelled' ||
      patch.paymentStatus === 'cancelled' || patch.payment_status === 'cancelled';

    let oldAffectedCourts: string[] = [];
    let newAffectedCourts: string[] = [];
    let oldLockRefs: ReturnType<typeof doc>[] = [];
    let oldLockSnaps: any[] = [];
    let newLockRefs: ReturnType<typeof doc>[] = [];
    let newLockSnaps: any[] = [];

    if (isScheduleChange) {
      const compData = compSnap && compSnap.exists() ? compSnap.data() : null;
      oldAffectedCourts = getOverlappingCourtIdsFromList(compData, oldCourtId);
      newAffectedCourts = getOverlappingCourtIdsFromList(compData, newCourtId);

      oldLockRefs = oldAffectedCourts.map(cid =>
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${oldDate}`)
      );
      oldLockSnaps = await Promise.all(oldLockRefs.map(ref => transaction.get(ref)));

      if (!isCancelled) {
        newLockRefs = newAffectedCourts.map(cid =>
          doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${newDate}`)
        );
        newLockSnaps = await Promise.all(newLockRefs.map(ref => transaction.get(ref)));
      }
    }

    // --- FASE 2: VALIDACIONES Y CÁLCULOS ---
    if (isCancelled && curr.createdSource === 'jogo') {
      throw new Error('Las reservas generadas por Jogo no pueden cancelarse ni eliminarse desde el complejo.');
    }

    if (isScheduleChange && !isCancelled) {
      const startMin = timeStringToMinutes(newStart);
      const endMin = timeStringToMinutes(newEnd);
      newLockSnaps.forEach(snap => {
        if (snap.exists()) {
          const bMap = snap.data().bookings || {};
          Object.entries(bMap).forEach(([bId, bData]: [string, any]) => {
            if (bId === strBookingId) return;
            const st = String(bData.status || '').toLowerCase();
            if (st === 'cancelado' || st === 'cancelled') return;
            const exStartMin = bData.startMin ?? timeStringToMinutes(bData.startTime);
            const exEndMin = bData.endMin ?? timeStringToMinutes(bData.endTime);
            if (intervalsOverlap(startMin, endMin, exStartMin, exEndMin)) {
              throw new Error(
                `Conflicto de turno: El nuevo horario ${newStart} - ${newEnd} hs para la fecha ${newDate} ya está ocupado (${bData.userName || 'Cliente'}).`
              );
            }
          });
        }
      });
    }

    // Saneamiento de campos transitorios antes de persistir en /bookings
    const sanitizedPatch: Record<string, any> = { ...patch };
    delete sanitizedPatch.payments;
    delete sanitizedPatch.deltaPaid;
    delete sanitizedPatch.deltaPayments;
    delete sanitizedPatch.previousDeposit;
    delete sanitizedPatch.idempotencyKey;
    delete sanitizedPatch.paymentMethod;

    if (curr.createdSource === 'jogo') {
      sanitizedPatch.createdSource = 'jogo';
    } else if (sanitizedPatch.createdSource !== undefined && sanitizedPatch.createdSource !== 'jogo') {
      sanitizedPatch.createdSource = 'complejo';
    }

    const currPrice = Math.max(0, Number(curr.price ?? curr.price_total ?? opData?.contractualAmount ?? 0));
    const currPaid = Math.max(0, Number(opData?.totalCollected ?? curr.deposit ?? curr.amount_paid ?? 0));
    const nextPrice = patch.price !== undefined
      ? Math.max(0, Number(patch.price) || 0)
      : (patch.price_total !== undefined ? Math.max(0, Number(patch.price_total) || 0) : currPrice);

    const hasExplicitDelta = patch.deltaPaid !== undefined || patch.deltaPayments !== undefined;
    const isIdemCompleted = Boolean(idemSnap && idemSnap.exists() && idemSnap.data()?.status === 'completed');

    const deltaPaymentsList: Array<{ amount: number; paymentMethod?: FinancialPaymentMethod | string; method?: string; notes?: string }> =
      Array.isArray(patch.deltaPayments) && patch.deltaPayments.length > 0
        ? patch.deltaPayments
        : (Number(patch.deltaPaid || 0) > 0
            ? [{ amount: Number(patch.deltaPaid), paymentMethod: normalizeMonetaryPaymentMethod(patch.paymentMethod) || 'cash' }]
            : []);

    const ticketCode = opData?.ticketCode || `B-${strBookingId.slice(0, 6).toUpperCase()}`;
    const resolvedClientName = resolveClientName({ ...curr, ...patch }, null, opData);
    const resolvedClientPhone = resolveClientPhone({ ...curr, ...patch }, null, opData);
    const bookingClientId = (effectiveUserId && effectiveUserId !== '0') ? effectiveUserId : null;

    const movementIdemKey = editIdemKey || `booking_edit_${strBookingId}_${Date.now()}`;
    const provisionalNextPaid = currPaid + deltaPaymentsList.reduce((s, p) => s + Math.max(0, Number(p.amount) || 0), 0);
    const deltaCategory: FinancialMovementCategory =
      (provisionalNextPaid >= nextPrice && nextPrice > 0) ? 'booking_settlement' : 'booking_deposit';

    const builtDeltaMov = (!isCancelled && !isIdemCompleted && deltaPaymentsList.length > 0)
      ? buildSingleMovementPayload({
          payments: deltaPaymentsList,
          complexId: targetComplexId,
          operationId: `${strBookingId}-booking`,
          bookingId: strBookingId,
          ticketCode,
          flow: 'income',
          category: deltaCategory,
          responsibleName: resolvedClientName,
          userId: bookingClientId,
          userPhone: resolvedClientPhone,
          operatorId: auth.currentUser?.uid || curr.ownerId || 'pos_operator',
          notes: patch.notes || `Cobro reserva ${patch.courtName || curr.courtName || 'Cancha'} ${newDate} ${newStart}`,
          idempotencyKey: movementIdemKey
        })
      : null;

    const deltaPaidAmount = builtDeltaMov ? builtDeltaMov.totalAmount : 0;
    const nextTotalPaid = isCancelled
      ? currPaid
      : (hasExplicitDelta
          ? Math.max(0, currPaid + deltaPaidAmount)
          : (patch.deposit !== undefined
              ? Math.max(0, Number(patch.deposit) || 0)
              : (patch.amount_paid !== undefined ? Math.max(0, Number(patch.amount_paid) || 0) : currPaid)));

    if (!isCancelled && nextPrice > 0 && nextTotalPaid > nextPrice + 0.01) {
      throw new Error(`El monto cobrado ($${nextTotalPaid.toLocaleString()}) no puede superar el precio total de la reserva ($${nextPrice.toLocaleString()}).`);
    }

    const totalRefunded = Number(opData?.totalRefunded ?? curr.totalRefunded ?? 0);
    const opBalances = calculateFinancialBalances({
      contractualAmount: nextPrice,
      totalCollected: nextTotalPaid,
      totalRefunded,
      isCancelled,
      retainDepositOnCancel: true
    });

    const bookingPayStatusEs = isCancelled
      ? 'cancelled'
      : (nextTotalPaid >= nextPrice && nextPrice > 0 ? 'pagado' : (nextTotalPaid > 0 ? 'seña' : 'pendiente'));
    const bookingPayStatusEn = isCancelled
      ? 'cancelled'
      : (nextTotalPaid >= nextPrice && nextPrice > 0 ? 'paid' : (nextTotalPaid > 0 ? 'partial' : 'pending'));

    if (hasExplicitDelta || patch.price !== undefined || patch.price_total !== undefined) {
      sanitizedPatch.deposit = nextTotalPaid;
      sanitizedPatch.amount_paid = nextTotalPaid;
      sanitizedPatch.hostAmountPaid = nextTotalPaid;
      sanitizedPatch.host_amount_paid = nextTotalPaid;
      sanitizedPatch.amountPending = opBalances.amountPending;
      sanitizedPatch.paymentStatus = bookingPayStatusEs;
      sanitizedPatch.payment_status = bookingPayStatusEn;
    }

    if (builtDeltaMov && deltaPaidAmount > 0) {
      sanitizedPatch.idempotencyKeys = arrayUnion(movementIdemKey);
    }

    let clearedDebt = 0;
    let remainingOpDebt = Number(opData?.currentAccountDebtAmount || 0);
    if (deltaPaidAmount > 0 && remainingOpDebt > 0) {
      const clearing = calculateCurrentAccountClearing(remainingOpDebt, deltaPaidAmount);
      clearedDebt = clearing.clearedDebtAmount;
      remainingOpDebt = clearing.remainingOperationDebt;
    }

    // --- FASE 3: TODAS LAS ESCRITURAS ATÓMICAS ---
    if (isScheduleChange) {
      if (isCancelled) {
        for (let i = 0; i < oldAffectedCourts.length; i++) {
          const snap = oldLockSnaps[i];
          if (snap.exists()) {
            const bMap = { ...(snap.data().bookings || {}) };
            delete bMap[strBookingId];
            transaction.set(oldLockRefs[i], {
              bookings: bMap,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
      } else {
        if (oldCourtId !== newCourtId || oldDate !== newDate) {
          for (let i = 0; i < oldAffectedCourts.length; i++) {
            const snap = oldLockSnaps[i];
            if (snap.exists()) {
              const bMap = { ...(snap.data().bookings || {}) };
              delete bMap[strBookingId];
              transaction.set(oldLockRefs[i], {
                bookings: bMap,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }

        const startMin = timeStringToMinutes(newStart);
        const endMin = timeStringToMinutes(newEnd);
        const newLockEntry = {
          bookingId: strBookingId,
          courtId: newCourtId,
          courtName: patch.courtName || curr.courtName || 'Cancha',
          startTime: newStart,
          endTime: newEnd,
          startMin,
          endMin,
          userName: resolvedClientName,
          status: newStatus || 'confirmado'
        };

        for (let i = 0; i < newAffectedCourts.length; i++) {
          const snap = newLockSnaps[i];
          const existingBookings = snap.exists() ? (snap.data().bookings || {}) : {};
          transaction.set(newLockRefs[i], {
            complexId: targetComplexId,
            complejoId: targetComplexId,
            courtId: newAffectedCourts[i],
            date: newDate,
            bookings: {
              ...existingBookings,
              [strBookingId]: newLockEntry
            },
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }
    }

    if (isCancelled) {
      transaction.update(docRef, cleanFirestoreDocument({
        ...sanitizedPatch,
        status: 'cancelado',
        cancelledSource: 'complejo',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
    } else {
      transaction.update(docRef, cleanFirestoreDocument({
        ...sanitizedPatch,
        updatedAt: new Date().toISOString()
      }));
    }

    if (opSnap.exists()) {
      const opPatch: Record<string, any> = {
        updatedAt: serverTimestamp()
      };
      if (isCancelled) {
        opPatch.paymentStatus = 'cancelled';
        opPatch.status = 'cancelado';
        opPatch.amountPending = 0;
      } else {
        if (patch.status) {
          opPatch.status = patch.status;
        }
        if (hasExplicitDelta || patch.price !== undefined || patch.price_total !== undefined) {
          opPatch.contractualAmount = nextPrice;
          opPatch.totalCollected = nextTotalPaid;
          opPatch.netCollected = opBalances.netCollected;
          opPatch.amountPending = opBalances.amountPending;
          opPatch.paymentStatus = opBalances.paymentStatus;
          if (deltaPaidAmount > 0 && opData?.currentAccountDebtAmount > 0) {
            opPatch.currentAccountDebtAmount = remainingOpDebt;
          }
        } else if (patch.payment_status || patch.paymentStatus) {
          const ps = patch.payment_status || patch.paymentStatus;
          opPatch.paymentStatus = ps === 'pagado' ? 'paid' : (ps === 'seña' ? 'partial' : (ps === 'pendiente' ? 'unpaid' : ps));
        }
      }
      if (patch.userName || patch.clientName) {
        opPatch.userName = patch.userName || patch.clientName;
        opPatch.clientName = patch.userName || patch.clientName;
      }
      if (patch.userPhone || patch.clientPhone) {
        opPatch.userPhone = patch.userPhone || patch.clientPhone;
        opPatch.clientPhone = patch.userPhone || patch.clientPhone;
      }
      if (builtDeltaMov && deltaPaidAmount > 0) {
        opPatch.idempotencyKeys = arrayUnion(movementIdemKey);
      }
      transaction.update(opRef, cleanFirestoreDocument(opPatch));
    } else if (!isCancelled && (nextPrice > 0 || nextTotalPaid > 0)) {
      transaction.set(opRef, {
        id: `${strBookingId}-booking`,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        ticketCode,
        operationType: 'court_booking',
        bookingId: strBookingId,
        responsibleType: bookingClientId ? 'user' : 'anonymous',
        userId: bookingClientId,
        clientId: bookingClientId,
        userName: resolvedClientName,
        clientName: resolvedClientName,
        userPhone: resolvedClientPhone,
        clientPhone: resolvedClientPhone,
        contractualAmount: nextPrice,
        totalCollected: nextTotalPaid,
        totalRefunded: 0,
        netCollected: opBalances.netCollected,
        retainedAmount: 0,
        amountPending: opBalances.amountPending,
        paymentStatus: opBalances.paymentStatus,
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        ...(builtDeltaMov ? { idempotencyKey: movementIdemKey, idempotencyKeys: [movementIdemKey] } : {}),
        notes: patch.notes || curr.notes || `Reserva ${patch.courtName || curr.courtName || 'Cancha'} ${newDate} ${newStart}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || curr.ownerId || 'pos_operator'
      });
    }

    if (builtDeltaMov && deltaPaidAmount > 0) {
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtDeltaMov.movId);
      transaction.set(movRef, builtDeltaMov.movDocData);

      const targetIdemRef = idemRef || doc(db, IDEMPOTENCY_COLLECTION, movementIdemKey);
      transaction.set(targetIdemRef, {
        idempotencyKey: movementIdemKey,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        operationId: `${strBookingId}-booking`,
        bookingId: strBookingId,
        amount: builtDeltaMov.totalAmount,
        paymentMethod: builtDeltaMov.paymentMethod,
        flow: 'income',
        status: 'completed',
        movementId: builtDeltaMov.movId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    if (userRef && userSnap && userSnap.exists()) {
      const uData = userSnap.data();
      const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
      const isOwnOrigin = !uOrigin || isSameComplex(uOrigin, targetComplexId);
      const userPatch: Record<string, any> = !isCancelled
        ? (buildUserReactivationPatch(uData, targetComplexId) || {})
        : {};

      if (clearedDebt > 0 && isOwnOrigin) {
        const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
        userPatch.debt = Math.max(0, currentUserDebt - clearedDebt);
        userPatch.updatedAt = serverTimestamp();
      }

      if (Object.keys(userPatch).length > 0) {
        transaction.update(userRef, userPatch);
      }
    }
  });

  // Lifecycle metrics synchronization
  const finalUserId = patch.userId;
  const finalPhone = patch.userPhone || patch.clientPhone;
  if ((finalUserId && finalUserId !== '0') || finalPhone) {
    syncUserMetricsWithBookings(finalUserId || '', finalPhone);
  }
}

/**
 * Elimina DEFINITIVAMENTE una reserva y TODOS sus datos asociados exclusivamente a ella:
 * - Documento de la reserva en 'bookings'
 * - Liberación del bloqueo de horario en 'booking_locks'
 * - Operaciones comerciales generadas exclusivamente por ella en 'operations'
 * - Movimientos financieros generados exclusivamente por ella en 'financial_movements'
 * - Transacciones históricas vinculadas en 'transactions'
 * - Claves de idempotencia vinculadas (verificando existencia previa antes de borrar)
 * - Usuarios creados exclusivamente para esta reserva (si no tienen otras reservas ni operaciones)
 */
export async function permanentlyDeleteBookingInFirestore(bookingId: string | number): Promise<{ success: boolean; deletedUserId?: string | null }> {
  const strId = String(bookingId);
  const docRef = doc(db, BOOKINGS_COLLECTION, strId);

  // 1. Obtener datos de la reserva antes de eliminar (1 lectura autoritativa de seguridad)
  const bookingSnap = await getDoc(docRef);
  if (!bookingSnap.exists()) {
    return { success: true };
  }

  const bData = bookingSnap.data();
  if (bData?.createdSource === 'jogo') {
    throw new Error('Las reservas generadas por Jogo no pueden cancelarse ni eliminarse desde el complejo.');
  }
  const userId = bData.userId || bData.host_id || null;
  const rawComplex = bData.complejoId || bData.complexId || 'B';
  const targetComplexId = rawComplex === 'complejo_central' ? 'B' : rawComplex;
  const complexCandidates = (targetComplexId === 'B' || rawComplex === 'complejo_central')
    ? ['B', 'complejo_central']
    : [targetComplexId];
  const courtId = String(bData.courtId || bData.court_id || 'c_1');
  const date = bData.date;

  // 2. Liberar el bloqueo en booking_locks sin getDoc previo (0 lecturas; ignora 'not-found')
  try {
    const affectedCourts = await getOverlappingCourtIds(targetComplexId, courtId);
    const lockRefs = affectedCourts.map(cid =>
      doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${date}`)
    );

    await Promise.all(
      lockRefs.map(async (lockRef) => {
        try {
          await updateDoc(lockRef, {
            [`bookings.${strId}`]: deleteField(),
            updatedAt: serverTimestamp()
          });
        } catch (lockErr: any) {
          if (lockErr?.code === 'not-found') return;
          const lSnap = await getDoc(lockRef).catch(() => null);
          if (lSnap && lSnap.exists()) {
            const bMap = { ...(lSnap.data().bookings || {}) };
            if (bMap[strId]) {
              delete bMap[strId];
              await setDoc(lockRef, {
                bookings: bMap,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }
      })
    );
  } catch (err) {
    console.warn('[Firestore] Error releasing booking lock during permanent delete:', err);
  }

  // 3. Recolectar documentos existentes priorizando caché en memoria (0 lecturas) y queries acotadas
  const batch = writeBatch(db);
  const directOpId = `${strId}-booking`;
  const directOpRef = doc(db, OPERATIONS_COLLECTION, directOpId);
  let debtToRevert = 0;

  const trackedIdemKeys = new Set<string>([`booking_dep_${strId}`]);
  if (bData.idempotencyKey) trackedIdemKeys.add(String(bData.idempotencyKey));
  if (Array.isArray(bData.idempotencyKeys)) {
    bData.idempotencyKeys.forEach((k: any) => k && trackedIdemKeys.add(String(k)));
  }

  const deletedOpIds = new Set<string>([directOpId]);
  const cachedOps = sharedSubscribeOperations.getCached(targetComplexId);

  if (cachedOps) {
    const matchingOps = cachedOps.filter(
      op => op.id === directOpId || op.bookingId === strId
    );
    matchingOps.forEach(opD => {
      deletedOpIds.add(opD.id);
      debtToRevert += Number(opD.currentAccountDebtAmount || 0);
      if (opD.idempotencyKey) trackedIdemKeys.add(String(opD.idempotencyKey));
      if (Array.isArray((opD as any).idempotencyKeys)) {
        (opD as any).idempotencyKeys.forEach((k: any) => k && trackedIdemKeys.add(String(k)));
      }
      batch.delete(doc(db, OPERATIONS_COLLECTION, opD.id));
    });
  } else {
    const directOpSnap = await getDoc(directOpRef);
    if (directOpSnap.exists()) {
      const opD = directOpSnap.data();
      debtToRevert += Number(opD.currentAccountDebtAmount || 0);
      if (opD.idempotencyKey) trackedIdemKeys.add(String(opD.idempotencyKey));
      if (Array.isArray(opD.idempotencyKeys)) {
        opD.idempotencyKeys.forEach((k: any) => k && trackedIdemKeys.add(String(k)));
      }
      batch.delete(directOpRef);
    }

    try {
      const runOpsQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
        try {
          return await getDocs(
            query(
              collection(db, OPERATIONS_COLLECTION),
              where(field, '==', cid),
              where('bookingId', '==', strId)
            )
          );
        } catch (qErr: any) {
          if (qErr?.code === 'failed-precondition') {
            return await getDocs(query(collection(db, OPERATIONS_COLLECTION), where(field, '==', cid)));
          }
          throw qErr;
        }
      };

      const opSnaps = await Promise.all(
        complexCandidates.flatMap(cid => [
          runOpsQuery('complexId', cid),
          runOpsQuery('complejoId', cid)
        ])
      );
      opSnaps.forEach(snap => {
        snap.forEach(opDoc => {
          const opD = opDoc.data();
          if (opD.bookingId === strId && !deletedOpIds.has(opDoc.id)) {
            deletedOpIds.add(opDoc.id);
            debtToRevert += Number(opD.currentAccountDebtAmount || 0);
            if (opD.idempotencyKey) trackedIdemKeys.add(String(opD.idempotencyKey));
            if (Array.isArray(opD.idempotencyKeys)) {
              opD.idempotencyKeys.forEach((k: any) => k && trackedIdemKeys.add(String(k)));
            }
            batch.delete(opDoc.ref);
          }
        });
      });
    } catch (err) {
      console.warn('[Firestore] Error querying operations to delete:', err);
    }
  }

  // 4. Movimientos financieros: caché compartida primero (0 lecturas), luego queries acotadas por bookingId/operationId
  const cachedMovs = sharedSubscribeFinancialMovements.getCached(targetComplexId);
  if (cachedMovs) {
    cachedMovs.forEach(mD => {
      if (mD.bookingId === strId || (mD.operationId && deletedOpIds.has(String(mD.operationId)))) {
        if (mD.idempotencyKey) trackedIdemKeys.add(String(mD.idempotencyKey));
        batch.delete(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, mD.id));
      }
    });
  } else {
    try {
      const runMovsQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
        try {
          const [byBooking, ...byOps] = await Promise.all([
            getDocs(
              query(
                collection(db, FINANCIAL_MOVEMENTS_COLLECTION),
                where(field, '==', cid),
                where('bookingId', '==', strId)
              )
            ),
            ...Array.from(deletedOpIds).map(opKey =>
              getDocs(
                query(
                  collection(db, FINANCIAL_MOVEMENTS_COLLECTION),
                  where(field, '==', cid),
                  where('operationId', '==', opKey)
                )
              )
            )
          ]);
          return [byBooking, ...byOps];
        } catch (qErr: any) {
          if (qErr?.code === 'failed-precondition') {
            return [await getDocs(query(collection(db, FINANCIAL_MOVEMENTS_COLLECTION), where(field, '==', cid)))];
          }
          throw qErr;
        }
      };

      const movSnapGroups = await Promise.all(
        complexCandidates.flatMap(cid => [
          runMovsQuery('complexId', cid),
          runMovsQuery('complejoId', cid)
        ])
      );
      const seenMovIds = new Set<string>();
      movSnapGroups.flat().forEach(snap => {
        snap.forEach(mDoc => {
          const mD = mDoc.data();
          if (
            !seenMovIds.has(mDoc.id) &&
            (mD.bookingId === strId || (mD.operationId && deletedOpIds.has(String(mD.operationId))))
          ) {
            seenMovIds.add(mDoc.id);
            if (mD.idempotencyKey) trackedIdemKeys.add(String(mD.idempotencyKey));
            batch.delete(mDoc.ref);
          }
        });
      });
    } catch (err) {
      console.warn('[Firestore] Error querying financial movements to delete:', err);
    }
  }

  // 5. Transacciones históricas vinculadas: caché compartida primero (0 lecturas), luego queries acotadas
  const cachedTxs = sharedSubscribeTransactions.getCached(targetComplexId);
  if (cachedTxs) {
    cachedTxs.forEach(tD => {
      if (tD.bookingId === strId || (tD.operationId && deletedOpIds.has(String(tD.operationId)))) {
        batch.delete(doc(db, TRANSACTIONS_COLLECTION, tD.id));
      }
    });
  } else {
    try {
      const runTxQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
        try {
          const [byBooking, ...byOps] = await Promise.all([
            getDocs(
              query(
                collection(db, TRANSACTIONS_COLLECTION),
                where(field, '==', cid),
                where('bookingId', '==', strId)
              )
            ),
            ...Array.from(deletedOpIds).map(opKey =>
              getDocs(
                query(
                  collection(db, TRANSACTIONS_COLLECTION),
                  where(field, '==', cid),
                  where('operationId', '==', opKey)
                )
              )
            )
          ]);
          return [byBooking, ...byOps];
        } catch (qErr: any) {
          if (qErr?.code === 'failed-precondition') {
            return [await getDocs(query(collection(db, TRANSACTIONS_COLLECTION), where(field, '==', cid)))];
          }
          throw qErr;
        }
      };

      const txSnapGroups = await Promise.all(
        complexCandidates.flatMap(cid => [
          runTxQuery('complexId', cid),
          runTxQuery('complejoId', cid)
        ])
      );
      const seenTxIds = new Set<string>();
      txSnapGroups.flat().forEach(snap => {
        snap.forEach(tDoc => {
          const tD = tDoc.data();
          if (!seenTxIds.has(tDoc.id) && (tD.bookingId === strId || (tD.operationId && deletedOpIds.has(String(tD.operationId))))) {
            seenTxIds.add(tDoc.id);
            batch.delete(tDoc.ref);
          }
        });
      });
    } catch (err) {
      console.warn('[Firestore] Error querying legacy transactions to delete:', err);
    }
  }

  // 5.1 Limpiar claves de idempotencia rastreadas por doc() directo (compatible con firestore.rules)
  try {
    const idemRefs = Array.from(trackedIdemKeys).filter(Boolean).map(k => doc(db, IDEMPOTENCY_COLLECTION, k));
    const idemSnaps = await Promise.all(
      idemRefs.map(ref => getDoc(ref).catch(() => null))
    );
    idemSnaps.forEach(snap => {
      if (snap && snap.exists()) {
        batch.delete(snap.ref);
      }
    });
  } catch (err) {
    console.warn('[Firestore] Error cleaning tracked idempotency keys:', err);
  }

  // 6. Eliminar el documento principal de la reserva
  batch.delete(docRef);

  // Ejecutar el lote atómico de eliminación
  await batch.commit();

  // 6.1 & 7. Leer documento del usuario una sola vez (priorizando caché compartida) para deuda + limpieza
  let cachedUserData: any = null;
  let userExists = false;
  if (userId && String(userId) !== '0') {
    const strUserId = String(userId);
    const userDocRef = doc(db, USERS_COLLECTION, strUserId);
    const rawUserInMemory = rawClientsByComplexMap.get(targetComplexId)?.get(strUserId);

    if (rawUserInMemory) {
      cachedUserData = rawUserInMemory;
      userExists = true;
    } else {
      try {
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          cachedUserData = userSnap.data();
          userExists = true;
        }
      } catch (readErr) {
        console.warn('[Firestore] Error reading user during booking delete:', readErr);
      }
    }

    if (debtToRevert > 0 && userExists && cachedUserData) {
      try {
        const uOrigin = cachedUserData?.originComplejoId || cachedUserData?.originComplexId || cachedUserData?.complejoId || cachedUserData?.complexId;
        if (!uOrigin || isSameComplex(uOrigin, targetComplexId)) {
          const currentDebt = Math.max(0, Number(cachedUserData?.debt || 0));
          const nextDebt = Math.max(0, currentDebt - debtToRevert);
          cachedUserData = { ...cachedUserData, debt: nextDebt };
          await updateDoc(userDocRef, {
            debt: nextDebt,
            updatedAt: serverTimestamp()
          });
        }
      } catch (debtErr) {
        console.warn('[Firestore] Error reverting booking debt on delete:', debtErr);
      }
    }
  }

  // 7. Evaluar el usuario / cliente asociado: ocultar SOLO si fue placeholder creado exclusivamente para esta reserva
  let deletedUserId: string | null = null;
  if (userId && String(userId) !== '0') {
    const strUserId = String(userId);
    const userDocRef = doc(db, USERS_COLLECTION, strUserId);
    try {
      const isCurrentAuthUser = auth.currentUser?.uid === strUserId;
      const uData = cachedUserData;
      const isActivatedOrAdmin = uData && (
        uData.category === 'admin' ||
        uData.isActivated === true ||
        uData.isOwner === true
      );
      const isPermanentOrForeignUser = uData && (
        (uData.originComplejoId && !isSameComplex(uData.originComplejoId, targetComplexId)) ||
        (Array.isArray(uData.associatedComplexIds) && uData.associatedComplexIds.length > 1) ||
        Boolean(uData.canonicalId || uData.canonicalUserId || uData.personId) ||
        (uData.phone && uData.name && !isGenericPlaceholderName(uData.name))
      );

      // Si es usuario real/permanente, evitar por completo escanear reservas/operaciones del complejo
      if (!userExists || isCurrentAuthUser || isActivatedOrAdmin || isPermanentOrForeignUser) {
        if (userExists) {
          await syncUserMetricsWithBookings(strUserId, uData?.phone, targetComplexId, uData);
        }
        return { success: true, deletedUserId: null };
      }

      // Solo para posibles placeholders temporales: revisar cachés primero (0 lecturas)
      const cachedBookingsList = sharedSubscribeBookings.getCached(`${targetComplexId}::*`);
      let hasRemainingBooking = false;
      if (cachedBookingsList) {
        hasRemainingBooking = cachedBookingsList.some(
          d => String(d.id) !== strId && String((d as any).userId || (d as any).host_id || '') === strUserId
        );
      } else {
        const otherBookingsSnaps = await Promise.all(
          complexCandidates.map(async (cid) => {
            try {
              return await getDocs(
                query(collection(db, BOOKINGS_COLLECTION), where('complejoId', '==', cid), where('userId', '==', strUserId), limit(2))
              );
            } catch {
              return await getDocs(query(collection(db, BOOKINGS_COLLECTION), where('complejoId', '==', cid)));
            }
          })
        );
        hasRemainingBooking = otherBookingsSnaps
          .flatMap(s => s.docs)
          .some(d => d.id !== strId && String(d.data().userId || d.data().host_id || '') === strUserId);
      }

      let hasRemainingOp = false;
      if (!hasRemainingBooking) {
        const cachedOpsList = sharedSubscribeOperations.getCached(targetComplexId);
        if (cachedOpsList) {
          hasRemainingOp = cachedOpsList.some(
            d => d.bookingId !== strId && !deletedOpIds.has(d.id) && String(d.userId || (d as any).clientId || '') === strUserId
          );
        } else {
          const otherOpsSnaps = await Promise.all(
            complexCandidates.map(async (cid) => {
              try {
                return await getDocs(
                  query(collection(db, OPERATIONS_COLLECTION), where('complejoId', '==', cid), where('userId', '==', strUserId), limit(5))
                );
              } catch {
                return await getDocs(query(collection(db, OPERATIONS_COLLECTION), where('complejoId', '==', cid)));
              }
            })
          );
          hasRemainingOp = otherOpsSnaps
            .flatMap(s => s.docs)
            .some(d => d.data().bookingId !== strId && !deletedOpIds.has(d.id) && String(d.data().userId || d.data().clientId || '') === strUserId);
        }
      }

      if (!hasRemainingBooking && !hasRemainingOp) {
        const aliases = getComplexAliasIds(targetComplexId);
        await updateDoc(userDocRef, {
          hiddenForComplexIds: arrayUnion(...aliases),
          associatedComplexIds: arrayRemove(...aliases),
          updatedAt: new Date().toISOString()
        });
        deletedUserId = strUserId;
      } else {
        await syncUserMetricsWithBookings(strUserId, uData?.phone, targetComplexId, uData);
      }
    } catch (err) {
      console.warn('[Firestore] Error checking/cleaning associated user:', err);
      await syncUserMetricsWithBookings(strUserId, cachedUserData?.phone, targetComplexId, cachedUserData);
    }
  }

  return { success: true, deletedUserId };
}

/**
 * Elimina una reserva de la colección canónica 'bookings' y limpia todas sus dependencias.
 */
export async function deleteBookingInFirestore(bookingId: string | number): Promise<void> {
  await permanentlyDeleteBookingInFirestore(bookingId);
}

// =========================================================================
// 2.2.1. Colección Canónica: support_tickets
// =========================================================================

/**
 * Crea un ticket de soporte en la colección canónica /support_tickets
 */
export async function createSupportTicketInFirestore(data: {
  complejoId?: string;
  complexName?: string;
  type: string;
  priority: string;
  module: string;
  title: string;
  description: string;
  admin_name: string;
  admin_phone?: string;
  admin_email?: string;
  system_info?: string;
  channel?: string;
}): Promise<SupportTicket> {
  const colRef = collection(db, SUPPORT_TICKETS_COLLECTION);
  const ticketRef = doc(colRef);
  
  const prefix = data.type === 'bug' ? 'BUG' : data.type === 'feature' ? 'MEJ' : data.type === 'urgent' ? 'URG' : 'SUP';
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const ticketCode = `#${prefix}-${randomDigits}`;
  const nowIso = new Date().toISOString();

  const ticketData: any = {
    id: ticketRef.id,
    ticket_code: ticketCode,
    complejoId: data.complejoId || 'B',
    complexName: data.complexName || 'Complejo Deportivo',
    type: data.type || 'bug',
    priority: data.priority || 'medium',
    module: data.module || 'General',
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    admin_name: data.admin_name || 'Administrador',
    admin_phone: data.admin_phone || '',
    admin_email: data.admin_email || '',
    createdByUid: auth.currentUser?.uid || null,
    system_info: data.system_info || '',
    status: 'pending',
    channel: data.channel || 'system',
    created_at: nowIso,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ticketRef, ticketData);
  console.log('[Firestore] Ticket de soporte creado en support_tickets/', ticketRef.id);
  
  return {
    id: Date.now(),
    ...ticketData
  };
}

/**
 * Escucha los tickets de soporte del complejo activo en tiempo real
 */
export function subscribeToSupportTickets(
  complexId: string,
  cb: (tickets: SupportTicket[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, SUPPORT_TICKETS_COLLECTION);
  
  const q = query(colRef, where('complejoId', '==', targetId));
  
  return onSnapshot(q, (snap) => {
    const list: SupportTicket[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: data.id || d.id,
        ticket_code: data.ticket_code || `#SUP-${d.id.slice(0, 6)}`,
        type: data.type || 'inquiry',
        priority: data.priority || 'medium',
        module: data.module || 'General',
        title: data.title || '',
        description: data.description || '',
        admin_name: data.admin_name || 'Administrador',
        admin_phone: data.admin_phone || '',
        admin_email: data.admin_email || '',
        system_info: typeof data.system_info === 'object' ? JSON.stringify(data.system_info) : (data.system_info || ''),
        status: data.status || 'pending',
        channel: data.channel || 'system',
        created_at: data.created_at || (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString())
      });
    });

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando support_tickets:', err);
    cb([]);
  });
}

/**
 * Actualiza el estado de un ticket de soporte
 */
export async function updateSupportTicketStatusInFirestore(ticketId: string, status: string): Promise<void> {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, String(ticketId));
  await updateDoc(ticketRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

// =========================================================================
// 2.3. Colección Canónica: users (Clientes y jugadores del complejo)
// =========================================================================

// Caché en memoria de fichas crudas de /users (incluyendo ocultas) por complejo para evitar lecturas extra
const rawClientsByComplexMap = new Map<string, Map<string, User>>();

export function getHiddenClientsForComplex(complexId?: string | null): User[] {
  if (!complexId) return [];
  const targetId = complexId === 'complejo_central' ? 'B' : complexId;
  const rawMap = rawClientsByComplexMap.get(targetId);
  if (!rawMap) return [];
  const hidden: User[] = [];
  rawMap.forEach((user) => {
    if (isUserHiddenForComplex(user, targetId)) {
      hidden.push(user);
    }
  });
  return hidden;
}

export function findHiddenOrExistingClientInCache(
  complexId: string | undefined | null,
  criteria: {
    id?: string | number | null;
    phone?: string | null;
    canonicalId?: string | null;
  }
): User | null {
  if (!complexId) return null;
  const targetId = complexId === 'complejo_central' ? 'B' : complexId;
  const rawMap = rawClientsByComplexMap.get(targetId);
  if (!rawMap || rawMap.size === 0) return null;

  const rawId = criteria.id !== undefined && criteria.id !== null ? String(criteria.id).trim() : '';
  const validId = rawId && rawId !== '0' && !rawId.startsWith('derived_') ? rawId : '';
  const validCanon = criteria.canonicalId ? String(criteria.canonicalId).trim() : '';
  const normPhone = normalizePhoneNumber(criteria.phone);

  if (validId && rawMap.has(validId)) {
    return rawMap.get(validId)!;
  }

  for (const u of rawMap.values()) {
    const uCanon = u.canonicalId || u.canonicalUserId || (u as any).personId || (u as any).erpUserId;
    if (validCanon && (String(uCanon || '').trim() === validCanon || String(u.id).trim() === validCanon)) {
      return u;
    }
    if (normPhone && normalizePhoneNumber(u.phone) === normPhone) {
      return u;
    }
  }
  return null;
}

function buildUserReactivationPatch(uData: Record<string, any> | undefined, targetComplexId: string): Record<string, any> | null {
  if (!uData || !targetComplexId) return null;
  const aliases = getComplexAliasIds(targetComplexId);
  const hiddenArr = Array.isArray(uData.hiddenForComplexIds) ? uData.hiddenForComplexIds.map(String) : [];
  const legacyDeletedArr = Array.isArray(uData.deletedByComplexIds) ? uData.deletedByComplexIds.map(String) : [];
  const assocArr = Array.isArray(uData.associatedComplexIds) ? uData.associatedComplexIds.map(String) : [];

  const isHiddenHere = aliases.some(a => hiddenArr.includes(a) || legacyDeletedArr.includes(a));
  const isAssociatedHere = assocArr.includes(targetComplexId);
  const uOrigin = uData.originComplejoId || uData.originComplexId || uData.complejoId || uData.complexId;
  const isOwnOrigin = !uOrigin || isSameComplex(uOrigin, targetComplexId);
  const needsStatusReactivate = isOwnOrigin && uData.status === 'inactivo';

  if (!isHiddenHere && isAssociatedHere && !needsStatusReactivate) {
    return null;
  }

  const patch: Record<string, any> = {
    associatedComplexIds: arrayUnion(targetComplexId),
    updatedAt: new Date().toISOString()
  };

  if (hiddenArr.length > 0) {
    patch.hiddenForComplexIds = arrayRemove(...aliases);
  }
  if (legacyDeletedArr.length > 0) {
    patch.deletedByComplexIds = arrayRemove(...aliases);
  }
  if (needsStatusReactivate) {
    patch.status = 'activo';
  }

  return patch;
}

/**
 * Escucha clientes en la colección canónica 'users' filtrando por asociación estricta al complejo activo:
 * originComplejoId, originComplexId, complejoId, complexId y associatedComplexIds.
 * Fusiona los resultados en un mapa deduplicado por ID y garantiza el aislamiento multi-tenant.
 */
const sharedSubscribeClients = createSharedSubscription<User[]>((targetId, emit) => {
  try {
    const colRef = collection(db, USERS_COLLECTION);
    const qOrigin = query(colRef, where('originComplejoId', '==', targetId));
    const qAltOrigin = query(colRef, where('originComplexId', '==', targetId));
    const qComplejo = query(colRef, where('complejoId', '==', targetId));
    const qComplex = query(colRef, where('complexId', '==', targetId));
    const qAssociated = query(colRef, where('associatedComplexIds', 'array-contains', targetId));

    const mapOrigin = new Map<string, User>();
    const mapAltOrigin = new Map<string, User>();
    const mapComplejo = new Map<string, User>();
    const mapComplex = new Map<string, User>();
    const mapAssociated = new Map<string, User>();

    const emitMerged = () => {
      const rawAll = new Map<string, User>();
      const collectRaw = (user: User) => {
        if (user && user.id) {
          rawAll.set(String(user.id), user);
        }
      };
      mapOrigin.forEach(collectRaw);
      mapAltOrigin.forEach(collectRaw);
      mapComplejo.forEach(collectRaw);
      mapComplex.forEach(collectRaw);
      mapAssociated.forEach(collectRaw);
      rawClientsByComplexMap.set(targetId, rawAll);

      const merged = new Map<string, User>();
      const aliases = getComplexAliasIds(targetId);

      const checkAndAdd = (user: User) => {
        if (isUserHiddenForComplex(user, targetId)) {
          return;
        }

        const uOrigin = user.originComplejoId || (user as any).originComplexId || (user as any).complejoId || (user as any).complexId;
        const assocList = Array.isArray(user.associatedComplexIds) ? user.associatedComplexIds.map(String) : [];
        const isAssociated = aliases.some(a => assocList.includes(a));
        const isOriginMatch = Boolean(uOrigin && isSameComplex(uOrigin, targetId));

        if (isOriginMatch || isAssociated) {
          merged.set(String(user.id), user);
        }
      };

      rawAll.forEach(checkAndAdd);

      emit(Array.from(merged.values()));
    };

    const unsubOrigin = onSnapshot(qOrigin, (snap) => {
      mapOrigin.clear();
      snap.forEach(d => mapOrigin.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, (err) => {
      console.warn('[Firestore] Escucha users (originComplejoId):', err);
    });

    const unsubAltOrigin = onSnapshot(qAltOrigin, (snap) => {
      mapAltOrigin.clear();
      snap.forEach(d => mapAltOrigin.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, () => {});

    const unsubComplejo = onSnapshot(qComplejo, (snap) => {
      mapComplejo.clear();
      snap.forEach(d => mapComplejo.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, () => {});

    const unsubComplex = onSnapshot(qComplex, (snap) => {
      mapComplex.clear();
      snap.forEach(d => mapComplex.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, () => {});

    const unsubAssociated = onSnapshot(qAssociated, (snap) => {
      mapAssociated.clear();
      snap.forEach(d => mapAssociated.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, () => {});

    return () => {
      unsubOrigin();
      unsubAltOrigin();
      unsubComplejo();
      unsubComplex();
      unsubAssociated();
    };
  } catch (e) {
    console.error('[Firestore] Error subscribing to clients:', e);
    emit([]);
    return () => {};
  }
});

export function subscribeToClients(
  complexId: string, 
  onUpdate: (users: User[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeClients(targetId, onUpdate);
}

/**
 * Guarda o actualiza un cliente en la colección canónica 'users'
 */
export async function saveClientInFirestore(
  complexId: string, 
  client: Partial<User>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const aliases = getComplexAliasIds(targetId);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // 1. Verificar si client.id apunta a un documento existente accesible por ESTE complejo (sin lecturas extra si está en caché)
  let existingData: any = null;
  let isOwnDocument = false;
  let isForeignSharedDoc = false;
  let resolvedDocId: string | null = null;

  const cachedByCriteria = findHiddenOrExistingClientInCache(targetId, {
    id: client.id,
    phone: client.phone,
    canonicalId: client.canonicalId || (client as any).canonicalUserId
  });

  if (cachedByCriteria && cachedByCriteria.id && !String(cachedByCriteria.id).startsWith('derived_')) {
    const docOrigin = cachedByCriteria.originComplejoId || (cachedByCriteria as any).originComplexId || (cachedByCriteria as any).complejoId || (cachedByCriteria as any).complexId;
    const assocArr = Array.isArray(cachedByCriteria.associatedComplexIds) ? cachedByCriteria.associatedComplexIds.map(String) : [];
    const hiddenArr = Array.isArray((cachedByCriteria as any).hiddenForComplexIds) ? (cachedByCriteria as any).hiddenForComplexIds.map(String) : [];
    const isOriginHere = !docOrigin || isSameComplex(docOrigin, targetId);
    const isLinkedHere = aliases.some(a => assocArr.includes(a) || hiddenArr.includes(a));

    if (isOriginHere || isLinkedHere) {
      isOwnDocument = true;
      isForeignSharedDoc = !isOriginHere;
      resolvedDocId = String(cachedByCriteria.id);
      existingData = cachedByCriteria;
    } else {
      existingData = cachedByCriteria;
    }
  } else if (client.id && !String(client.id).startsWith('derived_')) {
    try {
      const candidateDocRef = doc(db, USERS_COLLECTION, String(client.id));
      const existingDoc = await getDoc(candidateDocRef);
      if (existingDoc.exists()) {
        const docData = existingDoc.data();
        const docOrigin = docData.originComplejoId || docData.originComplexId || docData.complejoId || docData.complexId;
        const assocArr = Array.isArray(docData.associatedComplexIds) ? docData.associatedComplexIds.map(String) : [];
        const hiddenArr = Array.isArray(docData.hiddenForComplexIds) ? docData.hiddenForComplexIds.map(String) : [];
        const isOriginHere = !docOrigin || isSameComplex(docOrigin, targetId);
        const isLinkedHere = aliases.some(a => assocArr.includes(a) || hiddenArr.includes(a));

        if (isOriginHere || isLinkedHere) {
          isOwnDocument = true;
          isForeignSharedDoc = !isOriginHere;
          resolvedDocId = String(client.id);
          existingData = docData;
        } else {
          // El documento pertenece a OTRO complejo. Conservamos datos de persona para heredar si aplica, pero NUNCA sobrescribimos su origen.
          existingData = docData;
        }
      }
    } catch (e) {
      // Ignorar si no existe o no tiene permiso de lectura previo
    }
  }

  // 2. Fallback si caché frío: comprobar si ya existe un documento local en originComplejoId que coincida con canonicalId o teléfono
  if (!isOwnDocument && !rawClientsByComplexMap.has(targetId)) {
    const normPhone = normalizePhoneNumber(client.phone || existingData?.phone);
    const canonId = client.canonicalId || (client as any).canonicalUserId || existingData?.canonicalId || existingData?.canonicalUserId;

    if (normPhone || canonId) {
      try {
        const usersCol = collection(db, USERS_COLLECTION);
        const qOrigin = query(usersCol, where('originComplejoId', '==', targetId));
        const snapOrigin = await getDocs(qOrigin);

        const localMatchDoc = snapOrigin.docs.find(d => {
          const dData = d.data();
          if (canonId && (dData.canonicalId === canonId || dData.canonicalUserId === canonId)) return true;
          if (normPhone && normalizePhoneNumber(dData.phone) === normPhone) return true;
          return false;
        });

        if (localMatchDoc) {
          resolvedDocId = localMatchDoc.id;
          existingData = localMatchDoc.data();
          isOwnDocument = true;
        }
      } catch (err) {
        console.warn('[Firestore] Error buscando ficha local existente:', err);
      }
    }
  }

  // 3. Si aún no hay ID propio, generar un ID nuevo para la ficha local de este complejo
  const finalClientId = (isOwnDocument && resolvedDocId)
    ? resolvedDocId
    : doc(collection(db, USERS_COLLECTION)).id;

  // Si es una ficha compartida cuyo complejo de origen es OTRO complejo, solo reactivamos/asociamos sin alterar campos de origen ni deuda ajena
  if (isForeignSharedDoc && resolvedDocId) {
    const reactivatePatch = buildUserReactivationPatch(existingData, targetId) || {
      associatedComplexIds: arrayUnion(targetId),
      updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, USERS_COLLECTION, resolvedDocId), reactivatePatch);
    return resolvedDocId;
  }

  // 4. Preservar metadatos canónicos e históricos
  const resolvedCanonId = client.canonicalId || (client as any).canonicalUserId || existingData?.canonicalId || existingData?.canonicalUserId;
  const resolvedCanonUserId = (client as any).canonicalUserId || client.canonicalId || existingData?.canonicalUserId || existingData?.canonicalId;
  const resolvedCanonName = (client as any).canonicalName || existingData?.canonicalName;

  const histSet = new Set<string>();
  if (Array.isArray(existingData?.historicalIds)) existingData.historicalIds.forEach((h: any) => histSet.add(String(h)));
  if (Array.isArray(client.historicalIds)) client.historicalIds.forEach((h: any) => histSet.add(String(h)));
  if (client.historicalId) histSet.add(String(client.historicalId));
  if (existingData?.historicalId) histSet.add(String(existingData.historicalId));
  if ((client as any).oldId) histSet.add(String((client as any).oldId));
  if ((client as any).oldPhone) histSet.add(String((client as any).oldPhone));
  if (client.id && String(client.id) !== finalClientId) {
    histSet.add(String(client.id));
  }
  const resolvedHistoricalIds = Array.from(histSet);

  // Deuda: aislada por complejo. NUNCA copiar debt de otra sede
  let assignedDebt: number | undefined = undefined;
  if (client.debt !== undefined) {
    assignedDebt = Number(client.debt);
  } else if (isOwnDocument && existingData?.debt !== undefined) {
    assignedDebt = Number(existingData.debt);
  } else {
    assignedDebt = 0;
  }

  const preservedOriginComplejoId = (isOwnDocument && existingData?.originComplejoId) ? existingData.originComplejoId : targetId;
  const preservedComplejoId = (isOwnDocument && existingData?.complejoId) ? existingData.complejoId : targetId;
  const preservedComplexId = (isOwnDocument && existingData?.complexId) ? existingData.complexId : targetId;

  const mergedAssociatedIds = Array.from(new Set([
    ...(isOwnDocument && Array.isArray(existingData?.associatedComplexIds) ? existingData.associatedComplexIds.map(String) : []),
    targetId
  ]));

  const resolvedStatus = client.status !== undefined
    ? client.status
    : ((isOwnDocument && existingData?.status && existingData.status !== 'inactivo') ? existingData.status : 'activo');

  const payload: any = {
    id: finalClientId,
    name: (client.name !== undefined ? client.name : (isOwnDocument ? existingData?.name : 'Cliente') || 'Cliente').trim(),
    phone: (client.phone !== undefined ? client.phone : (existingData?.phone || '')).trim(),
    email: (client.email !== undefined ? client.email : (existingData?.email || '')).trim(),
    address: client.address !== undefined ? client.address : (existingData?.address || existingData?.city || ''),
    city: client.city !== undefined ? client.city : (client.address !== undefined ? client.address : (existingData?.city || existingData?.address || '')),
    preferredFoot: client.preferredFoot !== undefined ? client.preferredFoot : (existingData?.preferredFoot || ''),
    birthDate: client.birthDate !== undefined ? client.birthDate : (existingData?.birthDate || ''),
    gender: client.gender !== undefined ? client.gender : (existingData?.gender || ''),
    category: client.category !== undefined ? client.category : (isOwnDocument ? existingData?.category : 'jugador') || 'jugador',
    status: resolvedStatus,
    isActivated: client.isActivated !== undefined ? client.isActivated : (isOwnDocument ? (existingData?.isActivated ?? false) : false),
    acquisitionChannel: client.acquisitionChannel !== undefined ? client.acquisitionChannel : (isOwnDocument ? existingData?.acquisitionChannel : 'WhatsApp') || 'WhatsApp',
    acquisitionDate: (isOwnDocument && existingData?.acquisitionDate) || client.acquisitionDate || client.created_at || dateStr,
    acquisitionTime: (isOwnDocument && existingData?.acquisitionTime) || client.acquisitionTime || timeStr,
    activationDate: client.activationDate !== undefined ? client.activationDate : (isOwnDocument ? (existingData?.activationDate || null) : null),
    activationTime: client.activationTime !== undefined ? client.activationTime : (isOwnDocument ? (existingData?.activationTime || null) : null),
    originComplejoId: preservedOriginComplejoId,
    originComplejoName: (isOwnDocument && existingData?.originComplejoName) || client.originComplejoName || (targetId === 'B' ? 'Colo loco' : targetId),
    complejoId: preservedComplejoId,
    complexId: preservedComplexId,
    associatedComplexIds: mergedAssociatedIds,
    ...(isOwnDocument && Array.isArray(existingData?.hiddenForComplexIds)
      ? { hiddenForComplexIds: existingData.hiddenForComplexIds.map(String).filter((id: string) => !aliases.includes(id)) }
      : {}),
    ...(isOwnDocument && Array.isArray(existingData?.deletedByComplexIds)
      ? { deletedByComplexIds: existingData.deletedByComplexIds.map(String).filter((id: string) => !aliases.includes(id)) }
      : {}),
    totalBookings: isOwnDocument ? (client.totalBookings !== undefined ? Number(client.totalBookings) : Number(existingData?.totalBookings ?? 0)) : (client.totalBookings !== undefined ? Number(client.totalBookings) : 0),
    totalMatchesPlayed: isOwnDocument ? (client.totalMatchesPlayed !== undefined ? Number(client.totalMatchesPlayed) : Number(existingData?.totalMatchesPlayed ?? existingData?.matches_played ?? 0)) : 0,
    participatedMatches: isOwnDocument ? (client.participatedMatches !== undefined ? Number(client.participatedMatches) : Number(existingData?.participatedMatches ?? 0)) : 0,
    lastGameDate: isOwnDocument ? (client.lastGameDate !== undefined ? client.lastGameDate : (existingData?.lastGameDate || '')) : (client.lastGameDate || ''),
    lastGameTime: isOwnDocument ? (client.lastGameTime !== undefined ? client.lastGameTime : (existingData?.lastGameTime || '')) : (client.lastGameTime || ''),
    debt: assignedDebt,
    notes: client.notes !== undefined ? client.notes : (isOwnDocument ? (existingData?.notes || '') : ''),
    ownerId: (isOwnDocument && existingData?.ownerId) || auth.currentUser?.uid || client.ownerId || '',
    adminId: (isOwnDocument && existingData?.adminId) || client.adminId || '',
    createdAt: (isOwnDocument && existingData?.createdAt) || client.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(resolvedCanonId ? { canonicalId: resolvedCanonId } : {}),
    ...(resolvedCanonUserId ? { canonicalUserId: resolvedCanonUserId } : {}),
    ...(resolvedCanonName ? { canonicalName: resolvedCanonName } : {}),
    ...(resolvedHistoricalIds.length > 0 ? { historicalIds: resolvedHistoricalIds } : {})
  };

  await setDoc(doc(db, USERS_COLLECTION, finalClientId), payload, { merge: true });

  // 5. Propagación en cascada de cambios de nombre y teléfono a turnos y operaciones
  const newName = payload.name;
  const newPhone = payload.phone;
  const oldPhoneVal = (client as any).oldPhone || existingData?.phone;
  const oldIdVal = (client as any).oldId || client.id;
  const normNewPhone = normalizePhoneNumber(newPhone);
  const normOldPhone = normalizePhoneNumber(oldPhoneVal);

  try {
    const batch = writeBatch(db);
    let batchCount = 0;

    // A. Actualizar bookings del complejo donde figure como host o en array players
    const bookingsCol = collection(db, BOOKINGS_COLLECTION);
    const qBookings = query(bookingsCol, where('complejoId', '==', targetId));
    const bSnap = await getDocs(qBookings);

    bSnap.forEach(bDoc => {
      const bData = bDoc.data();
      let shouldUpdate = false;
      const bPatch: Record<string, any> = {};

      const isHost = (
        (bData.userId && (String(bData.userId) === finalClientId || String(bData.userId) === String(oldIdVal))) ||
        (bData.host_id && (String(bData.host_id) === finalClientId || String(bData.host_id) === String(oldIdVal))) ||
        (normOldPhone && normalizePhoneNumber(bData.userPhone || bData.host_phone || bData.clientPhone) === normOldPhone)
      );

      if (isHost) {
        shouldUpdate = true;
        bPatch.userName = newName;
        bPatch.clientName = newName;
        bPatch.host_name = newName;
        bPatch.userPhone = newPhone;
        bPatch.clientPhone = newPhone;
        bPatch.host_phone = newPhone;
      }

      if (Array.isArray(bData.players) && bData.players.length > 0) {
        let playersChanged = false;
        const updatedPlayers = bData.players.map((p: any) => {
          if (!p) return p;
          const pId = String(p.id || p.userId || '');
          const pNorm = normalizePhoneNumber(p.phone || '');
          const isMatch = (
            (pId && (pId === finalClientId || pId === String(oldIdVal))) ||
            (normOldPhone && pNorm && pNorm === normOldPhone) ||
            (normNewPhone && pNorm && pNorm === normNewPhone)
          );
          if (isMatch) {
            playersChanged = true;
            return {
              ...p,
              name: newName,
              phone: newPhone
            };
          }
          return p;
        });

        if (playersChanged) {
          shouldUpdate = true;
          bPatch.players = updatedPlayers;
        }
      }

      if (shouldUpdate && batchCount < 400) {
        batch.update(bDoc.ref, bPatch);
        batchCount++;
      }
    });

    // B. Actualizar operations del complejo
    const opsCol = collection(db, OPERATIONS_COLLECTION);
    const qOps = query(opsCol, where('complejoId', '==', targetId));
    const opsSnap = await getDocs(qOps);

    opsSnap.forEach(opDoc => {
      const opData = opDoc.data();
      const isOpMatch = (
        (opData.userId && (String(opData.userId) === finalClientId || String(opData.userId) === String(oldIdVal))) ||
        (opData.clientId && (String(opData.clientId) === finalClientId || String(opData.clientId) === String(oldIdVal))) ||
        (normOldPhone && normalizePhoneNumber(opData.userPhone || opData.clientPhone) === normOldPhone)
      );

      if (isOpMatch && batchCount < 400) {
        batch.update(opDoc.ref, {
          userName: newName,
          clientName: newName,
          userPhone: newPhone,
          clientPhone: newPhone
        });
        batchCount++;
      }
    });

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (propagateErr) {
    console.warn('[Firestore] Error propagando actualización de cliente:', propagateErr);
  }

  return finalClientId;
}

/**
 * Formatea un número telefónico para enlace de WhatsApp garantizando:
 * - Prefijo internacional 549 para Argentina.
 * - NUNCA recortar el primer '1' para números de AMBA (ej: 11 3803 2662 -> 5491138032662).
 */
export function formatPhoneForWhatsApp(rawPhone?: string | null): string {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('549') && digits.length >= 12) {
    return digits;
  }
  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length >= 11) {
    const after = digits.slice(2);
    const clean = after.startsWith('0') ? after.slice(1) : after;
    return `549${clean}`;
  }

  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('1115') && digits.length === 12) {
    digits = '11' + digits.slice(4);
  } else if (digits.startsWith('15') && digits.length === 10) {
    digits = '11' + digits.slice(2);
  } else if (digits.length === 12 && digits.slice(3, 5) === '15') {
    digits = digits.slice(0, 3) + digits.slice(5);
  } else if (digits.length === 13 && digits.slice(4, 6) === '15') {
    digits = digits.slice(0, 4) + digits.slice(6);
  }

  if (digits.length === 10) {
    return `549${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('9')) {
    return `54${digits}`;
  }
  if (digits.length > 10) {
    return digits.startsWith('54') ? digits : `549${digits}`;
  }
  return `549${digits}`;
}

/**
 * Elimina/desvincula un cliente de la sede activa de forma NO DESTRUCTIVA.
 * NUNCA llama a deleteDoc, para preservar la trazabilidad contable, reservas pasadas
 * y fichas de clientes en otros complejos o ERP central.
 */
export async function deleteClientInFirestore(clientId: string | number, complexId?: string): Promise<void> {
  const strId = String(clientId || '').trim();
  if (!strId || strId === '0' || strId.startsWith('derived_')) return;

  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const aliases = getComplexAliasIds(targetId);

  try {
    const uRef = doc(db, USERS_COLLECTION, strId);
    await updateDoc(uRef, {
      hiddenForComplexIds: arrayUnion(...aliases),
      associatedComplexIds: arrayRemove(...aliases),
      updatedAt: new Date().toISOString()
    });
    console.log(`[Firestore] Cliente ${strId} ocultado para sede ${targetId} de forma no destructiva`);
  } catch (e: any) {
    if (e?.code === 'not-found') {
      return;
    }
    console.error('[Firestore] Error ocultando cliente de sede:', e);
    throw e;
  }
}

// -------------------------------------------------------------
// Aliases para máxima compatibilidad con código existente
// -------------------------------------------------------------
export const syncTurnoToFirestore = (data: any, complexId?: string) => {
  const cId = complexId || getActiveComplexId();
  if (data.id && typeof data.id === 'string' && data.id.length > 5) {
    return updateBookingInFirestore(data.id, { ...data, complejoId: cId });
  }
  return createBookingInFirestore({ ...data, complejoId: cId });
};

export const updateTurnoStatusInFirestore = (id: string | number, status: string) => {
  return updateBookingInFirestore(id, { status });
};

export const syncCourtToFirestore = (court: Partial<Court>, complexId?: string) => {
  return saveCourtInFirestore(complexId || getActiveComplexId(), court);
};

export const deleteCourtFromFirestore = (courtId: string | number, complexId?: string) => {
  return deleteCourtInFirestore(courtId, complexId || getActiveComplexId());
};

export const syncUsuarioToFirestore = (user: Partial<User>, complexId?: string) => {
  return saveClientInFirestore(complexId || getActiveComplexId(), user);
};

export const deleteUsuarioFromFirestore = (userId: string | number, complexId?: string) => {
  return deleteClientInFirestore(userId, complexId || getActiveComplexId());
};

export const syncComplejoToFirestore = (profile: any, complexId?: string) => {
  return saveVenueProfileInFirestore(complexId || getActiveComplexId(), profile);
};

export const listenToFirestoreUsuarios = (cb: (users: User[]) => void, complexId?: string) => {
  return subscribeToClients(complexId || getActiveComplexId(), cb);
};

export const listenToFirestoreCourts = (cb: (courts: Court[]) => void, complexId?: string) => {
  return subscribeToCourts(complexId || getActiveComplexId(), cb);
};

// ============================================================================
// DIRECTIVA MAESTRA POS, INVENTARIO Y FINANZAS
// ============================================================================

export const DEFAULT_INVENTORY_CATEGORIES: string[] = [];

/**
 * Escucha las categorías de mostrador desde complejos/{complejoId}.inventoryCategories
 * 100% configurable por el dueño, comienza vacío.
 */
export function subscribeToInventoryCategories(
  complexId: string,
  cb: (categories: string[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return subscribeToComplejoDoc(targetId, ({ exists, data }) => {
    if (exists && data && Array.isArray(data.inventoryCategories)) {
      cb(data.inventoryCategories);
      return;
    }
    cb([]);
  });
}

/**
 * Guarda el array de categorías en complejos/{complejoId}
 */
export async function saveInventoryCategories(
  complexId: string,
  categories: string[]
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  await updateDoc(compRef, {
    inventoryCategories: categories
  });
}

/**
 * Escucha los productos del complejo activo.
 * Cero productos predeterminados, comienza 100% vacío.
 */
export const DEFAULT_EXPENSE_RUBROS: string[] = [
  'Servicios',
  'Mantenimiento',
  'Proveedores',
  'Sueldos y Personal',
  'Limpieza',
  'Impuestos y Tasas',
  'Insumos y Mostrador',
  'Otros'
];

const seededComplexesTracker = new Set<string>();

/**
 * Siembra los rubros de egreso iniciales en /categories con catalogType: 'expense'
 * como documentos reales para que tengan un ID válido y persistan en Firestore.
 */
export async function seedDefaultExpenseCategoriesInFirestore(complexId: string): Promise<ProductCategory[]> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const batch = writeBatch(db);
  const defaults: ProductCategory[] = [];

  for (const rubro of DEFAULT_EXPENSE_RUBROS) {
    const rubroSlug = rubro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
    const catId = `exp_rubro_${targetId}_${rubroSlug}`;
    const catDocRef = doc(db, CATEGORIES_COLLECTION, catId);
    batch.set(catDocRef, {
      complejoId: targetId,
      complexId: targetId,
      name: rubro,
      description: `Rubro de egresos: ${rubro}`,
      catalogType: 'expense',
      status: 'activo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    defaults.push({
      id: catId,
      complejoId: targetId,
      name: rubro,
      description: '',
      catalogType: 'expense',
      status: 'activo'
    });
  }

  try {
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    batch.set(counterRef, {
      expenseCategoriesInitialized: true,
      complexId: targetId,
      complejoId: targetId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    // Si complex_counters no está accesible, no bloquea las categorías
  }

  await batch.commit();
  return defaults;
}

/**
 * Escucha los rubros de gastos configurados en /categories con catalogType: 'expense'.
 * Si el complejo no tiene rubros creados, los siembra automáticamente en Firestore como documentos reales.
 */
const sharedSubscribeExpenseCategories = createSharedSubscription<ProductCategory[]>((targetId, emit) => {
  const colRef = collection(db, CATEGORIES_COLLECTION);
  const q = query(
    colRef,
    where('complejoId', '==', targetId),
    where('catalogType', '==', 'expense')
  );

  let isSeeding = false;

  return onSnapshot(q, async (snap) => {
    const list: ProductCategory[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.catalogType === 'expense') {
        list.push({
          id: d.id,
          complejoId: data.complejoId || targetId,
          name: data.name || '',
          description: data.description || '',
          catalogType: 'expense',
          status: data.status === 'inactivo' ? 'inactivo' : 'activo',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      }
    });

    const isSeededLocally = typeof window !== 'undefined' && localStorage.getItem(`jogo_expense_rubros_seeded_${targetId}`) === 'true';

    if (list.length === 0 && !isSeeding && !seededComplexesTracker.has(targetId) && !isSeededLocally) {
      seededComplexesTracker.add(targetId);
      const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
      try {
        const counterSnap = await getDoc(counterRef);
        const alreadyInit = counterSnap.exists() && counterSnap.data()?.expenseCategoriesInitialized;
        if (!alreadyInit) {
          isSeeding = true;
          const defaults = await seedDefaultExpenseCategoriesInFirestore(targetId);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`jogo_expense_rubros_seeded_${targetId}`, 'true');
          }
          emit(defaults);
          return;
        }
      } catch (seedErr) {
        console.warn('[Firestore] Error comprobando/sembrando rubros de gastos:', seedErr);
        if (!isSeededLocally) {
          try {
            isSeeding = true;
            const defaults = await seedDefaultExpenseCategoriesInFirestore(targetId);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`jogo_expense_rubros_seeded_${targetId}`, 'true');
            }
            emit(defaults);
            return;
          } catch (e) {
            console.warn('[Firestore] Fallo al sembrar rubros directamente:', e);
          }
        }
      } finally {
        isSeeding = false;
      }
    }

    emit(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando rubros de gastos:', err);
    emit([]);
  });
});

export function subscribeToExpenseCategories(
  complexId: string,
  cb: (categories: ProductCategory[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeExpenseCategories(targetId, cb);
}

/**
 * Crea o edita un rubro de gastos en /categories.
 * Si se modifica el nombre del rubro, migra en cascada los conceptos asociados.
 */
export async function saveExpenseCategoryInFirestore(
  complexId: string,
  category: { id?: string; name: string; oldName?: string; status?: 'activo' | 'inactivo'; description?: string }
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const newName = category.name.trim();
  const catId = category.id?.trim() || `exp_rubro_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const catRef = doc(db, CATEGORIES_COLLECTION, catId);

  await setDoc(catRef, {
    complejoId: targetId,
    complexId: targetId,
    name: newName,
    description: category.description || '',
    catalogType: 'expense',
    status: category.status || 'activo',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });

  // Marcar flag de inicialización en el contador del complejo de forma autorizada
  try {
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    await setDoc(counterRef, { expenseCategoriesInitialized: true, complexId: targetId, complejoId: targetId }, { merge: true });
  } catch (e) {
    // ignorar
  }

  // Si se modificó el nombre de la categoría, actualizar los conceptos que apuntaban al nombre anterior
  const previousName = category.oldName?.trim();
  if (previousName && previousName !== newName) {
    try {
      const q = query(
        collection(db, PRODUCTS_COLLECTION),
        where('complejoId', '==', targetId),
        where('catalogType', '==', 'expense')
      );
      const itemsSnap = await getDocs(q);
      if (!itemsSnap.empty) {
        const batch = writeBatch(db);
        let count = 0;
        itemsSnap.forEach(d => {
          const itData = d.data();
          if (itData.categoryId === previousName || itData.categoryName === previousName || itData.categoryId === catId) {
            batch.update(d.ref, {
              categoryId: newName,
              categoryName: newName,
              updatedAt: serverTimestamp()
            });
            count++;
          }
        });
        if (count > 0) {
          await batch.commit();
        }
      }
    } catch (migErr) {
      console.warn('[Firestore] Error migrando conceptos asociados al renombrar categoría:', migErr);
    }
  }

  return catId;
}

/**
 * Da de baja de forma segura una categoría de gastos o la elimina físicamente si es seguro.
 */
export async function deleteExpenseCategoryInFirestore(
  categoryId: string,
  complexId: string,
  hardDelete: boolean = true
): Promise<{ deleted: boolean; status: 'deleted' | 'inactivo' }> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const catRef = doc(db, CATEGORIES_COLLECTION, categoryId);

  // Asegurar que no se vuelva a auto-sembrar si el usuario elimina un rubro
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`jogo_expense_rubros_seeded_${targetId}`, 'true');
    }
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    setDoc(counterRef, { expenseCategoriesInitialized: true, complexId: targetId, complejoId: targetId }, { merge: true }).catch(() => {});
  } catch (e) {}

  try {
    await deleteDoc(catRef);
    return { deleted: true, status: 'deleted' };
  } catch (err: any) {
    console.warn('[Firestore] Error eliminando rubro directamente, aplicando baja lógica:', err);
    try {
      await updateDoc(catRef, {
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
      return { deleted: true, status: 'inactivo' };
    } catch (updateErr) {
      console.error('[Firestore] Error al actualizar estado inactivo de rubro:', updateErr);
      throw updateErr;
    }
  }
}

/**
 * Activa o desactiva una categoría de gastos
 */
export async function toggleExpenseCategoryStatus(
  categoryId: string,
  status: 'activo' | 'inactivo'
): Promise<void> {
  const catRef = doc(db, CATEGORIES_COLLECTION, categoryId);
  await updateDoc(catRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

/**
 * Escucha los ítems o conceptos de gasto configurados en /products con catalogType: 'expense'
 */
const sharedSubscribeExpenseItems = createSharedSubscription<Product[]>((targetId, emit) => {
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const q = query(
    colRef,
    where('complejoId', '==', targetId),
    where('catalogType', '==', 'expense')
  );

  return onSnapshot(q, (snap) => {
    const list: Product[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        complejoId: data.complejoId || targetId,
        name: data.name || 'Sin nombre',
        categoryId: data.categoryId || '',
        categoryName: data.categoryName || data.categoryId || '',
        purchasePrice: Number(data.price || data.purchasePrice || 0),
        salePrice: Number(data.price || data.salePrice || 0),
        stock: 0,
        status: data.status === 'inactivo' ? 'inactivo' : 'activo',
        catalogType: 'expense',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });
    emit(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando ítems de gastos:', err);
    emit([]);
  });
});

export function subscribeToExpenseItems(
  complexId: string,
  cb: (items: Product[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeExpenseItems(targetId, cb);
}

/**
 * Guarda o edita un ítem/concepto de gasto en /products
 */
export async function saveExpenseItemInFirestore(
  complexId: string,
  item: { 
    id?: string; 
    name: string; 
    categoryId: string; 
    categoryName?: string;
    price: number; 
    status?: 'activo' | 'inactivo';
    isSupplier?: boolean;
  }
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const itemId = item.id || `exp_item_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const itemRef = doc(db, PRODUCTS_COLLECTION, itemId);

  const cleanCategory = item.categoryId.trim();
  const cleanName = item.name.trim();

  await setDoc(itemRef, {
    complejoId: targetId,
    complexId: targetId,
    name: cleanName,
    categoryId: cleanCategory,
    categoryName: (item.categoryName || cleanCategory).trim(),
    price: Number(item.price || 0),
    salePrice: Number(item.price || 0),
    purchasePrice: Number(item.price || 0),
    stock: 0,
    catalogType: 'expense',
    status: item.status || 'activo',
    isSupplier: Boolean(item.isSupplier),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });

  return itemId;
}

/**
 * Da de baja o elimina un ítem/concepto de gasto
 */
export async function deleteExpenseItemInFirestore(
  itemId: string,
  complexId: string,
  hardDelete: boolean = true
): Promise<{ deleted: boolean; status: 'deleted' | 'inactivo' }> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const itemRef = doc(db, PRODUCTS_COLLECTION, itemId);
  
  try {
    await deleteDoc(itemRef);
    return { deleted: true, status: 'deleted' };
  } catch (err: any) {
    console.warn('[Firestore] Error eliminando concepto directamente, aplicando baja lógica:', err);
    try {
      await updateDoc(itemRef, {
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
      return { deleted: true, status: 'inactivo' };
    } catch (updateErr) {
      console.error('[Firestore] Error al actualizar estado inactivo de concepto:', updateErr);
      throw updateErr;
    }
  }
}

/**
 * Alterna el estado activo / inactivo de un concepto de gasto
 */
export async function toggleExpenseItemStatus(
  itemId: string,
  status: 'activo' | 'inactivo'
): Promise<void> {
  const itemRef = doc(db, PRODUCTS_COLLECTION, itemId);
  await updateDoc(itemRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

/**
 * Escucha en tiempo real las entidades de gastos del complejo dentro de /categories con catalogType: 'entity'
 */
const sharedSubscribeExpenseEntities = createSharedSubscription<ExpenseEntity[]>((targetId, emit) => {
  const colRef = collection(db, CATEGORIES_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snapshot) => {
    const list: ExpenseEntity[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data.catalogType === 'entity') {
        list.push({
          id: d.id,
          complejoId: data.complejoId || targetId,
          complexId: data.complexId || targetId,
          name: data.name || '',
          type: (data.type as ExpenseEntityType) || 'Otro',
          location: data.location || '',
          cuit: data.cuit || '',
          phone: data.phone || '',
          email: data.email || '',
          notes: data.notes || '',
          status: (data.status as 'activo' | 'inactivo') || 'activo',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      }
    });

    list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    emit(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando expense entities:', err);
    emit([]);
  });
});

export function subscribeToExpenseEntities(
  complexId: string,
  cb: (entities: ExpenseEntity[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeExpenseEntities(targetId, cb);
}

/**
 * Guarda o actualiza una entidad de gastos en Firestore (/categories con catalogType: 'entity')
 */
export async function saveExpenseEntityInFirestore(
  complexId: string,
  entity: Partial<ExpenseEntity> & { name: string; type: ExpenseEntityType }
): Promise<ExpenseEntity> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const cleanName = (entity.name || '').trim();
  if (!cleanName) {
    throw new Error('El nombre de la entidad es obligatorio.');
  }

  // Normalizar nombre para prevención de duplicados (minúsculas, sin tildes ni caracteres extra)
  const normalize = (str: string) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
  const normalizedName = normalize(cleanName);

  const cleanCuit = (entity.cuit || '').replace(/\D/g, '');

  // Chequeo de duplicados en la colección categories con catalogType === 'entity'
  const colRef = collection(db, CATEGORIES_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    if (entity.id && d.id === entity.id) continue;
    const data = d.data();
    if (data.catalogType !== 'entity') continue;

    // Verificar nombre
    if (data.name && normalize(data.name) === normalizedName) {
      throw new Error(`Ya existe una entidad registrada con el nombre "${cleanName}".`);
    }

    // Verificar CUIT si fue provisto
    if (cleanCuit.length >= 8 && data.cuit) {
      const existingCuit = String(data.cuit).replace(/\D/g, '');
      if (existingCuit === cleanCuit) {
        throw new Error(`Ya existe una entidad ("${data.name}") con el mismo CUIT/CUIL (${entity.cuit}).`);
      }
    }
  }

  const isNew = !entity.id;
  const entityId = entity.id || `ent_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const entityRef = doc(colRef, entityId);

  const payload: any = {
    complejoId: targetId,
    complexId: targetId,
    catalogType: 'entity',
    name: cleanName,
    type: entity.type,
    location: entity.location?.trim() || '',
    cuit: entity.cuit?.trim() || '',
    phone: entity.phone?.trim() || '',
    email: entity.email?.trim() || '',
    notes: entity.notes?.trim() || '',
    status: entity.status || 'activo',
    updatedAt: serverTimestamp()
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(entityRef, payload, { merge: true });

  return {
    id: entityId,
    complejoId: targetId,
    complexId: targetId,
    name: cleanName,
    type: entity.type,
    location: payload.location,
    cuit: payload.cuit,
    phone: payload.phone,
    email: payload.email,
    notes: payload.notes,
    status: payload.status as 'activo' | 'inactivo',
    createdAt: isNew ? new Date().toISOString() : entity.createdAt,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Alterna el estado activo / inactivo de una entidad de gasto
 */
export async function toggleExpenseEntityStatus(
  entityId: string,
  currentStatus: 'activo' | 'inactivo'
): Promise<'activo' | 'inactivo'> {
  const nextStatus: 'activo' | 'inactivo' = currentStatus === 'activo' ? 'inactivo' : 'activo';
  const ref = doc(db, CATEGORIES_COLLECTION, entityId);
  await updateDoc(ref, {
    status: nextStatus,
    updatedAt: serverTimestamp()
  });
  return nextStatus;
}

/**
 * Elimina una entidad de gasto
 */
export async function deleteExpenseEntityInFirestore(
  entityId: string
): Promise<void> {
  const ref = doc(db, CATEGORIES_COLLECTION, entityId);
  await deleteDoc(ref);
}

/**
 * Busca o crea un concepto de proveedor persistente dentro de /products con catalogType: 'expense'
 */
export async function saveSupplierConceptInFirestore(
  complexId: string,
  supplier: {
    name: string;
    categoryName?: string;
    price?: number;
  }
): Promise<Product> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const cleanName = supplier.name.trim();
  const categoryName = (supplier.categoryName || 'Proveedores').trim();
  
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const q = query(
    colRef,
    where('complejoId', '==', targetId),
    where('catalogType', '==', 'expense')
  );
  const snap = await getDocs(q);
  const normNew = cleanName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  let existing: Product | null = null;
  snap.forEach(d => {
    const data = d.data();
    const normCur = (data.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (normCur === normNew) {
      existing = {
        id: d.id,
        complejoId: data.complejoId || targetId,
        name: data.name,
        categoryId: data.categoryId || categoryName,
        categoryName: data.categoryName || categoryName,
        purchasePrice: Number(data.price || data.purchasePrice || 0),
        salePrice: Number(data.price || data.salePrice || 0),
        stock: 0,
        status: data.status || 'activo',
        catalogType: 'expense'
      };
    }
  });

  if (existing) {
    return existing;
  }

  // Asegurar la categoría si no existe aún
  const catSlug = categoryName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
  const catRef = doc(db, CATEGORIES_COLLECTION, `exp_cat_${targetId}_${catSlug}`);
  await setDoc(catRef, {
    complejoId: targetId,
    complexId: targetId,
    name: categoryName,
    catalogType: 'expense',
    status: 'activo',
    updatedAt: serverTimestamp()
  }, { merge: true });

  const itemId = `exp_supplier_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const itemRef = doc(db, PRODUCTS_COLLECTION, itemId);
  const newProduct: Product = {
    id: itemId,
    complejoId: targetId,
    name: cleanName,
    categoryId: categoryName,
    categoryName: categoryName,
    purchasePrice: Number(supplier.price || 0),
    salePrice: Number(supplier.price || 0),
    stock: 0,
    status: 'activo',
    catalogType: 'expense'
  };

  await setDoc(itemRef, {
    complejoId: targetId,
    complexId: targetId,
    name: cleanName,
    categoryId: categoryName,
    categoryName: categoryName,
    price: Number(supplier.price || 0),
    purchasePrice: Number(supplier.price || 0),
    salePrice: Number(supplier.price || 0),
    stock: 0,
    catalogType: 'expense',
    status: 'activo',
    isSupplier: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return newProduct;
}

/**
 * Registra un gasto operativo del complejo de manera atómica con los 4 métodos de pago unificados:
 * Efectivo, Transferencia, Crédito y Pendiente.
 * Genera egresos exclusivamente en /financial_movements por los importes efectivamente pagados,
 * registra la operación en /operations con operationType: 'expense', e imputa la deuda pendiente.
 */
export async function executeExpenseOperation(params: {
  complexId: string;
  category: string;
  categoryId?: string;
  concept: string;
  conceptId?: string;
  supplierId?: string;
  supplierName?: string;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  amount: number;
  payments: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    notes?: string;
  }>;
  operatorId: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  operationId: string;
  ticketCode: string;
  totalExpense: number;
  totalPaid: number;
  amountPending: number;
  paymentStatus: OperationPaymentStatus;
}> {
  const targetId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const amount = Number(params.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('El importe del gasto debe ser un número mayor a 0.');
  }

  const rawPayments = Array.isArray(params.payments) ? params.payments : [];
  const validPayments = rawPayments
    .map(p => ({
      amount: Math.max(0, Number(p.amount || 0)),
      paymentMethod: normalizeMonetaryPaymentMethod(p.paymentMethod || (p as any).method),
      notes: p.notes
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null
    );
  const totalPaid = validPayments.reduce((s, p) => s + Number(p.amount), 0);

  if (totalPaid > amount + 0.01) {
    throw new Error(`El pago inicial ($${totalPaid.toLocaleString()}) no puede superar el importe del gasto ($${amount.toLocaleString()}).`);
  }

  const amountPending = Math.max(0, amount - totalPaid);
  const paymentStatus: OperationPaymentStatus = 
    totalPaid >= amount && amount > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');

  const idemKey = params.idempotencyKey || `exp_op_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);

  const cleanConcept = (params.concept || '').trim() || params.category.trim();
  const cleanSupplier = (params.entityName || params.supplierName || cleanConcept || 'Proveedor').trim();
  const cleanCategory = (params.category || 'Gastos Generales').trim();

  return await runTransaction(db, async (t) => {
    // 1. Lecturas previas (idempotencia + correlativo secuencial con prefijo 'E')
    const existingIdemSnap = await t.get(idemRef);
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    const counterSnap = await t.get(counterRef);

    if (existingIdemSnap.exists()) {
      const idemData = existingIdemSnap.data() as IdempotencyRecord;
      if (idemData.status === 'completed' && idemData.operationId) {
        return {
          success: true,
          operationId: idemData.operationId,
          ticketCode: idemData.ticketCode || 'E-0000',
          totalExpense: amount,
          totalPaid,
          amountPending,
          paymentStatus
        };
      }
      if (idemData.status === 'processing') {
        throw new Error('Gasto en proceso por otra solicitud concurrente.');
      }
    }

    const counterData = counterSnap.exists() ? counterSnap.data() : {};
    const seqKey = 'expense_sequence';
    const currentSeq = Number(counterData[seqKey] || 0);
    const nextSeq = currentSeq + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const ticketCode = formatTicketCode('E', currentYear, nextSeq);

    const operationId = generateUUID();

    // 2. Crear documento de Operación en /operations con operationType: 'expense'
    const opRef = doc(db, OPERATIONS_COLLECTION, operationId);
    const opDocData: OperationDocument = {
      id: operationId,
      complexId: targetId,
      complejoId: targetId,
      ticketCode,
      operationType: 'expense',
      responsibleType: 'supplier',
      supplierId: params.supplierId || params.conceptId || null,
      supplierName: cleanSupplier,
      userName: cleanSupplier,
      clientName: cleanSupplier,
      expenseCategoryId: params.categoryId || null,
      expenseCategoryName: cleanCategory,
      expenseConceptId: params.conceptId || null,
      expenseConceptName: cleanConcept,
      entityId: params.entityId || null,
      entityName: params.entityName || null,
      entityType: params.entityType || null,
      contractualAmount: amount,
      totalCollected: totalPaid,
      totalRefunded: 0,
      netCollected: totalPaid,
      retainedAmount: 0,
      amountPending,
      paymentStatus,
      currentAccountAssigned: false,
      currentAccountDebtAmount: 0,
      idempotencyKey: idemKey,
      idempotencyKeys: [idemKey],
      items: [{
        id: params.conceptId || operationId,
        name: cleanConcept,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount
      }],
      notes: params.notes || `Gasto: ${cleanConcept} (${cleanCategory})`,
      metadata: {
        category: cleanCategory,
        categoryId: params.categoryId || null,
        concept: cleanConcept,
        conceptId: params.conceptId || null,
        supplierId: params.supplierId || null,
        supplierName: cleanSupplier,
        entityId: params.entityId || null,
        entityName: params.entityName || null,
        entityType: params.entityType || null,
        isExpense: true
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.operatorId || 'administrador'
    };
    t.set(opRef, opDocData);

    // 3. Actualizar contador secuencial
    t.set(counterRef, {
      [seqKey]: nextSeq,
      complexId: targetId,
      complejoId: targetId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 4. Crear movimiento financiero único en /financial_movements por los pagos efectivamente desembolsados
    const builtExpenseMov = buildSingleMovementPayload({
      payments: validPayments,
      complexId: targetId,
      operationId,
      ticketCode,
      flow: 'expense',
      category: 'expense_payment',
      responsibleName: cleanSupplier,
      operatorId: params.operatorId,
      notes: params.notes || `Pago gasto: ${cleanConcept}`,
      idempotencyKey: idemKey,
      expenseCategoryId: params.categoryId || null,
      expenseCategoryName: cleanCategory,
      expenseConceptId: params.conceptId || null,
      expenseConceptName: cleanConcept,
      entityId: params.entityId || null,
      entityName: params.entityName || null,
      entityType: params.entityType || null
    });

    if (builtExpenseMov) {
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtExpenseMov.movId);
      t.set(movRef, builtExpenseMov.movDocData);
    }

    // 5. Clave de idempotencia única por acto de pago/operación
    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetId,
      complejoId: targetId,
      operationId,
      ticketCode,
      amount,
      paymentMethod: builtExpenseMov?.paymentMethod || 'other',
      flow: 'expense',
      status: 'completed',
      movementId: builtExpenseMov?.movId || null,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    return {
      success: true,
      operationId,
      ticketCode,
      totalExpense: amount,
      totalPaid,
      amountPending,
      paymentStatus
    };
  });
}


/**
 * Escucha los productos de venta del complejo activo.
 * Ignora ítems con catalogType: 'expense'.
 */
const sharedSubscribeProducts = createSharedSubscription<Product[]>((targetId, emit) => {
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snap) => {
    const list: Product[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.catalogType === 'expense') return;

      const rawBatches = Array.isArray(data.batches) ? data.batches : [];
      list.push({
        id: d.id,
        complejoId: data.complejoId || targetId,
        name: data.name || 'Sin nombre',
        categoryId: data.categoryId || '',
        categoryName: data.categoryName || data.categoryId || '',
        purchasePrice: Number(data.purchasePrice || 0),
        salePrice: Number(data.salePrice || 0),
        stock: Number(data.stock || 0),
        status: data.status === 'inactivo' ? 'inactivo' : 'activo',
        catalogType: 'sale',
        batches: rawBatches,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });

    emit(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando productos:', err);
    emit([]);
  });
});

export function subscribeToProducts(
  complexId: string,
  cb: (products: Product[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeProducts(targetId, cb);
}

/**
 * Guarda o actualiza un producto en Firestore.
 * Si es nuevo, registra el movimiento de Stock Inicial en inventory_movements e inicializa tanda.
 * Si se modifican unidades manualmente, ajusta las tandas determinísticamente sin crear gastos.
 */
export async function saveProductInFirestore(
  complexId: string,
  product: Partial<Product>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const isNew = !product.id;
  const prodId = product.id || `prod_${Date.now()}`;
  const prodRef = doc(colRef, prodId);

  let existingData: any = null;
  if (!isNew) {
    const snap = await getDoc(prodRef);
    if (snap.exists()) {
      existingData = snap.data();
    }
  }

  const newStock = Number(product.stock !== undefined ? product.stock : (existingData?.stock || 0));
  const oldStock = existingData ? Number(existingData.stock || 0) : 0;
  const delta = newStock - oldStock;

  // Manejo de tandas PEPS
  let batches: ProductBatch[] = Array.isArray(product.batches)
    ? [...product.batches]
    : (existingData && Array.isArray(existingData.batches) ? [...existingData.batches] : []);

  if (isNew && newStock > 0 && batches.length === 0) {
    batches.push({
      id: generateUUID(),
      quantity: newStock,
      initialQuantity: newStock,
      unitCost: Number(product.purchasePrice || 0),
      purchasePlace: 'Inventario inicial',
      createdAt: new Date().toISOString()
    });
  } else if (!isNew && delta !== 0 && !product.batches) {
    // Ajuste manual de stock desde formulario de datos:
    // Mantener la suma de tandas igual al nuevo stock
    if (batches.length === 0 && oldStock > 0) {
      batches.push({
        id: `batch_compat_${prodId.slice(0, 8)}`,
        quantity: oldStock,
        initialQuantity: oldStock,
        unitCost: Number(existingData?.purchasePrice || product.purchasePrice || 0),
        purchasePlace: 'Inventario inicial',
        createdAt: existingData?.createdAt || new Date().toISOString()
      });
    }

    if (delta > 0) {
      batches.push({
        id: generateUUID(),
        quantity: delta,
        initialQuantity: delta,
        unitCost: Number(product.purchasePrice || existingData?.purchasePrice || 0),
        purchasePlace: 'Ajuste manual',
        createdAt: new Date().toISOString()
      });
    } else {
      let toReduce = Math.abs(delta);
      batches.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      for (const b of batches) {
        if (toReduce <= 0) break;
        if (b.quantity <= 0) continue;
        const take = Math.min(b.quantity, toReduce);
        b.quantity -= take;
        toReduce -= take;
      }
    }
  }

  const payload: any = {
    complejoId: targetId,
    name: (product.name || existingData?.name || '').trim(),
    categoryId: (product.categoryId || existingData?.categoryId || '').trim(),
    categoryName: (product.categoryName || product.categoryId || existingData?.categoryId || '').trim(),
    purchasePrice: Number(product.purchasePrice !== undefined ? product.purchasePrice : (existingData?.purchasePrice || 0)),
    salePrice: Number(product.salePrice !== undefined ? product.salePrice : (existingData?.salePrice || 0)),
    stock: newStock,
    status: product.status || existingData?.status || 'activo',
    catalogType: product.catalogType || existingData?.catalogType || 'sale',
    batches,
    updatedAt: serverTimestamp()
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(prodRef, payload, { merge: true });

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (isNew && payload.stock > 0) {
    try {
      const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
      await setDoc(movRef, {
        productId: prodId,
        complejoId: targetId,
        complexId: targetId,
        type: 'initial',
        typeLabel: 'Stock inicial',
        quantity: Number(payload.stock),
        resultingStock: Number(payload.stock),
        date: dateStr,
        time: hoursStr,
        actorName: 'Administrador',
        notes: 'Carga inicial de producto',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('[Inventory] Error registrando stock inicial:', e);
    }
  } else if (!isNew && delta !== 0) {
    try {
      const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
      await setDoc(movRef, {
        productId: prodId,
        complejoId: targetId,
        complexId: targetId,
        type: 'adjustment',
        typeLabel: 'Ajuste manual',
        quantity: delta,
        resultingStock: newStock,
        date: dateStr,
        time: hoursStr,
        actorName: 'Administrador',
        notes: 'Ajuste manual de inventario',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('[Inventory] Error registrando ajuste manual:', e);
    }
  }

  return prodId;
}

/**
 * Escucha el historial de movimientos de inventario de un producto
 */
export function subscribeToProductMovements(
  productId: string,
  cb: (movements: InventoryMovement[]) => void
): () => void {
  if (!productId) {
    cb([]);
    return () => {};
  }
  const colRef = collection(db, INVENTORY_MOVEMENTS_COLLECTION);
  const q = query(colRef, where('productId', '==', productId));

  return onSnapshot(q, (snap) => {
    const list: InventoryMovement[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        productId: data.productId,
        complejoId: data.complejoId,
        type: data.type || 'adjustment',
        typeLabel: data.typeLabel || 'Ajuste manual',
        quantity: Number(data.quantity || 0),
        resultingStock: Number(data.resultingStock || 0),
        date: data.date || '',
        time: data.time || '',
        actorName: data.actorName || 'Administrador',
        notes: data.notes || '',
        operationId: data.operationId,
        createdAt: data.createdAt
      });
    });

    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });

    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando movimientos:', err);
    cb([]);
  });
}

/**
 * Ajusta el stock de un producto manualmente y actualiza las tandas determinísticamente
 */
export async function adjustProductStockInFirestore(params: {
  complexId: string;
  productId: string;
  delta: number; // positivo (+X) o negativo (-X)
  type: 'restock' | 'adjustment' | string;
  typeLabel: string; // 'Reposición de stock' | 'Ajuste manual'
  notes?: string;
  actorName?: string;
}): Promise<number> {
  const targetId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const prodRef = doc(db, PRODUCTS_COLLECTION, params.productId);
  const snap = await getDoc(prodRef);
  if (!snap.exists()) {
    throw new Error('Producto no encontrado');
  }

  const prodData = snap.data();
  const currentStock = Number(prodData.stock || 0);
  let newStock = Math.max(0, currentStock + params.delta);
  let batches: ProductBatch[] = Array.isArray(prodData.batches) ? [...prodData.batches] : [];

  if (params.delta < 0) {
    const fifoResult = consumeProductBatchesFifo(
      prodData,
      params.productId,
      Math.abs(params.delta)
    );
    newStock = fifoResult.newStock;
    batches = fifoResult.updatedBatches;
  } else {
    if (batches.length === 0 && currentStock > 0) {
      batches.push({
        id: `batch_compat_${params.productId.slice(0, 8)}`,
        quantity: currentStock,
        initialQuantity: currentStock,
        unitCost: Number(prodData.purchasePrice || 0),
        purchasePlace: 'Inventario inicial',
        createdAt: prodData.createdAt || new Date().toISOString()
      });
    }

    if (params.delta > 0) {
      batches.push({
        id: generateUUID(),
        quantity: params.delta,
        initialQuantity: params.delta,
        unitCost: Number(prodData.purchasePrice || 0),
        purchasePlace: 'Ajuste manual',
        createdAt: new Date().toISOString()
      });
    }
  }

  await updateDoc(prodRef, {
    stock: newStock,
    batches,
    updatedAt: serverTimestamp()
  });

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
  await setDoc(movRef, {
    productId: params.productId,
    complejoId: targetId,
    complexId: targetId,
    type: params.type,
    typeLabel: params.typeLabel,
    quantity: params.delta,
    resultingStock: newStock,
    date: dateStr,
    time: hoursStr,
    actorName: params.actorName || 'Administrador',
    notes: params.notes || '',
    createdAt: serverTimestamp()
  });

  return newStock;
}

/**
 * Registra una compra de mercadería de manera atómica, creando la tanda PEPS,
 * la operación de tipo expense, los movimientos financieros de pago y el movimiento de inventario.
 */
export async function registerMerchandisePurchaseInFirestore(params: {
  complexId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  purchasePlace: string;
  supplierId?: string;
  expenseCategoryId?: string;
  expenseCategoryName?: string;
  expenseConceptId?: string;
  expenseConceptName?: string;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  payments: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    idempotencyKey?: string;
    notes?: string;
  }>;
  operatorId: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  operationId: string;
  ticketCode: string;
  totalPurchase: number;
  totalPaid: number;
  amountPending: number;
  newStock: number;
  batches: ProductBatch[];
}> {
  const targetId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const qty = Math.floor(Number(params.quantity));
  if (isNaN(qty) || qty <= 0) {
    throw new Error('La cantidad comprada debe ser un número entero mayor a 0.');
  }
  const cost = Number(params.unitCost);
  if (isNaN(cost) || cost < 0) {
    throw new Error('El costo unitario debe ser mayor o igual a 0.');
  }

  const totalPurchase = qty * cost;
  const rawPayments = (Array.isArray(params.payments) ? params.payments : [])
    .map(p => ({
      amount: Math.max(0, Number(p.amount) || 0),
      paymentMethod: normalizeMonetaryPaymentMethod(p.paymentMethod || (p as any).method),
      idempotencyKey: p.idempotencyKey,
      notes: p.notes
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; idempotencyKey: string | undefined; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null
    );
  const totalPaid = rawPayments.reduce((s, p) => s + p.amount, 0);

  if (totalPaid > totalPurchase + 0.01) {
    throw new Error(`El pago inicial ($${totalPaid.toLocaleString()}) no puede superar el total de la compra ($${totalPurchase.toLocaleString()}).`);
  }

  const amountPending = Math.max(0, totalPurchase - totalPaid);
  const paymentStatus: OperationPaymentStatus = 
    totalPaid >= totalPurchase && totalPurchase > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');

  const idemKey = params.idempotencyKey || `purchase_${params.productId}_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);

  return await runTransaction(db, async (t) => {
    const prodRef = doc(db, PRODUCTS_COLLECTION, params.productId);
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);

    const [existingIdemSnap, prodSnap, counterSnap] = await Promise.all([
      t.get(idemRef),
      t.get(prodRef),
      t.get(counterRef)
    ]);

    if (existingIdemSnap.exists()) {
      const idemData = existingIdemSnap.data() as IdempotencyRecord;
      if (idemData.status === 'completed' && idemData.operationId) {
        const prodData = prodSnap.exists() ? prodSnap.data() : {};
        return {
          success: true,
          operationId: idemData.operationId,
          ticketCode: idemData.ticketCode || 'E-0000',
          totalPurchase,
          totalPaid,
          amountPending,
          newStock: Number(prodData.stock || 0),
          batches: Array.isArray(prodData.batches) ? prodData.batches : []
        };
      }
      if (idemData.status === 'processing') {
        throw new Error('Compra en proceso por otra solicitud concurrente.');
      }
    }

    if (!prodSnap.exists()) {
      throw new Error('Producto no encontrado para registrar la compra.');
    }

    const prodData = prodSnap.data();
    const currentStock = Number(prodData.stock || 0);
    const newStock = currentStock + qty;

    let currentBatches: ProductBatch[] = Array.isArray(prodData.batches) ? [...prodData.batches] : [];
    if (currentBatches.length === 0 && currentStock > 0) {
      currentBatches.push({
        id: `batch_init_${params.productId.slice(0, 8)}`,
        quantity: currentStock,
        initialQuantity: currentStock,
        unitCost: Number(prodData.purchasePrice || 0),
        purchasePlace: 'Inventario inicial',
        createdAt: prodData.createdAt || new Date().toISOString()
      });
    }

    const counterData = counterSnap.exists() ? counterSnap.data() : {};
    const seqKey = 'expense_sequence';
    const currentSeq = Number(counterData[seqKey] || 0);
    const nextSeq = currentSeq + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const ticketCode = formatTicketCode('E', currentYear, nextSeq);

    const operationId = generateUUID();
    const newBatchId = generateUUID();
    const cleanPurchasePlace = (params.expenseConceptName || params.purchasePlace || '').trim() || 'Proveedor';
    const cleanExpenseCategory = (params.expenseCategoryName || '').trim() || undefined;
    const cleanExpenseConceptId = params.expenseConceptId || params.supplierId || null;
    const cleanExpenseCategoryId = params.expenseCategoryId || null;
    const cleanEntityId = params.entityId || null;
    const cleanEntityName = params.entityName || null;
    const cleanEntityType = params.entityType || null;

    const newBatch: ProductBatch = {
      id: newBatchId,
      quantity: qty,
      initialQuantity: qty,
      unitCost: cost,
      purchasePlace: cleanPurchasePlace,
      operationId,
      expenseCategoryId: cleanExpenseCategoryId,
      expenseCategoryName: cleanExpenseCategory || null,
      expenseConceptId: cleanExpenseConceptId,
      expenseConceptName: cleanPurchasePlace,
      entityId: cleanEntityId,
      entityName: cleanEntityName,
      entityType: cleanEntityType as any,
      createdAt: new Date().toISOString()
    };
    currentBatches.push(newBatch);

    // 1. Crear documento de Operación en /operations
    const opRef = doc(db, OPERATIONS_COLLECTION, operationId);
    const opDocData: OperationDocument = {
      id: operationId,
      complexId: targetId,
      complejoId: targetId,
      ticketCode,
      operationType: 'purchase',
      responsibleType: 'supplier',
      supplierId: cleanExpenseConceptId,
      supplierName: cleanPurchasePlace,
      userName: cleanPurchasePlace,
      clientName: cleanPurchasePlace,
      expenseCategoryId: cleanExpenseCategoryId,
      expenseCategoryName: cleanExpenseCategory || null,
      expenseConceptId: cleanExpenseConceptId,
      expenseConceptName: cleanPurchasePlace,
      entityId: cleanEntityId,
      entityName: cleanEntityName,
      entityType: cleanEntityType as any,
      contractualAmount: totalPurchase,
      totalCollected: totalPaid,
      totalRefunded: 0,
      netCollected: totalPaid,
      retainedAmount: 0,
      amountPending,
      paymentStatus,
      currentAccountAssigned: false,
      currentAccountDebtAmount: 0,
      idempotencyKey: idemKey,
      idempotencyKeys: [idemKey],
      items: [{
        id: params.productId,
        name: prodData.name || 'Producto',
        quantity: qty,
        unitPrice: cost,
        subtotal: totalPurchase
      }],
      notes: params.notes || `Compra de mercadería · ${prodData.name} (${cleanPurchasePlace}${cleanExpenseCategory ? ` · ${cleanExpenseCategory}` : ''})`,
      metadata: {
        category: cleanExpenseCategory || 'Compra de Mercadería',
        expenseCategoryId: cleanExpenseCategoryId,
        expenseCategoryName: cleanExpenseCategory || null,
        expenseConceptId: cleanExpenseConceptId,
        expenseConceptName: cleanPurchasePlace,
        purchasePlace: cleanPurchasePlace,
        supplierId: cleanExpenseConceptId,
        supplierName: cleanPurchasePlace,
        entityId: cleanEntityId,
        entityName: cleanEntityName,
        entityType: cleanEntityType,
        productId: params.productId,
        productName: prodData.name,
        quantity: qty,
        unitCost: cost,
        batchId: newBatchId
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.operatorId || 'administrador'
    };
    t.set(opRef, opDocData);

    // 2. Actualizar contador secuencial
    t.set(counterRef, {
      [seqKey]: nextSeq,
      complexId: targetId,
      complejoId: targetId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 3. Actualizar /products (stock, precio de compra y tandas)
    t.update(prodRef, {
      stock: newStock,
      purchasePrice: cost,
      batches: currentBatches,
      updatedAt: serverTimestamp()
    });

    // 4. Registrar movimiento de entrada en /inventory_movements
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const invMovRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
    t.set(invMovRef, {
      productId: params.productId,
      complejoId: targetId,
      complexId: targetId,
      type: 'restock',
      typeLabel: 'Reposición de stock',
      quantity: qty,
      resultingStock: newStock,
      date: dateStr,
      time: hoursStr,
      actorName: 'Administrador',
      notes: `Compra de mercadería · ${cleanPurchasePlace}${cleanExpenseCategory ? ` (${cleanExpenseCategory})` : ''} · Ticket ${ticketCode}`,
      operationId,
      createdAt: serverTimestamp()
    });

    // 5. Crear movimiento financiero único en /financial_movements
    const builtPurchaseMov = buildSingleMovementPayload({
      payments: rawPayments,
      complexId: targetId,
      operationId,
      ticketCode,
      flow: 'expense',
      category: 'expense_payment',
      responsibleName: cleanPurchasePlace,
      operatorId: params.operatorId || 'administrador',
      notes: params.notes || `Pago compra mercadería · ${cleanPurchasePlace}${cleanExpenseCategory ? ` · ${cleanExpenseCategory}` : ''}`,
      idempotencyKey: idemKey,
      expenseCategoryId: cleanExpenseCategoryId,
      expenseCategoryName: cleanExpenseCategory || null,
      expenseConceptId: cleanExpenseConceptId,
      expenseConceptName: cleanPurchasePlace,
      entityId: cleanEntityId,
      entityName: cleanEntityName,
      entityType: cleanEntityType
    });

    if (builtPurchaseMov) {
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtPurchaseMov.movId);
      t.set(movRef, builtPurchaseMov.movDocData);
    }

    // 6. Idempotencia única de la compra
    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetId,
      complejoId: targetId,
      operationId,
      amount: totalPurchase,
      paymentMethod: builtPurchaseMov?.paymentMethod || 'other',
      flow: 'expense',
      status: 'completed',
      movementId: builtPurchaseMov?.movId || null,
      ticketCode,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    return {
      success: true,
      operationId,
      ticketCode,
      totalPurchase,
      totalPaid,
      amountPending,
      newStock,
      batches: currentBatches
    };
  });
}

/**
 * Elimina un producto. Si tiene ventas históricas, cambia su status a 'inactivo'
 * para preservar referencias e inmutabilidad histórica.
 */
export async function deleteProductInFirestore(
  productId: string,
  complexId: string
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    // Verificar si el producto tiene ventas históricas en transactions
    const qTx = query(collection(db, TRANSACTIONS_COLLECTION), where('complejoId', '==', targetId));
    const txSnap = await getDocs(qTx);
    let hasSales = false;
    for (const d of txSnap.docs) {
      const items = d.data().items;
      if (Array.isArray(items)) {
        if (items.some((it: any) => it.productId === productId)) {
          hasSales = true;
          break;
        }
      }
    }

    if (!hasSales) {
      const qOp = query(collection(db, OPERATIONS_COLLECTION), where('complexId', '==', targetId));
      const opSnap = await getDocs(qOp);
      for (const d of opSnap.docs) {
        const items = d.data().items;
        if (Array.isArray(items) && items.some((it: any) => it.productId === productId)) {
          hasSales = true;
          break;
        }
      }
    }

    const prodRef = doc(db, PRODUCTS_COLLECTION, productId);
    if (hasSales) {
      // Regla de Eliminación: cambiar status a 'inactivo'
      await updateDoc(prodRef, { 
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
    } else {
      // Sin ventas: borrado definitivo
      await deleteDoc(prodRef);
    }
  } catch (err) {
    console.warn('[Firestore] Error al eliminar producto, aplicando soft-delete:', err);
    try {
      await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), { 
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
    } catch (e2) {}
  }
}

/**
 * Impacta la transacción de venta del POS en Firestore:
 * 1. Crea documento en transactions con foto congelada de productos y desglose de pagos
/**
 * Impacta la transacción de venta del POS en Firestore.
 * Delegada al motor transaccional unificado (createOperationWithInitialPayment) para
 * garantizar que la venta se registre en /operations y /financial_movements sin
 * doble descuento de stock ni fallbacks silenciosos que generen escrituras parciales.
 */
export async function executePOSSale(sale: {
  complejoId: string;
  items: TransactionItem[];
  payments: TransactionPayment[];
  total: number;
  userId?: string | null;
  clientId?: string | null;
  userName?: string;
  clientName?: string;
  userPhone?: string;
  clientPhone?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<string> {
  const targetId = (!sale.complejoId || sale.complejoId === 'complejo_central') ? 'B' : sale.complejoId;
  const saleIdemKey = sale.idempotencyKey || `pos_sale_${Date.now()}_${generateUUID().slice(0, 8)}`;

  // Separar cobros efectivos de asignación a fiado (cuenta corriente)
  const cashPayments = sale.payments.filter(p => p.method !== 'fiado' && Number(p.amount) > 0);
  const fiadoPayment = sale.payments.find(p => p.method === 'fiado' && Number(p.amount) > 0);
  const fiadoAmount = fiadoPayment ? Number(fiadoPayment.amount || 0) : 0;

  const resolvedName = resolveClientName(sale);
  const resolvedPhone = resolveClientPhone(sale);
  const rawId = sale.userId || sale.clientId;
  const hasClient = Boolean(rawId && String(rawId).trim() !== '' && String(rawId) !== '0' && String(rawId) !== 'anon') || resolvedName !== 'NN';
  const effectiveId = (rawId && String(rawId).trim() !== '' && String(rawId) !== '0' && String(rawId) !== 'anon') ? String(rawId) : null;

  const result = await createOperationWithInitialPayment({
    complexId: targetId,
    operationType: 'pos_sale',
    contractualAmount: sale.total,
    operatorId: 'pos_operator',
    responsibleType: hasClient ? 'user' : 'anonymous',
    userId: effectiveId,
    clientId: effectiveId,
    userName: resolvedName,
    clientName: resolvedName,
    userPhone: resolvedPhone,
    clientPhone: resolvedPhone,
    notes: sale.notes || '',
    idempotencyKey: saleIdemKey,
    items: sale.items.map(it => ({
      productId: it.productId,
      name: it.name,
      quantity: Number(it.quantity || 1),
      unitPrice: Number(it.unitPrice || 0),
      subtotal: Number(it.subtotal || (Number(it.quantity || 1) * Number(it.unitPrice || 0)))
    })),
    initialPayments: cashPayments.map((p, idx) => ({
      amount: Number(p.amount),
      paymentMethod: (p.method === 'transferencia' ? 'transferencia' : (p.method === 'tarjeta' ? 'tarjeta' : 'efectivo')) as FinancialPaymentMethod,
      idempotencyKey: `${saleIdemKey}_pay_${idx}`,
      notes: `Cobro venta mostrador (${p.method})`
    })),
    assignToCurrentAccount: fiadoAmount > 0,
    customDebtAmount: fiadoAmount > 0 ? fiadoAmount : undefined
  });

  return result.ticketCode || result.operationId;
}

/**
 * Salda la deuda de un fiado en una transacción existente:
 * - Actualiza la transacción original cambiando su método de 'fiado' al nuevo método
 * - Cambia paymentStatus a 'paid'
 * - Resta el monto del campo debt del usuario en users/{userId}
 */
export async function settleFiadoTransaction(params: {
  transactionId: string;
  fiadoAmount: number;
  newMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  userId?: string;
}): Promise<void> {
  const txRef = doc(db, TRANSACTIONS_COLLECTION, params.transactionId);
  const snap = await getDoc(txRef);
  if (!snap.exists()) {
    throw new Error('Transacción no encontrada');
  }

  const txData = snap.data();
  const currentPayments: TransactionPayment[] = Array.isArray(txData.payments) ? txData.payments : [];

  let replaced = false;
  const updatedPayments = currentPayments.map(p => {
    if (p.method === 'fiado' && !replaced) {
      replaced = true;
      return {
        method: params.newMethod,
        amount: p.amount
      };
    }
    return p;
  });

  if (!replaced) {
    updatedPayments.push({
      method: params.newMethod,
      amount: params.fiadoAmount
    });
  }

  const stillHasFiado = updatedPayments.some(p => p.method === 'fiado' && p.amount > 0);

  await updateDoc(txRef, {
    payments: updatedPayments,
    paymentStatus: stillHasFiado ? 'fiado' : 'paid',
    settledAt: serverTimestamp()
  });

  // Restar de la deuda del cliente si pertenece a la sede de la transacción
  const targetUserId = params.userId || txData.userId;
  if (targetUserId && params.fiadoAmount > 0) {
    try {
      const userRef = doc(db, USERS_COLLECTION, String(targetUserId));
      await runTransaction(db, async (t) => {
        const userSnap = await t.get(userRef);
        if (!userSnap.exists()) return;
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        const txComplex = txData.complexId || txData.complejoId;
        if (!uOrigin || isSameComplex(uOrigin, txComplex)) {
          const currentDebt = Math.max(0, Number(uData?.debt || 0));
          t.update(userRef, {
            debt: Math.max(0, currentDebt - Number(params.fiadoAmount)),
            updatedAt: serverTimestamp()
          });
        }
      });
    } catch (err) {
      console.warn(`[Firestore] Error al restar deuda del usuario ${targetUserId}:`, err);
    }
  }
}

/**
 * Escucha las transacciones en tiempo real (/transactions),
 * fusionando queries por complexId y complejoId para garantizar cobertura total.
 */
const sharedSubscribeTransactions = createSharedSubscription<any[]>((targetId, emit) => {
  const colRef = collection(db, TRANSACTIONS_COLLECTION);
  const targetIds = (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];

  const maps = targetIds.flatMap(() => [new Map<string, any>(), new Map<string, any>()]);
  const unsubs: Array<() => void> = [];

  const emitMerged = () => {
    const merged = new Map<string, any>();
    maps.forEach(m => {
      m.forEach((val, key) => merged.set(key, val));
    });
    const list = Array.from(merged.values());
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });
    emit(list);
  };

  let mapIdx = 0;
  targetIds.forEach((tId) => {
    const idx1 = mapIdx++;
    const q1 = query(colRef, where('complexId', '==', tId));
    unsubs.push(
      onSnapshot(q1, (snap) => {
        maps[idx1].clear();
        snap.forEach((d) => maps[idx1].set(d.id, { id: d.id, ...d.data() }));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando transacciones (complexId: ${tId}):`, err);
      })
    );

    const idx2 = mapIdx++;
    const q2 = query(colRef, where('complejoId', '==', tId));
    unsubs.push(
      onSnapshot(q2, (snap) => {
        maps[idx2].clear();
        snap.forEach((d) => maps[idx2].set(d.id, { id: d.id, ...d.data() }));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando transacciones (complejoId: ${tId}):`, err);
      })
    );
  });

  return () => {
    unsubs.forEach(u => u());
  };
});

export function subscribeToTransactions(
  complexId: string,
  cb: (transactions: any[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeTransactions(targetId, cb);
}

// =========================================================================
// 3. MODELO FINANCIERO UNIFICADO TRANSACCIONAL (FASE 2 / ETAPA 2)
// =========================================================================

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSequenceConfig(operationType: OperationType): { prefix: 'T' | 'B' | 'G' | 'D'; seqKey: 'pos_sale_sequence' | 'court_booking_sequence' | 'expense_sequence' | 'historical_debt_sequence' } {
  switch (operationType) {
    case 'court_booking':
      return { prefix: 'B', seqKey: 'court_booking_sequence' };
    case 'expense':
      return { prefix: 'G', seqKey: 'expense_sequence' };
    case 'historical_debt_settlement':
      return { prefix: 'D', seqKey: 'historical_debt_sequence' };
    case 'pos_sale':
    default:
      return { prefix: 'T', seqKey: 'pos_sale_sequence' };
  }
}

/**
 * Crea una operación en Firestore de manera atómica con su cobro inicial optativo,
 * Crea una operación en Firestore de manera atómica con su cobro inicial optativo (simple o split),
 * control estricto de inventario (lecturas previas y descuento atómico), asignación de deuda a cuenta corriente
 * y numeración secuencial de tickets por complejo.
 * 
 * Regla de Oro: Todas las lecturas se ejecutan estrictamente antes de cualquier escritura.
 * Si el stock no alcanza o falla una validación, la transacción aborta sin escrituras parciales.
 */
export async function createOperationWithInitialPayment(
  params: CreateOperationParams
): Promise<OperationResult> {
  if (!params.complexId) {
    throw new Error('El ID de complejo (complexId) es obligatorio.');
  }

  const operationId = generateUUID();
  const opRef = doc(db, OPERATIONS_COLLECTION, operationId);
  const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, params.complexId);

  // Normalizar pagos iniciales (soporta pago único o split payments), excluyendo métodos no monetarios
  const rawPayments = (params.initialPayments && params.initialPayments.length > 0
    ? params.initialPayments
    : (params.initialPayment ? [params.initialPayment] : [])
  )
    .map(p => ({
      amount: Math.max(0, Number(p.amount || 0)),
      paymentMethod: normalizeMonetaryPaymentMethod((p as any).paymentMethod || (p as any).method),
      idempotencyKey: p.idempotencyKey
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; idempotencyKey: string } =>
      p.amount > 0 && p.paymentMethod !== null
    );

  const opIdemRef = params.idempotencyKey
    ? doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey)
    : null;

  const paymentIdemRefs = rawPayments
    .filter(p => Boolean(p.idempotencyKey))
    .map(p => ({ p, ref: doc(db, IDEMPOTENCY_COLLECTION, p.idempotencyKey) }));

  let resolvedParamUserId = (params.userId && String(params.userId).trim() !== '' && String(params.userId) !== '0')
    ? String(params.userId).trim()
    : '';
  if (!resolvedParamUserId || resolvedParamUserId.startsWith('derived_')) {
    const cachedMatch = findHiddenOrExistingClientInCache(params.complexId, {
      id: resolvedParamUserId,
      phone: params.userPhone,
      canonicalId: (params as any).canonicalId
    });
    if (cachedMatch?.id && !String(cachedMatch.id).startsWith('derived_')) {
      resolvedParamUserId = String(cachedMatch.id);
    }
  }
  const userRef = (resolvedParamUserId && !resolvedParamUserId.startsWith('derived_'))
    ? doc(db, USERS_COLLECTION, resolvedParamUserId)
    : null;
  const bookingRef = params.bookingId ? doc(db, BOOKINGS_COLLECTION, params.bookingId) : null;

  // Agrupar cantidades requeridas por producto para deduplicar lecturas de stock
  const productQuantities = new Map<string, number>();
  for (const it of (params.items || [])) {
    if (it.productId) {
      const qty = Number(it.quantity || 1);
      productQuantities.set(it.productId, (productQuantities.get(it.productId) || 0) + qty);
    }
  }

  return await runTransaction(db, async (t) => {
    // --- FASE 1: LECTURAS (TODAS ESTRICTAMENTE ANTES DE CUALQUIER ESCRITURA) ---
    const counterSnap = await t.get(counterRef);
    const opIdemSnap = opIdemRef ? await t.get(opIdemRef) : null;
    const paymentIdemSnaps = await Promise.all(paymentIdemRefs.map(item => t.get(item.ref)));
    const userSnap = userRef ? await t.get(userRef) : null;
    const bookingSnap = bookingRef ? await t.get(bookingRef) : null;

    // Lectura previa obligatoria del stock de todos los productos
    const productSnaps = new Map<string, { snap: any; ref: any; requestedQty: number }>();
    for (const [prodId, reqQty] of productQuantities.entries()) {
      const prodRef = doc(db, PRODUCTS_COLLECTION, prodId);
      const snap = await t.get(prodRef);
      productSnaps.set(prodId, { snap, ref: prodRef, requestedQty: reqQty });
    }

    // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
    // 2.1 Verificación de idempotencia a nivel operación
    if (opIdemSnap && opIdemSnap.exists()) {
      const existingOpIdem = opIdemSnap.data() as IdempotencyRecord;
      if (existingOpIdem.status === 'completed') {
        if (
          existingOpIdem.complexId === params.complexId &&
          Math.abs(Number(existingOpIdem.amount) - Number(params.contractualAmount)) < 0.01
        ) {
          return {
            success: true,
            operationId: existingOpIdem.operationId || '',
            ticketCode: (existingOpIdem as any).ticketCode || '',
            paymentStatus: (existingOpIdem as any).paymentStatus || 'paid',
            amountPending: 0,
            currentAccountDebtAmount: (existingOpIdem as any).currentAccountDebtAmount || 0,
            movementId: existingOpIdem.movementId || null,
            alreadyProcessed: true
          };
        }
        throw new Error(
          `La clave de idempotencia '${params.idempotencyKey}' ya fue utilizada con parámetros diferentes.`
        );
      }
      if (existingOpIdem.status === 'processing') {
        throw new Error('Operación en proceso por otra solicitud concurrente.');
      }
    }

    // 2.2 Verificación de idempotencia a nivel pago individual
    for (let i = 0; i < paymentIdemSnaps.length; i++) {
      const pSnap = paymentIdemSnaps[i];
      const pItem = paymentIdemRefs[i].p;
      if (pSnap.exists()) {
        const existingPIdem = pSnap.data() as IdempotencyRecord;
        if (existingPIdem.status === 'completed') {
          const expectedAmt = existingPIdem.paymentMethod === 'mixed'
            ? rawPayments.reduce((s, p) => s + p.amount, 0)
            : Number(pItem.amount);
          const expectedMethod = existingPIdem.paymentMethod === 'mixed' ? 'mixed' : pItem.paymentMethod;
          if (
            existingPIdem.complexId === params.complexId &&
            Math.abs(Number(existingPIdem.amount) - expectedAmt) < 0.01 &&
            existingPIdem.paymentMethod === expectedMethod
          ) {
            return {
              success: true,
              operationId: existingPIdem.operationId || '',
              ticketCode: (existingPIdem as any).ticketCode || '',
              paymentStatus: (existingPIdem as any).paymentStatus || 'paid',
              amountPending: 0,
              currentAccountDebtAmount: 0,
              movementId: existingPIdem.movementId || null,
              alreadyProcessed: true
            };
          }
          throw new Error(
            `La clave de idempotencia '${pItem.idempotencyKey}' ya fue utilizada con parámetros diferentes.`
          );
        }
        if (existingPIdem.status === 'processing') {
          throw new Error('Operación en proceso por otra solicitud concurrente.');
        }
      }
    }

    // 2.3 Validación atómica de inventario y cálculo PEPS en memoria (sin lecturas nuevas)
    const fifoResultsMap = new Map<string, FifoConsumeResult>();
    for (const [prodId, { snap, requestedQty }] of productSnaps.entries()) {
      if (!snap.exists()) {
        const itName = params.items?.find(it => it.productId === prodId)?.name || prodId;
        throw new Error(`Producto '${itName}' no encontrado en el inventario.`);
      }
      const prodData = snap.data();
      const currentStock = Number(prodData.stock || 0);
      if (currentStock < requestedQty) {
        const itName = prodData.name || params.items?.find(it => it.productId === prodId)?.name || prodId;
        throw new Error(`Stock insuficiente para '${itName}'. Disponible: ${currentStock}, Solicitado: ${requestedQty}.`);
      }
      fifoResultsMap.set(prodId, consumeProductBatchesFifo(prodData, prodId, requestedQty));
    }

    // 2.4 Cálculos de saldos financieros
    const contractualAmount = Math.max(0, Number(params.contractualAmount) || 0);
    const totalInitialPayAmount = rawPayments.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalInitialPayAmount > contractualAmount) {
      throw new Error(`El cobro inicial ($${totalInitialPayAmount}) no puede superar el monto contractual ($${contractualAmount}).`);
    }

    const balances = calculateFinancialBalances({
      contractualAmount,
      totalCollected: totalInitialPayAmount,
      totalRefunded: 0
    });

    // 2.5 Asignación de deuda a cuenta corriente ("Fiado")
    const assignCC = Boolean(params.assignToCurrentAccount && params.userId);
    const ccResult = calculateCurrentAccountAssignment(
      balances.amountPending,
      assignCC,
      params.customDebtAmount
    );
    const currentAccountDebtAmount = ccResult.assignedToCurrentAccount ? ccResult.debtToAssign : 0;

    // 2.6 Generación de código de ticket secuencial sin colisiones
    const { prefix, seqKey } = getSequenceConfig(params.operationType);
    const counterData = counterSnap.exists() ? counterSnap.data() : {};
    const currentSeq = Number(counterData[seqKey] || 0);
    const nextSeq = currentSeq + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const ticketCode = formatTicketCode(prefix, currentYear, nextSeq);

    // --- FASE 3: ESCRITURAS ATÓMICAS (DESPUÉS DE TODAS LAS LECTURAS) ---
    // 3.1 Actualizar contador secuencial
    t.set(counterRef, {
      [seqKey]: nextSeq,
      complexId: params.complexId,
      complejoId: params.complexId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Determinar nombre y teléfono con la lógica unificada
    let resolvedUserName = resolveClientName(params);
    let resolvedUserPhone = resolveClientPhone(params);

    if (userSnap && userSnap.exists()) {
      const uData = userSnap.data();
      if (resolvedUserName === 'NN' && uData.name && !isGenericClientPlaceholder(uData.name)) {
        resolvedUserName = uData.name.trim();
      }
      if (!resolvedUserPhone && uData.phone) {
        resolvedUserPhone = String(uData.phone).trim();
      }
    }

    if (resolvedUserName === 'NN' && bookingSnap && bookingSnap.exists()) {
      const bData = bookingSnap.data();
      const bName = resolveClientName(bData);
      if (bName !== 'NN') {
        resolvedUserName = bName;
      }
      if (!resolvedUserPhone) {
        resolvedUserPhone = resolveClientPhone(bData);
      }
    }

    const effectiveUserId = (resolvedParamUserId && !resolvedParamUserId.startsWith('derived_'))
      ? resolvedParamUserId
      : (params.clientId && String(params.clientId).trim() !== '' && String(params.clientId) !== '0' ? String(params.clientId).trim() : null);

    const trackedIdempotencyKeys = Array.from(new Set(
      [params.idempotencyKey, ...rawPayments.map(p => p.idempotencyKey)].filter((k): k is string => Boolean(k))
    ));

    // 3.2 Crear documento de operación
    const opDocData: OperationDocument = {
      id: operationId,
      complexId: params.complexId,
      complejoId: params.complexId,
      ticketCode,
      operationType: params.operationType,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.legacySaleId ? { legacySaleId: params.legacySaleId } : {}),
      responsibleType: params.responsibleType || (effectiveUserId ? 'user' : 'anonymous'),
      userId: effectiveUserId,
      clientId: effectiveUserId,
      userName: resolvedUserName,
      clientName: resolvedUserName,
      userPhone: resolvedUserPhone,
      clientPhone: resolvedUserPhone,
      contractualAmount: balances.contractualAmount,
      totalCollected: balances.totalCollected,
      totalRefunded: 0,
      netCollected: balances.netCollected,
      retainedAmount: 0,
      amountPending: balances.amountPending,
      paymentStatus: balances.paymentStatus,
      currentAccountAssigned: ccResult.assignedToCurrentAccount,
      currentAccountDebtAmount,
      ...(trackedIdempotencyKeys.length > 0 ? {
        idempotencyKey: trackedIdempotencyKeys[0],
        idempotencyKeys: trackedIdempotencyKeys
      } : {}),
      items: (params.items || []).map(it => {
        const itemQty = Number(it.quantity || 1);
        const itemSubtotal = Number(it.subtotal || (itemQty * Number(it.unitPrice || 0)));
        const itemObj: any = {
          id: it.id || it.productId || generateUUID(),
          name: it.name,
          quantity: itemQty,
          unitPrice: Number(it.unitPrice || 0),
          subtotal: itemSubtotal
        };
        if (it.productId) {
          itemObj.productId = it.productId;
          const fifo = fifoResultsMap.get(it.productId);
          if (fifo) {
            const totalRequested = productQuantities.get(it.productId) || itemQty;
            const lineTotalCost = itemQty === totalRequested
              ? Number(fifo.totalCMV.toFixed(2))
              : Number((fifo.unitCost * itemQty).toFixed(2));
            itemObj.unitCost = fifo.unitCost;
            itemObj.totalCost = lineTotalCost;
            itemObj.profit = Number((itemSubtotal - lineTotalCost).toFixed(2));
            itemObj.category = fifo.category;
          }
        }
        return itemObj;
      }),
      notes: params.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.operatorId
    };
    t.set(opRef, opDocData);

    // 3.3 Crear movimiento financiero único y registro único de idempotencia para cobros reales
    let movementCategory: FinancialMovementCategory = 'sale_collection';
    if (params.operationType === 'court_booking') {
      movementCategory = balances.paymentStatus === 'paid' ? 'booking_settlement' : 'booking_deposit';
    }
    const singleIdemKey = params.idempotencyKey || rawPayments[0]?.idempotencyKey || `${operationId}_mov`;

    const builtOpMov = buildSingleMovementPayload({
      payments: rawPayments,
      complexId: params.complexId,
      operationId,
      bookingId: params.bookingId || null,
      ticketCode,
      flow: 'income',
      category: movementCategory,
      responsibleName: resolvedUserName,
      userId: effectiveUserId,
      userPhone: resolvedUserPhone,
      operatorId: params.operatorId,
      notes: params.notes || '',
      idempotencyKey: singleIdemKey
    });

    const createdMovementIds: string[] = [];
    if (builtOpMov) {
      createdMovementIds.push(builtOpMov.movId);
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtOpMov.movId);
      t.set(movRef, builtOpMov.movDocData);
    }

    // Registro único de idempotencia por operación/acto de pago apuntando al movId único
    if (opIdemRef && params.idempotencyKey) {
      t.set(opIdemRef, {
        idempotencyKey: params.idempotencyKey,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId,
        amount: balances.contractualAmount,
        paymentMethod: builtOpMov?.paymentMethod || 'other',
        flow: 'income',
        status: 'completed',
        movementId: builtOpMov?.movId || null,
        ticketCode,
        paymentStatus: balances.paymentStatus,
        currentAccountDebtAmount,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    } else if (builtOpMov && rawPayments[0]?.idempotencyKey) {
      const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, rawPayments[0].idempotencyKey);
      t.set(pIdemRef, {
        idempotencyKey: rawPayments[0].idempotencyKey,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId,
        amount: builtOpMov.totalAmount,
        paymentMethod: builtOpMov.paymentMethod,
        flow: 'income',
        status: 'completed',
        movementId: builtOpMov.movId,
        ticketCode,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 3.4 Descuento atómico de stock y registro inmutable de inventario con PEPS (FIFO)
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const [prodId, { ref: prodRef, requestedQty }] of productSnaps.entries()) {
      const fifoResult = fifoResultsMap.get(prodId)!;

      t.update(prodRef, {
        stock: fifoResult.newStock,
        batches: fifoResult.updatedBatches,
        updatedAt: serverTimestamp()
      } as any);

      const invMovRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
      t.set(invMovRef, {
        productId: prodId,
        complejoId: params.complexId,
        complexId: params.complexId,
        type: 'sale',
        typeLabel: 'Venta',
        quantity: -requestedQty,
        resultingStock: fifoResult.newStock,
        date: dateStr,
        time: hoursStr,
        actorName: params.userName || 'Punto de Venta',
        notes: `Venta Mostrador · Ticket ${ticketCode}${fifoResult.totalCMV > 0 ? ` · CMV: $${fifoResult.totalCMV.toLocaleString()}` : ''}`,
        operationId,
        createdAt: serverTimestamp()
      });
    }

    // 3.5 Asignación de deuda en users/{userId}.debt y reactivación automática en el complejo activo si estaba oculto
    if (userRef) {
      if (userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        const isOwnOrigin = !uOrigin || isSameComplex(uOrigin, params.complexId);
        const userPatch: Record<string, any> = buildUserReactivationPatch(uData, params.complexId) || {};

        if (currentAccountDebtAmount > 0 && isOwnOrigin) {
          userPatch.debt = increment(currentAccountDebtAmount);
          userPatch.updatedAt = serverTimestamp();
        }

        if (Object.keys(userPatch).length > 0) {
          t.update(userRef, userPatch);
        }
      } else if (!userSnap && currentAccountDebtAmount > 0) {
        t.set(userRef, {
          debt: increment(currentAccountDebtAmount),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    // 3.6 Sincronizar documento de reserva si aplica
    if (bookingRef && bookingSnap && bookingSnap.exists()) {
      t.update(bookingRef, {
        paymentStatus: balances.paymentStatus,
        payment_status: balances.paymentStatus,
        deposit: totalInitialPayAmount,
        amount_paid: totalInitialPayAmount,
        updatedAt: serverTimestamp()
      });
    }

    return {
      success: true,
      operationId,
      ticketCode,
      paymentStatus: balances.paymentStatus,
      amountPending: balances.amountPending,
      currentAccountDebtAmount,
      movementId: createdMovementIds[0] || null,
      movementIds: createdMovementIds
    };
  });
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    code === 'permission-denied' ||
    code.endsWith('/permission-denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission-denied')
  );
}

function isSyntheticUserId(uid?: string | null): boolean {
  if (!uid) return true;
  const s = String(uid).trim();
  return (
    !s ||
    s === '0' ||
    s.startsWith('derived_') ||
    s.startsWith('phone_') ||
    s.startsWith('player_') ||
    s.startsWith('host_')
  );
}

async function precheckOperationExists(
  opRef: ReturnType<typeof doc>,
  targetComplexId: string,
  operationId: string
): Promise<{ exists: boolean; opData: OperationDocument | null }> {
  const cachedOps = sharedSubscribeOperations.getCached(targetComplexId);
  if (Array.isArray(cachedOps)) {
    const found = cachedOps.find(o => String(o.id) === String(operationId)) || null;
    return { exists: Boolean(found), opData: found };
  }
  try {
    const snap = await getDoc(opRef);
    return {
      exists: snap.exists(),
      opData: snap.exists() ? ({ id: snap.id, ...snap.data() } as OperationDocument) : null
    };
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      // Under security rules without `resource == null` on get, reading a missing doc yields permission-denied
      return { exists: false, opData: null };
    }
    throw err;
  }
}

async function precheckUserDocAccessible(
  userId: string | null | undefined,
  targetComplexId: string
): Promise<boolean> {
  if (isSyntheticUserId(userId)) return false;
  const strUid = String(userId).trim();
  const cachedRaw = rawClientsByComplexMap.get(targetComplexId);
  if (cachedRaw && cachedRaw.has(strUid)) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, strUid));
    return snap.exists();
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * Registra un cobro posterior sobre una operación existente.
 * Garantiza consistencia estricta: descuenta exactamente el importe correspondiente
 * de currentAccountDebtAmount de la operación y de users/{userId}.debt simultáneamente.
 */
export async function registerOperationPayment(
  params: RegisterOperationPaymentParams
): Promise<PaymentRegistrationResult> {
  if (!params.complexId || !params.operationId || !params.idempotencyKey) {
    throw new Error('complexId, operationId e idempotencyKey son obligatorios.');
  }

  const targetComplexId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;

  const normalizedMethod = normalizeMonetaryPaymentMethod(params.paymentMethod);
  if (!normalizedMethod || normalizedMethod === 'mixed') {
    throw new Error('Debe seleccionar un medio de pago monetario válido (Efectivo, Transferencia, Tarjeta o Mercado Pago).');
  }

  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey);
  const opRef = doc(db, OPERATIONS_COLLECTION, params.operationId);

  const preOp = await precheckOperationExists(opRef, targetComplexId, params.operationId);
  if (!preOp.exists) {
    throw new Error(`Operación '${params.operationId}' no encontrada.`);
  }

  const shouldCheckUserDebt = Boolean(
    preOp.opData &&
    Number(preOp.opData.currentAccountDebtAmount || 0) > 0 &&
    !isSyntheticUserId(preOp.opData.userId)
  );
  const canAccessUserDebt = shouldCheckUserDebt
    ? await precheckUserDocAccessible(preOp.opData?.userId, targetComplexId)
    : false;

  try {
    return await runTransaction(db, async (t) => {
      // --- FASE 1: LECTURAS (TODAS ANTES DE CUALQUIER ESCRITURA) ---
      const idemSnap = await t.get(idemRef);
      const opSnap = await t.get(opRef);

      if (!opSnap.exists()) {
        throw new Error(`Operación '${params.operationId}' no encontrada.`);
      }

      const opData = opSnap.data() as OperationDocument;
      const userRef = (opData.userId && Number(opData.currentAccountDebtAmount || 0) > 0 && canAccessUserDebt)
        ? doc(db, USERS_COLLECTION, String(opData.userId))
        : null;
      const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, String(opData.bookingId)) : null;

      const userSnap = userRef ? await t.get(userRef) : null;
      const bookingSnap = bookingRef ? await t.get(bookingRef) : null;

      const isExpense = opData.operationType === 'expense' || opData.operationType === 'purchase';
      const movementFlow: 'income' | 'expense' = isExpense ? 'expense' : 'income';

      // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
      // 2.1 Validación de idempotencia
      const idemRecord = idemSnap.exists() ? (idemSnap.data() as IdempotencyRecord) : null;
      const idemVal = validateIdempotencyRequest(idemRecord, {
        complexId: targetComplexId,
        operationId: params.operationId,
        amount: params.amount,
        paymentMethod: normalizedMethod,
        flow: movementFlow
      });

      if (idemVal.type === 'MATCH_COMPLETED') {
        return {
          success: true,
          operationId: params.operationId,
          movementId: idemVal.movementId,
          ticketCode: opData.ticketCode,
          paymentStatus: opData.paymentStatus,
          amountPending: opData.amountPending,
          currentAccountDebtAmount: opData.currentAccountDebtAmount,
          clearedCurrentAccountDebt: 0,
          alreadyProcessed: true
        };
      }
      if (idemVal.type === 'MISMATCH_ERROR') {
        throw new Error(idemVal.reason);
      }
      if (idemVal.type === 'IN_PROGRESS') {
        throw new Error('Cobro en proceso por otra solicitud concurrente.');
      }

      // 2.2 Validaciones de negocio sobre la operación
      const opComplex = opData.complexId || (opData as any).complejoId;
      if (opComplex && !isSameComplex(opComplex, targetComplexId)) {
        throw new Error('La operación no pertenece al complejo activo.');
      }
      if (isJogoBillingOperation(opData)) {
        throw new Error('Los cobros de Jogo solo pueden ser registrados por la administración de Jogo.');
      }
      if (['cancelled_unpaid', 'cancelled_retained', 'fully_refunded'].includes(opData.paymentStatus)) {
        throw new Error(`No se pueden registrar cobros sobre una operación cancelada (${opData.paymentStatus}).`);
      }
      if (params.amount <= 0) {
        throw new Error('El importe a cobrar debe ser mayor a 0.');
      }
      if (opData.amountPending <= 0) {
        throw new Error('La operación ya se encuentra totalmente saldada.');
      }

      // 2.3 Cálculo de saldos y transición de estado
      const newTotalCollected = opData.totalCollected + params.amount;
      const balances = calculateFinancialBalances({
        contractualAmount: opData.contractualAmount,
        totalCollected: newTotalCollected,
        totalRefunded: opData.totalRefunded
      });

      const trans = validateStateTransition(opData.paymentStatus, balances.paymentStatus);
      if (!trans.valid) {
        throw new Error(trans.reason);
      }

      // 2.4 Consistencia estricta de cuenta corriente y deuda personal:
      // Si la operación tiene deuda asignada a CC, se reduce primero esa deuda
      let clearedDebt = 0;
      let remainingOpDebt = 0;
      if (opData.currentAccountDebtAmount > 0) {
        const clearing = calculateCurrentAccountClearing(opData.currentAccountDebtAmount, params.amount);
        clearedDebt = clearing.clearedDebtAmount;
        remainingOpDebt = clearing.remainingOperationDebt;
      }

      const category: FinancialMovementCategory = params.category || 
        (isExpense ? 'expense_payment' : (opData.operationType === 'court_booking' ? 'booking_settlement' : 'sale_collection'));

      // --- FASE 3: ESCRITURAS ATÓMICAS (DESPUÉS DE TODAS LAS LECTURAS) ---
      // 3.1 Registrar movimiento financiero único
      const builtPayMov = buildSingleMovementPayload({
        payments: [{ amount: params.amount, paymentMethod: normalizedMethod }],
        complexId: targetComplexId,
        operationId: params.operationId,
        bookingId: opData.bookingId || null,
        ticketCode: opData.ticketCode,
        flow: movementFlow,
        category,
        responsibleName: opData.userName || opData.clientName || 'NN',
        userId: opData.userId || opData.clientId || null,
        userPhone: opData.userPhone || opData.clientPhone || '',
        clearedCurrentAccountDebt: clearedDebt,
        notes: params.notes || '',
        operatorId: params.operatorId,
        idempotencyKey: params.idempotencyKey
      });
      if (!builtPayMov) {
        throw new Error('El importe a cobrar debe ser mayor a 0.');
      }
      const movementId = builtPayMov.movId;
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movementId);
      t.set(movRef, builtPayMov.movDocData);

      // 3.2 Registrar clave de idempotencia completada
      t.set(idemRef, {
        idempotencyKey: params.idempotencyKey,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        operationId: params.operationId,
        amount: params.amount,
        paymentMethod: builtPayMov.paymentMethod,
        flow: movementFlow,
        status: 'completed',
        movementId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });

      // 3.3 Actualizar documento de operación
      t.update(opRef, {
        totalCollected: balances.totalCollected,
        netCollected: balances.netCollected,
        amountPending: balances.amountPending,
        paymentStatus: balances.paymentStatus,
        currentAccountDebtAmount: remainingOpDebt,
        idempotencyKeys: arrayUnion(params.idempotencyKey),
        updatedAt: serverTimestamp()
      });

      // 3.4 Reducir users/{userId}.debt exactamente por clearedDebt si aplica (con clamp >= 0)
      if (clearedDebt > 0 && userRef && userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        if (!uOrigin || isSameComplex(uOrigin, targetComplexId)) {
          const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
          t.update(userRef, {
            debt: Math.max(0, currentUserDebt - clearedDebt),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 3.5 Actualizar reserva asociada si existe
      if (bookingRef && bookingSnap && bookingSnap.exists()) {
        t.update(bookingRef, {
          paymentStatus: balances.paymentStatus,
          payment_status: balances.paymentStatus,
          deposit: balances.totalCollected,
          amount_paid: balances.totalCollected,
          idempotencyKeys: arrayUnion(params.idempotencyKey),
          updatedAt: serverTimestamp()
        });
      }

      return {
        success: true,
        operationId: params.operationId,
        movementId,
        ticketCode: opData.ticketCode,
        paymentStatus: balances.paymentStatus,
        amountPending: balances.amountPending,
        currentAccountDebtAmount: remainingOpDebt,
        clearedCurrentAccountDebt: clearedDebt
      };
    });
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, FirestoreOpType.WRITE, `${OPERATIONS_COLLECTION}/${params.operationId}`);
    }
    throw err;
  }
}

/**
 * Registra un abono directo a la deuda histórica acumulada en users/{userId}.debt sin ticket previo.
 * - No crea operaciones ni ventas ficticias (operationId = null).
 * - Utiliza exclusivamente la categoría canónica 'historical_debt_payment'.
 * - Rechaza estrictamente sobrepagos para evitar saldos negativos o excedentes no contabilizados.
 * - Descuenta atómicamente users/{userId}.debt y genera ticket de recibo consecutivo 'D-YY-XXXXXX'.
 */
export async function registerHistoricalDebtPayment(
  params: RegisterHistoricalDebtPaymentParams
): Promise<HistoricalDebtPaymentResult> {
  if (!params.complexId || !params.userId || !params.idempotencyKey) {
    throw new Error('complexId, userId e idempotencyKey son obligatorios.');
  }

  const normalizedMethod = normalizeMonetaryPaymentMethod(params.paymentMethod);
  if (!normalizedMethod || normalizedMethod === 'mixed') {
    throw new Error('Debe seleccionar un medio de pago monetario válido (Efectivo, Transferencia, Tarjeta o Mercado Pago).');
  }

  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey);
  const userRef = doc(db, USERS_COLLECTION, params.userId);
  const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, params.complexId);

  return await runTransaction(db, async (t) => {
    // --- FASE 1: LECTURAS (TODAS ANTES DE CUALQUIER ESCRITURA) ---
    const idemSnap = await t.get(idemRef);
    const userSnap = await t.get(userRef);
    const counterSnap = await t.get(counterRef);

    // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
    // 2.1 Validación de idempotencia
    const idemRecord = idemSnap.exists() ? (idemSnap.data() as IdempotencyRecord) : null;
    const idemVal = validateIdempotencyRequest(idemRecord, {
      complexId: params.complexId,
      operationId: null,
      amount: params.amount,
      paymentMethod: normalizedMethod,
      flow: 'income'
    });

    if (idemVal.type === 'MATCH_COMPLETED') {
      const uDebt = userSnap.exists() ? Number(userSnap.data().debt || 0) : 0;
      return {
        success: true,
        movementId: idemVal.movementId,
        ticketCode: (idemRecord as any)?.ticketCode || '',
        userId: params.userId,
        clearedDebt: params.amount,
        remainingDebt: uDebt,
        alreadyProcessed: true
      };
    }
    if (idemVal.type === 'MISMATCH_ERROR') {
      throw new Error(idemVal.reason);
    }
    if (idemVal.type === 'IN_PROGRESS') {
      throw new Error('Abono en proceso por otra solicitud concurrente.');
    }

    // 2.2 Validación del cliente
    if (!userSnap.exists()) {
      throw new Error(`Cliente '${params.userId}' no encontrado.`);
    }

    const userData = userSnap.data();
    const currentDebt = Math.max(0, Number(userData.debt || 0));

    if (currentDebt <= 0) {
      throw new Error(`El cliente '${userData.name || params.userId}' no registra deuda pendiente.`);
    }

    // 2.3 Cálculo estricto de liquidación de deuda histórica (rechaza sobrepago)
    const settle = calculateHistoricalDebtSettlement(currentDebt, params.amount);
    if (!settle.valid) {
      throw new Error(settle.error);
    }

    // 2.4 Generación de código de recibo secuencial para abonos (Prefijo 'D')
    const counterData = counterSnap.exists() ? counterSnap.data() : {};
    const currentSeq = Number(counterData.historical_debt_sequence || 0);
    const nextSeq = currentSeq + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const ticketCode = formatTicketCode('D', currentYear, nextSeq);

    // --- FASE 3: ESCRITURAS ATÓMICAS (DESPUÉS DE TODAS LAS LECTURAS) ---
    // 3.1 Actualizar contador de abonos
    t.set(counterRef, {
      historical_debt_sequence: nextSeq,
      complexId: params.complexId,
      complejoId: params.complexId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 3.2 Crear movimiento financiero con categoría canónica 'historical_debt_payment' y operationId = null
    const builtHistMov = buildSingleMovementPayload({
      payments: [{ amount: settle.clearedAmount, paymentMethod: normalizedMethod }],
      complexId: params.complexId,
      operationId: null,
      ticketCode,
      flow: 'income',
      category: 'historical_debt_payment',
      responsibleName: userData.name || userData.clientName || 'Cliente',
      userId: params.userId,
      userPhone: userData.phone || '',
      clearedCurrentAccountDebt: settle.clearedAmount,
      notes: params.notes || 'Abono directo a cuenta corriente histórica',
      operatorId: params.operatorId,
      idempotencyKey: params.idempotencyKey
    });
    if (!builtHistMov) {
      throw new Error('El importe del abono debe ser mayor a 0.');
    }
    const movementId = builtHistMov.movId;
    const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movementId);
    t.set(movRef, builtHistMov.movDocData);

    // 3.3 Registrar clave de idempotencia completada
    t.set(idemRef, {
      idempotencyKey: params.idempotencyKey,
      complexId: params.complexId,
      complejoId: params.complexId,
      operationId: null,
      amount: settle.clearedAmount,
      paymentMethod: builtHistMov.paymentMethod,
      flow: 'income',
      status: 'completed',
      movementId,
      ticketCode,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    // 3.4 Descontar deuda atómicamente de users/{userId}.debt con clamp >= 0
    t.update(userRef, {
      debt: Math.max(0, currentDebt - settle.clearedAmount),
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      movementId,
      ticketCode,
      userId: params.userId,
      clearedDebt: settle.clearedAmount,
      remainingDebt: settle.remainingDebt
    };
  });
}

/**
 * Registra un ingreso o egreso manual desde Finanzas de manera 100% transaccional,
 * utilizando complex_counters, idempotency_keys e IDs deterministas sin addDoc sueltos.
 */
export async function executeManualFinanceTransaction(params: {
  complexId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  concept: string;
  description?: string;
  paymentMethod: string;
  operatorId?: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  operationId: string;
  movementId: string;
  ticketCode: string;
}> {
  const targetId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const amount = Number(params.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('El importe del movimiento debe ser mayor a 0.');
  }

  const normalizedMethod = normalizeMonetaryPaymentMethod(params.paymentMethod);
  if (!normalizedMethod || normalizedMethod === 'mixed') {
    throw new Error('Debe seleccionar un medio de pago monetario válido (Efectivo, Transferencia, Tarjeta o Mercado Pago).');
  }

  const cleanConcept = (params.concept || '').trim() || (params.type === 'income' ? 'Ingreso manual' : 'Egreso manual');
  const cleanCategory = (params.category || '').trim() || (params.type === 'income' ? 'Otros Ingresos' : 'Gastos Generales');
  const cleanDescription = (params.description || '').trim();
  const idemKey = params.idempotencyKey || `manual_tx_${params.type}_${Date.now()}_${generateUUID().slice(0, 6)}`;
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);

  return await runTransaction(db, async (t) => {
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    const [existingIdemSnap, counterSnap] = await Promise.all([
      t.get(idemRef),
      t.get(counterRef)
    ]);

    if (existingIdemSnap.exists()) {
      const idemData = existingIdemSnap.data() as IdempotencyRecord;
      if (idemData.status === 'completed' && idemData.operationId) {
        return {
          success: true,
          operationId: idemData.operationId,
          movementId: idemData.movementId || '',
          ticketCode: idemData.ticketCode || ''
        };
      }
      if (idemData.status === 'processing') {
        throw new Error('Movimiento en proceso por otra solicitud concurrente.');
      }
    }

    const isIncome = params.type === 'income';
    const seqKey = isIncome ? 'pos_sale_sequence' : 'expense_sequence';
    const prefix = isIncome ? 'T' : 'E';
    const counterData = counterSnap.exists() ? counterSnap.data() : {};
    const nextSeq = Number(counterData[seqKey] || 0) + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const ticketCode = formatTicketCode(prefix, currentYear, nextSeq);

    const operationId = generateUUID();
    const opRef = doc(db, OPERATIONS_COLLECTION, operationId);
    const opDocData: OperationDocument = {
      id: operationId,
      complexId: targetId,
      complejoId: targetId,
      ticketCode,
      operationType: isIncome ? 'sale' : 'expense',
      responsibleType: isIncome ? 'anonymous' : 'supplier',
      userName: cleanConcept,
      clientName: cleanConcept,
      supplierName: !isIncome ? cleanConcept : undefined,
      expenseCategoryName: !isIncome ? cleanCategory : undefined,
      expenseConceptName: !isIncome ? cleanConcept : undefined,
      contractualAmount: amount,
      totalCollected: amount,
      totalRefunded: 0,
      netCollected: amount,
      retainedAmount: 0,
      amountPending: 0,
      paymentStatus: 'paid',
      currentAccountAssigned: false,
      currentAccountDebtAmount: 0,
      idempotencyKey: idemKey,
      idempotencyKeys: [idemKey],
      items: [{
        id: operationId,
        name: cleanConcept,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount
      }],
      notes: cleanDescription || `${cleanCategory}: ${cleanConcept}`,
      metadata: {
        isManual: true,
        category: cleanCategory,
        concept: cleanConcept,
        description: cleanDescription,
        isExpense: !isIncome
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.operatorId || 'administrador'
    };
    t.set(opRef, cleanFirestoreDocument(opDocData));

    t.set(counterRef, {
      [seqKey]: nextSeq,
      complexId: targetId,
      complejoId: targetId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const builtMov = buildSingleMovementPayload({
      payments: [{ amount, paymentMethod: normalizedMethod }],
      complexId: targetId,
      operationId,
      ticketCode,
      flow: params.type,
      category: isIncome ? 'sale_collection' : 'expense_payment',
      responsibleName: cleanConcept,
      operatorId: params.operatorId || 'administrador',
      notes: cleanDescription || `${cleanCategory}: ${cleanConcept}`,
      idempotencyKey: idemKey,
      expenseCategoryName: !isIncome ? cleanCategory : undefined,
      expenseConceptName: !isIncome ? cleanConcept : undefined
    });

    if (!builtMov) {
      throw new Error('No se pudo construir el movimiento financiero.');
    }

    const movDocWithMeta = {
      ...builtMov.movDocData,
      metadata: {
        isManual: true,
        category: cleanCategory,
        concept: cleanConcept,
        description: cleanDescription
      }
    };
    t.set(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtMov.movId), cleanFirestoreDocument(movDocWithMeta));

    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetId,
      complejoId: targetId,
      operationId,
      ticketCode,
      amount,
      paymentMethod: builtMov.paymentMethod,
      flow: params.type,
      status: 'completed',
      movementId: builtMov.movId,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    return {
      success: true,
      operationId,
      movementId: builtMov.movId,
      ticketCode
    };
  });
}

/**
 * Cancela una operación aplicando la política de liquidación elegida (retención de seña o reintegro).
 * Si la operación tenía saldo impago asignado a cuenta corriente, lo extingue de users/{userId}.debt
 * para preservar la justicia contable (no exigir deuda por un servicio cancelado).
 */
export async function cancelOperationWithSettlement(
  params: CancelOperationParams
): Promise<{ success: boolean; paymentStatus: OperationPaymentStatus; refundMovementId?: string }> {
  const opRef = doc(db, OPERATIONS_COLLECTION, params.operationId);
  const idemRef = params.idempotencyKey ? doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey) : null;

  return await runTransaction(db, async (t) => {
    // --- FASE 1: LECTURAS ---
    const [opSnap, idemSnap] = await Promise.all([
      t.get(opRef),
      idemRef ? t.get(idemRef) : Promise.resolve(null)
    ]);

    if (!opSnap.exists()) {
      throw new Error(`Operación '${params.operationId}' no encontrada.`);
    }

    const opData = opSnap.data() as OperationDocument;
    if (idemSnap && idemSnap.exists() && idemSnap.data()?.status === 'completed') {
      return {
        success: true,
        paymentStatus: opData.paymentStatus,
        refundMovementId: idemSnap.data()?.movementId
      };
    }

    const userRef = opData.userId ? doc(db, USERS_COLLECTION, opData.userId) : null;
    const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, opData.bookingId) : null;

    const [userSnap, bookingSnap] = await Promise.all([
      userRef ? t.get(userRef) : Promise.resolve(null),
      bookingRef ? t.get(bookingRef) : Promise.resolve(null)
    ]);

    // Lectura de complejo y locks si corresponde a una reserva
    let lockEntries: Array<{ ref: ReturnType<typeof doc>; snap: any }> = [];
    if (opData.bookingId && bookingSnap && bookingSnap.exists()) {
      const bData = bookingSnap.data();
      const targetComplexId = String(bData.complejoId || bData.complexId || params.complexId || 'B');
      const normalizedComplexId = targetComplexId === 'complejo_central' ? 'B' : targetComplexId;
      const courtId = String(bData.courtId || bData.court_id || 'c_1');
      const date = bData.date;
      if (normalizedComplexId && courtId && date) {
        const compSnap = await t.get(doc(db, COMPLEJOS_COLLECTION, normalizedComplexId));
        const affectedCourts = getOverlappingCourtIdsFromList(compSnap.exists() ? compSnap.data() : null, courtId);
        const lockRefs = affectedCourts.map(cid =>
          doc(db, BOOKING_LOCKS_COLLECTION, `${normalizedComplexId}__${cid}__${date}`)
        );
        const lockSnaps = await Promise.all(lockRefs.map(ref => t.get(ref)));
        lockEntries = lockRefs.map((ref, idx) => ({ ref, snap: lockSnaps[idx] }));
      }
    }

    // Lectura de productos si corresponde a una venta POS o compra para revertir stock atómicamente
    const isPosSale = opData.operationType === 'pos_sale' || (opData.operationType as string) === 'sale';
    const isPurchase = opData.operationType === 'purchase';
    const productQtyMap = new Map<string, number>();
    if ((isPosSale || isPurchase) && Array.isArray(opData.items)) {
      for (const it of opData.items) {
        const pId = String((it as any).productId || (it as any).id || '').trim();
        const qty = Math.max(0, Number((it as any).quantity || 0));
        if (pId && qty > 0) {
          productQtyMap.set(pId, (productQtyMap.get(pId) || 0) + qty);
        }
      }
    }
    if (isPurchase && productQtyMap.size === 0 && (opData as any).metadata?.productId) {
      const pId = String((opData as any).metadata.productId).trim();
      const qty = Math.max(0, Number((opData as any).metadata.quantity || 0));
      if (pId && qty > 0) productQtyMap.set(pId, qty);
    }

    const productEntries = await Promise.all(
      Array.from(productQtyMap.entries()).map(async ([pId, qty]) => {
        const pRef = doc(db, PRODUCTS_COLLECTION, pId);
        const pSnap = await t.get(pRef);
        return { pId, qty, ref: pRef, snap: pSnap };
      })
    );

    // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
    if ((opData as any)?.createdSource === 'jogo' || (bookingSnap && bookingSnap.exists() && bookingSnap.data()?.createdSource === 'jogo')) {
      throw new Error('Las reservas generadas por Jogo no pueden cancelarse ni eliminarse desde el complejo.');
    }
    if (opData.complexId !== params.complexId) {
      throw new Error('La operación no pertenece al complejo activo.');
    }
    if (['cancelled_unpaid', 'cancelled_retained', 'fully_refunded'].includes(opData.paymentStatus)) {
      throw new Error(`La operación ya está cancelada (${opData.paymentStatus}).`);
    }

    let refundAmount = 0;
    let retainDepositOnCancel = true;

    if (params.policy === 'retain_deposit') {
      refundAmount = 0;
      retainDepositOnCancel = true;
    } else if (params.policy === 'refund_deposit') {
      refundAmount = opData.totalCollected;
      retainDepositOnCancel = false;
    } else if (params.policy === 'partial_refund') {
      refundAmount = Math.max(0, Number(params.refundAmount) || 0);
      if (refundAmount > opData.totalCollected) {
        throw new Error(`El importe a devolver ($${refundAmount}) no puede superar lo cobrado ($${opData.totalCollected}).`);
      }
      retainDepositOnCancel = opData.totalCollected > refundAmount;
    }

    const refundMethod = refundAmount > 0
      ? (normalizeMonetaryPaymentMethod(params.refundPaymentMethod || 'cash') || 'cash')
      : 'cash';

    const balances = calculateFinancialBalances({
      contractualAmount: opData.contractualAmount,
      totalCollected: opData.totalCollected,
      totalRefunded: refundAmount,
      isCancelled: true,
      retainDepositOnCancel
    });

    const trans = validateStateTransition(opData.paymentStatus, balances.paymentStatus);
    if (!trans.valid) {
      throw new Error(trans.reason);
    }

    // Extinción de deuda pendiente fiada si la operación se cancela
    const debtToExtinguish = opData.currentAccountDebtAmount > 0 ? opData.currentAccountDebtAmount : 0;

    // --- FASE 3: ESCRITURAS ATÓMICAS ---
    // 3.1 Actualizar operación
    t.update(opRef, {
      totalRefunded: balances.totalRefunded,
      netCollected: balances.netCollected,
      retainedAmount: balances.retainedAmount,
      amountPending: 0,
      paymentStatus: balances.paymentStatus,
      currentAccountDebtAmount: 0,
      ...(params.idempotencyKey ? { idempotencyKeys: arrayUnion(params.idempotencyKey) } : {}),
      notes: params.notes ? `${opData.notes ? opData.notes + ' | ' : ''}Cancelación: ${params.notes}` : opData.notes,
      updatedAt: serverTimestamp()
    });

    // 3.2 Si hay reintegro monetario, emitir movimiento de egreso
    let refundMovementId: string | undefined = undefined;
    if (refundAmount > 0) {
      refundMovementId = generateUUID();
      const refundMovRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, refundMovementId);
      const refundMovData: FinancialMovementDocument = {
        id: refundMovementId,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId: params.operationId,
        ...(opData.bookingId ? { bookingId: opData.bookingId } : {}),
        ticketCode: opData.ticketCode,
        idempotencyKey: params.idempotencyKey || generateUUID(),
        flow: 'expense',
        category: 'refund',
        amount: refundAmount,
        paymentMethod: refundMethod,
        effectiveDate: serverTimestamp(),
        userId: opData.userId || null,
        responsibleName: opData.userName,
        clearedCurrentAccountDebt: 0,
        notes: `Reintegro por cancelación: ${params.notes || ''}`,
        operatorId: params.operatorId,
        createdAt: serverTimestamp()
      };
      t.set(refundMovRef, refundMovData);

      if (idemRef) {
        t.set(idemRef, {
          idempotencyKey: params.idempotencyKey,
          complexId: params.complexId,
          complejoId: params.complexId,
          operationId: params.operationId,
          amount: refundAmount,
          paymentMethod: refundMethod,
          flow: 'expense',
          status: 'completed',
          movementId: refundMovementId,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    } else if (idemRef) {
      t.set(idemRef, {
        idempotencyKey: params.idempotencyKey,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId: params.operationId,
        amount: 0,
        paymentMethod: 'other',
        flow: 'expense',
        status: 'completed',
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 3.3 Si había deuda fiada sin cobrar, descontarla de users/{userId}.debt con clamp >= 0
    if (debtToExtinguish > 0 && userRef && userSnap && userSnap.exists()) {
      const uData = userSnap.data();
      const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
      if (!uOrigin || isSameComplex(uOrigin, params.complexId)) {
        const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
        t.update(userRef, {
          debt: Math.max(0, currentUserDebt - debtToExtinguish),
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3.4 Sincronizar estado de reserva y liberar locks atómicamente dentro de la transacción
    if (bookingRef && bookingSnap && bookingSnap.exists()) {
      t.update(bookingRef, {
        status: 'cancelado',
        cancelledSource: 'complejo',
        paymentStatus: balances.paymentStatus,
        payment_status: balances.paymentStatus,
        retainedAmount: balances.retainedAmount,
        totalRefunded: balances.totalRefunded,
        ...(params.idempotencyKey ? { idempotencyKeys: arrayUnion(params.idempotencyKey) } : {}),
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      for (const entry of lockEntries) {
        if (entry.snap.exists()) {
          const bMap = { ...(entry.snap.data().bookings || {}) };
          if (bMap[opData.bookingId!]) {
            delete bMap[opData.bookingId!];
            t.update(entry.ref, {
              bookings: bMap,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    }

    // 3.5 Restaurar/revertir inventario PEPS si se cancela una venta POS o una compra
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const pEntry of productEntries) {
      if (!pEntry.snap.exists()) continue;
      const pData = pEntry.snap.data();
      if (isPosSale) {
        const restored = restoreProductBatches(pData, pEntry.pId, pEntry.qty, () => generateUUID());
        t.update(pEntry.ref, {
          stock: restored.newStock,
          batches: restored.updatedBatches,
          updatedAt: serverTimestamp()
        });
        const invMovRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
        t.set(invMovRef, {
          productId: pEntry.pId,
          complejoId: params.complexId,
          complexId: params.complexId,
          type: 'restock',
          typeLabel: 'Ajuste por cancelación',
          quantity: pEntry.qty,
          resultingStock: restored.newStock,
          date: dateStr,
          time: hoursStr,
          actorName: params.operatorId || 'Administrador',
          notes: `Cancelación venta · Ticket ${opData.ticketCode}`,
          operationId: params.operationId,
          createdAt: serverTimestamp()
        });
      } else if (isPurchase) {
        const currentStock = Math.max(0, Number(pData.stock || 0));
        const newStock = Math.max(0, currentStock - pEntry.qty);
        const existingBatches: ProductBatch[] = Array.isArray(pData.batches) ? pData.batches : [];
        const filteredBatches = existingBatches.filter(b => b.operationId !== params.operationId);
        t.update(pEntry.ref, {
          stock: newStock,
          batches: filteredBatches,
          updatedAt: serverTimestamp()
        });
        const invMovRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
        t.set(invMovRef, {
          productId: pEntry.pId,
          complejoId: params.complexId,
          complexId: params.complexId,
          type: 'adjustment',
          typeLabel: 'Anulación compra',
          quantity: -pEntry.qty,
          resultingStock: newStock,
          date: dateStr,
          time: hoursStr,
          actorName: params.operatorId || 'Administrador',
          notes: `Cancelación compra · Ticket ${opData.ticketCode}`,
          operationId: params.operationId,
          createdAt: serverTimestamp()
        });
      }
    }

    return {
      success: true,
      paymentStatus: balances.paymentStatus,
      refundMovementId
    };
  });
}

/**
 * Escucha en tiempo real las operaciones de un complejo ordenadas cronológicamente,
 * fusionando queries por complexId y complejoId para garantizar cobertura total en Vercel.
 */
const sharedSubscribeOperations = createSharedSubscription<OperationDocument[]>((targetId, emit) => {
  const colRef = collection(db, OPERATIONS_COLLECTION);
  const targetIds = (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];

  const maps = targetIds.flatMap(() => [new Map<string, OperationDocument>(), new Map<string, OperationDocument>()]);
  const unsubs: Array<() => void> = [];

  const emitMerged = () => {
    const merged = new Map<string, OperationDocument>();
    maps.forEach(m => {
      m.forEach((val, key) => merged.set(key, val));
    });
    const list = Array.from(merged.values());
    const parseTime = (item: any) => {
      const v = item?.createdAt || item?.date;
      if (!v) return 0;
      if (typeof v?.toDate === 'function') return v.toDate().getTime();
      if (typeof v?.toMillis === 'function') return v.toMillis();
      if (v instanceof Date) return v.getTime();
      const t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    };
    list.sort((a, b) => parseTime(b) - parseTime(a));
    emit(list);
  };

  let mapIdx = 0;
  targetIds.forEach((tId) => {
    const idx1 = mapIdx++;
    const q1 = query(colRef, where('complexId', '==', tId));
    unsubs.push(
      onSnapshot(q1, (snap) => {
        maps[idx1].clear();
        snap.forEach((d) => maps[idx1].set(d.id, { id: d.id, ...d.data() } as OperationDocument));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando operaciones (complexId: ${tId}):`, err);
      })
    );

    const idx2 = mapIdx++;
    const q2 = query(colRef, where('complejoId', '==', tId));
    unsubs.push(
      onSnapshot(q2, (snap) => {
        maps[idx2].clear();
        snap.forEach((d) => maps[idx2].set(d.id, { id: d.id, ...d.data() } as OperationDocument));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando operaciones (complejoId: ${tId}):`, err);
      })
    );
  });

  return () => {
    unsubs.forEach(u => u());
  };
});

export function subscribeToOperations(
  complexId: string,
  cb: (operations: OperationDocument[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeOperations(targetId, cb);
}

/**
 * Escucha en tiempo real los movimientos de caja (/financial_movements) de un complejo,
 * fusionando queries por complexId y complejoId para garantizar cobertura total en Vercel.
 */
const sharedSubscribeFinancialMovements = createSharedSubscription<FinancialMovementDocument[]>((targetId, emit) => {
  const colRef = collection(db, FINANCIAL_MOVEMENTS_COLLECTION);
  const targetIds = (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];

  const maps = targetIds.flatMap(() => [new Map<string, FinancialMovementDocument>(), new Map<string, FinancialMovementDocument>()]);
  const unsubs: Array<() => void> = [];

  const emitMerged = () => {
    const merged = new Map<string, FinancialMovementDocument>();
    maps.forEach(m => {
      m.forEach((val, key) => merged.set(key, val));
    });
    const list = Array.from(merged.values());
    const parseTime = (item: any) => {
      const v = item?.createdAt || item?.date;
      if (!v) return 0;
      if (typeof v?.toDate === 'function') return v.toDate().getTime();
      if (typeof v?.toMillis === 'function') return v.toMillis();
      if (v instanceof Date) return v.getTime();
      const t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    };
    list.sort((a, b) => parseTime(b) - parseTime(a));
    emit(list);
  };

  let mapIdx = 0;
  targetIds.forEach((tId) => {
    const idx1 = mapIdx++;
    const q1 = query(colRef, where('complexId', '==', tId));
    unsubs.push(
      onSnapshot(q1, (snap) => {
        maps[idx1].clear();
        snap.forEach((d) => maps[idx1].set(d.id, { id: d.id, ...d.data() } as FinancialMovementDocument));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando movimientos (complexId: ${tId}):`, err);
      })
    );

    const idx2 = mapIdx++;
    const q2 = query(colRef, where('complejoId', '==', tId));
    unsubs.push(
      onSnapshot(q2, (snap) => {
        maps[idx2].clear();
        snap.forEach((d) => maps[idx2].set(d.id, { id: d.id, ...d.data() } as FinancialMovementDocument));
        emitMerged();
      }, (err) => {
        console.warn(`[Firestore] Error escuchando movimientos (complejoId: ${tId}):`, err);
      })
    );
  });

  return () => {
    unsubs.forEach(u => u());
  };
});

export function subscribeToFinancialMovements(
  complexId: string,
  cb: (movements: FinancialMovementDocument[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  return sharedSubscribeFinancialMovements(targetId, cb);
}

/**
 * Elimina definitivamente cualquier registro financiero (operación, movimiento o reserva)
 * revirtiendo stock, deudas de cuenta corriente y borrando de todas las colecciones vinculadas sin dejar rastros.
 */
export async function permanentlyDeleteFinancialRecordInFirestore(params: {
  complexId: string;
  operationId?: string | null;
  movementId?: string | null;
  bookingId?: string | null;
  isLegacyTransaction?: boolean;
}): Promise<{ success: boolean }> {
  let opId = params.operationId ? String(params.operationId).trim() : null;
  const movId = params.movementId ? String(params.movementId).trim() : null;
  let bId = params.bookingId ? String(params.bookingId).trim() : null;
  const trackedIdemKeys = new Set<string>();

  // 1. Si se invocó desde un movimiento, leer primero el documento para extraer operationId y bookingId
  let movDocData: any = null;
  let movExists = false;
  if (movId) {
    try {
      const mSnap = await getDoc(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId));
      if (mSnap.exists()) {
        movExists = true;
        movDocData = mSnap.data();
        if (movDocData.idempotencyKey) trackedIdemKeys.add(String(movDocData.idempotencyKey));
        if (!opId && movDocData.operationId) {
          opId = String(movDocData.operationId).trim();
        }
        if (!bId && movDocData.bookingId) {
          bId = String(movDocData.bookingId).trim();
        }
      }
    } catch (e) {
      console.warn('[Firestore] Error leyendo movimiento:', e);
    }
  }

  // 2. Si se tiene operationId, leer los datos del documento de operación o transacción
  let opDocData: any = null;
  let opDocExists = false;
  let txDocExists = false;
  if (opId) {
    try {
      const [opSnap, txSnap] = await Promise.all([
        getDoc(doc(db, OPERATIONS_COLLECTION, opId)),
        getDoc(doc(db, TRANSACTIONS_COLLECTION, opId))
      ]);
      opDocExists = opSnap.exists();
      txDocExists = txSnap.exists();
      if (opSnap.exists()) {
        opDocData = opSnap.data();
      } else if (txSnap.exists()) {
        opDocData = txSnap.data();
      }
      if (opDocData) {
        if (opDocData.idempotencyKey) trackedIdemKeys.add(String(opDocData.idempotencyKey));
        if (Array.isArray(opDocData.idempotencyKeys)) {
          opDocData.idempotencyKeys.forEach((k: any) => k && trackedIdemKeys.add(String(k)));
        }
        if (!bId && opDocData.bookingId) {
          bId = String(opDocData.bookingId).trim();
        }
      }
    } catch (e) {
      console.warn('[Firestore] Error leyendo operación:', e);
    }
  }

  // 3. Resolución unificada de ID de Reserva de Cancha
  let resolvedBookingId = bId;
  if (!resolvedBookingId) {
    if (opId && opId.endsWith('-booking')) {
      resolvedBookingId = opId.replace('-booking', '');
    } else if (movId && movId.includes('_deposit_legacy')) {
      resolvedBookingId = movId.split('_deposit_legacy')[0];
    } else if (movDocData?.operationId && movDocData.operationId.endsWith('-booking')) {
      resolvedBookingId = movDocData.operationId.replace('-booking', '');
    } else if (movDocData?.operationId && movDocData.operationId.includes('_deposit_legacy')) {
      resolvedBookingId = movDocData.operationId.split('_deposit_legacy')[0];
    }
  }

  const isOpBookingType = Boolean(
    resolvedBookingId ||
    (opDocData && (
      opDocData.bookingId ||
      opDocData.operationType === 'court_booking' ||
      opDocData.operationType === 'booking'
    )) ||
    (movDocData && (
      movDocData.category === 'Alquiler de Cancha' && (movDocData.bookingId || movDocData.operationId)
    ))
  );

  // CASO A — Corresponde a una Reserva de Cancha: eliminación total en cascada
  if (isOpBookingType) {
    const finalBookingId = resolvedBookingId || opDocData?.bookingId || movDocData?.bookingId || opId?.replace('-booking', '');
    if (finalBookingId) {
      await permanentlyDeleteBookingInFirestore(finalBookingId);
      if (movId && movExists) {
        try {
          await deleteDoc(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId));
        } catch {}
      }
      return { success: true };
    }
  }

  // CASO B — Operación de Mostrador (pos_sale), Compra (purchase) o Gasto (expense)
  const effectiveOpId = opId || movDocData?.operationId || null;
  const rawComplex = opDocData?.complexId || opDocData?.complejoId || movDocData?.complexId || movDocData?.complejoId || params.complexId || 'B';
  const targetComplexId = rawComplex === 'complejo_central' ? 'B' : String(rawComplex);
  const complexCandidates = (targetComplexId === 'B' || rawComplex === 'complejo_central')
    ? ['B', 'complejo_central']
    : [targetComplexId];

  if (opDocData) {
    const isSale = opDocData.operationType === 'pos_sale' || opDocData.type === 'pos' || opDocData.type === 'sale';
    const isPurchase = opDocData.operationType === 'purchase' || opDocData.type === 'purchase' || opDocData.type === 'compra';

    // B.1. Restauración atómica de Stock y tandas PEPS
    if (isSale && Array.isArray(opDocData.items)) {
      const qtyByProduct = new Map<string, number>();
      for (const it of opDocData.items) {
        const pId = String(it.productId || it.id || '').trim();
        const qty = Number(it.quantity) || 0;
        if (pId && qty > 0) {
          qtyByProduct.set(pId, (qtyByProduct.get(pId) || 0) + qty);
        }
      }
      for (const [pId, qty] of qtyByProduct.entries()) {
        try {
          const pRef = doc(db, PRODUCTS_COLLECTION, pId);
          await runTransaction(db, async (t) => {
            const pSnap = await t.get(pRef);
            if (!pSnap.exists()) return;
            const restored = restoreProductBatches(pSnap.data(), pId, qty, () => generateUUID());
            t.update(pRef, {
              stock: restored.newStock,
              batches: restored.updatedBatches,
              updatedAt: serverTimestamp()
            });
          });
        } catch (err) {
          console.warn('[Firestore] Error restaurando stock tras eliminar venta:', err);
        }
      }
    } else if (isPurchase) {
      const pId = opDocData.productId || opDocData.metadata?.productId || (Array.isArray(opDocData.items) && opDocData.items[0]?.productId) || (Array.isArray(opDocData.items) && opDocData.items[0]?.id);
      const qty = Number(opDocData.quantity ?? opDocData.metadata?.quantity ?? (Array.isArray(opDocData.items) && opDocData.items[0]?.quantity) ?? 0);
      if (pId && qty > 0) {
        try {
          const pRef = doc(db, PRODUCTS_COLLECTION, String(pId));
          await runTransaction(db, async (t) => {
            const pSnap = await t.get(pRef);
            if (!pSnap.exists()) return;
            const pData = pSnap.data();
            const currentStock = Number(pData.stock || 0);
            const existingBatches: ProductBatch[] = Array.isArray(pData.batches) ? pData.batches : [];
            const filteredBatches = effectiveOpId
              ? existingBatches.filter(b => b.operationId !== String(effectiveOpId))
              : existingBatches;
            t.update(pRef, {
              stock: Math.max(0, currentStock - qty),
              batches: filteredBatches,
              updatedAt: serverTimestamp()
            });
          });
        } catch (err) {
          console.warn('[Firestore] Error descontando stock tras eliminar compra:', err);
        }
      }
    }

    // B.2. Revertir saldo de deuda en cuenta corriente si aplica (con clamp >= 0)
    const debtAmt = Number(opDocData.currentAccountDebtAmount || 0);
    const userId = opDocData.userId || opDocData.clientId;
    if (debtAmt > 0 && userId) {
      try {
        const userDocRef = doc(db, USERS_COLLECTION, String(userId));
        await runTransaction(db, async (t) => {
          const userDocSnap = await t.get(userDocRef);
          if (!userDocSnap.exists()) return;
          const uData = userDocSnap.data();
          const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
          const opComplex = opDocData.complexId || opDocData.complejoId;
          if (!uOrigin || isSameComplex(uOrigin, opComplex)) {
            const currentDebt = Math.max(0, Number(uData?.debt || 0));
            t.update(userDocRef, {
              debt: Math.max(0, currentDebt - debtAmt),
              updatedAt: serverTimestamp()
            });
          }
        });
      } catch (err) {
        console.warn('[Firestore] Error revirtiendo saldo deudor del cliente:', err);
      }
    }
  }

  // B.3. Eliminación de documentos en Firestore respetando firestore.rules (verificar existencia previa y queries acotadas al complejo)
  const deleteBatch = writeBatch(db);

  if (effectiveOpId) {
    if (opDocExists) {
      deleteBatch.delete(doc(db, OPERATIONS_COLLECTION, String(effectiveOpId)));
    }
    if (txDocExists) {
      deleteBatch.delete(doc(db, TRANSACTIONS_COLLECTION, String(effectiveOpId)));
    }

    // Documentos en financial_movements: caché en memoria primero (0 lecturas), luego query acotada
    const cachedFm = sharedSubscribeFinancialMovements.getCached(targetComplexId);
    if (cachedFm) {
      cachedFm.forEach(mData => {
        if (String(mData.operationId || '') === String(effectiveOpId)) {
          if (mData.idempotencyKey) trackedIdemKeys.add(String(mData.idempotencyKey));
          deleteBatch.delete(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, mData.id));
        }
      });
    } else {
      try {
        const runFmQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
          try {
            return await getDocs(
              query(
                collection(db, FINANCIAL_MOVEMENTS_COLLECTION),
                where(field, '==', cid),
                where('operationId', '==', String(effectiveOpId))
              )
            );
          } catch (qErr: any) {
            if (qErr?.code === 'failed-precondition') {
              return await getDocs(query(collection(db, FINANCIAL_MOVEMENTS_COLLECTION), where(field, '==', cid)));
            }
            throw qErr;
          }
        };
        const fmSnaps = await Promise.all(
          complexCandidates.flatMap(cid => [
            runFmQuery('complexId', cid),
            runFmQuery('complejoId', cid)
          ])
        );
        const seenFmIds = new Set<string>();
        fmSnaps.forEach(snap => {
          snap.forEach(d => {
            const mData = d.data();
            if (!seenFmIds.has(d.id) && String(mData.operationId || '') === String(effectiveOpId)) {
              seenFmIds.add(d.id);
              if (mData.idempotencyKey) trackedIdemKeys.add(String(mData.idempotencyKey));
              deleteBatch.delete(d.ref);
            }
          });
        });
      } catch {}
    }

    // Documentos en inventory_movements acotados por operationId cuando aplica
    try {
      const runImQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
        try {
          return await getDocs(
            query(
              collection(db, INVENTORY_MOVEMENTS_COLLECTION),
              where(field, '==', cid),
              where('operationId', '==', String(effectiveOpId))
            )
          );
        } catch (qErr: any) {
          if (qErr?.code === 'failed-precondition') {
            return await getDocs(query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where(field, '==', cid)));
          }
          throw qErr;
        }
      };
      const imSnaps = await Promise.all(
        complexCandidates.flatMap(cid => [
          runImQuery('complexId', cid),
          runImQuery('complejoId', cid)
        ])
      );
      const seenImIds = new Set<string>();
      imSnaps.forEach(snap => {
        snap.forEach(d => {
          if (!seenImIds.has(d.id) && String(d.data().operationId || '') === String(effectiveOpId)) {
            seenImIds.add(d.id);
            deleteBatch.delete(d.ref);
          }
        });
      });
    } catch {}

    // Documentos en transactions: caché en memoria primero (0 lecturas), luego query acotada
    const cachedTxList = sharedSubscribeTransactions.getCached(targetComplexId);
    if (cachedTxList) {
      cachedTxList.forEach(tData => {
        if (String(tData.id) !== String(effectiveOpId) && String(tData.operationId || '') === String(effectiveOpId)) {
          deleteBatch.delete(doc(db, TRANSACTIONS_COLLECTION, tData.id));
        }
      });
    } else {
      try {
        const runTxOpQuery = async (field: 'complexId' | 'complejoId', cid: string) => {
          try {
            return await getDocs(
              query(
                collection(db, TRANSACTIONS_COLLECTION),
                where(field, '==', cid),
                where('operationId', '==', String(effectiveOpId))
              )
            );
          } catch (qErr: any) {
            if (qErr?.code === 'failed-precondition') {
              return await getDocs(query(collection(db, TRANSACTIONS_COLLECTION), where(field, '==', cid)));
            }
            throw qErr;
          }
        };
        const txSnaps = await Promise.all(
          complexCandidates.flatMap(cid => [
            runTxOpQuery('complexId', cid),
            runTxOpQuery('complejoId', cid)
          ])
        );
        const seenTxIds = new Set<string>([String(effectiveOpId)]);
        txSnaps.forEach(snap => {
          snap.forEach(d => {
            if (!seenTxIds.has(d.id) && String(d.data().operationId || '') === String(effectiveOpId)) {
              seenTxIds.add(d.id);
              deleteBatch.delete(d.ref);
            }
          });
        });
      } catch {}
    }
  }

  // Eliminar claves de idempotencia rastreadas por get() directo (compatible con rules)
  if (trackedIdemKeys.size > 0) {
    try {
      const idemSnaps = await Promise.all(
        Array.from(trackedIdemKeys).map(k => getDoc(doc(db, IDEMPOTENCY_COLLECTION, k)))
      );
      idemSnaps.forEach(s => {
        if (s.exists()) deleteBatch.delete(s.ref);
      });
    } catch {}
  }

  // Fallback opcional solo si no se rastreó ninguna clave y el usuario posee permisos list
  if (effectiveOpId && trackedIdemKeys.size === 0) {
    try {
      const idempSnap = await getDocs(
        query(collection(db, IDEMPOTENCY_COLLECTION), where('operationId', '==', String(effectiveOpId)))
      );
      idempSnap.forEach(d => {
        if (!trackedIdemKeys.has(d.id)) {
          deleteBatch.delete(d.ref);
        }
      });
    } catch {}
  }

  if (movId && movExists) {
    deleteBatch.delete(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId));
  }

  await deleteBatch.commit();
  return { success: true };
}

/**
 * Obtiene una operación por su ID.
 */
export async function getOperationById(operationId: string): Promise<OperationDocument | null> {
  const opRef = doc(db, OPERATIONS_COLLECTION, operationId);
  const snap = await getDoc(opRef);
  if (!snap.exists()) return null;
  return snap.data() as OperationDocument;
}

/**
 * Escucha los movimientos financieros asociados a una operación específica.
 */
export function subscribeToMovementsByOperation(
  operationId: string,
  cb: (movements: FinancialMovementDocument[]) => void
): () => void {
  const colRef = collection(db, FINANCIAL_MOVEMENTS_COLLECTION);
  const q = query(colRef, where('operationId', '==', operationId));

  return onSnapshot(q, (snap) => {
    const list: FinancialMovementDocument[] = [];
    snap.forEach((d) => {
      list.push(d.data() as FinancialMovementDocument);
    });
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tA - tB; // Cronológico
    });
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando movimientos de operación:', err);
    cb([]);
  });
}

/**
 * Registra un cobro de una operación existente soportando uno o varios métodos de pago
 * de forma atómica y consistente con la deuda del usuario y saldo pendiente.
 */
export async function registerOperationPaymentsBatch(params: {
  complexId: string;
  operationId: string;
  operatorId: string;
  payments: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    idempotencyKey: string;
    notes?: string;
  }>;
  notes?: string;
  idempotencyKey?: string;
}): Promise<PaymentRegistrationResult> {
  const targetComplexId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;

  const realPayments = (Array.isArray(params.payments) ? params.payments : [])
    .map(p => ({
      amount: Math.max(0, Number(p?.amount) || 0),
      paymentMethod: normalizeMonetaryPaymentMethod(p?.paymentMethod || (p as any)?.method),
      idempotencyKey: p?.idempotencyKey,
      notes: p?.notes
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; idempotencyKey: string; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null
    );

  const totalAmount = realPayments.reduce((s, p) => s + p.amount, 0);
  if (totalAmount <= 0 || realPayments.length === 0) {
    throw new Error('El importe total a cobrar debe ser mayor a 0 con un método monetario válido.');
  }

  // Si es un solo método real, ejecutar registerOperationPayment estándar
  if (realPayments.length === 1) {
    const single = realPayments[0];
    return await registerOperationPayment({
      complexId: targetComplexId,
      operationId: params.operationId,
      amount: single.amount,
      paymentMethod: single.paymentMethod,
      idempotencyKey: params.idempotencyKey || single.idempotencyKey,
      operatorId: params.operatorId,
      notes: single.notes || params.notes
    });
  }

  // Para pagos divididos sobre la misma operación, ejecutar atómicamente en una transacción generando 1 único movimiento
  const opRef = doc(db, OPERATIONS_COLLECTION, params.operationId);
  const batchIdemKey = params.idempotencyKey || realPayments[0].idempotencyKey;

  const preOp = await precheckOperationExists(opRef, targetComplexId, params.operationId);
  if (!preOp.exists) {
    throw new Error(`Operación '${params.operationId}' no encontrada.`);
  }

  const shouldCheckUserDebt = Boolean(
    preOp.opData &&
    Number(preOp.opData.currentAccountDebtAmount || 0) > 0 &&
    !isSyntheticUserId(preOp.opData.userId)
  );
  const canAccessUserDebt = shouldCheckUserDebt
    ? await precheckUserDocAccessible(preOp.opData?.userId, targetComplexId)
    : false;

  try {
    return await runTransaction(db, async (t) => {
      // 1. Lecturas
      const opSnap = await t.get(opRef);
      if (!opSnap.exists()) {
        throw new Error(`Operación '${params.operationId}' no encontrada.`);
      }

      const opData = opSnap.data() as OperationDocument;
      const userRef = (opData.userId && Number(opData.currentAccountDebtAmount || 0) > 0 && canAccessUserDebt)
        ? doc(db, USERS_COLLECTION, String(opData.userId))
        : null;
      const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, String(opData.bookingId)) : null;

      const [userSnap, bookingSnap] = await Promise.all([
        userRef ? t.get(userRef) : Promise.resolve(null),
        bookingRef ? t.get(bookingRef) : Promise.resolve(null)
      ]);

      // Lectura de idempotencia del acto de cobro
      const idemSnaps = await Promise.all(
        [batchIdemKey, ...realPayments.map(p => p.idempotencyKey)]
          .filter((k, idx, arr) => Boolean(k) && arr.indexOf(k) === idx)
          .map(k => t.get(doc(db, IDEMPOTENCY_COLLECTION, k)))
      );

      // 2. Validaciones
      const opComplex = opData.complexId || (opData as any).complejoId;
      if (opComplex && !isSameComplex(opComplex, targetComplexId)) {
        throw new Error('La operación no pertenece al complejo activo.');
      }
      if (isJogoBillingOperation(opData)) {
        throw new Error('Los cobros de Jogo solo pueden ser registrados por la administración de Jogo.');
      }
      if (['cancelled_unpaid', 'cancelled_retained', 'fully_refunded'].includes(opData.paymentStatus)) {
        throw new Error(`No se pueden registrar cobros sobre una operación cancelada (${opData.paymentStatus}).`);
      }
      if (opData.amountPending <= 0) {
        throw new Error('La operación ya se encuentra totalmente saldada.');
      }

      // Si el acto de cobro ya fue completado, detectar idempotencia
      const completedSnap = idemSnaps.find(s => s.exists() && (s.data() as IdempotencyRecord).status === 'completed');
      if (completedSnap) {
        return {
          success: true,
          operationId: params.operationId,
          movementId: (completedSnap.data() as IdempotencyRecord)?.movementId || null,
          ticketCode: opData.ticketCode,
          paymentStatus: opData.paymentStatus,
          amountPending: opData.amountPending,
          currentAccountDebtAmount: opData.currentAccountDebtAmount,
          clearedCurrentAccountDebt: 0,
          alreadyProcessed: true
        };
      }

      const newTotalCollected = opData.totalCollected + totalAmount;
      const balances = calculateFinancialBalances({
        contractualAmount: opData.contractualAmount,
        totalCollected: newTotalCollected,
        totalRefunded: opData.totalRefunded
      });

      const trans = validateStateTransition(opData.paymentStatus, balances.paymentStatus);
      if (!trans.valid) {
        throw new Error(trans.reason);
      }

      let clearedDebt = 0;
      let remainingOpDebt = 0;
      if (opData.currentAccountDebtAmount > 0) {
        const clearing = calculateCurrentAccountClearing(opData.currentAccountDebtAmount, totalAmount);
        clearedDebt = clearing.clearedDebtAmount;
        remainingOpDebt = clearing.remainingOperationDebt;
      }

      const isExpense = opData.operationType === 'expense' || opData.operationType === 'purchase';
      const movementFlow: 'income' | 'expense' = isExpense ? 'expense' : 'income';
      const category: FinancialMovementCategory = isExpense ? 'expense_payment' : (opData.operationType === 'court_booking' ? 'booking_settlement' : 'sale_collection');

      // 3. Escrituras: 1 ÚNICO documento en /financial_movements y 1 registro de idempotencia
      const builtBatchMov = buildSingleMovementPayload({
        payments: realPayments,
        complexId: targetComplexId,
        operationId: params.operationId,
        bookingId: opData.bookingId || null,
        ticketCode: opData.ticketCode,
        flow: movementFlow,
        category,
        responsibleName: opData.userName || opData.clientName || 'NN',
        userId: opData.userId || opData.clientId || null,
        userPhone: opData.userPhone || opData.clientPhone || '',
        clearedCurrentAccountDebt: clearedDebt,
        notes: params.notes || '',
        operatorId: params.operatorId,
        idempotencyKey: batchIdemKey
      });

      if (!builtBatchMov) {
        throw new Error('El importe total a cobrar debe ser mayor a 0.');
      }

      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtBatchMov.movId);
      t.set(movRef, builtBatchMov.movDocData);

      const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, batchIdemKey);
      t.set(pIdemRef, {
        idempotencyKey: batchIdemKey,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        operationId: params.operationId,
        amount: builtBatchMov.totalAmount,
        paymentMethod: builtBatchMov.paymentMethod,
        flow: movementFlow,
        status: 'completed',
        movementId: builtBatchMov.movId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });

      // Actualizar operación
      t.update(opRef, {
        totalCollected: balances.totalCollected,
        netCollected: balances.netCollected,
        amountPending: balances.amountPending,
        paymentStatus: balances.paymentStatus,
        currentAccountDebtAmount: remainingOpDebt,
        idempotencyKeys: arrayUnion(batchIdemKey),
        updatedAt: serverTimestamp()
      });

      // Descontar users/{userId}.debt con clamp >= 0
      if (clearedDebt > 0 && userRef && userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        if (!uOrigin || isSameComplex(uOrigin, targetComplexId)) {
          const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
          t.update(userRef, {
            debt: Math.max(0, currentUserDebt - clearedDebt),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Sincronizar reserva si aplica
      if (bookingRef && bookingSnap && bookingSnap.exists()) {
        t.update(bookingRef, {
          paymentStatus: balances.paymentStatus,
          payment_status: balances.paymentStatus,
          deposit: balances.totalCollected,
          amount_paid: balances.totalCollected,
          idempotencyKeys: arrayUnion(batchIdemKey),
          updatedAt: serverTimestamp()
        });
      }

      return {
        success: true,
        operationId: params.operationId,
        movementId: builtBatchMov.movId,
        ticketCode: opData.ticketCode,
        paymentStatus: balances.paymentStatus,
        amountPending: balances.amountPending,
        currentAccountDebtAmount: remainingOpDebt,
        clearedCurrentAccountDebt: clearedDebt
      };
    });
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, FirestoreOpType.WRITE, `${OPERATIONS_COLLECTION}/${params.operationId}`);
    }
    throw err;
  }
}

/**
 * Liquida cobros sobre transacciones históricas (/transactions) o reservas virtuales
 * registrando un único movimiento financiero en /financial_movements y actualizando
 * el estado y la deuda de los clientes de forma atómica y consistente.
 */
export async function settleLegacyOrVirtualDebt(params: {
  complexId: string;
  operationId: string;
  operatorId: string;
  payments: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    idempotencyKey: string;
    notes?: string;
  }>;
  ticketCode?: string;
  userName?: string;
  userId?: string | null;
  bookingId?: string | null;
  totalPending: number;
  notes?: string;
  isExpense?: boolean;
}): Promise<void> {
  const targetComplexId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;

  const realPayments = (Array.isArray(params.payments) ? params.payments : [])
    .map(p => ({
      amount: Math.max(0, Number(p?.amount) || 0),
      paymentMethod: normalizeMonetaryPaymentMethod(p?.paymentMethod || (p as any)?.method),
      idempotencyKey: p?.idempotencyKey,
      notes: p?.notes
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; idempotencyKey: string; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null
    );

  const totalAmount = realPayments.reduce((s, p) => s + p.amount, 0);
  if (totalAmount <= 0 || realPayments.length === 0) {
    throw new Error(params.isExpense ? 'El importe a pagar debe ser mayor a 0 con un método monetario válido.' : 'El importe a cobrar debe ser mayor a 0 con un método monetario válido.');
  }

  const resolvedSettleName = resolveClientName(params);
  const resolvedSettlePhone = resolveClientPhone(params);
  const settleClientId = !isSyntheticUserId(params.userId) ? String(params.userId) : null;
  const isExp = Boolean(params.isExpense);
  const movFlow: 'income' | 'expense' = isExp ? 'expense' : 'income';
  const category: FinancialMovementCategory = isExp
    ? 'expense_payment'
    : (params.bookingId ? 'booking_settlement' : 'historical_debt_payment');
  const settleIdemKey = realPayments[0].idempotencyKey;

  try {
    // 1. Registrar 1 único movimiento financiero y 1 registro de idempotencia
    const builtSettleMov = buildSingleMovementPayload({
      payments: realPayments,
      complexId: targetComplexId,
      operationId: params.operationId,
      bookingId: params.bookingId || null,
      ticketCode: params.ticketCode || params.operationId.slice(0, 8),
      flow: movFlow,
      category,
      responsibleName: resolvedSettleName,
      userId: settleClientId,
      userPhone: resolvedSettlePhone,
      notes: params.notes || (isExp ? 'Pago saldo pendiente proveedor' : 'Cobro saldo pendiente'),
      operatorId: params.operatorId,
      idempotencyKey: settleIdemKey
    });

    if (builtSettleMov) {
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, builtSettleMov.movId);
      await setDoc(movRef, builtSettleMov.movDocData);

      const idemRef = doc(db, IDEMPOTENCY_COLLECTION, settleIdemKey);
      await setDoc(idemRef, {
        idempotencyKey: settleIdemKey,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        operationId: params.operationId,
        amount: builtSettleMov.totalAmount,
        paymentMethod: builtSettleMov.paymentMethod,
        flow: movFlow,
        status: 'completed',
        movementId: builtSettleMov.movId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, FirestoreOpType.WRITE, `${FINANCIAL_MOVEMENTS_COLLECTION}/${params.operationId}`);
    }
    throw err;
  }

  // 2. Si es una reserva, actualizar documento en bookings
  if (params.bookingId) {
    try {
      const bRef = doc(db, BOOKINGS_COLLECTION, params.bookingId);
      const bSnap = await getDoc(bRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        const currentPaid = Number(bData.amount_paid || bData.deposit || 0);
        const newPaid = currentPaid + totalAmount;
        const totalPrice = Number(bData.price || bData.price_total || 0);
        const isPaid = newPaid >= totalPrice - 0.01;

        await updateDoc(bRef, {
          amount_paid: newPaid,
          deposit: newPaid,
          paymentStatus: isPaid ? 'paid' : 'partial',
          payment_status: isPaid ? 'paid' : 'partial',
          idempotencyKeys: arrayUnion(settleIdemKey),
          updatedAt: serverTimestamp()
        });

        // Sincronizar también la operación comercial única de la reserva si existe
        const opDocId = `${params.bookingId}-booking`;
        const opRef = doc(db, OPERATIONS_COLLECTION, opDocId);
        const opCheck = await precheckOperationExists(opRef, targetComplexId, opDocId);
        if (opCheck.exists) {
          const opSnap = await getDoc(opRef);
          if (opSnap.exists()) {
            const opData = opSnap.data();
            const currentOpDebt = Math.max(0, Number(opData.currentAccountDebtAmount || 0));
            await updateDoc(opRef, {
              totalCollected: newPaid,
              netCollected: newPaid - (opData.totalRefunded || 0),
              amountPending: Math.max(0, totalPrice - newPaid),
              currentAccountDebtAmount: Math.max(0, currentOpDebt - totalAmount),
              paymentStatus: isPaid ? 'paid' : 'partial',
              idempotencyKeys: arrayUnion(settleIdemKey),
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    } catch (bErr) {
      console.warn('[Firestore] Error actualizando reserva:', bErr);
    }
  } else {
    // 3. Si es una transacción en /transactions, actualizar su desglose
    try {
      const cachedTxs = sharedSubscribeTransactions.getCached(targetComplexId);
      const txKnownPresent = !Array.isArray(cachedTxs) || cachedTxs.some(t => String(t.id) === String(params.operationId));
      if (txKnownPresent) {
        const txRef = doc(db, TRANSACTIONS_COLLECTION, params.operationId);
        const txSnap = await getDoc(txRef);
        if (txSnap.exists()) {
          const txData = txSnap.data();
          const currentPayments = Array.isArray(txData.payments) ? [...txData.payments] : [];
          for (const p of realPayments) {
            currentPayments.push({
              method: p.paymentMethod,
              amount: p.amount
            });
          }
          const totalPaidAll = currentPayments
            .filter(p => normalizeMonetaryPaymentMethod(p.method) !== null)
            .reduce((s, p) => s + Number(p.amount || 0), 0);
          const txTotal = Number(txData.total || txData.amount || 0);
          const isFullyPaid = totalPaidAll >= txTotal - 0.01;

          await updateDoc(txRef, {
            payments: currentPayments,
            paymentStatus: isFullyPaid ? 'paid' : 'partial',
            settledAt: serverTimestamp()
          });
        }
      }
    } catch (txErr) {
      console.warn('[Firestore] Error actualizando transacción histórica:', txErr);
    }
  }

  // 4. Si el cliente tiene cuenta con deuda, reducir users/{userId}.debt con clamp >= 0
  if (settleClientId) {
    try {
      const canTouchUser = await precheckUserDocAccessible(settleClientId, targetComplexId);
      if (canTouchUser) {
        const userRef = doc(db, USERS_COLLECTION, settleClientId);
        await runTransaction(db, async (t) => {
          const userSnap = await t.get(userRef);
          if (!userSnap.exists()) return;
          const uData = userSnap.data();
          const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
          if (!uOrigin || isSameComplex(uOrigin, targetComplexId)) {
            const currentDebt = Math.max(0, Number(uData?.debt || 0));
            t.update(userRef, {
              debt: Math.max(0, currentDebt - totalAmount),
              updatedAt: serverTimestamp()
            });
          }
        });
      }
    } catch (uErr) {
      console.warn('[Firestore] Error actualizando deuda de usuario:', uErr);
    }
  }
}

/**
 * Registra un cobro adicional o seña sobre una reserva desde su tarjeta de detalle.
 * Actualiza atómicamente la reserva, la operación comercial única y crea un movimiento
 * independiente en /financial_movements sin duplicar operaciones comerciales.
 */
export async function registerBookingPaymentInFirestore(params: {
  bookingId: string | number;
  complexId: string;
  amount: number;
  paymentMethod?: FinancialPaymentMethod;
  payments?: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod | string;
    notes?: string;
  }>;
  playerUpdate?: {
    id?: string;
    userId?: string;
    name: string;
    phone?: string;
    isHost?: boolean;
    amount: number;
  } | null;
  operatorId?: string;
  idempotencyKey?: string;
  notes?: string;
}): Promise<{ success: boolean; movementId: string }> {
  const strBookingId = String(params.bookingId);
  const targetComplexId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;

  const rawPaymentsList = (Array.isArray(params.payments) && params.payments.length > 0
    ? params.payments
    : [{ amount: params.amount, paymentMethod: params.paymentMethod || 'cash', notes: params.notes }]
  )
    .map(p => ({
      amount: Math.max(0, Number(p?.amount) || 0),
      paymentMethod: normalizeMonetaryPaymentMethod(p?.paymentMethod),
      notes: p?.notes
    }))
    .filter((p): p is { amount: number; paymentMethod: FinancialPaymentMethod; notes: string | undefined } =>
      p.amount > 0 && p.paymentMethod !== null && p.paymentMethod !== 'mixed'
    );

  const payAmt = rawPaymentsList.reduce((sum, p) => sum + p.amount, 0);
  if (payAmt <= 0 || rawPaymentsList.length === 0) {
    throw new Error('Debe seleccionar un medio de pago monetario válido (Efectivo, Transferencia, Tarjeta o Mercado Pago) con importe mayor a $0.');
  }

  const bRef = doc(db, BOOKINGS_COLLECTION, strBookingId);
  const opDocId = `${strBookingId}-booking`;
  const opRef = doc(db, OPERATIONS_COLLECTION, opDocId);
  const idemKey = params.idempotencyKey || `pay_booking_${strBookingId}_${Date.now()}`;
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);

  // Precheck before transaction so we never trigger `resource == null` permission-denied on missing op/user docs
  const preOp = await precheckOperationExists(opRef, targetComplexId, opDocId);
  const opDebtHint = Number(preOp.opData?.currentAccountDebtAmount || 0);
  const opUserHint = preOp.opData?.userId || preOp.opData?.clientId || null;
  const canReadOpUserDebt = (preOp.exists && opDebtHint > 0 && !isSyntheticUserId(opUserHint))
    ? await precheckUserDocAccessible(opUserHint, targetComplexId)
    : false;

  try {
    return await runTransaction(db, async (t) => {
      // 1. Lecturas
      const [bSnap, opSnap, idemSnap] = await Promise.all([
        t.get(bRef),
        preOp.exists ? t.get(opRef) : Promise.resolve(null),
        t.get(idemRef)
      ]);

      if (!bSnap.exists()) {
        throw new Error(`Reserva '${strBookingId}' no encontrada.`);
      }

      // Idempotencia
      if (idemSnap.exists() && idemSnap.data()?.status === 'completed') {
        return {
          success: true,
          movementId: idemSnap.data()?.movementId || ''
        };
      }

      const bData = bSnap.data();
      const opExists = Boolean(opSnap && opSnap.exists());
      const opDataExisting = opExists ? opSnap!.data() : null;
      const bookingClientId = bData.userId || bData.host_id || opDataExisting?.userId || null;

      let canReadUserNow = canReadOpUserDebt;
      const hasOpDebt = opExists && Number(opDataExisting?.currentAccountDebtAmount || 0) > 0;
      const resolvedDebtUserId = opDataExisting?.userId || bookingClientId;
      if (!canReadUserNow && hasOpDebt && !isSyntheticUserId(resolvedDebtUserId)) {
        const cachedRaw = rawClientsByComplexMap.get(targetComplexId);
        canReadUserNow = Boolean(cachedRaw && cachedRaw.has(String(resolvedDebtUserId)));
      }

      const userRef = (hasOpDebt && canReadUserNow && !isSyntheticUserId(resolvedDebtUserId))
        ? doc(db, USERS_COLLECTION, String(resolvedDebtUserId))
        : null;
      const userSnap = userRef ? await t.get(userRef) : null;

      const totalPrice = Number(bData.price ?? bData.price_total ?? 0);
      const previousPaid = Number(bData.amount_paid ?? bData.deposit ?? 0);
      const newPaid = previousPaid + payAmt;
      const newPending = Math.max(0, totalPrice - newPaid);
      const isFullyPaid = newPaid >= totalPrice - 0.01 && totalPrice > 0;
      const paymentStatusEs = isFullyPaid ? 'pagado' : 'seña';
      const paymentStatusEn = isFullyPaid ? 'paid' : 'partial';

      const ticketCode = (opExists && opDataExisting?.ticketCode)
        ? opDataExisting.ticketCode
        : `B-${strBookingId.slice(0, 6).toUpperCase()}`;

      const movCategory: FinancialMovementCategory = isFullyPaid ? 'booking_settlement' : 'booking_deposit';

      const resolvedBookingClient = resolveClientName(bData, null, opDataExisting);
      const resolvedBookingPhone = resolveClientPhone(bData, null, opDataExisting);

      let clearedDebt = 0;
      let remainingOpDebt = 0;
      if (hasOpDebt) {
        const clearing = calculateCurrentAccountClearing(Number(opDataExisting?.currentAccountDebtAmount || 0), payAmt);
        clearedDebt = clearing.clearedDebtAmount;
        remainingOpDebt = clearing.remainingOperationDebt;
      }

      const builtBookingPayMov = buildSingleMovementPayload({
        payments: rawPaymentsList,
        complexId: targetComplexId,
        operationId: opDocId,
        bookingId: strBookingId,
        ticketCode,
        flow: 'income',
        category: movCategory,
        responsibleName: resolvedBookingClient,
        userId: !isSyntheticUserId(bookingClientId) ? String(bookingClientId) : null,
        userPhone: resolvedBookingPhone,
        clearedCurrentAccountDebt: clearedDebt,
        notes: params.notes || `Cobro seña/saldo reserva ${bData.courtName || bData.court_name || 'Cancha'}`,
        operatorId: params.operatorId || 'pos_operator',
        idempotencyKey: idemKey
      });

      if (!builtBookingPayMov) {
        throw new Error('El importe a cobrar debe ser mayor a $0.');
      }

      const movId = builtBookingPayMov.movId;
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);

      // 2. Escrituras atómicas
      // 2.1 Movimiento financiero en /financial_movements
      t.set(movRef, builtBookingPayMov.movDocData);

      // 2.2 Registro de idempotencia
      t.set(idemRef, {
        idempotencyKey: idemKey,
        complexId: targetComplexId,
        complejoId: targetComplexId,
        operationId: opDocId,
        bookingId: strBookingId,
        amount: payAmt,
        paymentMethod: builtBookingPayMov.paymentMethod,
        flow: 'income',
        status: 'completed',
        movementId: movId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });

      // 2.3 Operación comercial única (conserva una sola fila para la reserva)
      if (opExists && opDataExisting) {
        t.update(opRef, {
          totalCollected: newPaid,
          netCollected: newPaid - (opDataExisting.totalRefunded || 0),
          amountPending: newPending,
          paymentStatus: paymentStatusEn,
          currentAccountDebtAmount: remainingOpDebt,
          idempotencyKeys: arrayUnion(idemKey),
          updatedAt: serverTimestamp()
        });
      } else {
        t.set(opRef, {
          id: opDocId,
          complexId: targetComplexId,
          complejoId: targetComplexId,
          ticketCode,
          operationType: 'court_booking',
          bookingId: strBookingId,
          responsibleType: bData.userId && bData.userId !== '0' ? 'user' : 'anonymous',
          userId: bData.userId && bData.userId !== '0' ? bData.userId : null,
          userName: resolvedBookingClient,
          userPhone: bData.userPhone || bData.clientPhone || '',
          contractualAmount: totalPrice,
          totalCollected: newPaid,
          totalRefunded: 0,
          netCollected: newPaid,
          retainedAmount: 0,
          amountPending: newPending,
          paymentStatus: paymentStatusEn,
          currentAccountAssigned: false,
          currentAccountDebtAmount: 0,
          idempotencyKey: idemKey,
          idempotencyKeys: [idemKey],
          notes: bData.notes || `Reserva ${bData.courtName || 'Cancha'} ${bData.date || ''}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: params.operatorId || 'pos_operator'
        });
      }

      // 2.4 Descontar deuda de usuario si correspondía
      if (clearedDebt > 0 && userRef && userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        if (!uOrigin || isSameComplex(uOrigin, targetComplexId)) {
          const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
          t.update(userRef, {
            debt: Math.max(0, currentUserDebt - clearedDebt),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 2.5 Actualizar documento de la reserva (incluyendo imputación de jugador si aplica)
      const bookingUpdatePayload: Record<string, any> = {
        deposit: newPaid,
        amount_paid: newPaid,
        paymentStatus: paymentStatusEs,
        payment_status: paymentStatusEn,
        idempotencyKeys: arrayUnion(idemKey),
        updatedAt: serverTimestamp()
      };

      if (params.playerUpdate) {
        const pUpd = params.playerUpdate;
        const pAmt = Math.max(0, Number(pUpd.amount || payAmt));
        const playersList = Array.isArray(bData.players) ? [...bData.players] : [];

        const isTargetHost = Boolean(
          pUpd.isHost ||
          (pUpd.id && (pUpd.id === bData.userId || pUpd.id === bData.host_id)) ||
          (bData.host_name && pUpd.name && String(bData.host_name).trim().toLowerCase() === String(pUpd.name).trim().toLowerCase()) ||
          (bData.userName && pUpd.name && String(bData.userName).trim().toLowerCase() === String(pUpd.name).trim().toLowerCase())
        );

        const pIdx = playersList.findIndex((p: any) =>
          (pUpd.id && (String(p.id) === String(pUpd.id) || String(p.userId) === String(pUpd.id))) ||
          (p.name && pUpd.name && String(p.name).trim().toLowerCase() === String(pUpd.name).trim().toLowerCase())
        );

        if (pIdx >= 0) {
          const prevAmt = Number(playersList[pIdx].amountPaid || playersList[pIdx].amount_paid || 0);
          playersList[pIdx] = {
            ...playersList[pIdx],
            amountPaid: prevAmt + pAmt,
            amount_paid: prevAmt + pAmt,
            has_paid: true,
            ...(isTargetHost ? { isHost: true } : {})
          };
        } else if (!isTargetHost && pUpd.name && pUpd.name !== 'NN') {
          playersList.push({
            id: pUpd.id || `player_${Date.now()}`,
            ...(pUpd.userId ? { userId: pUpd.userId } : {}),
            name: pUpd.name,
            phone: pUpd.phone || '',
            amountPaid: pAmt,
            amount_paid: pAmt,
            has_paid: true,
            isHost: false
          });
        }

        bookingUpdatePayload.players = playersList;
        if (isTargetHost) {
          const prevHostAmt = Number(bData.hostAmountPaid ?? bData.host_amount_paid ?? 0);
          bookingUpdatePayload.hostAmountPaid = prevHostAmt + pAmt;
          bookingUpdatePayload.host_amount_paid = prevHostAmt + pAmt;
        }
      }

      t.update(bRef, bookingUpdatePayload);

      return {
        success: true,
        movementId: movId
      };
    });
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, FirestoreOpType.WRITE, `${BOOKINGS_COLLECTION}/${strBookingId}`);
    }
    throw err;
  }
}

export interface CancelBookingWithPolicyParams {
  complexId: string;
  bookingId: string;
  operatorId: string;
  refundChoice: 'full' | 'none' | 'partial';
  partialRefundAmount?: number;
  refundPaymentMethod?: FinancialPaymentMethod;
  idempotencyKey?: string;
  reason?: string;
}

/**
 * Cancela una reserva aplicando la política de cancelación y registrando
 * atómicamente la devolución y los estados sin inconsistencias ni escrituras parciales.
 */
export async function cancelBookingWithPolicy(
  params: CancelBookingWithPolicyParams
): Promise<{
  success: boolean;
  refundAmount: number;
  retainedAmount: number;
  finalPaymentStatus: string;
  refundMovementId?: string;
  alreadyProcessed?: boolean;
}> {
  const bRef = doc(db, BOOKINGS_COLLECTION, params.bookingId);
  const idemRef = params.idempotencyKey ? doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey) : null;
  let userIdToSync: string | null = null;

  const result = await runTransaction(db, async (t) => {
    // 1. Lecturas (todas antes de cualquier escritura)
    const [bSnap, idemSnap] = await Promise.all([
      t.get(bRef),
      idemRef ? t.get(idemRef) : Promise.resolve(null)
    ]);

    if (!bSnap.exists()) {
      throw new Error(`Reserva '${params.bookingId}' no encontrada.`);
    }

    const bData = bSnap.data();
    if (bData?.createdSource === 'jogo') {
      throw new Error('Las reservas generadas por Jogo no pueden cancelarse ni eliminarse desde el complejo.');
    }
    const isAlreadyCancelled = bData.status === 'cancelado' || bData.status === 'cancelled';

    if (idemSnap && idemSnap.exists() && idemSnap.data()?.status === 'completed') {
      return {
        success: true,
        refundAmount: Number(idemSnap.data()?.amount || 0),
        retainedAmount: Number(bData.retainedAmount || 0),
        finalPaymentStatus: bData.paymentStatus || bData.payment_status || 'cancelled_unpaid',
        refundMovementId: idemSnap.data()?.movementId,
        alreadyProcessed: true
      };
    }

    if (isAlreadyCancelled) {
      return {
        success: true,
        refundAmount: Number(bData.totalRefunded || 0),
        retainedAmount: Number(bData.retainedAmount || 0),
        finalPaymentStatus: bData.paymentStatus || bData.payment_status || 'cancelled_unpaid',
        alreadyProcessed: true
      };
    }

    const directOpRef = doc(db, OPERATIONS_COLLECTION, `${params.bookingId}-booking`);
    const directOpSnap = await t.get(directOpRef);
    const opRef = directOpSnap.exists() ? directOpRef : null;
    const opSnap = directOpSnap.exists() ? directOpSnap : null;

    const rawUserId = bData.userId || bData.host_id || (opSnap?.exists() ? opSnap.data().userId : null);
    if (rawUserId && String(rawUserId) !== '0') {
      userIdToSync = String(rawUserId);
    }
    const userRef = userIdToSync ? doc(db, USERS_COLLECTION, userIdToSync) : null;
    const userSnap = userRef ? await t.get(userRef) : null;

    // Leer complejo y booking_locks en Fase 1 para liberarlos dentro de la transacción
    const rawComplex = bData.complejoId || bData.complexId || params.complexId || 'B';
    const targetComplexId = rawComplex === 'complejo_central' ? 'B' : String(rawComplex);
    const courtId = String(bData.courtId || bData.court_id || 'c_1');
    const date = bData.date;

    let lockEntries: Array<{ ref: ReturnType<typeof doc>; snap: any }> = [];
    if (targetComplexId && courtId && date) {
      const compSnap = await t.get(doc(db, COMPLEJOS_COLLECTION, targetComplexId));
      const affectedCourts = getOverlappingCourtIdsFromList(compSnap.exists() ? compSnap.data() : null, courtId);
      const lockRefs = affectedCourts.map(cid =>
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${date}`)
      );
      const lockSnaps = await Promise.all(lockRefs.map(ref => t.get(ref)));
      lockEntries = lockRefs.map((ref, idx) => ({ ref, snap: lockSnaps[idx] }));
    }

    const contractualAmount = Number(bData.price ?? bData.price_total ?? 0);
    const totalCollected = Number(bData.deposit ?? bData.amount_paid ?? 0);
    const previousRefunds = Number(bData.totalRefunded ?? 0);

    const plan = calculateCancellationFinancialPlan({
      contractualAmount,
      totalCollected,
      previousRefunds,
      refundChoice: params.refundChoice,
      partialAmount: params.partialRefundAmount
    });

    const refundMethod = (plan.refundAmount > 0 && totalCollected > 0)
      ? (normalizeMonetaryPaymentMethod(params.refundPaymentMethod || 'cash') || 'cash')
      : 'other';

    // 2. Escrituras atómicas
    // 2.1 Actualizar documento en bookings
    t.update(bRef, {
      status: 'cancelado',
      cancelledSource: 'complejo',
      paymentStatus: plan.finalPaymentStatus,
      payment_status: plan.finalPaymentStatus,
      amountPending: 0,
      totalRefunded: previousRefunds + plan.refundAmount,
      retainedAmount: plan.retainedAmount,
      cancellationReason: params.reason || '',
      ...(params.idempotencyKey ? { idempotencyKeys: arrayUnion(params.idempotencyKey) } : {}),
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 2.2 Liberar booking_locks atómicamente
    for (const entry of lockEntries) {
      if (entry.snap.exists()) {
        const bMap = { ...(entry.snap.data().bookings || {}) };
        if (bMap[params.bookingId]) {
          delete bMap[params.bookingId];
          t.update(entry.ref, {
            bookings: bMap,
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    // 2.3 Registrar movimiento de egreso si hay devolución
    let refundMovementId: string | undefined = undefined;
    if (plan.refundAmount > 0 && totalCollected > 0) {
      refundMovementId = generateUUID();
      const refundMovRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, refundMovementId);
      const ticketCode = (opSnap?.exists() && opSnap.data()?.ticketCode)
        ? opSnap.data().ticketCode
        : `B-${params.bookingId.slice(0, 6).toUpperCase()}`;

      t.set(refundMovRef, {
        id: refundMovementId,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId: opRef ? opRef.id : `${params.bookingId}-booking`,
        bookingId: params.bookingId,
        ticketCode,
        idempotencyKey: params.idempotencyKey || generateUUID(),
        flow: 'expense',
        category: 'refund',
        amount: plan.refundAmount,
        paymentMethod: refundMethod,
        effectiveDate: serverTimestamp(),
        userId: bData.userId || null,
        responsibleName: resolveClientName(bData),
        clearedCurrentAccountDebt: 0,
        notes: `Devolución seña reserva ${params.bookingId}: ${params.reason || ''}`,
        operatorId: params.operatorId,
        createdAt: serverTimestamp()
      });

      if (idemRef) {
        t.set(idemRef, {
          idempotencyKey: params.idempotencyKey,
          complexId: params.complexId,
          complejoId: params.complexId,
          operationId: `${params.bookingId}-booking`,
          bookingId: params.bookingId,
          amount: plan.refundAmount,
          paymentMethod: refundMethod,
          flow: 'expense',
          status: 'completed',
          movementId: refundMovementId,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    } else if (idemRef) {
      t.set(idemRef, {
        idempotencyKey: params.idempotencyKey,
        complexId: params.complexId,
        complejoId: params.complexId,
        bookingId: params.bookingId,
        amount: 0,
        paymentMethod: 'other',
        flow: 'expense',
        status: 'completed',
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 2.4 Actualizar operación si existía y extinguir deuda fiada con clamp >= 0
    if (opRef && opSnap) {
      const opData = opSnap.data();
      const debtToExtinguish = Number(opData.currentAccountDebtAmount || 0);

      t.update(opRef, {
        originalContractualAmount: opData.contractualAmount ?? contractualAmount,
        contractualAmount: totalCollected,
        totalRefunded: (opData.totalRefunded || 0) + plan.refundAmount,
        netCollected: totalCollected - (opData.totalRefunded || 0) - plan.refundAmount,
        retainedAmount: plan.retainedAmount,
        amountPending: 0,
        paymentStatus: plan.finalPaymentStatus,
        status: 'cancelado',
        currentAccountDebtAmount: 0,
        ...(params.idempotencyKey ? { idempotencyKeys: arrayUnion(params.idempotencyKey) } : {}),
        notes: `${opData.notes ? opData.notes + ' | ' : ''}Cancelado: ${params.reason || ''}`,
        updatedAt: serverTimestamp()
      });

      if (debtToExtinguish > 0 && userRef && userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const uOrigin = uData?.originComplejoId || uData?.originComplexId || uData?.complejoId || uData?.complexId;
        if (!uOrigin || isSameComplex(uOrigin, params.complexId)) {
          const currentUserDebt = Math.max(0, Number(uData?.debt || 0));
          t.update(userRef, {
            debt: Math.max(0, currentUserDebt - debtToExtinguish),
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    return {
      success: true,
      refundAmount: plan.refundAmount,
      retainedAmount: plan.retainedAmount,
      finalPaymentStatus: plan.finalPaymentStatus,
      refundMovementId
    };
  });

  if (userIdToSync) {
    try {
      syncUserMetricsWithBookings(userIdToSync);
    } catch {}
  }

  return result;
}


