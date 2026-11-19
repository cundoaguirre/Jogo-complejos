import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { getCourtDefaultDuration } from '../lib/scheduleUtils';

interface CourtEditModalProps {
  editingCourt: any;
  courts: any[];
  isSaving: boolean;
  onChange: (court: any) => void;
  onSave: (court: any) => void;
  onDelete: (id: number | string) => void;
  onClose: () => void;
}

export const CourtEditModal: React.FC<CourtEditModalProps> = ({
  editingCourt,
  courts,
  isSaving,
  onChange,
  onSave,
  onDelete,
  onClose,
}) => {
  const currentDuration = getCourtDefaultDuration(editingCourt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[28px] border border-gray-100 dark:border-slate-800 p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
              {editingCourt.id ? 'Editar Cancha' : 'Nueva Cancha'}
            </h3>
            <p className="text-xs text-slate-400">
              Configuración de cancha dentro de la sede activa
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nombre de Cancha *
            </label>
            <input
              value={editingCourt.name || ''}
              onChange={(e) => onChange({ ...editingCourt, name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
              placeholder="Ej: Cancha 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Deporte *
              </label>
              <select
                value={
                  editingCourt.sport ||
                  (editingCourt.type?.toLowerCase().includes('fútbol')
                    ? 'Fútbol'
                    : editingCourt.type) ||
                  'Fútbol'
                }
                onChange={(e) => {
                  const newSport = e.target.value;
                  const suggestedDuration =
                    newSport.toLowerCase().includes('pádel') ||
                    newSport.toLowerCase().includes('padel')
                      ? 90
                      : 60;
                  onChange({
                    ...editingCourt,
                    sport: newSport,
                    type: newSport === 'Fútbol' ? 'fútbol 5' : newSport,
                    defaultDurationMinutes:
                      editingCourt.defaultDurationMinutes ?? suggestedDuration,
                  });
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
              >
                <option value="Fútbol">Fútbol</option>
                <option value="Pádel">Pádel</option>
                <option value="Tenis">Tenis</option>
                <option value="Pickleball">Pickleball</option>
                <option value="Squash">Squash</option>
                <option value="Vóley">Vóley</option>
                <option value="Básquet">Básquet</option>
                <option value="Hockey">Hockey</option>
                <option value="Handball">Handball</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tipo de cancha *
              </label>
              {editingCourt.sport === 'Fútbol' ||
              !editingCourt.sport ||
              editingCourt.type?.toLowerCase().includes('fútbol') ? (
                <select
                  value={editingCourt.type || 'fútbol 5'}
                  onChange={(e) => onChange({ ...editingCourt, type: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
                >
                  <option value="fútbol 5">fútbol 5</option>
                  <option value="fútbol 6">fútbol 6</option>
                  <option value="fútbol 7">fútbol 7</option>
                  <option value="fútbol 8">fútbol 8</option>
                  <option value="fútbol 9">fútbol 9</option>
                  <option value="fútbol 11">fútbol 11</option>
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={editingCourt.sport || editingCourt.type}
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm text-slate-500 dark:text-slate-400 outline-none select-none cursor-default"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Precio por Hora ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                  $
                </span>
                <input
                  type="number"
                  placeholder="Ej: 50000"
                  value={
                    editingCourt.price_per_hour !== undefined &&
                    editingCourt.price_per_hour !== null
                      ? editingCourt.price_per_hour
                      : editingCourt.price !== undefined &&
                        editingCourt.price !== null
                      ? editingCourt.price
                      : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange({
                      ...editingCourt,
                      price: (val === '' ? '' : Number(val)) as any,
                      price_per_hour: (val === '' ? '' : Number(val)) as any,
                    });
                  }}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Estado Operativo *
              </label>
              <select
                value={editingCourt.status === 'inactiva' ? 'inactiva' : 'activa'}
                onChange={(e) => onChange({ ...editingCourt, status: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
              >
                <option value="activa">activa</option>
                <option value="inactiva">inactiva</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Duración predeterminada del turno
            </label>
            <select
              value={currentDuration}
              onChange={(e) =>
                onChange({
                  ...editingCourt,
                  defaultDurationMinutes: Number(e.target.value),
                })
              }
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white"
            >
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora (60 min)</option>
              <option value={90}>1 hora y media (90 min)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-full">
              <input
                type="checkbox"
                id="is_roofed_checkbox"
                checked={Boolean(editingCourt.is_roofed)}
                onChange={(e) =>
                  onChange({ ...editingCourt, is_roofed: e.target.checked })
                }
                className="w-4.5 h-4.5 text-[#129D44] rounded focus:ring-[#129D44] cursor-pointer"
              />
              <label
                htmlFor="is_roofed_checkbox"
                className="font-semibold text-slate-700 dark:text-slate-300 text-xs sm:text-sm cursor-pointer select-none"
              >
                ¿Es techada?
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Superficie *
              </label>
              <select
                value={editingCourt.surface || 'sintético'}
                onChange={(e) => onChange({ ...editingCourt, surface: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#129D44] text-sm text-slate-800 dark:text-white capitalize"
              >
                <option value="sintético">sintético</option>
                <option value="cemento">cemento</option>
                <option value="césped">césped</option>
                <option value="blindex">blindex</option>
                <option value="tierra">tierra</option>
                <option value="arena">arena</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 p-3.5 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#129D44]" />
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Canchas Superpuestas (Bloqueo Mutuo)
              </label>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Seleccioná las canchas que comparten el mismo espacio físico. Si esta cancha tiene un turno confirmado, las seleccionadas quedarán bloqueadas automáticamente en ese horario.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {courts
                .filter((c) => !editingCourt.id || String(c.id) !== String(editingCourt.id))
                .map((c, cIdx) => {
                  const isBlocked = (editingCourt.blockedCourts || [])
                    .map(String)
                    .includes(String(c.id));
                  return (
                    <button
                      type="button"
                      key={`overlap-court-${c.id || cIdx}`}
                      onClick={() => {
                        const currentBlocked = (editingCourt.blockedCourts || []).map(String);
                        const strCId = String(c.id);
                        const newBlocked = isBlocked
                          ? currentBlocked.filter((id: string) => id !== strCId)
                          : [...currentBlocked, strCId];
                        onChange({ ...editingCourt, blockedCourts: newBlocked });
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-2xs cursor-pointer',
                        isBlocked
                          ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-gray-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                      )}
                    >
                      <ShieldCheck
                        size={13}
                        className={isBlocked ? 'text-white' : 'text-slate-400'}
                      />
                      <span>{c.name}</span>
                      {isBlocked && (
                        <span className="text-[10px] bg-amber-600 px-1 rounded ml-0.5">
                          Bloqueada
                        </span>
                      )}
                    </button>
                  );
                })}
              {courts.filter(
                (c) => !editingCourt.id || String(c.id) !== String(editingCourt.id)
              ).length === 0 && (
                <div className="text-xs text-slate-400 italic">
                  No hay otras canchas creadas para vincular.
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onSave(editingCourt)}
              disabled={
                isSaving ||
                !editingCourt.name ||
                editingCourt.price_per_hour === ''
              }
              className="w-full bg-[#129D44] hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Guardando en complejo...' : 'Guardar Cancha'}
            </button>
            {editingCourt.id && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Estás seguro de eliminar la cancha "${editingCourt.name}"?`)) {
                    onDelete(editingCourt.id);
                  }
                }}
                className="w-full py-2.5 text-red-500 hover:text-red-700 font-semibold text-sm cursor-pointer"
              >
                Eliminar Cancha
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold text-sm cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
