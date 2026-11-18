import {
  isSameDay,
  isSameWeek,
  isSameMonth,
  subWeeks,
  subMonths,
} from 'date-fns';
import type { Match } from '../../types';
import { safeParseDate } from '../../App';

export const DAYS_OF_WEEK = [
  { key: 1, label: 'Lun', full: 'Lunes' },
  { key: 2, label: 'Mar', full: 'Martes' },
  { key: 3, label: 'Mié', full: 'Miércoles' },
  { key: 4, label: 'Jue', full: 'Jueves' },
  { key: 5, label: 'Vie', full: 'Viernes' },
  { key: 6, label: 'Sáb', full: 'Sábado' },
  { key: 0, label: 'Dom', full: 'Domingo' },
];

export const COURT_COLOR_PALETTE = [
  '#129D44',
  '#2563EB',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#EF4444',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

export type PeriodFilter =
  | 'all'
  | 'today'
  | 'week'
  | 'prev_week'
  | 'month'
  | 'prev_month';
export type HeatmapMode = 'count' | 'percent';
export type ChartAxisMode = 'hour' | 'day';
export type DistributionMode = 'courts' | 'origin';

export interface DemandKpis {
  totalReservations: number;
  playedCount: number;
  cancelledCount: number;
  validCount: number;
  totalRevenue: number;
  avgTicket: number;
  uniquePlayersCount: number;
}

export interface ChartPoint {
  key: string;
  shortLabel: string;
  fullLabel: string;
  count: number;
  revenue: number;
}

export interface HeatmapCellDetail {
  dayLabel: string;
  hour: number;
  rawHour: number;
  count: number;
  jogoCount: number;
  complexCount: number;
  pct: number;
}

export interface BreakdownItem {
  key: string;
  name: string;
  count: number;
  revenue: number;
  color: string;
}

export function extractStartHour(b: Match): number | null {
  const rawTime =
    b.startTime ||
    (b.start_time && String(b.start_time).includes('T')
      ? String(b.start_time).split('T')[1].substring(0, 5)
      : '');
  if (!rawTime) return null;
  const h = parseInt(String(rawTime).split(':')[0], 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

export function getBookingRevenue(b: Match): number {
  return Math.max(
    0,
    Number((b as any).totalPrice ?? b.price ?? b.price_total ?? 0) || 0
  );
}

export function computeNiceYAxis(maxValue: number): {
  maxTick: number;
  ticks: number[];
} {
  const safeMax = Math.max(1, maxValue);
  const steps = 4;
  const rawStep = safeMax / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let niceStep = 1;
  if (norm <= 1) niceStep = 1 * mag;
  else if (norm <= 2) niceStep = 2 * mag;
  else if (norm <= 3) niceStep = 3 * mag;
  else if (norm <= 5) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  niceStep = Math.max(1, Math.round(niceStep));
  const maxTick = niceStep * steps;
  return {
    maxTick,
    ticks: [maxTick, niceStep * 3, niceStep * 2, niceStep, 0],
  };
}

export function computeDemandAnalytics(params: {
  bookings: Match[];
  effectiveCourts: any[];
  visibleCourts: any[];
  venue: any;
  filter: PeriodFilter;
  selectedSports: string[];
  selectedCourtIds: string[];
  courtColorMap: Map<string, string>;
  complexName: string;
}) {
  const {
    bookings,
    effectiveCourts,
    visibleCourts,
    venue,
    filter,
    selectedSports,
    selectedCourtIds,
    courtColorMap,
    complexName,
  } = params;

  const now = new Date();
  const prevWeekRef = subWeeks(now, 1);
  const prevMonthRef = subMonths(now, 1);

  const byPeriodAll = bookings.filter((b) => {
    if (!b) return false;
    const bDateStr =
      b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
    const bDate = safeParseDate(bDateStr ? `${bDateStr}T12:00:00` : b.date);
    if (!bDate) return false;

    if (filter === 'today') return isSameDay(bDate, now);
    if (filter === 'week') return isSameWeek(bDate, now, { weekStartsOn: 1 });
    if (filter === 'prev_week')
      return isSameWeek(bDate, prevWeekRef, { weekStartsOn: 1 });
    if (filter === 'month') return isSameMonth(bDate, now);
    if (filter === 'prev_month') return isSameMonth(bDate, prevMonthRef);
    return true;
  });

  const targetCourts =
    selectedCourtIds.length > 0
      ? visibleCourts.filter((c: any) => selectedCourtIds.includes(String(c.id)))
      : visibleCourts;

  const allowedCourtIds = new Set(targetCourts.map((c: any) => String(c.id)));
  const allowedCourtNames = new Set(
    targetCourts.map((c: any) => String(c.name || '').trim().toLowerCase())
  );

  const hasCourtOrSportFilter =
    selectedSports.length > 0 || selectedCourtIds.length > 0;

  const allPeriodBookings = !hasCourtOrSportFilter
    ? byPeriodAll
    : byPeriodAll.filter((b) => {
        const bCid = String(b.courtId || b.court_id || '');
        const bCname = String(b.courtName || b.court_name || '')
          .trim()
          .toLowerCase();
        return (
          (bCid && allowedCourtIds.has(bCid)) ||
          (bCname && allowedCourtNames.has(bCname))
        );
      });

  let playedCount = 0;
  let cancelledCount = 0;
  const filteredBookings: Match[] = [];

  allPeriodBookings.forEach((b) => {
    const st = String(b.status || '').toLowerCase().trim();
    if (st === 'cancelado' || st === 'cancelled') {
      cancelledCount += 1;
      return;
    }
    if (st === 'jugado' || st === 'completed') {
      playedCount += 1;
    }
    filteredBookings.push(b);
  });

  let totalRevenue = 0;
  const uniquePlayerKeys = new Set<string>();
  filteredBookings.forEach((b) => {
    totalRevenue += getBookingRevenue(b);
    const uid = String((b as any).userId || (b as any).host_id || '').trim();
    const phone = String((b as any).clientPhone || (b as any).userPhone || '')
      .replace(/\D/g, '')
      .trim();
    const name = String(b.clientName || (b as any).userName || '')
      .trim()
      .toLowerCase();
    if (uid && uid !== '0' && uid !== 'anon') {
      uniquePlayerKeys.add(`u_${uid}`);
    } else if (phone) {
      uniquePlayerKeys.add(`p_${phone}`);
    } else if (name) {
      uniquePlayerKeys.add(`n_${name}`);
    } else {
      uniquePlayerKeys.add(`b_${b.id}`);
    }
  });

  const kpis: DemandKpis = {
    totalReservations: allPeriodBookings.length,
    playedCount,
    cancelledCount,
    validCount: filteredBookings.length,
    totalRevenue,
    avgTicket:
      filteredBookings.length > 0 ? totalRevenue / filteredBookings.length : 0,
    uniquePlayersCount: uniquePlayerKeys.size,
  };

  let minHour = 24;
  let maxHour = -1;

  if (venue && Array.isArray(venue.hours)) {
    venue.hours.forEach((h: any) => {
      if (h?.open) {
        const s = parseInt(String(h.start || '18:00').split(':')[0], 10);
        let e = parseInt(String(h.end || '23:00').split(':')[0], 10);
        if (e === 0 || h.end === '00:00') e = 24;
        else if (!isNaN(s) && !isNaN(e) && e < s) e = 24 + e;
        if (!isNaN(s) && s < minHour) minHour = s;
        if (!isNaN(e) && e - 1 > maxHour) maxHour = e - 1;
      }
    });
  }

  bookings.forEach((b) => {
    if (!b) return;
    const st = String(b.status || '').toLowerCase().trim();
    if (st === 'cancelado' || st === 'cancelled') return;
    const h = extractStartHour(b);
    if (h === null) return;
    const displayH = h <= 4 && maxHour >= 23 ? 24 + h : h;
    if (displayH < minHour) minHour = displayH;
    if (displayH > maxHour) maxHour = displayH;
  });

  if (minHour > maxHour) {
    minHour = 14;
    maxHour = 23;
  }

  const matrix = new Map<string, { total: number; jogo: number; complex: number }>();
  const hourTotals = new Map<number, number>();
  const hourRevenues = new Map<number, number>();
  const dayTotals = new Map<number, number>();
  const dayRevenues = new Map<number, number>();
  const dayDateSets = new Map<number, Set<string>>();
  const courtMap = new Map<string, BreakdownItem>();

  let jogoCount = 0;
  let jogoRev = 0;
  let complexCount = 0;
  let complexRev = 0;

  filteredBookings.forEach((b) => {
    const bDateStr =
      b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
    const bDate = safeParseDate(bDateStr ? `${bDateStr}T12:00:00` : b.date);
    const hour = extractStartHour(b);
    const isJogo = String(b.createdSource || '').toLowerCase() === 'jogo';
    const revenue = getBookingRevenue(b);

    if (isJogo) {
      jogoCount += 1;
      jogoRev += revenue;
    } else {
      complexCount += 1;
      complexRev += revenue;
    }

    if (bDate) {
      const dayKey = bDate.getDay();
      dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + 1);
      dayRevenues.set(dayKey, (dayRevenues.get(dayKey) || 0) + revenue);

      if (hour !== null) {
        const displayH = hour <= 4 && minHour > 4 ? 24 + hour : hour;
        if (displayH < minHour) minHour = displayH;
        if (displayH > maxHour) maxHour = displayH;

        const key = `${dayKey}_${displayH}`;
        const prev = matrix.get(key) || { total: 0, jogo: 0, complex: 0 };
        matrix.set(key, {
          total: prev.total + 1,
          jogo: prev.jogo + (isJogo ? 1 : 0),
          complex: prev.complex + (isJogo ? 0 : 1),
        });

        hourTotals.set(displayH, (hourTotals.get(displayH) || 0) + 1);
        hourRevenues.set(displayH, (hourRevenues.get(displayH) || 0) + revenue);

        const dSet = dayDateSets.get(dayKey) || new Set<string>();
        if (bDateStr) dSet.add(bDateStr);
        dayDateSets.set(dayKey, dSet);
      }
    }

    const cId = String(b.courtId || b.court_id || '');
    const matchedCourt = effectiveCourts.find((c: any) => String(c.id) === cId);
    const cName =
      matchedCourt?.name ||
      b.courtName ||
      b.court_name ||
      `Cancha ${cId || '1'}`;
    const courtKey = cName.trim().toLowerCase();
    const prevC = courtMap.get(courtKey);
    if (prevC) {
      prevC.count += 1;
      prevC.revenue += revenue;
    } else {
      const mappedColor =
        courtColorMap.get(courtKey) ||
        COURT_COLOR_PALETTE[courtMap.size % COURT_COLOR_PALETTE.length];
      courtMap.set(courtKey, {
        key: courtKey,
        name: cName,
        count: 1,
        revenue,
        color: mappedColor,
      });
    }
  });

  const hourRows: number[] = [];
  for (let h = minHour; h <= maxHour; h++) hourRows.push(h);

  let maxCellCount = 0;
  matrix.forEach((v) => {
    if (v.total > maxCellCount) maxCellCount = v.total;
  });

  const activeCourtsDenominator = Math.max(
    1,
    selectedCourtIds.length > 0
      ? selectedCourtIds.length
      : visibleCourts.length || 1
  );

  const weekdayOccurrences = new Map<number, number>();
  DAYS_OF_WEEK.forEach((d) => {
    const uniqueDates = dayDateSets.get(d.key)?.size || 0;
    weekdayOccurrences.set(d.key, Math.max(1, uniqueDates));
  });

  const courtBreakdown = Array.from(courtMap.values()).sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return b.count - a.count;
  });

  const originBreakdown: BreakdownItem[] = [
    {
      key: 'jogo',
      name: 'Jogo',
      count: jogoCount,
      revenue: jogoRev,
      color: '#129D44',
    },
    {
      key: 'complex',
      name: complexName || 'Complejo',
      count: complexCount,
      revenue: complexRev,
      color: '#2563EB',
    },
  ].sort((a, b) => b.count - a.count);

  return {
    kpis,
    filteredBookings,
    hourRows,
    hourTotals,
    hourRevenues,
    dayTotals,
    dayRevenues,
    matrix,
    maxCellCount,
    courtBreakdown,
    originBreakdown,
    activeCourtsDenominator,
    weekdayOccurrences,
  };
}
