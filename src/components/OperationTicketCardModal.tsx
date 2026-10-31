import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { 
  Ticket, 
  MoreVertical, 
  Share2, 
  User as UserIcon, 
  Calendar, 
  Clock, 
  X, 
  Plus, 
  Search, 
  MessageCircle, 
  Trash2, 
  Edit3,
  ChevronRight,
  ChevronDown,
  Building2,
  LayoutGrid,
  Package,
  Layers,
  DollarSign
} from 'lucide-react';
import type { OperationDocument, FinancialMovementDocument, User } from '../types';
import { cn, safeFormatDate } from '../lib/utils';
import { 
  updateBookingInFirestore, 
  permanentlyDeleteFinancialRecordInFirestore, 
  resolveClientName, 
  resolveClientPhone,
  formatPhoneForWhatsApp,
  subscribeToVenueProfile
} from '../lib/firestoreSync';
import { shareOrDownloadTicketImage, TicketImageData } from '../lib/ticketImageGenerator';

const normalizePhoneDigits = (phone?: string) => String(phone || '').replace(/\D/g, '');

interface OperationTicketCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: OperationDocument | null;
  movements?: FinancialMovementDocument[];
  users?: User[];
  bookings?: any[];
  complexId?: string;
  onOpenFullTicket?: (op: OperationDocument) => void;
  onOpenSettleModal?: (op: OperationDocument, player?: any) => void;
  onEditBooking?: (booking: any) => void;
  onCancelBooking?: (booking: any) => void;
  onDeleteBooking?: (booking: any) => void;
  onDeleted?: (concept?: string) => void;
  onNavigateToUserProfile?: (userId: string | number, user?: User) => void;
  zIndexClass?: string;
}

function formatRelativeTime(dateInput: any): string {
  if (!dateInput) return 'hace un momento';
  const d = dateInput?.toDate ? dateInput.toDate() : new Date(dateInput);
  if (isNaN(d.getTime())) return 'hace un momento';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'hace 1 min';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'hace 1 día';
  if (diffDays < 30) return `hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  return `hace ${diffMonths} ${diffMonths === 1 ? 'mes' : 'meses'}`;
}

function formatHeaderCreationDate(dateInput: any): string {
  if (!dateInput) return '';
  const d = dateInput?.toDate ? dateInput.toDate() : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  const isSameCalendarDay = (a: Date, b: Date) => 
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameCalendarDay(d, now)) {
    return `Creada hoy, ${timeStr}`;
  }
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  if (isSameCalendarDay(d, yesterday)) {
    return `Creada ayer, ${timeStr}`;
  }
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `Creada el ${d.getDate()} de ${monthNames[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Formato estricto para fechas de reservas: "D Mes, YYYY" (ej: "23 Oct, 2026") sin día de semana.
 */
function formatBookingDateClean(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const monthShorts = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d.getDate()} ${monthShorts[d.getMonth()]}, ${d.getFullYear()}`;
  }
  return dateStr;
}

export const OperationTicketCardModal: React.FC<OperationTicketCardModalProps> = ({
  isOpen,
  onClose,
  operation,
  movements = [],
  users = [],
  bookings = [],
  complexId = 'B',
  onOpenFullTicket,
  onOpenSettleModal,
  onEditBooking,
  onDeleteBooking,
  onDeleted,
  onNavigateToUserProfile,
  zIndexClass = 'z-[70]'
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Comprobante descargado');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [isUpdatingPlayers, setIsUpdatingPlayers] = useState(false);
  const [isPlayersExpanded, setIsPlayersExpanded] = useState(true);

  // Venue profile subscription
  const [venueProfile, setVenueProfile] = useState<any>(null);

  // Drag controls for native-feeling mobile sheet
  const dragControls = useDragControls();
  const menuRef = useRef<HTMLDivElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);

  // Subscribe to venue profile
  useEffect(() => {
    if (!complexId) return;
    const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
    const unsub = subscribeToVenueProfile(targetId, (prof) => {
      setVenueProfile(prof);
    });
    return () => unsub();
  }, [complexId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  // Associated booking resolution
  const associatedBooking = useMemo(() => {
    if (!operation) return null;
    const bId = operation.bookingId || (operation.id.endsWith('-booking') ? operation.id.replace('-booking', '') : null);
    if (!bId) return null;
    return bookings.find(b => String(b.id) === String(bId)) || (operation as any).originalDoc || null;
  }, [operation, bookings]);

  // Type categorization
  const isBooking = operation?.operationType === 'court_booking' || Boolean(operation?.bookingId) || Boolean(associatedBooking);
  const isExpense = operation?.operationType === 'expense' || Boolean((operation as any)?.isExpense);
  const isPurchase = operation?.operationType === 'purchase';
  const isExpenseOrPurchase = isExpense || isPurchase;
  const isSale = !isBooking && !isExpenseOrPurchase;

  const isBookingCancelled = Boolean(
    isBooking && (
      associatedBooking?.status === 'cancelado' ||
      associatedBooking?.status === 'cancelled' ||
      (operation?.paymentStatus as any) === 'cancelled' ||
      (operation as any)?.status === 'cancelado' ||
      (operation as any)?.status === 'cancelled'
    )
  );

  // Block color & hex
  // Mostrador: #1d63b8 | Gastos/Compras: #7c12e8 | Reservas: #0BA70B
  const blockBgClass = isBooking ? 'bg-[#0BA70B]' : isExpenseOrPurchase ? 'bg-[#7c12e8]' : 'bg-[#1d63b8]';

  // Resolved client / entity name
  const resolvedName = useMemo(() => {
    if (!operation) return 'n/n';
    const n = resolveClientName(operation, users, associatedBooking || (operation as any).originalDoc);
    if (!n || n === 'NN' || n === 'Consumidor final') return 'n/n';
    return n;
  }, [operation, users, associatedBooking]);

  const resolvedPhone = useMemo(() => {
    if (!operation) return '';
    return resolveClientPhone(operation, users, associatedBooking || (operation as any).originalDoc);
  }, [operation, users, associatedBooking]);

  // Clean ticket code without '#'
  const cleanTicketCode = useMemo(() => {
    if (!operation) return '';
    const raw = operation.ticketCode || operation.id.slice(0, 8);
    return raw.replace(/^#/, '').toUpperCase();
  }, [operation]);

  // Amounts
  const contractualAmount = Number(operation?.contractualAmount || 0);
  const amountPending = Number(operation?.amountPending || 0);

  // Mostrador distinct products and total units
  const mostradorStats = useMemo(() => {
    if (!isSale || !operation) return { distinct: 0, totalUnits: 0 };
    const items = operation.items || (operation as any).originalDoc?.items || [];
    if (Array.isArray(items) && items.length > 0) {
      const distinct = items.length;
      const totalUnits = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
      return { distinct, totalUnits };
    }
    return { distinct: 1, totalUnits: 1 };
  }, [isSale, operation]);

  // Compras product details: name, total units, unit cost
  const purchaseDetails = useMemo(() => {
    if (!isPurchase || !operation) return { productName: 'Producto', totalUnits: 1, unitCost: 0 };
    const items = operation.items || (operation as any).originalDoc?.items || [];
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      const prodName = first.name || (operation as any).concept || 'Insumo';
      const totalUnits = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
      const unitCost = Number(first.costPrice || first.price || (totalUnits > 0 ? contractualAmount / totalUnits : contractualAmount));
      return { productName: prodName, totalUnits, unitCost };
    }
    return {
      productName: (operation as any).concept || operation.notes || 'Insumo',
      totalUnits: 1,
      unitCost: contractualAmount
    };
  }, [isPurchase, operation, contractualAmount]);

  // Gastos concept and rubro
  const expenseDetails = useMemo(() => {
    if (!isExpense || !operation) return { concept: 'Gasto', rubro: 'Servicios', entity: 'n/n' };
    const concept = operation.notes || operation.expenseConceptName || (operation as any).concept || 'Gasto';
    const rubro = operation.expenseCategoryName || (operation as any).category || (operation as any).rubro || 'Servicios';
    const entity = operation.supplierName || operation.entityName || (operation as any).entity || (resolvedName !== 'n/n' ? resolvedName : 'n/n');
    return { concept, rubro, entity };
  }, [isExpense, operation, resolvedName]);

  // Booking details: Court, Date ("23 Oct, 2026"), Time Range ("17:00 a 18:00")
  const bookingCourtName = useMemo(() => {
    if (!isBooking || !operation) return 'Cancha';
    const b = associatedBooking || (operation as any).originalDoc;
    return b?.courtName || b?.court_name || (operation as any)?.courtName || 'Cancha';
  }, [isBooking, operation, associatedBooking]);

  const bookingDateFormatted = useMemo(() => {
    if (!isBooking) return '';
    const b = associatedBooking || (operation as any)?.originalDoc;
    const rawDate = b?.date || (b?.start_time ? String(b.start_time).split('T')[0] : '') || safeFormatDate(operation?.createdAt, 'yyyy-MM-dd');
    return formatBookingDateClean(rawDate);
  }, [isBooking, associatedBooking, operation]);

  const bookingTimeRange = useMemo(() => {
    if (!isBooking) return '';
    const b = associatedBooking || (operation as any)?.originalDoc;
    const start = b?.startTime || (b?.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '17:00');
    const end = b?.endTime || (b?.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '18:00');
    return `${start} a ${end}`;
  }, [isBooking, associatedBooking, operation]);

  // Organizer display name
  const bookingOrganizerName = useMemo(() => {
    if (!isBooking) return '';
    const b = associatedBooking || (operation as any)?.originalDoc;
    const name = resolvedName !== 'n/n' ? resolvedName : (b?.host_name || operation?.userName || 'Organizador');
    return name;
  }, [isBooking, associatedBooking, operation, resolvedName]);

  // Players list for bookings (occupied list)
  const bookingPlayersList = useMemo(() => {
    if (!isBooking) return [];
    const b = associatedBooking || (operation as any)?.originalDoc;
    const rawPlayers = Array.isArray(b?.players) ? b.players : [];
    
    // Slot 1: Host / Organizer
    const hostId = b?.userId || b?.host_id || operation?.userId || 'host_1';
    const hostInPlayers = rawPlayers.find((p: any) => 
      p.isHost === true ||
      (hostId && (String(p.id) === String(hostId) || String(p.userId) === String(hostId))) ||
      (bookingOrganizerName && p.name && p.name.trim().toLowerCase() === bookingOrganizerName.trim().toLowerCase())
    );

    const guestTotalPaid = rawPlayers
      .filter((p: any) => p !== hostInPlayers)
      .reduce((sum: number, p: any) => sum + Number(p.amountPaid || p.amount_paid || 0), 0);

    const hostIndividualAmount = b?.hostAmountPaid !== undefined
      ? Number(b.hostAmountPaid)
      : (b?.host_amount_paid !== undefined
        ? Number(b.host_amount_paid)
        : (hostInPlayers && (hostInPlayers.amountPaid !== undefined || hostInPlayers.amount_paid !== undefined)
          ? Number(hostInPlayers.amountPaid || hostInPlayers.amount_paid || 0)
          : (rawPlayers.length > 0
            ? Math.max(0, Number(b?.deposit ?? b?.amount_paid ?? 0) - guestTotalPaid)
            : Number(b?.deposit ?? b?.amount_paid ?? operation?.totalCollected ?? 0)
          )
        )
      );

    const hostPlayer = {
      id: hostId,
      userId: hostId,
      name: bookingOrganizerName,
      phone: resolvedPhone || b?.host_phone || operation?.userPhone || '',
      isHost: true,
      amountPaid: hostIndividualAmount
    };

    const guestPlayers = rawPlayers
      .filter((p: any) => p !== hostInPlayers)
      .map((p: any, idx: number) => {
        let pPhone = p.phone || '';
        if (!pPhone && users.length > 0) {
          const pId = p.id || p.userId;
          const matched = users.find(u => (pId && String(u.id) === String(pId)) || (p.name && u.name && u.name.trim().toLowerCase() === p.name.trim().toLowerCase()));
          if (matched?.phone) pPhone = matched.phone;
        }
        return {
          id: p.id || p.userId || `p_${idx}`,
          userId: p.userId || p.id,
          name: p.name || `Jugador ${idx + 2}`,
          phone: pPhone,
          isHost: false,
          amountPaid: Number(p.amountPaid || p.amount_paid || 0)
        };
      });

    return [hostPlayer, ...guestPlayers];
  }, [isBooking, associatedBooking, operation, bookingOrganizerName, resolvedPhone, users]);

  // Reactive real-time filter for available users to add into booking
  const cleanText = (str: string) =>
    String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const cleanSearch = cleanText(playerSearchQuery);
  const searchDigits = playerSearchQuery.replace(/\D/g, '');

  const availableUsersToAdd = useMemo(() => {
    if (!addPlayerModalOpen) return [];
    return (users || []).filter(u => {
      if (!u || !u.name) return false;
      // Excluir jugadores que ya estén en la reserva
      const alreadyInMatch = bookingPlayersList.some(p => 
        (p.id && String(p.id) === String(u.id)) ||
        (p.name && cleanText(p.name) === cleanText(u.name))
      );
      if (alreadyInMatch) return false;

      if (!cleanSearch && !searchDigits) return true;
      const nameMatch = cleanText(u.name).includes(cleanSearch);
      const phoneMatch = searchDigits.length > 0 && String(u.phone || '').replace(/\D/g, '').includes(searchDigits);
      return nameMatch || phoneMatch;
    });
  }, [users, addPlayerModalOpen, bookingPlayersList, cleanSearch, searchDigits]);

  // Handlers for players
  const handleAddPlayer = async (selectedUser: User) => {
    if (!associatedBooking || !associatedBooking.id) return;
    setIsUpdatingPlayers(true);
    try {
      const currentPlayers = Array.isArray(associatedBooking.players) ? [...associatedBooking.players] : [];
      const newPlayerEntry = {
        id: String(selectedUser.id),
        userId: String(selectedUser.id),
        name: selectedUser.name,
        phone: selectedUser.phone || '',
        amountPaid: 0,
        addedAt: new Date().toISOString()
      };
      const updatedPlayers = [...currentPlayers, newPlayerEntry];
      await updateBookingInFirestore(associatedBooking.id, {
        players: updatedPlayers
      });
      setAddPlayerModalOpen(false);
      setPlayerSearchQuery('');
    } catch (err) {
      console.error('Error al agregar jugador:', err);
    } finally {
      setIsUpdatingPlayers(false);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!associatedBooking || !associatedBooking.id) return;
    setIsUpdatingPlayers(true);
    try {
      const currentPlayers = Array.isArray(associatedBooking.players) ? [...associatedBooking.players] : [];
      const updatedPlayers = currentPlayers.filter(p => String(p.id || p.userId) !== String(playerId));
      await updateBookingInFirestore(associatedBooking.id, {
        players: updatedPlayers
      });
    } catch (err) {
      console.error('Error al quitar jugador:', err);
    } finally {
      setIsUpdatingPlayers(false);
    }
  };

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
      onDeleted?.(operation.ticketCode || operation.notes || 'Operación');
      setShowConfirmDelete(false);
      onClose();
    } catch (err) {
      console.error('Error al eliminar registro:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate and share detailed white ticket receipt PNG image
  const handleShare = async () => {
    if (!operation) return;

    // Filter associated movements
    const effectiveMovements = movements.filter(m => 
      m.operationId === operation.id || 
      (operation.bookingId && (m.bookingId === operation.bookingId || m.operationId === `${operation.bookingId}-booking`)) ||
      (operation.id.endsWith('-booking') && (m.bookingId === operation.id.replace('-booking', '') || m.operationId === operation.id))
    );

    // Format movement methods for receipt
    const formattedMovements = effectiveMovements.map(m => {
      let mLabel = 'Efectivo';
      const rawM = (m.paymentMethod || '').toLowerCase();
      if (rawM.includes('transf')) mLabel = 'Transferencia';
      else if (rawM.includes('tarj') || rawM.includes('credit') || rawM.includes('debit')) mLabel = 'Tarjeta';
      else if (rawM.includes('fiado') || rawM.includes('pend')) mLabel = 'Cuenta Corriente';
      return {
        method: mLabel,
        date: (m as any).date || m.createdAt,
        amount: Number(m.amount || 0)
      };
    });

    const ticketData: TicketImageData = {
      ticketCode: cleanTicketCode,
      creationDate: operation.createdAt,
      complexName: venueProfile?.name || venueProfile?.company || 'Complejo Deportivo',
      complexPhone: venueProfile?.phone || '',
      operationType: isBooking ? 'Reserva de Cancha' : isSale ? 'Venta de Mostrador' : isPurchase ? 'Compra de Mercadería' : 'Gasto Operativo',
      categoryOrRubro: isPurchase ? ((operation as any)?.categoryName || (operation as any)?.category || 'Insumos') : isExpense ? expenseDetails.rubro : undefined,
      clientOrEntityLabel: isExpenseOrPurchase ? 'Entidad' : 'Cliente',
      clientOrEntityName: resolvedName !== 'n/n' ? resolvedName : 'Consumidor final',
      clientOrEntityPhone: resolvedPhone,
      players: isBooking ? bookingPlayersList.map(p => ({
        name: p.name,
        phone: p.phone,
        isHost: p.isHost,
        amountPaid: p.amountPaid
      })) : undefined,
      contractualAmount,
      totalCollected: Number(operation.totalCollected || 0),
      amountPending,
      isExpenseOrPurchase,
      movements: formattedMovements,
      items: Array.isArray(operation.items) && operation.items.length > 0 ? operation.items.map(it => ({
        name: it.name,
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.unitPrice || (it as any).price || 0),
        subtotal: Number(it.subtotal || ((it.quantity || 1) * (it.unitPrice || (it as any).price || 0)))
      })) : undefined,
      bookingInfo: isBooking ? {
        courtName: bookingCourtName,
        date: bookingDateFormatted,
        timeRange: bookingTimeRange
      } : undefined,
      expenseInfo: isExpense ? {
        concept: expenseDetails.concept,
        category: expenseDetails.rubro
      } : undefined
    };

    await shareOrDownloadTicketImage(ticketData, (msg) => {
      setToastMessage(msg);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    });
  };

  if (!isOpen || !operation) return null;

  return (
    <AnimatePresence>
      <div 
        className={cn("fixed inset-0 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 pointer-events-auto", zIndexClass || "z-[70]")}
        onClick={onClose}
      >
        {/* ================================================================ */}
        {/* CAPA 1 — HOJA DEL BOTTOM SHEET EXTERIOR (100% BLANCA)           */}
        {/* ================================================================ */}
        <motion.div
          drag="y"
          dragControls={dragControls}
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
          className="bg-white rounded-t-[32px] pt-3 px-3.5 pb-6 shadow-2xl w-full max-w-md mx-auto relative max-h-[92vh] flex flex-col pointer-events-auto"
        >
          {/* Barrita de arrastre centrada con controles táctiles nativos */}
          <div 
            onPointerDown={(e) => dragControls.start(e)}
            className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none" 
          />

          {/* Scrollable Container inside white sheet */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            
            {/* ============================================================== */}
            {/* CAPA 2 — BLOQUE CONTENEDOR DE COLOR (AZUL / VIOLETA / VERDE)   */}
            {/* ============================================================== */}
            <div className={cn("rounded-[28px] p-3.5 sm:p-4 text-white shadow-lg relative overflow-hidden", blockBgClass)}>
              
              {/* CABECERA: 3 puntos (izq) | Ticket + Fecha (centro) | Share (der) — SIN X */}
              <div className="flex items-center justify-between relative">
                
                {/* Izquierda: MoreVertical blanco sin círculo */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(prev => !prev)}
                    className="text-white hover:text-white/80 p-1 cursor-pointer transition-colors"
                    title="Opciones"
                    aria-label="Opciones"
                  >
                    <MoreVertical size={20} />
                  </button>

                  {/* Menú Desplegable */}
                  {menuOpen && (
                    <div className="absolute left-0 top-8 w-44 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 py-1.5 z-50 text-gray-800 dark:text-gray-100 text-xs font-semibold animate-in fade-in zoom-in-95 duration-150">
                      {isBooking ? (
                        <>
                          {!isBookingCancelled && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                const b = associatedBooking || bookings.find(x => String(x.id) === String(operation.bookingId || operation.id.replace('-booking', '')));
                                onEditBooking?.(b || operation);
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Edit3 size={15} className="text-gray-500" />
                              <span>Editar reserva</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setShowConfirmDelete(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer text-red-600 dark:text-red-400 transition-colors"
                          >
                            <Trash2 size={15} />
                            <span>Eliminar reserva</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowConfirmDelete(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                          <span>
                            {isSale ? 'Eliminar venta' : isPurchase ? 'Eliminar compra' : 'Eliminar gasto'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Centro: Fila 1 Ticket sin '#' | Fila 2 Fecha creada */}
                <div className="text-center flex-1 px-2">
                  <div className="flex items-center justify-center gap-1.5">
                    <Ticket size={18} className="text-white shrink-0" />
                    <span className="font-mono font-black text-sm tracking-wide">
                      {cleanTicketCode}
                    </span>
                  </div>
                  <div className="text-xs text-white/80 font-normal mt-0.5">
                    {formatHeaderCreationDate(operation.createdAt)}
                  </div>
                </div>

                {/* Derecha: Share2 blanco sin círculo */}
                <button
                  type="button"
                  onClick={handleShare}
                  className="text-white hover:text-white/80 p-1 cursor-pointer transition-colors"
                  title="Compartir comprobante"
                  aria-label="Compartir comprobante"
                >
                  <Share2 size={20} />
                </button>
              </div>

              {copiedToast && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg z-30 whitespace-nowrap animate-in fade-in">
                  {toastMessage}
                </div>
              )}

              {/* ============================================================ */}
              {/* CAPA 3 — BOLETO TROQUELADO BLANCO INTERIOR                   */}
              {/* TODO EL BOLETO BLANCO ABRE SIEMPRE TICKETMODAL               */}
              {/* ============================================================ */}
              <div 
                onClick={() => onOpenFullTicket?.(operation)}
                className="bg-white rounded-[24px] px-5 py-4 mt-3 relative overflow-hidden shadow-inner text-gray-900 cursor-pointer select-none group"
                title="Toca para ver el comprobante completo"
              >
                
                {/* ----------------- MITAD SUPERIOR ----------------- */}
                <div>
                  {/* Fila 1: Título a la izquierda, Monto total a la derecha */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-center">
                      {isBooking ? (
                        <div className="flex items-center min-w-0">
                          <UserIcon size={14} className="text-gray-500 shrink-0 inline mr-1.5" />
                          <span className="text-xl sm:text-[22px] font-black text-slate-600 truncate">
                            {bookingOrganizerName}
                          </span>
                        </div>
                      ) : isSale ? (
                        <span className="text-xl sm:text-[22px] font-black text-slate-600 truncate">
                          Mostrador
                        </span>
                      ) : isPurchase ? (
                        <span className="text-xl sm:text-[22px] font-black text-slate-600 truncate">
                          {purchaseDetails.productName}
                        </span>
                      ) : (
                        <span className="text-xl sm:text-[22px] font-black text-slate-600 truncate">
                          {expenseDetails.concept}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 text-right font-mono font-black text-xl sm:text-[22px] text-slate-600">
                      ${contractualAmount.toLocaleString('es-AR')}
                    </div>
                  </div>

                  {/* Fila 2: Subtítulo descriptivo izquierda, Tiempo relativo derecha */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs font-medium text-gray-500 truncate pr-2 flex items-center min-w-0">
                      {isBooking ? (
                        <span>{bookingCourtName}</span>
                      ) : isSale ? (
                        <>
                          <UserIcon size={14} className="text-gray-500 shrink-0 inline mr-1.5" />
                          <span className="truncate">{resolvedName}</span>
                        </>
                      ) : isPurchase ? (
                        <>
                          <Building2 size={14} className="text-gray-500 shrink-0 inline mr-1.5" />
                          <span className="truncate">{resolvedName}</span>
                        </>
                      ) : (
                        <>
                          <Building2 size={14} className="text-gray-500 shrink-0 inline mr-1.5" />
                          <span className="truncate">{expenseDetails.entity}</span>
                        </>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-gray-400 font-normal">
                      {formatRelativeTime(operation.createdAt)}
                    </div>
                  </div>
                </div>

                {/* ----------------- LÍNEA DE TROQUELADO CON MUESCAS ----------------- */}
                <div className="relative my-3.5 flex items-center">
                  {/* Muesca izquierda con el color del bloque */}
                  <div 
                    className={cn("w-6 h-6 rounded-full absolute -left-7 top-1/2 -translate-y-1/2 pointer-events-none z-10", blockBgClass)} 
                  />
                  <div className="w-full border-t border-gray-200" />
                  {/* Muesca derecha con el color del bloque */}
                  <div 
                    className={cn("w-6 h-6 rounded-full absolute -right-7 top-1/2 -translate-y-1/2 pointer-events-none z-10", blockBgClass)} 
                  />
                </div>

                {/* ----------------- MITAD INFERIOR ----------------- */}
                <div className="flex items-center justify-between gap-2">
                  {/* Izquierda: Datos del tipo de operación según la Regla de Oro */}
                  <div className="space-y-0.5 text-xs font-medium text-gray-500">
                    {isBooking ? (
                      <>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <Calendar size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>{bookingDateFormatted}</span>
                        </div>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <Clock size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>{bookingTimeRange}</span>
                        </div>
                      </>
                    ) : isSale ? (
                      <>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <Package size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>
                            {mostradorStats.distinct} {mostradorStats.distinct === 1 ? 'Producto' : 'Productos'}
                          </span>
                        </div>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <Layers size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>
                            {mostradorStats.totalUnits} {mostradorStats.totalUnits === 1 ? 'Unidad' : 'Unidades'}
                          </span>
                        </div>
                      </>
                    ) : isPurchase ? (
                      <>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <Package size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>
                            {purchaseDetails.totalUnits} {purchaseDetails.totalUnits === 1 ? 'unidad' : 'unidades'}
                          </span>
                        </div>
                        <div className="flex items-center text-xs font-medium text-gray-500">
                          <DollarSign size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                          <span>
                            ${purchaseDetails.unitCost.toLocaleString('es-AR')}c/u
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center text-xs font-medium text-gray-500">
                        <LayoutGrid size={14} className="text-gray-500 shrink-0 mr-1.5 inline" />
                        <span>{expenseDetails.rubro}</span>
                      </div>
                    )}
                  </div>

                  {/* Derecha: Píldora de estado */}
                  {/* ÚNICAMENTE EL BADGE ROSA FALTAN ABRE PENDINGSETTLEMODAL */}
                  <div className="shrink-0">
                    {isBookingCancelled ? (
                      <span className="bg-red-50 text-red-600 border border-red-200 font-bold text-xs px-3.5 py-1.5 rounded-xl inline-block shadow-2xs select-none">
                        Cancelado
                      </span>
                    ) : amountPending > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSettleModal?.(operation);
                        }}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-600 font-bold text-xs px-3.5 py-1.5 rounded-xl inline-block shadow-2xs cursor-pointer transition-colors active:scale-95"
                        title="Toca para cobrar o pagar saldo pendiente"
                      >
                        Faltan ${amountPending.toLocaleString('es-AR')}
                      </button>
                    ) : (
                      <span className="bg-[#e8effa] text-[#1d63b8] font-bold text-xs px-4 py-1.5 rounded-xl inline-block shadow-2xs">
                        Pagado
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* ============================================================== */}
            {/* SECCIÓN JUGADORES (SOLO RESERVAS): SOBRE EL FONDO BLANCO       */}
            {/* ============================================================== */}
            {isBooking && (
              <div className="pt-2 pb-1 space-y-2">
                {/* Tira informativa superior si la reserva está cancelada */}
                {isBookingCancelled && (
                  <div className="py-1 px-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center justify-between select-none">
                    <span>Turno cancelado · Cobros y jugadores bloqueados</span>
                  </div>
                )}

                {/* Encabezado: "Jugadores" + Flecha colapsable + N/10 */}
                <div 
                  onClick={() => setIsPlayersExpanded(prev => !prev)}
                  className="flex items-center justify-between text-sm font-bold text-slate-700 px-1 cursor-pointer select-none py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Jugadores</span>
                    {isPlayersExpanded ? (
                      <ChevronDown size={15} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={15} className="text-gray-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-400 font-sans">
                    {bookingPlayersList.length}/10
                  </span>
                </div>

                {/* Lista de 10 casilleros exactos con sangría px-3 */}
                {isPlayersExpanded && (
                  <div className="px-3 pt-1 space-y-2 max-h-[240px] overflow-y-auto no-scrollbar">
                    {Array.from({ length: 10 }).map((_, slotIdx) => {
                      const player = bookingPlayersList[slotIdx];

                      if (player) {
                        // ---------------- CASILLERO OCUPADO ----------------
                        const waFormatted = formatPhoneForWhatsApp(player.phone);
                        const bookingCourt = bookingCourtName;
                        const bookingDate = bookingDateFormatted;
                        const bookingTime = bookingTimeRange.split(' ')[0] || '';
                        const waMsg = `Hola ${player.name}! Te escribo por el partido de ${bookingCourt} el ${bookingDate} ${bookingTime}.`;
                        const waUrl = waFormatted ? `https://wa.me/${waFormatted}?text=${encodeURIComponent(waMsg)}` : null;

                        return (
                          <div
                            key={`bk-occupied-slot-${player.id || slotIdx}`}
                            className="flex items-center justify-between py-1 text-xs"
                          >
                            {/* Izquierda: Cuadrado blanco con bordes redondeados + Nombre en negrita */}
                            <div 
                              onClick={() => {
                                if (onNavigateToUserProfile) {
                                  onNavigateToUserProfile(player.id, {
                                    id: player.id,
                                    name: player.name,
                                    phone: player.phone
                                  } as User);
                                }
                              }}
                              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
                              title="Ver perfil del jugador"
                            >
                              <div className="w-9 h-9 rounded-xl border border-gray-200/80 shadow-2xs flex items-center justify-center shrink-0 bg-white text-gray-500">
                                <UserIcon size={16} />
                              </div>
                              <div className="min-w-0 flex items-center flex-wrap">
                                <span className="font-bold text-sm text-slate-700 truncate group-hover:text-[#0BA70B] transition-colors">
                                  {player.name}
                                </span>
                                {player.isHost && (
                                  <span className="font-normal text-xs text-gray-400 ml-1.5">
                                    organizador
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Derecha: 1° Monto interactivo para cobrar | 2° WhatsApp limpio | 3° Botón gris de cruz */}
                            <div className="flex items-center gap-2 shrink-0 pl-2">
                              {/* 1° Monto aportado (bloqueado si está cancelado) */}
                              {isBookingCancelled ? (
                                <span className="text-xs font-bold text-gray-400 cursor-default px-1 select-none">
                                  ${(player.amountPaid || 0).toLocaleString('es-AR')}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const resolvedBId = String(operation?.bookingId || (associatedBooking ? associatedBooking.id : '') || (operation?.id ? operation.id.replace('-booking', '') : ''));
                                    const realBookingOp: OperationDocument = {
                                      ...operation,
                                      id: operation?.id?.endsWith('-booking') ? operation.id : (resolvedBId ? `${resolvedBId}-booking` : (operation?.id || '')),
                                      bookingId: resolvedBId,
                                      ticketCode: operation?.ticketCode || cleanTicketCode || `B-${resolvedBId.slice(0, 6).toUpperCase()}`,
                                      contractualAmount: contractualAmount || Number(associatedBooking?.price ?? associatedBooking?.price_total ?? 0),
                                      amountPending: amountPending,
                                      totalCollected: Number(operation?.totalCollected || associatedBooking?.deposit || associatedBooking?.amount_paid || 0),
                                      userName: bookingOrganizerName,
                                      userPhone: resolvedPhone,
                                      originalDoc: associatedBooking || (operation as any)?.originalDoc
                                    } as OperationDocument;

                                    onOpenSettleModal?.(realBookingOp, {
                                      id: player.id,
                                      userId: player.userId,
                                      name: player.name,
                                      phone: player.phone,
                                      amountPaid: player.amountPaid,
                                      isHost: player.isHost
                                    });
                                  }}
                                  className="text-sm font-bold text-[#0BA70B] underline cursor-pointer px-1 transition-transform active:scale-95"
                                  title={`Cobrar a ${player.name}`}
                                >
                                  ${(player.amountPaid || 0).toLocaleString('es-AR')}
                                </button>
                              )}

                              {/* 2° Icono WhatsApp limpio sin círculo de fondo */}
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 text-[#0BA70B] hover:text-[#088308] bg-transparent cursor-pointer transition-colors"
                                  title={`Enviar WhatsApp a ${player.name}`}
                                  aria-label={`Enviar WhatsApp a ${player.name}`}
                                >
                                  <MessageCircle size={16} />
                                </a>
                              ) : (
                                <span className="p-1 text-gray-300 opacity-40">
                                  <MessageCircle size={16} />
                                </span>
                              )}

                              {/* 3° Botón gris de cruz (solo para invitados, no para el host, oculto si cancelado) */}
                              {!player.isHost && !isBookingCancelled ? (
                                <button
                                  type="button"
                                  disabled={isUpdatingPlayers}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemovePlayer(player.id);
                                  }}
                                  className="p-1 text-gray-400 hover:text-red-500 bg-transparent cursor-pointer transition-colors"
                                  title="Quitar jugador"
                                  aria-label="Quitar jugador"
                                >
                                  <X size={15} />
                                </button>
                              ) : (
                                <div className="w-[23px]" />
                              )}
                            </div>
                          </div>
                        );
                      } else {
                        // ---------------- CASILLERO LIBRE ----------------
                        return (
                          <div
                            key={`bk-free-slot-${slotIdx}`}
                            onClick={() => {
                              if (isBookingCancelled) return;
                              setPlayerSearchQuery('');
                              setAddPlayerModalOpen(true);
                            }}
                            className={cn(
                              "flex items-center gap-2.5 py-1",
                              isBookingCancelled 
                                ? "opacity-40 cursor-not-allowed select-none" 
                                : "cursor-pointer group"
                            )}
                            title={isBookingCancelled ? "Turno cancelado · Bloqueado" : "Toca para agregar jugador"}
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-xl bg-gray-300/80 text-white flex items-center justify-center shrink-0",
                              !isBookingCancelled && "group-hover:bg-gray-400 transition-colors"
                            )}>
                              <Plus size={18} strokeWidth={2.5} />
                            </div>
                            <span className={cn(
                              "text-xs sm:text-sm font-normal text-gray-300",
                              !isBookingCancelled && "group-hover:text-gray-400 transition-colors"
                            )}>
                              Agregar jugador
                            </span>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ============================================================== */}
          {/* MODAL / BOTTOM SHEET: BUSCADOR DESLIZABLE DE JUGADORES LIBRES  */}
          {/* ============================================================== */}
          {addPlayerModalOpen && (
            <div 
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
              onClick={() => setAddPlayerModalOpen(false)}
            >
              <div 
                ref={searchModalRef}
                className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-4 space-y-3 max-h-[80vh] flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1">
                  <h4 className="font-bold text-slate-800 text-sm">
                    Agregar jugador a la reserva
                  </h4>
                  <button
                    type="button"
                    onClick={() => setAddPlayerModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Buscador reactivo que no bloquea keydown ni pointerdown */}
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o teléfono..."
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0BA70B]"
                    autoFocus
                  />
                </div>

                {/* Lista vertical deslizable 100% con el dedo (Scroll táctil libre) */}
                <div 
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                  className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-gray-100 pr-1 no-scrollbar text-xs"
                >
                  {availableUsersToAdd.length === 0 ? (
                    <div className="p-4 text-center text-gray-400">
                      No se encontraron usuarios disponibles
                    </div>
                  ) : (
                    availableUsersToAdd.map(u => (
                      <div
                        key={`add-p-user-${u.id}`}
                        onClick={() => handleAddPlayer(u)}
                        className="py-2.5 px-2 hover:bg-emerald-50/60 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-gray-800">{u.name}</div>
                          {u.phone ? (
                            <div className="text-[10px] text-gray-400 font-mono">{u.phone}</div>
                          ) : null}
                        </div>
                        <span className="text-[#0BA70B] font-bold text-xs">+ Agregar</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sub-Modal de Confirmación para Eliminar Registro */}
          {showConfirmDelete && (
            <div 
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
              onClick={() => setShowConfirmDelete(false)}
            >
              <div 
                className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                  <Trash2 size={24} />
                </div>
                <h4 className="font-bold text-slate-800 text-base">
                  ¿Eliminar {isBooking ? 'reserva' : isSale ? 'venta' : isPurchase ? 'compra' : 'gasto'}?
                </h4>
                <p className="text-xs text-gray-500">
                  Esta acción es definitiva y eliminará todos los registros y movimientos asociados.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeleteRecord}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando...' : 'Eliminar'}
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
