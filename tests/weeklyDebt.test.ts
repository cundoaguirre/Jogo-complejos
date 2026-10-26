import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateWeeklyObligations,
  evaluateBillingNoticeState,
  calculateTotalWeeklyDebt,
  calculateOverdueWeeklyDebt,
  isPeriodClosed,
  type WeeklyPaymentObligation
} from '../src/lib/weeklyBilling';
import type { Match } from '../src/types';

describe('SaaS Weekly Debt and Access Lockout Logic', () => {
  const complexId = 'complex_test_1';
  const complexDocBase = {
    id: complexId,
    name: 'Complejo Central',
    clientStatus: 'active',
    activatedAt: '2026-09-01T12:00:00Z'
  };

  // Helper date in Argentina (UTC-3). 
  // 2026-10-22 is a Thursday in 2026.
  // Oct 19 (Mon) to Oct 25 (Sun) is the current week.
  // Closed weeks before Oct 19:
  // Week 1: 2026-09-28 to 2026-10-04 (due Mon 2026-10-05) -> daysAfterDue = 17 (overdue)
  // Week 2: 2026-10-05 to 2026-10-11 (due Mon 2026-10-12) -> daysAfterDue = 10 (overdue)
  // Week 3: 2026-10-12 to 2026-10-18 (due Mon 2026-10-19) -> daysAfterDue = 3 on Thursday 2026-10-22 (overdue!)
  // Current Week: 2026-10-19 to 2026-10-25 -> ends Sun Oct 25 23:59:59 -> NOT closed on Thursday 2026-10-22
  const nowThursday = new Date('2026-10-22T14:00:00-03:00'); // Thursday 14:00 ART
  const nowWednesday = new Date('2026-10-21T20:00:00-03:00'); // Wednesday 20:00 ART

  it('1. Una semana impaga: calcula deuda y bloquea si es jueves o posterior (daysAfterDue >= 3)', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-12_2026-10-18`,
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const targetObl = obligations.find(o => o.startDateStr === '2026-10-12');
    assert.ok(targetObl, 'Debe existir la obligación para la semana');
    assert.strictEqual(targetObl.remainingBalance, 15000);
    assert.strictEqual(targetObl.status, 'pending');

    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 15000, 'La deuda total debe ser exactamente el saldo de la única semana');

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true, 'El acceso debe estar bloqueado el jueves con daysAfterDue >= 3');
    assert.strictEqual(noticeState.totalDebt, 15000);
    assert.strictEqual(noticeState.overdueObligations.length, 1);
  });

  it('2. Tres semanas impagas: muestra la suma de las tres (deuda total acumulada)', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          startDateStr: '2026-09-28',
          endDateStr: '2026-10-04',
          dueDateStr: '2026-10-05',
          originalAmountDue: 10000,
          amountPaid: 0,
          remainingBalance: 10000
        },
        {
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000
        },
        {
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 12000,
          amountPaid: 0,
          remainingBalance: 12000
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 37000, 'La deuda total debe sumar las tres semanas: 10000 + 15000 + 12000 = 37000');

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true);
    assert.strictEqual(noticeState.totalDebt, 37000);
    assert.strictEqual(noticeState.totalOverdueDebt, 37000);
    assert.strictEqual(noticeState.overdueObligations.length, 3, 'Debe haber 3 obligaciones vencidas');
    assert.strictEqual(noticeState.unpaidObligations.length, 3, 'Debe haber 3 obligaciones impagas');
  });

  it('3. Pago completo de la semana más antigua: seguir bloqueado si quedan otras semanas vencidas', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          // Semana 1 (más antigua) pagada totalmente
          startDateStr: '2026-09-28',
          endDateStr: '2026-10-04',
          dueDateStr: '2026-10-05',
          originalAmountDue: 10000,
          amountPaid: 10000,
          remainingBalance: 0,
          status: 'paid'
        },
        {
          // Semana 2 pendiente
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        },
        {
          // Semana 3 pendiente
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 12000,
          amountPaid: 0,
          remainingBalance: 12000,
          status: 'pending'
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 27000, 'La deuda total debe ser 27000 (15000 + 12000)');

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true, 'El acceso debe continuar bloqueado porque quedan semanas vencidas impagas');
    assert.strictEqual(noticeState.overdueObligations.length, 2, 'Quedan 2 semanas vencidas');
  });

  it('4. Pago parcial: descontar únicamente lo pagado sin marcar como paid si conserva saldo pendiente', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 20000,
          amountPaid: 8000, // Pago parcial de 8000
          remainingBalance: 12000,
          status: 'partial'
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const obl = obligations.find(o => o.startDateStr === '2026-10-12');
    assert.ok(obl);
    assert.strictEqual(obl.originalAmountDue, 20000);
    assert.strictEqual(obl.amountPaid, 8000);
    assert.strictEqual(obl.remainingBalance, 12000, 'El saldo pendiente debe ser 20000 - 8000 = 12000');
    assert.strictEqual(obl.status, 'partial', 'El estado debe ser partial, nunca paid mientras conserve saldo');

    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 12000, 'La deuda total debe reflejar únicamente el saldo pendiente');

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true, 'Sigue bloqueado por el saldo pendiente vencido');
  });

  it('5. Pago de todas las obligaciones vencidas: restaurar el acceso cuando corresponda', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          startDateStr: '2026-09-28',
          endDateStr: '2026-10-04',
          dueDateStr: '2026-10-05',
          originalAmountDue: 10000,
          amountPaid: 10000,
          remainingBalance: 0,
          status: 'paid'
        },
        {
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 15000,
          remainingBalance: 0,
          status: 'paid'
        },
        {
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 12000,
          amountPaid: 12000,
          remainingBalance: 0,
          status: 'paid'
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 0, 'La deuda total debe ser 0');

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, false, 'El acceso debe estar restaurado (desbloqueado)');
    assert.strictEqual(noticeState.overdueObligations.length, 0);
  });

  it('6. Sin deuda pendiente: mostrar saldo cero y no bloquear por deuda', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: []
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 0);

    const noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, false, 'No debe bloquear si no hay deuda');
    assert.strictEqual(noticeState.totalDebt, 0);
  });

  it('7. No debe sumar lo correspondiente a la semana actual (en curso)', () => {
    // Hoy es jueves 2026-10-22.
    // La semana en curso corre de lunes 2026-10-19 a domingo 2026-10-25.
    // No ha terminado aún el domingo 2026-10-25 a las 23:59:59 ART.
    const currentWeekBooking: Match = {
      id: 'booking_current_week',
      complexId,
      date: '2026-10-21', // Ayer miércoles
      startTime: '19:00',
      endTime: '20:00',
      price: 50000, // Comisión estimada: 5000
      status: 'jugado'
    } as unknown as Match;

    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          // Si por error alguien puso en paymentObligations la semana en curso:
          startDateStr: '2026-10-19',
          endDateStr: '2026-10-25',
          originalAmountDue: 5000,
          amountPaid: 0,
          remainingBalance: 5000,
          status: 'pending'
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [currentWeekBooking], nowThursday);
    // Ninguna obligación debe corresponder a la semana en curso (2026-10-19 al 2026-10-25)
    const currentWeekObl = obligations.find(o => o.startDateStr === '2026-10-19' || o.endDateStr === '2026-10-25');
    assert.strictEqual(currentWeekObl, undefined, 'La semana actual en curso no debe ser generada ni sumada a las obligaciones');

    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 0, 'La deuda de la semana en curso no debe sumarse');
  });

  it('8. Sin duplicaciones: no sumar dos veces el mismo período si aparece en paymentObligations y paymentPeriods', () => {
    const complexDoc = {
      ...complexDocBase,
      // Misma semana representada en paymentObligations (array) y paymentPeriods (array/objeto)
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-12_2026-10-18`,
          startDate: '2026-10-12',
          endDate: '2026-10-18',
          originalAmountDue: 15000,
          amountPaid: 5000,
          remainingBalance: 10000,
          status: 'partial'
        }
      ],
      paymentPeriods: [
        {
          periodId: '2026-10-12_2026-10-18',
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          amountDue: 15000,
          totalPaid: 5000,
          remainingBalance: 10000
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    // Verificar que solo se generó 1 obligación para 2026-10-12 al 2026-10-18
    const matching = obligations.filter(o => o.startDateStr === '2026-10-12' && o.endDateStr === '2026-10-18');
    assert.strictEqual(matching.length, 1, 'No debe duplicar la obligación para el mismo período');
    assert.strictEqual(matching[0].remainingBalance, 10000);
    assert.strictEqual(matching[0].amountPaid, 5000);

    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 10000, 'La deuda no debe duplicarse: debe ser exactamente 10000, no 20000');
  });

  it('9. Calendario: bloqueo a partir del jueves a las 00:00 hora de Argentina (miércoles no bloquea)', () => {
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          // Período cerrado el domingo 18/10, vencimiento lunes 19/10
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        }
      ]
    };

    // Miércoles 21/10 a las 20:00 ART (daysAfterDue = 2)
    const obligationsWed = calculateWeeklyObligations(complexId, complexDoc, [], nowWednesday);
    const noticeWed = evaluateBillingNoticeState(complexId, complexDoc, obligationsWed, nowWednesday);
    assert.strictEqual(noticeWed.isBlockedByDebt, false, 'El miércoles antes de las 00:00 del jueves no debe estar bloqueado');
    assert.strictEqual(noticeWed.type, 'wednesday', 'Debe emitir el aviso de miércoles (último aviso antes del corte)');

    // Jueves 22/10 a las 00:01 ART (daysAfterDue = 3)
    const nowThursdayEarly = new Date('2026-10-22T00:01:00-03:00');
    const obligationsThu = calculateWeeklyObligations(complexId, complexDoc, [], nowThursdayEarly);
    const noticeThu = evaluateBillingNoticeState(complexId, complexDoc, obligationsThu, nowThursdayEarly);
    assert.strictEqual(noticeThu.isBlockedByDebt, true, 'A partir del jueves a las 00:00 el acceso debe estar bloqueado');
  });

  it('10. REGRESIÓN CRÍTICA: Dos pagos sucesivos desde ERP (deuda reciente -> deuda antigua -> desbloqueo)', () => {
    // 1. Estado inicial: Una cuenta tiene dos obligaciones semanales pendientes
    let complexDoc: any = {
      ...complexDocBase,
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-05_2026-10-11`,
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        },
        {
          id: `obl_${complexId}_2026-10-12_2026-10-18`,
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 20000,
          amountPaid: 0,
          remainingBalance: 20000,
          status: 'pending'
        }
      ]
    };

    let obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    let totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 35000, 'Deuda inicial debe ser 35000 (15000 + 20000)');
    let noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true, 'Inicialmente debe estar bloqueado');
    assert.strictEqual(noticeState.overdueObligations.length, 2);

    // 2. Desde el ERP, marco pagada la deuda más reciente (Week 2: 2026-10-12 a 2026-10-18)
    complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-05_2026-10-11`,
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        },
        {
          id: `obl_${complexId}_2026-10-12_2026-10-18`,
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 20000,
          amountPaid: 20000,
          remainingBalance: 0,
          status: 'paid',
          isPaid: true
        }
      ]
    };

    obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 15000, 'El SaaS reduce correctamente la deuda total tras pagar la reciente');
    noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, true, 'El SaaS DEBE seguir bloqueado porque la semana más antigua sigue impaga');
    assert.strictEqual(noticeState.overdueObligations.length, 1);
    assert.strictEqual(noticeState.overdueObligations[0].startDateStr, '2026-10-05');

    // 3. Desde el ERP, marco pagada la segunda deuda (la más antigua y única que quedaba pendiente)
    complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-05_2026-10-11`,
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          dueDateStr: '2026-10-12',
          originalAmountDue: 15000,
          amountPaid: 15000,
          remainingBalance: 0,
          status: 'paid',
          isPaid: true
        },
        {
          id: `obl_${complexId}_2026-10-12_2026-10-18`,
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          dueDateStr: '2026-10-19',
          originalAmountDue: 20000,
          amountPaid: 20000,
          remainingBalance: 0,
          status: 'paid',
          isPaid: true
        }
      ]
    };

    obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 0, 'La deuda total debe ser exactamente 0');
    noticeState = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(noticeState.isBlockedByDebt, false, 'El SaaS DEBE restaurar el acceso automáticamente (sin bloqueo)');
    assert.strictEqual(noticeState.blockingObligation, null);
    assert.strictEqual(noticeState.overdueObligations.length, 0);
  });

  it('11. REGRESIÓN: Activación a mitad de semana y reservas reales no resucitan deuda pagada en ERP', () => {
    // Complejo activado el martes 2026-10-06.
    // Partidos jugados en la primera semana (10/10) y segunda semana (15/10).
    const midWeekComplexDocBase = {
      id: complexId,
      name: 'Complejo Central',
      clientStatus: 'active',
      activatedAt: '2026-10-06T14:00:00Z' // Martes
    };

    const bookings: Match[] = [
      {
        id: 'b1',
        complexId,
        date: '2026-10-10', // Sábado de semana 1
        status: 'jugado',
        price: 150000 // 10% = 15000
      } as unknown as Match,
      {
        id: 'b2',
        complexId,
        date: '2026-10-15', // Jueves de semana 2
        status: 'jugado',
        price: 200000 // 10% = 20000
      } as unknown as Match
    ];

    // ERP registra ambas obligaciones bajo el lunes canónico
    let complexDoc = {
      ...midWeekComplexDocBase,
      paymentObligations: [
        {
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        },
        {
          startDateStr: '2026-10-12',
          endDateStr: '2026-10-18',
          originalAmountDue: 20000,
          amountPaid: 0,
          remainingBalance: 20000,
          status: 'pending'
        }
      ]
    };

    let obligations = calculateWeeklyObligations(complexId, complexDoc, bookings, nowThursday);
    // Verificar que no se duplicó la semana 1 (no debe haber una por 10-06 y otra por 10-05)
    assert.strictEqual(obligations.length, 2, 'Debe haber exactamente 2 obligaciones, no 3');
    assert.strictEqual(calculateTotalWeeklyDebt(obligations), 35000);

    // Pago 1: Pagar la más reciente (semana 2)
    complexDoc.paymentObligations[1].amountPaid = 20000;
    complexDoc.paymentObligations[1].remainingBalance = 0;
    complexDoc.paymentObligations[1].status = 'paid';

    obligations = calculateWeeklyObligations(complexId, complexDoc, bookings, nowThursday);
    assert.strictEqual(calculateTotalWeeklyDebt(obligations), 15000);
    let notice = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(notice.isBlockedByDebt, true, 'Sigue bloqueado por la semana 1');

    // Pago 2: Pagar la más antigua (semana 1)
    complexDoc.paymentObligations[0].amountPaid = 15000;
    complexDoc.paymentObligations[0].remainingBalance = 0;
    complexDoc.paymentObligations[0].status = 'paid';

    obligations = calculateWeeklyObligations(complexId, complexDoc, bookings, nowThursday);
    assert.strictEqual(calculateTotalWeeklyDebt(obligations), 0, 'Deuda total debe ser 0 tras pagar ambas');
    notice = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(notice.isBlockedByDebt, false, 'El acceso se restaura sin bloqueo');
  });

  it('12. REGRESIÓN: Conciliación entre paymentObligations y paymentPeriods con formatos heredados', () => {
    // En paymentObligations figura pendiente (antiguo snapshot),
    // pero el ERP actualizó paymentPeriods marcando como pagada la semana con status 'pagado' y saldoPendiente 0.
    const complexDoc = {
      ...complexDocBase,
      paymentObligations: [
        {
          id: `obl_${complexId}_2026-10-05_2026-10-11`,
          startDateStr: '2026-10-05',
          endDateStr: '2026-10-11',
          originalAmountDue: 15000,
          amountPaid: 0,
          remainingBalance: 15000,
          status: 'pending'
        }
      ],
      paymentPeriods: [
        {
          periodId: '2026-10-05_2026-10-11',
          startDate: '2026-10-05',
          endDate: '2026-10-11',
          monto: 15000,
          saldoPendiente: 0,
          estado: 'pagado',
          isPaid: true
        }
      ]
    };

    const obligations = calculateWeeklyObligations(complexId, complexDoc, [], nowThursday);
    const targetObl = obligations.find(o => o.startDateStr === '2026-10-05');
    assert.ok(targetObl, 'Debe existir la obligación para la semana');
    assert.strictEqual(targetObl.remainingBalance, 0);
    assert.strictEqual(targetObl.status, 'paid');

    const totalDebt = calculateTotalWeeklyDebt(obligations);
    assert.strictEqual(totalDebt, 0);

    const notice = evaluateBillingNoticeState(complexId, complexDoc, obligations, nowThursday);
    assert.strictEqual(notice.isBlockedByDebt, false, 'No debe bloquear: el pago en paymentPeriods es soberano');
  });
});

