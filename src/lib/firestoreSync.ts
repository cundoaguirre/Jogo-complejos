import { 
  collection, 
  doc, 
  setDoc, 
  addDoc,
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query,
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db, FIRESTORE_DATABASE_ID } from './firebase';
import type { User, Court } from '../types';

export interface FirestoreBooking {
  id: string;
  complexId: string;
  courtId: string | number;
  clientName: string;
  clientPhone?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm or ISO
  endTime: string; // HH:mm or ISO
  price: number;
  deposit: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt?: any;
  mode?: string;
  notes?: string;
  courtName?: string;
}

export const BOOKINGS_COLLECTION = 'bookings';
export const COURTS_COLLECTION = 'courts';
export const USERS_COLLECTION = 'users';
export const VENUE_COLLECTION = 'venue_profile';

/**
 * Returns current complexId for scoping data to the logged-in user's sports complex
 */
export function getActiveComplexId(user?: any, customComplexId?: string): string {
  if (customComplexId) {
    return customComplexId;
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('activeComplexId');
      if (saved) return saved;
    } catch (e) {}
  }
  if (user && user.uid) {
    return user.uid;
  }
  return 'complejo_central';
}

/**
 * Normalizes a booking from Firestore into the Match structure required by the Calendar UI
 */
export function formatBookingToMatch(b: any): any {
  let start_time = b.startTime || b.start_time || '';
  let end_time = b.endTime || b.end_time || '';

  if (b.date && start_time && !start_time.includes('T')) {
    const formattedHour = start_time.length === 5 ? `${start_time}:00` : start_time;
    start_time = `${b.date}T${formattedHour}`;
  }
  if (b.date && end_time && !end_time.includes('T')) {
    const formattedHour = end_time.length === 5 ? `${end_time}:00` : end_time;
    end_time = `${b.date}T${formattedHour}`;
  }

  const deposit = Number(b.deposit ?? b.amount_paid ?? 0);
  const price = Number(b.price ?? b.price_total ?? 0);

  return {
    id: b.id,
    court_id: isNaN(Number(b.courtId || b.court_id)) ? (b.courtId || b.court_id) : Number(b.courtId || b.court_id),
    courtId: b.courtId || b.court_id,
    complexId: b.complexId || 'complejo_central',
    date: b.date || (start_time.includes('T') ? start_time.split('T')[0] : ''),
    startTime: b.startTime || (start_time.includes('T') ? start_time.split('T')[1].substring(0, 5) : ''),
    endTime: b.endTime || (end_time.includes('T') ? end_time.split('T')[1].substring(0, 5) : ''),
    start_time,
    end_time,
    host_id: b.clientId || b.clientPhone || b.clientName || '1',
    host_name: b.clientName || b.host_name || 'Cliente',
    host_phone: b.clientPhone || b.host_phone || '',
    court_name: b.courtName || b.court_name || `Cancha ${b.courtId || b.court_id || ''}`,
    price: price,
    price_total: price,
    deposit: deposit,
    amount_paid: deposit,
    payment_status: deposit >= price && price > 0 ? 'paid' : (deposit > 0 ? 'partial' : (b.payment_status || 'pending')),
    status: b.status || 'confirmed',
    is_open: false,
    mode: b.mode || 'complete',
    max_players: b.max_players || 10,
    players: b.players || []
  };
}

/**
 * Real-time listener for Bookings filtered strictly by complexId
 */
export function subscribeToBookings(
  complexId: string, 
  onUpdate: (bookings: any[]) => void
): () => void {
  try {
    const colRef = collection(db, BOOKINGS_COLLECTION);
    
    // First attempt with where clause on complexId
    const q = complexId 
      ? query(colRef, where('complexId', '==', complexId))
      : query(colRef);
    
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => formatBookingToMatch({ id: doc.id, ...doc.data() }));
      onUpdate(list);
    }, (error) => {
      console.warn('[Firestore] Notice on complexId query, listening to collection:', error.message);
      // Fallback in case of index requirements
      return onSnapshot(colRef, (snap) => {
        const list = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() as any }))
          .filter(b => !complexId || b.complexId === complexId || !b.complexId)
          .map(formatBookingToMatch);
        onUpdate(list);
      }, (err) => {
        console.error('[Firestore] Error on bookings subscription fallback:', err);
        onUpdate([]);
      });
    });
  } catch (err) {
    console.error('[Firestore] Error subscribing to bookings:', err);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Creates a real booking directly in the 'bookings' collection in Firestore
 */
export async function createBookingInFirestore(data: {
  complexId: string;
  courtId: string | number;
  clientName: string;
  clientPhone?: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  deposit?: number;
  status?: 'confirmed' | 'pending' | 'cancelled';
  mode?: string;
  courtName?: string;
}): Promise<string> {
  const colRef = collection(db, BOOKINGS_COLLECTION);
  
  // Exact fields specified in requirement 3
  const payload = {
    complexId: data.complexId,
    courtId: data.courtId,
    clientName: data.clientName.trim(),
    clientPhone: data.clientPhone ? data.clientPhone.trim() : '',
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    price: Number(data.price) || 0,
    deposit: Number(data.deposit) || 0,
    status: data.status || 'confirmed',
    createdAt: serverTimestamp(),
    mode: data.mode || 'complete',
    courtName: data.courtName || ''
  };

  const docRef = await addDoc(colRef, payload);
  console.log('[Firestore] Booking created successfully in bookings collection with ID:', docRef.id);
  return docRef.id;
}

/**
 * Updates a booking in Firestore
 */
export async function updateBookingInFirestore(
  bookingId: string | number, 
  patch: Partial<FirestoreBooking> & Record<string, any>
): Promise<void> {
  const docRef = doc(db, BOOKINGS_COLLECTION, String(bookingId));
  await updateDoc(docRef, {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

/**
 * Deletes a booking from Firestore
 */
export async function deleteBookingInFirestore(bookingId: string | number): Promise<void> {
  const docRef = doc(db, BOOKINGS_COLLECTION, String(bookingId));
  await deleteDoc(docRef);
}

/**
 * Real-time listener for Courts associated with the complex
 * Listens to:
 * 1. Top-level 'courts' collection filtered by complexId
 * 2. Subcollection 'complejos/{complexId}/canchas'
 */
export function subscribeToCourts(
  complexId: string, 
  onUpdate: (courts: Court[]) => void
): () => void {
  try {
    const courtsMap = new Map<string | number, Court>();

    const emitMerged = () => {
      onUpdate(Array.from(courtsMap.values()));
    };

    // 1. Top-level 'courts'
    const colRef = collection(db, COURTS_COLLECTION);
    const qTop = complexId ? query(colRef, where('complexId', '==', complexId)) : query(colRef);

    const unsubTop = onSnapshot(qTop, (snapshot) => {
      snapshot.docs.forEach(d => {
        const courtData = {
          id: isNaN(Number(d.id)) ? d.id : Number(d.id),
          ...d.data()
        } as unknown as Court;
        courtsMap.set(courtData.id, courtData);
      });
      emitMerged();
    }, () => {
      // Fallback query
      onSnapshot(colRef, (snap) => {
        snap.docs.forEach(d => {
          const data = d.data() as any;
          if (!complexId || data.complexId === complexId || !data.complexId) {
            const court = {
              id: isNaN(Number(d.id)) ? d.id : Number(d.id),
              ...data
            } as unknown as Court;
            courtsMap.set(court.id, court);
          }
        });
        emitMerged();
      });
    });

    // 2. Subcollection: complejos/{complexId}/canchas
    let unsubSub = () => {};
    if (complexId) {
      try {
        const subColRef = collection(db, 'complejos', complexId, 'canchas');
        unsubSub = onSnapshot(subColRef, (snapshot) => {
          snapshot.docs.forEach(d => {
            const courtData = {
              id: isNaN(Number(d.id)) ? d.id : Number(d.id),
              ...d.data()
            } as unknown as Court;
            courtsMap.set(courtData.id, courtData);
          });
          emitMerged();
        }, () => {});
      } catch (e) {
        // subcollection listener optional
      }
    }

    // 3. Embedded courts array on complexes/{complexId} document
    let unsubComplexDoc = () => {};
    if (complexId) {
      try {
        const complexRef = doc(db, 'complexes', complexId);
        unsubComplexDoc = onSnapshot(complexRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.courts)) {
              data.courts.forEach((c: any, idx: number) => {
                const cId = c.id || `court_${idx}`;
                const courtObj: Court = {
                  id: isNaN(Number(cId)) ? (cId as any) : Number(cId),
                  name: c.name || `Cancha ${idx + 1}`,
                  type: c.sport || c.type || 'Fútbol 5',
                  surface: c.surface || 'Césped Sintético',
                  price_per_hour: Number(c.price || c.price_per_hour) || 0,
                  is_roofed: Boolean(c.is_roofed),
                  image_url: c.image_url || '',
                  status: c.status === 'activa' ? 'available' : (c.status || 'available')
                };
                courtsMap.set(courtObj.id, courtObj);
              });
              emitMerged();
            }
          }
        }, () => {});
      } catch (e) {}
    }

    return () => {
      unsubTop();
      unsubSub();
      unsubComplexDoc();
    };
  } catch (e) {
    console.error('[Firestore] Error subscribing to courts:', e);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Creates or updates a Court in Firestore
 * Writes to top-level collection AND subcollection for 100% compatibility
 */
export async function saveCourtInFirestore(
  complexId: string, 
  court: Partial<Court>
): Promise<string> {
  const courtId = court.id ? String(court.id) : `court_${Date.now()}`;
  const payload = {
    ...court,
    id: court.id || Date.now(),
    complexId,
    name: court.name || 'Cancha',
    type: court.type || 'Fútbol 5',
    surface: court.surface || 'Sintético',
    price_per_hour: Number(court.price_per_hour) || 0,
    is_roofed: Boolean(court.is_roofed),
    status: court.status || 'available',
    updatedAt: serverTimestamp()
  };

  // 1. Top-level 'courts'
  await setDoc(doc(db, COURTS_COLLECTION, courtId), payload, { merge: true });

  // 2. Top-level 'canchas'
  try {
    await setDoc(doc(db, 'canchas', courtId), payload, { merge: true });
  } catch (e) {}

  // 3. Subcollection 'complejos/{complexId}/canchas/{courtId}'
  if (complexId) {
    try {
      await setDoc(doc(db, 'complejos', complexId, 'canchas', courtId), payload, { merge: true });
    } catch (e) {}
  }

  return courtId;
}

/**
 * Deletes a court from Firestore across all paths
 */
export async function deleteCourtInFirestore(courtId: string | number, complexId?: string): Promise<void> {
  const strId = String(courtId);
  try {
    await deleteDoc(doc(db, COURTS_COLLECTION, strId));
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'canchas', strId));
  } catch (e) {}
  if (complexId) {
    try {
      await deleteDoc(doc(db, 'complejos', complexId, 'canchas', strId));
    } catch (e) {}
  }
}

/**
 * Real-time listener for Users / Clients
 */
export function subscribeToClients(
  complexId: string, 
  onUpdate: (users: User[]) => void
): () => void {
  try {
    const colRef = collection(db, USERS_COLLECTION);
    const q = complexId ? query(colRef, where('complexId', '==', complexId)) : query(colRef);

    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: isNaN(Number(d.id)) ? d.id : Number(d.id),
        ...d.data()
      } as unknown as User));
      onUpdate(list);
    }, () => {
      return onSnapshot(colRef, (snap) => {
        const list = snap.docs
          .map(d => ({ id: isNaN(Number(d.id)) ? d.id : Number(d.id), ...d.data() as any }))
          .filter(u => !complexId || u.complexId === complexId || !u.complexId);
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
 * Creates or updates a Client in Firestore
 */
export async function saveClientInFirestore(
  complexId: string, 
  client: Partial<User>
): Promise<string> {
  const clientId = client.id ? String(client.id) : `user_${Date.now()}`;
  const payload = {
    ...client,
    id: client.id || Date.now(),
    complexId,
    name: client.name || 'Cliente',
    phone: client.phone || '',
    email: client.email || '',
    skill_level: client.skill_level || 'Amateur',
    rating: Number(client.rating) || 5.0,
    matches_played: Number(client.matches_played) || 0,
    first_visit: client.first_visit || new Date().toISOString().split('T')[0],
    last_visit: client.last_visit || new Date().toISOString().split('T')[0],
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, USERS_COLLECTION, clientId), payload, { merge: true });
  try {
    await setDoc(doc(db, 'usuarios', clientId), payload, { merge: true });
  } catch (e) {}

  return clientId;
}

/**
 * Deletes a client from Firestore
 */
export async function deleteClientInFirestore(clientId: string | number): Promise<void> {
  const strId = String(clientId);
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, strId));
    await deleteDoc(doc(db, 'usuarios', strId));
  } catch (e) {}
}

/**
 * Real-time listener for Venue Profile in Firestore
 */
export function subscribeToVenueProfile(
  complexId: string,
  onUpdate: (profile: any) => void
): () => void {
  try {
    const docRef = doc(db, VENUE_COLLECTION, complexId);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data());
      }
    });
  } catch (e) {
    console.warn('[Firestore] Error subscribing to venue profile:', e);
    return () => {};
  }
}

/**
 * Saves Venue Profile in Firestore
 */
export async function saveVenueProfileInFirestore(
  complexId: string,
  profile: any
): Promise<void> {
  const payload = {
    ...profile,
    complexId,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, VENUE_COLLECTION, complexId), payload, { merge: true });
  try {
    await setDoc(doc(db, 'complejos', complexId), payload, { merge: true });
    await setDoc(doc(db, 'complejo', complexId), payload, { merge: true });
  } catch (e) {}
}

// -------------------------------------------------------------
// Backwards-compatible aliases to maintain seamless operations
// -------------------------------------------------------------
export const syncTurnoToFirestore = (data: any, complexId?: string) => {
  const cId = complexId || getActiveComplexId();
  if (data.id && typeof data.id === 'string' && data.id.length > 10) {
    return updateBookingInFirestore(data.id, { ...data, complexId: cId });
  }
  return createBookingInFirestore({ ...data, complexId: cId });
};

export const updateTurnoStatusInFirestore = (id: string | number, status: string) => {
  return updateBookingInFirestore(id, { status: status as any });
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
