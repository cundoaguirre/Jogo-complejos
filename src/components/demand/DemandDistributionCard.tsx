import React, { useMemo, useRef } from 'react';
import { Trophy } from 'lucide-react';
import type { BreakdownItem, DistributionMode } from './demandAnalytics';

interface DemandDistributionCardProps {
  mode: DistributionMode;
  onChangeMode: (mode: DistributionMode) => void;
  courtBreakdown: BreakdownItem[];
  originBreakdown: BreakdownItem[];
  totalValid: number;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
}

export const DemandDistributionCard: React.FC<DemandDistributionCardProps> = ({
  mode,
  onChangeMode,
  courtBreakdown,
  originBreakdown,
  totalValid,
  selectedKey,
  onSelectKey,
}) => {
  const stackedBarRef = useRef<HTMLDivElement>(null);
  const items = mode === 'courts' ? courtBreakdown : originBreakdown;

  const selectedSegment = useMemo(() => {
    if (!selectedKey || totalValid <= 0) return null;
    let accCount = 0;
    for (const item of items) {
      const widthPct = (item.count / totalValid) * 100;
      const centerPct = (accCount / totalValid) * 100 + widthPct / 2;
      if (item.key === selectedKey) {
        return {
          ...item,
          pct: Math.round(widthPct),
          centerPct,
        };
      }
      accCount += item.count;
    }
    return null;
  }, [selectedKey, items, totalValid]);

  const updateActiveFromClientX = (clientX: number) => {
    if (!stackedBarRef.current || items.length === 0 || totalValid <= 0) {
      return;
    }
    const rect = stackedBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetCount = ratio * totalValid;
    let acc = 0;
    for (const item of items) {
      acc += item.count;
      if (targetCount <= acc) {
        onSelectKey(item.key);
        return;
      }
    }
    onSelectKey(items[items.length - 1]?.key || null);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[#129D44]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {mode === 'courts' ? 'Distribución por cancha' : 'Proveniente de'}
          </h4>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeMode('courts');
              onSelectKey(null);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              mode === 'courts'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500'
            }`}
          >
            Canchas
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeMode('origin');
              onSelectKey(null);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              mode === 'origin'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500'
            }`}
          >
            Origen
          </button>
        </div>
      </div>

      {items.length === 0 || totalValid === 0 ? (
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
              {selectedSegment && (
                <div
                  className="absolute bottom-full mb-1.5 z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                  style={
                    selectedSegment.centerPct < 22
                      ? {
                          left: `${Math.max(0, selectedSegment.centerPct)}%`,
                          transform: 'translateX(0)',
                        }
                      : selectedSegment.centerPct > 78
                      ? {
                          right: `${Math.max(0, 100 - selectedSegment.centerPct)}%`,
                          transform: 'translateX(0)',
                        }
                      : {
                          left: `${selectedSegment.centerPct}%`,
                          transform: 'translateX(-50%)',
                        }
                  }
                >
                  {selectedSegment.count}{' '}
                  {selectedSegment.count === 1 ? 'reserva' : 'reservas'} (
                  {selectedSegment.pct}%)
                </div>
              )}
              <div
                ref={stackedBarRef}
                onClick={(e) => e.stopPropagation()}
                onTouchMove={(e) => {
                  e.stopPropagation();
                  if (e.touches[0]) {
                    updateActiveFromClientX(e.touches[0].clientX);
                  }
                }}
                className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 touch-pan-y select-none"
              >
                {items.map((item) => {
                  const widthPct =
                    totalValid > 0 ? (item.count / totalValid) * 100 : 0;
                  const isDimmed =
                    selectedKey !== null && selectedKey !== item.key;
                  return (
                    <div
                      key={item.key}
                      onPointerEnter={() => onSelectKey(item.key)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectKey(item.key);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectKey(item.key);
                      }}
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: item.color,
                      }}
                      className={`h-full transition-opacity cursor-pointer ${
                        isDimmed ? 'opacity-35' : 'opacity-100'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <span className="text-xs font-mono font-black text-slate-900 dark:text-white shrink-0">
              {totalValid}
            </span>
          </div>

          {mode === 'origin' ? (
            <div className="flex items-center justify-between gap-2">
              {items.map((item, idx) => {
                const isActive = selectedKey === item.key;
                return (
                  <button
                    key={`origin_${item.key}`}
                    type="button"
                    onPointerEnter={() => onSelectKey(item.key)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectKey(item.key);
                    }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer min-w-0 ${
                      idx === 1 ? 'justify-end' : 'justify-start'
                    } ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {item.name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                      ${Math.round(item.revenue).toLocaleString('es-AR')}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const isActive = selectedKey === item.key;
                return (
                  <div
                    key={`legend_${item.key}`}
                    onPointerEnter={() => onSelectKey(item.key)}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectKey(item.key);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectKey(item.key);
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
          )}
        </div>
      )}
    </div>
  );
};
