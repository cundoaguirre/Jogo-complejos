import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import type { Match } from '../types';
import { permanentlyDeleteBookingInFirestore } from '../lib/firestoreSync';

interface DeleteBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Match | any | null;
  onSuccess?: () => void;
}

export const DeleteBookingModal: React.FC<DeleteBookingModalProps> = ({
  isOpen,
  onClose,
  booking,
  onSuccess
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !booking) return null;

  const courtName = booking.courtName || booking.court_name || 'Cancha';
  const bookingDate = booking.date || '';
  const bookingTime = booking.startTime || booking.time || (booking.start_time && booking.start_time.includes('T') ? booking.start_time.split('T')[1].substring(0, 5) : '');
  const clientName = booking.userName || booking.clientName || booking.host_name || 'Cliente';

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await permanentlyDeleteBookingInFirestore(booking.id);
      setIsDeleting(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al eliminar la reserva:', err);
      setErrorMessage(err?.message || 'Ocurrió un error al intentar eliminar la reserva y sus registros asociados.');
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-red-100 dark:border-red-950/40 w-full max-w-md overflow-hidden flex flex-col my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800 bg-red-50/60 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <Trash2 size={18} />
              </div>
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                Eliminar reserva definitivamente
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs sm:text-sm">
            {/* Advertencia principal */}
            <div className="flex items-start gap-3 p-3.5 bg-red-50/80 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/50 rounded-2xl text-red-900 dark:text-red-200">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-xs">Esta acción no se puede deshacer</p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  Esta acción eliminará la reserva y todos los datos asociados exclusivamente a ella. No se podrá recuperar.
                </p>
              </div>
            </div>

            {/* Ficha de la reserva a eliminar */}
            <div className="bg-gray-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-gray-100 dark:border-slate-700/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 dark:text-slate-400 font-medium">Reserva:</span>
                <span className="font-bold text-gray-900 dark:text-white">{courtName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 dark:text-slate-400 font-medium">Fecha y Horario:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">
                  {bookingDate} {bookingTime ? `· ${bookingTime} hs` : ''}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 dark:text-slate-400 font-medium">Cliente:</span>
                <span className="font-bold text-gray-900 dark:text-white">{clientName}</span>
              </div>
            </div>

            {/* Error si ocurre */}
            {errorMessage && (
              <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Eliminando...</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>Eliminar definitivamente</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
