/**
 * CRM ACTIVITY INDEX & IDENTITY RESOLUTION MODULE
 * 
 * Reconstruye la identidad y actividad de clientes en el CRM unificando:
 * 1. Clientes registrados en Firestore (/users) asociados al complejo.
 * 2. Organizadores de reservas (host / userId).
 * 3. Jugadores participantes (b.players).
 * 4. Participantes derivados en memoria (sin cuenta en /users) identificados por teléfono o referencia.
 * 
 * Jerarquía estricta de identidad:
 * 1. UID exacto con usuario registrado.
 * 2. Teléfono normalizado completo con usuario registrado (Argentina sin prefijos 54/549/0).
 * 3. Nombres genéricos o placeholders ignorados.
 * 4. Los registros derivados se mantienen en memoria (isDerived: true) sin escribir documentos falsos en Firestore.
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

  // Si tiene formato de 11 dígitos con '15' (ej: 11 15 xxxx xxxx), remover el '15'
  if (digits.length === 11 && (digits.startsWith('1115') || digits.startsWith('15'))) {
    if (digits.startsWith('1115')) {
      digits = '11' + digits.slice(4);
    } else if (digits.startsWith('15')) {
      digits = digits.slice(2);
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

export interface ExtractedParticipant {
  rawId?: string;
  name?: string;
  rawPhone?: string;
  normPhone?: string;
  email?: string;
  isOrganizer: boolean;
}

/**
 * Extrae todos los participantes (organizador y jugadores en players) de una reserva
 */
export function extractBookingParticipants(booking: Match | any): ExtractedParticipant[] {
  if (!booking) return [];

  const participants: ExtractedParticipant[] = [];

  // 1. Organizador / Host de la reserva
  const orgRawId = booking.userId ?? booking.host_id ?? (booking as any).user_id;
  const orgCleanId = orgRawId !== undefined && orgRawId !== null ? String(orgRawId).trim() : '';
  const validOrgId = orgCleanId !== '' && orgCleanId !== '0' && orgCleanId !== 'anon' && orgCleanId !== 'null' && orgCleanId !== 'undefined'
    ? orgCleanId
    : undefined;

  const orgRawPhone = booking.userPhone ?? booking.clientPhone ?? booking.host_phone ?? (booking as any).phone;
  const orgNormPhone = normalizePhoneNumber(orgRawPhone);

  const orgRawName = booking.userName ?? booking.clientName ?? booking.host_name ?? '';
  const orgName = typeof orgRawName === 'string' && !isGenericPlaceholderName(orgRawName) ? orgRawName.trim() : undefined;

  const orgEmail = booking.userEmail ?? booking.clientEmail ?? (booking as any).email;

  // Si el organizador tiene alguna identificación válida, lo incorporamos
  if (validOrgId || orgNormPhone || orgName) {
    participants.push({
      rawId: validOrgId,
      name: orgName,
      rawPhone: orgRawPhone ? String(orgRawPhone).trim() : undefined,
      normPhone: orgNormPhone || undefined,
      email: typeof orgEmail === 'string' ? orgEmail.trim() : undefined,
      isOrganizer: true
    });
  }

  // 2. Jugadores adicionales en players
  const rawPlayers = Array.isArray(booking.players) ? booking.players : [];
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
      const pRawId = p.id ?? p.userId ?? p.uid ?? p.player_id ?? p.user_id;
      const pCleanId = pRawId !== undefined && pRawId !== null ? String(pRawId).trim() : '';
      const validPId = pCleanId !== '' && pCleanId !== '0' && pCleanId !== 'anon' && pCleanId !== 'null' && pCleanId !== 'undefined'
        ? pCleanId
        : undefined;

      const pRawPhone = p.phone ?? p.userPhone ?? p.clientPhone ?? p.user_phone;
      const pNormPhone = normalizePhoneNumber(pRawPhone);

      const pRawName = p.name ?? p.userName ?? p.clientName ?? p.player_name ?? '';
      const pName = typeof pRawName === 'string' && !isGenericPlaceholderName(pRawName) ? pRawName.trim() : undefined;

      const pEmail = p.email ?? p.userEmail;

      if (validPId || pNormPhone || pName) {
        // Verificar si es exactamente el mismo host/organizador ya registrado en esta reserva
        const isHost = validOrgId && validPId && validOrgId === validPId;
        participants.push({
          rawId: validPId,
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

export interface CrmActivityIndexResult {
  crmUsers: User[];
  userMetricsMap: Map<string, UserLifecycleMetrics>;
  associatedBookingsMap: Map<string, Match[]>;
  organizedBookingsMap: Map<string, Match[]>;
}

/**
 * Construye el índice de actividad unificado del CRM:
 * - Vincula cada reserva con sus organizadores y participantes.
 * - Deduplica rigurosamente según jerarquía: UID -> Teléfono normalizado.
 * - Crea clientes en memoria (isDerived: true) para participantes no registrados.
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

  // 1. Mapeo de usuarios registrados de Firestore
  const registeredById = new Map<string, User>();
  const registeredByPhone = new Map<string, User>();

  for (const u of registeredUsers) {
    if (!u) continue;
    const uId = String(u.id).trim();
    if (uId) {
      registeredById.set(uId, u);
    }
    const normPhone = normalizePhoneNumber(u.phone);
    if (normPhone) {
      registeredByPhone.set(normPhone, u);
    }
  }

  // 2. Contenedores de participantes derivados (en memoria)
  const derivedByPhone = new Map<string, User>();
  const derivedById = new Map<string, User>();
  const derivedByName = new Map<string, User>();

  // 3. Mapas de reservas asociadas y organizadas por ID de usuario
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

  // Función de resolución de usuario para un participante
  const resolveUserForParticipant = (p: ExtractedParticipant, bookingDate?: string): User => {
    // Prioridad 1: Coincidencia por UID con usuario registrado
    if (p.rawId && registeredById.has(p.rawId)) {
      return registeredById.get(p.rawId)!;
    }

    // Prioridad 2: Coincidencia por Teléfono normalizado con usuario registrado
    if (p.normPhone && registeredByPhone.has(p.normPhone)) {
      return registeredByPhone.get(p.normPhone)!;
    }

    // Si no está registrado en Firestore, buscar o crear en derivados en memoria:
    // a) Por teléfono normalizado
    if (p.normPhone) {
      if (derivedByPhone.has(p.normPhone)) {
        const existing = derivedByPhone.get(p.normPhone)!;
        // Enriquecer nombre o email si no los tenía
        if ((!existing.name || existing.name === 'Jugador' || existing.name.startsWith('Cliente')) && p.name) {
          existing.name = p.name;
        }
        if (!existing.email && p.email) {
          existing.email = p.email;
        }
        return existing;
      }

      const derivedUser: User = {
        id: `derived_phone_${p.normPhone}`,
        name: p.name || `Cliente (${p.rawPhone || p.normPhone})`,
        phone: p.rawPhone || p.normPhone,
        email: p.email || `${p.normPhone}@sin-correo.com`,
        originComplejoId: normComplexId,
        acquisitionDate: bookingDate || systemDate.toISOString().split('T')[0],
        acquisitionChannel: 'reserva',
        isDerived: true,
        isActivated: true
      };
      derivedByPhone.set(p.normPhone, derivedUser);
      return derivedUser;
    }

    // b) Por UID (si tiene UID pero no existe en Firestore)
    if (p.rawId) {
      if (derivedById.has(p.rawId)) {
        const existing = derivedById.get(p.rawId)!;
        if (p.name && (!existing.name || existing.name === 'Jugador')) {
          existing.name = p.name;
        }
        return existing;
      }

      const derivedUser: User = {
        id: `derived_uid_${p.rawId}`,
        name: p.name || `Usuario ${p.rawId.slice(0, 6)}`,
        phone: p.rawPhone || '',
        email: p.email || `${p.rawId}@sin-correo.com`,
        originComplejoId: normComplexId,
        acquisitionDate: bookingDate || systemDate.toISOString().split('T')[0],
        acquisitionChannel: 'app',
        isDerived: true,
        isActivated: true
      };
      derivedById.set(p.rawId, derivedUser);
      return derivedUser;
    }

    // c) Por Nombre no ambiguo (si no hay teléfono ni UID)
    const nameKey = (p.name || '').trim().toLowerCase();
    if (nameKey && derivedByName.has(nameKey)) {
      return derivedByName.get(nameKey)!;
    }

    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
    const derivedUser: User = {
      id: `derived_name_${nameKey ? encodeURIComponent(nameKey) : uniqueSuffix}_${uniqueSuffix}`,
      name: p.name || 'Invitado sin nombre',
      phone: '',
      email: `${uniqueSuffix}@sin-correo.com`,
      originComplejoId: normComplexId,
      acquisitionDate: bookingDate || systemDate.toISOString().split('T')[0],
      acquisitionChannel: 'invitado',
      isDerived: true,
      isActivated: true
    };
    if (nameKey) {
      derivedByName.set(nameKey, derivedUser);
    }
    return derivedUser;
  };

  // 4. Procesar todas las reservas del complejo
  for (const booking of bookings) {
    if (!booking) continue;

    // Asegurar que la reserva corresponda al complejo (o sin complejo asignado)
    const bComplex = booking.complejoId || booking.complexId;
    if (bComplex && bComplex !== normComplexId && bComplex !== activeComplexId && activeComplexId !== 'complejo_central') {
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

  // 6. Precalcular métricas del ciclo de vida para cada usuario
  const userMetricsMap = new Map<string, UserLifecycleMetrics>();

  for (const user of crmUsers) {
    const uId = String(user.id);
    const associated = associatedBookingsMap.get(uId) || [];
    const organized = organizedBookingsMap.get(uId) || [];

    const metrics = calculateUserLifecycleMetrics(user, associated, systemDate, organized);
    userMetricsMap.set(uId, metrics);
  }

  return {
    crmUsers,
    userMetricsMap,
    associatedBookingsMap,
    organizedBookingsMap
  };
}
