import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  increment, 
  writeBatch,
  runTransaction 
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { User, Court, Match, Product, ProductCategory, InventoryMovement, POSTransaction, TransactionPayment, TransactionItem, SupportTicket } from '../types';

export const COMPLEJOS_COLLECTION = 'complejos';
export const BOOKINGS_COLLECTION = 'bookings';
export const USERS_COLLECTION = 'users';
export const COLLABORATORS_COLLECTION = 'collaborators';
export const PRODUCTS_COLLECTION = 'products';
export const TRANSACTIONS_COLLECTION = 'transactions';
export const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';
export const CATEGORIES_COLLECTION = 'categories';
export const BOOKING_LOCKS_COLLECTION = 'booking_locks';
export const SUPPORT_TICKETS_COLLECTION = 'support_tickets';

/**
 * Returns current complexId for scoping data to the active complex (no unauthorized fallbacks)
 */
export function getActiveComplexId(user?: any, customComplexId?: string): string {
  if (customComplexId && customComplexId !== 'complejo_central') {
    return customComplexId;
  }
  if (user && user.activeComplexId) {
    return user.activeComplexId;
  }
  return '';
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

export const defaultComplexHours = [
  { day: 'Lunes', open: true, start: '14:00', end: '00:00' },
  { day: 'Martes', open: true, start: '14:00', end: '00:00' },
  { day: 'Miércoles', open: true, start: '14:00', end: '00:00' },
  { day: 'Jueves', open: true, start: '14:00', end: '00:00' },
  { day: 'Viernes', open: true, start: '14:00', end: '00:00' },
  { day: 'Sábado', open: true, start: '14:00', end: '00:00' },
  { day: 'Domingo', open: true, start: '14:00', end: '00:00' }
];

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
          hours: Array.isArray(data.hours) ? data.hours : defaultComplexHours,
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
  const hoursToSave = Array.isArray(profile.hours) ? profile.hours : defaultComplexHours;
  await setDoc(compRef, {
    name: profile.name || '',
    company: profile.name || profile.company || '',
    phone: profile.phone || '',
    address: profile.address || '',
    instagram: profile.instagram || '',
    description: profile.description || '',
    hours: hoursToSave,
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
 * Sincroniza las métricas y estado del usuario en Firestore a partir de sus reservas reales
 */
export async function syncUserMetricsWithBookings(userId: string | number, userPhone?: string): Promise<void> {
  const uId = String(userId || '');
  if ((!uId || uId === '0') && !userPhone) return;

  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    let bookings: any[] = [];

    if (uId && uId !== '0') {
      const q = query(colRef, where('userId', '==', uId));
      const snap = await getDocs(q);
      bookings = snap.docs.map(d => d.data());
    }

    if (bookings.length === 0 && userPhone) {
      const qPhone = query(colRef, where('userPhone', '==', String(userPhone).trim()));
      const snapPhone = await getDocs(qPhone);
      bookings = snapPhone.docs.map(d => d.data());
    }

    const totalBookings = bookings.length;
    const validBookings = bookings.filter(b => {
      const st = String(b.status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'cancelado';
    });

    const totalPlayed = validBookings.filter(b => {
      const st = String(b.status || '').toLowerCase();
      return st === 'jugado' || st === 'confirmado' || st === 'completed';
    }).length;

    const dates = validBookings.map(b => b.date).filter(Boolean).sort();
    const firstDate = dates[0] || null;
    const lastDate = dates[dates.length - 1] || '';

    // Buscar doc de usuario por ID
    let targetDocRef = uId && uId !== '0' ? doc(db, USERS_COLLECTION, uId) : null;
    let uSnap = targetDocRef ? await getDoc(targetDocRef) : null;

    // Si no se encontró por ID pero hay userPhone, buscar por teléfono
    if ((!uSnap || !uSnap.exists()) && userPhone) {
      const usersCol = collection(db, USERS_COLLECTION);
      const qUser = query(usersCol, where('phone', '==', String(userPhone).trim()));
      const userSnap = await getDocs(qUser);
      if (!userSnap.empty) {
        targetDocRef = doc(db, USERS_COLLECTION, userSnap.docs[0].id);
        uSnap = userSnap.docs[0];
      }
    }

    if (targetDocRef && uSnap && uSnap.exists()) {
      const uData = uSnap.data();
      const existingActivationDate = uData.activationDate || null;
      const activationDate = existingActivationDate || firstDate;
      const lastGameDate = (!uData.lastGameDate || (lastDate && lastDate > uData.lastGameDate)) ? (lastDate || uData.lastGameDate || '') : uData.lastGameDate;

      await updateDoc(targetDocRef, {
        totalBookings,
        totalMatchesPlayed: totalPlayed,
        matches_played: totalPlayed,
        isActivated: Boolean(activationDate),
        activationDate,
        lastGameDate,
        updatedAt: new Date().toISOString()
      });
      console.log(`[Firestore] Métricas de ciclo de vida actualizadas para usuario ${uSnap.id}: ${totalBookings} reservas, ${totalPlayed} jugados`);
    }
  } catch (err) {
    console.warn('[Firestore] Error sincronizando métricas de usuario:', err);
  }
}

/**
 * Helper to convert "HH:mm" time string into minutes since 00:00 (handling 24h wraps)
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1] || '0', 10) || 0;
  return h * 60 + m;
}

/**
 * Mathematically evaluates if two half-open time intervals [startA, endA) and [startB, endB) overlap
 */
export function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  const normEndA = endA <= startA ? endA + 1440 : endA;
  const normEndB = endB <= startB ? endB + 1440 : endB;
  return Math.max(startA, startB) < Math.min(normEndA, normEndB);
}

/**
 * Identifies all courts that physically share space with targetCourtId
 * (e.g. 1 large court that can be split into 2 smaller courts)
 */
export async function getOverlappingCourtIds(complexId: string, targetCourtId: string): Promise<string[]> {
  try {
    const compRef = doc(db, COMPLEJOS_COLLECTION, complexId);
    const snap = await getDoc(compRef);
    if (!snap.exists()) return [String(targetCourtId)];
    const data = snap.data();
    const courtsList = Array.isArray(data.courts) ? data.courts : (Array.isArray(data.canchas) ? data.canchas : []);
    const targetStr = String(targetCourtId);
    const overlapping = new Set<string>([targetStr]);
    
    // Direct blocked courts
    const targetCourt = courtsList.find((c: any) => String(c.id) === targetStr);
    if (targetCourt && Array.isArray(targetCourt.blockedCourts)) {
      targetCourt.blockedCourts.forEach((id: any) => overlapping.add(String(id)));
    }
    
    // Reverse blocked courts
    courtsList.forEach((c: any) => {
      if (Array.isArray(c.blockedCourts) && c.blockedCourts.some((id: any) => String(id) === targetStr)) {
        overlapping.add(String(c.id));
      }
    });
    
    return Array.from(overlapping);
  } catch (e) {
    console.warn('[BookingLock] Error reading overlapping courts:', e);
    return [String(targetCourtId)];
  }
}

/**
 * Creates a booking atomically with guaranteed mutual exclusion.
 * Prevents double-booking even under concurrent writes by locking
 * a deterministic schedule lock document per court and date inside runTransaction.
 */
export async function createBookingInFirestore(data: {
  complejoId: string;
  complejoName?: string;
  courtName: string;
  courtId?: string | number;
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
  const targetComplexId = (!data.complejoId || data.complejoId === 'complejo_central') ? 'B' : data.complejoId;
  const resolvedCourtId = String(data.courtId || data.court_id || 'c_1');
  const resolvedCourtName = data.courtName || data.court_name || 'Cancha 1';
  const startTime = data.startTime || '18:00';
  const endTime = data.endTime || '19:00';
  const durationMinutes = Number(data.durationMinutes) || calculateDurationMinutes(startTime, endTime);
  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);
  const price = Number(data.price) || 0;
  const deposit = Number(data.deposit) || 0;
  
  const paymentStatus = data.paymentStatus 
    ? (data.paymentStatus === 'paid' ? 'pagado' : (data.paymentStatus === 'partial' ? 'seña' : data.paymentStatus))
    : (deposit >= price && price > 0 ? 'pagado' : (deposit > 0 ? 'seña' : 'pendiente'));

  const status = data.status === 'confirmed' ? 'confirmado' : (data.status === 'cancelled' ? 'cancelado' : (data.status || 'confirmado'));
  const resolvedUserId = String(data.userId || data.host_id || '0');
  const resolvedUserName = (data.userName || data.clientName || 'Cliente').trim();

  // Find all courts that physically share space with this court
  const affectedCourts = await getOverlappingCourtIds(targetComplexId, resolvedCourtId);

  // Pre-fetch any existing active bookings from canonical /bookings for this date to ensure 100% reconciliation
  // even if this is the very first booking or if an ERP booking was created directly
  let initialBookingsSeed: Record<string, any> = {};
  try {
    const qExisting = query(
      collection(db, BOOKINGS_COLLECTION),
      where('complejoId', '==', targetComplexId),
      where('date', '==', data.date)
    );
    const snapExisting = await getDocs(qExisting);
    snapExisting.docs.forEach(docSnap => {
      const b = docSnap.data();
      const st = String(b.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelled') return;
      const bCourtId = String(b.courtId || b.court_id || '');
      if (affectedCourts.includes(bCourtId)) {
        const bStart = b.startTime || (b.start_time && b.start_time.includes('T') ? b.start_time.split('T')[1].substring(0, 5) : '18:00');
        const bEnd = b.endTime || (b.end_time && b.end_time.includes('T') ? b.end_time.split('T')[1].substring(0, 5) : '19:00');
        initialBookingsSeed[docSnap.id] = {
          bookingId: docSnap.id,
          courtId: bCourtId,
          courtName: b.courtName || b.court_name || 'Cancha',
          startTime: bStart,
          endTime: bEnd,
          startMin: timeStringToMinutes(bStart),
          endMin: timeStringToMinutes(bEnd),
          userName: b.userName || b.clientName || 'Cliente',
          status: b.status || 'confirmado'
        };
      }
    });
  } catch (seedErr) {
    console.warn('[BookingLock] Notice pre-reading existing bookings:', seedErr);
  }

  // Pre-allocate new booking reference
  const newBookingRef = doc(collection(db, BOOKINGS_COLLECTION));
  const newBookingId = newBookingRef.id;

  const payload = {
    id: newBookingId,
    complejoId: targetComplexId,
    complexId: targetComplexId,
    complejoName: data.complejoName || 'Colo loco',
    courtId: resolvedCourtId,
    court_id: resolvedCourtId,
    courtName: resolvedCourtName,
    court_name: resolvedCourtName,
    date: data.date,
    startTime,
    endTime,
    durationMinutes,
    price,
    deposit,
    status,
    paymentStatus,
    userId: resolvedUserId,
    host_id: resolvedUserId,
    userName: resolvedUserName,
    clientName: resolvedUserName,
    host_name: resolvedUserName,
    userPhone: (data.userPhone || data.clientPhone || '').trim(),
    clientPhone: (data.userPhone || data.clientPhone || '').trim(),
    userEmail: (data.userEmail || data.clientEmail || '').trim(),
    clientEmail: (data.userEmail || data.clientEmail || '').trim(),
    notes: data.notes || '',
    ownerId: auth.currentUser?.uid || data.ownerId || '',
    adminId: data.adminId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // ATOMIC MUTUAL EXCLUSION LOCK TRANSACTION
  await runTransaction(db, async (transaction) => {
    // 1. Read deterministic lock documents for all affected courts
    const lockRefs = affectedCourts.map(cid => 
      doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${data.date}`)
    );
    
    const lockSnaps = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
    
    // 2. Aggregate active bookings from all locks + initial seed
    const activeMap: Record<string, any> = { ...initialBookingsSeed };
    
    lockSnaps.forEach(snap => {
      if (snap.exists()) {
        const lockData = snap.data();
        if (lockData.bookings && typeof lockData.bookings === 'object') {
          Object.entries(lockData.bookings).forEach(([bId, bData]: [string, any]) => {
            const st = String(bData.status || '').toLowerCase();
            if (st !== 'cancelado' && st !== 'cancelled') {
              activeMap[bId] = bData;
            } else {
              delete activeMap[bId];
            }
          });
        }
      }
    });

    // 3. Collision Detection against all active intervals
    for (const [existingId, existing] of Object.entries(activeMap)) {
      if (existingId === newBookingId) continue;
      const exStartMin = existing.startMin ?? timeStringToMinutes(existing.startTime);
      const exEndMin = existing.endMin ?? timeStringToMinutes(existing.endTime);
      
      if (intervalsOverlap(startMin, endMin, exStartMin, exEndMin)) {
        const cName = existing.courtName || resolvedCourtName;
        throw new Error(
          `Conflicto de turno: La cancha "${cName}" ya se encuentra reservada para la fecha ${data.date} entre las ${existing.startTime} y ${existing.endTime} hs (${existing.userName || 'Cliente'}).`
        );
      }
    }

    // 4. Register new booking in schedule lock for all affected courts
    const newLockEntry = {
      bookingId: newBookingId,
      courtId: resolvedCourtId,
      courtName: resolvedCourtName,
      startTime,
      endTime,
      startMin,
      endMin,
      userName: resolvedUserName,
      status: 'confirmado'
    };

    for (let i = 0; i < affectedCourts.length; i++) {
      const cid = affectedCourts[i];
      const snap = lockSnaps[i];
      const existingBookings = snap.exists() ? (snap.data().bookings || {}) : {};
      
      transaction.set(lockRefs[i], {
        complejoId: targetComplexId,
        courtId: cid,
        date: data.date,
        bookings: {
          ...existingBookings,
          [newBookingId]: newLockEntry
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 5. Write canonical booking document into /bookings
    transaction.set(newBookingRef, payload);
  });

  console.log('[Firestore] Reserva creada atómicamente sin colisiones en bookings/', newBookingId);
  
  if (payload.userId && payload.userId !== '0') {
    syncUserMetricsWithBookings(payload.userId, payload.userPhone);
  } else if (payload.userPhone) {
    syncUserMetricsWithBookings('', payload.userPhone);
  }

  return newBookingId;
}

/**
 * Actualiza una reserva en la colección canónica 'bookings'.
 * Si se modifica fecha, cancha, horario o estado, actualiza atómicamente
 * el candado de horarios para liberar o reasignar bloques sin colisiones.
 */
export async function updateBookingInFirestore(
  bookingId: string | number, 
  patch: Record<string, any>
): Promise<void> {
  const strBookingId = String(bookingId);
  const docRef = doc(db, BOOKINGS_COLLECTION, strBookingId);

  const isScheduleChange = Boolean(
    patch.date !== undefined || 
    patch.courtId !== undefined || 
    patch.court_id !== undefined || 
    patch.startTime !== undefined || 
    patch.endTime !== undefined || 
    patch.status !== undefined
  );

  if (isScheduleChange) {
    await runTransaction(db, async (transaction) => {
      const bSnap = await transaction.get(docRef);
      if (!bSnap.exists()) {
        throw new Error('Reserva no encontrada');
      }

      const curr = bSnap.data();
      const targetComplexId = curr.complejoId || 'B';
      const oldCourtId = String(curr.courtId || curr.court_id || 'c_1');
      const oldDate = curr.date;
      const newCourtId = String(patch.courtId || patch.court_id || oldCourtId);
      const newDate = patch.date || oldDate;
      const newStart = patch.startTime || curr.startTime || '18:00';
      const newEnd = patch.endTime || curr.endTime || '19:00';
      const newStatus = patch.status !== undefined ? patch.status : curr.status;
      const isCancelled = newStatus === 'cancelado' || newStatus === 'cancelled';

      const oldAffectedCourts = await getOverlappingCourtIds(targetComplexId, oldCourtId);
      const newAffectedCourts = await getOverlappingCourtIds(targetComplexId, newCourtId);

      // Lock old schedule
      const oldLockRefs = oldAffectedCourts.map(cid => 
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${oldDate}`)
      );
      const oldLockSnaps = await Promise.all(oldLockRefs.map(ref => transaction.get(ref)));

      // If cancelling: release from lock and update booking
      if (isCancelled) {
        for (let i = 0; i < oldAffectedCourts.length; i++) {
          const snap = oldLockSnaps[i];
          if (snap.exists()) {
            const bMap = { ...(snap.data().bookings || {}) };
            delete bMap[strBookingId];
            transaction.set(oldLockRefs[i], {
              bookings: bMap,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }

        transaction.update(docRef, {
          ...patch,
          status: 'cancelado',
          updatedAt: new Date().toISOString()
        });
        return;
      }

      // If rescheduling or changing times/courts: check conflicts in new schedule
      const newLockRefs = newAffectedCourts.map(cid => 
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${newDate}`)
      );
      const newLockSnaps = await Promise.all(newLockRefs.map(ref => transaction.get(ref)));

      const startMin = timeStringToMinutes(newStart);
      const endMin = timeStringToMinutes(newEnd);

      // Check overlaps in new schedule (excluding this booking itself)
      newLockSnaps.forEach(snap => {
        if (snap.exists()) {
          const bMap = snap.data().bookings || {};
          Object.entries(bMap).forEach(([bId, bData]: [string, any]) => {
            if (bId === strBookingId) return;
            const st = String(bData.status || '').toLowerCase();
            if (st === 'cancelado' || st === 'cancelled') return;
            const exStartMin = bData.startMin ?? timeStringToMinutes(bData.startTime);
            const exEndMin = bData.endMin ?? timeStringToMinutes(bData.endTime);
            if (intervalsOverlap(startMin, endMin, exStartMin, exEndMin)) {
              throw new Error(
                `Conflicto de turno: El nuevo horario ${newStart} - ${newEnd} hs para la fecha ${newDate} ya está ocupado (${bData.userName || 'Cliente'}).`
              );
            }
          });
        }
      });

      // Release from old lock if court or date changed
      if (oldCourtId !== newCourtId || oldDate !== newDate) {
        for (let i = 0; i < oldAffectedCourts.length; i++) {
          const snap = oldLockSnaps[i];
          if (snap.exists()) {
            const bMap = { ...(snap.data().bookings || {}) };
            delete bMap[strBookingId];
            transaction.set(oldLockRefs[i], {
              bookings: bMap,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
      }

      // Register into new lock
      const newLockEntry = {
        bookingId: strBookingId,
        courtId: newCourtId,
        courtName: patch.courtName || curr.courtName || 'Cancha',
        startTime: newStart,
        endTime: newEnd,
        startMin,
        endMin,
        userName: patch.userName || patch.clientName || curr.userName || 'Cliente',
        status: newStatus || 'confirmado'
      };

      for (let i = 0; i < newAffectedCourts.length; i++) {
        const snap = newLockSnaps[i];
        const existingBookings = snap.exists() ? (snap.data().bookings || {}) : {};
        transaction.set(newLockRefs[i], {
          complejoId: targetComplexId,
          courtId: newAffectedCourts[i],
          date: newDate,
          bookings: {
            ...existingBookings,
            [strBookingId]: newLockEntry
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Update booking document
      transaction.update(docRef, {
        ...patch,
        updatedAt: new Date().toISOString()
      });
    });
  } else {
    // Pure metadata update (e.g. payment, deposit, notes)
    await updateDoc(docRef, {
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }

  // Lifecycle metrics synchronization
  const finalUserId = patch.userId;
  const finalPhone = patch.userPhone || patch.clientPhone;
  if ((finalUserId && finalUserId !== '0') || finalPhone) {
    syncUserMetricsWithBookings(finalUserId || '', finalPhone);
  }
}

/**
 * Elimina una reserva de la colección canónica 'bookings' y libera su bloque atómico.
 */
export async function deleteBookingInFirestore(bookingId: string | number): Promise<void> {
  const strId = String(bookingId);
  const docRef = doc(db, BOOKINGS_COLLECTION, strId);
  let userId: string | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) return;
      const bData = snap.data();
      userId = bData.userId || null;
      const targetComplexId = bData.complejoId || 'B';
      const courtId = String(bData.courtId || bData.court_id || 'c_1');
      const date = bData.date;

      const affectedCourts = await getOverlappingCourtIds(targetComplexId, courtId);
      const lockRefs = affectedCourts.map(cid => 
        doc(db, BOOKING_LOCKS_COLLECTION, `${targetComplexId}__${cid}__${date}`)
      );
      const lockSnaps = await Promise.all(lockRefs.map(ref => transaction.get(ref)));

      for (let i = 0; i < affectedCourts.length; i++) {
        const lSnap = lockSnaps[i];
        if (lSnap.exists()) {
          const bMap = { ...(lSnap.data().bookings || {}) };
          delete bMap[strId];
          transaction.set(lockRefs[i], {
            bookings: bMap,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      transaction.delete(docRef);
    });
  } catch (err) {
    console.warn('[Firestore] Error deleting booking with lock release:', err);
    await deleteDoc(docRef);
  }

  if (userId && userId !== '0') {
    syncUserMetricsWithBookings(userId);
  }
}

// =========================================================================
// 2.2.1. Colección Canónica: support_tickets
// =========================================================================

/**
 * Crea un ticket de soporte en la colección canónica /support_tickets
 */
export async function createSupportTicketInFirestore(data: {
  complejoId?: string;
  complexName?: string;
  type: string;
  priority: string;
  module: string;
  title: string;
  description: string;
  admin_name: string;
  admin_phone?: string;
  admin_email?: string;
  system_info?: string;
  channel?: string;
}): Promise<SupportTicket> {
  const colRef = collection(db, SUPPORT_TICKETS_COLLECTION);
  const ticketRef = doc(colRef);
  
  const prefix = data.type === 'bug' ? 'BUG' : data.type === 'feature' ? 'MEJ' : data.type === 'urgent' ? 'URG' : 'SUP';
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const ticketCode = `#${prefix}-${randomDigits}`;
  const nowIso = new Date().toISOString();

  const ticketData: any = {
    id: ticketRef.id,
    ticket_code: ticketCode,
    complejoId: data.complejoId || 'B',
    complexName: data.complexName || 'Complejo Deportivo',
    type: data.type || 'bug',
    priority: data.priority || 'medium',
    module: data.module || 'General',
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    admin_name: data.admin_name || 'Administrador',
    admin_phone: data.admin_phone || '',
    admin_email: data.admin_email || '',
    createdByUid: auth.currentUser?.uid || null,
    system_info: data.system_info || '',
    status: 'pending',
    channel: data.channel || 'system',
    created_at: nowIso,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ticketRef, ticketData);
  console.log('[Firestore] Ticket de soporte creado en support_tickets/', ticketRef.id);
  
  return {
    id: Date.now(),
    ...ticketData
  };
}

/**
 * Escucha los tickets de soporte del complejo activo en tiempo real
 */
export function subscribeToSupportTickets(
  complexId: string,
  cb: (tickets: SupportTicket[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, SUPPORT_TICKETS_COLLECTION);
  
  const q = query(colRef, where('complejoId', '==', targetId));
  
  return onSnapshot(q, (snap) => {
    const list: SupportTicket[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: data.id || d.id,
        ticket_code: data.ticket_code || `#SUP-${d.id.slice(0, 6)}`,
        type: data.type || 'inquiry',
        priority: data.priority || 'medium',
        module: data.module || 'General',
        title: data.title || '',
        description: data.description || '',
        admin_name: data.admin_name || 'Administrador',
        admin_phone: data.admin_phone || '',
        admin_email: data.admin_email || '',
        system_info: typeof data.system_info === 'object' ? JSON.stringify(data.system_info) : (data.system_info || ''),
        status: data.status || 'pending',
        channel: data.channel || 'system',
        created_at: data.created_at || (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString())
      });
    });

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando support_tickets:', err);
    cb([]);
  });
}

/**
 * Actualiza el estado de un ticket de soporte
 */
export async function updateSupportTicketStatusInFirestore(ticketId: string, status: string): Promise<void> {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, String(ticketId));
  await updateDoc(ticketRef, {
    status,
    updatedAt: serverTimestamp()
  });
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

// ============================================================================
// DIRECTIVA MAESTRA POS, INVENTARIO Y FINANZAS
// ============================================================================

export const DEFAULT_INVENTORY_CATEGORIES: string[] = [];

/**
 * Escucha las categorías de mostrador desde complejos/{complejoId}.inventoryCategories
 * 100% configurable por el dueño, comienza vacío.
 */
export function subscribeToInventoryCategories(
  complexId: string,
  cb: (categories: string[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  return onSnapshot(compRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.inventoryCategories)) {
        cb(data.inventoryCategories);
        return;
      }
    }
    // Cero categorías preconfiguradas
    cb([]);
  }, (err) => {
    console.warn('[Firestore] Error leyendo inventoryCategories:', err);
    cb([]);
  });
}

/**
 * Guarda el array de categorías en complejos/{complejoId}
 */
export async function saveInventoryCategories(
  complexId: string,
  categories: string[]
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const compRef = doc(db, COMPLEJOS_COLLECTION, targetId);
  await updateDoc(compRef, {
    inventoryCategories: categories
  });
}

/**
 * Escucha los productos del complejo activo.
 * Cero productos predeterminados, comienza 100% vacío.
 */
export function subscribeToProducts(
  complexId: string,
  cb: (products: Product[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snap) => {
    const list: Product[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        complejoId: data.complejoId || targetId,
        name: data.name || 'Sin nombre',
        categoryId: data.categoryId || '',
        categoryName: data.categoryName || data.categoryId || '',
        purchasePrice: Number(data.purchasePrice || 0),
        salePrice: Number(data.salePrice || 0),
        stock: Number(data.stock || 0),
        status: data.status === 'inactivo' ? 'inactivo' : 'activo',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });

    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando productos:', err);
    cb([]);
  });
}

/**
 * Guarda o actualiza un producto en Firestore.
 * Si es nuevo, registra el movimiento de Stock Inicial en inventory_movements.
 */
export async function saveProductInFirestore(
  complexId: string,
  product: Partial<Product>
): Promise<string> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const isNew = !product.id;
  const prodId = product.id || `prod_${Date.now()}`;
  const prodRef = doc(colRef, prodId);

  const payload: any = {
    complejoId: targetId,
    name: (product.name || '').trim(),
    categoryId: (product.categoryId || '').trim(),
    categoryName: (product.categoryName || product.categoryId || '').trim(),
    purchasePrice: Number(product.purchasePrice || 0),
    salePrice: Number(product.salePrice || 0),
    stock: Number(product.stock || 0),
    status: product.status || 'activo',
    updatedAt: serverTimestamp()
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(prodRef, payload, { merge: true });

  // Si es un producto nuevo con stock > 0, registrar movimiento de stock inicial en el historial
  if (isNew && payload.stock > 0) {
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
      await setDoc(movRef, {
        productId: prodId,
        complejoId: targetId,
        type: 'initial',
        typeLabel: 'Stock inicial',
        quantity: Number(payload.stock),
        resultingStock: Number(payload.stock),
        date: dateStr,
        time: hoursStr,
        actorName: 'Administrador',
        notes: 'Carga inicial de producto',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('[Inventory] Error registrando stock inicial:', e);
    }
  }

  return prodId;
}

/**
 * Escucha el historial de movimientos de inventario de un producto
 */
export function subscribeToProductMovements(
  productId: string,
  cb: (movements: InventoryMovement[]) => void
): () => void {
  if (!productId) {
    cb([]);
    return () => {};
  }
  const colRef = collection(db, INVENTORY_MOVEMENTS_COLLECTION);
  const q = query(colRef, where('productId', '==', productId));

  return onSnapshot(q, (snap) => {
    const list: InventoryMovement[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        productId: data.productId,
        complejoId: data.complejoId,
        type: data.type || 'adjustment',
        typeLabel: data.typeLabel || 'Ajuste manual',
        quantity: Number(data.quantity || 0),
        resultingStock: Number(data.resultingStock || 0),
        date: data.date || '',
        time: data.time || '',
        actorName: data.actorName || 'Administrador',
        notes: data.notes || '',
        createdAt: data.createdAt
      });
    });

    // Ordenar de más reciente a más antiguo
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });

    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando movimientos:', err);
    cb([]);
  });
}

/**
 * Ajusta el stock de un producto manualmente y genera un registro inmutable en el historial
 */
export async function adjustProductStockInFirestore(params: {
  complexId: string;
  productId: string;
  delta: number; // positivo (+X) o negativo (-X)
  type: 'restock' | 'adjustment' | string;
  typeLabel: string; // 'Reposición de stock' | 'Ajuste manual'
  notes?: string;
  actorName?: string;
}): Promise<number> {
  const targetId = (!params.complexId || params.complexId === 'complejo_central') ? 'B' : params.complexId;
  const prodRef = doc(db, PRODUCTS_COLLECTION, params.productId);
  const snap = await getDoc(prodRef);
  if (!snap.exists()) {
    throw new Error('Producto no encontrado');
  }

  const currentStock = Number(snap.data().stock || 0);
  const newStock = Math.max(0, currentStock + params.delta);

  await updateDoc(prodRef, {
    stock: newStock,
    updatedAt: serverTimestamp()
  });

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
  await setDoc(movRef, {
    productId: params.productId,
    complejoId: targetId,
    type: params.type,
    typeLabel: params.typeLabel,
    quantity: params.delta,
    resultingStock: newStock,
    date: dateStr,
    time: hoursStr,
    actorName: params.actorName || 'Administrador',
    notes: params.notes || '',
    createdAt: serverTimestamp()
  });

  return newStock;
}

/**
 * Elimina un producto. Si tiene ventas históricas, cambia su status a 'inactivo'
 * para preservar referencias e inmutabilidad histórica.
 */
export async function deleteProductInFirestore(
  productId: string,
  complexId: string
): Promise<void> {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  try {
    // Verificar si el producto tiene ventas históricas en transactions
    const qTx = query(collection(db, TRANSACTIONS_COLLECTION), where('complejoId', '==', targetId));
    const txSnap = await getDocs(qTx);
    let hasSales = false;
    for (const d of txSnap.docs) {
      const items = d.data().items;
      if (Array.isArray(items)) {
        if (items.some((it: any) => it.productId === productId)) {
          hasSales = true;
          break;
        }
      }
    }

    const prodRef = doc(db, PRODUCTS_COLLECTION, productId);
    if (hasSales) {
      // Regla de Eliminación: cambiar status a 'inactivo'
      await updateDoc(prodRef, { 
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
    } else {
      // Sin ventas: borrado definitivo
      await deleteDoc(prodRef);
    }
  } catch (err) {
    console.warn('[Firestore] Error al eliminar producto, aplicando soft-delete:', err);
    try {
      await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), { 
        status: 'inactivo',
        updatedAt: serverTimestamp()
      });
    } catch (e2) {}
  }
}

/**
 * Impacta la transacción de venta del POS en Firestore:
 * 1. Crea documento en transactions con foto congelada de productos y desglose de pagos
 * 2. Descuenta cantidades vendidas en products (increment(-qty))
 * 3. Si hay pagos tipo 'fiado', incrementa deuda en users/{userId} (increment(montoFiado))
 */
export async function executePOSSale(sale: {
  complejoId: string;
  items: TransactionItem[];
  payments: TransactionPayment[];
  total: number;
  userId?: string;
  userName?: string;
  notes?: string;
}): Promise<string> {
  const targetId = (!sale.complejoId || sale.complejoId === 'complejo_central') ? 'B' : sale.complejoId;
  const batch = writeBatch(db);
  const txRef = doc(collection(db, TRANSACTIONS_COLLECTION));

  const hasFiado = sale.payments.some(p => p.method === 'fiado' && p.amount > 0);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const txData = {
    complejoId: targetId,
    type: 'ingreso',
    source: 'mostrador',
    total: Number(sale.total || 0),
    amount: Number(sale.total || 0),
    payments: sale.payments.map(p => ({
      method: p.method,
      amount: Number(p.amount || 0)
    })),
    // Foto inmutable del precio en el momento de la venta
    items: sale.items.map(it => ({
      productId: it.productId || null,
      name: it.name,
      quantity: Number(it.quantity || 1),
      unitPrice: Number(it.unitPrice || 0),
      subtotal: Number(it.subtotal || (Number(it.quantity || 1) * Number(it.unitPrice || 0)))
    })),
    userId: sale.userId || null,
    userName: sale.userName || (sale.userId ? 'Cliente Registrado' : 'Cliente Mostrador'),
    paymentStatus: hasFiado ? 'fiado' : 'paid',
    category: 'Venta Mostrador',
    description: sale.items.map(it => `${it.quantity}x ${it.name}`).join(', '),
    notes: sale.notes || '',
    date: dateStr,
    createdAt: serverTimestamp()
  };

  batch.set(txRef, txData);

  // 2. Descontar stock en products y registrar movimiento de inventario automático
  const hoursStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const item of sale.items) {
    if (item.productId) {
      const prodRef = doc(db, PRODUCTS_COLLECTION, item.productId);
      batch.set(prodRef, {
        stock: increment(-Number(item.quantity || 1)),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Movimiento inmutable de inventario por venta POS
      const movRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
      batch.set(movRef, {
        productId: item.productId,
        complejoId: targetId,
        type: 'sale',
        typeLabel: 'Venta',
        quantity: -Number(item.quantity || 1),
        date: dateStr,
        time: hoursStr,
        actorName: sale.userName || 'Punto de Venta',
        notes: `Venta Mostrador · Ticket #${txRef.id.slice(0, 6)}`,
        createdAt: serverTimestamp()
      });
    }
  }

  // 3. Deudas (Fiado): Si existe un pago tipo 'fiado', sumar a debt en users/{userId}
  if (hasFiado && sale.userId) {
    const fiadoAmount = sale.payments
      .filter(p => p.method === 'fiado')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    if (fiadoAmount > 0) {
      const userRef = doc(db, USERS_COLLECTION, String(sale.userId));
      batch.set(userRef, {
        debt: increment(fiadoAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  }

  try {
    await batch.commit();
  } catch (err: any) {
    console.warn('[Firestore] Batch commit error, executing individual resilient fallback:', err);
    try {
      await setDoc(txRef, txData);
    } catch (txErr) {
      console.warn('[Firestore] Could not save transaction doc:', txErr);
    }
  }
  return txRef.id;
}

/**
 * Salda la deuda de un fiado en una transacción existente:
 * - Actualiza la transacción original cambiando su método de 'fiado' al nuevo método
 * - Cambia paymentStatus a 'paid'
 * - Resta el monto del campo debt del usuario en users/{userId}
 */
export async function settleFiadoTransaction(params: {
  transactionId: string;
  fiadoAmount: number;
  newMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  userId?: string;
}): Promise<void> {
  const txRef = doc(db, TRANSACTIONS_COLLECTION, params.transactionId);
  const snap = await getDoc(txRef);
  if (!snap.exists()) {
    throw new Error('Transacción no encontrada');
  }

  const txData = snap.data();
  const currentPayments: TransactionPayment[] = Array.isArray(txData.payments) ? txData.payments : [];

  let replaced = false;
  const updatedPayments = currentPayments.map(p => {
    if (p.method === 'fiado' && !replaced) {
      replaced = true;
      return {
        method: params.newMethod,
        amount: p.amount
      };
    }
    return p;
  });

  if (!replaced) {
    updatedPayments.push({
      method: params.newMethod,
      amount: params.fiadoAmount
    });
  }

  const stillHasFiado = updatedPayments.some(p => p.method === 'fiado' && p.amount > 0);

  await updateDoc(txRef, {
    payments: updatedPayments,
    paymentStatus: stillHasFiado ? 'fiado' : 'paid',
    settledAt: serverTimestamp()
  });

  // Restar de la deuda del cliente
  const targetUserId = params.userId || txData.userId;
  if (targetUserId && params.fiadoAmount > 0) {
    try {
      const userRef = doc(db, USERS_COLLECTION, String(targetUserId));
      await updateDoc(userRef, {
        debt: increment(-Number(params.fiadoAmount)),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn(`[Firestore] Error al restar deuda del usuario ${targetUserId}:`, err);
    }
  }
}

/**
 * Escucha las transacciones en tiempo real
 */
export function subscribeToTransactions(
  complexId: string,
  cb: (transactions: any[]) => void
): () => void {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;
  const colRef = collection(db, TRANSACTIONS_COLLECTION);
  const q = query(colRef, where('complejoId', '==', targetId));

  return onSnapshot(q, (snap) => {
    const list: any[] = [];
    snap.forEach((d) => {
      list.push({
        id: d.id,
        ...d.data()
      });
    });
    // Ordenar de más reciente a más antiguo
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });
    cb(list);
  }, (err) => {
    console.warn('[Firestore] Error escuchando transacciones:', err);
    cb([]);
  });
}
