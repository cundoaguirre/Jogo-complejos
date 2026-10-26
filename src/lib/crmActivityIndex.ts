/**
 * CRM ACTIVITY INDEX & IDENTITY RESOLUTION MODULE
 * 
 * Reconstruye la identidad y actividad de clientes en el CRM y Agenda unificando:
 * 1. Clientes registrados en Firestore (/users) asociados al complejo (con prioridad de ficha local).
 * 2. Organizadores de reservas (host / userId).
 * 3. Jugadores participantes (b.players).
 * 4. Participantes derivados en memoria (sin cuenta en /users) identificados por teléfono o referencia.
 * 
 * Reglas de Prioridad e Identidad:
 * - La ficha local del complejo tiene prioridad para mostrar el nombre: si el complejo registró localmente
 *   al jugador con un nombre (ej. "Arrogue" o "Pepe") y entra una reserva desde el ERP con el mismo teléfono
 *   bajo otro nombre (ej. "Demichelis" o "Juan"), el complejo conserva su nombre local y le suma la actividad.
 * - Deduplicación estricta por UID y Teléfono normalizado (Argentina sin prefijos 54/549/0).
 * - No fusiones por nombre solamente.
 * - Los registros derivados se mantienen en memoria (isDerived: true) sin escribir documentos falsos en Firestore.
 */

import { User, Match } from '../types';
import { calculateUserLifecycleMetrics, UserLifecycleMetrics, RawBooking } from './userMetrics';

/**
 * Normaliza un número telefónico argentino eliminando formato y prefijos redundantes:
 * - Extrae solo dígitos.
 * - Elimina prefijo internacional '549' (si longitud >= 12) o '54' (si longitud >= 11).
 * - Elimina ceros a la izquierda (códigos de área con 0, ej: 011 -> 11).
 * - Si tras normalizar tiene 10 dígitos o al menos 7 dígitos válidos, retorna el número limpio.
 * - Si tiene menos de 7 dígitos, se considera insuficiente para matching unívoco.
 */
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // Quitar 549 (móvil internacional Argentina)
  if (digits.startsWith('549') && digits.length >= 12) {
    digits = digits.slice(3);
  } else if (digits.startsWith('54') && digits.length >= 11) {
    // Quitar 54
    digits = digits.slice(2);
  }

  // Quitar ceros iniciales (prefijo de discado interurbano en Argentina)
  while (digits.startsWith('0') && digits.length > 6) {
    digits = digits.slice(1);
  }

  // Si tiene formato con prefijo '15' de móvil en Argentina (ej: 11 15 xxxx xxxx, 351 15 xxx xxxx, 2966 15 xx xxxx)
  // El número móvil argentino estándar tiene exactamente 10 dígitos (código de área + número sin 15)
  if (digits.length === 11) {
    if (digits.startsWith('1115')) {
      digits = '11' + digits.slice(4);
    } else if (digits.startsWith('15')) {
      digits = digits.slice(2);
    }
  } else if (digits.length === 12) {
    // Código de área de 3 dígitos (ej: 351, 223, 261, 341) seguido de 15
    if (digits.slice(3, 5) === '15') {
      digits = digits.slice(0, 3) + digits.slice(5);
    } else if (digits.slice(2, 4) === '15') {
      digits = digits.slice(0, 2) + digits.slice(4);
    } else if (digits.slice(4, 6) === '15') {
      // Código de área de 4 dígitos (ej: 2966, 3874) seguido de 15
      digits = digits.slice(0, 4) + digits.slice(6);
    }
  }

  // Para considerarse un teléfono unívoco debe tener al menos 7 dígitos
  if (digits.length < 7) {
    return '';
  }

  return digits;
}

/**
 * Nombres y textos de comodín/placeholder que no representan una identidad real
 */
const GENERIC_PLACEHOLDERS = new Set([
  'nn',
  'n/n',
  'n.n.',
  'cliente',
  'cliente nuevo',
  'anonimo',
  'anónimo',
  'cupo disponible',
  'disponible',
  'cupo libre',
  '?',
  '-',
  '--',
  'sin nombre',
  'desconocido',
  'vacio',
  'vacío',
  'reservado',
  'libre',
  'cancha',
  'turno',
  'sin asignar',
  'participante',
  'jugador',
  'invitado',
  'por confirmar'
]);

/**
 * Valida si un nombre es un comodín o genérico sin valor identificatorio
 */
export function isGenericPlaceholderName(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const clean = name.trim().toLowerCase();
  if (clean.length < 2) return true;
  if (GENERIC_PLACEHOLDERS.has(clean)) return true;

  // Si contiene solo símbolos o dígitos repetidos
  if (/^[\d\W_]+$/.test(clean)) return true;

  return false;
}

/**
 * Valida si dos IDs de complejo representan el mismo complejo (incluyendo alias canónicos 'B' <-> 'complejo_central')
 */
export function isSameComplex(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const normA = (idA === 'complejo_central' || idA === 'B') ? 'B' : idA;
  const normB = (idB === 'complejo_central' || idB === 'B') ? 'B' : idB;
  return normA === normB;
}

export interface ExtractedParticipant {
  rawId?: string;
  canonicalId?: string;
  canonicalName?: string;
  historicalId?: string;
  historicalIds?: string[];
  name?: string;
  rawPhone?: string;
  normPhone?: string;
  email?: string;
  isOrganizer: boolean;
}

/**
 * Extrae todos los participantes (organizador y jugadores en players) de una reserva.
 * Soporta de manera exhaustiva los esquemas de reserva de SaaS y ERP.
 */
export function extractBookingParticipants(booking: Match | any): ExtractedParticipant[] {
  if (!booking) return [];

  const participants: ExtractedParticipant[] = [];

  // 1. Organizador / Host de la reserva (compatible con ERP y SaaS)
  const orgRawId = booking.userId ?? booking.host_id ?? booking.user_id ?? booking.hostId ?? booking.clientId ?? booking.client_id;
  const orgCleanId = orgRawId !== undefined && orgRawId !== null ? String(orgRawId).trim() : '';
  const validOrgId = orgCleanId !== '' && orgCleanId !== '0' && orgCleanId !== 'anon' && orgCleanId !== 'null' && orgCleanId !== 'undefined'
    ? orgCleanId
    : undefined;

  const orgCanon = booking.canonicalId ?? booking.canonicalUserId ?? booking.personId ?? booking.erpUserId ?? booking.canonicalPersonId ?? booking.erpPersonId;
  const orgCleanCanon = orgCanon !== undefined && orgCanon !== null ? String(orgCanon).trim() : '';
  const validOrgCanon = orgCleanCanon !== '' && orgCleanCanon !== '0' && orgCleanCanon !== 'null' && orgCleanCanon !== 'undefined'
    ? orgCleanCanon
    : undefined;

  const orgCanonName = booking.canonicalName ? String(booking.canonicalName).trim() : undefined;

  const orgHist = booking.historicalId ?? booking.historicalUserId;
  const orgCleanHist = orgHist !== undefined && orgHist !== null ? String(orgHist).trim() : '';

  let orgHistList: string[] = [];
  if (Array.isArray(booking.historicalIds)) {
    orgHistList = booking.historicalIds.map((h: any) => String(h).trim()).filter(Boolean);
  }
  if (orgCleanHist && !orgHistList.includes(orgCleanHist)) {
    orgHistList.push(orgCleanHist);
  }

  const orgRawPhone = booking.userPhone ?? booking.clientPhone ?? booking.host_phone ?? booking.phone ?? booking.user_phone ?? booking.client_phone ?? booking.hostPhone ?? booking.contactPhone ?? booking.telephone ?? booking.canonicalPhone;
  const orgNormPhone = normalizePhoneNumber(orgRawPhone);

  const orgRawName = booking.userName ?? booking.clientName ?? booking.host_name ?? booking.user_name ?? booking.client_name ?? booking.hostName ?? booking.customerName ?? booking.responsibleName ?? booking.name ?? '';
  const orgName = typeof orgRawName === 'string' && !isGenericPlaceholderName(orgRawName) ? orgRawName.trim() : undefined;

  const orgEmail = booking.userEmail ?? booking.clientEmail ?? booking.email ?? booking.user_email ?? booking.canonicalEmail;

  // Si el organizador tiene alguna identificación válida, lo incorporamos
  if (validOrgId || validOrgCanon || orgNormPhone || orgName) {
    participants.push({
      rawId: validOrgId,
      canonicalId: validOrgCanon,
      canonicalName: orgCanonName,
      historicalId: orgCleanHist || undefined,
      historicalIds: orgHistList.length > 0 ? orgHistList : undefined,
      name: orgName,
      rawPhone: orgRawPhone ? String(orgRawPhone).trim() : undefined,
      normPhone: orgNormPhone || undefined,
      email: typeof orgEmail === 'string' ? orgEmail.trim() : undefined,
      isOrganizer: true
    });
  }

  // 2. Jugadores adicionales en players (array u objeto)
  let rawPlayers: any[] = [];
  if (Array.isArray(booking.players)) {
    rawPlayers = booking.players;
  } else if (booking.players && typeof booking.players === 'object') {
    rawPlayers = Object.values(booking.players);
  }

  for (let idx = 0; idx < rawPlayers.length; idx++) {
    const p = rawPlayers[idx];
    if (!p) continue;

    // Si es un string directo (ej. nombre o teléfono)
    if (typeof p === 'string' || typeof p === 'number') {
      const strVal = String(p).trim();
      if (!strVal || isGenericPlaceholderName(strVal)) continue;

      const asNormPhone = normalizePhoneNumber(strVal);
      if (asNormPhone) {
        participants.push({
          rawPhone: strVal,
          normPhone: asNormPhone,
          isOrganizer: false
        });
      } else {
        participants.push({
          name: strVal,
          isOrganizer: false
        });
      }
      continue;
    }

    // Si es un objeto de jugador
    if (typeof p === 'object') {
      const pRawId = p.id ?? p.userId ?? p.uid ?? p.player_id ?? p.user_id ?? p.playerId ?? p.clientId ?? p.client_id;
      const pCleanId = pRawId !== undefined && pRawId !== null ? String(pRawId).trim() : '';
      const validPId = pCleanId !== '' && pCleanId !== '0' && pCleanId !== 'anon' && pCleanId !== 'null' && pCleanId !== 'undefined'
        ? pCleanId
        : undefined;

      const pCanon = p.canonicalId ?? p.canonicalUserId ?? p.personId ?? p.erpUserId;
      const pCleanCanon = pCanon !== undefined && pCanon !== null ? String(pCanon).trim() : '';
      const validPCanon = pCleanCanon !== '' && pCleanCanon !== '0' && pCleanCanon !== 'null'
        ? pCleanCanon
        : undefined;

      const pCanonName = p.canonicalName ? String(p.canonicalName).trim() : undefined;

      let pHistoricalIds: string[] = [];
      if (Array.isArray(p.historicalIds)) {
        pHistoricalIds = p.historicalIds.map((h: any) => String(h).trim()).filter(Boolean);
      }
      if (p.historicalId && !pHistoricalIds.includes(String(p.historicalId).trim())) {
        pHistoricalIds.push(String(p.historicalId).trim());
      }

      const pRawPhone = p.phone ?? p.userPhone ?? p.clientPhone ?? p.user_phone ?? p.client_phone ?? p.playerPhone ?? p.player_phone ?? p.telephone ?? p.contactPhone;
      const pNormPhone = normalizePhoneNumber(pRawPhone);

      const pRawName = p.name ?? p.userName ?? p.clientName ?? p.player_name ?? p.user_name ?? p.client_name ?? p.playerName ?? '';
      const pName = typeof pRawName === 'string' && !isGenericPlaceholderName(pRawName) ? pRawName.trim() : undefined;

      const pEmail = p.email ?? p.userEmail ?? p.user_email ?? p.clientEmail;

      if (validPId || validPCanon || pNormPhone || pName) {
        // Verificar si es exactamente el mismo host/organizador ya registrado en esta reserva
        const isHost = (validOrgId && validPId && validOrgId === validPId) ||
                       (validOrgCanon && validPCanon && validOrgCanon === validPCanon) ||
                       (orgNormPhone && pNormPhone && orgNormPhone === pNormPhone);
        participants.push({
          rawId: validPId,
          canonicalId: validPCanon,
          canonicalName: pCanonName,
          historicalId: p.historicalId ? String(p.historicalId).trim() : undefined,
          historicalIds: pHistoricalIds.length > 0 ? pHistoricalIds : undefined,
          name: pName,
          rawPhone: pRawPhone ? String(pRawPhone).trim() : undefined,
          normPhone: pNormPhone || undefined,
          email: typeof pEmail === 'string' ? pEmail.trim() : undefined,
          isOrganizer: Boolean(isHost)
        });
      }
    }
  }

  return participants;
}

/**
 * Resuelve la correspondencia inequívoca entre los identificadores de un participante/reserva
 * y las fichas de usuarios locales del complejo.
 * 
 * Jerarquía de resolución:
 * 1. UID local del complejo (/users).
 * 2. Identidad canónica del ERP (canonicalId / canonicalUserId / personId / erpUserId).
 * 3. Registros históricos asociados (historicalIds / legacyUserIds).
 * 4. Teléfono normalizado inequívoco (7+ dígitos sin prefijos).
 * 5. Email verificado (distinto a placeholders).
 */
export function findMatchingLocalUser(
  users?: User[] | null,
  criteria?: {
    id?: string | number | null;
    canonicalId?: string | null;
    canonicalUserId?: string | null;
    historicalId?: string | null;
    historicalIds?: string[] | null;
    phone?: string | null;
    email?: string | null;
  },
  complexId?: string | null
): User | null {
  if (!users || users.length === 0 || !criteria) return null;

  // Filtrar candidatos si complexId está especificado: nunca asociar usuarios con originComplejoId de otro complejo
  const candidateUsers = complexId
    ? users.filter(u => {
        const uOrigin = u.originComplejoId || (u as any).originComplexId || (u as any).complejoId || (u as any).complexId;
        if (!uOrigin) return true;
        return isSameComplex(uOrigin, complexId);
      })
    : users;

  if (candidateUsers.length === 0) return null;

  const rawId = criteria.id !== undefined && criteria.id !== null ? String(criteria.id).trim() : '';
  const validId = rawId !== '' && rawId !== '0' && rawId !== 'anon' && rawId !== 'null' && rawId !== 'undefined' ? rawId : '';

  const rawCanon = criteria.canonicalId || criteria.canonicalUserId || '';
  const validCanon = rawCanon ? String(rawCanon).trim() : '';

  const rawHist = criteria.historicalId ? String(criteria.historicalId).trim() : '';
  const histList = (Array.isArray(criteria.historicalIds) ? criteria.historicalIds : [])
    .map(h => String(h).trim())
    .filter(Boolean);
  if (rawHist && !histList.includes(rawHist)) histList.push(rawHist);

  const normPhone = normalizePhoneNumber(criteria.phone);

  const cleanEmail = criteria.email ? criteria.email.trim().toLowerCase() : '';
  const validEmail = cleanEmail && !cleanEmail.includes('@sin-correo.com') && cleanEmail.includes('@') ? cleanEmail : '';

  // 1. Coincidencia por ID local exacto
  if (validId) {
    const byId = candidateUsers.find(u => String(u.id).trim() === validId);
    if (byId) return byId;
  }

  // 2. Coincidencia por Identidad Canónica del ERP
  if (validCanon) {
    const byCanon = candidateUsers.find(u => {
      const uCanon = u.canonicalId || u.canonicalUserId || (u as any).personId || (u as any).erpUserId;
      if (uCanon && String(uCanon).trim() === validCanon) return true;
      if (String(u.id).trim() === validCanon) return true;
      return false;
    });
    if (byCanon) return byCanon;
  }

  // Si el ID del criterio coincide con el canonicalId de un usuario local
  if (validId) {
    const byIdAsCanon = candidateUsers.find(u => {
      const uCanon = u.canonicalId || u.canonicalUserId || (u as any).personId || (u as any).erpUserId;
      return Boolean(uCanon && String(uCanon).trim() === validId);
    });
    if (byIdAsCanon) return byIdAsCanon;
  }

  // 3. Coincidencia por Registros Históricos (historicalIds / legacyUserIds)
  if (validId) {
    const byHistId = candidateUsers.find(u => {
      const uHists = Array.isArray(u.historicalIds) ? u.historicalIds : ((u as any).historicalId ? [String((u as any).historicalId)] : []);
      const uLegacy = Array.isArray((u as any).legacyUserIds) ? (u as any).legacyUserIds : [];
      return uHists.some((h: any) => String(h).trim() === validId) || uLegacy.some((h: any) => String(h).trim() === validId);
    });
    if (byHistId) return byHistId;
  }

  if (histList.length > 0) {
    const byHistList = candidateUsers.find(u => {
      const uIdStr = String(u.id).trim();
      if (histList.includes(uIdStr)) return true;
      const uHists = Array.isArray(u.historicalIds) ? u.historicalIds : ((u as any).historicalId ? [String((u as any).historicalId)] : []);
      return uHists.some((h: any) => histList.includes(String(h).trim()));
    });
    if (byHistList) return byHistList;
  }

  // 4. Coincidencia por Teléfono normalizado inequívoco (Argentina 7+ dígitos)
  if (normPhone) {
    const byPhone = candidateUsers.find(u => {
      const uPhone = u.phone || (u as any).userPhone || (u as any).clientPhone;
      return normalizePhoneNumber(uPhone) === normPhone;
    });
    if (byPhone) return byPhone;
  }

  // 5. Coincidencia por Email unívoco
  if (validEmail) {
    const byEmail = candidateUsers.find(u => {
      const uMail = (u.email || '').trim().toLowerCase();
      return uMail && !uMail.includes('@sin-correo.com') && uMail === validEmail;
    });
    if (byEmail) return byEmail;
  }

  return null;
}

export interface CrmActivityIndexResult {
  crmUsers: User[];
  userMetricsMap: Map<string, UserLifecycleMetrics>;
  associatedBookingsMap: Map<string, Match[]>;
  organizedBookingsMap: Map<string, Match[]>;
}

/**
 * Construye el índice de actividad unificado del CRM:
 * - Vincula cada reserva con sus organizadores y participantes.
 * - Deduplica rigurosamente según jerarquía: UID -> Identidad Canónica ERP -> Teléfono normalizado.
 * - La ficha local del complejo TIENE PRIORIDAD: si el complejo registró localmente
 *   a un cliente con un nombre (ej. "Arrogue" o "Federico Gutiérrez") y una reserva de ERP entra con otro nombre
 *   (ej. "Demichelis" o "Pájaro Gutiérrez"), el complejo conserva su nombre local y acumula la actividad.
 * - Nunca sobrescribe el nombre local con el nombre canónico del ERP ni propaga cambios a otros complejos.
 * - Crea clientes en memoria (isDerived: true) exclusivamente para participantes no registrados en el complejo.
 * - Calcula las métricas del ciclo de vida respetando:
 *   - 'reservas': estrictamente organizadas por el usuario.
 *   - 'juegos': partidos efectivamente jugados/completados (como organizador o invitado).
 */
export function buildCrmActivityIndex(
  registeredUsers: User[],
  bookings: Match[],
  activeComplexId: string = 'complejo_central',
  systemDate: Date = new Date()
): CrmActivityIndexResult {
  const normComplexId = (!activeComplexId || activeComplexId === 'complejo_central') ? 'B' : activeComplexId;

  // 1. Contenedores de participantes derivados (en memoria) para participantes sin ficha local
  const derivedByCanon = new Map<string, User>();
  const derivedByPhone = new Map<string, User>();
  const derivedById = new Map<string, User>();
  const derivedByName = new Map<string, User>();

  // 2. Mapas de reservas asociadas y organizadas por ID de usuario
  const associatedBookingsMap = new Map<string, Match[]>();
  const organizedBookingsMap = new Map<string, Match[]>();
  const userBookingsSeen = new Map<string, Set<string>>();

  const addBookingToUser = (resolvedUser: User, booking: Match, isOrganizer: boolean) => {
    const uId = String(resolvedUser.id);
    const bId = String(booking.id || `${booking.date}_${booking.startTime || booking.start_time}_${booking.courtId || booking.court_id}`);

    if (!userBookingsSeen.has(uId)) {
      userBookingsSeen.set(uId, new Set<string>());
    }
    const seen = userBookingsSeen.get(uId)!;

    if (!associatedBookingsMap.has(uId)) {
      associatedBookingsMap.set(uId, []);
    }
    if (!organizedBookingsMap.has(uId)) {
      organizedBookingsMap.set(uId, []);
    }

    if (!seen.has(bId)) {
      seen.add(bId);
      associatedBookingsMap.get(uId)!.push(booking);
    }

    if (isOrganizer) {
      const orgList = organizedBookingsMap.get(uId)!;
      const alreadyInOrg = orgList.some(b => String(b.id || `${b.date}_${b.startTime}_${b.courtId}`) === bId);
      if (!alreadyInOrg) {
        orgList.push(booking);
      }
    }
  };

  // Función de resolución de usuario para un participante respetando la prioridad de la ficha local
  const resolveUserForParticipant = (p: ExtractedParticipant, bookingDate?: string): User => {
    // 1. Buscar correspondencia inequívoca con las fichas locales registradas en este complejo
    const localMatch = findMatchingLocalUser(registeredUsers, {
      id: p.rawId,
      canonicalId: p.canonicalId,
      canonicalUserId: p.canonicalId,
      historicalId: p.historicalId,
      historicalIds: p.historicalIds,
      phone: p.rawPhone || p.normPhone,
      email: p.email
    }, normComplexId);

    if (localMatch) {
      // Prioridad de ficha local: NUNCA sobrescribir el nombre local del complejo
      // con el nombre canónico del ERP ni con otro nombre histórico.
      // Solo si el nombre local es un placeholder genérico (NN, Cliente, etc.), se enriquece.
      if (isGenericPlaceholderName(localMatch.name) && p.name && !isGenericPlaceholderName(p.name)) {
        localMatch.name = p.name;
      }
      // Vincular metadatos canónicos en memoria si aún no los tenía (sin alterar su nombre local)
      if (!localMatch.canonicalId && p.canonicalId) {
        localMatch.canonicalId = p.canonicalId;
      }
      if (!localMatch.canonicalUserId && p.canonicalId) {
        localMatch.canonicalUserId = p.canonicalId;
      }
      if (!(localMatch as any).canonicalName && p.canonicalName) {
        (localMatch as any).canonicalName = p.canonicalName;
      }
      if (p.normPhone && (!localMatch.phone || isGenericPlaceholderName(localMatch.phone))) {
        localMatch.phone = p.rawPhone || p.normPhone;
      }
      if (p.email && (!localMatch.email || localMatch.email.includes('@sin-correo.com'))) {
        localMatch.email = p.email;
      }
      return localMatch;
    }

    // 2. Si no existe ficha local, buscar si ya existe un derivado en memoria para esta misma identidad:
    // a) Por Identidad Canónica del ERP
    if (p.canonicalId && derivedByCanon.has(p.canonicalId)) {
      const existing = derivedByCanon.get(p.canonicalId)!;
      if (isGenericPlaceholderName(existing.name) && p.name && !isGenericPlaceholderName(p.name)) {
        existing.name = p.name;
      }
      return existing;
    }

    // b) Por Teléfono normalizado
    if (p.normPhone && derivedByPhone.has(p.normPhone)) {
      const existing = derivedByPhone.get(p.normPhone)!;
      if (isGenericPlaceholderName(existing.name) && p.name && !isGenericPlaceholderName(p.name)) {
        existing.name = p.name;
      }
      if (!existing.email && p.email) existing.email = p.email;
      if (!existing.canonicalId && p.canonicalId) existing.canonicalId = p.canonicalId;
      return existing;
    }

    // c) Por UID
    if (p.rawId && derivedById.has(p.rawId)) {
      const existing = derivedById.get(p.rawId)!;
      if (isGenericPlaceholderName(existing.name) && p.name && !isGenericPlaceholderName(p.name)) {
        existing.name = p.name;
      }
      if (!existing.canonicalId && p.canonicalId) existing.canonicalId = p.canonicalId;
      return existing;
    }

    // d) Por Nombre no ambiguo (si no hay teléfono ni UID ni canonicalId)
    const nameKey = (p.name || '').trim().toLowerCase();
    if (!p.canonicalId && !p.normPhone && !p.rawId && nameKey && derivedByName.has(nameKey)) {
      return derivedByName.get(nameKey)!;
    }

    // 3. Crear nueva representación del jugador utilizando la identidad recibida del ERP
    const assignedId = p.canonicalId
      ? `derived_canon_${p.canonicalId}`
      : (p.normPhone ? `derived_phone_${p.normPhone}` : (p.rawId ? `derived_uid_${p.rawId}` : `derived_player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`));

    const effectiveName = (p.name && !isGenericPlaceholderName(p.name))
      ? p.name
      : (p.canonicalName && !isGenericPlaceholderName(p.canonicalName)
          ? p.canonicalName
          : (p.rawPhone ? `Cliente (${p.rawPhone})` : 'Invitado'));

    const derivedUser: User = {
      id: assignedId,
      name: effectiveName,
      phone: p.rawPhone || p.normPhone || '',
      email: p.email || (p.normPhone ? `${p.normPhone}@sin-correo.com` : ''),
      canonicalId: p.canonicalId,
      canonicalUserId: p.canonicalId,
      canonicalName: p.canonicalName,
      historicalIds: p.historicalIds,
      originComplejoId: normComplexId,
      acquisitionDate: bookingDate || systemDate.toISOString().split('T')[0],
      acquisitionChannel: 'reserva',
      isDerived: true,
      isActivated: true
    };

    if (p.canonicalId) derivedByCanon.set(p.canonicalId, derivedUser);
    if (p.normPhone) derivedByPhone.set(p.normPhone, derivedUser);
    if (p.rawId) derivedById.set(p.rawId, derivedUser);
    if (nameKey) derivedByName.set(nameKey, derivedUser);

    return derivedUser;
  };

  // 4. Procesar todas las reservas del complejo (respetando separación multi-tenant y alias canónicos)
  for (const booking of bookings) {
    if (!booking) continue;

    // Asegurar que la reserva corresponda al complejo activo
    const bComplex = booking.complejoId || booking.complexId;
    if (bComplex && activeComplexId && !isSameComplex(bComplex, activeComplexId)) {
      continue;
    }

    const bookingDate = booking.date || (booking.startTime ? String(booking.startTime).split('T')[0] : undefined);
    const participants = extractBookingParticipants(booking);

    for (const p of participants) {
      const resolvedUser = resolveUserForParticipant(p, bookingDate);
      addBookingToUser(resolvedUser, booking, p.isOrganizer);
    }
  }

  // 5. Lista consolidada de clientes (Registrados + Derivados únicos)
  const allDerivedUsers = [
    ...Array.from(derivedByCanon.values()),
    ...Array.from(derivedByPhone.values()),
    ...Array.from(derivedById.values()),
    ...Array.from(derivedByName.values())
  ];

  // Deduplicar derivados por su id asignado
  const uniqueDerivedMap = new Map<string, User>();
  for (const d of allDerivedUsers) {
    uniqueDerivedMap.set(String(d.id), d);
  }

  const crmUsers: User[] = [
    ...registeredUsers,
    ...Array.from(uniqueDerivedMap.values())
  ];

  // 6. Precalcular métricas del ciclo de vida y enriquecer cada ficha para búsquedas y modales
  const userMetricsMap = new Map<string, UserLifecycleMetrics>();

  for (const user of crmUsers) {
    const uId = String(user.id);
    const associated = associatedBookingsMap.get(uId) || [];
    const organized = organizedBookingsMap.get(uId) || [];

    const metrics = calculateUserLifecycleMetrics(user, associated, systemDate, organized);
    userMetricsMap.set(uId, metrics);

    // Enriquecer en memoria con estadísticas reales
    user.totalBookings = metrics.reservas;
    user.totalMatchesPlayed = metrics.juegos;
    user.participatedMatches = metrics.juegos;
    if (metrics.ultimoJuegoFormatted && metrics.ultimoJuegoFormatted !== '-') {
      user.lastGameDate = metrics.ultimoJuegoFormatted;
    }
    if (associated.length > 0 && !user.history) {
      user.history = associated.map(b => ({
        court_name: b.court_name || b.courtName || 'Cancha',
        start_time: b.startTime || b.start_time || ''
      }));
    }
  }

  return {
    crmUsers,
    userMetricsMap,
    associatedBookingsMap,
    organizedBookingsMap
  };
}
