import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  Search, 
  CheckCircle, 
  DollarSign, 
  CreditCard, 
  ArrowRightLeft, 
  User, 
  AlertCircle,
  X,
  RefreshCw,
  Calendar,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User as UserType } from '../types';
import { 
  subscribeToTransactions, 
  subscribeToClients,
  settleFiadoTransaction 
} from '../lib/firestoreSync';

interface CuentasCorrientesSectionProps {
  complexId?: string;
  onNavigateToPOS?: () => void;
}

export const CuentasCorrientesSection: React.FC<CuentasCorrientesSectionProps> = ({
  complexId = 'B',
  onNavigateToPOS
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  const [transactions, setTransactions] = useState<any[]>([]);
  const [clients, setClients] = useState<UserType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settle modal state
  const [settlingTx, setSettlingTx] = useState<{
    id: string;
    fiadoAmount: number;
    userName?: string;
    userId?: string;
    description?: string;
  } | null>(null);

  const [selectedSettlementMethod, setSelectedSettlementMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscriptions
  useEffect(() => {
    const unsubTx = subscribeToTransactions(targetId, (txList) => {
      setTransactions(txList);
    });

    const unsubClients = subscribeToClients(targetId, (cList) => {
      setClients(cList);
    });

    return () => {
      unsubTx();
      unsubClients();
    };
  }, [targetId]);

  // Pending fiado transactions
  const pendingFiados = useMemo(() => {
    return transactions.filter((t) => {
      const isFiado = t.paymentStatus === 'fiado' || 
        (Array.isArray(t.payments) && t.payments.some((p: any) => p.method === 'fiado' && p.amount > 0));
      if (!isFiado) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (t.userName && t.userName.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
      );
    });
  }, [transactions, searchQuery]);

  // Clients with active debt > 0
  const debtors = useMemo(() => {
    return clients.filter(c => Number(c.debt || 0) > 0);
  }, [clients]);

  // Total outstanding fiado amount
  const totalOutstanding = useMemo(() => {
    return pendingFiados.reduce((sum, t) => {
      if (Array.isArray(t.payments)) {
        const fiadoPay = t.payments.find((p: any) => p.method === 'fiado');
        return sum + Number(fiadoPay?.amount || t.total || 0);
      }
      return sum + Number(t.total || 0);
    }, 0);
  }, [pendingFiados]);

  // Settle handler
  const handleConfirmSettle = async () => {
    if (!settlingTx) return;
    setIsSubmitting(true);
    try {
      await settleFiadoTransaction({
        transactionId: settlingTx.id,
        fiadoAmount: settlingTx.fiadoAmount,
        newMethod: selectedSettlementMethod,
        userId: settlingTx.userId
      });

      setSettlingTx(null);
    } catch (err: any) {
      console.error('Error al saldar fiado:', err);
      alert(`Error al saldar deuda: ${err?.message || 'Reintentá nuevamente.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
            <Clock size={15} className="text-amber-500" />
            <span>Total Fiado Pendiente</span>
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">
            ${totalOutstanding.toLocaleString()}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Suma de tickets en cuenta corriente</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
            <FileText size={15} className="text-emerald-500" />
            <span>Tickets por Cobrar</span>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
            {pendingFiados.length}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Transacciones pendientes de cobro</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
            <User size={15} className="text-blue-500" />
            <span>Clientes con Deuda</span>
          </div>
          <div className="text-2xl font-black text-blue-600 font-mono">
            {debtors.length}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Usuarios registrados con saldo deudor</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
              Gestión de Cuentas Corrientes y Fiados
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold uppercase">
                {pendingFiados.length} pendientes
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Visualizá los consumos impagos y saldalos cuando el cliente abone en efectivo o transferencia.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente o detalle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* List of Fiado Transactions */}
        {pendingFiados.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CheckCircle size={40} className="mx-auto text-emerald-500 mb-2 opacity-80" />
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200">¡Al día! No hay cuentas pendientes</p>
            <p className="text-xs text-gray-500 mt-1">Todos los fiados y ventas han sido saldados.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {pendingFiados.map((tx) => {
              const fiadoPayment = Array.isArray(tx.payments) 
                ? tx.payments.find((p: any) => p.method === 'fiado') 
                : null;
              const fiadoAmount = Number(fiadoPayment?.amount || tx.total || 0);

              return (
                <div 
                  key={`fiado-tx-${tx.id}`}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 rounded-xl px-2 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                        {tx.userName || 'Cliente no identificado'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Fiado
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 truncate">
                      {tx.description || (Array.isArray(tx.items) ? tx.items.map((it: any) => `${it.quantity}x ${it.name}`).join(', ') : 'Venta')}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                      <span>Fecha: {tx.date || 'Hoy'}</span>
                      {tx.notes && <span>• Nota: {tx.notes}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-sm sm:text-base font-black text-amber-600 font-mono">
                        ${fiadoAmount.toLocaleString()}
                      </span>
                      <p className="text-[10px] text-gray-400">Total fiado</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSettlingTx({
                        id: tx.id,
                        fiadoAmount,
                        userName: tx.userName,
                        userId: tx.userId,
                        description: tx.description
                      })}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle size={14} />
                      <span>Cobrar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settle Fiado Modal */}
      <AnimatePresence>
        {settlingTx && (
          <div 
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setSettlingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span>Saldar Cuenta Corriente</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setSettlingTx(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-gray-100 dark:border-slate-700/60 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{settlingTx.userName || 'Cliente'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Monto adeudado:</span>
                  <span className="font-black text-amber-600 font-mono">${settlingTx.fiadoAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400">
                  ¿Cómo abona el cliente en este momento?
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'efectivo', label: 'Efectivo', icon: DollarSign },
                    { id: 'transferencia', label: 'Transf. / MP', icon: ArrowRightLeft },
                    { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard }
                  ].map((m) => {
                    const isSelected = selectedSettlementMethod === m.id;
                    const Icon = m.icon;
                    return (
                      <button
                        type="button"
                        key={`settle-method-${m.id}`}
                        onClick={() => setSelectedSettlementMethod(m.id as any)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-[11px] truncate w-full text-center">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSettlingTx(null)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSettle}
                  disabled={isSubmitting}
                  className="flex-[1.5] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Saldando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      <span>Confirmar Cobro</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
