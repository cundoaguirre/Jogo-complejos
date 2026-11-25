import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  FileText,
  Footprints,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Share2,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { User } from '../types';
import { normalizePhoneNumber } from '../lib/crmActivityIndex';
import { cn } from '../lib/utils';
import { ConfirmDeleteCardModal } from './ConfirmDeleteCardModal';

export function toCanonicalGender(gender?: string | null): 'masculino' | 'femenino' {
  if (!gender) return 'masculino';
  const g = String(gender).toLowerCase().trim();
  if (g === 'mujer' || g === 'femenino') return 'femenino';
  return 'masculino';
}

export interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: any) => Promise<void> | void;
  onDelete?: (userId: string | number) => Promise<void> | void;
  initialData?: User | null;
  isEdit?: boolean;
  existingUsers?: User[];
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData = null,
  isEdit = false,
  existingUsers = [],
}) => {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const isFromJogoInitial = Boolean(
    initialData?.acquisitionChannel === 'Jogo' ||
      initialData?.acquisitionChannel?.toLowerCase() === 'jogo' ||
      (initialData as any)?.createdSource === 'jogo' ||
      (initialData as any)?.originSource === 'jogo'
  );

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    gender: toCanonicalGender(initialData?.gender),
    acquisitionChannel: isFromJogoInitial ? 'Jogo' : '',
    category: initialData?.category || 'jugador',
    preferredFoot: initialData?.preferredFoot || '',
    birthDate: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const isJogo = Boolean(
        initialData?.acquisitionChannel === 'Jogo' ||
          initialData?.acquisitionChannel?.toLowerCase() === 'jogo' ||
          (initialData as any)?.createdSource === 'jogo' ||
          (initialData as any)?.originSource === 'jogo'
      );
      setFormData({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        email:
          initialData?.email && !String(initialData.email).includes('@sin-correo.com')
            ? initialData.email
            : '',
        address: initialData?.address || initialData?.city || '',
        gender: toCanonicalGender(initialData?.gender),
        acquisitionChannel: isJogo ? 'Jogo' : initialData?.acquisitionChannel || '',
        category: initialData?.category || 'jugador',
        preferredFoot: initialData?.preferredFoot || '',
        birthDate: initialData?.birthDate || '',
        notes:
          initialData?.notes &&
          initialData.notes !== 'Participante registrado en reservas del complejo'
            ? initialData.notes
            : '',
      });
      setError(null);
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
      setIsDeleting(false);

      if (!isEdit) {
        const timer = setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, initialData, isEdit]);

  const isAcquiredByJogo =
    formData.acquisitionChannel === 'Jogo' ||
    initialData?.acquisitionChannel === 'Jogo' ||
    (initialData as any)?.createdSource === 'jogo';

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = formData.name.trim();
    const trimmedPhone = formData.phone.trim();

    if (!trimmedName) {
      setError('El nombre y apellido es obligatorio.');
      return;
    }
    if (!trimmedPhone) {
      setError('El teléfono es obligatorio.');
      return;
    }

    // Comprobar colisión de teléfono dentro de la sede activa
    const normPhone = normalizePhoneNumber(trimmedPhone);
    if (normPhone && Array.isArray(existingUsers) && existingUsers.length > 0) {
      const currentId = initialData?.id ? String(initialData.id) : null;
      const initialNormPhone = initialData?.phone
        ? normalizePhoneNumber(initialData.phone)
        : null;
      const duplicate = existingUsers.find((u) => {
        if (currentId && String(u.id) === currentId) return false;
        if (u.isDerived || String(u.id).startsWith('derived_')) return false;
        if (
          initialNormPhone &&
          initialNormPhone === normPhone &&
          ((u.canonicalId &&
            initialData?.canonicalId &&
            u.canonicalId === initialData.canonicalId) ||
            (Array.isArray(u.historicalIds) &&
              currentId &&
              u.historicalIds.includes(currentId)) ||
            String(initialData?.id || '').startsWith('derived_'))
        ) {
          return false;
        }
        return normalizePhoneNumber(u.phone) === normPhone;
      });
      if (duplicate) {
        setError(
          `Ya existe otro jugador registrado con este número de teléfono (${duplicate.name || 'Ficha existente'}) en el complejo.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await onSave({
        name: trimmedName,
        phone: trimmedPhone,
        email: formData.email.trim(),
        address: formData.address.trim(),
        city: formData.address.trim(),
        gender: formData.gender === 'femenino' ? 'femenino' : 'masculino',
        acquisitionChannel: isAcquiredByJogo
          ? 'Jogo'
          : formData.acquisitionChannel || 'WhatsApp',
        category: formData.category || 'jugador',
        preferredFoot: formData.preferredFoot || '',
        birthDate: formData.birthDate || '',
        notes: formData.notes.trim(),
      });
      onClose();
    } catch (err: any) {
      console.error('Error al guardar jugador:', err);
      setError(
        err?.message ||
          'Error al guardar los datos del jugador. Por favor intente nuevamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!initialData?.id || !onDelete || isDeleting) return;
    setError(null);
    try {
      setIsDeleting(true);
      await onDelete(initialData.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      console.error('Error al eliminar usuario:', err);
      setError(
        err?.message ||
          'No se pudo eliminar el jugador en Firebase. Verificá los permisos e intentá nuevamente.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const isMasculino = formData.gender === 'masculino';
  const isFemenino = formData.gender === 'femenino';
  const isCapitan =
    (formData.category || '').toLowerCase() === 'capitán' ||
    (formData.category || '').toLowerCase() === 'capitan';
  const isJugador = !isCapitan;
  const isBusy = isSubmitting || isDeleting;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[90] flex items-center justify-center p-3 sm:p-4 pointer-events-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isBusy) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] md:max-h-[88vh] border border-slate-200/80 dark:border-slate-800 pointer-events-auto overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
              {isEdit ? 'Editar perfil' : 'Nuevo jugador'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEdit
                ? 'Actualizá los datos del jugador en la sede activa'
                : 'Alta de jugador o cliente para la sede activa'}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isBusy) onClose();
            }}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form
              id="user-form-modal"
              onSubmit={handleSubmit}
              className="p-5 space-y-3.5 overflow-y-auto flex-1"
            >
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium rounded-2xl flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-600 dark:text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Fila 1: Nombre y Apellido + Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Nombre y apellido *
                  </label>
                  <div className="relative flex items-center">
                    <UserIcon
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      ref={nameInputRef}
                      required
                      type="text"
                      placeholder="Ej: Facundo Aguirre"
                      className="w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Teléfono *
                  </label>
                  <div className="relative flex items-center">
                    <Phone
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      required
                      type="tel"
                      placeholder="Ej: 11 1234-5678"
                      className="w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Fila 2: Email + Canal de Adquisición */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Email <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <Mail
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="email"
                      placeholder="jugador@ejemplo.com"
                      className="w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Canal de adquisición
                  </label>
                  <div className="relative flex items-center">
                    <Share2
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <select
                      value={isAcquiredByJogo ? 'Jogo' : formData.acquisitionChannel}
                      disabled={isAcquiredByJogo}
                      onChange={(e) => {
                        if (isAcquiredByJogo) return;
                        setFormData({
                          ...formData,
                          acquisitionChannel: e.target.value,
                        });
                      }}
                      className={cn(
                        'w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-medium focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all',
                        isAcquiredByJogo
                          ? 'opacity-70 bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-emerald-700 dark:text-emerald-400 font-bold'
                          : !formData.acquisitionChannel
                          ? 'bg-slate-50 dark:bg-slate-800 text-slate-400'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      )}
                    >
                      <option value="">Seleccionar canal...</option>
                      <option value="Jogo">Jogo</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Referido">Referido</option>
                      <option value="Instagram (Ig)">Instagram (Ig)</option>
                      <option value="Facebook (Fb)">Facebook (Fb)</option>
                      <option value="TikTok">TikTok</option>
                      <option value="Inbound">Inbound</option>
                      <option value="Outbound">Outbound</option>
                      <option value="Evento">Evento</option>
                      <option value="Cliente Presencial">Cliente Presencial</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Fila 3: Género + Categoría */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Género
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl h-11 items-center border border-slate-200/70 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, gender: 'masculino' }))
                      }
                      className={cn(
                        'h-full rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer',
                        isMasculino
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium'
                      )}
                    >
                      Masculino
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, gender: 'femenino' }))
                      }
                      className={cn(
                        'h-full rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer',
                        isFemenino
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium'
                      )}
                    >
                      Femenino
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Categoría
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl h-11 items-center border border-slate-200/70 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, category: 'jugador' }))
                      }
                      className={cn(
                        'h-full rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer',
                        isJugador
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium'
                      )}
                    >
                      Jugador
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, category: 'capitán' }))
                      }
                      className={cn(
                        'h-full rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer',
                        isCapitan
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium'
                      )}
                    >
                      Capitán
                    </button>
                  </div>
                </div>
              </div>

              {/* Fila 4: Dirección + Fecha de nacimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Dirección <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <MapPin
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      placeholder="Barrio / localidad"
                      className="w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Fecha de nacimiento{' '}
                    <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <Calendar
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="date"
                      className={cn(
                        'w-full h-11 pl-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all',
                        formData.birthDate
                          ? 'pr-8 text-slate-900 dark:text-white'
                          : 'pr-3.5 text-slate-500 dark:text-slate-400'
                      )}
                      value={formData.birthDate}
                      onChange={(e) =>
                        setFormData({ ...formData, birthDate: e.target.value })
                      }
                    />
                    {formData.birthDate && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, birthDate: '' }))
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer text-xs font-bold leading-none"
                        title="Borrar fecha"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Fila 5: Pierna hábil + Notas (solo visibles sin recargar visualmente, preserva campos al editar) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Pierna hábil <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <Footprints
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <select
                      value={formData.preferredFoot}
                      onChange={(e) =>
                        setFormData({ ...formData, preferredFoot: e.target.value })
                      }
                      className={cn(
                        'w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-medium focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all bg-slate-50 dark:bg-slate-800',
                        formData.preferredFoot
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-400'
                      )}
                    >
                      <option value="">Sin especificar</option>
                      <option value="Diestro">Diestro</option>
                      <option value="Zurdo">Zurdo</option>
                      <option value="Ambidiestro">Ambidiestro</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Notas <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <FileText
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      placeholder="Observaciones o preferencias..."
                      className="w-full h-11 pl-10 pr-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#129D44] focus:border-transparent outline-none transition-all"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2.5 shrink-0">
              <div>
                {isEdit && initialData?.id && onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setError(null);
                      setShowDeleteConfirm(true);
                    }}
                    disabled={isBusy}
                    className="px-3.5 py-2.5 text-red-600 hover:text-red-700 bg-red-50/70 hover:bg-red-100/80 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                    <span>Eliminar usuario</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold cursor-pointer disabled:opacity-50 text-xs sm:text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="user-form-modal"
                  disabled={!formData.name.trim() || !formData.phone.trim() || isBusy}
                  className="px-5 py-2.5 bg-[#129D44] text-white rounded-xl font-bold hover:bg-[#129D44]/90 disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-900/10 flex items-center gap-2 text-xs sm:text-sm transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : isEdit ? (
                    'Guardar cambios'
                  ) : (
                    'Guardar jugador'
                  )}
                </button>
              </div>
            </div>
      </motion.div>
      <ConfirmDeleteCardModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          if (!isDeleting) {
            setError(null);
            setShowDeleteConfirm(false);
          }
        }}
        onConfirm={handleConfirmDelete}
        targetName={initialData?.name || formData.name || 'este usuario'}
        errorMessage={error}
        isDeleting={isDeleting}
      />
    </div>
  );
};
