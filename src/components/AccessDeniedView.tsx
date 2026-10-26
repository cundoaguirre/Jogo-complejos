import React from 'react';
import { ShieldAlert, LogOut, MessageCircle, Mail, Instagram, Lock, CreditCard, FileDown, AlertTriangle } from 'lucide-react';
import { useFirebase } from './FirebaseContext';
import { SUPPORT_CONFIG } from '../config/support';
import type { BillingConfig, WeeklyPaymentObligation } from '../lib/weeklyBilling';
import { 
  formatDDMM, 
  formatCurrencyARS, 
  downloadWeeklyBillingPdf, 
  getPaymentWhatsAppUrl 
} from '../lib/weeklyBilling';

interface AccessDeniedViewProps {
  isDarkMode?: boolean;
  blockingObligation?: WeeklyPaymentObligation | null;
  overdueObligations?: WeeklyPaymentObligation[];
  totalOverdueDebt?: number;
  unpaidObligations?: WeeklyPaymentObligation[];
  totalDebt?: number;
  billingConfig?: BillingConfig;
  complexName?: string;
  onOpenPayModal?: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  blockingObligation,
  overdueObligations = [],
  totalOverdueDebt,
  unpaidObligations = [],
  totalDebt,
  billingConfig,
  complexName = 'Mi Complejo',
  onOpenPayModal
}) => {
  const { user, logout } = useFirebase();

  // Recopilar obligaciones relevantes para la suspensión
  const relevantObligations = overdueObligations.length > 0
    ? overdueObligations
    : (unpaidObligations.length > 0
      ? unpaidObligations
      : (blockingObligation ? [blockingObligation] : []));

  // Sumar la deuda total acumulada
  const totalOutstanding = totalOverdueDebt !== undefined && totalOverdueDebt > 0
    ? totalOverdueDebt
    : (totalDebt !== undefined && totalDebt > 0
      ? totalDebt
      : relevantObligations.reduce((sum, o) => sum + (o?.remainingBalance || 0), 0));

  const isDebtSuspension = Boolean(
    (blockingObligation && blockingObligation.remainingBalance > 0) ||
    totalOutstanding > 0 ||
    relevantObligations.some(o => o.remainingBalance > 0)
  );

  const amountFormatted = formatCurrencyARS(totalOutstanding);

  const waPaymentUrl = (billingConfig && (blockingObligation || relevantObligations.length > 0))
    ? getPaymentWhatsAppUrl(billingConfig, blockingObligation || relevantObligations[0] || null, complexName, relevantObligations, totalOutstanding)
    : `https://wa.me/?text=${encodeURIComponent('Hola, ya realicé el pago de Jogo.')}`;

  const handleDownloadPdf = (obl?: WeeklyPaymentObligation) => {
    const target = obl || blockingObligation || relevantObligations[0];
    if (target) {
      downloadWeeklyBillingPdf(target, complexName);
    }
  };

  const hasWhatsApp = Boolean(SUPPORT_CONFIG.whatsappNumber?.trim());
  const hasEmail = Boolean(SUPPORT_CONFIG.email?.trim());
  const hasInstagram = Boolean(SUPPORT_CONFIG.instagramUrl?.trim() || SUPPORT_CONFIG.instagramHandle?.trim());
  const hasAnySupportChannel = hasWhatsApp || hasEmail || hasInstagram;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white transition-colors duration-200">
      {/* Top Navbar */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-[#0BA70B] flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <span className="text-white font-black text-xl tracking-tighter">J</span>
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">JOGO</span>
            <span className="ml-1.5 text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">SaaS</span>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors cursor-pointer"
        >
          <LogOut size={14} />
          <span>Cerrar sesión</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-2xl mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 p-6 sm:p-8 text-center space-y-6">
          {/* CASO E: Suspensión por Deuda Vencida (Jueves en adelante con saldo acumulado) */}
          {isDebtSuspension ? (
            <>
              {/* Icono de Alerta Roja */}
              <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-inner">
                <ShieldAlert size={32} />
              </div>

              {/* Título y Monto Total Acumulado */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 text-[11px] font-semibold border border-red-200/80 dark:border-red-800/60">
                  <Lock size={11} />
                  <span>Acceso Suspendido</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Tu acceso a Jogo está suspendido
                </h1>
                <div className="text-3xl sm:text-4xl font-black text-red-600 dark:text-red-400 tracking-tight font-mono pt-1">
                  {amountFormatted}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {relevantObligations.length > 1
                    ? `Deuda total acumulada (${relevantObligations.length} semanas pendientes)`
                    : 'Saldo semanal pendiente'}
                </p>
              </div>

              {/* Detalle por semana de la deuda acumulada */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs text-left space-y-3">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {relevantObligations.length > 1 ? (
                    <>
                      Hay un saldo pendiente acumulado de <span className="font-bold text-slate-900 dark:text-white">{amountFormatted}</span> correspondiente a <span className="font-semibold text-slate-900 dark:text-white">{relevantObligations.length} semanas</span>. El acceso se restablecerá al regularizar las obligaciones vencidas:
                    </>
                  ) : relevantObligations.length === 1 ? (
                    <>
                      Hay un saldo pendiente de <span className="font-bold text-slate-900 dark:text-white">{amountFormatted}</span> correspondiente al período <span className="font-semibold text-slate-900 dark:text-white">{formatDDMM(relevantObligations[0].startDateStr)}–{formatDDMM(relevantObligations[0].endDateStr)}</span>.
                    </>
                  ) : (
                    <>
                      Hay un saldo pendiente de <span className="font-bold text-slate-900 dark:text-white">{amountFormatted}</span>.
                    </>
                  )}
                </p>

                {/* Lista desglosada por semana */}
                {relevantObligations.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Detalle por semana:
                    </span>
                    <div className="divide-y divide-slate-200/60 dark:divide-slate-800 rounded-xl overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
                      {relevantObligations.map((obl) => {
                        const start = formatDDMM(obl.startDateStr);
                        const end = formatDDMM(obl.endDateStr);
                        const due = formatDDMM(obl.dueDateStr);
                        const isPartial = obl.amountPaid > 0 && obl.remainingBalance > 0;
                        return (
                          <div key={obl.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>Semana {start}–{end}</span>
                                {isPartial && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                    Pago parcial
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Vencimiento: {due} · Comisión: {formatCurrencyARS(obl.originalAmountDue)}
                                {obl.amountPaid > 0 && ` · Abonado: ${formatCurrencyARS(obl.amountPaid)}`}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-red-600 dark:text-red-400 block">
                                {formatCurrencyARS(obl.remainingBalance)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(obl)}
                                className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer mt-0.5"
                                title="Descargar reporte de esta semana"
                              >
                                <FileDown size={11} />
                                <span>Reporte</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  Una vez registrado el pago, tu acceso se restablecerá automáticamente en tiempo real.
                </p>
              </div>

              {/* Acciones en pantalla */}
              <div className="space-y-3 pt-2">
                {/* Botón principal: Pagar */}
                {onOpenPayModal && (
                  <button
                    type="button"
                    onClick={onOpenPayModal}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-[#0BA70B] hover:from-emerald-700 hover:to-emerald-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                  >
                    <CreditCard size={18} />
                    <span>Pagar total adeudado ({amountFormatted})</span>
                  </button>
                )}

                {/* Botón secundario: Descargar reporte semanal de la última semana */}
                <button
                  type="button"
                  onClick={() => handleDownloadPdf()}
                  className="w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl text-xs sm:text-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <FileDown size={16} />
                  <span>Descargar reporte en PDF</span>
                </button>

                {/* Acción directa: ¿Ya transferiste? Avisanos por WhatsApp */}
                <div className="pt-2">
                  <a
                    href={waPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-4 cursor-pointer transition-colors"
                  >
                    <MessageCircle size={15} />
                    <span>¿Ya transferiste? Avisanos por WhatsApp.</span>
                  </a>
                </div>
              </div>
            </>
          ) : (
            /* CASO ESTÁNDAR: Sin vinculación comercial o prueba vencida */
            <>
              {/* Lock Icon */}
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                <ShieldAlert size={32} />
              </div>

              {/* Heading */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-semibold">
                  <Lock size={11} />
                  <span>Acceso Restringido</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  No tenés acceso a Jogo actualmente.
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Tu cuenta de Google no tiene una sede deportiva vinculada o el acceso no se encuentra activo. Si creés que esto es un error o necesitás habilitar tu complejo, comunicate con el equipo de soporte.
                </p>
              </div>

              {/* Logged in User Pill */}
              {user?.email && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800 text-xs flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">Cuenta conectada:</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">{user.email}</span>
                </div>
              )}

              {/* Contact Support Channels */}
              <div className="space-y-2 pt-2 text-left">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block text-center mb-3">
                  Canales de Atención y Soporte
                </span>

                {hasAnySupportChannel ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {hasWhatsApp && (
                      <a
                        href={`https://wa.me/${SUPPORT_CONFIG.whatsappNumber}?text=${encodeURIComponent(SUPPORT_CONFIG.whatsappPrefilledMessage)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3.5 rounded-2xl bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/50 flex flex-col items-center justify-center text-center gap-1.5 text-emerald-800 dark:text-emerald-300 transition-all cursor-pointer group"
                      >
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                          <MessageCircle size={18} />
                        </div>
                        <span className="text-xs font-bold">WhatsApp</span>
                        <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Soporte directo</span>
                      </a>
                    )}

                    {hasEmail && (
                      <a
                        href={`mailto:${SUPPORT_CONFIG.email}?subject=${encodeURIComponent(SUPPORT_CONFIG.emailSubject)}`}
                        className="p-3.5 rounded-2xl bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/50 flex flex-col items-center justify-center text-center gap-1.5 text-blue-800 dark:text-blue-300 transition-all cursor-pointer group"
                      >
                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                          <Mail size={18} />
                        </div>
                        <span className="text-xs font-bold">Email</span>
                        <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80 truncate max-w-full">
                          {SUPPORT_CONFIG.email}
                        </span>
                      </a>
                    )}

                    {hasInstagram && (
                      <a
                        href={SUPPORT_CONFIG.instagramUrl || `https://instagram.com/${SUPPORT_CONFIG.instagramHandle.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3.5 rounded-2xl bg-purple-50/70 hover:bg-purple-100/70 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 border border-purple-200/60 dark:border-purple-800/50 flex flex-col items-center justify-center text-center gap-1.5 text-purple-800 dark:text-purple-300 transition-all cursor-pointer group"
                      >
                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                          <Instagram size={18} />
                        </div>
                        <span className="text-xs font-bold">Instagram</span>
                        <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80">
                          {SUPPORT_CONFIG.instagramHandle || 'Redes oficiales'}
                        </span>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Canales de atención directa en configuración
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Por favor comunicate con tu ejecutivo de cuenta o representante de Jogo asignado para gestionar la activación de tu sede.
                    </p>
                  </div>
                )}
              </div>

              {/* Action button */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  <LogOut size={16} />
                  <span>Probar con otra cuenta de Google</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-5 text-[11px] text-slate-400 dark:text-slate-600">
        Jogo SaaS © {new Date().getFullYear()} — Plataforma de Gestión de Canchas Deportivas
      </footer>
    </div>
  );
};
