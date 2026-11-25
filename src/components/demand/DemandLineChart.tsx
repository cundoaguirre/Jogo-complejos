import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DAYS_OF_WEEK,
  computeNiceYAxis,
  type ChartAxisMode,
  type ChartPoint,
} from './demandAnalytics';

interface DemandLineChartProps {
  chartAxisMode: ChartAxisMode;
  onChangeAxisMode: (mode: ChartAxisMode) => void;
  hourRows: number[];
  hourTotals: Map<number, number>;
  hourRevenues: Map<number, number>;
  dayTotals: Map<number, number>;
  dayRevenues: Map<number, number>;
  selectedPoint: number | null;
  onSelectPoint: (idx: number | null) => void;
}

export const DemandLineChart: React.FC<DemandLineChartProps> = ({
  chartAxisMode,
  onChangeAxisMode,
  hourRows,
  hourTotals,
  hourRevenues,
  dayTotals,
  dayRevenues,
  selectedPoint,
  onSelectPoint,
}) => {
  const [zoomScale, setZoomScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(340);
  const zoomScaleRef = useRef(1);
  zoomScaleRef.current = zoomScale;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    focalRatio: number;
  }>({
    active: false,
    startDist: 0,
    startScale: 1,
    focalRatio: 0.5,
  });

  useLayoutEffect(() => {
    if (pendingScrollLeftRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = pendingScrollLeftRef.current;
      pendingScrollLeftRef.current = null;
    }
  }, [zoomScale]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateWidth);
      ro.observe(el);
    }

    const handleNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchmove', handleNativeTouchMove);
      ro?.disconnect();
    };
  }, []);

  const hourPointCount =
    chartAxisMode === 'hour' ? hourRows.length * 2 : DAYS_OF_WEEK.length;

  const maxZoom = useMemo(() => {
    if (chartAxisMode !== 'hour' || hourPointCount === 0) return 3.5;
    const minNeededForHalfHours =
      (hourPointCount * 32) / Math.max(260, containerWidth);
    return Math.max(4, Math.min(5, minNeededForHalfHours + 0.75));
  }, [chartAxisMode, hourPointCount, containerWidth]);

  const slotPixelWidth =
    hourPointCount > 0 ? (containerWidth * zoomScale) / hourPointCount : 40;
  const showHalfHourLabels =
    chartAxisMode === 'hour' && zoomScale >= 2.2 && slotPixelWidth >= 28;

  const { chartPoints, yAxis, linePath, areaPath } = useMemo(() => {
    const pts: ChartPoint[] =
      chartAxisMode === 'hour'
        ? hourRows
            .flatMap((h) => [h, h + 0.5])
            .map((slot) => {
              const wholeH = Math.floor(slot) % 24;
              const isHalf = slot % 1 >= 0.5;
              const mins = isHalf ? '30' : '00';
              const shortLabel = showHalfHourLabels
                ? `${wholeH}:${mins}`
                : isHalf
                ? ''
                : String(wholeH);
              return {
                key: `h_${slot}`,
                shortLabel,
                fullLabel: `${String(wholeH).padStart(2, '0')}:${mins} hs`,
                count: hourTotals.get(slot) || 0,
                revenue: hourRevenues.get(slot) || 0,
              };
            })
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

    return { chartPoints: pts, yAxis: axis, linePath: line, areaPath: area };
  }, [
    chartAxisMode,
    hourRows,
    hourTotals,
    hourRevenues,
    dayTotals,
    dayRevenues,
    showHalfHourLabels,
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
    onSelectPoint(idx);
  };

  const initPinchGesture = (
    t0: React.Touch,
    t1: React.Touch,
    dist: number
  ) => {
    const scrollEl = scrollContainerRef.current;
    const midClientX = (t0.clientX + t1.clientX) / 2;
    let focalRatio = 0.5;
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      const midInViewport = midClientX - rect.left;
      focalRatio =
        (scrollEl.scrollLeft + midInViewport) /
        Math.max(1, rect.width * zoomScaleRef.current);
    }
    pinchRef.current = {
      active: true,
      startDist: dist,
      startScale: zoomScaleRef.current,
      focalRatio,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (chartAxisMode === 'hour' && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      initPinchGesture(e.touches[0], e.touches[1], dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (chartAxisMode === 'hour' && e.touches.length === 2) {
      const currentDist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      if (!pinchRef.current.active || pinchRef.current.startDist <= 0) {
        initPinchGesture(e.touches[0], e.touches[1], currentDist);
        return;
      }
      const nextScale = Math.min(
        maxZoom,
        Math.max(
          1,
          pinchRef.current.startScale * (currentDist / pinchRef.current.startDist)
        )
      );
      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        const midInViewport =
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        pendingScrollLeftRef.current = Math.max(
          0,
          pinchRef.current.focalRatio * (rect.width * nextScale) - midInViewport
        );
      }
      setZoomScale(nextScale);
      return;
    }

    if (e.touches.length === 1 && !pinchRef.current.active && zoomScaleRef.current <= 1) {
      updateActivePointFromClientX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      pinchRef.current.active = false;
    }
  };

  const activePoint =
    selectedPoint !== null && chartPoints[selectedPoint]
      ? chartPoints[selectedPoint]
      : null;

  const activePointLayout = useMemo(() => {
    if (selectedPoint === null || !activePoint || chartPoints.length === 0) {
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

    return { ...horizontalStyle, ...verticalStyle };
  }, [selectedPoint, activePoint, chartPoints.length, yAxis.maxTick]);

  return (
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
              onChangeAxisMode('hour');
              onSelectPoint(null);
              setZoomScale(1);
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
              onChangeAxisMode('day');
              onSelectPoint(null);
              setZoomScale(1);
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
        <div
          ref={scrollContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="flex-1 overflow-x-auto touch-pan-x touch-pan-y"
        >
          <div style={{ width: `${zoomScale * 100}%` }}>
            <div
              ref={chartAreaRef}
              className="relative h-36 border-b border-l border-slate-200 dark:border-slate-800 touch-pan-x touch-pan-y select-none"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                if (pinchRef.current.active) return;
                e.stopPropagation();
                updateActivePointFromClientX(e.clientX);
              }}
            >
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
                    <stop offset="0%" stopColor="#129D44" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#129D44" stopOpacity="0.01" />
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

              {selectedPoint !== null && chartPoints.length > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#129D44]/60 pointer-events-none"
                  style={{
                    left: `${((selectedPoint + 0.5) / chartPoints.length) * 100}%`,
                  }}
                />
              )}

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

              {activePoint && activePointLayout && (
                <div
                  className="absolute z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                  style={activePointLayout}
                >
                  {chartAxisMode === 'hour' ? `${activePoint.fullLabel} · ` : ''}
                  {activePoint.count}{' '}
                  {activePoint.count === 1 ? 'reserva' : 'reservas'} · $
                  {Math.round(activePoint.revenue).toLocaleString('es-AR')}
                </div>
              )}

              <div className="absolute inset-0 flex">
                {chartPoints.map((pt, idx) => (
                  <div
                    key={`hit_${pt.key}`}
                    onPointerEnter={() => {
                      if (!pinchRef.current.active) onSelectPoint(idx);
                    }}
                    onPointerDown={(e) => {
                      if (pinchRef.current.active) return;
                      e.stopPropagation();
                      onSelectPoint(idx);
                    }}
                    onClick={(e) => {
                      if (pinchRef.current.active) return;
                      e.stopPropagation();
                      onSelectPoint(idx);
                    }}
                    className="flex-1 h-full cursor-pointer"
                    title={`${pt.fullLabel} · ${pt.count} reservas · $${Math.round(pt.revenue).toLocaleString('es-AR')}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex pt-1">
              {chartPoints.map((pt, idx) => (
                <div
                  key={`lbl_${pt.key}`}
                  className={`flex-1 min-w-0 text-center font-mono whitespace-nowrap transition-colors ${
                    showHalfHourLabels ? 'text-[9px]' : 'text-[10px]'
                  } ${
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
  );
};
