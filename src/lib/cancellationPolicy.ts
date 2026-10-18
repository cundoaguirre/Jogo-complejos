import type { Match } from '../types';

export interface CancellationPolicy {
  minAnticipationHours: number; // e.g. 24
  withinDeadlineAction: 'refund_full' | 'refund_partial' | 'retain';
  outsideDeadlineAction: 'retain' | 'refund_partial' | 'refund_full';
  notes?: string;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  minAnticipationHours: 24,
  withinDeadlineAction: 'refund_full',
  outsideDeadlineAction: 'retain',
  notes: 'Recomendación estándar: 24 horas de anticipación para devolución total de seña.'
};

export interface CancellationRecommendation {
  canCalculate: boolean;
  hoursAnticipation: number | null;
  recommendedAction: 'refund_full' | 'refund_partial' | 'retain' | null;
  reason: string;
}

/**
 * Calcula la anticipación real comparando la fecha/hora programada del turno con el momento actual,
 * y devuelve la recomendación basada en la política configurada del complejo.
 */
export function calculateCancellationRecommendation(
  booking: {
    date?: string;
    startTime?: string;
    start_time?: string;
  },
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
  now: Date = new Date()
): CancellationRecommendation {
  let scheduledDate: Date | null = null;

  if (booking.start_time && booking.start_time.includes('T')) {
    const parsed = new Date(booking.start_time);
    if (!isNaN(parsed.getTime())) {
      scheduledDate = parsed;
    }
  }

  if (!scheduledDate && booking.date && booking.startTime) {
    const timeParts = booking.startTime.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const dateParts = booking.date.split('-');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        const d = new Date(year, month, day, hours, minutes, 0, 0);
        if (!isNaN(d.getTime())) {
          scheduledDate = d;
        }
      }
    }
  }

  if (!scheduledDate) {
    return {
      canCalculate: false,
      hoursAnticipation: null,
      recommendedAction: null,
      reason: 'No se puede determinar la anticipación exacta por falta de fecha y horario de inicio de la reserva.'
    };
  }

  const diffMs = scheduledDate.getTime() - now.getTime();
  const hoursAnticipation = diffMs / (1000 * 60 * 60);

  const minHours = Number(policy.minAnticipationHours) || 24;

  if (hoursAnticipation >= minHours) {
    return {
      canCalculate: true,
      hoursAnticipation: Math.round(hoursAnticipation * 10) / 10,
      recommendedAction: policy.withinDeadlineAction || 'refund_full',
      reason: `Cancelación con ${hoursAnticipation.toFixed(1)} hs de anticipación (dentro del plazo de ${minHours} hs). Política: sugerir devolución.`
    };
  } else {
    return {
      canCalculate: true,
      hoursAnticipation: Math.round(hoursAnticipation * 10) / 10,
      recommendedAction: policy.outsideDeadlineAction || 'retain',
      reason: `Cancelación con ${Math.max(0, hoursAnticipation).toFixed(1)} hs de anticipación (fuera del plazo de ${minHours} hs). Política: sugerir retención de seña.`
    };
  }
}

export interface CancellationFinancialPlan {
  contractualAmount: number;
  totalCollected: number;
  availableToRefund: number;
  refundAmount: number;
  retainedAmount: number;
  extinguishedPending: number;
  remainingPending: number;
  netImpactOnCash: number;
  finalPaymentStatus: 'cancelled_unpaid' | 'cancelled_retained' | 'partial_refunded' | 'fully_refunded';
}

/**
 * Calcula con precisión contable los importes a devolver, retener y extinguir
 * garantizando que nunca se devuelva más dinero del cobrado no devuelto.
 */
export function calculateCancellationFinancialPlan(params: {
  contractualAmount: number;
  totalCollected: number;
  previousRefunds?: number;
  refundChoice: 'full' | 'none' | 'partial';
  partialAmount?: number;
}): CancellationFinancialPlan {
  const contractualAmount = Math.max(0, Number(params.contractualAmount) || 0);
  const totalCollected = Math.max(0, Number(params.totalCollected) || 0);
  const previousRefunds = Math.max(0, Number(params.previousRefunds) || 0);

  // Importe cobrado que todavía no ha sido devuelto
  const availableToRefund = Math.max(0, totalCollected - previousRefunds);

  let refundAmount = 0;
  if (availableToRefund > 0) {
    if (params.refundChoice === 'full') {
      refundAmount = availableToRefund;
    } else if (params.refundChoice === 'none') {
      refundAmount = 0;
    } else if (params.refundChoice === 'partial') {
      const requested = Math.max(0, Number(params.partialAmount) || 0);
      // Tope estricto: no puede exceder el dinero disponible para devolver
      refundAmount = Math.min(requested, availableToRefund);
    }
  }

  const retainedAmount = Math.max(0, totalCollected - (previousRefunds + refundAmount));
  const previousPaid = totalCollected;
  const originalPending = Math.max(0, contractualAmount - previousPaid);
  const extinguishedPending = originalPending; // Al cancelarse, la deuda restante se extingue a 0
  const remainingPending = 0; // Exigible pasa a 0

  let finalPaymentStatus: 'cancelled_unpaid' | 'cancelled_retained' | 'partial_refunded' | 'fully_refunded';

  const totalRefundedAll = previousRefunds + refundAmount;
  if (totalCollected <= 0) {
    finalPaymentStatus = 'cancelled_unpaid';
  } else if (totalRefundedAll >= totalCollected - 0.01) {
    finalPaymentStatus = 'fully_refunded';
  } else if (totalRefundedAll > 0) {
    finalPaymentStatus = 'partial_refunded';
  } else {
    finalPaymentStatus = 'cancelled_retained';
  }

  return {
    contractualAmount,
    totalCollected,
    availableToRefund,
    refundAmount,
    retainedAmount,
    extinguishedPending,
    remainingPending,
    netImpactOnCash: -refundAmount, // Salida de caja
    finalPaymentStatus
  };
}
