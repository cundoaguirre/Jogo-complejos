import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  AlertTriangle, 
  DollarSign, 
  ArrowRight,
  CheckCircle2,
  Calendar,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import type { Match } from '../types';
import { cancelBookingWithPolicy } from '../lib/firestoreSync';

interface CancelBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Match | any | null;
  complexId: string;
  operatorId: string;
  onSuccess?: () => void;
}

export const CancelBookingModal: React.FC<CancelBookingModalProps> = ({
  isOpen,
  onClose,
  booking,
  complexId,
  operatorId,
  onSuccess
}) => {
  if (!isOpen || !booking) return null;

  // Datos financieros reales de la reserva
  const contractualAmount = Number(booking.price ?? booking.price_total ?? 0);
  const totalCollected = Number(booking.amount_paid ?? booking.deposit ?? 0);
  const previousRefunds = Number(booking.totalRefunded ?? 0);
  const señaEfectivamenteCobrada = Math.max(0, totalCollected - previousRefunds);
  const originalPending = Math.max(0, contractualAmount - totalCollected);

  // Cliente y horario
  const clientName = booking.userName || booking.clientName || booking.host_name || 'Cliente';
  const courtName = booking.courtName || booking.court_name || 'Cancha';
  const bookingDate = booking.date || '';
  const bookingTime = booking.startTime || booking.time || (booking.start_time && booking.start_time.includes('T') ? booking.start_time.split('T')[1].substring(0, 5) : '');

  // Si tiene seña, comenzamos en el paso 1 (input de devolución). Si no tiene seña, vamos directo al paso de confirmación.
  const hasSeña = señaEfectivamenteCobrada > 0;
  const [step, setStep] = useState<'input' | 'confirm'>(hasSeña ? 'input' : 'confirm');

  // Único campo editable: importe a devolver
  const [refundInput, setRefundInput] = useState<string>(hasSeña ? String(señaEfectivamenteCobrada) : '0');
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<'cash' | 'transfer' | 'other'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasSeña) {
      setStep('input');
      setRefundInput(String(señaEfectivamenteCobrada));
    } else {
      setStep('confirm');
      setRefundInput('0');
    }
    setErrorMessage(null);
  }, [booking?.id, hasSeña, señaEfectivamenteCobrada]);

  // Cálculo del importe a devolver y retenido
  const importeADevolver = useMemo(() => {
    if (!hasSeña) return 0;
    const val = Number(refundInput);
    if (isNaN(val)) return 0;
    return Math.max(0, Math.min(val, señaEfectivamenteCobrada));
  }, [refundInput, hasSeña, señaEfectivamenteCobrada]);

  const importeRetenido = Math.max(0, señaEfectivamenteCobrada - importeADevolver);

  // Validaciones
  const numInput = Number(refundInput);
  const isInputValid = !isNaN(numInput) && numInput >= 0 && numInput <= señaEfectivamenteCobrada;

  const handleProceedToConfirm = () => {
    if (isNaN(numInput) || numInput < 0) {
      setErrorMessage('Ingresá un importe válido mayor o igual a $0.');
      return;
    }
    if (numInput > señaEfectivamenteCobrada) {
      setErrorMessage(`El importe no puede superar la seña cobrada ($${señaEfectivamenteCobrada.toLocaleString()}).`);
      return;
    }
    setErrorMessage(null);
    setStep('confirm');
  };

  const handleExecuteCancellation = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const refundChoice = !hasSeña 
        ? 'none' 
        : importeADevolver === señaEfectivamenteCobrada 
        ? 'full' 
        : importeADevolver === 0 
        ? 'none' 
        : 'partial';

      const idemKey = `cancel_booking_${booking.id}_${Date.now()}`;

      await cancelBookingWithPolicy({
        complexId,
        bookingId: String(booking.id),
        operatorId: operatorId || 'pos_operator',
        refundChoice,
        partialRefundAmount: refundChoice === 'partial' ? importeADevolver : undefined,
        refundPaymentMethod,
        idempotencyKey: idemKey,
        reason: 'Cancelación de reserva'
      });

      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al cancelar la reserva:', err);
      setErrorMessage(err?.message || 'Error al procesar la cancelación.');
      setIsSubmitting(false);
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
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                {step === 'confirm' ? '¿Cancelar esta reserva?' : 'Cancelar reserva'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs sm:text-sm">
            {/* Información básica de la reserva */}
            <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm block">
                  Reserva: {courtName} {bookingTime ? `· ${bookingTime} hs` : ''}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                  {bookingDate} • Cliente: {clientName}
                </span>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-gray-400 block">Total</span>
                <span className="font-bold text-gray-800 dark:text-slate-200 text-xs">
                  ${contractualAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* PASO 1: GESTIONAR DEVOLUCIÓN DE SEÑA (Si existe seña cobrada) */}
            {step === 'input' && hasSeña && (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl flex items-center justify-between">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
                    Seña recibida:
                  </span>
                  <span className="font-black font-mono text-emerald-700 dark:text-emerald-300 text-sm sm:text-base">
                    ${señaEfectivamenteCobrada.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                    ¿Cuánto dinero vas a devolver?
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      min={0}
                      max={señaEfectivamenteCobrada}
                      step="any"
                      value={refundInput}
                      onChange={(e) => {
                        setRefundInput(e.target.value);
                        setErrorMessage(null);
                      }}
                      className="w-full h-11 pl-8 pr-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="0"
                    />
                  </div>
                  {!isInputValid && (
                    <p className="text-[11px] text-red-600 font-medium">
                      El importe debe estar entre $0 y ${señaEfectivamenteCobrada.toLocaleString()}.
                    </p>
                  )}
                </div>

                {/* Cálculo en vivo: Devolución vs Retención */}
                <div className="p-3.5 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-100 dark:border-slate-700 space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center text-gray-700 dark:text-slate-300">
                    <span>Devolución al cliente:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      ${importeADevolver.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-700 dark:text-slate-300">
                    <span>Se queda el complejo:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ${importeRetenido.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Método de pago para la devolución si es > 0 */}
                {importeADevolver > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Medio para la devolución
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'cash', label: 'Efectivo' },
                        { id: 'transfer', label: 'Transferencia' },
                        { id: 'other', label: 'Otro' }
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRefundPaymentMethod(m.id as any)}
                          className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            refundPaymentMethod === m.id
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PASO CONFIRMACIÓN: Resumen final */}
            {step === 'confirm' && (
              <div className="space-y-3.5">
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-700/60 space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between text-gray-600 dark:text-slate-400 pb-2 border-b border-gray-200 dark:border-slate-700">
                    <span>Seña recibida:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      ${señaEfectivamenteCobrada.toLocaleString()}
                    </span>
                  </div>

                  {hasSeña && (
                    <>
                      <div className="flex justify-between text-gray-700 dark:text-slate-300">
                        <span>• Devolver al cliente:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          ${importeADevolver.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-700 dark:text-slate-300">
                        <span>• Se queda el complejo:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          ${importeRetenido.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  {!hasSeña && (
                    <p className="text-gray-500 dark:text-slate-400 text-xs italic py-1">
                      Esta reserva no registra señas cobradas. No se generarán egresos de dinero.
                    </p>
                  )}

                  <div className="flex justify-between text-gray-700 dark:text-slate-300 pt-2 border-t border-gray-200 dark:border-slate-700">
                    <span>• Saldo pendiente:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      ${originalPending.toLocaleString()} → $0
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-900 dark:text-amber-300 text-[11px] leading-relaxed">
                  La deuda restante de la reserva dejará de ser exigible al confirmar la cancelación.
                </div>
              </div>
            )}

            {/* Mensaje de error si surge */}
            {errorMessage && (
              <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 flex gap-2.5">
            {step === 'input' && hasSeña ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  disabled={!isInputValid}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>Continuar</span>
                  <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (hasSeña) {
                      setStep('input');
                    } else {
                      onClose();
                    }
                  }}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  {hasSeña && <ArrowLeft size={14} />}
                  <span>Volver</span>
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCancellation}
                  disabled={isSubmitting}
                  className="flex-[1.4] py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Cancelando...</span>
                    </>
                  ) : (
                    <span>Confirmar cancelación</span>
                  )}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
