import {
  computeComplexFinancialSummary,
  UnifiedFinancialOperationInput,
  UnifiedFinancialMovementInput
} from '../src/lib/financialMath';

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
console.log('JOGO SAAS — PRUEBAS DE RESUMEN FINANCIERO Y AISLAMIENTO');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST 1: COMPLEJO EN TRIAL CON DATOS REALES PRODUCE MÉTRICAS NO CERO
// ----------------------------------------------------
console.log('--- TEST 1: CÁLCULO DE MÉTRICAS FINANCIERAS REALES EN TRIAL ---');

const targetComplexIds = ['complejo_central', 'B'];

const sampleOperations: UnifiedFinancialOperationInput[] = [
  // Reserva de cancha de $20.000 cobrada $5.000 (seña)
  {
    id: 'op_booking_1',
    complexId: 'complejo_central',
    operationType: 'booking',
    contractualAmount: 20000,
    totalCollected: 5000,
    amountPending: 15000,
    paymentStatus: 'partial',
    isExpense: false
  },
  // Venta POS de cantina $8.000 totalmente cobrada
  {
    id: 'op_pos_1',
    complexId: 'B',
    operationType: 'pos_sale',
    contractualAmount: 8000,
    totalCollected: 8000,
    amountPending: 0,
    paymentStatus: 'paid',
    isExpense: false
  },
  // Gasto operativo $6.000 (factura proveedor luz), pagado $6.000
  {
    id: 'op_expense_1',
    complexId: 'complejo_central',
    operationType: 'expense',
    contractualAmount: 6000,
    totalCollected: 6000,
    amountPending: 0,
    paymentStatus: 'paid',
    isExpense: true
  },
  // Gasto pendiente de pago (proveedor pelotas) $4.000, pagado 0
  {
    id: 'op_expense_pending',
    complexId: 'B',
    operationType: 'expense',
    contractualAmount: 4000,
    totalCollected: 0,
    amountPending: 4000,
    paymentStatus: 'unpaid',
    isExpense: true
  }
];

const sampleMovements: UnifiedFinancialMovementInput[] = [
  // Movimiento de caja seña reserva
  {
    id: 'mov_1',
    complexId: 'complejo_central',
    flow: 'income',
    amount: 5000,
    status: 'completed'
  },
  // Movimiento de caja cobro POS
  {
    id: 'mov_2',
    complexId: 'B',
    flow: 'income',
    amount: 8000,
    status: 'completed'
  },
  // Movimiento egreso de caja pago factura luz
  {
    id: 'mov_3',
    complexId: 'complejo_central',
    flow: 'expense',
    amount: 6000,
    status: 'completed'
  }
];

const summary1 = computeComplexFinancialSummary({
  targetComplexIds,
  operations: sampleOperations,
  movements: sampleMovements
});

// Verificaciones económicas
assertEqual(summary1.economicIncome, 28000, 'Ingresos económicos: $20.000 (reserva) + $8.000 (cantina) = $28.000');
assertEqual(summary1.economicExpenses, 10000, 'Egresos económicos: $6.000 + $4.000 = $10.000');
assertEqual(summary1.netResult, 18000, 'Resultado neto: $28.000 - $10.000 = $18.000');

// Verificaciones de caja (flujo de fondos)
assertEqual(summary1.cashInflows, 13000, 'Cobrado efectivo en caja: $5.000 (seña) + $8.000 (cantina) = $13.000');
assertEqual(summary1.cashOutflows, 6000, 'Pagado desembolsado en caja: $6.000');
assertEqual(summary1.cashBalance, 7000, 'Caja disponible real: $13.000 - $6.000 = $7.000');

// Verificaciones de saldos exigibles (devengado pendiente)
assertEqual(summary1.pendingToCollect, 15000, 'Por cobrar: $15.000 (saldo pendiente de cancha)');
assertEqual(summary1.pendingToPay, 4000, 'Por pagar: $4.000 (factura impaga proveedor)');

// ----------------------------------------------------
// TEST 2: AISLAMIENTO MULTI-TENANT ESTRICTO ENTRE COMPLEJOS
// ----------------------------------------------------
console.log('\n--- TEST 2: AISLAMIENTO ESTRICTO DE OTROS COMPLEJOS ---');

const mixedOperations: UnifiedFinancialOperationInput[] = [
  ...sampleOperations,
  // Operación de OTRO complejo que NO debe contaminar los resultados
  {
    id: 'op_other_complex_booking',
    complexId: 'complejo_foraneo_xyz',
    operationType: 'booking',
    contractualAmount: 100000,
    totalCollected: 100000,
    amountPending: 0,
    paymentStatus: 'paid',
    isExpense: false
  },
  {
    id: 'op_other_complex_expense',
    complexId: 'complejo_foraneo_xyz',
    operationType: 'expense',
    contractualAmount: 50000,
    totalCollected: 50000,
    amountPending: 0,
    paymentStatus: 'paid',
    isExpense: true
  }
];

const mixedMovements: UnifiedFinancialMovementInput[] = [
  ...sampleMovements,
  {
    id: 'mov_other_complex_in',
    complexId: 'complejo_foraneo_xyz',
    flow: 'income',
    amount: 100000,
    status: 'completed'
  },
  {
    id: 'mov_other_complex_out',
    complexId: 'complejo_foraneo_xyz',
    flow: 'expense',
    amount: 50000,
    status: 'completed'
  }
];

const summaryIsolated = computeComplexFinancialSummary({
  targetComplexIds: ['complejo_central', 'B'],
  operations: mixedOperations,
  movements: mixedMovements
});

assertEqual(summaryIsolated.economicIncome, 28000, 'Aislamiento: Los ingresos de complejo_foraneo_xyz no contaminan');
assertEqual(summaryIsolated.economicExpenses, 10000, 'Aislamiento: Los egresos de complejo_foraneo_xyz no contaminan');
assertEqual(summaryIsolated.cashInflows, 13000, 'Aislamiento: Cobrado no incluye operaciones externas');
assertEqual(summaryIsolated.cashOutflows, 6000, 'Aislamiento: Pagado no incluye pagos externos');
assertEqual(summaryIsolated.cashBalance, 7000, 'Aislamiento: Caja permanece inalterada');
assertEqual(summaryIsolated.pendingToCollect, 15000, 'Aislamiento: Por cobrar permanece inalterado');
assertEqual(summaryIsolated.pendingToPay, 4000, 'Aislamiento: Por pagar permanece inalterado');

// ----------------------------------------------------
// TEST 3: VENTA PARCIAL NUNCA FIGURA COMO TOTALMENTE COBRADA
// ----------------------------------------------------
console.log('\n--- TEST 3: VENTAS PARCIALES Y SALDOS PENDIENTES ---');

const partialSaleOps: UnifiedFinancialOperationInput[] = [
  {
    id: 'op_fiado_partial',
    complexId: 'complejo_central',
    operationType: 'pos_sale',
    contractualAmount: 12000,
    totalCollected: 4000,
    amountPending: 8000,
    paymentStatus: 'partial',
    isExpense: false
  }
];

const partialSaleMovs: UnifiedFinancialMovementInput[] = [
  {
    id: 'mov_partial_cash',
    complexId: 'complejo_central',
    flow: 'income',
    amount: 4000,
    status: 'completed'
  }
];

const summaryPartial = computeComplexFinancialSummary({
  targetComplexIds: ['complejo_central'],
  operations: partialSaleOps,
  movements: partialSaleMovs
});

assertEqual(summaryPartial.economicIncome, 12000, 'Ingreso total de la venta es $12.000');
assertEqual(summaryPartial.cashInflows, 4000, 'Cobrado en efectivo es estrictamente $4.000 (no $12.000)');
assertEqual(summaryPartial.pendingToCollect, 8000, 'Por cobrar refleja con exactitud el saldo remanente $8.000');
assertEqual(summaryPartial.cashBalance, 4000, 'Caja disponible coincide con el efectivo efectivamente cobrado');

// ----------------------------------------------------
// TEST 4: RESERVA PAID SIN SEPARATE DEPOSIT REFLEJA COBRO COMPLETO
// ----------------------------------------------------
console.log('\n--- TEST 4: RESERVAS COMPLETAMENTE PAGADAS (PAID) ---');

const paidBookingOps: UnifiedFinancialOperationInput[] = [
  {
    id: 'op_booking_paid',
    complexId: 'complejo_central',
    operationType: 'booking',
    contractualAmount: 18000,
    totalCollected: 18000,
    amountPending: 0,
    paymentStatus: 'paid',
    isExpense: false
  }
];

const paidBookingMovs: UnifiedFinancialMovementInput[] = [
  {
    id: 'mov_booking_paid_cash',
    complexId: 'complejo_central',
    flow: 'income',
    amount: 18000,
    status: 'completed'
  }
];

const summaryPaid = computeComplexFinancialSummary({
  targetComplexIds: ['complejo_central'],
  operations: paidBookingOps,
  movements: paidBookingMovs
});

assertEqual(summaryPaid.economicIncome, 18000, 'Ingreso económico por reserva pagada');
assertEqual(summaryPaid.cashInflows, 18000, 'Flujo de caja registrado por reserva pagada');
assertEqual(summaryPaid.pendingToCollect, 0, 'Saldo pendiente es 0');
assertEqual(summaryPaid.netResult, 18000, 'Resultado neto positivo');

// ----------------------------------------------------
// TEST 5: OPERACIONES CANCELADAS
// ----------------------------------------------------
console.log('\n--- TEST 5: OPERACIONES CANCELADAS ---');

const cancelledOps: UnifiedFinancialOperationInput[] = [
  {
    id: 'op_cancelled_booking',
    complexId: 'complejo_central',
    operationType: 'booking',
    contractualAmount: 25000,
    totalCollected: 0,
    amountPending: 0,
    paymentStatus: 'cancelled',
    isExpense: false
  }
];

const summaryCancelled = computeComplexFinancialSummary({
  targetComplexIds: ['complejo_central'],
  operations: cancelledOps,
  movements: []
});

assertEqual(summaryCancelled.economicIncome, 0, 'Operaciones canceladas sin retención no generan ingreso');
assertEqual(summaryCancelled.pendingToCollect, 0, 'Operaciones canceladas no generan saldo por cobrar');
assertEqual(summaryCancelled.cashBalance, 0, 'Caja en cero');

console.log('\n====================================================');
console.log(`RESUMEN DE PRUEBAS: ${passed} pasadas, ${failed} falladas.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
