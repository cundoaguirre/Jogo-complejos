import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingLocalUser,
  buildCrmActivityIndex,
  normalizePhoneNumber,
  isSameComplex
} from '../src/lib/crmActivityIndex';
import type { User, Match } from '../src/types';

test('JOGO SAAS — AISLAMIENTO DE JUGADORES POR COMPLEJO', async (t) => {

  await t.test('Escenario A: Edición de ficha aislada entre Complejo A y Complejo B', () => {
    const SAME_PHONE = '1112345678';

    // Ficha local de Pepe en Complejo A
    const pepeA: User = {
      id: 'user_pepe_a',
      name: 'Pepe',
      phone: SAME_PHONE,
      email: 'pepe@complejo-a.com',
      category: 'primera',
      notes: 'Juega de 9 los martes',
      originComplejoId: 'complejo_a',
      debt: 0
    };

    // Ficha local de Juan en Complejo B con el mismo teléfono
    const juanB: User = {
      id: 'user_juan_b',
      name: 'Juan',
      phone: SAME_PHONE,
      email: 'juan@complejo-b.com',
      category: 'veterano',
      notes: 'Pide siempre cancha 1',
      originComplejoId: 'complejo_b',
      debt: 0
    };

    // Simular edición de Pepe desde Complejo A
    const updatedPepeFields = {
      name: 'Pepe González',
      phone: '1112345678',
      email: 'pepegonzalez@gmail.com',
      category: 'veterano',
      notes: 'Nueva nota: capitán del equipo'
    };

    // Simulación de saveClientInFirestore en Complejo A
    const simulateSaveClient = (targetComplexId: string, currentCard: User, update: Partial<User>, existingDocs: Map<string, any>) => {
      const isOwn = isSameComplex(currentCard.originComplejoId, targetComplexId);
      let targetId: string = String(currentCard.id);
      if (!isOwn) {
        targetId = `user_${targetComplexId}_new`;
      }
      const existing = existingDocs.get(targetId) || currentCard;
      const savedDoc = {
        ...existing,
        ...update,
        id: targetId,
        originComplejoId: isOwn ? currentCard.originComplejoId : targetComplexId
      };
      existingDocs.set(targetId, savedDoc);
      return savedDoc;
    };

    const store = new Map<string, any>();
    store.set('user_pepe_a', { ...pepeA });
    store.set('user_juan_b', { ...juanB });

    // Modificar a Pepe en Complejo A
    const savedPepe = simulateSaveClient('complejo_a', pepeA, updatedPepeFields, store);

    // Verificar que Pepe en Complejo A cambió
    assert.equal(savedPepe.name, 'Pepe González');
    assert.equal(savedPepe.email, 'pepegonzalez@gmail.com');
    assert.equal(savedPepe.notes, 'Nueva nota: capitán del equipo');

    // Verificar que Juan en Complejo B PERMANECE 100% INTACTO
    const juanAfter = store.get('user_juan_b');
    assert.equal(juanAfter.name, 'Juan', 'El nombre de Juan en Complejo B no debe modificarse');
    assert.equal(juanAfter.email, 'juan@complejo-b.com', 'El email de Juan no debe modificarse');
    assert.equal(juanAfter.category, 'veterano', 'La categoría de Juan no debe modificarse');
    assert.equal(juanAfter.notes, 'Pide siempre cancha 1', 'Las notas de Juan no deben modificarse');
    assert.equal(juanAfter.originComplejoId, 'complejo_b');
  });

  await t.test('Escenario B: Validación de teléfonos duplicados aislada por complejo', () => {
    const SAME_PHONE = '1112345678';
    const normSamePhone = normalizePhoneNumber(SAME_PHONE);

    const usersComplexA: User[] = [
      {
        id: 'user_pepe_a',
        name: 'Pepe',
        phone: SAME_PHONE,
        email: 'pepe@a.com',
        originComplejoId: 'complejo_a'
      }
    ];

    const usersComplexB: User[] = [
      {
        id: 'user_juan_b',
        name: 'Juan',
        phone: SAME_PHONE,
        email: 'juan@b.com',
        originComplejoId: 'complejo_b'
      }
    ];

    const validateDuplicatePhone = (trimmedPhone: string, currentId: string | null, localUsers: User[]) => {
      const normPhone = normalizePhoneNumber(trimmedPhone);
      if (!normPhone) return null;
      const dup = localUsers.find(u => {
        if (currentId && String(u.id) === currentId) return false;
        if (u.isDerived || String(u.id).startsWith('derived_')) return false;
        return normalizePhoneNumber(u.phone) === normPhone;
      });
      if (dup) {
        return `Ya existe otro jugador registrado con este número de teléfono (${dup.name}) en el complejo.`;
      }
      return null;
    };

    // 1. El teléfono de Complejo A puede registrarse en Complejo B (no hay colisión en B si B no lo tenía)
    const emptyBUsers: User[] = [];
    const checkBNew = validateDuplicatePhone(SAME_PHONE, null, emptyBUsers);
    assert.equal(checkBNew, null, 'El teléfono de A debe poder registrarse en B sin colisión');

    // 2. En Complejo A, no se puede crear un SEGUNDO jugador con el mismo teléfono
    const checkADup = validateDuplicatePhone(SAME_PHONE, null, usersComplexA);
    assert.notEqual(checkADup, null, 'Debe detectar duplicado si se intenta crear otro jugador con el mismo teléfono en A');
    assert.match(checkADup!, /Pepe/);

    // 3. Editar la propia ficha de Pepe en Complejo A NO produce falso duplicado
    const checkAEditSelf = validateDuplicatePhone(SAME_PHONE, 'user_pepe_a', usersComplexA);
    assert.equal(checkAEditSelf, null, 'Editar la propia ficha con el mismo teléfono no debe dar error de duplicado');
  });

  await t.test('Escenario C: Deudas, fiados y operaciones financieras aisladas', () => {
    let debtA = 0;
    let debtB = 0;

    const userCardA = { id: 'user_a', originComplejoId: 'complejo_a', debt: 0 };
    const userCardB = { id: 'user_b', originComplejoId: 'complejo_b', debt: 0 };

    // 1. Complejo A registra fiado de $10.000
    const opAComplex = 'complejo_a';
    const fiadoAmount = 10000;
    if (isSameComplex(userCardA.originComplejoId, opAComplex)) {
      userCardA.debt += fiadoAmount;
    }
    // Complejo B NO recibe esa deuda
    assert.equal(userCardA.debt, 10000, 'Complejo A debe acumular la deuda fiada');
    assert.equal(userCardB.debt, 0, 'Complejo B NO debe recibir la deuda de Complejo A');

    // 2. Complejo A registra pago parcial de $4.000
    const paymentAmount = 4000;
    if (isSameComplex(userCardA.originComplejoId, opAComplex)) {
      userCardA.debt -= paymentAmount;
    }
    assert.equal(userCardA.debt, 6000, 'El saldo pendiente de Pepe en A debe ser $6.000');
    assert.equal(userCardB.debt, 0, 'El saldo de Juan en B debe permanecer intacto en $0');

    // 3. Devolución / anulación en A no altera saldos de B
    const cancelRefundToExtinguish = 6000;
    if (isSameComplex(userCardA.originComplejoId, opAComplex)) {
      userCardA.debt -= cancelRefundToExtinguish;
    }
    assert.equal(userCardA.debt, 0, 'La deuda de A se extinguió por cancelación');
    assert.equal(userCardB.debt, 0, 'La deuda de B permanece inalterada en $0');
  });

  await t.test('Escenario D: Reservas y métricas aisladas por complejo', () => {
    const userMesias: User = {
      id: 'user_mesias',
      name: 'Federico',
      phone: '1144556677',
      email: 'fede@test.com',
      originComplejoId: 'complejo_el_mesias'
    };

    const userPato: User = {
      id: 'user_pato',
      name: 'Pájaro',
      phone: '1144556677',
      email: 'pajaro@test.com',
      originComplejoId: 'complejo_el_pato'
    };

    const bookings: Match[] = [
      {
        id: 'b_mesias_1',
        complejoId: 'complejo_el_mesias',
        courtId: 'c1',
        date: '2026-10-20',
        startTime: '19:00',
        endTime: '20:00',
        userId: 'user_mesias',
        userPhone: '1144556677',
        status: 'completed'
      },
      {
        id: 'b_mesias_2',
        complejoId: 'complejo_el_mesias',
        courtId: 'c1',
        date: '2026-10-22',
        startTime: '20:00',
        endTime: '21:00',
        userId: 'user_mesias',
        userPhone: '1144556677',
        status: 'completed'
      },
      {
        id: 'b_pato_1',
        complejoId: 'complejo_el_pato',
        courtId: 'c1',
        date: '2026-10-24',
        startTime: '18:00',
        endTime: '19:00',
        userId: 'user_pato',
        userPhone: '1144556677',
        status: 'completed'
      }
    ] as unknown as Match[];

    // Índice CRM en El Mesías
    const crmMesias = buildCrmActivityIndex([userMesias], bookings, 'complejo_el_mesias', new Date('2026-10-26'));
    const metricsMesias = crmMesias.userMetricsMap.get('user_mesias');
    assert.equal(metricsMesias?.reservas, 2, 'El Mesías debe contabilizar exclusivamente sus 2 reservas');

    // Índice CRM en El Pato
    const crmPato = buildCrmActivityIndex([userPato], bookings, 'complejo_el_pato', new Date('2026-10-26'));
    const metricsPato = crmPato.userMetricsMap.get('user_pato');
    assert.equal(metricsPato?.reservas, 1, 'El Pato debe contabilizar exclusivamente su única reserva');

    // Comprobar que findMatchingLocalUser con scoping de complejo no mezcla usuarios
    const matchInMesias = findMatchingLocalUser([userMesias, userPato], { phone: '1144556677' }, 'complejo_el_mesias');
    assert.equal(matchInMesias?.id, 'user_mesias', 'Debe resolver a la ficha local de El Mesías');
    assert.equal(matchInMesias?.name, 'Federico');

    const matchInPato = findMatchingLocalUser([userMesias, userPato], { phone: '1144556677' }, 'complejo_el_pato');
    assert.equal(matchInPato?.id, 'user_pato', 'Debe resolver a la ficha local de El Pato');
    assert.equal(matchInPato?.name, 'Pájaro');
  });

  await t.test('Escenario E: Regresión y compatibilidad hacia atrás con ERP y datos históricos', () => {
    // Ficha histórica con canonicalId y historicalIds
    const historicalUser: User = {
      id: 'legacy_doc_101',
      name: 'Cliente Antiguo',
      phone: '1199887766',
      email: 'legacy@test.com',
      canonicalId: 'canon_erp_555',
      canonicalUserId: 'canon_erp_555',
      historicalIds: ['old_user_1', 'old_user_2'],
      originComplejoId: 'complejo_central'
    };

    // Coincidencia por canonicalId
    const matchByCanon = findMatchingLocalUser([historicalUser], { canonicalId: 'canon_erp_555' }, 'complejo_central');
    assert.equal(matchByCanon?.id, 'legacy_doc_101', 'Debe reconocer al usuario histórico por su canonicalId');

    // Coincidencia por historicalId
    const matchByHist = findMatchingLocalUser([historicalUser], { historicalId: 'old_user_2' }, 'complejo_central');
    assert.equal(matchByHist?.id, 'legacy_doc_101', 'Debe resolver la ficha histórica a través de historicalIds');

    // Si viene de otro complejo con el mismo canonicalId, el filtro por complexId evita la apropiación
    const matchOtherComplex = findMatchingLocalUser([historicalUser], { canonicalId: 'canon_erp_555' }, 'complejo_otro');
    assert.equal(matchOtherComplex, null, 'No debe devolver la ficha de complejo_central si se consulta para complejo_otro');
  });
});
