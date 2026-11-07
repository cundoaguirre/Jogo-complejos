/**
 * Generador Unificado de Reportes Ejecutivos en PDF (Semanales y Mensuales)
 * Formato: A4 Portrait (210mm x 297mm) con estética ejecutiva Canva oficial de Jogo.
 *
 * Motor contable oficial: computeComplexFinancialSummary de ./financialMath
 */

import jsPDF from 'jspdf';
import { collection, getDocs, query, where, doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  computeComplexFinancialSummary,
  UnifiedFinancialOperationInput,
  UnifiedFinancialMovementInput
} from './financialMath';

export interface UnifiedReportOptions {
  complexId: string;
  complexName?: string;
  periodType?: 'weekly' | 'monthly';
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  periodLabel?: string;
  bookings?: any[];
  operations?: any[];
  financialMovements?: any[];
  venueProfile?: any;
  courts?: any[];
}

export type WeeklyReportParams = UnifiedReportOptions;

interface LogoInfo {
  base64: string;
  width: number;
  height: number;
}

/**
 * Carga el logotipo de Jogo en formato base64 conservando sus dimensiones originales.
 */
async function loadLogoBase64(): Promise<LogoInfo | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const tryLoad = (src: string, fallbackSrc?: string) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || img.width || 200;
          const h = img.naturalHeight || img.height || 60;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve({
              base64: canvas.toDataURL('image/png'),
              width: w,
              height: h
            });
            return;
          }
        } catch {
          // fallback
        }
        resolve(null);
      };
      img.onerror = () => {
        if (fallbackSrc) {
          tryLoad(fallbackSrc);
        } else {
          resolve(null);
        }
      };
      img.src = src;
    };

    tryLoad('/assets/jogo-logo-white.png', '/logo-white.png');
  });
}

/**
 * Parsea cualquier formato de fecha (Date, Firestore Timestamp, ISO string, YYYY-MM-DD) a objeto Date válido.
 */
function parseToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string') {
    if (val.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, d] = val.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Extrae la fecha normalizada YYYY-MM-DD para agrupaciones y gráficos.
 */
function getDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.includes('T')) return val.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    return val.slice(0, 10);
  }
  if (typeof val.toDate === 'function') {
    return val.toDate().toISOString().split('T')[0];
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return '';
}

/**
 * Formatea el rango de fechas para el subencabezado.
 * Ej: "14 de sep al 21 de sep, 2026" o "1 de oct al 31 de oct, 2026"
 */
function formatPeriodSubheader(startDateStr: string, endDateStr: string): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  if (!sY || !eY) return `${startDateStr} al ${endDateStr}`;

  const sMonth = months[sM - 1] || '';
  const eMonth = months[eM - 1] || '';

  return `${sD} de ${sMonth} al ${eD} de ${eMonth}, ${eY}`;
}

/**
 * Formatea importes en pesos argentinos con signo $.
 * Ej: $417.500
 */
function formatARS(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return '$' + num.toLocaleString('es-AR');
}

/**
 * Formatea importes sin el signo $ (ej. para la tarjeta de Caja grande).
 * Ej: 79.000
 */
function formatNumberARS(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('es-AR');
}

/**
 * Convierte strings HH:MM a horas decimales y calcula la duración con cruce de medianoche.
 */
function parseHoursFromTimes(open: string, close: string): number {
  if (!open || !close) return 0;
  const [sH, sM] = open.split(':').map(Number);
  const [eH, eM] = close.split(':').map(Number);
  const startHours = (sH || 0) + ((sM || 0) / 60);
  let endHours = (eH || 0) + ((eM || 0) / 60);
  if (endHours <= startHours || endHours === 0) {
    endHours += 24;
  }
  return Math.max(0, endHours - startHours);
}

/**
 * Calcula la capacidad en horas del complejo deportivo para cualquier período de días.
 */
function calculatePeriodCapacityHours(
  venueProfile: any,
  startDateStr: string,
  endDateStr: string,
  courtsCount: number
): number {
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  const dtStart = new Date(Date.UTC(sY, sM - 1, sD));
  const dtEnd = new Date(Date.UTC(eY, eM - 1, eD));
  const diffDays = Math.max(1, Math.round((dtEnd.getTime() - dtStart.getTime()) / 86400000) + 1);

  const count = Math.max(1, courtsCount);
  const dayNamesEs = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const dayNamesWithAccents = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  let totalVenueHours = 0;

  if (venueProfile?.weeklySchedule && typeof venueProfile.weeklySchedule === 'object') {
    for (let i = 0; i < diffDays; i++) {
      const curDt = new Date(dtStart.getTime() + i * 86400000);
      const dayIdx = curDt.getUTCDay();
      const dayName = dayNamesEs[dayIdx];
      const dayNameAccent = dayNamesWithAccents[dayIdx];
      const dayData = venueProfile.weeklySchedule[dayName] || venueProfile.weeklySchedule[dayNameAccent];
      if (dayData && !dayData.isClosed && dayData.open && dayData.close) {
        totalVenueHours += parseHoursFromTimes(dayData.open, dayData.close);
      }
    }
  } else if (Array.isArray(venueProfile?.hours) && venueProfile.hours.length > 0) {
    for (const h of venueProfile.hours) {
      if (h.open !== false && (h.start || h.openTime) && (h.end || h.closeTime)) {
        const start = h.start || h.openTime;
        const end = h.end || h.closeTime;
        totalVenueHours += parseHoursFromTimes(start, end);
      }
    }
  }

  if (totalVenueHours <= 0) {
    const open = venueProfile?.openTime || venueProfile?.openingTime || '14:00';
    const close = venueProfile?.closeTime || venueProfile?.closingTime || '00:00';
    const daily = parseHoursFromTimes(open, close) || 10;
    totalVenueHours = daily * diffDays;
  }

  return Math.round(totalVenueHours * count);
}

/**
 * Calcula el precio promedio por hora de las canchas del complejo.
 */
function getAverageCourtPrice(courts: any[] = [], activeBookings: any[] = [], defaultPrice = 15000): number {
  if (Array.isArray(courts) && courts.length > 0) {
    const prices = courts
      .map(c => Number(c.price || c.pricePerHour || c.hourlyRate || c.rate || 0))
      .filter(p => p > 0);
    if (prices.length > 0) {
      return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    }
  }

  if (Array.isArray(activeBookings) && activeBookings.length > 0) {
    const bPrices = activeBookings
      .map(b => Number(b.price || b.price_total || b.totalCollected || b.amount_paid || 0))
      .filter(p => p > 0);
    if (bPrices.length > 0) {
      return Math.round(bPrices.reduce((a, b) => a + b, 0) / bPrices.length);
    }
  }

  return defaultPrice;
}

/**
 * Función oficial de cálculo de tendencia porcentual (idéntica a computeTrend de FinanceView).
 */
export function computeTrend(current: number, previous: number): { pct: string; isUp: boolean; rawPct: number } {
  if (previous === 0) {
    if (current > 0) return { pct: '+100%', isUp: true, rawPct: 100 };
    return { pct: '+0%', isUp: true, rawPct: 0 };
  }
  const pctNum = Math.round(((current - previous) / previous) * 100);
  if (pctNum >= 0) return { pct: `+${pctNum}%`, isUp: true, rawPct: pctNum };
  return { pct: `${pctNum}%`, isUp: false, rawPct: pctNum };
}

/**
 * Dibuja una pastilla (pill badge) comparativa de variación porcentual.
 * REGLA ESTRICTA WinAnsi: NUNCA usar flechas Unicode (↑, ↓, ▲, ▼) para evitar caracteres corruptos.
 * Si trendPct >= 0: Fondo #DCFCE7, texto "+X% Sem ant" (o Mes ant) en #15803D.
 * Si trendPct < 0: Fondo #FEE2E2, texto "-X% Sem ant" (o Mes ant) en #B91C1C.
 */
function drawPillBadge(
  doc: jsPDF,
  x: number,
  y: number,
  trendPct: string,
  labelSuffix: string,
  fontSize: number = 7
): number {
  const isPositive = !trendPct.startsWith('-');
  const text = `${trendPct} ${labelSuffix}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(text);
  const pillW = textWidth + 4.5;
  const pillH = 4.4;

  if (isPositive) {
    doc.setFillColor(220, 252, 231); // #DCFCE7
    doc.setTextColor(21, 128, 61); // #15803D
  } else {
    doc.setFillColor(254, 226, 226); // #FEE2E2
    doc.setTextColor(185, 28, 28); // #B91C1C
  }

  doc.roundedRect(x, y - (pillH - 1.2), pillW, pillH, 2, 2, 'F');
  doc.text(text, x + 2.2, y + 1.8);

  return pillW;
}

interface UnifiedOpItem extends UnifiedFinancialOperationInput {
  date: Date;
}

interface UnifiedMovItem extends UnifiedFinancialMovementInput {
  date: Date;
}

/**
 * Unifica las operaciones registradas y las reservas en operaciones comerciales estandarizadas,
 * replicando con total exactitud la lógica de combinedOperations de FinanceView en src/App.tsx.
 */
function buildUnifiedOperations(
  operations: any[],
  bookings: any[],
  targetId: string,
  targetIds: string[]
): UnifiedOpItem[] {
  const list: UnifiedOpItem[] = [];
  const processedOpIds = new Set<string>();

  const CANCELLED_STATUSES = new Set([
    'cancelled_unpaid',
    'cancelled_retained',
    'partial_refunded',
    'fully_refunded',
    'cancelled',
    'cancelado'
  ]);

  // 1. Operaciones directas de la colección /operations
  operations.forEach(op => {
    const c = op.complexId || op.complejoId;
    if (c && !targetIds.includes(String(c))) return;

    processedOpIds.add(op.id);

    const isBooking = op.operationType === 'court_booking' || op.operationType === 'booking' || Boolean(op.bookingId) || op.id.endsWith('-booking');
    const matchedB = isBooking && op.bookingId ? bookings.find(b => String(b.id) === String(op.bookingId)) : null;
    const bookingDateRaw = isBooking
      ? (matchedB?.date ||
         (matchedB?.startTime ? String(matchedB.startTime).split('T')[0] : null) ||
         (op.bookingDate ? String(op.bookingDate).split('T')[0] : null) ||
         (typeof op.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(op.date) ? op.date : null))
      : null;

    const d = bookingDateRaw
      ? (parseToDate(bookingDateRaw + 'T12:00:00') || parseToDate(bookingDateRaw) || new Date())
      : (parseToDate(op.createdAt || op.date) || new Date());

    const isExp = Boolean(op.isExpense || op.operationType === 'expense' || op.operationType === 'purchase' || op.metadata?.isExpense);
    const isCancelledOp = CANCELLED_STATUSES.has(String(op.paymentStatus)) ||
                          (op as any).status === 'cancelado' ||
                          (op as any).status === 'cancelled';

    let contractual = Number(op.contractualAmount ?? op.total ?? op.amount ?? op.price ?? 0);
    const collected = Number(op.totalCollected ?? op.amount_paid ?? op.collected ?? op.paid ?? 0);
    let pending = Number(op.amountPending ?? op.pending ?? op.debt ?? Math.max(0, contractual - collected));

    if (isCancelledOp) {
      contractual = collected;
      pending = 0;
    }

    list.push({
      id: op.id,
      complexId: targetId,
      complejoId: targetId,
      contractualAmount: contractual,
      totalCollected: collected,
      amountPending: pending,
      paymentStatus: String(op.paymentStatus || (isCancelledOp ? 'cancelled' : 'paid')),
      isExpense: isExp,
      operationType: op.operationType || (isExp ? 'expense' : 'pos_sale'),
      bookingId: op.bookingId || null,
      date: d
    });
  });

  // 2. Operaciones virtuales para reservas de /bookings que aún no tengan un documento en /operations
  const existingBookingIds = new Set(
    operations
      .filter(o => o.bookingId || o.id.endsWith('-booking'))
      .map(o => String(o.bookingId || o.id.replace('-booking', '')))
  );

  bookings.forEach(b => {
    if (!b) return;
    const c = b.complexId || b.complejoId;
    if (c && !targetIds.includes(String(c))) return;

    if (existingBookingIds.has(String(b.id))) return;

    const bStatus = String(b.status || '').toLowerCase();
    const bPayStatus = String(b.payment_status || b.paymentStatus || '').toLowerCase();
    const isCancelled = bStatus === 'cancelado' || bStatus === 'cancelled' || bPayStatus.includes('cancel');

    const d = parseToDate(b.date || b.startTime || b.start_time || b.createdAt) || new Date();
    const rawPrice = Number(b.price || b.price_total || 0);
    const isPaid = b.payment_status === 'paid' || b.paymentStatus === 'paid' || b.payment_status === 'pagado';
    const rawPaid = Number(b.amount_paid ?? b.deposit ?? 0);
    const paid = isPaid ? (rawPaid > 0 ? Math.max(rawPaid, rawPrice) : rawPrice) : rawPaid;

    const contractual = isCancelled ? paid : rawPrice;
    const pending = isCancelled ? 0 : Math.max(0, rawPrice - paid);
    const paymentStatus = isCancelled
      ? 'cancelled'
      : (paid >= rawPrice && rawPrice > 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid'));

    list.push({
      id: `${b.id}-booking`,
      complexId: targetId,
      complejoId: targetId,
      operationType: 'court_booking',
      bookingId: b.id,
      contractualAmount: contractual,
      totalCollected: paid,
      amountPending: pending,
      paymentStatus,
      isExpense: false,
      date: d
    });
  });

  return list;
}

/**
 * Mapea los movimientos financieros de Firestore a la estructura tipada para el motor contable.
 */
function buildUnifiedMovements(
  movements: any[],
  targetId: string,
  targetIds: string[]
): UnifiedMovItem[] {
  return movements
    .filter(m => {
      const c = m.complexId || m.complejoId;
      if (c && !targetIds.includes(String(c))) return false;
      return true;
    })
    .map(m => {
      const d = parseToDate(m.date || m.createdAt) || new Date();
      const rawFlow = String(m.flow || 'income').toLowerCase();
      const flow: 'income' | 'expense' = rawFlow === 'expense' ? 'expense' : 'income';
      return {
        id: m.id,
        complexId: targetId,
        complejoId: targetId,
        flow,
        category: String(m.category || ''),
        amount: Math.max(0, Number(m.amount) || 0),
        operationId: m.operationId || null,
        bookingId: m.bookingId || null,
        status: m.status || 'completed',
        date: d
      };
    });
}

/**
 * Función principal unificada de generación y descarga del reporte ejecutivo en PDF (Semanal o Mensual).
 * Consume directamente computeComplexFinancialSummary de financialMath.ts.
 */
export async function downloadUnifiedWeeklyReportPdf(params: UnifiedReportOptions): Promise<void> {
  const {
    complexId,
    complexName: rawComplexName,
    periodType = 'weekly',
    startDateStr,
    endDateStr,
    periodLabel,
    bookings: propBookings,
    operations: propOperations,
    financialMovements: propMovements,
    venueProfile: propVenue,
    courts: propCourts
  } = params;

  const isMonthly = periodType === 'monthly';
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const targetIds = (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];
  const complexName = (rawComplexName || 'Complejo Deportivo').trim();

  // ---------------------------------------------------------------------------
  // 1. Obtención y Resiliencia de Datos (Firestore)
  // ---------------------------------------------------------------------------
  let bookings = propBookings || [];
  let operations = propOperations || [];
  let movements = propMovements || [];
  let venueProfile = propVenue || null;
  let courts = propCourts || [];

  try {
    if (!venueProfile) {
      const snap = await getDoc(firestoreDoc(db, 'complejos', targetId));
      if (snap.exists()) {
        venueProfile = snap.data();
      }
    }
  } catch (e) {
    console.warn('[ReportPDF] Error fetching venueProfile:', e);
  }

  try {
    if (courts.length === 0) {
      if (Array.isArray(venueProfile?.courts) && venueProfile.courts.length > 0) {
        courts = venueProfile.courts;
      } else {
        const qC = query(collection(db, 'courts'), where('complejoId', '==', targetId));
        const snapC = await getDocs(qC);
        courts = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    }
  } catch (e) {
    console.warn('[ReportPDF] Error fetching courts:', e);
  }

  try {
    if (bookings.length === 0) {
      const allB: any[] = [];
      for (const tId of targetIds) {
        const qB1 = query(collection(db, 'bookings'), where('complejoId', '==', tId));
        const snapB1 = await getDocs(qB1);
        snapB1.docs.forEach(d => allB.push({ id: d.id, ...d.data() }));
        const qB2 = query(collection(db, 'bookings'), where('complexId', '==', tId));
        const snapB2 = await getDocs(qB2);
        snapB2.docs.forEach(d => allB.push({ id: d.id, ...d.data() }));
      }
      const bMap = new Map<string, any>();
      allB.forEach(b => bMap.set(b.id, b));
      bookings = Array.from(bMap.values());
    }
  } catch (e) {
    console.warn('[ReportPDF] Error fetching bookings:', e);
  }

  try {
    if (operations.length === 0) {
      const allO: any[] = [];
      for (const tId of targetIds) {
        const qO1 = query(collection(db, 'operations'), where('complexId', '==', tId));
        const snapO1 = await getDocs(qO1);
        snapO1.docs.forEach(d => allO.push({ id: d.id, ...d.data() }));
        const qO2 = query(collection(db, 'operations'), where('complejoId', '==', tId));
        const snapO2 = await getDocs(qO2);
        snapO2.docs.forEach(d => allO.push({ id: d.id, ...d.data() }));
      }
      const oMap = new Map<string, any>();
      allO.forEach(o => oMap.set(o.id, o));
      operations = Array.from(oMap.values());
    }
  } catch (e) {
    console.warn('[ReportPDF] Error fetching operations:', e);
  }

  try {
    if (movements.length === 0) {
      const allM: any[] = [];
      for (const tId of targetIds) {
        const qM1 = query(collection(db, 'financial_movements'), where('complexId', '==', tId));
        const snapM1 = await getDocs(qM1);
        snapM1.docs.forEach(d => allM.push({ id: d.id, ...d.data() }));
        const qM2 = query(collection(db, 'financial_movements'), where('complejoId', '==', tId));
        const snapM2 = await getDocs(qM2);
        snapM2.docs.forEach(d => allM.push({ id: d.id, ...d.data() }));
      }
      const mMap = new Map<string, any>();
      allM.forEach(m => mMap.set(m.id, m));
      movements = Array.from(mMap.values());
    }
  } catch (e) {
    console.warn('[ReportPDF] Error fetching financial_movements:', e);
  }

  // ---------------------------------------------------------------------------
  // 2. Unificación Integral de Operaciones y Movimientos (Identico a FinanceView)
  // ---------------------------------------------------------------------------
  const unifiedOperations = buildUnifiedOperations(operations, bookings, targetId, targetIds);
  const unifiedMovements = buildUnifiedMovements(movements, targetId, targetIds);

  // ---------------------------------------------------------------------------
  // 3. Delimitación Estricta de Períodos: Actual vs. Previo
  // ---------------------------------------------------------------------------
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);

  // Período Actual: startDateStr 00:00:00.000 a endDateStr 23:59:59.999
  const curStart = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
  const curEnd = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

  // Período Previo:
  // - Semanal: exactamente (startDate - 7 días 00:00:00) a (startDate - 1 día 23:59:59.999)
  // - Mensual: mes calendario anterior completo (ej. 2026-10-01 -> 2026-09-01 a 2026-09-30)
  let prevStart: Date;
  let prevEnd: Date;

  if (isMonthly) {
    const prevY = sM === 1 ? sY - 1 : sY;
    const prevM = sM === 1 ? 12 : sM - 1;
    const prevLastDay = new Date(prevY, prevM, 0).getDate();
    prevStart = new Date(prevY, prevM - 1, 1, 0, 0, 0, 0);
    prevEnd = new Date(prevY, prevM - 1, prevLastDay, 23, 59, 59, 999);
  } else {
    const prevStartRef = new Date(curStart.getTime() - 7 * 86400000);
    const prevEndRef = new Date(curStart.getTime() - 1 * 86400000);
    prevStart = new Date(prevStartRef.getFullYear(), prevStartRef.getMonth(), prevStartRef.getDate(), 0, 0, 0, 0);
    prevEnd = new Date(prevEndRef.getFullYear(), prevEndRef.getMonth(), prevEndRef.getDate(), 23, 59, 59, 999);
  }

  const curStartMs = curStart.getTime();
  const curEndMs = curEnd.getTime();
  const prevStartMs = prevStart.getTime();
  const prevEndMs = prevEnd.getTime();

  // Filtrado de operaciones y movimientos por ventana temporal exacta
  const currentOps = unifiedOperations.filter(op => {
    const t = op.date.getTime();
    return t >= curStartMs && t <= curEndMs;
  });
  const currentMovs = unifiedMovements.filter(m => {
    const t = m.date.getTime();
    return t >= curStartMs && t <= curEndMs;
  });

  const prevOps = unifiedOperations.filter(op => {
    const t = op.date.getTime();
    return t >= prevStartMs && t <= prevEndMs;
  });
  const prevMovs = unifiedMovements.filter(m => {
    const t = m.date.getTime();
    return t >= prevStartMs && t <= prevEndMs;
  });

  // ---------------------------------------------------------------------------
  // 4. Ejecución del Motor Contable Oficial (computeComplexFinancialSummary)
  // ---------------------------------------------------------------------------
  const currentSummary = computeComplexFinancialSummary({
    targetComplexIds: [targetId],
    operations: currentOps,
    movements: currentMovs
  });

  const previousSummary = computeComplexFinancialSummary({
    targetComplexIds: [targetId],
    operations: prevOps,
    movements: prevMovs
  });

  // Cálculo de tendencias porcentuales idéntico a FinanceView
  const incomeTrend = computeTrend(currentSummary.economicIncome, previousSummary.economicIncome);
  const cashTrend = computeTrend(currentSummary.cashAvailable, previousSummary.cashAvailable);

  const pendingPct = currentSummary.economicIncome > 0
    ? Math.round((currentSummary.pendingToCollect / currentSummary.economicIncome) * 100)
    : (currentSummary.pendingToCollect > 0 ? 100 : 0);

  const pendingPayPct = currentSummary.economicExpense > 0
    ? Math.round((currentSummary.pendingToPay / currentSummary.economicExpense) * 100)
    : (currentSummary.pendingToPay > 0 ? 100 : 0);

  // Cantidad de ventas realizadas en mostrador en el período
  const mostradorSalesCount = currentOps.filter(op => {
    const isBooking = op.operationType === 'court_booking' ||
                      op.operationType === 'booking' ||
                      Boolean(op.bookingId) ||
                      op.id.endsWith('-booking');
    return !isBooking && !op.isExpense;
  }).length;

  // ---------------------------------------------------------------------------
  // 5. Reservas, Horas y Ocupación Física del Período
  // ---------------------------------------------------------------------------
  const periodBookings = bookings.filter((b: any) => {
    const d = parseToDate(b.date || b.startTime || b.start_time || b.createdAt);
    if (!d) return false;
    const t = d.getTime();
    return t >= curStartMs && t <= curEndMs;
  });

  // A. Horas Jugadas (Excluye cancelaciones de la ocupación física real)
  const activeBookings = periodBookings.filter(b => {
    const st = String(b.status || '').toLowerCase().trim();
    return st !== 'cancelado' && st !== 'cancelled';
  });

  const totalPlayedHours = Math.round(activeBookings.reduce((sum, b) => {
    let mins = Number(b.durationMinutes ?? b.duration);
    if (!mins || isNaN(mins) || mins <= 0) {
      if (b.startTime && b.endTime) {
        const diffMs = new Date(b.endTime).getTime() - new Date(b.startTime).getTime();
        if (diffMs > 0) mins = Math.round(diffMs / 60000);
      }
    }
    if (!mins || isNaN(mins) || mins <= 0) mins = 60;
    return sum + (mins / 60);
  }, 0));

  // B. Capacidad Horaria y Horas Disponibles
  const courtsCount = Math.max(1, courts.length || (venueProfile?.courts?.length) || 1);
  const totalCapacityHours = calculatePeriodCapacityHours(venueProfile, startDateStr, endDateStr, courtsCount);
  const emptyAvailableHours = Math.max(0, totalCapacityHours - totalPlayedHours);

  // C. Ocupación Semanal / Mensual (%)
  const occupancyRate = totalCapacityHours > 0 ? Math.round((totalPlayedHours / totalCapacityHours) * 100) : 0;

  // D. Dinero Perdido por Desocupación
  const avgCourtPrice = getAverageCourtPrice(courts, activeBookings, 15000);
  const lostIncome = Math.round(emptyAvailableHours * avgCourtPrice);

  // E. Cancelaciones
  const cancelledBookings = periodBookings.filter(b => {
    const st = String(b.status || '').toLowerCase().trim();
    return st === 'cancelado' || st === 'cancelled';
  });
  const cancelCount = cancelledBookings.length;
  const cancelRate = periodBookings.length > 0 ? Math.round((cancelCount / periodBookings.length) * 100) : 0;

  // F. Atribución de Reservas (Complejo vs. Jogo)
  const totalCreatedBookings = periodBookings.length;
  const isJogo = (b: any) => {
    const src = String(b.createdSource || b.source || '').toLowerCase();
    return src === 'jogo' || src === 'erp' || Boolean(b.isExternalBooking);
  };
  const jogoCount = periodBookings.filter(isJogo).length;
  const complejoCount = totalCreatedBookings - jogoCount;
  const pctComplejo = totalCreatedBookings > 0 ? Math.round((complejoCount / totalCreatedBookings) * 100) : 100;
  const pctJogo = totalCreatedBookings > 0 ? Math.round((jogoCount / totalCreatedBookings) * 100) : 0;

  // G. Distribución de Reservas para el Gráfico Central
  let chartPointsCount: number[] = [];
  let chartLabels: string[] = [];

  if (isMonthly) {
    chartLabels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'];
    chartPointsCount = [0, 0, 0, 0, 0];

    periodBookings.forEach((b: any) => {
      const rawDate = b.date || b.startTime || b.start_time;
      const dStr = getDateStr(rawDate);
      if (dStr) {
        const parts = dStr.split('-');
        const dayNum = Number(parts[2]) || 1;
        if (dayNum <= 7) {
          chartPointsCount[0]++;
        } else if (dayNum <= 14) {
          chartPointsCount[1]++;
        } else if (dayNum <= 21) {
          chartPointsCount[2]++;
        } else if (dayNum <= 28) {
          chartPointsCount[3]++;
        } else {
          chartPointsCount[4]++;
        }
      } else {
        chartPointsCount[0]++;
      }
    });
  } else {
    chartLabels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    chartPointsCount = [0, 0, 0, 0, 0, 0, 0];

    periodBookings.forEach((b: any) => {
      const rawDate = b.date || b.startTime || b.start_time;
      const dStr = getDateStr(rawDate);
      if (dStr) {
        const [y, m, d] = dStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        const jsDay = dt.getUTCDay(); // 0 is Sunday, 1 is Monday...
        const idx = jsDay === 0 ? 6 : jsDay - 1;
        if (idx >= 0 && idx < 7) {
          chartPointsCount[idx]++;
        } else {
          chartPointsCount[0]++;
        }
      } else {
        chartPointsCount[0]++;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Renderizado Visual jsPDF (A4 Portrait 210mm x 297mm - Estética Canva)
  // ---------------------------------------------------------------------------
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;

  // Fondo blanco base
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 297, 'F');

  // ===========================================================================
  // 1. ENCABEZADO SUPERIOR VERDE SÓLIDO (y = 0mm a 26mm)
  // ===========================================================================
  doc.setFillColor(5, 156, 15); // #059C0F / Verde Jogo
  doc.rect(0, 0, 210, 26, 'F');

  // Logo Jogo centrado verticalmente manteniendo estrictamente la relación de aspecto
  const logoInfo = await loadLogoBase64();
  if (logoInfo && logoInfo.height > 0) {
    try {
      const targetH = 9.5;
      const aspect = logoInfo.width / logoInfo.height;
      const logoW = Math.min(24, targetH * aspect);
      const logoH = logoW / aspect;
      const logoY = (26 - logoH) / 2;
      doc.addImage(logoInfo.base64, 'PNG', 14, logoY, logoW, logoH);
    } catch {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('Jogo', 14, 17.5);
    }
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Jogo', 14, 17.5);
  }

  // Separador vertical blanco (x = 42mm, y = 6mm a 20mm)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(42, 6, 42, 20);

  // Bloque del complejo (x = 46mm)
  // Línea 1 (y = 13.5mm): Nombre del complejo
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const displayComplex = complexName.length > 24 ? complexName.slice(0, 23) + '...' : complexName;
  doc.text(displayComplex, 46, 13.5);

  // Línea 2 (y = 19.5mm): Subtítulo "Reporte semanal" o "Reporte mensual"
  doc.setTextColor(226, 247, 228); // #E2F7E4
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(isMonthly ? 'Reporte mensual' : 'Reporte semanal', 46, 19.5);

  // ===========================================================================
  // 2. SUBENCABEZADO DE FECHA (y = 26mm a 35mm)
  // ===========================================================================
  doc.setFillColor(250, 250, 250); // #FAFAFA
  doc.rect(0, 26, 210, 9, 'F');
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(0.3);
  doc.line(0, 35, 210, 35);

  // Icono de calendario sutil #9CA3AF
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 28.5, 3.8, 3.5, 0.6, 0.6, 'S');
  doc.line(14, 30, 17.8, 30);
  doc.setFillColor(156, 163, 175);
  doc.rect(15, 27.8, 0.5, 1, 'F');
  doc.rect(16.3, 27.8, 0.5, 1, 'F');

  // Texto del subencabezado
  const subDateText = formatPeriodSubheader(startDateStr, endDateStr);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subDateText, 20, 32);

  // ===========================================================================
  // 3. BLOQUE FINANCIERO (y = 40mm a 112mm, h = 72mm)
  // ===========================================================================
  const compSuffix = isMonthly ? 'Mes ant' : 'Sem ant';
  const cajaSuffix = isMonthly ? 'mes ant' : 'sem ant';

  // Tarjeta Izquierda (x = 12mm, y = 40mm, w = 64mm, h = 70mm)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(0.35);
  doc.roundedRect(12, 40, 64, 70, 5, 5, 'FD');

  // A. INGRESOS (y = 47.5mm)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text('Ingresos', 16, 47.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text(formatARS(currentSummary.economicIncome), 16, 54.5);

  // Pastilla dinámica comparativa de Ingresos (limpia de caracteres Unicode)
  drawPillBadge(doc, 16, 59.5, incomeTrend.pct, compSuffix, 7);

  // B. EGRESOS (y = 70mm)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text('Egresos', 16, 70);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text(formatARS(currentSummary.economicExpense), 16, 77);

  // C. NETO (y = 92mm)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text('Neto', 16, 92);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text(formatARS(currentSummary.netResult), 16, 99);

  // Bloque Derecho (x = 80mm a 198mm, w = 118mm)
  // Tarjeta Caja (x = 80mm, y = 40mm, w = 118mm, h = 28mm)
  doc.setFillColor(220, 252, 231); // #DCFCE7 Menta pastel
  doc.setDrawColor(187, 247, 208); // #BBF7D0
  doc.setLineWidth(0.35);
  doc.roundedRect(80, 40, 118, 28, 4, 4, 'FD');

  // Lado izquierdo Caja
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(31, 41, 55); // #1F2937
  doc.text('Caja', 85, 46.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(formatNumberARS(currentSummary.cashAvailable), 85, 56);

  // Pastilla dinámica en Caja (limpia de caracteres Unicode)
  drawPillBadge(doc, 85, 61, cashTrend.pct, cajaSuffix, 6.5);

  // Lado derecho Caja (dos filas)
  // Fila 1: Por cobrar
  doc.setFillColor(16, 185, 129); // #10B981
  doc.circle(137, 47.5, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(`Por cobrar (${pendingPct}%)`, 140, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text(formatARS(currentSummary.pendingToCollect), 140, 52.5);

  // Fila 2: Por pagar
  doc.setFillColor(239, 68, 68); // #EF4444
  doc.circle(137, 57.5, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(`Por pagar (${pendingPayPct}%)`, 140, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text(formatARS(currentSummary.pendingToPay), 140, 62.5);

  // ===========================================================================
  // FILAS Y BADGES DE MOSTRADOR Y AGENDA (y = 76mm a 108mm)
  // ===========================================================================

  // Fila Mostrador:
  doc.setFillColor(239, 246, 255); // #EFF6FF
  doc.setDrawColor(219, 234, 254); // #DBEAFE
  doc.setLineWidth(0.3);
  doc.roundedRect(80, 76, 11, 11, 2.5, 2.5, 'FD');

  // Ícono vectorial limpio de shopping basket en azul #2563EB centrado en el badge
  doc.setDrawColor(37, 99, 235); // #2563EB
  doc.setFillColor(37, 99, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(82.5, 80.5, 6, 4.2, 0.8, 0.8, 'FD');
  // Ranuras interiores blancas
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(84.3, 81.3, 84.3, 83.8);
  doc.line(85.5, 81.3, 85.5, 83.8);
  doc.line(86.7, 81.3, 86.7, 83.8);
  // Asas diagonales
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(83.4, 80.5, 84.8, 78.5);
  doc.line(87.6, 80.5, 86.2, 78.5);

  // Título Mostrador
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text('Mostrador', 94, 80.5);

  // Subtítulo con "ventas"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text(`${mostradorSalesCount} ${mostradorSalesCount === 1 ? 'venta' : 'ventas'}`, 94, 85.5);

  // Monto a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(formatARS(currentSummary.mostradorIncome), 196, 83, { align: 'right' });

  // Divisor tenue en y = 91mm
  doc.setDrawColor(243, 244, 246); // #F3F4F6
  doc.setLineWidth(0.3);
  doc.line(80, 91, 196, 91);

  // Fila Agenda:
  doc.setFillColor(236, 253, 245); // #ECFDF5
  doc.setDrawColor(167, 243, 208); // #A7F3D0
  doc.setLineWidth(0.3);
  doc.roundedRect(80, 94, 11, 11, 2.5, 2.5, 'FD');

  // Ícono vectorial limpio de cuadrícula de calendario en verde #059669 centrado en el badge
  doc.setDrawColor(5, 150, 105); // #059669
  doc.setLineWidth(0.45);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(82.6, 96.8, 5.8, 5.4, 0.8, 0.8, 'FD');
  // Barra superior verde
  doc.setFillColor(5, 150, 105);
  doc.rect(82.6, 96.8, 5.8, 1.6, 'F');
  // Puntos de cuadrícula interiores
  doc.circle(84.3, 99.6, 0.35, 'F');
  doc.circle(85.5, 99.6, 0.35, 'F');
  doc.circle(86.7, 99.6, 0.35, 'F');
  doc.circle(84.3, 101, 0.35, 'F');
  doc.circle(85.5, 101, 0.35, 'F');
  doc.circle(86.7, 101, 0.35, 'F');

  // Título Agenda
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text('Agenda', 94, 98.5);

  // Subtítulo con "reservas"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text(`${totalCreatedBookings} ${totalCreatedBookings === 1 ? 'reserva' : 'reservas'}`, 94, 103.5);

  // Monto a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(formatARS(currentSummary.reservasIncome), 196, 101, { align: 'right' });

  // ===========================================================================
  // 4. LÍNEAS DE CUADRÍCULA DE LA MITAD INFERIOR
  // ===========================================================================
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(0.35);

  // Línea horizontal superior
  doc.line(12, 116, 198, 116);
  // Línea vertical central
  doc.line(105, 116, 105, 265);
  // Línea horizontal intermedia
  doc.line(12, 205, 198, 205);

  // ===========================================================================
  // 5. FILA CENTRAL: GRÁFICO DE ÁREA Y OCUPACIÓN (y = 120mm a 200mm)
  // ===========================================================================

  // --- Lado Izquierdo (Gráfico de Reservas, x = 12mm a 100mm) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text('Reservas', 14, 124);

  const plotLeft = 24;
  const plotRight = 97;
  const plotTop = 135;
  const plotBottom = 188;
  const plotH = plotBottom - plotTop; // 53mm

  // Eje Y dinámico (5 tramos)
  const maxDayCount = Math.max(...chartPointsCount, 1);
  const yAxisMax = Math.max(isMonthly ? 20 : 15, Math.ceil(maxDayCount / 5) * 5);
  const stepSize = yAxisMax / 5;
  const scaleSteps = [1, 2, 3, 4, 5].map(i => Math.round(i * stepSize));

  doc.setDrawColor(243, 244, 246); // #F3F4F6
  doc.setLineWidth(0.25);

  scaleSteps.forEach(val => {
    const yVal = plotBottom - (val / yAxisMax) * plotH;
    doc.line(plotLeft, yVal, plotRight, yVal);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128); // #6B7280
    doc.text(String(val), plotLeft - 2.5, yVal + 1.2, { align: 'right' });
  });

  // Base del gráfico (0)
  doc.setDrawColor(229, 231, 235);
  doc.line(plotLeft, plotBottom, plotRight, plotBottom);

  // Coordenadas de los puntos (7 para semanal, 5 para mensual)
  const numPts = chartPointsCount.length;
  const colStep = (plotRight - plotLeft) / Math.max(1, numPts - 1);
  const pts: { x: number; y: number; count: number }[] = [];

  chartPointsCount.forEach((count, i) => {
    const px = plotLeft + i * colStep;
    const clampedRatio = Math.min(1, Math.max(0, count / yAxisMax));
    const py = plotBottom - clampedRatio * plotH;
    pts.push({ x: px, y: py, count });

    // Etiqueta del hito en el eje X (Lun..Dom o Sem 1..Sem 5)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99); // #4B5563
    doc.text(chartLabels[i] || '', px, 195, { align: 'center' });
  });

  // Muestreo de Catmull-Rom para curva continua ultrasuave
  const smoothCurve: { x: number; y: number }[] = [];
  const samplesPerSeg = 8;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;

      const sx = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const sy = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      smoothCurve.push({ x: sx, y: Math.min(plotBottom, sy) });
    }
  }
  smoothCurve.push(pts[pts.length - 1]);

  // Relleno sombreado verde menta suave #E8FAED debajo de la curva
  doc.setFillColor(232, 250, 237); // #E8FAED
  for (let k = 0; k < smoothCurve.length - 1; k++) {
    const pA = smoothCurve[k];
    const pB = smoothCurve[k + 1];
    const xMin = pA.x;
    const xMax = pB.x;
    const yTop = Math.min(pA.y, pB.y);
    const wSliver = xMax - xMin;
    const hSliver = plotBottom - yTop;
    if (wSliver > 0 && hSliver > 0) {
      doc.rect(xMin, yTop, wSliver + 0.1, hSliver, 'F');
    }
  }

  // Trazo de la curva continua gruesa verde #10B981 de 0.8mm
  doc.setDrawColor(16, 185, 129); // #10B981
  doc.setLineWidth(0.8);
  for (let k = 0; k < smoothCurve.length - 1; k++) {
    doc.line(smoothCurve[k].x, smoothCurve[k].y, smoothCurve[k + 1].x, smoothCurve[k + 1].y);
  }

  // Vértices: Círculos de datos (r = 1.1mm) con fondo blanco y borde verde
  pts.forEach(pt => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5);
    doc.circle(pt.x, pt.y, 1.1, 'FD');

    // Regla de etiquetas: imprimir número centrado 3mm por encima si count > 0, si es 0 omitir
    if (pt.count > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(31, 41, 55); // #1F2937
      doc.text(String(pt.count), pt.x, pt.y - 3, { align: 'center' });
    }
  });

  // --- Lado Derecho (Ocupación Semanal / Mensual, x = 110mm a 198mm) ---
  const donutCx = 132;
  const donutCy = 152;
  const donutR = 11.25;

  // Donut: Arco restante en gris #E5E7EB
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(3.6);
  doc.circle(donutCx, donutCy, donutR, 'S');

  // Arco ocupado en verde #10B981
  if (occupancyRate > 0) {
    doc.setDrawColor(16, 185, 129); // #10B981
    doc.setLineWidth(3.6);
    const startAng = -Math.PI / 2;
    const sweepAng = (Math.min(100, Math.max(0, occupancyRate)) / 100) * (2 * Math.PI);
    const steps = Math.max(12, Math.round((sweepAng / (2 * Math.PI)) * 96));
    let prevX = donutCx + donutR * Math.cos(startAng);
    let prevY = donutCy + donutR * Math.sin(startAng);

    for (let s = 1; s <= steps; s++) {
      const a = startAng + (sweepAng * (s / steps));
      const curX = donutCx + donutR * Math.cos(a);
      const curY = donutCy + donutR * Math.sin(a);
      doc.line(prevX, prevY, curX, curY);
      prevX = curX;
      prevY = curY;
    }
  }

  // Texto central en el donut
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(`${occupancyRate}%`, donutCx, donutCy + 2.5, { align: 'center' });

  // Textos debajo del donut
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text(isMonthly ? 'Ocupación mensual' : 'Ocupación semanal', donutCx, 171, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text(`${totalPlayedHours}hs de ${totalCapacityHours}hs`, donutCx, 175.5, { align: 'center' });

  // Separador vertical tenue entre donut y viñetas
  doc.setDrawColor(243, 244, 246);
  doc.setLineWidth(0.4);
  doc.line(152, 142, 152, 168);

  // Tres viñetas a la derecha del donut (x = 158mm)
  // 1. Jugados (reloj verde)
  doc.setDrawColor(16, 185, 129); // #10B981
  doc.setLineWidth(0.4);
  doc.circle(160, 145, 1.4, 'S');
  doc.line(160, 145, 160, 144.1);
  doc.line(160, 145, 160.7, 145);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text(`Jugados: ${totalPlayedHours}hs`, 164, 145.8);

  // 2. Disponibles (reloj gris)
  doc.setDrawColor(156, 163, 175); // #9CA3AF
  doc.setLineWidth(0.4);
  doc.circle(160, 155, 1.4, 'S');
  doc.line(160, 155, 160, 154.1);
  doc.line(160, 155, 160.7, 155);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text(`Disponibles: ${emptyAvailableHours}hs`, 164, 155.8);

  // 3. Cancelaciones (círculo rojo con cruz blanca)
  doc.setFillColor(239, 68, 68); // #EF4444
  doc.circle(160, 165, 1.4, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(159.3, 164.3, 160.7, 165.7);
  doc.line(160.7, 164.3, 159.3, 165.7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text(`Cancelaciones: ${cancelCount} (${cancelRate}%)`, 164, 165.8);

  // ===========================================================================
  // 6. FILA INFERIOR: DINERO PERDIDO Y ATRIBUCIÓN (y = 210mm a 265mm)
  // ===========================================================================

  // Lado Izquierdo: Dinero perdido por desocupación
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99); // #4B5563
  doc.text('Dinero perdido por desocupación', 14, 216);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(234, 54, 52); // #EA3634 Rojo intenso
  doc.text(formatARS(lostIncome), 14, 232);

  // Lado Derecho: Reservas generadas por
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(55, 65, 81); // #374151
  doc.text('Reservas generadas por', 110, 218);

  // Barra de progreso en cápsula integrada tipo píldora (x = 110mm, y = 226mm, w = 84mm, h = 6mm, r = 3mm)
  const barW = 84;
  const barH = 6;
  const barY = 226;

  // Fondo / Base completa en verde #009F39 (Jogo)
  doc.setFillColor(0, 159, 57); // #009F39
  doc.roundedRect(110, barY, barW, barH, 3, 3, 'F');

  // Frente / Segmento Complejo en azul #4355FF con curvatura unificada
  const wComplejo = Math.max(0, Math.min(barW, (pctComplejo / 100) * barW));
  if (wComplejo >= barW) {
    doc.setFillColor(67, 85, 255); // #4355FF
    doc.roundedRect(110, barY, barW, barH, 3, 3, 'F');
  } else if (wComplejo > 0) {
    const rComp = Math.min(3, wComplejo / 2);
    doc.setFillColor(67, 85, 255); // #4355FF
    doc.roundedRect(110, barY, wComplejo, barH, rComp, rComp, 'F');
  }

  // Leyenda inferior alineada horizontalmente en y = 238mm (idéntica a Canva)
  // Viñeta Complejo: Punto azul #4355FF (r = 1.2mm)
  const compLegendX = 118;
  doc.setFillColor(67, 85, 255); // #4355FF
  doc.circle(compLegendX, 238, 1.2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81); // #374151
  const safeCompName = complexName.length > 14 ? complexName.slice(0, 13) + '...' : complexName;
  const compLabel = `${safeCompName}${totalCreatedBookings > 0 ? ` ${pctComplejo}%` : ''}`;
  doc.text(compLabel, compLegendX + 3.2, 239);

  // Viñeta Jogo: Punto verde #009F39 (r = 1.2mm)
  const textCompW = doc.getTextWidth(compLabel);
  const minJogoX = compLegendX + textCompW + 10;
  const jogoLegendX = Math.max(162, minJogoX);
  doc.setFillColor(0, 159, 57); // #009F39
  doc.circle(jogoLegendX, 238, 1.2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81); // #374151
  const jogoLabel = `Jogo${totalCreatedBookings > 0 ? ` ${pctJogo}%` : ''}`;
  doc.text(jogoLabel, jogoLegendX + 3.2, 239);

  // ===========================================================================
  // 7. PIE DE PÁGINA (y = 275mm)
  // ===========================================================================
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(0.35);
  doc.line(12, 272, 198, 272);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175); // #9CA3AF
  doc.text('Reporte generado automáticamente por Jogo', 198, 277, { align: 'right' });

  // ---------------------------------------------------------------------------
  // Guardado de Archivo
  // Semanal: Reporte_Semanal_[Complejo]_[startDateStr]_al_[endDateStr].pdf
  // Mensual: Reporte_Mensual_[Complejo]_[Mes].pdf
  // ---------------------------------------------------------------------------
  const sanitizedComplex = complexName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
  let filename = '';
  if (isMonthly) {
    const monthTag = periodLabel 
      ? periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '')
      : startDateStr.slice(0, 7);
    filename = `Reporte_Mensual_${sanitizedComplex}_${monthTag}.pdf`;
  } else {
    filename = `Reporte_Semanal_${sanitizedComplex}_${startDateStr}_al_${endDateStr}.pdf`;
  }

  doc.save(filename);
}
