import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bug, Lightbulb, HelpCircle, AlertTriangle, Send, MessageCircle, 
  Mail, CheckCircle2, Copy, Check, Clock, X, Info, ExternalLink, 
  ShieldCheck, RefreshCw, FileText, ChevronRight, User, Phone, Sparkles,
  Smartphone, Monitor, Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { SupportTicket } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useFirebase } from './FirebaseContext';

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueName?: string;
  adminName?: string;
  adminPhone?: string;
  adminEmail?: string;
  isDarkMode?: boolean;
}

export const ContactSupportModal: React.FC<ContactSupportModalProps> = ({
  isOpen,
  onClose,
  venueName = 'Complejo Jogo',
  adminName = 'Administrador',
  adminPhone = '',
  adminEmail = '',
  isDarkMode = false
}) => {
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [ticketType, setTicketType] = useState<'bug' | 'feature' | 'inquiry' | 'urgent'>('bug');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [appModule, setAppModule] = useState<string>('Agenda y Reservas');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [senderName, setSenderName] = useState(adminName);
  const [senderPhone, setSenderPhone] = useState(adminPhone);
  const [senderEmail, setSenderEmail] = useState(adminEmail);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [supportPhone, setSupportPhone] = useState('5491123456789'); // Support phone for WhatsApp
  
  const { user } = useFirebase();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [ticketsList, setTicketsList] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedHistoryTicket, setSelectedHistoryTicket] = useState<SupportTicket | null>(null);

  // Sync admin and Firebase user info
  useEffect(() => {
    if (user?.email && !senderEmail) setSenderEmail(user.email);
    if (user?.displayName && (!senderName || senderName === 'Administrador')) setSenderName(user.displayName);
    if (adminName && !senderName && !user?.displayName) setSenderName(adminName);
    if (adminPhone && !senderPhone) setSenderPhone(adminPhone);
    if (adminEmail && !senderEmail && !user?.email) setSenderEmail(adminEmail);
  }, [adminName, adminPhone, adminEmail, user]);

  // Load tickets from local storage without external API dependency
  const fetchTickets = () => {
    setIsLoadingTickets(true);
    try {
      const stored = localStorage.getItem('jogo_support_tickets');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTicketsList(Array.isArray(parsed) ? parsed : []);
      } else {
        setTicketsList([]);
      }
    } catch (e) {
      console.warn('Error reading support tickets from storage:', e);
      setTicketsList([]);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
    }
  }, [isOpen]);

  const getSystemDiagnostics = () => {
    if (typeof window === 'undefined') return {};
    return {
      userAgent: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      language: navigator.language,
      platform: navigator.platform,
      timestamp: new Date().toISOString(),
      theme: isDarkMode ? 'dark' : 'light',
      venue: venueName
    };
  };

  const formatWhatsAppMessage = (ticketCode: string) => {
    const typeLabel = ticketType === 'bug' ? '🐛 REPORTE DE ERROR (BUG)' :
                      ticketType === 'feature' ? '💡 SUGERENCIA DE MEJORA' :
                      ticketType === 'urgent' ? '🚨 PROBLEMA URGENTE' : '💬 CONSULTA DE SOPORTE';
    
    const priorityLabel = priority === 'critical' ? '🔴 CRÍTICA' :
                          priority === 'high' ? '🟠 ALTA' :
                          priority === 'medium' ? '🟡 MEDIA' : '🟢 BAJA';

    let msg = `*${typeLabel}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 *Código de Ticket:* ${ticketCode}\n`;
    msg += `🏟️ *Complejo:* ${venueName}\n`;
    msg += `👤 *Administrador:* ${senderName || 'Administrador'}\n`;
    if (senderPhone) msg += `📱 *Teléfono:* ${senderPhone}\n`;
    msg += `📂 *Módulo Afectado:* ${appModule}\n`;
    msg += `⚡ *Prioridad:* ${priorityLabel}\n\n`;
    msg += `📝 *Asunto:* ${title}\n\n`;
    msg += `📄 *Detalle / Descripción:*\n${description}\n`;

    if (includeDiagnostics) {
      const diag = getSystemDiagnostics();
      msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🛠️ *Diagnóstico Técnico:*\n`;
      msg += `• Pantalla: ${diag.screenWidth}x${diag.screenHeight}px\n`;
      msg += `• Fecha/Hora: ${new Date().toLocaleString('es-AR')}\n`;
      msg += `• Modo: ${isDarkMode ? 'Nocturno' : 'Claro'}\n`;
    }

    return msg;
  };

  const handleSend = async (channel: 'whatsapp' | 'email' | 'system') => {
    setFormError(null);
    if (!title.trim()) {
      setFormError('Por favor, ingresa un asunto o título para el reporte.');
      return;
    }
    if (!description.trim()) {
      setFormError('Por favor, describe el error o la sugerencia de mejora.');
      return;
    }

    setIsSubmitting(true);
    try {
      const diagnostics = includeDiagnostics ? getSystemDiagnostics() : {};
      const ticketCode = `TK-${Math.floor(100000 + Math.random() * 900000)}`;

      const newTicket: SupportTicket = {
        id: Date.now(),
        ticket_code: ticketCode,
        type: ticketType,
        priority,
        module: appModule,
        title: title.trim(),
        description: description.trim(),
        admin_name: senderName || 'Administrador',
        admin_phone: senderPhone || '',
        admin_email: senderEmail || user?.email || '',
        status: 'pending',
        channel,
        system_info: JSON.stringify(diagnostics),
        created_at: new Date().toISOString()
      };

      try {
        const stored = localStorage.getItem('jogo_support_tickets');
        const list = stored ? JSON.parse(stored) : [];
        const updated = [newTicket, ...(Array.isArray(list) ? list : [])];
        localStorage.setItem('jogo_support_tickets', JSON.stringify(updated));
      } catch (stErr) {
        console.warn('Error saving ticket in local storage:', stErr);
      }

      setSubmittedTicket(newTicket);
      fetchTickets();

      // Launch messaging service based on channel
      if (channel === 'whatsapp') {
        const text = formatWhatsAppMessage(newTicket.ticket_code);
        const encoded = encodeURIComponent(text);
        const whatsappUrl = supportPhone 
          ? `https://api.whatsapp.com/send?phone=${supportPhone}&text=${encoded}`
          : `https://api.whatsapp.com/send?text=${encoded}`;
        
        // Open WhatsApp in new tab or app
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      } else if (channel === 'email') {
        const typeLabel = ticketType === 'bug' ? 'Reporte de Error' :
                          ticketType === 'feature' ? 'Sugerencia de Mejora' :
                          ticketType === 'urgent' ? 'Urgencia' : 'Consulta';
        const mailSubject = encodeURIComponent(`[${newTicket.ticket_code}] ${typeLabel} - ${title}`);
        const mailBody = encodeURIComponent(formatWhatsAppMessage(newTicket.ticket_code));
        const mailtoUrl = `mailto:soporte@jogo.app?subject=${mailSubject}&body=${mailBody}`;
        window.location.href = mailtoUrl;
      }
    } catch (e: any) {
      console.error('Error submitting support ticket:', e);
      setFormError('No se pudo enviar el reporte. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setTitle('');
    setDescription('');
    setSubmittedTicket(null);
    setActiveTab('form');
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">Crítica</span>;
      case 'high':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">Alta</span>;
      case 'medium':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Media</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Baja</span>;
    }
  };

  const getTypeBadge = (t: string) => {
    switch (t) {
      case 'bug':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400">
            <Bug size={12} /> Error
          </span>
        );
      case 'feature':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <Lightbulb size={12} /> Mejora
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
            <AlertTriangle size={12} /> Urgente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <HelpCircle size={12} /> Consulta
          </span>
        );
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'resolved':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">Resuelto</span>;
      case 'in_review':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">En Revisión</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300">Pendiente</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <MessageCircle size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Centro de Contacto y Soporte
                <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full text-white/90">
                  {venueName}
                </span>
              </h2>
              <p className="text-xs text-emerald-100">
                Reporta errores, sugiere mejoras o contacta al equipo de desarrollo vía mensajería
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 p-1.5 px-4 gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('form'); setSubmittedTicket(null); }}
            className={cn(
              "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === 'form' 
                ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs" 
                : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            )}
          >
            <Send size={14} />
            Nuevo Reporte / Sugerencia
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('history'); fetchTickets(); }}
            className={cn(
              "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer relative",
              activeTab === 'history' 
                ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs" 
                : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            )}
          >
            <Clock size={14} />
            Historial de Reportes
            {ticketsList.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center justify-center">
                {ticketsList.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'form' ? (
            submittedTicket ? (
              /* Success Screen */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 size={36} />
                </div>
                
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">
                    ¡Reporte Enviado y Registrado!
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    Tu solicitud ha sido guardada con éxito en el sistema de tickets y está lista para ser atendida por nuestro equipo de desarrollo.
                  </p>
                </div>

                {/* Ticket Summary Card */}
                <div className="bg-gray-50 dark:bg-slate-800/80 rounded-2xl p-4 text-left border border-gray-200 dark:border-slate-700 max-w-md mx-auto space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400">Código de Ticket</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        {submittedTicket.ticket_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(submittedTicket.ticket_code)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                        title="Copiar código"
                      >
                        {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-slate-400">Tipo:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{getTypeBadge(submittedTicket.type)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-slate-400">Módulo:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{submittedTicket.module}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-slate-400">Asunto:</span>
                    <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">{submittedTicket.title}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const text = formatWhatsAppMessage(submittedTicket.ticket_code);
                      const whatsappUrl = `https://api.whatsapp.com/send?phone=${supportPhone}&text=${encodeURIComponent(text)}`;
                      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer"
                  >
                    <MessageCircle size={16} />
                    Abrir Chat en WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                  >
                    <Send size={14} />
                    Crear Otro Reporte
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Contact / Report Form */
              <div className="space-y-5">
                {formError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                {/* 1. Category Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    1. ¿Qué deseas enviar?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: 'bug', label: 'Reportar Error', sub: 'Falla o bug', icon: Bug, color: 'text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50' },
                      { id: 'feature', label: 'Sugerir Mejora', sub: 'Nueva función', icon: Lightbulb, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50' },
                      { id: 'inquiry', label: 'Consulta', sub: 'Duda o ayuda', icon: HelpCircle, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50' },
                      { id: 'urgent', label: 'Urgente', sub: 'Bloqueo total', icon: AlertTriangle, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50' },
                    ].map((item, itemIdx) => {
                      const isSelected = ticketType === item.id;
                      return (
                        <button
                          key={`ticket-type-btn-${item.id}-${itemIdx}`}
                          type="button"
                          onClick={() => setTicketType(item.id as any)}
                          className={cn(
                            "p-3 rounded-2xl border text-left transition-all flex flex-col items-start gap-1 cursor-pointer",
                            isSelected 
                              ? cn("ring-2 ring-emerald-500 shadow-sm", item.color) 
                              : "bg-gray-50 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                          )}
                        >
                          <div className={cn("p-1.5 rounded-lg", isSelected ? "bg-white/80 dark:bg-slate-900/80" : "bg-white dark:bg-slate-700")}>
                            <item.icon size={16} />
                          </div>
                          <div className="font-bold text-xs mt-1 text-gray-900 dark:text-white">{item.label}</div>
                          <div className="text-[10px] text-gray-500 dark:text-slate-400">{item.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Module & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      2. Módulo Afectado
                    </label>
                    <select
                      value={appModule}
                      onChange={(e) => setAppModule(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="Agenda y Reservas">📅 Agenda y Reservas</option>
                      <option value="Caja y Finanzas">💰 Caja y Finanzas</option>
                      <option value="Clientes (CRM)">👥 Clientes (CRM) y Jugadores</option>
                      <option value="Canchas y Configuración">🏟️ Canchas y Configuración</option>
                      <option value="Perfil y Complejo">⚙️ Perfil del Complejo</option>
                      <option value="General / Rendimiento">⚡ General / Rendimiento / Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      3. Nivel de Prioridad
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'low', label: 'Baja', color: 'border-emerald-400 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' },
                        { id: 'medium', label: 'Media', color: 'border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40' },
                        { id: 'high', label: 'Alta', color: 'border-orange-400 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40' },
                        { id: 'critical', label: 'Crítica', color: 'border-red-400 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40' }
                      ].map((p, pIdx) => (
                        <button
                          key={`priority-btn-${p.id}-${pIdx}`}
                          type="button"
                          onClick={() => setPriority(p.id as any)}
                          className={cn(
                            "py-2.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer",
                            priority === p.id 
                              ? cn("ring-2 ring-emerald-500 font-black", p.color) 
                              : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Title & Description */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      4. Título o Asunto del Reporte <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={
                        ticketType === 'bug' ? 'Ej: No se actualiza el saldo al cobrar seña en efectivo' :
                        ticketType === 'feature' ? 'Ej: Agregar exportación a Excel para lista de clientes' :
                        ticketType === 'urgent' ? 'Ej: Error crítico al abrir la agenda de hoy' : 'Ej: Consulta sobre configuración de canchas'
                      }
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      5. Detalle / Explicación <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder={
                        ticketType === 'bug' 
                          ? 'Describe los pasos para ver el error:\n1. Fui a la pestaña Finanzas...\n2. Hice clic en Registrar Pago...\n3. Apareció el mensaje de error...' 
                          : 'Explica en detalle tu propuesta de mejora y cómo facilitaría la gestión de tu complejo...'
                      }
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none leading-relaxed"
                    />
                    <div className="text-[10px] text-gray-400 text-right mt-1">
                      {description.length} caracteres
                    </div>
                  </div>
                </div>

                {/* 4. Contact info of Admin */}
                <div className="bg-gray-50 dark:bg-slate-800/70 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                      <User size={14} className="text-emerald-600" />
                      Datos de Contacto del Administrador
                    </span>
                    <span className="text-[10px] text-gray-400">Para responderte</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-1">Nombre</label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-1">WhatsApp / Teléfono</label>
                      <input
                        type="text"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        placeholder="+54 9 11 ..."
                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Diagnostics toggle */}
                  <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-gray-400" />
                      <div>
                        <div className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">
                          Incluir diagnóstico técnico automático
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Resolución, navegador, hora y modo de pantalla
                        </div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      id="diag-toggle"
                      checked={includeDiagnostics}
                      onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 5. Action buttons (WhatsApp, Email, System) */}
                <div className="pt-2 space-y-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                    Enviar a través de:
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* WhatsApp Primary */}
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('whatsapp')}
                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <MessageCircle size={16} />
                      Enviar por WhatsApp
                    </button>

                    {/* Email Option */}
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('email')}
                      className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Mail size={16} />
                      Enviar por Correo
                    </button>

                    {/* System Database Ticket only */}
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('system')}
                      className="bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FileText size={16} />
                      Solo Registrar Ticket
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Tickets History Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                    Historial de Reportes y Sugerencias
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Consulta el estado de las solicitudes enviadas desde este complejo
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchTickets}
                  className="p-2 text-gray-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs cursor-pointer"
                  title="Actualizar lista"
                >
                  <RefreshCw size={14} className={isLoadingTickets ? "animate-spin" : ""} />
                  Actualizar
                </button>
              </div>

              {isLoadingTickets ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  Cargando reportes...
                </div>
              ) : ticketsList.length === 0 ? (
                <div className="py-12 text-center bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 p-6 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <FileText size={20} />
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white text-xs">
                    No hay reportes enviados aún
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 max-w-xs mx-auto">
                    Cuando reportes un bug o sugieras una mejora, aparecerá aquí con su código de seguimiento.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Crear mi primer reporte →
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ticketsList.map((ticket, tIdx) => (
                    <div
                      key={`support-ticket-item-${ticket.id || ticket.ticket_code || tIdx}-${tIdx}`}
                      className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-600 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                            {ticket.ticket_code}
                          </span>
                          {getTypeBadge(ticket.type)}
                          {getPriorityBadge(ticket.priority)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>

                      <div className="font-bold text-gray-900 dark:text-white text-xs mb-1">
                        {ticket.title}
                      </div>

                      <p className="text-[11px] text-gray-600 dark:text-slate-300 line-clamp-2 leading-relaxed bg-gray-50 dark:bg-slate-900/50 p-2 rounded-xl mb-2">
                        {ticket.description}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100 dark:border-slate-700/60">
                        <span>
                          {new Date(ticket.created_at).toLocaleString('es-AR', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })} • {ticket.module}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const text = `Hola Soporte Jogo! Quisiera consultar sobre el ticket *${ticket.ticket_code}*: "${ticket.title}".\nEstado actual: ${ticket.status}`;
                              const url = `https://api.whatsapp.com/send?phone=${supportPhone}&text=${encodeURIComponent(text)}`;
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <MessageCircle size={12} />
                            Consultar por WhatsApp
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>Soporte oficial de Jogo Apps</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
