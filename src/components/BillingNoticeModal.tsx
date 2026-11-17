import React from 'react';
import { X, Calendar, AlertTriangle, FileDown, CreditCard, MessageCircle, Clock, ShieldAlert } from 'lucide-react';
import type { BillingConfig, WeeklyPaymentObligation, NoticeModalType, BillingNoticeTrack } from '../lib/weeklyBilling';
import { 
  formatDDMM, 
  formatCurrencyARS, 
  downloadWeeklyBillingPdf,
  getTrialActivationWhatsAppUrl,
  markSessionNoticeDismissed
} from '../lib/weeklyBilling';
import { downloadUnifiedWeeklyReportPdf } from '../lib/weeklyReportPdfGenerator';

interface BillingNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  noticeType: NoticeModalType | null;
  noticeTrack?: BillingNoticeTrack | null;
  obligation: WeeklyPaymentObligation | null;
  unpaidObligations?: WeeklyPaymentObligation[];
  totalDebt?: number;
  totalOverdueDebt?: number;
  trialDaysRemaining: number | null;
  billingConfig: BillingConfig;
  complexId: string;
  complexName: string;
  onOpenPayModal: () => void;
  bookings?: any[];
  operations?: any[];
  financialMovements?: any[];
  venueProfile?: any;
}

export const BillingNoticeModal: React.FC<BillingNoticeModalProps> = ({
  isOpen,
  onClose,
  noticeType,
  noticeTrack,
  obligation,
  unpaidObligations = [],
  totalOverdueDebt,
  trialDaysRemaining,
  billingConfig,
  complexId,
  complexName,
  onOpenPayModal,
  bookings,
  operations,
  financialMovements,
  venueProfile
}) => {
  const [isDownloading, setIsDownloading] = React.useState(false);
  if (!isOpen || !noticeType) return null;

  const resolvedTrack: BillingNoticeTrack = noticeTrack || (
    obligation?.track === 'subscription' || obligation?.id?.startsWith('sub_') || obligation?.id?.startsWith('plan_')
      ? 'subscription'
      : 'commission'
  );

  const handleDismiss = () => {
    if (noticeType === 'trial') {
      markSessionNoticeDismissed(complexId, 'trial');
    } else if (resolvedTrack === 'subscription') {
      if (noticeType === 'monday') {
        markSessionNoticeDismissed(complexId, 'sub_monday');
      } else if (obligation && (noticeType === 'tuesday' || noticeType === 'wednesday')) {
        markSessionNoticeDismissed(complexId, obligation.id);
      }
    } else if (obligation) {
      if (noticeType === 'tuesday') {
        markSessionNoticeDismissed(complexId, obligation.id);
      } else if (obligation.daysAfterDue === 0) {
        markSessionNoticeDismissed(complexId, 'comm_monday');
      } else {
        markSessionNoticeDismissed(complexId, `comm_rem_${obligation.id}`);
      }
    }
    onClose();
  };

  const handleDownloadPdf = async () => {
    if (obligation) {
      try {
        setIsDownloading(true);
        await downloadUnifiedWeeklyReportPdf({
          complexId,
          complexName,
          startDateStr: obligation.startDateStr,
          endDateStr: obligation.endDateStr,
          bookings: (bookings && bookings.length > 0) ? bookings : undefined,
          operations,
          financialMovements,
          venueProfile
        });
      } catch (err) {
        console.error('Error generando reporte semanal:', err);
        downloadWeeklyBillingPdf(obligation, complexName);
      } finally {
        setIsDownloading(false);
      }
    }
  };

  const trialWaUrl = getTrialActivationWhatsAppUrl(billingConfig, complexName);

  // -------------------------------------------------------------------------
  // A. Tarjeta de Prueba Gratuita (últimos 3 días)
  // -------------------------------------------------------------------------
  if (noticeType === 'trial') {
    const isSingleDay = trialDaysRemaining === 1;
    const badgeText = isSingleDay ? 'Prueba · Último día' : `Prueba · Últimos ${trialDaysRemaining} días`;
    const titleText = isSingleDay ? 'Te queda 1 día de prueba' : `Te quedan ${trialDaysRemaining} días de prueba`;

    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
        <div 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Badge & Close Button */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
              <Clock size={13} />
              <span>{badgeText}</span>
            </span>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={18} />
            </button>
          </div>

          {/* Heading & Text */}
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {titleText}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Aprovechá estos últimos días para conocer todo lo que Jogo puede hacer por tu complejo.
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Si querés seguir usando Jogo para llevar el control de tu negocio, contactanos para activar tu cuenta.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <a
              href={trialWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#129D44] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <MessageCircle size={17} />
              <span>Contactanos para activar</span>
            </a>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2.5 px-4 rounded-2xl font-semibold text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay obligación para los avisos de pago, no renderizar
  if (!obligation) return null;

  const startFormatted = formatDDMM(obligation.startDateStr);
  const endFormatted = formatDDMM(obligation.endDateStr);
  const dueFormatted = formatDDMM(obligation.dueDateStr);
  const amountFormatted = formatCurrencyARS(obligation.remainingBalance);

  // -------------------------------------------------------------------------
  // B. Carril B — Turnos de Jogo (aviso semanal positivo dentro del mes pago)
  // -------------------------------------------------------------------------
  if (resolvedTrack === 'commission') {
    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
        <div 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Row */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
              <Calendar size={13} />
              <span>Turnos de Jogo</span>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={18} />
            </button>
          </div>

          {/* Heading & Prominent Amount */}
          <div className="space-y-1">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Resumen semanal
            </h3>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-1 font-mono">
              {amountFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta semana se jugaron {obligation.playedBookings.length} turnos acercados por Jogo ({startFormatted}–{endFormatted}).
            </p>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                handleDismiss();
                onOpenPayModal();
              }}
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#129D44] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="w-full py-2.5 px-4 rounded-2xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <FileDown size={15} />
              <span>{isDownloading ? 'Generando reporte...' : 'Descargar reporte semanal'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // C. Carril A — Plan Jogo (Día de vencimiento: daysAfterDue === 0)
  // -------------------------------------------------------------------------
  if (noticeType === 'monday') {
    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
        <div 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Row */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
              <Calendar size={13} />
              <span>Plan Jogo</span>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={18} />
            </button>
          </div>

          {/* Heading & Prominent Amount */}
          <div className="space-y-1">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Hoy se renueva tu Plan Jogo
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Seguí gestionando tus canchas y tu caja un mes más.
            </p>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-1 font-mono">
              {amountFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Período del ciclo:</span>{' '}
              {startFormatted}–{endFormatted}
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Vencimiento:</span>{' '}
              hoy {dueFormatted}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                handleDismiss();
                onOpenPayModal();
              }}
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#129D44] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // D. Carril A — Plan Jogo (1 día después: daysAfterDue === 1)
  // -------------------------------------------------------------------------
  if (noticeType === 'tuesday') {
    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
        <div 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Row */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
              <AlertTriangle size={13} />
              <span>Renovación pendiente</span>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={18} />
            </button>
          </div>

          {/* Heading & Prominent Amount */}
          <div className="space-y-1">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Renová tu Plan Jogo
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Mantené tu agenda, tu mostrador y tus métricas activas sin interrupciones.
            </p>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-1 font-mono">
              {amountFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Período del ciclo:</span>{' '}
              {startFormatted}–{endFormatted}
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Vencimiento:</span>{' '}
              {dueFormatted}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                handleDismiss();
                onOpenPayModal();
              }}
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#129D44] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // E. Carril A — Plan Jogo (Último día: daysAfterDue === 2)
  // -------------------------------------------------------------------------
  if (noticeType === 'wednesday') {
    const overdueCommissions = unpaidObligations.filter(
      o => o.track !== 'subscription' && o.remainingBalance > 0 && o.daysAfterDue >= 1
    );
    const overdueCommTotal = overdueCommissions.reduce((sum, o) => sum + (o.remainingBalance || 0), 0);
    const totalToRegularize = (totalOverdueDebt && totalOverdueDebt > 0)
      ? totalOverdueDebt
      : (obligation.remainingBalance + overdueCommTotal);
    const totalRegularizeFormatted = formatCurrencyARS(totalToRegularize);

    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
        <div 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-900/60 shadow-2xl overflow-hidden p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Badge & Close */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200/80 dark:border-red-800/60">
              <ShieldAlert size={13} />
              <span>Último día</span>
            </span>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={18} />
            </button>
          </div>

          {/* Heading & Total */}
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Mañana se pausa tu acceso
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Renová tu Plan Jogo hoy para seguir operando normalmente mañana a las 00:00.
            </p>
            <div className="text-3xl font-black text-red-600 dark:text-red-400 tracking-tight pt-1 font-mono">
              {totalRegularizeFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Plan Jogo ({startFormatted}–{endFormatted})</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{amountFormatted}</span>
            </div>
            {overdueCommTotal > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Turnos de Jogo ({overdueCommissions.length} {overdueCommissions.length === 1 ? 'semana' : 'semanas'})
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrencyARS(overdueCommTotal)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                handleDismiss();
                onOpenPayModal();
              }}
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

