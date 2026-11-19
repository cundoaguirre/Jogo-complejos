import React from 'react';
import {
  Calendar,
  ChevronRight,
  Search,
  Check,
  FileText,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { StartTimeStaggeredPicker } from './StartTimeStaggeredPicker';
import { DurationSelector } from './DurationSelector';
import { getCourtPriceForDuration } from '../../lib/scheduleUtils';

interface BookingStepOneFormProps {
  data: any;
  setData: React.Dispatch<React.SetStateAction<any>>;
  courts: any[];
  selectedCourt: any;
  priceTotal: number;
  selectedDuration: number;
  selectedUserName: string;
  isSelectUserOpen: boolean;
  setIsSelectUserOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userSearch: string;
  setUserSearch: (val: string) => void;
  userSearchInputRef: React.RefObject<HTMLInputElement | null>;
  filteredUsers: any[];
  onOpenNewUser: () => void;
  allHalfHourSlots: string[];
  displayHours: string[];
  isCourtOccupiedForTime: (courtId: string | number) => boolean;
  onCourtChange: (newCourtId: string) => void;
  errorMessage: string | null;
}

export const BookingStepOneForm: React.FC<BookingStepOneFormProps> = ({
  data,
  setData,
  courts,
  selectedCourt,
  priceTotal,
  selectedDuration,
  selectedUserName,
  isSelectUserOpen,
  setIsSelectUserOpen,
  userSearch,
  setUserSearch,
  userSearchInputRef,
  filteredUsers,
  onOpenNewUser,
  allHalfHourSlots,
  displayHours,
  isCourtOccupiedForTime,
  onCourtChange,
  errorMessage,
}) => {
  const formatDisplayDate = (ymd: string) => {
    if (!ymd) return 'Elige fecha';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${String(d).padStart(2, '0')} ${months[m - 1] || ''}, ${y}`;
  };

  return (
    <div
      onClick={() => {
        if (isSelectUserOpen) {
          setIsSelectUserOpen(false);
        }
        userSearchInputRef.current?.blur();
      }}
      className="space-y-3.5 p-4 sm:p-5 pt-3.5 overflow-y-auto flex-1 text-xs sm:text-sm"
    >
      {/* Fila 1: Jugador * + Canchas * */}
      <div className="grid grid-cols-2 gap-3 items-start">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
              Jugador *
            </label>
            <button
              type="button"
              onClick={() => {
                setIsSelectUserOpen(false);
                userSearchInputRef.current?.blur();
                onOpenNewUser();
              }}
              className="text-xs font-bold text-[#0f9d42] hover:underline cursor-pointer shrink-0"
            >
              + Nuevo cliente
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !isSelectUserOpen;
              setIsSelectUserOpen(next);
              if (next) setTimeout(() => userSearchInputRef.current?.focus(), 80);
            }}
            className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 rounded-2xl shadow-2xs text-left flex justify-between items-center focus:ring-2 focus:ring-[#0f9d42] outline-none cursor-pointer"
          >
            <span
              className={
                selectedUserName
                  ? 'text-slate-900 dark:text-white font-medium truncate text-xs sm:text-sm'
                  : 'text-slate-400 truncate text-xs sm:text-sm'
              }
            >
              {selectedUserName || 'Selecciona un usuario'}
            </span>
            <ChevronRight size={15} className="text-slate-400 shrink-0 ml-1" />
          </button>

          {isSelectUserOpen && (
            <div className="absolute left-0 z-30 w-[calc(200%+12px)] max-w-[90vw] mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-2 border-b border-slate-100 dark:border-slate-700 flex items-center bg-slate-50 dark:bg-slate-900/50">
                <Search size={14} className="text-slate-400 ml-1 shrink-0" />
                <input
                  ref={userSearchInputRef}
                  type="text"
                  placeholder="Buscar por nombre o teléfono..."
                  className="w-full px-2 py-1 bg-transparent outline-none text-xs text-slate-900 dark:text-white"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700/50">
                {filteredUsers.map((u, uIdx) => (
                  <div
                    key={`select-user-${u.id || uIdx}-${uIdx}`}
                    onClick={() => {
                      setData((prev: any) => ({
                        ...prev,
                        host_id: u.id,
                        clientName: u.name,
                        clientPhone: u.phone || '',
                        clientEmail: u.email || '',
                        canonicalId: u.canonicalId,
                        canonicalName: u.canonicalName,
                        historicalId: u.historicalId,
                        historicalIds: u.historicalIds,
                      }));
                      setIsSelectUserOpen(false);
                      setUserSearch('');
                      userSearchInputRef.current?.blur();
                    }}
                    className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate block">
                        {u.name}
                      </span>
                      {u.phone && (
                        <span className="text-[11px] text-slate-400 block">
                          {u.phone}
                        </span>
                      )}
                    </div>
                    {String(data.host_id) === String(u.id) && (
                      <Check size={14} className="text-[#0f9d42] shrink-0" />
                    )}
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No se encontraron usuarios. Usa "+ Nuevo cliente".
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
            Canchas *
          </label>
          <div className="relative h-11 rounded-2xl bg-[#0f9d42] text-white shadow-2xs flex items-center justify-between px-3.5">
            <span className="text-xs sm:text-sm font-semibold truncate">
              {selectedCourt
                ? `${selectedCourt.name} • $${priceTotal.toLocaleString('es-AR')}`
                : 'Seleccionar...'}
            </span>
            <ChevronRight size={15} className="text-white/90 shrink-0 ml-1" />
            <select
              value={data.court_id ? String(data.court_id) : ''}
              onChange={(e) => onCourtChange(e.target.value)}
              aria-label="Seleccionar cancha"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              <option value="" disabled>
                Seleccionar cancha...
              </option>
              {courts.map((court, cIdx) => {
                const isOccupied = isCourtOccupiedForTime(court.id);
                const isInactive = court.status === 'inactiva';
                const isDisabled = isOccupied || isInactive;
                return (
                  <option
                    key={`court-opt-${court.id || cIdx}`}
                    value={String(court.id)}
                    disabled={isDisabled}
                  >
                    {court.name} • $
                    {getCourtPriceForDuration(court, selectedDuration).toLocaleString('es-AR')}{' '}
                    {isInactive ? '(Inactiva)' : isOccupied ? '(Ocupada)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {data.court_id &&
        !(data.status === 'cancelado' || data.status === 'cancelled') &&
        isCourtOccupiedForTime(data.court_id) && (
          <p className="text-[11px] text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
            <AlertCircle size={13} className="shrink-0" />
            <span>
              Esta cancha ya está ocupada en el horario seleccionado. Elegí otra cancha o cambiá el horario.
            </span>
          </p>
        )}

      {/* Fila 2: Fecha * + Horario de inicio * */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
            Fecha *
          </label>
          <div className="relative h-11 bg-white dark:bg-slate-800 rounded-2xl shadow-2xs flex items-center justify-between pl-9 pr-3">
            <Calendar
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none"
            />
            <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
              {formatDisplayDate(data.date)}
            </span>
            <ChevronRight size={15} className="text-slate-400 shrink-0" />
            <input
              type="date"
              value={data.date || ''}
              onChange={(e) => setData({ ...data, date: e.target.value })}
              aria-label="Fecha de reserva"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
            Horario de inicio *
          </label>
          <StartTimeStaggeredPicker
            value={data.time || ''}
            allSlots={allHalfHourSlots}
            availableSlots={displayHours}
            disabled={!data.date || allHalfHourSlots.length === 0}
            placeholder={
              !data.date
                ? 'Elige fecha'
                : displayHours.length === 0
                ? 'Sin horarios'
                : 'Elige un horario'
            }
            onChange={(t) => setData({ ...data, time: t })}
          />
        </div>
      </div>

      {/* Fila 3: Duración * */}
      <DurationSelector
        durationMinutes={selectedDuration}
        onChange={(dur) => setData({ ...data, durationMinutes: dur })}
      />

      {/* Fila 4: Notas u observaciones (opcional) */}
      <div>
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
          Notas u observaciones (opcional)
        </label>
        <div className="relative flex items-center">
          <FileText
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-700/60 dark:text-amber-300/70 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Escribe tus notas sobre esta reserva..."
            value={data.notes || ''}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            className="w-full h-11 pl-10 pr-3.5 bg-[#fef7d8] dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400/60 placeholder:text-amber-900/40 dark:placeholder:text-amber-200/40"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0 text-red-600 dark:text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
