import React, { Component, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';
import { 
  LayoutDashboard, Users, Calendar, TrendingUp, TrendingDown, DollarSign, CalendarCheck, Percent, Clock, 
  Search, Bell, Menu, X, Phone, MapPin, Star, ChevronRight, ChevronDown, Plus, Sparkles,
  Wallet, ArrowUpRight, ArrowDownRight, ArrowDownLeft, Store, Instagram, Check, ShieldCheck, 
  Car, Utensils, Wifi, Coffee, Shirt, Camera, Edit3, Trash2, ShoppingBag, Flame, Moon, Sun, Eye, EyeOff, User as UserIcon, BarChart2, MoreVertical, FileText, Download,
  MessageSquare, MessageCircle, Send, Bug, Lightbulb, Headphones, MousePointer, Activity, Target, Trophy, Wrench, Package, Zap, LogOut, LogIn, AlertCircle
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
import { ActivationView } from './components/ActivationView';
import { doc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
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
  saveVenueProfileInFirestore
} from './lib/firestoreSync';

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
  onToggleDarkMode,
  activeComplex,
  onOpenActivation
}: { 
  active: NavTabId | string, 
  onNavigate: (tab: NavTabId) => void, 
  onAction: (action: string) => void, 
  isOpen: boolean, 
  onClose: () => void, 
  isDarkMode?: boolean, 
  onToggleDarkMode?: () => void,
  activeComplex?: any | null,
  onOpenActivation?: () => void
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

const UserDetailModal = ({ user, onClose, onDelete }: { user: User | null, onClose: () => void, onDelete: (id: any) => void }) => {
  if (!user) return null;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 pointer-events-auto"
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
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto pointer-events-auto"
      >
        <div className="relative h-28 bg-slate-900">
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="absolute top-4 right-4 bg-black/20 text-white p-2 rounded-full hover:bg-black/40 transition-colors cursor-pointer"
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
              {user.phone && (
                <a 
                  href={`tel:${user.phone}`}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 cursor-pointer"
                >
                  <Phone size={16} /> Contactar
                </a>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
              {user.category && (
                <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded capitalize">
                  {user.category}
                </span>
              )}
              {user.status && (
                <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded capitalize">
                  {user.status}
                </span>
              )}
            </div>
            {(user.city || user.address) && (
              <p className="text-gray-500 flex items-center gap-2 text-sm mt-1">
                <MapPin size={14} /> {user.city || user.address}
              </p>
            )}
            <div className="text-xs text-gray-500 mt-1 flex gap-4">
              {user.phone && <span>Tel: {user.phone}</span>}
              {user.email && <span>Email: {user.email}</span>}
              {user.gender && <span>Género: {user.gender}</span>}
              {user.acquisitionChannel && <span>Canal: {user.acquisitionChannel}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-2xl font-bold text-gray-900">{user.totalMatchesPlayed ?? user.matches_played ?? 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Partidos</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-2xl font-bold text-gray-900">{user.totalBookings ?? 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Reservas</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-sm font-bold text-gray-900">{user.acquisitionDate || safeFormatDate(user.created_at, 'MMM yyyy', { locale: es }, 'N/A')}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Alta</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center">
              <div className="text-sm font-bold text-gray-900">{user.lastGameDate || 'Sin partidos'}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Último juego</div>
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

const MatchDetailModal = ({ match, onClose, onUpdateStatus, onUserClick, onEdit, onPaymentUpdate }: { match: Match | null, onClose: () => void, onUpdateStatus?: (id: number | string, status: string) => void, onUserClick?: (id: number | string) => void, onEdit?: () => void, onPaymentUpdate?: () => void }) => {
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
                    const totalPrice = Number(match.price ?? match.price_total ?? 0);
                    try {
                      await updateBookingInFirestore(match.id, {
                        deposit: totalPrice,
                        amount_paid: totalPrice,
                        paymentStatus: 'pagado',
                        payment_status: 'paid'
                      });
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
                        const currentPaid = Number(match.amount_paid ?? match.deposit ?? 0);
                        const addAmount = Number(manualAmount);
                        const newPaid = currentPaid + addAmount;
                        const totalPrice = Number(match.price ?? match.price_total ?? 0);
                        const isFull = newPaid >= totalPrice && totalPrice > 0;
                        const pStatus = isFull ? 'pagado' : (newPaid > 0 ? 'seña' : 'pendiente');
                        const pStatusEn = isFull ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

                        await updateBookingInFirestore(match.id, {
                          deposit: newPaid,
                          amount_paid: newPaid,
                          paymentStatus: pStatus,
                          payment_status: pStatusEn
                        });
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
                try {
                  await deleteBookingInFirestore(match.id);
                } catch (e) {
                  console.warn('Error deleting booking in Firestore:', e);
                }
                if (onUpdateStatus) onUpdateStatus(match.id, 'cancelled');
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
  onNavigate
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  courts: Court[], 
  users: User[], 
  onCreate: (data: any) => void, 
  onQuickAddUser?: (user: any) => void, 
  initialData?: any,
  complexId?: string,
  onNavigate?: (tab: NavTabId | string) => void
}) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<any>({ court_id: null, host_id: '', date: '', time: '', payment_status: 'pending' });
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '' });
  const [userSearch, setUserSearch] = useState('');
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [venue, setVenue] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Real-time Firestore venue profile subscription
    const unsubVenue = subscribeToVenueProfile(complexId, (venueProfile) => {
      if (venueProfile) setVenue(venueProfile);
    });

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

    if (isRealMatch) {
      let time = '';
      let date = '';
      const rawDateStr = initialData.start_time || initialData.startTime || initialData.date;
      if (rawDateStr && typeof rawDateStr === 'string') {
        const startDate = new Date(rawDateStr);
        if (!isNaN(startDate.getTime())) {
          time = initialData.startTime || initialData.time || startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          date = initialData.date || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        }
      }
      if (!time) time = initialData.startTime || initialData.time || '18:00';
      if (!date) date = initialData.date || new Date().toISOString().split('T')[0];

      setData({
        id: initialData.id,
        court_id: initialData.court_id || initialData.courtId || (courts.length > 0 ? courts[0].id : null),
        host_id: initialData.host_id || initialData.userId || '',
        clientName: initialData.userName || initialData.clientName || '',
        clientPhone: initialData.userPhone || initialData.clientPhone || '',
        date,
        time,
        payment_status: initialData.payment_status || initialData.paymentStatus || 'pending',
        amount_paid: initialData.amount_paid ?? initialData.deposit ?? 0,
        notes: initialData.notes || ''
      });
      setStep(1);
    } else {
      setData({ 
        court_id: courts.length > 0 ? courts[0].id : null, 
        host_id: '', 
        date: '', 
        time: '', 
        payment_status: 'pending',
        amount_paid: 0,
        notes: ''
      });
      setStep(1);
    }

    return () => {
      unsubVenue();
    };
  }, [isOpen, initialData, courts, complexId]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const startDateTime = new Date(`${data.date}T${data.time}`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    const selectedCourt = courts.find(c => String(c.id) === String(data.court_id));
    const selectedHost = users.find(u => String(u.id) === String(data.host_id));
    const clientName = selectedHost?.name || data.clientName || 'Cliente';
    const clientPhone = selectedHost?.phone || data.clientPhone || '';
    const clientEmail = selectedHost?.email || data.clientEmail || '';
    const endTimeStr = endDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const courtName = selectedCourt?.name || 'Cancha';
    const price = Number(selectedCourt?.price_per_hour ?? selectedCourt?.price ?? 0);
    const deposit = Number(data.amount_paid || data.deposit || 0);

    onCreate({
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
      price,
      price_total: price,
      deposit,
      amount_paid: deposit,
      status: data.status || 'confirmado',
      paymentStatus: data.payment_status || (deposit >= price && price > 0 ? 'pagado' : deposit > 0 ? 'seña' : 'pendiente'),
      notes: data.notes || ''
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
    const defaultHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    if (!venue || !Array.isArray(venue.hours) || !data.date) {
      return defaultHours.map(h => `${h.toString().padStart(2, '0')}:00`);
    }

    const [y, m, d] = data.date.split('-');
    const selectedDateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (isNaN(selectedDateObj.getTime())) {
      return defaultHours.map(h => `${h.toString().padStart(2, '0')}:00`);
    }
    
    // getDay() gives 0 for Sunday
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = dayNames[selectedDateObj.getDay()];

    const hourConfig = venue.hours.find((h: any) => h.day === dayName);

    if (!hourConfig || !hourConfig.open) {
      return defaultHours.map(h => `${h.toString().padStart(2, '0')}:00`);
    }

    const startH = parseInt(hourConfig.start?.split(':')[0] || '8');
    let endH = parseInt(hourConfig.end?.split(':')[0] || '23');
    if (endH === 0) endH = 24;

    let availableHours: number[] = [];
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
    if (availableHours.length === 0) availableHours = defaultHours;

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
            {courts.length === 0 ? (
              <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={24} />
                </div>
                <h4 className="font-bold text-gray-900 mb-1">No hay canchas registradas</h4>
                <p className="text-xs text-gray-600 max-w-sm mx-auto mb-4">
                  Para poder registrar reservas, primero debes agregar al menos una cancha en la configuración del complejo.
                </p>
                {onNavigate && (
                  <button 
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('profile');
                    }}
                    className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
                  >
                    Ir a Perfil a Configurar Canchas
                  </button>
                )}
              </div>
            ) : (
              <>
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
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50 cursor-pointer"
                >
                  Siguiente
                </button>
              </>
            )}
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
                  value={data.date || ''}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500" 
                  onChange={e => setData({...data, date: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Hora</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-medium text-gray-900 disabled:opacity-50 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
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
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Estado del Turno</label>
                <div className="flex gap-2">
                  {[
                    { id: 'confirmado', label: 'Confirmado' },
                    { id: 'jugado', label: 'Jugado' },
                    { id: 'cancelado', label: 'Cancelado' }
                  ].map(st => (
                    <button
                      type="button"
                      key={`turno-status-${st.id}`}
                      onClick={() => setData({...data, status: st.id})}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer",
                        (data.status || 'confirmado') === st.id
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {st.label}
                    </button>
                  ))}
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
                        "flex-1 py-2 rounded-lg text-xs font-bold capitalize border transition-colors cursor-pointer",
                        data.payment_status === status 
                          ? "bg-emerald-600 text-white border-emerald-600" 
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {status === 'pending' ? 'Pendiente' : status === 'partial' ? 'Seña' : 'Pagado'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {data.payment_status === 'partial' && (
              <div>
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

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Notas u Observaciones</label>
              <input 
                type="text"
                placeholder="Observaciones de la reserva..."
                value={data.notes || ''}
                onChange={e => setData({...data, notes: e.target.value})}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
              />
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

const ScheduleView = ({ 
  onMatchClick, 
  onNewBooking, 
  onUpdateStatus, 
  refreshKey,
  complexId = 'complejo_central',
  onNavigate
}: { 
  onMatchClick: (match: Match) => void, 
  onNewBooking: () => void, 
  onUpdateStatus: (id: number | string, status: string) => void, 
  refreshKey?: number,
  complexId?: string,
  onNavigate?: (tab: NavTabId | string) => void
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCourtIds, setSelectedCourtIds] = useState<(number | string)[]>([]);
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

  const selectedDateStr = safeFormatDate(selectedDate, 'yyyy-MM-dd') || format(selectedDate, 'yyyy-MM-dd');

  // 100% Real Firestore Connection:
  // - Listens to 'bookings' collection filtered by complexId and date == selectedDate
  // - Listens to 'courts' collection associated with complexId
  // - Listens to 'venue_profile' document for operating hours
  useEffect(() => {
    if (!complexId) return;

    const unsubBookings = subscribeToBookings(complexId, (bookingsList) => {
      setMatches(Array.isArray(bookingsList) ? bookingsList : []);
    }, selectedDateStr);

    const unsubCourts = subscribeToCourts(complexId, (courtsList) => {
      const validCourts = Array.isArray(courtsList) ? courtsList : [];
      setCourts(validCourts);
      if (validCourts.length > 0) {
        setSelectedCourtIds(prev => prev.length === 0 ? [validCourts[0].id] : prev);
      }
    });

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
  }, [complexId, selectedDateStr, refreshKey]);

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

  const getMatchForSlot = (courtId: number | string, rawHour: number) => {
    if (!Array.isArray(matches)) return null;
    return matches.find(m => {
      if (!m || !m.start_time) return false;
      const matchDate = safeParseDate(m.start_time);
      if (!matchDate) return false;
      const slotDate = new Date(selectedDate);
      if (rawHour >= 24) {
        slotDate.setDate(slotDate.getDate() + 1);
      }
      const isSameHour = matchDate.getHours() === (rawHour % 24);
      const isSameDayMatch = matchDate.getDate() === slotDate.getDate() &&
                             matchDate.getMonth() === slotDate.getMonth() &&
                             matchDate.getFullYear() === slotDate.getFullYear();
      const isSameCourt = String(m.court_id) === String(courtId) || String((m as any).courtId) === String(courtId);
      return isSameDayMatch && isSameHour && isSameCourt;
    });
  };

  const getBlockedByForSlot = (courtId: number | string, rawHour: number) => {
    if (!Array.isArray(courts)) return null;
    const court = courts.find(c => c && String(c.id) === String(courtId));
    if (!court || !(court as any).blockedCourts || !(court as any).blockedCourts.length) return null;
    
    // Check if any of the blocked courts has a match in this slot
    for (const blockedId of (court as any).blockedCourts) {
      const matchOnBlocked = getMatchForSlot(blockedId, rawHour);
      if (matchOnBlocked) {
        const blockerCourt = courts.find(c => c && String(c.id) === String(blockedId));
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

  const toggleCourtSelection = (courtId: number | string) => {
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

  // Filter bookings for the selected date
  const dayBookings = matches.filter(m => {
    if (!m || !m.start_time) return false;
    const matchDate = safeParseDate(m.start_time);
    if (!matchDate) return false;
    return isSameDay(matchDate, selectedDate);
  });

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-auto space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500">
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-lg text-gray-900 dark:text-white capitalize">
              {safeFormatDate(selectedDate, 'EEEE d MMMM', { locale: es }, 'Fecha')}
            </h2>
            {dayBookings.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide">
                No hay reservas para esta fecha
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium tracking-wider">
                {dayBookings.length} {dayBookings.length === 1 ? 'reserva confirmada' : 'reservas confirmadas'}
              </p>
            )}
          </div>
          <button type="button" onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom Control */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-lg p-1 mr-2">
            <button type="button" onClick={() => setRowHeight(Math.max(40, rowHeight - 10))} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-gray-500 text-xs font-bold cursor-pointer">-</button>
            <span className="text-xs font-mono text-gray-400 w-8 text-center">Zoom</span>
            <button type="button" onClick={() => setRowHeight(Math.min(120, rowHeight + 10))} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-gray-500 text-xs font-bold cursor-pointer">+</button>
          </div>

          <button 
            type="button" 
            disabled={courts.length === 0}
            onClick={() => {
              if (courts.length > 0) {
                onNewBooking();
              }
            }} 
            title={courts.length === 0 ? "Primero debes configurar al menos una cancha en Perfil" : "Crear nueva reserva"}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95",
              courts.length > 0 
                ? "bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-700 cursor-pointer" 
                : "bg-gray-200 dark:bg-slate-800 text-gray-400 cursor-not-allowed opacity-60 shadow-none"
            )}
          >
            <Plus size={18} /> <span className="hidden sm:inline">Nueva Reserva</span>
          </button>
        </div>
      </div>

      {/* Clean Empty State Notification when no reservations exist for selected day */}
      {dayBookings.length === 0 && courts.length > 0 && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 rounded-2xl py-2.5 px-4 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold">No hay reservas para esta fecha</span>
          </div>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Todos los horarios libres</span>
        </div>
      )}

      {/* Empty State when no courts exist */}
      {courts.length === 0 ? (
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
      ) : (
        <>
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
      </>
      )}
    </div>
  );
};

const NewUserModal = ({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (user: any) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
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
    onSave({
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
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 pointer-events-auto"
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
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] pointer-events-auto"
      >
        <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Nuevo Usuario</h3>
            <p className="text-xs text-gray-500">Alta de jugador o cliente para la sede activa</p>
          </div>
          <button 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>
        <form id="new-user-form" onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre y Apellido *</label>
              <input 
                required
                type="text" 
                placeholder="Ej: Marcos Rojo"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono *</label>
              <input 
                required
                type="tel" 
                placeholder="Ej: +54 9 11 9876-5432"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(Opcional)</span></label>
              <input 
                type="email" 
                placeholder="jugador@ejemplo.com"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Ciudad / Localidad</label>
              <input 
                type="text" 
                placeholder="Ej: Quilmes / Bernal"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                value={formData.city}
                onChange={e => setFormData({...formData, city: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Género</label>
              <select 
                value={formData.gender}
                onChange={e => setFormData({...formData, gender: e.target.value})}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50 font-medium"
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
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50 font-medium"
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
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50 font-medium"
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
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50 font-medium"
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
              placeholder="Notas operativas del jugador..."
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
            />
          </div>
        </form>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl font-medium cursor-pointer">Cancelar</button>
          <button type="submit" form="new-user-form" disabled={!formData.name || !formData.phone} className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-900/10">Guardar Usuario</button>
        </div>
      </motion.div>
    </div>
  );
};

const UsersView = ({ onUserClick, refreshKey, onDataChange, complexId = 'complejo_central' }: { onUserClick: (id: number | string) => void, refreshKey?: number, onDataChange?: () => void, complexId?: string }) => {
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

    // Real-time Firestore sync
    const unsub = subscribeToClients(complexId, (clientsList) => {
      if (Array.isArray(clientsList) && isMounted) {
        setUsers(clientsList);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [complexId, refreshKey]);

  const handleCreateUser = async (userData: any) => {
    try {
      await saveClientInFirestore(complexId, userData);
      setShowNewUserModal(false);
      if (onDataChange) onDataChange();
    } catch (error) {
      console.error('Error creating user in Firestore:', error);
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

const FinanceView = ({ complexId = 'complejo_central' }: { complexId?: string }) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rawBookings, setRawBookings] = useState<any[]>([]);
  const [rawManualTxs, setRawManualTxs] = useState<Transaction[]>([]);
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
      const currentIndex = periods.indexOf(period);
      if (currentIndex < periods.length - 1) {
        setPeriod(periods[currentIndex + 1] as any);
      }
    } else if (info.offset.x > swipeThreshold) {
      const currentIndex = periods.indexOf(period);
      if (currentIndex > 0) {
        setPeriod(periods[currentIndex - 1] as any);
      }
    }
  };

  // Recomputes finance summaries and period transactions from real Firestore bookings
  const recomputeFromBookings = useCallback((bookingsList: any[], manualTxsList: Transaction[], currentSelectedPeriod: string) => {
    const today = new Date();
    const todayStr = safeFormatDate(today, 'yyyy-MM-dd') || format(today, 'yyyy-MM-dd');

    const checkInPeriod = (dateVal: string | Date | undefined, p: string) => {
      if (!dateVal) return false;
      const d = safeParseDate(dateVal);
      if (!d) return false;
      if (p === 'today') return isSameDay(d, today);
      if (p === 'week') {
        const diff = differenceInDays(today, d);
        return diff >= 0 && diff <= 7;
      }
      if (p === 'month') return isSameMonth(d, today);
      return false;
    };

    const newSummaries: any = {
      today: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
      week: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
      month: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 },
      year: { income: 0, expense: 0, balance: 0, reservas: 0, otros: 0, pendiente: 0, growth: 0, ocupacion: 0 }
    };

    for (const p of ['today', 'week', 'month']) {
      const pBookings = (bookingsList || []).filter(b => {
        if (!b) return false;
        const bDate = b.date || b.start_time || b.startTime;
        return checkInPeriod(bDate, p) && b.status !== 'cancelled';
      });

      const pManual = (manualTxsList || []).filter(t => checkInPeriod(t.date, p));

      let reservasTotal = 0;
      let pendienteTotal = 0;

      pBookings.forEach(b => {
        const price = Number(b.price || b.price_total || 0);
        const paid = b.payment_status === 'paid' ? price : Number(b.amount_paid || b.deposit || 0);
        reservasTotal += paid;
        if (b.payment_status !== 'paid' && price > paid) {
          pendienteTotal += (price - paid);
        }
      });

      const manualIncome = pManual.filter(t => t.type === 'income').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      const manualExpense = pManual.filter(t => t.type === 'expense').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

      const incomeTotal = reservasTotal + manualIncome;
      const balanceTotal = incomeTotal - manualExpense;
      const slots = p === 'today' ? 12 : p === 'week' ? 84 : 360;
      const ocupacionPct = pBookings.length > 0 ? Math.min(100, Math.round((pBookings.length / slots) * 100)) : 0;

      newSummaries[p] = {
        income: incomeTotal,
        expense: manualExpense,
        balance: balanceTotal,
        reservas: reservasTotal,
        otros: manualIncome,
        pendiente: pendienteTotal,
        growth: 0,
        ocupacion: ocupacionPct
      };
    }

    setSummaries(newSummaries);

    // Build transactions for selected period
    const activePeriodBookings = (bookingsList || []).filter(b => {
      if (!b) return false;
      const bDate = b.date || b.start_time || b.startTime;
      return checkInPeriod(bDate, currentSelectedPeriod) && b.status !== 'cancelled';
    });

    const bookingTxs: Transaction[] = activePeriodBookings.map(b => {
      const price = Number(b.price || b.price_total || 0);
      const paid = b.payment_status === 'paid' ? price : Number(b.amount_paid || b.deposit || 0);
      return {
        id: `${b.id}-booking`,
        type: 'income',
        category: `Alquiler de Cancha (${b.courtName || 'Cancha'})`,
        amount: paid > 0 ? paid : price,
        date: b.date || (b.start_time ? String(b.start_time).split('T')[0] : todayStr),
        description: `Reserva: ${b.clientName || 'Cliente'}`
      };
    });

    const activePeriodManual = (manualTxsList || []).filter(t => checkInPeriod(t.date, currentSelectedPeriod));

    const merged = [...activePeriodManual, ...bookingTxs].sort((a, b) => {
      const dateA = safeParseDate(a.date)?.getTime() || 0;
      const dateB = safeParseDate(b.date)?.getTime() || 0;
      return dateB - dateA;
    });

    setTransactions(merged);
  }, []);

  // Subscribe to real Firestore bookings for complexId
  useEffect(() => {
    if (!complexId) return;

    const unsubBookings = subscribeToBookings(complexId, (bookingsList) => {
      const list = Array.isArray(bookingsList) ? bookingsList : [];
      setRawBookings(list);
      recomputeFromBookings(list, rawManualTxs, period);
    });

    return () => {
      unsubBookings();
    };
  }, [complexId, recomputeFromBookings]);

  // Recalculate when period changes
  useEffect(() => {
    recomputeFromBookings(rawBookings, rawManualTxs, period);
  }, [period, rawBookings, rawManualTxs, recomputeFromBookings]);

  // Load manual transactions from localStorage if any
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`jogo_manual_txs_${complexId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRawManualTxs(parsed);
        }
      }
    } catch (e) {
      console.warn('Error loading manual transactions from storage:', e);
    }
  }, [complexId]);

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.amount) return;
    
    const categoryToSave = newTx.category === 'Otro' && customCategory 
      ? customCategory 
      : newTx.category;

    const notesWithMethod = `${newTx.paymentMethod} - ${newTx.description}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const localTx: Transaction = {
      id: `manual-${Date.now()}`,
      type: newTx.type,
      category: categoryToSave,
      amount: Number(newTx.amount),
      description: notesWithMethod,
      date: todayStr
    };

    setRawManualTxs(prev => {
      const updated = [localTx, ...prev];
      try {
        localStorage.setItem(`jogo_manual_txs_${complexId}`, JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });
    
    setIsModalOpen(false);
    setNewTx({ type: 'income', amount: '', category: 'Alquiler de Cancha', paymentMethod: 'MercadoPago', description: '' });
    setCustomCategory('');
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

const ProfileView = ({ onDataChange, isDarkMode, onToggleDarkMode, complexId = 'complejo_central' }: { onDataChange?: () => void, isDarkMode?: boolean, onToggleDarkMode?: () => void, complexId?: string }) => {
  const { user, activeComplex, collaboratorData, logout } = useFirebase();
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
    name: activeComplex?.name || 'Colo loco',
    address: activeComplex?.address || 'Av. Corrientes 1234, CABA',
    phone: activeComplex?.phone || '+54 9 11 5555-5555',
    instagram: activeComplex?.instagram || '@cololoco',
    description: activeComplex?.description || 'Complejo deportivo líder.',
    hours: Array.isArray(activeComplex?.hours) ? activeComplex.hours : defaultHours,
    services: activeComplex?.services || ['Estacionamiento', 'Vestuarios', 'Buffet', 'Césped Sintético']
  };

  const [profile, setProfile] = useState<any>(initialProfile);
  const safeHours: any[] = Array.isArray(profile?.hours) ? profile.hours : defaultHours;
  const [courts, setCourts] = useState<Court[]>([]);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  
  // Modals
  const [editSection, setEditSection] = useState<'info' | 'hours' | 'court' | null>(null);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editingHourIndex, setEditingHourIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSaveProfile = async () => {
    setIsSaving(true);
    const profileToSave = { ...profile, hours: safeHours };
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
      const courtPayload = {
        ...court,
        id: court.id ? String(court.id) : `c_${Date.now()}`,
        name: (court.name || 'Cancha').trim(),
        sport: court.sport || court.type || 'fútbol 5',
        surface: court.surface || 'sintético',
        price: Number(court.price ?? court.price_per_hour ?? 0),
        price_per_hour: Number(court.price ?? court.price_per_hour ?? 0),
        status: court.status === 'maintenance' || court.status === 'mantenimiento' ? 'mantenimiento' : (court.status === 'inactiva' ? 'inactiva' : 'activa'),
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

  const handleToggleCourtStatus = async (court: Court) => {
    const newStatus: 'available' | 'maintenance' = court.status === 'maintenance' ? 'available' : 'maintenance';
    const updatedCourt: Court = { ...court, status: newStatus };
    
    setCourts(courts.map(c => c.id === court.id ? updatedCourt : c));
    try {
      await saveCourtInFirestore(complexId, updatedCourt);
    } catch (e) {
      console.warn('Error updating court in Firestore:', e);
    }
  };

  const handleDeleteCourt = async (id: number | string) => {
    try {
      await deleteCourtInFirestore(id, complexId);
    } catch (e) {
      console.warn('Error deleting court in Firestore:', e);
    }
    fetchData();
    if (onDataChange) onDataChange();
  };

  const authUser = auth.currentUser || user;
  const displayName = authUser?.displayName || collaboratorData?.name || authUser?.email?.split('@')[0] || 'Administrador';
  const email = authUser?.email || collaboratorData?.email || 'admin@cololoco.com';
  const photoURL = authUser?.photoURL || collaboratorData?.photoURL;
  const complexDisplayName = activeComplex?.name || profile?.name || 'Colo loco';

  return (
    <div className="bg-gray-50 min-h-full pb-24">
      {/* Top action row */}
      <div className="pt-6 px-4 md:px-6 pb-2 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Perfil del Complejo</h1>
          <p className="text-xs text-gray-500">Gestioná tu sede, canchas y datos de contacto</p>
        </div>
        <button type="button" 
          onClick={() => setEditSection('info')}
          className="p-2.5 bg-white border border-gray-200 rounded-full text-emerald-600 shadow-xs hover:bg-emerald-50 transition-colors"
          title="Editar información"
        >
          <Edit3 size={18} />
        </button>
      </div>

      <div className="px-4 md:px-6 space-y-4 mt-2">
        {/* 1. Tarjeta de Usuario Autenticado / Administrador */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-md border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {photoURL ? (
              <img 
                src={photoURL} 
                alt={displayName} 
                className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-400/40 shadow-md shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold text-xl shadow-md border border-emerald-300/30 shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black tracking-tight truncate">{displayName}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  Administrador
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">{email}</p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400 font-semibold">
                <Store size={14} className="shrink-0" />
                <span className="truncate">Complejo Activo: <strong className="text-white">{complexDisplayName}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {authUser && (
              <button
                type="button"
                onClick={logout}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Cerrar sesión"
              >
                <LogOut size={14} />
                <span>Salir</span>
              </button>
            )}
          </div>
        </div>

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
            {safeHours.map((h: any, i: number) => (
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
                        const newHours = [...safeHours];
                        newHours[i] = { ...newHours[i], open: !newHours[i]?.open };
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
                            const newHours = [...safeHours];
                            newHours[i] = { ...newHours[i], start: e.target.value };
                            setProfile({...profile, hours: newHours});
                          }}
                          className="bg-transparent px-1 py-0.5 text-xs font-medium w-[70px] text-center focus:outline-none text-gray-700"
                        />
                        <span className="text-gray-300">-</span>
                        <input 
                          type="time" 
                          value={h.end} 
                          onChange={e => {
                            const newHours = [...safeHours];
                            newHours[i] = { ...newHours[i], end: e.target.value };
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
              {safeHours.map((h: any, i: number) => (
                <div key={`edit-hour-row-${h.day || i}-${i}`} className="flex items-center gap-2">
                  <div className="w-20 font-medium text-sm">{h.day}</div>
                  <button type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newHours = [...safeHours];
                      newHours[i] = { ...newHours[i], open: !newHours[i]?.open };
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
                          const newHours = [...safeHours];
                          newHours[i] = { ...newHours[i], start: e.target.value };
                          setProfile({...profile, hours: newHours});
                        }}
                        className="bg-gray-50 rounded px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span>-</span>
                      <input 
                        type="time" 
                        value={h.end} 
                        onChange={e => {
                          const newHours = [...safeHours];
                          newHours[i] = { ...newHours[i], end: e.target.value };
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditSection(null);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto pb-safe pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-xl text-gray-900">{editingCourt.id ? 'Editar Cancha' : 'Nueva Cancha'}</h3>
                <p className="text-xs text-gray-500">Configuración de cancha dentro de la sede activa</p>
              </div>
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditSection(null);
                }} 
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre de Cancha *</label>
                <input 
                  value={editingCourt.name || ''} 
                  onChange={e => setEditingCourt({...editingCourt, name: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Ej: Cancha 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Deporte *</label>
                  <select 
                    value={(editingCourt as any).sport || editingCourt.type || 'fútbol 5'} 
                    onChange={e => setEditingCourt({...editingCourt, sport: e.target.value, type: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  >
                    <option value="fútbol 5">fútbol 5</option>
                    <option value="fútbol 6">fútbol 6</option>
                    <option value="fútbol 7">fútbol 7</option>
                    <option value="fútbol 8">fútbol 8</option>
                    <option value="fútbol 9">fútbol 9</option>
                    <option value="fútbol 11">fútbol 11</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Superficie *</label>
                  <select 
                    value={editingCourt.surface || 'sintético'} 
                    onChange={e => setEditingCourt({...editingCourt, surface: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Precio por Hora ($) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input 
                      type="number"
                      placeholder="Ej: 70000"
                      value={(editingCourt as any).price ?? (editingCourt as any).price_per_hour ?? ''} 
                      onChange={e => setEditingCourt({
                        ...editingCourt, 
                        price: e.target.value ? Number(e.target.value) : 0,
                        price_per_hour: e.target.value ? Number(e.target.value) : 0
                      })}
                      className="w-full pl-8 p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Estado Operativo *</label>
                  <select 
                    value={editingCourt.status === 'maintenance' || editingCourt.status === 'mantenimiento' ? 'mantenimiento' : (editingCourt.status === 'inactiva' ? 'inactiva' : 'activa')} 
                    onChange={e => setEditingCourt({...editingCourt, status: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  >
                    <option value="activa">activa</option>
                    <option value="mantenimiento">mantenimiento</option>
                    <option value="inactiva">inactiva</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <input 
                  type="checkbox" 
                  checked={(editingCourt as any).is_roofed || false} 
                  onChange={e => setEditingCourt({...editingCourt, is_roofed: e.target.checked})}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <label className="font-medium text-gray-700 text-sm cursor-pointer">¿Es techada?</label>
              </div>

              {/* Bloqueo de Canchas Mutuo (Superpuestas) */}
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <label className="block text-xs font-bold text-gray-700">Canchas Superpuestas (Bloqueo Mutuo)</label>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Seleccioná las canchas que comparten el mismo espacio físico. Si esta cancha tiene un turno confirmado, las seleccionadas quedarán bloqueadas automáticamente en ese horario.
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
                            ? currentBlocked.filter((id: any) => id !== c.id)
                            : [...currentBlocked, c.id];
                          setEditingCourt({...editingCourt, blockedCourts: newBlocked});
                        }}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm cursor-pointer",
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
                disabled={isSaving || !editingCourt.name || !((editingCourt as any).price || (editingCourt as any).price_per_hour)} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold mt-4 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-900/10 cursor-pointer"
              >
                {isSaving ? 'Guardando en complejo...' : 'Guardar Cancha'}
              </button>
              <button type="button" onClick={() => setEditSection(null)} className="w-full py-2.5 text-gray-500 font-bold hover:text-gray-700 cursor-pointer">Cancelar</button>
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
  
  // Firebase Auth, Active Complex & Database Hook
  const { 
    user, 
    isAdmin, 
    signInWithGoogle, 
    logout, 
    activeComplexId: contextComplexId, 
    activeComplejoName,
    activeComplex, 
    setActiveComplexId 
  } = useFirebase();

  // Router & URL parameters evaluation for Activation and Redirection
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

  // Detección universal del código de activación:
  // Evalúa el query param 'codigo' tanto en '/activar?codigo=...' como en la raíz '/?codigo=...'
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : searchParams;
  const activationCode = (params.get('codigo') || searchParams.get('codigo') || params.get('code') || searchParams.get('code') || '').trim();
  const isActivationRoute = 
    Boolean(activationCode) ||
    currentPath === '/activar' || 
    currentPath.startsWith('/activar') || 
    (typeof window !== 'undefined' && window.location.hash.includes('/activar'));

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

  const activeComplexId = contextComplexId || getActiveComplexId(user);

  // Real-time synchronization for users and courts from shared Firestore database
  useEffect(() => {
    const unsubUsers = subscribeToClients(activeComplexId, (firestoreUsers) => {
      setUsers(firestoreUsers);
    });

    const unsubCourts = subscribeToCourts(activeComplexId, (firestoreCourts) => {
      setCourts(firestoreCourts);
    });

    return () => {
      unsubUsers();
      unsubCourts();
    };
  }, [activeComplexId, refreshKey]);

  const handleSidebarAction = (action: string) => {
    if (action === 'exposure') setShowExposureStats(true);
    if (action === 'demand') setShowDemandStats(true);
    if (action === 'retention') setShowRetentionStats(true);
    if (action === 'chart') setShowFinanceChart(true);
    if (action === 'reports') setShowReportsModal(true);
    if (action === 'support') setShowGlobalSupportModal(true);
  };

  const handleUserClick = (id: number | string) => {
    const found = users.find(u => String(u.id) === String(id));
    if (found) setSelectedUser(found);
  };

  const handleDeleteUser = async (id: number | string) => {
    try {
      await deleteClientInFirestore(id);
      setSelectedUser(null);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateMatch = async (bookingData: any) => {
    try {
      const selectedCourt = courts.find(c => String(c.id) === String(bookingData.courtId || bookingData.court_id));
      const payload = {
        complejoId: activeComplexId,
        complejoName: activeComplejoName || 'Colo loco',
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
        ownerId: auth.currentUser?.uid || '',
        adminId: ''
      };

      // Direct write to canonical Firestore 'bookings' collection
      await createBookingInFirestore(payload);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('[Firestore] Error creating booking:', err);
    }
  };

  const handleCreateUser = async (data: any) => {
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
      await saveClientInFirestore(activeComplexId, userPayload);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error('[Firestore] Error creating user:', e);
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

  // Interceptor for /activar route or ?codigo=... query parameter
  if (isActivationRoute) {
    return (
      <ActivationView
        initialCode={activationCode}
        isDarkMode={isDarkMode}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
          setSearchParams(new URLSearchParams());
        }}
        onSuccess={(newComplexId, complexName) => {
          setActiveComplexId(newComplexId);
          try {
            localStorage.setItem('activeComplexId', newComplexId);
          } catch (e) {}
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
          setSearchParams(new URLSearchParams());
          setActiveTab('schedule');
          setRefreshKey(prev => prev + 1);
          setActivationSuccessBanner(`¡Complejo "${complexName}" activado exitosamente! Has tomado el control de la sede.`);
        }}
      />
    );
  }

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
        activeComplex={activeComplex}
        onOpenActivation={() => {
          window.history.pushState({}, '', '/activar');
          setCurrentPath('/activar');
        }}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-[#0BA70B] dark:bg-[#0BA70B] h-20 flex items-center justify-between px-4 md:px-6 text-white z-20 relative">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden text-white hover:text-white/80 transition-colors p-1 -ml-1 cursor-pointer" aria-label="Abrir menú lateral">
              <Menu size={32} strokeWidth={2.5} />
            </button>
            <div className="flex flex-col">
              <h2 className="text-[20px] md:text-[24px] font-bold tracking-wide leading-tight">
                { 
                 activeTab === 'schedule' ? 'Agenda' :
                 activeTab === 'users' ? 'Usuarios totales' :
                 activeTab === 'finance' ? 'Finanzas' :
                 activeTab === 'profile' ? 'Perfil' : 
                 activeTab === 'analytics' ? 'Analíticas' : activeTab}
              </h2>
              {activeComplex?.name && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-100 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
                  <span className="truncate max-w-[200px]">{activeComplex.name}</span>
                </div>
              )}
            </div>
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
            <div className="w-full pt-3 md:pt-5">
              {activeTab === 'schedule' && (
                <ScheduleView 
                  key="view-schedule"
                  complexId={activeComplexId}
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
                />
              )}
              {activeTab === 'users' && (
                <UsersView 
                  key="view-users"
                  complexId={activeComplexId}
                  onUserClick={handleUserClick} 
                  refreshKey={refreshKey}
                  onDataChange={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'analytics' && <AnalyticsView key="view-analytics" complexId={activeComplexId} />}
              {activeTab === 'finance' && <FinanceView key="view-finance" complexId={activeComplexId} />}
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
            complexId={activeComplexId}
            initialData={selectedMatch}
            onNavigate={handleNavigate}
            onCreate={selectedMatch && selectedMatch.id ? async (data) => {
              try {
                await updateBookingInFirestore(selectedMatch.id, {
                  ...data,
                  complexId: activeComplexId
                });
              } catch (e) {
                console.warn('Error updating in Firestore:', e);
              }
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
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <BottomNav active={activeTab} onNavigate={handleNavigate} />
    </div>
  );
}
