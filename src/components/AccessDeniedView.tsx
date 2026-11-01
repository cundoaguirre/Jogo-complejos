import React from 'react';
import { ArrowLeft, MessageCircle, Mail, AlertTriangle, ShieldAlert, CreditCard, FileDown, Lock } from 'lucide-react';
import { useFirebase } from './FirebaseContext';
import type { BillingConfig, WeeklyPaymentObligation } from '../lib/weeklyBilling';
import { formatDDMM, formatCurrencyARS, downloadWeeklyBillingPdf, getPaymentWhatsAppUrl } from '../lib/weeklyBilling';

const GoogleIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

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
  billingConfig: propBillingConfig,
  complexName = 'Mi Complejo',
  onOpenPayModal
}) => {
  const { user, logout, signInWithGoogle, billingConfig: contextBillingConfig } = useFirebase();
  const billingConfig = propBillingConfig || contextBillingConfig;
  const effectiveBillingConfig = billingConfig;

  // Correo dinámico leído desde la Información Oficial de Jogo en el ERP (settings/billing_config)
  const officialEmail = billingConfig?.email?.trim() || 'soporte@jogo.app';
  const emailSubject = encodeURIComponent('Consulta de acceso a complejo Jogo SaaS');
  const emailBody = encodeURIComponent(`Hola equipo Jogo,\n\nMi cuenta de Google es ${user?.email || ''}.\nQuisiera consultar sobre la habilitación del acceso a mi complejo deportivo.\n\nSaludos.`);
  const mailtoUrl = `mailto:${officialEmail}?subject=${emailSubject}&body=${emailBody}`;

  // Recopilar obligaciones relevantes para la suspensión si las hubiera
  const relevantObligations = overdueObligations.length > 0
    ? overdueObligations
    : (unpaidObligations.length > 0
      ? unpaidObligations
      : (blockingObligation ? [blockingObligation] : []));

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

  const rawNumber = (effectiveBillingConfig?.whatsappNumber || '').replace(/\D/g, '');
  const waContactUrl = rawNumber
    ? `https://wa.me/${rawNumber}?text=${encodeURIComponent('Hola, quiero empezar a usar Jogo en mi complejo.')}`
    : `https://wa.me/?text=${encodeURIComponent('Hola, quiero empezar a usar Jogo en mi complejo.')}`;

  const waPaymentUrl = (effectiveBillingConfig && (blockingObligation || relevantObligations.length > 0))
    ? getPaymentWhatsAppUrl(effectiveBillingConfig, blockingObligation || relevantObligations[0] || null, complexName, relevantObligations, totalOutstanding)
    : `https://wa.me/?text=${encodeURIComponent('Hola, ya realicé el pago de Jogo.')}`;

  const handleDownloadPdf = (obl?: WeeklyPaymentObligation) => {
    const target = obl || blockingObligation || relevantObligations[0];
    if (target) {
      downloadWeeklyBillingPdf(target, complexName);
    }
  };

  // CASO DEUDA VENCIDA (Suspensión por deuda)
  if (isDebtSuspension) {
    return (
      <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-[#129D44] selection:text-white transition-colors duration-200">
        <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-[#129D44] flex items-center justify-center shadow-lg shadow-emerald-500/25">
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
            <ArrowLeft size={14} />
            <span>Volver</span>
          </button>
        </header>

        <main className="w-full max-w-2xl mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center">
          <div className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 p-6 sm:p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert size={32} />
            </div>

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
                              className="text-[10px] text-[#129D44] hover:underline inline-flex items-center gap-1 cursor-pointer mt-0.5"
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

            <div className="space-y-3 pt-2">
              {onOpenPayModal && (
                <button
                  type="button"
                  onClick={onOpenPayModal}
                  className="w-full py-3.5 px-4 bg-[#129D44] hover:bg-[#0f853a] text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#129D44]/20 active:scale-[0.99]"
                >
                  <CreditCard size={18} />
                  <span>Pagar total adeudado ({amountFormatted})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDownloadPdf()}
                className="w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl text-xs sm:text-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FileDown size={16} />
                <span>Descargar reporte en PDF</span>
              </button>

              <div className="pt-2">
                <a
                  href={waPaymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#129D44] hover:underline underline-offset-4 cursor-pointer transition-colors"
                >
                  <MessageCircle size={15} />
                  <span>¿Ya transferiste? Avisanos por WhatsApp.</span>
                </a>
              </div>
            </div>
          </div>
        </main>

        <footer className="w-full text-center py-5 text-[11px] text-slate-400 dark:text-slate-600">
          Jogo SaaS © {new Date().getFullYear()} — Plataforma de Gestión de Canchas Deportivas
        </footer>
      </div>
    );
  }

  // CASO OFICIAL: "Todavía no tenés acceso" (Fondo blanco puro, flecha atrás, triángulo coral, bullets y botón verde)
  return (
    <div className="min-h-screen w-full bg-white text-gray-900 flex flex-col justify-between selection:bg-[#129D44] selection:text-white">
      {/* Botón de retroceso arriba a la izquierda */}
      <header className="w-full max-w-xl mx-auto px-6 pt-6 sm:pt-8 flex items-center justify-start">
        <button
          type="button"
          onClick={logout}
          aria-label="Volver al inicio"
          className="p-2 -ml-2 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      {/* Contenido Central */}
      <main className="w-full max-w-md mx-auto px-6 py-6 sm:py-10 flex-1 flex flex-col items-center justify-center text-center">
        {/* Triángulo de advertencia coral */}
        <div className="w-20 h-20 rounded-full bg-[#DE5B5B]/10 flex items-center justify-center text-[#DE5B5B] mb-6">
          <AlertTriangle className="w-10 h-10 stroke-[2.2]" />
        </div>

        {/* Título Principal */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-6">
          Todavía no tenés acceso
        </h1>

        {/* Viñetas informativas */}
        <div className="w-full space-y-4 mb-8 text-left bg-gray-50/70 p-4 sm:p-5 rounded-2xl border border-gray-100">
          {/* Viñeta 1: Círculo rojo / coral */}
          <div className="flex items-start gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#DE5B5B] shrink-0 mt-1.5" />
            <p className="text-sm text-gray-700 leading-snug">
              Si ya tenés una cuenta, verificá haber ingresado con el mail correcto.
            </p>
          </div>

          {/* Viñeta 2: Círculo verde */}
          <div className="flex items-start gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#129D44] shrink-0 mt-1.5" />
            <p className="text-sm text-gray-700 leading-snug">
              Si querés empezar a usar Jogo en tu complejo, contactanos para darte de alta.
            </p>
          </div>
        </div>

        {/* Botón verde oficial redondeado con ícono de Google */}
        <button
          type="button"
          onClick={async () => {
            try {
              await logout();
              await signInWithGoogle();
            } catch (err) {
              console.error('Error signing in with Google:', err);
            }
          }}
          className="w-full py-3.5 px-6 rounded-full bg-[#129D44] hover:bg-[#0f853a] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-3 shadow-md shadow-[#129D44]/25 transition-all cursor-pointer active:scale-[0.99]"
        >
          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-xs">
            <GoogleIcon />
          </div>
          <span>Inicia sesión con Google</span>
        </button>

        {/* Indicador de email conectado actualmente */}
        {user?.email && (
          <p className="mt-4 text-xs text-gray-400">
            Ingresaste como <span className="font-medium text-gray-600">{user.email}</span>
          </p>
        )}
      </main>

      {/* Pie de pantalla con enlaces directos a WhatsApp y Gmail */}
      <footer className="w-full max-w-md mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-xs text-gray-500 border-t border-gray-100">
        <a
          href={waContactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#129D44] font-medium transition-colors cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-[#129D44]" />
          <span>Contactar por WhatsApp</span>
        </a>
        <span className="hidden sm:inline text-gray-300">•</span>
        <a
          href={mailtoUrl}
          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#129D44] font-medium transition-colors cursor-pointer"
        >
          <Mail className="w-4 h-4 text-gray-400" />
          <span>{officialEmail}</span>
        </a>
      </footer>
    </div>
  );
};
