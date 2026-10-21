import React, { useState } from 'react';
import { X, Copy, Check, MessageCircle, AlertCircle, Building2, CreditCard, ShieldCheck } from 'lucide-react';
import type { BillingConfig, WeeklyPaymentObligation } from '../lib/weeklyBilling';
import { 
  formatDDMM, 
  formatCurrencyARS, 
  getPaymentWhatsAppUrl 
} from '../lib/weeklyBilling';

interface PayBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  obligation: WeeklyPaymentObligation | null;
  billingConfig: BillingConfig;
  complexName: string;
}

export const PayBalanceModal: React.FC<PayBalanceModalProps> = ({
  isOpen,
  onClose,
  obligation,
  billingConfig,
  complexName,
}) => {
  const [copiedField, setCopiedField] = useState<'alias' | 'cvu' | null>(null);

  if (!isOpen || !obligation) return null;

  const handleCopy = (text: string, field: 'alias' | 'cvu') => {
    if (!text || text === 'Pendiente de configurar en administración') return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch (err) {
      console.warn('Error copying to clipboard:', err);
    }
  };

  const accountHolder = billingConfig.accountHolder?.trim() || 'Pendiente de configurar en administración';
  const alias = billingConfig.alias?.trim() || 'Pendiente de configurar en administración';
  const cvu = billingConfig.cvu?.trim() || 'Pendiente de configurar en administración';

  const waUrl = getPaymentWhatsAppUrl(billingConfig, obligation, complexName);

  const startFormatted = formatDDMM(obligation.startDateStr);
  const endFormatted = formatDDMM(obligation.endDateStr);
  const amountFormatted = formatCurrencyARS(obligation.remainingBalance);
  const gmvFormatted = formatCurrencyARS(obligation.gmv);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <div className="space-y-0.5">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Regularizá tu saldo
            </h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Liquidación semanal · {startFormatted}–{endFormatted}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Monto destacado y desglose */}
          <div className="p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              Total a transferir
            </span>
            <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight font-mono">
              {amountFormatted}
            </div>
            <div className="text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 pt-1 border-t border-emerald-200/40 dark:border-emerald-800/40">
              GMV jugado: <span className="font-semibold text-slate-900 dark:text-white">{gmvFormatted}</span> ·{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{obligation.playedBookings.length}</span> reservas jugadas ·{' '}
              Comisión 10%
            </div>
          </div>

          {/* Datos bancarios del ERP */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-400 dark:text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Datos para la transferencia
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Titular */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Titular de la cuenta
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                  {accountHolder}
                </span>
              </div>

              {/* Alias con botón copiar */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Alias
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono break-all select-all">
                    {alias}
                  </span>
                </div>
                {alias !== 'Pendiente de configurar en administración' && (
                  <button
                    type="button"
                    onClick={() => handleCopy(alias, 'alias')}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Copiar Alias"
                  >
                    {copiedField === 'alias' ? (
                      <>
                        <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* CVU / CBU con botón copiar */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    CVU / CBU
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono break-all select-all">
                    {cvu}
                  </span>
                </div>
                {cvu !== 'Pendiente de configurar en administración' && (
                  <button
                    type="button"
                    onClick={() => handleCopy(cvu, 'cvu')}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Copiar CVU"
                  >
                    {copiedField === 'cvu' ? (
                      <>
                        <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Nota aclaratoria */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-800 dark:text-amber-300">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Una vez realizada la transferencia, avisá por WhatsApp para que la administración del ERP concilie y registre el cobro. Tu acceso se mantendrá al día automáticamente.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex flex-col sm:flex-row gap-2.5">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-[#0BA70B] hover:from-emerald-700 hover:to-emerald-600 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
          >
            <MessageCircle size={18} />
            <span>Ya pagué · Avisar por WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-5 rounded-2xl font-semibold text-xs sm:text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
