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
  limit 
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { 
  User, Court, Match, Product, ProductCategory, InventoryMovement, ProductBatch,
  POSTransaction, TransactionPayment, TransactionItem, SupportTicket,
  OperationDocument, FinancialMovementDocument, IdempotencyRecord,
  ComplexCountersDocument, OperationType, OperationPaymentStatus,
  FinancialMovementCategory, FinancialPaymentMethod, FinancialMovementFlow,
  CreateOperationParams, RegisterOperationPaymentParams,
  RegisterHistoricalDebtPaymentParams, CancelOperationParams,
  OperationResult, PaymentRegistrationResult, HistoricalDebtPaymentResult
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
import { 
  normalizeUnifiedCourt, 
  resolveUnifiedSchedule, 
  hoursToWeeklySchedule, 
  doesCrossMidnight 
} from './complexProfileSync';
import { findMatchingLocalUser } from './crmActivityIndex';

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
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
    const unsub = onSnapshot(compRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const courtsArray = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
        const mappedCourts: Court[] = courtsArray.map((c: any, idx: number) => normalizeUnifiedCourt(c, idx) as unknown as Court);
        onUpdate(mappedCourts);
      } else {
        onUpdate([]);
      }
    }, (err) => {
      console.warn('[Firestore] Error en snapshot de canchas en complejos:', err);
      onUpdate([]);
    });

    return () => unsub();
  } catch (e) {
    console.error('[Firestore] Error al suscribirse a canchas en complejos:', e);
    onUpdate([]);
    return () => {};
  }
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

  const courtItem = {
    id: courtId,
    name: (court.name || 'Cancha').trim(),
    sport: court.sport || court.type || 'fútbol 5',
    type: court.sport || court.type || 'fútbol 5',
    surface: court.surface || 'sintético',
    price: Number(court.price ?? court.price_per_hour ?? 0),
    price_per_hour: Number(court.price ?? court.price_per_hour ?? 0),
    status: court.status === 'maintenance' || court.status === 'mantenimiento' ? 'mantenimiento' : (court.status === 'inactiva' ? 'inactiva' : 'activa'),
    is_roofed: Boolean(court.is_roofed ?? (court as any).isCovered),
    isCovered: Boolean(court.is_roofed ?? (court as any).isCovered),
    blockedCourts: Array.isArray((court as any).blockedCourts) ? (court as any).blockedCourts : []
  };

  const idx = existingCourts.findIndex(c => String(c.id) === String(courtId));
  if (idx >= 0) {
    existingCourts[idx] = { ...existingCourts[idx], ...courtItem };
  } else {
    existingCourts.push(courtItem);
  }

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
    existingCourts = existingCourts.filter(c => String(c.id) !== strId);
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
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
    const unsub = onSnapshot(compRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const { hours, weeklySchedule, openTime, closeTime, crossesMidnight } = resolveUnifiedSchedule(data);
        const profile = {
          id: snap.id,
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
          managerName: data.managerName || '',
          managerPhone: data.managerPhone || '',
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
    }, (err) => {
      console.warn('[Firestore] Error escuchando perfil en complejos:', err);
    });

    return () => unsub();
  } catch (e) {
    console.warn('[Firestore] Error subscribing to venue profile:', e);
    return () => {};
  }
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
    managerName: profile.managerName || '',
    managerPhone: profile.managerPhone || '',
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
export function subscribeToBookings(
  complexId: string, 
  onUpdate: (bookings: Match[]) => void,
  selectedDate?: string
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    const constraints1: any[] = [where('complexId', '==', targetId)];
    const constraints2: any[] = [where('complejoId', '==', targetId)];
    if (selectedDate) {
      constraints1.push(where('date', '==', selectedDate));
      constraints2.push(where('date', '==', selectedDate));
    }

    const map1 = new Map<string, Match>();
    const map2 = new Map<string, Match>();

    const emitMerged = () => {
      const merged = new Map<string, Match>([...map1, ...map2]);
      let list = Array.from(merged.values());
      if (selectedDate) {
        list = list.filter(b => b.date === selectedDate || (b.startTime && String(b.startTime).startsWith(selectedDate)));
      }
      onUpdate(list);
    };

    const q1 = query(colRef, ...constraints1);
    const q2 = query(colRef, ...constraints2);

    const unsub1 = onSnapshot(q1, (snap) => {
      map1.clear();
      snap.forEach(d => {
        map1.set(d.id, formatBookingToMatch({ id: d.id, ...d.data() }));
      });
      emitMerged();
    }, (err) => {
      console.warn('[Firestore] Error escuchando bookings (q1 complexId):', err);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      map2.clear();
      snap.forEach(d => {
        map2.set(d.id, formatBookingToMatch({ id: d.id, ...d.data() }));
      });
      emitMerged();
    }, (err) => {
      console.warn('[Firestore] Error escuchando bookings (q2 complejoId):', err);
    });

    return () => {
      unsub1();
      unsub2();
    };
  } catch (err) {
    console.error('[Firestore] Error subscribiendo a bookings:', err);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Sincroniza las métricas y estado del usuario en Firestore a partir de sus reservas reales
 */
export async function syncUserMetricsWithBookings(userId: string | number, userPhone?: string): Promise<void> {
  const uId = String(userId || '');
  if ((!uId || uId === '0') && !userPhone) return;

  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    let bookings: any[] = [];

    if (uId && uId !== '0') {
      const q = query(colRef, where('userId', '==', uId));
      const snap = await getDocs(q);
      bookings = snap.docs.map(d => d.data());
    }

    if (bookings.length === 0 && userPhone) {
      const qPhone = query(colRef, where('userPhone', '==', String(userPhone).trim()));
      const snapPhone = await getDocs(qPhone);
      bookings = snapPhone.docs.map(d => d.data());
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

    // Buscar doc de usuario por ID
    let targetDocRef = uId && uId !== '0' ? doc(db, USERS_COLLECTION, uId) : null;
    let uSnap = targetDocRef ? await getDoc(targetDocRef) : null;

    // Si no se encontró por ID pero hay userPhone, buscar por teléfono
    if ((!uSnap || !uSnap.exists()) && userPhone) {
      const usersCol = collection(db, USERS_COLLECTION);
      const qUser = query(usersCol, where('phone', '==', String(userPhone).trim()));
      const userSnap = await getDocs(qUser);
      if (!userSnap.empty) {
        targetDocRef = doc(db, USERS_COLLECTION, userSnap.docs[0].id);
        uSnap = userSnap.docs[0];
      }
    }

    if (targetDocRef && uSnap && uSnap.exists()) {
      const uData = uSnap.data();
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
      console.log(`[Firestore] Métricas de ciclo de vida actualizadas para usuario ${uSnap.id}: ${totalBookings} reservas, ${totalPlayed} jugados`);
    }
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
export async function getOverlappingCourtIds(complexId: string, targetCourtId: string): Promise<string[]> {
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, complexId);
    const snap = await getDoc(compRef);
    if (!snap.exists()) return [String(targetCourtId)];
    const data = snap.data();
    const courtsList = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
    const targetStr = String(targetCourtId);
    const overlapping = new Set<string>([targetStr]);
    
    // Direct blocked courts
    const targetCourt = courtsList.find((c: any) => String(c.id) === targetStr);
    if (targetCourt && Array.isArray(targetCourt.blockedCourts)) {
      targetCourt.blockedCourts.forEach((id: any) => overlapping.add(String(id)));
    }
    
    // Reverse blocked courts
    courtsList.forEach((c: any) => {
      if (Array.isArray(c.blockedCourts) && c.blockedCourts.some((id: any) => String(id) === targetStr)) {
        overlapping.add(String(c.id));
      }
    });
    
    return Array.from(overlapping);
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
  const price = Number(data.price) || 0;
  const deposit = Number(data.deposit) || 0;
  
  const paymentStatus = data.paymentStatus 
    ? (data.paymentStatus === 'paid' ? 'pagado' : (data.paymentStatus === 'partial' ? 'seña' : data.paymentStatus))
    : (deposit >= price && price > 0 ? 'pagado' : (deposit > 0 ? 'seña' : 'pendiente'));

  const status = data.status === 'confirmed' ? 'confirmado' : (data.status === 'cancelled' ? 'cancelado' : (data.status || 'confirmado'));
  const resolvedUserId = String(data.userId || data.host_id || '0');
  let resolvedUserName = resolveClientName(data);

  if (resolvedUserName === 'NN' && resolvedUserId && resolvedUserId !== '0') {
    try {
      const uSnap = await getDoc(doc(db, USERS_COLLECTION, resolvedUserId));
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

  // Find all courts that physically share space with this court
  const affectedCourts = await getOverlappingCourtIds(targetComplexId, resolvedCourtId);

  // Pre-fetch any existing active bookings from canonical /bookings for this date to ensure 100% reconciliation
  // even if this is the very first booking or if an ERP booking was created directly
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

  // Pre-allocate new booking reference
  const newBookingRef = doc(collection(db, BOOKINGS_COLLECTION));
  const newBookingId = newBookingRef.id;

  const payload = {
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
    deposit,
    status,
    paymentStatus,
    userId: resolvedUserId,
    host_id: resolvedUserId,
    userName: resolvedUserName,
    clientName: resolvedUserName,
    host_name: resolvedUserName,
    userPhone: (data.userPhone || data.clientPhone || '').trim(),
    clientPhone: (data.userPhone || data.clientPhone || '').trim(),
    userEmail: (data.userEmail || data.clientEmail || '').trim(),
    clientEmail: (data.userEmail || data.clientEmail || '').trim(),
    notes: data.notes || '',
    canonicalId: data.canonicalId || (data as any).canonicalUserId || (data as any).personId || undefined,
    canonicalUserId: (data as any).canonicalUserId || data.canonicalId || (data as any).personId || undefined,
    canonicalName: (data as any).canonicalName || undefined,
    historicalId: (data as any).historicalId || undefined,
    historicalIds: (data as any).historicalIds || undefined,
    ownerId: auth.currentUser?.uid || data.ownerId || '',
    adminId: data.adminId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // ATOMIC MUTUAL EXCLUSION LOCK TRANSACTION
  await runTransaction(db, async (transaction) => {
    // 1. Read deterministic lock documents for all affected courts
    const lockRefs = affectedCourts.map(cid => 
      doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${data.date}`)
    );
    
    const lockSnaps = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
    
    // 2. Aggregate active bookings from all locks + initial seed
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

    // 3. Collision Detection against all active intervals
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

    // 4. Register new booking in schedule lock for all affected courts
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

    // 5. Write canonical booking document into /bookings
    transaction.set(newBookingRef, payload);

    // 6. Motor Financiero Unificado: Registrar operación comercial y movimiento de seña si corresponde
    if (price > 0 || deposit > 0) {
      const opRef = doc(db, OPERATIONS_COLLECTION, `${newBookingId}-booking`);
      const ticketCode = `B-${newBookingId.slice(0, 6).toUpperCase()}`;
      const amountPending = Math.max(0, price - deposit);
      const initialPaymentStatus: OperationPaymentStatus = 
        deposit >= price && price > 0 ? 'paid' : (deposit > 0 ? 'partial' : 'unpaid');

      const bookingClientId = (resolvedUserId && resolvedUserId !== '0') ? resolvedUserId : null;
      const bookingPhone = (payload.userPhone || '').trim();

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
        totalCollected: deposit,
        totalRefunded: 0,
        netCollected: deposit,
        retainedAmount: 0,
        amountPending,
        paymentStatus: initialPaymentStatus,
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        notes: payload.notes || `Reserva ${resolvedCourtName} ${data.date} ${startTime}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || payload.ownerId || 'pos_operator'
      });

      const rawPayments: Array<{ amount: number; paymentMethod: FinancialPaymentMethod; notes?: string }> = 
        ((Array.isArray(data.payments) && data.payments.length > 0)
          ? data.payments
          : (deposit > 0 ? [{ amount: deposit, paymentMethod: (data.paymentMethod as FinancialPaymentMethod) || 'cash' }] : [])
        ).filter((pay: any) => {
          const m = String(pay?.paymentMethod || pay?.method || '').toLowerCase();
          const amt = Number(pay?.amount || 0);
          return amt > 0 && m !== 'pendiente' && m !== 'pending' && m !== 'fiado';
        });

      rawPayments.forEach((pay, idx) => {
        const pAmt = Number(pay.amount) || 0;
        if (pAmt > 0) {
          const movId = generateUUID();
          const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
          const movCategory: FinancialMovementCategory = deposit >= price ? 'booking_settlement' : 'booking_deposit';
          const idemKey = `booking_dep_${newBookingId}_${idx}`;

          transaction.set(movRef, {
            id: movId,
            complexId: targetComplexId,
            complejoId: targetComplexId,
            operationId: `${newBookingId}-booking`,
            bookingId: newBookingId,
            ticketCode,
            idempotencyKey: idemKey,
            flow: 'income',
            category: movCategory,
            amount: pAmt,
            paymentMethod: pay.paymentMethod || 'cash',
            effectiveDate: serverTimestamp(),
            userId: bookingClientId,
            clientId: bookingClientId,
            responsibleName: resolvedUserName,
            userName: resolvedUserName,
            clientName: resolvedUserName,
            userPhone: bookingPhone,
            clientPhone: bookingPhone,
            clearedCurrentAccountDebt: 0,
            notes: pay.notes || `Cobro reserva ${resolvedCourtName} ${data.date} ${startTime} (${pay.paymentMethod || 'cash'})`,
            operatorId: auth.currentUser?.uid || payload.ownerId || 'pos_operator',
            createdAt: serverTimestamp()
          });

          const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);
          transaction.set(idemRef, {
            idempotencyKey: idemKey,
            complexId: targetComplexId,
            complejoId: targetComplexId,
            operationId: `${newBookingId}-booking`,
            bookingId: newBookingId,
            amount: pAmt,
            paymentMethod: pay.paymentMethod || 'cash',
            flow: 'income',
            status: 'completed',
            movementId: movId,
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp()
          });
        }
      });
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

  const isScheduleChange = Boolean(
    patch.date !== undefined || 
    patch.courtId !== undefined || 
    patch.court_id !== undefined || 
    patch.startTime !== undefined || 
    patch.endTime !== undefined || 
    patch.status !== undefined
  );

  if (isScheduleChange) {
    await runTransaction(db, async (transaction) => {
      const bSnap = await transaction.get(docRef);
      if (!bSnap.exists()) {
        throw new Error('Reserva no encontrada');
      }

      const curr = bSnap.data();
      const targetComplexId = curr.complejoId || 'B';
      const oldCourtId = String(curr.courtId || curr.court_id || 'c_1');
      const oldDate = curr.date;
      const newCourtId = String(patch.courtId || patch.court_id || oldCourtId);
      const newDate = patch.date || oldDate;
      const newStart = patch.startTime || curr.startTime || '18:00';
      const newEnd = patch.endTime || curr.endTime || '19:00';
      const newStatus = patch.status !== undefined ? patch.status : curr.status;
      const isCancelled = newStatus === 'cancelado' || newStatus === 'cancelled';

      const oldAffectedCourts = await getOverlappingCourtIds(targetComplexId, oldCourtId);
      const newAffectedCourts = await getOverlappingCourtIds(targetComplexId, newCourtId);

      // Lock old schedule
      const oldLockRefs = oldAffectedCourts.map(cid => 
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${oldDate}`)
      );
      const oldLockSnaps = await Promise.all(oldLockRefs.map(ref => transaction.get(ref)));

      // If cancelling: release from lock and update booking
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

        transaction.update(docRef, {
          ...patch,
          status: 'cancelado',
          updatedAt: new Date().toISOString()
        });
        return;
      }

      // If rescheduling or changing times/courts: check conflicts in new schedule
      const newLockRefs = newAffectedCourts.map(cid => 
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${newDate}`)
      );
      const newLockSnaps = await Promise.all(newLockRefs.map(ref => transaction.get(ref)));

      const startMin = timeStringToMinutes(newStart);
      const endMin = timeStringToMinutes(newEnd);

      // Check overlaps in new schedule (excluding this booking itself)
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

      // Release from old lock if court or date changed
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

      // Register into new lock
      const newLockEntry = {
        bookingId: strBookingId,
        courtId: newCourtId,
        courtName: patch.courtName || curr.courtName || 'Cancha',
        startTime: newStart,
        endTime: newEnd,
        startMin,
        endMin,
        userName: patch.userName || patch.clientName || curr.userName || 'Cliente',
        status: newStatus || 'confirmado'
      };

      for (let i = 0; i < newAffectedCourts.length; i++) {
        const snap = newLockSnaps[i];
        const existingBookings = snap.exists() ? (snap.data().bookings || {}) : {};
        transaction.set(newLockRefs[i], {
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

      // Update booking document
      transaction.update(docRef, {
        ...patch,
        updatedAt: new Date().toISOString()
      });
    });
  } else {
    // Pure metadata update (e.g. payment, deposit, notes)
    await updateDoc(docRef, {
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }

  // Lifecycle metrics synchronization
  const finalUserId = patch.userId;
  const finalPhone = patch.userPhone || patch.clientPhone;
  if ((finalUserId && finalUserId !== '0') || finalPhone) {
    syncUserMetricsWithBookings(finalUserId || '', finalPhone);
  }
}

/**
 * Elimina DEFINITIVAMENTE una reserva de Jogo y TODOS sus datos asociados exclusivamente a ella:
 * - Documento de la reserva en 'bookings'
 * - Liberación del bloqueo de horario en 'booking_locks'
 * - Operaciones comerciales generadas exclusivamente por ella en 'operations'
 * - Movimientos financieros generados exclusivamente por ella en 'financial_movements'
 * - Transacciones históricas vinculadas en 'transactions'
 * - Usuarios creados exclusivamente para esta reserva (si no tienen otras reservas ni operaciones)
 */
export async function permanentlyDeleteBookingInFirestore(bookingId: string | number): Promise<{ success: boolean; deletedUserId?: string | null }> {
  const strId = String(bookingId);
  const docRef = doc(db, BOOKINGS_COLLECTION, strId);
  
  // 1. Obtener datos de la reserva antes de eliminar
  const bookingSnap = await getDoc(docRef);
  if (!bookingSnap.exists()) {
    return { success: true };
  }
  
  const bData = bookingSnap.data();
  const userId = bData.userId || bData.host_id || null;
  const targetComplexId = bData.complejoId || bData.complexId || 'B';
  const courtId = String(bData.courtId || bData.court_id || 'c_1');
  const date = bData.date;

  // 2. Liberar el bloqueo en booking_locks
  try {
    const affectedCourts = await getOverlappingCourtIds(targetComplexId, courtId);
    const lockRefs = affectedCourts.map(cid => 
      doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${date}`)
    );
    const lockSnaps = await Promise.all(lockRefs.map(ref => getDoc(ref)));

    for (let i = 0; i < affectedCourts.length; i++) {
      const lSnap = lockSnaps[i];
      if (lSnap.exists()) {
        try {
          await updateDoc(lockRefs[i], {
            [`bookings.${strId}`]: deleteField(),
            updatedAt: serverTimestamp()
          });
        } catch {
          const bMap = { ...(lSnap.data().bookings || {}) };
          if (bMap[strId]) {
            delete bMap[strId];
            await setDoc(lockRefs[i], {
              bookings: bMap,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error releasing booking lock during permanent delete:', err);
  }

  // 3. Buscar y eliminar operaciones comerciales exclusivas en batch
  const batch = writeBatch(db);

  // 3.1 Operación directa por ID: `${strId}-booking`
  const directOpRef = doc(db, OPERATIONS_COLLECTION, `${strId}-booking`);
  batch.delete(directOpRef);

  // 3.2 Operaciones con bookingId === strId
  try {
    const opsQuery = query(collection(db, OPERATIONS_COLLECTION), where('bookingId', '==', strId));
    const opsSnap = await getDocs(opsQuery);
    opsSnap.forEach(opDoc => {
      if (opDoc.id !== `${strId}-booking`) {
        batch.delete(opDoc.ref);
      }
    });
  } catch (err) {
    console.warn('[Firestore] Error querying operations to delete:', err);
  }

  // 4. Buscar y eliminar movimientos financieros exclusivos
  try {
    const movsByBooking = query(collection(db, FINANCIAL_MOVEMENTS_COLLECTION), where('bookingId', '==', strId));
    const movsByOp = query(collection(db, FINANCIAL_MOVEMENTS_COLLECTION), where('operationId', '==', `${strId}-booking`));
    
    const [snapByBooking, snapByOp] = await Promise.all([
      getDocs(movsByBooking),
      getDocs(movsByOp)
    ]);

    const seenMovIds = new Set<string>();
    snapByBooking.forEach(mDoc => {
      if (!seenMovIds.has(mDoc.id)) {
        seenMovIds.add(mDoc.id);
        batch.delete(mDoc.ref);
      }
    });
    snapByOp.forEach(mDoc => {
      if (!seenMovIds.has(mDoc.id)) {
        seenMovIds.add(mDoc.id);
        batch.delete(mDoc.ref);
      }
    });
  } catch (err) {
    console.warn('[Firestore] Error querying financial movements to delete:', err);
  }

  // 5. Buscar y eliminar transacciones históricas vinculadas
  try {
    const txQuery = query(collection(db, TRANSACTIONS_COLLECTION), where('bookingId', '==', strId));
    const txSnap = await getDocs(txQuery);
    txSnap.forEach(tDoc => {
      batch.delete(tDoc.ref);
    });
  } catch (err) {
    console.warn('[Firestore] Error querying legacy transactions to delete:', err);
  }

  // 6. Eliminar el documento principal de la reserva
  batch.delete(docRef);

  // Ejecutar el lote atómico de eliminación
  await batch.commit();

  // 7. Evaluar el usuario / cliente asociado: eliminar SOLO si fue creado exclusivamente para esta reserva
  let deletedUserId: string | null = null;
  if (userId && String(userId) !== '0') {
    const strUserId = String(userId);
    try {
      // Verificar si el usuario tiene OTRAS reservas en el sistema
      const otherBookingsQuery = query(collection(db, BOOKINGS_COLLECTION), where('userId', '==', strUserId));
      const otherBookingsSnap = await getDocs(otherBookingsQuery);
      const remainingBookings = otherBookingsSnap.docs.filter(d => d.id !== strId);

      // Verificar si el usuario tiene OTRAS operaciones comerciales
      const otherOpsQuery = query(collection(db, OPERATIONS_COLLECTION), where('userId', '==', strUserId));
      const otherOpsSnap = await getDocs(otherOpsQuery);
      const remainingOps = otherOpsSnap.docs.filter(d => d.data().bookingId !== strId && d.id !== `${strId}-booking`);

      // Verificar perfil en /users
      const userDocRef = doc(db, USERS_COLLECTION, strUserId);
      const userSnap = await getDoc(userDocRef);

      const isCurrentAuthUser = auth.currentUser?.uid === strUserId;
      const isActivatedOrAdmin = userSnap.exists() && (
        userSnap.data()?.category === 'admin' || 
        userSnap.data()?.isActivated === true ||
        userSnap.data()?.isOwner === true
      );

      if (remainingBookings.length === 0 && remainingOps.length === 0 && !isCurrentAuthUser && !isActivatedOrAdmin && userSnap.exists()) {
        // Creado exclusivamente para esta reserva y sin otras relaciones: eliminar usuario
        await deleteDoc(userDocRef);
        deletedUserId = strUserId;
      } else {
        // Conservar perfil y sincronizar métricas
        syncUserMetricsWithBookings(strUserId);
      }
    } catch (err) {
      console.warn('[Firestore] Error checking/cleaning associated user:', err);
      syncUserMetricsWithBookings(strUserId);
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

/**
 * Escucha clientes en la colección canónica 'users' filtrando por asociación estricta al complejo activo:
 * originComplejoId, originComplexId, complejoId, complexId y associatedComplexIds.
 * Fusiona los resultados en un mapa deduplicado por ID y garantiza el aislamiento multi-tenant.
 */
export function subscribeToClients(
  complexId: string, 
  onUpdate: (users: User[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const colRef = collection(db, USERS_COLLECTION);
    
    // Consultas acotadas exclusivamente al complejo objetivo
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
      const merged = new Map<string, User>([
        ...mapOrigin,
        ...mapAltOrigin,
        ...mapComplejo,
        ...mapComplex,
        ...mapAssociated
      ]);
      onUpdate(Array.from(merged.values()));
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
    }, (err) => {
      // Ignorar si la regla o índice no aplica
    });

    const unsubComplejo = onSnapshot(qComplejo, (snap) => {
      mapComplejo.clear();
      snap.forEach(d => mapComplejo.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, (err) => {
      // Ignorar
    });

    const unsubComplex = onSnapshot(qComplex, (snap) => {
      mapComplex.clear();
      snap.forEach(d => mapComplex.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, (err) => {
      // Ignorar
    });

    const unsubAssociated = onSnapshot(qAssociated, (snap) => {
      mapAssociated.clear();
      snap.forEach(d => mapAssociated.set(d.id, { id: d.id, ...d.data() } as unknown as User));
      emitMerged();
    }, (err) => {
      // Si associatedComplexIds no existe o no tiene permiso, no interrumpe el resto
    });

    return () => {
      unsubOrigin();
      unsubAltOrigin();
      unsubComplejo();
      unsubComplex();
      unsubAssociated();
    };
  } catch (e) {
    console.error('[Firestore] Error subscribing to clients:', e);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Guarda o actualiza un cliente en la colección canónica 'users'
 */
export async function saveClientInFirestore(
  complexId: string, 
  client: Partial<User>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const clientId = client.id ? String(client.id) : `user_${Date.now()}`;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // Preservar originComplejoId histórico y metadatos canónicos si ya existían en client o en el documento
  let resolvedOriginId = client.originComplejoId;
  let resolvedOriginName = client.originComplejoName;
  let existingData: any = null;
  if (client.id) {
    try {
      const existingDoc = await getDoc(doc(db, USERS_COLLECTION, clientId));
      if (existingDoc.exists()) {
        existingData = existingDoc.data();
        resolvedOriginId = resolvedOriginId || existingData.originComplejoId || existingData.originComplexId;
        resolvedOriginName = resolvedOriginName || existingData.originComplejoName || existingData.complexName;
      }
    } catch (e) {
      // Ignorar si no existe o no tiene permiso previo
    }
  }
  if (!resolvedOriginId) {
    resolvedOriginId = targetId;
  }

  const resolvedCanonId = client.canonicalId || (client as any).canonicalUserId || existingData?.canonicalId || existingData?.canonicalUserId;
  const resolvedCanonUserId = (client as any).canonicalUserId || client.canonicalId || existingData?.canonicalUserId || existingData?.canonicalId;
  const resolvedCanonName = (client as any).canonicalName || existingData?.canonicalName;
  const resolvedHistoricalIds = (client as any).historicalIds || existingData?.historicalIds;

  const payload: any = {
    id: clientId,
    name: (client.name || 'Cliente').trim(),
    phone: (client.phone || '').trim(),
    email: (client.email || '').trim(),
    gender: client.gender || '',
    city: client.city || client.address || '',
    category: client.category || 'jugador',
    status: client.status || 'activo',
    isActivated: client.isActivated ?? false,
    acquisitionChannel: client.acquisitionChannel || 'WhatsApp',
    acquisitionDate: client.acquisitionDate || client.created_at || dateStr,
    acquisitionTime: client.acquisitionTime || timeStr,
    activationDate: client.activationDate || null,
    activationTime: client.activationTime || null,
    originComplejoId: resolvedOriginId,
    originComplejoName: resolvedOriginName || client.originComplejoName || (targetId === 'B' ? 'Colo loco' : ''),
    totalBookings: Number(client.totalBookings ?? 0),
    totalMatchesPlayed: Number(client.totalMatchesPlayed ?? client.matches_played ?? 0),
    participatedMatches: Number(client.participatedMatches ?? 0),
    lastGameDate: client.lastGameDate || '',
    lastGameTime: client.lastGameTime || '',
    notes: client.notes || '',
    ownerId: auth.currentUser?.uid || client.ownerId || '',
    adminId: client.adminId || '',
    createdAt: client.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(resolvedCanonId ? { canonicalId: resolvedCanonId } : {}),
    ...(resolvedCanonUserId ? { canonicalUserId: resolvedCanonUserId } : {}),
    ...(resolvedCanonName ? { canonicalName: resolvedCanonName } : {}),
    ...(resolvedHistoricalIds ? { historicalIds: resolvedHistoricalIds } : {})
  };

  await setDoc(doc(db, USERS_COLLECTION, clientId), payload, { merge: true });
  return clientId;
}

/**
 * Elimina un cliente de la colección canónica 'users'
 */
export async function deleteClientInFirestore(clientId: string | number): Promise<void> {
  const strId = String(clientId);
  await deleteDoc(doc(db, USERS_COLLECTION, strId));
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

export const deleteUsuarioFromFirestore = (userId: string | number) => {
  return deleteClientInFirestore(userId);
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
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  return onSnapshot(compRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.inventoryCategories)) {
        cb(data.inventoryCategories);
        return;
      }
    }
    // Cero categorías preconfiguradas
    cb([]);
  }, (err) => {
    console.warn('[Firestore] Error leyendo inventoryCategories:', err);
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
export function subscribeToExpenseCategories(
  complexId: string,
  cb: (categories: ProductCategory[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
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
    });

    // Solo sembrar por primera vez si no existen rubros en Firestore y no se ha inicializado
    if (list.length === 0 && !isSeeding && !seededComplexesTracker.has(targetId)) {
      seededComplexesTracker.add(targetId);
      const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
      try {
        const counterSnap = await getDoc(counterRef);
        const alreadyInit = counterSnap.exists() && counterSnap.data()?.expenseCategoriesInitialized;
        if (!alreadyInit) {
          isSeeding = true;
          const defaults = await seedDefaultExpenseCategoriesInFirestore(targetId);
          cb(defaults);
          return;
        }
      } catch (seedErr) {
        console.warn('[Firestore] Error comprobando/sembrando rubros de gastos:', seedErr);
        // Si no se pudo comprobar el contador pero la lista está vacía, sembrar directamente
        try {
          isSeeding = true;
          const defaults = await seedDefaultExpenseCategoriesInFirestore(targetId);
          cb(defaults);
          return;
        } catch (e) {
          console.warn('[Firestore] Fallo al sembrar rubros directamente:', e);
        }
      } finally {
        isSeeding = false;
      }
    }

    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando rubros de gastos:', err);
    cb([]);
  });
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
export function subscribeToExpenseItems(
  complexId: string,
  cb: (items: Product[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
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
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando ítems de gastos:', err);
    cb([]);
  });
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
  const validPayments = rawPayments.filter(p => {
    const m = String(p.paymentMethod || (p as any).method || '').toLowerCase();
    const amt = Number(p.amount || 0);
    return amt > 0 && m !== 'pendiente' && m !== 'pending' && m !== 'fiado';
  });
  const totalPaid = validPayments.reduce((s, p) => s + Number(p.amount), 0);

  if (totalPaid > amount + 0.01) {
    throw new Error(`El pago inicial ($${totalPaid.toLocaleString()}) no puede superar el importe del gasto ($${amount.toLocaleString()}).`);
  }

  const amountPending = Math.max(0, amount - totalPaid);
  const paymentStatus: OperationPaymentStatus = 
    totalPaid >= amount && amount > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');

  const idemKey = params.idempotencyKey || `exp_op_${Date.now()}_${generateUUID().slice(0, 6)}`;

  // Idempotency check previo
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);
  const existingIdemSnap = await getDoc(idemRef);
  if (existingIdemSnap.exists()) {
    const idemData = existingIdemSnap.data() as IdempotencyRecord;
    if (idemData.status === 'completed' && idemData.operationId) {
      const existingOpSnap = await getDoc(doc(db, OPERATIONS_COLLECTION, idemData.operationId));
      return {
        success: true,
        operationId: idemData.operationId,
        ticketCode: idemData.ticketCode || (existingOpSnap.exists() ? existingOpSnap.data().ticketCode : 'E-0000'),
        totalExpense: amount,
        totalPaid,
        amountPending,
        paymentStatus
      };
    }
  }

  const cleanConcept = (params.concept || '').trim() || params.category.trim();
  const cleanSupplier = (params.supplierName || cleanConcept || 'Proveedor').trim();
  const cleanCategory = (params.category || 'Gastos Generales').trim();

  return await runTransaction(db, async (t) => {
    // 1. Obtener correlativo secuencial con prefijo 'E'
    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    const counterSnap = await t.get(counterRef);
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
      contractualAmount: amount,
      totalCollected: totalPaid,
      totalRefunded: 0,
      netCollected: totalPaid,
      retainedAmount: 0,
      amountPending,
      paymentStatus,
      currentAccountAssigned: false,
      currentAccountDebtAmount: 0,
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

    // 4. Crear movimientos financieros en /financial_movements por cada pago efectivamente desembolsado
    for (let i = 0; i < validPayments.length; i++) {
      const pay = validPayments[i];
      const pAmt = Number(pay.amount);
      const movId = generateUUID();
      const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
      const movDocData: FinancialMovementDocument = {
        id: movId,
        complexId: targetId,
        complejoId: targetId,
        operationId,
        ticketCode,
        idempotencyKey: `${idemKey}_pay_${i}`,
        flow: 'expense',
        category: 'expense_payment',
        amount: pAmt,
        paymentMethod: pay.paymentMethod,
        effectiveDate: serverTimestamp(),
        responsibleName: cleanSupplier,
        userName: cleanSupplier,
        clientName: cleanSupplier,
        clearedCurrentAccountDebt: 0,
        notes: pay.notes || `Pago gasto: ${cleanConcept} (${pay.paymentMethod})`,
        operatorId: params.operatorId,
        createdAt: serverTimestamp()
      };
      t.set(movRef, movDocData);

      const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, `${idemKey}_pay_${i}`);
      t.set(pIdemRef, {
        idempotencyKey: `${idemKey}_pay_${i}`,
        complexId: targetId,
        complejoId: targetId,
        operationId,
        amount: pAmt,
        paymentMethod: pay.paymentMethod,
        flow: 'expense',
        status: 'completed',
        movementId: movId,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 5. Clave de idempotencia principal
    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetId,
      complejoId: targetId,
      operationId,
      ticketCode,
      amount,
      paymentMethod: validPayments[0]?.paymentMethod || 'cash',
      flow: 'expense',
      status: 'completed',
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
export function subscribeToProducts(
  complexId: string,
  cb: (products: Product[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snap) => {
    const list: Product[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.catalogType === 'expense') return; // Excluir conceptos de gasto

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

    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando productos:', err);
    cb([]);
  });
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
  const newStock = Math.max(0, currentStock + params.delta);

  let batches: ProductBatch[] = Array.isArray(prodData.batches) ? [...prodData.batches] : [];
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
  } else if (params.delta < 0) {
    let toReduce = Math.abs(params.delta);
    batches.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    for (const b of batches) {
      if (toReduce <= 0) break;
      if (b.quantity <= 0) continue;
      const take = Math.min(b.quantity, toReduce);
      b.quantity -= take;
      toReduce -= take;
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
  const rawPayments = (Array.isArray(params.payments) ? params.payments : []).filter(p => {
    const m = String(p.paymentMethod || (p as any).method || '').toLowerCase();
    const amt = Number(p.amount || 0);
    return amt > 0 && m !== 'pendiente' && m !== 'pending' && m !== 'fiado';
  });
  const totalPaid = rawPayments.reduce((s, p) => s + Math.max(0, Number(p.amount) || 0), 0);

  if (totalPaid > totalPurchase + 0.01) {
    throw new Error(`El pago inicial ($${totalPaid.toLocaleString()}) no puede superar el total de la compra ($${totalPurchase.toLocaleString()}).`);
  }

  const amountPending = Math.max(0, totalPurchase - totalPaid);
  const paymentStatus: OperationPaymentStatus = 
    totalPaid >= totalPurchase && totalPurchase > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');

  const idemKey = params.idempotencyKey || `purchase_${params.productId}_${Date.now()}_${generateUUID().slice(0, 6)}`;

  // Idempotency check previo
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);
  const existingIdemSnap = await getDoc(idemRef);
  if (existingIdemSnap.exists()) {
    const idemData = existingIdemSnap.data() as IdempotencyRecord;
    if (idemData.status === 'completed' && idemData.operationId) {
      const existingOpSnap = await getDoc(doc(db, OPERATIONS_COLLECTION, idemData.operationId));
      const existingProdSnap = await getDoc(doc(db, PRODUCTS_COLLECTION, params.productId));
      const prodData = existingProdSnap.exists() ? existingProdSnap.data() : {};
      return {
        success: true,
        operationId: idemData.operationId,
        ticketCode: idemData.ticketCode || (existingOpSnap.exists() ? existingOpSnap.data().ticketCode : 'E-0000'),
        totalPurchase,
        totalPaid,
        amountPending,
        newStock: Number(prodData.stock || 0),
        batches: Array.isArray(prodData.batches) ? prodData.batches : []
      };
    }
  }

  return await runTransaction(db, async (t) => {
    const prodRef = doc(db, PRODUCTS_COLLECTION, params.productId);
    const prodSnap = await t.get(prodRef);
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

    const counterRef = doc(db, COMPLEX_COUNTERS_COLLECTION, targetId);
    const counterSnap = await t.get(counterRef);
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
      contractualAmount: totalPurchase,
      totalCollected: totalPaid,
      totalRefunded: 0,
      netCollected: totalPaid,
      retainedAmount: 0,
      amountPending,
      paymentStatus,
      currentAccountAssigned: false,
      currentAccountDebtAmount: 0,
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

    // 5. Crear movimientos financieros en /financial_movements
    for (let i = 0; i < rawPayments.length; i++) {
      const pay = rawPayments[i];
      const pAmt = Math.max(0, Number(pay.amount) || 0);
      if (pAmt > 0) {
        const movId = generateUUID();
        const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
        const movDocData: FinancialMovementDocument = {
          id: movId,
          complexId: targetId,
          complejoId: targetId,
          operationId,
          ticketCode,
          idempotencyKey: pay.idempotencyKey || `${idemKey}_pay_${i}`,
          flow: 'expense',
          category: 'expense_payment',
          amount: pAmt,
          paymentMethod: pay.paymentMethod,
          effectiveDate: serverTimestamp(),
          responsibleName: cleanPurchasePlace,
          userName: cleanPurchasePlace,
          clientName: cleanPurchasePlace,
          clearedCurrentAccountDebt: 0,
          expenseCategoryId: cleanExpenseCategoryId,
          expenseCategoryName: cleanExpenseCategory || null,
          expenseConceptId: cleanExpenseConceptId,
          expenseConceptName: cleanPurchasePlace,
          notes: pay.notes || `Pago compra mercadería (${pay.paymentMethod}) · ${cleanPurchasePlace}${cleanExpenseCategory ? ` · ${cleanExpenseCategory}` : ''}`,
          operatorId: params.operatorId || 'administrador',
          createdAt: serverTimestamp()
        };
        t.set(movRef, movDocData);

        const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, movDocData.idempotencyKey);
        t.set(pIdemRef, {
          idempotencyKey: movDocData.idempotencyKey,
          complexId: targetId,
          complejoId: targetId,
          operationId,
          amount: pAmt,
          paymentMethod: pay.paymentMethod,
          flow: 'expense',
          status: 'completed',
          movementId: movId,
          ticketCode,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    }

    // 6. Idempotencia de la compra
    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetId,
      complejoId: targetId,
      operationId,
      amount: totalPurchase,
      paymentMethod: rawPayments[0]?.paymentMethod || 'cash',
      flow: 'expense',
      status: 'completed',
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

  // Restar de la deuda del cliente
  const targetUserId = params.userId || txData.userId;
  if (targetUserId && params.fiadoAmount > 0) {
    try {
      const userRef = doc(db, USERS_COLLECTION, String(targetUserId));
      await updateDoc(userRef, {
        debt: increment(-Number(params.fiadoAmount)),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn(`[Firestore] Error al restar deuda del usuario ${targetUserId}:`, err);
    }
  }
}

/**
 * Escucha las transacciones en tiempo real
 */
export function subscribeToTransactions(
  complexId: string,
  cb: (transactions: any[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, TRANSACTIONS_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snap) => {
    const list: any[] = [];
    snap.forEach((d) => {
      list.push({
        id: d.id,
        ...d.data()
      });
    });
    // Ordenar de más reciente a más antiguo
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando transacciones:', err);
    cb([]);
  });
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

  // Normalizar pagos iniciales (soporta pago único o split payments)
  const rawPayments = (params.initialPayments && params.initialPayments.length > 0
    ? params.initialPayments
    : (params.initialPayment ? [params.initialPayment] : [])
  ).filter(p => {
    const m = String((p as any).paymentMethod || (p as any).method || '').toLowerCase();
    const amt = Number(p.amount || 0);
    return amt > 0 && m !== 'pendiente' && m !== 'pending' && m !== 'fiado';
  });

  const opIdemRef = params.idempotencyKey
    ? doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey)
    : null;

  const paymentIdemRefs = rawPayments
    .filter(p => Boolean(p.idempotencyKey))
    .map(p => ({ p, ref: doc(db, IDEMPOTENCY_COLLECTION, p.idempotencyKey) }));

  const userRef = (params.userId && String(params.userId).trim() !== '' && String(params.userId) !== '0') 
    ? doc(db, USERS_COLLECTION, String(params.userId)) 
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
          if (
            existingPIdem.complexId === params.complexId &&
            Math.abs(Number(existingPIdem.amount) - Number(pItem.amount)) < 0.01 &&
            existingPIdem.paymentMethod === pItem.paymentMethod
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

    // 2.3 Validación atómica de inventario (aborta sin escrituras parciales si falta stock)
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
    }

    // 2.4 Cálculos de saldos financieros
    const contractualAmount = Math.max(0, Number(params.contractualAmount) || 0);
    const totalInitialPayAmount = rawPayments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
    
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

    const effectiveUserId = (params.userId && String(params.userId).trim() !== '' && String(params.userId) !== '0')
      ? String(params.userId).trim()
      : (params.clientId && String(params.clientId).trim() !== '' && String(params.clientId) !== '0' ? String(params.clientId).trim() : null);

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
      items: (params.items || []).map(it => {
        const itemObj: any = {
          id: it.id || it.productId || generateUUID(),
          name: it.name,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || 0),
          subtotal: Number(it.subtotal || (Number(it.quantity || 1) * Number(it.unitPrice || 0)))
        };
        if (it.productId) {
          itemObj.productId = it.productId;
        }
        return itemObj;
      }),
      notes: params.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.operatorId
    };
    t.set(opRef, opDocData);

    // 3.3 Crear movimientos financieros y registros de idempotencia para cobros reales
    const createdMovementIds: string[] = [];
    for (let i = 0; i < rawPayments.length; i++) {
      const payment = rawPayments[i];
      const payAmt = Math.max(0, Number(payment.amount) || 0);
      if (payAmt > 0) {
        const movId = generateUUID();
        createdMovementIds.push(movId);
        const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
        let movementCategory: FinancialMovementCategory = 'sale_collection';
        if (params.operationType === 'court_booking') {
          movementCategory = balances.paymentStatus === 'paid' ? 'booking_settlement' : 'booking_deposit';
        }

        const movDocData: FinancialMovementDocument = {
          id: movId,
          complexId: params.complexId,
          complejoId: params.complexId,
          operationId,
          ...(params.bookingId ? { bookingId: params.bookingId } : {}),
          ticketCode,
          idempotencyKey: payment.idempotencyKey || `${params.idempotencyKey || operationId}_pay_${i}`,
          flow: 'income',
          category: movementCategory,
          amount: payAmt,
          paymentMethod: payment.paymentMethod,
          effectiveDate: serverTimestamp(),
          userId: effectiveUserId,
          clientId: effectiveUserId,
          responsibleName: resolvedUserName,
          userName: resolvedUserName,
          clientName: resolvedUserName,
          userPhone: resolvedUserPhone,
          clientPhone: resolvedUserPhone,
          clearedCurrentAccountDebt: 0,
          notes: payment.notes || params.notes || '',
          operatorId: params.operatorId,
          createdAt: serverTimestamp()
        };
        t.set(movRef, movDocData);

        if (payment.idempotencyKey) {
          const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, payment.idempotencyKey);
          t.set(pIdemRef, {
            idempotencyKey: payment.idempotencyKey,
            complexId: params.complexId,
            complejoId: params.complexId,
            operationId,
            amount: payAmt,
            paymentMethod: payment.paymentMethod,
            flow: 'income',
            status: 'completed',
            movementId: movId,
            ticketCode,
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp()
          });
        }
      }
    }

    // Registro de idempotencia a nivel operación
    if (opIdemRef && params.idempotencyKey) {
      t.set(opIdemRef, {
        idempotencyKey: params.idempotencyKey,
        complexId: params.complexId,
        complejoId: params.complexId,
        operationId,
        amount: balances.contractualAmount,
        paymentMethod: rawPayments[0]?.paymentMethod || 'efectivo',
        flow: 'income',
        status: 'completed',
        movementId: createdMovementIds[0] || null,
        ticketCode,
        paymentStatus: balances.paymentStatus,
        currentAccountDebtAmount,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 3.4 Descuento atómico de stock y registro inmutable de inventario con PEPS (FIFO)
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const [prodId, { ref: prodRef, snap, requestedQty }] of productSnaps.entries()) {
      const prodData = snap.data();
      const currentStock = Number(prodData.stock || 0);
      const newStock = Math.max(0, currentStock - requestedQty);

      // Consumo PEPS de tandas
      let currentBatches: ProductBatch[] = Array.isArray(prodData.batches) ? [...prodData.batches] : [];
      if (currentBatches.length === 0 && currentStock > 0) {
        currentBatches.push({
          id: `batch_compat_${prodId.slice(0, 8)}`,
          quantity: currentStock,
          initialQuantity: currentStock,
          unitCost: Number(prodData.purchasePrice || 0),
          purchasePlace: 'Inventario inicial',
          createdAt: prodData.createdAt || new Date().toISOString()
        });
      }

      // Ordenar por fecha de creación ascendente (más antiguas primero)
      currentBatches.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      let qtyToConsume = requestedQty;
      let totalCMV = 0;
      for (const batch of currentBatches) {
        if (qtyToConsume <= 0) break;
        if (batch.quantity <= 0) continue;
        const take = Math.min(batch.quantity, qtyToConsume);
        batch.quantity -= take;
        qtyToConsume -= take;
        totalCMV += take * Number(batch.unitCost || 0);
      }

      t.update(prodRef, {
        stock: newStock,
        batches: currentBatches,
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
        resultingStock: newStock,
        date: dateStr,
        time: hoursStr,
        actorName: params.userName || 'Punto de Venta',
        notes: `Venta Mostrador · Ticket ${ticketCode}${totalCMV > 0 ? ` · CMV: $${totalCMV.toLocaleString()}` : ''}`,
        operationId,
        createdAt: serverTimestamp()
      });
    }

    // 3.5 Asignación de deuda en users/{userId}.debt
    if (currentAccountDebtAmount > 0 && userRef) {
      t.set(userRef, {
        debt: increment(currentAccountDebtAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
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

  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, params.idempotencyKey);
  const opRef = doc(db, OPERATIONS_COLLECTION, params.operationId);

  return await runTransaction(db, async (t) => {
    // --- FASE 1: LECTURAS (TODAS ANTES DE CUALQUIER ESCRITURA) ---
    const idemSnap = await t.get(idemRef);
    const opSnap = await t.get(opRef);

    if (!opSnap.exists()) {
      throw new Error(`Operación '${params.operationId}' no encontrada.`);
    }

    const opData = opSnap.data() as OperationDocument;
    const userRef = opData.userId ? doc(db, USERS_COLLECTION, opData.userId) : null;
    const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, opData.bookingId) : null;

    const userSnap = userRef ? await t.get(userRef) : null;
    const bookingSnap = bookingRef ? await t.get(bookingRef) : null;

    // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
    // 2.1 Validación de idempotencia
    const idemRecord = idemSnap.exists() ? (idemSnap.data() as IdempotencyRecord) : null;
    const idemVal = validateIdempotencyRequest(idemRecord, {
      complexId: params.complexId,
      operationId: params.operationId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      flow: 'income'
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
    if (opData.complexId !== params.complexId) {
      throw new Error('La operación no pertenece al complejo activo.');
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

    const isExpense = opData.operationType === 'expense' || opData.operationType === 'purchase';
    const movementFlow: 'income' | 'expense' = isExpense ? 'expense' : 'income';
    const category: FinancialMovementCategory = params.category || 
      (isExpense ? 'expense_payment' : (opData.operationType === 'court_booking' ? 'booking_settlement' : 'sale_collection'));

    // --- FASE 3: ESCRITURAS ATÓMICAS (DESPUÉS DE TODAS LAS LECTURAS) ---
    // 3.1 Registrar movimiento financiero
    const movementId = generateUUID();
    const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movementId);
    const movDocData: FinancialMovementDocument = {
      id: movementId,
      complexId: params.complexId,
      operationId: params.operationId,
      ticketCode: opData.ticketCode,
      idempotencyKey: params.idempotencyKey,
      flow: movementFlow,
      category,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      effectiveDate: serverTimestamp(),
      userId: opData.userId || opData.clientId || null,
      clientId: opData.clientId || opData.userId || null,
      responsibleName: opData.userName || opData.clientName || 'NN',
      userName: opData.userName || opData.clientName || 'NN',
      clientName: opData.clientName || opData.userName || 'NN',
      userPhone: opData.userPhone || opData.clientPhone || '',
      clientPhone: opData.clientPhone || opData.userPhone || '',
      clearedCurrentAccountDebt: clearedDebt,
      notes: params.notes || '',
      operatorId: params.operatorId,
      createdAt: serverTimestamp()
    };
    t.set(movRef, movDocData);

    // 3.2 Registrar clave de idempotencia completada
    t.set(idemRef, {
      idempotencyKey: params.idempotencyKey,
      complexId: params.complexId,
      operationId: params.operationId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
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
      updatedAt: serverTimestamp()
    });

    // 3.4 Reducir users/{userId}.debt exactamente por clearedDebt si aplica
    if (clearedDebt > 0 && userRef) {
      t.set(userRef, {
        debt: increment(-clearedDebt),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 3.5 Actualizar reserva asociada si existe
    if (bookingRef && bookingSnap && bookingSnap.exists()) {
      t.update(bookingRef, {
        paymentStatus: balances.paymentStatus,
        payment_status: balances.paymentStatus,
        deposit: balances.totalCollected,
        amount_paid: balances.totalCollected,
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
      paymentMethod: params.paymentMethod,
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
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 3.2 Crear movimiento financiero con categoría canónica 'historical_debt_payment' y operationId = null
    const movementId = generateUUID();
    const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movementId);
    const movDocData: FinancialMovementDocument = {
      id: movementId,
      complexId: params.complexId,
      operationId: null, // Sin operación ficticia
      ticketCode,
      idempotencyKey: params.idempotencyKey,
      flow: 'income',
      category: 'historical_debt_payment', // Categoría canónica unificada
      amount: settle.clearedAmount,
      paymentMethod: params.paymentMethod,
      effectiveDate: serverTimestamp(),
      userId: params.userId,
      responsibleName: userData.name || userData.clientName || 'Cliente',
      clearedCurrentAccountDebt: settle.clearedAmount,
      notes: params.notes || 'Abono directo a cuenta corriente histórica',
      operatorId: params.operatorId,
      createdAt: serverTimestamp()
    };
    t.set(movRef, movDocData);

    // 3.3 Registrar clave de idempotencia completada
    t.set(idemRef, {
      idempotencyKey: params.idempotencyKey,
      complexId: params.complexId,
      operationId: null,
      amount: settle.clearedAmount,
      paymentMethod: params.paymentMethod,
      flow: 'income',
      status: 'completed',
      movementId,
      ticketCode,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    // 3.4 Descontar deuda atómicamente de users/{userId}.debt
    t.set(userRef, {
      debt: increment(-settle.clearedAmount),
      updatedAt: serverTimestamp()
    }, { merge: true });

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
    const opSnap = await t.get(opRef);
    if (!opSnap.exists()) {
      throw new Error(`Operación '${params.operationId}' no encontrada.`);
    }

    const opData = opSnap.data() as OperationDocument;
    const userRef = opData.userId ? doc(db, USERS_COLLECTION, opData.userId) : null;
    const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, opData.bookingId) : null;

    const userSnap = userRef ? await t.get(userRef) : null;
    const bookingSnap = bookingRef ? await t.get(bookingRef) : null;
    const idemSnap = idemRef ? await t.get(idemRef) : null;

    // --- FASE 2: VALIDACIONES Y CÁLCULOS DETERMINISTAS ---
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
        operationId: params.operationId,
        ticketCode: opData.ticketCode,
        idempotencyKey: params.idempotencyKey || generateUUID(),
        flow: 'expense',
        category: 'refund',
        amount: refundAmount,
        paymentMethod: params.refundPaymentMethod || 'cash',
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
          operationId: params.operationId,
          amount: refundAmount,
          paymentMethod: params.refundPaymentMethod || 'cash',
          flow: 'expense',
          status: 'completed',
          movementId: refundMovementId,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    }

    // 3.3 Si había deuda fiada sin cobrar, descontarla de users/{userId}.debt
    if (debtToExtinguish > 0 && userRef) {
      t.set(userRef, {
        debt: increment(-debtToExtinguish),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 3.4 Sincronizar estado de reserva
    if (bookingRef && bookingSnap && bookingSnap.exists()) {
      t.update(bookingRef, {
        status: 'cancelado',
        paymentStatus: balances.paymentStatus,
        payment_status: balances.paymentStatus,
        updatedAt: serverTimestamp()
      });
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
export function subscribeToOperations(
  complexId: string,
  cb: (operations: OperationDocument[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, OPERATIONS_COLLECTION);
  const q1 = query(colRef, where('complexId', '==', targetId));
  const q2 = query(colRef, where('complejoId', '==', targetId));

  const map1 = new Map<string, OperationDocument>();
  const map2 = new Map<string, OperationDocument>();

  const emitMerged = () => {
    const merged = new Map<string, OperationDocument>([...map1, ...map2]);
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
    cb(list);
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    map1.clear();
    snap.forEach((d) => {
      map1.set(d.id, { id: d.id, ...d.data() } as OperationDocument);
    });
    emitMerged();
  }, (err) => {
    console.warn('[Firestore] Error escuchando operaciones (q1 complexId):', err);
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    map2.clear();
    snap.forEach((d) => {
      map2.set(d.id, { id: d.id, ...d.data() } as OperationDocument);
    });
    emitMerged();
  }, (err) => {
    console.warn('[Firestore] Error escuchando operaciones (q2 complejoId):', err);
  });

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Escucha en tiempo real los movimientos de caja (/financial_movements) de un complejo,
 * fusionando queries por complexId y complejoId para garantizar cobertura total en Vercel.
 */
export function subscribeToFinancialMovements(
  complexId: string,
  cb: (movements: FinancialMovementDocument[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, FINANCIAL_MOVEMENTS_COLLECTION);
  const q1 = query(colRef, where('complexId', '==', targetId));
  const q2 = query(colRef, where('complejoId', '==', targetId));

  const map1 = new Map<string, FinancialMovementDocument>();
  const map2 = new Map<string, FinancialMovementDocument>();

  const emitMerged = () => {
    const merged = new Map<string, FinancialMovementDocument>([...map1, ...map2]);
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
    cb(list);
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    map1.clear();
    snap.forEach((d) => {
      map1.set(d.id, { id: d.id, ...d.data() } as FinancialMovementDocument);
    });
    emitMerged();
  }, (err) => {
    console.warn('[Firestore] Error escuchando movimientos (q1 complexId):', err);
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    map2.clear();
    snap.forEach((d) => {
      map2.set(d.id, { id: d.id, ...d.data() } as FinancialMovementDocument);
    });
    emitMerged();
  }, (err) => {
    console.warn('[Firestore] Error escuchando movimientos (q2 complejoId):', err);
  });

  return () => {
    unsub1();
    unsub2();
  };
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

  // 1. Si se invocó desde un movimiento, leer primero el documento para extraer operationId y bookingId
  let movDocData: any = null;
  if (movId) {
    try {
      const mSnap = await getDoc(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId));
      if (mSnap.exists()) {
        movDocData = mSnap.data();
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
  if (opId) {
    try {
      const opSnap = await getDoc(doc(db, OPERATIONS_COLLECTION, opId));
      if (opSnap.exists()) {
        opDocData = opSnap.data();
        if (!bId && opDocData.bookingId) {
          bId = String(opDocData.bookingId).trim();
        }
      } else {
        const txSnap = await getDoc(doc(db, TRANSACTIONS_COLLECTION, opId));
        if (txSnap.exists()) {
          opDocData = txSnap.data();
          if (!bId && opDocData.bookingId) {
            bId = String(opDocData.bookingId).trim();
          }
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
      // Limpieza adicional garantizada del movimiento individual si existiese
      if (movId) {
        try {
          await deleteDoc(doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId));
        } catch {}
      }
      return { success: true };
    }
  }

  // CASO B — Operación de Mostrador (pos_sale), Compra (purchase) o Gasto (expense)
  const effectiveOpId = opId || movDocData?.operationId || null;

  if (opDocData) {
    const isSale = opDocData.operationType === 'pos_sale' || opDocData.type === 'pos' || opDocData.type === 'sale';
    const isPurchase = opDocData.operationType === 'purchase' || opDocData.type === 'purchase' || opDocData.type === 'compra';

    // B.1. Restauración de Stock
    if (isSale && Array.isArray(opDocData.items)) {
      for (const it of opDocData.items) {
        const pId = it.productId || it.id;
        const qty = Number(it.quantity) || 0;
        if (pId && qty > 0) {
          try {
            await updateDoc(doc(db, PRODUCTS_COLLECTION, String(pId)), {
              stock: increment(qty),
              updatedAt: serverTimestamp()
            });
          } catch (err) {
            console.warn('[Firestore] Error restaurando stock tras eliminar venta:', err);
          }
        }
      }
    } else if (isPurchase) {
      // Restar la cantidad comprada del stock
      const pId = opDocData.productId || (Array.isArray(opDocData.items) && opDocData.items[0]?.productId) || (Array.isArray(opDocData.items) && opDocData.items[0]?.id);
      const qty = Number(opDocData.quantity ?? (Array.isArray(opDocData.items) && opDocData.items[0]?.quantity) ?? 0);
      if (pId && qty > 0) {
        try {
          const pRef = doc(db, PRODUCTS_COLLECTION, String(pId));
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const currentStock = Number(pSnap.data().stock || 0);
            await updateDoc(pRef, {
              stock: Math.max(0, currentStock - qty),
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.warn('[Firestore] Error descontando stock tras eliminar compra:', err);
        }
      }

      // Remover lote asociado en batches si existe
      if (effectiveOpId) {
        try {
          const batchQ = query(collection(db, 'batches'), where('operationId', '==', String(effectiveOpId)));
          const bSnap = await getDocs(batchQ);
          const bBatch = writeBatch(db);
          bSnap.forEach(d => bBatch.delete(d.ref));
          await bBatch.commit();
        } catch {}
      }
    }

    // B.2. Revertir saldo de deuda en cuenta corriente si aplica
    const debtAmt = Number(opDocData.currentAccountDebtAmount || 0);
    const userId = opDocData.userId || opDocData.clientId;
    if (debtAmt > 0 && userId) {
      try {
        await updateDoc(doc(db, USERS_COLLECTION, String(userId)), {
          debt: increment(-debtAmt),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('[Firestore] Error revirtiendo saldo deudor del cliente:', err);
      }
    }
  }

  // B.3. Eliminación de documentos en Firestore
  const deleteBatch = writeBatch(db);

  if (effectiveOpId) {
    // Documento en operations
    deleteBatch.delete(doc(db, OPERATIONS_COLLECTION, String(effectiveOpId)));

    // Documentos en financial_movements con operationId == effectiveOpId
    try {
      const fmQ = query(collection(db, FINANCIAL_MOVEMENTS_COLLECTION), where('operationId', '==', String(effectiveOpId)));
      const fmSnap = await getDocs(fmQ);
      fmSnap.forEach(d => deleteBatch.delete(d.ref));
    } catch {}

    // Documentos en inventory_movements con operationId == effectiveOpId
    try {
      const imQ = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where('operationId', '==', String(effectiveOpId)));
      const imSnap = await getDocs(imQ);
      imSnap.forEach(d => deleteBatch.delete(d.ref));
    } catch {}

    // Documentos en transactions (por ID o operationId)
    deleteBatch.delete(doc(db, TRANSACTIONS_COLLECTION, String(effectiveOpId)));
    try {
      const txQ = query(collection(db, TRANSACTIONS_COLLECTION), where('operationId', '==', String(effectiveOpId)));
      const txSnap = await getDocs(txQ);
      txSnap.forEach(d => deleteBatch.delete(d.ref));
    } catch {}

    // Eliminar claves de idempotencia vinculadas si existen
    try {
      const idempQ = query(collection(db, 'idempotency_keys'), where('operationId', '==', String(effectiveOpId)));
      const idempSnap = await getDocs(idempQ);
      idempSnap.forEach(d => deleteBatch.delete(d.ref));
    } catch {}
  }

  // Si se pasó un movimiento individual puntual, asegurar su eliminación
  if (movId) {
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
}): Promise<PaymentRegistrationResult> {
  const totalAmount = params.payments.reduce((s, p) => s + (Math.max(0, Number(p.amount) || 0)), 0);
  if (totalAmount <= 0) {
    throw new Error('El importe total a cobrar debe ser mayor a 0.');
  }

  // Si es un solo método, ejecutar registerOperationPayment estándar
  if (params.payments.length === 1) {
    const single = params.payments[0];
    return await registerOperationPayment({
      complexId: params.complexId,
      operationId: params.operationId,
      amount: single.amount,
      paymentMethod: single.paymentMethod,
      idempotencyKey: single.idempotencyKey,
      operatorId: params.operatorId,
      notes: single.notes || params.notes
    });
  }

  // Para pagos divididos sobre la misma operación, ejecutar atómicamente en una transacción
  const opRef = doc(db, OPERATIONS_COLLECTION, params.operationId);

  return await runTransaction(db, async (t) => {
    // 1. Lecturas
    const opSnap = await t.get(opRef);
    if (!opSnap.exists()) {
      throw new Error(`Operación '${params.operationId}' no encontrada.`);
    }

    const opData = opSnap.data() as OperationDocument;
    const userRef = opData.userId ? doc(db, USERS_COLLECTION, opData.userId) : null;
    const bookingRef = opData.bookingId ? doc(db, BOOKINGS_COLLECTION, opData.bookingId) : null;

    if (userRef) await t.get(userRef);
    if (bookingRef) await t.get(bookingRef);

    // Lectura de idempotencia para cada pago
    const idemSnaps = await Promise.all(
      params.payments.map(p => t.get(doc(db, IDEMPOTENCY_COLLECTION, p.idempotencyKey)))
    );

    // 2. Validaciones
    if (opData.complexId !== params.complexId) {
      throw new Error('La operación no pertenece al complejo activo.');
    }
    if (['cancelled_unpaid', 'cancelled_retained', 'fully_refunded'].includes(opData.paymentStatus)) {
      throw new Error(`No se pueden registrar cobros sobre una operación cancelada (${opData.paymentStatus}).`);
    }
    if (opData.amountPending <= 0) {
      throw new Error('La operación ya se encuentra totalmente saldada.');
    }

    // Si algún pago ya fue completado, detectar idempotencia
    const allCompleted = idemSnaps.every(s => s.exists() && (s.data() as IdempotencyRecord).status === 'completed');
    if (allCompleted) {
      return {
        success: true,
        operationId: params.operationId,
        movementId: (idemSnaps[0]?.data() as IdempotencyRecord)?.movementId || null,
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

    // 3. Escrituras
    const createdMovementIds: string[] = [];
    for (let i = 0; i < params.payments.length; i++) {
      const p = params.payments[i];
      const pAmt = Math.max(0, Number(p.amount) || 0);
      if (pAmt > 0) {
        const movId = generateUUID();
        createdMovementIds.push(movId);
        const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
        const movDocData: FinancialMovementDocument = {
          id: movId,
          complexId: params.complexId,
          complejoId: params.complexId,
          operationId: params.operationId,
          ticketCode: opData.ticketCode,
          idempotencyKey: p.idempotencyKey,
          flow: movementFlow,
          category,
          amount: pAmt,
          paymentMethod: p.paymentMethod,
          effectiveDate: serverTimestamp(),
          userId: opData.userId || opData.clientId || null,
          clientId: opData.clientId || opData.userId || null,
          responsibleName: opData.userName || opData.clientName || 'NN',
          userName: opData.userName || opData.clientName || 'NN',
          clientName: opData.clientName || opData.userName || 'NN',
          userPhone: opData.userPhone || opData.clientPhone || '',
          clientPhone: opData.clientPhone || opData.userPhone || '',
          clearedCurrentAccountDebt: 0, // se descuenta del total consolidado
          notes: p.notes || params.notes || '',
          operatorId: params.operatorId,
          createdAt: serverTimestamp()
        };
        t.set(movRef, movDocData);

        const pIdemRef = doc(db, IDEMPOTENCY_COLLECTION, p.idempotencyKey);
        t.set(pIdemRef, {
          idempotencyKey: p.idempotencyKey,
          complexId: params.complexId,
          complejoId: params.complexId,
          operationId: params.operationId,
          amount: pAmt,
          paymentMethod: p.paymentMethod,
          flow: movementFlow,
          status: 'completed',
          movementId: movId,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      }
    }

    // Actualizar operación
    t.update(opRef, {
      totalCollected: balances.totalCollected,
      netCollected: balances.netCollected,
      amountPending: balances.amountPending,
      paymentStatus: balances.paymentStatus,
      currentAccountDebtAmount: remainingOpDebt,
      updatedAt: serverTimestamp()
    });

    // Descontar users/{userId}.debt
    if (clearedDebt > 0 && userRef) {
      t.set(userRef, {
        debt: increment(-clearedDebt),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // Sincronizar reserva si aplica
    if (bookingRef) {
      t.update(bookingRef, {
        paymentStatus: balances.paymentStatus,
        payment_status: balances.paymentStatus,
        deposit: balances.totalCollected,
        amount_paid: balances.totalCollected,
        updatedAt: serverTimestamp()
      });
    }

    return {
      success: true,
      operationId: params.operationId,
      movementId: createdMovementIds[0] || null,
      ticketCode: opData.ticketCode,
      paymentStatus: balances.paymentStatus,
      amountPending: balances.amountPending,
      currentAccountDebtAmount: remainingOpDebt,
      clearedCurrentAccountDebt: clearedDebt
    };
  });
}

/**
 * Liquida cobros sobre transacciones históricas (/transactions) o reservas virtuales
 * registrando los movimientos financieros individuales en /financial_movements y actualizando
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
  const totalAmount = params.payments.reduce((s, p) => s + (Math.max(0, Number(p.amount) || 0)), 0);
  if (totalAmount <= 0) {
    throw new Error(params.isExpense ? 'El importe a pagar debe ser mayor a 0.' : 'El importe a cobrar debe ser mayor a 0.');
  }

  const resolvedSettleName = resolveClientName(params);
  const resolvedSettlePhone = resolveClientPhone(params);
  const settleClientId = (params.userId && String(params.userId) !== '0') ? String(params.userId) : null;
  const isExp = Boolean(params.isExpense);
  const movFlow: 'income' | 'expense' = isExp ? 'expense' : 'income';

  // 1. Registrar movimientos financieros para cada pago
  for (const p of params.payments) {
    const pAmt = Number(p.amount) || 0;
    if (pAmt <= 0) continue;

    const movId = generateUUID();
    const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
    const category: FinancialMovementCategory = isExp 
      ? 'expense_payment' 
      : (params.bookingId ? 'booking_settlement' : 'historical_debt_payment');

    await setDoc(movRef, {
      id: movId,
      complexId: params.complexId,
      complejoId: params.complexId,
      operationId: params.operationId,
      ticketCode: params.ticketCode || params.operationId.slice(0, 8),
      idempotencyKey: p.idempotencyKey,
      flow: movFlow,
      category,
      amount: pAmt,
      paymentMethod: p.paymentMethod,
      effectiveDate: serverTimestamp(),
      userId: settleClientId,
      clientId: settleClientId,
      responsibleName: resolvedSettleName,
      userName: resolvedSettleName,
      clientName: resolvedSettleName,
      userPhone: resolvedSettlePhone,
      clientPhone: resolvedSettlePhone,
      notes: p.notes || params.notes || (isExp ? 'Pago saldo pendiente proveedor' : 'Cobro saldo pendiente'),
      operatorId: params.operatorId,
      createdAt: serverTimestamp()
    });

    // Registrar idempotencia
    const idemRef = doc(db, IDEMPOTENCY_COLLECTION, p.idempotencyKey);
    await setDoc(idemRef, {
      idempotencyKey: p.idempotencyKey,
      complexId: params.complexId,
      complejoId: params.complexId,
      operationId: params.operationId,
      amount: pAmt,
      paymentMethod: p.paymentMethod,
      flow: movFlow,
      status: 'completed',
      movementId: movId,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });
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
          updatedAt: serverTimestamp()
        });

        // Sincronizar también la operación comercial única de la reserva si existe
        const opRef = doc(db, OPERATIONS_COLLECTION, `${params.bookingId}-booking`);
        const opSnap = await getDoc(opRef);
        if (opSnap.exists()) {
          const opData = opSnap.data();
          await updateDoc(opRef, {
            totalCollected: newPaid,
            netCollected: newPaid - (opData.totalRefunded || 0),
            amountPending: Math.max(0, totalPrice - newPaid),
            paymentStatus: isPaid ? 'paid' : 'partial',
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (bErr) {
      console.warn('[Firestore] Error actualizando reserva:', bErr);
    }
  } else {
    // 3. Si es una transacción en /transactions, actualizar su desglose
    try {
      const txRef = doc(db, TRANSACTIONS_COLLECTION, params.operationId);
      const txSnap = await getDoc(txRef);
      if (txSnap.exists()) {
        const txData = txSnap.data();
        const currentPayments = Array.isArray(txData.payments) ? [...txData.payments] : [];
        for (const p of params.payments) {
          currentPayments.push({
            method: p.paymentMethod,
            amount: p.amount
          });
        }
        const totalPaidAll = currentPayments
          .filter(p => p.method !== 'fiado')
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const txTotal = Number(txData.total || txData.amount || 0);
        const isFullyPaid = totalPaidAll >= txTotal - 0.01;

        await updateDoc(txRef, {
          payments: currentPayments,
          paymentStatus: isFullyPaid ? 'paid' : 'partial',
          settledAt: serverTimestamp()
        });
      }
    } catch (txErr) {
      console.warn('[Firestore] Error actualizando transacción histórica:', txErr);
    }
  }

  // 4. Si el cliente tiene cuenta con deuda, reducir users/{userId}.debt
  if (params.userId) {
    try {
      const userRef = doc(db, USERS_COLLECTION, params.userId);
      await updateDoc(userRef, {
        debt: increment(-totalAmount),
        updatedAt: serverTimestamp()
      });
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
  operatorId?: string;
  idempotencyKey?: string;
  notes?: string;
}): Promise<{ success: boolean; movementId: string }> {
  const strBookingId = String(params.bookingId);
  const targetComplexId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const payAmt = Math.max(0, Number(params.amount) || 0);
  if (payAmt <= 0) {
    throw new Error('El importe a cobrar debe ser mayor a $0.');
  }

  const bRef = doc(db, BOOKINGS_COLLECTION, strBookingId);
  const opRef = doc(db, OPERATIONS_COLLECTION, `${strBookingId}-booking`);
  const idemKey = params.idempotencyKey || `pay_booking_${strBookingId}_${Date.now()}`;
  const idemRef = doc(db, IDEMPOTENCY_COLLECTION, idemKey);

  return await runTransaction(db, async (t) => {
    // 1. Lecturas
    const bSnap = await t.get(bRef);
    if (!bSnap.exists()) {
      throw new Error(`Reserva '${strBookingId}' no encontrada.`);
    }

    const opSnap = await t.get(opRef);
    const idemSnap = await t.get(idemRef);

    // Idempotencia
    if (idemSnap.exists() && idemSnap.data()?.status === 'completed') {
      return {
        success: true,
        movementId: idemSnap.data()?.movementId || ''
      };
    }

    const bData = bSnap.data();
    const totalPrice = Number(bData.price ?? bData.price_total ?? 0);
    const previousPaid = Number(bData.amount_paid ?? bData.deposit ?? 0);
    const newPaid = previousPaid + payAmt;
    const newPending = Math.max(0, totalPrice - newPaid);
    const isFullyPaid = newPaid >= totalPrice - 0.01 && totalPrice > 0;
    const paymentStatusEs = isFullyPaid ? 'pagado' : 'seña';
    const paymentStatusEn = isFullyPaid ? 'paid' : 'partial';

    // Generar movimiento financiero independiente
    const movId = generateUUID();
    const movRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, movId);
    const ticketCode = (opSnap.exists() && opSnap.data()?.ticketCode) 
      ? opSnap.data().ticketCode 
      : `B-${strBookingId.slice(0, 6).toUpperCase()}`;

    const movCategory: FinancialMovementCategory = isFullyPaid ? 'booking_settlement' : 'booking_deposit';

    const resolvedBookingClient = resolveClientName(bData, null, opSnap.exists() ? opSnap.data() : null);
    const resolvedBookingPhone = resolveClientPhone(bData, null, opSnap.exists() ? opSnap.data() : null);
    const bookingClientId = bData.userId || bData.host_id || (opSnap.exists() ? opSnap.data().userId : null) || null;

    // 2. Escrituras atómicas
    // 2.1 Movimiento financiero en /financial_movements
    t.set(movRef, {
      id: movId,
      complexId: targetComplexId,
      complejoId: targetComplexId,
      operationId: `${strBookingId}-booking`,
      bookingId: strBookingId,
      ticketCode,
      idempotencyKey: idemKey,
      flow: 'income',
      category: movCategory,
      amount: payAmt,
      paymentMethod: params.paymentMethod || 'cash',
      effectiveDate: serverTimestamp(),
      userId: bookingClientId,
      clientId: bookingClientId,
      responsibleName: resolvedBookingClient,
      userName: resolvedBookingClient,
      clientName: resolvedBookingClient,
      userPhone: resolvedBookingPhone,
      clientPhone: resolvedBookingPhone,
      clearedCurrentAccountDebt: 0,
      notes: params.notes || `Cobro seña/saldo reserva ${bData.courtName || bData.court_name || 'Cancha'}`,
      operatorId: params.operatorId || 'pos_operator',
      createdAt: serverTimestamp()
    });

    // 2.2 Registro de idempotencia
    t.set(idemRef, {
      idempotencyKey: idemKey,
      complexId: targetComplexId,
      complejoId: targetComplexId,
      operationId: `${strBookingId}-booking`,
      bookingId: strBookingId,
      amount: payAmt,
      paymentMethod: params.paymentMethod || 'cash',
      flow: 'income',
      status: 'completed',
      movementId: movId,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    // 2.3 Operación comercial única (conserva una sola fila para la reserva)
    if (opSnap.exists()) {
      const opData = opSnap.data();
      t.update(opRef, {
        totalCollected: newPaid,
        netCollected: newPaid - (opData.totalRefunded || 0),
        amountPending: newPending,
        paymentStatus: paymentStatusEn,
        updatedAt: serverTimestamp()
      });
    } else {
      // Crear operación comercial si no existía (ej. reserva creada previamente)
      t.set(opRef, {
        id: `${strBookingId}-booking`,
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
        notes: bData.notes || `Reserva ${bData.courtName || 'Cancha'} ${bData.date || ''}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.operatorId || 'pos_operator'
      });
    }

    // 2.4 Actualizar documento de la reserva
    t.update(bRef, {
      deposit: newPaid,
      amount_paid: newPaid,
      paymentStatus: paymentStatusEs,
      payment_status: paymentStatusEn,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      movementId: movId
    };
  });
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

  const result = await runTransaction(db, async (t) => {
    // 1. Lecturas
    const bSnap = await t.get(bRef);
    if (!bSnap.exists()) {
      throw new Error(`Reserva '${params.bookingId}' no encontrada.`);
    }

    const bData = bSnap.data();
    const isAlreadyCancelled = bData.status === 'cancelado' || bData.status === 'cancelled';

    // Idempotencia
    if (idemRef) {
      const idemSnap = await t.get(idemRef);
      if (idemSnap.exists() && idemSnap.data()?.status === 'completed') {
        return {
          success: true,
          refundAmount: Number(idemSnap.data()?.amount || 0),
          retainedAmount: Number(bData.retainedAmount || 0),
          finalPaymentStatus: bData.paymentStatus || bData.payment_status || 'cancelled_unpaid',
          refundMovementId: idemSnap.data()?.movementId,
          alreadyProcessed: true
        };
      }
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

    // Buscar si existe operación asociada
    let opRef = null;
    let opSnap = null;
    const directOpRef = doc(db, OPERATIONS_COLLECTION, `${params.bookingId}-booking`);
    const directOpSnap = await t.get(directOpRef);
    if (directOpSnap.exists()) {
      opRef = directOpRef;
      opSnap = directOpSnap;
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

    // 2. Escrituras atómicas
    // 2.1 Actualizar documento en bookings
    t.update(bRef, {
      status: 'cancelado',
      paymentStatus: plan.finalPaymentStatus,
      payment_status: plan.finalPaymentStatus,
      totalRefunded: previousRefunds + plan.refundAmount,
      retainedAmount: plan.retainedAmount,
      cancellationReason: params.reason || '',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 2.2 Registrar movimiento de egreso si hay devolución
    let refundMovementId: string | undefined = undefined;
    if (plan.refundAmount > 0 && totalCollected > 0) {
      refundMovementId = generateUUID();
      const refundMovRef = doc(db, FINANCIAL_MOVEMENTS_COLLECTION, refundMovementId);
      const ticketCode = `B-${params.bookingId.slice(0, 6).toUpperCase()}`;

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
        paymentMethod: params.refundPaymentMethod || 'cash',
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
          operationId: `${params.bookingId}-booking`,
          bookingId: params.bookingId,
          amount: plan.refundAmount,
          paymentMethod: params.refundPaymentMethod || 'cash',
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
        bookingId: params.bookingId,
        amount: 0,
        flow: 'expense',
        status: 'completed',
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    }

    // 2.3 Actualizar operación si existía
    if (opRef && opSnap) {
      const opData = opSnap.data();
      t.update(opRef, {
        totalRefunded: (opData.totalRefunded || 0) + plan.refundAmount,
        netCollected: opData.totalCollected - (opData.totalRefunded || 0) - plan.refundAmount,
        retainedAmount: plan.retainedAmount,
        amountPending: 0,
        paymentStatus: plan.finalPaymentStatus,
        notes: `${opData.notes ? opData.notes + ' | ' : ''}Cancelado: ${params.reason || ''}`,
        updatedAt: serverTimestamp()
      });
    }

    return {
      success: true,
      refundAmount: plan.refundAmount,
      retainedAmount: plan.retainedAmount,
      finalPaymentStatus: plan.finalPaymentStatus,
      refundMovementId
    };
  });

  // Liberar el bloqueo en booking_locks y sincronizar métricas
  try {
    const bSnap = await getDoc(bRef);
    if (bSnap.exists()) {
      const bData = bSnap.data();
      const courtId = String(bData.courtId || bData.court_id || 'c_1');
      const targetComplexId = bData.complejoId || bData.complexId || params.complexId;
      const date = bData.date;
      const userId = bData.userId || bData.host_id;

      if (targetComplexId && courtId && date) {
        const affectedCourts = await getOverlappingCourtIds(targetComplexId, courtId);
        const lockRefs = affectedCourts.map(cid => 
          doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${date}`)
        );
        const lockSnaps = await Promise.all(lockRefs.map(ref => getDoc(ref)));
        for (let i = 0; i < affectedCourts.length; i++) {
          const lSnap = lockSnaps[i];
          if (lSnap.exists()) {
            const bMap = { ...(lSnap.data().bookings || {}) };
            if (bMap[params.bookingId]) {
              delete bMap[params.bookingId];
              await setDoc(lockRefs[i], {
                bookings: bMap,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }
      }

      if (userId) {
        syncUserMetricsWithBookings(String(userId));
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error releasing lock or updating metrics after cancel:', err);
  }

  return result;
}


