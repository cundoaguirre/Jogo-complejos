import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  addDoc,
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query,
  where
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { User, Court, Match } from '../types';

export const COMPLEJOS_COLLECTION = 'complejos';
export const BOOKINGS_COLLECTION = 'bookings';
export const USERS_COLLECTION = 'users';
export const COLLABORATORS_COLLECTION = 'collaborators';

/**
 * Returns current complexId for scoping data to the active complex (default: 'B')
 */
export function getActiveComplexId(user?: any, customComplexId?: string): string {
  if (customComplexId && customComplexId !== 'complejo_central') {
    return customComplexId;
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('activeComplexId');
      if (saved && saved !== 'complejo_central') return saved;
    } catch (e) {}
  }
  if (user && user.uid) {
    return user.uid;
  }
  return 'B';
}

/**
 * Calculates duration in minutes between two "HH:mm" strings
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return 60;
  let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (diff <= 0) diff += 24 * 60; // Crosses midnight
  return diff;
}

/**
 * Normalizes a booking from Firestore into the Match structure required by UI
 */
export function formatBookingToMatch(b: any): Match {
  const startHour = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '18:00');
  const endHour = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '19:00');
  const dateStr = b.date || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[0] : new Date().toISOString().split('T')[0]);

  const price = Number(b.price ?? b.price_total ?? 0);
  const deposit = Number(b.deposit ?? b.amount_paid ?? 0);

  let payment_status = b.paymentStatus || b.payment_status || 'pending';
  if (payment_status === 'pagado') payment_status = 'paid';
  else if (payment_status === 'seña') payment_status = 'partial';
  else if (payment_status === 'pendiente') payment_status = 'pending';
  else if (deposit >= price && price > 0) payment_status = 'paid';
  else if (deposit > 0) payment_status = 'partial';

  return {
    id: b.id,
    court_id: b.courtId || b.court_id || (b.courtName ? b.courtName : '1'),
    courtId: b.courtId || b.court_id || (b.courtName ? b.courtName : '1'),
    complexId: b.complejoId || b.complexId || 'B',
    complejoId: b.complejoId || b.complexId || 'B',
    complejoName: b.complejoName || 'Colo loco',
    date: dateStr,
    startTime: startHour,
    endTime: endHour,
    start_time: `${dateStr}T${startHour.length === 5 ? `${startHour}:00` : startHour}`,
    end_time: `${dateStr}T${endHour.length === 5 ? `${endHour}:00` : endHour}`,
    durationMinutes: Number(b.durationMinutes) || calculateDurationMinutes(startHour, endHour),
    host_id: b.userId || b.userPhone || b.userName || '0',
    host_name: b.userName || b.clientName || 'Cliente',
    userName: b.userName || b.clientName || 'Cliente',
    host_phone: b.userPhone || b.clientPhone || '',
    userPhone: b.userPhone || b.clientPhone || '',
    userEmail: b.userEmail || b.clientEmail || '',
    court_name: b.courtName || b.court_name || 'Cancha',
    courtName: b.courtName || b.court_name || 'Cancha',
    price,
    price_total: price,
    deposit,
    amount_paid: deposit,
    payment_status,
    paymentStatus: payment_status,
    status: b.status === 'jugado' ? 'jugado' : (b.status === 'cancelado' ? 'cancelado' : (b.status || 'confirmado')),
    notes: b.notes || '',
    ownerId: b.ownerId || '',
    adminId: b.adminId || '',
    is_open: false,
    mode: b.mode || 'complete',
    max_players: b.max_players || 10,
    player_count: b.player_count || 1,
    players: b.players || []
  };
}

// =========================================================================
// 2.1. Colección Canónica: complejos & Manejo de Canchas (courts array)
// =========================================================================

export function mapWeeklyScheduleToHours(weeklySchedule: any): any[] {
  const days = [
    { label: 'Lunes', key: 'lunes' },
    { label: 'Martes', key: 'martes' },
    { label: 'Miércoles', key: 'miercoles' },
    { label: 'Jueves', key: 'jueves' },
    { label: 'Viernes', key: 'viernes' },
    { label: 'Sábado', key: 'sabado' },
    { label: 'Domingo', key: 'domingo' },
  ];

  if (!weeklySchedule || typeof weeklySchedule !== 'object') {
    return days.map(d => ({ day: d.label, open: true, start: '14:00', end: '00:00' }));
  }

  return days.map(d => {
    const dayConfig = weeklySchedule[d.key] || weeklySchedule[d.key.replace('é', 'e')] || {};
    return {
      day: d.label,
      open: !dayConfig.isClosed,
      start: dayConfig.open || '14:00',
      end: dayConfig.close || '00:00'
    };
  });
}

/**
 * Escucha las canchas del complejo activo leyendo EXCLUSIVAMENTE
 * desde el array courts del documento complejos/{activeComplejoId}
 */
export function subscribeToCourts(
  complexId: string, 
  onUpdate: (courts: Court[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
    const unsub = onSnapshot(compRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const courtsArray = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
        const mappedCourts: Court[] = courtsArray.map((c: any, idx: number) => ({
          id: c.id ? String(c.id) : `c_${idx + 1}`,
          name: c.name || `Cancha ${idx + 1}`,
          type: c.sport || c.type || 'fútbol 5',
          sport: c.sport || c.type || 'fútbol 5',
          surface: c.surface || 'sintético',
          price_per_hour: Number(c.price ?? c.price_per_hour ?? 0),
          price: Number(c.price ?? c.price_per_hour ?? 0),
          status: c.status === 'activa' || c.status === 'available' ? 'available' : (c.status || 'available'),
          is_roofed: Boolean(c.is_roofed),
          blockedCourts: c.blockedCourts || []
        }));
        onUpdate(mappedCourts);
      } else {
        onUpdate([]);
      }
    }, (err) => {
      console.warn('[Firestore] Error en snapshot de canchas en complejos:', err);
      onUpdate([]);
    });

    return () => unsub();
  } catch (e) {
    console.error('[Firestore] Error al suscribirse a canchas en complejos:', e);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Guarda o edita una Cancha actualizando el array courts en complejos/{activeComplejoId}
 */
export async function saveCourtInFirestore(
  complexId: string, 
  court: Partial<Court>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  const courtId = court.id ? String(court.id) : `c_${Date.now()}`;

  const cSnap = await getDoc(compRef);
  let existingCourts: any[] = [];
  if (cSnap.exists()) {
    const data = cSnap.data();
    if (Array.isArray(data.courts)) {
      existingCourts = [...data.courts];
    } else if (Array.isArray(data.canchas)) {
      existingCourts = [...data.canchas];
    }
  }

  const courtItem = {
    id: courtId,
    name: (court.name || 'Cancha').trim(),
    sport: court.sport || court.type || 'fútbol 5',
    surface: court.surface || 'sintético',
    price: Number(court.price ?? court.price_per_hour ?? 0),
    status: court.status === 'maintenance' ? 'mantenimiento' : (court.status === 'inactiva' ? 'inactiva' : 'activa'),
    is_roofed: Boolean(court.is_roofed),
    blockedCourts: (court as any).blockedCourts || []
  };

  const idx = existingCourts.findIndex(c => String(c.id) === String(courtId));
  if (idx >= 0) {
    existingCourts[idx] = { ...existingCourts[idx], ...courtItem };
  } else {
    existingCourts.push(courtItem);
  }

  await setDoc(compRef, { 
    courts: existingCourts, 
    updatedAt: new Date().toISOString() 
  }, { merge: true });

  console.log('[Firestore] Cancha guardada en complejos/' + targetId + ' courts array:', courtId);
  return courtId;
}

/**
 * Elimina una Cancha del array courts en complejos/{activeComplejoId}
 */
export async function deleteCourtInFirestore(courtId: string | number, complexId?: string): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const strId = String(courtId);
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);

  const cSnap = await getDoc(compRef);
  if (cSnap.exists()) {
    const data = cSnap.data();
    let existingCourts = Array.isArray(data.courts) ? [...data.courts] : (Array.isArray(data.canchas) ? [...data.canchas] : []);
    existingCourts = existingCourts.filter(c => String(c.id) !== strId);
    await setDoc(compRef, { 
      courts: existingCourts, 
      updatedAt: new Date().toISOString() 
    }, { merge: true });
    console.log('[Firestore] Cancha removida de complejos/' + targetId + ' courts array:', strId);
  }
}

/**
 * Escucha el perfil de la sede deportiva en complejos/{activeComplejoId}
 */
export function subscribeToVenueProfile(
  complexId: string,
  onUpdate: (profile: any) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
    const unsub = onSnapshot(compRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const profile = {
          id: snap.id,
          name: data.name || data.company || 'Colo loco',
          company: data.company || data.name || 'Colo loco',
          phone: data.phone || '',
          address: data.address || '',
          instagram: data.instagram || '',
          description: data.description || data.notes || '',
          hours: Array.isArray(data.hours) ? data.hours : mapWeeklyScheduleToHours(data.weeklySchedule),
          services: data.services || ['Estacionamiento', 'Vestuarios', 'Buffet', 'Césped Sintético'],
          courts: data.courts || []
        };
        onUpdate(profile);
      }
    }, (err) => {
      console.warn('[Firestore] Error escuchando perfil en complejos:', err);
    });

    return () => unsub();
  } catch (e) {
    console.warn('[Firestore] Error subscribing to venue profile:', e);
    return () => {};
  }
}

/**
 * Guarda los datos del Complejo en complejos/{activeComplejoId}
 */
export async function saveVenueProfileInFirestore(
  complexId: string,
  profile: any
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  await setDoc(compRef, {
    name: profile.name || '',
    company: profile.name || profile.company || '',
    phone: profile.phone || '',
    address: profile.address || '',
    instagram: profile.instagram || '',
    description: profile.description || '',
    hours: Array.isArray(profile.hours) ? profile.hours : mapWeeklyScheduleToHours(profile.hours),
    services: profile.services || [],
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

// =========================================================================
// 2.2. Colección Canónica: bookings (Reservas con complejoId estricto)
// =========================================================================

/**
 * Escucha reservas filtrando por complejoId == activeComplejoId y opcionalmente por date == selectedDate
 */
export function subscribeToBookings(
  complexId: string, 
  onUpdate: (bookings: Match[]) => void,
  selectedDate?: string
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    const constraints: any[] = [where('complejoId', '==', targetId)];
    if (selectedDate) {
      constraints.push(where('date', '==', selectedDate));
    }

    const q = query(colRef, ...constraints);

    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => formatBookingToMatch({ id: d.id, ...d.data() }));
      onUpdate(list);
    }, (error) => {
      console.warn('[Firestore] Fallback en query de bookings:', error.message);
      // Fallback a sólo complejoId y filtro client-side de fecha
      const qFallback = query(colRef, where('complejoId', '==', targetId));
      return onSnapshot(qFallback, (snap) => {
        let list = snap.docs.map(d => formatBookingToMatch({ id: d.id, ...d.data() }));
        if (selectedDate) {
          list = list.filter(b => b.date === selectedDate || (b.startTime && String(b.startTime).startsWith(selectedDate)));
        }
        onUpdate(list);
      }, (err) => {
        console.error('[Firestore] Error crítico en bookings subscription fallback:', err);
        onUpdate([]);
      });
    });
  } catch (err) {
    console.error('[Firestore] Error subscribiendo a bookings:', err);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Crea una reserva en la colección canónica 'bookings' cumpliendo el contrato de esquema
 */
export async function createBookingInFirestore(data: {
  complejoId: string;
  complejoName?: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  price: number;
  deposit?: number;
  status?: string;
  paymentStatus?: string;
  userId?: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  notes?: string;
  ownerId?: string;
  adminId?: string;
  [key: string]: any;
}): Promise<string> {
  const colRef = collection(db, BOOKINGS_COLLECTION);
  const targetComplexId = (!data.complejoId || data.complejoId === 'complejo_central') ? 'B' : data.complejoId;
  
  const startTime = data.startTime || '18:00';
  const endTime = data.endTime || '19:00';
  const durationMinutes = Number(data.durationMinutes) || calculateDurationMinutes(startTime, endTime);
  const price = Number(data.price) || 0;
  const deposit = Number(data.deposit) || 0;
  
  const paymentStatus = data.paymentStatus 
    ? (data.paymentStatus === 'paid' ? 'pagado' : (data.paymentStatus === 'partial' ? 'seña' : data.paymentStatus))
    : (deposit >= price && price > 0 ? 'pagado' : (deposit > 0 ? 'seña' : 'pendiente'));

  const status = data.status === 'confirmed' ? 'confirmado' : (data.status === 'cancelled' ? 'cancelado' : (data.status || 'confirmado'));

  const payload = {
    complejoId: targetComplexId,
    complejoName: data.complejoName || 'Colo loco',
    courtName: data.courtName || 'Cancha 1',
    date: data.date,
    startTime,
    endTime,
    durationMinutes,
    price,
    deposit,
    status,
    paymentStatus,
    userId: data.userId ? String(data.userId) : '0',
    userName: (data.userName || data.clientName || 'Cliente').trim(),
    userPhone: (data.userPhone || data.clientPhone || '').trim(),
    userEmail: (data.userEmail || data.clientEmail || '').trim(),
    notes: data.notes || '',
    ownerId: auth.currentUser?.uid || data.ownerId || '',
    adminId: data.adminId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await addDoc(colRef, payload);
  console.log('[Firestore] Reserva creada exitosamente en bookings/', docRef.id);
  return docRef.id;
}

/**
 * Actualiza una reserva en la colección canónica 'bookings'
 */
export async function updateBookingInFirestore(
  bookingId: string | number, 
  patch: Record<string, any>
): Promise<void> {
  const docRef = doc(db, BOOKINGS_COLLECTION, String(bookingId));
  await updateDoc(docRef, {
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Elimina una reserva de la colección canónica 'bookings'
 */
export async function deleteBookingInFirestore(bookingId: string | number): Promise<void> {
  const docRef = doc(db, BOOKINGS_COLLECTION, String(bookingId));
  await deleteDoc(docRef);
}

// =========================================================================
// 2.3. Colección Canónica: users (Clientes y jugadores del complejo)
// =========================================================================

/**
 * Escucha clientes en la colección canónica 'users' filtrando por originComplejoId
 */
export function subscribeToClients(
  complexId: string, 
  onUpdate: (users: User[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    const colRef = collection(db, USERS_COLLECTION);
    const q = query(colRef, where('originComplejoId', '==', targetId));

    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as unknown as User));
      onUpdate(list);
    }, () => {
      // Fallback a leer toda la colección de users
      return onSnapshot(colRef, (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .filter(u => !targetId || u.originComplejoId === targetId || !u.originComplejoId);
        onUpdate(list as unknown as User[]);
      });
    });
  } catch (e) {
    console.error('[Firestore] Error subscribing to clients:', e);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Guarda o actualiza un cliente en la colección canónica 'users'
 */
export async function saveClientInFirestore(
  complexId: string, 
  client: Partial<User>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const clientId = client.id ? String(client.id) : `user_${Date.now()}`;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const payload = {
    id: clientId,
    name: (client.name || 'Cliente').trim(),
    phone: (client.phone || '').trim(),
    email: (client.email || '').trim(),
    gender: client.gender || '',
    city: client.city || client.address || '',
    category: client.category || 'jugador',
    status: client.status || 'activo',
    isActivated: client.isActivated ?? false,
    acquisitionChannel: client.acquisitionChannel || 'WhatsApp',
    acquisitionDate: client.acquisitionDate || client.created_at || dateStr,
    acquisitionTime: client.acquisitionTime || timeStr,
    activationDate: client.activationDate || null,
    activationTime: client.activationTime || null,
    originComplejoId: targetId,
    originComplejoName: client.originComplejoName || 'Colo loco',
    totalBookings: Number(client.totalBookings ?? 0),
    totalMatchesPlayed: Number(client.totalMatchesPlayed ?? client.matches_played ?? 0),
    participatedMatches: Number(client.participatedMatches ?? 0),
    lastGameDate: client.lastGameDate || '',
    lastGameTime: client.lastGameTime || '',
    notes: client.notes || '',
    ownerId: auth.currentUser?.uid || client.ownerId || '',
    adminId: client.adminId || '',
    createdAt: client.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, USERS_COLLECTION, clientId), payload, { merge: true });
  return clientId;
}

/**
 * Elimina un cliente de la colección canónica 'users'
 */
export async function deleteClientInFirestore(clientId: string | number): Promise<void> {
  const strId = String(clientId);
  await deleteDoc(doc(db, USERS_COLLECTION, strId));
}

// -------------------------------------------------------------
// Aliases para máxima compatibilidad con código existente
// -------------------------------------------------------------
export const syncTurnoToFirestore = (data: any, complexId?: string) => {
  const cId = complexId || getActiveComplexId();
  if (data.id && typeof data.id === 'string' && data.id.length > 5) {
    return updateBookingInFirestore(data.id, { ...data, complejoId: cId });
  }
  return createBookingInFirestore({ ...data, complejoId: cId });
};

export const updateTurnoStatusInFirestore = (id: string | number, status: string) => {
  return updateBookingInFirestore(id, { status });
};

export const syncCourtToFirestore = (court: Partial<Court>, complexId?: string) => {
  return saveCourtInFirestore(complexId || getActiveComplexId(), court);
};

export const deleteCourtFromFirestore = (courtId: string | number, complexId?: string) => {
  return deleteCourtInFirestore(courtId, complexId || getActiveComplexId());
};

export const syncUsuarioToFirestore = (user: Partial<User>, complexId?: string) => {
  return saveClientInFirestore(complexId || getActiveComplexId(), user);
};

export const deleteUsuarioFromFirestore = (userId: string | number) => {
  return deleteClientInFirestore(userId);
};

export const syncComplejoToFirestore = (profile: any, complexId?: string) => {
  return saveVenueProfileInFirestore(complexId || getActiveComplexId(), profile);
};

export const listenToFirestoreUsuarios = (cb: (users: User[]) => void, complexId?: string) => {
  return subscribeToClients(complexId || getActiveComplexId(), cb);
};

export const listenToFirestoreCourts = (cb: (courts: Court[]) => void, complexId?: string) => {
  return subscribeToCourts(complexId || getActiveComplexId(), cb);
};
