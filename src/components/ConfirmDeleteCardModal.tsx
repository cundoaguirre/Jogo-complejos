import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

export interface ConfirmDeleteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  targetName?: string;
  title?: string;
  description?: string;
  warningNote?: string | null;
  errorMessage?: string | null;
  isDeleting?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
}

export const ConfirmDeleteCardModal: React.FC<ConfirmDeleteCardModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetName,
  title = '¿Estás seguro?',
  description,
  warningNote,
  errorMessage,
  isDeleting = false,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Eliminar',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const cleanName = (targetName || '').trim() || 'este usuario';
  const resolvedDescription =
    description || `Eliminarás a ${cleanName} de manera permanente`;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-card-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 pointer-events-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDeleting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 text-center pointer-events-auto"
      >
        <h4
          id="confirm-delete-card-title"
          className="text-xl sm:text-[22px] font-bold text-gray-950 dark:text-white tracking-tight text-center leading-snug"
        >
          {title}
        </h4>

        <p className="mt-2.5 text-sm text-gray-600 dark:text-slate-300 text-center leading-relaxed">
          {resolvedDescription}
        </p>

        {warningNote && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 text-center leading-snug">
            {warningNote}
          </p>
        )}

        {errorMessage && (
          <div className="mt-3 px-3 py-2 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 text-center">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDeleting) onClose();
            }}
            className="px-5 py-2.5 rounded-full bg-transparent text-black dark:text-white hover:bg-gray-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 min-h-[40px] whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm();
            }}
            className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-sm shadow-red-600/20 transition-colors cursor-pointer disabled:opacity-50 min-h-[40px] whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Eliminando...</span>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
