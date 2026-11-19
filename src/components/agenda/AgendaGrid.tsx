import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { User as UserIcon } from 'lucide-react';
import type { Match } from '../../types';
import {
  areCourtsMutuallyBlocked,
  computeEndTime,
  getCourtDefaultDuration,
  intervalsOverlap,
  timeStringToMinutes,
} from '../../lib/scheduleUtils';

interface AgendaGridProps {
  timeSlots: number[];
  slotHeight: number;
  displayedCourts: any[];
  courts: any[];
  matches: Match[];
  selectedDateStr: string;
  currentTime: Date;
  currentTimePos: number | null;
  getMatchHostDisplayName: (match: Match) => string;
  onMatchClick: (match: Match) => void;
  onNewBooking: (prefill: any) => void;
}

function resolveBookingWindow(
  m: Match,
  firstSlotHour: number
): { startMin: number; endMin: number; durationMin: number; startTimeStr: string } | null {
  const startTimeStr =
    m.startTime ||
    (m.start_time && String(m.start_time).includes('T')
      ? String(m.start_time).split('T')[1].substring(0, 5)
      : '');
  if (!startTimeStr) return null;

  let startMin = timeStringToMinutes(startTimeStr);
  const rawHour = Math.floor(startMin / 60);
  if (rawHour <= 4 && firstSlotHour > 4) {
    startMin += 24 * 60;
  }

  let durationMin = Number((m as any).durationMinutes || 0);
  if (!durationMin || durationMin <= 0) {
    const endTimeStr =
      m.endTime ||
      (m.end_time && String(m.end_time).includes('T')
        ? String(m.end_time).split('T')[1].substring(0, 5)
        : '');
    if (endTimeStr) {
      let parsedEnd = timeStringToMinutes(endTimeStr);
      if (parsedEnd <= startMin) parsedEnd += 24 * 60;
      durationMin = Math.max(30, parsedEnd - startMin);
    } else {
      durationMin = 60;
    }
  }

  return {
    startMin,
    endMin: startMin + durationMin,
    durationMin,
    startTimeStr,
  };
}

export const AgendaGrid: React.FC<AgendaGridProps> = ({
  timeSlots,
  slotHeight,
  displayedCourts,
  courts,
  matches,
  selectedDateStr,
  currentTime,
  currentTimePos,
  getMatchHostDisplayName,
  onMatchClick,
  onNewBooking,
}) => {
  const firstSlotHour = timeSlots[0] ?? 14;
  const totalHeightPx = timeSlots.length * slotHeight;
  const isNarrowLayout = displayedCourts.length >= 3;

  const dayActiveMatches = useMemo(() => {
    return (matches || []).filter((m) => {
      if (!m) return false;
      const st = String(m.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelled') return false;
      const matchDateStr =
        m.date || (m.start_time ? String(m.start_time).split('T')[0] : '');
      return matchDateStr === selectedDateStr;
    });
  }, [matches, selectedDateStr]);

  // Marcas :30 en el eje izquierdo si alguna reserva del día empieza a media hora
  const halfHourMarkers = useMemo(() => {
    const map = new Map<number, string>();
    dayActiveMatches.forEach((m) => {
      const win = resolveBookingWindow(m, firstSlotHour);
      if (!win) return;
      if (win.startMin % 60 === 30) {
        const hh = String(Math.floor(win.startMin / 60) % 24).padStart(2, '0');
        map.set(win.startMin, `${hh}:30`);
      }
    });
    return Array.from(map.entries()).map(([min, label]) => ({
      min,
      label,
      topPx: ((min - firstSlotHour * 60) / 60) * slotHeight,
    }));
  }, [dayActiveMatches, firstSlotHour, slotHeight]);

  const getMatchesForCourt = (court: any) => {
    return dayActiveMatches.filter((m) => {
      const cid = String(m.court_id ?? (m as any).courtId ?? '');
      return (
        cid === String(court.id) ||
        (court.name && (m.court_name === court.name || m.courtName === court.name))
      );
    });
  };

  const getBlockingMatchesForCourt = (court: any) => {
    return dayActiveMatches.filter((m) => {
      const otherCourtId = (m as any).courtId || m.court_id;
      return areCourtsMutuallyBlocked(court.id, otherCourtId, courts);
    });
  };

  const resolveEmptySlotStart = (court: any, rawHour: number): string => {
    const baseMin = rawHour * 60;
    const relevant = [
      ...getMatchesForCourt(court),
      ...getBlockingMatchesForCourt(court),
    ];

    const isMinuteRangeOccupied = (startMin: number, endMin: number) =>
      relevant.some((m) => {
        const win = resolveBookingWindow(m, firstSlotHour);
        return win ? intervalsOverlap(startMin, endMin, win.startMin, win.endMin) : false;
      });

    if (!isMinuteRangeOccupied(baseMin, baseMin + 30)) {
      const hh = String(rawHour % 24).padStart(2, '0');
      return `${hh}:00`;
    }
    if (!isMinuteRangeOccupied(baseMin + 30, baseMin + 60)) {
      const hh = String(rawHour % 24).padStart(2, '0');
      return `${hh}:30`;
    }
    const hh = String(rawHour % 24).padStart(2, '0');
    return `${hh}:00`;
  };

  return (
    <div className="relative">
      <div className="flex items-center pb-2">
        <div className="w-14 shrink-0" />
        <div className="flex-1 flex gap-2">
          {displayedCourts.map((c) => (
            <div
              key={`col-header-${c.id}`}
              className="flex-1 text-center text-sm font-medium text-gray-600 dark:text-slate-300 truncate"
            >
              {c.name}
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex">
        <div className="w-14 shrink-0 relative" style={{ height: `${totalHeightPx}px` }}>
          {timeSlots.map((rawHour, i) => {
            const hourLabel =
              rawHour === 24
                ? '00:00'
                : `${String(rawHour % 24).padStart(2, '0')}:00`;
            return (
              <div
                key={`hour-slot-lbl-${rawHour}-${i}`}
                className="absolute left-0 -translate-y-1/2 text-xs font-medium text-gray-400 dark:text-slate-400 font-sans select-none"
                style={{ top: `${i * slotHeight}px` }}
              >
                {hourLabel}
              </div>
            );
          })}

          {halfHourMarkers.map((mk) => (
            <div
              key={`half-lbl-${mk.min}`}
              className="absolute left-0 -translate-y-1/2 text-[10px] font-semibold text-blue-500 dark:text-blue-400 font-sans select-none"
              style={{ top: `${mk.topPx}px` }}
            >
              {mk.label}
            </div>
          ))}

          {timeSlots.length > 0 && (() => {
            const lastHour = timeSlots[timeSlots.length - 1];
            const closingHour = (lastHour + 1) % 24;
            const closingLabel = `${String(closingHour).padStart(2, '0')}:00`;
            return (
              <div
                key="hour-slot-lbl-closing"
                className="absolute left-0 -translate-y-1/2 text-xs font-medium text-gray-400 dark:text-slate-400 font-sans select-none"
                style={{ top: `${totalHeightPx}px` }}
              >
                {closingLabel}
              </div>
            );
          })()}
        </div>

        <div className="flex-1 relative">
          {currentTimePos !== null && (
            <div
              className="absolute -left-14 right-0 z-20 flex items-center pointer-events-none -translate-y-1/2"
              style={{ top: `${currentTimePos}px` }}
            >
              <div className="w-14 shrink-0 text-left pl-0 text-[10px] font-semibold text-red-500">
                {format(currentTime, 'HH:mm')}
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
              <div className="flex-1 h-[1.5px] bg-red-500" />
            </div>
          )}

          {/* Fondo de grilla fijo de 1 hora en 1 hora */}
          <div className="flex flex-col">
            {timeSlots.map((rawHour, hIdx) => (
              <div
                key={`grid-slot-row-${rawHour}-${hIdx}`}
                className="flex items-stretch gap-2 py-1"
                style={{ height: `${slotHeight}px` }}
              >
                {displayedCourts.map((court) => (
                  <div
                    key={`grid-cell-${court.id}-${rawHour}`}
                    onClick={() => {
                      const suggestedStart = resolveEmptySlotStart(court, rawHour);
                      const dur = getCourtDefaultDuration(court);
                      onNewBooking({
                        court_id: court.id,
                        courtId: court.id,
                        courtName: court.name,
                        date: selectedDateStr,
                        startTime: suggestedStart,
                        time: suggestedStart,
                        endTime: computeEndTime(suggestedStart, dur),
                        durationMinutes: dur,
                        isPrefilledFromSlot: true,
                      });
                    }}
                    className="flex-1 h-full min-w-0 rounded-2xl bg-[#eeeeef] dark:bg-slate-800/70 hover:bg-gray-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title={`Tocar para reservar ${court.name}`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Capa flotante de reservas y bloqueos posicionados por minuto real */}
          <div
            className="absolute inset-0 flex gap-2 pointer-events-none z-10"
            style={{ height: `${totalHeightPx}px` }}
          >
            {displayedCourts.map((court) => {
              const courtMatches = getMatchesForCourt(court);
              const courtBlockings = getBlockingMatchesForCourt(court);

              return (
                <div key={`overlay-col-${court.id}`} className="flex-1 relative h-full min-w-0">
                  {courtBlockings.map((bm) => {
                    const win = resolveBookingWindow(bm, firstSlotHour);
                    if (!win) return null;
                    const topPx = ((win.startMin - firstSlotHour * 60) / 60) * slotHeight + 4;
                    const heightPx = Math.max(22, (win.durationMin / 60) * slotHeight - 8);
                    return (
                      <div
                        key={`block_${court.id}_${bm.id}`}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        className="absolute left-0 right-0 rounded-2xl bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-center px-2 text-center select-none cursor-not-allowed pointer-events-auto"
                        title={`Bloqueada por turno confirmado en ${bm.courtName || bm.court_name || 'cancha superpuesta'}`}
                      >
                        <span className="text-[10px] sm:text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                          Bloqueada ({bm.courtName || bm.court_name || 'Superpuesta'})
                        </span>
                      </div>
                    );
                  })}

                  {courtMatches.map((match) => {
                    const win = resolveBookingWindow(match, firstSlotHour);
                    if (!win) return null;
                    const topPx = ((win.startMin - firstSlotHour * 60) / 60) * slotHeight + 4;
                    const heightPx = Math.max(22, (win.durationMin / 60) * slotHeight - 8);

                    const totalPrice = Number((match as any).price_total ?? match.price ?? 0);
                    const paidAmount =
                      match.payment_status === 'paid'
                        ? totalPrice
                        : Number((match as any).amount_paid ?? match.deposit ?? 0);
                    const isFullyPaid =
                      (totalPrice > 0 && paidAmount >= totalPrice) ||
                      match.payment_status === 'paid' ||
                      (match as any).paymentStatus === 'pagado';
                    const isCompact = isNarrowLayout || win.durationMin <= 30;

                    return (
                      <div
                        key={`card_${court.id}_${match.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onMatchClick(match);
                        }}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        className={`absolute left-0 right-0 rounded-2xl cursor-pointer transition-all hover:shadow-xs overflow-hidden select-none pointer-events-auto ${
                          isFullyPaid
                            ? 'bg-emerald-50/90 dark:bg-emerald-950/65 border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-red-50/90 dark:bg-red-950/65 border border-red-200/80 dark:border-red-900/60 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {isCompact ? (
                          <div className="flex items-center justify-between gap-1 px-2.5 h-full w-full leading-none min-w-0">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <UserIcon size={11} className="shrink-0 opacity-80" />
                              <span className="truncate text-[10px] sm:text-[11px] font-medium">
                                {getMatchHostDisplayName(match)}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold shrink-0 whitespace-nowrap">
                              ${paidAmount.toLocaleString('es-AR')}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 px-3.5 h-full w-full min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                              <UserIcon size={14} className="shrink-0 opacity-80" />
                              <span className="truncate font-medium text-xs sm:text-sm">
                                {getMatchHostDisplayName(match)}
                              </span>
                            </div>
                            <span className="font-semibold text-xs sm:text-sm shrink-0 whitespace-nowrap">
                              ${paidAmount.toLocaleString('es-AR')}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
