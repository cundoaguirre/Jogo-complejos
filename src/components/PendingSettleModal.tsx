import React, { useState, useEffect, useMemo } from 'react';
import { 
  motion, 
  AnimatePresence 
} from 'framer-motion';
import { 
  X, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  RefreshCw, 
  AlertCircle,
  CreditCard,
  ArrowRightLeft,
  Coins
} from 'lucide-react';
import type { FinancialPaymentMethod } from '../types';
import { 
  registerOperationPaymentsBatch, 
  settleLegacyOrVirtualDebt,
  resolveClientName 
} from '../lib/firestoreSync';
import { cn } from '../lib/utils';

interface PendingSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: {
    id: string;
    ticketCode?: string;
    userName?: string;
    clientName?: string;
    contractualAmount: number;
    amountPending: number;
    totalCollected?: number;
    concept?: string;
    isLegacy?: boolean;
    userId?: string | null;
    bookingId?: string | null;
    originalDoc?: any;
  } | null;
  complexId: string;
  operatorId: string;
  users?: any[];
  bookings?: any[];
  onSuccess?: () => void;
}

interface PaymentRow {
  id: string;
  method: FinancialPaymentMethod;
  amount: number | '';
}

export const PendingSettleModal: React.FC<PendingSettleModalProps> = ({
  isOpen,
  onClose,
  operation,
  complexId,
  operatorId,
  users = [],
  bookings = [],
  onSuccess
}) => {
  const displayClientName = useMemo(() => {
    return resolveClientName(operation, users, operation?.originalDoc);
  }, [operation, users]);

  if (!isOpen || !operation) return null;

  const totalDebt = Math.max(0, Number(operation.amountPending || 0));

  // Payment rows state (starts with single method with exact remaining debt)
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: 'pay_0', method: 'cash', amount: totalDebt }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync payments when operation opens
  useEffect(() => {
    if (operation) {
      setPayments([
        { id: `pay_${Date.now()}`, method: 'cash', amount: totalDebt }
      ]);
      setErrorMsg(null);
    }
  }, [operation?.id, totalDebt]);

  // Calculations
  const totalAssigned = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const diff = totalAssigned - totalDebt;
  const isSobra = diff > 0.01;
  const isFalta = diff < -0.01;
  const sobrante = Math.max(0, diff);
  const faltante = Math.max(0, -diff);

  const isExactOrValid = totalAssigned > 0 && totalAssigned <= totalDebt + 0.01;
  const isPartial = totalAssigned < totalDebt - 0.01 && totalAssigned > 0;
  const isTotal = Math.abs(totalAssigned - totalDebt) < 0.01;

  // Add another payment method with missing amount
  const handleAddPaymentMethod = (method: FinancialPaymentMethod = 'transfer') => {
    const newAmt = faltante > 0 ? faltante : 0;
    setPayments(prev => [
      ...prev,
      { id: `pay_${Date.now()}_${Math.random()}`, method, amount: newAmt }
    ]);
  };

  // Remove payment row
  const handleRemoveRow = (id: string) => {
    if (payments.length <= 1) return;
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  // Autocorrect surplus
  const handleAutocorrectSobrante = () => {
    if (payments.length === 1) {
      setPayments([{ ...payments[0], amount: totalDebt }]);
    } else {
      setPayments(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        const curAmt = Number(last.amount) || 0;
        copy[copy.length - 1] = { ...last, amount: Math.max(0, curAmt - sobrante) };
        return copy;
      });
    }
  };

  // Set row to total
  const handleSetRowTotal = (index: number) => {
    setPayments(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], amount: totalDebt };
      return copy;
    });
  };

  // Set row to missing
  const handleSetRowFaltante = (index: number) => {
    setPayments(prev => {
      const copy = [...prev];
      const cur = Number(copy[index].amount) || 0;
      copy[index] = { ...copy[index], amount: cur + faltante };
      return copy;
    });
  };

  // Confirm payment
  const handleConfirm = async () => {
    const isExp = Boolean((operation as any).isExpense || operation.originalDoc?.operationType === 'expense' || operation.originalDoc?.operationType === 'purchase');
    if (totalAssigned <= 0) {
      setErrorMsg(isExp ? 'Debes ingresar un monto a pagar mayor a cero.' : 'Debes ingresar un monto a cobrar mayor a cero.');
      return;
    }

    if (totalAssigned > totalDebt + 0.01) {
      setErrorMsg(isExp 
        ? `El pago ($${totalAssigned.toLocaleString()}) no puede superar la deuda ($${totalDebt.toLocaleString()}).`
        : `El cobro ($${totalAssigned.toLocaleString()}) no puede superar la deuda ($${totalDebt.toLocaleString()}).`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const paymentsPayload = payments
        .filter(p => (Number(p.amount) || 0) > 0)
        .map((p, idx) => ({
          amount: Number(p.amount),
          paymentMethod: p.method,
          idempotencyKey: `settle_${operation.id}_${Date.now()}_${idx}`,
          notes: isExp ? `Pago saldo proveedor (${p.method})` : `Cobro deuda pendiente (${p.method})`
        }));

      if (operation.isLegacy || operation.id.endsWith('-booking')) {
        await settleLegacyOrVirtualDebt({
          complexId,
          operationId: operation.id,
          operatorId: operatorId || 'pos_operator',
          payments: paymentsPayload,
          ticketCode: operation.ticketCode,
          userName: displayClientName !== 'NN' ? displayClientName : (operation.userName || 'NN'),
          userId: operation.userId,
          bookingId: operation.bookingId || (operation.id.endsWith('-booking') ? operation.id.replace('-booking', '') : null),
          totalPending: totalDebt,
          isExpense: isExp,
          notes: isExp ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
        });
      } else {
        try {
          await registerOperationPaymentsBatch({
            complexId,
            operationId: operation.id,
            operatorId: operatorId || 'pos_operator',
            payments: paymentsPayload,
            notes: isExp ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
          });
        } catch (opErr: any) {
          // Si no se encuentra en /operations por ser previo o histórico, liquidar como deuda histórica/virtual
          if (opErr?.message?.includes('no encontrada') || opErr?.message?.includes('not found')) {
            await settleLegacyOrVirtualDebt({
              complexId,
              operationId: operation.id,
              operatorId: operatorId || 'pos_operator',
              payments: paymentsPayload,
              ticketCode: operation.ticketCode,
              userName: displayClientName !== 'NN' ? displayClientName : (operation.userName || 'NN'),
              userId: operation.userId,
              bookingId: operation.bookingId,
              totalPending: totalDebt,
              isExpense: isExp,
              notes: isExp ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
            });
          } else {
            throw opErr;
          }
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al registrar cobro de deuda pendiente:', err);
      setErrorMsg(err?.message || 'Error al procesar el cobro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpense = Boolean((operation as any).isExpense || operation.originalDoc?.operationType === 'expense' || operation.originalDoc?.operationType === 'purchase');

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Coins size={18} className={isExpense ? "text-amber-600" : "text-emerald-600"} />
                <span>{isExpense ? 'Pagar Saldo a Proveedor' : 'Cobrar Deuda Pendiente'}</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Ticket {operation.ticketCode || operation.id.slice(0, 8)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Info Card: Cliente o Proveedor y Saldo Real */}
          <div className="bg-gray-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-gray-100 dark:border-slate-700 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-gray-500">{isExpense ? 'Proveedor / Acreedor:' : 'Cliente:'}</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {displayClientName}
              </span>
            </div>
            {operation.concept && (
              <div className="flex justify-between">
                <span className="text-gray-500">Concepto:</span>
                <span className="font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[200px] text-right">
                  {operation.concept}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Total Operación:</span>
              <span>${Number(operation.contractualAmount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-1">
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                {isExpense ? 'Saldo Pendiente a Pagar:' : 'Saldo Pendiente por Cobrar:'}
              </span>
              <span className="font-black text-amber-600 dark:text-amber-400 text-sm">
                ${totalDebt.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Calculadora de Pagos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-slate-300">
              <span>{isExpense ? 'Método y Monto a Pagar' : 'Método y Monto a Cobrar'}</span>
              <button
                type="button"
                onClick={() => handleAddPaymentMethod()}
                className="text-[11px] font-black text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Agregar método</span>
              </button>
            </div>

            {/* Filas de métodos */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {payments.map((p, idx) => (
                <div 
                  key={p.id}
                  className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {[
                        { id: 'cash', label: 'Efectivo' },
                        { id: 'transfer', label: 'Transf.' },
                        { id: 'debit', label: 'Débito' },
                        { id: 'credit', label: 'Crédito' },
                        { id: 'mercado_pago', label: 'MP' }
                      ].map(m => (
                        <button
                          key={`${p.id}-${m.id}`}
                          type="button"
                          onClick={() => {
                            setPayments(prev => {
                              const copy = [...prev];
                              copy[idx].method = m.id as FinancialPaymentMethod;
                              return copy;
                            });
                          }}
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            p.method === m.id
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(p.id)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Input con atajo Total / Restante */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSetRowTotal(idx)}
                        className="text-[11px] font-bold text-gray-400 hover:text-gray-900 underline cursor-pointer"
                      >
                        Total
                      </button>

                      {faltante > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetRowFaltante(idx)}
                          className="text-[11px] font-black text-amber-600 hover:underline cursor-pointer"
                        >
                          + Restante (${faltante.toLocaleString()})
                        </button>
                      )}
                    </div>

                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        max={totalDebt}
                        value={p.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayments(prev => {
                            const copy = [...prev];
                            copy[idx].amount = val === '' ? '' : Number(val);
                            return copy;
                          });
                        }}
                        className="w-full h-8 pl-6 pr-2 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-mono font-black text-right outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Atajos Matemáticos (Sobran / Faltan) */}
            {isSobra && (
              <div>
                <button
                  type="button"
                  onClick={handleAutocorrectSobrante}
                  className="text-xs font-black text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Sobran ${sobrante.toLocaleString()}</span>
                  <span className="text-[10px] text-gray-400 font-normal">(Tocar para corregir)</span>
                </button>
              </div>
            )}

            {isFalta && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-600 font-bold">
                  Falta asignar: ${faltante.toLocaleString()} (Pago parcial)
                </span>
                <button
                  type="button"
                  onClick={() => handleAddPaymentMethod()}
                  className="text-[11px] font-black text-emerald-600 hover:underline cursor-pointer"
                >
                  + Agregar faltante
                </button>
              </div>
            )}

            {/* Resumen de cobro o pago a registrar */}
            <div className={cn(
              "p-3 rounded-2xl border flex justify-between items-center text-xs",
              isExpense
                ? "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40"
                : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40"
            )}>
              <span className={cn(
                "font-bold",
                isExpense ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"
              )}>
                {isExpense
                  ? (isTotal ? 'Pago Total (Cancela Deuda)' : isPartial ? 'Pago Parcial a Proveedor' : 'Pago')
                  : (isTotal ? 'Cobro Total (Cancela Deuda)' : isPartial ? 'Cobro Parcial' : 'Cobro')}
              </span>
              <span className={cn(
                "font-black text-sm font-mono",
                isExpense ? "text-amber-600" : "text-emerald-600"
              )}>
                ${totalAssigned.toLocaleString()}
              </span>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || !isExactOrValid}
              className={cn(
                "flex-[1.5] py-2.5 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                isExpense
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>{isExpense ? 'Confirmar Pago' : 'Confirmar Cobro'}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
