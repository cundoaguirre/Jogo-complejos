/**
 * complexProfileSync.ts
 * Módulo de unificación de la Ficha Única del Complejo entre SaaS y ERP.
 * 
 * Sincroniza bidireccionalmente los formatos de horarios (hours en SaaS vs weeklySchedule en ERP)
 * y normaliza la estructura de canchas y datos de contacto.
 */

export const UNIFIED_DAYS = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' }
] as const;

export type UnifiedDayKey = typeof UNIFIED_DAYS[number]['key'];

export interface DayScheduleERP {
  open: string;            // ej: "14:00"
  close: string;           // ej: "00:00" o "02:00"
  isClosed: boolean;
  crossesMidnight: boolean;
}

export interface DayScheduleSaaS {
  day: string;             // ej: "Lunes" o "lunes"
  open: boolean;
  start: string;           // ej: "14:00"
  end: string;             // ej: "00:00"
}

/**
 * Convierte una cadena de hora "HH:mm" a minutos desde 00:00.
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  if (clean === '24:00' || clean === '24:00:00') return 0;
  const parts = clean.split(':').map(Number);
  const h = isNaN(parts[0]) ? 0 : parts[0];
  const m = isNaN(parts[1]) ? 0 : parts[1];
  return (h % 24) * 60 + m;
}

/**
 * Retorna true si ambos existen y los minutos de close son menores o iguales a los de open.
 * Ej: "14:00" a "00:00" o "02:00".
 */
export function doesCrossMidnight(open: string, close: string): boolean {
  if (!open || !close) return false;
  const openM = timeToMinutes(open);
  const closeM = timeToMinutes(close);
  return closeM <= openM;
}

/**
 * Normaliza nombres de días (removiendo tildes y mayúsculas) a la clave estándar.
 */
export function normalizeDayKey(rawDay: string): UnifiedDayKey | null {
  if (!rawDay) return null;
  const s = rawDay
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (s.startsWith('lun')) return 'lunes';
  if (s.startsWith('mar')) return 'martes';
  if (s.startsWith('mie') || s.startsWith('mié')) return 'miercoles';
  if (s.startsWith('jue')) return 'jueves';
  if (s.startsWith('vie')) return 'viernes';
  if (s.startsWith('sab') || s.startsWith('sáb')) return 'sabado';
  if (s.startsWith('dom')) return 'domingo';
  return null;
}

/**
 * Convierte el array hours del SaaS ([{ day: 'Lunes', open: true, start: '14:00', end: '00:00' }, ...])
 * al objeto weeklySchedule del ERP ({ lunes: { open: '14:00', close: '00:00', isClosed: false, crossesMidnight: true }, ... }).
 */
export function hoursToWeeklySchedule(hours: any[]): Record<string, DayScheduleERP> {
  const result: Record<string, DayScheduleERP> = {};
  const hoursMap: Record<string, any> = {};

  if (Array.isArray(hours)) {
    for (const h of hours) {
      if (!h) continue;
      const key = normalizeDayKey(h.day || h.name || '');
      if (key) {
        hoursMap[key] = h;
      }
    }
  }

  for (const { key } of UNIFIED_DAYS) {
    const entry = hoursMap[key];
    if (entry) {
      const open = entry.start || entry.openTime || entry.open || '14:00';
      const close = entry.end || entry.closeTime || entry.close || '00:00';
      const isClosed = entry.open === false || entry.isClosed === true;
      result[key] = {
        open,
        close,
        isClosed,
        crossesMidnight: doesCrossMidnight(open, close)
      };
    } else {
      result[key] = {
        open: '14:00',
        close: '00:00',
        isClosed: false,
        crossesMidnight: true
      };
    }
  }

  return result;
}

/**
 * Convierte el objeto weeklySchedule del ERP al array hours de 7 días del SaaS.
 */
export function weeklyScheduleToHours(weeklySchedule: Record<string, any>): DayScheduleSaaS[] {
  const result: DayScheduleSaaS[] = [];
  const sched = weeklySchedule || {};

  for (const { key, label } of UNIFIED_DAYS) {
    const dayEntry = sched[key] || sched[label] || sched[key.toLowerCase()] || {};
    const isOpen = dayEntry.isClosed !== true && dayEntry.open !== false;
    const start = dayEntry.open || dayEntry.start || '14:00';
    const end = dayEntry.close || dayEntry.end || '00:00';

    result.push({
      day: label,
      open: isOpen,
      start,
      end
    });
  }

  return result;
}

/**
 * Resuelve y sincroniza el horario unificado a partir de los datos del documento de Firestore.
 */
export function resolveUnifiedSchedule(data: any): {
  hours: DayScheduleSaaS[];
  weeklySchedule: Record<string, DayScheduleERP>;
  openTime: string;
  closeTime: string;
  crossesMidnight: boolean;
} {
  const hasHours = Array.isArray(data?.hours) && data.hours.length > 0;
  const hasSchedule = Boolean(data?.weeklySchedule && typeof data.weeklySchedule === 'object' && Object.keys(data.weeklySchedule).length > 0);

  let finalHours: DayScheduleSaaS[];
  let finalWeeklySchedule: Record<string, DayScheduleERP>;

  if (data?.hoursUpdatedAt && data?.scheduleUpdatedAt) {
    const hTime = new Date(data.hoursUpdatedAt).getTime();
    const sTime = new Date(data.scheduleUpdatedAt).getTime();

    if (sTime > hTime && hasSchedule) {
      finalWeeklySchedule = data.weeklySchedule;
      finalHours = weeklyScheduleToHours(finalWeeklySchedule);
    } else if (hasHours) {
      finalHours = data.hours.map((h: any) => ({
        day: h.day || 'Lunes',
        open: h.open !== false,
        start: h.start || '14:00',
        end: h.end || '00:00'
      }));
      finalWeeklySchedule = hoursToWeeklySchedule(finalHours);
    } else if (hasSchedule) {
      finalWeeklySchedule = data.weeklySchedule;
      finalHours = weeklyScheduleToHours(finalWeeklySchedule);
    } else {
      finalWeeklySchedule = hoursToWeeklySchedule([]);
      finalHours = weeklyScheduleToHours(finalWeeklySchedule);
    }
  } else if (hasSchedule && !hasHours) {
    finalWeeklySchedule = data.weeklySchedule;
    finalHours = weeklyScheduleToHours(finalWeeklySchedule);
  } else if (hasHours) {
    finalHours = data.hours.map((h: any) => ({
      day: h.day || 'Lunes',
      open: h.open !== false,
      start: h.start || '14:00',
      end: h.end || '00:00'
    }));
    finalWeeklySchedule = hoursToWeeklySchedule(finalHours);
  } else {
    finalWeeklySchedule = hoursToWeeklySchedule([]);
    finalHours = weeklyScheduleToHours(finalWeeklySchedule);
  }

  // Determinar openTime, closeTime y crossesMidnight predominantes
  const openDays = finalHours.filter(h => h.open);
  const openTime = openDays[0]?.start || '14:00';
  const closeTime = openDays[0]?.end || '00:00';
  const crosses = openDays.some(h => doesCrossMidnight(h.start, h.end));

  return {
    hours: finalHours,
    weeklySchedule: finalWeeklySchedule,
    openTime,
    closeTime,
    crossesMidnight: crosses
  };
}

/**
 * Normaliza un objeto cancha asegurando la presencia de todos los campos
 * requeridos por la UI del SaaS y por el ERP.
 */
export function normalizeUnifiedCourt(c: any, idx: number) {
  const id = c?.id ? String(c.id) : `c_${idx + 1}`;
  const name = String(c?.name || `Cancha ${idx + 1}`).trim();
  const sport = c?.sport || c?.type || 'fútbol 5';
  const type = c?.type || c?.sport || 'fútbol 5';
  const surface = c?.surface || 'sintético';
  const price = Number(c?.price ?? c?.price_per_hour ?? 0);
  const price_per_hour = Number(c?.price_per_hour ?? c?.price ?? 0);

  // Normalizado para la UI del SaaS: 'available' | 'maintenance' | 'inactiva'
  const rawStatus = String(c?.status || '').toLowerCase().trim();
  const status = (rawStatus === 'mantenimiento' || rawStatus === 'maintenance')
    ? 'maintenance'
    : (rawStatus === 'inactiva' ? 'inactiva' : 'available');

  const isCovered = Boolean(c?.is_roofed ?? c?.isCovered ?? false);
  const blockedCourts = Array.isArray(c?.blockedCourts) ? c.blockedCourts.map(String) : [];

  return {
    id,
    name,
    sport,
    type,
    surface,
    price,
    price_per_hour,
    status,
    is_roofed: isCovered,
    isCovered,
    blockedCourts
  };
}
