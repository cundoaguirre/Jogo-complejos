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
 * Rechaza estrictamente montos superiores a la deuda pendiente para evitar saldos negativos o excedentes no contabilizados.
 */
export interface HistoricalDebtSettlementResult {
  valid: boolean;
  clearedAmount: number;
  remainingDebt: number;
  error?: string;
}

export function calculateHistoricalDebtSettlement(
  currentDebt: number,
  paymentAmount: number
): HistoricalDebtSettlementResult {
  const existingDebt = Math.max(0, Number(currentDebt) || 0);
  const payment = Number(paymentAmount) || 0;

  if (payment <= 0) {
    return {
      valid: false,
      clearedAmount: 0,
      remainingDebt: existingDebt,
      error: 'El importe a abonar debe ser mayor a 0.'
    };
  }

  if (payment > existingDebt) {
    return {
      valid: false,
      clearedAmount: 0,
      remainingDebt: existingDebt,
      error: `El importe a abonar ($${payment}) supera la deuda pendiente ($${existingDebt}). No se permiten sobrepagos ni saldos negativos.`
    };
  }

  return {
    valid: true,
    clearedAmount: payment,
    remainingDebt: existingDebt - payment
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
    operationId?: string | null;
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    flow: FinancialMovementFlow;
  }
): IdempotencyValidationResult {
  if (!record) {
    return { type: 'NEW' };
  }

  const recordOpId = record.operationId ?? null;
  const requestedOpId = requestedParams.operationId ?? null;

  // Comprobar si los parámetros coinciden exactamente con la intención original
  if (
    record.complexId !== requestedParams.complexId ||
    recordOpId !== requestedOpId ||
    record.amount !== requestedParams.amount ||
    record.paymentMethod !== requestedParams.paymentMethod ||
    record.flow !== requestedParams.flow
  ) {
    return {
      type: 'MISMATCH_ERROR',
      reason: `La clave de idempotencia '${record.idempotencyKey}' ya fue utilizada con parámetros distintos (monto original: $${record.amount}, operación: ${record.operationId ?? 'sin operación'}).`
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
  prefix: 'T' | 'B' | 'G' | 'D' | 'E',
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

export interface ComplexFinancialSummary {
  economicIncome: number;
  reservasIncome: number;
  mostradorIncome: number;
  reservasIncomePct: number;
  mostradorIncomePct: number;
  economicExpense: number;
  economicExpenses: number;
  netResult: number;
  totalCollectedFromClients: number;
  cashInflows: number;
  cashOutflows: number;
  cashAvailable: number;
  cashBalance: number;
  pendingToCollect: number;
  pendingToPay: number;
}

export interface UnifiedFinancialOperationInput {
  id: string;
  complexId?: string | null;
  complejoId?: string | null;
  contractualAmount: number;
  totalCollected: number;
  amountPending: number;
  paymentStatus: string;
  isExpense?: boolean;
  operationType?: string;
  bookingId?: string | number | null;
  retainedAmount?: number;
  netCollected?: number;
}

export interface UnifiedFinancialMovementInput {
  id: string;
  complexId?: string | null;
  complejoId?: string | null;
  flow: 'income' | 'expense';
  category?: string;
  amount: number;
  operationId?: string | null;
  bookingId?: string | number | null;
  status?: string;
}

/**
 * Computa de forma determinista y pura el resumen financiero integral del complejo,
 * respetando el aislamiento estricto multi-tenant y la separación entre dimensiones:
 * 1. Dimensión Económica (devengamiento: ingresos por reservas/ventas y egresos por gastos/compras).
 * 2. Dimensión de Caja (dinero efectivamente percibido o desembolsado).
 * 3. Saldos pendientes (por cobrar a clientes y por pagar a proveedores).
 * 4. Resultado neto (ingresos económicos - egresos económicos, sin duplicaciones).
 */
export function computeComplexFinancialSummary(params: {
  targetComplexIds: string[];
  operations: UnifiedFinancialOperationInput[];
  movements: UnifiedFinancialMovementInput[];
}): ComplexFinancialSummary {
  const allowedIds = new Set(params.targetComplexIds.map(id => String(id).trim().toLowerCase()));
  const CANCELLED_STATUSES = new Set(['cancelled_unpaid', 'cancelled_retained', 'partial_refunded', 'fully_refunded', 'cancelled', 'cancelado']);

  // Filtrado estricto por aislamiento de complejo
  const complexOps = params.operations.filter(op => {
    const c1 = op.complexId ? String(op.complexId).trim().toLowerCase() : null;
    const c2 = op.complejoId ? String(op.complejoId).trim().toLowerCase() : null;
    if (allowedIds.size === 0) return true;
    return (c1 && allowedIds.has(c1)) || (c2 && allowedIds.has(c2));
  });

  const complexMovs = params.movements.filter(mov => {
    const c1 = mov.complexId ? String(mov.complexId).trim().toLowerCase() : null;
    const c2 = mov.complejoId ? String(mov.complejoId).trim().toLowerCase() : null;
    if (allowedIds.size === 0) return true;
    return (c1 && allowedIds.has(c1)) || (c2 && allowedIds.has(c2));
  });

  let economicIncome = 0;
  let reservasIncome = 0;
  let mostradorIncome = 0;
  let economicExpense = 0;

  let pendingToCollect = 0;
  let pendingToPay = 0;

  for (const op of complexOps) {
    const isExp = Boolean(op.isExpense || op.operationType === 'expense' || op.operationType === 'purchase');
    const isCancelled = CANCELLED_STATUSES.has(op.paymentStatus);

    if (isExp) {
      if (!isCancelled) {
        economicExpense += op.contractualAmount;
        if (op.amountPending > 0) {
          pendingToPay += op.amountPending;
        }
      }
    } else {
      let opRevenue = 0;
      if (isCancelled) {
        opRevenue = Math.max(0, Number(op.retainedAmount ?? op.netCollected ?? 0));
      } else {
        opRevenue = op.contractualAmount;
        if (op.amountPending > 0) {
          pendingToCollect += op.amountPending;
        }
      }

      economicIncome += opRevenue;

      const isReserva = op.operationType === 'court_booking' || 
                        op.operationType === 'booking' || 
                        Boolean(op.bookingId) || 
                        String(op.id).endsWith('-booking');

      if (isReserva) {
        reservasIncome += opRevenue;
      } else {
        mostradorIncome += opRevenue;
      }
    }
  }

  const reservasIncomePct = economicIncome > 0 ? Math.round((reservasIncome / economicIncome) * 100) : 0;
  const mostradorIncomePct = economicIncome > 0 ? Math.max(0, 100 - reservasIncomePct) : 0;
  const netResult = economicIncome - economicExpense;

  // Dimensión de Caja
  let cashInflows = 0;
  let cashOutflows = 0;
  let totalRefunds = 0;
  let totalCollectedIncome = 0;

  for (const mov of complexMovs) {
    const amt = Math.max(0, Number(mov.amount) || 0);
    const cat = String(mov.category || '').toLowerCase();
    const isRefund = cat.includes('reintegro') || cat.includes('refund') || cat.includes('devolución') || cat.includes('devolucion');

    if (mov.flow === 'income') {
      cashInflows += amt;
      totalCollectedIncome += amt;
    } else if (mov.flow === 'expense') {
      cashOutflows += amt;
      if (isRefund) {
        totalRefunds += amt;
      }
    }
  }

  const totalCollectedFromClients = Math.max(0, totalCollectedIncome - totalRefunds);
  const cashAvailable = cashInflows - cashOutflows;

  return {
    economicIncome,
    reservasIncome,
    mostradorIncome,
    reservasIncomePct,
    mostradorIncomePct,
    economicExpense,
    economicExpenses: economicExpense,
    netResult,
    totalCollectedFromClients,
    cashInflows,
    cashOutflows,
    cashAvailable,
    cashBalance: cashAvailable,
    pendingToCollect,
    pendingToPay
  };
}

