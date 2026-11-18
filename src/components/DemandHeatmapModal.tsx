import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Trophy } from 'lucide-react';
import {
  isSameDay,
  isSameWeek,
  isSameMonth,
  subWeeks,
  subMonths,
} from 'date-fns';
import type { Match } from '../types';
import {
  subscribeToBookings,
  subscribeToCourts,
  subscribeToVenueProfile,
} from '../lib/firestoreSync';
import { safeParseDate } from '../App';

interface DemandHeatmapModalProps {
  onClose: () => void;
  complexId?: string;
  bookings?: Match[];
  courts?: any[];
}

const DAYS_OF_WEEK = [
  { key: 1, label: 'Lun', full: 'Lunes' },
  { key: 2, label: 'Mar', full: 'Martes' },
  { key: 3, label: 'Mié', full: 'Miércoles' },
  { key: 4, label: 'Jue', full: 'Jueves' },
  { key: 5, label: 'Vie', full: 'Viernes' },
  { key: 6, label: 'Sáb', full: 'Sábado' },
  { key: 0, label: 'Dom', full: 'Domingo' },
];

const COURT_COLOR_PALETTE = [
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

type PeriodFilter =
  | 'all'
  | 'today'
  | 'week'
  | 'prev_week'
  | 'month'
  | 'prev_month';
type HeatmapMode = 'count' | 'percent';
type ChartAxisMode = 'hour' | 'day';

function extractStartHour(b: Match): number | null {
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

function getBookingRevenue(b: Match): number {
  return Math.max(
    0,
    Number((b as any).totalPrice ?? b.price ?? b.price_total ?? 0) || 0
  );
}

function computeNiceYAxis(maxValue: number): {
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
  const ticks = [maxTick, niceStep * 3, niceStep * 2, niceStep, 0];
  return { maxTick, ticks };
}

export const DemandHeatmapModal: React.FC<DemandHeatmapModalProps> = ({
  onClose,
  complexId = 'complejo_central',
  bookings: propBookings,
  courts: propCourts,
}) => {
  const [filter, setFilter] = useState<PeriodFilter>('all');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('count');
  const [chartAxisMode, setChartAxisMode] = useState<ChartAxisMode>('hour');
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

  const [venue, setVenue] = useState<any>(null);
  const [subBookings, setSubBookings] = useState<Match[]>([]);
  const [subCourts, setSubCourts] = useState<any[]>([]);
  const [selectedCell, setSelectedCell] = useState<{
    dayLabel: string;
    dayShort: string;
    hour: number;
    rawHour: number;
    count: number;
    jogoCount: number;
    complexCount: number;
    pct: number;
  } | null>(null);

  const chartAreaRef = useRef<HTMLDivElement>(null);
  const stackedBarRef = useRef<HTMLDivElement>(null);
  const isClosingManuallyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipeRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastDx: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    lastDx: 0,
  });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const hasBookingsProp = propBookings !== undefined;
  const hasCourtsProp = propCourts !== undefined;

  useEffect(() => {
    isClosingManuallyRef.current = false;
    if (window.history.state?.modal !== 'demand-analytics') {
      window.history.pushState({ modal: 'demand-analytics' }, '');
    }

    const handlePopState = () => {
      if (isClosingManuallyRef.current) return;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleClose = () => {
    if (isClosingManuallyRef.current) return;
    isClosingManuallyRef.current = true;
    onCloseRef.current();
    if (window.history.state?.modal === 'demand-analytics') {
      window.history.back();
    }
  };

  useEffect(() => {
    const unsubVenue = subscribeToVenueProfile(complexId, (data) => {
      if (data) setVenue(data);
    });
    const unsubBookings = hasBookingsProp
      ? undefined
      : subscribeToBookings(complexId, (data) => {
          setSubBookings(Array.isArray(data) ? data : []);
        });
    const unsubCourts = hasCourtsProp
      ? undefined
      : subscribeToCourts(complexId, (data) => {
          setSubCourts(Array.isArray(data) ? data : []);
        });
    return () => {
      unsubVenue();
      unsubBookings?.();
      unsubCourts?.();
    };
  }, [complexId, hasBookingsProp, hasCourtsProp]);

  const bookings = hasBookingsProp ? propBookings : subBookings;
  const courts = hasCourtsProp ? propCourts : subCourts;

  const clearSelections = () => {
    setSelectedPoint(null);
    setSelectedCell(null);
    setSelectedCourt(null);
  };

  const handleSwipeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch && touch.clientX <= 36) {
      swipeRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        lastDx: 0,
      };
    } else {
      swipeRef.current = { active: false, startX: 0, startY: 0, lastDx: 0 };
    }
  };

  const handleSwipeTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeRef.current.active || !e.touches[0]) return;
    const dx = e.touches[0].clientX - swipeRef.current.startX;
    const dy = e.touches[0].clientY - swipeRef.current.startY;
    if (dx > 0 && dx > Math.abs(dy) * 1.2) {
      swipeRef.current.lastDx = dx;
      setIsSwiping(true);
      setSwipeOffset(dx);
    } else if (dx <= 0) {
      swipeRef.current.lastDx = 0;
      setSwipeOffset(0);
    } else if (Math.abs(dy) > 12 && Math.abs(dy) >= dx) {
      swipeRef.current.active = false;
      swipeRef.current.lastDx = 0;
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  };

  const handleSwipeTouchEnd = () => {
    if (!swipeRef.current.active) return;
    const finalDx = swipeRef.current.lastDx;
    swipeRef.current.active = false;
    swipeRef.current.lastDx = 0;
    setIsSwiping(false);
    if (finalDx >= 80) {
      handleClose();
    } else {
      setSwipeOffset(0);
    }
  };

  const handleSwipeTouchCancel = () => {
    swipeRef.current.active = false;
    swipeRef.current.lastDx = 0;
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const effectiveCourts = useMemo(() => {
    const fromSub = Array.isArray(courts) ? courts : [];
    const fromVenue = Array.isArray(venue?.courts) ? venue.courts : [];
    return fromSub.length > 0 ? fromSub : fromVenue;
  }, [courts, venue]);

  // Mapa consistente de colores por cancha
  const courtColorMap = useMemo(() => {
    const map = new Map<string, string>();
    effectiveCourts.forEach((c: any, idx: number) => {
      const key = String(c?.name || c?.id || `cancha_${idx}`)
        .trim()
        .toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, COURT_COLOR_PALETTE[idx % COURT_COLOR_PALETTE.length]);
      }
    });
    return map;
  }, [effectiveCourts]);

  // Deportes reales que posee el complejo
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    effectiveCourts.forEach((c: any) => {
      const sp = String(c?.sport || c?.deporte || c?.type || '').trim();
      if (sp) set.add(sp);
    });
    return Array.from(set);
  }, [effectiveCourts]);

  // Canchas visibles según filtro de deporte
  const visibleCourts = useMemo(() => {
    if (selectedSports.length === 0) return effectiveCourts;
    return effectiveCourts.filter((c: any) => {
      const sp = String(c?.sport || c?.deporte || c?.type || '').trim();
      return selectedSports.includes(sp);
    });
  }, [effectiveCourts, selectedSports]);

  const toggleSport = (sport: string) => {
    clearSelections();
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
    setSelectedCourtIds([]);
  };

  const toggleCourt = (courtId: string) => {
    clearSelections();
    setSelectedCourtIds((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId]
    );
  };

  // Reservas válidas (no canceladas) filtradas por período, deporte y canchas
  const { filteredBookings } = useMemo(() => {
    const now = new Date();
    const prevWeekRef = subWeeks(now, 1);
    const prevMonthRef = subMonths(now, 1);

    const byPeriod = bookings.filter((b) => {
      if (!b) return false;
      const st = String(b.status || '').toLowerCase().trim();
      if (st === 'cancelado' || st === 'cancelled') return false;

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

    const allowedCourtIds = new Set(
      (selectedCourtIds.length > 0
        ? visibleCourts.filter((c: any) =>
            selectedCourtIds.includes(String(c.id))
          )
        : visibleCourts
      ).map((c: any) => String(c.id))
    );

    const allowedCourtNames = new Set(
      (selectedCourtIds.length > 0
        ? visibleCourts.filter((c: any) =>
            selectedCourtIds.includes(String(c.id))
          )
        : visibleCourts
      ).map((c: any) => String(c.name || '').trim().toLowerCase())
    );

    const hasCourtOrSportFilter =
      selectedSports.length > 0 || selectedCourtIds.length > 0;

    const byFilters = !hasCourtOrSportFilter
      ? byPeriod
      : byPeriod.filter((b) => {
          const bCid = String(b.courtId || b.court_id || '');
          const bCname = String(b.courtName || b.court_name || '')
            .trim()
            .toLowerCase();
          return (
            (bCid && allowedCourtIds.has(bCid)) ||
            (bCname && allowedCourtNames.has(bCname))
          );
        });

    return { filteredBookings: byFilters };
  }, [bookings, filter, selectedSports, selectedCourtIds, visibleCourts]);

  const {
    hourRows,
    hourTotals,
    hourRevenues,
    dayTotals,
    dayRevenues,
    matrix,
    maxCellCount,
    courtBreakdown,
    activeCourtsDenominator,
    weekdayOccurrences,
  } = useMemo(() => {
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

    // Incluir también reservas históricas fuera del horario vigente
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

    const cellData = new Map<
      string,
      { total: number; jogo: number; complex: number }
    >();
    const hCounts = new Map<number, number>();
    const hRevs = new Map<number, number>();
    const dCounts = new Map<number, number>();
    const dRevs = new Map<number, number>();
    const dayDateSets = new Map<number, Set<string>>();
    const courtMap = new Map<
      string,
      { key: string; name: string; count: number; revenue: number; color: string }
    >();

    filteredBookings.forEach((b) => {
      const bDateStr =
        b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
      const bDate = safeParseDate(bDateStr ? `${bDateStr}T12:00:00` : b.date);
      const hour = extractStartHour(b);
      const isJogo = String(b.createdSource || '').toLowerCase() === 'jogo';
      const revenue = getBookingRevenue(b);

      if (bDate) {
        const dayKey = bDate.getDay();
        dCounts.set(dayKey, (dCounts.get(dayKey) || 0) + 1);
        dRevs.set(dayKey, (dRevs.get(dayKey) || 0) + revenue);

        if (hour !== null) {
          const displayH = hour <= 4 && minHour > 4 ? 24 + hour : hour;
          if (displayH < minHour) minHour = displayH;
          if (displayH > maxHour) maxHour = displayH;

          const key = `${dayKey}_${displayH}`;
          const prev = cellData.get(key) || { total: 0, jogo: 0, complex: 0 };
          cellData.set(key, {
            total: prev.total + 1,
            jogo: prev.jogo + (isJogo ? 1 : 0),
            complex: prev.complex + (isJogo ? 0 : 1),
          });

          hCounts.set(displayH, (hCounts.get(displayH) || 0) + 1);
          hRevs.set(displayH, (hRevs.get(displayH) || 0) + revenue);

          const dSet = dayDateSets.get(dayKey) || new Set<string>();
          if (bDateStr) dSet.add(bDateStr);
          dayDateSets.set(dayKey, dSet);
        }
      }

      const cId = String(b.courtId || b.court_id || '');
      const matchedCourt = effectiveCourts.find(
        (c: any) => String(c.id) === cId
      );
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

    const rows: number[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      rows.push(h);
    }

    let maxCell = 0;
    cellData.forEach((v) => {
      if (v.total > maxCell) maxCell = v.total;
    });

    const courtsCount = Math.max(
      1,
      selectedCourtIds.length > 0
        ? selectedCourtIds.length
        : visibleCourts.length || 1
    );

    const occMap = new Map<number, number>();
    DAYS_OF_WEEK.forEach((d) => {
      const uniqueDates = dayDateSets.get(d.key)?.size || 0;
      occMap.set(d.key, Math.max(1, uniqueDates));
    });

    const sortedCourts = Array.from(courtMap.values()).sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.count - a.count;
    });

    return {
      hourRows: rows,
      hourTotals: hCounts,
      hourRevenues: hRevs,
      dayTotals: dCounts,
      dayRevenues: dRevs,
      matrix: cellData,
      maxCellCount: maxCell,
      courtBreakdown: sortedCourts,
      activeCourtsDenominator: courtsCount,
      weekdayOccurrences: occMap,
    };
  }, [
    filteredBookings,
    bookings,
    venue,
    effectiveCourts,
    visibleCourts,
    selectedCourtIds,
    courtColorMap,
  ]);

  const { chartPoints, yAxis, linePath, areaPath } = useMemo(() => {
    const pts =
      chartAxisMode === 'hour'
        ? hourRows.map((h) => ({
            key: `h_${h}`,
            shortLabel: String(h % 24).padStart(2, '0'),
            fullLabel: `${String(h % 24).padStart(2, '0')}:00 hs`,
            count: hourTotals.get(h) || 0,
            revenue: hourRevenues.get(h) || 0,
          }))
        : DAYS_OF_WEEK.map((d) => ({
            key: `d_${d.key}`,
            shortLabel: d.label,
            fullLabel: d.full,
            count: dayTotals.get(d.key) || 0,
            revenue: dayRevenues.get(d.key) || 0,
          }));

    const maxVal = pts.reduce((m, p) => (p.count > m ? p.count : m), 0);
    const axis = computeNiceYAxis(maxVal);

    const n = pts.length;
    const coords = pts.map((p, idx) => {
      const x = n > 0 ? ((idx + 0.5) / n) * 1000 : 500;
      const ratio = axis.maxTick > 0 ? p.count / axis.maxTick : 0;
      const y = 94 - Math.min(1, Math.max(0, ratio)) * 88;
      return { x, y };
    });

    const line =
      coords.length > 0
        ? coords
            .map(
              (pt, i) =>
                `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`
            )
            .join(' ')
        : '';

    const area =
      coords.length > 0
        ? `${line} L ${coords[coords.length - 1].x.toFixed(2)} 94 L ${coords[0].x.toFixed(2)} 94 Z`
        : '';

    return {
      chartPoints: pts,
      yAxis: axis,
      linePath: line,
      areaPath: area,
    };
  }, [
    chartAxisMode,
    hourRows,
    hourTotals,
    hourRevenues,
    dayTotals,
    dayRevenues,
  ]);

  const updateActivePointFromClientX = (clientX: number) => {
    if (!chartAreaRef.current || chartPoints.length === 0) return;
    const rect = chartAreaRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = Math.min(rect.width - 0.01, Math.max(0, clientX - rect.left));
    const idx = Math.min(
      chartPoints.length - 1,
      Math.max(0, Math.floor((relX / rect.width) * chartPoints.length))
    );
    setSelectedPoint(idx);
  };

  const updateActiveCourtFromClientX = (clientX: number) => {
    if (
      !stackedBarRef.current ||
      courtBreakdown.length === 0 ||
      filteredBookings.length === 0
    ) {
      return;
    }
    const rect = stackedBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetCount = ratio * filteredBookings.length;
    let acc = 0;
    for (const item of courtBreakdown) {
      acc += item.count;
      if (targetCount <= acc) {
        setSelectedCourt(item.key);
        return;
      }
    }
    setSelectedCourt(courtBreakdown[courtBreakdown.length - 1]?.key || null);
  };

  const getCellColor = (count: number) => {
    if (count === 0 || maxCellCount === 0) {
      return 'bg-transparent text-transparent';
    }
    const ratio = count / maxCellCount;
    if (ratio <= 0.25)
      return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200';
    if (ratio <= 0.5)
      return 'bg-emerald-300 dark:bg-emerald-800/80 text-emerald-950 dark:text-white';
    if (ratio <= 0.75) return 'bg-emerald-500 text-white';
    return 'bg-[#129D44] text-white font-black';
  };

  const getCornerRadius = (rowIdx: number, colIdx: number) => {
    const isTop = rowIdx === 0;
    const isBottom = rowIdx === hourRows.length - 1;
    const isLeft = colIdx === 0;
    const isRight = colIdx === DAYS_OF_WEEK.length - 1;

    if (isTop && isLeft) return 'rounded-tl-2xl';
    if (isTop && isRight) return 'rounded-tr-2xl';
    if (isBottom && isLeft) return 'rounded-bl-2xl';
    if (isBottom && isRight) return 'rounded-br-2xl';
    return 'rounded-none';
  };

  const totalValid = filteredBookings.length;
  const activePoint =
    selectedPoint !== null && chartPoints[selectedPoint]
      ? chartPoints[selectedPoint]
      : null;

  const selectedCourtSegment = useMemo(() => {
    if (!selectedCourt || totalValid <= 0) return null;
    let accCount = 0;
    for (const item of courtBreakdown) {
      const widthPct = (item.count / totalValid) * 100;
      const centerPct = (accCount / totalValid) * 100 + widthPct / 2;
      if (item.key === selectedCourt) {
        return {
          ...item,
          pct: Math.round(widthPct),
          centerPct,
        };
      }
      accCount += item.count;
    }
    return null;
  }, [selectedCourt, courtBreakdown, totalValid]);

  const activePointLayout = useMemo(() => {
    if (
      selectedPoint === null ||
      !activePoint ||
      chartPoints.length === 0
    ) {
      return null;
    }
    const xPct = ((selectedPoint + 0.5) / chartPoints.length) * 100;
    const ratio =
      yAxis.maxTick > 0
        ? Math.min(1, Math.max(0, activePoint.count / yAxis.maxTick))
        : 0;
    const yPct = 94 - ratio * 88;

    const horizontalStyle: React.CSSProperties =
      xPct < 24
        ? { left: `${Math.max(1, xPct)}%`, transform: 'translateX(0)' }
        : xPct > 76
        ? { right: `${Math.max(1, 100 - xPct)}%`, transform: 'translateX(0)' }
        : { left: `${xPct}%`, transform: 'translateX(-50%)' };

    const verticalStyle: React.CSSProperties =
      yPct < 36
        ? { top: `${Math.min(78, yPct + 11)}%` }
        : { bottom: `${Math.min(76, 100 - yPct + 9)}%` };

    return {
      ...horizontalStyle,
      ...verticalStyle,
    };
  }, [selectedPoint, activePoint, chartPoints.length, yAxis.maxTick]);

  return (
    <div
      onClick={clearSelections}
      onTouchStart={handleSwipeTouchStart}
      onTouchMove={handleSwipeTouchMove}
      onTouchEnd={handleSwipeTouchEnd}
      onTouchCancel={handleSwipeTouchCancel}
      style={{
        transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
      }}
      className={`fixed inset-0 z-[60] bg-white dark:bg-slate-900 flex flex-col w-full h-full overflow-hidden ${
        isSwiping ? '' : 'transition-transform duration-200'
      }`}
    >
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            aria-label="Volver"
            className="p-1.5 -ml-1 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <img
            src="/Jogo-icon-green.png"
            alt="Jogo"
            className="w-14 h-14 rounded-xl object-contain shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-tight truncate">
              Análisis de Demanda
            </h3>
            <p className="text-xs text-slate-400">
              {totalValid} {totalValid === 1 ? 'reserva' : 'reservas'}
            </p>
          </div>

          <select
            value={filter}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setFilter(e.target.value as PeriodFilter);
              clearSelections();
            }}
            aria-label="Filtrar por período"
            className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#129D44]/40 cursor-pointer"
          >
            <option value="all">Todo</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="prev_week">Semana anterior</option>
            <option value="month">Este mes</option>
            <option value="prev_month">Mes anterior</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Filtros: Deporte y Canchas */}
          {(availableSports.length > 0 || visibleCourts.length > 0) && (
            <div className="space-y-3">
              {availableSports.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                    Deportes
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSports([]);
                        setSelectedCourtIds([]);
                        clearSelections();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        selectedSports.length === 0
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      Todos
                    </button>
                    {availableSports.map((sp) => {
                      const active = selectedSports.includes(sp);
                      return (
                        <button
                          key={sp}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSport(sp);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            active
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                          }`}
                        >
                          {sp}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {visibleCourts.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                    Canchas
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCourtIds([]);
                        clearSelections();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        selectedCourtIds.length === 0
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-[#129D44]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      Todas
                    </button>
                    {visibleCourts.map((c: any) => {
                      const cid = String(c.id);
                      const active = selectedCourtIds.includes(cid);
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCourt(cid);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            active
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-[#129D44]'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gráfico de Líneas Interactivo (Por horario / Por día) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Reservas
              </h4>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChartAxisMode('hour');
                    setSelectedPoint(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartAxisMode === 'hour'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  Por horario
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChartAxisMode('day');
                    setSelectedPoint(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartAxisMode === 'day'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  Por día
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex flex-col justify-between text-[10px] font-mono text-slate-400 py-1 pr-1 text-right min-w-[26px] h-36">
                {yAxis.ticks.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="flex-1 overflow-x-auto">
                <div
                  className={
                    chartAxisMode === 'hour' && chartPoints.length > 10
                      ? 'min-w-[380px]'
                      : 'w-full'
                  }
                >
                  <div
                    ref={chartAreaRef}
                    className="relative h-36 border-b border-l border-slate-200 dark:border-slate-800 touch-pan-y select-none"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      updateActivePointFromClientX(e.clientX);
                    }}
                    onTouchMove={(e) => {
                      if (e.touches[0]) {
                        updateActivePointFromClientX(e.touches[0].clientX);
                      }
                    }}
                  >
                    {/* SVG Línea y Área */}
                    <svg
                      viewBox="0 0 1000 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
                    >
                      <defs>
                        <linearGradient
                          id="demandLineAreaGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#129D44"
                            stopOpacity="0.24"
                          />
                          <stop
                            offset="100%"
                            stopColor="#129D44"
                            stopOpacity="0.01"
                          />
                        </linearGradient>
                      </defs>

                      {[0, 0.25, 0.5, 0.75, 1].map((stepRatio) => {
                        const yLine = 94 - stepRatio * 88;
                        return (
                          <line
                            key={stepRatio}
                            x1="0"
                            y1={yLine}
                            x2="1000"
                            y2={yLine}
                            stroke="currentColor"
                            className="text-slate-200/70 dark:text-slate-800/80"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}

                      {areaPath && (
                        <path d={areaPath} fill="url(#demandLineAreaGrad)" />
                      )}
                      {linePath && (
                        <path
                          d={linePath}
                          fill="none"
                          stroke="#129D44"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>

                    {/* Línea guía vertical al seleccionar/pasar sobre un punto */}
                    {selectedPoint !== null && chartPoints.length > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-[#129D44]/60 pointer-events-none"
                        style={{
                          left: `${((selectedPoint + 0.5) / chartPoints.length) * 100}%`,
                        }}
                      />
                    )}

                    {/* Puntos visibles sin deformación */}
                    {chartPoints.map((pt, idx) => {
                      const xPct =
                        chartPoints.length > 0
                          ? ((idx + 0.5) / chartPoints.length) * 100
                          : 50;
                      const ratio =
                        yAxis.maxTick > 0
                          ? Math.min(1, Math.max(0, pt.count / yAxis.maxTick))
                          : 0;
                      const yPct = 94 - ratio * 88;
                      const isActive = selectedPoint === idx;
                      return (
                        <div
                          key={`dot_${pt.key}`}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all ${
                            isActive
                              ? 'w-3.5 h-3.5 bg-[#129D44] ring-4 ring-[#129D44]/25 z-10'
                              : pt.count > 0
                              ? 'w-2 h-2 bg-[#129D44] ring-2 ring-white dark:ring-slate-900'
                              : 'w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600'
                          }`}
                          style={{ left: `${xPct}%`, top: `${yPct}%` }}
                        />
                      );
                    })}

                    {/* Mini badge flotante junto al punto seleccionado */}
                    {activePoint && activePointLayout && (
                      <div
                        className="absolute z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                        style={activePointLayout}
                      >
                        {activePoint.count}{' '}
                        {activePoint.count === 1 ? 'reserva' : 'reservas'} · $
                        {Math.round(activePoint.revenue).toLocaleString(
                          'es-AR'
                        )}
                      </div>
                    )}

                    {/* Columnas interactivas para hover/pointer/touch */}
                    <div className="absolute inset-0 flex">
                      {chartPoints.map((pt, idx) => (
                        <div
                          key={`hit_${pt.key}`}
                          onPointerEnter={() => setSelectedPoint(idx)}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedPoint(idx);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPoint(idx);
                          }}
                          className="flex-1 h-full cursor-pointer"
                          title={`${pt.fullLabel} · ${pt.count} reservas · $${Math.round(pt.revenue).toLocaleString('es-AR')}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Etiquetas Eje X */}
                  <div className="flex pt-1">
                    {chartPoints.map((pt, idx) => (
                      <div
                        key={`lbl_${pt.key}`}
                        className={`flex-1 text-center text-[10px] font-mono transition-colors ${
                          selectedPoint === idx
                            ? 'text-[#129D44] font-bold'
                            : 'text-slate-400'
                        }`}
                      >
                        {pt.shortLabel}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center text-xs font-medium text-gray-500 dark:text-slate-400 pl-7">
              {chartAxisMode === 'hour' ? 'Horario' : 'Día'}
            </div>
          </div>

          {/* Mapa de Calor: Eje Y = Horarios, Eje X = Días */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Mapa de calor
              </h4>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeatmapMode('count');
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    heatmapMode === 'count'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  #
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeatmapMode('percent');
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    heatmapMode === 'percent'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  %
                </button>
              </div>
            </div>

            <AnimatePresence>
              {selectedCell && (
                <motion.div
                  key="selected-cell-detail"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 px-2.5 py-1.5 rounded-xl whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {selectedCell.dayShort}{' '}
                  {String(selectedCell.hour).padStart(2, '0')}:00 ·{' '}
                  <span className="font-black text-[#129D44]">
                    {selectedCell.count} res
                  </span>{' '}
                  ({selectedCell.complexCount} propias · {selectedCell.jogoCount}{' '}
                  Jogo) · {selectedCell.pct}% ocup.
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-full px-1 py-1">
              <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] mb-1">
                <div className="text-[10px] font-bold text-slate-400 flex items-center justify-center">
                  Hora
                </div>
              </div>

              <div className="space-y-0">
                {hourRows.map((h, rowIdx) => {
                  const hourLabel = `${String(h % 24).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={h}
                      className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] items-center"
                    >
                      <div className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 text-left pr-0.5 whitespace-nowrap">
                        {hourLabel}
                      </div>
                      {DAYS_OF_WEEK.map((d, colIdx) => {
                        const cell = matrix.get(`${d.key}_${h}`) || {
                          total: 0,
                          jogo: 0,
                          complex: 0,
                        };
                        const occDenom =
                          (weekdayOccurrences.get(d.key) || 1) *
                          activeCourtsDenominator;
                        const pct =
                          cell.total > 0
                            ? Math.min(
                                100,
                                Math.round((cell.total / occDenom) * 100)
                              )
                            : 0;
                        const displayVal =
                          cell.total === 0
                            ? ''
                            : heatmapMode === 'percent'
                            ? `${pct}%`
                            : String(cell.total);
                        const isSelected =
                          selectedCell !== null &&
                          selectedCell.dayLabel === d.full &&
                          selectedCell.rawHour === h;

                        return (
                          <button
                            key={`${d.key}_${h}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell({
                                dayLabel: d.full,
                                dayShort: d.label,
                                hour: h % 24,
                                rawHour: h,
                                count: cell.total,
                                jogoCount: cell.jogo,
                                complexCount: cell.complex,
                                pct,
                              });
                            }}
                            className={`aspect-square w-full border-0 text-[11px] font-bold flex items-center justify-center transition-colors cursor-pointer ${getCornerRadius(
                              rowIdx,
                              colIdx
                            )} ${getCellColor(cell.total)} ${
                              isSelected
                                ? 'relative z-10 ring-2 ring-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.28)]'
                                : ''
                            }`}
                          >
                            {displayVal}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] mt-1">
                <div />
                {DAYS_OF_WEEK.map((d) => (
                  <div
                    key={d.key}
                    className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 text-center py-1"
                  >
                    {d.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Barra Única Apilada por Cancha (ordenado de mayor a menor ingreso) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-[#129D44]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Distribución por cancha
              </h4>
            </div>

            {courtBreakdown.length === 0 || totalValid === 0 ? (
              <p className="text-xs text-slate-400">
                Todavía no hay reservas registradas en este período.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 pt-6">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                    Reservas
                  </span>
                  <div className="relative flex-1">
                    {selectedCourtSegment && (
                      <div
                        className="absolute bottom-full mb-1.5 z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                        style={
                          selectedCourtSegment.centerPct < 22
                            ? {
                                left: `${Math.max(0, selectedCourtSegment.centerPct)}%`,
                                transform: 'translateX(0)',
                              }
                            : selectedCourtSegment.centerPct > 78
                            ? {
                                right: `${Math.max(0, 100 - selectedCourtSegment.centerPct)}%`,
                                transform: 'translateX(0)',
                              }
                            : {
                                left: `${selectedCourtSegment.centerPct}%`,
                                transform: 'translateX(-50%)',
                              }
                        }
                      >
                        {selectedCourtSegment.count}{' '}
                        {selectedCourtSegment.count === 1
                          ? 'reserva'
                          : 'reservas'}{' '}
                        ({selectedCourtSegment.pct}%)
                      </div>
                    )}
                    <div
                      ref={stackedBarRef}
                      onClick={(e) => e.stopPropagation()}
                      onTouchMove={(e) => {
                        e.stopPropagation();
                        if (e.touches[0]) {
                          updateActiveCourtFromClientX(e.touches[0].clientX);
                        }
                      }}
                      className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 touch-pan-y select-none"
                    >
                      {courtBreakdown.map((item) => {
                        const widthPct =
                          totalValid > 0 ? (item.count / totalValid) * 100 : 0;
                        const isDimmed =
                          selectedCourt !== null && selectedCourt !== item.key;
                        return (
                          <div
                            key={item.key}
                            onPointerEnter={() => setSelectedCourt(item.key)}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setSelectedCourt(item.key);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourt(item.key);
                            }}
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: item.color,
                            }}
                            className={`h-full transition-opacity cursor-pointer ${
                              isDimmed ? 'opacity-35' : 'opacity-100'
                            }`}
                            title={`${item.name} · ${item.count} reservas (${Math.round(widthPct)}%)`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-xs font-mono font-black text-slate-900 dark:text-white shrink-0">
                    {totalValid}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {courtBreakdown.map((item) => {
                    const isActive = selectedCourt === item.key;
                    return (
                      <div
                        key={`legend_${item.key}`}
                        onPointerEnter={() => setSelectedCourt(item.key)}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedCourt(item.key);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCourt(item.key);
                        }}
                        className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-slate-100 dark:bg-slate-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                          ${Math.round(item.revenue).toLocaleString('es-AR')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default DemandHeatmapModal;
