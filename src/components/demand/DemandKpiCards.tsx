import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DemandKpis } from './demandAnalytics';

interface DemandKpiCardsProps {
  kpis: DemandKpis;
  activeStatusBadge: 'played' | 'cancelled' | null;
  onSelectStatusBadge: (status: 'played' | 'cancelled' | null) => void;
}

export const DemandKpiCards: React.FC<DemandKpiCardsProps> = ({
  kpis,
  activeStatusBadge,
  onSelectStatusBadge,
}) => {
  const total = kpis.totalReservations;
  const playedPct = total > 0 ? Math.round((kpis.playedCount / total) * 100) : 0;
  const cancelledPct =
    total > 0 ? Math.round((kpis.cancelledCount / total) * 100) : 0;

  return (
    <div className="space-y-2.5 pt-2 overflow-visible">
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 overflow-visible">
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700/80 text-center overflow-visible">
          <div className="px-1">
            <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              {kpis.totalReservations}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Reservas
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectStatusBadge(
                activeStatusBadge === 'played' ? null : 'played'
              );
            }}
            className={`relative overflow-visible px-1 cursor-pointer transition-opacity ${
              activeStatusBadge === 'cancelled' ? 'opacity-50' : 'opacity-100'
            }`}
          >
            <AnimatePresence>
              {activeStatusBadge === 'played' && (
                <motion.div
                  key="played-pct-badge"
                  initial={{ opacity: 0, y: 4, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.94 }}
                  transition={{ duration: 0.16 }}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                >
                  {playedPct}%
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-lg font-black text-[#129D44] leading-tight">
              {kpis.playedCount}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Jugados
            </p>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectStatusBadge(
                activeStatusBadge === 'cancelled' ? null : 'cancelled'
              );
            }}
            className={`relative overflow-visible px-1 cursor-pointer transition-opacity ${
              activeStatusBadge === 'played' ? 'opacity-50' : 'opacity-100'
            }`}
          >
            <AnimatePresence>
              {activeStatusBadge === 'cancelled' && (
                <motion.div
                  key="cancelled-pct-badge"
                  initial={{ opacity: 0, y: 4, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.94 }}
                  transition={{ duration: 0.16 }}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold shadow-md whitespace-nowrap"
                >
                  {cancelledPct}%
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-lg font-black text-rose-500 leading-tight">
              {kpis.cancelledCount}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Cancelados
            </p>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 flex flex-col items-center justify-center text-center">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Ticket promedio por reserva
          </p>
          <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">
            ${Math.round(kpis.avgTicket).toLocaleString('es-AR')}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            en {kpis.validCount}{' '}
            {kpis.validCount === 1 ? 'reserva' : 'reservas'}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 flex flex-col items-center justify-center text-center">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Jugadores únicos
          </p>
          <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">
            {kpis.uniquePlayersCount}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            con {kpis.validCount}{' '}
            {kpis.validCount === 1 ? 'reserva' : 'reservas'}
          </p>
        </div>
      </div>
    </div>
  );
};
