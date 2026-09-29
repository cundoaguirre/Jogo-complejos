import React, { Component, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';
import { 
  LayoutDashboard, Users, Calendar, TrendingUp, TrendingDown, DollarSign, CalendarCheck, Percent, Clock, 
  Search, Bell, Menu, X, Phone, MapPin, Star, ChevronRight, ChevronDown, Plus, Sparkles,
  Wallet, ArrowUpRight, ArrowDownRight, ArrowDownLeft, Store, Instagram, Check, ShieldCheck, 
  Car, Utensils, Wifi, Coffee, Shirt, Camera, Edit3, Trash2, ShoppingBag, Flame, Moon, Sun, Eye, EyeOff, User as UserIcon, BarChart2, MoreVertical, FileText, Download,
  MessageSquare, MessageCircle, Send, Bug, Lightbulb, Headphones, MousePointer, Activity, Target, Trophy, Wrench, Package, Zap, LogOut, LogIn
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

const Sidebar = ({ 
  active, 
  onNavigate, 
  onAction, 
  isOpen, 
  onClose, 
  isDarkMode, 
  onToggleDarkMode 
}: { 
  active: NavTabId | string, 
  onNavigate: (tab: NavTabId) => void, 
  onAction: (action: string) => void, 
  isOpen: boolean, 
  onClose: () => void, 
  isDarkMode?: boolean, 
  onToggleDarkMode?: () => void 
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

          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 rounded-full bg-emerald-900 flex items-center justify-center text-emerald-400 font-bold">
              CC
            </div>
            <div>
              <div className="font-bold text-sm">Complejo Central</div>
              <div className="text-xs text-slate-500">Admin</div>
            </div>
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

const UserDetailModal = ({ user, onClose, onDelete }: { user: User | null, onClose: () => void, onDelete: (id: number) => void }) => {
  if (!user) return null;

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
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="relative h-32 bg-slate-900">
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="absolute top-4 right-4 bg-black/20 text-white p-2 rounded-full hover:bg-black/40 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="px-8 pb-8">
          <div className="relative -mt-12 mb-6 flex justify-between items-end">
            <div className="w-24 h-24 rounded-full bg-white p-1 shadow-lg">
              <div className="w-full h-full rounded-full bg-emerald-100 flex items-center justify-center text-3xl font-bold text-emerald-700">
                {user.name?.charAt(0) || '?'}
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(user.id);
                }}
                className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-100 cursor-pointer"
              >
                Eliminar
              </button>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 cursor-pointer"
              >
                <Phone size={16} /> Contactar
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-gray-500 flex items-center gap-2 text-sm mt-1">
              <MapPin size={14} /> {user.address} • {(user.distance_km || 0).toFixed(1)} km del complejo
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
             <div className="bg-gray-50 p-4 rounded-2xl">
               <div className="text-xs text-gray-500 font-medium mb-1">Última vez que jugó fútbol</div>
               <div className="text-sm font-bold text-gray-900">{safeFormatDate(user.last_played_anywhere, 'PPP', { locale: es }, 'Desconocido')}</div>
             </div>
             <div className="bg-gray-50 p-4 rounded-2xl">
               <div className="text-xs text-gray-500 font-medium mb-1">Última vez en este complejo</div>
               <div className="text-sm font-bold text-gray-900">{safeFormatDate(user.last_visit, 'PPP', { locale: es }, 'N/A')}</div>
             </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-2xl font-bold text-gray-900">{user.rating}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Valoración</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-2xl font-bold text-gray-900">{user.matches_played}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Partidos</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-sm font-bold text-gray-900">{safeFormatDate(user.created_at, 'MMM yyyy', { locale: es }, 'N/A')}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Socio desde</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-sm font-bold text-gray-900">{safeFormatDate(user.first_visit, 'MMM yyyy', { locale: es }, 'N/A')}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Primera vez</div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-4">Historial Reciente</h3>
            <div className="space-y-3">
              {user.history?.map((h: any, i: number) => (
                <div key={`user-history-${h.id || i}-${i}`} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{h.court_name}</div>
                      <div className="text-xs text-gray-500">{safeFormatDate(h.start_time, 'PPP p', { locale: es })}</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Completado</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      
    </div>
  );
};


const NotificationsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  const notifications = [
    { id: 1, text: 'Juan Pérez reservó la Cancha 1.', time: 'Hace 5 min' },
    { id: 2, text: 'El pago de la reserva #342 fue confirmado.', time: 'Hace 30 min' },
    { id: 3, text: 'Recordatorio: Mantenimiento de Cancha 2 mañana.', time: 'Hace 2 horas' }
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
        <div className="overflow-y-auto p-4 space-y-3">
          {notifications.map((n, nIdx) => (
            <div key={`notif-${n.id || nIdx}-${nIdx}`} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
              <div className="mt-1 w-2 h-2 rounded-full bg-[#0BA70B] shrink-0" />
              <div>
                <p className="text-sm text-gray-900 font-medium">{n.text}</p>
                <p className="text-xs text-gray-500 mt-1">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const MatchDetailModal = ({ match, onClose, onUpdateStatus, onUserClick, onEdit, onPaymentUpdate }: { match: Match | null, onClose: () => void, onUpdateStatus?: (id: number, status: string) => void, onUserClick?: (id: number) => void, onEdit?: () => void, onPaymentUpdate?: () => void }) => {
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
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="absolute top-4 right-4 bg-gray-100 text-gray-500 p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
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
                    const remaining = (match.price_total || 0) - (match.amount_paid || 0);
                    try {
                      await fetch(`/api/matches/${match.id}/payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: remaining })
                      });
                      if (onPaymentUpdate) onPaymentUpdate();
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
                        await fetch(`/api/matches/${match.id}/payment`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ amount: Number(manualAmount) })
                        });
                        setManualAmount('');
                        setShowManualPayment(false);
                        if (onPaymentUpdate) onPaymentUpdate();
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
              <div className="flex items-center gap-4 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors relative" onClick={() => { if(onUserClick) { onUserClick(match.host_id); onClose(); } }}>
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                  {match.host_name?.charAt(0)}
                </div>
                <div className="flex-1">
                <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  {match.host_name} 
                  <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">Host</span>
                </div>
                <div className="text-xs text-gray-500">{match.host_phone}</div>
              </div>
              {((match.players || []).find(p => p.id === match.host_id) as any)?.has_paid || ((match.amount_paid || 0) > 0 && (match.players || []).length <= 1) ? (
                <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded mt-2 text-center w-fit">Pagó</div>
              ) : null}
              <button type="button" className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full absolute right-3 top-3">
                <Phone size={16} />
              </button>
            </div>

              {/* Other Players */}
              {(match.players || []).filter(p => p.id !== match.host_id).map((player, pIdx) => (
                <div key={`player-${player.id || pIdx}-${pIdx}`} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer" onClick={() => { if(onUserClick) { onUserClick(player.id); onClose(); } }}>
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                    {player.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-gray-900">{player.name}</div>
                    <div className="text-xs text-gray-500">{player.skill_level || 'Amateur'}</div>
                  </div>
                  {(player as any).has_paid ? (
                    <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">Pagó</div>
                  ) : null}
                </div>
              ))}

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
            <button 
              type="button"
              onClick={async () => {
                await fetch(`/api/matches/${match.id}`, { method: 'DELETE' });
                if(onUpdateStatus) onUpdateStatus(match.id, 'cancelled');
                onClose();
              }}
              className="flex-1 py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Cancelar
            </button>
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
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', skill_level: 'Amateur' });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalEmail = formData.email.trim();
    if (!finalEmail) {
      finalEmail = `cliente-${Date.now()}@sin-correo.com`;
    }
    onCreate({ ...formData, email: finalEmail });
    onClose();
  };

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
        className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Nuevo Usuario</h2>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
            <input required type="text" className="w-full p-2 border rounded-lg" onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(Opcional)</span></label>
            <input type="email" className="w-full p-2 border rounded-lg" onChange={e => setFormData({...formData, email: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input required type="tel" className="w-full p-2 border rounded-lg" onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
            <select className="w-full p-2 border rounded-lg" onChange={e => setFormData({...formData, skill_level: e.target.value})}>
              <option value="Amateur">Amateur</option>
              <option value="Intermedio">Intermedio</option>
              <option value="Pro">Pro</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700">Crear Usuario</button>
        </form>
      </motion.div>
    </div>
  );
};

const CreateMatchModal = ({ isOpen, onClose, courts, users, onCreate, onQuickAddUser, initialData }: { isOpen: boolean, onClose: () => void, courts: Court[], users: User[], onCreate: (data: any) => void, onQuickAddUser?: (user: any) => void, initialData?: any }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<any>({ court_id: null, host_id: '', date: '', time: '', payment_status: 'pending' });
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '' });
  const [userSearch, setUserSearch] = useState('');
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [venue, setVenue] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/venue', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setVenue(data);
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          console.error(err);
        }
      });

    if (initialData) {
      const startDate = new Date(initialData.start_time);
      // format time as HH:mm taking into account timezone offset
      const time = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
      const date = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0') + '-' + String(startDate.getDate()).padStart(2, '0');
      
      setData({
        id: initialData.id,
        court_id: initialData.court_id,
        host_id: initialData.host_id,
        date,
        time,
        payment_status: initialData.payment_status,
        amount_paid: initialData.amount_paid
      });
      setStep(1);
    } else {
      setData({ court_id: courts.length > 0 ? courts[0].id : null, host_id: '', date: '', time: '', payment_status: 'pending' });
      setStep(1);
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isOpen, initialData, courts]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const startDateTime = new Date(`${data.date}T${data.time}`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    const selectedCourt = courts.find(c => c.id === data.court_id);
    
    onCreate({
      ...data,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      price_total: selectedCourt?.price_per_hour || 0
    });
    onClose();
    setStep(1);
  };

  const handleQuickAddUser = () => {
    if (newClient.name && newClient.phone && onQuickAddUser) {
      onQuickAddUser(newClient);
      setIsAddingClient(false);
      setNewClient({ name: '', phone: '' });
    }
  };

  const getAvailableHours = () => {
    if (!venue || !venue.hours || !data.date) {
      return [];
    }

    const [y, m, d] = data.date.split('-');
    const selectedDateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    
    // getDay() gives 0 for Sunday
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = dayNames[selectedDateObj.getDay()];

    const hourConfig = venue.hours.find((h: any) => h.day === dayName);

    if (!hourConfig || !hourConfig.open) {
      return [];
    }

    const startH = parseInt(hourConfig.start.split(':')[0]);
    let endH = parseInt(hourConfig.end.split(':')[0]);
    if (endH === 0) endH = 24;

    let availableHours = [];
    if (startH <= endH) {
      for (let i = startH; i < endH; i++) {
        availableHours.push(i);
      }
    } else {
      for (let i = startH; i < 24; i++) {
        availableHours.push(i);
      }
      for (let i = 0; i < endH; i++) {
        availableHours.push(i);
      }
    }

    // Filter past hours if today
    const now = new Date();
    const isToday = selectedDateObj.getDate() === now.getDate() && 
                    selectedDateObj.getMonth() === now.getMonth() && 
                    selectedDateObj.getFullYear() === now.getFullYear();
    
    if (isToday) {
      const currentHour = now.getHours();
      availableHours = availableHours.filter(h => h > currentHour);
    }

    return availableHours.map(h => `${h.toString().padStart(2, '0')}:00`);
  };

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
        className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-xl h-[80vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Nueva Reserva</h2>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">1. Selecciona Cancha</h3>
            <div className="grid gap-3">
              {courts.map((court, cIdx) => (
                <div 
                  key={`modal-court-${court.id || cIdx}-${cIdx}`}
                  onClick={() => setData({...data, court_id: court.id})}
                  className={cn(
                    "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all",
                    data.court_id === court.id ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-gray-200 hover:border-emerald-200"
                  )}
                >
                  <img src={court.image_url} className="w-16 h-16 rounded-lg object-cover" />
                  <div>
                    <div className="font-bold text-sm">{court.name}</div>
                    <div className="text-xs text-gray-500">{court.type} • ${(court.price_per_hour || 0).toLocaleString()}/h</div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" 
              disabled={!data.court_id}
              onClick={() => setStep(2)}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">2. Detalles</h3>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-500">Cliente (Host)</label>
                <button type="button" 
                  onClick={() => setIsAddingClient(!isAddingClient)}
                  className="text-xs font-bold text-emerald-600 flex items-center gap-1 hover:text-emerald-700"
                >
                  <Plus size={12} /> Nuevo Cliente
                </button>
              </div>
              
              {isAddingClient ? (
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 mb-3 space-y-2">
                  <input 
                    type="text" 
                    placeholder="Nombre completo" 
                    className="w-full p-2 text-sm border rounded-lg"
                    value={newClient.name}
                    onChange={e => setNewClient({...newClient, name: e.target.value})}
                  />
                  <div className="flex gap-2">
                    <input 
                      type="tel" 
                      placeholder="Teléfono" 
                      className="flex-1 p-2 text-sm border rounded-lg"
                      value={newClient.phone}
                      onChange={e => setNewClient({...newClient, phone: e.target.value})}
                    />
                    <button type="button" 
                      onClick={handleQuickAddUser}
                      disabled={!newClient.name || !newClient.phone}
                      className="bg-emerald-600 text-white px-3 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setIsSelectOpen(!isSelectOpen)}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none text-left flex justify-between items-center focus:ring-2 focus:ring-emerald-500"
                  >
                    <span className={data.host_id ? "text-gray-900 font-medium" : "text-gray-500"}>
                      {data.host_id ? users.find(u => u.id === data.host_id)?.name : "Seleccionar usuario..."}
                    </span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>
                  
                  {isSelectOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100 flex items-center bg-gray-50">
                        <Search size={16} className="text-gray-400 ml-2" />
                        <input 
                          type="text"
                          placeholder="Buscar cliente..."
                          className="w-full p-2 bg-transparent outline-none text-sm"
                          value={userSearch}
                          onChange={e => setUserSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {users.filter(u => userSearch === '' || u.name.toLowerCase().includes(userSearch.toLowerCase())).map((u, uIdx) => (
                          <div 
                            key={`select-user-${u.id || uIdx}-${uIdx}`}
                            onClick={() => {
                              setData({...data, host_id: u.id});
                              setIsSelectOpen(false);
                              setUserSearch('');
                            }}
                            className="p-3 hover:bg-gray-50 cursor-pointer text-sm flex items-center justify-between transition-colors"
                          >
                            <div>
                              <span className="font-medium text-gray-900">{u.name}</span>
                              {u.phone && <span className="text-gray-500 ml-2 text-xs">{u.phone}</span>}
                            </div>
                            {data.host_id === u.id && <Check size={16} className="text-emerald-500" />}
                          </div>
                        ))}
                        {users.filter(u => userSearch === '' || u.name.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                          <div className="p-3 text-sm text-gray-500 text-center">No se encontraron usuarios</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Fecha</label>
                <input 
                  type="date" 
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full p-3 bg-gray-50 rounded-xl border-none" 
                  onChange={e => setData({...data, date: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Hora</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-xl border-none font-medium text-gray-900 disabled:opacity-50"
                  onChange={e => setData({...data, time: e.target.value})}
                  value={data.time || ""}
                  disabled={!data.date || getAvailableHours().length === 0}
                >
                  <option value="" disabled>
                    {!data.date ? 'Seleccionar fecha primero' : getAvailableHours().length === 0 ? 'Cerrado ese día' : 'Seleccionar Hora'}
                  </option>
                  {getAvailableHours().map((time, tIdx) => (
                    <option key={`time-opt-${time}-${tIdx}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Estado de Pago</label>
              <div className="flex gap-2">
                {['pending', 'partial', 'paid'].map((status, sIdx) => (
                  <button type="button"
                    key={`payment-status-opt-${status}-${sIdx}`}
                    onClick={() => setData({...data, payment_status: status})}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold capitalize border transition-colors",
                      data.payment_status === status 
                        ? "bg-emerald-600 text-white border-emerald-600" 
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {status === 'pending' ? 'Pendiente' : status === 'partial' ? 'Seña' : 'Pagado'}
                  </button>
                ))}
              </div>
              {data.payment_status === 'partial' && (
                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-500 mb-1">Monto Señado</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number"
                      value={data.amount_paid || ''}
                      onChange={e => setData({...data, amount_paid: Number(e.target.value)})}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Ej: 15000"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">Atrás</button>
              <button type="button" onClick={handleSubmit} disabled={!data.host_id || !data.date || !data.time} className="flex-[2] bg-emerald-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">Confirmar Reserva</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
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

  // Fetch exposure stats whenever period changes
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/exposure-stats?period=${period}`, { signal: controller.signal })
      .then(res => res.json())
      .then(resData => {
        if (!isMounted) return;
        setData(resData);
        setIsLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          console.error(err);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
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

const DemandStats = ({ onClose }: { onClose: () => void }) => {
  const [peakHours, setPeakHours] = useState<{hour: string, count: number}[]>([]);
  const [filter, setFilter] = useState<'global' | 'today' | 'week' | 'month' | 'day'>('global');
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1); // 1 = Lunes
  const [venue, setVenue] = useState<any>(null);
  
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/venue', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setVenue(data);
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          console.error(err);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);
  
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    // Determine the query parameters
    let qFilter = filter;
    let qDay = 'all';
    if (filter === 'day') {
      qFilter = 'global';
      qDay = selectedDayOfWeek.toString();
    }
    fetch(`/api/demand-stats?filter=${qFilter}&dayOfWeek=${qDay}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setPeakHours(Array.isArray(data) ? data : []);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          setPeakHours([]);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [filter, selectedDayOfWeek]);
  
  // Calculate open and close bounds from venue
  let minHour = 8;
  let maxHour = 23;
  if (venue && venue.hours) {
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

const RetentionStats = ({ onClose }: { onClose: () => void }) => {
  const [cohorts, setCohorts] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/analytics', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setCohorts(Array.isArray(data?.cohorts) ? data.cohorts : []);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          setCohorts([]);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

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

const ScheduleView = ({ onMatchClick, onNewBooking, onUpdateStatus, refreshKey }: { onMatchClick: (match: Match) => void, onNewBooking: () => void, onUpdateStatus: (id: number, status: string) => void, refreshKey?: number }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCourtIds, setSelectedCourtIds] = useState<number[]>([]);
  const [rowHeight, setRowHeight] = useState(64);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [venueHours, setVenueHours] = useState<any[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const initialPinchDist = useRef<number | null>(null);
  const initialRowHeight = useRef<number | null>(null);
  const lastTapTime = useRef<number>(0);

  const toggleRowHeightDensity = () => {
    setRowHeight(prev => (prev === 96 ? 48 : 96));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDist.current = dist;
      initialRowHeight.current = rowHeight;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist.current !== null && initialRowHeight.current !== null) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / initialPinchDist.current;
      const newHeight = Math.max(40, Math.min(150, initialRowHeight.current * scale));
      setRowHeight(newHeight);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    initialPinchDist.current = null;
    initialRowHeight.current = null;

    if (e.changedTouches.length === 1) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime.current;

      if (timeSinceLastTap > 0 && timeSinceLastTap < 300) {
        toggleRowHeightDensity();
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
      }
    }
  };


  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/matches', { signal: controller.signal })
      .then(res => res.json())
      .then(data => setMatches(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err.name !== 'AbortError') setMatches([]);
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/courts', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const courtList = Array.isArray(data) ? data : [];
        setCourts(courtList);
        if (courtList.length > 0 && selectedCourtIds.length === 0) {
          setSelectedCourtIds([courtList[0].id]);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setCourts([]);
      });

    fetch('/api/venue', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        setVenueHours(Array.isArray(data?.hours) ? data.hours : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setVenueHours([]);
      });

    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Calculate dynamic start/end hours based on selected day
  const getDayHours = () => {
    if (!venueHours || !venueHours.length) return { start: 8, end: 23 };
    
    const dayName = safeFormatDate(selectedDate, 'EEEE', { locale: es }, '').toLowerCase();
    // Map date-fns day name to our data structure (Lunes, Martes...)
    const dayMap: {[key: string]: string} = {
      'lunes': 'Lunes', 'martes': 'Martes', 'miércoles': 'Miércoles', 'miercoles': 'Miércoles',
      'jueves': 'Jueves', 'viernes': 'Viernes', 'sábado': 'Sábado', 'sabado': 'Sábado', 'domingo': 'Domingo'
    };
    
    const targetName = dayMap[dayName] || 'Lunes';
    const dayConfig = venueHours.find(h => h && h.day && h.day.toLowerCase() === targetName.toLowerCase());
    if (!dayConfig) return { start: 8, end: 23 }; // Default fallback if no config
    if (!dayConfig.open) return { start: 0, end: -1 }; // Closed

    const start = parseInt((dayConfig.start || '08:00').split(':')[0], 10) || 8;
    let end = parseInt((dayConfig.end || '23:00').split(':')[0], 10) || 23;
    if (end === 0) end = 24; // Handle midnight
    
    if (end < start) {
      end += 24;
    }
    
    return { start, end: Math.max(start, end - 1) }; // -1 because loop is inclusive of start but we want slots
  };

  const { start: startHour, end: endHour } = getDayHours();
  const timeSlots = Array.from({ length: Math.max(0, endHour - startHour + 1) }, (_, i) => i + startHour);

  const getMatchForSlot = (courtId: number, rawHour: number) => {
    if (!Array.isArray(matches)) return null;
    return matches.find(m => {
      if (!m || !m.start_time) return false;
      const matchDate = safeParseDate(m.start_time);
      if (!matchDate) return false;
      const slotDate = new Date(selectedDate);
      if (rawHour >= 24) {
        slotDate.setDate(slotDate.getDate() + 1);
      }
      return matchDate.getDate() === slotDate.getDate() &&
             matchDate.getMonth() === slotDate.getMonth() &&
             matchDate.getFullYear() === slotDate.getFullYear() &&
             matchDate.getHours() === (rawHour % 24) &&
             m.court_id === courtId;
    });
  };

  const getBlockedByForSlot = (courtId: number, rawHour: number) => {
    if (!Array.isArray(courts)) return null;
    const court = courts.find(c => c && c.id === courtId);
    if (!court || !(court as any).blockedCourts || !(court as any).blockedCourts.length) return null;
    
    // Check if any of the blocked courts has a match in this slot
    for (const blockedId of (court as any).blockedCourts) {
      const matchOnBlocked = getMatchForSlot(blockedId, rawHour);
      if (matchOnBlocked) {
        const blockerCourt = courts.find(c => c && c.id === blockedId);
        return blockerCourt ? blockerCourt.name : 'Otra cancha';
      }
    }
    return null;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const toggleCourtSelection = (courtId: number) => {
    setSelectedCourtIds(prev => {
      if (prev.includes(courtId)) {
        // Don't allow deselecting the last court
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== courtId);
      } else {
        return [...prev, courtId].sort((a, b) => {
          const idxA = courts.findIndex(c => c.id === a);
          const idxB = courts.findIndex(c => c.id === b);
          return idxA - idxB;
        });
      }
    });
  };

  // Calculate position of current time line
  const getCurrentTimePosition = () => {
    const now = currentTime;
    let currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const isToday = isSameDay(selectedDate, now);
    const isYesterday = isSameDay(new Date(selectedDate.getTime() + 86400000), now);
    
    if (!isToday && !isYesterday) return null;
    
    if (isYesterday && currentHour < (endHour % 24)) {
       currentHour += 24;
    } else if (isYesterday) {
       return null;
    } else if (isToday && currentHour < startHour && currentHour < (endHour % 24)) {
       currentHour += 24;
    }

    if (currentHour < startHour || currentHour > endHour) return null;

    const hourIndex = currentHour - startHour;
    const minutePercentage = currentMinute / 60;
    
    return (hourIndex + minutePercentage) * rowHeight;
  };

  const currentTimePos = getCurrentTimePosition();
  const isTodayDate = isSameDay(selectedDate, currentTime) || isSameDay(new Date(selectedDate.getTime() + 86400000), currentTime);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-auto space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-lg text-gray-900 capitalize">
              {safeFormatDate(selectedDate, 'EEEE d MMMM', { locale: es }, 'Fecha')}
            </h2>
            <p className="text-xs text-gray-500 font-medium tracking-wider">
              {matches.filter(m => {
                if (!m || !m.start_time) return false;
                const matchDate = safeParseDate(m.start_time);
                if (!matchDate) return false;
                return timeSlots.some(rawHour => {
                  const slotDate = new Date(selectedDate);
                  if (rawHour >= 24) slotDate.setDate(slotDate.getDate() + 1);
                  return matchDate.getDate() === slotDate.getDate() &&
                         matchDate.getMonth() === slotDate.getMonth() &&
                         matchDate.getFullYear() === slotDate.getFullYear() &&
                         matchDate.getHours() === (rawHour % 24);
                });
              }).length}/{timeSlots.length * courts.length} reservas disponibles
            </p>
          </div>
          <button type="button" onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom Control */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-50 rounded-lg p-1 mr-2">
            <button type="button" onClick={() => setRowHeight(Math.max(40, rowHeight - 10))} className="p-1 hover:bg-white rounded text-gray-500 text-xs font-bold">-</button>
            <span className="text-xs font-mono text-gray-400 w-8 text-center">Zoom</span>
            <button type="button" onClick={() => setRowHeight(Math.min(120, rowHeight + 10))} className="p-1 hover:bg-white rounded text-gray-500 text-xs font-bold">+</button>
          </div>

          <button type="button" onClick={onNewBooking} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 hover:bg-emerald-700 flex items-center gap-2">
            <Plus size={18} /> <span className="hidden sm:inline">Nueva Reserva</span>
          </button>
        </div>
      </div>

      {/* Court Tabs (Multi-select) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 flex gap-2 overflow-x-auto">
        {courts.map((court, cIdx) => (
          <button type="button"
            key={`sched-court-tab-${court.id || cIdx}-${cIdx}`}
            onClick={() => toggleCourtSelection(court.id)}
            className={cn(
              "flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center justify-center gap-2",
              selectedCourtIds.includes(court.id)
                ? "bg-emerald-600 text-white shadow-md" 
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            {selectedCourtIds.includes(court.id) && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            {court.name}
          </button>
        ))}
      </div>

      
      {/* Calendar Grid */}
      <div 
        id="reservations-grid-viewport"
        className="flex-1 overflow-auto bg-white rounded-2xl border border-gray-100 shadow-sm relative select-none"
        ref={viewportRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={toggleRowHeightDensity}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div className="relative" style={{ minWidth: `${Math.max(100, selectedCourtIds.length * 90 + 64)}px` }}>
          
          {/* Current Time Line */}
          {isTodayDate && currentTimePos !== null && (
            <div 
              className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
              style={{ top: `${currentTimePos}px` }}
            >
              <div className="w-16 text-right pr-2 text-xs font-bold text-red-500 bg-white/80 backdrop-blur-sm rounded-r sticky left-0 z-20">
                {format(currentTime, 'HH:mm')}
              </div>
              <div className="flex-1 h-[2px] bg-red-500 shadow-sm relative">
                <div className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
          
          {/* Time Slots */}
          <div className="relative">
            {timeSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Moon size={48} className="mb-4 opacity-50" />
                <p className="font-bold text-lg">Cerrado este día</p>
                <p className="text-sm">Configura los horarios en tu Perfil.</p>
              </div>
            ) : timeSlots.map((rawHour, hIdx) => {
              const hour = rawHour % 24;
              return (
              <div 
                key={`grid-row-${rawHour}-${hIdx}`} 
                className="flex border-b border-gray-50 group hover:bg-gray-50/30 transition-colors"
                style={{ height: `${rowHeight}px` }}
              >
                {/* Time Label */}
                <div className="w-16 flex-shrink-0 border-r border-gray-100 flex items-start justify-center pt-2 bg-gray-50/30 text-xs font-mono text-gray-400 select-none sticky left-0 z-20 bg-white">
                  {`${hour.toString().padStart(2, '0')}:00`}
                </div>
                
                {/* Court Slots */}
                {selectedCourtIds.map((courtId, index) => (
                  <div 
                    key={`slot-${rawHour}-${courtId}-${index}`} 
                    className={cn(
                      "flex-1 relative p-1 border-r border-gray-50 last:border-r-0 min-w-[90px]",
                      selectedCourtIds.length > 1 && index % 2 === 0 ? "bg-gray-50/10" : ""
                    )}
                  >
                    {(() => {
                      const match = getMatchForSlot(courtId, rawHour);
                      
                      if (match) {
                        const matchStart = new Date(match.start_time);
                        const matchEnd = new Date(match.end_time);
                        const now = new Date();
                        let matchStatus = 'upcoming';

                        if (now > matchEnd) {
                          matchStatus = 'past';
                        } else if (now >= matchStart && now <= matchEnd) {
                          matchStatus = 'live';
                        }

                        // Calculate paid players logic
                        const maxPlayers = match.max_players || 10;
                        const paidPercentage = match.price_total ? (match.amount_paid || 0) / match.price_total : (match.payment_status === 'paid' ? 1 : 0);
                        const paidPlayers = Math.round(paidPercentage * maxPlayers);

                        // Compact view if many courts selected or rowHeight is small
                        const isDetailed = rowHeight >= 75;
                        const isCompact = !isDetailed && selectedCourtIds.length > 2;
                          
                        return (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onMatchClick(match);
                            }}
                            className={cn(
                              "h-full w-full rounded-lg cursor-pointer border shadow-sm transition-all hover:shadow-md flex flex-col justify-between overflow-hidden relative",
                              paidPlayers >= maxPlayers ? "bg-emerald-100 border-emerald-300" :
                              paidPlayers >= 6 ? "bg-yellow-100 border-yellow-300" :
                              "bg-red-100 border-red-300",
                              (matchStatus === "past" && match.payment_status !== 'paid') ? "animate-pulse" : "",
                              rowHeight < 60 ? "p-1" : "p-1.5"
                            )}
                          >
                            <div className={cn("flex gap-1", isCompact ? "flex-col items-start" : "justify-between items-start")}>
                              <div className="font-bold text-xs text-gray-900 truncate flex-1 leading-tight flex items-center gap-1.5 w-full">
                                {matchStatus === 'live' && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                                )}
                                <span className="truncate">{match.host_name}</span>
                              </div>
                              <div className={cn("text-[10px] font-mono font-bold text-gray-900 flex-shrink-0", isCompact ? "mt-0.5" : "ml-auto")}>
                                ${match.price_total?.toLocaleString()}
                              </div>
                            </div>

                            {/* Detailed view extra indicators */}
                            {isDetailed && (
                              <div className="mt-1 pt-1 border-t border-black/5 flex items-center justify-between text-[9px] text-gray-700 font-medium">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded font-bold uppercase text-[8px]",
                                  match.payment_status === 'paid' ? "bg-emerald-200 text-emerald-800" :
                                  match.payment_status === 'partial' ? "bg-yellow-200 text-yellow-800" :
                                  "bg-red-200 text-red-800"
                                )}>
                                  {match.payment_status === 'paid' ? 'Pagado' : match.payment_status === 'partial' ? 'Parcial' : 'Pendiente'}
                                </span>
                                <span className="font-mono text-gray-600">
                                  {paidPlayers}/{maxPlayers} jug.
                                </span>
                              </div>
                            )}
                          </motion.div>
                        );
                      } else {
                        const blockedBy = getBlockedByForSlot(courtId, rawHour);
                        if (blockedBy) {
                          return (
                            <div className="h-full w-full rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center p-1 text-center cursor-not-allowed overflow-hidden">
                              <ShieldCheck size={14} className="text-gray-400 mb-0.5 flex-shrink-0" />
                              <span className="text-[9px] font-bold text-gray-500 leading-tight">Bloqueada por {blockedBy}</span>
                            </div>
                          );
                        } else {
                          return (
                            <div onClick={() => {
                              // We could pass selected date/time/court here, but for now it just triggers modal
                              onNewBooking();
                            }} className="h-full w-full rounded-lg hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-50 border border-transparent hover:border-gray-200 hover:border-dashed">
                              <Plus size={16} className="text-gray-300" />
                            </div>
                          );
                        }
                      }
                    })()}
                  </div>
                ))}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const NewUserModal = ({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (user: any) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    created_at: safeFormatDate(new Date(), 'yyyy-MM-dd'),
    first_visit: safeFormatDate(new Date(), 'yyyy-MM-dd'),
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
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
        className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh] md:max-h-[85vh]"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg">Nuevo Usuario</h3>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <form id="new-user-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              required
              type="email" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input 
              type="tel" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación / Barrio</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Adquisición</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.created_at}
                onChange={e => setFormData({...formData, created_at: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Activación</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.first_visit}
                onChange={e => setFormData({...formData, first_visit: e.target.value})}
              />
            </div>
          </div>
        </form>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl font-medium">Cancelar</button>
          <button type="submit" form="new-user-form" className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700">Guardar Usuario</button>
        </div>
      </motion.div>
    </div>
  );
};

const UsersView = ({ onUserClick, refreshKey, onDataChange }: { onUserClick: (id: number) => void, refreshKey?: number, onDataChange?: () => void }) => {
  const [users, setUsers] = useState<User[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [filters, setFilters] = useState({
    acquisition: 'all', // all, today, week, month
    activation: 'all', // all, today, week, month
    retention: 'all', // all, green, yellow, red
    matches: 'all', // all, 0-5, 5-20, 20+
  });

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/users', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setUsers(Array.isArray(data) ? data : []);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          setUsers([]);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshKey]);

  const fetchUsers = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  };

  const handleCreateUser = async (userData: any) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (res.ok) {
        fetchUsers();
        setShowNewUserModal(false);
        if (onDataChange) onDataChange();
      }
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const filteredUsers = (Array.isArray(users) ? users : []).filter(user => {
    if (!user) return false;
    // Search Filter
    const searchLower = (search || '').toLowerCase();
    const userName = (user.name || '').toLowerCase();
    const userPhone = String(user.phone || '');
    const userAddress = (user.address || '').toLowerCase();

    const matchesSearch = 
      userName.includes(searchLower) ||
      userPhone.includes(searchLower) ||
      userAddress.includes(searchLower);

    if (!matchesSearch) return false;

    const now = new Date();

    // Acquisition Filter
    if (filters.acquisition !== 'all' && user.created_at) {
      const date = safeParseDate(user.created_at);
      if (date) {
        if (filters.acquisition === 'today' && !isSameDay(date, now)) return false;
        if (filters.acquisition === 'week' && !isSameWeek(date, now)) return false;
        if (filters.acquisition === 'month' && !isSameMonth(date, now)) return false;
      }
    }

    // Activation Filter
    if (filters.activation !== 'all' && user.first_visit) {
      const date = safeParseDate(user.first_visit);
      if (date) {
        if (filters.activation === 'today' && !isSameDay(date, now)) return false;
        if (filters.activation === 'week' && !isSameWeek(date, now)) return false;
        if (filters.activation === 'month' && !isSameMonth(date, now)) return false;
      }
    }

    // Retention Filter (Last Game)
    if (filters.retention !== 'all' && user.last_visit) {
      const lastDate = safeParseDate(user.last_visit);
      if (lastDate) {
        const days = differenceInDays(now, lastDate);
        if (filters.retention === 'green' && days > 15) return false;
        if (filters.retention === 'yellow' && (days <= 15 || days > 30)) return false;
        if (filters.retention === 'red' && days <= 30) return false;
      }
    }

    // Matches Played Filter
    if (filters.matches !== 'all') {
      const played = Number(user.matches_played || 0);
      if (filters.matches === '0-5' && played > 5) return false;
      if (filters.matches === '5-20' && (played <= 5 || played > 20)) return false;
      if (filters.matches === '20+' && played <= 20) return false;
    }

    return true;
  });

  return (
    <div className="w-full flex flex-col space-y-4 pb-12">
      <NewUserModal 
        isOpen={showNewUserModal} 
        onClose={() => setShowNewUserModal(false)} 
        onSave={handleCreateUser}
      />
      <div className="space-y-3 shrink-0" ref={parentRef}>
        {/* Search Bar & New User Button */}
        <div className="flex gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} strokeWidth={3} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, teléfono o barrio.." 
              className="pl-9 pr-3 py-2 bg-white dark:bg-slate-800 rounded-[10px] text-xs sm:text-sm w-full outline-none shadow-sm text-gray-700 dark:text-slate-200 font-medium border border-gray-100 dark:border-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            type="button" 
            onClick={() => setShowNewUserModal(true)} 
            className="bg-[#0BA70B] hover:bg-emerald-600 text-white px-3.5 py-2 rounded-[10px] font-bold text-[11px] sm:text-sm shadow-sm active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
          >
            + Nuevo usuario
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          {/* Filter 1 */}
          <div className="relative flex-shrink-0 flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-[8px] shadow-sm text-[10px] sm:text-xs border border-gray-100 dark:border-slate-700">
            <ChevronDown className="text-[#0BA70B]" size={12} strokeWidth={3} />
            <span className="text-gray-800 dark:text-slate-200"><span className="font-bold">Adquisición:</span> {filters.acquisition === 'all' ? 'todos' : filters.acquisition === 'today' ? 'hoy' : filters.acquisition === 'week' ? 'semana' : 'mes'}</span>
            <select 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={filters.acquisition}
              onChange={e => setFilters({...filters, acquisition: e.target.value})}
            >
              <option value="all">Adquisición: Todos</option>
              <option value="today">Hoy</option>
              <option value="week">Esta Semana</option>
              <option value="month">Este Mes</option>
            </select>
          </div>
          
          {/* Filter 2 */}
          <div className="relative flex-shrink-0 flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-[8px] shadow-sm text-[10px] sm:text-xs border border-gray-100 dark:border-slate-700">
            <ChevronDown className="text-[#0BA70B]" size={12} strokeWidth={3} />
            <span className="text-gray-800 dark:text-slate-200"><span className="font-bold">Activación:</span> {filters.activation === 'all' ? 'todos' : filters.activation === 'today' ? 'hoy' : filters.activation === 'week' ? 'semana' : 'mes'}</span>
            <select 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={filters.activation}
              onChange={e => setFilters({...filters, activation: e.target.value})}
            >
              <option value="all">Activación: Todos</option>
              <option value="today">Hoy</option>
              <option value="week">Esta Semana</option>
              <option value="month">Este Mes</option>
            </select>
          </div>
          
          {/* Filter 3 */}
          <div className="relative flex-shrink-0 flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-[8px] shadow-sm text-[10px] sm:text-xs border border-gray-100 dark:border-slate-700">
            <ChevronDown className="text-[#0BA70B]" size={12} strokeWidth={3} />
            <span className="text-gray-800 dark:text-slate-200"><span className="font-bold">Estado:</span> {filters.retention === 'all' ? 'todos' : filters.retention === 'green' ? 'activos' : filters.retention === 'yellow' ? 'en riesgo' : 'inactivos'}</span>
            <select 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={filters.retention}
              onChange={e => setFilters({...filters, retention: e.target.value})}
            >
              <option value="all">Estado: Todos</option>
              <option value="green">Activos</option>
              <option value="yellow">En Riesgo</option>
              <option value="red">Inactivos</option>
            </select>
          </div>
          
          {/* Filter 4 */}
          <div className="relative flex-shrink-0 flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-[8px] shadow-sm text-[10px] sm:text-xs border border-gray-100 dark:border-slate-700">
            <ChevronDown className="text-[#0BA70B]" size={12} strokeWidth={3} />
            <span className="text-gray-800 dark:text-slate-200"><span className="font-bold">Partidos:</span> {filters.matches === 'all' ? 'todos' : filters.matches === '0-5' ? '0-5' : filters.matches === '5-20' ? '5-20' : '20+'}</span>
            <select 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={filters.matches}
              onChange={e => setFilters({...filters, matches: e.target.value})}
            >
              <option value="all">Partidos: Todos</option>
              <option value="0-5">0 a 5 partidos</option>
              <option value="5-20">5 a 20 partidos</option>
              <option value="20+">Más de 20</option>
            </select>
          </div>
        </div>
      </div>

      <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/60 overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-[11px] text-left min-w-[750px] bg-white dark:bg-slate-800">
            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-800/90 text-gray-500 dark:text-slate-400 font-medium whitespace-nowrap shadow-sm shadow-gray-200/50 dark:shadow-none">
              <tr>
                <th className="pl-6 md:pl-4 pr-2 py-3">Usuario</th>
                <th className="px-2 py-3">Teléfono</th>
                <th className="px-2 py-3">Adquisición</th>
                <th className="px-2 py-3">Activación</th>
                <th className="px-2 py-3">Ubicación</th>
                <th className="px-2 py-3 text-center">Partidos</th>
                <th className="px-2 py-3 text-center">Ciclo Vida</th>
                <th className="px-2 py-3">Última Vez</th>
                <th className="px-2 py-3">Estado</th>
                <th className="pr-6 md:pr-4 pl-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {filteredUsers.map((user, uIdx) => {
                if (!user) return null;
                const lastDate = safeParseDate(user.last_visit);
                const daysSinceLastPlay = lastDate ? differenceInDays(new Date(), lastDate) : 0;
                const firstDate = safeParseDate(user.first_visit);
                const lifecycleDays = firstDate ? differenceInDays(new Date(), firstDate) : 0;
                
                return (
                  <tr 
                    key={`user-row-${user.id || uIdx}-${uIdx}`} 
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors cursor-pointer group" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUserClick(user.id);
                    }}
                  >
                    <td className="pl-6 md:pl-4 pr-2 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-300 border-2 border-white dark:border-slate-800 shadow-sm flex-shrink-0 text-xs">
                          {user.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 max-w-[130px]">
                          <div className="font-medium text-gray-900 dark:text-slate-100 truncate">{user.name}</div>
                          <div className="text-[9px] text-gray-500 dark:text-slate-400 truncate">{user.email?.includes('sin-correo.com') ? 'Sin correo' : user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400 font-mono text-[10px] whitespace-nowrap">{user.phone || '-'}</td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400">{safeFormatDate(user.created_at, 'dd/MM/yy')}</td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400">{safeFormatDate(user.first_visit, 'dd/MM/yy')}</td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400 max-w-[100px] truncate" title={user.address}>{user.address || '-'}</td>
                    <td className="px-2 py-3 font-medium text-center">
                      <span className="bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 px-2 py-0.5 rounded-md">{user.matches_played ?? 0}</span>
                    </td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400 text-center">{lifecycleDays}d</td>
                    <td className="px-2 py-3 text-gray-500 dark:text-slate-400">
                      <div>{safeFormatDate(user.last_visit, 'dd/MM/yy')}</div>
                      {user.last_visit && <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Hace {daysSinceLastPlay} días</div>}
                    </td>
                    <td className="px-2 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide border",
                        daysSinceLastPlay <= 15 ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60" :
                        daysSinceLastPlay <= 30 ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/60" :
                        "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/60"
                      )}>
                        {daysSinceLastPlay <= 15 ? 'Activo' : daysSinceLastPlay <= 30 ? 'Riesgo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="pr-6 md:pr-4 pl-2 py-3 text-right">
                      <ChevronRight size={14} className="text-gray-300 dark:text-slate-500 group-hover:text-gray-500 dark:group-hover:text-slate-300 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">
            No se encontraron usuarios con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
};

const AnalyticsView = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/analytics', { signal: controller.signal })
      .then(res => res.json())
      .then(resData => {
        if (isMounted) {
          setData(resData);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          setData({ cohorts: [] });
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (!data) return <div className="p-6 text-center text-gray-500">Cargando...</div>;

  const cohortsList = Array.isArray(data?.cohorts) ? data.cohorts : [];

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

const FinanceChartModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [chartPeriod, setChartPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [chartData, setChartData] = useState<any[]>([]);
  
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const controller = new AbortController();
    const clientDate = new Date().toLocaleDateString('en-CA');

    fetch(`/api/finance?period=${chartPeriod}&clientDate=${clientDate}`, { signal: controller.signal })
      .then(res => res.json())
      .then(finData => {
        if (!isMounted) return;
        let incomeTx = Array.isArray(finData?.transactions) ? finData.transactions.filter((t: any) => t.type === 'income') : [];
        if (chartPeriod === 'today') {
          incomeTx = incomeTx.filter((t: any) => {
            const parsed = safeParseDate(t?.date);
            return parsed ? isSameDay(parsed, new Date()) : false;
          });
        }
        let grouped: Record<string, number> = {};
        
        incomeTx.forEach((tx: any) => {
          const dateObj = new Date(tx.date);
          let key = '';
          
          if (chartPeriod === 'today') {
            key = dateObj.getHours().toString().padStart(2, '0') + ':00';
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
           for(let i=8; i<=23; i++) hours.push(i.toString().padStart(2, '0') + ':00');
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

        if (isMounted) {
          setChartData(dataArray);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) {
          setChartData([]);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [chartPeriod, isOpen]);

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

const FinanceView = () => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [txFilterTab, setTxFilterTab] = useState<'all' | 'income' | 'expense'>('all');
  const [summaries, setSummaries] = useState<Record<string, { income: number, expense: number, balance: number, reservas: number, otros: number, pendiente: number, growth: number, ocupacion: number }>>({
    today: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
    week: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
    month: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
    year: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 }
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [newTx, setNewTx] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '',
    category: 'Alquiler de Cancha',
    paymentMethod: 'Transferencia',
    description: ''
  });
  const [customCategory, setCustomCategory] = useState('');

  const periods = ['today', 'week', 'month'];

  const changePeriod = (newPeriod: string) => {
    setPeriod(newPeriod as any);
  };

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 50;
    if (info.offset.x < -swipeThreshold) {
      // swipe left (next period)
      const currentIndex = periods.indexOf(period);
      if (currentIndex < periods.length - 1) {
        setPeriod(periods[currentIndex + 1] as any);
      }
    } else if (info.offset.x > swipeThreshold) {
      // swipe right (prev period)
      const currentIndex = periods.indexOf(period);
      if (currentIndex > 0) {
        setPeriod(periods[currentIndex - 1] as any);
      }
    }
  };
  
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const todayStr = new Date().toLocaleDateString('en-CA');
        
        // Fetch current period transactions
        const res = await fetch(`/api/finance?period=${period}&clientDate=${todayStr}`, { signal: controller.signal });
        const finData = await res.json();
        if (!isMounted) return;
        
        // Client-side timezone correction for 'today'
        let finalTransactions = Array.isArray(finData?.transactions) ? finData.transactions : [];
        if (period === 'today') {
          finalTransactions = finalTransactions.filter((t: any) => {
            const parsed = safeParseDate(t?.date);
            return parsed ? isSameDay(parsed, new Date()) : false;
          });
        }
        setTransactions(finalTransactions);
        
        // Fetch all summaries to allow seamless peeking during swipe
        const allSummaries = { ...summaries };
        
        for (const p of periods) {
          if (!isMounted) return;
          let pTransactions = p === period ? (Array.isArray(finData?.transactions) ? finData.transactions : []) : null;
          let sumData = p === period ? finData?.summary : null;
          
          if (!sumData) {
            const pRes = await fetch(`/api/finance?period=${p}&clientDate=${todayStr}`, { signal: controller.signal });
            const pData = await pRes.json();
            if (!isMounted) return;
            sumData = pData?.summary || {};
            pTransactions = Array.isArray(pData?.transactions) ? pData.transactions : [];
          }
          
          // Client-side recalculation for 'today' to avoid timezone bugs
          if (p === 'today' && pTransactions) {
            const todayTxs = pTransactions.filter((t: any) => {
              const parsed = safeParseDate(t?.date);
              return parsed ? isSameDay(parsed, new Date()) : false;
            });
            const incomeTotal = todayTxs.filter((t: any) => t.type === 'income').reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            const expenseTotal = todayTxs.filter((t: any) => t.type === 'expense').reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            const reservasTotal = todayTxs.filter((t: any) => t.type === 'income' && t.category && String(t.category).includes('Alquiler')).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            
            allSummaries[p] = {
              income: incomeTotal,
              expense: expenseTotal,
              balance: incomeTotal - expenseTotal,
              reservas: reservasTotal,
              otros: incomeTotal - reservasTotal,
              pendiente: Number(sumData?.pendiente) || 0,
              growth: Number(sumData?.growth) || 0,
              ocupacion: Number(sumData?.ocupacion) || 0
            };
          } else {
            const incomeTotal = Number(sumData?.income) || 0;
            const expenseTotal = Number(sumData?.expense) || 0;
            allSummaries[p] = { 
              income: incomeTotal, 
              expense: expenseTotal, 
              balance: incomeTotal - expenseTotal,
              reservas: Number(sumData?.reservas) || 0,
              otros: Number(sumData?.otros) || 0,
              pendiente: Number(sumData?.pendiente) || 0,
              growth: Number(sumData?.growth) || 0,
              ocupacion: Number(sumData?.ocupacion) || 0
            };
          }
        }
        if (isMounted) {
          setSummaries(allSummaries);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error('Error fetching finance data:', e);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [period]);

  const fetchFinanceData = async () => {
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/finance?period=${period}&clientDate=${todayStr}`);
      const finData = await res.json();
      let finalTransactions = Array.isArray(finData?.transactions) ? finData.transactions : [];
      if (period === 'today') {
        finalTransactions = finalTransactions.filter((t: any) => {
          const parsed = safeParseDate(t?.date);
          return parsed ? isSameDay(parsed, new Date()) : false;
        });
      }
      setTransactions(finalTransactions);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.amount) return;
    
    const categoryToSave = newTx.category === 'Otro' && customCategory 
      ? customCategory 
      : newTx.category;

    const notesWithMethod = `${newTx.paymentMethod} - ${newTx.description}`;

    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: newTx.type,
        category: categoryToSave,
        amount: Number(newTx.amount),
        description: notesWithMethod
      })
    });
    
    setIsModalOpen(false);
    setNewTx({ type: 'income', amount: '', category: 'Alquiler de Cancha', paymentMethod: 'MercadoPago', description: '' });
    setCustomCategory('');
    fetchFinanceData();
  };

  const filteredTransactions = transactions.filter(t => {
    if (txFilterTab === 'all') return true;
    return t.type === txFilterTab;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* 1. Cabecera (Resumen Financiero) */}
      <div className="px-1 md:px-0">
        <div className="flex justify-between items-end mb-0">
          <div className="pb-3 pl-1 md:pl-2">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 whitespace-nowrap tracking-tight">
              {period === 'today' ? '¿Cómo te fue hoy?' : period === 'week' ? '¿Cómo te fue esta semana?' : '¿Cómo te fue este mes?'}
            </h2>
          </div>
          <div className="flex items-end relative z-10">
            {['today', 'week', 'month'].map((p, pIdx) => (
              <button type="button"
                key={`fin-period-btn-${p}-${pIdx}`}
                onClick={() => changePeriod(p)}
                className={cn(
                  "px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-xs sm:text-sm font-bold rounded-t-2xl transition-all relative",
                  period === p 
                    ? "bg-white text-emerald-600 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.1)]" 
                    : "bg-transparent text-gray-400 hover:text-gray-600"
                )}
              >
                {p === 'today' ? 'Hoy' : p === 'week' ? 'Sem' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl rounded-tr-none md:rounded-tr-3xl shadow-sm border border-gray-100 p-6 relative z-20 -mt-px w-full">
          <div className="w-full touch-pan-y" style={{ overflowX: 'clip', overflowY: 'visible' }}>
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={handleDragEnd}
              animate={{ x: `calc(-${periods.indexOf(period) * 100}% - ${periods.indexOf(period) * 16}px)` }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              className="flex w-full cursor-grab active:cursor-grabbing gap-4"
            >
              {periods.map((p, pIdx) => {
                const s = summaries[p] || { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 };
                const isPositiveGrowth = s.growth >= 0;

                return (
                  <div key={`finance-summary-slide-${p}-${pIdx}`} className="w-full shrink-0 flex flex-col justify-center">
                    {p === 'month' ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-gray-500 text-sm sm:text-base font-medium">
                          <span>Ingresos</span>
                          <span>+${s.income.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-500 text-sm sm:text-base font-medium border-b border-gray-100 pb-4">
                          <span>Egresos</span>
                          <span>-${s.expense.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col pt-2">
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-sm sm:text-base text-gray-900 font-bold">Resultado neto</div>
                            <div className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                              ${s.balance.toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center whitespace-nowrap shrink-0",
                              isPositiveGrowth ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            )}>
                              {isPositiveGrowth ? '+' : ''}{s.growth}% {isPositiveGrowth ? '↑' : '↓'}
                            </span>
                            <span className="text-xs text-gray-500 font-medium whitespace-nowrap shrink-0">del mes anterior</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm sm:text-base font-bold text-gray-900">Ingresos</span>
                              <Eye size={20} className="text-emerald-600" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn(
                                "text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center whitespace-nowrap shrink-0",
                                isPositiveGrowth ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                              )}>
                                {isPositiveGrowth ? '+' : ''}{s.growth}% {isPositiveGrowth ? '↑' : '↓'}
                              </span>
                              <span className="text-xs text-gray-500 font-medium whitespace-nowrap shrink-0">
                                {p === 'today' ? 'de ayer' : 'de sem anterior'}
                              </span>
                            </div>
                          </div>
                          <div className="text-xl sm:text-2xl md:text-3xl font-black text-emerald-600 tracking-tight">
                            ${s.income.toLocaleString()}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                          <div 
                            className="relative bg-emerald-50 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-emerald-100 active:scale-95"
                            onMouseEnter={() => setActiveTooltip('reservas-' + p)}
                            onMouseLeave={() => setActiveTooltip(null)}
                            onTouchStart={() => setActiveTooltip('reservas-' + p)}
                            onTouchEnd={() => setActiveTooltip(null)}
                          >
                            <AnimatePresence>
                              {activeTooltip === 'reservas-' + p && (
                                <motion.div 
                                  key={`tooltip-reservas-${p}`}
                                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                  className="absolute bottom-full mb-2 left-0 sm:left-1/2 sm:-translate-x-1/2 w-40 bg-gray-900 text-white text-[10px] sm:text-xs font-medium px-3 py-2 rounded-xl shadow-xl z-50 pointer-events-none"
                                >
                                  Ingresos por alquiler de canchas
                                  <div className="absolute top-full left-10 sm:left-1/2 sm:-translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                            <CalendarCheck size={18} className="text-emerald-700 mb-1" />
                            <span className="text-emerald-600 text-xs sm:text-sm font-bold truncate w-full">
                              {p === 'today' 
                                ? `${s.reservas.toLocaleString()}` 
                                : `${s.income > 0 ? Math.round((s.reservas / s.income) * 100) : 0}%`}
                            </span>
                          </div>

                          <div 
                            className="relative bg-emerald-50 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-emerald-100 active:scale-95"
                            onMouseEnter={() => setActiveTooltip('otros-' + p)}
                            onMouseLeave={() => setActiveTooltip(null)}
                            onTouchStart={() => setActiveTooltip('otros-' + p)}
                            onTouchEnd={() => setActiveTooltip(null)}
                          >
                            <AnimatePresence>
                              {activeTooltip === 'otros-' + p && (
                                <motion.div 
                                  key={`tooltip-otros-${p}`}
                                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-40 bg-gray-900 text-white text-[10px] sm:text-xs font-medium px-3 py-2 rounded-xl shadow-xl z-50 pointer-events-none"
                                >
                                  Ingresos por buffet, tienda y otros
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                            <ShoppingBag size={18} className="text-emerald-700 mb-1" />
                            <span className="text-emerald-600 text-xs sm:text-sm font-bold truncate w-full">
                              {p === 'today' 
                                ? `${s.otros.toLocaleString()}` 
                                : `${s.income > 0 ? Math.round((s.otros / s.income) * 100) : 0}%`}
                            </span>
                          </div>

                          {p === 'today' ? (
                            <div 
                              className="relative bg-red-50 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-red-100 active:scale-95"
                              onMouseEnter={() => setActiveTooltip('pendiente-' + p)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onTouchStart={() => setActiveTooltip('pendiente-' + p)}
                              onTouchEnd={() => setActiveTooltip(null)}
                            >
                              <AnimatePresence>
                                {activeTooltip === 'pendiente-' + p && (
                                  <motion.div 
                                    key={`tooltip-pendiente-${p}`}
                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-[150px] bg-gray-900 text-white text-[10px] sm:text-xs font-medium px-3 py-2 rounded-xl shadow-xl z-50 pointer-events-none"
                                  >
                                    Pagos pendientes de cobro
                                    <div className="absolute top-full right-10 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              <Clock size={18} className="text-red-700 mb-1" />
                              <span className="text-red-600 text-xs sm:text-sm font-bold truncate w-full">
                                ${s.pendiente.toLocaleString()}
                              </span>
                            </div>
                          ) : (
                            <div 
                              className="relative bg-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-gray-200 active:scale-95"
                              onMouseEnter={() => setActiveTooltip('ocupacion-' + p)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onTouchStart={() => setActiveTooltip('ocupacion-' + p)}
                              onTouchEnd={() => setActiveTooltip(null)}
                            >
                              <AnimatePresence>
                                {activeTooltip === 'ocupacion-' + p && (
                                  <motion.div 
                                    key={`tooltip-ocupacion-${p}`}
                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-40 bg-gray-900 text-white text-[10px] sm:text-xs font-medium px-3 py-2 rounded-xl shadow-xl z-50 pointer-events-none"
                                  >
                                    Porcentaje de turnos ocupados
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              <Users size={18} className="text-gray-600 mb-1" />
                              <span className="text-gray-600 text-xs sm:text-sm font-bold truncate w-full">
                                {s.ocupacion}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </div>
      {/* 2. Pestañas de Navegación Interna */}
      <div className="flex gap-2 overflow-x-auto px-2 py-2 no-scrollbar">
        {[
          { id: 'all', label: 'Flujo de Caja' },
          { id: 'income', label: 'Ingresos Detallados' },
          { id: 'expense', label: 'Egresos Detallados' }
        ].map((tab, tIdx) => (
          <button type="button"
            key={`fin-internal-tab-${tab.id}-${tIdx}`}
            onClick={() => setTxFilterTab(tab.id as any)}
            className={cn(
              "px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all cursor-pointer",
              txFilterTab === tab.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                : "bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-300 border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Lista de Transacciones */}
      <div className="pb-6">
        {Object.entries(
          filteredTransactions.reduce((acc: any, tx: any) => {
            const dateStr = safeFormatDate(tx.date, "d 'de' MMMM", { locale: es }) || 'Otras fechas';
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(tx);
            return acc;
          }, {})
        ).map(([date, txs]: [string, any], gIdx: number) => (
          <div key={`tx-group-${date}-${gIdx}`} className="mb-6">
            <h3 className="font-bold text-gray-900 mb-2">{date}</h3>
            <div className="">
              {txs.map((tx: any, index: number) => (
                <div key={`tx-${tx.id || 'none'}-${gIdx}-${index}`} onClick={() => setSelectedTx(tx)} className={cn(
                  "py-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 rounded-xl px-2 -mx-2 transition-colors",
                  index !== txs.length - 1 ? "border-b border-gray-100 dark:border-slate-800" : ""
                )}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 border border-gray-200">
                      {tx.category?.includes('Alquiler') ? <Calendar size={18} /> :
                       tx.category?.includes('Buffet') ? <Coffee size={18} /> :
                       tx.category?.includes('Mantenimiento') ? <Wallet size={18} /> :
                       <DollarSign size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-[13px] sm:text-sm whitespace-nowrap tracking-tight">{tx.category}</div>
                      {tx.description && <div className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">{tx.description}</div>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={cn(
                      "font-bold text-sm whitespace-nowrap",
                      tx.type === 'income' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {tx.type === 'income' ? '+ ' : '- '}${tx.amount.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {safeFormatDate(tx.date, "HH:mm", { locale: es })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filteredTransactions.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No hay transacciones en este periodo
          </div>
        )}
        
        {/* 4. Sección de Movimiento en Gráfico Circular (Donut) */}
        {(() => {
          const incomeTx = transactions.filter(t => t.type === 'income');
          const expenseTx = transactions.filter(t => t.type === 'expense');

          const totalIncome = incomeTx.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          const totalExpense = expenseTx.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          const grandTotal = totalIncome + totalExpense;

          const getCategoryGroup = (type: 'income' | 'expense', rawCategory: string = '') => {
            const cat = (rawCategory || '').toLowerCase();
            if (type === 'income') {
              if (cat.includes('alquiler') || cat.includes('cancha') || cat.includes('reserva') || cat.includes('booking')) return 'Alquiler';
              if (cat.includes('buffet') || cat.includes('kiosco') || cat.includes('bar') || cat.includes('bebida') || cat.includes('snack') || cat.includes('comida')) return 'Buffet';
              if (cat.includes('torneo') || cat.includes('campeonato') || cat.includes('competencia')) return 'Torneos';
              if (cat.includes('clase') || cat.includes('escuelita') || cat.includes('entren')) return 'Clases / Escuelita';
              return rawCategory || 'Otros Ingresos';
            } else {
              if (cat.includes('mantenimiento') || cat.includes('repar') || cat.includes('obra') || cat.includes('pintura')) return 'Mantenimiento';
              if (cat.includes('mercader') || cat.includes('insumo') || cat.includes('buffet') || cat.includes('stock')) return 'Mercadería / Buffet';
              if (cat.includes('servicio') || cat.includes('luz') || cat.includes('agua') || cat.includes('gas') || cat.includes('internet')) return 'Servicios';
              if (cat.includes('personal') || cat.includes('sueldo') || cat.includes('arbitr') || cat.includes('limpieza') || cat.includes('emplead')) return 'Personal / Sueldos';
              return rawCategory || 'Otros Egresos';
            }
          };

          const incomeColors = ['#0BA70B', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#15803d'];
          const expenseColors = ['#ef4444', '#dc2626', '#f87171', '#b91c1c', '#fca5a5', '#991b1b'];

          const incomeCategories = Object.entries(
            incomeTx.reduce((acc: Record<string, { total: number, count: number }>, tx) => {
              const group = getCategoryGroup('income', tx.category);
              if (!acc[group]) acc[group] = { total: 0, count: 0 };
              acc[group].total += Number(tx.amount) || 0;
              acc[group].count += 1;
              return acc;
            }, {})
          ).map(([name, data], idx) => ({
            name,
            type: 'income' as const,
            typeLabel: 'Ingreso',
            amount: data.total,
            count: data.count,
            color: incomeColors[idx % incomeColors.length],
            percentageOfIncome: totalIncome > 0 ? Math.round((data.total / totalIncome) * 100) : 0,
            percentageOfTotal: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
          })).sort((a, b) => b.amount - a.amount);

          const expenseCategories = Object.entries(
            expenseTx.reduce((acc: Record<string, { total: number, count: number }>, tx) => {
              const group = getCategoryGroup('expense', tx.category);
              if (!acc[group]) acc[group] = { total: 0, count: 0 };
              acc[group].total += Number(tx.amount) || 0;
              acc[group].count += 1;
              return acc;
            }, {})
          ).map(([name, data], idx) => ({
            name,
            type: 'expense' as const,
            typeLabel: 'Egreso',
            amount: data.total,
            count: data.count,
            color: expenseColors[idx % expenseColors.length],
            percentageOfExpense: totalExpense > 0 ? Math.round((data.total / totalExpense) * 100) : 0,
            percentageOfTotal: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
          })).sort((a, b) => b.amount - a.amount);

          // Combined pie segments: Incomes (Verde Jogo spectrum) + Expenses (Red spectrum)
          const pieData = [...incomeCategories, ...expenseCategories];

          if (grandTotal === 0) {
            return null;
          }

          return (
            <div className="mt-8 mb-20 bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700/80">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">Movimiento</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Ingresos y egresos por categoría</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0BA70B] bg-[#0BA70B]/10 px-2.5 py-1 rounded-full">
                    +${totalIncome.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full">
                    -${totalExpense.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Circular (Donut) Chart */}
              <div className="relative h-64 w-full flex items-center justify-center my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={84}
                      paddingAngle={3}
                      dataKey="amount"
                      nameKey="name"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell 
                          key={`movement-pie-cell-${entry.name}-${index}`} 
                          fill={entry.color} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          const isInc = d.type === 'income';
                          return (
                            <div className="bg-slate-900/95 text-white px-3 py-2 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                                <span>{d.name}</span>
                                <span className={isInc ? "text-[#0BA70B] text-[10px]" : "text-red-400 text-[10px]"}>
                                  ({d.typeLabel})
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 text-slate-300">
                                <span>Monto:</span>
                                <strong className="text-white">${d.amount.toLocaleString()}</strong>
                              </div>
                              <div className="flex justify-between gap-4 text-slate-300">
                                <span>% {d.typeLabel}:</span>
                                <strong className={isInc ? "text-[#0BA70B]" : "text-red-400"}>
                                  {isInc ? d.percentageOfIncome : d.percentageOfExpense}%
                                </strong>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Badge / Balance in the donut hole */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-slate-500">
                    Neto
                  </span>
                  <span className={cn(
                    "text-sm sm:text-base font-black tracking-tight",
                    (totalIncome - totalExpense) >= 0 ? "text-[#0BA70B]" : "text-red-600 dark:text-red-400"
                  )}>
                    {(totalIncome - totalExpense) >= 0 ? '+' : '-'}${Math.abs(totalIncome - totalExpense).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Breakdown by side: Left = Ingresos (Verde Jogo), Right = Egresos (Rojo) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-slate-700/60 mt-2">
                {/* Lado Ingresos (Verde Jogo) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0BA70B]"></span>
                      <span className="text-xs font-black uppercase tracking-wider text-[#0BA70B]">
                        Ingresos ({incomeTx.length})
                      </span>
                    </div>
                    <span className="text-xs font-black text-[#0BA70B]">
                      +${totalIncome.toLocaleString()}
                    </span>
                  </div>

                  {incomeCategories.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-2">Sin ingresos registrados</div>
                  ) : (
                    <div className="space-y-2">
                      {incomeCategories.map((cat, idx) => (
                        <div key={`pie-inc-cat-${cat.name}-${idx}`} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-gray-700 dark:text-slate-300 font-medium truncate">
                              {cat.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-bold text-gray-900 dark:text-white">
                              ${cat.amount.toLocaleString()}
                            </span>
                            <span className="text-gray-400 dark:text-slate-400 font-semibold w-8 text-right text-[11px]">
                              {cat.percentageOfIncome}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lado Egresos (Rojo) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                      <span className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                        Egresos ({expenseTx.length})
                      </span>
                    </div>
                    <span className="text-xs font-black text-red-600 dark:text-red-400">
                      -${totalExpense.toLocaleString()}
                    </span>
                  </div>

                  {expenseCategories.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-2">Sin egresos registrados</div>
                  ) : (
                    <div className="space-y-2">
                      {expenseCategories.map((cat, idx) => (
                        <div key={`pie-exp-cat-${cat.name}-${idx}`} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-gray-700 dark:text-slate-300 font-medium truncate">
                              {cat.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-bold text-gray-900 dark:text-white">
                              ${cat.amount.toLocaleString()}
                            </span>
                            <span className="text-gray-400 dark:text-slate-400 font-semibold w-8 text-right text-[11px]">
                              {cat.percentageOfExpense}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 4. Botón Flotante */}
      <button type="button" 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-xl shadow-emerald-900/30 flex items-center justify-center hover:bg-emerald-700 transition-transform hover:scale-105 z-40"
      >
        <Plus size={28} />
      </button>

      {/* 5. Modal de Carga Manual */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            key="modal-new-tx-backdrop"
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsModalOpen(false);
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsModalOpen(false);
                  }} 
                  className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form className="space-y-6" onSubmit={handleSaveTx}>
                {/* Tipo de Movimiento */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    type="button" 
                    onClick={() => {
                      setNewTx({...newTx, type: 'income', category: 'Alquiler de Cancha'});
                    }}
                    className={cn("flex-1 py-3 rounded-lg text-sm font-bold transition-all", newTx.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  >Ingreso</button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setNewTx({...newTx, type: 'expense', category: 'Mantenimiento'});
                    }}
                    className={cn("flex-1 py-3 rounded-lg text-sm font-bold transition-all", newTx.type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  >Egreso</button>
                </div>

                {/* Monto */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">$</span>
                    <input 
                      type="number" 
                      value={newTx.amount}
                      onChange={e => setNewTx({...newTx, amount: e.target.value})}
                      className="w-full pl-10 pr-4 py-4 bg-gray-50 rounded-2xl text-3xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500" 
                      placeholder="0" 
                      required
                    />
                  </div>
                </div>

                {/* Categoría */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">Categoría</label>
                  <select 
                    value={newTx.category}
                    onChange={e => setNewTx({...newTx, category: e.target.value})}
                    className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none mb-2"
                  >
                    {newTx.type === 'income' ? (
                      <>
                        <option>Alquiler de Cancha</option>
                        <option>Venta Buffet/Kiosco</option>
                        <option>Torneos</option>
                        <option>Clases / Escuelita</option>
                        <option>Otro</option>
                      </>
                    ) : (
                      <>
                        <option>Mantenimiento</option>
                        <option>Mercadería / Buffet</option>
                        <option>Servicios (Luz, Agua)</option>
                        <option>Personal / Sueldos</option>
                        <option>Otro</option>
                      </>
                    )}
                  </select>
                  {newTx.category === 'Otro' && (
                    <input 
                      type="text"
                      className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Escribe la categoría..."
                      value={customCategory}
                      onChange={e => setCustomCategory(e.target.value)}
                      required
                    />
                  )}
                </div>

                {/* Método de Pago */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">Método de Pago</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Efectivo', 'Transferencia', 'Tarjeta', 'MercadoPago'].map((m, mIdx) => (
                      <button 
                        key={`payment-method-btn-${m}-${mIdx}`} 
                        type="button" 
                        onClick={() => setNewTx({...newTx, paymentMethod: m})}
                        className={cn(
                          "py-3 px-4 rounded-xl border text-sm font-medium transition-all",
                          newTx.paymentMethod === m 
                            ? "border-emerald-500 text-emerald-600 bg-emerald-50" 
                            : "border-gray-200 text-gray-600 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">Notas (Opcional)</label>
                  <textarea 
                    value={newTx.description}
                    onChange={e => setNewTx({...newTx, description: e.target.value})}
                    className="w-full p-4 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none" 
                    rows={2} 
                    placeholder="Detalles adicionales..."
                  ></textarea>
                </div>

                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 hover:bg-emerald-700 transform active:scale-95 transition-all">
                  Guardar Transacción
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTx && (
          <div 
            key="modal-tx-detail-backdrop"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedTx(null);
            }}
          >
            <motion.div 
              key="modal-tx-detail-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Detalles de Transacción</h2>
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedTx(null);
                  }} 
                  className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-900 font-bold text-sm">Tipo</span>
                  <span className="text-gray-500 text-sm">
                    {selectedTx.type === 'income' ? 'Ingreso' : 'Egreso'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-900 font-bold text-sm">Categoría</span>
                  <span className="text-gray-500 text-sm">{selectedTx.category}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-900 font-bold text-sm">Monto</span>
                  <span className="text-gray-500 text-sm">${selectedTx.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-900 font-bold text-sm">Fecha</span>
                  <span className="text-gray-500 text-sm">{safeFormatDate(selectedTx.date, "d 'de' MMMM, yyyy", { locale: es })}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-900 font-bold text-sm">Método de Pago</span>
                  <span className="text-gray-500 text-sm">Efectivo</span>
                </div>
                {selectedTx.description && (
                  <div>
                    <span className="text-gray-900 font-bold text-sm block mb-1">Descripción</span>
                    <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-xl">{selectedTx.description}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ProfileView = ({ onDataChange, isDarkMode, onToggleDarkMode }: { onDataChange?: () => void, isDarkMode?: boolean, onToggleDarkMode?: () => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  
  // Modals
  const [editSection, setEditSection] = useState<'info' | 'hours' | 'court' | null>(null);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editingHourIndex, setEditingHourIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState([
    { id: '1', url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80' },
    { id: '2', url: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80' }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadProfileData = async () => {
      try {
        const [venueRes, courtsRes] = await Promise.all([
          fetch('/api/venue', { signal: controller.signal }),
          fetch('/api/courts', { signal: controller.signal })
        ]);
        const venueData = await venueRes.json();
        const courtsData = await courtsRes.json();
        if (isMounted) {
          setProfile(venueData);
          setCourts(Array.isArray(courtsData) ? courtsData : []);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isMounted) {
          console.error('Error fetching profile data:', err);
        }
      }
    };

    loadProfileData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [venueRes, courtsRes] = await Promise.all([
        fetch('/api/venue'),
        fetch('/api/courts')
      ]);
      const venueData = await venueRes.json();
      const courtsData = await courtsRes.json();
      setProfile(venueData);
      setCourts(Array.isArray(courtsData) ? courtsData : []);
    } catch (err) {
      console.error('Error refreshing profile data:', err);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await fetch('/api/venue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    setIsSaving(false);
    setHasChanges(false);
    setEditSection(null);
    if (onDataChange) onDataChange();
  };

  const handleSaveCourt = async (court: any) => {
    setIsSaving(true);
    const method = court.id ? 'PUT' : 'POST';
    const url = court.id ? `/api/courts/${court.id}` : '/api/courts';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(court)
    });
    
    setIsSaving(false);
    setEditingCourt(null);
    setEditSection(null);
    fetchData(); // Refresh courts
    if (onDataChange) onDataChange();
  };

  const handleToggleCourtStatus = async (court: Court) => {
    const newStatus: 'available' | 'maintenance' = court.status === 'maintenance' ? 'available' : 'maintenance';
    const updatedCourt: Court = { ...court, status: newStatus };
    
    // Optimistic update
    setCourts(courts.map(c => c.id === court.id ? updatedCourt : c));
    
    await fetch(`/api/courts/${court.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedCourt)
    });
  };

  const handleDeleteCourt = async (id: number) => {
    await fetch(`/api/courts/${id}`, { method: 'DELETE' });
    fetchData();
    if (onDataChange) onDataChange();
  };

  if (!profile) return <div className="p-6 text-center">Cargando perfil...</div>;

  return (
    <div className="bg-gray-50 min-h-full pb-24">
      <div className="pt-6 px-6 pb-2 flex justify-end">
        <button type="button" 
          onClick={() => setEditSection('info')}
          className="p-2 bg-white border border-gray-200 rounded-full text-emerald-600 shadow-sm"
        >
          <Edit3 size={20} />
        </button>
      </div>

      <div className="px-4 space-y-4">
        {/* 2. Información General */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Información General</h3>
            <button type="button" onClick={() => setEditSection('info')} className="text-emerald-600 font-bold text-xs">Editar</button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Store className="text-gray-400 mt-1" size={18} />
              <div>
                <div className="text-sm font-bold text-gray-900">Nombre</div>
                <div className="text-sm text-gray-500">{profile.name}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="text-gray-400 mt-1" size={18} />
              <div>
                <div className="text-sm font-bold text-gray-900">Dirección</div>
                <div className="text-sm text-gray-500">{profile.address}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="text-gray-400 mt-1" size={18} />
              <div>
                <div className="text-sm font-bold text-gray-900">Teléfono</div>
                <div className="text-sm text-gray-500">{profile.phone}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Instagram className="text-gray-400 mt-1" size={18} />
              <div>
                <div className="text-sm font-bold text-gray-900">Instagram</div>
                <div className="text-sm text-gray-500">{profile.instagram}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Fotos */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Fotos del Complejo</h3>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const url = URL.createObjectURL(e.target.files[0]);
                  setPhotos([...photos, { id: Math.random().toString(), url }]);
                }
              }} 
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-emerald-600 font-bold text-xs flex items-center gap-1">
              <Plus size={14} /> Agregar
            </button>
          </div>
          <div className="p-4">
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {photos.map((photo, pIdx) => (
                <div 
                  key={`venue-photo-${photo.id || pIdx}-${pIdx}`} 
                  className="w-32 h-24 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200 relative group"
                >
                  <img src={photo.url} className="w-full h-full object-cover" alt="Cancha" />
                  <button type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotos(photos.filter(p => p.id !== photo.id));
                    }}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-full transition-all cursor-pointer shadow-sm"
                    title="Eliminar foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className="w-32 h-24 rounded-lg bg-gray-50 flex-shrink-0 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer"
              >
                <Camera size={24} />
                <span className="text-[10px] font-bold mt-1">Subir Foto</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-2">Toca el botón con la cruz para eliminar fotos o sube nuevas fotos del complejo.</p>
          </div>
        </div>

        {/* 4. Horarios de Apertura */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Horarios de Apertura</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {(profile.hours || []).map((h: any, i: number) => (
              <div 
                key={`venue-hour-${h.day || 'h'}-${i}`} 
                className="flex justify-between items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors active:bg-gray-100"
                onClick={() => {
                  setEditingHourIndex(i);
                }}
              >
                <span className="font-medium text-gray-700 capitalize w-24">{h.day}</span>
                
                {editingHourIndex === i ? (
                  <div className="flex items-center gap-1.5 flex-1 justify-end" onClick={e => e.stopPropagation()}>
                    <button type="button" 
                      onClick={() => {
                        const newHours = [...profile.hours];
                        newHours[i].open = !newHours[i].open;
                        setProfile({...profile, hours: newHours});
                      }}
                      className={cn("px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors whitespace-nowrap", h.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}
                    >
                      {h.open ? 'Abi' : 'Cer'}
                    </button>
                    
                    {h.open && (
                      <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                        <input 
                          type="time" 
                          value={h.start} 
                          onChange={e => {
                            const newHours = [...profile.hours];
                            newHours[i].start = e.target.value;
                            setProfile({...profile, hours: newHours});
                          }}
                          className="bg-transparent px-1 py-0.5 text-xs font-medium w-[70px] text-center focus:outline-none text-gray-700"
                        />
                        <span className="text-gray-300">-</span>
                        <input 
                          type="time" 
                          value={h.end} 
                          onChange={e => {
                            const newHours = [...profile.hours];
                            newHours[i].end = e.target.value;
                            setProfile({...profile, hours: newHours});
                          }}
                          className="bg-transparent px-1 py-0.5 text-xs font-medium w-[70px] text-center focus:outline-none text-gray-700"
                        />
                      </div>
                    )}
                    
                    <button type="button" 
                      onClick={(e) => { 
                        e.stopPropagation();
                        handleSaveProfile(); 
                        setEditingHourIndex(null); 
                      }} 
                      className="bg-emerald-600 text-white p-1.5 rounded-md ml-1 hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2 flex-1">
                    {h.open ? (
                      <span className="font-bold text-gray-900 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs border border-emerald-100">
                        {h.start} - {h.end}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md uppercase">Cerrado</span>
                    )}
                    <Edit3 size={14} className="text-gray-300 ml-2" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 5. Infraestructura (Canchas) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900">Mis Canchas</h3>
              <p className="text-xs text-gray-500">Toca cualquier cancha para editarla o configurar bloqueo mutuo</p>
            </div>
            <button 
              type="button"
              onClick={() => { setEditingCourt({ name: '', type: 'Fútbol 5', surface: 'Sintético', price_per_hour: 0, is_roofed: false, status: 'available', blockedCourts: [] } as any); setEditSection('court'); }}
              className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Plus size={14} /> Nueva Cancha
            </button>
          </div>
          <div className="space-y-3">
            {courts.map((court, cIdx) => (
              <div 
                key={`profile-court-${court.id || cIdx}-${cIdx}`} 
                onClick={() => { setEditingCourt({ ...court, blockedCourts: (court as any).blockedCourts || [] }); setEditSection('court'); }}
                className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:border-emerald-300 hover:shadow-sm transition-all bg-white cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 transition-transform">
                  <LayoutDashboard size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-sm text-gray-900 truncate">{court.name}</div>
                    {court.status === 'maintenance' && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Mantenimiento</span>
                    )}
                    {Array.isArray((court as any).blockedCourts) && (court as any).blockedCourts.length > 0 && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <ShieldCheck size={12} /> Bloquea {(court as any).blockedCourts.length} {((court as any).blockedCourts.length === 1 ? 'cancha' : 'canchas')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{court.type} • {court.surface} • ${(court as any).price_per_hour?.toLocaleString()}/h</div>
                </div>
                
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button 
                    type="button"
                    onClick={() => handleToggleCourtStatus(court)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      court.status === 'maintenance' 
                        ? "bg-red-50 text-red-600 hover:bg-red-100" 
                        : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                    )}
                    title={court.status === 'maintenance' ? "Habilitar cancha" : "Poner en mantenimiento"}
                  >
                    <ShieldCheck size={16} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setEditingCourt({ ...court, blockedCourts: (court as any).blockedCourts || [] }); setEditSection('court'); }} 
                    className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeleteCourt(court.id)} 
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button 
              type="button"
              onClick={() => { setEditingCourt({ name: '', type: 'Fútbol 5', surface: 'Sintético', price_per_hour: 0, is_roofed: false, status: 'available', blockedCourts: [] } as any); setEditSection('court'); }}
              className="w-full py-3 rounded-xl border-2 border-dashed border-emerald-200 text-emerald-600 font-bold text-sm hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Agregar nueva cancha
            </button>
          </div>
        </div>

        {/* 6. Servicios */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-bold text-gray-900 mb-4">Servicios del complejo</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'showers', label: 'Vestuarios', icon: Shirt },
              { id: 'parking', label: 'Estacionamiento', icon: Car },
              { id: 'buffet', label: 'Buffet', icon: Coffee },
              { id: 'bar', label: 'Bar', icon: Utensils },
              { id: 'rentals', label: 'Alquileres', icon: ShoppingBag },
              { id: 'grill', label: 'Parrillas', icon: Flame },
              { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
            ].map((s, sIdx) => (
              <div 
                key={`venue-service-${s.id}-${sIdx}`}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                  ((profile.services || {}) as any)[s.id] 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                    : "bg-white border-gray-100 text-gray-400 grayscale"
                )}
                onClick={() => {
                  setProfile({...profile, services: {...(profile.services || {}), [s.id]: !((profile.services || {}) as any)[s.id]}});
                  setHasChanges(true);
                }}
              >
                <div className={cn("p-1.5 rounded-lg", ((profile.services || {}) as any)[s.id] ? "bg-emerald-100" : "bg-gray-100")}>
                  <s.icon size={16} />
                </div>
                <span className="text-xs font-bold">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 7. Apariencia y Modo Nocturno */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                isDarkMode ? "bg-amber-500/10 text-amber-400" : "bg-emerald-50 text-emerald-600"
              )}>
                {isDarkMode ? <Moon size={22} /> : <Sun size={22} />}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Modo Nocturno
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                    isDarkMode ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400"
                  )}>
                    {isDarkMode ? 'Prendido' : 'Apagado'}
                  </span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {isDarkMode ? 'El tema oscuro está activado para cuidar tu vista' : 'Activa el tema oscuro para reducir el brillo'}
                </p>
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
                "relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isDarkMode ? "bg-emerald-600" : "bg-gray-200 dark:bg-slate-700"
              )}
              role="switch"
              aria-checked={isDarkMode}
              title={isDarkMode ? "Apagar modo nocturno" : "Prender modo nocturno"}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center text-xs",
                  isDarkMode ? "translate-x-7 text-emerald-600" : "translate-x-0 text-gray-400"
                )}
              >
                {isDarkMode ? <Moon size={12} strokeWidth={2.5} /> : <Sun size={12} strokeWidth={2.5} />}
              </span>
            </button>
          </div>
        </div>

        {/* 8. Mesa de Ayuda, Reportes y Sugerencias */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 transition-colors space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <MessageSquare size={22} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Mesa de Ayuda y Soporte
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase tracking-wider">
                    Mensajería Directa
                  </span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Reporta errores o bugs, sugiere nuevas funciones y comunícate con el equipo vía WhatsApp
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSupportModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold p-3.5 rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm transition-all cursor-pointer"
            >
              <Send size={15} />
              Reportar Error / Sugerir Mejora
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueNameStr = profile?.name || 'Complejo Jogo';
                const text = encodeURIComponent(`Hola Soporte Jogo! Me comunico desde el complejo "${venueNameStr}". Necesito asistencia técnica.`);
                window.open(`https://api.whatsapp.com/send?phone=5491123456789&text=${text}`, '_blank', 'noopener,noreferrer');
              }}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-[0.98] text-gray-800 dark:text-slate-200 font-bold p-3.5 rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer border border-transparent dark:border-slate-700"
            >
              <MessageCircle size={15} className="text-emerald-500" />
              WhatsApp Directo de Soporte
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-slate-400 pt-2 border-t border-gray-100 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
              Canal oficial de atención para administradores
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSupportModalOpen(true);
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer flex items-center gap-1"
            >
              Historial de tickets →
            </button>
          </div>
        </div>
      </div>

      {/* FAB Save Changes (For Services) */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div 
            key="fab-save-profile-bar"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-24 left-0 right-0 px-6 z-40"
          >
            <button type="button" 
              onClick={handleSaveProfile}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2"
            >
              <Check size={20} /> Guardar Cambios
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Info Modal */}
      {editSection === 'info' && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditSection(null);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">Editar Información</h3>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label>
                <input 
                  value={profile.name} 
                  onChange={e => setProfile({...profile, name: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Descripción</label>
                <textarea 
                  value={profile.description} 
                  onChange={e => setProfile({...profile, description: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Teléfono</label>
                <input 
                  value={profile.phone} 
                  onChange={e => setProfile({...profile, phone: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Dirección</label>
                <input 
                  value={profile.address} 
                  onChange={e => setProfile({...profile, address: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveProfile();
                }} 
                disabled={isSaving} 
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="w-full py-3 text-gray-500 font-bold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Hours Modal */}
      {editSection === 'hours' && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditSection(null);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">Editar Horarios</h3>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              {(profile.hours || []).map((h: any, i: number) => (
                <div key={`edit-hour-row-${h.day || i}-${i}`} className="flex items-center gap-2">
                  <div className="w-20 font-medium text-sm">{h.day}</div>
                  <button type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newHours = [...(profile.hours || [])];
                      newHours[i].open = !newHours[i].open;
                      setProfile({...profile, hours: newHours});
                    }}
                    className={cn("px-2 py-1 rounded text-xs font-bold w-16 cursor-pointer", h.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}
                  >
                    {h.open ? 'ABIERTO' : 'CERRADO'}
                  </button>
                  {h.open && (
                    <>
                      <input 
                        type="time" 
                        value={h.start} 
                        onChange={e => {
                          const newHours = [...(profile.hours || [])];
                          newHours[i].start = e.target.value;
                          setProfile({...profile, hours: newHours});
                        }}
                        className="bg-gray-50 rounded px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span>-</span>
                      <input 
                        type="time" 
                        value={h.end} 
                        onChange={e => {
                          const newHours = [...(profile.hours || [])];
                          newHours[i].end = e.target.value;
                          setProfile({...profile, hours: newHours});
                        }}
                        className="bg-gray-50 rounded px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </>
                  )}
                </div>
              ))}
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveProfile();
                }} 
                disabled={isSaving} 
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="w-full py-3 text-gray-500 font-bold cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditSection(null);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">{editingCourt.id ? 'Editar Cancha' : 'Nueva Cancha'}</h3>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label>
                <input 
                  value={editingCourt.name} 
                  onChange={e => setEditingCourt({...editingCourt, name: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ej: Cancha 1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label>
                  <select 
                    value={editingCourt.type} 
                    onChange={e => setEditingCourt({...editingCourt, type: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option>Fútbol 5</option>
                    <option>Fútbol 7</option>
                    <option>Fútbol 9</option>
                    <option>Fútbol 11</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Superficie</label>
                  <select 
                    value={editingCourt.surface} 
                    onChange={e => setEditingCourt({...editingCourt, surface: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option>Sintético</option>
                    <option>Cemento</option>
                    <option>Parquet</option>
                    <option>Pasto Natural</option>
                    <option>Tierra</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Precio por Hora</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input 
                    type="number"
                    value={(editingCourt as any).price_per_hour || ''} 
                    onChange={e => setEditingCourt({...editingCourt, price_per_hour: e.target.value ? Number(e.target.value) : 0})}
                    className="w-full pl-8 p-3 bg-gray-50 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input 
                  type="checkbox" 
                  checked={(editingCourt as any).is_roofed} 
                  onChange={e => setEditingCourt({...editingCourt, is_roofed: e.target.checked})}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <label className="font-medium text-gray-700">¿Es techada?</label>
              </div>

              {/* Bloqueo de Canchas Mutuo (Superpuestas) */}
              <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <label className="block text-xs font-bold text-gray-700">Canchas Superpuestas (Bloqueo Mutuo)</label>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Seleccioná las canchas que comparten el mismo espacio físico (ej. una cancha de F7 que contiene 2 canchas de F5). Si esta cancha tiene un turno o se alquila, las seleccionadas quedarán bloqueadas automáticamente en ese horario.
                </p>
                <div className="flex flex-wrap gap-2">
                  {courts.filter(c => !editingCourt.id || c.id !== editingCourt.id).map((c, cIdx) => {
                    const isBlocked = ((editingCourt as any).blockedCourts || []).includes(c.id);
                    return (
                      <button
                        type="button"
                        key={`overlap-court-${c.id || cIdx}-${cIdx}`}
                        onClick={() => {
                          const currentBlocked = (editingCourt as any).blockedCourts || [];
                          const newBlocked = isBlocked 
                            ? currentBlocked.filter((id: number) => id !== c.id)
                            : [...currentBlocked, c.id];
                          setEditingCourt({...editingCourt, blockedCourts: newBlocked});
                        }}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm",
                          isBlocked 
                            ? "bg-amber-500 text-white border-amber-600 shadow-amber-500/20" 
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <ShieldCheck size={14} className={isBlocked ? "text-white" : "text-gray-400"} />
                        {c.name}
                        {isBlocked && <span className="text-[10px] bg-amber-600 px-1 rounded ml-0.5">Bloqueada</span>}
                      </button>
                    );
                  })}
                  {courts.filter(c => !editingCourt.id || c.id !== editingCourt.id).length === 0 && (
                    <div className="text-xs text-gray-400 italic">No hay otras canchas creadas para vincular.</div>
                  )}
                </div>
              </div>

              <button 
                type="button"
                onClick={() => handleSaveCourt(editingCourt)} 
                disabled={isSaving || !editingCourt.name || !editingCourt.price_per_hour} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-900/10"
              >
                {isSaving ? 'Guardando...' : 'Guardar Cancha'}
              </button>
              <button type="button" onClick={() => setEditSection(null)} className="w-full py-3 text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Soporte, Reportes y Sugerencias */}
      <ContactSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        venueName={profile?.name || 'Complejo Jogo'}
        adminName={profile?.name ? `Admin ${profile.name}` : 'Administrador'}
        adminPhone={profile?.phone || ''}
        adminEmail=""
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

// Helper icons for ProfileView (since I missed importing some specific ones or need generic replacements)
const ShoppingBagIcon = ({ size, className }: any) => <Store size={size} className={className} />;
const FlameIcon = ({ size, className }: any) => <Utensils size={size} className={className} />;

const BottomNav = ({ active, onNavigate }: { active: NavTabId | string, onNavigate: (id: NavTabId) => void }) => {
  return (
    <nav 
      role="navigation" 
      aria-label="Navegación principal inferior"
      className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200 dark:border-slate-800 px-3 py-1.5 flex justify-around items-center z-40 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.05)] lg:hidden"
    >
      {MAIN_NAV_ITEMS.map(item => {
        const isCurrent = active === item.id;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-label={item.label}
            key={`bottom-nav-${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate(item.id);
            }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer select-none touch-manipulation",
              isCurrent 
                ? "text-emerald-600 dark:text-emerald-400 font-bold scale-[1.02]" 
                : "text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 active:scale-95"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-xl transition-all duration-200",
              isCurrent ? "bg-emerald-50 dark:bg-emerald-950/60 shadow-sm" : "bg-transparent"
            )}>
              <item.icon size={22} strokeWidth={isCurrent ? 2.5 : 1.8} />
            </div>
            <span className={cn(
              "text-[11px] leading-tight tracking-tight transition-colors",
              isCurrent ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-medium"
            )}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

// --- Main Layout ---

const ReportsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
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
      const res = await fetch(`/api/finance?period=month&clientDate=${monthId}-15`);
      const finData = await res.json();
      
      const incomeTotal = finData.summary.find((s: any) => s.type === 'income')?.total || 0;
      const expenseTotal = finData.summary.find((s: any) => s.type === 'expense')?.total || 0;
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
        body: finData.transactions.map((t: any) => [
          new Date(t.date).toLocaleDateString('es-AR'),
          t.type === 'income' ? 'Ingreso' : 'Egreso',
          t.category,
          `$${t.amount.toLocaleString()}`
        ]),
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
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('finance');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isCreateMatchOpen, setCreateMatchOpen] = useState(false);
  const [isCreateUserOpen, setCreateUserOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
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
  
  // Firebase Auth & Database Hook
  const { user, isAdmin, signInWithGoogle, logout } = useFirebase();

  // Analytics States
  const [showExposureStats, setShowExposureStats] = useState(false);
  const [showDemandStats, setShowDemandStats] = useState(false);
  const [showRetentionStats, setShowRetentionStats] = useState(false);
  const [showFinanceChart, setShowFinanceChart] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showGlobalSupportModal, setShowGlobalSupportModal] = useState(false);

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

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch('/api/courts', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setCourts(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) setCourts([]);
      });

    fetch('/api/users', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setUsers(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (err.name !== 'AbortError' && isMounted) setUsers([]);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshKey]);

  const handleSidebarAction = (action: string) => {
    if (action === 'exposure') setShowExposureStats(true);
    if (action === 'demand') setShowDemandStats(true);
    if (action === 'retention') setShowRetentionStats(true);
    if (action === 'chart') setShowFinanceChart(true);
    if (action === 'reports') setShowReportsModal(true);
    if (action === 'support') setShowGlobalSupportModal(true);
  };

  const handleUserClick = async (id: number) => {
    const res = await fetch(`/api/users/${id}`);
    const data = await res.json();
    setSelectedUser(data);
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      setSelectedUser(null);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateMatch = async (data: any) => {
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setRefreshKey(prev => prev + 1);
  };

  const handleCreateUser = async (data: any) => {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    // Refresh users list
    fetch('/api/users').then(res => res.json()).then(setUsers);
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    await fetch(`/api/matches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: status })
    });
  };

  return (
    <div className="flex w-full h-[100dvh] overflow-hidden bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar 
        active={activeTab} 
        onNavigate={handleNavigate}
        onAction={handleSidebarAction} 
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-[#0BA70B] dark:bg-[#0BA70B] h-20 flex items-center justify-between px-4 md:px-6 text-white z-20 relative">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden text-white hover:text-white/80 transition-colors p-1 -ml-1 cursor-pointer" aria-label="Abrir menú lateral">
              <Menu size={32} strokeWidth={2.5} />
            </button>
            <h2 className="text-[22px] md:text-[26px] font-bold tracking-wide">
              { 
               activeTab === 'schedule' ? 'Agenda' :
               activeTab === 'users' ? 'Usuarios totales' :
               activeTab === 'finance' ? 'Hola Admin!' :
               activeTab === 'profile' ? 'Perfil' : 
               activeTab === 'analytics' ? 'Analíticas' : activeTab}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {activeTab === 'users' && (
              <div className="flex items-center gap-1.5 text-white font-bold text-xl md:text-2xl mr-1">
                <UserIcon size={24} strokeWidth={2.5} />
                <span>{users.length}</span>
              </div>
            )}
            
            {/* Firebase Auth button / User profile */}
            {user ? (
              <div className="flex items-center gap-2 bg-white/15 dark:bg-black/20 hover:bg-white/25 transition-all rounded-full py-1 pl-1.5 pr-2.5 border border-white/20 text-white shadow-sm">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Usuario'} className="w-7 h-7 rounded-full object-cover border border-white/40" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs uppercase text-white">
                    {user.displayName?.[0] || user.email?.[0] || 'U'}
                  </div>
                )}
                <div className="hidden md:flex flex-col text-left">
                  <span className="text-xs font-semibold leading-tight truncate max-w-[120px]">{user.displayName || user.email?.split('@')[0]}</span>
                  {isAdmin && <span className="text-[9px] uppercase tracking-wider text-emerald-200 font-bold">Admin</span>}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Cerrar sesión de Firebase"
                  className="p-1 hover:text-red-200 transition-colors ml-0.5 cursor-pointer text-white/90"
                  aria-label="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 bg-white text-slate-800 hover:bg-slate-100 px-3 py-1.5 rounded-full font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                title="Acceder con cuenta de Google (Firebase)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="hidden sm:inline">Google</span>
                <span className="sm:hidden">Entrar</span>
              </button>
            )}

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
          </div>
        </header>

        {/* Content */}
        <main id="main-scroll" className="flex-1 relative pt-0 px-3 md:px-6 pb-24 lg:pb-6 bg-[#f0f2f5] dark:bg-slate-900 overflow-y-auto">
          <ErrorBoundary key={`section-boundary-${activeTab}`} sectionName={activeTab}>
            <div className="w-full pt-3 md:pt-5">
              {activeTab === 'schedule' && (
                <ScheduleView 
                  key="view-schedule"
                  onMatchClick={setSelectedMatch} 
                  onNewBooking={() => setCreateMatchOpen(true)}
                  onUpdateStatus={handleUpdateStatus}
                  refreshKey={refreshKey}
                />
              )}
              {activeTab === 'users' && (
                <UsersView 
                  key="view-users"
                  onUserClick={handleUserClick} 
                  refreshKey={refreshKey}
                  onDataChange={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'analytics' && <AnalyticsView key="view-analytics" />}
              {activeTab === 'finance' && <FinanceView key="view-finance" />}
              {activeTab === 'profile' && (
                <ProfileView 
                  key="view-profile"
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
          <UserDetailModal key="modal-user-detail" user={selectedUser} onClose={() => setSelectedUser(null)} onDelete={handleDeleteUser} />
        )}
        {selectedMatch && (
          <MatchDetailModal 
            key="modal-match-detail"
            match={isCreateMatchOpen ? null : selectedMatch} 
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
            users={users}
            initialData={selectedMatch}
            onCreate={selectedMatch ? async (data) => {
              await fetch(`/api/matches/${selectedMatch.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              setRefreshKey(prev => prev + 1);
              setSelectedMatch(null);
            } : handleCreateMatch}
            onQuickAddUser={(userData) => handleCreateUser({ ...userData, email: '', skill_level: 'Amateur' })}
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
        {showDemandStats && <DemandStats key="modal-demand-stats" onClose={() => setShowDemandStats(false)} />}
        {showRetentionStats && <RetentionStats key="modal-retention-stats" onClose={() => setShowRetentionStats(false)} />}
        {showFinanceChart && <FinanceChartModal key="modal-finance-chart" isOpen={showFinanceChart} onClose={() => setShowFinanceChart(false)} />}
        {showReportsModal && <ReportsModal key="modal-reports" isOpen={showReportsModal} onClose={() => setShowReportsModal(false)} />}
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
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <BottomNav active={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}
