import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Share2, 
  Printer, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Coins,
  ArrowLeft,
  MapPin,
  Phone,
  MessageCircle,
  Trash2
} from 'lucide-react';
import type { OperationDocument, FinancialMovementDocument, User } from '../types';
import { safeFormatDate } from '../lib/utils';
import { es } from 'date-fns/locale';
import { resolveClientName, resolveClientPhone, permanentlyDeleteFinancialRecordInFirestore } from '../lib/firestoreSync';

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: OperationDocument | null;
  movements?: FinancialMovementDocument[];
  venueProfile?: {
    name?: string;
    company?: string;
    phone?: string;
    address?: string;
  };
  operatorName?: string;
  onRegisterPayment?: (op: OperationDocument) => void;
  originSection?: 'movements' | 'operations' | 'pendings';
  users?: User[];
  bookings?: any[];
  complexId?: string;
  onDeleted?: (concept?: string) => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({
  isOpen,
  onClose,
  operation,
  movements = [],
  venueProfile,
  operatorName,
  onRegisterPayment,
  originSection = 'operations',
  users = [],
  bookings = [],
  complexId,
  onDeleted
}) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [copiedToast, setCopiedToast] = React.useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDeleteRecord = async () => {
    if (!operation) return;
    setIsDeleting(true);
    try {
      await permanentlyDeleteFinancialRecordInFirestore({
        complexId: complexId || operation.complexId || (operation as any).complejoId || 'B',
        operationId: operation.id,
        bookingId: operation.bookingId,
        isLegacyTransaction: Boolean((operation as any).isLegacy)
      });
      setShowConfirmDelete(false);
      if (onDeleted) {
        const itemConcept = (operation as any).concept || operation.notes || (operation.operationType === 'court_booking' ? 'la reserva de cancha' : 'la operación');
        onDeleted(itemConcept);
      }
      onClose();
    } catch (err) {
      console.error('Error deleting financial record:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Encontrar reserva vinculada si la operación corresponde a un turno
  const linkedBooking = React.useMemo(() => {
    if (!Array.isArray(bookings) || bookings.length === 0) return null;
    const cleanBId = operation?.bookingId 
      ? String(operation.bookingId).replace('-booking', '') 
      : (operation?.id ? String(operation.id).replace('-booking', '') : '');
    if (!cleanBId) return null;
    return bookings.find(b => String(b.id) === cleanBId) || null;
  }, [operation, bookings]);

  // Client details: "Si se conoce el cliente, mostrar su nombre real. Si no, NN"
  const displayClientName = React.useMemo(() => {
    // 1. Resolver con operación, usuarios y reserva vinculada
    let name = resolveClientName(operation, users, linkedBooking);
    if (name !== 'NN') return name;

    // 2. Si sigue siendo NN, buscar en los movimientos asociados
    if (Array.isArray(movements) && movements.length > 0) {
      for (const m of movements) {
        const mName = resolveClientName(m, users, linkedBooking);
        if (mName !== 'NN') return mName;
      }
    }
    return 'NN';
  }, [operation, users, linkedBooking, movements]);

  const displayPhone = React.useMemo(() => {
    let phone = resolveClientPhone(operation, users, linkedBooking);
    if (phone) return phone;
    if (Array.isArray(movements) && movements.length > 0) {
      for (const m of movements) {
        const mPhone = resolveClientPhone(m, users, linkedBooking);
        if (mPhone) return mPhone;
      }
    }
    return '';
  }, [operation, users, linkedBooking, movements]);

  if (!isOpen || !operation) return null;

  // Venue details
  const complexName = venueProfile?.name || venueProfile?.company || 'JOGO Complejo';
  const complexPhone = venueProfile?.phone || '';
  const complexAddress = venueProfile?.address || '';

  // Dates
  const emissionDate = operation.createdAt?.toDate 
    ? operation.createdAt.toDate() 
    : (operation.createdAt ? new Date(operation.createdAt) : new Date());

  // Ticket code
  const ticketCode = operation.ticketCode || operation.id.slice(0, 8).toUpperCase();

  // Operation Type
  let operationTypeLabel = 'Venta de Mostrador';
  if (operation.operationType === 'court_booking') {
    operationTypeLabel = 'Reserva de Cancha';
  } else if (operation.operationType === 'expense') {
    operationTypeLabel = 'Gasto Operativo';
  } else if (operation.operationType === 'historical_debt_settlement') {
    operationTypeLabel = 'Abono a Cuenta Corriente';
  }

  // Financial calculations
  const totalContractual = Number(operation.contractualAmount || 0);
  const totalCollected = Number(operation.totalCollected || 0);
  const amountPending = Number(operation.amountPending || 0);

  const itemsSubtotal = Array.isArray(operation.items) && operation.items.length > 0
    ? operation.items.reduce((sum, it) => sum + Number(it.subtotal || (it.quantity * it.unitPrice)), 0)
    : totalContractual;
  const discount = Math.max(0, itemsSubtotal - totalContractual);

  // Status mapping
  let statusBadge = {
    label: 'Pendiente de Pago',
    bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    icon: Clock
  };

  if (operation.paymentStatus === 'paid' || (totalCollected >= totalContractual && totalContractual > 0)) {
    statusBadge = {
      label: 'Pagado Total',
      bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      icon: CheckCircle2
    };
  } else if (operation.paymentStatus === 'partial' || totalCollected > 0) {
    statusBadge = {
      label: 'Pago Parcial / Pendiente',
      bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
      icon: Clock
    };
  } else if (operation.paymentStatus?.startsWith('cancelled')) {
    statusBadge = {
      label: 'Cancelado',
      bg: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      icon: AlertCircle
    };
  }

  // Operator
  const displayOperator = operatorName || (operation.createdBy ? `Operador #${operation.createdBy.slice(0, 5)}` : null);

  // Method translations
  const formatPaymentMethod = (method: string) => {
    switch (method?.toLowerCase()) {
      case 'cash':
      case 'efectivo':
        return 'Efectivo';
      case 'transfer':
      case 'transferencia':
        return 'Transferencia';
      case 'tarjeta':
      case 'debit':
      case 'credit':
        return 'Tarjeta';
      case 'mercado_pago':
      case 'mercadopago':
        return 'Mercado Pago';
      case 'fiado':
        return 'Cuenta Corriente';
      default:
        return method || 'Efectivo';
    }
  };

  // Actions: Print
  const handlePrint = () => {
    window.print();
  };

  // Actions: Share / WhatsApp
  const generateSummaryText = () => {
    return `🧾 *COMPROBANTE DE PAGO*\n` +
      `🏟 *${complexName}*\n` +
      `Ticket: #${ticketCode}\n` +
      `Fecha: ${safeFormatDate(emissionDate, "dd/MM/yyyy HH:mm", { locale: es })}\n` +
      `Tipo: ${operationTypeLabel}\n` +
      `Cliente: ${displayClientName}${displayPhone ? ` (${displayPhone})` : ''}\n` +
      `-------------------------\n` +
      `Total: $${totalContractual.toLocaleString()}\n` +
      `Cobrado: $${totalCollected.toLocaleString()}\n` +
      (amountPending > 0 ? `Saldo Pendiente: $${amountPending.toLocaleString()}\n` : `Estado: Pagado Total\n`) +
      `-------------------------\n` +
      `¡Gracias por tu preferencia!`;
  };

  const handleShare = async () => {
    const shareText = generateSummaryText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Ticket ${ticketCode} - ${complexName}`,
          text: shareText
        });
      } catch {
        // user cancelled or unsupported
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2500);
      } catch {
        // clipboard fallback
      }
    }
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generateSummaryText());
    const phoneClean = displayPhone.replace(/\D/g, '');
    const url = phoneClean 
      ? `https://api.whatsapp.com/send?phone=${phoneClean}&text=${text}`
      : `https://api.whatsapp.com/send?text=${text}`;
    window.open(url, '_blank');
  };

  // Determinar pagos a mostrar (movements o pagos de transacción histórica)
  const legacyPayments: any[] = Array.isArray((operation as any).payments) ? (operation as any).payments : [];
  const hasMovements = movements.length > 0;
  const hasLegacyPayments = !hasMovements && legacyPayments.length > 0;

  const sectionName = originSection === 'movements' ? 'Movimientos' : (originSection === 'pendings' ? 'Pendientes' : 'Operaciones');

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col my-auto max-h-[92vh] relative"
        >
          {/* Toast de copiado */}
          {copiedToast && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 backdrop-blur-xs animate-in fade-in zoom-in duration-200">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>Resumen copiado al portapapeles</span>
            </div>
          )}

          {/* Header Action Bar */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-emerald-600 transition-colors cursor-pointer mr-1 px-2 py-1 rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-700/50"
                title={`Volver a ${sectionName}`}
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Volver a {sectionName}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <Receipt size={16} className="text-emerald-600" />
                <span className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Ticket
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Compartir por WhatsApp"
              >
                <MessageCircle size={16} />
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Copiar Resumen"
              >
                <Share2 size={16} />
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Imprimir Ticket"
              >
                <Printer size={16} />
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Eliminar definitivamente este registro"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Ticket Body: Thermal-like card container */}
          <div ref={ticketRef} className="p-6 overflow-y-auto space-y-5 text-gray-900 dark:text-white">
            
            {/* 1. Datos del Complejo */}
            <div className="text-center space-y-1 pb-4 border-b border-dashed border-gray-200 dark:border-slate-700">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-600 text-white font-black text-xl mb-1 shadow-md shadow-emerald-600/20">
                J
              </div>
              <h2 className="text-lg font-black tracking-tight">
                {complexName}
              </h2>
              {complexAddress && (
                <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center justify-center gap-1">
                  <MapPin size={12} className="shrink-0" />
                  <span>{complexAddress}</span>
                </p>
              )}
              {complexPhone && (
                <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center justify-center gap-1">
                  <Phone size={12} className="shrink-0" />
                  <span>Tel: {complexPhone}</span>
                </p>
              )}
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 pt-1">
                COMPROBANTE DE OPERACIÓN
              </p>
              <div className="flex items-center justify-center gap-2 pt-1 font-mono text-xs text-gray-500 dark:text-slate-400">
                <span className="font-bold text-gray-900 dark:text-white">#{ticketCode}</span>
                <span>•</span>
                <span>{safeFormatDate(emissionDate, "dd/MM/yyyy HH:mm", { locale: es })}</span>
              </div>
            </div>

            {/* 2. Tipo de Operación y Cliente */}
            <div className="text-xs space-y-1.5 pb-3 border-b border-dashed border-gray-200 dark:border-slate-700 font-mono">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-slate-400">Tipo:</span>
                <span className="font-bold text-gray-900 dark:text-white">{operationTypeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-slate-400">Cliente:</span>
                <span className="font-bold text-gray-900 dark:text-white">{displayClientName}</span>
              </div>
              {displayPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-slate-400">Teléfono:</span>
                  <span className="font-medium text-gray-700 dark:text-slate-300">{displayPhone}</span>
                </div>
              )}
            </div>

            {/* 3. Concepto / Detalle de Ítems */}
            <div className="space-y-3 pb-4 border-b border-dashed border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Detalle de Conceptos / Productos
              </div>

              {Array.isArray(operation.items) && operation.items.length > 0 ? (
                <div className="space-y-2.5">
                  {operation.items.map((it, idx) => (
                    <div key={`ticket-item-${it.id || idx}`} className="text-xs">
                      <div className="flex justify-between items-start font-medium">
                        <span className="text-gray-900 dark:text-white font-semibold pr-2">
                          {it.name}
                        </span>
                        <span className="font-black font-mono shrink-0">
                          ${Number(it.subtotal || (it.quantity * it.unitPrice)).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-slate-500 font-mono mt-0.5">
                        {it.quantity} u × ${Number(it.unitPrice).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs flex justify-between items-start font-medium">
                  <div>
                    <span className="text-gray-900 dark:text-white font-semibold">
                      {operation.notes || (operation.operationType === 'court_booking' ? 'Alquiler de Cancha' : 'Operación comercial')}
                    </span>
                    <div className="text-[11px] text-gray-400 font-mono">
                      {operationTypeLabel}
                    </div>
                  </div>
                  <span className="font-black font-mono">
                    ${totalContractual.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Subtotal y Descuentos si aplica */}
              {discount > 0 && (
                <div className="space-y-1 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs font-mono">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>${itemsSubtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Descuento / Bonificación</span>
                    <span>-${discount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* TOTAL OPERACIÓN */}
              <div className="pt-2 flex justify-between items-center text-base font-black border-t border-gray-100 dark:border-slate-800">
                <span className="tracking-tight">TOTAL OPERACIÓN</span>
                <span className="font-mono text-lg text-emerald-600 dark:text-emerald-400">
                  ${totalContractual.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 4. Historial de Pagos y Estado */}
            <div className="space-y-2.5 pb-4 border-b border-dashed border-gray-200 dark:border-slate-700 text-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex justify-between items-center">
                <span>Historial de Pagos Realizados</span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${statusBadge.bg}`}>
                  {statusBadge.label}
                </span>
              </div>

              {hasMovements ? (
                <div className="space-y-2 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-2xl">
                  {movements.map((m, mIdx) => {
                    const mDate = m.effectiveDate?.toDate 
                      ? m.effectiveDate.toDate() 
                      : (m.createdAt?.toDate ? m.createdAt.toDate() : (m.createdAt ? new Date(m.createdAt) : null));

                    return (
                      <div key={`ticket-mov-${m.id || mIdx}`} className="flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-gray-800 dark:text-slate-200">
                            {formatPaymentMethod(m.paymentMethod)}
                          </div>
                          {mDate && (
                            <div className="text-[10px] text-gray-400 font-mono">
                              {safeFormatDate(mDate, "dd/MM/yy HH:mm", { locale: es })}
                            </div>
                          )}
                        </div>
                        <div className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                          +${Number(m.amount).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasLegacyPayments ? (
                <div className="space-y-2 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-2xl">
                  {legacyPayments.map((p, pIdx) => {
                    if (p.method === 'fiado' || Number(p.amount || 0) <= 0) return null;
                    return (
                      <div key={`ticket-leg-pay-${pIdx}`} className="flex justify-between items-center text-xs">
                        <div className="font-bold text-gray-800 dark:text-slate-200">
                          {formatPaymentMethod(p.method)}
                        </div>
                        <div className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                          +${Number(p.amount).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-gray-400 italic text-xs py-1">
                  Sin pagos registrados (Total cobrado: $0)
                </div>
              )}

              {/* Resumen Financiero de Cobros y Saldos */}
              <div className="space-y-1 pt-1 font-mono">
                <div className="flex justify-between text-gray-600 dark:text-slate-400">
                  <span>Total Cobrado:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ${totalCollected.toLocaleString()}
                  </span>
                </div>
                {amountPending > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                    <span>Saldo Pendiente:</span>
                    <span>${amountPending.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Operador y Agradecimiento */}
            <div className="text-center space-y-1.5 pt-1">
              {displayOperator && (
                <p className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                  Atendido por: {displayOperator}
                </p>
              )}
              <p className="text-xs font-bold text-gray-700 dark:text-slate-300">
                ¡Gracias por tu visita!
              </p>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 space-y-2">
            {/* Si tiene saldo pendiente, botón directo para registrar pago */}
            {amountPending > 0 && onRegisterPayment && (
              <button
                type="button"
                onClick={() => onRegisterPayment(operation)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Coins size={16} />
                <span>Registrar Pago (${amountPending.toLocaleString()})</span>
              </button>
            )}

            {/* Botón Volver / Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={14} />
              <span>Volver a {originSection === 'movements' ? 'Movimientos' : (originSection === 'pendings' ? 'Pendientes' : 'Operaciones')}</span>
            </button>

            {/* Botón Eliminar Definitivamente */}
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              className="w-full py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 border border-red-200 dark:border-red-900/50"
            >
              <Trash2 size={13} />
              <span>Eliminar definitivamente</span>
            </button>
          </div>

          {/* Modal de confirmación para Eliminación Definitiva */}
          {showConfirmDelete && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                  <Trash2 size={24} />
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-sm font-black text-gray-900 dark:text-white">
                    ¿Eliminar definitivamente este registro?
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Se borrará de Finanzas, Agenda, Stock y de la base de datos en la nube como si nunca hubiera existido.
                  </p>
                  <div className="p-2 bg-gray-50 dark:bg-slate-800/60 rounded-xl text-xs font-mono text-gray-700 dark:text-slate-300 font-semibold">
                    Ticket #{ticketCode}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setShowConfirmDelete(false)}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeleteRecord}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-red-900/20 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isDeleting ? (
                      <span>Eliminando...</span>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        <span>Eliminar definitivamente</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
