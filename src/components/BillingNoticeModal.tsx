import React from 'react';
import { X, Calendar, AlertTriangle, FileDown, CreditCard, MessageCircle, Clock, ShieldAlert } from 'lucide-react';
import type { BillingConfig, WeeklyPaymentObligation, NoticeModalType } from '../lib/weeklyBilling';
import { 
  formatDDMM, 
  formatCurrencyARS, 
  downloadWeeklyBillingPdf,
  getTrialActivationWhatsAppUrl,
  markDailyNoticeDismissed,
  markSessionNoticeDismissed
} from '../lib/weeklyBilling';

interface BillingNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  noticeType: NoticeModalType | null;
  obligation: WeeklyPaymentObligation | null;
  trialDaysRemaining: number | null;
  billingConfig: BillingConfig;
  complexId: string;
  complexName: string;
  onOpenPayModal: () => void;
}

export const BillingNoticeModal: React.FC<BillingNoticeModalProps> = ({
  isOpen,
  onClose,
  noticeType,
  obligation,
  trialDaysRemaining,
  billingConfig,
  complexId,
  complexName,
  onOpenPayModal
}) => {
  if (!isOpen || !noticeType) return null;

  const handleDismiss = () => {
    if (noticeType === 'trial') {
      markDailyNoticeDismissed(complexId, 'trial');
    } else if (noticeType === 'monday') {
      markDailyNoticeDismissed(complexId, 'monday');
    } else if (obligation && (noticeType === 'tuesday' || noticeType === 'wednesday')) {
      markSessionNoticeDismissed(complexId, obligation.id);
    }
    onClose();
  };

  const handleDownloadPdf = () => {
    if (obligation) {
      downloadWeeklyBillingPdf(obligation, complexName);
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
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#0BA70B] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
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

  // Si no hay obligación para los avisos de deuda, no renderizar
  if (!obligation) return null;

  const startFormatted = formatDDMM(obligation.startDateStr);
  const endFormatted = formatDDMM(obligation.endDateStr);
  const dueFormatted = formatDDMM(obligation.dueDateStr);
  const amountFormatted = formatCurrencyARS(obligation.remainingBalance);

  // -------------------------------------------------------------------------
  // B. Tarjeta de Lunes (daysAfterDue === 0)
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
              <span>Liquidación semanal</span>
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
              Tu saldo semanal vence hoy
            </h3>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-1 font-mono">
              {amountFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Período:</span>{' '}
              {startFormatted}–{endFormatted} ({obligation.playedBookings.length} reservas jugadas)
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Vencimiento:</span>{' '}
              hoy, lunes {dueFormatted}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800">
              Podés regularizar el saldo durante el día de hoy para mantener tu cuenta al día.
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
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#0BA70B] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="w-full py-2.5 px-4 rounded-2xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileDown size={15} />
              <span>Descargar reporte semanal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // C. Tarjeta de Martes (daysAfterDue === 1)
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
              <span>Saldo pendiente</span>
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
              Mantené tu complejo al día
            </h3>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-1 font-mono">
              {amountFormatted}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Período:</span>{' '}
              {startFormatted}–{endFormatted}
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Vencimiento:</span>{' '}
              ayer, lunes {dueFormatted}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800">
              Podés regularizar el saldo hoy y seguir usando Jogo con normalidad.
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
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#0BA70B] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="w-full py-2.5 px-4 rounded-2xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileDown size={15} />
              <span>Descargar reporte semanal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // D. Tarjeta de Miércoles (daysAfterDue === 2 - Último aviso antes del corte)
  // -------------------------------------------------------------------------
  if (noticeType === 'wednesday') {
    // Calculamos el jueves correspondiente al vencimiento + 3 días
    const thursdayDateStr = (() => {
      const parts = obligation.dueDateStr.split('-').map(Number);
      const thDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 3));
      const d = thDate.getUTCDate();
      const m = thDate.getUTCMonth() + 1;
      return `${d < 10 ? '0' + d : d}/${m < 10 ? '0' + m : m}`;
    })();

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
              <span>Último aviso</span>
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

          {/* Heading */}
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Mañana podés perder tu acceso
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Tenés <span className="font-bold text-red-600 dark:text-red-400">{amountFormatted}</span> pendientes del período{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{startFormatted}–{endFormatted}</span>.
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Si el pago no queda registrado, tu acceso se suspenderá mañana, jueves {thursdayDateStr}, a las 00:00.
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
              className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              <CreditCard size={17} />
              <span>Pagar</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="w-full py-2.5 px-4 rounded-2xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileDown size={15} />
              <span>Descargar reporte semanal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
