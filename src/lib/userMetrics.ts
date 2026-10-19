/**
 * ESPECIFICACIÓN ANALÍTICA Y MODELO MATEMÁTICO DE USUARIOS
 * Documento de Arquitectura y Persistencia Operativa: Módulo de Usuarios / CRM
 */

export interface RawBooking {
  id?: string | number;
  userId?: string | number;
  host_id?: string | number;
  userPhone?: string;
  clientPhone?: string;
  date?: string;
  startTime?: string;
  start_time?: string;
  status?: string;
  [key: string]: any;
}

export interface UserLifecycleMetrics {
  adquisicionFormatted: string; // DD/MM/YY
  activacionFormatted: string;  // DD/MM/YY o "-"
  ttvFormatted: string;         // ej. "2d", "14d", "0d" o "-"
  semanaActFormatted: string;   // ej. "W0", "W1", "W2" o "-"
  reservas: number;             // Total de reservas activas (no canceladas)
  juegos: number;               // Entero puro (partidos ya finalizados)
  frecuencia: number;           // Entero (ej. 1, 0)
  ultimoJuegoFormatted: string; // DD/MM/YY o "-"
  sinJugarFormatted: string;    // ej. "3d", "2d" o "-"
  cicloFormatted: string;       // ej. "28d", "2d" o "-"
  
  // Raw values for filtering / sorting
  ttvDays: number | null;
  sinJugarDays: number | null;
  cicloDays: number | null;
  isActivated: boolean;
}

export interface ParsedYMD {
  year: number;
  month: number;
  day: number;
}

/**
 * Parsea con precisión fechas en strings ("YYYY-MM-DD", ISO o DD/MM/YYYY) o Date
 * a tupla { year, month, day } sin desfases horarios de zona/DST.
 */
export function parseYMD(val: any): ParsedYMD | null {
  if (!val) return null;

  if (typeof val === 'object' && val !== null && 'year' in val && 'month' in val && 'day' in val) {
    return val as ParsedYMD;
  }

  if (val instanceof Date && !isNaN(val.getTime())) {
    return {
      year: val.getFullYear(),
      month: val.getMonth() + 1,
      day: val.getDate()
    };
  }

  const str = String(val).trim();

  // YYYY-MM-DD o YYYY-MM-DDTHH:mm...
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    return {
      year: parseInt(ymdMatch[1], 10),
      month: parseInt(ymdMatch[2], 10),
      day: parseInt(ymdMatch[3], 10)
    };
  }

  // DD/MM/YYYY o DD/MM/YY
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmyMatch) {
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return {
      year,
      month: parseInt(dmyMatch[2], 10),
      day: parseInt(dmyMatch[1], 10)
    };
  }

  // Intentar parse estándar
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate()
    };
  }

  return null;
}

/**
 * Convierte a timestamp UTC a medianoche para cálculo matemático de diferencia de días exacto.
 */
function toMidnightUtcMs(ymd: ParsedYMD): number {
  return Date.UTC(ymd.year, ymd.month - 1, ymd.day);
}

/**
 * Diferencia de días entre dos fechas (ymd1 - ymd2)
 */
export function differenceInCalendarDays(ymd1: ParsedYMD, ymd2: ParsedYMD): number {
  const ms1 = toMidnightUtcMs(ymd1);
  const ms2 = toMidnightUtcMs(ymd2);
  return Math.floor((ms1 - ms2) / (86400 * 1000));
}

/**
 * Formatea a "DD/MM/YY" (ej. "12/09/26")
 */
export function formatDDMMYY(val: any): string {
  const ymd = parseYMD(val);
  if (!ymd) return '-';
  const dd = String(ymd.day).padStart(2, '0');
  const mm = String(ymd.month).padStart(2, '0');
  const yy = String(ymd.year).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/**
 * Calcula todas las métricas del ciclo de vida del usuario conforme a la Especificación Matemática:
 * 
 * B_u = { b in bookings | b.userId == u.id || b.userPhone == u.phone }
 * A. Adquisición (T_adq): Fecha de alta del cliente
 * B. Activación (T_act): min_{b in B_u}(date(b))
 * C. Time to Value (TTV): floor((T_act - T_adq) / 86400000)
 * D. Semana de Activación (W_act): "W" + floor(TTV / 7)
 * E. Partidos Jugados (N_juegos): |{ b in B_u | status in {jugado, confirmado} }|
 * F. Último Juego (T_last): max_{b in B_u}(date(b))
 * G. Días sin Jugar (D_inactivo): floor((T_hoy - T_last) / 86400000)
 * H. Ciclo de Vida (LTV_días): floor((T_hoy - T_act) / 86400000)
 */
/**
 * Determina si una reserva califica estrictamente como partido finalizado/jugado:
 * a) status es 'jugado' o 'completed', O BIEN
 * b) la fecha/hora de finalización del turno es <= now.getTime() (contemplando cruce de medianoche).
 * Si el turno es futuro (endMs > now.getTime()) y su estado es 'confirmado' o 'scheduled', retorna false.
 */
export function isBookingPlayed(b: RawBooking, now: Date = new Date()): boolean {
  if (!b) return false;
  const st = String(b.status || '').toLowerCase().trim();
  if (st === 'cancelled' || st === 'cancelado') return false;
  if (st === 'jugado' || st === 'completed') return true;

  const dateStr = b.date || (b.startTime ? String(b.startTime).split('T')[0] : (b.start_time ? String(b.start_time).split('T')[0] : null));
  const ymd = parseYMD(dateStr);
  if (!ymd) return false;

  const rawStart = String(b.startTime || b.start_time || '00:00');
  const startPart = rawStart.includes('T') ? rawStart.split('T')[1] : rawStart;
  const startMatch = startPart.match(/(\d{1,2}):(\d{2})/);
  const startHour = startMatch ? parseInt(startMatch[1], 10) : 0;
  const startMin = startMatch ? parseInt(startMatch[2], 10) : 0;

  const rawEnd = b.endTime || b.end_time;
  let endHour = startHour + 1;
  let endMin = startMin;
  let crossMidnight = false;

  if (rawEnd) {
    const endPart = String(rawEnd).includes('T') ? String(rawEnd).split('T')[1] : String(rawEnd);
    const endMatch = endPart.match(/(\d{1,2}):(\d{2})/);
    if (endMatch) {
      endHour = parseInt(endMatch[1], 10);
      endMin = parseInt(endMatch[2], 10);
      if (endHour < startHour || (endHour === startHour && endMin <= startMin)) {
        crossMidnight = true;
      }
    }
  } else if (b.durationMinutes) {
    const totalMin = startHour * 60 + startMin + Number(b.durationMinutes);
    endHour = Math.floor(totalMin / 60);
    endMin = totalMin % 60;
    if (endHour >= 24) {
      crossMidnight = true;
      endHour = endHour % 24;
    }
  }

  const endDay = ymd.day + (crossMidnight ? 1 : 0);
  const endDate = new Date(ymd.year, ymd.month - 1, endDay, endHour, endMin, 0, 0);
  const endMs = endDate.getTime();

  if (isNaN(endMs)) return false;

  if (endMs <= now.getTime()) {
    return true;
  }

  // Turno futuro con estado confirmado o scheduled
  return false;
}

export function calculateUserLifecycleMetrics(
  user: any,
  associatedBookings: RawBooking[] = [],
  systemDate: Date = new Date()
): UserLifecycleMetrics {
  const todayYMD = parseYMD(systemDate)!;

  // Todas las reservas realizadas (incluye activas, jugadas y canceladas)
  const allValidBookings = associatedBookings.filter(b => Boolean(b && (b.date || b.startTime || b.start_time)));
  const reservas = allValidBookings.length;

  // Filtrar reservas no canceladas
  const activeBookings = associatedBookings.filter(b => {
    const st = String(b.status || '').toLowerCase();
    return st !== 'cancelled' && st !== 'cancelado';
  });

  // Filtrar exclusivamente partidos que ya han sido jugados/finalizados
  const playedBookings = activeBookings.filter(b => isBookingPlayed(b, systemDate));
  const juegos = playedBookings.length;

  // A. Adquisición (T_adq)
  const rawAdq = user.acquisitionDate || user.acquisition_date || user.created_at || user.createdAt;
  let adqYMD = parseYMD(rawAdq);

  // Si no hay partidos jugados, inicializar métricas según especificación
  if (playedBookings.length === 0) {
    if (!adqYMD) {
      adqYMD = todayYMD;
    }
    const adquisicionFormatted = formatDDMMYY(adqYMD);

    return {
      adquisicionFormatted,
      activacionFormatted: '-',
      ttvFormatted: '-',
      semanaActFormatted: '-',
      reservas,
      juegos: 0,
      frecuencia: 0,
      ultimoJuegoFormatted: '-',
      sinJugarFormatted: '-',
      cicloFormatted: '-',
      ttvDays: null,
      sinJugarDays: null,
      cicloDays: null,
      isActivated: false
    };
  }

  // Fechas de partidos jugados ordenadas cronológicamente
  const bookingDates: { raw: string; ymd: ParsedYMD; ms: number }[] = [];
  for (const b of playedBookings) {
    const dateStr = b.date || (b.startTime ? String(b.startTime).split('T')[0] : (b.start_time ? String(b.start_time).split('T')[0] : null));
    if (dateStr) {
      const ymd = parseYMD(dateStr);
      if (ymd) {
        bookingDates.push({ raw: dateStr, ymd, ms: toMidnightUtcMs(ymd) });
      }
    }
  }
  bookingDates.sort((a, b) => a.ms - b.ms);

  const firstBooking = bookingDates[0];
  const lastBooking = bookingDates[bookingDates.length - 1];

  if (!adqYMD && firstBooking) {
    adqYMD = firstBooking.ymd;
  }
  if (!adqYMD) {
    adqYMD = todayYMD;
  }
  const adquisicionFormatted = formatDDMMYY(adqYMD);

  // B. Activación (T_act): primer partido jugado
  const actYMD = firstBooking.ymd;
  const activacionFormatted = formatDDMMYY(actYMD);
  const isActivated = true;

  // C. Time to Value (TTV): floor((T_act - T_adq) / 86400000)
  let ttvDays: number | null = null;
  let ttvFormatted = '-';
  let semanaActFormatted = '-';

  if (actYMD && adqYMD) {
    const diff = differenceInCalendarDays(actYMD, adqYMD);
    ttvDays = Math.max(0, diff);
    ttvFormatted = `${ttvDays}d`;

    // D. Semana de Activación (W_act): "W" + floor(TTV / 7)
    const weekCohort = Math.floor(ttvDays / 7);
    semanaActFormatted = `W${weekCohort}`;
  }

  // F. Último Juego (T_last): max date de playedBookings
  const lastYMD = lastBooking.ymd;
  const ultimoJuegoFormatted = formatDDMMYY(lastYMD);

  // G. Días sin Jugar (D_inactivo): floor((T_hoy - T_last) / 86400000)
  const diffSinJugar = differenceInCalendarDays(todayYMD, lastYMD);
  const sinJugarDays = Math.max(0, diffSinJugar);
  const sinJugarFormatted = `${sinJugarDays}d`;

  // H. Ciclo de Vida (LTV_días): floor((T_hoy - T_act) / 86400000)
  const diffCiclo = differenceInCalendarDays(todayYMD, actYMD);
  const cicloDays = Math.max(0, diffCiclo);
  const cicloFormatted = `${cicloDays}d`;

  // Frecuencia (Frec)
  let frecuencia = 0;
  if (juegos > 0 && cicloDays !== null && cicloDays >= 7) {
    const weeks = Math.floor(cicloDays / 7);
    frecuencia = Math.floor(juegos / Math.max(1, weeks));
  }

  return {
    adquisicionFormatted,
    activacionFormatted,
    ttvFormatted,
    semanaActFormatted,
    reservas,
    juegos,
    frecuencia,
    ultimoJuegoFormatted,
    sinJugarFormatted,
    cicloFormatted,
    ttvDays,
    sinJugarDays,
    cicloDays,
    isActivated
  };
}
