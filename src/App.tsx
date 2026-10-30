import React, { Component, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, Reorder, useDragControls } from 'motion/react';
import { 
  LayoutDashboard, Users, Calendar, CalendarPlus, TrendingUp, TrendingDown, DollarSign, CalendarCheck, Percent, Clock, 
  Search, Bell, Menu, X, Phone, MapPin, Star, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, List, Plus, Sparkles,
  ArrowLeft, ArrowRight, Wallet, ArrowUpRight, ArrowDownRight, ArrowDownLeft, Store, Instagram, Check, ShieldCheck, 
  Car, Utensils, Wifi, Coffee, Shirt, Camera, Edit3, Trash2, ShoppingBag, ShoppingBasket, Flame, Moon, Sun, Eye, EyeOff, User as UserIcon, UserCheck, UserPlus, BarChart2, MoreVertical, MoreHorizontal, FileText, Download,
  MessageSquare, MessageCircle, Send, Bug, Lightbulb, Headphones, MousePointer, Activity, Target, Trophy, Wrench, Package, Zap, LogOut, LogIn, AlertCircle, AlertTriangle,
  Coins, Receipt, CheckCircle2, Mail, Copy, Building2, CreditCard, Info, Pencil, Footprints, Share2,
  Landmark, CircleDollarSign, History, GripVertical
} from 'lucide-react';
import { format, differenceInDays, isSameDay, isSameWeek, isSameMonth, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { User, Match, Transaction, DashboardStats, Court } from './types';
import { logCrashReport } from './logger';
import { ContactSupportModal } from './components/ContactSupportModal';
import { useFirebase } from './components/FirebaseContext';
import { LandingAuthView } from './components/LandingAuthView';
import { AccessDeniedView } from './components/AccessDeniedView';
import { InviteView } from './components/InviteView';
import { BillingNoticeModal } from './components/BillingNoticeModal';
import { PayBalanceModal } from './components/PayBalanceModal';
import { 
  calculateWeeklyObligations, 
  evaluateBillingNoticeState, 
  syncPlayedBookings,
  type WeeklyPaymentObligation,
  type BillingNoticeState 
} from './lib/weeklyBilling';
import { createSaasInvitation } from './lib/invitations';
import { calculateUserLifecycleMetrics, formatDDMMYY, parseYMD, differenceInCalendarDays, isBookingPlayed, type UserLifecycleMetrics } from './lib/userMetrics';
import { buildCrmActivityIndex, normalizePhoneNumber, isGenericPlaceholderName, findMatchingLocalUser } from './lib/crmActivityIndex';
import { computeComplexFinancialSummary } from './lib/financialMath';
import { doc, getDoc, getDocs, collection, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { 
  getActiveComplexId,
  formatBookingToMatch,
  subscribeToBookings,
  createBookingInFirestore,
  updateBookingInFirestore,
  deleteBookingInFirestore,
  subscribeToCourts,
  saveCourtInFirestore,
  deleteCourtInFirestore,
  subscribeToClients,
  saveClientInFirestore,
  deleteClientInFirestore,
  subscribeToVenueProfile,
  saveVenueProfileInFirestore,
  subscribeToTransactions,
  settleFiadoTransaction,
  subscribeToOperations,
  subscribeToFinancialMovements,
  registerBookingPaymentInFirestore,
  timeStringToMinutes,
  intervalsOverlap,
  resolveClientName,
  resolveClientPhone,
  subscribeToExpenseCategories,
  subscribeToExpenseItems,
  permanentlyDeleteFinancialRecordInFirestore
} from './lib/firestoreSync';
import type { OperationDocument, FinancialMovementDocument, ProductCategory, Product, FinancialPaymentMethod } from './types';
import { POSView } from './components/POSView';
import { POSModal } from './components/POSModal';
import { CatalogInventorySection } from './components/CatalogInventorySection';
import { CuentasCorrientesSection } from './components/CuentasCorrientesSection';
import { MostradorBottomSheet } from './components/MostradorBottomSheet';
import { POSCartProvider } from './components/POSCartContext';
import { TicketModal } from './components/TicketModal';
import { PendingSettleModal } from './components/PendingSettleModal';
import { CancelBookingModal } from './components/CancelBookingModal';
import { DeleteBookingModal } from './components/DeleteBookingModal';

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log structured crash report to console with component hierarchy
    logCrashReport(error, errorInfo, { section: this.props.sectionName || 'SectionErrorBoundary' });
    this.setState({ errorInfo });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-white dark:bg-slate-800 rounded-3xl border border-red-100 dark:border-red-900/40 shadow-xl my-6 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3 font-black text-xl">
            ⚠️
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            Error en la sección {this.props.sectionName ? `"${this.props.sectionName}"` : ''}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 font-mono">
            {this.state.error?.name}: {this.state.error?.message || 'Error desconocido'}
          </p>
          <div className="flex gap-2 justify-center">
            <button 
              type="button"
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })} 
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer"
            >
              Reintentar cargar sección
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function safeFormatDate(dateVal: any, formatStr: string, options?: any, fallback = '-'): string {
  if (!dateVal) return fallback;
  try {
    const d = typeof dateVal === 'string' ? parseISO(dateVal) : (dateVal instanceof Date ? dateVal : new Date(dateVal));
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr, options);
  } catch (e) {
    return fallback;
  }
}

export function safeParseDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  try {
    const d = typeof dateVal === 'string' ? parseISO(dateVal) : (dateVal instanceof Date ? dateVal : new Date(dateVal));
    if (isNaN(d.getTime())) return null;
    return d;
  } catch (e) {
    return null;
  }
}

export type NavTabId = 'finance' | 'schedule' | 'users' | 'profile' | 'analytics';

export interface NavItemDef {
  id: NavTabId;
  label: string;
  icon: any;
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  { id: 'finance', label: 'Finanzas', icon: DollarSign },
  { id: 'schedule', label: 'Agenda', icon: Calendar },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'profile', label: 'Perfil', icon: Store },
];

/**
 * Determina si dos canchas tienen bloqueo mutuo bidireccional por superposición física.
 */
export const areCourtsMutuallyBlocked = (
  courtAId: string | number | undefined | null,
  courtBId: string | number | undefined | null,
  courtsList: any[]
): boolean => {
  if (!courtAId || !courtBId) return false;
  const strA = String(courtAId);
  const strB = String(courtBId);
  if (strA === strB) return false;

  const courtA = (courtsList || []).find(c => String(c.id) === strA);
  const courtB = (courtsList || []).find(c => String(c.id) === strB);

  const aBlocksB = Array.isArray(courtA?.blockedCourts) && courtA.blockedCourts.map(String).includes(strB);
  const bBlocksA = Array.isArray(courtB?.blockedCourts) && courtB.blockedCourts.map(String).includes(strA);

  return Boolean(aBlocksB || bBlocksA);
};

const Sidebar = ({ 
  active, 
  onNavigate, 
  onAction, 
  isOpen, 
  onClose, 
  isDarkMode, 
  onToggleDarkMode,
  activeComplex,
  onOpenActivation,
  user,
  collaboratorData,
  onLogout
}: { 
  active: NavTabId | string, 
  onNavigate: (tab: NavTabId) => void, 
  onAction: (action: string) => void, 
  isOpen: boolean, 
  onClose: () => void, 
  isDarkMode?: boolean, 
  onToggleDarkMode?: () => void,
  activeComplex?: any | null,
  onOpenActivation?: () => void,
  user?: any,
  collaboratorData?: any,
  onLogout?: () => void
}) => {
  // Context-sensitive menu items
  const getMenuItems = () => {
    switch (active) {
      case 'schedule':
        return [
          { id: 'exposure', label: 'Estadísticas', icon: TrendingUp, action: 'exposure' },
          { id: 'demand', label: 'Horarios Mayor Demanda', icon: Clock, action: 'demand' }
        ];
      case 'users':
        return [
          { id: 'retention', label: 'Cohortes de Retención', icon: Users, action: 'retention' }
        ];
      case 'finance':
        return [
          { id: 'chart', label: 'Gráfico Financiero', icon: BarChart2, action: 'chart' },
          { id: 'reports', label: 'Descargar Resúmenes', icon: FileText, action: 'reports' }
        ];
      case 'profile':
        return [
          { id: 'personal_info', label: 'Información personal', icon: UserIcon, action: 'personal_info' },
          { id: 'support', label: 'Mesa de Ayuda / Soporte', icon: MessageSquare, action: 'support' }
        ];
      default:
        return [
          { id: 'exposure', label: 'Estadísticas', icon: TrendingUp, action: 'exposure' }
        ];
    }
  };

  const menuItems = getMenuItems();

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }} 
        />
      )}
      
      {/* Sidebar Container */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className={cn(
        "fixed lg:static inset-y-0 left-0 w-64 bg-slate-900 text-white z-50 transition-transform duration-300 transform flex flex-col shadow-2xl lg:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-emerald-400">JOGO <span className="text-slate-400 text-sm font-normal">Manager</span></h1>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="lg:hidden text-slate-400 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          {activeComplex && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Store size={18} />
              </div>
              <div className="truncate">
                <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Complejo Activo</p>
                <p className="text-xs font-bold text-white truncate">{activeComplex.name || 'Mi Complejo'}</p>
              </div>
            </div>
          )}

          {menuItems.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 tracking-wider mb-3 px-2">
                {active === 'schedule' ? 'OPCIONES DE AGENDA' : 
                 active === 'users' ? 'OPCIONES DE USUARIOS' : 
                 active === 'finance' ? 'OPCIONES FINANCIERAS' : 'OPCIONES'}
              </div>
              
              <nav className="space-y-2">
                {menuItems.map((item, mIdx) => (
                  <button
                    type="button"
                    key={`sidebar-tool-${item.id}-${mIdx}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAction(item.action); 
                      onClose(); 
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 border border-slate-700/50 hover:border-emerald-500/40 text-sm font-medium cursor-pointer active:scale-[0.98]"
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (onOpenActivation) onOpenActivation();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700/50 text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
            >
              <ShieldCheck size={16} className="text-emerald-400" />
              <span>Activar / Canjear Complejo</span>
            </button>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800 space-y-3">
          {/* Dark Mode Switch */}
          <div className="bg-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                isDarkMode ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-300"
              )}>
                {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
              </div>
              <div>
                <div className="text-xs font-bold text-white">Modo Nocturno</div>
                <div className="text-[10px] text-slate-400">
                  {isDarkMode ? 'Prendido' : 'Apagado'}
                </div>
              </div>
            </div>
            
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onToggleDarkMode) onToggleDarkMode();
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isDarkMode ? "bg-emerald-600" : "bg-slate-700"
              )}
              role="switch"
              aria-checked={isDarkMode}
              title={isDarkMode ? "Modo nocturno prendido (clic para apagar)" : "Modo nocturno apagado (clic para prender)"}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center text-[10px]",
                  isDarkMode ? "translate-x-5 text-emerald-600" : "translate-x-0 text-slate-600"
                )}
              >
                {isDarkMode ? <Moon size={10} strokeWidth={3} /> : <Sun size={10} strokeWidth={3} />}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Operador'} className="w-9 h-9 rounded-full object-cover border border-slate-700 flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-900/80 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0 border border-emerald-700/50">
                  {user?.displayName?.[0] || user?.email?.[0] || 'O'}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-bold text-xs text-white truncate max-w-[120px]">
                  {activeComplex?.name || collaboratorData?.memberships?.[0]?.complexName || 'Mi Sede'}
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {user?.email || 'Operador'}
                </div>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Cerrar Sesión"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const StatCard = ({ title, value, trend, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon size={24} className="text-white" />
      </div>
      {trend && (
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
          {trend}
        </span>
      )}
    </div>
    <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
    <div className="text-sm text-gray-500">{title}</div>
  </div>
);

interface NewUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: any) => Promise<void> | void;
  initialData?: User | null;
  isEdit?: boolean;
  existingUsers?: User[];
}

const NewUserModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData = null, 
  isEdit = false, 
  existingUsers = [] 
}: NewUserModalProps) => {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    gender: initialData?.gender || 'hombre',
    acquisitionChannel: '',
    category: initialData?.category || 'jugador',
    birthDate: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        email: initialData?.email || '',
        address: initialData?.address || initialData?.city || '',
        gender: initialData?.gender || 'hombre',
        acquisitionChannel: initialData?.acquisitionChannel || '',
        category: initialData?.category || 'jugador',
        birthDate: initialData?.birthDate || ''
      });
      setError(null);
      setIsSubmitting(false);

      if (!isEdit) {
        const timer = setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, initialData, isEdit]);

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
      const initialNormPhone = initialData?.phone ? normalizePhoneNumber(initialData.phone) : null;
      const duplicate = existingUsers.find(u => {
        if (currentId && String(u.id) === currentId) return false;
        if (u.isDerived || String(u.id).startsWith('derived_')) return false;
        if (initialNormPhone && initialNormPhone === normPhone && (
          (u.canonicalId && initialData?.canonicalId && u.canonicalId === initialData.canonicalId) || 
          (Array.isArray(u.historicalIds) && currentId && u.historicalIds.includes(currentId)) ||
          String(initialData?.id || '').startsWith('derived_')
        )) {
          return false;
        }
        return normalizePhoneNumber(u.phone) === normPhone;
      });
      if (duplicate) {
        setError(`Ya existe otro jugador registrado con este número de teléfono (${duplicate.name || 'Ficha existente'}) en el complejo.`);
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
        city: formData.address.trim(), // Compatibilidad hacia atrás
        gender: formData.gender || 'hombre',
        acquisitionChannel: formData.acquisitionChannel || 'WhatsApp',
        category: formData.category || 'jugador',
        preferredFoot: '',
        birthDate: formData.birthDate || '',
        notes: ''
      });
      onClose();
    } catch (err: any) {
      console.error('Error al guardar jugador:', err);
      setError(err?.message || 'Error al guardar los datos del jugador. Por favor intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isHombre = (formData.gender || 'hombre').toLowerCase() === 'hombre' || (formData.gender || '').toLowerCase() === 'masculino';
  const isMujer = (formData.gender || '').toLowerCase() === 'mujer' || (formData.gender || '').toLowerCase() === 'femenino';
  const isCapitan = (formData.category || '').toLowerCase() === 'capitán' || (formData.category || '').toLowerCase() === 'capitan';
  const isJugador = !isCapitan;

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-3 sm:p-4 pointer-events-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isSubmitting) onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh] border border-gray-100 dark:border-slate-800 pointer-events-auto"
      >
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">{isEdit ? 'Editar perfil' : 'Nuevo Usuario'}</h3>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">{isEdit ? 'Modificar datos del jugador en la sede activa' : 'Alta de jugador o cliente para la sede activa'}</p>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isSubmitting) onClose();
            }} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer p-1"
          >
            <X size={18} />
          </button>
        </div>

        <form id="new-user-form" onSubmit={handleSubmit} className="p-3.5 sm:p-5 space-y-2 overflow-y-auto flex-1">
          {error && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-600 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulario fijo en 2 columnas sin importar pantalla */}
          <div className="grid grid-cols-2 gap-2">
            {/* Fila 1: Nombre y Apellido — Canal de Adquisición */}
            <div className="relative flex items-center">
              <UserIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input 
                ref={nameInputRef}
                required
                type="text" 
                placeholder="Nombre y apellido *"
                autoFocus={false}
                className="w-full h-9 pl-8 pr-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-[#0BA70B] outline-none"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="relative flex items-center">
              <Share2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select 
                value={formData.acquisitionChannel}
                onChange={e => setFormData({ ...formData, acquisitionChannel: e.target.value })}
                className={cn(
                  "w-full h-9 pl-8 pr-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-[#0BA70B] outline-none",
                  !formData.acquisitionChannel ? "text-gray-400" : "text-gray-900 dark:text-white"
                )}
              >
                <option value="" className="text-gray-400">Canal de adquisición</option>
                <option value="WhatsApp" className="text-gray-900 dark:text-white">WhatsApp</option>
                <option value="Referido" className="text-gray-900 dark:text-white">Referido</option>
                <option value="Instagram (Ig)" className="text-gray-900 dark:text-white">Instagram (Ig)</option>
                <option value="Facebook (Fb)" className="text-gray-900 dark:text-white">Facebook (Fb)</option>
                <option value="TikTok" className="text-gray-900 dark:text-white">TikTok</option>
                <option value="Inbound" className="text-gray-900 dark:text-white">Inbound</option>
                <option value="Outbound" className="text-gray-900 dark:text-white">Outbound</option>
                <option value="Evento" className="text-gray-900 dark:text-white">Evento</option>
                <option value="Cliente Presencial" className="text-gray-900 dark:text-white">Cliente Presencial</option>
              </select>
            </div>

            {/* Fila 2: Teléfono — Email */}
            <div className="relative flex items-center">
              <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input 
                required
                type="tel" 
                placeholder="Teléfono *"
                className="w-full h-9 pl-8 pr-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-[#0BA70B] outline-none"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="relative flex items-center">
              <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input 
                type="email" 
                placeholder="Email (opcional)"
                className="w-full h-9 pl-8 pr-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-[#0BA70B] outline-none"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            {/* Fila 3: Género — Categoría */}
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-gray-100 dark:bg-slate-800 rounded-xl h-9 items-center">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, gender: 'hombre' }))}
                className={cn(
                  "h-full rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer",
                  isHombre
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium"
                )}
              >
                Hombre
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, gender: 'mujer' }))}
                className={cn(
                  "h-full rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer",
                  isMujer
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium"
                )}
              >
                Mujer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-0.5 bg-gray-100 dark:bg-slate-800 rounded-xl h-9 items-center">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, category: 'jugador' }))}
                className={cn(
                  "h-full rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer",
                  isJugador
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium"
                )}
              >
                Jugador
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, category: 'capitán' }))}
                className={cn(
                  "h-full rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer",
                  isCapitan
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium"
                )}
              >
                Capitán
              </button>
            </div>

            {/* Fila 4: Dirección — Fecha de nacimiento */}
            <div className="relative flex items-center">
              <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Dirección (opcional)"
                className="w-full h-9 pl-8 pr-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-[#0BA70B] outline-none"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="relative flex items-center">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              {!formData.birthDate && (
                <span className="absolute left-8 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
                  Fecha de nac.
                </span>
              )}
              <input 
                type="date"
                className={cn(
                  "w-full h-9 pl-8 pr-7 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-[#0BA70B] outline-none",
                  !formData.birthDate ? "text-transparent" : "text-gray-900 dark:text-white"
                )}
                value={formData.birthDate}
                onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
              />
              {formData.birthDate && (
                <button 
                  type="button" 
                  onClick={() => setFormData(prev => ({ ...prev, birthDate: '' }))} 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 cursor-pointer text-xs font-bold leading-none"
                  title="Borrar fecha"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="p-3.5 sm:p-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl font-medium cursor-pointer disabled:opacity-50 text-xs sm:text-sm"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            form="new-user-form" 
            disabled={!formData.name || !formData.phone || isSubmitting} 
            className="px-5 py-2 bg-[#0BA70B] text-white rounded-xl font-bold hover:bg-[#0BA70B]/90 disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-900/10 flex items-center gap-2 text-xs sm:text-sm"
          >
            {isSubmitting ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Guardar Usuario')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const TOOLTIP_DESCRIPTIONS: Record<string, string> = {
  canal: 'Canal de adquisición a través del cual el jugador conoció o contactó al complejo.',
  reservas: 'Cantidad total de reservas creadas por este jugador en el complejo.',
  juegos: 'Partidos completados y efectivamente jugados por el usuario.',
  cancelaciones: 'Número de turnos o reservas canceladas por el jugador.',
  ultimoJuego: 'Fecha del partido jugado más recientemente en el complejo.',
  diasSinJugar: 'Días transcurridos desde el último partido jugado hasta hoy.',
  creado: 'Fecha en la que se dio de alta la ficha del jugador en el complejo.',
  ttv: 'Días transcurridos desde el registro del jugador hasta jugar su primer partido.',
  primerPartido: 'Fecha del primer partido completado en el complejo.',
  semanaAct: 'Semana de cohorte en la que el usuario jugó su primer partido (S = Semana).',
  antiguedad: 'Días transcurridos desde el registro del jugador hasta hoy.',
  actividad: 'Período en días entre el primer partido y el último partido jugado.'
};

function formatSpanishDate(val: any): string {
  const ymd = parseYMD(val);
  if (!ymd) return '—';
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${ymd.day} ${months[ymd.month - 1]}, ${ymd.year}`;
}

function formatCurrencyAmount(amount: number): string {
  const rounded = Math.round(Number(amount || 0));
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatPendingDate(dateVal: any, timeFallback?: string): string {
  if (!dateVal) return timeFallback || '—';
  let d: Date | null = null;
  if (typeof dateVal?.toDate === 'function') d = dateVal.toDate();
  else if (typeof dateVal?.toMillis === 'function') d = new Date(dateVal.toMillis());
  else if (dateVal instanceof Date) d = dateVal;
  else if (typeof dateVal === 'string') {
    const ymd = parseYMD(dateVal);
    if (ymd) {
      const timeMatch = dateVal.match(/(\d{1,2}):(\d{2})/);
      const h = timeMatch ? parseInt(timeMatch[1], 10) : (timeFallback ? parseInt(timeFallback.split(':')[0], 10) : 0);
      const m = timeMatch ? parseInt(timeMatch[2], 10) : (timeFallback ? parseInt(timeFallback.split(':')[1], 10) : 0);
      d = new Date(ymd.year, ymd.month - 1, ymd.day, h, m);
    } else {
      d = new Date(dateVal);
    }
  } else if (typeof dateVal === 'number') d = new Date(dateVal);

  if (!d || isNaN(d.getTime())) return timeFallback || '—';
  const fullMonths = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} de ${fullMonths[d.getMonth()]}, ${timeStr}`;
}

function formatTimelineDate(dateVal: any, timeFallback?: string): string {
  if (!dateVal) return timeFallback || '—';
  let d: Date | null = null;
  if (typeof dateVal?.toDate === 'function') d = dateVal.toDate();
  else if (typeof dateVal?.toMillis === 'function') d = new Date(dateVal.toMillis());
  else if (dateVal instanceof Date) d = dateVal;
  else if (typeof dateVal === 'string') {
    const ymd = parseYMD(dateVal);
    if (ymd) {
      const timeMatch = dateVal.match(/(\d{1,2}):(\d{2})/);
      const h = timeMatch ? parseInt(timeMatch[1], 10) : (timeFallback ? parseInt(timeFallback.split(':')[0], 10) : 0);
      const m = timeMatch ? parseInt(timeMatch[2], 10) : (timeFallback ? parseInt(timeFallback.split(':')[1], 10) : 0);
      d = new Date(ymd.year, ymd.month - 1, ymd.day, h, m);
    } else {
      d = new Date(dateVal);
    }
  } else if (typeof dateVal === 'number') d = new Date(dateVal);

  if (!d || isNaN(d.getTime())) return timeFallback || '—';
  const now = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isToday) return `Hoy, ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
  if (isYesterday) return `Ayer, ${timeStr}`;

  const shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  return `${d.getDate()} de ${shortMonths[d.getMonth()]}, ${timeStr}`;
}

function cleanPhoneForWa(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54')) return `549${digits.slice(2)}`;
  if (digits.length === 10) return `549${digits}`;
  return digits;
}

function calculateAgeFromBirthDate(birthDateStr?: string): number | null {
  if (!birthDateStr) return null;
  const ymd = parseYMD(birthDateStr);
  if (!ymd) return null;
  const today = new Date();
  let age = today.getFullYear() - ymd.year;
  const m = today.getMonth() + 1 - ymd.month;
  if (m < 0 || (m === 0 && today.getDate() < ymd.day)) {
    age--;
  }
  return age >= 0 ? age : null;
}

const UserDetailModal = ({ 
  user, 
  onClose, 
  onDelete,
  onUserUpdated,
  complexId = 'complejo_central',
  existingUsers = [],
  bookings = [],
  onSelectBooking
}: { 
  user: User | null; 
  onClose: () => void; 
  onDelete?: (id: any) => void;
  onUserUpdated?: (updatedUser: User) => void;
  complexId?: string;
  existingUsers?: User[];
  bookings?: Match[];
  onSelectBooking?: (booking: Match) => void;
}) => {
  const [activeSection, setActiveSection] = useState<'Datos' | 'Historial' | 'Información'>('Datos');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(user);
  const [operations, setOperations] = useState<OperationDocument[]>([]);
  const [financialMovements, setFinancialMovements] = useState<FinancialMovementDocument[]>([]);
  const [legacyTransactions, setLegacyTransactions] = useState<any[]>([]);
  const [venueProfile, setVenueProfile] = useState<any>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);

  // States to open the exact same Operation Ticket / Settle modal as Finanzas
  const [ticketModalOperation, setTicketModalOperation] = useState<OperationDocument | null>(null);
  const [ticketModalMovements, setTicketModalMovements] = useState<FinancialMovementDocument[]>([]);
  const [settleModalTarget, setSettleModalTarget] = useState<any | null>(null);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  // Real-time subscriptions strictly scoped to active complex
  useEffect(() => {
    if (!complexId) return;
    const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

    const unsubOps = subscribeToOperations(targetId, (ops) => {
      setOperations(Array.isArray(ops) ? ops : []);
    });

    const unsubMovs = subscribeToFinancialMovements(targetId, (movs) => {
      setFinancialMovements(Array.isArray(movs) ? movs : []);
    });

    const unsubTxs = subscribeToTransactions(targetId, (txs) => {
      setLegacyTransactions(Array.isArray(txs) ? txs : []);
    });

    const unsubVenue = subscribeToVenueProfile(targetId, (prof) => {
      setVenueProfile(prof);
    });

    return () => {
      unsubOps();
      unsubMovs();
      unsubTxs();
      unsubVenue();
    };
  }, [complexId]);

  // Open the exact operation ticket modal used in Finanzas
  const handleOpenTicket = (op: OperationDocument) => {
    const associatedMovements = financialMovements.filter(m => 
      m.operationId === op.id || 
      (op.bookingId && (m.bookingId === op.bookingId || m.operationId === `${op.bookingId}-booking`)) ||
      (op.id.endsWith('-booking') && (m.bookingId === op.id.replace('-booking', '') || m.operationId === op.id))
    );
    setTicketModalMovements(associatedMovements);
    setTicketModalOperation(op);
  };

  if (!currentUser) return null;

  const normUserPhone = normalizePhoneNumber(currentUser?.phone || '');

  // Filter bookings belonging to this user in this active complex (used for Datos metrics and virtual operations)
  const userBookings = useMemo(() => {
    if (!currentUser) return [];
    const userIdStr = String(currentUser.id || '');
    const userCanonicalId = currentUser.canonicalId || (currentUser as any).personId || (currentUser as any).erpUserId;
    const userHistoricalIds = Array.isArray(currentUser.historicalIds) ? currentUser.historicalIds.map(String) : [];
    if (currentUser.historicalId) userHistoricalIds.push(String(currentUser.historicalId));

    return (bookings || []).filter((b: any) => {
      // 1. Direct ID match
      if (b.userId && String(b.userId) === userIdStr) return true;
      if (b.host_id && String(b.host_id) === userIdStr) return true;

      // 2. Canonical ID match
      if (userCanonicalId && b.canonicalId && String(b.canonicalId) === String(userCanonicalId)) return true;

      // 3. Historical IDs match
      if (b.historicalId && userHistoricalIds.includes(String(b.historicalId))) return true;
      if (Array.isArray(b.historicalIds) && b.historicalIds.some((hId: any) => userHistoricalIds.includes(String(hId)))) return true;

      // 4. Normalized phone match
      const bPhone = normalizePhoneNumber(b.userPhone || b.clientPhone || b.host_phone || '');
      if (normUserPhone && bPhone && bPhone === normUserPhone) return true;

      // 5. Name match fallback
      if (b.userName && currentUser.name && b.userName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) {
        return true;
      }

      return false;
    });
  }, [bookings, currentUser, normUserPhone]);

  // Commercial operations of the player in the active complex (identical model to Finanzas)
  const playerCommercialOperations = useMemo(() => {
    if (!currentUser) return [];

    const userIdStr = String(currentUser.id || '');
    const userCanonicalId = currentUser.canonicalId || (currentUser as any).personId || (currentUser as any).erpUserId;
    const userHistoricalIds = Array.isArray(currentUser.historicalIds) ? currentUser.historicalIds.map(String) : [];
    if (currentUser.historicalId) userHistoricalIds.push(String(currentUser.historicalId));
    const targetComplexIds = (!complexId || complexId === 'complejo_central') ? ['B', 'complejo_central'] : [complexId];

    const list: Array<{
      id: string;
      ticketCode: string;
      rawDate: any;
      formattedDate: string;
      title: string;
      iconType: 'booking' | 'pos';
      contractualAmount: number;
      totalCollected: number;
      amountPending: number;
      isPending: boolean;
      originalDoc: OperationDocument;
    }> = [];

    const processedOpIds = new Set<string>();
    const processedBookingIds = new Set<string>();
    const processedLegacyIds = new Set<string>();

    const matchesPlayer = (entity: any) => {
      if (!entity) return false;
      const eUserId = entity.userId || entity.clientId || entity.host_id;
      if (eUserId && String(eUserId) === userIdStr) return true;
      if (userCanonicalId && entity.canonicalId && String(entity.canonicalId) === String(userCanonicalId)) return true;
      if (entity.historicalId && userHistoricalIds.includes(String(entity.historicalId))) return true;
      if (Array.isArray(entity.historicalIds) && entity.historicalIds.some((hId: any) => userHistoricalIds.includes(String(hId)))) return true;
      const ePhone = normalizePhoneNumber(entity.userPhone || entity.clientPhone || entity.phone || entity.host_phone || '');
      if (normUserPhone && ePhone && ePhone === normUserPhone) return true;
      if (entity.userName && currentUser.name && entity.userName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) return true;
      if (entity.clientName && currentUser.name && entity.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) return true;
      return false;
    };

    // 1. Process operations from /operations
    operations.forEach(op => {
      const c = op.complexId || op.complejoId;
      if (c && !targetComplexIds.includes(c)) return;

      if (!matchesPlayer(op)) return;

      processedOpIds.add(op.id);
      if (op.legacySaleId) processedLegacyIds.add(op.legacySaleId);
      if (op.bookingId) processedBookingIds.add(String(op.bookingId));
      if (op.id.endsWith('-booking')) processedBookingIds.add(op.id.replace('-booking', ''));

      const contractual = Number(op.contractualAmount ?? (op as any).total ?? (op as any).amount ?? (op as any).price ?? 0);
      const collected = Number(op.totalCollected ?? (op as any).amount_paid ?? (op as any).collected ?? (op as any).paid ?? 0);
      const pending = Number(op.amountPending ?? (op as any).pending ?? (op as any).debt ?? (op.paymentStatus !== 'paid' ? Math.max(0, contractual - collected) : 0));

      const isBooking = op.operationType === 'court_booking' || op.operationType === 'booking' || Boolean(op.bookingId);
      
      let title = isBooking ? 'Alquiler de Cancha' : 'Mostrador';
      if (isBooking) {
        const b = bookings.find(bk => String(bk.id) === String(op.bookingId || op.id.replace('-booking', '')));
        if (b && (b.courtName || b.court_name)) {
          title = `Reserva (${b.courtName || b.court_name})`;
        } else if (op.notes && op.notes.includes('Reserva')) {
          title = op.notes;
        } else {
          title = op.notes || 'Reserva (Cancha 1)';
        }
      } else {
        title = 'Mostrador';
      }

      const rawDate = op.createdAt || (op as any).date;
      const isPending = pending > 0 && op.paymentStatus !== 'paid';

      list.push({
        id: op.id,
        ticketCode: op.ticketCode || op.id.slice(0, 8).toUpperCase(),
        rawDate,
        formattedDate: formatTimelineDate(rawDate),
        title,
        iconType: isBooking ? 'booking' : 'pos',
        contractualAmount: contractual,
        totalCollected: collected,
        amountPending: pending,
        isPending,
        originalDoc: {
          ...op,
          contractualAmount: contractual,
          totalCollected: collected,
          amountPending: pending,
          userName: op.userName || currentUser.name,
          clientName: op.clientName || currentUser.name
        }
      });
    });

    // 2. Process legacy transactions from /transactions
    legacyTransactions.forEach(t => {
      const c = t.complexId || t.complejoId;
      if (c && !targetComplexIds.includes(c)) return;

      if (processedOpIds.has(t.id) || processedLegacyIds.has(t.id)) return;
      if (t.bookingId && processedBookingIds.has(String(t.bookingId))) return;

      if (!matchesPlayer(t)) return;

      processedOpIds.add(t.id);
      if (t.bookingId) processedBookingIds.add(String(t.bookingId));

      const isGasto = t.type === 'expense' || t.type === 'gasto' || t.type === 'egreso';
      if (isGasto) return;

      const tot = Number(t.total ?? t.amount ?? 0);
      let collected = tot;
      let pending = 0;
      let status = 'paid';

      if (t.paymentStatus === 'fiado' || t.paymentStatus === 'partial' || t.paymentStatus === 'pending' || t.paymentStatus === 'unpaid') {
        const fiadoAmt = Array.isArray(t.payments)
          ? t.payments.filter((p: any) => p.method === 'fiado' || p.method === 'pending').reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
          : Number(t.pendingAmount ?? t.debtAmount ?? (t.paymentStatus === 'unpaid' ? tot : 0));
        pending = fiadoAmt;
        collected = Math.max(0, tot - pending);
        status = collected >= tot && tot > 0 ? 'paid' : (collected > 0 ? 'partial' : 'unpaid');
      }

      const isBooking = Boolean(t.bookingId);
      const title = isBooking ? 'Reserva (Cancha 1)' : 'Mostrador';
      const rawDate = t.createdAt || t.date;
      const isPending = pending > 0 && status !== 'paid';

      const virtualOp: OperationDocument = {
        id: t.id,
        complexId: complexId || 'complejo_central',
        ticketCode: t.ticketCode || t.id.slice(0, 8).toUpperCase(),
        operationType: isBooking ? 'court_booking' : 'pos_sale',
        responsibleType: 'user',
        userId: currentUser.id ? String(currentUser.id) : null,
        clientId: currentUser.id ? String(currentUser.id) : null,
        userName: currentUser.name,
        clientName: currentUser.name,
        userPhone: currentUser.phone || '',
        clientPhone: currentUser.phone || '',
        contractualAmount: tot,
        totalCollected: collected,
        totalRefunded: 0,
        netCollected: collected,
        retainedAmount: 0,
        amountPending: pending,
        paymentStatus: status as any,
        currentAccountAssigned: pending > 0,
        currentAccountDebtAmount: pending,
        notes: title,
        createdAt: rawDate || new Date(),
        updatedAt: rawDate || new Date(),
        createdBy: 'histórico'
      };

      list.push({
        id: t.id,
        ticketCode: virtualOp.ticketCode,
        rawDate,
        formattedDate: formatTimelineDate(rawDate),
        title,
        iconType: isBooking ? 'booking' : 'pos',
        contractualAmount: tot,
        totalCollected: collected,
        amountPending: pending,
        isPending,
        originalDoc: virtualOp
      });
    });

    // 3. Process bookings not having an operation
    bookings.forEach(b => {
      if (!b) return;
      const c = b.complexId || b.complejoId;
      if (c && !targetComplexIds.includes(c)) return;

      if (processedBookingIds.has(String(b.id))) return;
      const bStatus = String(b.status || '').toLowerCase();
      if (bStatus === 'cancelado' || bStatus === 'cancelled') return;

      if (!matchesPlayer(b)) return;

      processedBookingIds.add(String(b.id));

      const tot = Number(b.price || b.price_total || 0);
      const isPaid = b.payment_status === 'paid' || b.paymentStatus === 'paid' || b.payment_status === 'pagado';
      const rawPaid = Number(b.amount_paid ?? b.deposit ?? 0);
      const paid = isPaid ? (rawPaid > 0 ? Math.max(rawPaid, tot) : tot) : rawPaid;
      const pending = Math.max(0, tot - paid);
      const status = paid >= tot && tot > 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');

      const rawDate = b.startTime || b.start_time || b.date;
      const courtTitle = `Reserva (${b.courtName || b.court_name || 'Cancha 1'})`;
      const isPending = pending > 0 && status !== 'paid';

      const virtualBookingOp: OperationDocument = {
        id: `${b.id}-booking`,
        complexId: complexId || 'complejo_central',
        ticketCode: `B-${String(b.id).slice(0, 6).toUpperCase()}`,
        operationType: 'court_booking',
        bookingId: String(b.id),
        responsibleType: 'user',
        userId: currentUser.id ? String(currentUser.id) : null,
        clientId: currentUser.id ? String(currentUser.id) : null,
        userName: currentUser.name,
        clientName: currentUser.name,
        userPhone: currentUser.phone || '',
        clientPhone: currentUser.phone || '',
        contractualAmount: tot,
        totalCollected: paid,
        totalRefunded: 0,
        netCollected: paid,
        retainedAmount: 0,
        amountPending: pending,
        paymentStatus: status as any,
        currentAccountAssigned: pending > 0,
        currentAccountDebtAmount: pending,
        notes: courtTitle,
        createdAt: rawDate || new Date(),
        updatedAt: rawDate || new Date(),
        createdBy: 'reserva'
      };

      list.push({
        id: virtualBookingOp.id,
        ticketCode: virtualBookingOp.ticketCode,
        rawDate,
        formattedDate: formatTimelineDate(rawDate, b.startTime || b.start_time),
        title: courtTitle,
        iconType: 'booking',
        contractualAmount: tot,
        totalCollected: paid,
        amountPending: pending,
        isPending,
        originalDoc: virtualBookingOp
      });
    });

    // Sort chronologically (newest first)
    const getMs = (val: any) => {
      if (!val) return 0;
      if (typeof val?.toMillis === 'function') return val.toMillis();
      if (typeof val?.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    list.sort((a, b) => getMs(b.rawDate) - getMs(a.rawDate));
    return list;
  }, [currentUser, operations, legacyTransactions, bookings, complexId, normUserPhone]);

  // Exclusive pending operations with real pending balance > 0
  const pendingOperations = useMemo(() => {
    return playerCommercialOperations.filter(op => op.amountPending > 0 && op.isPending);
  }, [playerCommercialOperations]);

  const totalCalculatedDebt = useMemo(() => {
    const fromPending = pendingOperations.reduce((acc, it) => acc + it.amountPending, 0);
    const directDebt = Number(currentUser?.debt ?? (currentUser as any)?.currentDebt ?? 0);
    return Math.max(fromPending, directDebt);
  }, [pendingOperations, currentUser?.debt, (currentUser as any)?.currentDebt]);

  const hasDebt = totalCalculatedDebt > 0;

  // 12 Lifecycle Metrics for "Datos" tab
  const metricsData = useMemo(() => {
    const now = new Date();
    const todayYMD = parseYMD(now)!;
    const rawAdq = currentUser?.acquisitionDate || currentUser?.created_at || currentUser?.createdAt;
    const adqYMD = parseYMD(rawAdq) || todayYMD;

    const cancelledCount = userBookings.filter(b => {
      const st = String(b.status || '').toLowerCase();
      return st === 'cancelled' || st === 'cancelado';
    }).length;

    const played = userBookings.filter(b => isBookingPlayed(b, now));
    const sortedPlayed = [...played].sort((a, b) => {
      const aDate = a.date || a.startTime || a.start_time;
      const bDate = b.date || b.startTime || b.start_time;
      const aYMD = parseYMD(aDate);
      const bYMD = parseYMD(bDate);
      if (!aYMD || !bYMD) return 0;
      return (new Date(aYMD.year, aYMD.month - 1, aYMD.day).getTime()) - (new Date(bYMD.year, bYMD.month - 1, bYMD.day).getTime());
    });

    const firstMatch = sortedPlayed[0];
    const lastMatch = sortedPlayed[sortedPlayed.length - 1];

    const firstMatchDateStr = firstMatch ? (firstMatch.date || firstMatch.startTime || firstMatch.start_time) : null;
    const lastMatchDateStr = lastMatch ? (lastMatch.date || lastMatch.startTime || lastMatch.start_time) : null;

    const firstMatchYMD = parseYMD(firstMatchDateStr);
    const lastMatchYMD = parseYMD(lastMatchDateStr);

    let ttvFormatted = '—';
    let semanaActFormatted = '—';
    if (firstMatchYMD && adqYMD) {
      const diff = Math.max(0, differenceInCalendarDays(firstMatchYMD, adqYMD));
      ttvFormatted = `${diff} días`;
      semanaActFormatted = `S${Math.floor(diff / 7)}`;
    }

    let sinJugarFormatted = '—';
    if (lastMatchYMD) {
      const diff = Math.max(0, differenceInCalendarDays(todayYMD, lastMatchYMD));
      sinJugarFormatted = `${diff} días`;
    }

    const antiguedadDays = Math.max(0, differenceInCalendarDays(todayYMD, adqYMD));
    const antiguedadFormatted = `${antiguedadDays} días`;

    let actividadFormatted = '—';
    if (firstMatchYMD && lastMatchYMD) {
      const diff = Math.max(0, differenceInCalendarDays(lastMatchYMD, firstMatchYMD));
      actividadFormatted = `${diff} días`;
    }

    return {
      canalAdquisicion: currentUser?.acquisitionChannel || 'WhatsApp',
      reservasCount: userBookings.length,
      juegosCount: played.length,
      cancelacionesCount: cancelledCount,
      ultimoJuegoFormatted: lastMatchYMD ? formatSpanishDate(lastMatchYMD) : '—',
      diasSinJugarFormatted: sinJugarFormatted,
      creadoFormatted: formatSpanishDate(adqYMD),
      ttvFormatted,
      primerPartidoFormatted: firstMatchYMD ? formatSpanishDate(firstMatchYMD) : '—',
      semanaActFormatted,
      antiguedadFormatted,
      actividadFormatted,
    };
  }, [currentUser, userBookings]);

  // Calculated age & category for "Información"
  const calculatedAge = useMemo(() => {
    return calculateAgeFromBirthDate(currentUser?.birthDate || (currentUser as any)?.birthdate);
  }, [currentUser?.birthDate, (currentUser as any)?.birthdate]);

  const ageAndCategoryText = useMemo(() => {
    const parts: string[] = [];
    if (calculatedAge !== null) {
      parts.push(`${calculatedAge} años`);
    }
    if (currentUser?.category) {
      parts.push(currentUser.category);
    }
    return parts.length > 0 ? parts.join(' • ') : '—';
  }, [calculatedAge, currentUser?.category]);

  const cleanPhone = cleanPhoneForWa(currentUser?.phone || '');

  return (
    <>
      <div 
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs pointer-events-auto"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      >
        <motion.div 
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 350) {
              onClose();
            }
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-xl rounded-t-[36px] sm:rounded-t-[40px] shadow-2xl flex flex-col h-[85vh] max-h-[85vh] overflow-hidden relative pointer-events-auto"
        >
          {/* Top Drag Handle Bar */}
          <div className="w-full flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none select-none">
            <div className="w-16 h-1.5 bg-gray-300 rounded-full" />
          </div>

          {/* Fixed Header */}
          <div className="px-6 pt-1 pb-3 shrink-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center flex-wrap">
              <span>{currentUser.name}</span>
              {hasDebt && (
                <span className="text-red-600 font-bold ml-1.5">(saldo pendiente)</span>
              )}
            </h2>
          </div>

          {/* Fixed Tabs */}
          <div className="px-6 pb-3 flex items-center gap-2 shrink-0">
            {(['Datos', 'Historial', 'Información'] as const).map((tab) => {
              const isActive = activeSection === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTooltip(null);
                    setActiveSection(tab);
                  }}
                  className={cn(
                    "px-4 py-1.5 text-sm font-semibold rounded-full transition-all cursor-pointer",
                    isActive 
                      ? "bg-gray-200 text-gray-800" 
                      : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Scrollable Content Body */}
          <div 
            className="flex-1 overflow-y-auto px-6 py-4 pb-24"
            onClick={() => setActiveTooltip(null)}
          >
            {/* SECCIÓN 1: DATOS */}
            {activeSection === 'Datos' && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                {/* Columna 1 */}
                <div className="space-y-5">
                  {/* 1. Canal de adquisición */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Canal de adquisición</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'canal' ? null : 'canal');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Canal de adquisición"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.canalAdquisicion}</div>
                    {activeTooltip === 'canal' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.canal}
                      </div>
                    )}
                  </div>

                  {/* 2. Reservas */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Reservas</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'reservas' ? null : 'reservas');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Reservas"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.reservasCount}</div>
                    {activeTooltip === 'reservas' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.reservas}
                      </div>
                    )}
                  </div>

                  {/* 3. Juegos */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Juegos</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'juegos' ? null : 'juegos');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Juegos"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.juegosCount}</div>
                    {activeTooltip === 'juegos' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.juegos}
                      </div>
                    )}
                  </div>

                  {/* 4. Cancelaciones */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Cancelaciones</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'cancelaciones' ? null : 'cancelaciones');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Cancelaciones"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.cancelacionesCount}</div>
                    {activeTooltip === 'cancelaciones' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.cancelaciones}
                      </div>
                    )}
                  </div>

                  {/* 5. Último juego */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Último juego</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'ultimoJuego' ? null : 'ultimoJuego');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Último juego"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.ultimoJuegoFormatted}</div>
                    {activeTooltip === 'ultimoJuego' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.ultimoJuego}
                      </div>
                    )}
                  </div>

                  {/* 6. Días sin jugar */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Días sin jugar</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'diasSinJugar' ? null : 'diasSinJugar');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Días sin jugar"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.diasSinJugarFormatted}</div>
                    {activeTooltip === 'diasSinJugar' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.diasSinJugar}
                      </div>
                    )}
                  </div>
                </div>

                {/* Columna 2 */}
                <div className="space-y-5">
                  {/* 1. creado */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">creado</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'creado' ? null : 'creado');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info creado"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.creadoFormatted}</div>
                    {activeTooltip === 'creado' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.creado}
                      </div>
                    )}
                  </div>

                  {/* 2. Time to value */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Time to value</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'ttv' ? null : 'ttv');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Time to value"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.ttvFormatted}</div>
                    {activeTooltip === 'ttv' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.ttv}
                      </div>
                    )}
                  </div>

                  {/* 3. Primer partido */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Primer partido</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'primerPartido' ? null : 'primerPartido');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Primer partido"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.primerPartidoFormatted}</div>
                    {activeTooltip === 'primerPartido' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.primerPartido}
                      </div>
                    )}
                  </div>

                  {/* 4. Semana de activación */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Semana de activación</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'semanaAct' ? null : 'semanaAct');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Semana de activación"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.semanaActFormatted}</div>
                    {activeTooltip === 'semanaAct' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.semanaAct}
                      </div>
                    )}
                  </div>

                  {/* 5. Antigüedad */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Antigüedad</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'antiguedad' ? null : 'antiguedad');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Antigüedad"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.antiguedadFormatted}</div>
                    {activeTooltip === 'antiguedad' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.antiguedad}
                      </div>
                    )}
                  </div>

                  {/* 6. Actividad */}
                  <div className="relative">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500 font-medium">Actividad</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(prev => prev === 'actividad' ? null : 'actividad');
                        }}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded-full"
                        aria-label="Info Actividad"
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <div className="text-base font-bold text-gray-800 mt-0.5">{metricsData.actividadFormatted}</div>
                    {activeTooltip === 'actividad' && (
                      <div className="absolute z-30 left-0 top-full mt-1.5 bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl max-w-[220px] pointer-events-auto leading-relaxed">
                        {TOOLTIP_DESCRIPTIONS.actividad}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 2: HISTORIAL */}
            {activeSection === 'Historial' && (
              <div className="space-y-6">
                {/* Saldos pendientes */}
                <div>
                  <button 
                    type="button" 
                    onClick={() => setPendingExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between text-base font-bold text-gray-800 mb-3 cursor-pointer py-1"
                  >
                    <span>Saldos pendientes</span>
                    {pendingExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                  </button>

                  {pendingExpanded && (
                    <div className="space-y-3">
                      {pendingOperations.length === 0 ? (
                        <div className="text-sm text-gray-400 italic py-2 pl-1">
                          No hay saldos pendientes
                        </div>
                      ) : (
                        pendingOperations.map((item) => (
                          <div 
                            key={`pending-${item.id}`}
                            onClick={() => handleOpenTicket(item.originalDoc)}
                            className="flex items-center justify-between p-2 rounded-2xl hover:bg-gray-50/80 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0 text-red-600 shadow-2xs">
                                {item.iconType === 'booking' ? (
                                  <Calendar size={18} />
                                ) : (
                                  <ShoppingBasket size={18} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-gray-800 text-sm truncate">{item.title}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{formatPendingDate(item.rawDate)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-red-600 text-base">${formatCurrencyAmount(item.amountPending)}</span>
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTicket(item.originalDoc);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                                title="Ver detalle"
                              >
                                <MoreVertical size={18} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Actividad reciente */}
                <div>
                  <button 
                    type="button" 
                    onClick={() => setRecentExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between text-base font-bold text-gray-800 mb-4 cursor-pointer py-1"
                  >
                    <span>Actividad reciente</span>
                    {recentExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                  </button>

                  {recentExpanded && (
                    <div className="relative pl-2 space-y-4">
                      {/* Vertical timeline connector line */}
                      <div className="absolute left-[26px] top-4 bottom-4 w-0.5 bg-gray-200 z-0" />

                      {playerCommercialOperations.length === 0 ? (
                        <div className="text-sm text-gray-400 italic py-2 pl-1 relative z-10">
                          Sin actividad registrada en este complejo
                        </div>
                      ) : (
                        playerCommercialOperations.map((item) => (
                          <div 
                            key={`recent-${item.id}`}
                            onClick={() => handleOpenTicket(item.originalDoc)}
                            className="relative z-10 flex items-center justify-between gap-3 group cursor-pointer hover:bg-gray-50/80 p-1.5 -ml-1.5 rounded-xl transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Circle icon on the timeline: Green if fully paid, Red if pending balance */}
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-colors",
                                item.isPending
                                  ? "bg-red-50 border border-red-200 text-red-600"
                                  : "bg-white border border-gray-200 text-[#0BA70B]"
                              )}>
                                {item.iconType === 'booking' ? (
                                  <Calendar size={18} />
                                ) : (
                                  <ShoppingBasket size={18} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-gray-800 text-sm truncate">{item.title}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{item.formattedDate}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-gray-800 text-sm sm:text-base">
                                ${formatCurrencyAmount(item.contractualAmount)}
                              </span>
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTicket(item.originalDoc);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                                title="Ver detalle"
                              >
                                <MoreVertical size={18} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECCIÓN 3: INFORMACIÓN */}
            {activeSection === 'Información' && (
              <div className="space-y-4 py-2">
                {/* 1. Género */}
                <div className="flex items-center gap-3.5 py-1">
                  <UserCheck size={18} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 font-medium text-sm">
                    {currentUser.gender || '—'}
                  </span>
                </div>

                {/* 2. Dirección / Ciudad */}
                <div className="flex items-center gap-3.5 py-1">
                  <MapPin size={18} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 font-medium text-sm">
                    {currentUser.address || currentUser.city || '—'}
                  </span>
                </div>

                {/* 3. Edad y Categoría */}
                <div className="flex items-center gap-3.5 py-1">
                  <UserIcon size={18} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 font-medium text-sm">
                    {ageAndCategoryText}
                  </span>
                </div>

                {/* 4. Teléfono (verde Jogo con enlace a WhatsApp) */}
                <div className="flex items-center gap-3.5 py-1">
                  <Phone size={18} className="text-gray-400 shrink-0" />
                  {currentUser.phone ? (
                    <a 
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0BA70B] font-bold text-sm hover:underline cursor-pointer"
                    >
                      {currentUser.phone}
                    </a>
                  ) : (
                    <span className="text-gray-500 font-medium text-sm">—</span>
                  )}
                </div>

                {/* 5. Correo electrónico */}
                <div className="flex items-center gap-3.5 py-1">
                  <Mail size={18} className="text-gray-400 shrink-0" />
                  {currentUser.email ? (
                    <a 
                      href={`mailto:${currentUser.email}`}
                      className="text-gray-600 hover:text-[#0BA70B] hover:underline text-sm"
                    >
                      {currentUser.email}
                    </a>
                  ) : (
                    <span className="text-gray-500 font-medium text-sm">-</span>
                  )}
                </div>

                {/* 6. Pierna hábil */}
                <div className="flex items-center gap-3.5 py-1">
                  <Footprints size={18} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500 font-medium text-sm">
                    {currentUser.preferredFoot || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Floating Action Button (FAB) Bottom-Right: Verde Jogo con icono de lápiz blanco */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsEditModalOpen(true);
            }}
            aria-label="Editar perfil"
            className="absolute bottom-6 right-6 w-14 h-14 rounded-2xl bg-[#0BA70B] text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 active:scale-95 transition-all z-20 cursor-pointer"
          >
            <Pencil size={24} className="text-white" />
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {isEditModalOpen && (
          <NewUserModal 
            isOpen={isEditModalOpen}
            isEdit={true}
            initialData={currentUser}
            existingUsers={existingUsers}
            onClose={() => setIsEditModalOpen(false)}
            onSave={async (updatedFields) => {
              const clientToSave: Partial<User> = {
                ...currentUser,
                ...updatedFields,
                id: currentUser.id
              };
              const savedId = await saveClientInFirestore(complexId, clientToSave);
              const merged = { ...currentUser, ...updatedFields, id: savedId || currentUser.id } as User;
              setCurrentUser(merged);
              if (onUserUpdated) {
                onUserUpdated(merged);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal de Ticket de Venta / Detalle de Operación (Idéntico a Finanzas) */}
      <TicketModal
        isOpen={Boolean(ticketModalOperation)}
        onClose={() => setTicketModalOperation(null)}
        operation={ticketModalOperation}
        movements={ticketModalMovements}
        venueProfile={venueProfile}
        operatorName={auth.currentUser?.displayName || undefined}
        originSection="operations"
        users={existingUsers}
        bookings={bookings}
        complexId={complexId}
        onRegisterPayment={(op) => {
          setTicketModalOperation(null);
          setSettleModalTarget({
            id: op.id,
            ticketCode: op.ticketCode,
            clientName: op.userName,
            userName: op.userName,
            concept: op.notes || (op.operationType === 'court_booking' ? 'Alquiler Cancha' : 'Operación comercial'),
            contractualAmount: op.contractualAmount,
            amountPending: op.amountPending,
            totalCollected: op.totalCollected,
            isLegacy: (op as any).isLegacy,
            userId: op.userId,
            bookingId: op.bookingId,
            originalDoc: op
          });
        }}
      />

      {/* Modal de Cobro de Pendientes / Fiados (Idéntico a Finanzas) */}
      <PendingSettleModal
        isOpen={Boolean(settleModalTarget)}
        onClose={() => setSettleModalTarget(null)}
        operation={settleModalTarget ? {
          id: settleModalTarget.id,
          ticketCode: settleModalTarget.ticketCode,
          userName: settleModalTarget.clientName || settleModalTarget.userName,
          clientName: settleModalTarget.clientName || settleModalTarget.userName,
          concept: settleModalTarget.concept,
          contractualAmount: settleModalTarget.contractualAmount,
          amountPending: settleModalTarget.amountPending,
          totalCollected: settleModalTarget.totalCollected,
          isLegacy: settleModalTarget.isLegacy,
          userId: settleModalTarget.userId,
          bookingId: settleModalTarget.bookingId,
          originalDoc: settleModalTarget.originalDoc
        } : null}
        complexId={complexId}
        operatorId={auth.currentUser?.uid || 'pos_operator'}
        users={existingUsers}
        bookings={bookings}
        onSuccess={() => {
          setSettleModalTarget(null);
        }}
      />
    </>
  );
};


const NotificationsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  const notifications: Array<{ id: number | string; text: string; time: string }> = [];

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-[#0BA70B]" />
            Notificaciones
          </h2>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 space-y-3">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3 text-gray-300">
                <Bell size={24} />
              </div>
              <p className="text-sm font-bold text-gray-700">No hay notificaciones</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Las alertas de reservas confirmadas y pagos aparecerán aquí en tiempo real.
              </p>
            </div>
          ) : (
            notifications.map((n, nIdx) => (
              <div key={`notif-${n.id || nIdx}-${nIdx}`} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
                <div className="mt-1 w-2 h-2 rounded-full bg-[#0BA70B] shrink-0" />
                <div>
                  <p className="text-sm text-gray-900 font-medium">{n.text}</p>
                  <p className="text-xs text-gray-500 mt-1">{n.time}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

const MatchDetailModal = ({ 
  match, 
  onClose, 
  onUpdateStatus, 
  onUserClick, 
  onEdit, 
  onPaymentUpdate,
  onCancelBooking,
  onDeleteBooking,
  users
}: { 
  match: Match | null, 
  onClose: () => void, 
  onUpdateStatus?: (id: number | string, status: string) => void, 
  onUserClick?: (id: number | string, user?: User) => void, 
  onEdit?: () => void, 
  onPaymentUpdate?: () => void,
  onCancelBooking?: (booking: Match) => void,
  onDeleteBooking?: (booking: Match) => void,
  users?: User[]
}) => {
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [confirmTotal, setConfirmTotal] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);

  if (!match) return null;

  const now = new Date();
  const matchEnd = new Date(match.end_time);
  const isPast = now > matchEnd;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="bg-white p-6 text-gray-900 relative border-b border-gray-100">
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {onDeleteBooking && (
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteBooking(match);
                }} 
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors cursor-pointer"
                title="Eliminar reserva definitivamente"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }} 
              className="bg-gray-100 text-gray-500 p-2 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm tracking-wider mb-2">
            <Calendar size={14} /> Reserva Confirmada
          </div>
          <h2 className="text-2xl font-bold mb-1">{match.court_name}</h2>
          <p className="text-gray-500 text-sm">
            {safeFormatDate(match.start_time, "EEEE d 'de' MMMM, HH:mm", { locale: es })} hs
          </p>
          {match.mode && (
            <div className={cn(
              "inline-flex items-center mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
              match.mode === 'complete' ? "bg-gray-100 text-gray-600" :
              match.mode === 'missing_players' ? "bg-emerald-100 text-emerald-700" :
              "bg-violet-100 text-violet-700"
            )}>
              {match.mode === 'complete' ? 'Clásico' : match.mode === 'missing_players' ? 'Faltan jugadores' : 'Desafío'}
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs text-gray-500 font-bold">Estado de Pago</div>
                {match.payment_status !== 'paid' && (
                  <div className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase",
                    match.payment_status === 'partial' ? (isPast ? "bg-red-100 text-red-700 animate-pulse" : "bg-orange-100 text-orange-700") :
                    (isPast ? "bg-red-100 text-red-700 animate-pulse" : "bg-red-100 text-red-700")
                  )}>
                    {match.payment_status === 'partial' ? `Seña (${match.price_total ? Math.round(((match.amount_paid || 0) / match.price_total) * 100) : 0}%)` : 'Pendiente'}
                  </div>
                )}
              </div>
              {(match.payment_status === 'partial' || match.payment_status === 'paid') && (
                <div className="text-sm font-bold text-gray-900">
                  Abonado: ${(match.amount_paid || 0).toLocaleString()}
                </div>
              )}
            </div>
            <div className="text-right">
              {match.payment_status === 'paid' ? (
                <div className="inline-flex items-center px-3 py-1 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">
                  Pagado
                </div>
              ) : (
                <>
                  <div className="text-xs text-gray-500 font-bold mb-1">Falta Pagar</div>
                  <div className="text-xl font-black text-gray-900">
                    ${((match.price_total || 0) - (match.amount_paid || 0)).toLocaleString()}
                  </div>
                </>
              )}
            </div>
          </div>

          {((match.price_total || 0) - (match.amount_paid || 0)) > 0 && (
            <div className="mb-6 space-y-2">
              <div className="flex gap-2">
                <button type="button" 
                  disabled={isPaying}
                  onClick={async () => {
                    if (!confirmTotal) {
                      setConfirmTotal(true);
                      setTimeout(() => setConfirmTotal(false), 3000);
                      return;
                    }
                    setIsPaying(true);
                    const totalPrice = Number(match.price ?? match.price_total ?? 0);
                    const currentPaid = Number(match.amount_paid ?? match.deposit ?? 0);
                    const remaining = Math.max(0, totalPrice - currentPaid);
                    try {
                      if (remaining > 0) {
                        await registerBookingPaymentInFirestore({
                          bookingId: match.id,
                          complexId: (match as any).complexId || (match as any).complejoId || 'B',
                          amount: remaining,
                          paymentMethod: 'cash',
                          operatorId: auth.currentUser?.uid || 'pos_operator',
                          notes: `Liquidación total reserva ${match.court_name || ''}`
                        });
                      } else {
                        await updateBookingInFirestore(match.id, {
                          paymentStatus: 'pagado',
                          payment_status: 'paid'
                        });
                      }
                      if (onPaymentUpdate) onPaymentUpdate();
                    } catch (err) {
                      console.error('Error updating payment in Firestore:', err);
                    } finally {
                      setIsPaying(false);
                    }
                  }}
                  className="flex-1 bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  {isPaying ? 'Procesando...' : confirmTotal ? '¿Confirmar pago?' : 'Finalizar pago'}
                </button>
                <button type="button" 
                  onClick={() => setShowManualPayment(!showManualPayment)}
                  className="px-4 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Manual
                </button>
              </div>
              
              {showManualPayment && (
                <div className="flex gap-2 mt-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" 
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder="Monto"
                      className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button type="button" 
                    disabled={isPaying || !manualAmount || Number(manualAmount) <= 0}
                    onClick={async () => {
                      if (!confirmManual) {
                        setConfirmManual(true);
                        setTimeout(() => setConfirmManual(false), 3000);
                        return;
                      }
                      setIsPaying(true);
                      try {
                        const addAmount = Number(manualAmount);
                        if (addAmount > 0) {
                          await registerBookingPaymentInFirestore({
                            bookingId: match.id,
                            complexId: (match as any).complexId || (match as any).complejoId || 'B',
                            amount: addAmount,
                            paymentMethod: 'cash',
                            operatorId: auth.currentUser?.uid || 'pos_operator',
                            notes: `Seña / cobro adicional reserva ${match.court_name || ''}`
                          });
                        }
                        setManualAmount('');
                        setShowManualPayment(false);
                        if (onPaymentUpdate) onPaymentUpdate();
                      } catch (err) {
                        console.error('Error updating manual payment in Firestore:', err);
                      } finally {
                        setIsPaying(false);
                      }
                    }}
                    className="bg-gray-900 text-white px-4 font-bold text-xs rounded-lg hover:bg-black disabled:opacity-50"
                  >
                    {confirmManual ? '¿Seguro?' : 'Cargar'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mb-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={18} className="text-gray-400" />
              Jugadores ({match.players?.length || 1}/{match.max_players})
            </h3>
            <div className="space-y-3">
              {/* Host */}
              {(() => {
                const hostId = match.userId || match.host_id;
                const hostPhone = match.userPhone || match.clientPhone || match.host_phone || '';
                const hostNormPhone = normalizePhoneNumber(hostPhone);

                const hostCriteria = {
                  id: match.userId || match.host_id,
                  canonicalId: match.canonicalId || match.canonicalUserId,
                  canonicalUserId: match.canonicalUserId || match.canonicalId,
                  historicalId: match.historicalId,
                  historicalIds: match.historicalIds,
                  phone: hostPhone,
                  email: match.userEmail || match.clientEmail
                };

                const resolvedHostUser = users && users.length > 0 ? findMatchingLocalUser(users, hostCriteria) : null;

                const displayHostName = resolvedHostUser?.name || match.host_name || match.userName || match.clientName || 'Cliente';
                const displayHostPhone = resolvedHostUser?.phone || hostPhone;

                return (
                  <div 
                    className="flex items-center gap-4 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors relative" 
                    onClick={() => { 
                      if (onUserClick) { 
                        const hostCandidate: Partial<User> = resolvedHostUser || {
                          id: hostId,
                          canonicalId: match.canonicalId,
                          canonicalUserId: match.canonicalUserId,
                          historicalIds: match.historicalIds,
                          name: displayHostName,
                          phone: displayHostPhone,
                          email: match.userEmail || match.clientEmail
                        };
                        onUserClick(resolvedHostUser?.id || hostId || hostNormPhone || match.id, hostCandidate as User); 
                        onClose(); 
                      } 
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                      {displayHostName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                        <span>{displayHostName}</span>
                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">Host</span>
                        {resolvedHostUser?.isDerived && (
                          <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded font-medium">
                            Invitado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{displayHostPhone}</div>
                    </div>
                    {((match.players || []).find(p => p.id === match.host_id) as any)?.has_paid || ((match.amount_paid || 0) > 0 && (match.players || []).length <= 1) ? (
                      <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded mt-2 text-center w-fit">Pagó</div>
                    ) : null}
                    <button type="button" className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full absolute right-3 top-3">
                      <Phone size={16} />
                    </button>
                  </div>
                );
              })()}

              {/* Other Players */}
              {(() => {
                const hostId = match.userId || match.host_id;
                const hostPhone = match.userPhone || match.clientPhone || match.host_phone || '';
                const hostNormPhone = normalizePhoneNumber(hostPhone);

                const nonHostPlayers = (match.players || []).filter(p => {
                  if (!p) return false;
                  if (typeof p === 'string' || typeof p === 'number') {
                    if (isGenericPlaceholderName(String(p))) return false;
                    const pNorm = normalizePhoneNumber(String(p));
                    if (pNorm && hostNormPhone && pNorm === hostNormPhone) return false;
                    return true;
                  }
                  const pId = p.id ?? p.userId ?? p.uid ?? p.player_id ?? p.user_id;
                  if (pId && hostId && String(pId) === String(hostId)) return false;
                  const pPhone = p.phone ?? p.userPhone ?? p.clientPhone ?? p.user_phone;
                  const pNorm = normalizePhoneNumber(pPhone);
                  if (pNorm && hostNormPhone && pNorm === hostNormPhone) return false;
                  const pName = p.name ?? p.userName ?? p.clientName;
                  if (isGenericPlaceholderName(pName)) return false;
                  return true;
                });

                return nonHostPlayers.map((player, pIdx) => {
                  let pRawId = typeof player === 'object' ? (player.id ?? player.userId ?? player.uid ?? player.player_id ?? player.user_id) : undefined;
                  let pRawPhone = typeof player === 'object' ? (player.phone ?? player.userPhone ?? player.clientPhone ?? player.user_phone) : undefined;
                  let pRawName = typeof player === 'object' ? (player.name ?? player.userName ?? player.clientName ?? player.player_name) : String(player);
                  let pSkill = typeof player === 'object' ? (player.skill_level || 'Amateur') : 'Amateur';

                  const pNormPhone = normalizePhoneNumber(pRawPhone || (typeof player === 'string' ? player : ''));
                  if (pNormPhone && !pRawPhone) pRawPhone = pNormPhone;

                  const playerCriteria = {
                    id: pRawId,
                    canonicalId: typeof player === 'object' ? (player.canonicalId || player.canonicalUserId) : undefined,
                    canonicalUserId: typeof player === 'object' ? (player.canonicalUserId || player.canonicalId) : undefined,
                    historicalId: typeof player === 'object' ? player.historicalId : undefined,
                    historicalIds: typeof player === 'object' ? player.historicalIds : undefined,
                    phone: pRawPhone || pNormPhone,
                    email: typeof player === 'object' ? (player.email || player.userEmail) : undefined
                  };

                  const resolvedPlayerUser = users && users.length > 0 ? findMatchingLocalUser(users, playerCriteria) : null;

                  const displayPlayerName = resolvedPlayerUser?.name || (pRawName && !isGenericPlaceholderName(pRawName) ? pRawName.trim() : `Jugador ${pIdx + 1}`);
                  const displayPlayerPhone = resolvedPlayerUser?.phone || (pRawPhone ? String(pRawPhone).trim() : '');

                  return (
                    <div 
                      key={`player-${pRawId || pIdx}-${pIdx}`} 
                      className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer" 
                      onClick={() => { 
                        if (onUserClick) { 
                          const playerCandidate: Partial<User> = resolvedPlayerUser || {
                            id: pRawId,
                            name: displayPlayerName,
                            phone: displayPlayerPhone,
                            email: typeof player === 'object' ? (player.email || player.userEmail) : '',
                            skill_level: pSkill
                          };
                          onUserClick(pRawId || pNormPhone || `player_${match.id}_${pIdx}`, playerCandidate as User); 
                          onClose(); 
                        } 
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                        {displayPlayerName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                          <span>{displayPlayerName}</span>
                          {resolvedPlayerUser?.isDerived && (
                            <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded font-medium">
                              Invitado
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {displayPlayerPhone ? displayPlayerPhone : pSkill}
                        </div>
                      </div>
                      {(player as any)?.has_paid ? (
                        <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">Pagó</div>
                      ) : null}
                    </div>
                  );
                });
              })()}

              {/* Empty Slots */}
              {Array.from({ length: Math.max(0, (match.max_players || 10) - ((match.players || []).length)) }).map((_, i) => (
                <div key={`empty-player-slot-${match.id || 'm'}-${i}`} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors opacity-50">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    ?
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-gray-400 italic">Cupo Disponible</div>
                  </div>
                  <button type="button" className="text-xs font-bold text-emerald-600 hover:underline">Invitar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            {onCancelBooking && (
              <button 
                type="button"
                onClick={() => onCancelBooking(match)}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer shadow-sm shadow-red-600/20"
              >
                Cancelar reserva
              </button>
            )}
            <button type="button" 
              onClick={() => {
                if (onEdit) onEdit();
              }}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors"
            >
              Editar Reserva
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const CreateUserModal = ({ isOpen, onClose, onCreate }: { isOpen: boolean, onClose: () => void, onCreate: (user: any) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    gender: '',
    city: '',
    category: 'jugador',
    status: 'activo',
    acquisitionChannel: '',
    notes: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      gender: formData.gender,
      city: formData.city.trim(),
      category: formData.category,
      status: formData.status,
      acquisitionChannel: formData.acquisitionChannel || 'WhatsApp',
      notes: formData.notes.trim()
    });
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 pointer-events-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto pointer-events-auto"
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Nuevo Usuario</h2>
            <p className="text-xs text-gray-500">Alta de cliente según contrato canónico de producción</p>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre y Apellido *</label>
              <input 
                required 
                type="text" 
                placeholder="Ej: Facundo Aguirre"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono *</label>
              <input 
                required 
                type="tel" 
                placeholder="Ej: +54 9 11 1234-5678"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(Opcional)</span></label>
              <input 
                type="email" 
                placeholder="jugador@ejemplo.com"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Ciudad / Localidad</label>
              <input 
                type="text" 
                placeholder="Ej: CABA / Palermo"
                value={formData.city}
                onChange={e => setFormData({...formData, city: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Género</label>
              <select 
                value={formData.gender} 
                onChange={e => setFormData({...formData, gender: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="">Seleccionar género...</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Canal de Adquisición *</label>
              <select 
                required
                value={formData.acquisitionChannel} 
                onChange={e => setFormData({...formData, acquisitionChannel: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="">Seleccionar canal...</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Referido">Referido</option>
                <option value="Ig">Instagram (Ig)</option>
                <option value="Fb">Facebook (Fb)</option>
                <option value="Tiktok">TikTok</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="Evento">Evento</option>
                <option value="Cliente">Cliente Presencial</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Categoría</label>
              <select 
                value={formData.category} 
                onChange={e => setFormData({...formData, category: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="jugador">Jugador</option>
                <option value="capitán">Capitán</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Estado de Negocio</label>
              <select 
                value={formData.status} 
                onChange={e => setFormData({...formData, status: e.target.value})}
                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="activo">Activo</option>
                <option value="nuevo">Nuevo</option>
                <option value="frecuente">Frecuente</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Notas u Observaciones</label>
            <textarea 
              rows={2}
              placeholder="Preferencias de horario, observaciones..."
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button 
            type="submit" 
            disabled={!formData.name || !formData.phone}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-900/10 mt-2"
          >
            Guardar y Registrar Usuario
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const CreateMatchModal = ({ 
  isOpen, 
  onClose, 
  courts, 
  users, 
  onCreate, 
  onQuickAddUser, 
  initialData,
  complexId = 'complejo_central',
  onNavigate,
  onCancelBooking,
  onDeleteBooking
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  courts: Court[], 
  users: User[], 
  onCreate: (data: any) => void, 
  onQuickAddUser?: (user: any) => Promise<string | undefined> | any, 
  initialData?: any,
  complexId?: string,
  onNavigate?: (tab: NavTabId | string) => void,
  onCancelBooking?: (booking: any) => void,
  onDeleteBooking?: (booking: any) => void
}) => {
  // Proceso de Reserva en 2 Pasos (Paso 1: Datos de reserva / Paso 2: Registrar pago)
  const [step, setStep] = useState<1 | 2>(1);
  const [bookingPayments, setBookingPayments] = useState<Array<{
    id: string;
    method: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente';
    amount: number | '';
  }>>([
    { id: 'bpay_1', method: 'Pendiente', amount: '' }
  ]);

  const [data, setData] = useState<any>({ 
    court_id: '', 
    host_id: '', 
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    date: '', 
    time: '', 
    status: 'confirmado',
    payment_status: 'pending',
    amount_paid: 0,
    notes: ''
  });

  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [venue, setVenue] = useState<any>(null);

  // Desplegable de búsqueda de cliente
  const userSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [isSelectUserOpen, setIsSelectUserOpen] = useState(false);

  // Modal anidado para + Nuevo Cliente
  const [isAddingNewUser, setIsAddingNewUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados para filas de pago, popover de borrado y Sub-Bottom Sheet
  const [deleteBookingMenuRowId, setDeleteBookingMenuRowId] = useState<string | null>(null);
  const [isBookingPaymentSheetOpen, setIsBookingPaymentSheetOpen] = useState(false);
  const [editingBookingPaymentIndex, setEditingBookingPaymentIndex] = useState<number | null>(null);
  const [orderedBookingMethods, setOrderedBookingMethods] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('jogo_payment_methods_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) =>
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            const defs = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
            defs.forEach(d => {
              if (!normalized.includes(d)) normalized.push(d);
            });
            return Array.from(new Set(normalized));
          }
        }
      } catch (e) {}
    }
    return ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
  });

  const toBookingMethod = (m?: string): 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente' => {
    if (!m) return 'Efectivo';
    if (m === 'Tarjeta' || m === 'Credito' || m === 'Crédito') return 'Crédito';
    if (m === 'Transferencia') return 'Transferencia';
    if (m === 'Pendiente' || m === 'Fiado') return 'Pendiente';
    return 'Efectivo';
  };

  // Escuchar cambios de orden de métodos emitidos globalmente
  useEffect(() => {
    const handleOrderChange = () => {
      try {
        const saved = localStorage.getItem('jogo_payment_methods_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) =>
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            const defs = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
            defs.forEach(d => {
              if (!normalized.includes(d)) normalized.push(d);
            });
            const newOrder = Array.from(new Set(normalized));
            setOrderedBookingMethods(newOrder);
            setBookingPayments(prev => prev.length === 1 ? [{ ...prev[0], method: toBookingMethod(newOrder[0]) }] : prev);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('jogo_payment_methods_order_changed', handleOrderChange);
    return () => window.removeEventListener('jogo_payment_methods_order_changed', handleOrderChange);
  }, []);

  const handleSaveBookingMethodsOrder = (newOrder: string[]) => {
    setOrderedBookingMethods(newOrder);
    try {
      localStorage.setItem('jogo_payment_methods_order', JSON.stringify(newOrder));
      window.dispatchEvent(new Event('jogo_payment_methods_order_changed'));
    } catch (e) {}
    setBookingPayments(prev => prev.length === 1 ? [{ ...prev[0], method: toBookingMethod(newOrder[0]) }] : prev);
  };
  const [isBookingClientSearchOpen, setIsBookingClientSearchOpen] = useState(false);
  const bookingClientBoxRef = useRef<HTMLDivElement | null>(null);
  const bookingSheetDragControls = useDragControls();

  const renderBookingMethodIcon = (method: string) => {
    const m = method.toLowerCase();
    if (m.includes('transf') || m.includes('transfer')) {
      return <Landmark size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    if (m.includes('tarjeta') || m.includes('crédito') || m.includes('credito') || m.includes('credit')) {
      return <CreditCard size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    if (m.includes('pendiente') || m.includes('fiado')) {
      return <History size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    return <CircleDollarSign size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
  };

  // Suscripciones en tiempo real a Firestore para horarios del complejo y turnos existentes
  useEffect(() => {
    if (!isOpen || !complexId) return;
    const unsubVenue = subscribeToVenueProfile(complexId, (profile) => {
      if (profile) setVenue(profile);
    });
    const unsubBookings = subscribeToBookings(complexId, (bList) => {
      setExistingBookings(Array.isArray(bList) ? bList : []);
    });
    return () => {
      unsubVenue();
      unsubBookings();
    };
  }, [isOpen, complexId]);

  // Inicialización de datos al abrir o cambiar initialData
  useEffect(() => {
    if (!isOpen) return;

    const isEvent = initialData && (
      initialData.nativeEvent || 
      initialData.target || 
      initialData._reactName || 
      typeof initialData.preventDefault === 'function'
    );
    const isRealMatch = !isEvent && initialData && (
      initialData.id || 
      initialData.court_id || 
      initialData.courtId || 
      initialData.start_time || 
      initialData.startTime || 
      initialData.date
    );

    let initialCourtId = courts.length > 0 ? courts[0].id : '';
    let initialDate = new Date().toISOString().split('T')[0];
    let initialTime = '18:00';
    let initialHostId = '';
    let initialClientName = '';
    let initialClientPhone = '';
    let initialClientEmail = '';
    let initialStatus = 'confirmado';
    let initialPaymentStatus = 'pending';
    let initialAmountPaid = 0;
    let initialNotes = '';

    if (isRealMatch) {
      if (initialData.court_id || initialData.courtId) {
        initialCourtId = initialData.court_id || initialData.courtId;
      }
      const rawDateStr = initialData.start_time || initialData.startTime || initialData.date;
      if (rawDateStr && typeof rawDateStr === 'string') {
        const startDate = new Date(rawDateStr);
        if (!isNaN(startDate.getTime())) {
          initialTime = initialData.startTime || initialData.time || startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          initialDate = initialData.date || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        }
      }
      if (initialData.date) initialDate = initialData.date;
      if (initialData.startTime || initialData.time) initialTime = (initialData.startTime || initialData.time).substring(0, 5);
      
      initialHostId = initialData.host_id || initialData.userId || '';
      initialClientName = initialData.userName || initialData.clientName || '';
      initialClientPhone = initialData.userPhone || initialData.clientPhone || '';
      initialClientEmail = initialData.userEmail || initialData.clientEmail || '';
      initialStatus = initialData.status || 'confirmado';
      initialPaymentStatus = initialData.payment_status || initialData.paymentStatus || 'pending';
      initialAmountPaid = Number(initialData.amount_paid ?? initialData.deposit ?? 0);
      initialNotes = initialData.notes || '';
    } else if (initialData && typeof initialData === 'object') {
      if (initialData.date) initialDate = initialData.date;
      if (initialData.courtId || initialData.court_id) initialCourtId = initialData.courtId || initialData.court_id;
      if (initialData.startTime || initialData.time) initialTime = (initialData.startTime || initialData.time).substring(0, 5);
    }

    const currentCourt = courts.find(c => String(c.id) === String(initialCourtId)) || (courts.length > 0 ? courts[0] : null);
    const courtPrice = Number(currentCourt?.price_per_hour ?? currentCourt?.price ?? 0);
    if (initialPaymentStatus === 'partial' && initialAmountPaid === 0 && courtPrice > 0) {
      initialAmountPaid = Math.round(courtPrice * 0.1);
    } else if (initialPaymentStatus === 'paid' && initialAmountPaid === 0 && courtPrice > 0) {
      initialAmountPaid = courtPrice;
    }

    setData({
      id: isRealMatch ? initialData.id : undefined,
      court_id: initialCourtId,
      host_id: initialHostId,
      clientName: initialClientName,
      clientPhone: initialClientPhone,
      clientEmail: initialClientEmail,
      date: initialDate,
      time: initialTime,
      status: initialStatus,
      payment_status: initialPaymentStatus,
      amount_paid: initialAmountPaid,
      notes: initialNotes
    });
    const isEditingExisting = Boolean(isRealMatch && initialData?.id);
    if (!isEditingExisting) {
      setIsSelectUserOpen(true);
      setTimeout(() => {
        userSearchInputRef.current?.focus();
      }, 120);
    } else {
      setIsSelectUserOpen(false);
    }
    setUserSearch('');
    setStep(1);
    const defaultMethod = toBookingMethod(orderedBookingMethods[0]);
    if (isEditingExisting) {
      if (initialAmountPaid > 0 && initialAmountPaid < courtPrice) {
        setBookingPayments([
          { id: `bpay_${Date.now()}_1`, method: 'Efectivo', amount: initialAmountPaid },
          { id: `bpay_${Date.now()}_2`, method: 'Pendiente', amount: courtPrice - initialAmountPaid }
        ]);
      } else if (initialPaymentStatus === 'paid' && initialAmountPaid >= courtPrice) {
        setBookingPayments([
          { id: `bpay_${Date.now()}`, method: 'Efectivo', amount: initialAmountPaid }
        ]);
      } else {
        setBookingPayments([
          { id: `bpay_${Date.now()}`, method: 'Pendiente', amount: courtPrice > 0 ? courtPrice : '' }
        ]);
      }
    } else {
      // Nueva reserva: monto vacío (placeholder "0") y primer método predeterminado persistente
      setBookingPayments([
        { id: `bpay_${Date.now()}`, method: defaultMethod, amount: '' }
      ]);
    }
  }, [isOpen, initialData, courts]);

  if (!isOpen) return null;

  const selectedCourt = courts.find(c => String(c.id) === String(data.court_id)) || (courts.length > 0 ? courts[0] : null);
  const priceTotal = Number(selectedCourt?.price_per_hour ?? selectedCourt?.price ?? 0);

  // 3. Hora: Desplegable con filtro reactivo de turnos ocupados
  const getAvailableHours = useCallback(() => {
    const defaultHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    let hoursRange: number[] = defaultHours;

    if (venue && Array.isArray(venue.hours) && data.date) {
      const [y, m, d] = data.date.split('-').map(Number);
      const selectedDateObj = new Date(y, m - 1, d);
      if (!isNaN(selectedDateObj.getTime())) {
        const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const targetDayName = dayNames[selectedDateObj.getDay()];
        const hourConfig = venue.hours.find((h: any) => {
          const dName = String(h?.day || '').toLowerCase().replace('é', 'e').replace('á', 'a');
          return dName === targetDayName.replace('é', 'e').replace('á', 'a');
        });

        if (hourConfig && hourConfig.open === false) {
          return [];
        }

        if (hourConfig) {
          const startH = parseInt(hourConfig.start?.split(':')[0] || hourConfig.openTime?.split(':')[0] || '14', 10);
          let endH = parseInt(hourConfig.end?.split(':')[0] || hourConfig.closeTime?.split(':')[0] || '0', 10);
          if (isNaN(endH) || endH === 0 || hourConfig.crossesMidnight || hourConfig.end === '00:00') {
            endH = 24;
          }

          const generated: number[] = [];
          if (startH <= endH) {
            for (let i = startH; i <= endH; i++) generated.push(i);
          } else {
            for (let i = startH; i <= 24; i++) generated.push(i);
            for (let i = 0; i <= endH; i++) generated.push(i);
          }
          if (generated.length > 0) hoursRange = generated;
        }
      }
    }

    // Duración de la reserva que se está creando/editando (60 min)
    const newDurationMin = 60;

    // Filtrar turnos activos que ocupan la cancha y fecha elegidas o canchas superpuestas bloqueadas
    const activeBookingsForCourt = (existingBookings || []).filter(b => {
      if (!b) return false;
      if (data.id && String(b.id) === String(data.id)) return false;

      const bStatus = String(b.status || '').toLowerCase();
      if (bStatus === 'cancelado' || bStatus === 'cancelled') return false;

      const bookingCourtId = b.courtId ?? b.court_id;
      const sameCourt = String(bookingCourtId) === String(data.court_id) || 
                        (selectedCourt && (b.court_name === selectedCourt.name || b.courtName === selectedCourt.name));
      const isOverlapBlocked = areCourtsMutuallyBlocked(data.court_id, bookingCourtId, courts);
      if (!sameCourt && !isOverlapBlocked) return false;

      const bDate = b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
      if (bDate !== data.date) return false;

      return true;
    });

    const result: string[] = [];
    for (const h of hoursRange) {
      const timeStr = h === 24 ? "00:00" : `${String(h % 24).padStart(2, '0')}:00`;
      const slotStartMin = (h % 24) * 60;
      const slotEndMin = slotStartMin + newDurationMin;

      // Evaluar colisión real por solapamiento de intervalos [inicio, fin)
      const hasCollision = activeBookingsForCourt.some(b => {
        const bStartStr = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '');
        const bEndStr = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '');
        if (!bStartStr) return false;

        const bStartMin = timeStringToMinutes(bStartStr);
        let bEndMin = bEndStr ? timeStringToMinutes(bEndStr) : bStartMin + 60;
        return intervalsOverlap(slotStartMin, slotEndMin, bStartMin, bEndMin);
      });

      if (!hasCollision) {
        if (!result.includes(timeStr)) result.push(timeStr);
      }
    }

    return result;
  }, [venue, data.date, data.court_id, data.id, existingBookings, selectedCourt, courts]);

  const availableHours = getAvailableHours();
  const displayHours = availableHours;

  // Evalúa si una cancha específica está ocupada para el día (data.date) y horario (data.time) actual (incluyendo bloqueo mutuo)
  const isCourtOccupiedForTime = useCallback((courtId: string | number) => {
    if (!data.date || !data.time) return false;
    const [h, m] = data.time.split(':').map(Number);
    const slotStartMin = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    const slotEndMin = slotStartMin + 60;

    return (existingBookings || []).some(b => {
      if (!b) return false;
      if (data.id && String(b.id) === String(data.id)) return false;

      const bStatus = String(b.status || '').toLowerCase();
      if (bStatus === 'cancelado' || bStatus === 'cancelled') return false;

      const currentCourtObj = courts.find(c => String(c.id) === String(courtId));
      const bookingCourtId = b.court_id ?? b.courtId;
      const sameCourt = String(bookingCourtId) === String(courtId) || 
                        (currentCourtObj && (b.court_name === currentCourtObj.name || b.courtName === currentCourtObj.name));
      const isOverlapBlocked = areCourtsMutuallyBlocked(courtId, bookingCourtId, courts);
      if (!sameCourt && !isOverlapBlocked) return false;

      const bDate = b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
      if (bDate !== data.date) return false;

      const bStartStr = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '');
      const bEndStr = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '');
      if (!bStartStr) return false;

      const bStartMin = timeStringToMinutes(bStartStr);
      let bEndMin = bEndStr ? timeStringToMinutes(bEndStr) : bStartMin + 60;
      return intervalsOverlap(slotStartMin, slotEndMin, bStartMin, bEndMin);
    });
  }, [data.date, data.time, data.id, existingBookings, courts]);

  // Si cambia la cancha o la fecha y el horario previo quedó ocupado, actualizar al primer disponible
  useEffect(() => {
    if (data.date && data.court_id) {
      const avail = getAvailableHours();
      if (avail.length > 0 && data.time && !avail.includes(data.time)) {
        if (!(data.id && initialData?.time === data.time)) {
          setData((prev: any) => ({ ...prev, time: avail[0] }));
        }
      }
    }
  }, [data.date, data.court_id, getAvailableHours]);

  // Cálculos reactivos de pagos mixtos para la reserva (Paso 2)
  const totalAssignedBookingPayments = useMemo(() => {
    return bookingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [bookingPayments]);

  const bookingDiff = totalAssignedBookingPayments - priceTotal;
  const isBookingSobra = priceTotal > 0 && bookingDiff > 0.01;
  const isBookingFalta = priceTotal > 0 && bookingDiff < -0.01;
  const bookingSobrante = Math.max(0, bookingDiff);
  const bookingFaltante = Math.max(0, -bookingDiff);
  const isBookingMathExact = priceTotal > 0 && Math.abs(bookingDiff) < 0.01;

  const handleAddNewBookingPaymentMethod = (methodToUse?: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente') => {
    const available: Array<'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente'> = ['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'];
    let selMethod = methodToUse;
    if (!selMethod) {
      selMethod = available.find(m => !bookingPayments.some(p => p.method === m)) || 'Transferencia';
    }
    const newAmt = bookingFaltante > 0 ? bookingFaltante : 0;
    setBookingPayments(prev => [
      ...prev,
      { id: `bpay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, method: selMethod!, amount: newAmt }
    ]);
  };

  const handleChangeBookingBlockMethod = (index: number, newMethod: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente') => {
    setBookingPayments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], method: newMethod };
      }
      return copy;
    });
  };

  const handleRemoveBookingPaymentBlock = (id: string) => {
    if (bookingPayments.length <= 1) return;
    setBookingPayments(prev => prev.filter(p => p.id !== id));
  };

  const handleAutocorrectBookingSobrante = () => {
    if (bookingPayments.length === 1) {
      setBookingPayments([{ ...bookingPayments[0], amount: priceTotal }]);
    } else {
      setBookingPayments(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        const curAmt = Number(last.amount) || 0;
        copy[copy.length - 1] = { ...last, amount: Math.max(0, curAmt - bookingSobrante) };
        return copy;
      });
    }
  };

  const handleProceedToPayment = () => {
    setErrorMessage(null);
    if (!data.host_id && !data.clientName) {
      setErrorMessage('Por favor elegí o creá un cliente.');
      return;
    }
    if (!data.date) {
      setErrorMessage('Por favor seleccioná una fecha.');
      return;
    }
    if (!data.time) {
      setErrorMessage('Por favor seleccioná un horario.');
      return;
    }
    if (!data.court_id) {
      setErrorMessage('Por favor seleccioná una cancha.');
      return;
    }
    if (isCourtOccupiedForTime(data.court_id)) {
      setErrorMessage('La cancha seleccionada ya está ocupada en ese horario. Por favor elegí otra cancha.');
      return;
    }
    const avail = getAvailableHours();
    if (!avail.includes(data.time) && !(data.id && initialData?.time === data.time)) {
      setErrorMessage('Este horario ya no está disponible. Elegí otro.');
      return;
    }

    const defaultMethod = toBookingMethod(orderedBookingMethods[0]);
    if (!data.id) {
      // Para nueva reserva: forzar el bloque de pago inicial con el primer método predeterminado y monto vacío ''
      if (bookingPayments.length <= 1 && (bookingPayments[0]?.amount === '' || Number(bookingPayments[0]?.amount) === 0)) {
        setBookingPayments([
          { id: bookingPayments[0]?.id || `bpay_${Date.now()}`, method: defaultMethod, amount: '' }
        ]);
      }
    } else {
      if (bookingPayments.length <= 1 && (bookingPayments[0]?.amount === '' || Number(bookingPayments[0]?.amount) === 0)) {
        setBookingPayments([
          { id: `bpay_${Date.now()}`, method: toBookingMethod(bookingPayments[0]?.method) || defaultMethod, amount: priceTotal }
        ]);
      }
    }
    setStep(2);
  };

  // Guardado de la reserva con validación robusta y mensaje claro ante colisiones
  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!data.time) {
      setErrorMessage('Por favor elegí un horario.');
      return;
    }
    if (!data.court_id) {
      setErrorMessage('Por favor seleccioná una cancha.');
      return;
    }
    if (isCourtOccupiedForTime(data.court_id)) {
      setErrorMessage('La cancha seleccionada ya está ocupada en ese horario. Por favor elegí otra cancha.');
      return;
    }

    const avail = getAvailableHours();
    if (!avail.includes(data.time) && !(data.id && initialData?.time === data.time)) {
      setErrorMessage('Este horario ya no está disponible. Elegí otro.');
      return;
    }

    const finalPayments = [...bookingPayments];
    if (priceTotal > 0) {
      if (isBookingFalta) {
        setErrorMessage(
          `Faltan $${bookingFaltante.toLocaleString()} por asignar para completar el total de la reserva ($${priceTotal.toLocaleString()}).`
        );
        return;
      }
      if (isBookingSobra) {
        // Autocorregir excedente de efectivo antes de guardar
        const cashIdx = finalPayments.map(p => p.method).lastIndexOf('Efectivo');
        const targetIdx = cashIdx >= 0 ? cashIdx : finalPayments.length - 1;
        const curAmt = Number(finalPayments[targetIdx]?.amount) || 0;
        finalPayments[targetIdx] = {
          ...finalPayments[targetIdx],
          amount: Math.max(0, curAmt - bookingSobrante)
        };
      }
    }

    const selectedHost = users.find(u => String(u.id) === String(data.host_id));
    const hasClient = Boolean((selectedHost && selectedHost.id) || (data.clientName && String(data.clientName).trim()));
    const hasPendingPayment = finalPayments.some(p => p.method === 'Pendiente' && (Number(p.amount) || 0) > 0);
    if (hasPendingPayment && !hasClient) {
      setErrorMessage('Es obligatorio seleccionar o ingresar un cliente cuando hay saldo pendiente.');
      return;
    }

    const clientName = selectedHost?.name || data.clientName || 'Cliente';
    const clientPhone = selectedHost?.phone || data.clientPhone || '';
    const clientEmail = selectedHost?.email || data.clientEmail || '';

    const [y, m, d] = (data.date || '').split('-').map(Number);
    const [hh, mm] = (data.time || '18:00').split(':').map(Number);
    const startDateTime = (!isNaN(y) && !isNaN(m) && !isNaN(d)) 
      ? new Date(y, m - 1, d, isNaN(hh) ? 18 : hh, isNaN(mm) ? 0 : mm)
      : new Date();
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    const endTimeStr = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;
    const courtName = selectedCourt?.name || 'Cancha';

    const paidAmount = finalPayments
      .filter(p => p.method !== 'Pendiente')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pendingAmount = finalPayments
      .filter(p => p.method === 'Pendiente')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const mapMethod = (m: string): FinancialPaymentMethod => {
      const lower = m.toLowerCase();
      if (lower.includes('transf') || lower === 'transfer') return 'transfer';
      if (lower.includes('crédito') || lower.includes('tarjeta') || lower === 'credit') return 'credit';
      return 'cash';
    };

    const paidPayments = finalPayments
      .filter(p => p.method !== 'Pendiente' && (Number(p.amount) || 0) > 0)
      .map(p => ({
        amount: Number(p.amount),
        paymentMethod: mapMethod(p.method),
        notes: `Cobro reserva (${p.method}) · ${clientName}`
      }));

    const paymentStatus = paidAmount >= priceTotal && priceTotal > 0 ? 'pagado' : (paidAmount > 0 ? 'seña' : 'pendiente');

    setIsSubmitting(true);
    try {
      const resolvedCanonId = selectedHost?.canonicalId || data.canonicalId;
      const resolvedCanonName = selectedHost?.canonicalName || data.canonicalName;
      const resolvedHistId = selectedHost?.historicalId || data.historicalId;
      const resolvedHistIds = selectedHost?.historicalIds || data.historicalIds;

      await onCreate({
        ...data,
        courtId: data.court_id,
        courtName,
        clientName,
        userName: clientName,
        clientPhone,
        userPhone: clientPhone,
        clientEmail,
        userEmail: clientEmail,
        userId: selectedHost?.id ? String(selectedHost.id) : '0',
        date: data.date,
        startTime: data.time,
        endTime: endTimeStr,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        durationMinutes: 60,
        price: priceTotal,
        price_total: priceTotal,
        deposit: paidAmount,
        amount_paid: paidAmount,
        amountPending: pendingAmount,
        payments: paidPayments,
        status: (() => {
          if (data.status === 'cancelado') return 'cancelado';
          const now = new Date();
          return endDateTime < now ? 'jugado' : 'confirmado';
        })(),
        paymentStatus,
        notes: data.notes || '',
        ...(resolvedCanonId ? { canonicalId: resolvedCanonId } : {}),
        ...(resolvedCanonName ? { canonicalName: resolvedCanonName } : {}),
        ...(resolvedHistId ? { historicalId: resolvedHistId } : {}),
        ...(Array.isArray(resolvedHistIds) && resolvedHistIds.length > 0 ? { historicalIds: resolvedHistIds } : {})
      });
      onClose();
    } catch (err: any) {
      console.error('Error al guardar la reserva:', err);
      setErrorMessage(err?.message || 'Este horario ya no está disponible. Elegí otro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Alta anidada de usuario usando NewUserModal sin desmontar el modal de reserva
  const handleSaveFromNewUserModal = async (userData: any) => {
    let realUserId = '';
    if (onQuickAddUser) {
      try {
        const res = await onQuickAddUser({
          name: userData.name,
          phone: userData.phone,
          email: userData.email,
          address: userData.address,
          city: userData.address,
          gender: userData.gender,
          acquisitionChannel: userData.acquisitionChannel || 'WhatsApp',
          category: userData.category || 'jugador',
          birthDate: userData.birthDate || '',
          notes: '',
          preferredFoot: '',
          status: 'activo'
        });
        if (res && typeof res === 'string') {
          realUserId = res;
        }
      } catch (err) {
        console.warn('Error al crear usuario rápido:', err);
      }
    }

    const assignedId = realUserId || `temp_${Date.now()}`;

    // Auto-seleccionar el usuario creado y conservar intactos los demás campos
    setData((prev: any) => ({
      ...prev,
      host_id: assignedId,
      userId: assignedId,
      clientName: userData.name,
      clientPhone: userData.phone,
      clientEmail: userData.email || ''
    }));

    setIsAddingNewUser(false);
  };

  const selectedHost = users.find(u => String(u.id) === String(data.host_id));
  const hasClient = Boolean((selectedHost && selectedHost.id) || (data.clientName && String(data.clientName).trim()));
  const clientDisplayName = selectedHost?.name || data.clientName || '';
  const clientDisplayPhone = selectedHost?.phone || data.clientPhone || '';
  const hasPendingBookingPayment = bookingPayments.some(p => p.method === 'Pendiente' && (Number(p.amount) || 0) > 0);
  const isBookingClientBlocked = hasPendingBookingPayment && !hasClient;
  const canConfirmBooking = (isBookingMathExact || isBookingSobra) && !isBookingClientBlocked && !isSubmitting && priceTotal > 0;

  const [hhCalc, mmCalc] = (data.time || '18:00').split(':').map(Number);
  const endHourCalc = isNaN(hhCalc) ? 19 : ((hhCalc + 1) % 24);
  const endTimeStr = `${String(endHourCalc).padStart(2, '0')}:${String(isNaN(mmCalc) ? 0 : mmCalc).padStart(2, '0')}`;

  const selectedUserName = clientDisplayName;
  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      (u.canonicalName && u.canonicalName.toLowerCase().includes(term)) ||
      (u.phone && u.phone.includes(term))
    );
  });

  return (
    <>
      <div 
        className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60 backdrop-blur-xs p-0 sm:p-4"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      >
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-t-[32px] sm:rounded-3xl bg-[#f8fafc] dark:bg-slate-900 border-t border-x border-gray-100 dark:border-slate-800 shadow-2xl overflow-hidden mx-auto flex flex-col max-h-[92vh]"
        >
          {/* Barra gris de arrastre */}
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-2 shrink-0" />

          {/* En Paso 1: Cabecera con pestañas. En Paso 2: Cabecera estandarizada con botón volver */}
          {step === 1 ? (
            <div className="px-4 sm:px-5 pb-3 border-b border-gray-100 dark:border-slate-800 shrink-0 space-y-2 bg-white dark:bg-slate-900">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>{data.id ? 'Editar reserva' : 'Nueva reserva'}</span>
                  </h2>
                </div>

                <div className="flex items-center gap-1">
                  {data.id && onDeleteBooking && (
                    <button 
                      type="button" 
                      onClick={() => onDeleteBooking(initialData || data)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar reserva definitivamente"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose();
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Selector de pasos visual plano sin fondo de caja */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="cursor-pointer text-left flex flex-col items-center"
                >
                  <span className={cn(
                    "text-xs sm:text-sm pb-1.5 block text-center transition-colors",
                    step === 1 ? "font-extrabold text-gray-900 dark:text-white" : "font-bold text-gray-400"
                  )}>
                    1. Datos del Turno
                  </span>
                  <div className={cn(
                    "h-1 rounded-full w-full transition-all",
                    step === 1 ? "bg-[#0BA70B]" : "bg-gray-200 dark:bg-slate-700"
                  )} />
                </button>
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  className="cursor-pointer text-left flex flex-col items-center"
                >
                  <span className="text-xs sm:text-sm pb-1.5 block text-center transition-colors font-bold text-gray-400">
                    2. Registrar Pago
                  </span>
                  <div className="h-1 rounded-full w-full transition-all bg-gray-200 dark:bg-slate-700" />
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-20">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setStep(1);
                }}
                className="p-1 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-800 dark:text-white transition-colors cursor-pointer"
                title="Volver al Paso 1"
              >
                <ChevronLeft size={24} />
              </button>
              <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white flex-1 text-center pr-6">
                Cobro de reservas
              </h3>
            </div>
          )}

          {/* CUERPO DEL PASO 1: DATOS DEL TURNO */}
          {step === 1 ? (
            <>
              <div className="space-y-3 p-4 sm:p-5 pt-3 overflow-y-auto pr-2 flex-1 text-xs sm:text-sm">
              {/* 1. Cliente: Buscador con botón '+ Nuevo Cliente' */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isSelectUserOpen;
                      setIsSelectUserOpen(next);
                      if (next) {
                        setTimeout(() => userSearchInputRef.current?.focus(), 80);
                      }
                    }}
                    className="w-full h-9.5 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-left flex justify-between items-center focus:ring-2 focus:ring-[#0BA70B] outline-none cursor-pointer relative"
                  >
                    <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <span className={selectedUserName ? "text-gray-900 dark:text-white font-medium truncate text-xs sm:text-sm" : "text-gray-400 truncate text-xs sm:text-sm"}>
                      {selectedUserName || "Buscar o seleccionar cliente..."}
                    </span>
                    <ChevronDown size={15} className="text-gray-400 shrink-0 ml-1" />
                  </button>

                  {isSelectUserOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-gray-100 dark:border-slate-700 flex items-center bg-gray-50 dark:bg-slate-900/50">
                        <Search size={14} className="text-gray-400 ml-1 shrink-0" />
                        <input 
                          ref={userSearchInputRef}
                          type="text"
                          placeholder="Buscar por nombre o teléfono..."
                          className="w-full px-2 py-1 bg-transparent outline-none text-xs text-gray-900 dark:text-white"
                          value={userSearch}
                          onChange={e => setUserSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50">
                        {filteredUsers.map((u, uIdx) => (
                          <div 
                            key={`select-user-${u.id || uIdx}-${uIdx}`}
                            onClick={() => {
                              setData((prev: any) => ({
                                ...prev,
                                host_id: u.id,
                                clientName: u.name,
                                clientPhone: u.phone || '',
                                clientEmail: u.email || '',
                                canonicalId: u.canonicalId,
                                canonicalName: u.canonicalName,
                                historicalId: u.historicalId,
                                historicalIds: u.historicalIds
                              }));
                              setIsSelectUserOpen(false);
                              setUserSearch('');
                            }}
                            className="p-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-gray-900 dark:text-white truncate block">{u.name}</span>
                              {u.phone && <span className="text-[11px] text-gray-400 dark:text-slate-400 block">{u.phone}</span>}
                            </div>
                            {String(data.host_id) === String(u.id) && <Check size={14} className="text-[#0BA70B] shrink-0" />}
                          </div>
                        ))}
                        {filteredUsers.length === 0 && (
                          <div className="p-3 text-center text-xs text-gray-400 dark:text-slate-500">
                            No se encontraron usuarios. Usa "+ Nuevo Cliente".
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  type="button"
                  onClick={() => setIsAddingNewUser(true)}
                  className="h-9.5 px-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#0BA70B] bg-[#0BA70B]/10 hover:bg-[#0BA70B]/20 rounded-xl cursor-pointer border border-[#0BA70B]/30 shrink-0 transition-colors"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Nuevo Cliente</span>
                </button>
              </div>

              {/* 2 & 3. Fecha y Hora */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative flex items-center">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input 
                    type="date" 
                    value={data.date || ''}
                    onChange={e => setData({ ...data, date: e.target.value })}
                    className="w-full h-9.5 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]" 
                  />
                </div>

                <div className="relative flex items-center">
                  <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select 
                    value={data.time || ''}
                    onChange={e => setData({ ...data, time: e.target.value })}
                    disabled={!data.date || displayHours.length === 0}
                    className="w-full h-9.5 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B] disabled:opacity-50"
                  >
                    <option value="" disabled>
                      {!data.date ? 'Elige fecha' : displayHours.length === 0 ? 'Sin horarios' : 'Seleccionar horario...'}
                    </option>
                    {displayHours.map((time, tIdx) => (
                      <option key={`opt-time-${time}-${tIdx}`} value={time}>
                        {time} hs
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Cancha */}
              <div className="relative flex items-center">
                <Trophy size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  value={data.court_id ? String(data.court_id) : ''}
                  onChange={e => {
                    const newCourtId = e.target.value;
                    if (isCourtOccupiedForTime(newCourtId)) return;
                    const court = courts.find(c => String(c.id) === String(newCourtId));
                    const newPrice = Number(court?.price_per_hour ?? court?.price ?? 0);
                    setData((prev: any) => ({
                      ...prev,
                      court_id: newCourtId
                    }));
                    if (data.id && bookingPayments.length <= 1) {
                      setBookingPayments([
                        { id: `bpay_${Date.now()}`, method: 'Pendiente', amount: newPrice }
                      ]);
                    }
                  }}
                  className="w-full h-9.5 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
                >
                  <option value="" disabled>Seleccionar cancha...</option>
                  {courts.map((court, cIdx) => {
                    const isOccupied = isCourtOccupiedForTime(court.id);
                    const isInactive = court.status === 'inactiva';
                    const isDisabled = isOccupied || isInactive;
                    return (
                      <option 
                        key={`court-opt-${court.id || cIdx}`} 
                        value={String(court.id)}
                        disabled={isDisabled}
                        className={isDisabled ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800" : ""}
                      >
                        {court.name} - ${Number(court.price_per_hour ?? court.price ?? 0).toLocaleString()} {isInactive ? '(Inactiva)' : isOccupied ? '(Ocupada)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              {data.court_id && isCourtOccupiedForTime(data.court_id) && (
                <p className="text-[11px] text-red-600 dark:text-red-400 font-bold mt-1.5 flex items-center gap-1">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>Esta cancha ya está ocupada en el horario seleccionado. Elegí otra cancha o cambiá el horario.</span>
                </p>
              )}

              {/* 5. Notas u Observaciones */}
              <div className="relative flex items-center">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Notas u observaciones (opcional)..."
                  value={data.notes || ''}
                  onChange={e => setData({ ...data, notes: e.target.value })}
                  className="w-full h-9.5 pl-9 pr-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B] placeholder:text-gray-400"
                />
              </div>

              {/* Mensaje de error si falta algún dato */}
              {errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0 text-red-600 dark:text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Botones de Acción al Pie para Paso 1 */}
            <div className="flex items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              {data.id && onCancelBooking ? (
                <button 
                  type="button" 
                  onClick={() => onCancelBooking(initialData || data)}
                  disabled={isSubmitting}
                  className="py-2.5 px-3.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20 cursor-pointer disabled:opacity-50"
                >
                  Cancelar reserva
                </button>
              ) : null}

              <div className="flex items-center gap-2 flex-1 justify-end">
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  disabled={isSubmitting}
                  className="py-2.5 px-3.5 rounded-xl font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {data.id ? 'Cerrar' : 'Cancelar'}
                </button>
                <button 
                  type="button" 
                  onClick={handleProceedToPayment} 
                  disabled={isSubmitting || (!data.host_id && !data.clientName) || !data.date || !data.time || !data.court_id}
                  className="py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Continuar al Pago</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* CUERPO DEL PASO 2: REGISTRAR EL PAGO (IDÉNTICO A MOSTRADOR Y GASTOS) */
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
            onClick={() => {
              setIsBookingClientSearchOpen(false);
              setDeleteBookingMenuRowId(null);
            }}
          >
            {/* Resumen centrado */}
            <div className="text-center pt-2 pb-1 space-y-1">
              <span className="text-xs text-gray-400 font-medium lowercase block">
                total a cobrar
              </span>
              <span className="text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight block">
                ${priceTotal.toLocaleString()}
              </span>
              <div className="max-w-[240px] sm:max-w-[260px] mx-auto pt-1.5 flex items-center justify-between gap-4 text-left">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 truncate">
                  {selectedCourt?.name || 'Cancha'}
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 shrink-0">
                  {data.time} a {endTimeStr} hs
                </span>
              </div>
            </div>

            {/* Fila Cliente: Título cliqueable sin caja (o info del cliente seleccionado) */}
            <div ref={bookingClientBoxRef} className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {!hasClient ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsBookingClientSearchOpen(!isBookingClientSearchOpen)}
                    className={`text-left font-bold text-sm cursor-pointer block ${
                      isBookingClientBlocked 
                        ? 'text-red-600' 
                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {isBookingClientBlocked 
                      ? '+ Añadir cliente (Obligatorio) *' 
                      : '+ Añadir cliente (opcional)'}
                  </button>

                  {isBookingClientSearchOpen && (
                    <div className="mt-2 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre o teléfono..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="w-full h-8 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#0BA70B]"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                        {filteredUsers.length === 0 ? (
                          <p className="p-2 text-gray-400 text-center">No hay clientes disponibles</p>
                        ) : (
                          filteredUsers.map((u, uIdx) => (
                            <div
                              key={`booking-client-opt-${u.id || uIdx}`}
                              onClick={() => {
                                setData((prev: any) => ({
                                  ...prev,
                                  host_id: u.id,
                                  userId: u.id,
                                  clientName: u.name,
                                  clientPhone: u.phone || '',
                                  clientEmail: u.email || '',
                                  canonicalId: u.canonicalId,
                                  canonicalName: u.canonicalName,
                                  historicalId: u.historicalId,
                                  historicalIds: u.historicalIds
                                }));
                                setIsBookingClientSearchOpen(false);
                                setUserSearch('');
                              }}
                              className="p-2 hover:bg-emerald-50 dark:hover:bg-slate-700/60 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white">{u.name}</p>
                                <p className="text-[11px] text-[#0BA70B] font-mono">{u.phone || '-'}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {clientDisplayName}
                    </p>
                    {clientDisplayPhone ? (
                      <p
                        onClick={() => {
                          const cleanPhone = clientDisplayPhone.replace(/\D/g, '');
                          if (cleanPhone) window.open(`https://wa.me/${cleanPhone}`, '_blank');
                        }}
                        className="text-xs font-mono text-[#0BA70B] hover:underline cursor-pointer"
                        title="Enviar WhatsApp"
                      >
                        {clientDisplayPhone}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 font-mono">Sin teléfono</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setData((prev: any) => ({
                        ...prev,
                        host_id: '',
                        clientName: '',
                        clientPhone: '',
                        clientEmail: '',
                        canonicalId: undefined,
                        canonicalName: undefined,
                        historicalId: undefined,
                        historicalIds: undefined
                      }));
                    }}
                    className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg cursor-pointer transition-colors"
                    title="Quitar cliente"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Filas de Métodos de Pago */}
            <div className="space-y-2 pt-1">
              <div className="text-sm font-bold text-gray-600 dark:text-slate-300 text-left">
                Método de pago
              </div>

              <div className="space-y-1.5">
                {bookingPayments.map((p, idx) => {
                  const isDeleteOpen = deleteBookingMenuRowId === p.id;

                  return (
                    <div
                      key={`bpay-row-${p.id}`}
                      className="bg-transparent border-none shadow-none py-1.5 relative"
                    >
                      {/* Fila principal en una sola línea horizontal */}
                      <div className="flex items-center justify-between w-full">
                        {/* Zona 1: Icono + Nombre del método */}
                        <div 
                          onClick={() => {
                            setEditingBookingPaymentIndex(idx);
                            setIsBookingPaymentSheetOpen(true);
                          }}
                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer py-1"
                        >
                          {renderBookingMethodIcon(p.method)}
                          <span className="font-black text-sm text-gray-900 dark:text-white truncate">
                            {p.method}
                          </span>
                        </div>

                        {/* Zona 2: Badge de Monto SIN BORDE */}
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={p.amount}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBookingPayments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                return copy;
                              });
                            }}
                            className={`border-0 border-none ring-0 focus:ring-0 outline-none rounded-lg px-3 py-1.5 w-24 text-center font-bold text-xs sm:text-sm transition-colors ${
                              isBookingFalta 
                                ? 'bg-[#fce8e8] text-gray-900 dark:bg-red-950/50 dark:text-white' 
                                : 'bg-emerald-100 text-[#0BA70B] dark:bg-emerald-950/60 dark:text-emerald-400 font-black'
                            }`}
                          />

                          {/* Zona 3: Flecha > con Popover de Borrado */}
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteBookingMenuRowId(isDeleteOpen ? null : p.id);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition-colors"
                            >
                              <ChevronRight size={18} />
                            </button>

                            {isDeleteOpen && (
                              <div className="absolute right-0 top-full mt-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveBookingPaymentBlock(p.id);
                                    setDeleteBookingMenuRowId(null);
                                  }}
                                  className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                  <span>Borrar método de pago</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Renglón inferior alineado bajo el badge */}
                      {bookingFaltante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setBookingPayments((prev) => {
                                const copy = [...prev];
                                const cur = Number(copy[idx].amount) || 0;
                                copy[idx] = { ...copy[idx], amount: cur + bookingFaltante };
                                return copy;
                              });
                            }}
                            className="text-[11px] font-bold text-rose-600 underline cursor-pointer"
                          >
                            Faltan ${bookingFaltante.toLocaleString()}
                          </button>
                        </div>
                      )}

                      {bookingSobrante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={handleAutocorrectBookingSobrante}
                            className="text-[11px] font-bold text-[#0BA70B] underline cursor-pointer"
                          >
                            Sobran ${bookingSobrante.toLocaleString()}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Botón "+ agregar método de pago" con fondo transparente */}
              {bookingFaltante > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBookingPaymentIndex(null);
                    setIsBookingPaymentSheetOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-transparent border border-gray-200 dark:border-slate-700 text-center font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  + agregar método de pago
                </button>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Botón Principal Inferior en Paso 2 de Reservas */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canConfirmBooking}
                className="w-full py-3.5 bg-[#0BA70B] hover:bg-[#099609] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#0BA70B]/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Guardando...' : (data.id ? 'Guardar Cambios' : 'Confirmar Reserva')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>

    {/* Sub-Bottom Sheet para selección de método de pago de reservas */}
    <AnimatePresence>
      {isBookingPaymentSheetOpen && (
        <div 
          className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/60 backdrop-blur-xs select-none"
          onClick={() => {
            setIsBookingPaymentSheetOpen(false);
            setEditingBookingPaymentIndex(null);
          }}
        >
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                setIsBookingPaymentSheetOpen(false);
                setEditingBookingPaymentIndex(null);
              }
            }}
            dragControls={bookingSheetDragControls}
            dragListener={false}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-t-[32px] p-5 shadow-2xl border-t border-x border-gray-100 dark:border-slate-800"
          >
            <div 
              onPointerDown={(e) => bookingSheetDragControls.start(e)}
              className="touch-none cursor-grab active:cursor-grabbing text-center space-y-1 -mt-1 mb-2"
            >
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mb-2 shrink-0" />
              <h4 className="font-black text-base text-gray-900 dark:text-white">
                {editingBookingPaymentIndex !== null ? 'Cambiar método de pago' : 'Agregar método de pago'}
              </h4>
              <p className="text-xs text-gray-400">
                mantené presionado para ordenar los métodos de pago según tu preferencia
              </p>
            </div>

            <Reorder.Group
              axis="y"
              values={orderedBookingMethods}
              onReorder={handleSaveBookingMethodsOrder}
              className="space-y-2 py-2"
            >
              {orderedBookingMethods.map((m) => (
                <Reorder.Item
                  key={`reorder-booking-sheet-${m}`}
                  value={m}
                  className="p-3.5 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:border-gray-400 transition-colors shadow-2xs"
                  onClick={() => {
                    if (editingBookingPaymentIndex !== null) {
                      handleChangeBookingBlockMethod(editingBookingPaymentIndex, toBookingMethod(m));
                    } else {
                      handleAddNewBookingPaymentMethod(toBookingMethod(m));
                    }
                    setIsBookingPaymentSheetOpen(false);
                    setEditingBookingPaymentIndex(null);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {renderBookingMethodIcon(m)}
                    <span className="font-black text-sm text-gray-900 dark:text-white">
                      {m}
                    </span>
                  </div>
                  <div
                    className="p-2 text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical size={18} />
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* 2.2. Modal Anidado '+ Nuevo Cliente' usando NewUserModal sobre la pantalla actual */}
      {isAddingNewUser && (
        <NewUserModal 
          isOpen={isAddingNewUser}
          existingUsers={users}
          onClose={() => setIsAddingNewUser(false)}
          onSave={handleSaveFromNewUserModal}
        />
      )}
    </>
  );
};

// --- Views ---

interface ExposureBadgeData {
  id: string;
  label: string;
  value: number;
  formatted: string;
  change: string;
  isPositive: boolean;
  unit: string;
}

interface ExposureStatsResponse {
  period: string;
  label: string;
  badges: {
    impresiones: ExposureBadgeData;
    visitas: ExposureBadgeData;
    clic_reservas: ExposureBadgeData;
    reservas: ExposureBadgeData;
  };
  bookingModes?: {
    clasico: { id: string; label: string; percentage: number; colorHex: string; count: number };
    falta_gente: { id: string; label: string; percentage: number; colorHex: string; count: number };
    desafio: { id: string; label: string; percentage: number; colorHex: string; count: number };
  };
  chartData: Array<{
    date: string;
    displayLabel: string;
    impresiones: number;
    visitas: number;
    clic_reservas: number;
    reservas: number;
  }>;
  demographicsSex: {
    men: { percentage: number; label: string; count: number };
    women: { percentage: number; label: string; count: number };
  };
  ageBrackets: Array<{
    bracket: string;
    totalPct: number;
    menPct: number;
    womenPct: number;
  }>;
  daysActivity: Array<{
    id: string;
    name: string;
    short: string;
    peakTime: string;
    peakOccupancy: number;
    hours: Array<{ hour: string; level: number }>;
  }>;
}

const ExposureStatsModal = ({ 
  isOpen, 
  onClose,
  isDarkMode 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  isDarkMode?: boolean;
}) => {
  const [period, setPeriod] = useState<'hoy' | '7d' | '14d' | '30d' | '60d' | '90d'>('30d');
  const [activeMetric, setActiveMetric] = useState<'impresiones' | 'visitas' | 'clic_reservas' | 'reservas'>('impresiones');
  const [selectedDayId, setSelectedDayId] = useState<string>('ju');
  const [data, setData] = useState<ExposureStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModesBubble, setShowModesBubble] = useState(false);
  const [activeAgeBracket, setActiveAgeBracket] = useState<string | null>(null);

  // Compute exposure stats client-side whenever period changes
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);

    let factor = 1.0;
    if (period === 'hoy') factor = 0.035;
    else if (period === '7d') factor = 0.24;
    else if (period === '14d') factor = 0.48;
    else if (period === '30d') factor = 1.0;
    else if (period === '60d') factor = 1.95;
    else if (period === '90d') factor = 2.85;

    const baseCount = 28;
    const baseImpressions = Math.round(baseCount * 20 * factor);
    const baseVisits = Math.round(baseCount * 8 * factor);
    const baseClicks = Math.round(baseCount * 3 * factor);
    const baseReservations = baseCount;

    const badges = {
      impresiones: {
        id: 'impresiones' as const,
        label: 'Impresiones',
        value: baseImpressions,
        formatted: baseImpressions.toLocaleString(),
        change: '+14.2%',
        isPositive: true,
        unit: 'vistas'
      },
      visitas: {
        id: 'visitas' as const,
        label: 'Visitas',
        value: baseVisits,
        formatted: baseVisits.toLocaleString(),
        change: '+8.6%',
        isPositive: true,
        unit: 'visitas al perfil'
      },
      clic_reservas: {
        id: 'clic_reservas' as const,
        label: 'Clic en reservas',
        value: baseClicks,
        formatted: baseClicks.toLocaleString(),
        change: '+12.4%',
        isPositive: true,
        unit: 'clics'
      },
      reservas: {
        id: 'reservas' as const,
        label: 'Reservas',
        value: baseReservations,
        formatted: baseReservations.toLocaleString(),
        change: '+18.1%',
        isPositive: true,
        unit: 'turnos confirmados'
      }
    };

    const bookingModes = {
      clasico: { id: 'clasico', label: 'Clásico', percentage: 54, colorHex: '#2563EB', count: Math.round(baseReservations * 0.54) },
      falta_gente: { id: 'falta_gente', label: 'Falta gente', percentage: 31, colorHex: '#0BA70B', count: Math.round(baseReservations * 0.31) },
      desafio: { id: 'desafio', label: 'Desafío', percentage: 15, colorHex: '#8B5CF6', count: Math.round(baseReservations * 0.15) }
    };

    const daysCount = period === 'hoy' ? 1 : period === '7d' ? 7 : period === '14d' ? 14 : period === '30d' ? 30 : period === '60d' ? 60 : 90;
    const chartData: any[] = [];
    const now = new Date();

    if (period === 'hoy') {
      for (let h = 8; h <= 23; h++) {
        const isPeak = h >= 18 && h <= 22;
        const peakMultiplier = isPeak ? 2.8 : h >= 14 ? 1.5 : 0.7;
        chartData.push({
          date: `${h.toString().padStart(2, '0')}:00`,
          displayLabel: `${h.toString().padStart(2, '0')}:00`,
          impresiones: Math.round((baseImpressions / 16) * peakMultiplier),
          visitas: Math.round((baseVisits / 16) * peakMultiplier),
          clic_reservas: Math.round((baseClicks / 16) * peakMultiplier),
          reservas: Math.round((baseReservations / 16) * peakMultiplier)
        });
      }
    } else {
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const isWeekend = d.getDay() === 0 || d.getDay() === 5 || d.getDay() === 6;
        const dayFactor = isWeekend ? 1.4 : 0.9;
        chartData.push({
          date: d.toISOString().split('T')[0],
          displayLabel: `${d.getDate()}/${d.getMonth() + 1}`,
          impresiones: Math.round((baseImpressions / daysCount) * dayFactor),
          visitas: Math.round((baseVisits / daysCount) * dayFactor),
          clic_reservas: Math.round((baseClicks / daysCount) * dayFactor),
          reservas: Math.round((baseReservations / daysCount) * dayFactor)
        });
      }
    }

    const demographicsSex = {
      men: { percentage: 78, label: 'Masculino', count: Math.round(baseReservations * 0.78) },
      women: { percentage: 22, label: 'Femenino', count: Math.round(baseReservations * 0.22) }
    };

    const ageBrackets = [
      { bracket: '18-24', totalPct: 28, menPct: 22, womenPct: 6 },
      { bracket: '25-34', totalPct: 46, menPct: 36, womenPct: 10 },
      { bracket: '35-44', totalPct: 18, menPct: 14, womenPct: 4 },
      { bracket: '45+', totalPct: 8, menPct: 6, womenPct: 2 }
    ];

    const daysActivity = [
      { id: 'lu', name: 'Lunes', short: 'Lu', peakTime: '19:00 - 22:00 hs', peakOccupancy: 82, hours: [{ hour: '18:00', level: 60 }, { hour: '19:00', level: 82 }, { hour: '20:00', level: 80 }, { hour: '21:00', level: 75 }, { hour: '22:00', level: 50 }] },
      { id: 'ma', name: 'Martes', short: 'Ma', peakTime: '19:00 - 22:00 hs', peakOccupancy: 86, hours: [{ hour: '18:00', level: 65 }, { hour: '19:00', level: 86 }, { hour: '20:00', level: 84 }, { hour: '21:00', level: 78 }, { hour: '22:00', level: 55 }] },
      { id: 'mi', name: 'Miércoles', short: 'Mi', peakTime: '20:00 - 23:00 hs', peakOccupancy: 91, hours: [{ hour: '18:00', level: 70 }, { hour: '19:00', level: 88 }, { hour: '20:00', level: 91 }, { hour: '21:00', level: 85 }, { hour: '22:00', level: 60 }] },
      { id: 'ju', name: 'Jueves', short: 'Ju', peakTime: '20:00 - 23:00 hs', peakOccupancy: 94, hours: [{ hour: '18:00', level: 75 }, { hour: '19:00', level: 90 }, { hour: '20:00', level: 94 }, { hour: '21:00', level: 88 }, { hour: '22:00', level: 65 }] },
      { id: 'vi', name: 'Viernes', short: 'Vi', peakTime: '18:00 - 23:00 hs', peakOccupancy: 98, hours: [{ hour: '18:00', level: 85 }, { hour: '19:00', level: 96 }, { hour: '20:00', level: 98 }, { hour: '21:00', level: 95 }, { hour: '22:00', level: 80 }] },
      { id: 'sa', name: 'Sábado', short: 'Sa', peakTime: '16:00 - 21:00 hs', peakOccupancy: 89, hours: [{ hour: '16:00', level: 80 }, { hour: '17:00', level: 85 }, { hour: '18:00', level: 89 }, { hour: '19:00', level: 87 }, { hour: '20:00', level: 75 }] },
      { id: 'do', name: 'Domingo', short: 'Do', peakTime: '17:00 - 21:00 hs', peakOccupancy: 74, hours: [{ hour: '16:00', level: 60 }, { hour: '17:00', level: 72 }, { hour: '18:00', level: 74 }, { hour: '19:00', level: 70 }, { hour: '20:00', level: 55 }] }
    ];

    const periodLabelMap: Record<string, string> = {
      'hoy': 'Hoy',
      '7d': 'Últimos 7 días',
      '14d': 'Últimos 14 días',
      '30d': 'Últimos 30 días',
      '60d': 'Últimos 60 días',
      '90d': 'Últimos 90 días'
    };

    setData({
      period,
      label: periodLabelMap[period] || 'Últimos 30 días',
      badges,
      bookingModes,
      chartData,
      demographicsSex,
      ageBrackets,
      daysActivity
    });
    setIsLoading(false);
  }, [period, isOpen]);

  if (!isOpen) return null;

  const currentBadge = data?.badges?.[activeMetric];
  const activeDayData = data?.daysActivity?.find(d => d.id === selectedDayId) || data?.daysActivity?.[4] || {
    id: 'ju',
    name: 'Jueves',
    short: 'Ju',
    peakTime: '20:00 - 23:00 hs',
    peakOccupancy: 94,
    hours: []
  };

  const metricColors: Record<string, { stroke: string; fill: string; gradientStart: string; gradientEnd: string; text: string; bg: string }> = {
    impresiones: {
      stroke: '#10B981',
      fill: 'rgba(16, 185, 129, 0.18)',
      gradientStart: '#10B981',
      gradientEnd: '#34D399',
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30'
    },
    visitas: {
      stroke: '#3B82F6',
      fill: 'rgba(59, 130, 246, 0.18)',
      gradientStart: '#3B82F6',
      gradientEnd: '#60A5FA',
      text: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30'
    },
    clic_reservas: {
      stroke: '#F59E0B',
      fill: 'rgba(245, 158, 11, 0.18)',
      gradientStart: '#F59E0B',
      gradientEnd: '#FBBF24',
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30'
    },
    reservas: {
      stroke: '#8B5CF6',
      fill: 'rgba(139, 92, 246, 0.18)',
      gradientStart: '#8B5CF6',
      gradientEnd: '#A78BFA',
      text: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30'
    }
  };

  const currentTheme = metricColors[activeMetric];

  // Badges list definition
  const badgeItems = [
    { 
      id: 'impresiones' as const, 
      label: 'Impresiones', 
      icon: Eye, 
      badge: data?.badges?.impresiones 
    },
    { 
      id: 'visitas' as const, 
      label: 'Visitas', 
      icon: Users, 
      badge: data?.badges?.visitas 
    },
    { 
      id: 'clic_reservas' as const, 
      label: 'Clic en reservas', 
      icon: MousePointer, 
      badge: data?.badges?.clic_reservas 
    },
    { 
      id: 'reservas' as const, 
      label: 'Reservas', 
      icon: CalendarCheck, 
      badge: data?.badges?.reservas 
    }
  ];

  // Days list definition for activity selector (Do, Lu, Ma, Mi, Ju, Vi, Sa, Do)
  const dayTabs = [
    { id: 'do', label: 'Do' },
    { id: 'lu', label: 'Lu' },
    { id: 'ma', label: 'Ma' },
    { id: 'mi', label: 'Mi' },
    { id: 'ju', label: 'Ju' },
    { id: 'vi', label: 'Vi' },
    { id: 'sa', label: 'Sa' }
  ];

  const modesData = {
    clasico: { 
      label: 'Clásico', 
      percentage: data?.bookingModes?.clasico?.percentage ?? 54, 
      count: data?.bookingModes?.clasico?.count ?? 41,
      bgClass: 'bg-blue-600 dark:bg-blue-500', 
      textClass: 'text-blue-600 dark:text-blue-400',
      borderClass: 'border-blue-500',
      dotClass: 'bg-blue-600'
    },
    falta_gente: { 
      label: 'Falta gente', 
      percentage: data?.bookingModes?.falta_gente?.percentage ?? 31, 
      count: data?.bookingModes?.falta_gente?.count ?? 23,
      bgClass: 'bg-[#0BA70B]', 
      textClass: 'text-[#0BA70B]',
      borderClass: 'border-[#0BA70B]',
      dotClass: 'bg-[#0BA70B]'
    },
    desafio: { 
      label: 'Desafío', 
      percentage: data?.bookingModes?.desafio?.percentage ?? 15, 
      count: data?.bookingModes?.desafio?.count ?? 11,
      bgClass: 'bg-purple-600 dark:bg-purple-500', 
      textClass: 'text-purple-600 dark:text-purple-400',
      borderClass: 'border-purple-500',
      dotClass: 'bg-purple-600'
    }
  };

  const formatDisplayDate = (label: string) => {
    if (!label) return '';
    if (label.includes(':')) return `${label} hs`;
    if (label.includes('/')) {
      const parts = label.split('/');
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'agos', 'sep', 'oct', 'nov', 'dic'];
      return `${d} ${months[(m - 1 + 12) % 12] || ''}`;
    }
    return label;
  };

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[92vh] my-auto"
      >
        {/* Top Header: Title, Period selector & Close */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Estadísticas
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Minimal Period Selector: "30 días ▾" */}
            <div className="relative inline-flex items-center group cursor-pointer">
              <select
                id="exposure-period-select"
                aria-label="Seleccionar periodo"
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="appearance-none bg-transparent hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-800 dark:text-slate-200 font-bold text-sm sm:text-base pr-5 py-1 outline-none cursor-pointer border-none transition-colors"
              >
                <option value="hoy">Hoy</option>
                <option value="7d">7 días</option>
                <option value="14d">14 días</option>
                <option value="30d">30 días</option>
                <option value="60d">60 días</option>
                <option value="90d">90 días</option>
              </select>
              <ChevronDown size={16} className="absolute right-0 pointer-events-none text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            </div>

            <button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Scrollable Body without unnecessary gaps */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {/* Booking Modes Bar (Clásico: Azul, Falta gente: Verde Jogo, Desafío: Violeta) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Modos de reserva
              </span>
            </div>

            {/* Segmented Bar - Non-interactive without popover */}
            <div className="w-full h-6 sm:h-7 rounded-xl overflow-hidden flex bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 select-none">
              {/* Clásico - Azul */}
              <div 
                style={{ width: `${modesData.clasico.percentage}%` }}
                className={`${modesData.clasico.bgClass} h-full rounded-l-lg flex items-center justify-center px-1.5 text-white font-bold text-[11px]`}
              >
                <span className="truncate">{modesData.clasico.percentage}%</span>
              </div>

              {/* Falta gente - Verde Jogo */}
              <div 
                style={{ width: `${modesData.falta_gente.percentage}%` }}
                className={`${modesData.falta_gente.bgClass} h-full flex items-center justify-center px-1.5 text-white font-bold text-[11px]`}
              >
                <span className="truncate">{modesData.falta_gente.percentage}%</span>
              </div>

              {/* Desafío - Violeta */}
              <div 
                style={{ width: `${modesData.desafio.percentage}%` }}
                className={`${modesData.desafio.bgClass} h-full rounded-r-lg flex items-center justify-center px-1.5 text-white font-bold text-[11px]`}
              >
                <span className="truncate">{modesData.desafio.percentage}%</span>
              </div>
            </div>

            {/* Legend with total person counts next to each mode */}
            <div className="flex items-center justify-between text-[11px] pt-0.5 px-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500"></span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Clásico <strong className="text-slate-900 dark:text-white">{modesData.clasico.count}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0BA70B]"></span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Falta gente <strong className="text-slate-900 dark:text-white">{modesData.falta_gente.count}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-500"></span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Desafío <strong className="text-slate-900 dark:text-white">{modesData.desafio.count}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Slidable / Scrollable Metric Badges */}
          <div>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-1.5">
              Métricas de rendimiento
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 pt-0.5 -mx-0.5 px-0.5 snap-x">
              {badgeItems.map((item) => {
                const isSelected = activeMetric === item.id;
                const IconComponent = item.icon;
                const theme = metricColors[item.id];
                const badgeData = item.badge;

                return (
                  <button
                    type="button"
                    key={`exposure-badge-${item.id}`}
                    onClick={() => setActiveMetric(item.id)}
                    className={cn(
                      "flex-shrink-0 min-w-[140px] sm:min-w-[160px] p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer snap-start select-none",
                      isSelected 
                        ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white border-transparent shadow-md shadow-slate-900/20 dark:shadow-emerald-900/30 scale-[1.01]" 
                        : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center",
                        isSelected ? "bg-white/20 text-white" : `${theme.bg} ${theme.text}`
                      )}>
                        <IconComponent size={14} />
                      </div>
                      {badgeData?.change && (
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                          isSelected 
                            ? "bg-emerald-400/25 text-emerald-300" 
                            : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                        )}>
                          {badgeData.change}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium opacity-80 mb-0.5 whitespace-nowrap">
                      {item.label}
                    </div>
                    <div className="text-lg sm:text-xl font-black tracking-tight">
                      {isLoading ? '...' : (badgeData?.formatted || '0')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Chart with STRAIGHT lines (linear, not curved) without extra headers or backgrounds */}
          <div className="w-full pt-1">
            <div className="w-full h-[180px] sm:h-[210px]">
              {isLoading ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  Cargando gráfico...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.chartData || []} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={currentTheme.gradientStart} stopOpacity={0.35}/>
                        <stop offset="95%" stopColor={currentTheme.gradientEnd} stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                    <XAxis 
                      dataKey="displayLabel" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }} 
                      dy={5}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }}
                      tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                    />
                    {/* Minimal Centered Tooltip: Value (n) over Date formatted as "21 agos, 4 jul" */}
                    <Tooltip 
                      cursor={{ stroke: isDarkMode ? '#475569' : '#cbd5e1', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                      content={({ active, payload, label }: any) => {
                        if (active && payload && payload.length) {
                          const val = payload[0].value;
                          return (
                            <div className="bg-slate-900/95 dark:bg-slate-800/95 text-white px-2.5 py-1 rounded-lg shadow-md border border-slate-700/60 flex flex-col items-center justify-center text-center pointer-events-none select-none">
                              <span className="text-xs sm:text-sm font-black leading-tight text-white">
                                {Number(val).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-300 font-medium leading-tight">
                                {formatDisplayDate(label)}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* Linear straight line graph without curves */}
                    <Area 
                      type="linear" 
                      dataKey={activeMetric} 
                      stroke={currentTheme.stroke} 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill={`url(#gradient-${activeMetric})`} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Sexo (Hombre y Mujer, cada uno con su barra individual y porcentaje a la derecha) */}
          <div className="space-y-2 pt-1">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              Sexo
            </h3>

            {/* Hombre */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Hombre {data?.demographicsSex?.men?.count ? `(${data.demographicsSex.men.count})` : ''}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-5 sm:h-5.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 overflow-hidden">
                  <div 
                    style={{ width: `${data?.demographicsSex?.men?.percentage ?? 68}%` }}
                    className="bg-blue-600 dark:bg-blue-500 h-full rounded transition-all duration-500"
                  />
                </div>
                <span className="text-xs font-black text-slate-900 dark:text-white w-12 text-right flex-shrink-0">
                  {data?.demographicsSex?.men?.percentage ?? 68}%
                </span>
              </div>
            </div>

            {/* Mujer */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Mujer {data?.demographicsSex?.women?.count ? `(${data.demographicsSex.women.count})` : ''}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-5 sm:h-5.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 overflow-hidden">
                  <div 
                    style={{ width: `${data?.demographicsSex?.women?.percentage ?? 32}%` }}
                    className="bg-pink-500 h-full rounded transition-all duration-500"
                  />
                </div>
                <span className="text-xs font-black text-slate-900 dark:text-white w-12 text-right flex-shrink-0">
                  {data?.demographicsSex?.women?.percentage ?? 32}%
                </span>
              </div>
            </div>
          </div>

          {/* Rango de Edad */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                Rango de edad
              </h3>
              {/* Legend for Age bars */}
              <div className="flex items-center gap-2.5 text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Hombres</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Mujeres</span>
                </div>
              </div>
            </div>

            {/* Age Brackets List with Percentage to the Right and Floating Tooltip */}
            <div className="space-y-1.5">
              {(data?.ageBrackets || [
                { bracket: '15 a 18', totalPct: 8, menPct: 5.5, womenPct: 2.5 },
                { bracket: '19-25', totalPct: 28, menPct: 19.5, womenPct: 8.5 },
                { bracket: '26-35', totalPct: 38, menPct: 25.5, womenPct: 12.5 },
                { bracket: '36-45', totalPct: 16, menPct: 11.0, womenPct: 5.0 },
                { bracket: '46-55', totalPct: 7, menPct: 4.8, womenPct: 2.2 },
                { bracket: '56+', totalPct: 3, menPct: 2.0, womenPct: 1.0 }
              ]).map((ageRow) => {
                const maxPct = 40; // Scale maximum for bar representation
                const barWidth = Math.min(100, (ageRow.totalPct / maxPct) * 100);
                const menFraction = (ageRow.menPct / ageRow.totalPct) * 100;
                const womenFraction = (ageRow.womenPct / ageRow.totalPct) * 100;

                const totalUserBase = (data?.demographicsSex?.men?.count || 82) + (data?.demographicsSex?.women?.count || 38);
                const menCount = Math.round(totalUserBase * (ageRow.menPct / 100));
                const womenCount = Math.round(totalUserBase * (ageRow.womenPct / 100));
                const isSelectedBracket = activeAgeBracket === ageRow.bracket;

                return (
                  <div key={`age-bracket-${ageRow.bracket}`} className="relative space-y-0.5">
                    {/* Bracket Label */}
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {ageRow.bracket} años
                    </div>

                    {/* Bar + Percentage to the right */}
                    <div className="flex items-center gap-2.5 relative">
                      <div 
                        onClick={() => setActiveAgeBracket(isSelectedBracket ? null : ageRow.bracket)}
                        className="flex-1 h-4 sm:h-4.5 bg-slate-100 dark:bg-slate-700/60 rounded-md p-0.5 overflow-hidden flex items-center cursor-pointer hover:ring-1 hover:ring-emerald-500/50 transition-all select-none relative"
                        title="Presiona para ver desglose por sexo"
                      >
                        <div 
                          style={{ width: `${barWidth}%` }} 
                          className="h-full rounded overflow-hidden flex shadow-xs transition-all duration-500"
                        >
                          {/* Men segment (Azul) */}
                          <div 
                            style={{ width: `${menFraction}%` }} 
                            className="bg-blue-600 dark:bg-blue-500 h-full transition-all"
                          />

                          {/* Women segment (Rosa) */}
                          <div 
                            style={{ width: `${womenFraction}%` }} 
                            className="bg-pink-500 h-full transition-all"
                          />
                        </div>
                      </div>

                      {/* Percentage next to the bar (to the right) */}
                      <span className="text-xs font-black text-slate-900 dark:text-white w-10 text-right flex-shrink-0">
                        {ageRow.totalPct}%
                      </span>

                      {/* Floating tooltip popover matching the chart bubble without altering surroundings */}
                      <AnimatePresence>
                        {isSelectedBracket && (
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            transition={{ duration: 0.12 }}
                            className="absolute -top-7 left-1/3 -translate-x-1/2 bg-slate-900/95 dark:bg-slate-800/95 text-white px-2.5 py-0.5 rounded-lg shadow-md border border-slate-700/60 flex items-center gap-2 text-[10px] whitespace-nowrap z-50 pointer-events-none select-none"
                          >
                            <span className="text-blue-400 font-bold">Hombres: {menCount} ({ageRow.menPct}%)</span>
                            <span className="text-slate-500">•</span>
                            <span className="text-pink-400 font-bold">Mujeres: {womenCount} ({ageRow.womenPct}%)</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Momento con más actividad - Clean without background container */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Momento con más actividad
                </h3>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Selecciona el día para ver la afluencia y horario pico
                </div>
              </div>

              {/* Day of Week Selector: Do, Lu, Ma, Mi, Ju, Vi, Sa */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {dayTabs.map((day) => {
                  const isDaySelected = selectedDayId === day.id;
                  return (
                    <button
                      type="button"
                      key={`activity-day-${day.id}`}
                      onClick={() => setSelectedDayId(day.id)}
                      className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-bold text-xs flex items-center justify-center transition-all cursor-pointer select-none",
                        isDaySelected
                          ? "bg-[#0BA70B] text-white shadow-xs scale-105"
                          : "bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Peak Moment Highlight Card */}
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl p-2.5 sm:p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  <Sparkles size={14} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    Horario pico en {activeDayData.name}
                  </div>
                  <div className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-100">
                    {activeDayData.peakTime}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Ocupación pico</span>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                  {activeDayData.peakOccupancy}%
                </div>
              </div>
            </div>

            {/* Hourly Activity Visualizer (08:00 to 23:00) */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                Nivel de actividad (08:00 a 23:00 hs)
              </div>
              <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 pt-1">
                {activeDayData.hours.map((hSlot) => {
                  const isHigh = hSlot.level >= 80;
                  const isMedium = hSlot.level >= 50 && hSlot.level < 80;

                  return (
                    <div 
                      key={`hour-slot-${activeDayData.id}-${hSlot.hour}`}
                      className="flex flex-col items-center gap-0.5 group relative cursor-pointer"
                    >
                      {/* Bar Container */}
                      <div className="w-full h-14 sm:h-16 bg-slate-100 dark:bg-slate-700/50 rounded-md p-0.5 flex flex-col justify-end overflow-hidden">
                        <div 
                          style={{ height: `${hSlot.level}%` }}
                          className={cn(
                            "w-full rounded transition-all duration-300",
                            isHigh 
                              ? "bg-[#0BA70B] dark:bg-emerald-500 shadow-xs" 
                              : isMedium 
                                ? "bg-emerald-400/80 dark:bg-emerald-600/80" 
                                : "bg-slate-300 dark:bg-slate-600"
                          )}
                        />
                      </div>
                      
                      {/* Hour Label */}
                      <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 transition-colors">
                        {hSlot.hour.split(':')[0]}
                      </span>

                      {/* Tooltip on hover */}
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap z-30 shadow-md pointer-events-none">
                        {hSlot.hour}: {hSlot.level}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DemandStats = ({ onClose, complexId = 'complejo_central' }: { onClose: () => void, complexId?: string }) => {
  const [peakHours, setPeakHours] = useState<{hour: string, count: number}[]>([]);
  const [filter, setFilter] = useState<'global' | 'today' | 'week' | 'month' | 'day'>('global');
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1); // 1 = Lunes
  const [venue, setVenue] = useState<any>(null);
  const [bookings, setBookings] = useState<Match[]>([]);
  
  useEffect(() => {
    const unsubVenue = subscribeToVenueProfile(complexId, (data) => {
      if (data) setVenue(data);
    });
    const unsubBookings = subscribeToBookings(complexId, (data) => {
      setBookings(Array.isArray(data) ? data : []);
    });

    return () => {
      unsubVenue();
      unsubBookings();
    };
  }, [complexId]);
  
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      counts[i.toString().padStart(2, '0')] = 0;
    }

    const now = new Date();
    bookings.forEach(b => {
      if (b.status === 'cancelled') return;
      const bDateStr = b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
      const bDate = safeParseDate(bDateStr);
      if (!bDate) return;

      if (filter === 'today' && !isSameDay(bDate, now)) return;
      if (filter === 'week' && differenceInDays(now, bDate) > 7) return;
      if (filter === 'month' && !isSameMonth(bDate, now)) return;
      if (filter === 'day' && bDate.getDay() !== selectedDayOfWeek) return;

      const hourStr = (b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 2) : '18')).split(':')[0].padStart(2, '0');
      if (counts[hourStr] !== undefined) {
        counts[hourStr]++;
      }
    });

    setPeakHours(Object.entries(counts).map(([hour, count]) => ({ hour, count })));
  }, [bookings, filter, selectedDayOfWeek]);
  
  // Calculate open and close bounds from venue
  let minHour = 8;
  let maxHour = 23;
  if (venue && Array.isArray(venue.hours)) {
    let min = 24;
    let max = 0;
    venue.hours.forEach((h: any) => {
      if (h.open) {
        const s = parseInt(h.start.split(':')[0], 10);
        let e = parseInt(h.end.split(':')[0], 10);
        if (e === 0) e = 24;
        if (s < min) min = s;
        if (e > max) max = e;
      }
    });
    if (min < 24) minHour = min;
    if (max > 0) maxHour = max;
  }
  
  // Create a full range of hours based on venue hours
  const allHours = Array.from({ length: maxHour - minHour }, (_, i) => i + minHour);
  
  const chartData = allHours.map(hour => {
    const hourStr = (hour % 24).toString().padStart(2, '0');
    const found = peakHours.find(p => p.hour === hourStr);
    return { 
      hour, 
      count: found ? found.count : 0,
      label: `${hour}:00`
    };
  });

  const maxCount = Math.max(...chartData.map(d => d.count), 1);
  const totalBookings = chartData.reduce((acc, curr) => acc + curr.count, 0);

  const daysOfWeek = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
    { id: 6, label: 'Sábado' },
    { id: 0, label: 'Domingo' }
  ];

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-xl text-gray-900">Horarios de Mayor Demanda</h3>
            <p className="text-sm text-gray-500">Distribución de reservas por hora</p>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex gap-2 overflow-x-auto flex-shrink-0 items-center">
          {[
            { id: 'global', label: 'Histórico' },
            { id: 'month', label: 'Este Mes' },
            { id: 'week', label: 'Esta Semana' },
            { id: 'today', label: 'Hoy' }
          ].map((f, fIdx) => (
            <button type="button"
              key={`demand-filter-${f.id}-${fIdx}`}
              onClick={() => setFilter(f.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                filter === f.id 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-100"
              )}
            >
              {f.label}
            </button>
          ))}
          
          <div className="relative ml-2 flex items-center">
            <button type="button"
              onClick={() => setFilter('day')}
              className={cn(
                "px-4 py-2 rounded-l-xl text-sm font-bold transition-all whitespace-nowrap",
                filter === 'day'
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                  : "bg-white text-gray-500 border border-gray-200 border-r-0 hover:bg-gray-100"
              )}
            >
              Día:
            </button>
            <select
              value={selectedDayOfWeek}
              onChange={(e) => {
                setFilter('day');
                setSelectedDayOfWeek(parseInt(e.target.value));
              }}
              className={cn(
                "py-2 pr-8 pl-3 rounded-r-xl text-sm font-bold transition-all outline-none border cursor-pointer",
                filter === 'day'
                  ? "bg-emerald-700 text-white border-emerald-700" 
                  : "bg-white text-gray-500 border-gray-200 border-l-gray-300 hover:bg-gray-50"
              )}
            >
              {daysOfWeek.map((d, dIdx) => (
                <option key={`demand-day-${d.id}-${dIdx}`} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="h-64 flex items-end gap-1.5 pb-8 pt-4 px-2 w-full">
            {chartData.map((d, dIdx) => (
              <div key={`demand-hour-${d.hour}-${dIdx}`} className="flex-1 flex flex-col items-center gap-2 group relative">
                <div className="relative w-full flex justify-center h-full items-end">
                  <div 
                    className={cn(
                      "w-full rounded-t-lg transition-all duration-500 relative group-hover:opacity-80 max-w-[40px]",
                      d.count > 0 ? "bg-emerald-500" : "bg-gray-100"
                    )}
                    style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? '4px' : '4px' }}
                  >
                    {d.count > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                        {d.count} reservas
                      </div>
                    )}
                  </div>
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs font-bold mt-1 text-center w-full",
                  d.count > 0 ? "text-gray-900" : "text-gray-400"
                )}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <div className="text-emerald-800 font-bold text-sm mb-1">Hora Pico</div>
              <div className="text-2xl font-bold text-emerald-600">
                {chartData.length > 0 && totalBookings > 0 ? chartData.reduce((prev, current) => (prev.count > current.count) ? prev : current).label : '--'}
              </div>
              <div className="text-xs text-emerald-600/70 mt-1">Mayor volumen de reservas</div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <div className="text-emerald-800 font-bold text-sm mb-1">Promedio Diario</div>
              <div className="text-2xl font-bold text-emerald-600">
                {chartData.length > 0 ? Math.round(totalBookings / (allHours.length || 1)) : 0}
              </div>
              <div className="text-xs text-emerald-600/70 mt-1">Reservas por hora</div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <div className="text-emerald-800 font-bold text-sm mb-1">Ocupación Total</div>
              <div className="text-2xl font-bold text-emerald-600">
                {totalBookings}
              </div>
              <div className="text-xs text-emerald-600/70 mt-1">En este periodo</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const computeCohorts = (userList: User[], bookingList: Match[]) => {
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const cohortsMap: Record<string, any> = {};

  (userList || []).forEach(u => {
    const rawDate = (u as any).created_at || (u as any).acquisitionDate || (u as any).createdAt;
    if (!rawDate) return;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return;
    const joinMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!cohortsMap[joinMonth]) {
      cohortsMap[joinMonth] = {
        monthKey: joinMonth,
        month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
        newUsers: 0,
        activeMonths: {} as Record<string, string[]>
      };
    }
    cohortsMap[joinMonth].newUsers++;
    if (!cohortsMap[joinMonth].activeMonths[String(u.id)]) {
      cohortsMap[joinMonth].activeMonths[String(u.id)] = [];
    }
  });

  (bookingList || []).forEach((b: any) => {
    const uId = String(b.userId || b.host_id || '');
    if (!uId || uId === '0') return;
    const bDate = b.date || b.start_time || b.startTime;
    if (!bDate) return;
    const d = new Date(bDate);
    if (isNaN(d.getTime())) return;
    const matchMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    Object.values(cohortsMap).forEach((c: any) => {
      if (c.activeMonths[uId] && !c.activeMonths[uId].includes(matchMonth)) {
        c.activeMonths[uId].push(matchMonth);
      }
    });
  });

  const result = Object.values(cohortsMap).map((c: any) => {
    let m1Count = 0;
    let m2Count = 0;
    let m3Count = 0;

    const [y, m] = c.monthKey.split('-').map(Number);
    const getNextMonth = (offset: number) => {
      const d = new Date(y, m - 1 + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const m1Key = getNextMonth(1);
    const m2Key = getNextMonth(2);
    const m3Key = getNextMonth(3);

    Object.values(c.activeMonths).forEach((months: any) => {
      if (months.includes(m1Key)) m1Count++;
      if (months.includes(m2Key)) m2Count++;
      if (months.includes(m3Key)) m3Count++;
    });

    return {
      month: c.month,
      newUsers: c.newUsers,
      m1: c.newUsers > 0 ? Math.round((m1Count / c.newUsers) * 100) : 0,
      m2: c.newUsers > 0 ? Math.round((m2Count / c.newUsers) * 100) : 0,
      m3: c.newUsers > 0 ? Math.round((m3Count / c.newUsers) * 100) : 0
    };
  });

  return result.sort((a, b) => b.month.localeCompare(a.month));
};

const RetentionStats = ({ onClose, complexId = 'complejo_central' }: { onClose: () => void, complexId?: string }) => {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Match[]>([]);

  useEffect(() => {
    const unsubU = subscribeToClients(complexId, (u) => setUsers(Array.isArray(u) ? u : []));
    const unsubB = subscribeToBookings(complexId, (b) => setBookings(Array.isArray(b) ? b : []));
    return () => {
      unsubU();
      unsubB();
    };
  }, [complexId]);

  useEffect(() => {
    setCohorts(computeCohorts(users, bookings));
  }, [users, bookings]);

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg md:text-xl text-gray-900">Cohortes de Retención</h3>
            <p className="text-xs md:text-sm text-gray-500">Basado en fecha de registro y última reserva</p>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 md:p-6 overflow-auto flex-1 no-scrollbar">
          <div className="min-w-[600px]">
            <table className="w-full text-xs md:text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-2 md:py-3 rounded-l-lg">Mes (Alta)</th>
                  <th className="px-3 py-2 md:py-3">Nuevos Usuarios</th>
                  <th className="px-3 py-2 md:py-3">Mes 1</th>
                  <th className="px-3 py-2 md:py-3">Mes 2</th>
                  <th className="px-3 py-2 md:py-3">Mes 3</th>
                  <th className="px-3 py-2 md:py-3 rounded-r-lg">Mes 4</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cohorts.map((cohort, i) => (
                  <tr key={`cohort-row-${cohort.month || i}-${i}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 md:py-4 font-bold text-gray-900 whitespace-nowrap">{cohort.month}</td>
                    <td className="px-3 py-3 md:py-4 text-gray-500">{cohort.newUsers} <span className="hidden md:inline">usuarios</span></td>
                    {[cohort.m1, cohort.m2, cohort.m3, cohort.m4].map((m, idx) => (
                      <td key={`cohort-cell-${i}-${idx}`} className="px-3 py-3 md:py-4">
                        {m !== null ? (
                          <>
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <div className="w-8 md:w-12 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div className={cn("h-full", idx === 0 ? "bg-emerald-500" : idx === 1 ? "bg-emerald-400" : idx === 2 ? "bg-emerald-300" : "bg-emerald-200")} style={{ width: `${cohort.newUsers > 0 ? (m / cohort.newUsers) * 100 : 0}%` }}></div>
                              </div>
                              <span className={cn("text-[10px] md:text-xs font-bold", idx === 0 ? "text-emerald-700" : idx === 1 ? "text-emerald-600" : idx === 2 ? "text-emerald-500" : "text-emerald-400")}>
                                {cohort.newUsers > 0 ? Math.round((m / cohort.newUsers) * 100) : 0}%
                              </span>
                            </div>
                            <div className="text-[9px] md:text-[10px] text-gray-400 mt-0.5">{m} <span className="hidden md:inline">usuarios</span></div>
                          </>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Helper: Local date in format YYYY-MM-DD without timezone shifts
function getTodayLocalYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Safely add/subtract days without timezone drift
function shiftDateYMD(dateStr: string, deltaDays: number): string {
  if (!dateStr || !dateStr.includes('-')) return getTodayLocalYMD();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const curY = dt.getFullYear();
  const curM = String(dt.getMonth() + 1).padStart(2, '0');
  const curD = String(dt.getDate()).padStart(2, '0');
  return `${curY}-${curM}-${curD}`;
}

// Helper: Get array of 7 days (Monday to Sunday) containing dateStr
function getWeekDaysArray(dateStr: string) {
  if (!dateStr || !dateStr.includes('-')) dateStr = getTodayLocalYMD();
  const [y, m, d] = dateStr.split('-').map(Number);
  const ref = new Date(y, m - 1, d);
  const dayOfWeek = ref.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  // Monday is index 1. If Sunday (0), offset is -6. Otherwise 1 - dayOfWeek.
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(y, m - 1, d + mondayOffset);

  const labels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  const todayStr = getTodayLocalYMD();

  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const curY = cur.getFullYear();
    const curM = String(cur.getMonth() + 1).padStart(2, '0');
    const curD = String(cur.getDate()).padStart(2, '0');
    const curStr = `${curY}-${curM}-${curD}`;
    return {
      dateStr: curStr,
      dayLabel: labels[i],
      dayNumber: curD,
      isToday: curStr === todayStr,
      isSelected: curStr === dateStr
    };
  });
}

function formatMonthYearHeading(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const monthName = dt.toLocaleString('es-ES', { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${y}`;
}

function formatListCardDateTime(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return timeStr ? `${timeStr}hs` : '-';
  const parts = dateStr.split('-');
  const cleanTime = timeStr ? timeStr.substring(0, 5) : '00:00';
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
    const monthName = months[m - 1] || '';
    return `${d} de ${monthName}, ${cleanTime}hs`;
  }
  return `${dateStr}, ${cleanTime}hs`;
}

// 4.2. Componente de Tarjeta de Turno en Lista (Grilla de Alineación 2 Columnas x 3 Filas)
const MatchListCard = ({ 
  match, 
  category, 
  courtsCount, 
  onClick,
  displayClientName
}: { 
  match: Match, 
  category: 'en_juego' | 'proximos' | 'jugados' | 'cancelados', 
  courtsCount: number, 
  onClick: () => void,
  displayClientName?: string
}) => {
  const deposit = Number(match.deposit ?? match.amount_paid ?? 0);
  const totalPrice = Number(match.price_total ?? match.price ?? 0);
  const clientName = displayClientName || match.host_name || match.userName || (match as any).user_name || (match as any).clientName || 'Cliente';
  const courtName = match.courtName || match.court_name || 'Cancha';
  const showCourt = courtsCount > 1;

  const matchDate = match.date || (match.start_time ? String(match.start_time).split('T')[0] : '');
  const matchTime = match.startTime || (match.start_time && match.start_time.includes('T') ? match.start_time.split('T')[1].substring(0, 5) : '');

  return (
    <div
      onClick={onClick}
      className="p-3 sm:p-3.5 hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex flex-col justify-between gap-1 border-b border-gray-100 dark:border-slate-800 last:border-b-0"
    >
      {/* Grilla de Alineación (2 Columnas x 3 Filas) */}

      {/* Fila 1 (Superior): Fecha y hora legible (izq.) <---> Badge de Estado (der.) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400 text-xs sm:text-sm font-medium truncate">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{formatListCardDateTime(matchDate, matchTime)}</span>
        </div>
        <div className="shrink-0">
          {category === 'en_juego' && (
            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold text-xs animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>En juego</span>
            </div>
          )}
          {category === 'proximos' && (
            <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">
              Próximo
            </span>
          )}
          {category === 'jugados' && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
              Jugado
            </span>
          )}
          {category === 'cancelados' && (
            <span className="text-gray-500 dark:text-slate-400 font-semibold text-xs">
              Cancelado
            </span>
          )}
        </div>
      </div>

      {/* Fila 2 (Media): Nombre del cliente en negrita (izq.) <---> Monto total del turno (der.) */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-gray-900 dark:text-white text-sm sm:text-base truncate">
          {clientName}
        </span>
        <span className="font-bold text-gray-900 dark:text-white text-sm sm:text-base font-mono shrink-0">
          ${totalPrice.toLocaleString()}
        </span>
      </div>

      {/* Fila 3 (Inferior): Nombre de la cancha (izq., visible solo si hay >1 cancha registrada) <---> Seña abonada (der.) */}
      <div className="flex items-center justify-between gap-2 min-h-[1.25rem]">
        <div className="text-xs text-gray-500 dark:text-slate-400 font-medium truncate">
          {showCourt ? courtName : ''}
        </div>
        <div className="text-xs font-medium shrink-0">
          {deposit > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              Seña: ${deposit.toLocaleString()}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-slate-500">
              Seña: $0
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const ScheduleView = ({ 
  onMatchClick, 
  onNewBooking, 
  onUpdateStatus, 
  refreshKey,
  complexId = 'complejo_central',
  onNavigate,
  users,
  onDayBookingsCountChange,
  initialCourts,
  initialBookings
}: { 
  onMatchClick: (match: Match) => void, 
  onNewBooking: (prefillData?: any) => void, 
  onUpdateStatus?: (id: number | string, status: string) => void, 
  refreshKey?: number,
  complexId?: string,
  onNavigate?: (tab: NavTabId | string) => void,
  users?: User[],
  onDayBookingsCountChange?: (count: number) => void,
  initialCourts?: Court[],
  initialBookings?: Match[]
}) => {
  // 1. Selector Dual de Vista: Calendario vs. Lista
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const getMatchHostDisplayName = useCallback((m: Match) => {
    if (users && users.length > 0) {
      const matched = findMatchingLocalUser(users, {
        id: m.userId || m.host_id,
        canonicalId: m.canonicalId || m.canonicalUserId,
        canonicalUserId: m.canonicalUserId || m.canonicalId,
        historicalId: m.historicalId,
        historicalIds: m.historicalIds,
        phone: m.host_phone || m.userPhone || m.clientPhone,
        email: m.userEmail || m.clientEmail
      });
      if (matched && matched.name && !isGenericPlaceholderName(matched.name)) {
        return matched.name;
      }
    }
    return m.host_name || m.userName || m.clientName || 'Cliente';
  }, [users]);

  // 2. Navegación Temporal Semanal: Fecha seleccionada manejada estrictamente como string YYYY-MM-DD local
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getTodayLocalYMD());

  // Firestore snapshots in memory - Inicializados con props para eliminar parpadeo
  const [matches, setMatches] = useState<Match[]>(() => Array.isArray(initialBookings) ? initialBookings : []);
  const [courts, setCourts] = useState<Court[]>(() => Array.isArray(initialCourts) ? initialCourts : []);
  const [isCourtsLoaded, setIsCourtsLoaded] = useState<boolean>(() => Array.isArray(initialCourts) && initialCourts.length > 0);

  // Sincronizar en memoria si llegan initialCourts/initialBookings
  useEffect(() => {
    if (Array.isArray(initialCourts) && initialCourts.length > 0 && courts.length === 0) {
      setCourts(initialCourts);
      setIsCourtsLoaded(true);
    }
    if (Array.isArray(initialBookings) && initialBookings.length > 0 && matches.length === 0) {
      setMatches(initialBookings);
    }
  }, [initialCourts, initialBookings]);
  
  // 1.3. Multiselección de Canchas en Grilla persistida en localStorage
  const [selectedCourtIds, setSelectedCourtIds] = useState<(string | number)[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('jogo_agenda_selected_courts');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    if (Array.isArray(initialCourts) && initialCourts.length > 0) {
      return [initialCourts[0].id];
    }
    return [];
  });

  const [venueHours, setVenueHours] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // 3.4. Zoom persistido en localStorage (default: 64px, rango 32px a 120px)
  const [slotHeight, setSlotHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('jogo_agenda_zoom');
        if (saved) {
          const val = parseInt(saved, 10);
          if (!isNaN(val) && val >= 32 && val <= 120) return val;
        }
      } catch (e) {}
    }
    return 64;
  });

  // Collapsible state for the 4 list sections (cancelados colapsado por defecto)
  const [collapsedSections, setCollapsedSections] = useState<{ [key: string]: boolean }>({
    cancelados: true
  });

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  // Pinch-to-zoom gesture refs and handlers
  const viewportRef = useRef<HTMLDivElement>(null);
  const initialPinchDist = useRef<number | null>(null);
  const initialSlotHeight = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDist.current = dist;
      initialSlotHeight.current = slotHeight;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist.current !== null && initialSlotHeight.current !== null) {
      if (e.cancelable) e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / initialPinchDist.current;
      const newHeight = Math.round(Math.max(32, Math.min(120, initialSlotHeight.current * scale)));
      setSlotHeight(newHeight);
    }
  };

  const handleTouchEnd = () => {
    if (initialPinchDist.current !== null) {
      initialPinchDist.current = null;
      initialSlotHeight.current = null;
      try {
        localStorage.setItem('jogo_agenda_zoom', String(slotHeight));
      } catch (e) {}
    }
  };

  const updateZoomStep = (delta: number) => {
    setSlotHeight(prev => {
      const next = Math.max(32, Math.min(120, prev + delta));
      try {
        localStorage.setItem('jogo_agenda_zoom', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Firestore reactive subscriptions (Multi-tenant scoped to complexId)
  useEffect(() => {
    if (!complexId) return;

    // Escucha todos los turnos del complejo activo en tiempo real
    const unsubBookings = subscribeToBookings(complexId, (bookingsList) => {
      setMatches(Array.isArray(bookingsList) ? bookingsList : []);
    });

    // Escucha las canchas del complejo activo
    const unsubCourts = subscribeToCourts(complexId, (courtsList) => {
      const validCourts = Array.isArray(courtsList) ? courtsList : [];
      setCourts(validCourts);
      setIsCourtsLoaded(true);
      if (validCourts.length > 0) {
        setSelectedCourtIds(prev => {
          const valid = prev.filter(id => validCourts.some(c => String(c.id) === String(id)));
          if (valid.length > 0) return valid;
          return [validCourts[0].id];
        });
      } else {
        setSelectedCourtIds([]);
      }
    });

    // Escucha horarios de operación del complejo
    const unsubVenue = subscribeToVenueProfile(complexId, (venueData) => {
      if (venueData && Array.isArray(venueData.hours)) {
        setVenueHours(venueData.hours);
      }
    });

    return () => {
      unsubBookings();
      unsubCourts();
      unsubVenue();
    };
  }, [complexId, refreshKey]);

  // Persistir selección de canchas al cambiar
  useEffect(() => {
    if (selectedCourtIds.length > 0) {
      try {
        localStorage.setItem('jogo_agenda_selected_courts', JSON.stringify(selectedCourtIds));
      } catch (e) {}
    }
  }, [selectedCourtIds]);

  const toggleCourtSelection = (courtId: string | number) => {
    setSelectedCourtIds(prev => {
      const isSelected = prev.some(id => String(id) === String(courtId));
      if (isSelected) {
        if (prev.length <= 1) return prev; // Mantener al menos una cancha activa
        return prev.filter(id => String(id) !== String(courtId));
      } else {
        return [...prev, courtId];
      }
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Canchas activas filtradas para la proyección en paralelo
  const displayedCourts = useMemo(() => {
    const selected = courts.filter(c => selectedCourtIds.some(id => String(id) === String(c.id)));
    if (selected.length > 0) return selected;
    return courts.length > 0 ? [courts[0]] : [];
  }, [courts, selectedCourtIds]);

  const weekDays = useMemo(() => getWeekDaysArray(selectedDateStr), [selectedDateStr]);

  // 3.1. Rango Horario Dinámico y Resolución de Cierre (Regla Opción B)
  const { isOpenDay, timeSlots } = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayIndex = dt.getDay(); // 0 es Domingo
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const targetDayName = dayNames[dayIndex];

    const dayConfig = Array.isArray(venueHours) && venueHours.length > 0 ? venueHours.find(h => {
      const dName = String(h?.day || '').toLowerCase().replace('é', 'e').replace('á', 'a');
      return dName === targetDayName.replace('é', 'e').replace('á', 'a');
    }) : null;

    if (dayConfig && dayConfig.open === false) {
      return { isOpenDay: false, timeSlots: [] };
    }

    const startStr = dayConfig?.start || dayConfig?.openTime || '14:00';
    const endStr = dayConfig?.end || dayConfig?.closeTime || '00:00';

    const startH = parseInt(startStr.split(':')[0], 10) || 14;
    let endH = parseInt(endStr.split(':')[0], 10);
    if (isNaN(endH)) endH = 0;

    const slots: number[] = [];
    // Regla Opción B: Si el horario de cierre indica 00:00 (o crossesMidnight: true), el negocio finaliza su operación a la 01:00 am.
    // Por lo tanto, la grilla debe generar e incluir obligatoriamente el slot que inicia a las 00:00 y finaliza a las 01:00 (slot 24, mostrado como 00:00).
    if (endH === 0 || endStr === '00:00' || dayConfig?.crossesMidnight) {
      for (let h = startH; h <= 24; h++) {
        slots.push(h);
      }
    } else if (endH < startH) {
      for (let h = startH; h <= 24 + endH; h++) {
        slots.push(h);
      }
    } else {
      for (let h = startH; h <= endH; h++) {
        slots.push(h);
      }
    }

    return { isOpenDay: true, timeSlots: slots };
  }, [selectedDateStr, venueHours]);

  // Match lookup para una cancha y un slot específicos (excluye estrictamente reservas canceladas)
  const getMatchForCourtSlot = (courtId: string | number, rawHour: number) => {
    const targetHour = rawHour % 24;
    const courtObj = courts.find(c => String(c.id) === String(courtId));
    return matches.find(m => {
      if (!m) return false;
      const status = String(m.status || '').toLowerCase();
      if (status === 'cancelado' || status === 'cancelled') return false;

      const sameCourt = String(m.court_id) === String(courtId) || 
                        String((m as any).courtId) === String(courtId) ||
                        (courtObj && m.court_name && m.court_name === courtObj.name) ||
                        (courtObj && m.courtName && m.courtName === courtObj.name);
      if (!sameCourt) return false;

      const matchDateStr = m.date || (m.start_time ? String(m.start_time).split('T')[0] : '');
      if (matchDateStr !== selectedDateStr) return false;

      const startTimeStr = m.startTime || (m.start_time && m.start_time.includes('T') ? m.start_time.split('T')[1].substring(0, 5) : '');
      const matchHour = startTimeStr ? parseInt(startTimeStr.split(':')[0], 10) : (m.start_time ? new Date(m.start_time).getHours() : -1);

      return matchHour === targetHour;
    });
  };

  // Lookup de reserva que bloquee a esta cancha por superposición mutua (bloqueo bidireccional)
  const getBlockingMatchForCourtSlot = (courtId: string | number, rawHour: number) => {
    const targetHour = rawHour % 24;
    return matches.find(m => {
      if (!m) return false;
      const status = String(m.status || '').toLowerCase();
      if (status === 'cancelado' || status === 'cancelled') return false;

      const otherCourtId = (m as any).courtId || m.court_id;
      if (!areCourtsMutuallyBlocked(courtId, otherCourtId, courts)) return false;

      const matchDateStr = m.date || (m.start_time ? String(m.start_time).split('T')[0] : '');
      if (matchDateStr !== selectedDateStr) return false;

      const startTimeStr = m.startTime || (m.start_time && m.start_time.includes('T') ? m.start_time.split('T')[1].substring(0, 5) : '');
      const matchHour = startTimeStr ? parseInt(startTimeStr.split(':')[0], 10) : (m.start_time ? new Date(m.start_time).getHours() : -1);

      return matchHour === targetHour;
    });
  };

  // Posición de la línea de hora actual
  const getCurrentTimePosition = () => {
    const todayYMD = getTodayLocalYMD();
    if (selectedDateStr !== todayYMD) return null;
    if (timeSlots.length === 0) return null;

    const startH = timeSlots[0];
    const endH = timeSlots[timeSlots.length - 1];

    let curH = currentTime.getHours();
    const curM = currentTime.getMinutes();

    if (curH === 0 && endH >= 24) {
      curH = 24;
    }

    if (curH < startH || curH > endH) return null;

    const hourFraction = (curH - startH) + (curM / 60);
    return hourFraction * slotHeight;
  };

  const currentTimePos = getCurrentTimePosition();

  // Partidos confirmados para el día seleccionado (excluye cancelados)
  const dayBookingsCount = useMemo(() => {
    return matches.filter(m => {
      const st = String(m.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelled') return false;
      return (m.date === selectedDateStr || (m.start_time && m.start_time.startsWith(selectedDateStr)));
    }).length;
  }, [matches, selectedDateStr]);

  useEffect(() => {
    onDayBookingsCountChange?.(dayBookingsCount);
  }, [dayBookingsCount, onDayBookingsCountChange]);

  // 4.1. Clasificación estricta de partidos para la Vista Lista
  const { enJuego, proximos, jugados, cancelados } = useMemo(() => {
    const nowMs = currentTime.getTime();
    const ej: Match[] = [];
    const prox: Match[] = [];
    const jug: Match[] = [];
    const canc: Match[] = [];

    for (const m of matches) {
      if (!m) continue;
      const status = String(m.status || '').toLowerCase();
      if (status === 'cancelado' || status === 'cancelled') {
        canc.push(m);
        continue;
      }

      const dateStr = m.date || (m.start_time ? String(m.start_time).split('T')[0] : '');
      const startTimeStr = m.startTime || (m.start_time && m.start_time.includes('T') ? m.start_time.split('T')[1].substring(0, 5) : '18:00');
      const endTimeStr = m.endTime || (m.end_time && m.end_time.includes('T') ? m.end_time.split('T')[1].substring(0, 5) : '19:00');

      let startMs = 0;
      let endMs = 0;
      if (dateStr && startTimeStr) {
        const [y, mo, d] = dateStr.split('-').map(Number);
        const [sh, sm] = startTimeStr.split(':').map(Number);
        const [eh, em] = endTimeStr.split(':').map(Number);
        const sDate = new Date(y, mo - 1, d, sh, sm || 0);
        let eDate = new Date(y, mo - 1, d, eh, em || 0);
        if (eDate <= sDate) {
          eDate = new Date(y, mo - 1, d + 1, eh, em || 0);
        }
        startMs = sDate.getTime();
        endMs = eDate.getTime();
      } else if (m.start_time) {
        startMs = new Date(m.start_time).getTime();
        endMs = m.end_time ? new Date(m.end_time).getTime() : startMs + 3600000;
      }

      if (status === 'jugado' || status === 'completed') {
        jug.push(m);
      } else if (startMs <= nowMs && nowMs < endMs) {
        ej.push(m);
      } else if (startMs > nowMs) {
        prox.push(m);
      } else {
        jug.push(m);
      }
    }

    // Próximos: de menor a mayor distancia temporal (ascendente)
    prox.sort((a, b) => {
      const tA = new Date((a.date || '2000-01-01') + 'T' + (a.startTime || '00:00')).getTime();
      const tB = new Date((b.date || '2000-01-01') + 'T' + (b.startTime || '00:00')).getTime();
      return tA - tB;
    });

    // En juego: ascendente
    ej.sort((a, b) => {
      const tA = new Date((a.date || '2000-01-01') + 'T' + (a.startTime || '00:00')).getTime();
      const tB = new Date((b.date || '2000-01-01') + 'T' + (b.startTime || '00:00')).getTime();
      return tA - tB;
    });

    // Jugados: de más reciente a más antiguo (descendente)
    jug.sort((a, b) => {
      const tA = new Date((a.date || '2000-01-01') + 'T' + (a.startTime || '00:00')).getTime();
      const tB = new Date((b.date || '2000-01-01') + 'T' + (b.startTime || '00:00')).getTime();
      return tB - tA;
    });

    // Cancelados: de más reciente a más antiguo (descendente)
    canc.sort((a, b) => {
      const tA = new Date((a.date || '2000-01-01') + 'T' + (a.startTime || '00:00')).getTime();
      const tB = new Date((b.date || '2000-01-01') + 'T' + (b.startTime || '00:00')).getTime();
      return tB - tA;
    });

    return { enJuego: ej, proximos: prox, jugados: jug, cancelados: canc };
  }, [matches, currentTime]);

  return (
    <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col space-y-3.5 relative pb-0">
      {/* 1.2. Selector de Vista: Montado directamente sobre el fondo general, alineado a la izquierda */}
      <div className="flex items-center justify-between px-1 relative">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={cn(
              "transition-all cursor-pointer",
              viewMode === 'calendar'
                ? "bg-gray-200/90 dark:bg-slate-800 text-gray-700 dark:text-white font-bold rounded-full px-5 py-1.5 text-xs sm:text-sm shadow-2xs"
                : "bg-transparent text-gray-400 hover:text-gray-600 dark:text-slate-400 font-semibold px-4 py-1.5 text-xs sm:text-sm"
            )}
          >
            Calendario
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              "transition-all cursor-pointer",
              viewMode === 'list'
                ? "bg-gray-200/90 dark:bg-slate-800 text-gray-700 dark:text-white font-bold rounded-full px-5 py-1.5 text-xs sm:text-sm shadow-2xs"
                : "bg-transparent text-gray-400 hover:text-gray-600 dark:text-slate-400 font-semibold px-4 py-1.5 text-xs sm:text-sm"
            )}
          >
            Lista
          </button>
        </div>

        {/* Zoom Controls (para escritorio / accesibilidad en vista Calendario) */}
        {viewMode === 'calendar' && (
          <div className="hidden sm:flex items-center gap-1 bg-white dark:bg-slate-800 rounded-xl px-2 py-1 border border-gray-200/60 dark:border-slate-700 shadow-xs">
            <button 
              type="button" 
              onClick={() => updateZoomStep(-8)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 text-sm font-bold cursor-pointer transition-colors"
              title="Reducir altura (Zoom Out)"
            >
              -
            </button>
            <span className="text-[11px] font-mono text-gray-400 dark:text-slate-500 px-1 font-semibold">
              {slotHeight}px
            </span>
            <button 
              type="button" 
              onClick={() => updateZoomStep(8)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 text-sm font-bold cursor-pointer transition-colors"
              title="Aumentar altura (Zoom In)"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Manejo de Canchas Vacías */}
      {isCourtsLoaded && courts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 md:p-12 text-center my-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-200/60 dark:border-amber-800/40">
            <AlertCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No hay canchas configuradas</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Este complejo deportivo aún no tiene canchas registradas en su sede. Para habilitar la grilla horaria y poder recibir reservas, agrega tu primera cancha desde la sección de Perfil.
          </p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Configurar Canchas en Perfil
            </button>
          )}
        </div>
      ) : viewMode === 'calendar' ? (
        /* =================================================================== */
        /* 3. VISTA CALENDARIO: 3 TARJETAS CON ESPACIADO VERTICAL UNIFORME    */
        /* =================================================================== */
        <div className="flex-1 flex flex-col space-y-3.5 pb-0">
          {/* 1. Tarjeta de Calendario Semanal */}
          <div className="shrink-0 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setSelectedDateStr(prev => shiftDateYMD(prev, -7))}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer"
                title="Semana anterior"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="text-center">
                <h3 className="font-bold text-base sm:text-lg text-gray-700 dark:text-white capitalize">
                  {formatMonthYearHeading(selectedDateStr)}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {dayBookingsCount === 0 
                    ? 'Sin reservas confirmadas' 
                    : `${dayBookingsCount} ${dayBookingsCount === 1 ? 'reserva confirmada' : 'reservas confirmadas'}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDateStr(prev => shiftDateYMD(prev, 7))}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer"
                title="Semana siguiente"
                aria-label="Semana siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* 7 Columnas: Lun a Dom */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekDays.map((day) => {
                const isSelected = day.dateStr === selectedDateStr;
                return (
                  <button
                    type="button"
                    key={`weekday-${day.dateStr}`}
                    onClick={() => setSelectedDateStr(day.dateStr)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer relative py-2",
                      isSelected
                        ? "bg-[#0BA70B] text-white shadow-sm"
                        : "hover:bg-gray-50 dark:hover:bg-slate-800/80"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-medium mb-0.5",
                      isSelected ? "text-white" : "text-gray-400 dark:text-slate-400"
                    )}>
                      {day.dayLabel}
                    </span>
                    <span className={cn(
                      "text-xl sm:text-2xl font-semibold leading-tight",
                      isSelected ? "text-white font-bold" : "text-gray-300 dark:text-slate-500"
                    )}>
                      {day.dayNumber}
                    </span>
                    {day.isToday ? (
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1 animate-pulse",
                        isSelected ? "bg-white" : "bg-[#0BA70B]"
                      )} />
                    ) : (
                      <span className="w-1.5 h-1.5 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Barra de Canchas en Calendario tipo cápsula (sin viñetas decorativas) */}
          <div className="shrink-0 bg-white dark:bg-slate-900 rounded-full border border-gray-100 dark:border-slate-800 shadow-sm p-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {courts.map((court, cIdx) => {
              const isSelected = selectedCourtIds.some(id => String(id) === String(court.id));
              return (
                <button
                  type="button"
                  key={`sched-court-tab-${court.id || cIdx}-${cIdx}`}
                  onClick={() => toggleCourtSelection(court.id)}
                  className={cn(
                    "flex-1 py-2 px-4 rounded-full text-xs sm:text-sm whitespace-nowrap flex items-center justify-center cursor-pointer transition-colors",
                    isSelected
                      ? "bg-[#0BA70B] text-white font-bold shadow-xs"
                      : "bg-transparent text-gray-400 hover:text-gray-600 dark:text-slate-400 font-semibold"
                  )}
                  title={isSelected ? "Toca para ocultar columna" : "Toca para comparar columna"}
                >
                  <span className="truncate">{court.name}</span>
                </button>
              );
            })}
          </div>

          {/* 3. Grilla Horaria Proyectada en Paralelo con Multiselección, Degradado Sutil y Expansión Vertical */}
          <div
            id="reservations-grid-viewport"
            ref={viewportRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'pan-x pan-y' }}
            className="flex-1 bg-white dark:bg-slate-900 rounded-t-3xl rounded-b-none border-t border-x border-b-0 border-gray-100 dark:border-slate-800 shadow-sm p-3 sm:p-4 pb-36 sm:pb-40 overflow-hidden select-none relative flex flex-col"
          >
            {/* Bordes con degradado sutil difuminado */}
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white dark:from-slate-900 to-transparent z-10 opacity-70" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-slate-900 to-transparent z-10 opacity-80" />

            {!isOpenDay || timeSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Moon size={48} className="mb-4 opacity-50 text-gray-300 dark:text-slate-600" />
                <p className="font-bold text-lg text-gray-700 dark:text-slate-300">Cerrado este día</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Configura los horarios en la sección de Perfil.</p>
              </div>
            ) : (
              <div className="relative">
                {/* Cabecera de Nombres de Cancha arriba de las columnas */}
                <div className="flex items-center pb-2">
                  <div className="w-14 shrink-0" />
                  <div className="flex-1 flex gap-2">
                    {displayedCourts.map((c) => (
                      <div 
                        key={`col-header-${c.id}`} 
                        className="flex-1 text-center text-sm font-medium text-gray-600 dark:text-slate-300 truncate"
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Área de Grilla (Horas y Columnas de Canchas) */}
                <div className="relative flex">
                  {/* Columna izquierda de Horas ubicadas ENTRE medio de un bloque y otro (legibilidad mejorada) */}
                  <div 
                    className="w-14 shrink-0 relative"
                    style={{ height: `${timeSlots.length * slotHeight}px` }}
                  >
                    {timeSlots.map((rawHour, i) => {
                      const hourLabel = rawHour === 24 ? "00:00" : `${String(rawHour % 24).padStart(2, '0')}:00`;
                      return (
                        <div
                          key={`hour-slot-lbl-${rawHour}-${i}`}
                          className="absolute left-0 -translate-y-1/2 text-xs font-medium text-gray-400 dark:text-slate-400 font-sans select-none"
                          style={{ top: `${i * slotHeight}px` }}
                        >
                          {hourLabel}
                        </div>
                      );
                    })}
                    {timeSlots.length > 0 && (() => {
                      const lastHour = timeSlots[timeSlots.length - 1];
                      const closingHour = (lastHour + 1) % 24;
                      const closingLabel = `${String(closingHour).padStart(2, '0')}:00`;
                      return (
                        <div
                          key="hour-slot-lbl-closing"
                          className="absolute left-0 -translate-y-1/2 text-xs font-medium text-gray-400 dark:text-slate-400 font-sans select-none"
                          style={{ top: `${timeSlots.length * slotHeight}px` }}
                        >
                          {closingLabel}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Área de Canchas */}
                  <div className="flex-1 relative">
                    {/* Línea roja de hora actual */}
                    {currentTimePos !== null && (
                      <div 
                        className="absolute -left-14 right-0 z-20 flex items-center pointer-events-none -translate-y-1/2"
                        style={{ top: `${currentTimePos}px` }}
                      >
                        <div className="w-14 shrink-0 text-left pl-0 text-[10px] font-semibold text-red-500">
                          {format(currentTime, 'HH:mm')}
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                        <div className="flex-1 h-[1.5px] bg-red-500" />
                      </div>
                    )}

                    {/* Filas de slots horarios sin líneas divisorias de tabla */}
                    <div className="flex flex-col">
                      {timeSlots.map((rawHour, hIdx) => {
                        const hourLabel = rawHour === 24 ? "00:00" : `${String(rawHour % 24).padStart(2, '0')}:00`;
                        const nextHour = (rawHour + 1) % 24;
                        const endHourLabel = `${String(nextHour).padStart(2, '0')}:00`;

                        return (
                          <div
                            key={`grid-slot-row-${rawHour}-${hIdx}`}
                            className="flex items-stretch gap-2 py-1"
                            style={{ height: `${slotHeight}px` }}
                          >
                            {displayedCourts.map((court) => {
                              const match = getMatchForCourtSlot(court.id, rawHour);
                              const blockingMatch = !match ? getBlockingMatchForCourtSlot(court.id, rawHour) : null;

                              return (
                                <div 
                                  key={`grid-cell-${court.id}-${rawHour}`}
                                  className="flex-1 h-full min-w-0"
                                >
                                  {match ? (
                                    (() => {
                                      const totalPrice = Number(match.price_total ?? match.price ?? 0);
                                      const paidAmount = match.payment_status === 'paid' ? totalPrice : Number(match.amount_paid ?? match.deposit ?? 0);
                                      const isFullyPaid = (totalPrice > 0 && paidAmount >= totalPrice) || match.payment_status === 'paid' || (match as any).paymentStatus === 'pagado';
                                      
                                      // Regla estricta: 1 o 2 canchas = 1 sola línea; 3 o más canchas = 2 líneas
                                      const isNarrowLayout = displayedCourts.length >= 3;

                                      return (
                                        <div
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onMatchClick(match);
                                          }}
                                          className={cn(
                                            "h-full w-full rounded-2xl cursor-pointer transition-all hover:shadow-xs overflow-hidden select-none",
                                            isFullyPaid
                                              ? "bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                                              : "bg-red-50/70 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-red-800 dark:text-red-300"
                                          )}
                                        >
                                          {isNarrowLayout ? (
                                            <div className="flex flex-col justify-center items-start px-2 py-1 h-full w-full rounded-2xl leading-tight min-w-0">
                                              <div className="flex items-center gap-1 w-full min-w-0">
                                                <UserIcon size={11} className="shrink-0 opacity-80" />
                                                <span className="truncate text-[10px] sm:text-[11px] font-medium">
                                                  {getMatchHostDisplayName(match)}
                                                </span>
                                              </div>
                                              <div className="text-[10px] font-bold pl-3.5 whitespace-nowrap">
                                                ${paidAmount.toLocaleString('es-AR')}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-between gap-2 px-3.5 h-full w-full rounded-2xl min-w-0">
                                              <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                                                <UserIcon size={14} className="shrink-0 opacity-80" />
                                                <span className="truncate font-medium text-xs sm:text-sm">
                                                  {getMatchHostDisplayName(match)}
                                                </span>
                                              </div>
                                              <span className="font-semibold text-xs sm:text-sm shrink-0 whitespace-nowrap">
                                                ${paidAmount.toLocaleString('es-AR')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : blockingMatch ? (
                                    /* Celda bloqueada por superposición mutua con otra cancha */
                                    <div 
                                      className="h-full w-full rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center px-2 text-center select-none cursor-not-allowed"
                                      title={`Bloqueada por turno confirmado en ${blockingMatch.courtName || blockingMatch.court_name || 'cancha superpuesta'}`}
                                    >
                                      <span className="text-[10px] sm:text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                                        Bloqueada ({blockingMatch.courtName || blockingMatch.court_name || 'Superpuesta'})
                                      </span>
                                    </div>
                                  ) : (
                                    /* Hueco libre con fondo gris suave y esquinas redondeadas */
                                    <div
                                      onClick={() => {
                                        onNewBooking({
                                          court_id: court.id,
                                          courtId: court.id,
                                          courtName: court.name,
                                          date: selectedDateStr,
                                          startTime: hourLabel,
                                          time: hourLabel,
                                          endTime: endHourLabel,
                                          isPrefilledFromSlot: true
                                        });
                                      }}
                                      className="h-full w-full rounded-2xl bg-[#eeeeef] dark:bg-slate-800/70 hover:bg-gray-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title={`Tocar para reservar ${court.name} a las ${hourLabel}`}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =================================================================== */
        /* 2. VISTA LISTA: CONSOLA UNIFICADA DE PARTIDOS EN 4 BLOQUES         */
        /* =================================================================== */
        <div className="space-y-4 pb-28">
          {/* 2.2. Sección 1: En juego - Título plano sin pastillas ni punto titilante */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('en_juego')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50/60 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            >
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                En juego ({enJuego.length})
              </h3>
              <ChevronDown 
                size={18} 
                className={cn("text-gray-400 transition-transform duration-200", collapsedSections.en_juego ? "-rotate-90" : "rotate-0")} 
              />
            </button>

            {!collapsedSections.en_juego && (
              <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
                {enJuego.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500 py-3 text-center italic">
                    No hay partidos en juego en este momento.
                  </p>
                ) : (
                  enJuego.map((m, idx) => (
                    <MatchListCard 
                      key={`list-ej-${m.id || idx}`} 
                      match={m} 
                      category="en_juego" 
                      courtsCount={courts.length} 
                      displayClientName={getMatchHostDisplayName(m)}
                      onClick={() => onMatchClick(m)} 
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2.2. Sección 2: Próximos - Título plano sin pastillas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('proximos')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50/60 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            >
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                Próximos ({proximos.length})
              </h3>
              <ChevronDown 
                size={18} 
                className={cn("text-gray-400 transition-transform duration-200", collapsedSections.proximos ? "-rotate-90" : "rotate-0")} 
              />
            </button>

            {!collapsedSections.proximos && (
              <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:border-slate-800">
                {proximos.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500 py-3 text-center italic">
                    No hay próximos partidos programados.
                  </p>
                ) : (
                  proximos.map((m, idx) => (
                    <MatchListCard 
                      key={`list-prox-${m.id || idx}`} 
                      match={m} 
                      category="proximos" 
                      courtsCount={courts.length} 
                      displayClientName={getMatchHostDisplayName(m)}
                      onClick={() => onMatchClick(m)} 
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2.2. Sección 3: Jugados - Título plano sin pastillas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('jugados')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50/60 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            >
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                Jugados ({jugados.length})
              </h3>
              <ChevronDown 
                size={18} 
                className={cn("text-gray-400 transition-transform duration-200", collapsedSections.jugados ? "-rotate-90" : "rotate-0")} 
              />
            </button>

            {!collapsedSections.jugados && (
              <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
                {jugados.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500 py-3 text-center italic">
                    No hay partidos disputados registrados.
                  </p>
                ) : (
                  jugados.map((m, idx) => (
                    <MatchListCard 
                      key={`list-jug-${m.id || idx}`} 
                      match={m} 
                      category="jugados" 
                      courtsCount={courts.length} 
                      displayClientName={getMatchHostDisplayName(m)}
                      onClick={() => onMatchClick(m)} 
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2.2. Sección 4: Cancelados - Título plano sin pastillas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('cancelados')}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50/60 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            >
              <h3 className="font-bold text-sm sm:text-base text-gray-700 dark:text-slate-300">
                Cancelados ({cancelados.length})
              </h3>
              <ChevronDown 
                size={18} 
                className={cn("text-gray-400 transition-transform duration-200", collapsedSections.cancelados ? "-rotate-90" : "rotate-0")} 
              />
            </button>

            {!collapsedSections.cancelados && (
              <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
                {cancelados.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500 py-3 text-center italic">
                    No hay reservas canceladas.
                  </p>
                ) : (
                  cancelados.map((m, idx) => (
                    <MatchListCard 
                      key={`list-canc-${m.id || idx}`} 
                      match={m} 
                      category="cancelados" 
                      courtsCount={courts.length} 
                      displayClientName={getMatchHostDisplayName(m)}
                      onClick={() => onMatchClick(m)} 
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Botón Flotante de Acción (FAB +) - Coordenadas y diseño homologados idénticos con Usuarios */}
      <button
        type="button"
        onClick={() => {
          const firstCourt = displayedCourts[0] || courts[0];
          onNewBooking({
            date: selectedDateStr,
            courtId: firstCourt?.id,
            court_id: firstCourt?.id,
            courtName: firstCourt?.name,
            isPrefilledFromSlot: false
          });
        }}
        aria-label="Crear Nueva Reserva"
        title="Crear Nueva Reserva"
        className="fixed bottom-20 right-4 sm:right-6 lg:bottom-8 lg:right-8 z-30 w-13 h-13 sm:w-14 sm:h-14 bg-[#0BA70B] hover:bg-[#099309] active:scale-95 text-white rounded-2xl shadow-lg shadow-emerald-950/20 flex items-center justify-center transition-all cursor-pointer"
      >
        <CalendarPlus size={26} strokeWidth={2.4} />
      </button>
    </div>
  );
};

const UsersView = ({ 
  onUserClick, 
  refreshKey, 
  onDataChange, 
  complexId = 'complejo_central',
  unifiedUsers,
  userMetrics
}: { 
  onUserClick: (id: number | string, user?: User) => void, 
  refreshKey?: number, 
  onDataChange?: () => void, 
  complexId?: string,
  unifiedUsers?: User[],
  userMetrics?: Map<string, UserLifecycleMetrics>
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Match[]>([]);
  const [search, setSearch] = useState('');
  const [showNewUserModal, setShowNewUserModal] = useState(false);

  // Filtros desplegables: Reservas, Juegos (Jugados), Días sin jugar
  const [reservasFilter, setReservasFilter] = useState<'total' | '-5' | '-10' | '-20' | '-50'>('total');
  const [juegosFilter, setJuegosFilter] = useState<'total' | '-5' | '-10' | '-20' | '-50'>('total');
  const [diasFilter, setDiasFilter] = useState<'total' | '0-15' | '16-30' | '31-60' | '60+'>('total');

  useEffect(() => {
    let isMounted = true;
    if (!complexId || (unifiedUsers && unifiedUsers.length > 0)) return;

    // Real-time Firestore sync for users
    const unsubUsers = subscribeToClients(complexId, (clientsList) => {
      if (Array.isArray(clientsList) && isMounted) {
        setUsers(clientsList);
      }
    });

    // Real-time Firestore sync for bookings to cross-reference B_u in memory
    const unsubBookings = subscribeToBookings(complexId, (bookingsList) => {
      if (Array.isArray(bookingsList) && isMounted) {
        setBookings(bookingsList);
      }
    });

    return () => {
      isMounted = false;
      unsubUsers();
      unsubBookings();
    };
  }, [complexId, refreshKey, unifiedUsers]);

  // Construir el índice de actividad unificado del CRM con organizadores, participantes y clientes registrados
  const computedIndex = useMemo(() => {
    if (unifiedUsers && userMetrics) {
      return { crmUsers: unifiedUsers, userMetricsMap: userMetrics };
    }
    return buildCrmActivityIndex(users, bookings, complexId, new Date());
  }, [users, bookings, complexId, unifiedUsers, userMetrics]);

  const { crmUsers, userMetricsMap } = computedIndex;

  const handleCreateUser = async (userData: any) => {
    try {
      await saveClientInFirestore(complexId, userData);
      setShowNewUserModal(false);
      if (onDataChange) onDataChange();
    } catch (error) {
      console.error('Error creating user in Firestore:', error);
    }
  };

  const filteredUsers = useMemo(() => {
    return (Array.isArray(crmUsers) ? crmUsers : []).filter(user => {
      if (!user) return false;
      const metrics = userMetricsMap.get(String(user.id));
      if (!metrics) return false;

      // 1. Buscador por nombre o teléfono
      const searchClean = (search || '').trim().toLowerCase();
      if (searchClean) {
        const userName = (user.name || '').toLowerCase();
        const userCanonical = (user.canonicalName || '').toLowerCase();
        const userPhone = String(user.phone || '');
        const phoneClean = userPhone.replace(/\D/g, '');
        const searchPhoneClean = searchClean.replace(/\D/g, '');

        const matchesName = userName.includes(searchClean) || userCanonical.includes(searchClean);
        const matchesPhone = userPhone.includes(searchClean) || (searchPhoneClean.length >= 3 && phoneClean.includes(searchPhoneClean));

        if (!matchesName && !matchesPhone) {
          return false;
        }
      }

      // 2. Filtro Reservas (-5, -10, -20, -50, total)
      if (reservasFilter !== 'total') {
        const r = metrics.reservas;
        if (reservasFilter === '-5' && r > 5) return false;
        if (reservasFilter === '-10' && r > 10) return false;
        if (reservasFilter === '-20' && r > 20) return false;
        if (reservasFilter === '-50' && r > 50) return false;
      }

      // 3. Filtro Juegos / Jugados (-5, -10, -20, -50, total)
      if (juegosFilter !== 'total') {
        const j = metrics.juegos;
        if (juegosFilter === '-5' && j > 5) return false;
        if (juegosFilter === '-10' && j > 10) return false;
        if (juegosFilter === '-20' && j > 20) return false;
        if (juegosFilter === '-50' && j > 50) return false;
      }

      // 4. Filtro Días sin jugar (0 a 15 días, 16 a 30 días, 31 a 60 días, + 60 días, total)
      if (diasFilter !== 'total') {
        const days = metrics.sinJugarDays;
        if (days === null) return false;
        if (diasFilter === '0-15' && (days < 0 || days > 15)) return false;
        if (diasFilter === '16-30' && (days < 16 || days > 30)) return false;
        if (diasFilter === '31-60' && (days < 31 || days > 60)) return false;
        if (diasFilter === '60+' && days < 61) return false;
      }

      return true;
    });
  }, [crmUsers, userMetricsMap, search, reservasFilter, juegosFilter, diasFilter]);

  const getWhatsAppUrl = (rawPhone?: string | null): string | null => {
    if (!rawPhone || typeof rawPhone !== 'string') return null;
    const trimmed = rawPhone.trim();
    if (!trimmed || trimmed === '-' || trimmed.toLowerCase().includes('sin') || trimmed.includes('@')) {
      return null;
    }
    let digits = trimmed.replace(/\D/g, '');
    if (!digits || digits.length < 6) return null;

    // Quitar ceros a la izquierda
    while (digits.startsWith('0') && digits.length > 8) {
      digits = digits.slice(1);
    }

    // Si tiene el prefijo '15' de móvil local en Argentina
    if (digits.length === 11 && digits.startsWith('1115')) {
      digits = '11' + digits.slice(4);
    } else if (digits.length === 11 && digits.startsWith('15')) {
      digits = digits.slice(2);
    }

    // Si ya comienza con 549 (código móvil internacional de Argentina)
    if (digits.startsWith('549')) {
      return `https://wa.me/${digits}`;
    }

    // Si comienza con 54
    if (digits.startsWith('54')) {
      // Si tiene 12 dígitos (54 + 10 dígitos sin el 9 de móvil), insertar el 9
      if (digits.length === 12 && !digits.startsWith('549')) {
        digits = '549' + digits.slice(2);
      }
      return `https://wa.me/${digits}`;
    }

    // Si tiene 10 dígitos (número estándar móvil en Argentina ej: 1138032662)
    if (digits.length === 10) {
      return `https://wa.me/549${digits}`;
    }

    // Cualquier otro número válido sin 54
    return `https://wa.me/549${digits}`;
  };

  const getSinJugarBadge = (days: number | null) => {
    if (days === null) return null;
    // Verde Jogo si <= 15 días
    let bgClass = 'bg-[#0BA70B] text-white';
    if (days >= 16 && days <= 30) {
      // Amarillo si 16 a 30 días
      bgClass = 'bg-[#F2B90F] text-slate-900 font-bold';
    } else if (days >= 31 && days <= 60) {
      // Naranja si 31 a 60 días
      bgClass = 'bg-[#F2780F] text-white font-semibold';
    } else if (days >= 61) {
      // Rojo si 61 o más días
      bgClass = 'bg-[#E53E3E] text-white font-semibold';
    }
    return {
      label: `Hace ${days}d`,
      className: cn('px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[11px] font-semibold inline-block tracking-tight whitespace-nowrap shadow-xs', bgClass)
    };
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 relative">
      {/* Modal para crear usuario existente */}
      <NewUserModal 
        isOpen={showNewUserModal} 
        onClose={() => setShowNewUserModal(false)} 
        onSave={handleCreateUser}
        existingUsers={crmUsers || users}
      />

      {/* Gran tarjeta blanca, con bordes superiores redondeados y borde gris fino */}
      <div className="w-full flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-800 rounded-t-[28px] sm:rounded-t-[32px] border-t border-x border-gray-200/90 dark:border-slate-700/80 shadow-xs overflow-hidden">
        {/* Buscador y Filtros en una misma fila horizontal */}
        <div className="flex flex-row items-center justify-between gap-1.5 sm:gap-3 shrink-0 p-3 sm:p-5 pb-2.5 sm:pb-3 border-b border-gray-100 dark:border-slate-700/60">
          {/* Buscador alineado a la izquierda */}
          <div className="relative flex-1 min-w-[95px] max-w-[170px] sm:max-w-xs md:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={13} strokeWidth={2.2} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o teléfono" 
              className="w-full pl-7 pr-2 py-1.5 bg-transparent rounded-full text-[10.5px] sm:text-xs outline-none text-gray-800 dark:text-slate-100 placeholder:text-gray-400 placeholder:text-[9.5px] sm:placeholder:text-xs border border-gray-200 dark:border-slate-700 focus:border-gray-400 dark:focus:border-slate-500 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filtros alineados a la derecha */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Filtro Reservas */}
            <div className="relative inline-flex items-center gap-0.5 text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white text-[10px] sm:text-xs font-normal cursor-pointer select-none">
              <span>{reservasFilter === 'total' ? 'Reservas' : `- ${reservasFilter.replace('-', '')}`}</span>
              <ChevronRight size={11} className="text-gray-400 shrink-0" />
              <select 
                value={reservasFilter}
                onChange={(e) => setReservasFilter(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Filtro Reservas"
              >
                <option value="total">Reservas: Total</option>
                <option value="-5">-5 reservas</option>
                <option value="-10">-10 reservas</option>
                <option value="-20">-20 reservas</option>
                <option value="-50">-50 reservas</option>
              </select>
            </div>

            {/* Filtro Jugados */}
            <div className="relative inline-flex items-center gap-0.5 text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white text-[10px] sm:text-xs font-normal cursor-pointer select-none">
              <span>{juegosFilter === 'total' ? 'Jugados' : `- ${juegosFilter.replace('-', '')}`}</span>
              <ChevronRight size={11} className="text-gray-400 shrink-0" />
              <select 
                value={juegosFilter}
                onChange={(e) => setJuegosFilter(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Filtro Jugados"
              >
                <option value="total">Jugados: Total</option>
                <option value="-5">-5 juegos</option>
                <option value="-10">-10 juegos</option>
                <option value="-20">-20 juegos</option>
                <option value="-50">-50 juegos</option>
              </select>
            </div>

            {/* Filtro Días sin jugar */}
            <div className="relative inline-flex items-center gap-0.5 text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white text-[10px] sm:text-xs font-normal cursor-pointer select-none">
              <span>{diasFilter === 'total' ? 'Días sin jugar' : `${diasFilter}d`}</span>
              <ChevronRight size={11} className="text-gray-400 shrink-0" />
              <select 
                value={diasFilter}
                onChange={(e) => setDiasFilter(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Filtro Días sin jugar"
              >
                <option value="total">Días sin jugar: Total</option>
                <option value="0-15">0 a 15 días</option>
                <option value="16-30">16 a 30 días</option>
                <option value="31-60">31 a 60 días</option>
                <option value="60+">+ 60 días</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contenedor de Tabla con encabezado fijo y scroll independiente para las filas */}
        <div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 sm:px-4">
            <table className="w-full table-fixed border-collapse">
              <thead className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/80 shadow-2xs">
                <tr className="text-gray-500 dark:text-slate-400 text-[10px] sm:text-xs font-normal">
                  <th className="py-2.5 px-1 sm:px-2 text-left font-normal w-[36%] sm:w-[34%]">Usuario</th>
                  <th className="py-2.5 px-0.5 sm:px-1 text-center font-normal w-[13%] sm:w-[14%]">Reservas</th>
                  <th className="py-2.5 px-0.5 sm:px-1 text-center font-normal w-[13%] sm:w-[14%]">Jugados</th>
                  <th className="py-2.5 px-0.5 sm:px-1 text-center font-normal w-[24%] sm:w-[23%]">Días sin jugar</th>
                  <th className="py-2.5 px-1 sm:px-2 text-center sm:text-right font-normal w-[14%] sm:w-[15%]">Actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {filteredUsers.map((user, idx) => {
                  if (!user) return null;
                  const metrics = userMetricsMap.get(String(user.id)) || calculateUserLifecycleMetrics(user, [], new Date());
                  const badge = getSinJugarBadge(metrics.sinJugarDays);
                  const waUrl = getWhatsAppUrl(user.phone);
                  const hasPhone = Boolean(waUrl && user.phone && user.phone.trim() && user.phone.trim() !== '-' && !user.phone.toLowerCase().includes('sin') && !user.phone.includes('@'));

                  return (
                    <tr 
                      key={`user-row-${user.id || idx}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onUserClick(user.id, user);
                      }}
                      className="hover:bg-gray-50/70 dark:hover:bg-slate-700/30 transition-colors cursor-pointer group"
                    >
                      {/* Usuario */}
                      <td className="py-2.5 px-1 sm:px-2 text-left align-middle overflow-hidden">
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="font-bold text-gray-900 dark:text-slate-100 text-[11.5px] sm:text-sm truncate block leading-tight">
                            {user.name}
                          </span>
                          {hasPhone ? (
                            <a
                              href={waUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#0BA70B] dark:text-[#0BA70B] text-[10.5px] sm:text-xs font-normal hover:underline truncate block mt-0.5 cursor-pointer leading-tight"
                              title={`Abrir WhatsApp con ${user.name}`}
                            >
                              {user.phone}
                            </a>
                          ) : (
                            <span className="text-gray-400 dark:text-slate-500 text-[10.5px] sm:text-xs font-normal block mt-0.5 leading-tight">
                              -
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reservas */}
                      <td className="py-2.5 px-0.5 sm:px-1 text-center align-middle">
                        <span className="text-gray-700 dark:text-slate-300 text-[11.5px] sm:text-sm font-normal">
                          {metrics.reservas}
                        </span>
                      </td>

                      {/* Jugados */}
                      <td className="py-2.5 px-0.5 sm:px-1 text-center align-middle">
                        <span className="text-gray-700 dark:text-slate-300 text-[11.5px] sm:text-sm font-normal">
                          {metrics.juegos}
                        </span>
                      </td>

                      {/* Días sin jugar */}
                      <td className="py-2.5 px-0.5 sm:px-1 text-center align-middle">
                        {badge ? (
                          <span className={badge.className}>
                            {badge.label}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal text-xs">-</span>
                        )}
                      </td>

                      {/* Actividad */}
                      <td className="py-2.5 px-1 sm:px-2 text-center sm:text-right align-middle">
                        <span className="text-gray-700 dark:text-slate-300 text-[11.5px] sm:text-sm font-normal">
                          {metrics.cicloFormatted !== '-' ? metrics.cicloFormatted : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Espaciador inferior para garantizar visibilidad total sobre la barra inferior y FAB */}
                <tr aria-hidden="true">
                  <td colSpan={5} className="h-16 border-none" />
                </tr>
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <div className="p-12 text-center text-gray-400 dark:text-slate-500 text-xs sm:text-sm">
                No se encontraron usuarios con los filtros seleccionados.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FAB Botón de alta: fijo abajo a la derecha, fondo verde Jogo, cuadrado con esquinas redondeadas y sombra sutil */}
      <button 
        type="button" 
        onClick={() => setShowNewUserModal(true)} 
        aria-label="Registrar nuevo usuario"
        title="Registrar nuevo usuario"
        className="fixed bottom-20 right-4 sm:right-6 lg:bottom-8 lg:right-8 z-30 w-13 h-13 sm:w-14 sm:h-14 bg-[#0BA70B] hover:bg-[#099309] active:scale-95 text-white rounded-2xl shadow-lg shadow-emerald-950/20 flex items-center justify-center transition-all cursor-pointer"
      >
        <UserPlus size={26} strokeWidth={2.4} />
      </button>
    </div>
  );
};

export const ClientsView = UsersView;

const AnalyticsView = ({ complexId = 'complejo_central' }: { complexId?: string }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubU = subscribeToClients(complexId, (u) => {
      setUsers(Array.isArray(u) ? u : []);
      setIsLoading(false);
    });
    const unsubB = subscribeToBookings(complexId, (b) => {
      setBookings(Array.isArray(b) ? b : []);
    });

    return () => {
      unsubU();
      unsubB();
    };
  }, [complexId]);

  const cohortsList = useMemo(() => computeCohorts(users, bookings), [users, bookings]);

  if (isLoading && users.length === 0 && bookings.length === 0) return <div className="p-6 text-center text-gray-500">Cargando métricas...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h2 className="font-bold text-lg mb-6">Cohortes de Retención</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr>
                <th className="text-left p-3">Mes</th>
                <th className="p-3">Usuarios Nuevos</th>
                <th className="p-3 bg-emerald-50 text-emerald-700 rounded-t-lg">Mes 1</th>
                <th className="p-3 bg-emerald-50 text-emerald-700 rounded-t-lg">Mes 2</th>
                <th className="p-3 bg-emerald-50 text-emerald-700 rounded-t-lg">Mes 3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cohortsList.map((row: any, i: number) => (
                <tr key={`cohort-table-row-${row.month || i}-${i}`}>
                  <td className="text-left p-3 font-medium">{row.month}</td>
                  <td className="p-3 text-gray-500">{row.newUsers}</td>
                  <td className="p-3 bg-emerald-50/30 font-bold text-emerald-600">{row.m1 ? `${row.m1}%` : '-'}</td>
                  <td className="p-3 bg-emerald-50/30 font-bold text-emerald-600">{row.m2 ? `${row.m2}%` : '-'}</td>
                  <td className="p-3 bg-emerald-50/30 font-bold text-emerald-600">{row.m3 ? `${row.m3}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const FinanceChartModal = ({ isOpen, onClose, complexId = 'complejo_central' }: { isOpen: boolean, onClose: () => void, complexId?: string }) => {
  const [chartPeriod, setChartPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [chartData, setChartData] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Match[]>([]);
  
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToBookings(complexId, (b) => setBookings(Array.isArray(b) ? b : []));
    return () => unsub();
  }, [isOpen, complexId]);

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date();
    let incomeTx = bookings.filter(b => b.status !== 'cancelled').map(b => {
      const price = Number(b.price || b.price_total || 0);
      const paid = b.payment_status === 'paid' ? price : Number(b.amount_paid || b.deposit || 0);
      return {
        date: b.date || (b.start_time ? String(b.start_time).split('T')[0] : new Date().toISOString().split('T')[0]),
        time: b.startTime || '18:00',
        amount: paid > 0 ? paid : price
      };
    });

    if (chartPeriod === 'today') {
      incomeTx = incomeTx.filter((t: any) => {
        const parsed = safeParseDate(t?.date);
        return parsed ? isSameDay(parsed, today) : false;
      });
    } else if (chartPeriod === 'week') {
      incomeTx = incomeTx.filter((t: any) => {
        const parsed = safeParseDate(t?.date);
        return parsed ? differenceInDays(today, parsed) <= 7 && differenceInDays(today, parsed) >= 0 : false;
      });
    } else if (chartPeriod === 'month') {
      incomeTx = incomeTx.filter((t: any) => {
        const parsed = safeParseDate(t?.date);
        return parsed ? isSameMonth(parsed, today) : false;
      });
    }
    
    let grouped: Record<string, number> = {};
    incomeTx.forEach((tx: any) => {
      const dateObj = new Date(tx.date);
      let key = '';
      if (chartPeriod === 'today') {
        key = tx.time.split(':')[0].padStart(2, '0') + ':00';
      } else if (chartPeriod === 'week' || chartPeriod === 'month') {
        key = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      } else if (chartPeriod === 'year') {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        key = months[dateObj.getMonth()];
      }
      grouped[key] = (grouped[key] || 0) + tx.amount;
    });

    if (chartPeriod === 'today') {
       const hours = [];
       for (let i = 8; i <= 23; i++) hours.push(i.toString().padStart(2, '0') + ':00');
       hours.forEach(h => { if (!grouped[h]) grouped[h] = 0; });
    } else if (chartPeriod === 'year') {
       const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
       months.forEach(m => { if (!grouped[m]) grouped[m] = 0; });
    }

    let dataArray = Object.entries(grouped).map(([time, amount]) => ({ time, amount }));
    if (chartPeriod === 'today' || chartPeriod === 'week' || chartPeriod === 'month') {
      dataArray.sort((a, b) => {
         if (chartPeriod === 'today') return a.time.localeCompare(b.time);
         const [dA, mA] = a.time.split('/');
         const [dB, mB] = b.time.split('/');
         const d1 = new Date(2024, Number(mA)-1, Number(dA));
         const d2 = new Date(2024, Number(mB)-1, Number(dB));
         return d1.getTime() - d2.getTime();
      });
    } else {
       const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
       dataArray.sort((a, b) => months.indexOf(a.time) - months.indexOf(b.time));
    }

    setChartData(dataArray);
  }, [isOpen, bookings, chartPeriod]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" 
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg md:text-xl text-gray-900">Gráfico de Ingresos</h3>
            <div className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
              {chartPeriod === 'today' 
                ? '24hs' 
                : chartPeriod === 'week' 
                  ? `${safeFormatDate(startOfWeek(new Date(), { weekStartsOn: 1 }), "dd/MM")} al ${safeFormatDate(endOfWeek(new Date(), { weekStartsOn: 1 }), "dd/MM")}` 
                  : chartPeriod === 'month' 
                    ? safeFormatDate(new Date(), 'MMMM', { locale: es }).replace(/^./, (c) => c.toUpperCase())
                    : safeFormatDate(new Date(), 'yyyy')}
            </div>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 md:p-6 flex-1 min-h-[300px]">
          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
               {[
                 { id: 'today', label: 'Hoy' },
                 { id: 'week', label: 'Sem' },
                 { id: 'month', label: 'Mes' }
              ].map((tab, tIdx) => (
                 <button type="button"
                   key={`chart-modal-tab-${tab.id}-${tIdx}`}
                   onClick={() => setChartPeriod(tab.id as any)}
                   className={cn(
                     "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                     chartPeriod === tab.id ? "bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                   )}
                 >
                   {tab.label}
                 </button>
               ))}
            </div>
            <div className="text-emerald-600 font-bold text-lg tracking-tight whitespace-nowrap pl-4">
              ${chartData.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
            </div>
          </div>

          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#9ca3af' }} 
                  dy={10} 
                  tickFormatter={(val) => {
                    if (chartPeriod === 'today') return val.split(':')[0]; 
                    if (chartPeriod === 'week' || chartPeriod === 'month') return val.split('/')[0];
                    return val;
                  }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#9ca3af' }} 
                  tickFormatter={(value) => {
                    if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + 'M';
                    if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
                    return value;
                  }}
                  width={40}
                />
                <Tooltip 
                  cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  formatter={(value: number) => [`${value.toLocaleString()}`, 'Ingresos']}
                  labelStyle={{ color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export type FinancePeriod = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month';

export const FINANCE_PERIOD_OPTIONS: { id: FinancePeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'this_week', label: 'Esta semana' },
  { id: 'last_week', label: 'Semana anterior' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' }
];

export function getPeriodRange(period: FinancePeriod, now = new Date()) {
  const tStart = startOfDay(now);
  const tEnd = endOfDay(now);

  if (period === 'today') {
    const yDate = new Date(now.getTime() - 24 * 3600 * 1000);
    return {
      current: { start: tStart, end: tEnd },
      previous: { start: startOfDay(yDate), end: endOfDay(yDate) },
      compareLabel: 'de ayer'
    };
  }
  if (period === 'this_week') {
    const cStart = startOfWeek(now, { weekStartsOn: 1 });
    const cEnd = endOfWeek(now, { weekStartsOn: 1 });
    const pRef = new Date(cStart.getTime() - 24 * 3600 * 1000);
    return {
      current: { start: cStart, end: cEnd },
      previous: { start: startOfWeek(pRef, { weekStartsOn: 1 }), end: endOfWeek(pRef, { weekStartsOn: 1 }) },
      compareLabel: 'de sem. ant.'
    };
  }
  if (period === 'last_week') {
    const thisWStart = startOfWeek(now, { weekStartsOn: 1 });
    const lRef = new Date(thisWStart.getTime() - 24 * 3600 * 1000);
    const cStart = startOfWeek(lRef, { weekStartsOn: 1 });
    const cEnd = endOfWeek(lRef, { weekStartsOn: 1 });
    const pRef = new Date(cStart.getTime() - 24 * 3600 * 1000);
    return {
      current: { start: cStart, end: cEnd },
      previous: { start: startOfWeek(pRef, { weekStartsOn: 1 }), end: endOfWeek(pRef, { weekStartsOn: 1 }) },
      compareLabel: 'de sem. ant.'
    };
  }
  if (period === 'this_month') {
    const cStart = startOfMonth(now);
    const cEnd = endOfMonth(now);
    const pRef = new Date(cStart.getTime() - 24 * 3600 * 1000);
    return {
      current: { start: cStart, end: cEnd },
      previous: { start: startOfMonth(pRef), end: endOfMonth(pRef) },
      compareLabel: 'del mes ant.'
    };
  }
  // 'last_month'
  const thisMStart = startOfMonth(now);
  const lRef = new Date(thisMStart.getTime() - 24 * 3600 * 1000);
  const cStart = startOfMonth(lRef);
  const cEnd = endOfMonth(lRef);
  const pRef = new Date(cStart.getTime() - 24 * 3600 * 1000);
  return {
    current: { start: cStart, end: cEnd },
    previous: { start: startOfMonth(pRef), end: endOfMonth(pRef) },
    compareLabel: 'del mes ant.'
  };
}

function computeTrend(current: number, previous: number) {
  if (previous === 0) {
    if (current > 0) return { pct: '+100%', isUp: true };
    return { pct: '+0%', isUp: true };
  }
  const pctNum = Math.round(((current - previous) / previous) * 100);
  if (pctNum >= 0) {
    return { pct: `+${pctNum}%`, isUp: true };
  }
  return { pct: `${pctNum}%`, isUp: false };
}

function resolveFinanceCourtName(
  item?: any,
  linkedBooking?: any,
  linkedOp?: any,
  courts: Court[] = []
): string {
  // 1. Buscá primero la reserva vinculada (linkedBooking)
  if (linkedBooking) {
    const bName = linkedBooking.courtName || linkedBooking.court_name || linkedBooking.court;
    if (bName && typeof bName === 'string' && bName.trim() && bName.trim().toLowerCase() !== 'cancha') {
      return bName.trim();
    }
    const bCourtId = linkedBooking.courtId ?? linkedBooking.court_id;
    if (bCourtId) {
      const foundCourt = courts.find(c => String(c.id) === String(bCourtId));
      if (foundCourt?.name) return foundCourt.name;
    }
  }

  // 1.b Buscar por courtId en el ítem directamente
  const directCourtId = item?.courtId ?? item?.court_id ?? item?.originalDoc?.courtId;
  if (directCourtId) {
    const foundCourt = courts.find(c => String(c.id) === String(directCourtId));
    if (foundCourt?.name) return foundCourt.name;
  }

  // 2. Buscá en la operación vinculada (linkedOp)
  if (linkedOp) {
    const opName = linkedOp.courtName || linkedOp.metadata?.courtName;
    if (opName && typeof opName === 'string' && opName.trim() && opName.trim().toLowerCase() !== 'cancha') {
      return opName.trim();
    }
    const opCourtId = linkedOp.courtId || linkedOp.metadata?.courtId;
    if (opCourtId) {
      const foundCourt = courts.find(c => String(c.id) === String(opCourtId));
      if (foundCourt?.name) return foundCourt.name;
    }
  }

  // 3. Analizar textos (item.notes, item.category, item.concept, linkedOp?.notes, linkedBooking?.notes)
  const textCandidates = [
    item?.courtName,
    item?.notes,
    item?.concept,
    item?.category,
    linkedOp?.notes,
    linkedOp?.concept,
    linkedBooking?.notes
  ].filter(Boolean) as string[];

  for (const text of textCandidates) {
    // Buscar patrones específicos como "Alquiler Cancha (El Maracaná)" o "Reserva (Cancha 1)"
    const parenMatch = text.match(/(?:Alquiler\s+Cancha|Reserva|Cobro\s+reserva)\s*\(([^)]+)\)/i);
    if (parenMatch && parenMatch[1]?.trim() && parenMatch[1].trim().toLowerCase() !== 'cancha') {
      return parenMatch[1].trim();
    }

    // Buscar "Cancha X" o "Cancha <Nombre>"
    const canchaMatch = text.match(/Cancha\s+[A-Za-z0-9]+/i);
    if (canchaMatch) {
      return canchaMatch[0];
    }

    // Buscar "El <Nombre>" como "El Maracaná", "El Monumental", "El Cilindro"
    const elMatch = text.match(/El\s+[A-Za-z0-9áéíóúÁÉÍÓÚñÑ]+/i);
    if (elMatch) {
      return elMatch[0];
    }

    // Buscar nombres de canchas registradas en courts dentro del texto
    for (const c of courts) {
      if (c.name && c.name.toLowerCase() !== 'cancha' && text.toLowerCase().includes(c.name.toLowerCase())) {
        return c.name;
      }
    }
  }

  // Si la reserva vinculada tenía algún nombre aunque fuera genérico
  if (linkedBooking?.courtName) return linkedBooking.courtName;
  if (linkedBooking?.court_name) return linkedBooking.court_name;

  // 4. Fallback final
  return 'Cancha';
}

function cleanFinanceText(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();

  // 1. Quitar métodos de pago entre paréntesis: (cash), (Efectivo), (Transferencia), etc.
  text = text.replace(/\s*\((?:cash|efectivo|transferencia|tarjeta|débito|debito|crédito|credito|mercadopago|mp|fiado|cuenta corriente|otro)\)/gi, '');

  // 2. Quitar métodos de pago al inicio con guión, dos puntos o punto medio: "Efectivo - Luz" -> "Luz"
  text = text.replace(/^(?:cash|efectivo|transferencia|tarjeta|débito|debito|crédito|credito|mercadopago|mp)\s*[-–—·:]\s*/gi, '');

  // 3. Quitar métodos de pago al final con guión, dos puntos o punto medio: "Luz - Efectivo" -> "Luz"
  text = text.replace(/\s*[-–—·:]\s*(?:cash|efectivo|transferencia|tarjeta|débito|debito|crédito|credito|mercadopago|mp)$/gi, '');

  // 4. Quitar prefijos repetitivos de pagos/compras
  text = text.replace(/^(?:pago\s+de\s+gasto|pago\s+gasto|pago\s+de\s+compra\s+de\s+mercader[ií]a|pago\s+compra\s+de\s+mercader[ií]a|pago\s+compra\s+mercader[ií]a|pago\s+compra|compra\s+de\s+mercader[ií]a|compra\s+mercader[ií]a)\s*[-–—·:]*\s*/gi, '');

  // 5. Quitar etiquetas redundantes tipo "(Rubro - Concepto · Rubro)"
  text = text.replace(/\s*\(Rubro\s*-\s*Concepto\s*·\s*Rubro\)/gi, '');

  // 6. Limpiar signos de puntuación sueltos en bordes
  text = text.replace(/^[\s·\-–—:,]+|[\s·\-–—:,]+$/g, '').trim();

  return text;
}

function isGenericExpenseCategory(cat?: string): boolean {
  if (!cat || typeof cat !== 'string') return true;
  const lower = cat.trim().toLowerCase();
  return (
    lower === '' ||
    lower === 'gasto' ||
    lower === 'gastos' ||
    lower === 'pago gasto' ||
    lower === 'pago gastos' ||
    lower === 'pago de gasto' ||
    lower === 'pago de gastos' ||
    lower === 'expense_payment' ||
    lower === 'expense' ||
    lower === 'expenses' ||
    lower === 'egreso' ||
    lower === 'egresos' ||
    lower === 'gasto operativo' ||
    lower === 'gastos operativos'
  );
}

interface FinanceRowDisplay {
  kind: 'booking' | 'pos' | 'expense' | 'purchase';
  title: string;
  subtitle: string;
}

function resolveFinanceRowDisplay(
  rawItem: any,
  linkedOp?: any,
  linkedBooking?: any,
  courts: Court[] = [],
  users: any[] = []
): FinanceRowDisplay {
  const opType = rawItem?.originalDoc?.operationType || linkedOp?.operationType || rawItem?.operationType;
  const rawId = String(rawItem?.id || '');
  const opId = String(rawItem?.operationId || linkedOp?.id || '');
  const hasBookingId = Boolean(rawItem?.bookingId || (rawItem as any)?.booking_id || linkedOp?.bookingId || linkedBooking);
  const textCategory = String(rawItem?.category || rawItem?.originalDoc?.metadata?.category || linkedOp?.metadata?.category || '').toLowerCase();
  const textConcept = String(rawItem?.concept || rawItem?.notes || linkedOp?.notes || linkedOp?.concept || '').toLowerCase();

  const isReserva = (
    opType === 'court_booking' ||
    opType === 'booking' ||
    hasBookingId ||
    rawId.endsWith('-booking') ||
    opId.endsWith('-booking') ||
    textCategory.includes('alquiler cancha') ||
    textCategory.includes('seña alquiler') ||
    textCategory.includes('liquidación alquiler') ||
    textCategory.includes('reserva') ||
    (textConcept.includes('alquiler') && !rawItem?.isExpense && rawItem?.flow !== 'expense')
  );

  // 1. Reserva (booking)
  if (isReserva) {
    const courtName = resolveFinanceCourtName(rawItem, linkedBooking, linkedOp, courts);
    const title = `Reserva (${courtName})`;

    const rawClient =
      linkedBooking?.clientName ||
      linkedBooking?.client_name ||
      linkedBooking?.userName ||
      linkedBooking?.name ||
      linkedBooking?.responsibleName ||
      linkedOp?.clientName ||
      linkedOp?.customerName ||
      rawItem?.clientName ||
      rawItem?.responsibleName ||
      rawItem?.userName;

    let subtitle = 'NN';
    if (rawClient && typeof rawClient === 'string') {
      const trimmed = rawClient.trim();
      const lower = trimmed.toLowerCase();
      if (lower !== '' && lower !== 'nn' && lower !== 'cliente mostrador') {
        subtitle = trimmed;
      }
    }

    return {
      kind: 'booking',
      title,
      subtitle
    };
  }

  // 2. Compra de mercadería (purchase)
  const isPurchase = (
    opType === 'purchase' ||
    textCategory.includes('compra') ||
    textCategory.includes('mercader') ||
    textConcept.includes('compra') ||
    textConcept.includes('mercader')
  );

  if (isPurchase) {
    const title = 'Compra de mercadería';

    // Subtítulo: Nombre de la Entidad / Lugar de compra seleccionado en la tarjeta de compra
    const entityCandidates = [
      linkedOp?.entityName,
      rawItem?.entityName,
      rawItem?.originalDoc?.entityName,
      linkedOp?.supplierName,
      rawItem?.supplierName,
      rawItem?.originalDoc?.supplierName,
      linkedOp?.metadata?.purchasePlace,
      rawItem?.originalDoc?.metadata?.purchasePlace,
      linkedOp?.supplier,
      rawItem?.supplier
    ];

    let entityName = '';
    for (const cand of entityCandidates) {
      if (cand && typeof cand === 'string' && cand.trim()) {
        const trimmed = cand.trim();
        const lower = trimmed.toLowerCase();
        if (
          lower !== '' &&
          lower !== 'nn' &&
          lower !== 'cliente mostrador' &&
          lower !== 'compra de mercadería' &&
          lower !== 'compra'
        ) {
          entityName = trimmed;
          break;
        }
      }
    }

    let subtitle = '';
    if (entityName) {
      subtitle = entityName;
    } else {
      // Si no se cargó ninguna entidad, mostrar la Categoría del producto comprado
      const catCandidate =
        linkedOp?.metadata?.category ||
        rawItem?.originalDoc?.metadata?.category ||
        linkedOp?.category ||
        rawItem?.category;

      if (catCandidate && typeof catCandidate === 'string' && catCandidate.trim()) {
        const cleaned = cleanFinanceText(catCandidate);
        if (cleaned && cleaned.toLowerCase() !== 'compra de mercadería' && cleaned.toLowerCase() !== 'compra') {
          subtitle = cleaned;
        }
      }

      if (!subtitle) {
        const items = linkedOp?.items || rawItem?.originalDoc?.items || rawItem?.items;
        if (Array.isArray(items) && items.length > 0 && items[0]?.name) {
          subtitle = items[0].name;
        } else {
          subtitle = 'Mercadería';
        }
      }
    }

    return {
      kind: 'purchase',
      title,
      subtitle
    };
  }

  // 3. Gasto (expense)
  const isExpense = (
    rawItem?.flow === 'expense' ||
    rawItem?.isExpense ||
    opType === 'expense' ||
    textCategory.includes('gasto') ||
    textCategory.includes('egreso') ||
    textConcept.includes('gasto')
  );

  if (isExpense) {
    // Título: Rubro del gasto (si no tiene rubro, "Gasto")
    const rubroCandidates = [
      linkedOp?.metadata?.rubro,
      linkedOp?.metadata?.category,
      rawItem?.originalDoc?.metadata?.rubro,
      rawItem?.originalDoc?.metadata?.category,
      linkedOp?.category,
      rawItem?.category
    ].filter(c => c && !isGenericExpenseCategory(c) && c !== 'expense_payment' && c !== 'Pago Gasto') as string[];

    let rubro = rubroCandidates[0] ? cleanFinanceText(rubroCandidates[0]) : '';
    if (!rubro || rubro.toLowerCase() === 'gasto operativo') {
      rubro = 'Gasto';
    }
    const title = rubro;

    // Subtítulo: Nombre de la Entidad seleccionada en la tarjeta del gasto. Si no se cargó ninguna entidad, mostrar la Categoría / Concepto del gasto.
    const entityCandidates = [
      linkedOp?.entityName,
      rawItem?.entityName,
      rawItem?.originalDoc?.entityName,
      linkedOp?.supplierName,
      rawItem?.supplierName,
      rawItem?.originalDoc?.supplierName,
      linkedOp?.responsibleName,
      rawItem?.responsibleName
    ];

    let entityName = '';
    for (const cand of entityCandidates) {
      if (cand && typeof cand === 'string' && cand.trim()) {
        const trimmed = cand.trim();
        const lower = trimmed.toLowerCase();
        if (
          lower !== '' &&
          lower !== 'nn' &&
          lower !== 'cliente mostrador' &&
          lower !== 'administrador' &&
          lower !== 'pos_operator' &&
          lower !== 'gasto operativo'
        ) {
          entityName = trimmed;
          break;
        }
      }
    }

    let subtitle = '';
    if (entityName) {
      subtitle = entityName;
    } else {
      const conceptCandidates = [
        linkedOp?.concept,
        rawItem?.concept,
        rawItem?.originalDoc?.concept,
        linkedOp?.notes,
        rawItem?.notes,
        rawItem?.originalDoc?.notes,
        rawItem?.description,
        linkedOp?.description
      ].filter(Boolean) as string[];

      for (const d of conceptCandidates) {
        const cleaned = cleanFinanceText(d);
        if (cleaned && cleaned.toLowerCase() !== 'gasto' && cleaned.toLowerCase() !== 'pago gasto') {
          subtitle = cleaned;
          break;
        }
      }
      if (!subtitle) {
        subtitle = 'Gasto General';
      }
    }

    return {
      kind: 'expense',
      title,
      subtitle
    };
  }

  // 4. Default: Mostrador (pos)
  const title = 'Mostrador';
  const rawClient =
    rawItem?.clientName ||
    linkedOp?.clientName ||
    rawItem?.responsibleName ||
    rawItem?.customerName ||
    rawItem?.userName;

  let subtitle = 'NN';
  if (rawClient && typeof rawClient === 'string') {
    const trimmed = rawClient.trim();
    const lower = trimmed.toLowerCase();
    if (lower !== '' && lower !== 'nn' && lower !== 'cliente mostrador') {
      subtitle = trimmed;
    }
  }

  return {
    kind: 'pos',
    title,
    subtitle
  };
}

function extractCourtName(concept?: string, notes?: string, category?: string, bookingId?: string | number, bookingsMap?: Map<string, any>): string {
  const linkedBooking = bookingId && bookingsMap ? bookingsMap.get(String(bookingId)) : undefined;
  return resolveFinanceCourtName({ concept, notes, category }, linkedBooking);
}

function formatTimelineGroupDate(d: Date): { key: string; label: string } {
  const now = new Date();
  if (isSameDay(d, now)) {
    return { key: 'hoy', label: 'Hoy' };
  }
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  if (isSameDay(d, yesterday)) {
    return { key: 'ayer', label: 'Ayer' };
  }
  const dayNum = d.getDate();
  const rawMonth = format(d, 'MMMM', { locale: es });
  const capitalizedMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  return { key: format(d, 'yyyy-MM-dd'), label: `${dayNum} ${capitalizedMonth}` };
}

function formatPaymentMethodName(method?: string): string {
  if (!method) return 'Efectivo';
  const m = method.toLowerCase().trim();
  if (m === 'cash' || m.includes('efectivo')) return 'Efectivo';
  if (m === 'transfer' || m.includes('transferencia') || m.includes('transf')) return 'Transferencia';
  if (m === 'credit' || m.includes('tarjeta') || m.includes('crédito') || m.includes('credito') || m.includes('debito') || m.includes('débito')) return 'Tarjeta';
  if (m === 'fiado' || m.includes('pendiente') || m === 'pending') return 'Pendiente';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

const FinanceView = ({ 
  complexId = 'complejo_central',
  bookings: parentBookings,
  courts: parentCourts,
  onNavigateToUserProfile,
  financePeriod = 'today',
  onPeriodChange,
  users: parentUsers
}: { 
  complexId?: string;
  bookings?: any[];
  courts?: Court[];
  onNavigateToUserProfile?: (userId: string) => void;
  financePeriod?: FinancePeriod;
  onPeriodChange?: (period: FinancePeriod) => void;
  users?: any[];
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const targetIds = useMemo(() => {
    return (targetId === 'B' || targetId === 'complejo_central') ? ['B', 'complejo_central'] : [targetId];
  }, [targetId]);
  
  const [activeSection, setActiveSection] = useState<'movements' | 'operations'>('movements');

  // Datasets
  const [operations, setOperations] = useState<OperationDocument[]>([]);
  const [financialMovements, setFinancialMovements] = useState<FinancialMovementDocument[]>([]);
  const [legacyTransactions, setLegacyTransactions] = useState<any[]>([]);
  const [rawBookings, setRawBookings] = useState<any[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [venueProfile, setVenueProfile] = useState<any>(null);

  // Filters & Search
  const [movementFilter, setMovementFilter] = useState<'all' | 'reservas' | 'mostrador' | 'income' | 'expense'>('all');
  const [operationFilter, setOperationFilter] = useState<'all' | 'pending' | 'mostrador' | 'reservas' | 'income' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Navigation
  const [isPOSModalOpen, setIsPOSModalOpen] = useState(false);
  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
  const [ticketModalOperation, setTicketModalOperation] = useState<OperationDocument | null>(null);
  const [ticketModalMovements, setTicketModalMovements] = useState<FinancialMovementDocument[]>([]);
  const [settleModalTarget, setSettleModalTarget] = useState<any | null>(null);

  // Manual transaction state
  const [newTx, setNewTx] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '',
    category: 'Alquiler de Cancha',
    paymentMethod: 'Transferencia',
    description: ''
  });
  const [customCategory, setCustomCategory] = useState('');

  // Expense categories and items from Editar mostrador
  const [expenseCategories, setExpenseCategories] = useState<ProductCategory[]>([]);
  const [expenseItems, setExpenseItems] = useState<Product[]>([]);
  const [selectedExpenseItemName, setSelectedExpenseItemName] = useState<string>('');

  // Estado para Modal de Confirmación de Eliminación Definitiva y Toast
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'movement' | 'operation' | 'pending';
    id: string;
    movementId?: string | null;
    operationId?: string | null;
    bookingId?: string | null;
    title: string;
    client: string;
    amount: number;
    isIncome: boolean;
  } | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteToast) return;
    const timer = setTimeout(() => {
      setDeleteToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [deleteToast]);

  const handleConfirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingTarget(true);
    const targetOpId = deleteTarget.operationId || (deleteTarget.type === 'operation' || deleteTarget.type === 'pending' ? deleteTarget.id : null);
    const targetMovId = deleteTarget.movementId || (deleteTarget.type === 'movement' ? deleteTarget.id : null);
    const targetBId = deleteTarget.bookingId || (targetOpId && targetOpId.endsWith('-booking') ? targetOpId.replace('-booking', '') : null);

    try {
      await permanentlyDeleteFinancialRecordInFirestore({
        complexId: targetId,
        operationId: deleteTarget.operationId,
        movementId: deleteTarget.movementId,
        bookingId: deleteTarget.bookingId
      });
      const deletedTitle = deleteTarget.title;

      // Limpieza inmediata en estados locales para feedback visual instantáneo (latencia cero)
      if (targetOpId) {
        setOperations(prev => prev.filter(o => o.id !== targetOpId && (!targetBId || o.bookingId !== targetBId)));
      }
      if (targetMovId || targetOpId || targetBId) {
        setFinancialMovements(prev => prev.filter(m => 
          (!targetMovId || m.id !== targetMovId) &&
          (!targetOpId || (m.operationId !== targetOpId && (!targetBId || m.operationId !== `${targetBId}-booking`))) &&
          (!targetBId || m.bookingId !== targetBId)
        ));
      }
      if (targetBId) {
        setRawBookings(prev => prev.filter(b => String(b.id) !== String(targetBId)));
      }
      if (targetOpId || targetBId) {
        setLegacyTransactions(prev => prev.filter(t => 
          (!targetOpId || (t.id !== targetOpId && t.operationId !== targetOpId)) &&
          (!targetBId || t.bookingId !== targetBId)
        ));
      }

      setDeleteTarget(null);
      if (ticketModalOperation && (ticketModalOperation.id === deleteTarget.operationId || ticketModalOperation.id === deleteTarget.id)) {
        setTicketModalOperation(null);
      }
      setDeleteToast(`Se ha eliminado ${deletedTitle} completamente del sistema.`);
    } catch (err) {
      console.error('Error eliminando registro definitivamente:', err);
    } finally {
      setIsDeletingTarget(false);
    }
  };

  // 1. Subscriptions to real collections
  useEffect(() => {
    if (!targetId) return;

    const unsubOps = subscribeToOperations(targetId, (opList) => {
      setOperations(Array.isArray(opList) ? opList : []);
    });

    const unsubMovs = subscribeToFinancialMovements(targetId, (movList) => {
      setFinancialMovements(Array.isArray(movList) ? movList : []);
    });

    const unsubTxs = subscribeToTransactions(targetId, (txList) => {
      setLegacyTransactions(Array.isArray(txList) ? txList : []);
    });

    const unsubBookings = subscribeToBookings(targetId, (bList) => {
      setRawBookings(Array.isArray(bList) ? bList : []);
    });

    const unsubCourts = subscribeToCourts(targetId, (courtList) => {
      setCourts(Array.isArray(courtList) ? courtList : []);
    });

    const unsubClients = subscribeToClients(targetId, (cList) => {
      setUsers(Array.isArray(cList) ? cList : []);
    });

    const unsubVenue = subscribeToVenueProfile(targetId, (prof) => {
      setVenueProfile(prof);
    });

    const unsubExpCats = subscribeToExpenseCategories(targetId, (cats) => {
      setExpenseCategories(cats);
    });

    const unsubExpItems = subscribeToExpenseItems(targetId, (items) => {
      setExpenseItems(items);
    });

    return () => {
      unsubOps();
      unsubMovs();
      unsubTxs();
      unsubBookings();
      unsubCourts();
      unsubClients();
      unsubVenue();
      unsubExpCats();
      unsubExpItems();
    };
  }, [targetId]);

  const effectiveCourts = useMemo(() => {
    if (Array.isArray(parentCourts) && parentCourts.length > 0) return parentCourts;
    return courts;
  }, [parentCourts, courts]);

  // Combinación unificada de reservas
  const effectiveBookings = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(parentBookings)) {
      parentBookings.forEach(b => {
        if (b && b.id) map.set(String(b.id), b);
      });
    }
    rawBookings.forEach(b => {
      if (b && b.id) map.set(String(b.id), b);
    });
    return Array.from(map.values());
  }, [parentBookings, rawBookings]);

  // Map lookups para resolución rápida e íntegra de entidades cruzadas
  const operationsMap = useMemo(() => {
    const map = new Map<string, OperationDocument>();
    operations.forEach(op => {
      if (op.id) map.set(String(op.id), op);
      if (op.ticketCode) map.set(String(op.ticketCode), op);
      if (op.bookingId) {
        map.set(String(op.bookingId), op);
        map.set(`${op.bookingId}-booking`, op);
      }
      if (op.legacySaleId) map.set(String(op.legacySaleId), op);
    });
    return map;
  }, [operations]);

  const bookingsMap = useMemo(() => {
    const map = new Map<string, any>();
    effectiveBookings.forEach(b => {
      if (b.id) {
        map.set(String(b.id), b);
        map.set(`${b.id}-booking`, b);
      }
    });
    return map;
  }, [effectiveBookings]);

  // Handle opening ticket from an operation or movement
  const handleOpenTicket = (op: OperationDocument) => {
    const associatedMovements = financialMovements.filter(m => 
      m.operationId === op.id || 
      (op.bookingId && (m.bookingId === op.bookingId || m.operationId === `${op.bookingId}-booking`)) ||
      (op.id.endsWith('-booking') && (m.bookingId === op.id.replace('-booking', '') || m.operationId === op.id))
    );
    setTicketModalMovements(associatedMovements);
    setTicketModalOperation(op);
  };

  // 1. SECCIÓN MOVIMIENTOS: Libro diario de dinero real
  const combinedMovements = useMemo(() => {
    const list: Array<{
      id: string;
      date: Date;
      flow: 'income' | 'expense';
      category: string;
      amount: number;
      paymentMethod: string;
      responsibleName: string;
      operationId?: string | null;
      bookingId?: string | null;
      ticketCode?: string;
      notes?: string;
      isLegacy?: boolean;
      originalDoc?: any;
    }> = [];

    const processedMovOperationIds = new Set<string>();

    // 1.1 Movimientos reales de /financial_movements filtrados estrictamente por el complejo activo
    // Agrupación visual por acto de pago (mismo operationId, mismo flow, diferencia temporal < 30s o mismo idempotencyKey base)
    const filteredMovs = financialMovements.filter(m => {
      const c = m.complexId || m.complejoId;
      return !c || targetIds.includes(c);
    });

    const parsedMovs = filteredMovs.map(m => {
      const d = m.effectiveDate?.toDate 
        ? m.effectiveDate.toDate() 
        : (m.createdAt?.toDate ? m.createdAt.toDate() : (m.createdAt ? new Date(m.createdAt) : new Date()));
      return { ...m, _parsedDate: d };
    });

    const movGroups: Array<{
      items: typeof parsedMovs;
      operationId: string | null;
      flow: 'income' | 'expense';
      date: Date;
    }> = [];

    parsedMovs.forEach(m => {
      const mOpId = m.operationId ? String(m.operationId) : null;
      const mBaseIdem = m.idempotencyKey ? String(m.idempotencyKey).replace(/_pay_\d+$/, '') : null;
      const mTime = m._parsedDate.getTime();

      let matchedGroup = movGroups.find(g => {
        if (g.flow !== m.flow) return false;
        if (mOpId && g.operationId && mOpId === g.operationId) {
          const timeDiff = Math.abs(g.date.getTime() - mTime);
          if (timeDiff < 30000) return true;
          if (mBaseIdem && g.items.some(item => item.idempotencyKey && String(item.idempotencyKey).replace(/_pay_\d+$/, '') === mBaseIdem)) {
            return true;
          }
        } else if (mBaseIdem && g.items.some(item => item.idempotencyKey && String(item.idempotencyKey).replace(/_pay_\d+$/, '') === mBaseIdem)) {
          return true;
        }
        return false;
      });

      if (matchedGroup) {
        matchedGroup.items.push(m);
      } else {
        movGroups.push({
          items: [m],
          operationId: mOpId,
          flow: m.flow,
          date: m._parsedDate
        });
      }
    });

    movGroups.forEach(g => {
      const firstM = g.items[0];
      if (firstM.operationId) processedMovOperationIds.add(firstM.operationId);
      if (firstM.ticketCode) processedMovOperationIds.add(firstM.ticketCode);

      const totalAmount = g.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const rawMethods = g.items.map(item => formatPaymentMethodName(item.paymentMethod));
      const uniqueMethods = Array.from(new Set(rawMethods));
      const combinedPaymentMethod = uniqueMethods.join(' + ') || 'Efectivo';

      const linkedDoc = (firstM.operationId ? operationsMap.get(firstM.operationId) : null) ||
                        ((firstM as any).bookingId ? bookingsMap.get((firstM as any).bookingId) : null) ||
                        (firstM.operationId ? bookingsMap.get(firstM.operationId) : null);
      const resolvedName = resolveClientName(firstM, users, linkedDoc);

      list.push({
        id: firstM.id,
        date: g.date,
        flow: firstM.flow,
        category: firstM.category === 'sale_collection' ? 'Cobro Venta Mostrador' :
                  firstM.category === 'booking_deposit' ? 'Seña Alquiler Cancha' :
                  firstM.category === 'booking_settlement' ? 'Liquidación Alquiler Cancha' :
                  firstM.category === 'historical_debt_payment' ? 'Abono Deuda Histórica' :
                  firstM.category === 'refund' ? 'Reintegro / Devolución' :
                  firstM.category === 'expense_payment' ? 'Pago Gasto' : firstM.category,
        amount: totalAmount,
        paymentMethod: combinedPaymentMethod,
        responsibleName: resolvedName,
        operationId: firstM.operationId,
        bookingId: (firstM as any).bookingId,
        ticketCode: firstM.ticketCode,
        notes: firstM.notes,
        originalDoc: firstM
      });
    });

    // 1.2 Movimientos de cobro real provenientes de /operations que no tengan movimiento financiero duplicado
    operations.forEach(op => {
      const c = op.complexId || op.complejoId;
      if (c && !targetIds.includes(c)) return;

      const collected = Number(op.totalCollected ?? (op as any).amount_paid ?? (op as any).collected ?? (op as any).paid ?? 0);
      if (collected <= 0) return;
      if (processedMovOperationIds.has(op.id) || (op.ticketCode && processedMovOperationIds.has(op.ticketCode))) {
        return;
      }
      processedMovOperationIds.add(op.id);
      if (op.ticketCode) processedMovOperationIds.add(op.ticketCode);

      const isExp = Boolean((op as any).isExpense || op.operationType === 'expense' || op.operationType === 'purchase' || op.metadata?.isExpense);
      const d = op.createdAt?.toDate ? op.createdAt.toDate() : (op.createdAt ? new Date(op.createdAt) : new Date());
      const linkedDoc = (op.bookingId ? bookingsMap.get(String(op.bookingId)) : null) || bookingsMap.get(op.id.replace('-booking', ''));
      const resolvedName = resolveClientName(op, users, linkedDoc);

      list.push({
        id: `${op.id}_mov_auto`,
        date: d,
        flow: isExp ? 'expense' : 'income',
        category: isExp ? 'Pago Gasto' : (op.operationType === 'court_booking' || op.operationType === 'booking' ? 'Cobro Alquiler Cancha' : 'Cobro Venta Mostrador'),
        amount: collected,
        paymentMethod: (op as any).paymentMethod || 'Efectivo',
        responsibleName: resolvedName,
        operationId: op.id,
        ticketCode: op.ticketCode || op.id.slice(0, 8).toUpperCase(),
        notes: op.notes || 'Cobro registrado'
      });
    });

    // 1.3 Movimientos históricos de /transactions que no tengan movimiento financiero duplicado
    const modernOpIds = new Set(operations.map(o => o.id));
    const modernLegacyIds = new Set(operations.filter(o => o.legacySaleId).map(o => o.legacySaleId));

    legacyTransactions.forEach(t => {
      const c = t.complexId || t.complejoId;
      if (c && !targetIds.includes(c)) return;

      if (t.id && (modernOpIds.has(t.id) || modernLegacyIds.has(t.id) || processedMovOperationIds.has(t.id))) {
        return;
      }
      if (t.id && financialMovements.some(m => m.id === t.id || m.operationId === t.id)) {
        return;
      }

      const d = t.createdAt?.toDate ? t.createdAt.toDate() : (t.date ? safeParseDate(t.date) || new Date() : new Date());
      const isVenta = t.type === 'venta' || t.type === 'income';
      const isGasto = t.type === 'expense' || t.type === 'gasto' || t.type === 'egreso' || t.type === 'purchase' || t.type === 'compra';
      const flow: 'income' | 'expense' = isGasto ? 'expense' : 'income';
      const resolvedName = resolveClientName(t, users);

      if (Array.isArray(t.payments) && t.payments.length > 0) {
        t.payments.forEach((p: any, pIdx: number) => {
          const pAmt = Number(p.amount || 0);
          if (pAmt > 0 && p.method !== 'fiado' && p.method !== 'pending') {
            list.push({
              id: `${t.id}_pay_${pIdx}`,
              date: d,
              flow,
              category: t.category || (isVenta ? 'Venta Mostrador' : 'Gasto'),
              amount: pAmt,
              paymentMethod: p.method || 'Efectivo',
              responsibleName: resolvedName,
              operationId: t.id,
              ticketCode: t.ticketCode || t.id?.slice(0, 8),
              notes: t.description,
              isLegacy: true
            });
          }
        });
      } else {
        const tot = Number(t.total ?? t.amount ?? 0);
        let collected = tot;
        if (t.paymentStatus === 'fiado' || t.paymentStatus === 'partial' || t.paymentStatus === 'pending' || t.paymentStatus === 'unpaid') {
          const fiadoAmt = Number(t.pendingAmount ?? t.debtAmount ?? (t.paymentStatus === 'unpaid' ? tot : 0));
          collected = Math.max(0, tot - fiadoAmt);
        }
        if (collected > 0) {
          list.push({
            id: t.id,
            date: d,
            flow,
            category: t.category || (isVenta ? 'Venta Mostrador' : 'Gasto'),
            amount: collected,
            paymentMethod: t.paymentMethod || 'Efectivo',
            responsibleName: resolvedName,
            operationId: t.id,
            ticketCode: t.ticketCode || t.id?.slice(0, 8),
            notes: t.description,
            isLegacy: true
          });
        }
      }
    });

    // 1.4 Cobros reales de reservas en /bookings
    const seenBookingMovs = new Set([
      ...financialMovements
        .filter(m => m.bookingId || m.operationId?.endsWith('-booking'))
        .map(m => String(m.bookingId || m.operationId?.replace('-booking', ''))),
      ...operations
        .filter(o => o.bookingId || o.id.endsWith('-booking'))
        .map(o => String(o.bookingId || o.id.replace('-booking', '')))
    ]);

    effectiveBookings.forEach(b => {
      if (!b) return;
      const c = b.complexId || b.complejoId;
      if (c && !targetIds.includes(c)) return;

      const bStatus = String(b.status || '').toLowerCase();
      if (bStatus === 'cancelado' || bStatus === 'cancelled') return;
      if (seenBookingMovs.has(String(b.id))) return;

      const tot = Number(b.price || b.price_total || 0);
      const isPaid = b.payment_status === 'paid' || b.paymentStatus === 'paid' || b.payment_status === 'pagado';
      const rawPaid = Number(b.amount_paid ?? b.deposit ?? 0);
      const effectivePaid = isPaid ? (rawPaid > 0 ? Math.max(rawPaid, tot) : tot) : rawPaid;

      if (effectivePaid > 0) {
        const d = b.date ? safeParseDate(b.date) || new Date() : (b.start_time ? safeParseDate(b.start_time) || new Date() : new Date());
        const resolvedName = resolveClientName(b, users);
        list.push({
          id: `${b.id}_deposit_legacy`,
          date: d,
          flow: 'income',
          category: effectivePaid >= tot && tot > 0 ? 'Liquidación Alquiler Cancha' : 'Seña Alquiler Cancha',
          amount: effectivePaid,
          paymentMethod: 'Efectivo',
          responsibleName: resolvedName,
          operationId: `${b.id}-booking`,
          ticketCode: `B-${String(b.id).slice(0, 6).toUpperCase()}`,
          notes: `Cobro reserva ${b.courtName || b.court_name || 'Cancha'}`,
          isLegacy: true
        });
      }
    });

    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [financialMovements, operations, legacyTransactions, effectiveBookings, users, operationsMap, bookingsMap, targetIds]);

  // 2. SECCIÓN OPERACIONES: Vista comercial unificada
  const combinedOperations = useMemo(() => {
    const list: Array<{
      id: string;
      ticketCode: string;
      date: Date;
      concept: string;
      clientName: string;
      contractualAmount: number;
      totalCollected: number;
      amountPending: number;
      paymentStatus: string;
      isExpense?: boolean;
      originalDoc?: OperationDocument;
      isLegacy?: boolean;
    }> = [];

    const processedOpIds = new Set<string>();
    const processedLegacyIds = new Set<string>();

    operations.forEach(op => {
      const c = op.complexId || op.complejoId;
      if (c && !targetIds.includes(c)) return;

      processedOpIds.add(op.id);
      if (op.legacySaleId) processedLegacyIds.add(op.legacySaleId);

      const d = op.createdAt?.toDate 
        ? op.createdAt.toDate() 
        : (op.createdAt ? new Date(op.createdAt) : new Date());

      let concept = 'Venta Mostrador';
      if (op.operationType === 'court_booking' || op.operationType === 'booking') concept = op.notes || 'Alquiler de Cancha';
      else if (op.operationType === 'expense') concept = op.notes || 'Gasto Operativo';
      else if (op.operationType === 'purchase') concept = op.notes || 'Compra de Mercadería';
      else if (op.operationType === 'historical_debt_settlement') concept = 'Abono Deuda Histórica';
      else if (Array.isArray(op.items) && op.items.length > 0) {
        concept = op.items.map(it => `${it.quantity}x ${it.name}`).join(', ');
      }

      const linkedDoc = (op.bookingId ? bookingsMap.get(String(op.bookingId)) : null) ||
                        bookingsMap.get(op.id.replace('-booking', ''));
      const resolvedName = resolveClientName(op, users, linkedDoc);
      const isExp = Boolean((op as any).isExpense || op.operationType === 'expense' || op.operationType === 'purchase' || op.metadata?.isExpense);

      const contractual = Number(op.contractualAmount ?? (op as any).total ?? (op as any).amount ?? (op as any).price ?? 0);
      const collected = Number(op.totalCollected ?? (op as any).amount_paid ?? (op as any).collected ?? (op as any).paid ?? 0);
      const pending = Number(op.amountPending ?? (op as any).pending ?? (op as any).debt ?? Math.max(0, contractual - collected));

      list.push({
        id: op.id,
        ticketCode: op.ticketCode || op.id.slice(0, 8).toUpperCase(),
        date: d,
        concept,
        clientName: resolvedName,
        contractualAmount: contractual,
        totalCollected: collected,
        amountPending: pending,
        paymentStatus: op.paymentStatus,
        isExpense: isExp,
        originalDoc: {
          ...op,
          contractualAmount: contractual,
          totalCollected: collected,
          amountPending: pending,
          userName: resolvedName,
          clientName: resolvedName
        }
      });
    });

    legacyTransactions.forEach(t => {
      const c = t.complexId || t.complejoId;
      if (c && !targetIds.includes(c)) return;

      if (processedOpIds.has(t.id) || processedLegacyIds.has(t.id)) return;

      const d = t.createdAt?.toDate ? t.createdAt.toDate() : (t.date ? safeParseDate(t.date) || new Date() : new Date());
      const isGasto = t.type === 'expense' || t.type === 'gasto' || t.type === 'egreso' || t.type === 'purchase' || t.type === 'compra';
      const tot = Number(t.total ?? t.amount ?? 0);
      
      let collected = tot;
      let pending = 0;
      let status = 'paid';

      if (t.paymentStatus === 'fiado' || t.paymentStatus === 'partial' || t.paymentStatus === 'pending' || t.paymentStatus === 'unpaid') {
        const fiadoAmt = Array.isArray(t.payments)
          ? t.payments.filter((p: any) => p.method === 'fiado' || p.method === 'pending').reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
          : Number(t.pendingAmount ?? t.debtAmount ?? (t.paymentStatus === 'unpaid' ? tot : 0));
        pending = fiadoAmt;
        collected = Math.max(0, tot - pending);
        status = collected >= tot && tot > 0 ? 'paid' : (collected > 0 ? 'partial' : 'unpaid');
      }

      let concept = t.category || (isGasto ? 'Gasto' : 'Venta Mostrador');
      if (Array.isArray(t.items) && t.items.length > 0) {
        concept = t.items.map((it: any) => `${it.quantity}x ${it.name}`).join(', ');
      }

      const resolvedName = resolveClientName(t, users);
      const resolvedPhone = resolveClientPhone(t, users);

      const virtualOp: OperationDocument = {
        id: t.id,
        complexId: targetId,
        ticketCode: t.ticketCode || t.id.slice(0, 8).toUpperCase(),
        operationType: isGasto ? 'expense' : 'pos_sale',
        responsibleType: t.userId ? 'user' : 'anonymous',
        userId: t.userId || null,
        clientId: t.userId || null,
        userName: resolvedName,
        clientName: resolvedName,
        userPhone: resolvedPhone,
        clientPhone: resolvedPhone,
        contractualAmount: tot,
        totalCollected: collected,
        totalRefunded: 0,
        netCollected: collected,
        retainedAmount: 0,
        amountPending: pending,
        paymentStatus: status as any,
        currentAccountAssigned: pending > 0,
        currentAccountDebtAmount: pending,
        items: Array.isArray(t.items) ? t.items : undefined,
        notes: t.description || '',
        createdAt: d,
        updatedAt: d,
        createdBy: 'histórico'
      };

      list.push({
        id: t.id,
        ticketCode: virtualOp.ticketCode,
        date: d,
        concept,
        clientName: resolvedName,
        contractualAmount: tot,
        totalCollected: collected,
        amountPending: pending,
        paymentStatus: status,
        isExpense: isGasto,
        originalDoc: virtualOp,
        isLegacy: true
      });
    });

    const existingBookingIds = new Set(
      operations
        .filter(o => o.bookingId || o.id.endsWith('-booking'))
        .map(o => String(o.bookingId || o.id.replace('-booking', '')))
    );

    effectiveBookings.forEach(b => {
      if (!b) return;
      const c = b.complexId || b.complejoId;
      if (c && !targetIds.includes(c)) return;

      if (existingBookingIds.has(String(b.id))) return;
      const bStatus = String(b.status || '').toLowerCase();
      if (bStatus === 'cancelado' || bStatus === 'cancelled') return;

      const d = b.date ? safeParseDate(b.date) || new Date() : (b.start_time ? safeParseDate(b.start_time) || new Date() : new Date());
      const tot = Number(b.price || b.price_total || 0);
      const isPaid = b.payment_status === 'paid' || b.paymentStatus === 'paid' || b.payment_status === 'pagado';
      const rawPaid = Number(b.amount_paid ?? b.deposit ?? 0);
      const paid = isPaid ? (rawPaid > 0 ? Math.max(rawPaid, tot) : tot) : rawPaid;
      const pending = Math.max(0, tot - paid);
      const status = paid >= tot && tot > 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');

      const resolvedName = resolveClientName(b, users);
      const resolvedPhone = resolveClientPhone(b, users);

      const virtualBookingOp: OperationDocument = {
        id: `${b.id}-booking`,
        complexId: targetId,
        ticketCode: `B-${String(b.id).slice(0, 6).toUpperCase()}`,
        operationType: 'court_booking',
        bookingId: b.id,
        responsibleType: b.userId ? 'user' : 'anonymous',
        userId: b.userId || null,
        clientId: b.userId || null,
        userName: resolvedName,
        clientName: resolvedName,
        userPhone: resolvedPhone,
        clientPhone: resolvedPhone,
        contractualAmount: tot,
        totalCollected: paid,
        totalRefunded: 0,
        netCollected: paid,
        retainedAmount: 0,
        amountPending: pending,
        paymentStatus: status as any,
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        notes: `Reserva Cancha: ${b.courtName || 'Cancha'}`,
        createdAt: d,
        updatedAt: d,
        createdBy: 'sistema'
      };

      list.push({
        id: `${b.id}-booking`,
        ticketCode: virtualBookingOp.ticketCode,
        date: d,
        concept: `Alquiler Cancha (${b.courtName || 'Cancha'})`,
        clientName: resolvedName,
        contractualAmount: tot,
        totalCollected: paid,
        amountPending: pending,
        paymentStatus: status,
        originalDoc: virtualBookingOp
      });
    });

    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [operations, legacyTransactions, effectiveBookings, targetId, users, bookingsMap, targetIds]);

  const handleOpenTicketFromMovement = (opId?: string | null) => {
    if (!opId) return;
    const foundInCombined = combinedOperations.find(o => o.id === opId)?.originalDoc;
    if (foundInCombined) {
      handleOpenTicket(foundInCombined);
      return;
    }
    const foundInDirect = operations.find(o => o.id === opId);
    if (foundInDirect) {
      handleOpenTicket(foundInDirect);
    }
  };

  // Handle manual transaction submission
  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = Number(newTx.amount);
    if (isNaN(amountVal) || amountVal <= 0) return;
    
    const isGasto = newTx.type === 'expense';
    const categoryToSave = newTx.category === 'Otro' && customCategory ? customCategory.trim() : newTx.category;
    const conceptToSave = selectedExpenseItemName ? selectedExpenseItemName : (newTx.description?.trim() || categoryToSave);
    const notesWithMethod = `${newTx.paymentMethod} - ${newTx.description || conceptToSave}`.trim();

    const paymentMethodMap: Record<string, FinancialPaymentMethod> = {
      'Efectivo': 'cash',
      'Transferencia': 'transfer',
      'Tarjeta': 'credit',
      'MercadoPago': 'mercado_pago'
    };
    const mappedPaymentMethod: FinancialPaymentMethod = paymentMethodMap[newTx.paymentMethod] || 'cash';

    try {
      const operationId = `manual_op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const movId = `manual_mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const ticketCode = `${isGasto ? 'E' : 'I'}-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;

      await addDoc(collection(db, 'operations'), {
        id: operationId,
        complexId: targetId,
        complejoId: targetId,
        ticketCode,
        operationType: isGasto ? 'expense' : 'pos_sale',
        responsibleType: isGasto ? 'supplier' : 'anonymous',
        userName: isGasto ? (conceptToSave || categoryToSave) : 'Cliente Mostrador',
        clientName: isGasto ? (conceptToSave || categoryToSave) : 'Cliente Mostrador',
        contractualAmount: amountVal,
        totalCollected: amountVal,
        totalRefunded: 0,
        netCollected: amountVal,
        retainedAmount: 0,
        amountPending: 0,
        paymentStatus: 'paid',
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        items: [{
          id: operationId,
          name: conceptToSave,
          quantity: 1,
          unitPrice: amountVal,
          subtotal: amountVal
        }],
        notes: notesWithMethod,
        metadata: {
          category: categoryToSave,
          isManual: true,
          isExpense: isGasto
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'administrador'
      });

      await addDoc(collection(db, 'financial_movements'), {
        id: movId,
        complexId: targetId,
        complejoId: targetId,
        operationId,
        ticketCode,
        idempotencyKey: `manual_${operationId}`,
        flow: isGasto ? 'expense' : 'income',
        category: isGasto ? 'expense_payment' : 'sale_collection',
        amount: amountVal,
        paymentMethod: mappedPaymentMethod,
        effectiveDate: serverTimestamp(),
        responsibleName: isGasto ? categoryToSave : 'Mostrador',
        userName: isGasto ? categoryToSave : 'Mostrador',
        clientName: isGasto ? categoryToSave : 'Cliente Mostrador',
        clearedCurrentAccountDebt: 0,
        notes: notesWithMethod,
        operatorId: 'administrador',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Error saving tx to Firestore:', err);
    }
    
    setIsManualTxModalOpen(false);
    setNewTx({ type: 'income', amount: '', category: 'Alquiler de Cancha', paymentMethod: 'Transferencia', description: '' });
    setCustomCategory('');
    setSelectedExpenseItemName('');
  };

  // -------------------------------------------------------------------------
  // Métricas Financieras del Período Seleccionado vs Período Anterior
  // -------------------------------------------------------------------------
  const { current: currentRange, previous: previousRange, compareLabel } = useMemo(() => {
    return getPeriodRange(financePeriod);
  }, [financePeriod]);

  const periodOperations = useMemo(() => {
    const inPeriod = combinedOperations.filter(op => {
      const t = op.date.getTime();
      return t >= currentRange.start.getTime() && t <= currentRange.end.getTime();
    });
    // Si en el período actual no hay operaciones pero sí hay registros en general y se trata de "Hoy",
    // calculamos las métricas con los datos del período (puede ser 0 si hoy no hubo movimientos)
    return inPeriod;
  }, [combinedOperations, currentRange]);

  const periodMovements = useMemo(() => {
    return combinedMovements.filter(m => {
      const t = m.date.getTime();
      return t >= currentRange.start.getTime() && t <= currentRange.end.getTime();
    });
  }, [combinedMovements, currentRange]);

  const previousOperations = useMemo(() => {
    return combinedOperations.filter(op => {
      const t = op.date.getTime();
      return t >= previousRange.start.getTime() && t <= previousRange.end.getTime();
    });
  }, [combinedOperations, previousRange]);

  const previousMovements = useMemo(() => {
    return combinedMovements.filter(m => {
      const t = m.date.getTime();
      return t >= previousRange.start.getTime() && t <= previousRange.end.getTime();
    });
  }, [combinedMovements, previousRange]);

  // Si no hay operaciones en el período seleccionado, pero existen operaciones totales en el complejo,
  // usamos las operaciones del período para que refleje fielmente el lapso elegido.
  const financialSummary = useMemo(() => {
    return computeComplexFinancialSummary({
      targetComplexIds: targetIds,
      operations: periodOperations.map(op => ({
        id: op.id,
        complexId: targetId,
        complejoId: targetId,
        contractualAmount: op.contractualAmount,
        totalCollected: op.totalCollected,
        amountPending: op.amountPending,
        paymentStatus: op.paymentStatus,
        isExpense: op.isExpense,
        operationType: op.originalDoc?.operationType,
        bookingId: op.originalDoc?.bookingId,
        retainedAmount: op.originalDoc?.retainedAmount,
        netCollected: op.originalDoc?.netCollected
      })),
      movements: periodMovements.map(m => ({
        id: m.id,
        complexId: targetId,
        complejoId: targetId,
        flow: m.flow,
        category: m.category,
        amount: m.amount,
        operationId: m.operationId
      }))
    });
  }, [periodOperations, periodMovements, targetIds, targetId]);

  const previousSummary = useMemo(() => {
    return computeComplexFinancialSummary({
      targetComplexIds: targetIds,
      operations: previousOperations.map(op => ({
        id: op.id,
        complexId: targetId,
        complejoId: targetId,
        contractualAmount: op.contractualAmount,
        totalCollected: op.totalCollected,
        amountPending: op.amountPending,
        paymentStatus: op.paymentStatus,
        isExpense: op.isExpense,
        operationType: op.originalDoc?.operationType,
        bookingId: op.originalDoc?.bookingId,
        retainedAmount: op.originalDoc?.retainedAmount,
        netCollected: op.originalDoc?.netCollected
      })),
      movements: previousMovements.map(m => ({
        id: m.id,
        complexId: targetId,
        complejoId: targetId,
        flow: m.flow,
        category: m.category,
        amount: m.amount,
        operationId: m.operationId
      }))
    });
  }, [previousOperations, previousMovements, targetIds, targetId]);

  const incomeTrend = useMemo(() => {
    return computeTrend(financialSummary.economicIncome, previousSummary.economicIncome);
  }, [financialSummary.economicIncome, previousSummary.economicIncome]);

  const cashTrend = useMemo(() => {
    return computeTrend(financialSummary.cashAvailable, previousSummary.cashAvailable);
  }, [financialSummary.cashAvailable, previousSummary.cashAvailable]);

  const porCobrarPct = financialSummary.economicIncome > 0
    ? Math.round((financialSummary.pendingToCollect / financialSummary.economicIncome) * 100)
    : (financialSummary.pendingToCollect > 0 ? 100 : 0);

  const porPagarPct = financialSummary.economicExpense > 0
    ? Math.round((financialSummary.pendingToPay / financialSummary.economicExpense) * 100)
    : (financialSummary.pendingToPay > 0 ? 100 : 0);

  // Cantidad de productos distintos vendidos en mostrador en el período
  const distinctProductsCount = useMemo(() => {
    const set = new Set<string>();
    periodOperations.forEach(op => {
      const isBooking = op.originalDoc?.operationType === 'court_booking' || op.originalDoc?.operationType === 'booking' || Boolean(op.originalDoc?.bookingId) || op.id.endsWith('-booking');
      if (op.isExpense || isBooking) return;
      if (Array.isArray(op.originalDoc?.items) && op.originalDoc.items.length > 0) {
        op.originalDoc.items.forEach(it => {
          if (it.name) set.add(it.name.trim().toLowerCase());
        });
      } else if (op.concept) {
        set.add(op.concept.trim().toLowerCase());
      }
    });
    return set.size;
  }, [periodOperations]);

  // Cantidad de reservas confirmadas en el período
  const periodBookingsCount = useMemo(() => {
    return periodOperations.filter(op => {
      return op.originalDoc?.operationType === 'court_booking' || op.originalDoc?.operationType === 'booking' || Boolean(op.originalDoc?.bookingId) || op.id.endsWith('-booking');
    }).length;
  }, [periodOperations]);

  // -------------------------------------------------------------------------
  // Filtros y Búsqueda de Tarjeta 2
  // -------------------------------------------------------------------------
  const filteredCombinedMovements = useMemo(() => {
    return combinedMovements.filter(m => {
      const isReserva = m.category.toLowerCase().includes('reserva') ||
                        m.category.toLowerCase().includes('cancha') ||
                        m.category.toLowerCase().includes('alquiler') ||
                        (m.operationId && m.operationId.endsWith('-booking'));
      const isExpense = m.flow === 'expense';
      const isMostrador = !isReserva && !isExpense;

      if (movementFilter === 'reservas' && !isReserva) return false;
      if (movementFilter === 'mostrador' && !isMostrador) return false;
      if (movementFilter === 'income' && m.flow !== 'income') return false;
      if (movementFilter === 'expense' && m.flow !== 'expense') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTicket = m.ticketCode?.toLowerCase().includes(q);
        const matchName = m.responsibleName?.toLowerCase().includes(q);
        const matchCat = m.category?.toLowerCase().includes(q);
        const matchNotes = m.notes?.toLowerCase().includes(q);
        const matchMethod = m.paymentMethod?.toLowerCase().includes(q);
        if (!matchTicket && !matchName && !matchCat && !matchNotes && !matchMethod) {
          return false;
        }
      }
      return true;
    });
  }, [combinedMovements, movementFilter, searchQuery]);

  const filteredCombinedOperations = useMemo(() => {
    return combinedOperations.filter(op => {
      const isReserva = op.originalDoc?.operationType === 'court_booking' ||
                        op.originalDoc?.operationType === 'booking' ||
                        Boolean(op.originalDoc?.bookingId) ||
                        op.id.endsWith('-booking') ||
                        op.concept.toLowerCase().includes('alquiler') ||
                        op.concept.toLowerCase().includes('cancha');
      const isExpense = Boolean(op.isExpense || op.originalDoc?.operationType === 'expense');
      const isMostrador = !isReserva && !isExpense;

      if (operationFilter === 'pending' && !(op.amountPending > 0)) return false;
      if (operationFilter === 'mostrador' && !isMostrador) return false;
      if (operationFilter === 'reservas' && !isReserva) return false;
      if (operationFilter === 'income' && isExpense) return false;
      if (operationFilter === 'expense' && !isExpense) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTicket = op.ticketCode?.toLowerCase().includes(q);
        const matchName = op.clientName?.toLowerCase().includes(q);
        const matchConcept = op.concept?.toLowerCase().includes(q);
        const matchPhone = op.originalDoc?.clientPhone?.toLowerCase().includes(q);
        const matchNotes = op.originalDoc?.notes?.toLowerCase().includes(q);
        if (!matchTicket && !matchName && !matchConcept && !matchPhone && !matchNotes) {
          return false;
        }
      }
      return true;
    });
  }, [combinedOperations, operationFilter, searchQuery]);

  // Agrupación cronológica por fecha para el timeline
  const groupedTimelineItems = useMemo(() => {
    const groups: { key: string; label: string; items: any[] }[] = [];
    const groupMap = new Map<string, { key: string; label: string; items: any[] }>();

    if (activeSection === 'movements') {
      filteredCombinedMovements.forEach(m => {
        const d = m.date instanceof Date ? m.date : new Date(m.date);
        const { key, label } = formatTimelineGroupDate(d);
        if (!groupMap.has(key)) {
          const groupObj = { key, label, items: [] };
          groupMap.set(key, groupObj);
          groups.push(groupObj);
        }

        const linkedOp =
          (m.operationId ? operationsMap.get(String(m.operationId)) : undefined) ||
          (m.ticketCode ? operationsMap.get(String(m.ticketCode)) : undefined);

        const linkedBooking =
          ((m as any).bookingId ? bookingsMap.get(String((m as any).bookingId)) : undefined) ||
          (linkedOp?.bookingId ? bookingsMap.get(String(linkedOp.bookingId)) : undefined) ||
          (m.operationId ? bookingsMap.get(String(m.operationId)) : undefined) ||
          (m.operationId?.endsWith('-booking') ? bookingsMap.get(m.operationId.replace('-booking', '')) : undefined);

        const display = resolveFinanceRowDisplay(m, linkedOp, linkedBooking, effectiveCourts, users);

        let icon = <ShoppingBasket size={20} className="text-[#1d63b8]" />;
        if (display.kind === 'booking') {
          icon = <Calendar size={20} className="text-[#0BA70B]" />;
        } else if (display.kind === 'purchase') {
          icon = <Package size={20} className="text-purple-600" />;
        } else if (display.kind === 'expense') {
          icon = <Receipt size={20} className="text-red-500" />;
        }

        groupMap.get(key)!.items.push({
          id: m.id,
          date: d,
          icon,
          title: display.title,
          subtitle: display.subtitle,
          amount: m.amount,
          amountPending: 0,
          flow: m.flow,
          isExpense: m.flow === 'expense',
          time: format(d, 'HH:mm'),
          onClick: () => {
            if (m.operationId) handleOpenTicketFromMovement(m.operationId);
          }
        });
      });
    } else {
      filteredCombinedOperations.forEach(op => {
        const d = op.date instanceof Date ? op.date : new Date(op.date);
        const { key, label } = formatTimelineGroupDate(d);
        if (!groupMap.has(key)) {
          const groupObj = { key, label, items: [] };
          groupMap.set(key, groupObj);
          groups.push(groupObj);
        }

        const linkedBooking =
          (op.originalDoc?.bookingId ? bookingsMap.get(String(op.originalDoc.bookingId)) : undefined) ||
          (op.id.endsWith('-booking') ? bookingsMap.get(op.id.replace('-booking', '')) : undefined);

        const display = resolveFinanceRowDisplay(op, op.originalDoc, linkedBooking, effectiveCourts, users);

        let icon = <ShoppingBasket size={20} className="text-[#1d63b8]" />;
        if (display.kind === 'booking') {
          icon = <Calendar size={20} className="text-[#0BA70B]" />;
        } else if (display.kind === 'purchase') {
          icon = <Package size={20} className="text-purple-600" />;
        } else if (display.kind === 'expense') {
          icon = <Receipt size={20} className="text-red-500" />;
        }

        groupMap.get(key)!.items.push({
          id: op.id,
          date: d,
          icon,
          title: display.title,
          subtitle: display.subtitle,
          amount: op.contractualAmount,
          amountPending: op.amountPending,
          totalCollected: op.totalCollected,
          flow: op.isExpense ? 'expense' : 'income',
          isExpense: Boolean(op.isExpense),
          time: format(d, 'HH:mm'),
          onClick: () => {
            if (op.originalDoc) handleOpenTicket(op.originalDoc);
          }
        });
      });
    }

    return groups;
  }, [activeSection, filteredCombinedMovements, filteredCombinedOperations, bookingsMap, operationsMap, effectiveCourts, users]);

  return (
    <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col space-y-3.5 relative pb-0">
      
      {/* =================================================================== */}
      {/* 1. TARJETA GRANDE 1: LAYOUT DE 2 COLUMNAS (MÉTRICAS CONSOLIDADAS)   */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-4 sm:p-5 shrink-0">
        <div className="grid grid-cols-12 gap-3.5 items-stretch">
          
          {/* 2.1. Columna Izquierda (col-span-5) */}
          <div className="col-span-5 border border-gray-200 dark:border-slate-700 rounded-3xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3">
            {/* 1. Ingresos */}
            <div>
              <div className="text-xs font-normal text-gray-500 dark:text-slate-400">
                Ingresos
              </div>
              <div className="text-lg sm:text-xl font-bold text-gray-600 dark:text-slate-100 leading-tight">
                ${financialSummary.economicIncome.toLocaleString('es-AR')}
              </div>
              <div className="mt-1 flex items-center flex-wrap">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold inline-flex items-center gap-0.5",
                  incomeTrend.isUp
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400"
                )}>
                  {incomeTrend.pct} {incomeTrend.isUp ? '↑' : '↓'}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-slate-400 ml-1">
                  {compareLabel}
                </span>
              </div>
            </div>

            {/* 2. Gastos */}
            <div>
              <div className="text-xs font-normal text-gray-500 dark:text-slate-400">
                Gastos
              </div>
              <div className="text-lg sm:text-xl font-bold text-gray-600 dark:text-slate-100 leading-tight">
                ${financialSummary.economicExpense.toLocaleString('es-AR')}
              </div>
            </div>

            {/* 3. Neto */}
            <div>
              <div className="text-xs font-normal text-gray-500 dark:text-slate-400">
                Neto
              </div>
              <div className="text-lg sm:text-xl font-bold text-gray-600 dark:text-slate-100 leading-tight">
                ${financialSummary.netResult.toLocaleString('es-AR')}
              </div>
            </div>
          </div>

          {/* 2.2. Columna Derecha (col-span-7) */}
          <div className="col-span-7 flex flex-col justify-between space-y-3.5">
            {/* Arriba: Sub-tarjeta Verde de Caja */}
            <div className="bg-[#0BA70B] text-white rounded-3xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-2">
              {/* Izquierda: Caja */}
              <div className="min-w-0">
                <div className="text-xs font-normal text-white/90">
                  Caja
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white leading-tight my-0.5 truncate">
                  {financialSummary.cashAvailable.toLocaleString('es-AR')}
                </div>
                <div className="flex items-center flex-wrap">
                  <span className="bg-emerald-100 text-[#0BA70B] rounded-full px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-0.5">
                    {cashTrend.pct} {cashTrend.isUp ? '↑' : '↓'}
                  </span>
                  <span className="text-[10px] text-white/90 ml-1">
                    {compareLabel}
                  </span>
                </div>
              </div>

              {/* Derecha: Por cobrar y Por pagar */}
              <div className="space-y-1.5 shrink-0 text-right">
                <div>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0" />
                    <span className="text-[11px] font-bold text-white">Por cobrar ({porCobrarPct}%)</span>
                  </div>
                  <div className="text-[11px] font-normal text-white/95 pl-3.5">
                    ${financialSummary.pendingToCollect.toLocaleString('es-AR')}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-[11px] font-bold text-white">Por pagar ({porPagarPct}%)</span>
                  </div>
                  <div className="text-[11px] font-normal text-white/95 pl-3.5">
                    ${financialSummary.pendingToPay.toLocaleString('es-AR')}
                  </div>
                </div>
              </div>
            </div>

            {/* Abajo: Mostrador y Agenda flotando sobre fondo blanco */}
            <div className="space-y-2 pt-0.5">
              {/* Fila Mostrador */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1d63b8] text-white flex items-center justify-center shrink-0">
                    <ShoppingBasket size={18} />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-gray-600 dark:text-slate-200 leading-tight">
                      Mostrador
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {distinctProductsCount} {distinctProductsCount === 1 ? 'producto' : 'productos'}
                    </div>
                  </div>
                </div>
                <div className="text-xs sm:text-sm font-bold text-gray-600 dark:text-slate-200">
                  ${financialSummary.mostradorIncome.toLocaleString('es-AR')}
                </div>
              </div>

              {/* Fila Agenda */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#0BA70B] text-white flex items-center justify-center shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-gray-600 dark:text-slate-200 leading-tight">
                      Agenda
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {periodBookingsCount} {periodBookingsCount === 1 ? 'reserva' : 'reservas'}
                    </div>
                  </div>
                </div>
                <div className="text-xs sm:text-sm font-bold text-gray-600 dark:text-slate-200">
                  ${financialSummary.reservasIncome.toLocaleString('es-AR')}
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. TARJETA GRANDE 2: MOVIMIENTOS & OPERACIONES, FILTRO Y TIMELINE   */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl rounded-b-none border-t border-x border-b-0 border-gray-100 dark:border-slate-800 p-4 sm:p-5 pb-36 shadow-sm flex-1 flex flex-col space-y-4">
        
        {/* Fila Superior: Selector de sección y Filtro desplegable a la derecha */}
        <div className="flex items-center justify-between">
          {/* Izquierda: Movimientos | Operaciones */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('movements')}
              className={cn(
                "transition-all cursor-pointer",
                activeSection === 'movements'
                  ? "bg-gray-200/90 dark:bg-slate-800 text-gray-700 dark:text-white font-bold rounded-full px-4 py-1 text-xs sm:text-sm shadow-2xs"
                  : "text-gray-400 hover:text-gray-600 dark:text-slate-400 font-semibold px-3 py-1 text-xs sm:text-sm"
              )}
            >
              Movimientos
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('operations')}
              className={cn(
                "transition-all cursor-pointer",
                activeSection === 'operations'
                  ? "bg-gray-200/90 dark:bg-slate-800 text-gray-700 dark:text-white font-bold rounded-full px-4 py-1 text-xs sm:text-sm shadow-2xs"
                  : "text-gray-400 hover:text-gray-600 dark:text-slate-400 font-semibold px-3 py-1 text-xs sm:text-sm"
              )}
            >
              Operaciones
            </button>
          </div>

          {/* Derecha: Filtro desplegable Todo > */}
          <div className="relative inline-flex items-center gap-1 text-gray-500 dark:text-slate-400 font-medium text-xs sm:text-sm cursor-pointer hover:text-gray-700 dark:hover:text-slate-200">
            <span>
              {activeSection === 'movements'
                ? (movementFilter === 'all' ? 'Todo' : movementFilter === 'reservas' ? 'Reservas' : movementFilter === 'mostrador' ? 'Mostrador' : movementFilter === 'income' ? 'Ingreso' : 'Egreso')
                : (operationFilter === 'all' ? 'Todo' : operationFilter === 'pending' ? 'Pendientes' : operationFilter === 'mostrador' ? 'Mostrador' : operationFilter === 'reservas' ? 'Reservas' : operationFilter === 'income' ? 'Ingreso' : 'Egreso')}
            </span>
            <ChevronRight size={14} className="text-gray-400" />
            <select
              value={activeSection === 'movements' ? movementFilter : operationFilter}
              onChange={(e) => {
                if (activeSection === 'movements') {
                  setMovementFilter(e.target.value as any);
                } else {
                  setOperationFilter(e.target.value as any);
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="Filtrar registros"
            >
              {activeSection === 'movements' ? (
                <>
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Todo</option>
                  <option value="reservas" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Reservas</option>
                  <option value="mostrador" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Mostrador</option>
                  <option value="income" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Ingreso</option>
                  <option value="expense" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Egreso</option>
                </>
              ) : (
                <>
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Todo</option>
                  <option value="pending" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Pendientes</option>
                  <option value="mostrador" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Mostrador</option>
                  <option value="reservas" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Reservas</option>
                  <option value="income" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Ingreso</option>
                  <option value="expense" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Egreso</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Buscador debajo de las pestañas */}
        <div className="relative w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar ticket, usuario o categoría"
            className="w-full rounded-full border border-gray-200 dark:border-slate-700 py-2 pl-9 pr-8 text-xs sm:text-sm text-gray-700 dark:text-slate-200 placeholder:text-gray-300 dark:placeholder:text-slate-500 outline-none bg-white dark:bg-slate-800/50 focus:border-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
              title="Borrar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Timeline agrupado por fecha con badges cuadrados redondeados y línea vertical conectora */}
        {groupedTimelineItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Receipt size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold text-gray-700 dark:text-slate-300">
              No hay {activeSection === 'movements' ? 'movimientos' : 'operaciones'} en esta vista
            </p>
            {searchQuery && (
              <p className="text-xs text-gray-400 mt-1">Intenta con otro término de búsqueda.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedTimelineItems.map((group) => (
              <div key={`group-${group.key}`} className="space-y-1">
                {/* Encabezado de Fecha: Hoy, Ayer, 23 Octubre */}
                <div className="text-xs sm:text-sm font-bold text-gray-500 dark:text-slate-400 pt-2 pb-1 px-1">
                  {group.label}
                </div>

                <div className="space-y-1">
                  {group.items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === group.items.length - 1;
                    const hasMultiple = group.items.length > 1;

                    return (
                      <div
                        key={`timeline-row-${item.id}`}
                        onClick={item.onClick}
                        className="relative flex items-center justify-between gap-3 py-2 cursor-pointer group hover:bg-gray-50/70 dark:hover:bg-slate-800/40 rounded-2xl px-2 transition-colors select-none"
                      >
                        {/* Columna Izquierda con Badge e Hilo conector vertical */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative flex items-center justify-center w-11 h-11 shrink-0">
                            {/* Línea vertical conectora centrada detrás del badge */}
                            {hasMultiple && (
                              <div
                                className={cn(
                                  "absolute left-1/2 -translate-x-1/2 w-[1.5px] bg-gray-200 dark:bg-slate-700 pointer-events-none z-0",
                                  isFirst ? "top-1/2 bottom-0" : isLast ? "top-0 bottom-1/2" : "top-0 bottom-0"
                                )}
                              />
                            )}

                            {/* Badge cuadrado con bordes redondeados, fondo blanco y borde/sombra difuminada suave */}
                            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-center shrink-0 z-10 transition-transform group-hover:scale-105">
                              {item.icon}
                            </div>
                          </div>

                          {/* Textos del ítem: Arriba nombre, abajo usuario o concepto */}
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-100 truncate leading-snug">
                              {item.title}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-slate-400 truncate mt-0.5">
                              {item.subtitle}
                            </div>
                          </div>
                        </div>

                        {/* Columna Derecha con Monto y Hora */}
                        <div className="text-right shrink-0">
                          {activeSection === 'movements' ? (
                            item.flow === 'expense' ? (
                              <div className="text-gray-900 dark:text-white font-mono font-black text-sm sm:text-base leading-tight">
                                -${item.amount.toLocaleString('es-AR')}
                              </div>
                            ) : (
                              <div className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm sm:text-base leading-tight">
                                +${item.amount.toLocaleString('es-AR')}
                              </div>
                            )
                          ) : (
                            <div className={cn(
                              "font-mono font-black text-sm sm:text-base leading-tight",
                              Number(item.amountPending || 0) > 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-900 dark:text-white"
                            )}>
                              {item.isExpense ? `-$${item.amount.toLocaleString('es-AR')}` : `$${item.amount.toLocaleString('es-AR')}`}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {item.time}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* =================================================================== */}
      {/* 4. BOTÓN FLOTANTE (FAB): EJE, TAMAÑO Y COLOR VERDE (#0BA70B)       */}
      {/* =================================================================== */}
      <button 
        type="button" 
        onClick={() => setIsPOSModalOpen(true)}
        className="fixed bottom-20 right-4 sm:right-6 lg:bottom-8 lg:right-8 z-30 w-13 h-13 sm:w-14 sm:h-14 bg-[#0BA70B] hover:bg-[#099309] active:scale-95 text-white rounded-2xl shadow-lg shadow-emerald-950/20 flex items-center justify-center transition-all cursor-pointer"
        title="Abrir Mostrador (POS)"
        aria-label="Abrir Mostrador (POS)"
      >
        <div className="relative flex items-center justify-center">
          <Store size={26} strokeWidth={2.2} />
          <span className="absolute -bottom-1 -right-1 text-white font-black text-xs leading-none">+</span>
        </div>
      </button>

      {/* Modal del Mostrador (POS) */}
      <POSModal 
        isOpen={isPOSModalOpen}
        onClose={() => setIsPOSModalOpen(false)}
        complexId={targetId}
        onNavigateToUserProfile={onNavigateToUserProfile}
        users={parentUsers || users}
      />

      {/* Modal de Ticket de Venta */}
      <TicketModal
        isOpen={Boolean(ticketModalOperation)}
        onClose={() => setTicketModalOperation(null)}
        operation={ticketModalOperation}
        movements={ticketModalMovements}
        venueProfile={venueProfile}
        operatorName={auth.currentUser?.displayName || undefined}
        originSection={activeSection}
        users={users}
        bookings={rawBookings}
        complexId={targetId}
        onDeleted={(concept) => {
          if (ticketModalOperation) {
            const opId = ticketModalOperation.id;
            const bId = ticketModalOperation.bookingId || (opId.endsWith('-booking') ? opId.replace('-booking', '') : null);
            setOperations(prev => prev.filter(o => o.id !== opId && (!bId || o.bookingId !== bId)));
            setFinancialMovements(prev => prev.filter(m => m.operationId !== opId && (!bId || (m.operationId !== `${bId}-booking` && m.bookingId !== bId))));
            if (bId) setRawBookings(prev => prev.filter(b => String(b.id) !== String(bId)));
            setLegacyTransactions(prev => prev.filter(t => t.operationId !== opId && (!bId || t.bookingId !== bId)));
          }
          setTicketModalOperation(null);
          setDeleteToast(`Se ha eliminado ${concept || 'el registro'} completamente del sistema.`);
        }}
        onRegisterPayment={(op) => {
          setTicketModalOperation(null);
          setSettleModalTarget({
            id: op.id,
            ticketCode: op.ticketCode,
            clientName: op.userName,
            userName: op.userName,
            concept: op.notes || (op.operationType === 'court_booking' ? 'Alquiler Cancha' : 'Operación comercial'),
            contractualAmount: op.contractualAmount,
            amountPending: op.amountPending,
            totalCollected: op.totalCollected,
            isLegacy: (op as any).isLegacy,
            userId: op.userId,
            bookingId: op.bookingId,
            originalDoc: op
          });
        }}
      />

      {/* Modal de Cobro de Pendientes / Fiados */}
      <PendingSettleModal
        isOpen={Boolean(settleModalTarget)}
        onClose={() => setSettleModalTarget(null)}
        operation={settleModalTarget ? {
          id: settleModalTarget.id,
          ticketCode: settleModalTarget.ticketCode,
          userName: settleModalTarget.clientName || settleModalTarget.userName,
          clientName: settleModalTarget.clientName || settleModalTarget.userName,
          concept: settleModalTarget.concept,
          contractualAmount: settleModalTarget.contractualAmount,
          amountPending: settleModalTarget.amountPending,
          totalCollected: settleModalTarget.totalCollected,
          isLegacy: settleModalTarget.isLegacy,
          userId: settleModalTarget.userId,
          bookingId: settleModalTarget.bookingId,
          originalDoc: settleModalTarget.originalDoc
        } : null}
        complexId={targetId}
        operatorId={auth.currentUser?.uid || 'pos_operator'}
        users={users}
        bookings={rawBookings}
        onSuccess={() => {
          setSettleModalTarget(null);
        }}
      />

      {/* Modal de Confirmación de Eliminación Definitiva */}
      {deleteTarget && (
        <div 
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeletingTarget) setDeleteTarget(null);
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>

            <div className="text-center space-y-2.5">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">
                ¿Estás seguro de eliminar este registro?
              </h3>
              
              <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl text-left space-y-1 font-mono text-xs border border-gray-100 dark:border-slate-700/60">
                <div className="flex justify-between items-center text-gray-800 dark:text-slate-200 font-bold">
                  <span className="text-gray-400 font-sans text-[11px]">Concepto:</span>
                  <span className="truncate max-w-[180px]">{deleteTarget.title}</span>
                </div>
                {deleteTarget.client && (
                  <div className="flex justify-between items-center text-gray-600 dark:text-slate-400 text-[11px]">
                    <span className="text-gray-400 font-sans">Cliente/Prov:</span>
                    <span className="truncate max-w-[180px]">{deleteTarget.client}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-400 font-sans text-[11px]">Monto:</span>
                  <span className={cn(
                    "font-black text-sm",
                    deleteTarget.isIncome ? "text-emerald-600" : "text-red-600"
                  )}>
                    ${deleteTarget.amount.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed text-left">
                Se eliminará absolutamente de todos lados (Finanzas, Agenda de reservas, Stock de productos, Cuenta corriente del usuario y base de datos en la nube) como si nunca hubiera existido. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingTarget}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingTarget}
                onClick={handleConfirmPermanentDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-red-900/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingTarget ? (
                  <span>Eliminando...</span>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Sí, eliminar definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación flotante Toast verde/esmeralda visible por 3.5 segundos */}
      {deleteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-xs sm:text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200 border border-emerald-500/50">
          <CheckCircle2 size={18} className="shrink-0 text-white" />
          <span>{deleteToast}</span>
        </div>
      )}

      {/* Modal de Carga Manual Administrativa */}
      <AnimatePresence>
        {isManualTxModalOpen && (
          <div 
            key="modal-new-tx-backdrop"
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsManualTxModalOpen(false);
            }}
          >
            <motion.div 
              key="modal-new-tx-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl text-gray-900">Nueva Transacción</h3>
                <button 
                  type="button" 
                  onClick={() => setIsManualTxModalOpen(false)} 
                  className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form className="space-y-6" onSubmit={handleSaveTx}>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setNewTx({ ...newTx, type: 'income', category: 'Alquiler de Cancha' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-bold text-sm transition-all",
                      newTx.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500"
                    )}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstCat = expenseCategories[0]?.id || 'Servicios';
                      setNewTx({ ...newTx, type: 'expense', category: firstCat });
                    }}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-bold text-sm transition-all",
                      newTx.type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-gray-500"
                    )}
                  >
                    Gasto
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Monto ($)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newTx.amount}
                    onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                    placeholder="0"
                    className="w-full text-3xl font-black text-gray-900 border-b-2 border-gray-200 focus:border-emerald-500 outline-none pb-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Categoría / Rubro</label>
                  <select
                    value={newTx.category}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      setNewTx({ ...newTx, category: selectedVal });
                      if (selectedVal !== 'Otro') {
                        setCustomCategory('');
                      }
                      setSelectedExpenseItemName('');
                    }}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:border-emerald-500"
                  >
                    {newTx.type === 'income' ? (
                      <>
                        <option value="Alquiler de Cancha">Alquiler de Cancha</option>
                        <option value="Venta Mostrador">Venta Mostrador</option>
                        <option value="Escuelita / Clases">Escuelita / Clases</option>
                        <option value="Torneo">Inscripción Torneo</option>
                        <option value="Otro">Otro Ingreso (Especificar)</option>
                      </>
                    ) : (
                      <>
                        {expenseCategories.length > 0 ? (
                          expenseCategories.map(cat => (
                            <option key={`exp-cat-${cat.id}`} value={cat.name}>
                              {cat.name}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="Servicios">Servicios (Luz, Agua, Gas, Internet)</option>
                            <option value="Mantenimiento">Mantenimiento de Canchas / Instalaciones</option>
                            <option value="Sueldos">Personal / Sueldos</option>
                            <option value="Mercadería">Compra de Bebidas / Insumos Mostrador</option>
                            <option value="Alquiler del Predio">Alquiler del Predio</option>
                            <option value="Impuestos">Impuestos / Tasas</option>
                          </>
                        )}
                        <option value="Otro">Otro Egreso (Especificar)</option>
                      </>
                    )}
                  </select>

                  {/* Campo para especificar rubro personalizado si elige Otro */}
                  {newTx.category === 'Otro' && (
                    <div className="mt-2.5">
                      <input
                        type="text"
                        required
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="Escribe el nombre del rubro / categoría..."
                        className="w-full p-3 bg-white border border-emerald-500 rounded-xl font-medium text-gray-700 outline-none text-sm"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Selector de concepto / ítem predefinido cuando es Egreso */}
                  {newTx.type === 'expense' && newTx.category !== 'Otro' && (() => {
                    const itemsForCat = expenseItems.filter(it => it.categoryId === newTx.category && it.status !== 'inactivo');
                    if (itemsForCat.length === 0) return null;
                    return (
                      <div className="mt-2.5">
                        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                          Concepto predefinido de "{newTx.category}"
                        </label>
                        <select
                          value={selectedExpenseItemName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedExpenseItemName(val);
                            const found = itemsForCat.find(i => i.name === val);
                            if (found && Number(found.purchasePrice || 0) > 0) {
                              setNewTx(prev => ({ ...prev, amount: String(found.purchasePrice) }));
                            }
                          }}
                          className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none"
                        >
                          <option value="">Seleccionar concepto frecuente (opcional)...</option>
                          {itemsForCat.map(it => (
                            <option key={`exp-it-opt-${it.id}`} value={it.name}>
                              {it.name} {Number(it.purchasePrice || 0) > 0 ? `($${Number(it.purchasePrice).toLocaleString('es-AR')})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Método de Pago</label>
                  <select
                    value={newTx.paymentMethod}
                    onChange={(e) => setNewTx({ ...newTx, paymentMethod: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:border-emerald-500"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                    <option value="Tarjeta">Tarjeta de Débito/Crédito</option>
                    <option value="MercadoPago">Mercado Pago</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción (Opcional)</label>
                  <input
                    type="text"
                    value={newTx.description}
                    onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                    placeholder="Detalle o nota interna..."
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className={cn(
                    "w-full py-4 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer",
                    newTx.type === 'income' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" : "bg-red-600 hover:bg-red-700 shadow-red-200"
                  )}
                >
                  Registrar {newTx.type === 'income' ? 'Ingreso' : 'Gasto'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};


const ProfileView = ({ onDataChange, isDarkMode, onToggleDarkMode, complexId = 'complejo_central' }: { onDataChange?: () => void, isDarkMode?: boolean, onToggleDarkMode?: () => void, complexId?: string }) => {
  const { user, activeComplex, collaboratorData, logout } = useFirebase();
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const defaultHours = [
    { day: 'lunes', open: true, start: '08:00', end: '23:00' },
    { day: 'martes', open: true, start: '08:00', end: '23:00' },
    { day: 'miércoles', open: true, start: '08:00', end: '23:00' },
    { day: 'jueves', open: true, start: '08:00', end: '23:00' },
    { day: 'viernes', open: true, start: '08:00', end: '23:00' },
    { day: 'sábado', open: true, start: '08:00', end: '23:00' },
    { day: 'domingo', open: true, start: '08:00', end: '23:00' }
  ];

  const initialProfile = {
    name: activeComplex?.name || activeComplex?.company || '',
    company: activeComplex?.company || activeComplex?.name || '',
    address: activeComplex?.address || '',
    phone: activeComplex?.phone || '',
    email: activeComplex?.email || '',
    instagram: activeComplex?.instagram || '',
    description: activeComplex?.description || activeComplex?.notes || '',
    alias: activeComplex?.alias || '',
    ownerName: activeComplex?.ownerName || '',
    ownerPhone: activeComplex?.ownerPhone || '',
    managerName: activeComplex?.managerName || '',
    managerPhone: activeComplex?.managerPhone || '',
    hours: Array.isArray(activeComplex?.hours) ? activeComplex.hours : defaultHours,
    services: activeComplex?.services || {},
    photos: Array.isArray(activeComplex?.photos) ? activeComplex.photos : []
  };

  const [profile, setProfile] = useState<any>(initialProfile);
  const safeHours: any[] = Array.isArray(profile?.hours) ? profile.hours : defaultHours;
  const [courts, setCourts] = useState<Court[]>([]);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  
  // Modals
  const [editSection, setEditSection] = useState<'info' | 'hours' | 'court' | null>(null);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editingHourIndex, setEditingHourIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>(() => {
    if (Array.isArray(activeComplex?.photos)) {
      return activeComplex.photos.map((p: any, idx: number) => 
        typeof p === 'string' ? { id: `p_${idx}`, url: p } : { id: p.id || `p_${idx}`, url: p.url || '' }
      );
    }
    return [];
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [aliasCopied, setAliasCopied] = useState(false);

  const handleCopyAlias = () => {
    if (!profile?.alias) return;
    try {
      navigator.clipboard.writeText(profile.alias);
      setAliasCopied(true);
      setTimeout(() => setAliasCopied(false), 2000);
    } catch (e) {
      console.warn('Error copying alias:', e);
    }
  };

  const compressImage = (file: File, maxWidth: number = 720, quality: number = 0.75): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressedDataUrl = await compressImage(file, 720, 0.75);
        const newPhoto = { id: `photo_${Date.now()}`, url: compressedDataUrl };
        const updatedPhotos = [...photos, newPhoto];
        setPhotos(updatedPhotos);
        const updatedProfile = { ...profile, photos: updatedPhotos };
        setProfile(updatedProfile);
        await saveVenueProfileInFirestore(complexId, updatedProfile);
      } catch (err) {
        console.error('Error compressing or saving photo:', err);
      } finally {
        if (e.target) e.target.value = '';
      }
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const updatedPhotos = photos.filter(p => p.id !== photoId);
    setPhotos(updatedPhotos);
    const updatedProfile = { ...profile, photos: updatedPhotos };
    setProfile(updatedProfile);
    try {
      await saveVenueProfileInFirestore(complexId, updatedProfile);
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadProfileData = async () => {
      setIsLoading(true);
      setLoading(true);
      try {
        // 1. Check collaborators doc for current authenticated user
        const currentAuth = auth.currentUser || user;
        let collaboratorProfile: any = null;
        if (currentAuth) {
          try {
            const colDoc = await getDoc(doc(db, 'collaborators', currentAuth.uid));
            if (colDoc.exists()) {
              collaboratorProfile = colDoc.data();
            }
          } catch (colErr) {
            console.warn('[Profile] Notice checking collaborator doc:', colErr);
          }
        }

        // 2. Read directly from canonical complejos/{activeComplejoId}
        let complexDocData: any = null;
        const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
        try {
          const cSnap = await getDoc(doc(db, 'complejos', targetId));
          if (cSnap.exists()) {
            complexDocData = cSnap.data();
          }
        } catch (cErr) {
          console.warn('[Profile] Notice checking complejo doc:', cErr);
        }

        if (isMounted) {
          // Read courts directly from complexes/{activeComplexId} ('courts' or 'canchas') or courtsData
          const embeddedCourts = complexDocData?.courts || complexDocData?.canchas;
          if (Array.isArray(embeddedCourts) && embeddedCourts.length > 0) {
            const mappedCourts: Court[] = embeddedCourts.map((c: any, idx: number) => ({
              id: c.id ? (isNaN(Number(c.id)) ? c.id : Number(c.id)) : idx + 1,
              name: c.name || `Cancha ${idx + 1}`,
              type: c.sport || c.type || 'Fútbol 5',
              surface: c.surface || 'Césped Sintético',
              price_per_hour: Number(c.price || c.price_per_hour) || 0,
              is_roofed: Boolean(c.is_roofed),
              image_url: c.image_url || '',
              status: c.status === 'activa' ? 'available' : (c.status || 'available')
            }));
            setCourts(mappedCourts);
          }

          // Build unified profile: fallback to active complex, authenticated user details, or 'Colo loco'
          const resolvedName = complexDocData?.name || activeComplex?.name || 'Colo loco';
          const resolvedAddress = complexDocData?.address || activeComplex?.address || 'Av. Corrientes 1234, CABA';
          const resolvedPhone = complexDocData?.phone || activeComplex?.phone || '+54 9 11 5555-5555';
          const resolvedInstagram = complexDocData?.instagram || activeComplex?.instagram || '@cololoco';
          const resolvedDescription = complexDocData?.description || activeComplex?.description || 'Complejo deportivo líder.';
          const rawComplexHours = complexDocData?.hours || complexDocData?.weeklySchedule;
          const resolvedHours = Array.isArray(rawComplexHours)
            ? rawComplexHours
            : (rawComplexHours && typeof rawComplexHours === 'object' && Object.values(rawComplexHours).length > 0 && typeof Object.values(rawComplexHours)[0] === 'object' && 'day' in (Object.values(rawComplexHours)[0] as any)
                ? Object.values(rawComplexHours)
                : defaultHours);
          const resolvedServices = complexDocData?.services || ['Estacionamiento', 'Vestuarios', 'Buffet', 'Césped Sintético'];

          setProfile({
            name: resolvedName,
            address: resolvedAddress,
            phone: resolvedPhone,
            instagram: resolvedInstagram,
            description: resolvedDescription,
            hours: resolvedHours,
            services: resolvedServices
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching profile data:', err);
        }
      } finally {
        setIsLoading(false);
        setLoading(false);
      }
    };

    loadProfileData();

    // Real-time Firestore sync for venue and courts
    const unsubVenue = subscribeToVenueProfile(complexId, (vData) => {
      if (vData && isMounted) {
        setProfile((prev: any) => ({ 
          ...prev, 
          ...vData,
          hours: Array.isArray(vData.hours) ? vData.hours : (Array.isArray(prev?.hours) ? prev.hours : defaultHours)
        }));
        if (Array.isArray(vData.photos)) {
          setPhotos(vData.photos.map((p: any, idx: number) => 
            typeof p === 'string' ? { id: `p_${idx}`, url: p } : { id: p.id || `p_${idx}`, url: p.url || '' }
          ));
        }
      }
    });
    const unsubCourts = subscribeToCourts(complexId, (cList) => {
      if (Array.isArray(cList) && isMounted) setCourts(cList);
    });

    return () => {
      isMounted = false;
      controller.abort();
      unsubVenue();
      unsubCourts();
    };
  }, [complexId]);

  const fetchData = async () => {
    setIsLoading(true);
    setLoading(true);
    try {
      const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
      const cSnap = await getDoc(doc(db, 'complejos', targetId));
      if (cSnap.exists()) {
        const cData = cSnap.data();
        if (cData.name || cData.company) {
          setProfile((prev: any) => ({ 
            ...prev, 
            name: cData.name || cData.company || prev.name,
            address: cData.address || prev.address,
            phone: cData.phone || prev.phone,
            instagram: cData.instagram || prev.instagram,
            description: cData.description || cData.notes || prev.description,
            hours: Array.isArray(cData.hours) ? cData.hours : prev.hours
          }));
        }
        if (Array.isArray(cData.courts)) {
          setCourts(cData.courts.map((c: any, idx: number) => ({
            id: c.id ? String(c.id) : `c_${idx + 1}`,
            name: c.name || `Cancha ${idx + 1}`,
            type: c.sport || c.type || 'fútbol 5',
            sport: c.sport || c.type || 'fútbol 5',
            surface: c.surface || 'sintético',
            price_per_hour: Number(c.price ?? c.price_per_hour ?? 0),
            price: Number(c.price ?? c.price_per_hour ?? 0),
            is_roofed: Boolean(c.is_roofed),
            status: c.status === 'activa' || c.status === 'available' ? 'available' : (c.status || 'available')
          })));
        }
      }
    } catch (err) {
      console.error('Error refreshing profile data:', err);
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [mostradorSheetMode, setMostradorSheetMode] = useState<'mostrador' | 'gastos' | null>(null);
  const [courtMenuOpen, setCourtMenuOpen] = useState(false);

  // Formato del badge de deporte para las píldoras de canchas
  const formatCourtSportBadge = (court: Court) => {
    const typeStr = (court.type || (court as any).sport || 'Fútbol 5').toLowerCase();
    if (typeStr.includes('fútbol') || typeStr.includes('futbol')) {
      const numMatch = typeStr.match(/\d+/);
      return numMatch ? `Fut ${numMatch[0]}` : 'Fut 5';
    }
    if (typeStr.includes('pádel') || typeStr.includes('padel')) return 'Pádel';
    if (typeStr.includes('tenis')) return 'Tenis';
    if (typeStr.includes('vóley') || typeStr.includes('voley')) return 'Vóley';
    if (typeStr.includes('básquet') || typeStr.includes('basquet')) return 'Básquet';
    if (typeStr.includes('squash')) return 'Squash';
    if (typeStr.includes('pickleball')) return 'Pickleball';
    if (typeStr.includes('hockey')) return 'Hockey';
    if (typeStr.includes('handball')) return 'Handball';
    return court.type || 'Fut 5';
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    const profileToSave = { ...profile, hours: safeHours, photos };
    try {
      await saveVenueProfileInFirestore(complexId, profileToSave);
    } catch (e) {
      console.warn('Error saving venue to Firestore:', e);
    }
    setIsSaving(false);
    setHasChanges(false);
    setEditSection(null);
    if (onDataChange) onDataChange();
  };

  const handleSaveCourt = async (court: any) => {
    setIsSaving(true);
    try {
      const parsedPrice = court.price_per_hour !== '' && court.price_per_hour !== undefined
        ? Number(court.price_per_hour)
        : (court.price !== '' && court.price !== undefined ? Number(court.price) : 0);

      const courtPayload = {
        ...court,
        id: court.id ? String(court.id) : `c_${Date.now()}`,
        name: (court.name || 'Cancha').trim(),
        sport: court.sport || court.type || 'Fútbol',
        type: court.sport === 'Fútbol' ? (court.type || 'fútbol 5') : (court.sport || court.type || 'fútbol 5'),
        surface: court.surface || 'sintético',
        price: parsedPrice,
        price_per_hour: parsedPrice,
        status: court.status === 'inactiva' ? 'inactiva' : 'activa',
        is_roofed: Boolean(court.is_roofed),
        blockedCourts: court.blockedCourts || []
      };
      await saveCourtInFirestore(complexId, courtPayload);
    } catch (e) {
      console.warn('Error saving court to Firestore:', e);
    }
    
    setIsSaving(false);
    setEditingCourt(null);
    setEditSection(null);
    fetchData();
    if (onDataChange) onDataChange();
  };

  const handleDeleteCourt = async (id: number | string) => {
    try {
      await deleteCourtInFirestore(id, complexId);
    } catch (e) {
      console.warn('Error deleting court in Firestore:', e);
    }
    setEditingCourt(null);
    setEditSection(null);
    fetchData();
    if (onDataChange) onDataChange();
  };

  return (
    <div className="bg-[#f4f5f7] dark:bg-slate-900 min-h-full pb-24 px-4 sm:px-6 pt-2 space-y-4 max-w-2xl mx-auto">
      {/* 1. Tarjeta de Información del Complejo */}
      <div className="bg-white dark:bg-slate-800 rounded-[28px] border border-gray-200/90 dark:border-slate-700/80 p-5 sm:p-6 shadow-2xs relative">
        {/* 3 puntos para editar información */}
        <div className="absolute top-5 right-5">
          <button
            type="button"
            onClick={() => setEditSection('info')}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Editar información"
          >
            <MoreHorizontal size={22} />
          </button>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-slate-700 dark:text-slate-100 tracking-tight leading-tight pr-10">
          {profile.name || activeComplex?.name || 'El colo loco'}
        </h3>

        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          <MapPin size={16} className="text-slate-400 shrink-0" />
          <span className="truncate">{profile.address || 'Av. Julián Álvarez 2023'}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-6 pt-1 text-left">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Alias</span>
            <div 
              onClick={handleCopyAlias}
              className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5 cursor-pointer hover:text-[#0BA70B] transition-colors"
              title="Tocar para copiar alias"
            >
              {aliasCopied ? '¡Copiado!' : (profile.alias || 'Cololocoo')}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Teléfono</span>
            <div className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">
              {profile.phone || '+54 113849598'}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Instagram</span>
            <div className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">
              {profile.instagram || '@elcololoco.ok'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Tarjeta de Canchas */}
      <div className="bg-white dark:bg-slate-800 rounded-[28px] border border-gray-200/90 dark:border-slate-700/80 p-5 sm:p-6 shadow-2xs relative">
        <div className="flex items-start justify-between">
          <h3 className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-100 tracking-tight">
            Canchas
          </h3>

          <div className="flex flex-col items-end relative">
            {/* 3 puntos con menú contextual para editar horario */}
            <button
              type="button"
              onClick={() => setCourtMenuOpen(!courtMenuOpen)}
              className="p-1.5 -mr-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Opciones de canchas"
            >
              <MoreHorizontal size={22} />
            </button>

            {courtMenuOpen && (
              <div 
                className="absolute right-0 top-8 z-30 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-xl shadow-lg py-1 w-36"
                onClick={() => setCourtMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCourtMenuOpen(false);
                    setEditSection('hours');
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Editar horario
                </button>
              </div>
            )}

            {/* Botón + nueva cancha debajo de los 3 puntos */}
            <button
              type="button"
              onClick={() => {
                setEditingCourt({
                  name: '',
                  type: 'fútbol 5',
                  sport: 'Fútbol',
                  surface: 'sintético',
                  price: '',
                  price_per_hour: '',
                  is_roofed: false,
                  status: 'activa',
                  blockedCourts: []
                } as any);
                setEditSection('court');
              }}
              className="text-xs sm:text-sm font-bold text-[#0BA70B] hover:text-emerald-700 transition-colors cursor-pointer mt-0.5"
            >
              + nueva cancha
            </button>
          </div>
        </div>

        {/* Lista de píldoras de canchas */}
        <div className="space-y-2.5 mt-3">
          {courts.map((court, cIdx) => {
            const priceNum = Number(court.price_per_hour ?? (court as any).price ?? 0);
            const sportBadgeText = formatCourtSportBadge(court);
            const isInactive = court.status === 'inactiva';

            return (
              <div
                key={`profile-court-pill-${court.id || cIdx}`}
                onClick={() => {
                  setEditingCourt({
                    ...court,
                    sport: (court as any).sport || (court.type?.toLowerCase().includes('fútbol') ? 'Fútbol' : court.type) || 'Fútbol',
                    type: court.type || 'fútbol 5',
                    price: (court as any).price !== undefined && (court as any).price !== null ? (court as any).price : (court.price_per_hour ?? ''),
                    price_per_hour: court.price_per_hour !== undefined && court.price_per_hour !== null ? court.price_per_hour : ((court as any).price ?? ''),
                    blockedCourts: (court as any).blockedCourts || []
                  });
                  setEditSection('court');
                }}
                className="rounded-full border border-gray-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between gap-3 hover:border-[#0BA70B]/50 transition-all cursor-pointer bg-white dark:bg-slate-800/60"
              >
                {/* Lado izquierdo: Ícono + Nombre + Superficie */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-slate-400 dark:text-slate-500 shrink-0">
                    <LayoutDashboard size={18} />
                  </div>
                  <div className="flex flex-col min-w-0 text-left">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {court.name}
                      </span>
                      {isInactive && (
                        <span className="text-[11px] text-red-500 font-semibold shrink-0">
                          (Inactiva)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400 capitalize -mt-0.5">
                      {court.surface || 'Sintético'}
                    </span>
                  </div>
                </div>

                {/* Lado derecho: Precio + Pill de Deporte */}
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    ${priceNum.toLocaleString('es-AR')}<span className="font-normal text-slate-700 dark:text-slate-300">h</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#0BA70B] text-white text-[10px] font-bold text-center mt-0.5">
                    {sportBadgeText}
                  </span>
                </div>
              </div>
            );
          })}

          {courts.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-400">
              Aún no has registrado canchas en esta sede.
            </div>
          )}
        </div>
      </div>

      {/* Dos botones inferiores paralelos */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
        <button
          type="button"
          onClick={() => setMostradorSheetMode('mostrador')}
          className="rounded-2xl border border-gray-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800 py-3.5 px-4 text-center font-bold text-sm text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-750 transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2"
        >
          Editar mostrador
        </button>

        <button
          type="button"
          onClick={() => setMostradorSheetMode('gastos')}
          className="rounded-2xl border border-gray-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800 py-3.5 px-4 text-center font-bold text-sm text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-750 transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2"
        >
          Editar gastos
        </button>
      </div>

      {/* Mostrador & Gastos Bottom Sheet */}
      <MostradorBottomSheet
        isOpen={mostradorSheetMode !== null}
        mode={mostradorSheetMode || 'mostrador'}
        onClose={() => setMostradorSheetMode(null)}
        complexId={targetId}
      />

      {/* Edit Info Modal */}
      {editSection === 'info' && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" 
          onClick={() => setEditSection(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[28px] border border-gray-100 dark:border-slate-800 p-6 shadow-2xl relative space-y-4 max-h-[85vh] overflow-y-auto" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
              <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">Editar Información</h3>
              <button 
                type="button" 
                onClick={() => setEditSection(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Nombre</label>
                <input 
                  value={profile.name || ''} 
                  onChange={e => setProfile({...profile, name: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: Complejo Jogo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Dirección</label>
                <input 
                  value={profile.address || ''} 
                  onChange={e => setProfile({...profile, address: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: Av. San Martín 1234"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Alias bancario del complejo</label>
                <input 
                  value={profile.alias || ''} 
                  onChange={e => setProfile({...profile, alias: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: complejo.canchas.mp"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Teléfono general</label>
                <input 
                  value={profile.phone || ''} 
                  onChange={e => setProfile({...profile, phone: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: +54 9 11 1234-5678"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Instagram</label>
                <input 
                  value={profile.instagram || ''} 
                  onChange={e => setProfile({...profile, instagram: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: @complejojogo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Correo electrónico</label>
                <input 
                  type="email"
                  value={profile.email || ''} 
                  onChange={e => setProfile({...profile, email: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: contacto@complejo.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Descripción</label>
                <textarea 
                  value={profile.description || ''} 
                  onChange={e => setProfile({...profile, description: e.target.value})}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  rows={2}
                  placeholder="Descripción del complejo y sus instalaciones..."
                />
              </div>
              
              <div className="pt-2 flex flex-col gap-2">
                <button 
                  type="button" 
                  onClick={handleSaveProfile} 
                  disabled={isSaving} 
                  className="w-full bg-[#0BA70B] hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setEditSection(null)} 
                  className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Hours Modal */}
      {editSection === 'hours' && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setEditSection(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[28px] border border-gray-100 dark:border-slate-800 p-6 shadow-2xl relative space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Editar horario</h3>
                <p className="text-xs text-slate-400 mt-0.5">Días y franjas de apertura del complejo</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditSection(null)} 
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
              {safeHours.map((h: any, i: number) => {
                const isOpen = Boolean(h.open);
                return (
                  <div key={`edit-hour-row-${h.day || i}-${i}`} className="flex items-center justify-between py-1">
                    {/* Botón circular verde/rojo + Nombre del día */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const newHours = [...safeHours];
                          newHours[i] = { ...newHours[i], open: !isOpen };
                          setProfile({ ...profile, hours: newHours });
                        }}
                        className={cn(
                          "w-4.5 h-4.5 rounded-full cursor-pointer transition-transform active:scale-90 shadow-2xs",
                          isOpen ? "bg-[#0BA70B]" : "bg-[#e41e26]"
                        )}
                        title={isOpen ? "Abierto (tocar para cerrar)" : "Cerrado (tocar para abrir)"}
                      />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">
                        {h.day}
                      </span>
                    </div>

                    {/* Horario o Cerrado */}
                    {isOpen ? (
                      <div className="flex items-center gap-1.5 border-b border-slate-400 dark:border-slate-500 pb-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <input
                          type="time"
                          value={h.start || '18:00'}
                          onChange={e => {
                            const newHours = [...safeHours];
                            newHours[i] = { ...newHours[i], start: e.target.value };
                            setProfile({ ...profile, hours: newHours });
                          }}
                          className="bg-transparent text-xs sm:text-sm font-semibold outline-none w-16 text-center cursor-pointer text-slate-800 dark:text-slate-100"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="time"
                          value={h.end || '01:00'}
                          onChange={e => {
                            const newHours = [...safeHours];
                            newHours[i] = { ...newHours[i], end: e.target.value };
                            setProfile({ ...profile, hours: newHours });
                          }}
                          className="bg-transparent text-xs sm:text-sm font-semibold outline-none w-16 text-center cursor-pointer text-slate-800 dark:text-slate-100"
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-slate-400">
                        Cerrado
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="w-full py-3 rounded-xl bg-[#0BA70B] hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setEditSection(null)}
                className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold text-sm cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Court Modal */}
      {editSection === 'court' && editingCourt && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" 
          onClick={() => setEditSection(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[28px] border border-gray-100 dark:border-slate-800 p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                  {editingCourt.id ? 'Editar Cancha' : 'Nueva Cancha'}
                </h3>
                <p className="text-xs text-slate-400">Configuración de cancha dentro de la sede activa</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditSection(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Fila 1: Nombre de Cancha */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nombre de Cancha *</label>
                <input 
                  value={editingCourt.name || ''} 
                  onChange={e => setEditingCourt({...editingCourt, name: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  placeholder="Ej: Cancha 1"
                />
              </div>

              {/* Fila 2: Deporte y Tipo de Cancha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Deporte *</label>
                  <select 
                    value={(editingCourt as any).sport || (editingCourt.type?.toLowerCase().includes('fútbol') ? 'Fútbol' : editingCourt.type) || 'Fútbol'} 
                    onChange={e => {
                      const newSport = e.target.value;
                      setEditingCourt({
                        ...editingCourt, 
                        sport: newSport, 
                        type: newSport === 'Fútbol' ? 'fútbol 5' : newSport
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  >
                    <option value="Fútbol">Fútbol</option>
                    <option value="Pádel">Pádel</option>
                    <option value="Tenis">Tenis</option>
                    <option value="Pickleball">Pickleball</option>
                    <option value="Squash">Squash</option>
                    <option value="Vóley">Vóley</option>
                    <option value="Básquet">Básquet</option>
                    <option value="Hockey">Hockey</option>
                    <option value="Handball">Handball</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tipo de cancha *</label>
                  {((editingCourt as any).sport === 'Fútbol' || !(editingCourt as any).sport || editingCourt.type?.toLowerCase().includes('fútbol')) ? (
                    <select 
                      value={editingCourt.type || 'fútbol 5'} 
                      onChange={e => setEditingCourt({...editingCourt, type: e.target.value})}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                    >
                      <option value="fútbol 5">fútbol 5</option>
                      <option value="fútbol 6">fútbol 6</option>
                      <option value="fútbol 7">fútbol 7</option>
                      <option value="fútbol 8">fútbol 8</option>
                      <option value="fútbol 9">fútbol 9</option>
                      <option value="fútbol 11">fútbol 11</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={(editingCourt as any).sport || editingCourt.type}
                      className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm text-slate-500 dark:text-slate-400 outline-none select-none cursor-default"
                    />
                  )}
                </div>
              </div>

              {/* Fila 3: Precio por Hora y Estado Operativo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Precio por Hora ($) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input 
                      type="number"
                      placeholder="Ej: 50000"
                      value={((editingCourt as any).price_per_hour !== undefined && (editingCourt as any).price_per_hour !== null)
                        ? (editingCourt as any).price_per_hour
                        : (((editingCourt as any).price !== undefined && (editingCourt as any).price !== null) ? (editingCourt as any).price : '')} 
                      onChange={e => {
                        const val = e.target.value;
                        setEditingCourt({
                          ...editingCourt, 
                          price: (val === '' ? '' : Number(val)) as any,
                          price_per_hour: (val === '' ? '' : Number(val)) as any
                        });
                      }}
                      className="w-full pl-8 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Estado Operativo *</label>
                  <select 
                    value={editingCourt.status === 'inactiva' ? 'inactiva' : 'activa'} 
                    onChange={e => setEditingCourt({...editingCourt, status: e.target.value})}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white"
                  >
                    <option value="activa">activa</option>
                    <option value="inactiva">inactiva</option>
                  </select>
                </div>
              </div>

              {/* Fila 4: ¿Es techada? y Superficie */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-full">
                  <input 
                    type="checkbox" 
                    id="is_roofed_checkbox"
                    checked={Boolean((editingCourt as any).is_roofed)} 
                    onChange={e => setEditingCourt({...editingCourt, is_roofed: e.target.checked})}
                    className="w-4.5 h-4.5 text-[#0BA70B] rounded focus:ring-[#0BA70B] cursor-pointer"
                  />
                  <label htmlFor="is_roofed_checkbox" className="font-semibold text-slate-700 dark:text-slate-300 text-xs sm:text-sm cursor-pointer select-none">
                    ¿Es techada?
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Superficie *</label>
                  <select 
                    value={editingCourt.surface || 'sintético'} 
                    onChange={e => setEditingCourt({...editingCourt, surface: e.target.value})}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#0BA70B] text-sm text-slate-800 dark:text-white capitalize"
                  >
                    <option value="sintético">sintético</option>
                    <option value="cemento">cemento</option>
                    <option value="césped">césped</option>
                    <option value="blindex">blindex</option>
                    <option value="tierra">tierra</option>
                    <option value="arena">arena</option>
                  </select>
                </div>
              </div>

              {/* Fila 5: Canchas Superpuestas (Bloqueo Mutuo) */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#0BA70B]" />
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Canchas Superpuestas (Bloqueo Mutuo)</label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Seleccioná las canchas que comparten el mismo espacio físico. Si esta cancha tiene un turno confirmado, las seleccionadas quedarán bloqueadas automáticamente en ese horario.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {courts.filter(c => !editingCourt.id || String(c.id) !== String(editingCourt.id)).map((c, cIdx) => {
                    const isBlocked = ((editingCourt as any).blockedCourts || []).map(String).includes(String(c.id));
                    return (
                      <button
                        type="button"
                        key={`overlap-court-${c.id || cIdx}`}
                        onClick={() => {
                          const currentBlocked = ((editingCourt as any).blockedCourts || []).map(String);
                          const strCId = String(c.id);
                          const newBlocked = isBlocked 
                            ? currentBlocked.filter((id: string) => id !== strCId)
                            : [...currentBlocked, strCId];
                          setEditingCourt({...editingCourt, blockedCourts: newBlocked});
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-2xs cursor-pointer",
                          isBlocked 
                            ? "bg-amber-500 text-white border-amber-600 shadow-amber-500/20" 
                            : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-gray-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600"
                        )}
                      >
                        <ShieldCheck size={13} className={isBlocked ? "text-white" : "text-slate-400"} />
                        <span>{c.name}</span>
                        {isBlocked && <span className="text-[10px] bg-amber-600 px-1 rounded ml-0.5">Bloqueada</span>}
                      </button>
                    );
                  })}
                  {courts.filter(c => !editingCourt.id || String(c.id) !== String(editingCourt.id)).length === 0 && (
                    <div className="text-xs text-slate-400 italic">No hay otras canchas creadas para vincular.</div>
                  )}
                </div>
              </div>

              {/* Botones de acción del modal de cancha */}
              <div className="pt-2 flex flex-col gap-2">
                <button 
                  type="button"
                  onClick={() => handleSaveCourt(editingCourt)} 
                  disabled={isSaving || !editingCourt.name || (editingCourt as any).price_per_hour === ''} 
                  className="w-full bg-[#0BA70B] hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Guardando en complejo...' : 'Guardar Cancha'}
                </button>
                {editingCourt.id && (
                  <button 
                    type="button" 
                    onClick={() => {
                      if (confirm(`¿Estás seguro de eliminar la cancha "${editingCourt.name}"?`)) {
                        handleDeleteCourt(editingCourt.id);
                      }
                    }}
                    className="w-full py-2.5 text-red-500 hover:text-red-700 font-semibold text-sm cursor-pointer"
                  >
                    Eliminar Cancha
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => setEditSection(null)} 
                  className="w-full py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BottomNav = ({ active, onNavigate }: { active: NavTabId | string, onNavigate: (id: NavTabId) => void }) => {
  return (
    <nav 
      role="navigation" 
      aria-label="Navegación principal inferior"
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 px-3 py-1.5 flex justify-around items-center z-40 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.03)] lg:hidden"
    >
      {MAIN_NAV_ITEMS.map(item => {
        const isCurrent = active === item.id;
        const displayLabel = item.label;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-label={displayLabel}
            key={`bottom-nav-${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate(item.id);
            }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer select-none touch-manipulation",
              isCurrent 
                ? "text-[#0BA70B] dark:text-[#0BA70B] font-bold" 
                : "text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 active:scale-95"
            )}
          >
            <div className="p-1 transition-all duration-200">
              <item.icon size={22} strokeWidth={isCurrent ? 2.5 : 1.8} className={isCurrent ? "text-[#0BA70B] dark:text-[#0BA70B]" : "text-gray-400 dark:text-slate-400"} />
            </div>
            <span className={cn(
              "text-[11px] leading-tight tracking-tight transition-colors",
              isCurrent ? "font-bold text-[#0BA70B] dark:text-[#0BA70B]" : "font-medium text-gray-400 dark:text-slate-400"
            )}>
              {displayLabel}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

// --- Main Layout ---

const ReportsModal = ({ isOpen, onClose, complexId = 'complejo_central' }: { isOpen: boolean, onClose: () => void, complexId?: string }) => {
  const months = [];
  const currentDate = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    months.push({
      id: safeFormatDate(d, 'yyyy-MM'),
      label: safeFormatDate(d, 'MMMM yyyy', { locale: es }),
      date: d
    });
  }

  const handleDownload = async (monthId: string, monthLabel: string) => {
    try {
      const targetComplexId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
      const colRef = collection(db, 'bookings');
      const q = query(colRef, where('complejoId', '==', targetComplexId));
      const snap = await getDocs(q);
      const allBookings = snap.docs.map(d => formatBookingToMatch({ id: d.id, ...d.data() }));

      const monthBookings = allBookings.filter(b => {
        if (b.status === 'cancelled') return false;
        const bDate = b.date || (b.start_time ? String(b.start_time).split('T')[0] : '');
        return bDate && bDate.startsWith(monthId);
      });

      let incomeTotal = 0;
      const txRows: any[] = [];

      monthBookings.forEach(b => {
        const price = Number(b.price || b.price_total || 0);
        const paid = b.payment_status === 'paid' ? price : Number(b.amount_paid || b.deposit || 0);
        const amount = paid > 0 ? paid : price;
        incomeTotal += amount;
        txRows.push([
          b.date || `${monthId}-01`,
          'Ingreso',
          `Alquiler (${b.courtName || 'Cancha'})`,
          `$${amount.toLocaleString()}`
        ]);
      });

      const expenseTotal = 0;
      const balance = incomeTotal - expenseTotal;
      
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`Resumen Financiero - ${monthLabel}`, 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Ingresos Totales: $${incomeTotal.toLocaleString()}`, 14, 35);
      doc.text(`Egresos Totales: $${expenseTotal.toLocaleString()}`, 14, 42);
      doc.text(`Balance Neto: $${balance.toLocaleString()}`, 14, 49);
      
      autoTable(doc, {
        startY: 55,
        head: [['Fecha', 'Tipo', 'Categoría', 'Monto']],
        body: txRows.length > 0 ? txRows : [['-', 'Sin movimientos en este período', '-', '$0']],
        theme: 'striped',
        headStyles: { fillColor: [11, 167, 11] }, // Emerald/Green theme matching App
      });
      
      doc.save(`Resumen_${monthId}.pdf`);
    } catch(e) {
      console.error("Error generating PDF", e);
    }
  };

  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Resúmenes Mensuales</h2>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
           {months.map((m, mIdx) => (
             <button type="button"
               key={`report-month-${m.id || mIdx}-${mIdx}`}
               onClick={() => handleDownload(m.id, m.label)}
               className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-emerald-50 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-colors"
             >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-xl text-emerald-600 shadow-sm">
                     <FileText size={20} />
                  </div>
                  <span className="font-bold text-gray-700 capitalize">{m.label}</span>
                </div>
                <Download size={20} className="text-gray-400" />
             </button>
           ))}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Modal de Información Personal (Dueño y Encargado del complejo)
 */
function PersonalInfoModal({
  isOpen,
  onClose,
  complexId
}: {
  isOpen: boolean;
  onClose: () => void;
  complexId: string;
}) {
  const [profile, setProfile] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerEmail, setManagerEmail] = useState('');

  useEffect(() => {
    if (!complexId || !isOpen) return;
    const unsub = subscribeToVenueProfile(complexId, (data) => {
      if (data) {
        setProfile(data);
        setOwnerName(data.ownerName || '');
        setOwnerPhone(data.ownerPhone || '');
        setOwnerEmail(data.ownerEmail || '');
        setManagerName(data.managerName || '');
        setManagerPhone(data.managerPhone || '');
        setManagerEmail(data.managerEmail || '');
      }
    });
    return () => unsub();
  }, [complexId, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveVenueProfileInFirestore(complexId, {
        ...profile,
        ownerName,
        ownerPhone,
        ownerEmail,
        managerName,
        managerPhone,
        managerEmail
      });
      onClose();
    } catch (e) {
      console.error('Error al guardar información personal:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[28px] border border-gray-100 dark:border-slate-800 p-6 shadow-2xl relative space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Información personal</h3>
            <p className="text-xs text-slate-400 mt-0.5">Datos del dueño y encargado del complejo</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Dueño */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dueño</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre y apellido</label>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Nombre del dueño"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Teléfono</label>
              <input
                type="tel"
                value={ownerPhone}
                onChange={e => setOwnerPhone(e.target.value)}
                placeholder="+54 11 ..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                placeholder="dueno@complejo.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
          </div>

          {/* Encargado */}
          <div className="space-y-2.5 pt-3 border-t border-gray-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Encargado</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre y apellido</label>
              <input
                type="text"
                value={managerName}
                onChange={e => setManagerName(e.target.value)}
                placeholder="Nombre del encargado"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Teléfono</label>
              <input
                type="tel"
                value={managerPhone}
                onChange={e => setManagerPhone(e.target.value)}
                placeholder="+54 11 ..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={managerEmail}
                onChange={e => setManagerEmail(e.target.value)}
                placeholder="encargado@complejo.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 rounded-xl bg-[#0BA70B] hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold text-sm cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('schedule');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isCreateMatchOpen, setCreateMatchOpen] = useState(false);
  const [isCreateUserOpen, setCreateUserOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [cancelModalBooking, setCancelModalBooking] = useState<any | null>(null);
  const [deleteModalBooking, setDeleteModalBooking] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Unified navigation controller ensuring exact sync and widget reset
  const handleNavigate = useCallback((tabId: NavTabId | string) => {
    const validTab = tabId as NavTabId;
    setActiveTab(validTab);
    setSidebarOpen(false);

    // Reset container and window scroll immediately
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      const mainContainer = document.getElementById('main-scroll');
      if (mainContainer) {
        mainContainer.scrollTop = 0;
        mainContainer.scrollLeft = 0;
      }
    }
  }, []);

  // Ensure scroll is reset when activeTab changes
  useEffect(() => {
    const mainContainer = document.getElementById('main-scroll');
    if (mainContainer) {
      mainContainer.scrollTop = 0;
      mainContainer.scrollLeft = 0;
    }
  }, [activeTab]);
  
  // Firebase Auth, Active Complex & Database Hook
  const { 
    user, 
    loading,
    isAdmin, 
    hasAccess,
    authorizedComplexes,
    signInWithGoogle, 
    logout, 
    activeComplexId, 
    activeComplejoName,
    activeComplex, 
    collaboratorData,
    billingConfig,
    setActiveComplexId 
  } = useFirebase();

  // Router & URL parameters evaluation
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  const [searchParams, setSearchParams] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });

  const [activationSuccessBanner, setActivationSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setSearchParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Detect invitation route /invite/{token}
  let inviteToken = '';
  if (currentPath.startsWith('/invite/')) {
    inviteToken = currentPath.replace('/invite/', '').split('/')[0].split('?')[0].trim();
  } else if (typeof window !== 'undefined' && window.location.hash.includes('/invite/')) {
    const hashPart = window.location.hash.split('/invite/')[1];
    if (hashPart) inviteToken = hashPart.split('?')[0].trim();
  } else if (searchParams.get('token') || searchParams.get('invite')) {
    inviteToken = (searchParams.get('token') || searchParams.get('invite') || '').trim();
  }

  // Analytics States
  const [showExposureStats, setShowExposureStats] = useState(false);
  const [showDemandStats, setShowDemandStats] = useState(false);
  const [showRetentionStats, setShowRetentionStats] = useState(false);
  const [showFinanceChart, setShowFinanceChart] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showGlobalSupportModal, setShowGlobalSupportModal] = useState(false);
  const [showPersonalInfoModal, setShowPersonalInfoModal] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
      } catch (e) {}
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      try { localStorage.setItem('theme', 'dark'); } catch (e) {}
    } else {
      document.documentElement.classList.remove('dark');
      try { localStorage.setItem('theme', 'light'); } catch (e) {}
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const [courts, setCourts] = useState<Court[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeBookings, setActiveBookings] = useState<Match[]>([]);
  const [dayBookingsCount, setDayBookingsCount] = useState<number>(0);
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>('today');

  const capitalizedTodayDate = useMemo(() => {
    const raw = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, []);

  // Sincronización en tiempo real estrictamente ligada al complejo asignado del operador autenticado
  useEffect(() => {
    if (!activeComplexId || !user) {
      setUsers([]);
      setCourts([]);
      setActiveBookings([]);
      return;
    }

    const unsubUsers = subscribeToClients(activeComplexId, (firestoreUsers) => {
      setUsers(firestoreUsers);
    });

    const unsubCourts = subscribeToCourts(activeComplexId, (firestoreCourts) => {
      setCourts(firestoreCourts);
    });

    const unsubBookings = subscribeToBookings(activeComplexId, (firestoreBookings) => {
      setActiveBookings(Array.isArray(firestoreBookings) ? firestoreBookings : []);
    });

    return () => {
      unsubUsers();
      unsubCourts();
      unsubBookings();
    };
  }, [activeComplexId, user, refreshKey]);

  // Índice de actividad unificado de jugadores del complejo activo (registrados + organizadores y participantes de reservas)
  const { crmUsers: unifiedCrmUsers, userMetricsMap: unifiedUserMetricsMap } = useMemo(() => {
    return buildCrmActivityIndex(users, activeBookings, activeComplexId, new Date());
  }, [users, activeBookings, activeComplexId]);

  // Cálculo y sincronización del ciclo de cobro semanal (10% sobre turnos jugados)
  const weeklyObligations = useMemo(() => {
    if (!activeComplexId || !activeComplex) return [];
    return calculateWeeklyObligations(activeComplexId, activeComplex, activeBookings);
  }, [activeComplexId, activeComplex, activeBookings]);

  // Sincronización automática de estado 'jugado' en /bookings para reservas cuyo horario de fin ya pasó
  useEffect(() => {
    if (!activeComplexId || activeBookings.length === 0) return;
    syncPlayedBookings(activeComplexId, activeBookings).catch((err) => {
      console.warn('[WeeklyBilling] Error sincronizando reservas transcurridas a jugado:', err);
    });
  }, [activeComplexId, activeBookings]);

  // Evaluar estado de aviso (Prueba, Lunes, Martes, Miércoles) y de bloqueo permanente (Jueves+)
  const billingNoticeState = useMemo<BillingNoticeState>(() => {
    if (!activeComplexId || !activeComplex) {
      return {
        type: null,
        obligation: null,
        trialDaysRemaining: null,
        isBlockedByDebt: false,
        blockingObligation: null,
        totalDebt: 0,
        totalOverdueDebt: 0,
        unpaidObligations: [],
        overdueObligations: []
      };
    }
    return evaluateBillingNoticeState(activeComplexId, activeComplex, weeklyObligations);
  }, [activeComplexId, activeComplex, weeklyObligations]);

  // Estados de control para modales de aviso y pago
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payTargetObligation, setPayTargetObligation] = useState<WeeklyPaymentObligation | null>(null);

  // Apertura reactiva del aviso correspondiente según regla de frecuencia
  useEffect(() => {
    if (billingNoticeState.type && !billingNoticeState.isBlockedByDebt) {
      setIsNoticeModalOpen(true);
    } else {
      setIsNoticeModalOpen(false);
    }
  }, [billingNoticeState.type, billingNoticeState.obligation?.id, billingNoticeState.isBlockedByDebt]);

  const handleSidebarAction = (action: string) => {
    if (action === 'exposure') setShowExposureStats(true);
    if (action === 'demand') setShowDemandStats(true);
    if (action === 'retention') setShowRetentionStats(true);
    if (action === 'chart') setShowFinanceChart(true);
    if (action === 'reports') setShowReportsModal(true);
    if (action === 'support') setShowGlobalSupportModal(true);
    if (action === 'personal_info') setShowPersonalInfoModal(true);
  };

  const handleUserClick = (idOrIdentifier?: number | string | null, candidateObj?: Partial<User> | any) => {
    const strId = idOrIdentifier !== undefined && idOrIdentifier !== null ? String(idOrIdentifier).trim() : '';

    // 1. Si candidateObj ya pertenece explícitamente a la lista unificada local de la sede activa
    if (candidateObj && candidateObj.id && candidateObj.originComplejoId === activeComplexId) {
      const exactInList = unifiedCrmUsers.find(u => String(u.id) === String(candidateObj.id));
      if (exactInList) {
        setSelectedUser(exactInList);
        return;
      }
    }

    const rawPhone = candidateObj?.phone || candidateObj?.userPhone || candidateObj?.clientPhone || candidateObj?.host_phone || (strId.startsWith('phone_') ? strId.slice(6) : strId);
    const rawEmail = candidateObj?.email || candidateObj?.userEmail || candidateObj?.clientEmail;
    const normPhone = normalizePhoneNumber(rawPhone);

    // 2. Prioridad absoluta: resolver contra la ficha local de la sede activa mediante findMatchingLocalUser
    // (Local UID -> Canonical ERP ID -> Historical IDs -> Normalized Phone -> Clean Email)
    const matchedLocal = findMatchingLocalUser(unifiedCrmUsers, {
      id: strId || (candidateObj?.id ? String(candidateObj.id) : undefined),
      canonicalId: candidateObj?.canonicalId || candidateObj?.canonicalUserId || candidateObj?.personId || candidateObj?.erpUserId,
      historicalId: candidateObj?.historicalId,
      historicalIds: candidateObj?.historicalIds,
      phone: rawPhone,
      email: rawEmail,
    });

    if (matchedLocal) {
      setSelectedUser(matchedLocal);
      return;
    }

    // 3. Si no existe ficha en el padrón, construir ficha derivada en memoria usando únicamente los datos disponibles
    const rawName = candidateObj?.name || candidateObj?.userName || candidateObj?.clientName || candidateObj?.host_name || (isGenericPlaceholderName(strId) ? '' : strId);
    const validName = (rawName && typeof rawName === 'string' && !isGenericPlaceholderName(rawName))
      ? rawName.trim()
      : (normPhone ? `Cliente (${rawPhone})` : 'Jugador');
    const validPhone = rawPhone && typeof rawPhone === 'string' && rawPhone !== validName && !rawPhone.startsWith('player_') ? rawPhone.trim() : '';
    const validEmail = rawEmail || '';

    // ID estable para la ficha derivada en memoria
    const derivedId = normPhone
      ? `derived_phone_${normPhone}`
      : (strId && strId.startsWith('derived_') ? strId : `derived_player_${Date.now()}`);

    const derivedUser: User = {
      id: derivedId,
      name: validName,
      phone: validPhone,
      email: validEmail || (normPhone ? `${normPhone}@sin-correo.com` : ''),
      originComplejoId: activeComplexId,
      isDerived: true,
      isActivated: true,
      category: candidateObj?.category || 'invitado',
      skill_level: candidateObj?.skill_level || 'Amateur',
      notes: 'Participante registrado en reservas del complejo',
      canonicalId: candidateObj?.canonicalId || candidateObj?.canonicalUserId || candidateObj?.personId || candidateObj?.erpUserId,
      canonicalName: candidateObj?.canonicalName,
      historicalId: candidateObj?.historicalId,
      historicalIds: candidateObj?.historicalIds,
    };

    setSelectedUser(derivedUser);
  };

  const handleDeleteUser = async (id: number | string) => {
    try {
      if (String(id).startsWith('derived_')) {
        setSelectedUser(null);
        return;
      }
      await deleteClientInFirestore(id, activeComplexId);
      setSelectedUser(null);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUserUpdated = (updatedUser: User) => {
    setSelectedUser(prev => prev ? { ...prev, ...updatedUser } : updatedUser);
    setRefreshKey(prev => prev + 1);
  };

  const handleCreateMatch = async (bookingData: any) => {
    try {
      const selectedCourt = courts.find(c => String(c.id) === String(bookingData.courtId || bookingData.court_id));
      const resolvedCourtId = String(bookingData.courtId || bookingData.court_id || selectedCourt?.id || '').trim();
      if (!resolvedCourtId) {
        throw new Error('Debes seleccionar una cancha válida antes de confirmar la reserva.');
      }

      const payload = {
        complejoId: activeComplexId,
        complejoName: activeComplejoName || 'Colo loco',
        courtId: resolvedCourtId,
        court_id: resolvedCourtId,
        courtName: bookingData.courtName || selectedCourt?.name || 'Cancha 1',
        date: bookingData.date,
        startTime: bookingData.startTime || bookingData.time || '18:00',
        endTime: bookingData.endTime || '19:00',
        durationMinutes: Number(bookingData.durationMinutes) || 60,
        price: Number(bookingData.price ?? bookingData.price_total ?? selectedCourt?.price ?? selectedCourt?.price_per_hour ?? 0),
        deposit: Number(bookingData.deposit ?? bookingData.amount_paid ?? 0),
        status: bookingData.status || 'confirmado',
        paymentStatus: bookingData.paymentStatus || (Number(bookingData.deposit || 0) >= Number(bookingData.price || 0) && Number(bookingData.price || 0) > 0 ? 'pagado' : Number(bookingData.deposit || 0) > 0 ? 'seña' : 'pendiente'),
        userId: bookingData.userId ? String(bookingData.userId) : '0',
        userName: bookingData.userName || bookingData.clientName || 'Cliente',
        userPhone: bookingData.userPhone || bookingData.clientPhone || '',
        userEmail: bookingData.userEmail || bookingData.clientEmail || '',
        notes: bookingData.notes || '',
        ...(bookingData.payments ? { payments: bookingData.payments } : {}),
        ...(bookingData.canonicalId ? { canonicalId: bookingData.canonicalId } : {}),
        ...(bookingData.canonicalName ? { canonicalName: bookingData.canonicalName } : {}),
        ...(bookingData.historicalId ? { historicalId: bookingData.historicalId } : {}),
        ...(Array.isArray(bookingData.historicalIds) && bookingData.historicalIds.length > 0 ? { historicalIds: bookingData.historicalIds } : {}),
        ownerId: auth.currentUser?.uid || '',
        adminId: ''
      };

      // Direct write to canonical Firestore 'bookings' collection
      await createBookingInFirestore(payload);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('[Firestore] Error creating booking:', err);
      throw err;
    }
  };

  const handleCreateUser = async (data: any): Promise<string | undefined> => {
    try {
      const now = new Date();
      const userPayload = {
        name: (data.name || 'Cliente').trim(),
        phone: (data.phone || '').trim(),
        email: (data.email || '').trim(),
        gender: data.gender || '',
        city: data.city || data.address || '',
        category: data.category || 'jugador',
        status: data.status || 'activo',
        isActivated: false,
        acquisitionChannel: data.acquisitionChannel || 'WhatsApp',
        acquisitionDate: data.acquisitionDate || safeFormatDate(now, 'yyyy-MM-dd'),
        acquisitionTime: data.acquisitionTime || safeFormatDate(now, 'HH:mm'),
        activationDate: null,
        activationTime: null,
        originComplejoId: activeComplexId,
        originComplejoName: activeComplejoName || 'Colo loco',
        totalBookings: 0,
        totalMatchesPlayed: 0,
        participatedMatches: 0,
        lastGameDate: '',
        lastGameTime: '',
        notes: data.notes || '',
        ownerId: auth.currentUser?.uid || '',
        adminId: ''
      };
      const createdId = await saveClientInFirestore(activeComplexId, userPayload);
      setRefreshKey(prev => prev + 1);
      return createdId;
    } catch (e) {
      console.error('[Firestore] Error creating user:', e);
      return undefined;
    }
  };

  const handleUpdateStatus = async (id: number | string, status: string) => {
    try {
      await updateBookingInFirestore(id, { 
        status: status as any,
        payment_status: status === 'paid' ? 'paid' : status === 'cancelled' ? 'cancelled' : 'pending'
      });
    } catch (e) {
      console.warn('Error updating booking in Firestore:', e);
    }
    setRefreshKey(prev => prev + 1);
  };

  // 1. Pantalla de carga mientras se verifica el estado de autenticación de Firebase
  if (loading) {
    return (
      <div className="flex w-full h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-[#0BA70B] flex items-center justify-center shadow-lg shadow-emerald-500/25 animate-pulse">
            <span className="text-white font-black text-2xl tracking-tighter">J</span>
          </div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Iniciando Jogo SaaS...
          </div>
        </div>
      </div>
    );
  }

  // 1. Ruta /invite/{token} para primera vinculación segura
  if (inviteToken) {
    return (
      <InviteView
        token={inviteToken}
        isDarkMode={isDarkMode}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
          setSearchParams(new URLSearchParams());
        }}
        onSuccess={(newComplexId, complexName) => {
          setActiveComplexId(newComplexId);
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
          setSearchParams(new URLSearchParams());
          setActiveTab('schedule');
          setRefreshKey(prev => prev + 1);
          setActivationSuccessBanner(`¡Bienvenido! Has tomado el control del complejo "${complexName}".`);
        }}
      />
    );
  }

  // 2. Si el usuario no está autenticado con Google => Renderizar Landing / Login View
  if (!user) {
    return (
      <LandingAuthView
        onSignInWithGoogle={signInWithGoogle}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
    );
  }

  // 3. Usuario autenticado pero SIN ACCESO autorizada (sin memberships válidas o complex con clientStatus inactive/paused)
  // CASO 4: Pantalla genérica "No tenés acceso a Jogo actualmente." (sin ActivationView ni códigos)
  if (!hasAccess || !activeComplexId) {
    return (
      <AccessDeniedView
        isDarkMode={isDarkMode}
      />
    );
  }

  // CASO E: Suspensión por deuda semanal vencida (Jueves en adelante con daysAfterDue >= 3 y saldo pendiente > 0)
  if (billingNoticeState.isBlockedByDebt && billingNoticeState.blockingObligation) {
    return (
      <>
        <AccessDeniedView
          isDarkMode={isDarkMode}
          blockingObligation={billingNoticeState.blockingObligation}
          overdueObligations={billingNoticeState.overdueObligations}
          totalOverdueDebt={billingNoticeState.totalOverdueDebt}
          unpaidObligations={billingNoticeState.unpaidObligations}
          totalDebt={billingNoticeState.totalDebt}
          billingConfig={billingConfig}
          complexName={activeComplejoName}
          onOpenPayModal={() => {
            setPayTargetObligation(billingNoticeState.blockingObligation);
            setIsPayModalOpen(true);
          }}
        />
        {isPayModalOpen && (
          <PayBalanceModal
            isOpen={isPayModalOpen}
            onClose={() => setIsPayModalOpen(false)}
            obligation={payTargetObligation || billingNoticeState.blockingObligation}
            unpaidObligations={billingNoticeState.overdueObligations.length > 0 ? billingNoticeState.overdueObligations : billingNoticeState.unpaidObligations}
            totalDebt={billingNoticeState.totalOverdueDebt > 0 ? billingNoticeState.totalOverdueDebt : billingNoticeState.totalDebt}
            billingConfig={billingConfig}
            complexName={activeComplejoName}
          />
        )}
      </>
    );
  }

  return (
    <POSCartProvider complexId={activeComplexId}>
      <div className="flex w-full h-[100dvh] overflow-hidden bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar 
        active={activeTab} 
        onNavigate={handleNavigate}
        onAction={handleSidebarAction} 
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        activeComplex={activeComplex}
        user={user}
        collaboratorData={collaboratorData}
        onLogout={logout}
        onOpenActivation={() => {
          window.history.pushState({}, '', '/activar');
          setCurrentPath('/activar');
        }}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={cn(
          "h-16 md:h-20 flex items-center justify-between px-4 md:px-6 z-20 relative transition-colors",
          (activeTab === 'users' || activeTab === 'schedule' || activeTab === 'finance' || activeTab === 'profile')
            ? "bg-[#f4f5f7] dark:bg-slate-900 text-slate-700 dark:text-slate-100 border-b border-transparent"
            : "bg-[#0BA70B] dark:bg-[#0BA70B] text-white"
        )}>
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              type="button" 
              onClick={() => setSidebarOpen(true)} 
              className={cn(
                "lg:hidden p-1 -ml-1 cursor-pointer transition-colors",
                (activeTab === 'users' || activeTab === 'schedule' || activeTab === 'finance' || activeTab === 'profile') ? "text-slate-600 dark:text-slate-100 hover:text-slate-800" : "text-white hover:text-white/80"
              )} 
              aria-label="Abrir menú lateral"
            >
              <Menu size={(activeTab === 'users' || activeTab === 'schedule' || activeTab === 'finance' || activeTab === 'profile') ? 30 : 32} strokeWidth={2.5} />
            </button>
            <div className="flex flex-col">
              <h2 className={cn(
                activeTab === 'finance'
                  ? "text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-100 tracking-tight leading-tight"
                  : activeTab === 'profile'
                    ? "text-2xl sm:text-3xl font-bold text-slate-600 dark:text-slate-100 tracking-tight leading-tight"
                    : (activeTab === 'users' || activeTab === 'schedule') 
                      ? "text-[22px] md:text-[26px] font-bold tracking-tight leading-tight text-slate-800 dark:text-slate-100" 
                      : "text-[22px] md:text-[26px] font-bold tracking-tight leading-tight text-white"
              )}>
                { 
                 activeTab === 'finance' ? capitalizedTodayDate :
                 activeTab === 'schedule' ? 'Agenda' :
                 activeTab === 'users' ? 'Usuarios' :
                 activeTab === 'profile' ? 'Mí perfil' : 
                 activeTab === 'analytics' ? 'Analíticas' : activeTab}
              </h2>
              {activeTab !== 'users' && activeTab !== 'schedule' && activeTab !== 'finance' && activeTab !== 'profile' && authorizedComplexes.length > 1 ? (
                <div className="relative inline-block mt-0.5">
                  <select
                    value={activeComplexId || ''}
                    onChange={(e) => setActiveComplexId(e.target.value)}
                    className="text-xs bg-black/25 hover:bg-black/35 text-white font-semibold rounded-lg px-2 py-0.5 pr-5 border border-white/20 outline-none cursor-pointer appearance-none"
                    title="Cambiar entre tus complejos deportivos autorizados"
                  >
                    {authorizedComplexes.map((c) => (
                      <option key={c.complexId} value={c.complexId} className="bg-slate-900 text-white">
                        {c.complexName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/80 pointer-events-none" />
                </div>
              ) : (activeTab !== 'users' && activeTab !== 'schedule' && activeTab !== 'finance' && activeTab !== 'profile' && activeComplex?.name) ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-100 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
                  <span className="truncate max-w-[200px]">{activeComplex.name}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {activeTab === 'users' ? (
              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-bold text-2xl md:text-3xl mr-1">
                <UserIcon size={26} strokeWidth={2.4} />
                <span>{unifiedCrmUsers.length}</span>
              </div>
            ) : activeTab === 'schedule' ? (
              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-bold text-2xl md:text-3xl mr-1">
                <Calendar size={26} strokeWidth={2.4} />
                <span>{dayBookingsCount}</span>
              </div>
            ) : activeTab === 'finance' ? (
              <div className="relative inline-flex items-center gap-1 text-slate-600 dark:text-slate-200 font-bold text-lg sm:text-xl cursor-pointer">
                <span>{FINANCE_PERIOD_OPTIONS.find(p => p.id === financePeriod)?.label || 'Hoy'}</span>
                <ChevronRight size={20} className="text-slate-400" />
                <select
                  value={financePeriod}
                  onChange={(e) => setFinancePeriod(e.target.value as FinancePeriod)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title="Seleccionar período de finanzas"
                >
                  {FINANCE_PERIOD_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : activeTab === 'profile' ? (
              null
            ) : (
              <>
                {/* Perfil del operador autenticado & Cerrar Sesión */}
                <div className="flex items-center gap-2 bg-white/15 dark:bg-black/20 hover:bg-white/25 transition-all rounded-full py-1 pl-1.5 pr-2.5 border border-white/20 text-white shadow-sm">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'Usuario'} className="w-7 h-7 rounded-full object-cover border border-white/40" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs uppercase text-white">
                      {user?.displayName?.[0] || user?.email?.[0] || 'U'}
                    </div>
                  )}
                  <div className="hidden md:flex flex-col text-left">
                    <span className="text-xs font-semibold leading-tight truncate max-w-[120px]">{user?.displayName || user?.email?.split('@')[0]}</span>
                    {isAdmin && <span className="text-[9px] uppercase tracking-wider text-emerald-200 font-bold">Admin</span>}
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    title="Cerrar sesión"
                    className="p-1 hover:text-red-200 transition-colors ml-0.5 cursor-pointer text-white/90"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut size={16} />
                  </button>
                </div>

                {/* Night mode toggle button in Header */}
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleDarkMode();
                  }} 
                  title={isDarkMode ? "Modo nocturno: Prendido (clic para apagar)" : "Modo nocturno: Apagado (clic para prender)"}
                  className="text-white hover:bg-white/20 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer relative"
                  aria-label="Alternar modo nocturno"
                >
                  {isDarkMode ? (
                    <Moon size={22} className="text-yellow-300 fill-yellow-300/30" />
                  ) : (
                    <Sun size={22} className="text-white hover:text-yellow-200" />
                  )}
                </button>

                <button type="button" onClick={() => setNotificationsOpen(true)} className="text-white hover:bg-white/20 p-2 rounded-full transition-colors relative cursor-pointer" aria-label="Notificaciones">
                  <Bell size={24} />
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0BA70B]"></div>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <main 
          id="main-scroll" 
          className={cn(
            "flex-1 relative pt-0", 
            activeTab === 'users' 
              ? "bg-[#f4f5f7] dark:bg-slate-900 px-2 sm:px-4 md:px-6 pb-16 lg:pb-3 flex flex-col min-h-0 overflow-hidden" 
              : (activeTab === 'schedule' || activeTab === 'finance')
                ? "bg-[#f4f5f7] dark:bg-slate-900 px-3 md:px-6 pb-0 overflow-y-auto flex flex-col"
                : "bg-[#f0f2f5] dark:bg-slate-900 px-3 md:px-6 pb-24 lg:pb-6 overflow-y-auto" 
          )}
        >
          {activationSuccessBanner && (
            <div className="mt-3 p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-center justify-between text-emerald-950 dark:text-emerald-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#0BA70B] text-white flex items-center justify-center font-bold shadow-md shadow-emerald-900/20 shrink-0">
                  ✓
                </div>
                <div>
                  <p className="font-bold text-sm leading-snug">{activationSuccessBanner}</p>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">Control total y sincronización en tiempo real con Firestore habilitados.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivationSuccessBanner(null)}
                className="p-1.5 hover:bg-emerald-500/20 rounded-xl transition-colors cursor-pointer text-emerald-900 dark:text-emerald-200"
                aria-label="Cerrar notificación"
              >
                <X size={18} />
              </button>
            </div>
          )}

          <ErrorBoundary key={`section-boundary-${activeTab}`} sectionName={activeTab}>
            <div className={cn("w-full", activeTab === 'users' ? "flex-1 flex flex-col min-h-0 pt-1.5 sm:pt-3" : (activeTab === 'schedule' || activeTab === 'finance') ? "flex-1 flex flex-col pt-3 md:pt-5" : "pt-3 md:pt-5")}>
              {activeTab === 'schedule' && (
                <ScheduleView 
                  key="view-schedule"
                  complexId={activeComplexId}
                  initialCourts={courts}
                  initialBookings={activeBookings}
                  users={unifiedCrmUsers}
                  onMatchClick={setSelectedMatch} 
                  onNewBooking={(prefillData?: any) => {
                    const isEvent = prefillData && (
                      prefillData.nativeEvent || 
                      prefillData.target || 
                      prefillData._reactName || 
                      typeof prefillData.preventDefault === 'function'
                    );
                    if (!isEvent && prefillData && (prefillData.courtId || prefillData.court_id || prefillData.start_time || prefillData.startTime || prefillData.date || prefillData.id)) {
                      setSelectedMatch(prefillData);
                    } else {
                      setSelectedMatch(null);
                    }
                    setCreateMatchOpen(true);
                  }}
                  onUpdateStatus={handleUpdateStatus}
                  refreshKey={refreshKey}
                  onNavigate={handleNavigate}
                  onDayBookingsCountChange={setDayBookingsCount}
                />
              )}
              {activeTab === 'users' && (
                <UsersView 
                  key="view-users"
                  complexId={activeComplexId}
                  unifiedUsers={unifiedCrmUsers}
                  userMetrics={unifiedUserMetricsMap}
                  onUserClick={handleUserClick} 
                  refreshKey={refreshKey}
                  onDataChange={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'analytics' && <AnalyticsView key="view-analytics" complexId={activeComplexId} />}
              {activeTab === 'finance' && (
                <FinanceView 
                  key="view-finance" 
                  complexId={activeComplexId} 
                  bookings={activeBookings}
                  courts={courts}
                  users={unifiedCrmUsers}
                  onNavigateToUserProfile={handleUserClick} 
                  financePeriod={financePeriod}
                  onPeriodChange={setFinancePeriod}
                />
              )}
              {activeTab === 'profile' && (
                <ProfileView 
                  key="view-profile"
                  complexId={activeComplexId}
                  onDataChange={() => setRefreshKey(prev => prev + 1)} 
                  isDarkMode={isDarkMode}
                  onToggleDarkMode={toggleDarkMode}
                />
              )}
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal 
            key="modal-user-detail" 
            user={selectedUser} 
            onClose={() => setSelectedUser(null)} 
            onDelete={handleDeleteUser}
            onUserUpdated={handleUserUpdated}
            complexId={activeComplexId}
            existingUsers={unifiedCrmUsers}
            bookings={activeBookings}
            onSelectBooking={(b) => setSelectedMatch(b)}
          />
        )}
        {selectedMatch && (
          <MatchDetailModal 
            key="modal-match-detail"
            match={isCreateMatchOpen ? null : selectedMatch} 
            users={unifiedCrmUsers}
            onClose={() => setSelectedMatch(null)} 
            onUpdateStatus={handleUpdateStatus}
            onUserClick={handleUserClick}
            onEdit={() => {
              setCreateMatchOpen(true);
            }}
            onPaymentUpdate={() => {
              setRefreshKey(prev => prev + 1);
              setSelectedMatch(null); // Close modal to reflect changes
            }}
            onCancelBooking={(m) => setCancelModalBooking(m)}
            onDeleteBooking={(m) => setDeleteModalBooking(m)}
          />
        )}
        {isNotificationsOpen && (
          <NotificationsModal key="modal-notifications" isOpen={isNotificationsOpen} onClose={() => setNotificationsOpen(false)} />
        )}
        {isCreateMatchOpen && (
          <CreateMatchModal 
            key="modal-create-match"
            isOpen={isCreateMatchOpen} 
            onClose={() => { setCreateMatchOpen(false); setSelectedMatch(null); }} 
            courts={courts}
            users={unifiedCrmUsers}
            complexId={activeComplexId}
            initialData={selectedMatch}
            onNavigate={handleNavigate}
            onCancelBooking={(b) => setCancelModalBooking(b)}
            onDeleteBooking={(b) => setDeleteModalBooking(b)}
            onCreate={selectedMatch && selectedMatch.id ? async (data) => {
              await updateBookingInFirestore(selectedMatch.id, {
                ...data,
                complexId: activeComplexId
              });
              setRefreshKey(prev => prev + 1);
              setSelectedMatch(null);
            } : handleCreateMatch}
            onQuickAddUser={(userData) => handleCreateUser({ ...userData, email: '', skill_level: 'Amateur' })}
          />
        )}
        {cancelModalBooking && (
          <CancelBookingModal
            key="modal-cancel-booking"
            isOpen={Boolean(cancelModalBooking)}
            onClose={() => setCancelModalBooking(null)}
            booking={cancelModalBooking}
            complexId={activeComplexId}
            operatorId={auth.currentUser?.uid || 'pos_operator'}
            onSuccess={() => {
              setRefreshKey(prev => prev + 1);
              setSelectedMatch(null);
              setCreateMatchOpen(false);
              setCancelModalBooking(null);
            }}
          />
        )}
        {deleteModalBooking && (
          <DeleteBookingModal
            key="modal-delete-booking"
            isOpen={Boolean(deleteModalBooking)}
            onClose={() => setDeleteModalBooking(null)}
            booking={deleteModalBooking}
            onSuccess={() => {
              setRefreshKey(prev => prev + 1);
              setSelectedMatch(null);
              setCreateMatchOpen(false);
              setDeleteModalBooking(null);
            }}
          />
        )}
        {isCreateUserOpen && (
          <CreateUserModal 
            key="modal-create-user"
            isOpen={isCreateUserOpen} 
            onClose={() => setCreateUserOpen(false)} 
            onCreate={handleCreateUser}
          />
        )}
        
        {/* Analytics Overlays */}
        {showExposureStats && (
          <ExposureStatsModal 
            key="modal-exposure-stats" 
            isOpen={showExposureStats} 
            onClose={() => setShowExposureStats(false)} 
            isDarkMode={isDarkMode} 
          />
        )}
        {showDemandStats && <DemandStats key="modal-demand-stats" onClose={() => setShowDemandStats(false)} complexId={activeComplexId} />}
        {showRetentionStats && <RetentionStats key="modal-retention-stats" onClose={() => setShowRetentionStats(false)} complexId={activeComplexId} />}
        {showFinanceChart && <FinanceChartModal key="modal-finance-chart" isOpen={showFinanceChart} onClose={() => setShowFinanceChart(false)} complexId={activeComplexId} />}
        {showReportsModal && <ReportsModal key="modal-reports" isOpen={showReportsModal} onClose={() => setShowReportsModal(false)} complexId={activeComplexId} />}
        {showGlobalSupportModal && (
          <ContactSupportModal
            key="modal-global-support"
            isOpen={showGlobalSupportModal}
            onClose={() => setShowGlobalSupportModal(false)}
            venueName="Complejo Jogo"
            adminName="Administrador Jogo"
            isDarkMode={isDarkMode}
          />
        )}
        {showPersonalInfoModal && (
          <PersonalInfoModal
            key="modal-personal-info"
            isOpen={showPersonalInfoModal}
            onClose={() => setShowPersonalInfoModal(false)}
            complexId={activeComplexId}
          />
        )}
      </AnimatePresence>

      {/* Modal de Aviso de Cobro Semanal / Fin de Prueba Gratuita */}
      <BillingNoticeModal
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        noticeType={billingNoticeState.type}
        obligation={billingNoticeState.obligation}
        unpaidObligations={billingNoticeState.unpaidObligations}
        totalDebt={billingNoticeState.totalDebt}
        trialDaysRemaining={billingNoticeState.trialDaysRemaining}
        billingConfig={billingConfig}
        complexId={activeComplexId}
        complexName={activeComplejoName}
        onOpenPayModal={() => {
          if (billingNoticeState.obligation) {
            setPayTargetObligation(billingNoticeState.obligation);
            setIsPayModalOpen(true);
          }
        }}
      />

      {/* Modal Regularizá tu saldo */}
      <PayBalanceModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        obligation={payTargetObligation || billingNoticeState.obligation}
        unpaidObligations={billingNoticeState.unpaidObligations}
        totalDebt={billingNoticeState.totalDebt}
        billingConfig={billingConfig}
        complexName={activeComplejoName}
      />

      {/* Mobile Bottom Navigation */}
      <BottomNav active={activeTab} onNavigate={handleNavigate} />
    </div>
  </POSCartProvider>
  );
}
