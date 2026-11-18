import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DemandKpis } from './demandAnalytics';

interface DemandKpiCardsProps {
  kpis: DemandKpis;
}

export const DemandKpiCards: React.FC<DemandKpiCardsProps> = ({ kpis }) => {
  const [activeStatusBadge, setActiveStatusBadge] = useState<
    'played' | 'cancelled' | null
  >(null);

  const total = kpis.totalReservations;
  const activeCount =
    activeStatusBadge === 'played' ? kpis.playedCount : kpis.cancelledCount;
  const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;

  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 space-y-1.5">
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700/80 text-center">
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
              setActiveStatusBadge((prev) =>
                prev === 'played' ? null : 'played'
              );
            }}
            className={`px-1 cursor-pointer transition-opacity ${
              activeStatusBadge === 'cancelled' ? 'opacity-50' : 'opacity-100'
            }`}
          >
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
              setActiveStatusBadge((prev) =>
                prev === 'cancelled' ? null : 'cancelled'
              );
            }}
            className={`px-1 cursor-pointer transition-opacity ${
              activeStatusBadge === 'played' ? 'opacity-50' : 'opacity-100'
            }`}
          >
            <p className="text-lg font-black text-rose-500 leading-tight">
              {kpis.cancelledCount}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Cancelados
            </p>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeStatusBadge && (
            <motion.div
              key={activeStatusBadge}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="text-center text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900/70 rounded-xl py-1 px-2 shadow-2xs"
            >
              {activeStatusBadge === 'played' ? 'Jugados' : 'Cancelados'}:{' '}
              <span
                className={
                  activeStatusBadge === 'played'
                    ? 'text-[#129D44]'
                    : 'text-rose-500'
                }
              >
                {activePct}%
              </span>{' '}
              del total ({activeCount} de {total})
            </motion.div>
          )}
        </AnimatePresence>
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
