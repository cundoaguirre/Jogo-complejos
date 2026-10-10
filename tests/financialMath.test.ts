import {
  calculateFinancialBalances,
  validateStateTransition,
  calculateCurrentAccountAssignment,
  calculateCurrentAccountClearing,
  calculateHistoricalDebtSettlement,
  validateIdempotencyRequest,
  formatTicketCode,
  parseTicketCode
} from '../src/lib/financialMath';
import type { IdempotencyRecord } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}\n         Esperado: ${JSON.stringify(expected)}\n         Obtenido: ${JSON.stringify(actual)}`);
  }
}

console.log('====================================================');
console.log('JOGO SAAS — PRUEBAS UNITARIAS DE MATEMÁTICA FINANCIERA');
console.log('====================================================\n');

// ----------------------------------------------------
// GRUPO 1: CÁLCULO DE SALDOS Y ESTADOS EN OPERACIONES NORMALES
// ----------------------------------------------------
console.log('--- GRUPO 1: OPERACIONES ACTIVAS (NORMALES Y LÍMITES) ---');

// 1.1 Importes cero
const rZero = calculateFinancialBalances({
  contractualAmount: 0,
  totalCollected: 0,
  totalRefunded: 0
});
assertEqual(rZero.paymentStatus, 'unpaid', 'Importe cero debe resultar en estado unpaid');
assertEqual(rZero.amountPending, 0, 'Saldo pendiente con importe cero es 0');

// 1.2 Operación creada sin pagos ($100.000, cobrado 0)
const rUnpaid = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 0,
  totalRefunded: 0
});
assertEqual(rUnpaid.paymentStatus, 'unpaid', 'Reserva sin seña debe estar unpaid');
assertEqual(rUnpaid.amountPending, 100000, 'Saldo pendiente debe ser $100.000');

// 1.3 Primer cobro parcial: Seña de $5.000 sobre $100.000
const rSeña = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 5000,
  totalRefunded: 0
});
assertEqual(rSeña.paymentStatus, 'partial', 'Reserva con seña de $5.000 debe estar en estado partial');
assertEqual(rSeña.amountPending, 95000, 'Saldo pendiente tras seña debe ser $95.000');
assertEqual(rSeña.netCollected, 5000, 'Neto recaudado tras seña debe ser $5.000');

// 1.4 Segundo cobro parcial: +$60.000 acumulando $65.000 sobre $100.000
const rSecondPay = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 65000,
  totalRefunded: 0
});
assertEqual(rSecondPay.paymentStatus, 'partial', 'Reserva con $65.000 cobrados debe permanecer en partial');
assertEqual(rSecondPay.amountPending, 35000, 'Saldo pendiente tras segundo cobro debe ser $35.000');

// 1.5 Tercer cobro final: +$35.000 acumulando $100.000 sobre $100.000
const rFullyPaid = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 100000,
  totalRefunded: 0
});
assertEqual(rFullyPaid.paymentStatus, 'paid', 'Reserva con $100.000 cobrados debe estar en paid');
assertEqual(rFullyPaid.amountPending, 0, 'Saldo pendiente debe ser exactamente 0');

// 1.6 Sobrepago: Intento de cobrar $110.000 sobre $100.000
const rOverpaid = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 110000,
  totalRefunded: 0
});
assertEqual(rOverpaid.paymentStatus, 'paid', 'Sobrepago debe mantener estado paid');
assertEqual(rOverpaid.amountPending, 0, 'Saldo pendiente ante sobrepago debe ser 0 (nunca negativo)');
assertEqual(rOverpaid.netCollected, 110000, 'Neto recaudado refleja el total percibido');

// ----------------------------------------------------
// GRUPO 2: CANCELACIONES, DEVOLUCIONES Y RETENCIONES
// ----------------------------------------------------
console.log('\n--- GRUPO 2: CANCELACIONES, DEVOLUCIONES Y RETENCIONES ---');

// 2.1 Cancelación sin cobros previos ($0 cobrado)
const rCancelUnpaid = calculateFinancialBalances({
  contractualAmount: 80000,
  totalCollected: 0,
  totalRefunded: 0,
  isCancelled: true
});
assertEqual(rCancelUnpaid.paymentStatus, 'cancelled_unpaid', 'Cancelación sin cobros debe ser cancelled_unpaid');
assertEqual(rCancelUnpaid.amountPending, 0, 'Saldo pendiente al cancelar debe ser 0');
assertEqual(rCancelUnpaid.retainedAmount, 0, 'Monto retenido sin cobros debe ser 0');

// 2.2 Cancelación con retención total de seña (penalidad por cancelación tardía)
const rCancelRetained = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 5000,
  totalRefunded: 0,
  isCancelled: true,
  retainDepositOnCancel: true
});
assertEqual(rCancelRetained.paymentStatus, 'cancelled_retained', 'Cancelación con retención debe ser cancelled_retained');
assertEqual(rCancelRetained.amountPending, 0, 'Saldo pendiente de reserva cancelada retenida debe ser 0');
assertEqual(rCancelRetained.retainedAmount, 5000, 'Monto retenido debe ser exactamente la seña ($5.000)');
assertEqual(rCancelRetained.netCollected, 5000, 'Neto en caja debe reflejar los $5.000 retenidos');

// 2.3 Cancelación con devolución parcial de seña ($5.000 seña, $2.000 reintegrados)
const rCancelPartialRefund = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 5000,
  totalRefunded: 2000,
  isCancelled: true
});
assertEqual(rCancelPartialRefund.paymentStatus, 'partial_refunded', 'Cancelación con devolución parcial debe ser partial_refunded');
assertEqual(rCancelPartialRefund.amountPending, 0, 'Saldo pendiente al cancelar debe ser 0');
assertEqual(rCancelPartialRefund.totalRefunded, 2000, 'Total devuelto debe ser $2.000');
assertEqual(rCancelPartialRefund.retainedAmount, 3000, 'Monto retenido remanente debe ser $3.000');
assertEqual(rCancelPartialRefund.netCollected, 3000, 'Neto en poder del complejo debe ser $3.000');

// 2.4 Cancelación con devolución total de seña ($5.000 seña, $5.000 reintegrados)
const rCancelFullRefund = calculateFinancialBalances({
  contractualAmount: 100000,
  totalCollected: 5000,
  totalRefunded: 5000,
  isCancelled: true
});
assertEqual(rCancelFullRefund.paymentStatus, 'fully_refunded', 'Cancelación con devolución total debe ser fully_refunded');
assertEqual(rCancelFullRefund.amountPending, 0, 'Saldo pendiente debe ser 0');
assertEqual(rCancelFullRefund.retainedAmount, 0, 'Monto retenido con devolución total debe ser 0');
assertEqual(rCancelFullRefund.netCollected, 0, 'Neto en caja de la operación debe ser $0');

// ----------------------------------------------------
// GRUPO 3: VALIDACIÓN DE TRANSICIONES DE ESTADO
// ----------------------------------------------------
console.log('\n--- GRUPO 3: MÁQUINA DE ESTADOS Y TRANSICIONES ---');

assert(validateStateTransition('unpaid', 'partial').valid, 'Transición unpaid -> partial es válida');
assert(validateStateTransition('partial', 'paid').valid, 'Transición partial -> paid es válida');
assert(validateStateTransition('partial', 'cancelled_retained').valid, 'Transición partial -> cancelled_retained es válida');
assert(validateStateTransition('cancelled_retained', 'partial_refunded').valid, 'Transición cancelled_retained -> partial_refunded es válida');
assert(validateStateTransition('partial_refunded', 'fully_refunded').valid, 'Transición partial_refunded -> fully_refunded es válida');
assert(!validateStateTransition('unpaid', 'fully_refunded').valid, 'Transición unpaid -> fully_refunded debe ser rechazada');
assert(!validateStateTransition('fully_refunded', 'paid').valid, 'Transición fully_refunded -> paid debe ser rechazada (terminal)');
assert(!validateStateTransition('cancelled_unpaid', 'partial').valid, 'Transición cancelled_unpaid -> partial debe ser rechazada (terminal)');

// ----------------------------------------------------
// GRUPO 4: CUENTA CORRIENTE Y ASIGNACIÓN DE DEUDA PERSONAL
// ----------------------------------------------------
console.log('\n--- GRUPO 4: CUENTA CORRIENTE Y FIADO ---');

// 4.1 Reserva normal con seña sin pacto de cuenta corriente
const normalBookingCC = calculateCurrentAccountAssignment(95000, false);
assertEqual(normalBookingCC.assignedToCurrentAccount, false, 'Reserva común no debe asignarse a cuenta corriente');
assertEqual(normalBookingCC.debtToAssign, 0, 'Reserva común no debe generar deuda personal');

// 4.2 Venta de mostrador asignada a cuenta corriente por el saldo total
const posCC = calculateCurrentAccountAssignment(2900, true);
assertEqual(posCC.assignedToCurrentAccount, true, 'Venta con fiado explícito debe asignarse a cuenta corriente');
assertEqual(posCC.debtToAssign, 2900, 'Debe asignarse exactamente el saldo pendiente ($2.900)');

// 4.3 Asignación de deuda con tope pactado menor al saldo pendiente
const customCC = calculateCurrentAccountAssignment(95000, true, 40000);
assertEqual(customCC.debtToAssign, 40000, 'Debe respetarse el importe de fiado acordado ($40.000)');

// 4.4 Intento de fiar más que el saldo pendiente (debe toparse)
const overCC = calculateCurrentAccountAssignment(15000, true, 30000);
assertEqual(overCC.debtToAssign, 15000, 'La deuda a asignar no puede exceder el saldo pendiente');

// 4.5 Cobro sobre una operación fiada que reduce la deuda del usuario
const clearCC1 = calculateCurrentAccountClearing(40000, 25000);
assertEqual(clearCC1.clearedDebtAmount, 25000, 'Debe descontar $25.000 de la deuda');
assertEqual(clearCC1.remainingOperationDebt, 15000, 'Debe restar deuda remanente en $15.000');

// 4.6 Cobro que cancela la totalidad de la deuda fiada
const clearCC2 = calculateCurrentAccountClearing(15000, 20000);
assertEqual(clearCC2.clearedDebtAmount, 15000, 'No puede descontar más que la deuda existente ($15.000)');
assertEqual(clearCC2.remainingOperationDebt, 0, 'Deuda remanente debe ser 0');

// ----------------------------------------------------
// GRUPO 5: ABONO DE DEUDA HISTÓRICA SIN TICKET
// ----------------------------------------------------
console.log('\n--- GRUPO 5: ABONOS DE DEUDA HISTÓRICA ---');

const hist1 = calculateHistoricalDebtSettlement(50000, 20000);
assertEqual(hist1.clearedAmount, 20000, 'Abono histórico parcial debe descontar $20.000');
assertEqual(hist1.remainingDebt, 30000, 'Deuda histórica remanente debe ser $30.000');
assertEqual(hist1.overpayment, 0, 'Sobrepago debe ser 0');

const hist2 = calculateHistoricalDebtSettlement(30000, 30000);
assertEqual(hist2.clearedAmount, 30000, 'Abono total debe descontar los $30.000');
assertEqual(hist2.remainingDebt, 0, 'Deuda remanente debe quedar en 0');

const hist3 = calculateHistoricalDebtSettlement(10000, 15000);
assertEqual(hist3.clearedAmount, 10000, 'Abono superior a la deuda debe descontar solo $10.000');
assertEqual(hist3.remainingDebt, 0, 'Deuda remanente debe ser 0');
assertEqual(hist3.overpayment, 5000, 'Sobrepago detectado debe ser $5.000');

// ----------------------------------------------------
// GRUPO 6: IDEMPOTENCIA Y PREVENCIÓN DE DUPLICADOS
// ----------------------------------------------------
console.log('\n--- GRUPO 6: IDEMPOTENCIA Y PROTECCIÓN DE REINTENTOS ---');

const baseParams = {
  complexId: 'cx_palermo',
  operationId: 'op_100',
  amount: 60000,
  paymentMethod: 'transfer' as const,
  flow: 'income' as const
};

// 6.1 Solicitud nueva
const idempNew = validateIdempotencyRequest(null, baseParams);
assertEqual(idempNew.type, 'NEW', 'Clave no existente debe ser tratada como NEW');

// 6.2 Solicitud completada idéntica (reintento tras confirmación)
const completedRecord: IdempotencyRecord = {
  idempotencyKey: 'key_123',
  complexId: 'cx_palermo',
  operationId: 'op_100',
  amount: 60000,
  paymentMethod: 'transfer',
  flow: 'income',
  status: 'completed',
  movementId: 'mov_999',
  createdAt: null,
  expiresAt: null
};
const idempMatch = validateIdempotencyRequest(completedRecord, baseParams);
assertEqual(idempMatch.type, 'MATCH_COMPLETED', 'Reintento con mismos parámetros debe ser MATCH_COMPLETED');
if (idempMatch.type === 'MATCH_COMPLETED') {
  assertEqual(idempMatch.movementId, 'mov_999', 'Debe retornar el ID del movimiento previamente emitido');
}

// 6.3 Solicitud concurrente en proceso
const processingRecord: IdempotencyRecord = {
  ...completedRecord,
  status: 'processing'
};
const idempProc = validateIdempotencyRequest(processingRecord, baseParams);
assertEqual(idempProc.type, 'IN_PROGRESS', 'Petición concurrente en vuelo debe ser IN_PROGRESS');

// 6.4 Reutilización fraudulenta o errónea de clave con distinto importe
const mismatchAmount = validateIdempotencyRequest(completedRecord, {
  ...baseParams,
  amount: 70000
});
assertEqual(mismatchAmount.type, 'MISMATCH_ERROR', 'Reutilizar clave con distinto monto debe generar MISMATCH_ERROR');

// 6.5 Reutilización de clave con distinta operación
const mismatchOp = validateIdempotencyRequest(completedRecord, {
  ...baseParams,
  operationId: 'op_200'
});
assertEqual(mismatchOp.type, 'MISMATCH_ERROR', 'Reutilizar clave con distinta operación debe generar MISMATCH_ERROR');

// ----------------------------------------------------
// GRUPO 7: GENERACIÓN Y PARSEO DE TICKETS CON CONTADORES
// ----------------------------------------------------
console.log('\n--- GRUPO 7: CÓDIGOS DE TICKET Y CONTADORES ---');

const ticketPOS = formatTicketCode('T', '26', 42);
assertEqual(ticketPOS, 'T-26-000042', 'Ticket POS debe formatearse como T-26-000042');

const ticketBooking = formatTicketCode('B', '26', 108);
assertEqual(ticketBooking, 'B-26-000108', 'Ticket Cancha debe formatearse como B-26-000108');

const ticketExpense = formatTicketCode('G', '26', 15);
assertEqual(ticketExpense, 'G-26-000015', 'Ticket Gasto debe formatearse como G-26-000015');

const ticketHistorical = formatTicketCode('D', '26', 9);
assertEqual(ticketHistorical, 'D-26-000009', 'Ticket Deuda Histórica debe formatearse como D-26-000009');

const parsed = parseTicketCode('B-26-000108');
assertEqual(parsed, { prefix: 'B', year: '26', sequence: 108 }, 'Parseo de ticket válido debe descomponerse correctamente');

const parsedInvalid = parseTicketCode('INVALID_CODE');
assertEqual(parsedInvalid, null, 'Código de ticket no estructurado debe retornar null');

console.log('\n====================================================');
console.log(`RESUMEN DE PRUEBAS: ${passed} pasadas, ${failed} falladas.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
