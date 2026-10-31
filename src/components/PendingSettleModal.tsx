import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  motion, 
  AnimatePresence, 
  useDragControls 
} from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  History, 
  CircleDollarSign, 
  CreditCard,
  Landmark,
  Search,
  Building2,
  User as UserIcon
} from 'lucide-react';
import type { FinancialPaymentMethod, User, ExpenseEntity } from '../types';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  registerOperationPaymentsBatch, 
  settleLegacyOrVirtualDebt,
  resolveClientName, 
  resolveClientPhone,
  updateBookingInFirestore,
  registerBookingPaymentInFirestore,
  subscribeToExpenseEntities
} from '../lib/firestoreSync';
import { cn } from '../lib/utils';

const DEFAULT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
const STORAGE_PAYMENT_ORDER_KEY = 'jogo_payment_methods_order';

interface PendingSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: {
    id: string;
    ticketCode?: string;
    userName?: string;
    clientName?: string;
    userPhone?: string;
    clientPhone?: string;
    contractualAmount: number;
    amountPending: number;
    totalCollected?: number;
    concept?: string;
    notes?: string;
    isLegacy?: boolean;
    userId?: string | null;
    bookingId?: string | null;
    originalDoc?: any;
    targetPlayer?: {
      id?: string;
      userId?: string;
      name: string;
      phone?: string;
      amountPaid?: number;
      isHost?: boolean;
    } | null;
  } | null;
  preselectedPlayer?: {
    id?: string;
    userId?: string;
    name: string;
    phone?: string;
    amountPaid?: number;
    isHost?: boolean;
  } | null;
  complexId: string;
  operatorId: string;
  users?: any[];
  bookings?: any[];
  onSuccess?: () => void;
}

interface SettlePaymentRow {
  id: string;
  method: string;
  amount: number | '';
}

function formatBookingDateShort(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const monthShorts = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getDate()} de ${monthShorts[d.getMonth()]}`;
  }
  return dateStr;
}

export const PendingSettleModal: React.FC<PendingSettleModalProps> = ({
  isOpen,
  onClose,
  operation,
  preselectedPlayer,
  complexId,
  operatorId,
  users = [],
  bookings = [],
  onSuccess
}) => {
  const [payments, setPayments] = useState<SettlePaymentRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMethodSheetOpen, setIsMethodSheetOpen] = useState(false);
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
  const [deleteMenuRowId, setDeleteMenuRowId] = useState<string | null>(null);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [assignedClient, setAssignedClient] = useState<{ id?: string; name: string; phone?: string } | null>(null);
  const [isInitialLocked, setIsInitialLocked] = useState(false);
  const [expenseEntities, setExpenseEntities] = useState<ExpenseEntity[]>([]);

  // Drag controls for native mobile sheets
  const mainDragControls = useDragControls();
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Ordered payment methods from shared localStorage
  const [orderedMethods, setOrderedMethods] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PAYMENT_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m: string) => {
            if (m === 'Fiado') return 'Pendiente';
            if (m === 'Crédito' || m === 'Débito') return 'Tarjeta';
            return m;
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_METHODS;
  });

  useEffect(() => {
    const handleOrderChange = () => {
      try {
        const saved = localStorage.getItem(STORAGE_PAYMENT_ORDER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrderedMethods(parsed.map((m: string) => {
              if (m === 'Fiado') return 'Pendiente';
              if (m === 'Crédito' || m === 'Débito') return 'Tarjeta';
              return m;
            }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('jogo_payment_methods_order_changed', handleOrderChange);
    return () => window.removeEventListener('jogo_payment_methods_order_changed', handleOrderChange);
  }, []);

  // Subscribe to real expense entities in Firestore
  useEffect(() => {
    if (!complexId) return;
    const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
    const unsub = subscribeToExpenseEntities(targetId, (ents) => {
      setExpenseEntities(Array.isArray(ents) ? ents : []);
    });
    return () => unsub();
  }, [complexId]);

  // Click outside to close client/entity search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setClientSearchOpen(false);
      }
    };
    if (clientSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [clientSearchOpen]);

  const totalDebt = Math.max(0, Number(operation?.amountPending ?? ((operation?.contractualAmount || 0) - (operation?.totalCollected || 0))));

  // Determine operation type
  const isBooking = Boolean(
    operation?.originalDoc?.operationType === 'court_booking' || 
    operation?.bookingId || 
    operation?.id.endsWith('-booking')
  );
  const isExpense = Boolean(
    (operation as any)?.isExpense || 
    operation?.originalDoc?.operationType === 'expense'
  );
  const isPurchase = Boolean(operation?.originalDoc?.operationType === 'purchase');
  const isExpenseOrPurchase = isExpense || isPurchase;

  // Initialize payment rows and client/entity when modal opens
  useEffect(() => {
    if (isOpen && operation) {
      const debt = totalDebt;
      const firstMethod = orderedMethods[0] || 'Efectivo';
      setPayments([
        { id: `pay_${Date.now()}`, method: firstMethod, amount: isBooking ? '' : debt }
      ]);
      setErrorMsg(null);
      setIsSubmitting(false);
      setIsMethodSheetOpen(false);
      setEditingPaymentIndex(null);
      setDeleteMenuRowId(null);
      setClientSearchOpen(false);

      // Check preselected player first
      const targetP = preselectedPlayer || operation.targetPlayer;

      if (targetP && targetP.name && targetP.name !== 'NN' && targetP.name !== 'n/n') {
        setAssignedClient({
          id: targetP.id || targetP.userId || undefined,
          name: targetP.name,
          phone: targetP.phone || undefined
        });
        setIsInitialLocked(true);
      } else if (isExpenseOrPurchase) {
        // Resolve Entity for expenses/purchases
        const doc = operation.originalDoc || operation;
        const initialEntityName = doc?.supplierName || doc?.entityName || doc?.entity || (operation as any).supplierName;
        if (initialEntityName && initialEntityName !== 'n/n' && initialEntityName !== 'NN') {
          setAssignedClient({
            name: initialEntityName
          });
          setIsInitialLocked(true);
        } else {
          setAssignedClient(null);
          setIsInitialLocked(false);
        }
      } else {
        // Resolve Client for bookings/sales
        const initialClientName = resolveClientName(operation, users, operation.originalDoc);
        const initialClientPhone = resolveClientPhone(operation, users, operation.originalDoc);
        if (initialClientName && initialClientName !== 'NN' && initialClientName !== 'n/n' && initialClientName !== 'Consumidor final') {
          setAssignedClient({
            id: operation.userId || undefined,
            name: initialClientName,
            phone: initialClientPhone || undefined
          });
          setIsInitialLocked(true);
        } else {
          setAssignedClient(null);
          setIsInitialLocked(false);
        }
      }
    }
  }, [isOpen, operation?.id, operation?.amountPending, orderedMethods, users, isExpenseOrPurchase, preselectedPlayer]);

  // Calculations
  const totalAssigned = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const diff = totalAssigned - totalDebt;
  const isSobra = diff > 0.01;
  const isFalta = diff < -0.01;
  const sobrante = Math.max(0, diff);
  const faltante = Math.max(0, -diff);

  // Method icon renderer matching Canva mockups
  const renderMethodIcon = (method: string) => {
    const m = method.toLowerCase();
    if (m.includes('transf') || m.includes('transfer')) {
      return <Landmark size={22} strokeWidth={1.8} className="text-gray-600 shrink-0" />;
    }
    if (m.includes('tarjeta') || m.includes('crédito') || m.includes('credit')) {
      return <CreditCard size={22} strokeWidth={1.8} className="text-gray-600 shrink-0" />;
    }
    if (m.includes('pendiente') || m.includes('fiado')) {
      return <History size={22} strokeWidth={1.8} className="text-gray-600 shrink-0" />;
    }
    return <CircleDollarSign size={22} strokeWidth={1.8} className="text-gray-600 shrink-0" />;
  };

  const handleOpenAddMethodSheet = () => {
    setEditingPaymentIndex(null);
    setIsMethodSheetOpen(true);
  };

  const handleRemovePaymentRow = (id: string) => {
    if (payments.length <= 1) return;
    setPayments(prev => prev.filter(p => p.id !== id));
    setDeleteMenuRowId(null);
  };

  const handleSelectMethod = (method: string) => {
    if (editingPaymentIndex !== null) {
      setPayments(prev => {
        const copy = [...prev];
        copy[editingPaymentIndex] = { ...copy[editingPaymentIndex], method };
        return copy;
      });
    } else {
      // Adding a new row
      const newAmt = faltante > 0 ? faltante : totalDebt;
      setPayments(prev => [
        ...prev,
        { id: `pay_${Date.now()}_${Math.random()}`, method, amount: newAmt }
      ]);
    }
    setIsMethodSheetOpen(false);
    setEditingPaymentIndex(null);
  };

  const mapMethodToFinancial = (m: string): FinancialPaymentMethod => {
    switch (m) {
      case 'Efectivo': return 'cash';
      case 'Transferencia': return 'transfer';
      case 'Tarjeta': return 'credit';
      case 'Pendiente':
      case 'Fiado': return 'other';
      default: return 'cash';
    }
  };

  // Check if has pending payment and requires client
  const hasPendingMethod = payments.some(p => (p.method === 'Pendiente' || p.method === 'Fiado') && (Number(p.amount) || 0) > 0);
  const requiresClient = hasPendingMethod;
  const isMissingRequiredClient = requiresClient && !assignedClient?.name;

  // Confirm settlement
  const handleConfirm = async () => {
    if (!operation) return;

    if (totalAssigned <= 0) {
      setErrorMsg(isExpenseOrPurchase ? 'Debes ingresar un monto a pagar mayor a cero.' : 'Debes ingresar un monto a cobrar mayor a cero.');
      return;
    }

    if (totalAssigned > totalDebt + 0.01) {
      setErrorMsg(isExpenseOrPurchase 
        ? `El pago ($${totalAssigned.toLocaleString('es-AR')}) no puede superar la deuda ($${totalDebt.toLocaleString('es-AR')}).`
        : `El cobro ($${totalAssigned.toLocaleString('es-AR')}) no puede superar la deuda ($${totalDebt.toLocaleString('es-AR')}).`
      );
      return;
    }

    if (isMissingRequiredClient) {
      setErrorMsg('Es obligatorio añadir un cliente cuando hay saldo pendiente.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const displayClientName = assignedClient?.name || operation.userName || 'NN';

      // Si la operación es una Reserva (isBooking o operation.bookingId o operation.id.endsWith('-booking'))
      if (isBooking || operation.bookingId || operation.id.endsWith('-booking')) {
        const resolvedBookingId = String(operation.bookingId || operation.id.replace('-booking', ''));
        const effectiveAmount = payments
          .filter(p => p.method.toLowerCase() !== 'fiado' && p.method.toLowerCase() !== 'pendiente' && (Number(p.amount) || 0) > 0)
          .reduce((sum, p) => sum + Number(p.amount), 0);

        // 1. Registrar cobro oficial en Firestore (actualiza /bookings, /operations y crea /financial_movements)
        for (const p of payments.filter(p => (Number(p.amount) || 0) > 0)) {
          await registerBookingPaymentInFirestore({
            bookingId: resolvedBookingId,
            complexId,
            amount: Number(p.amount),
            paymentMethod: mapMethodToFinancial(p.method),
            operatorId,
            idempotencyKey: `pay_player_${resolvedBookingId}_${preselectedPlayer?.id || 'host'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            notes: `Cobro turno cancha · Jugador: ${preselectedPlayer?.name || displayClientName}`
          });
        }

        // 2. Imputar el pago directamente al jugador dentro de booking.players y registrar aporte individual del organizador
        if (resolvedBookingId) {
          const bRef = doc(db, 'bookings', resolvedBookingId);
          const bSnap = await getDoc(bRef);
          if (bSnap.exists()) {
            const bData = bSnap.data();
            const playersList = Array.isArray(bData.players) ? [...bData.players] : [];
            
            const isTargetHost = Boolean(
              preselectedPlayer?.isHost ||
              (!preselectedPlayer && (displayClientName === bData.host_name || displayClientName === bData.userName)) ||
              (preselectedPlayer?.id && (preselectedPlayer.id === bData.userId || preselectedPlayer.id === bData.host_id)) ||
              (bData.host_name && preselectedPlayer?.name && bData.host_name.trim().toLowerCase() === preselectedPlayer.name.trim().toLowerCase())
            );

            if (preselectedPlayer) {
              const pIdx = playersList.findIndex((p: any) => 
                (preselectedPlayer.id && (p.id === preselectedPlayer.id || p.userId === preselectedPlayer.id)) ||
                (p.name && p.name.trim().toLowerCase() === preselectedPlayer.name.trim().toLowerCase())
              );

              if (pIdx >= 0) {
                const prevAmt = Number(playersList[pIdx].amountPaid || playersList[pIdx].amount_paid || 0);
                playersList[pIdx] = {
                  ...playersList[pIdx],
                  amountPaid: prevAmt + effectiveAmount,
                  amount_paid: prevAmt + effectiveAmount,
                  has_paid: true,
                  ...(isTargetHost ? { isHost: true } : {})
                };
              } else {
                playersList.push({
                  id: preselectedPlayer.id || `player_${Date.now()}`,
                  userId: preselectedPlayer.id || undefined,
                  name: preselectedPlayer.name,
                  phone: preselectedPlayer.phone || '',
                  amountPaid: effectiveAmount,
                  amount_paid: effectiveAmount,
                  has_paid: true,
                  isHost: isTargetHost
                });
              }
            }

            const updateBookingPayload: any = {
              players: playersList,
              updatedAt: serverTimestamp()
            };

            if (isTargetHost) {
              const prevHostAmt = Number(bData.hostAmountPaid ?? bData.host_amount_paid ?? 0);
              updateBookingPayload.hostAmountPaid = prevHostAmt + effectiveAmount;
              updateBookingPayload.host_amount_paid = prevHostAmt + effectiveAmount;
            }

            await updateDoc(bRef, updateBookingPayload);
          }
        }

        setIsSubmitting(false);
        onSuccess?.();
        onClose();
        return;
      }

      const paymentsPayload = payments
        .filter(p => (Number(p.amount) || 0) > 0)
        .map((p, idx) => ({
          amount: Number(p.amount),
          paymentMethod: mapMethodToFinancial(p.method),
          idempotencyKey: `settle_${operation.id}_${Date.now()}_${idx}`,
          notes: isExpenseOrPurchase 
            ? `Pago saldo proveedor (${p.method}) · Ticket ${operation.ticketCode || ''}` 
            : `Cobro deuda pendiente (${p.method}) · Ticket ${operation.ticketCode || ''}`
        }));

      const bId = operation.bookingId || (operation.id.endsWith('-booking') ? operation.id.replace('-booking', '') : null);
      const finalClientName = displayClientName;

      if (operation.isLegacy || operation.id.endsWith('-booking')) {
        await settleLegacyOrVirtualDebt({
          complexId,
          operationId: operation.id,
          operatorId: operatorId || 'pos_operator',
          payments: paymentsPayload,
          ticketCode: operation.ticketCode,
          userName: finalClientName,
          userId: assignedClient?.id || operation.userId,
          bookingId: bId,
          totalPending: totalDebt,
          isExpense: isExpenseOrPurchase,
          notes: isExpenseOrPurchase 
            ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` 
            : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
        });
      } else {
        try {
          await registerOperationPaymentsBatch({
            complexId,
            operationId: operation.id,
            operatorId: operatorId || 'pos_operator',
            payments: paymentsPayload,
            notes: isExpenseOrPurchase 
            ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` 
            : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
          });
        } catch (opErr: any) {
          if (opErr?.message?.includes('no encontrada') || opErr?.message?.includes('not found')) {
            await settleLegacyOrVirtualDebt({
              complexId,
              operationId: operation.id,
              operatorId: operatorId || 'pos_operator',
              payments: paymentsPayload,
              ticketCode: operation.ticketCode,
              userName: finalClientName,
              userId: assignedClient?.id || operation.userId,
              bookingId: bId,
              totalPending: totalDebt,
              isExpense: isExpenseOrPurchase,
              notes: isExpenseOrPurchase 
                ? `Pago pendiente proveedor · Ticket ${operation.ticketCode || ''}` 
                : `Cobro pendiente · Ticket ${operation.ticketCode || ''}`
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

  if (!isOpen || !operation) return null;

  // Header Title
  const headerTitle = isBooking 
    ? 'Cobro de reservas' 
    : isExpense 
    ? 'Pago de gastos' 
    : isPurchase 
    ? 'Pago de compras' 
    : 'Cobro de mostrador';

  // Subtitle
  const amountSubtitle = isExpenseOrPurchase ? 'total a pagar' : 'total a cobrar';

  // Action button title and color
  // Mostrador: #1d63b8 | Gastos: #7c12e8 | Compras: #7c12e8 | Reservas: #0BA70B
  const actionButtonText = isBooking
    ? 'Cobrar reserva'
    : isExpense
    ? 'Finalizar gasto'
    : isPurchase
    ? 'Finalizar compra'
    : 'Finalizar venta';

  const actionButtonColor = isBooking 
    ? 'bg-[#0BA70B] hover:bg-[#099609]' 
    : isExpenseOrPurchase 
    ? 'bg-[#7c12e8] hover:bg-[#680ec9]' 
    : 'bg-[#1d63b8] hover:bg-[#18549e]';

  // Badge background for amount
  const badgeBgColor = isFalta
    ? 'bg-[#fce8e8] text-gray-900'
    : isExpenseOrPurchase
    ? 'bg-[#f1e8fc] text-[#7c12e8]'
    : isBooking
    ? 'bg-emerald-100 text-[#0BA70B]'
    : 'bg-[#e8f0fe] text-[#1d63b8]';

  // Search results for Clients (users) or Entities (expenseEntities)
  const filteredUsers = users.filter((u: any) => {
    if (!clientSearchQuery) return true;
    const q = clientSearchQuery.toLowerCase();
    return (u.name && u.name.toLowerCase().includes(q)) || (u.phone && u.phone.includes(q));
  }).slice(0, 10);

  const filteredEntities = expenseEntities.filter((e: any) => {
    if (!clientSearchQuery) return true;
    const q = clientSearchQuery.toLowerCase();
    return e.name && e.name.toLowerCase().includes(q);
  }).slice(0, 10);

  // Concept breakdown info under giant amount
  const breakdownInfo = (() => {
    if (isBooking) {
      const b = operation.originalDoc;
      const courtName = b?.courtName || b?.court_name || 'Cancha 1';
      const start = b?.startTime || (b?.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '17:00');
      const end = b?.endTime || (b?.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '18:00');
      const timeStr = `${start} a ${end}`;
      const rawDate = b?.date || (b?.start_time ? String(b.start_time).split('T')[0] : '');
      const dateClean = formatBookingDateShort(rawDate);
      return {
        line1: courtName,
        line2: timeStr,
        right: dateClean || `$${totalDebt.toLocaleString('es-AR')}`
      };
    }
    if (isPurchase) {
      const items = operation.originalDoc?.items || [];
      const firstItem = items[0];
      const prodName = firstItem?.name || operation.concept || 'Compra de insumos';
      const qty = firstItem?.quantity || 1;
      const price = firstItem?.costPrice || firstItem?.price || totalDebt;
      return {
        line1: `${prodName} x ${qty}u`,
        line2: `$${price.toLocaleString('es-AR')} c/u`,
        right: `$${totalDebt.toLocaleString('es-AR')}`
      };
    }
    if (isExpense) {
      return {
        line1: operation.concept || operation.notes || 'Gasto operativo',
        line2: operation.originalDoc?.expenseCategoryName || '',
        right: `$${totalDebt.toLocaleString('es-AR')}`
      };
    }
    // Mostrador
    const items = operation.originalDoc?.items || [];
    if (items.length > 0) {
      const first = items[0];
      return {
        line1: `${first.name} x ${first.quantity || 1}u`,
        line2: `$${(first.price || first.unitPrice || 0).toLocaleString('es-AR')} c/u`,
        right: `$${totalDebt.toLocaleString('es-AR')}`
      };
    }
    return {
      line1: operation.concept || 'Venta mostrador',
      line2: '',
      right: `$${totalDebt.toLocaleString('es-AR')}`
    };
  })();

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          drag="y"
          dragControls={mainDragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 500) {
              onClose();
            }
          }}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-[32px] pt-3 px-4 pb-6 shadow-2xl w-full max-w-md mx-auto relative max-h-[92vh] flex flex-col pointer-events-auto"
        >
          {/* Barrita de arrastre centrada con controles táctiles nativos */}
          <div 
            onPointerDown={(e) => mainDragControls.start(e)}
            className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none" 
          />

          {/* CABECERA: Chevron Left + Título centrado (SIN X a la derecha) */}
          <div className="flex items-center justify-between pb-1 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1 -ml-1 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
              title="Volver"
              aria-label="Volver"
            >
              <ChevronLeft size={22} />
            </button>
            <h3 className="font-bold text-gray-900 text-base">
              {headerTitle}
            </h3>
            {/* Espaciador simétrico para centrar perfectamente el título */}
            <div className="w-7" />
          </div>

          {/* CUERPO CON SCROLL */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3.5 py-1">
            
            {/* MONTO CENTRAL GIGANTE */}
            <div className="text-center pt-1 pb-1">
              <span className="text-xs text-gray-400 font-medium block">
                {amountSubtitle}
              </span>
              <span className="font-mono font-black text-4xl sm:text-5xl text-gray-900 tracking-tight block mt-1">
                ${totalDebt.toLocaleString('es-AR')}
              </span>

              {/* Desglose sin negrita debajo del monto */}
              <div className="flex items-center justify-between text-xs text-gray-400 max-w-xs mx-auto pt-2 px-1">
                <div className="text-left">
                  <div className="text-gray-500 font-normal">{breakdownInfo.line1}</div>
                  {breakdownInfo.line2 && (
                    <div className="text-[11px] text-gray-400 font-normal">{breakdownInfo.line2}</div>
                  )}
                </div>
                <div className="text-right text-gray-400 font-normal">
                  {breakdownInfo.right}
                </div>
              </div>
            </div>

            {/* SECCIÓN CLIENTE / ENTIDAD */}
            <div className="pt-1">
              {assignedClient ? (
                <div className="flex items-center justify-between py-1 px-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {preselectedPlayer ? `Cliente: ${assignedClient.name}` : assignedClient.name}
                    </p>
                    {assignedClient.phone && (
                      <p className="text-xs text-gray-400 font-mono">
                        {assignedClient.phone}
                      </p>
                    )}
                  </div>
                  {/* Botón de tacho de basura: oculto si la entidad/cliente ya venía fija o es preselectedPlayer */}
                  {!isInitialLocked && !preselectedPlayer && (
                    <button
                      type="button"
                      onClick={() => setAssignedClient(null)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg cursor-pointer transition-colors"
                      title={isExpenseOrPurchase ? "Quitar entidad" : "Quitar cliente"}
                      aria-label={isExpenseOrPurchase ? "Quitar entidad" : "Quitar cliente"}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative" ref={searchDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setClientSearchOpen(prev => !prev)}
                    className={cn(
                      "text-xs font-bold transition-colors cursor-pointer py-1 px-1",
                      isMissingRequiredClient 
                        ? "text-red-600 hover:text-red-700" 
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {isMissingRequiredClient 
                      ? "+ Añadir cliente (Obligatorio) *" 
                      : isExpenseOrPurchase 
                      ? "+ Añadir entidad (opcional)" 
                      : "+ Añadir cliente (opcional)"}
                  </button>

                  {/* Popover / Search dropdown */}
                  {clientSearchOpen && (
                    <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-40 space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder={isExpenseOrPurchase ? "Buscar entidad..." : "Buscar cliente..."}
                          value={clientSearchQuery}
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-2 py-1.5 text-xs bg-gray-50 rounded-lg outline-none focus:ring-1 focus:ring-gray-300"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-gray-100 text-xs no-scrollbar">
                        {isExpenseOrPurchase ? (
                          filteredEntities.length === 0 ? (
                            <div className="p-2 text-center text-gray-400">Sin coincidencias</div>
                          ) : (
                            filteredEntities.map((ent: any) => (
                              <div
                                key={`p-entity-opt-${ent.id}`}
                                onClick={() => {
                                  setAssignedClient({ id: ent.id, name: ent.name });
                                  setClientSearchOpen(false);
                                  setClientSearchQuery('');
                                }}
                                className="p-2 hover:bg-gray-50 rounded-lg flex items-center justify-between cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <Building2 size={14} className="text-gray-400 shrink-0" />
                                  <span className="font-bold text-gray-900 block">{ent.name}</span>
                                </div>
                                <span className="text-xs font-bold text-emerald-600">Elegir</span>
                              </div>
                            ))
                          )
                        ) : (
                          filteredUsers.length === 0 ? (
                            <div className="p-2 text-center text-gray-400">Sin coincidencias</div>
                          ) : (
                            filteredUsers.map((u: any) => (
                              <div
                                key={`p-client-opt-${u.id}`}
                                onClick={() => {
                                  setAssignedClient({ id: u.id, name: u.name, phone: u.phone });
                                  setClientSearchOpen(false);
                                  setClientSearchQuery('');
                                }}
                                className="p-2 hover:bg-gray-50 rounded-lg flex items-center justify-between cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <UserIcon size={14} className="text-gray-400 shrink-0" />
                                  <div>
                                    <span className="font-bold text-gray-900 block">{u.name}</span>
                                    {u.phone && <span className="text-[10px] text-gray-400 font-mono">{u.phone}</span>}
                                  </div>
                                </div>
                                <span className="text-xs font-bold text-emerald-600">Elegir</span>
                              </div>
                            ))
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ERROR MESSAGE IF ANY */}
            {errorMsg && (
              <div className="bg-red-50 text-red-600 text-xs font-semibold px-3 py-2 rounded-xl border border-red-200">
                {errorMsg}
              </div>
            )}

            {/* SECCIÓN MÉTODOS DE PAGO */}
            <div className="space-y-1.5 pt-1">
              <div className="text-sm font-bold text-gray-700 text-left">
                Método de pago
              </div>

              <div className="space-y-2">
                {payments.map((p, idx) => {
                  const isDeleteOpen = deleteMenuRowId === p.id;

                  return (
                    <div
                      key={`settle-pay-row-${p.id}`}
                      className="bg-transparent border-none py-1 relative"
                    >
                      <div className="flex items-center justify-between w-full">
                        {/* Zona 1: Icono + Nombre del método (abre selección de método) */}
                        <div 
                          onClick={() => {
                            setEditingPaymentIndex(idx);
                            setIsMethodSheetOpen(true);
                          }}
                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer py-1"
                        >
                          {renderMethodIcon(p.method)}
                          <span className="font-bold text-sm text-gray-900 truncate">
                            {p.method}
                          </span>
                        </div>

                        {/* Zona 2: Badge de Monto SIN BORDE */}
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={
                              p.amount === '' || p.amount === undefined || p.amount === null
                                ? ''
                                : Number(p.amount).toLocaleString('es-AR')
                            }
                            onChange={(e) => {
                              const rawDigits = e.target.value.replace(/\D/g, '');
                              setPayments(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], amount: rawDigits === '' ? '' : Number(rawDigits) };
                                return copy;
                              });
                            }}
                            className={cn(
                              "border-0 border-none ring-0 focus:ring-0 outline-none rounded-lg px-3 py-1.5 w-24 text-center font-bold text-xs sm:text-sm transition-colors",
                              badgeBgColor
                            )}
                          />

                          {/* Zona 3: Chevron > que abre floating badge para borrar */}
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteMenuRowId(isDeleteOpen ? null : p.id);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition-colors"
                              title="Opciones de fila"
                              aria-label="Opciones de fila"
                            >
                              <ChevronRight size={18} />
                            </button>

                            {/* Floating Popover: Borrar método de pago */}
                            {isDeleteOpen && (
                              <div className="absolute right-0 top-full mt-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePaymentRow(p.id)}
                                  className="px-3 py-1.5 bg-white rounded-xl shadow-xl border border-gray-200 text-gray-500 hover:text-red-600 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                                >
                                  <Trash2 size={13} />
                                  <span>Borrar método de pago</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Renglón interactivo alineado bajo el badge: Faltan / Sobran */}
                      {faltante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPayments(prev => {
                                const copy = [...prev];
                                const cur = Number(copy[idx].amount) || 0;
                                copy[idx] = { ...copy[idx], amount: cur + faltante };
                                return copy;
                              });
                            }}
                            className="text-[11px] font-bold text-rose-600 underline cursor-pointer"
                          >
                            Faltan ${faltante.toLocaleString('es-AR')}
                          </button>
                        </div>
                      )}

                      {sobrante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPayments(prev => {
                                const copy = [...prev];
                                const cur = Number(copy[idx].amount) || 0;
                                copy[idx] = { ...copy[idx], amount: Math.max(0, cur - sobrante) };
                                return copy;
                              });
                            }}
                            className="text-[11px] font-bold text-blue-600 underline cursor-pointer"
                          >
                            Sobran ${sobrante.toLocaleString('es-AR')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Botón + agregar método de pago (con un solo '+') */}
              {payments.length < orderedMethods.length && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleOpenAddMethodSheet}
                    className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 hover:border-gray-400 text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>+ agregar método de pago</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* BOTÓN FINALIZAR (ANCHO COMPLETO) */}
          <div className="pt-3 shrink-0">
            <button
              type="button"
              disabled={isSubmitting || totalAssigned <= 0 || isMissingRequiredClient}
              onClick={handleConfirm}
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold text-white text-base shadow-lg active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none",
                actionButtonColor
              )}
            >
              {isSubmitting ? 'Procesando...' : actionButtonText}
            </button>
          </div>

          {/* SUB-BOTTOM SHEET: AGREGAR MÉTODO DE PAGO */}
          {isMethodSheetOpen && (
            <div 
              className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
              onClick={() => setIsMethodSheetOpen(false)}
            >
              <div 
                className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Barrita de arrastre */}
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-2" />

                <div className="text-center pb-1">
                  <h4 className="font-bold text-gray-900 text-base">
                    Agregar método de pago
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Mantené presionado para elegir el orden
                  </p>
                </div>

                <div className="divide-y divide-gray-100">
                  {orderedMethods.map((m) => (
                    <button
                      key={`choose-method-${m}`}
                      type="button"
                      onClick={() => handleSelectMethod(m)}
                      className="w-full py-3.5 px-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        {renderMethodIcon(m)}
                        <span className="font-bold text-sm text-gray-800">
                          {m}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
