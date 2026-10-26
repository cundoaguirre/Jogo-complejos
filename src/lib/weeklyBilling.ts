/**
 * Módulo de Liquidación Semanal (10% sobre turnos jugados) y Configuración de Cobro Jogo SaaS
 * 
 * Zona horaria: 'America/Argentina/Buenos_Aires' (UTC-3).
 * Reglas de ciclo:
 * - Complejo 'active' con 'activatedAt' válido (en 'trial' no genera obligaciones).
 * - Primer período: desde 'activatedAt' hasta el domingo siguiente a las 23:59:59.
 * - Períodos siguientes: Lunes 00:00:00 a Domingo 23:59:59.
 * - Vencimiento: Lunes inmediato siguiente (YYYY-MM-DD).
 * - ID determinístico: obl_${complexId}_${startDateStr}_${endDateStr}
 */

import { doc, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { SUPPORT_CONFIG } from '../config/support';
import type { Match } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface BillingConfig {
  accountHolder: string;
  alias: string;
  cvu: string;
  whatsappNumber: string;
  updatedAt?: string;
}

export interface WeeklyPaymentObligation {
  id: string; // obl_${complexId}_${startDateStr}_${endDateStr}
  complexId: string;
  complexName: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  dueDateStr: string;   // YYYY-MM-DD (Monday)
  gmv: number;
  originalAmountDue: number; // Math.round(gmv * 0.10)
  amountPaid: number;
  remainingBalance: number;
  status: 'paid' | 'pending' | 'partial';
  daysAfterDue: number;
  playedBookings: Match[];
}

export type NoticeModalType = 'trial' | 'monday' | 'tuesday' | 'wednesday';

export interface BillingNoticeState {
  type: NoticeModalType | null;
  obligation: WeeklyPaymentObligation | null;
  trialDaysRemaining: number | null;
  isBlockedByDebt: boolean;
  blockingObligation: WeeklyPaymentObligation | null;
  totalDebt: number;
  totalOverdueDebt: number;
  unpaidObligations: WeeklyPaymentObligation[];
  overdueObligations: WeeklyPaymentObligation[];
}

// ---------------------------------------------------------------------------
// Helpers de Fecha y Zona Horaria (America/Argentina/Buenos_Aires)
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Obtiene los componentes de fecha y hora actuales en la zona horaria de Argentina (UTC-3).
 */
export function getArgentinaNowComponents(d: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }

  const year = parseInt(p.year || '2026', 10);
  const month = parseInt(p.month || '1', 10);
  const day = parseInt(p.day || '1', 10);
  const hour = parseInt(p.hour || '0', 10);
  const minute = parseInt(p.minute || '0', 10);
  const second = parseInt(p.second || '0', 10);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
    timeStr: `${pad2(hour)}:${pad2(minute)}`
  };
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD en Argentina.
 */
export function getArgentinaTodayStr(): string {
  return getArgentinaNowComponents().dateStr;
}

/**
 * Formatea una fecha YYYY-MM-DD a DD/MM (ej: 12/10).
 */
export function formatDDMM(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Formatea una fecha YYYY-MM-DD a DD/MM/YYYY (ej: 12/10/2026).
 */
export function formatDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Formatea un importe numérico en formato de moneda argentina (ej: $ 15.000).
 */
export function formatCurrencyARS(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Convierte YYYY, MM, DD en Argentina al timestamp UTC correspondiente
 * a las 23:59:59.999 de ese día en Argentina (UTC-3 => 02:59:59.999 UTC del día siguiente).
 */
function argEndOfDayMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999) + (3 * 3600 * 1000);
}

/**
 * Suma días a una fecha (año, mes 1-indexed, día) de forma segura.
 */
function addDays(y: number, m: number, d: number, days: number) {
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function dateToStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function getDayOfWeek(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 1 = Monday ...
}

/**
 * Calcula la diferencia en días enteros entre todayStr (YYYY-MM-DD) y dueStr (YYYY-MM-DD).
 */
export function diffInDays(todayStr: string, dueStr: string): number {
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [dy, dm, dd] = dueStr.split('-').map(Number);
  const tMs = Date.UTC(ty, tm - 1, td);
  const dMs = Date.UTC(dy, dm - 1, dd);
  return Math.round((tMs - dMs) / 86400000);
}

// ---------------------------------------------------------------------------
// 1. Fuente de Verdad de Datos de Cobro y WhatsApp (settings/billing_config)
// ---------------------------------------------------------------------------

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  accountHolder: '',
  alias: '',
  cvu: '',
  whatsappNumber: SUPPORT_CONFIG.whatsappNumber || '',
};

/**
 * Suscripción en tiempo real al documento settings/billing_config.
 * Si algún campo no existe o está vacío, recurre a SUPPORT_CONFIG o queda vacío
 * para que la UI muestre "Pendiente de configurar en administración".
 */
export function subscribeBillingConfig(onUpdate: (config: BillingConfig) => void): () => void {
  const configRef = doc(db, 'settings', 'billing_config');

  const unsubscribe = onSnapshot(configRef, (snap) => {
    if (!snap.exists()) {
      onUpdate({
        accountHolder: '',
        alias: '',
        cvu: '',
        whatsappNumber: (SUPPORT_CONFIG.whatsappNumber || '').trim(),
      });
      return;
    }

    const data = snap.data() || {};
    const accountHolder = (data.accountHolder || '').toString().trim();
    const alias = (data.alias || '').toString().trim();
    const cvu = (data.cvu || data.cbu || '').toString().trim();
    const rawWa = (data.whatsappNumber || '').toString().trim();
    const whatsappNumber = rawWa || (SUPPORT_CONFIG.whatsappNumber || '').trim();

    onUpdate({
      accountHolder,
      alias,
      cvu,
      whatsappNumber,
      updatedAt: data.updatedAt ? String(data.updatedAt) : undefined
    });
  }, (err) => {
    console.warn('[Billing] Error listening to settings/billing_config:', err);
    onUpdate({
      accountHolder: '',
      alias: '',
      cvu: '',
      whatsappNumber: (SUPPORT_CONFIG.whatsappNumber || '').trim(),
    });
  });

  return unsubscribe;
}

// ---------------------------------------------------------------------------
// 2. Cálculo de Períodos Semanales y Liquidaciones Devengadas
// ---------------------------------------------------------------------------

interface RawPeriod {
  startDateStr: string;
  endDateStr: string;
  dueDateStr: string;
  endTimestampMs: number;
}

/**
 * Calcula todos los períodos semanales cerrados (cuyo domingo 23:59:59 en Argentina ya pasó)
 * desde activatedAt hasta la fecha actual.
 */
export function computeClosedWeeklyPeriods(activatedAt: any, now: Date = new Date()): RawPeriod[] {
  if (!activatedAt) return [];

  let actDate: Date;
  if (typeof activatedAt === 'string') {
    actDate = new Date(activatedAt);
  } else if (activatedAt?.toDate && typeof activatedAt.toDate === 'function') {
    actDate = activatedAt.toDate();
  } else if (activatedAt?.seconds) {
    actDate = new Date(activatedAt.seconds * 1000);
  } else if (activatedAt instanceof Date) {
    actDate = activatedAt;
  } else {
    actDate = new Date(activatedAt);
  }

  if (isNaN(actDate.getTime())) return [];

  const actComp = getArgentinaNowComponents(actDate);
  const nowMs = now.getTime();
  const periods: RawPeriod[] = [];

  // Encontrar el domingo de la semana en la que cayó activatedAt
  const dow = getDayOfWeek(actComp.year, actComp.month, actComp.day);
  const daysToSunday = (7 - dow) % 7;
  let curSunday = addDays(actComp.year, actComp.month, actComp.day, daysToSunday);

  // Evitamos loop infinito con salvaguarda máxima de 520 semanas (10 años)
  let loopCount = 0;
  while (loopCount < 520) {
    loopCount++;
    const endMs = argEndOfDayMs(curSunday.year, curSunday.month, curSunday.day);
    if (endMs >= nowMs) {
      // El domingo de este período aún no cerró; la semana está en curso
      break;
    }

    // La semana corre canónicamente de lunes a domingo
    const curMonday = addDays(curSunday.year, curSunday.month, curSunday.day, -6);
    const dueMonday = addDays(curSunday.year, curSunday.month, curSunday.day, 1);
    periods.push({
      startDateStr: dateToStr(curMonday.year, curMonday.month, curMonday.day),
      endDateStr: dateToStr(curSunday.year, curSunday.month, curSunday.day),
      dueDateStr: dateToStr(dueMonday.year, dueMonday.month, dueMonday.day),
      endTimestampMs: endMs
    });

    // Siguiente período corre de lunes a domingo (próximo domingo)
    curSunday = addDays(dueMonday.year, dueMonday.month, dueMonday.day, 6);
  }

  return periods;
}

/**
 * Evalúa si un período semanal ya cerró en Argentina (el domingo a las 23:59:59.999 ya transcurrió).
 * Si la semana está en curso o en el futuro, devuelve false (la semana actual nunca se suma a la deuda vencida).
 */
export function isPeriodClosed(endDateStr: string, now: Date = new Date()): boolean {
  if (!endDateStr) return false;
  const parts = endDateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return false;
  const endMs = argEndOfDayMs(parts[0], parts[1], parts[2]);
  return endMs < now.getTime();
}

/**
 * Suma los saldos pendientes de todas las obligaciones semanales impagas del complejo.
 */
export function calculateTotalWeeklyDebt(obligations: WeeklyPaymentObligation[]): number {
  if (!Array.isArray(obligations)) return 0;
  return obligations.reduce((sum, o) => {
    const bal = Number(o?.remainingBalance || 0);
    return sum + (bal > 0 ? bal : 0);
  }, 0);
}

/**
 * Suma los saldos pendientes de las obligaciones vencidas (con daysAfterDue >= 3).
 */
export function calculateOverdueWeeklyDebt(obligations: WeeklyPaymentObligation[]): number {
  if (!Array.isArray(obligations)) return 0;
  return obligations.reduce((sum, o) => {
    if (o && Number(o.daysAfterDue) >= 3) {
      const bal = Number(o.remainingBalance || 0);
      return sum + (bal > 0 ? bal : 0);
    }
    return sum;
  }, 0);
}

export interface NormalizedErpPeriod {
  startDateStr: string;
  endDateStr: string;
  dueDateStr?: string;
  originalAmountDue?: number;
  amountPaid: number;
  remainingBalance?: number;
  status?: string;
}

/**
 * Convierte cualquier representación de fecha (string YYYY-MM-DD, ISO, Timestamp Firestore, Date) a 'YYYY-MM-DD'.
 */
export function toYmdString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.substring(0, 10);
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const comp = getArgentinaNowComponents(d);
      return dateToStr(comp.year, comp.month, comp.day);
    }
    return null;
  }
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    const comp = getArgentinaNowComponents(d);
    return dateToStr(comp.year, comp.month, comp.day);
  }
  if (typeof val?.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    const comp = getArgentinaNowComponents(d);
    return dateToStr(comp.year, comp.month, comp.day);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const comp = getArgentinaNowComponents(val);
    return dateToStr(comp.year, comp.month, comp.day);
  }
  return null;
}

/**
 * Determina de forma unívoca si un registro de período del ERP fue marcado como pagado.
 * Reconoce formatos actuales y heredados (status === 'paid'/'pagado', isPaid === true, paid === true,
 * remainingBalance === 0, saldoPendiente === 0, etc.).
 */
export function isErpItemPaid(item: any): boolean {
  if (!item) return false;
  if (item.isPaid === true || item.paid === true || item.pagado === true || item.saldado === true) {
    return true;
  }
  const rawStatus = String(item.status || item.estado || item.paymentStatus || item.payment_status || '').toLowerCase().trim();
  if (['paid', 'pagado', 'saldado', 'saldada', 'completed', 'completo', 'finalizado'].includes(rawStatus)) {
    return true;
  }
  const rem = item.remainingBalance ?? item.saldoPendiente ?? item.saldo ?? item.balance ?? item.pendingBalance;
  if (rem !== undefined && rem !== null && rem !== '' && Number(rem) === 0) {
    return true;
  }
  const paid = item.amountPaid ?? item.totalPaid ?? item.montoPagado ?? item.paidAmount;
  const due = item.originalAmountDue ?? item.amountDue ?? item.monto ?? item.total ?? item.amount;
  if (paid !== undefined && due !== undefined && Number(due) > 0 && Number(paid) >= Number(due)) {
    return true;
  }
  return false;
}

/**
 * Extrae y parsea fechas de inicio y fin (YYYY-MM-DD) de cualquier formato de registro ERP.
 * Si alguna fecha falta, deduce la contraparte asegurando semanas canónicas (lunes a domingo).
 */
export function parsePeriodDates(item: any, key?: string): { startDateStr: string; endDateStr: string } | null {
  if (!item && !key) return null;

  let start = toYmdString(
    item?.startDateStr || item?.startDate || item?.start || item?.from || item?.fechaInicio || item?.periodStart
  );
  let end = toYmdString(
    item?.endDateStr || item?.endDate || item?.end || item?.to || item?.fechaFin || item?.periodEnd
  );

  if (!start || !end) {
    const idOrKey = String(item?.id || item?.periodId || item?.period || key || '');
    const match = idOrKey.match(/(\d{4}-\d{2}-\d{2})[_\-/ ]+(\d{4}-\d{2}-\d{2})/);
    if (match) {
      start = start || match[1];
      end = end || match[2];
    }
  }

  // Si tenemos fecha fin (domingo) pero no fecha inicio, deducir lunes canónico 6 días antes
  if (!start && end) {
    const [ey, em, ed] = end.split('-').map(Number);
    if (!isNaN(ey) && !isNaN(em) && !isNaN(ed)) {
      const mon = addDays(ey, em, ed, -6);
      start = dateToStr(mon.year, mon.month, mon.day);
    }
  }

  // Si tenemos fecha inicio (lunes) pero no fecha fin, deducir domingo canónico 6 días después
  if (start && !end) {
    const [sy, sm, sd] = start.split('-').map(Number);
    if (!isNaN(sy) && !isNaN(sm) && !isNaN(sd)) {
      const sun = addDays(sy, sm, sd, 6);
      end = dateToStr(sun.year, sun.month, sun.day);
    }
  }

  if (start && end) {
    return { startDateStr: start.trim(), endDateStr: end.trim() };
  }
  return null;
}

/**
 * Normaliza y deduplica las obligaciones registradas en el ERP (en paymentObligations o paymentPeriods)
 * evitando duplicar períodos si aparecen representados en ambas estructuras y garantizando que
 * el estado pagado y el saldo cero prevalezcan de forma infalible ante cualquier divergencia.
 */
export function extractNormalizedErpObligations(complexDoc: any): Map<string, NormalizedErpPeriod> {
  const map = new Map<string, NormalizedErpPeriod>();
  const mapByEnd = new Map<string, NormalizedErpPeriod>();
  if (!complexDoc) return map;

  const sources: Array<{ src: any; name: 'paymentObligations' | 'paymentPeriods' }> = [
    { src: complexDoc.paymentObligations, name: 'paymentObligations' },
    { src: complexDoc.paymentPeriods, name: 'paymentPeriods' }
  ];

  for (const { src } of sources) {
    if (!src) continue;

    const entries: any[] = [];
    if (Array.isArray(src)) {
      for (const item of src) {
        if (item && typeof item === 'object') entries.push({ item, key: item.id || item.periodId });
      }
    } else if (typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object') entries.push({ item: v, key: k });
      }
    }

    for (const { item, key } of entries) {
      const dates = parsePeriodDates(item, key);
      if (!dates) continue;
      const periodKey = `${dates.startDateStr}_${dates.endDateStr}`;

      const rawDue = item.originalAmountDue ?? item.amountDue ?? item.monto ?? item.total ?? item.amount ?? item.totalAmount ?? item.montoTotal;
      const origDue = rawDue !== undefined && rawDue !== null && rawDue !== '' ? Number(rawDue) : undefined;

      const rawPaid = item.amountPaid ?? item.totalPaid ?? item.montoPagado ?? item.paidAmount ?? item.pagadoMonto;
      let paid = Math.max(0, Number(rawPaid || 0));

      const rawRem = item.remainingBalance ?? item.saldoPendiente ?? item.saldo ?? item.balance ?? item.pendingBalance;
      let rem = rawRem !== undefined && rawRem !== null && rawRem !== '' ? Math.max(0, Number(rawRem)) : undefined;

      const itemPaid = isErpItemPaid(item);

      if (itemPaid) {
        rem = 0;
        if (origDue !== undefined && origDue > 0 && paid < origDue) {
          paid = origDue;
        }
      } else if (rem === undefined && origDue !== undefined) {
        rem = Math.max(0, origDue - paid);
      }

      const itemStatus: 'paid' | 'pending' | 'partial' = itemPaid || rem === 0
        ? 'paid'
        : (paid > 0 ? 'partial' : (item.status ? String(item.status).toLowerCase().trim() as any : 'pending'));

      const existing = map.get(periodKey) || mapByEnd.get(dates.endDateStr);
      if (!existing) {
        const normalized: NormalizedErpPeriod = {
          startDateStr: dates.startDateStr,
          endDateStr: dates.endDateStr,
          dueDateStr: toYmdString(item.dueDateStr || item.dueDate || item.fechaVencimiento) || undefined,
          originalAmountDue: origDue,
          amountPaid: paid,
          remainingBalance: rem,
          status: itemStatus
        };
        map.set(periodKey, normalized);
        mapByEnd.set(dates.endDateStr, normalized);
      } else {
        // Conciliación segura entre paymentObligations y paymentPeriods:
        // Si CUALQUIERA de las fuentes declara el período pagado o con saldo cero, el estado pagado es soberano
        if (itemPaid || rem === 0 || existing.remainingBalance === 0 || existing.status === 'paid') {
          existing.remainingBalance = 0;
          existing.status = 'paid';
          existing.originalAmountDue = origDue ?? existing.originalAmountDue;
          const targetTotal = Math.max(existing.originalAmountDue || 0, origDue || 0, existing.amountPaid, paid);
          existing.amountPaid = targetTotal;
        } else {
          // Si ninguna lo declara 100% pagado, conciliar pagos mayores y menor saldo remanente
          existing.originalAmountDue = origDue ?? existing.originalAmountDue;
          existing.amountPaid = Math.max(existing.amountPaid, paid);

          if (rem !== undefined && existing.remainingBalance !== undefined) {
            existing.remainingBalance = Math.min(existing.remainingBalance, rem);
          } else if (rem !== undefined) {
            existing.remainingBalance = rem;
          }

          if (existing.originalAmountDue !== undefined && existing.amountPaid > 0) {
            existing.remainingBalance = Math.min(
              existing.remainingBalance ?? Infinity,
              Math.max(0, existing.originalAmountDue - existing.amountPaid)
            );
          }

          if (existing.remainingBalance === 0) {
            existing.status = 'paid';
          } else if (existing.amountPaid > 0) {
            existing.status = 'partial';
          } else {
            existing.status = 'pending';
          }
        }
      }
    }
  }

  return map;
}

/**
 * Normaliza las obligaciones registradas en el ERP (para retrocompatibilidad).
 */
export function extractErpObligations(complexDoc: any): Record<string, any> {
  const normMap = extractNormalizedErpObligations(complexDoc);
  const out: Record<string, any> = {};
  for (const [k, v] of normMap.entries()) {
    out[k] = v;
  }
  return out;
}

/**
 * Evalúa si una reserva está jugada y transcurrida en Argentina.
 */
export function isBookingPlayed(booking: Match, nowArg: { dateStr: string; timeStr: string }): boolean {
  if (!booking) return false;
  const status = String(booking.status || '').toLowerCase().trim();
  if (status === 'cancelado' || status === 'cancelled') return false;

  if (['jugado', 'completed', 'finalizado'].includes(status)) {
    return true;
  }

  // Si no está marcada como cancelada y su horario de fin ya pasó:
  const bookingDate = String(booking.date || '').trim();
  const bookingEndTime = String(booking.endTime || booking.end_time || '23:59').trim();

  if (!bookingDate) return false;

  if (bookingDate < nowArg.dateStr) {
    return true;
  }

  if (bookingDate === nowArg.dateStr && bookingEndTime <= nowArg.timeStr) {
    return true;
  }

  return false;
}

/**
 * Calcula todas las obligaciones semanales del complejo activo cruzando con /bookings
 * y aplicando la prioridad del ERP sin duplicaciones ni inclusión de la semana actual.
 */
export function calculateWeeklyObligations(
  complexId: string,
  complexDoc: any,
  bookings: Match[],
  now: Date = new Date()
): WeeklyPaymentObligation[] {
  if (!complexId || !complexDoc) return [];

  const rawStatus = (complexDoc.clientStatus || '').toString().toLowerCase().trim();
  if (rawStatus !== 'active') {
    // Solo complejos 'active' generan obligaciones (en trial no se generan)
    return [];
  }

  const activatedAt = complexDoc.activatedAt || complexDoc.activationDate || complexDoc.createdAt;
  if (!activatedAt && !complexDoc.paymentObligations && !complexDoc.paymentPeriods) return [];

  const nowArg = getArgentinaNowComponents(now);
  const erpMap = extractNormalizedErpObligations(complexDoc);
  const complexName = complexDoc.name || complexDoc.company || 'Mi Complejo';

  // Períodos semanales cerrados calculados desde activatedAt
  const closedPeriods = activatedAt ? computeClosedWeeklyPeriods(activatedAt, now) : [];

  // Mapear períodos únicos por su clave canónica: ${startDateStr}_${endDateStr}
  const uniquePeriods = new Map<string, RawPeriod>();
  const endDateToKey = new Map<string, string>();

  for (const p of closedPeriods) {
    const key = `${p.startDateStr}_${p.endDateStr}`;
    uniquePeriods.set(key, p);
    endDateToKey.set(p.endDateStr, key);
  }

  // Incorporar períodos adicionales que estén registrados en el ERP,
  // SIEMPRE que sean períodos cerrados (la semana actual o futura NUNCA se suma a la deuda)
  for (const [periodKey, erpItem] of erpMap.entries()) {
    const existingKey = uniquePeriods.has(periodKey) ? periodKey : endDateToKey.get(erpItem.endDateStr);
    if (!existingKey) {
      if (isPeriodClosed(erpItem.endDateStr, now)) {
        const [ey, em, ed] = erpItem.endDateStr.split('-').map(Number);
        const dueMonday = addDays(ey, em, ed, 1);
        const dueDateStr = erpItem.dueDateStr || dateToStr(dueMonday.year, dueMonday.month, dueMonday.day);
        const endMs = argEndOfDayMs(ey, em, ed);

        const newPeriod = {
          startDateStr: erpItem.startDateStr,
          endDateStr: erpItem.endDateStr,
          dueDateStr,
          endTimestampMs: endMs
        };
        uniquePeriods.set(periodKey, newPeriod);
        endDateToKey.set(erpItem.endDateStr, periodKey);
      }
    } else if (existingKey !== periodKey) {
      // Si el período existía con clave diferente (ej: start date de activatedAt vs lunes de ERP), adoptar la canónica de ERP
      const old = uniquePeriods.get(existingKey)!;
      uniquePeriods.delete(existingKey);
      uniquePeriods.set(periodKey, {
        startDateStr: erpItem.startDateStr,
        endDateStr: erpItem.endDateStr,
        dueDateStr: erpItem.dueDateStr || old.dueDateStr,
        endTimestampMs: old.endTimestampMs
      });
      endDateToKey.set(erpItem.endDateStr, periodKey);
    }
  }

  if (uniquePeriods.size === 0) return [];

  const results: WeeklyPaymentObligation[] = [];

  for (const period of uniquePeriods.values()) {
    // Salvaguarda obligatoria: la semana actual en curso NUNCA se suma
    if (!isPeriodClosed(period.endDateStr, now)) {
      continue;
    }

    const periodKey = `${period.startDateStr}_${period.endDateStr}`;
    const periodId = `obl_${complexId}_${periodKey}`;

    // Reservas jugadas que pertenecen al complejo y caen en [startDateStr, endDateStr]
    const playedInPeriod: Match[] = [];
    let periodGmv = 0;

    for (const b of bookings) {
      const bComplex = b.complexId || b.complejoId;
      if (bComplex && bComplex !== complexId) continue;

      const bDate = String(b.date || '').trim();
      if (!bDate || bDate < period.startDateStr || bDate > period.endDateStr) continue;

      if (isBookingPlayed(b, nowArg)) {
        playedInPeriod.push(b);
        const price = Number(b.price || b.price_total || 0);
        if (price > 0) {
          periodGmv += price;
        }
      }
    }

    const calculatedCommission = Math.round(periodGmv * 0.10);
    const erpMatch = erpMap.get(periodKey) || Array.from(erpMap.values()).find(e => e.endDateStr === period.endDateStr);

    let originalAmountDue = calculatedCommission;
    let amountPaid = 0;

    if (erpMatch) {
      if (erpMatch.originalAmountDue !== undefined && erpMatch.originalAmountDue >= 0) {
        originalAmountDue = erpMatch.originalAmountDue;
      }
      amountPaid = erpMatch.amountPaid >= 0 ? erpMatch.amountPaid : 0;
    }

    // Regla: Si el ERP marca la obligación como pagada o saldo pendiente 0, el saldo pendiente ES CERO.
    let remainingBalance: number;
    if (erpMatch && (erpMatch.status === 'paid' || erpMatch.remainingBalance === 0)) {
      remainingBalance = 0;
      if (originalAmountDue > 0 && amountPaid < originalAmountDue) {
        amountPaid = originalAmountDue;
      }
    } else if (erpMatch && erpMatch.remainingBalance !== undefined) {
      remainingBalance = Math.max(0, erpMatch.remainingBalance);
    } else {
      remainingBalance = Math.max(0, originalAmountDue - amountPaid);
    }

    // Si se pagó un monto, el saldo pendiente no puede superar (originalAmountDue - amountPaid)
    if (amountPaid > 0 && remainingBalance > Math.max(0, originalAmountDue - amountPaid)) {
      remainingBalance = Math.max(0, originalAmountDue - amountPaid);
    }

    // Determinación estricta del estado:
    // Solo cuando remainingBalance === 0 (o originalAmountDue <= 0 o erpMatch.status === 'paid') se marca como 'paid'
    let status: 'paid' | 'pending' | 'partial';
    if (remainingBalance === 0 || originalAmountDue <= 0 || (erpMatch && erpMatch.status === 'paid')) {
      remainingBalance = 0;
      status = 'paid';
    } else if (amountPaid > 0) {
      status = 'partial';
    } else {
      status = 'pending';
    }

    const daysAfterDue = diffInDays(nowArg.dateStr, period.dueDateStr);

    results.push({
      id: periodId,
      complexId,
      complexName,
      startDateStr: period.startDateStr,
      endDateStr: period.endDateStr,
      dueDateStr: period.dueDateStr,
      gmv: periodGmv,
      originalAmountDue,
      amountPaid,
      remainingBalance,
      status,
      daysAfterDue,
      playedBookings: playedInPeriod
    });
  }

  // Ordenar de más reciente a más antigua
  return results.sort((a, b) => b.startDateStr.localeCompare(a.startDateStr));
}

// ---------------------------------------------------------------------------
// 3. Reglas de Frecuencia Anti-Spam y Determinación de Aviso / Bloqueo
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  dismissedNoticeDaily: (complexId: string, type: string, todayStr: string) =>
    `jogo_notice_daily_${complexId}_${type}_${todayStr}`,
  dismissedNoticeSession: (complexId: string, obligationId: string, todayStr: string) =>
    `jogo_notice_session_${complexId}_${obligationId}_${todayStr}`,
};

export function markDailyNoticeDismissed(complexId: string, type: string, todayStr: string = getArgentinaTodayStr()) {
  try {
    localStorage.setItem(STORAGE_KEYS.dismissedNoticeDaily(complexId, type, todayStr), 'dismissed');
  } catch (e) {}
}

export function isDailyNoticeDismissed(complexId: string, type: string, todayStr: string = getArgentinaTodayStr()): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.dismissedNoticeDaily(complexId, type, todayStr)) === 'dismissed';
  } catch (e) {
    return false;
  }
}

export function markSessionNoticeDismissed(complexId: string, obligationId: string, todayStr: string = getArgentinaTodayStr()) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.dismissedNoticeSession(complexId, obligationId, todayStr), 'dismissed');
  } catch (e) {}
}

export function isSessionNoticeDismissed(complexId: string, obligationId: string, todayStr: string = getArgentinaTodayStr()): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.dismissedNoticeSession(complexId, obligationId, todayStr)) === 'dismissed';
  } catch (e) {
    return false;
  }
}

/**
 * Determina el estado actual de avisos (Prueba, Lunes, Martes, Miércoles) y de Bloqueo (Jueves+).
 */
export function evaluateBillingNoticeState(
  complexId: string,
  complexDoc: any,
  obligations: WeeklyPaymentObligation[],
  now: Date = new Date()
): BillingNoticeState {
  const unpaidObligations = obligations.filter(o => o.remainingBalance > 0);
  const overdueObligations = unpaidObligations.filter(o => o.daysAfterDue >= 3);
  const totalDebt = calculateTotalWeeklyDebt(unpaidObligations);
  const totalOverdueDebt = calculateTotalWeeklyDebt(overdueObligations);

  const result: BillingNoticeState = {
    type: null,
    obligation: null,
    trialDaysRemaining: null,
    isBlockedByDebt: false,
    blockingObligation: null,
    totalDebt,
    totalOverdueDebt,
    unpaidObligations,
    overdueObligations
  };

  if (!complexId || !complexDoc) return result;

  const rawStatus = (complexDoc.clientStatus || '').toString().toLowerCase().trim();
  const todayStr = getArgentinaNowComponents(now).dateStr;

  // 1. Caso Complejo Activo con obligaciones
  if (rawStatus === 'active') {
    // Reglas 4, 5 y 6:
    // E. Jueves en adelante (daysAfterDue >= 3) con saldo pendiente > 0 => BLOQUEO PERMANENTE.
    // Mientras quede al menos una obligación vencida impaga, el acceso debe continuar bloqueado.
    // Se restaura el acceso únicamente cuando todas las obligaciones vencidas estén saldadas.
    if (overdueObligations.length > 0) {
      result.isBlockedByDebt = true;
      // Para compatibilidad y detalle, ordenamos las vencidas de más antigua a más reciente
      const sortedOverdue = [...overdueObligations].sort((a, b) => a.startDateStr.localeCompare(b.startDateStr));
      result.blockingObligation = sortedOverdue[0];
      return result;
    }

    // Si no está bloqueado por deuda vencida, evaluar avisos descartables (Lunes, Martes, Miércoles)
    if (unpaidObligations.length > 0) {
      const pendingWithDue = [...unpaidObligations].sort((a, b) => b.daysAfterDue - a.daysAfterDue);
      const target = pendingWithDue[0];

      if (target) {
        if (target.daysAfterDue === 0) {
          // B. Lunes: daysAfterDue === 0
          if (!isDailyNoticeDismissed(complexId, 'monday', todayStr)) {
            result.type = 'monday';
            result.obligation = target;
            return result;
          }
        } else if (target.daysAfterDue === 1) {
          // C. Martes: daysAfterDue === 1 (por sesión de navegación)
          if (!isSessionNoticeDismissed(complexId, target.id, todayStr)) {
            result.type = 'tuesday';
            result.obligation = target;
            return result;
          }
        } else if (target.daysAfterDue === 2) {
          // D. Miércoles: daysAfterDue === 2 (por sesión de navegación)
          if (!isSessionNoticeDismissed(complexId, target.id, todayStr)) {
            result.type = 'wednesday';
            result.obligation = target;
            return result;
          }
        }
      }
    }

    return result;
  }

  // 2. Caso Prueba Gratuita (trial)
  if (rawStatus === 'trial') {
    const rawExp = complexDoc.trialEndsAt || complexDoc.trialEndDate;
    if (rawExp) {
      let expMs = 0;
      if (typeof rawExp === 'string') {
        expMs = new Date(rawExp).getTime();
      } else if (rawExp?.toDate && typeof rawExp.toDate === 'function') {
        expMs = rawExp.toDate().getTime();
      } else if (rawExp?.seconds) {
        expMs = rawExp.seconds * 1000;
      }

      if (expMs > 0) {
        const expComp = getArgentinaNowComponents(new Date(expMs));
        const daysLeft = diffInDays(expComp.dateStr, todayStr);

        // Últimos 3 días: quedan 3, 2 o 1 día
        if (daysLeft >= 1 && daysLeft <= 3) {
          if (!isDailyNoticeDismissed(complexId, 'trial', todayStr)) {
            result.type = 'trial';
            result.trialDaysRemaining = daysLeft;
            return result;
          }
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. Sincronización Automática de Reservas Transcurridas a 'jugado' en /bookings
// ---------------------------------------------------------------------------

const syncedBookingIds = new Set<string>();

/**
 * Detecta reservas del complejo activo en /bookings con status === 'confirmado'
 * cuyo horario de fin (date + endTime) ya pasó en Argentina y las actualiza a 'jugado'.
 */
export async function syncPlayedBookings(complexId: string, bookings: Match[]): Promise<number> {
  if (!complexId || !Array.isArray(bookings) || bookings.length === 0) return 0;

  const nowArg = getArgentinaNowComponents();
  const toUpdate: string[] = [];

  for (const b of bookings) {
    const bComplex = b.complexId || b.complejoId;
    if (bComplex && bComplex !== complexId) continue;

    const bId = String(b.id || '');
    if (!bId || syncedBookingIds.has(bId)) continue;

    const rawStatus = String(b.status || '').toLowerCase().trim();
    if (rawStatus !== 'confirmado' && rawStatus !== 'confirmed' && rawStatus !== 'activa') continue;

    const bDate = String(b.date || '').trim();
    const bEnd = String(b.endTime || b.end_time || '23:59').trim();
    if (!bDate) continue;

    const hasEnded = (bDate < nowArg.dateStr) || (bDate === nowArg.dateStr && bEnd <= nowArg.timeStr);
    if (hasEnded) {
      toUpdate.push(bId);
    }
  }

  if (toUpdate.length === 0) return 0;

  // Actualizar por lotes de hasta 400
  const chunk = toUpdate.slice(0, 400);
  const batch = writeBatch(db);

  for (const bId of chunk) {
    syncedBookingIds.add(bId);
    const bRef = doc(db, 'bookings', bId);
    batch.update(bRef, {
      status: 'jugado',
      updatedAt: serverTimestamp()
    });
  }

  try {
    await batch.commit();
    console.log(`[WeeklyBilling] Sincronizadas ${chunk.length} reservas a estado 'jugado'.`);
    return chunk.length;
  } catch (err) {
    console.warn('[WeeklyBilling] Error sincronizando reservas a jugado:', err);
    // Eliminar del set si falló para permitir reintento
    for (const bId of chunk) {
      syncedBookingIds.delete(bId);
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 5. Generación de Mensajes y URLs de WhatsApp
// ---------------------------------------------------------------------------

function cleanPhoneNumber(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

/**
 * Genera el enlace de WhatsApp con el mensaje oficial de pago semanal transferido.
 */
export function getPaymentWhatsAppUrl(
  config: BillingConfig,
  obligation: WeeklyPaymentObligation | null,
  complexName: string,
  allObligations?: WeeklyPaymentObligation[],
  totalAmountOverride?: number
): string {
  const phone = cleanPhoneNumber(config.whatsappNumber);
  const name = complexName || obligation?.complexName || 'Mi Complejo';

  const items = allObligations && allObligations.length > 0
    ? allObligations.filter(o => o && o.remainingBalance > 0)
    : (obligation ? [obligation] : []);

  const total = totalAmountOverride !== undefined && totalAmountOverride > 0
    ? totalAmountOverride
    : items.reduce((sum, o) => sum + (o.remainingBalance || 0), 0);

  const amount = formatCurrencyARS(total);

  let message: string;
  if (items.length > 1) {
    const detailLines = items.map(o => 
      `- ${formatDDMMYYYY(o.startDateStr)} al ${formatDDMMYYYY(o.endDateStr)}: ${formatCurrencyARS(o.remainingBalance)}`
    ).join('\n');

    message = [
      'Hola, ya realicé el pago de Jogo.',
      '',
      `Complejo: ${name}`,
      `Total transferido: ${amount} (${items.length} semanas acumuladas)`,
      'Detalle por semana:',
      detailLines,
      '',
      '¿Podrían verificarlo y registrar el pago? Gracias.'
    ].join('\n');
  } else if (items.length === 1) {
    const single = items[0];
    const start = formatDDMMYYYY(single.startDateStr);
    const end = formatDDMMYYYY(single.endDateStr);
    message = [
      'Hola, ya realicé el pago de Jogo.',
      '',
      `Complejo: ${name}`,
      `Período liquidado: ${start} al ${end}`,
      `Importe transferido: ${amount}`,
      '',
      '¿Podrían verificarlo y registrar el pago? Gracias.'
    ].join('\n');
  } else {
    message = [
      'Hola, ya realicé el pago de Jogo.',
      '',
      `Complejo: ${name}`,
      `Importe transferido: ${amount}`,
      '',
      '¿Podrían verificarlo y registrar el pago? Gracias.'
    ].join('\n');
  }

  if (!phone) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Genera el enlace de WhatsApp para solicitar la activación de cuenta desde la prueba gratuita.
 */
export function getTrialActivationWhatsAppUrl(
  config: BillingConfig,
  complexName: string
): string {
  const phone = cleanPhoneNumber(config.whatsappNumber);
  const name = complexName || 'Mi Complejo';

  const message = [
    'Hola equipo Jogo, finalizó la prueba gratuita y quiero activar la cuenta de mi complejo para seguir usando el sistema.',
    '',
    `Complejo: ${name}`,
    '',
    '¿Podrían indicarme los pasos a seguir? Gracias.'
  ].join('\n');

  if (!phone) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// 6. Generador de Reporte Semanal en PDF (jsPDF + jspdf-autotable)
// ---------------------------------------------------------------------------

export function downloadWeeklyBillingPdf(
  obligation: WeeklyPaymentObligation,
  complexNameOverride?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const complexName = complexNameOverride || obligation.complexName || 'Complejo Deportivo';
  const startStr = formatDDMMYYYY(obligation.startDateStr);
  const endStr = formatDDMMYYYY(obligation.endDateStr);
  const dueStr = formatDDMMYYYY(obligation.dueDateStr);

  // 1. Encabezado institucional Jogo SaaS
  doc.setFillColor(11, 167, 11); // #0BA70B Verde Jogo
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('JOGO SaaS', 15, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Liquidación Semanal de Servicios · 10% s/ Turnos Jugados', 15, 22);

  const todayArg = getArgentinaTodayStr();
  doc.setFontSize(9);
  doc.text(`Emitido: ${formatDDMMYYYY(todayArg)}`, 195, 22, { align: 'right' });

  // 2. Metadatos del Complejo y Período
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(complexName, 15, 38);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Período liquidado: ${startStr} al ${endStr}`, 15, 45);
  doc.text(`Fecha de vencimiento: Lunes ${dueStr}`, 15, 51);
  doc.text(`Identificador de obligación: ${obligation.id}`, 15, 57);

  // 3. Tarjeta Resumen Económico
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(15, 63, 180, 32, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('Reservas jugadas', 22, 72);
  doc.text('GMV Canchas (Total)', 62, 72);
  doc.text('Comisión Jogo (10%)', 108, 72);
  doc.text('Abonado', 148, 72);
  doc.text('Saldo Pendiente', 172, 72);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(String(obligation.playedBookings.length), 22, 84);
  doc.text(formatCurrencyARS(obligation.gmv), 62, 84);
  doc.text(formatCurrencyARS(obligation.originalAmountDue), 108, 84);
  doc.text(formatCurrencyARS(obligation.amountPaid), 148, 84);

  // Saldo pendiente destacado
  if (obligation.remainingBalance > 0) {
    doc.setTextColor(185, 28, 28); // red-700
  } else {
    doc.setTextColor(21, 128, 61); // emerald-700
  }
  doc.text(formatCurrencyARS(obligation.remainingBalance), 172, 84);

  // 4. Detalle de Reservas Jugadas
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Detalle de reservas jugadas incluidas en el período', 15, 105);

  const tableRows = obligation.playedBookings.map((b) => {
    const bDate = formatDDMMYYYY(String(b.date || ''));
    const bTime = `${b.startTime || b.start_time || ''} - ${b.endTime || b.end_time || ''}`;
    const bCourt = String(b.courtName || b.court_name || 'Cancha');
    const bClient = String(b.userName || b.clientName || b.host_name || 'Particular');
    const price = Number(b.price || b.price_total || 0);
    const comm = Math.round(price * 0.10);

    return [
      bDate,
      bTime,
      bCourt,
      bClient,
      formatCurrencyARS(price),
      formatCurrencyARS(comm)
    ];
  });

  autoTable(doc, {
    startY: 110,
    margin: { left: 15, right: 15 },
    head: [['Fecha', 'Horario', 'Cancha', 'Cliente', 'Precio Cancha', 'Comisión 10%']],
    body: tableRows.length > 0 ? tableRows : [['-', '-', '-', 'Sin reservas registradas', '$ 0', '$ 0']],
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 24 },
      2: { cellWidth: 32 },
      3: { cellWidth: 42 },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' }
    },
    foot: [[
      'Total',
      '',
      '',
      `${obligation.playedBookings.length} turnos`,
      formatCurrencyARS(obligation.gmv),
      formatCurrencyARS(obligation.originalAmountDue)
    ]],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: 'bold'
    }
  });

  // 5. Pie de página
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    'Documento de liquidación emitido automáticamente por Jogo SaaS. Por consultas de facturación o transferencias, contactate por WhatsApp.',
    15,
    pageHeight - 10
  );

  // Sanitizar nombre de archivo: Liquidacion_[Complejo]_[inicio]_al_[fin].pdf
  const safeName = complexName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Liquidacion_${safeName}_${obligation.startDateStr}_al_${obligation.endDateStr}.pdf`;
  doc.save(filename);
}
