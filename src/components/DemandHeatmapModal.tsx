import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Match } from '../types';
import {
  subscribeToBookings,
  subscribeToCourts,
  subscribeToVenueProfile,
} from '../lib/firestoreSync';
import {
  COURT_COLOR_PALETTE,
  computeDemandAnalytics,
  type ChartAxisMode,
  type DistributionMode,
  type HeatmapCellDetail,
  type HeatmapMode,
  type PeriodFilter,
} from './demand/demandAnalytics';
import { DemandKpiCards } from './demand/DemandKpiCards';
import { DemandLineChart } from './demand/DemandLineChart';
import { DemandHeatmapGrid } from './demand/DemandHeatmapGrid';
import { DemandDistributionCard } from './demand/DemandDistributionCard';

interface DemandHeatmapModalProps {
  onClose: () => void;
  complexId?: string;
  complexName?: string;
  bookings?: Match[];
  courts?: any[];
}

export const DemandHeatmapModal: React.FC<DemandHeatmapModalProps> = ({
  onClose,
  complexId = 'complejo_central',
  complexName = 'Complejo',
  bookings: propBookings,
  courts: propCourts,
}) => {
  const [filter, setFilter] = useState<PeriodFilter>('all');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('count');
  const [chartAxisMode, setChartAxisMode] = useState<ChartAxisMode>('hour');
  const [distributionMode, setDistributionMode] =
    useState<DistributionMode>('courts');
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedCourtKey, setSelectedCourtKey] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatmapCellDetail | null>(
    null
  );

  const [venue, setVenue] = useState<any>(null);
  const [subBookings, setSubBookings] = useState<Match[]>([]);
  const [subCourts, setSubCourts] = useState<any[]>([]);

  const swipeRef = useRef({ active: false, startX: 0, startY: 0, lastDx: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const hasBookingsProp = propBookings !== undefined;
  const hasCourtsProp = propCourts !== undefined;

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
    setSelectedCourtKey(null);
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
      swipeRef.current = { active: false, startX: 0, startY: 0, lastDx: 0 };
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  };

  const handleSwipeTouchEnd = () => {
    if (!swipeRef.current.active) return;
    const finalDx = swipeRef.current.lastDx;
    swipeRef.current = { active: false, startX: 0, startY: 0, lastDx: 0 };
    setIsSwiping(false);
    if (finalDx >= 80) onClose();
    else setSwipeOffset(0);
  };

  const effectiveCourts = useMemo(() => {
    const fromSub = Array.isArray(courts) ? courts : [];
    const fromVenue = Array.isArray(venue?.courts) ? venue.courts : [];
    return fromSub.length > 0 ? fromSub : fromVenue;
  }, [courts, venue]);

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

  const availableSports = useMemo(() => {
    const set = new Set<string>();
    effectiveCourts.forEach((c: any) => {
      const sp = String(c?.sport || c?.deporte || c?.type || '').trim();
      if (sp) set.add(sp);
    });
    return Array.from(set);
  }, [effectiveCourts]);

  const visibleCourts = useMemo(() => {
    if (selectedSports.length === 0) return effectiveCourts;
    return effectiveCourts.filter((c: any) =>
      selectedSports.includes(
        String(c?.sport || c?.deporte || c?.type || '').trim()
      )
    );
  }, [effectiveCourts, selectedSports]);

  const analytics = useMemo(
    () =>
      computeDemandAnalytics({
        bookings,
        effectiveCourts,
        visibleCourts,
        venue,
        filter,
        selectedSports,
        selectedCourtIds,
        courtColorMap,
        complexName,
      }),
    [
      bookings,
      effectiveCourts,
      visibleCourts,
      venue,
      filter,
      selectedSports,
      selectedCourtIds,
      courtColorMap,
      complexName,
    ]
  );

  return (
    <div
      onClick={clearSelections}
      onTouchStart={handleSwipeTouchStart}
      onTouchMove={handleSwipeTouchMove}
      onTouchEnd={handleSwipeTouchEnd}
      onTouchCancel={handleSwipeTouchEnd}
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
              onClose();
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
          <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-tight truncate">
            Análisis de Demanda
          </h3>

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
                          clearSelections();
                          setSelectedSports((prev) =>
                            prev.includes(sp)
                              ? prev.filter((s) => s !== sp)
                              : [...prev, sp]
                          );
                          setSelectedCourtIds([]);
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
                          clearSelections();
                          setSelectedCourtIds((prev) =>
                            prev.includes(cid)
                              ? prev.filter((id) => id !== cid)
                              : [...prev, cid]
                          );
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

        <DemandKpiCards kpis={analytics.kpis} />

        <DemandLineChart
          chartAxisMode={chartAxisMode}
          onChangeAxisMode={setChartAxisMode}
          hourRows={analytics.hourRows}
          hourTotals={analytics.hourTotals}
          hourRevenues={analytics.hourRevenues}
          dayTotals={analytics.dayTotals}
          dayRevenues={analytics.dayRevenues}
          selectedPoint={selectedPoint}
          onSelectPoint={setSelectedPoint}
        />

        <DemandHeatmapGrid
          heatmapMode={heatmapMode}
          onChangeMode={setHeatmapMode}
          hourRows={analytics.hourRows}
          matrix={analytics.matrix}
          maxCellCount={analytics.maxCellCount}
          weekdayOccurrences={analytics.weekdayOccurrences}
          activeCourtsDenominator={analytics.activeCourtsDenominator}
          selectedCell={selectedCell}
          onSelectCell={setSelectedCell}
        />

        <DemandDistributionCard
          mode={distributionMode}
          onChangeMode={setDistributionMode}
          courtBreakdown={analytics.courtBreakdown}
          originBreakdown={analytics.originBreakdown}
          totalValid={analytics.kpis.validCount}
          selectedKey={selectedCourtKey}
          onSelectKey={setSelectedCourtKey}
        />
      </div>
    </div>
  );
};

export default DemandHeatmapModal;
