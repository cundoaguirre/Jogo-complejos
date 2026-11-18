import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DAYS_OF_WEEK,
  type HeatmapCellDetail,
  type HeatmapMode,
} from './demandAnalytics';

interface DemandHeatmapGridProps {
  heatmapMode: HeatmapMode;
  onChangeMode: (mode: HeatmapMode) => void;
  hourRows: number[];
  matrix: Map<string, { total: number; jogo: number; complex: number }>;
  maxCellCount: number;
  weekdayOccurrences: Map<number, number>;
  activeCourtsDenominator: number;
  selectedCell: HeatmapCellDetail | null;
  onSelectCell: (cell: HeatmapCellDetail | null) => void;
}

export const DemandHeatmapGrid: React.FC<DemandHeatmapGridProps> = ({
  heatmapMode,
  onChangeMode,
  hourRows,
  matrix,
  maxCellCount,
  weekdayOccurrences,
  activeCourtsDenominator,
  selectedCell,
  onSelectCell,
}) => {
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

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Mapa de calor
        </h4>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeMode('count');
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
              onChangeMode('percent');
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

      <div className="px-0.5 py-0.5">
        <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] items-center gap-x-0.5 mb-1.5 min-h-[26px]">
          <div className="text-[10px] font-bold text-slate-400 flex items-center justify-center">
            Hora
          </div>
          <div className="col-span-7 flex items-center min-w-0">
            <AnimatePresence mode="wait">
              {selectedCell && (
                <motion.div
                  key={`${selectedCell.dayLabel}_${selectedCell.rawHour}`}
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {selectedCell.dayLabel.slice(0, 3)}{' '}
                  {String(selectedCell.hour).padStart(2, '0')}:00 ·{' '}
                  <span className="font-black text-[#129D44]">
                    {selectedCell.count} res
                  </span>{' '}
                  ({selectedCell.complexCount} prop · {selectedCell.jogoCount}{' '}
                  Jogo) · {selectedCell.pct}% ocup.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-0">
          {hourRows.map((h, rowIdx) => {
            const hourLabel = `${String(h % 24).padStart(2, '0')}:00`;
            return (
              <div
                key={h}
                className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] items-center"
              >
                <div className="text-[10.5px] font-mono font-semibold text-slate-500 dark:text-slate-400 text-center pr-0.5 leading-none">
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
                      ? Math.min(100, Math.round((cell.total / occDenom) * 100))
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
                        onSelectCell({
                          dayLabel: d.full,
                          hour: h % 24,
                          rawHour: h,
                          count: cell.total,
                          jogoCount: cell.jogo,
                          complexCount: cell.complex,
                          pct,
                        });
                      }}
                      className={`h-6.5 w-full border-0 text-[10.5px] font-bold flex items-center justify-center transition-colors cursor-pointer ${getCornerRadius(
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

        <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] mt-1">
          <div />
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d.key}
              className="text-[10.5px] font-mono font-semibold text-slate-500 dark:text-slate-400 text-center py-0.5"
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
