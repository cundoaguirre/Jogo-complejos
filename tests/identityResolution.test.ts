import {
  buildCrmActivityIndex,
  extractBookingParticipants,
  findMatchingLocalUser,
  normalizePhoneNumber
} from '../src/lib/crmActivityIndex';
import { resolveClientName, cleanFirestoreDocument } from '../src/lib/firestoreSync';
import type { Match, User } from '../src/types';

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

console.log('====================================================================');
console.log('JOGO SAAS — REGRESSION TEST: RESOLUCIÓN DE IDENTIDAD ERP Y FICHAS LOCALES');
console.log('====================================================================\n');

// Identidad canónica unificada en ERP
const CANONICAL_PERSON_ID = 'canon_person_pajaro_gutierrez_999';
const CANONICAL_NAME = 'Pájaro Gutiérrez';
const NORMALIZED_PHONE = '5491144556677';
const FORMATTED_PHONE = '+54 9 11 4455-6677';

// 3 Complejos independientes
const COMPLEX_EL_SALON = 'complejo_el_salon';
const COMPLEX_EL_PATO = 'complejo_el_pato';
const COMPLEX_EL_MESIAS = 'complejo_el_mesias'; // Complejo bajo prueba principal

// 3 Fichas locales preexistentes en sus respectivos complejos
const localUserElSalon: User = {
  id: 'user_salon_001',
  name: 'Pájaro Gutiérrez',
  phone: FORMATTED_PHONE,
  email: 'pajaro@salon.com',
  originComplejoId: COMPLEX_EL_SALON,
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_salon_001',
  historicalIds: ['hist_salon_001']
};

const localUserElPato: User = {
  id: 'user_pato_002',
  name: 'Pájaro',
  phone: FORMATTED_PHONE,
  email: 'pajaro@pato.com',
  originComplejoId: COMPLEX_EL_PATO,
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_pato_002',
  historicalIds: ['hist_pato_002']
};

const localUserElMesias: User = {
  id: 'user_mesias_003',
  name: 'Federico Gutiérrez', // Nombre local del complejo El Mesías
  phone: FORMATTED_PHONE,
  email: 'federico@mesias.com',
  originComplejoId: COMPLEX_EL_MESIAS,
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_mesias_003',
  historicalIds: ['hist_mesias_003']
};

function createMockMatch(partial: Partial<Match> & { id: string; complejoId: string; date: string }): Match {
  return {
    id: partial.id,
    complejoId: partial.complejoId,
    complexId: partial.complexId || partial.complejoId,
    court_id: partial.court_id || 'cancha_1',
    court_name: partial.court_name || 'Cancha 1',
    date: partial.date,
    time: partial.time || '19:00',
    startTime: partial.startTime || partial.time || '19:00',
    endTime: partial.endTime || '20:00',
    start_time: partial.start_time || `${partial.date}T19:00:00Z`,
    end_time: partial.end_time || `${partial.date}T20:00:00Z`,
    price: partial.price ?? 25000,
    price_total: partial.price_total ?? partial.price ?? 25000,
    amount_paid: partial.amount_paid ?? 0,
    status: partial.status || 'confirmado',
    payment_status: partial.payment_status || 'paid',
    is_open: true,
    max_players: 10,
    player_count: 0,
    players: [],
    host_id: partial.host_id || 'host_1',
    host_name: partial.host_name || 'Organizador',
    host_phone: partial.host_phone || '',
    ...partial
  };
}

console.log('--- 1. ESCENARIO: Ficha local preexistente en El Mesías ("Federico Gutiérrez") ---');

// Creamos 3 reservas recibidas desde ERP para El Mesías usando los diferentes nombres históricos o el canónico:
// Reserva 1: Creada desde ERP con el nombre histórico de El Salón ("Pájaro Gutiérrez") y su histórico ID
const bookingFromErp_SalonRecord: Match = createMockMatch({
  id: 'booking_erp_01',
  complejoId: COMPLEX_EL_MESIAS,
  complexId: COMPLEX_EL_MESIAS,
  court_id: 'cancha_1',
  court_name: 'Cancha 1',
  date: '2026-11-01',
  time: '19:00',
  startTime: '19:00',
  endTime: '20:00',
  start_time: '2026-11-01T19:00:00Z',
  end_time: '2026-11-01T20:00:00Z',
  price: 25000,
  price_total: 25000,
  amount_paid: 25000,
  status: 'confirmado',
  payment_status: 'paid',
  host_id: 'hist_salon_001',
  userId: 'hist_salon_001',
  host_name: 'Pájaro Gutiérrez',
  userName: 'Pájaro Gutiérrez',
  clientName: 'Pájaro Gutiérrez',
  userPhone: '11 4455-6677',
  clientPhone: '11 4455-6677',
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_salon_001',
  historicalIds: ['hist_salon_001', 'hist_pato_002', 'hist_mesias_003']
});

// Reserva 2: Creada desde ERP con el nombre histórico de El Pato ("Pájaro")
const bookingFromErp_PatoRecord: Match = createMockMatch({
  id: 'booking_erp_02',
  complejoId: COMPLEX_EL_MESIAS,
  complexId: COMPLEX_EL_MESIAS,
  court_id: 'cancha_2',
  court_name: 'Cancha 2',
  date: '2026-11-02',
  time: '20:00',
  startTime: '20:00',
  endTime: '21:00',
  start_time: '2026-11-02T20:00:00Z',
  end_time: '2026-11-02T21:00:00Z',
  price: 30000,
  price_total: 30000,
  amount_paid: 10000,
  status: 'confirmado',
  payment_status: 'seña',
  host_id: 'hist_pato_002',
  userId: 'hist_pato_002',
  host_name: 'Pájaro',
  userName: 'Pájaro',
  clientName: 'Pájaro',
  userPhone: '15 4455-6677',
  clientPhone: '15 4455-6677',
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_pato_002',
  historicalIds: ['hist_salon_001', 'hist_pato_002', 'hist_mesias_003']
});

// Reserva 3: Creada desde SaaS en El Mesías
const bookingFromSaaS_MesiasRecord: Match = createMockMatch({
  id: 'booking_saas_03',
  complejoId: COMPLEX_EL_MESIAS,
  complexId: COMPLEX_EL_MESIAS,
  court_id: 'cancha_1',
  court_name: 'Cancha 1',
  date: '2026-11-03',
  time: '21:00',
  startTime: '21:00',
  endTime: '22:00',
  start_time: '2026-11-03T21:00:00Z',
  end_time: '2026-11-03T22:00:00Z',
  price: 25000,
  price_total: 25000,
  amount_paid: 25000,
  status: 'confirmado',
  payment_status: 'paid',
  host_id: localUserElMesias.id,
  userId: localUserElMesias.id,
  host_name: 'Federico Gutiérrez',
  userName: 'Federico Gutiérrez',
  clientName: 'Federico Gutiérrez',
  userPhone: FORMATTED_PHONE,
  clientPhone: FORMATTED_PHONE,
  canonicalId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME
});

const mesiasBookings = [bookingFromErp_SalonRecord, bookingFromErp_PatoRecord, bookingFromSaaS_MesiasRecord];
const mesiasLocalUsers = [localUserElMesias];

// Construir índice de actividad en El Mesías
const indexMesias = buildCrmActivityIndex(mesiasLocalUsers, mesiasBookings, COMPLEX_EL_MESIAS, new Date('2026-11-10'));

// 1. El CRM del complejo conserve una única ficha local para esa persona
assert(indexMesias.crmUsers.length === 1, `El CRM debe tener exactamente 1 usuario para el complejo, obtenido: ${indexMesias.crmUsers.length}`);
assertEqual(indexMesias.crmUsers[0].id, localUserElMesias.id, 'El usuario resultante debe ser la ficha local preexistente');
assertEqual(indexMesias.crmUsers[0].name, 'Federico Gutiérrez', 'El nombre en el CRM debe ser el nombre local "Federico Gutiérrez", NUNCA sobrescrito');

// 2. Todas las reservas correspondientes se acumulen en su historial
const metricsMesias = indexMesias.userMetricsMap.get(String(localUserElMesias.id));
assert(metricsMesias !== undefined, 'Las métricas del usuario local deben existir');
if (metricsMesias) {
  assertEqual(metricsMesias.reservas, 3, 'El usuario local debe acumular las 3 reservas (metrics.reservas = 3)');
  assertEqual(metricsMesias.juegos, 3, 'Las 3 reservas deben contar como partidos finalizados (metrics.juegos = 3)');
  assertEqual(indexMesias.crmUsers[0].totalBookings, 3, 'user.totalBookings en la ficha enriquecida debe ser 3');
  assertEqual(indexMesias.crmUsers[0].totalMatchesPlayed, 3, 'user.totalMatchesPlayed en la ficha enriquecida debe ser 3');
  assert(Array.isArray(indexMesias.crmUsers[0].history) && indexMesias.crmUsers[0].history.length === 3, 'El historial de partidos debe contener las 3 reservas');
}

// 3. Resolución en Agenda, detalle y buscador usando nombre local
const resolvedNameSalonBooking = resolveClientName(bookingFromErp_SalonRecord, mesiasLocalUsers);
assertEqual(resolvedNameSalonBooking, 'Federico Gutiérrez', 'La reserva con nombre de ERP "Pájaro Gutiérrez" debe mostrarse en Agenda como "Federico Gutiérrez" en El Mesías');

const resolvedNamePatoBooking = resolveClientName(bookingFromErp_PatoRecord, mesiasLocalUsers);
assertEqual(resolvedNamePatoBooking, 'Federico Gutiérrez', 'La reserva con nombre de ERP "Pájaro" debe mostrarse en Agenda como "Federico Gutiérrez" en El Mesías');

// Comprobación de findMatchingLocalUser
const matchedUserFromErp1 = findMatchingLocalUser(mesiasLocalUsers, {
  canonicalId: CANONICAL_PERSON_ID,
  historicalId: 'hist_salon_001',
  phone: '11 4455-6677'
});
assertEqual(matchedUserFromErp1?.id, localUserElMesias.id, 'findMatchingLocalUser debe resolver a la ficha local por canonicalId/phone');
assertEqual(matchedUserFromErp1?.name, 'Federico Gutiérrez', 'Ficha local resuelta mantiene el nombre local');

// 4. El ERP conserva su nombre canónico
assertEqual(bookingFromErp_SalonRecord.canonicalName, CANONICAL_NAME, 'La reserva conserva el nombre canónico de ERP intacto');
assertEqual(bookingFromSaaS_MesiasRecord.canonicalName, CANONICAL_NAME, 'La reserva creada en SaaS asocia el nombre canónico de ERP');

// 5. Los nombres de otros complejos permanecen intactos
// En El Salón:
const salonBookings = [bookingFromErp_SalonRecord];
const indexSalon = buildCrmActivityIndex([localUserElSalon], salonBookings, COMPLEX_EL_SALON);
assertEqual(indexSalon.crmUsers[0].name, 'Pájaro Gutiérrez', 'En El Salón el nombre local es "Pájaro Gutiérrez" y permanece intacto');

// En El Pato:
const patoBookings = [bookingFromErp_PatoRecord];
const indexPato = buildCrmActivityIndex([localUserElPato], patoBookings, COMPLEX_EL_PATO);
assertEqual(indexPato.crmUsers[0].name, 'Pájaro', 'En El Pato el nombre local es "Pájaro" y permanece intacto');

// 6. Separación estricta entre complejos y conteo único
// Una reserva para El Salón no debe acumularse en El Mesías
const foreignBookingForSalon: Match = createMockMatch({
  id: 'booking_salon_other',
  complejoId: COMPLEX_EL_SALON,
  complexId: COMPLEX_EL_SALON,
  date: '2026-11-04',
  court_id: 'c_salon_1',
  price: 20000,
  host_id: 'hist_salon_001',
  userPhone: FORMATTED_PHONE,
  canonicalId: CANONICAL_PERSON_ID
});

const mixedBookings = [...mesiasBookings, foreignBookingForSalon];
const isolatedIndexMesias = buildCrmActivityIndex(mesiasLocalUsers, mixedBookings, COMPLEX_EL_MESIAS);
const isolatedMetrics = isolatedIndexMesias.userMetricsMap.get(String(localUserElMesias.id));
assertEqual(isolatedMetrics?.reservas, 3, 'Las reservas de otro complejo NO deben acumularse en El Mesías');

// 7. Jugador nuevo sin ficha local preexistente: crea ficha derivada en memoria con identidad de ERP
const newPlayerBooking: Match = createMockMatch({
  id: 'booking_new_player',
  complejoId: COMPLEX_EL_MESIAS,
  complexId: COMPLEX_EL_MESIAS,
  date: '2026-11-05',
  court_id: 'cancha_1',
  price: 15000,
  host_id: 'erp_new_player_888',
  host_name: 'Lucas Martínez',
  userName: 'Lucas Martínez',
  clientPhone: '+54 9 351 9988776',
  canonicalId: 'canon_lucas_888',
  canonicalName: 'Lucas Martínez'
});

const indexWithNewPlayer = buildCrmActivityIndex(mesiasLocalUsers, [...mesiasBookings, newPlayerBooking], COMPLEX_EL_MESIAS);
assertEqual(indexWithNewPlayer.crmUsers.length, 2, 'Debe haber 2 usuarios (1 local preexistente + 1 derivado de la reserva)');
const derivedLucas = indexWithNewPlayer.crmUsers.find(u => u.canonicalId === 'canon_lucas_888' || u.phone === '+54 9 351 9988776');
assert(derivedLucas !== undefined, 'El jugador nuevo debe representarse como ficha en el CRM');
assertEqual(derivedLucas?.name, 'Lucas Martínez', 'La ficha derivada debe utilizar la identidad recibida de ERP');
assert(derivedLucas?.isDerived === true, 'La ficha debe estar identificada como derivada');

// 8. Normalizador de teléfonos argentino (móviles con 15 y prefijos variados a 10 dígitos puros)
assertEqual(normalizePhoneNumber('+54 9 11 4455-6677'), '1144556677', 'Normalización de celular Buenos Aires a 10 dígitos');
assertEqual(normalizePhoneNumber('11 15 4455-6677'), '1144556677', 'Normalización de 11 15 a 10 dígitos');
assertEqual(normalizePhoneNumber('0351 15 998-8776'), '3519988776', 'Normalización Córdoba 0351 15 a 10 dígitos');
assertEqual(normalizePhoneNumber('+54 9 351 998-8776'), '3519988776', 'Normalización Córdoba +54 9 351 a 10 dígitos');

// --------------------------------------------------------------------------------------------------
// 9. ESCRITURA EN FIRESTORE: AUSENCIA DE 'undefined' EN TRANSACTION.SET() (RESERVA CON Y SIN CANONICALID)
// --------------------------------------------------------------------------------------------------
console.log('\n--- 9. ESCRITURA EN FIRESTORE: MANEJO SEGURO DE CANONICALID Y OMISIÓN DE UNDEFINED ---');

// Validador estricto idéntico a Firestore SDK para Transaction.set()
function validateFirestorePayload(docPath: string, payload: any) {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      throw new Error(`"Transaction.set()": valor no compatible "undefined" en el campo "${key}", documento "${docPath}".`);
    }
  }
}

// 9.1 Caso de falla reproducido: Objeto crudo con canonicalId: undefined
const rawFaultyPayload = {
  id: '8YcmcpSXYUl3ByVNJoxc',
  courtName: 'Cancha 1',
  date: '2026-10-25',
  startTime: '19:00',
  endTime: '20:00',
  clientName: 'Jugador Común',
  canonicalId: undefined,
  canonicalUserId: undefined,
  canonicalName: undefined,
  historicalId: undefined,
  historicalIds: undefined
};

let capturedError: string | null = null;
try {
  validateFirestorePayload('bookings/8YcmcpSXYUl3ByVNJoxc', rawFaultyPayload);
} catch (e: any) {
  capturedError = e.message;
}
assert(capturedError !== null && capturedError.includes('valor no compatible "undefined" en el campo "canonicalId"'), 
  'El validador de Firestore reproduce exactamente el error con canonicalId undefined');

// 9.2 Reserva creada desde el SaaS SIN canonicalId (jugador local nuevo o sin cuenta ERP)
const cleanPayloadWithoutCanonical = cleanFirestoreDocument(rawFaultyPayload);
assert(!('canonicalId' in cleanPayloadWithoutCanonical), 'canonicalId debe ser completamente omitido del documento');
assert(!('canonicalUserId' in cleanPayloadWithoutCanonical), 'canonicalUserId debe ser completamente omitido del documento');
assert(!('canonicalName' in cleanPayloadWithoutCanonical), 'canonicalName debe ser completamente omitido del documento');
assert(!('historicalId' in cleanPayloadWithoutCanonical), 'historicalId debe ser completamente omitido del documento');
assert(!('historicalIds' in cleanPayloadWithoutCanonical), 'historicalIds debe ser completamente omitido del documento');

let successWithoutCanonical = false;
try {
  validateFirestorePayload('bookings/8YcmcpSXYUl3ByVNJoxc', cleanPayloadWithoutCanonical);
  successWithoutCanonical = true;
} catch (e: any) {
  successWithoutCanonical = false;
}
assert(successWithoutCanonical, 'Transaction.set() para reserva sin canonicalId se ejecuta con éxito absoluto sin errores de undefined');

// 9.3 Reserva creada con identidad canónica válida (conservación íntegra)
const bookingWithCanonicalInput = {
  id: 'booking_with_canon_123',
  courtName: 'Cancha 2',
  date: '2026-10-26',
  startTime: '20:00',
  endTime: '21:00',
  clientName: 'Pájaro Gutiérrez',
  canonicalId: CANONICAL_PERSON_ID,
  canonicalUserId: CANONICAL_PERSON_ID,
  canonicalName: CANONICAL_NAME,
  historicalId: 'hist_salon_001',
  historicalIds: ['hist_salon_001', 'hist_pato_002']
};

const cleanPayloadWithCanonical = cleanFirestoreDocument(bookingWithCanonicalInput);
assertEqual(cleanPayloadWithCanonical.canonicalId, CANONICAL_PERSON_ID, 'canonicalId válido debe conservarse intacto en el documento');
assertEqual(cleanPayloadWithCanonical.canonicalName, CANONICAL_NAME, 'canonicalName válido debe conservarse intacto');
assertEqual(cleanPayloadWithCanonical.historicalId, 'hist_salon_001', 'historicalId válido debe conservarse intacto');

let successWithCanonical = false;
try {
  validateFirestorePayload('bookings/booking_with_canon_123', cleanPayloadWithCanonical);
  successWithCanonical = true;
} catch (e: any) {
  successWithCanonical = false;
}
assert(successWithCanonical, 'Transaction.set() para reserva con identidad canónica se ejecuta con éxito y conserva todos los campos');

console.log('\n----------------------------------------------------');
console.log(`TOTAL PRUEBAS: ${passed + failed} | EXITOSAS: ${passed} | FALLIDAS: ${failed}`);
console.log('----------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('TODAS LAS PRUEBAS DE RESOLUCIÓN DE IDENTIDAD PASARON EXITOSAMENTE.');
}
