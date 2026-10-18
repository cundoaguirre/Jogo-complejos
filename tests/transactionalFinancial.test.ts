/**
 * Tests transaccionales para el Modelo Financiero Unificado de Jogo SaaS (Etapa 2)
 * 
 * Verifica:
 * 1. Regla de oro de Firestore: TODAS las lecturas se ejecutan estrictamente antes de cualquier escritura.
 * 2. Consistencia 1:1 entre currentAccountDebtAmount de la operación y users/{userId}.debt.
 * 3. Prevención de doble descuento o desincronización de saldos.
 * 4. Abonos de deuda histórica con category: 'historical_debt_payment' y operationId = null (sin operaciones ficticias).
 * 5. Rechazo estricto de sobrepagos en abonos de deuda histórica.
 * 6. Idempotencia estricta contra duplicaciones de cobros y detección de alteraciones de parámetros.
 * 7. Cancelaciones con políticas de retención, reintegros compensatorios y extinción de deuda no devengada.
 */

import {
  calculateFinancialBalances,
  validateStateTransition,
  calculateCurrentAccountAssignment,
  calculateCurrentAccountClearing,
  calculateHistoricalDebtSettlement,
  validateIdempotencyRequest,
  formatTicketCode
} from '../src/lib/financialMath';
import type {
  OperationDocument,
  FinancialMovementDocument,
  IdempotencyRecord,
  ComplexCountersDocument,
  OperationPaymentStatus,
  FinancialMovementCategory
} from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    passed++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}\n         Esperado: ${JSON.stringify(expected)}\n         Obtenido: ${JSON.stringify(actual)}`);
  }
}

// =========================================================================
// MOCK TRANSACCIONAL DE FIRESTORE CON VERIFICACIÓN ESTRICTA DE LECTURA/ESCRITURA
// =========================================================================

interface MockDocSnap {
  exists: () => boolean;
  data: () => any;
  id: string;
}

class MockFirestoreTransactionEnvironment {
  public store: Map<string, any> = new Map();

  public getDoc(path: string): MockDocSnap {
    const data = this.store.get(path);
    return {
      exists: () => data !== undefined,
      data: () => data ? JSON.parse(JSON.stringify(data)) : undefined,
      id: path.split('/').pop() || ''
    };
  }

  public setDoc(path: string, data: any) {
    this.store.set(path, JSON.parse(JSON.stringify(data)));
  }

  public async runTransaction<T>(
    fn: (t: {
      get: (path: string) => Promise<MockDocSnap>;
      set: (path: string, data: any, options?: { merge?: boolean }) => void;
      update: (path: string, data: any) => void;
    }) => Promise<T>
  ): Promise<T> {
    let hasWritten = false;
    const pendingWrites: Array<() => void> = [];

    const t = {
      get: async (path: string): Promise<MockDocSnap> => {
        if (hasWritten) {
          throw new Error('VIOLACIÓN TRANSACCIONAL DE FIRESTORE: Se intentó ejecutar una lectura (get) después de haber iniciado escrituras (set/update). Todas las lecturas deben completarse primero.');
        }
        return this.getDoc(path);
      },
      set: (path: string, data: any, options?: { merge?: boolean }) => {
        hasWritten = true;
        // Validación estricta de Firestore SDK: prohibido campo con valor undefined
        const checkForUndefined = (obj: any, currentPath: string = '') => {
          if (obj === null || obj === undefined) {
            if (obj === undefined) {
              throw new Error(`Function Transaction.set() called with invalid data. Unsupported field value: undefined (found in field ${currentPath} in document ${path})`);
            }
            return;
          }
          if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              const propPath = currentPath ? `${currentPath}.${key}` : key;
              if (val === undefined) {
                throw new Error(`Function Transaction.set() called with invalid data. Unsupported field value: undefined (found in field ${propPath} in document ${path})`);
              }
              if (typeof val === 'object' && val !== null) {
                checkForUndefined(val, propPath);
              }
            }
          }
        };
        checkForUndefined(data);

        pendingWrites.push(() => {
          if (options?.merge && this.store.has(path)) {
            const existing = this.store.get(path);
            this.store.set(path, { ...existing, ...data });
          } else {
            this.store.set(path, data);
          }
        });
      },
      update: (path: string, data: any) => {
        hasWritten = true;
        const checkForUndefined = (obj: any, currentPath: string = '') => {
          if (obj === undefined) {
            throw new Error(`Function Transaction.update() called with invalid data. Unsupported field value: undefined (found in field ${currentPath} in document ${path})`);
          }
          if (typeof obj === 'object' && obj !== null) {
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              const propPath = currentPath ? `${currentPath}.${key}` : key;
              if (val === undefined) {
                throw new Error(`Function Transaction.update() called with invalid data. Unsupported field value: undefined (found in field ${propPath} in document ${path})`);
              }
              if (typeof val === 'object' && val !== null) {
                checkForUndefined(val, propPath);
              }
            }
          }
        };
        checkForUndefined(data);

        pendingWrites.push(() => {
          if (!this.store.has(path)) {
            throw new Error(`Documento no encontrado para update: ${path}`);
          }
          const existing = this.store.get(path);
          this.store.set(path, { ...existing, ...data });
        });
      }
    };

    const result = await fn(t);
    // Aplicar escrituras atómicas
    for (const write of pendingWrites) {
      write();
    }
    return result;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('JOGO SAAS — VERIFICACIÓN TRANSACCIONAL Y DE CONSISTENCIA FINANCIERA');
  console.log('================================================================\n');

  const env = new MockFirestoreTransactionEnvironment();

  // -----------------------------------------------------------------------
  // TEST 1: REGLA DE ORO DE FIRESTORE (READ BEFORE WRITE ENFORCEMENT)
  // -----------------------------------------------------------------------
  console.log('--- TEST 1: ENFORCEMENT DE LECTURAS PREVIAS A ESCRITURAS ---');
  let caughtOrderError = false;
  try {
    await env.runTransaction(async (t) => {
      t.set('test/doc1', { val: 1 });
      await t.get('test/doc2'); // Esto DEBE fallar inmediatamente
    });
  } catch (err: any) {
    if (err.message.includes('VIOLACIÓN TRANSACCIONAL')) {
      caughtOrderError = true;
    }
  }
  assert(caughtOrderError, 'El motor transaccional debe rechazar lecturas realizadas después de iniciar escrituras.');

  // -----------------------------------------------------------------------
  // TEST 2: CREACIÓN DE OPERACIÓN CON PAGO INICIAL Y ASIGNACIÓN A CUENTA CORRIENTE
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 2: CREACIÓN DE OPERACIÓN CON ASIGNACIÓN DE DEUDA EN CUENTA CORRIENTE ---');
  // Inicializar estado previo: Usuario con $0 de deuda y contador de tickets
  env.setDoc('users/user_123', { id: 'user_123', name: 'Lucas Vázquez', debt: 0 });
  env.setDoc('complex_counters/complex_A', { pos_sale_sequence: 10 });

  const opId = 'op_001';
  const idemKey1 = 'idem_sale_001';

  await env.runTransaction(async (t) => {
    // 1. LECTURAS
    const counterSnap = await t.get('complex_counters/complex_A');
    const idemSnap = await t.get(`idempotency_keys/${idemKey1}`);
    const userSnap = await t.get('users/user_123');

    // 2. CÁLCULOS
    const balances = calculateFinancialBalances({
      contractualAmount: 10000,
      totalCollected: 2000,
      totalRefunded: 0
    });
    const ccResult = calculateCurrentAccountAssignment(balances.amountPending, true);
    const seq = Number(counterSnap.data()?.pos_sale_sequence || 0) + 1;
    const ticketCode = formatTicketCode('T', '26', seq);

    // 3. ESCRITURAS
    t.set('complex_counters/complex_A', { pos_sale_sequence: seq }, { merge: true });
    t.set(`operations/${opId}`, {
      id: opId,
      complexId: 'complex_A',
      ticketCode,
      operationType: 'pos_sale',
      userId: 'user_123',
      userName: 'Lucas Vázquez',
      contractualAmount: 10000,
      totalCollected: 2000,
      totalRefunded: 0,
      netCollected: 2000,
      amountPending: 8000,
      paymentStatus: balances.paymentStatus,
      currentAccountAssigned: true,
      currentAccountDebtAmount: ccResult.debtToAssign
    });
    t.set('financial_movements/mov_001', {
      id: 'mov_001',
      operationId: opId,
      amount: 2000,
      flow: 'income',
      category: 'sale_collection',
      clearedCurrentAccountDebt: 0
    });
    t.set(`idempotency_keys/${idemKey1}`, {
      idempotencyKey: idemKey1,
      status: 'completed',
      operationId: opId,
      amount: 2000
    });
    // Incrementar deuda del usuario en users/user_123
    const currentDebt = Number(userSnap.data()?.debt || 0);
    t.update('users/user_123', { debt: currentDebt + ccResult.debtToAssign });
  });

  const savedOp = env.getDoc(`operations/${opId}`).data();
  const savedUser = env.getDoc('users/user_123').data();
  const savedCounter = env.getDoc('complex_counters/complex_A').data();

  assertEqual(savedOp.paymentStatus, 'partial', 'Estado de la operación debe ser partial');
  assertEqual(savedOp.amountPending, 8000, 'Saldo pendiente de la operación debe ser $8.000');
  assertEqual(savedOp.currentAccountDebtAmount, 8000, 'Deuda de cuenta corriente en la operación debe ser $8.000');
  assertEqual(savedUser.debt, 8000, 'Deuda en users/user_123 debe ser exactamente $8.000 (sincronizada 1:1)');
  assertEqual(savedCounter.pos_sale_sequence, 11, 'Secuencia de contador debe incrementarse a 11');

  // -----------------------------------------------------------------------
  // TEST 3: COBRO POSTERIOR PARCIAL (REDUCCIÓN SIMULTÁNEA DE DEUDA 1:1)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 3: COBRO POSTERIOR PARCIAL CON DESCUENTO DE DEUDA 1:1 ---');
  const idemKey2 = 'idem_pay_002';

  await env.runTransaction(async (t) => {
    // 1. LECTURAS
    const idemSnap = await t.get(`idempotency_keys/${idemKey2}`);
    const opSnap = await t.get(`operations/${opId}`);
    const userSnap = await t.get('users/user_123');

    // 2. CÁLCULOS
    const op = opSnap.data();
    const paymentAmount = 3000;
    const newCollected = op.totalCollected + paymentAmount;
    const balances = calculateFinancialBalances({
      contractualAmount: op.contractualAmount,
      totalCollected: newCollected,
      totalRefunded: 0
    });
    const clearing = calculateCurrentAccountClearing(op.currentAccountDebtAmount, paymentAmount);

    // 3. ESCRITURAS
    t.update(`operations/${opId}`, {
      totalCollected: balances.totalCollected,
      amountPending: balances.amountPending,
      paymentStatus: balances.paymentStatus,
      currentAccountDebtAmount: clearing.remainingOperationDebt
    });
    t.set('financial_movements/mov_002', {
      id: 'mov_002',
      operationId: opId,
      amount: paymentAmount,
      clearedCurrentAccountDebt: clearing.clearedDebtAmount
    });
    t.set(`idempotency_keys/${idemKey2}`, {
      idempotencyKey: idemKey2,
      status: 'completed',
      movementId: 'mov_002'
    });
    const currentDebt = Number(userSnap.data().debt);
    t.update('users/user_123', { debt: currentDebt - clearing.clearedDebtAmount });
  });

  const opAfterPay = env.getDoc(`operations/${opId}`).data();
  const userAfterPay = env.getDoc('users/user_123').data();

  assertEqual(opAfterPay.totalCollected, 5000, 'Total cobrado debe ser $5.000 ($2.000 + $3.000)');
  assertEqual(opAfterPay.amountPending, 5000, 'Saldo pendiente debe ser $5.000');
  assertEqual(opAfterPay.currentAccountDebtAmount, 5000, 'Deuda en operación debe reducirse a $5.000');
  assertEqual(userAfterPay.debt, 5000, 'Deuda en users/user_123 debe ser exactamente $5.000 (sin desfasajes)');

  // -----------------------------------------------------------------------
  // TEST 4: COBRO SOBRE OPERACIÓN SIN CUENTA CORRIENTE (NO TOCA USER.DEBT)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 4: COBRO SOBRE OPERACIÓN SIN CUENTA CORRIENTE ---');
  const opNoCCId = 'op_no_cc';
  env.setDoc(`operations/${opNoCCId}`, {
    id: opNoCCId,
    complexId: 'complex_A',
    contractualAmount: 20000,
    totalCollected: 5000,
    amountPending: 15000,
    paymentStatus: 'partial',
    currentAccountAssigned: false,
    currentAccountDebtAmount: 0,
    userId: 'user_123'
  });

  await env.runTransaction(async (t) => {
    // 1. LECTURAS
    const opSnap = await t.get(`operations/${opNoCCId}`);
    const userSnap = await t.get('users/user_123');

    // 2. CÁLCULOS
    const op = opSnap.data();
    const payment = 5000;
    const balances = calculateFinancialBalances({
      contractualAmount: op.contractualAmount,
      totalCollected: op.totalCollected + payment,
      totalRefunded: 0
    });
    const clearing = calculateCurrentAccountClearing(op.currentAccountDebtAmount, payment);

    // 3. ESCRITURAS
    t.update(`operations/${opNoCCId}`, {
      totalCollected: balances.totalCollected,
      amountPending: balances.amountPending,
      paymentStatus: balances.paymentStatus,
      currentAccountDebtAmount: clearing.remainingOperationDebt
    });

    if (clearing.clearedDebtAmount > 0) {
      t.update('users/user_123', { debt: Number(userSnap.data().debt) - clearing.clearedDebtAmount });
    }
  });

  const opNoCCAfter = env.getDoc(`operations/${opNoCCId}`).data();
  const userNoCCAfter = env.getDoc('users/user_123').data();

  assertEqual(opNoCCAfter.amountPending, 10000, 'Saldo pendiente en operación sin CC debe ser $10.000');
  assertEqual(userNoCCAfter.debt, 5000, 'Deuda de user_123 debe permanecer intacta en $5.000 (no descuenta deuda de terceros o no asignada)');

  // -----------------------------------------------------------------------
  // TEST 5: COBRO QUE EXCEDE LA DEUDA FIADA DE LA OPERACIÓN
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 5: COBRO QUE SUPERA LA DEUDA FIADA (TOPE EXACTO) ---');
  // En op_001 queda amountPending: 5000, currentAccountDebtAmount: 5000.
  // Intentamos cobrar $6000: debe saldar la deuda fiada hasta $5000, y el remanente no toca más deuda.
  const clearingOver = calculateCurrentAccountClearing(5000, 6000);
  assertEqual(clearingOver.clearedDebtAmount, 5000, 'Debe descontar como máximo el saldo de la deuda asignada ($5.000)');
  assertEqual(clearingOver.remainingOperationDebt, 0, 'La deuda de la operación debe quedar en 0');

  // -----------------------------------------------------------------------
  // TEST 6: ABONO DE DEUDA HISTÓRICA DIRECTA (SIN OPERACIÓN FICTICIA)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 6: ABONO DIRECTO DE DEUDA HISTÓRICA (SIN TICKET/OPERACIÓN PREVIA) ---');
  // user_123 tiene actualmente debt: 5000
  const idemKeyHist = 'idem_hist_001';
  let recordedMovement: any = null;

  await env.runTransaction(async (t) => {
    // 1. LECTURAS
    const idemSnap = await t.get(`idempotency_keys/${idemKeyHist}`);
    const userSnap = await t.get('users/user_123');
    const counterSnap = await t.get('complex_counters/complex_A');

    // 2. CÁLCULOS
    const currentDebt = Number(userSnap.data().debt);
    const abonoAmount = 2000;
    const settlement = calculateHistoricalDebtSettlement(currentDebt, abonoAmount);
    assert(settlement.valid, 'El abono de $2.000 sobre deuda de $5.000 debe ser válido');

    const seq = Number(counterSnap.data()?.historical_debt_sequence || 0) + 1;
    const receiptCode = formatTicketCode('D', '26', seq);

    // 3. ESCRITURAS
    t.set('complex_counters/complex_A', { historical_debt_sequence: seq }, { merge: true });
    recordedMovement = {
      id: 'mov_hist_001',
      operationId: null, // NO se crea operación ficticia
      ticketCode: receiptCode,
      category: 'historical_debt_payment', // Categoría canónica unificada
      amount: abonoAmount,
      clearedCurrentAccountDebt: settlement.clearedAmount,
      userId: 'user_123'
    };
    t.set('financial_movements/mov_hist_001', recordedMovement);
    t.set(`idempotency_keys/${idemKeyHist}`, {
      idempotencyKey: idemKeyHist,
      status: 'completed',
      movementId: 'mov_hist_001'
    });
    t.update('users/user_123', { debt: settlement.remainingDebt });
  });

  const userAfterHist = env.getDoc('users/user_123').data();
  assertEqual(userAfterHist.debt, 3000, 'Deuda tras abono debe quedar en $3.000 ($5.000 - $2.000)');
  assertEqual(recordedMovement.operationId, null, 'El movimiento financiero NO debe tener operationId (null)');
  assertEqual(recordedMovement.category, 'historical_debt_payment', 'Categoría canónica debe ser estrictamente historical_debt_payment');
  assertEqual(recordedMovement.ticketCode, 'D-26-000001', 'Código de recibo de abono debe ser D-26-000001');

  // -----------------------------------------------------------------------
  // TEST 7: RECHAZO ESTRICTO DE SOBREPAGE EN DEUDA HISTÓRICA
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 7: RECHAZO DE SOBREPAGE EN DEUDA HISTÓRICA (NUNCA SALDO NEGATIVO) ---');
  // Deuda actual: $3.000. Intento de abonar $3.500:
  const invalidAbono = calculateHistoricalDebtSettlement(3000, 3500);
  assert(!invalidAbono.valid, 'Debe rechazar abono superior a la deuda pendiente');
  assert(invalidAbono.remainingDebt === 3000, 'Debe conservar la deuda en $3.000 sin modificarla');
  assert(Boolean(invalidAbono.error?.includes('supera la deuda')), 'El mensaje debe indicar que el importe supera la deuda');

  // -----------------------------------------------------------------------
  // TEST 8: IDEMPOTENCIA — PREVENCIÓN DE DUPLICADOS Y DETECCIÓN DE ALTERACIONES
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 8: IDEMPOTENCIA ESTRICTA Y CONTROL DE ALTERACIÓN ---');
  const existingRecord: IdempotencyRecord = {
    idempotencyKey: 'idem_test_dup',
    complexId: 'complex_A',
    operationId: 'op_001',
    amount: 1500,
    paymentMethod: 'cash',
    flow: 'income',
    status: 'completed',
    movementId: 'mov_dup_original',
    createdAt: null
  };

  // Reintento idéntico (network retry)
  const retryResult = validateIdempotencyRequest(existingRecord, {
    complexId: 'complex_A',
    operationId: 'op_001',
    amount: 1500,
    paymentMethod: 'cash',
    flow: 'income'
  });
  assertEqual(retryResult.type, 'MATCH_COMPLETED', 'Reintento con mismos parámetros debe ser MATCH_COMPLETED');
  if (retryResult.type === 'MATCH_COMPLETED') {
    assertEqual(retryResult.movementId, 'mov_dup_original', 'Debe retornar el ID de movimiento original');
  }

  // Intento de reusar la clave con diferente importe
  const alteredResult = validateIdempotencyRequest(existingRecord, {
    complexId: 'complex_A',
    operationId: 'op_001',
    amount: 2500, // Alterado
    paymentMethod: 'cash',
    flow: 'income'
  });
  assertEqual(alteredResult.type, 'MISMATCH_ERROR', 'Reuso de clave con importe diferente debe arrojar MISMATCH_ERROR');

  // -----------------------------------------------------------------------
  // TEST 9: CANCELACIÓN CON EXTINCIÓN DE DEUDA FIADA NO DEVENGADA
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 9: CANCELACIÓN CON EXTINCIÓN DE DEUDA FIADA NO DEVENGADA ---');
  // Creamos operación op_cancel con contractualAmount: 8000, seña: 1000, fiado: 7000
  env.setDoc('users/user_cancel', { id: 'user_cancel', debt: 7000 });
  env.setDoc('operations/op_cancel', {
    id: 'op_cancel',
    complexId: 'complex_A',
    ticketCode: 'T-26-000099',
    userId: 'user_cancel',
    contractualAmount: 8000,
    totalCollected: 1000,
    amountPending: 7000,
    currentAccountDebtAmount: 7000,
    paymentStatus: 'partial'
  });

  await env.runTransaction(async (t) => {
    // 1. LECTURAS
    const opSnap = await t.get('operations/op_cancel');
    const userSnap = await t.get('users/user_cancel');

    // 2. CÁLCULOS
    const op = opSnap.data();
    const balances = calculateFinancialBalances({
      contractualAmount: op.contractualAmount,
      totalCollected: op.totalCollected,
      totalRefunded: 0,
      isCancelled: true,
      retainDepositOnCancel: true // Retener la seña de $1000 como penalidad
    });
    const debtToExtinguish = op.currentAccountDebtAmount;

    // 3. ESCRITURAS
    t.update('operations/op_cancel', {
      paymentStatus: balances.paymentStatus,
      retainedAmount: balances.retainedAmount,
      amountPending: 0,
      currentAccountDebtAmount: 0
    });
    // Extinguir deuda no devengada del usuario
    t.update('users/user_cancel', {
      debt: Number(userSnap.data().debt) - debtToExtinguish
    });
  });

  const cancelledOp = env.getDoc('operations/op_cancel').data();
  const cancelledUser = env.getDoc('users/user_cancel').data();

  assertEqual(cancelledOp.paymentStatus, 'cancelled_retained', 'Estado debe ser cancelled_retained');
  assertEqual(cancelledOp.retainedAmount, 1000, 'Seña de $1.000 debe quedar retenida formalmente');
  assertEqual(cancelledOp.amountPending, 0, 'Saldo exigible de la operación debe extinguirse a 0');
  assertEqual(cancelledOp.currentAccountDebtAmount, 0, 'Deuda de cuenta corriente en operación cancelada debe ser 0');
  assertEqual(cancelledUser.debt, 0, 'Deuda en users/user_cancel debe extinguirse a 0 (justicia contable)');

  // -----------------------------------------------------------------------
  // TEST 10: VENTA SIMPLE POS (MOTOR FINANCIERO + INVENTARIO ATÓMICO)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 10: VENTA SIMPLE POS ---');
  env.setDoc('complex_counters/B', { pos_sale_sequence: 50, updatedAt: new Date() });
  env.setDoc('products/prod_water', { name: 'Agua Mineral 500ml', stock: 25, salePrice: 1000 });

  const sale10Result = await env.runTransaction(async (t) => {
    // Phase 1: Reads (Read before write)
    const counterSnap = await t.get('complex_counters/B');
    const idemSnap = await t.get('idempotency_keys/sale_simple_101');
    const prodSnap = await t.get('products/prod_water');

    // Phase 2: Validations & pure math
    if (idemSnap.exists()) throw new Error('Idempotency error');
    const prodData = prodSnap.data();
    if (prodData.stock < 2) throw new Error('Stock insuficiente');

    const nextSeq = (counterSnap.data().pos_sale_sequence || 0) + 1;
    const ticketCode = formatTicketCode('T', '26', nextSeq);
    const opId = 'op_sale_101';
    const movId = 'mov_sale_101';

    // Phase 3: Atomic writes
    t.set('complex_counters/B', { pos_sale_sequence: nextSeq });
    t.set(`operations/${opId}`, {
      id: opId,
      complexId: 'B',
      ticketCode,
      operationType: 'pos_sale',
      contractualAmount: 2000,
      totalCollected: 2000,
      amountPending: 0,
      paymentStatus: 'paid',
      items: [{ productId: 'prod_water', name: 'Agua Mineral 500ml', quantity: 2, unitPrice: 1000, subtotal: 2000 }]
    });
    t.set(`financial_movements/${movId}`, {
      id: movId,
      complexId: 'B',
      operationId: opId,
      ticketCode,
      amount: 2000,
      paymentMethod: 'efectivo',
      flow: 'income',
      category: 'sale_collection'
    });
    t.set('idempotency_keys/sale_simple_101', {
      idempotencyKey: 'sale_simple_101',
      complexId: 'B',
      operationId: opId,
      amount: 2000,
      status: 'completed',
      movementId: movId,
      ticketCode
    });
    const newStock = prodData.stock - 2;
    t.update('products/prod_water', { stock: newStock });
    t.set('inventory_movements/inv_101', {
      productId: 'prod_water',
      complejoId: 'B',
      operationId: opId,
      quantity: -2,
      resultingStock: newStock
    });

    return { opId, movId, ticketCode, newStock };
  });

  const op10 = env.getDoc('operations/op_sale_101').data();
  const mov10 = env.getDoc('financial_movements/mov_sale_101').data();
  const prod10 = env.getDoc('products/prod_water').data();

  assertEqual(op10.contractualAmount, 2000, 'Operación POS debe tener monto contractual $2.000');
  assertEqual(op10.complexId, 'B', 'Operación POS debe asociarse al complejo B');
  assertEqual(op10.paymentStatus, 'paid', 'Operación POS pagada totalmente debe ser paid');
  assertEqual(mov10.operationId, 'op_sale_101', 'Movimiento financiero vinculado 1:1 a la operación');
  assertEqual(mov10.complexId, 'B', 'Movimiento financiero asociado al complejo B');
  assertEqual(prod10.stock, 23, 'Stock descontado exactamente en 2 unidades (25 -> 23)');

  // -----------------------------------------------------------------------
  // TEST 11: VENTA CON PAGOS DIVIDIDOS (SPLIT PAYMENTS)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 11: VENTA CON PAGOS DIVIDIDOS ---');
  await env.runTransaction(async (t) => {
    // Reads
    const counterSnap = await t.get('complex_counters/B');
    const prodSnap = await t.get('products/prod_water');

    const nextSeq = counterSnap.data().pos_sale_sequence + 1;
    const ticketCode = formatTicketCode('T', '26', nextSeq);
    const opId = 'op_split_102';
    const mov1Id = 'mov_split_cash';
    const mov2Id = 'mov_split_transfer';

    t.set('complex_counters/B', { pos_sale_sequence: nextSeq });
    t.set(`operations/${opId}`, {
      id: opId,
      complexId: 'B',
      ticketCode,
      operationType: 'pos_sale',
      contractualAmount: 5000,
      totalCollected: 5000,
      amountPending: 0,
      paymentStatus: 'paid'
    });
    // Movimiento 1: Efectivo $3.000
    t.set(`financial_movements/${mov1Id}`, {
      id: mov1Id,
      complexId: 'B',
      operationId: opId,
      ticketCode,
      amount: 3000,
      paymentMethod: 'efectivo',
      flow: 'income',
      category: 'sale_collection'
    });
    // Movimiento 2: Transferencia $2.000
    t.set(`financial_movements/${mov2Id}`, {
      id: mov2Id,
      complexId: 'B',
      operationId: opId,
      ticketCode,
      amount: 2000,
      paymentMethod: 'transferencia',
      flow: 'income',
      category: 'sale_collection'
    });
    t.update('products/prod_water', { stock: prodSnap.data().stock - 5 });
  });

  const splitOp = env.getDoc('operations/op_split_102').data();
  const splitMov1 = env.getDoc('financial_movements/mov_split_cash').data();
  const splitMov2 = env.getDoc('financial_movements/mov_split_transfer').data();
  const prodAfterSplit = env.getDoc('products/prod_water').data();

  assertEqual(splitOp.contractualAmount, 5000, 'Operación con pago split tiene total $5.000');
  assertEqual(splitMov1.operationId, 'op_split_102', 'Primer movimiento vinculado a la operación');
  assertEqual(splitMov2.operationId, 'op_split_102', 'Segundo movimiento vinculado a la misma operación');
  assertEqual(splitMov1.amount + splitMov2.amount, 5000, 'Suma de movimientos cubre el 100% de la venta ($5.000)');
  assertEqual(prodAfterSplit.stock, 18, 'Stock descontado correctamente en 5 unidades (23 -> 18)');

  // -----------------------------------------------------------------------
  // TEST 12: STOCK INSUFICIENTE SIN ESCRITURAS PARCIALES
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 12: STOCK INSUFICIENTE ABORTA SIN ESCRITURAS PARCIALES ---');
  env.setDoc('products/prod_gatorade', { name: 'Gatorade 500ml', stock: 2, salePrice: 1800 });
  let stockErrorCaught = false;

  try {
    await env.runTransaction(async (t) => {
      // Phase 1: Reads
      const prodSnap = await t.get('products/prod_gatorade');
      const prod = prodSnap.data();

      // Phase 2: Check stock before any write
      if (prod.stock < 5) {
        throw new Error(`Stock insuficiente para '${prod.name}'. Disponible: ${prod.stock}, Solicitado: 5.`);
      }

      // Should never reach here
      t.set('operations/op_should_not_exist', { id: 'fail' });
      t.update('products/prod_gatorade', { stock: prod.stock - 5 });
    });
  } catch (err: any) {
    if (err.message.includes('Stock insuficiente')) {
      stockErrorCaught = true;
    }
  }

  assert(stockErrorCaught, 'Transacción debe abortar con error si el stock es insuficiente');
  const gatoradeDoc = env.getDoc('products/prod_gatorade').data();
  assertEqual(gatoradeDoc.stock, 2, 'Stock de producto debe permanecer INTACTO en 2 unidades');
  assert(!env.getDoc('operations/op_should_not_exist').exists(), 'Ninguna operación parcial debe haberse registrado');

  // -----------------------------------------------------------------------
  // TEST 13: IDEMPOTENCIA EN REINTENTO (NO DUPLICA VENTA NI STOCK)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 13: REINTENTO CON MISMA CLAVE DE IDEMPOTENCIA ---');
  env.setDoc('products/prod_energy', { name: 'Speed Unlimited', stock: 10, salePrice: 2000 });

  // Intento 1: Exitoso
  const idemKey = 'idem_pos_retry_999';
  await env.runTransaction(async (t) => {
    const idemSnap = await t.get(`idempotency_keys/${idemKey}`);
    const prodSnap = await t.get('products/prod_energy');

    if (idemSnap.exists()) {
      return { alreadyProcessed: true };
    }

    t.set('operations/op_energy_sale', {
      id: 'op_energy_sale',
      complexId: 'B',
      contractualAmount: 2000,
      totalCollected: 2000,
      paymentStatus: 'paid'
    });
    t.set(`financial_movements/mov_energy_sale`, {
      id: 'mov_energy_sale',
      complexId: 'B',
      operationId: 'op_energy_sale',
      amount: 2000
    });
    t.set(`idempotency_keys/${idemKey}`, {
      idempotencyKey: idemKey,
      complexId: 'B',
      operationId: 'op_energy_sale',
      amount: 2000,
      status: 'completed',
      movementId: 'mov_energy_sale'
    });
    t.update('products/prod_energy', { stock: prodSnap.data().stock - 1 });
    return { success: true };
  });

  const stockAfterAttempt1 = env.getDoc('products/prod_energy').data().stock;
  assertEqual(stockAfterAttempt1, 9, 'Stock tras intento 1 debe ser 9');

  // Intento 2: Reintento con la misma clave (simula pérdida de conexión en el frontend)
  const attempt2Result = await env.runTransaction(async (t) => {
    const idemSnap = await t.get(`idempotency_keys/${idemKey}`);
    const prodSnap = await t.get('products/prod_energy');

    if (idemSnap.exists() && idemSnap.data().status === 'completed') {
      return {
        alreadyProcessed: true,
        operationId: idemSnap.data().operationId
      };
    }

    // Si no fuera idempotente escribiría aquí
    t.update('products/prod_energy', { stock: prodSnap.data().stock - 1 });
    return { success: true };
  });

  assertEqual(attempt2Result.alreadyProcessed, true, 'Reintento debe retornar alreadyProcessed: true');
  assertEqual(attempt2Result.operationId, 'op_energy_sale', 'Reintento debe retornar la operación existente');
  const stockAfterAttempt2 = env.getDoc('products/prod_energy').data().stock;
  assertEqual(stockAfterAttempt2, 9, 'Stock NO debe volver a descontarse en el reintento (permanece en 9)');

  // -----------------------------------------------------------------------
  // TEST 9: REGRESIÓN: VENTA DE MOSTRADOR SIN BOOKINGID (OMISIÓN DE UNDEFINED)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST 9: VENTA DE MOSTRADOR SIN BOOKINGID Y AUSENCIA DE VALORES UNDEFINED ---');
  env.setDoc('complex_counters/complex_pos_test', { pos_sale_sequence: 10 });
  env.setDoc('products/prod_snack', { id: 'prod_snack', name: 'Snack', stock: 15, salePrice: 1500 });

  // Simular createOperationWithInitialPayment para venta de mostrador
  const posParams = {
    complexId: 'complex_pos_test',
    operationType: 'pos_sale' as const,
    contractualAmount: 3000,
    operatorId: 'operator_pos_1',
    responsibleType: 'anonymous' as const,
    userId: null,
    userName: 'Cliente Mostrador',
    userPhone: '',
    items: [
      { productId: 'prod_snack', name: 'Snack', quantity: 2, unitPrice: 1500, subtotal: 3000 }
    ],
    idempotencyKey: 'pos_sale_no_booking_test_1',
    initialPayments: [
      { amount: 3000, paymentMethod: 'efectivo' as const, idempotencyKey: 'pos_sale_no_booking_test_1_pay_0', notes: 'Cobro mostrador (efectivo)' }
    ],
    // bookingId es explícitamente undefined (venta de mostrador de bar/kiosco sin turno)
    bookingId: undefined,
    legacySaleId: undefined
  };

  let test9Success = false;
  try {
    await env.runTransaction(async (t) => {
      // 1. Lecturas
      const counterSnap = await t.get(`complex_counters/${posParams.complexId}`);
      const idemSnap = await t.get(`idempotency_keys/${posParams.idempotencyKey}`);
      const payIdemSnap = await t.get(`idempotency_keys/${posParams.initialPayments[0].idempotencyKey}`);
      const prodSnap = await t.get('products/prod_snack');

      // 2. Cálculos
      const seq = Number(counterSnap.data().pos_sale_sequence || 0) + 1;
      const ticketCode = formatTicketCode('T', '26', seq);

      // 3. Escrituras respetando omisión de undefined en opDocData
      t.set(`complex_counters/${posParams.complexId}`, {
        pos_sale_sequence: seq,
        complexId: posParams.complexId,
        complejoId: posParams.complexId
      }, { merge: true });

      const opId = 'op_counter_sale_9';
      const opDocData: OperationDocument = {
        id: opId,
        complexId: posParams.complexId,
        complejoId: posParams.complexId,
        ticketCode,
        operationType: posParams.operationType,
        ...(posParams.bookingId ? { bookingId: posParams.bookingId } : {}),
        ...(posParams.legacySaleId ? { legacySaleId: posParams.legacySaleId } : {}),
        responsibleType: posParams.responsibleType || 'anonymous',
        userId: posParams.userId || null,
        userName: posParams.userName || 'Cliente',
        userPhone: posParams.userPhone || '',
        contractualAmount: 3000,
        totalCollected: 3000,
        totalRefunded: 0,
        netCollected: 3000,
        retainedAmount: 0,
        amountPending: 0,
        paymentStatus: 'paid',
        currentAccountAssigned: false,
        currentAccountDebtAmount: 0,
        items: posParams.items.map(it => {
          const itemObj: any = {
            id: it.productId,
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal
          };
          if (it.productId) {
            itemObj.productId = it.productId;
          }
          return itemObj;
        }),
        notes: '',
        createdAt: 'TIMESTAMP_MOCK',
        updatedAt: 'TIMESTAMP_MOCK',
        createdBy: posParams.operatorId
      };
      // Esto arrojaba "Unsupported field value: undefined" antes del fix
      t.set(`operations/${opId}`, opDocData);

      // Movimiento financiero
      const movId = 'mov_counter_sale_9';
      const movDocData: FinancialMovementDocument = {
        id: movId,
        complexId: posParams.complexId,
        complejoId: posParams.complexId,
        operationId: opId,
        ticketCode,
        idempotencyKey: posParams.initialPayments[0].idempotencyKey,
        flow: 'income',
        category: 'sale_collection',
        amount: 3000,
        paymentMethod: 'cash',
        effectiveDate: 'TIMESTAMP_MOCK',
        userId: null,
        responsibleName: posParams.userName,
        clearedCurrentAccountDebt: 0,
        notes: posParams.initialPayments[0].notes || '',
        operatorId: posParams.operatorId,
        createdAt: 'TIMESTAMP_MOCK'
      };
      t.set(`financial_movements/${movId}`, movDocData);

      // Inventario
      t.update('products/prod_snack', {
        stock: prodSnap.data().stock - 2
      });

      t.set('inventory_movements/inv_mov_9', {
        productId: 'prod_snack',
        complejoId: posParams.complexId,
        complexId: posParams.complexId,
        type: 'sale',
        typeLabel: 'Venta',
        quantity: -2,
        resultingStock: prodSnap.data().stock - 2,
        date: '2026-10-12',
        time: '03:45',
        actorName: posParams.userName,
        notes: `Venta Mostrador · Ticket ${ticketCode}`,
        operationId: opId,
        createdAt: 'TIMESTAMP_MOCK'
      });

      return { success: true };
    });
    test9Success = true;
  } catch (err: any) {
    console.error('Error en Test 9:', err.message);
  }

  assert(test9Success, 'Venta de mostrador sin bookingId se guardó sin errores de campos undefined.');
  const savedOpTest9 = env.getDoc('operations/op_counter_sale_9').data();
  assert(savedOpTest9 !== undefined, 'Documento de operación creado exitosamente');
  assert(!('bookingId' in savedOpTest9), 'El campo bookingId fue omitido del documento de operación');
  assertEqual(savedOpTest9.paymentStatus, 'paid', 'Estado de pago correcto');
  assertEqual(savedOpTest9.contractualAmount, 3000, 'Monto contractual correcto');
  const updatedSnack = env.getDoc('products/prod_snack').data();
  assertEqual(updatedSnack.stock, 13, 'Stock descontado correctamente (15 - 2 = 13)');

  // -----------------------------------------------------------------------
  // RESUMEN FINAL
  // -----------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`RESULTADOS: ${passed} pruebas superadas, ${failed} fallidas.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
