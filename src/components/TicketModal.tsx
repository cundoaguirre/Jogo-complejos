import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store, 
  Wallet, 
  Calendar, 
  Ticket, 
  User as UserIcon, 
  Building2, 
  Phone,
  ShoppingBag,
  CircleDollarSign,
  Landmark,
  CreditCard,
  Clock,
  History
} from 'lucide-react';
import type { OperationDocument, FinancialMovementDocument, User } from '../types';
import { safeFormatDate } from '../lib/utils';
import { es } from 'date-fns/locale';
import { resolveClientName, resolveClientPhone } from '../lib/firestoreSync';

export const JOGO_LOGO_URL = '/assets/aistudio/Photoroom-20260208_161338_e1bc74ca.png';

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
  users = [],
  bookings = []
}) => {
  // Associated booking resolution
  const linkedBooking = useMemo(() => {
    if (!Array.isArray(bookings) || bookings.length === 0 || !operation) return null;
    const cleanBId = operation.bookingId 
      ? String(operation.bookingId).replace('-booking', '') 
      : (operation.id ? String(operation.id).replace('-booking', '') : '');
    if (!cleanBId) return null;
    return bookings.find(b => String(b.id) === cleanBId) || null;
  }, [operation, bookings]);

  // Client name & phone resolution
  const displayClientName = useMemo(() => {
    if (!operation) return 'NN';
    let name = resolveClientName(operation, users, linkedBooking);
    if (name && name !== 'NN') return name;

    if (Array.isArray(movements) && movements.length > 0) {
      for (const m of movements) {
        const mName = resolveClientName(m, users, linkedBooking);
        if (mName && mName !== 'NN') return mName;
      }
    }
    return (operation as any).userName || (operation as any).clientName || 'Consumidor final';
  }, [operation, users, linkedBooking, movements]);

  const displayPhone = useMemo(() => {
    if (!operation) return '';
    let phone = resolveClientPhone(operation, users, linkedBooking);
    if (phone) return phone;
    if (Array.isArray(movements) && movements.length > 0) {
      for (const m of movements) {
        const mPhone = resolveClientPhone(m, users, linkedBooking);
        if (mPhone) return mPhone;
      }
    }
    return (operation as any).userPhone || (operation as any).clientPhone || '';
  }, [operation, users, linkedBooking, movements]);

  // Operation classification
  const isBooking = Boolean(
    operation?.operationType === 'court_booking' || 
    Boolean(operation?.bookingId) || 
    operation?.id?.endsWith('-booking')
  );

  const isExpense = Boolean(
    operation?.operationType === 'expense' || 
    (operation as any)?.flow === 'expense' || 
    (operation as any)?.type === 'expense'
  );

  const isPurchase = Boolean(
    (operation?.operationType as any) === 'inventory_purchase' || 
    (operation as any)?.category === 'compras' || 
    (operation as any)?.category === 'purchase' ||
    (operation as any)?.operationType === 'purchase' ||
    operation?.notes?.toLowerCase().includes('compra')
  );

  const isExpenseOrPurchase = isExpense || isPurchase;

  // Venue details
  const complexName = venueProfile?.name || venueProfile?.company || 'JOGO Complejo';
  const complexPhone = venueProfile?.phone || '';

  // Emission Dates
  const emissionDate = operation?.createdAt?.toDate 
    ? operation.createdAt.toDate() 
    : (operation?.createdAt ? new Date(operation.createdAt) : new Date());

  const formattedCreationDate = useMemo(() => {
    try {
      const raw = safeFormatDate(emissionDate, "d MMM, yyyy, HH:mm", { locale: es });
      return raw ? raw.replace(/\./g, '') : 'Reciente';
    } catch {
      return 'Reciente';
    }
  }, [emissionDate]);

  // Ticket code
  const cleanTicketCode = (operation?.ticketCode || operation?.id?.slice(0, 8) || '').replace(/^#/, '').toUpperCase();

  // Financial calculations
  const totalContractual = Number(operation?.contractualAmount || 0);
  const amountPending = Number(operation?.amountPending || 0);

  // Category / Rubro
  const rubroOrCat = useMemo(() => {
    if (isExpense) {
      return operation?.expenseCategoryName || (operation as any)?.metadata?.rubro || (operation as any)?.category || 'Servicios';
    }
    if (isPurchase) {
      const opAny = operation as any;
      const firstItem = Array.isArray(operation?.items) && operation.items.length > 0 ? (operation.items[0] as any) : null;
      return (
        firstItem?.categoryName || 
        firstItem?.category || 
        opAny?.metadata?.category || 
        opAny?.categoryName || 
        'Mercadería'
      );
    }
    return '';
  }, [isExpense, isPurchase, operation]);

  // Header Title
  const headerTitle = useMemo(() => {
    if (isBooking) return 'Reserva';
    if (isPurchase) return `Compra • ${rubroOrCat || 'Mercadería'}`;
    if (isExpense) return `Gasto • ${rubroOrCat || 'Servicios'}`;
    return 'Mostrador';
  }, [isBooking, isPurchase, isExpense, rubroOrCat]);

  // Entity details (for expense / purchase)
  const entityName = useMemo(() => {
    if (!isExpenseOrPurchase || !operation) return '';
    return operation.entityName || (operation as any).supplierName || (operation as any).responsibleName || (isPurchase ? 'Proveedor' : 'Entidad');
  }, [isExpenseOrPurchase, operation, isPurchase]);

  const entityPhone = useMemo(() => {
    if (!isExpenseOrPurchase || !operation) return '';
    return (operation as any).entityPhone || (operation as any).supplierPhone || displayPhone || '';
  }, [isExpenseOrPurchase, operation, displayPhone]);

  // Booking players list
  const allBookingPlayers = useMemo(() => {
    if (!isBooking) return [];
    const b = linkedBooking || (operation as any)?.originalDoc;
    const hostName = displayClientName !== 'NN' && displayClientName !== 'Consumidor final' 
      ? displayClientName 
      : (b?.clientName || b?.userName || b?.user_name || 'Organizador');
    const hostPhone = displayPhone || b?.phone || b?.clientPhone || b?.userPhone || '';

    const list: Array<{ name: string; phone: string; isHost?: boolean }> = [
      { name: hostName, phone: hostPhone, isHost: true }
    ];

    if (b && Array.isArray(b.players)) {
      b.players.forEach((p: any) => {
        if (!p) return;
        const pName = typeof p === 'string' ? p : (p.name || 'Jugador');
        const pPhone = typeof p === 'object' ? (p.phone || '') : '';
        // Skip if same name as host
        if (pName.trim().toLowerCase() === hostName.trim().toLowerCase()) return;
        list.push({ name: pName, phone: pPhone });
      });
    }

    return list;
  }, [isBooking, linkedBooking, operation, displayClientName, displayPhone]);

  // Booking concept breakdown
  const isCancelled = Boolean(
    linkedBooking?.status === 'cancelled' || 
    (operation as any)?.status === 'cancelled' ||
    (operation as any)?.originalDoc?.status === 'cancelled'
  );

  const bookingCourtName = useMemo(() => {
    const b = linkedBooking || (operation as any)?.originalDoc;
    return b?.courtName || b?.court_name || (b?.courtId ? `Cancha ${b.courtId}` : 'Cancha 1');
  }, [linkedBooking, operation]);

  const bookingTimeRange = useMemo(() => {
    const b = linkedBooking || (operation as any)?.originalDoc;
    const start = b?.startTime || (b?.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '20:00');
    const end = b?.endTime || (b?.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '21:00');
    const raw = `${start} a ${end}`;
    return raw.toLowerCase().startsWith('de ') ? raw : `De ${raw}`;
  }, [linkedBooking, operation]);

  const bookingDateFormatted = useMemo(() => {
    const b = linkedBooking || (operation as any)?.originalDoc;
    const rawDate = b?.date || (b?.start_time ? String(b.start_time).split('T')[0] : '');
    if (rawDate) {
      try {
        const [year, month, day] = rawDate.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const formatted = safeFormatDate(d, "d MMM, yyyy", { locale: es });
        return formatted ? formatted.replace(/\./g, '') : rawDate;
      } catch {
        return rawDate;
      }
    }
    const formatted = safeFormatDate(emissionDate, "d MMM, yyyy", { locale: es });
    return formatted ? formatted.replace(/\./g, '') : '';
  }, [linkedBooking, operation, emissionDate]);

  // Items
  const items = useMemo(() => {
    if (!operation || !Array.isArray(operation.items)) return [];
    return operation.items.map(it => ({
      name: it.name || 'Artículo',
      quantity: Number(it.quantity || 1),
      unitPrice: Number(it.unitPrice || (it as any).price || 0),
      subtotal: Number(it.subtotal || ((it.quantity || 1) * (it.unitPrice || (it as any).price || 0)))
    }));
  }, [operation]);

  // Associated movements formatting (SIN fecha/hora al lado del método)
  const formattedMovements = useMemo(() => {
    if (!operation) return [];
    const effectiveMovements = movements.filter(m => 
      m.operationId === operation.id || 
      (operation.bookingId && (m.bookingId === operation.bookingId || m.operationId === `${operation.bookingId}-booking`)) ||
      (operation.id.endsWith('-booking') && (m.bookingId === operation.id.replace('-booking', '') || m.operationId === operation.id))
    );

    const formatPaymentMethod = (method?: string) => {
      const lower = (method || '').toLowerCase();
      if (lower.includes('transf')) return 'Transferencia';
      if (lower.includes('tarj') || lower.includes('credit') || lower.includes('debit')) return 'Tarjeta';
      if (lower.includes('mercadopago') || lower.includes('mercado_pago')) return 'Mercado Pago';
      if (lower.includes('fiado') || lower.includes('pend') || lower.includes('cuenta corriente')) return 'Cuenta Corriente';
      return 'Efectivo';
    };

    if (effectiveMovements.length > 0) {
      return effectiveMovements.map(m => ({
        method: formatPaymentMethod(m.paymentMethod),
        amount: Number(m.amount || 0)
      }));
    }

    if (Array.isArray((operation as any).payments) && (operation as any).payments.length > 0) {
      return (operation as any).payments.map((p: any) => ({
        method: formatPaymentMethod(p.method),
        amount: Number(p.amount || 0)
      }));
    }

    return [];
  }, [operation, movements]);

  // Helper para íconos de métodos de pago en text-gray-400
  const getPaymentMethodIcon = (method: string) => {
    const lower = method.toLowerCase();
    if (lower.includes('transf')) return <Landmark size={14} className="text-gray-400 shrink-0" />;
    if (lower.includes('tarj') || lower.includes('credit') || lower.includes('debit') || lower.includes('mercadopago') || lower.includes('mercado_pago')) {
      return <CreditCard size={14} className="text-gray-400 shrink-0" />;
    }
    if (lower.includes('fiado') || lower.includes('pend') || lower.includes('cuenta corriente')) {
      return <Clock size={14} className="text-gray-400 shrink-0" />;
    }
    return <CircleDollarSign size={14} className="text-gray-400 shrink-0" />;
  };

  if (!isOpen || !operation) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[360px] mx-auto drop-shadow-2xl select-none overflow-hidden rounded-none my-auto"
        >
          {/* Troquelado superior: 26 crestas continuas y 25 orificios semicirculares exactamente de 10px de alto */}
          <svg viewBox="0 0 572 10" preserveAspectRatio="none" className="w-full h-[10px] block fill-white -mb-[1px]">
            <path d="M 0 10 L 0 8 A 8 8 0 0 0 8 0 L 14 0 A 8 8 0 0 0 30 0 L 36 0 A 8 8 0 0 0 52 0 L 58 0 A 8 8 0 0 0 74 0 L 80 0 A 8 8 0 0 0 96 0 L 102 0 A 8 8 0 0 0 118 0 L 124 0 A 8 8 0 0 0 140 0 L 146 0 A 8 8 0 0 0 162 0 L 168 0 A 8 8 0 0 0 184 0 L 190 0 A 8 8 0 0 0 206 0 L 212 0 A 8 8 0 0 0 228 0 L 234 0 A 8 8 0 0 0 250 0 L 256 0 A 8 8 0 0 0 272 0 L 278 0 A 8 8 0 0 0 294 0 L 300 0 A 8 8 0 0 0 316 0 L 322 0 A 8 8 0 0 0 338 0 L 344 0 A 8 8 0 0 0 360 0 L 366 0 A 8 8 0 0 0 382 0 L 388 0 A 8 8 0 0 0 404 0 L 410 0 A 8 8 0 0 0 426 0 L 432 0 A 8 8 0 0 0 448 0 L 454 0 A 8 8 0 0 0 470 0 L 476 0 A 8 8 0 0 0 492 0 L 498 0 A 8 8 0 0 0 514 0 L 520 0 A 8 8 0 0 0 536 0 L 542 0 A 8 8 0 0 0 558 0 L 564 0 A 8 8 0 0 0 572 8 L 572 10 Z" />
          </svg>

          {/* Cuerpo del ticket térmico blanco */}
          <div className="bg-white text-gray-900 px-7 pt-5 pb-7 rounded-none">
            
            {/* ============================================================== */}
            {/* 1. ENCABEZADO: Tarjeta cuadrada + datos de la sede             */}
            {/* ============================================================== */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-gray-200">
              
              {/* Tarjeta cuadrada izquierda */}
              {isBooking ? (
                <div className="w-14 h-14 rounded-2xl bg-[#ecfdf5] flex items-center justify-center shrink-0">
                  <Calendar size={28} strokeWidth={2} className="text-[#0BA70B]" />
                </div>
              ) : isPurchase ? (
                <div className="w-14 h-14 rounded-2xl bg-[#f5f3ff] flex items-center justify-center shrink-0">
                  <Wallet size={28} strokeWidth={2} className="text-[#7c12e8]" />
                </div>
              ) : isExpense ? (
                <div className="w-14 h-14 rounded-2xl bg-[#fef2f2] flex items-center justify-center shrink-0">
                  <Wallet size={28} strokeWidth={2} className="text-[#e53e3e]" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#eff6ff] flex items-center justify-center shrink-0">
                  <ShoppingBag size={28} strokeWidth={2} className="text-[#1d63b8]" />
                </div>
              )}

              {/* Columna derecha del encabezado */}
              <div className="min-w-0 flex-1">
                {/* Fila 1: Título principal */}
                <h2 className="text-base font-extrabold text-gray-900 leading-tight truncate">
                  {headerTitle}
                </h2>

                {/* Fila 2: Sede (izq) y Teléfono de la sede (der, col fija 115px) en text-gray-400 */}
                <div className="grid grid-cols-[1fr_115px] items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 truncate">
                    <Store size={13} className="text-gray-400 shrink-0" />
                    <span className="truncate">{complexName}</span>
                  </span>
                  <span className="flex items-center justify-end gap-1 text-xs font-medium text-gray-400 shrink-0">
                    <Phone size={12} className="text-gray-400 shrink-0" />
                    <span className="truncate">{complexPhone || '—'}</span>
                  </span>
                </div>

                {/* Fila 3: Fecha de emisión en formato d MMM, yyyy, HH:mm en text-gray-400 */}
                <div className="text-[11px] font-medium text-gray-400 mt-0.5">
                  {formattedCreationDate}
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* 2. SECCIÓN INFORMACIÓN                                         */}
            {/* ============================================================== */}
            <div className="pt-4 space-y-1.5">
              <div className="text-[15px] font-extrabold text-gray-900 mb-1.5">
                Información
              </div>

              {/* Renglón 1: Ticket en text-gray-400 */}
              <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                <Ticket size={14} className="text-gray-400 shrink-0" />
                <span>#{cleanTicketCode}</span>
              </div>

              {/* Renglones de Cliente / Proveedor / Jugadores en text-gray-400 con col derecha 115px */}
              {isBooking ? (
                allBookingPlayers.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_115px] items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 truncate">
                      <UserIcon size={14} className="text-gray-400 shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="flex items-center justify-end gap-1 text-xs font-medium text-gray-400 shrink-0">
                      <Phone size={12} className="text-gray-400 shrink-0" />
                      <span className="truncate">{p.phone || '—'}</span>
                    </span>
                  </div>
                ))
              ) : isExpenseOrPurchase ? (
                <div className="grid grid-cols-[1fr_115px] items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 truncate">
                    <Building2 size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{entityName || (isPurchase ? 'Proveedor' : 'Entidad')}</span>
                  </span>
                  <span className="flex items-center justify-end gap-1 text-xs font-medium text-gray-400 shrink-0">
                    <Phone size={12} className="text-gray-400 shrink-0" />
                    <span className="truncate">{entityPhone || '—'}</span>
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_115px] items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 truncate">
                    <UserIcon size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{displayClientName !== 'NN' ? displayClientName : 'Consumidor final'}</span>
                  </span>
                  <span className="flex items-center justify-end gap-1 text-xs font-medium text-gray-400 shrink-0">
                    <Phone size={12} className="text-gray-400 shrink-0" />
                    <span className="truncate">{displayPhone || '—'}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Línea divisoria 1 */}
            <div className="border-t border-gray-200 my-3.5" />

            {/* ============================================================== */}
            {/* 3. SECCIÓN CONCEPTO                                            */}
            {/* ============================================================== */}
            <div className="space-y-1.5">
              <div className="text-[15px] font-extrabold text-gray-900 mb-1.5">
                Concepto
              </div>

              {isBooking ? (
                /* A. RESERVA: Fila 1 Cancha + Monto en text-gray-400, Fila 2 Fecha, Fila 3 Horario */
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                    <span className="truncate pr-2">
                      {bookingCourtName}{isCancelled ? ' (cancelado)' : ''}
                    </span>
                    <span className="text-gray-400 shrink-0 font-medium">
                      ${totalContractual.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-370 font-normal">
                    <Calendar size={13} className="text-gray-370 shrink-0" />
                    <span>{bookingDateFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-370 font-normal">
                    <Clock size={13} className="text-gray-370 shrink-0" />
                    <span>{bookingTimeRange}</span>
                  </div>
                </div>
              ) : isExpense ? (
                /* GASTO: Concepto + Monto en text-gray-400 */
                <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                  <span className="truncate pr-2">
                    {operation.expenseConceptName || (operation as any).concept || operation.notes || 'Gasto Operativo'}
                  </span>
                  <span className="text-gray-400 shrink-0 font-medium">
                    ${totalContractual.toLocaleString('es-AR')}
                  </span>
                </div>
              ) : items.length > 0 ? (
                /* B / C. MOSTRADOR O COMPRAS CON ARTÍCULOS */
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                        <span className="truncate pr-2">{it.name}</span>
                        <span className="text-gray-400 shrink-0 font-medium">
                          ${it.subtotal.toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-370 font-normal">
                        {it.quantity}u x ${it.unitPrice.toLocaleString('es-AR')} c/u
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* FALLBACK MONO-ARTÍCULO */
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                    <span className="truncate pr-2">
                      {operation.notes || (isPurchase ? 'Compra de mercadería' : 'Venta de mostrador')}
                    </span>
                    <span className="text-gray-400 shrink-0 font-medium">
                      ${totalContractual.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-370 font-normal">
                    1u x ${totalContractual.toLocaleString('es-AR')} c/u
                  </div>
                </div>
              )}

              {/* Renglón de Total */}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100 text-sm font-extrabold text-gray-900">
                <span>Total</span>
                <span>${totalContractual.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Línea divisoria 2 */}
            <div className="border-t border-gray-200 my-3.5" />

            {/* ============================================================== */}
            {/* 4. SECCIÓN MÉTODO DE PAGO / COBRO                              */}
            {/* ============================================================== */}
            <div className="space-y-1.5">
              <div className="text-[15px] font-extrabold text-gray-900 mb-1.5">
                {isExpenseOrPurchase ? 'Método de pago' : 'Método de cobro'}
              </div>

              {/* Métodos de pago con su ícono y SIN fecha/hora al lado en text-gray-400 */}
              {formattedMovements.length > 0 ? (
                formattedMovements.map((m, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs text-gray-400 font-medium">
                    <span className="flex items-center gap-1.5 truncate pr-2">
                      {getPaymentMethodIcon(m.method)}
                      <span className="text-gray-400">{m.method}</span>
                    </span>
                    <span className="text-gray-400 shrink-0 font-medium">
                      ${m.amount.toLocaleString('es-AR')}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                  <span>{isExpenseOrPurchase ? 'Sin pagos registrados' : 'Sin cobros registrados'}</span>
                  <span className="text-gray-400 shrink-0 font-medium">$0</span>
                </div>
              )}

              {/* Renglón Falta cobrar / Falta pagar como título uniforme (text-[15px] font-extrabold text-gray-900) */}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100 text-[15px] font-extrabold">
                <span className="text-gray-900">
                  {isExpenseOrPurchase ? 'Falta pagar' : 'Falta cobrar'}
                </span>
                <span className={amountPending > 0 ? "text-[#dc2626]" : "text-gray-900"}>
                  ${amountPending.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            {/* ============================================================== */}
            {/* 5. PIE DEL TICKET: LEMA + LOGO DE JOGO                         */}
            {/* ============================================================== */}
            <div className="mt-6 pt-5 border-t border-dashed border-gray-200 text-center space-y-2">
              <p className="text-xs font-extrabold tracking-wide uppercase text-gray-400">
                NOS VEMOS EN LA CANCHA!
              </p>
              <img 
                src={JOGO_LOGO_URL} 
                alt="Jogo" 
                className="h-6 w-auto mx-auto block select-none pointer-events-none" 
              />
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
