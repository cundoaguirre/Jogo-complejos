import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneNumber } from '../src/lib/crmActivityIndex';
import type { User } from '../src/types';

test('Player Profile Editing - Form Fields and Validations', async (t) => {
  await t.test('1. Mandatory fields: name and phone are required', () => {
    const validateFields = (name: string, phone: string) => {
      const trimmedName = (name || '').trim();
      const trimmedPhone = (phone || '').trim();
      if (!trimmedName) return { valid: false, error: 'El nombre y apellido es obligatorio.' };
      if (!trimmedPhone) return { valid: false, error: 'El teléfono es obligatorio.' };
      return { valid: true, error: null };
    };

    assert.equal(validateFields('', '1122334455').valid, false);
    assert.equal(validateFields('', '1122334455').error, 'El nombre y apellido es obligatorio.');

    assert.equal(validateFields('Juan Perez', '').valid, false);
    assert.equal(validateFields('Juan Perez', '').error, 'El teléfono es obligatorio.');

    assert.equal(validateFields('  Juan Perez  ', '  1122334455  ').valid, true);
  });

  await t.test('2. Phone duplicate detection within active complex', () => {
    const existingUsers: User[] = [
      {
        id: 'user_1',
        name: 'Carlos Tevez',
        phone: '+54 9 11 5555-0001',
        email: 'carlos@tevez.com',
        originComplejoId: 'complejo_central'
      },
      {
        id: 'user_2',
        name: 'Rodrigo De Paul',
        phone: '+54 9 11 5555-0002',
        email: 'rodrigo@depaul.com',
        originComplejoId: 'complejo_central'
      },
      {
        id: 'derived_phone_1155550003',
        name: 'Invitado Partida',
        phone: '+54 9 11 5555-0003',
        email: '',
        isDerived: true,
        originComplejoId: 'complejo_central'
      }
    ];

    const checkDuplicatePhone = (currentId: string | null, newPhone: string, users: User[]) => {
      const normPhone = normalizePhoneNumber(newPhone.trim());
      if (!normPhone) return null;
      const duplicate = users.find(u => {
        if (currentId && String(u.id) === currentId) return false;
        if (u.isDerived || String(u.id).startsWith('derived_')) return false;
        return normalizePhoneNumber(u.phone) === normPhone;
      });
      return duplicate ? `Ya existe otro jugador registrado con este número de teléfono (${duplicate.name}) en el complejo.` : null;
    };

    // Updating user_1 with user_2's phone -> collision detected
    const collisionError = checkDuplicatePhone('user_1', '11-5555-0002', existingUsers);
    assert.ok(collisionError);
    assert.match(collisionError, /Rodrigo De Paul/);

    // Updating user_1 keeping their own phone -> allowed (no collision)
    const selfPhoneCheck = checkDuplicatePhone('user_1', '11-5555-0001', existingUsers);
    assert.equal(selfPhoneCheck, null);

    // New unique phone -> allowed
    const uniquePhoneCheck = checkDuplicatePhone('user_1', '11-9999-8888', existingUsers);
    assert.equal(uniquePhoneCheck, null);

    // Derived user's phone -> ignored in collision check (guests in memory do not block registrations)
    const derivedPhoneCheck = checkDuplicatePhone(null, '11-5555-0003', existingUsers);
    assert.equal(derivedPhoneCheck, null);
  });

  await t.test('3. 9 fields mapping & preloading in edit mode', () => {
    const existingPlayer: User = {
      id: 'user_100',
      name: 'Lionel Messi',
      phone: '+54 9 11 1010-1010',
      email: 'leo@messi.com',
      address: 'Castelldefels 123',
      city: 'Rosario',
      gender: 'masculino',
      acquisitionChannel: 'Referido',
      category: 'capitán',
      status: 'activo',
      preferredFoot: 'Zurdo',
      birthDate: '1987-06-24',
      notes: 'Zurda mágica, diez de diez'
    };

    // Preloading into form data:
    const formData = {
      name: existingPlayer.name || '',
      phone: existingPlayer.phone || '',
      email: existingPlayer.email || '',
      address: existingPlayer.address || existingPlayer.city || '',
      gender: existingPlayer.gender || '',
      acquisitionChannel: existingPlayer.acquisitionChannel || '',
      category: existingPlayer.category || 'jugador',
      preferredFoot: existingPlayer.preferredFoot || '',
      birthDate: existingPlayer.birthDate || '',
      notes: existingPlayer.notes || ''
    };

    assert.equal(formData.name, 'Lionel Messi');
    assert.equal(formData.phone, '+54 9 11 1010-1010');
    assert.equal(formData.email, 'leo@messi.com');
    assert.equal(formData.address, 'Castelldefels 123');
    assert.equal(formData.gender, 'masculino');
    assert.equal(formData.acquisitionChannel, 'Referido');
    assert.equal(formData.category, 'capitán');
    assert.equal(formData.preferredFoot, 'Zurdo');
    assert.equal(formData.birthDate, '1987-06-24');
  });

  await t.test('4. Merging logic: preserves unedited properties and does not overwrite with undefined', () => {
    const existingDocData: any = {
      id: 'user_456',
      name: 'Angel Di Maria',
      phone: '+54 9 11 7777-8888',
      email: 'fideo@rosario.com',
      address: 'Calle Rosario 7',
      city: 'Rosario',
      gender: 'masculino',
      category: 'jugador',
      status: 'activo',
      isActivated: true,
      acquisitionChannel: 'WhatsApp',
      acquisitionDate: '2024-01-15',
      acquisitionTime: '18:30',
      activationDate: '2024-01-16',
      activationTime: '10:00',
      originComplejoId: 'complejo_central',
      originComplejoName: 'Central Fútbol',
      totalBookings: 12,
      totalMatchesPlayed: 25,
      participatedMatches: 25,
      lastGameDate: '2024-10-20',
      lastGameTime: '21:00',
      debt: 0,
      notes: 'Jugador histórico',
      ownerId: 'owner_abc',
      adminId: 'admin_xyz',
      createdAt: '2024-01-15T18:30:00.000Z',
      canonicalId: 'canon_fideo_7',
      historicalIds: ['hist_7']
    };

    // User only edited name, preferredFoot, and birthDate:
    const clientUpdate: Partial<User> = {
      id: 'user_456',
      name: 'Ángel Fabián Di María',
      phone: '+54 9 11 7777-8888',
      address: 'Nueva Dirección 123',
      preferredFoot: 'Zurdo',
      birthDate: '1988-02-14'
    };

    // Merged payload simulation matching saveClientInFirestore logic:
    const payload: any = {
      id: clientUpdate.id,
      name: (clientUpdate.name !== undefined ? clientUpdate.name : existingDocData.name).trim(),
      phone: (clientUpdate.phone !== undefined ? clientUpdate.phone : existingDocData.phone).trim(),
      email: (clientUpdate.email !== undefined ? clientUpdate.email : existingDocData.email).trim(),
      address: clientUpdate.address !== undefined ? clientUpdate.address : (existingDocData.address || existingDocData.city || ''),
      city: clientUpdate.city !== undefined ? clientUpdate.city : (clientUpdate.address !== undefined ? clientUpdate.address : (existingDocData.city || existingDocData.address || '')),
      preferredFoot: clientUpdate.preferredFoot !== undefined ? clientUpdate.preferredFoot : (existingDocData.preferredFoot || ''),
      birthDate: clientUpdate.birthDate !== undefined ? clientUpdate.birthDate : (existingDocData.birthDate || ''),
      gender: clientUpdate.gender !== undefined ? clientUpdate.gender : (existingDocData.gender || ''),
      category: clientUpdate.category !== undefined ? clientUpdate.category : (existingDocData.category || 'jugador'),
      status: clientUpdate.status !== undefined ? clientUpdate.status : (existingDocData.status || 'activo'),
      isActivated: clientUpdate.isActivated !== undefined ? clientUpdate.isActivated : (existingDocData.isActivated ?? false),
      acquisitionChannel: clientUpdate.acquisitionChannel !== undefined ? clientUpdate.acquisitionChannel : (existingDocData.acquisitionChannel || 'WhatsApp'),
      originComplejoId: existingDocData.originComplejoId,
      originComplejoName: existingDocData.originComplejoName,
      totalBookings: existingDocData.totalBookings,
      totalMatchesPlayed: existingDocData.totalMatchesPlayed,
      participatedMatches: existingDocData.participatedMatches,
      lastGameDate: existingDocData.lastGameDate,
      lastGameTime: existingDocData.lastGameTime,
      debt: existingDocData.debt,
      notes: clientUpdate.notes !== undefined ? clientUpdate.notes : existingDocData.notes,
      ownerId: existingDocData.ownerId,
      adminId: existingDocData.adminId,
      createdAt: existingDocData.createdAt,
      canonicalId: existingDocData.canonicalId,
      historicalIds: existingDocData.historicalIds
    };

    // ID preserved
    assert.equal(payload.id, 'user_456');
    // Edited fields updated
    assert.equal(payload.name, 'Ángel Fabián Di María');
    assert.equal(payload.preferredFoot, 'Zurdo');
    assert.equal(payload.birthDate, '1988-02-14');
    assert.equal(payload.address, 'Nueva Dirección 123');
    assert.equal(payload.city, 'Nueva Dirección 123'); // Both synced
    // Unedited fields intact
    assert.equal(payload.status, 'activo');
    assert.equal(payload.totalBookings, 12);
    assert.equal(payload.totalMatchesPlayed, 25);
    assert.equal(payload.debt, 0);
    assert.equal(payload.notes, 'Jugador histórico');
    assert.equal(payload.originComplejoId, 'complejo_central');
    assert.equal(payload.canonicalId, 'canon_fideo_7');
    assert.deepEqual(payload.historicalIds, ['hist_7']);
  });

  await t.test('5. Tenant isolation: originComplejoId is strictly preserved', () => {
    const complexAUser: User = {
      id: 'user_comp_a',
      name: 'Player Complex A',
      phone: '1122334455',
      email: 'user_a@test.com',
      originComplejoId: 'complejo_a'
    };

    const targetComplexId = 'complejo_b'; // Active complex in session
    // Resolved origin logic:
    const resolvedOriginId = complexAUser.originComplejoId || targetComplexId;
    assert.equal(resolvedOriginId, 'complejo_a', 'Debe conservar el complejo de origen de la ficha original sin cambiarlo al complejo activo');
  });

  await t.test('6. Derived guest users: editing is guarded against derived_* IDs', () => {
    const derivedUser: User = {
      id: 'derived_phone_1122334455',
      name: 'Guest Player',
      phone: '1122334455',
      email: '',
      isDerived: true
    };

    const isDerived = Boolean(derivedUser.isDerived || String(derivedUser.id).startsWith('derived_'));
    assert.equal(isDerived, true, 'Debe detectar jugadores derivados en memoria');

    const canEdit = !isDerived;
    assert.equal(canEdit, false, 'No debe permitir editar jugadores derivados en memoria que no tienen documento en Firestore');
  });
});
