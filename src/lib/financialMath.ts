import type {
  OperationPaymentStatus,
  FinancialCalculationInput,
  FinancialCalculationResult,
  FinancialPaymentMethod,
  FinancialMovementFlow,
  IdempotencyRecord
} from '../types';

/**
 * Calcula de forma determinista y pura los saldos contractuales,
 * flujos de dinero acumulados, retenciones y estado de pago de una operación.
 */
export function calculateFinancialBalances(
  input: FinancialCalculationInput
): FinancialCalculationResult {
  const contractualAmount = Math.max(0, Number(input.contractualAmount) || 0);
  const totalCollected = Math.max(0, Number(input.totalCollected) || 0);
  const totalRefunded = Math.max(0, Number(input.totalRefunded) || 0);
  const isCancelled = Boolean(input.isCancelled);
  const retainDepositOnCancel = input.retainDepositOnCancel ?? true;

  // El neto efectivamente percibido que permanece en poder del complejo
  const netCollected = Math.max(0, totalCollected - totalRefunded);

  // Tratamiento para operaciones canceladas
  if (isCancelled) {
    const amountPending = 0; // Al cancelarse, se extingue el saldo contractual exigible

    if (totalCollected === 0) {
      return {
        contractualAmount,
        totalCollected: 0,
        totalRefunded: 0,
        netCollected: 0,
        retainedAmount: 0,
        amountPending,
        paymentStatus: 'cancelled_unpaid'
      };
    }

    if (totalRefunded >= totalCollected) {
      // Reintegro total
      return {
        contractualAmount,
        totalCollected,
        totalRefunded,
        netCollected: 0,
        retainedAmount: 0,
        amountPending,
        paymentStatus: 'fully_refunded'
      };
    }

    if (totalRefunded > 0 && totalRefunded < totalCollected) {
      // Reintegro parcial
      const retainedAmount = totalCollected - totalRefunded;
      return {
        contractualAmount,
        totalCollected,
        totalRefunded,
        netCollected,
        retainedAmount,
        amountPending,
        paymentStatus: 'partial_refunded'
      };
    }

    // totalRefunded === 0
    if (retainDepositOnCancel) {
      // La seña / cobro previo se retiene formalmente como penalidad/indemnización
      return {
        contractualAmount,
        totalCollected,
        totalRefunded: 0,
        netCollected: totalCollected,
        retainedAmount: totalCollected,
        amountPending,
        paymentStatus: 'cancelled_retained'
      };
    } else {
      return {
        contractualAmount,
        totalCollected,
        totalRefunded: 0,
        netCollected: totalCollected,
        retainedAmount: 0,
        amountPending,
        paymentStatus: 'cancelled_unpaid'
      };
    }
  }

  // Operaciones activas (no canceladas)
  const amountPending = Math.max(0, contractualAmount - netCollected);
  const retainedAmount = 0;

  let paymentStatus: OperationPaymentStatus;
  if (netCollected <= 0) {
    paymentStatus = 'unpaid';
  } else if (netCollected < contractualAmount) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'paid';
  }

  return {
    contractualAmount,
    totalCollected,
    totalRefunded,
    netCollected,
    retainedAmount,
    amountPending,
    paymentStatus
  };
}

/**
 * Valida si una transición de estado de pago es válida según la máquina de estados.
 */
export function validateStateTransition(
  currentStatus: OperationPaymentStatus,
  targetStatus: OperationPaymentStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const validTransitions: Record<OperationPaymentStatus, OperationPaymentStatus[]> = {
    unpaid: ['partial', 'paid', 'cancelled_unpaid'],
    partial: ['paid', 'cancelled_retained', 'partial_refunded', 'fully_refunded'],
    paid: ['partial_refunded', 'fully_refunded'],
    cancelled_unpaid: [], // Estado terminal
    cancelled_retained: ['partial_refunded', 'fully_refunded'], // Permite devolver luego la seña retenida
    partial_refunded: ['fully_refunded'], // Permite devolver el resto
    fully_refunded: [] // Estado terminal
  };

  const allowed = validTransitions[currentStatus] || [];
  if (allowed.includes(targetStatus)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Transición inválida de '${currentStatus}' a '${targetStatus}'.`
  };
}

/**
 * Calcula el impacto en cuenta corriente de un usuario cuando se asigna explícitamente deuda ("Fiado").
 */
export function calculateCurrentAccountAssignment(
  amountPending: number,
  assignToCurrentAccount: boolean,
  customDebtAmount?: number
): { assignedToCurrentAccount: boolean; debtToAssign: number } {
  if (!assignToCurrentAccount || amountPending <= 0) {
    return { assignedToCurrentAccount: false, debtToAssign: 0 };
  }

  // No se puede fiar más que el saldo pendiente de la operación
  const debtToAssign = customDebtAmount !== undefined 
    ? Math.max(0, Math.min(amountPending, Number(customDebtAmount) || 0))
    : amountPending;

  return {
    assignedToCurrentAccount: debtToAssign > 0,
    debtToAssign
  };
}

/**
 * Calcula la reducción de deuda de cuenta corriente al registrar un cobro sobre una operación fiada.
 */
export function calculateCurrentAccountClearing(
  currentOperationDebt: number,
  paymentAmount: number
): { clearedDebtAmount: number; remainingOperationDebt: number } {
  const opDebt = Math.max(0, Number(currentOperationDebt) || 0);
  const payment = Math.max(0, Number(paymentAmount) || 0);

  const clearedDebtAmount = Math.min(opDebt, payment);
  const remainingOperationDebt = Math.max(0, opDebt - clearedDebtAmount);

  return {
    clearedDebtAmount,
    remainingOperationDebt
  };
}

/**
 * Calcula el abono de deuda histórica acumulada en users.debt (sin ticket previo).
 */
export function calculateHistoricalDebtSettlement(
  currentDebt: number,
  paymentAmount: number
): { clearedAmount: number; remainingDebt: number; overpayment: number } {
  const existingDebt = Math.max(0, Number(currentDebt) || 0);
  const payment = Math.max(0, Number(paymentAmount) || 0);

  if (payment > existingDebt) {
    return {
      clearedAmount: existingDebt,
      remainingDebt: 0,
      overpayment: payment - existingDebt
    };
  }

  return {
    clearedAmount: payment,
    remainingDebt: existingDebt - payment,
    overpayment: 0
  };
}

/**
 * Validación estricta de la solicitud de cobro contra el registro de idempotencia persistente.
 */
export type IdempotencyValidationResult =
  | { type: 'NEW' }
  | { type: 'MATCH_COMPLETED'; movementId: string }
  | { type: 'IN_PROGRESS' }
  | { type: 'MISMATCH_ERROR'; reason: string }
  | { type: 'PREVIOUS_FAILED'; errorMessage: string };

export function validateIdempotencyRequest(
  record: IdempotencyRecord | null | undefined,
  requestedParams: {
    complexId: string;
    operationId: string;
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    flow: FinancialMovementFlow;
  }
): IdempotencyValidationResult {
  if (!record) {
    return { type: 'NEW' };
  }

  // Comprobar si los parámetros coinciden exactamente con la intención original
  if (
    record.complexId !== requestedParams.complexId ||
    record.operationId !== requestedParams.operationId ||
    record.amount !== requestedParams.amount ||
    record.paymentMethod !== requestedParams.paymentMethod ||
    record.flow !== requestedParams.flow
  ) {
    return {
      type: 'MISMATCH_ERROR',
      reason: `La clave de idempotencia '${record.idempotencyKey}' ya fue utilizada con parámetros distintos (monto original: $${record.amount}, operación: ${record.operationId}).`
    };
  }

  if (record.status === 'completed') {
    return {
      type: 'MATCH_COMPLETED',
      movementId: record.movementId || ''
    };
  }

  if (record.status === 'processing') {
    return { type: 'IN_PROGRESS' };
  }

  return {
    type: 'PREVIOUS_FAILED',
    errorMessage: record.errorMessage || 'La solicitud previa falló.'
  };
}

/**
 * Formateador de código de ticket determinista y legible.
 * Ejemplo: formatTicketCode('T', '26', 42) => "T-26-000042"
 */
export function formatTicketCode(
  prefix: 'T' | 'B' | 'G' | 'D',
  yearTwoDigits: string,
  sequence: number
): string {
  const safeSeq = Math.max(1, Math.floor(sequence));
  const safeYear = yearTwoDigits.padStart(2, '0').slice(-2);
  return `${prefix}-${safeYear}-${String(safeSeq).padStart(6, '0')}`;
}

/**
 * Parsea un código de ticket en sus componentes estructurales.
 */
export function parseTicketCode(
  ticketCode: string
): { prefix: string; year: string; sequence: number } | null {
  const match = /^([TBGD])-(\d{2})-(\d{6})$/.exec(ticketCode.trim().toUpperCase());
  if (!match) return null;
  return {
    prefix: match[1],
    year: match[2],
    sequence: parseInt(match[3], 10)
  };
}
