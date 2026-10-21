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

  let curStart = { year: actComp.year, month: actComp.month, day: actComp.day };
  const dow = getDayOfWeek(curStart.year, curStart.month, curStart.day);
  const daysToSunday = (7 - dow) % 7;
  let curSunday = addDays(curStart.year, curStart.month, curStart.day, daysToSunday);

  // Evitamos loop infinito con salvaguarda máxima de 520 semanas (10 años)
  let loopCount = 0;
  while (loopCount < 520) {
    loopCount++;
    const endMs = argEndOfDayMs(curSunday.year, curSunday.month, curSunday.day);
    if (endMs >= nowMs) {
      // El domingo de este período aún no cerró; la semana está en curso
      break;
    }

    const dueMonday = addDays(curSunday.year, curSunday.month, curSunday.day, 1);
    periods.push({
      startDateStr: dateToStr(curStart.year, curStart.month, curStart.day),
      endDateStr: dateToStr(curSunday.year, curSunday.month, curSunday.day),
      dueDateStr: dateToStr(dueMonday.year, dueMonday.month, dueMonday.day),
      endTimestampMs: endMs
    });

    // Siguiente período corre de lunes a domingo
    curStart = dueMonday;
    curSunday = addDays(curStart.year, curStart.month, curStart.day, 6);
  }

  return periods;
}

/**
 * Normaliza las obligaciones registradas en el ERP (en paymentObligations o paymentPeriods)
 */
function extractErpObligations(complexDoc: any): Record<string, any> {
  const map: Record<string, any> = {};
  if (!complexDoc) return map;

  const rawSources = [complexDoc.paymentObligations, complexDoc.paymentPeriods];
  for (const src of rawSources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const item of src) {
        if (!item) continue;
        const key = item.id || item.periodId || (item.startDate && item.endDate ? `obl_${item.startDate}_${item.endDate}` : null);
        if (key) map[key] = item;
      }
    } else if (typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object') {
          map[k] = v;
        }
      }
    }
  }

  return map;
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
 * y aplicando la prioridad del ERP.
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
  if (!activatedAt) return [];

  const closedPeriods = computeClosedWeeklyPeriods(activatedAt, now);
  if (closedPeriods.length === 0) return [];

  const nowArg = getArgentinaNowComponents(now);
  const erpObligations = extractErpObligations(complexDoc);
  const complexName = complexDoc.name || complexDoc.company || 'Mi Complejo';

  const results: WeeklyPaymentObligation[] = [];

  for (const period of closedPeriods) {
    const periodId = `obl_${complexId}_${period.startDateStr}_${period.endDateStr}`;

    // Filtrar reservas que pertenecen al complejo y caen en [startDateStr, endDateStr]
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

    // Buscar si existe registro en el ERP
    let erpMatch = erpObligations[periodId];
    if (!erpMatch) {
      // Búsqueda por rango de fechas
      for (const item of Object.values(erpObligations)) {
        if (
          (item.startDate === period.startDateStr || item.startDateStr === period.startDateStr) &&
          (item.endDate === period.endDateStr || item.endDateStr === period.endDateStr)
        ) {
          erpMatch = item;
          break;
        }
      }
    }

    let originalAmountDue = calculatedCommission;
    let amountPaid = 0;
    let remainingBalance = calculatedCommission;
    let status: 'paid' | 'pending' | 'partial' = 'pending';

    if (erpMatch) {
      if (erpMatch.originalAmountDue !== undefined && Number(erpMatch.originalAmountDue) >= 0) {
        originalAmountDue = Number(erpMatch.originalAmountDue);
      } else if (erpMatch.amountDue !== undefined && Number(erpMatch.amountDue) >= 0) {
        originalAmountDue = Number(erpMatch.amountDue);
      }

      if (erpMatch.amountPaid !== undefined && Number(erpMatch.amountPaid) >= 0) {
        amountPaid = Number(erpMatch.amountPaid);
      } else if (erpMatch.totalPaid !== undefined && Number(erpMatch.totalPaid) >= 0) {
        amountPaid = Number(erpMatch.totalPaid);
      }

      const erpStatus = String(erpMatch.status || '').toLowerCase().trim();

      // Regla de oro: si status === 'paid' o remainingBalance === 0 (o originalAmountDue <= 0), saldo = 0
      if (erpStatus === 'paid' || erpMatch.remainingBalance === 0 || originalAmountDue <= 0) {
        remainingBalance = 0;
        status = 'paid';
      } else if (erpMatch.remainingBalance !== undefined && erpMatch.remainingBalance !== null) {
        remainingBalance = Math.max(0, Number(erpMatch.remainingBalance));
        status = remainingBalance === 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'pending');
      } else {
        remainingBalance = Math.max(0, originalAmountDue - amountPaid);
        status = remainingBalance === 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'pending');
      }
    } else {
      if (originalAmountDue <= 0) {
        remainingBalance = 0;
        status = 'paid';
      }
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
  const result: BillingNoticeState = {
    type: null,
    obligation: null,
    trialDaysRemaining: null,
    isBlockedByDebt: false,
    blockingObligation: null
  };

  if (!complexId || !complexDoc) return result;

  const rawStatus = (complexDoc.clientStatus || '').toString().toLowerCase().trim();
  const todayStr = getArgentinaNowComponents(now).dateStr;

  // 1. Caso Complejo Activo con obligaciones pendientes
  if (rawStatus === 'active') {
    const unpaidObligations = obligations.filter(o => o.remainingBalance > 0);

    // E. Jueves en adelante: daysAfterDue >= 3 con saldo > 0 => BLOQUEO PERMANENTE
    const blocking = unpaidObligations.find(o => o.daysAfterDue >= 3);
    if (blocking) {
      result.isBlockedByDebt = true;
      result.blockingObligation = blocking;
      return result; // Bloqueo suspende acceso, no es un modal descartable
    }

    // Si no está bloqueado, evaluar avisos descartables (Lunes, Martes, Miércoles)
    // Se toma la obligación impaga más urgente (mayor daysAfterDue)
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
  obligation: WeeklyPaymentObligation,
  complexName: string
): string {
  const phone = cleanPhoneNumber(config.whatsappNumber);
  const name = complexName || obligation.complexName || 'Mi Complejo';
  const start = formatDDMMYYYY(obligation.startDateStr);
  const end = formatDDMMYYYY(obligation.endDateStr);
  const amount = formatCurrencyARS(obligation.remainingBalance);

  const message = [
    'Hola, ya realicé el pago de Jogo.',
    '',
    `Complejo: ${name}`,
    `Período liquidado: ${start} al ${end}`,
    `Importe transferido: ${amount}`,
    '',
    '¿Podrían verificarlo y registrar el pago? Gracias.'
  ].join('\n');

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
