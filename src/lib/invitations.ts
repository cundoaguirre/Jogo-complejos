import { 
  doc, 
  getDoc, 
  setDoc, 
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp, 
  runTransaction,
  Timestamp 
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db } from './firebase';
import type { SaaSInvitation, ComplexMembership, CollaboratorProfile } from '../types';

export interface InvitationValidationResult {
  valid: boolean;
  reason?: 'not_found' | 'claimed' | 'expired' | 'revoked' | 'error';
  invitation?: SaaSInvitation;
  documentId?: string;
  complexName?: string;
  errorMessage?: string;
}

/**
 * Normalizes and extracts milliseconds timestamp from multiple date representations
 * (Firestore Timestamp, Date, number, ISO string) with zero timezone ambiguity.
 */
export function parseTrialExpiration(val: any): number | null {
  if (!val) return null;
  if (typeof val.toMillis === 'function') {
    const ms = val.toMillis();
    return isNaN(ms) ? null : ms;
  }
  if (typeof val.toDate === 'function') {
    const ms = val.toDate().getTime();
    return isNaN(ms) ? null : ms;
  }
  if (typeof val.seconds === 'number') {
    return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1000000) : 0);
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return isNaN(ms) ? null : ms;
  }
  if (typeof val === 'number') {
    return val < 10000000000 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Evaluates whether a complex is commercially authorized:
 * active -> true
 * trial && now < trialEndsAt -> true
 * trial && now >= trialEndsAt -> false (DENIED)
 * paused -> false (DENIED)
 * inactive -> false (DENIED)
 */
export function isComplexCommerciallyAuthorized(complexData: any, nowMs: number = Date.now()): boolean {
  if (!complexData) return false;
  const rawStatus = (complexData.clientStatus || '').toString().toLowerCase().trim();
  if (rawStatus === 'active') {
    return true;
  }
  if (rawStatus === 'trial') {
    const trialEndsMs = parseTrialExpiration(complexData.trialEndsAt || complexData.trialEndDate);
    if (trialEndsMs === null) {
      return false;
    }
    return nowMs < trialEndsMs;
  }
  return false;
}

/**
 * Validates a single SaaS Invitation by token
 */
export async function validateSaasInvitation(token: string): Promise<InvitationValidationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { valid: false, reason: 'not_found' };
  }

  try {
    const q = query(
      collection(db, 'saasInvitations'),
      where('token', '==', cleanToken),
      limit(1)
    );
    const snap = await getDocs(q);

    let inviteDoc = !snap.empty ? snap.docs[0] : null;

    if (!inviteDoc) {
      try {
        const directDoc = await getDoc(doc(db, 'saasInvitations', cleanToken));
        if (directDoc.exists()) {
          inviteDoc = directDoc;
        }
      } catch {
        // Fallback silently if not found or unauthorized
      }
    }

    if (!inviteDoc) {
      return { valid: false, reason: 'not_found' };
    }

    const documentId = inviteDoc.id;
    const invData = inviteDoc.data() as SaaSInvitation;
    const inv: SaaSInvitation = {
      ...invData,
      id: documentId,
      token: invData.token || cleanToken
    };

    if (inv.status === 'claimed') {
      return { valid: false, reason: 'claimed', invitation: inv, documentId };
    }

    if (inv.status === 'revoked') {
      return { valid: false, reason: 'revoked', invitation: inv, documentId };
    }

    // Check expiration
    const now = Date.now();
    let expiresMs = 0;
    if (inv.expiresAt) {
      if (typeof inv.expiresAt.toMillis === 'function') {
        expiresMs = inv.expiresAt.toMillis();
      } else if (inv.expiresAt.seconds) {
        expiresMs = inv.expiresAt.seconds * 1000;
      } else {
        expiresMs = new Date(inv.expiresAt).getTime();
      }
    }

    if (expiresMs && expiresMs <= now) {
      return { valid: false, reason: 'expired', invitation: inv, documentId };
    }

    if (inv.status !== 'pending') {
      return { valid: false, reason: 'revoked', invitation: inv, documentId };
    }

    // Fetch complex name
    let complexName = inv.complexName || 'Mi Complejo Deportivo';
    if (inv.complexId) {
      try {
        const compSnap = await getDoc(doc(db, 'complejos', inv.complexId));
        if (compSnap.exists()) {
          const compData = compSnap.data();
          complexName = compData.name || compData.company || complexName;
        }
      } catch (e) {
        console.warn('[Invitations] Could not read complex metadata:', e);
      }
    }

    return {
      valid: true,
      invitation: inv,
      documentId,
      complexName
    };
  } catch (err: any) {
    console.error('[Invitations] Error validating token:', err);
    return {
      valid: false,
      reason: 'error',
      errorMessage: err.message || 'Error validando invitación'
    };
  }
}

/**
 * Claims a SaaS invitation atomically.
 * Prevents race conditions and preserves existing user memberships.
 */
export async function claimSaasInvitation(
  token: string, 
  user: FirebaseUser,
  knownInviteDocId?: string
): Promise<{ success: boolean; complexId: string; complexName: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token de invitación inválido.');
  }
  if (!user || !user.uid) {
    throw new Error('Usuario no autenticado.');
  }

  let inviteDocId = knownInviteDocId;
  if (!inviteDocId) {
    const q = query(
      collection(db, 'saasInvitations'),
      where('token', '==', cleanToken),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      inviteDocId = snap.docs[0].id;
    } else {
      try {
        const directDoc = await getDoc(doc(db, 'saasInvitations', cleanToken));
        if (directDoc.exists()) {
          inviteDocId = directDoc.id;
        }
      } catch {
        // Ignored
      }
    }
    if (!inviteDocId) {
      throw new Error('La invitación no existe o es inválida.');
    }
  }

  const inviteRef = doc(db, 'saasInvitations', inviteDocId);
  const colabRef = doc(db, 'collaborators', user.uid);

  return await runTransaction(db, async (transaction) => {
    // 1. Read invitation inside transaction
    const invSnap = await transaction.get(inviteRef);
    if (!invSnap.exists()) {
      throw new Error('La invitación no existe o es inválida.');
    }

    const invData = invSnap.data() as SaaSInvitation;

    if (invData.status === 'claimed') {
      throw new Error('Esta invitación ya fue reclamada por otro usuario.');
    }
    if (invData.status === 'revoked') {
      throw new Error('Esta invitación ha sido revocada.');
    }

    // Check expiration
    const now = Date.now();
    let expiresMs = 0;
    if (invData.expiresAt) {
      if (typeof invData.expiresAt.toMillis === 'function') {
        expiresMs = invData.expiresAt.toMillis();
      } else if (invData.expiresAt.seconds) {
        expiresMs = invData.expiresAt.seconds * 1000;
      } else {
        expiresMs = new Date(invData.expiresAt).getTime();
      }
    }
    if (expiresMs && expiresMs <= now) {
      throw new Error('La invitación ha expirado.');
    }

    const complexRef = doc(db, 'complejos', invData.complexId);
    const compSnap = await transaction.get(complexRef);
    const compName = compSnap.exists()
      ? (compSnap.data().name || compSnap.data().company || invData.complexName || 'Mi Complejo')
      : (invData.complexName || 'Mi Complejo');

    // 2. Read collaborator inside transaction
    const colabSnap = await transaction.get(colabRef);

    // 3. Update invitation to claimed (atomic barrier)
    transaction.update(inviteRef, {
      status: 'claimed',
      claimedByUid: user.uid,
      claimedByEmail: user.email || '',
      claimedAt: serverTimestamp()
    });

    // 4. Update or create collaborator with non-destructive memberships
    if (!colabSnap.exists()) {
      const newColab: CollaboratorProfile = {
        uid: user.uid,
        email: user.email || null,
        name: user.displayName || user.email?.split('@')[0] || 'Operador',
        photoURL: user.photoURL || null,
        activeComplexId: invData.complexId,
        complexIds: [invData.complexId],
        memberships: [
          {
            complexId: invData.complexId,
            complexName: compName,
            role: invData.role || 'owner'
          }
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      transaction.set(colabRef, newColab);
    } else {
      const existing = colabSnap.data() as CollaboratorProfile;
      const existingMemberships = Array.isArray(existing.memberships) ? existing.memberships : [];
      const existingComplexIds = Array.isArray(existing.complexIds) ? existing.complexIds : existingMemberships.map(m => m.complexId);

      const alreadyHas = existingMemberships.some(m => m.complexId === invData.complexId);
      const updatedMemberships = alreadyHas
        ? existingMemberships
        : [...existingMemberships, { complexId: invData.complexId, complexName: compName, role: invData.role || 'owner' }];

      const updatedComplexIds = Array.from(new Set([...existingComplexIds, invData.complexId]));

      transaction.update(colabRef, {
        memberships: updatedMemberships,
        complexIds: updatedComplexIds,
        activeComplexId: invData.complexId, // Switch to the freshly claimed venue
        updatedAt: serverTimestamp()
      });
    }

    // 5. Update complex document according to canonical business rules:
    // Identity linking is decoupled from commercial status!
    if (compSnap.exists()) {
      const cData = compSnap.data();
      const rawStatus = (cData.clientStatus || 'inactive').toString().toLowerCase().trim();
      const now = new Date();
      const nowMs = now.getTime();

      // Check if trial was ever used/started previously
      const hasExistingTrialHistory = Boolean(
        cData.trialStartedAt || 
        cData.trialEndsAt || 
        cData.trialStartDate || 
        cData.trialEndDate
      );

      const complexUpdates: any = {
        updatedAt: serverTimestamp()
      };

      if (!cData.isActivated) {
        complexUpdates.isActivated = true;
      }
      if (!cData.ownerUid) {
        complexUpdates.ownerUid = user.uid;
        complexUpdates.ownerEmail = user.email || '';
      }

      // CASO A — inactive + primer trial:
      // Si clientStatus === 'inactive' y el complejo nunca utilizó previamente un trial:
      // clientStatus -> 'trial', trialStartedAt -> timestamp del claim, trialEndsAt -> claim + 30 días
      if (rawStatus === 'inactive' && !hasExistingTrialHistory) {
        const trialEnds = new Date(nowMs + 30 * 24 * 60 * 60 * 1000); // exactly claim timestamp + 30 days
        complexUpdates.clientStatus = 'trial';
        complexUpdates.trialStartedAt = Timestamp.fromDate(now);
        complexUpdates.trialEndsAt = Timestamp.fromDate(trialEnds);
        console.log(`[Invitations] Claim: First trial granted to complex ${invData.complexId} until ${trialEnds.toISOString()}`);
      }
      // CASO B — trial vigente + nueva invitación:
      // Si clientStatus === 'trial' y now < trialEndsAt:
      // NO modificar trialStartedAt, trialEndsAt. NO extender el trial. NO reiniciarlo.
      else if (rawStatus === 'trial') {
        const trialEndsMs = parseTrialExpiration(cData.trialEndsAt || cData.trialEndDate);
        if (trialEndsMs !== null && nowMs < trialEndsMs) {
          console.log(`[Invitations] Claim: Complex ${invData.complexId} has active trial. Preserving existing trial dates.`);
        } else {
          // CASO C — trial expirado + nueva invitación:
          // Si clientStatus === 'trial' y now >= trialEndsAt:
          // NO reiniciar el trial. NO sumar otros 30 días.
          console.log(`[Invitations] Claim: Complex ${invData.complexId} trial is expired. Maintaining without extending.`);
        }
      }
      // CASO D — active + nueva invitación:
      // Si clientStatus === 'active': mantener clientStatus === 'active'. No modificar a 'trial'. No modificar trialStartedAt/trialEndsAt.
      else if (rawStatus === 'active') {
        console.log(`[Invitations] Claim: Complex ${invData.complexId} is active. Preserving active status.`);
      }
      // CASO E — paused + nueva invitación:
      // Si clientStatus === 'paused': mantener clientStatus === 'paused'. La invitación NO reactiva comercialmente el complejo.
      else if (rawStatus === 'paused') {
        console.log(`[Invitations] Claim: Complex ${invData.complexId} is paused. Preserving paused status.`);
      }
      // Inactive pero con trial ya consumido:
      // NO otorgar nuevo trial. Mantener inactive.
      else if (rawStatus === 'inactive' && hasExistingTrialHistory) {
        console.log(`[Invitations] Claim: Complex ${invData.complexId} is inactive and already consumed previous trial. Preserving inactive.`);
      }

      transaction.update(complexRef, complexUpdates);
    }

    return {
      success: true,
      complexId: invData.complexId,
      complexName: compName
    };
  });
}

/**
 * Creates a new SaaS invitation for a complex.
 * Tokens are cryptographically unguessable strings of 32 characters.
 * Expiration: exactly 24 hours per architectural specification.
 */
export async function createSaasInvitation(params: {
  complexId: string;
  complexName?: string;
  role?: string;
  durationHours?: number;
}): Promise<{ token: string; inviteUrl: string; expiresAt: Date }> {
  const { complexId, complexName = 'Mi Complejo', role = 'owner', durationHours = 24 } = params;

  // Cryptographically secure random token (32 hex characters)
  const randomBytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 16; i++) randomBytes[i] = Math.floor(Math.random() * 256);
  }
  const token = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000); // 24 hours

  const inviteRef = doc(db, 'saasInvitations', token);
  await setDoc(inviteRef, {
    token,
    complexId,
    complexName,
    role,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    claimedByUid: null,
    claimedByEmail: null,
    claimedAt: null
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = `${baseUrl}/invite/${token}`;

  return {
    token,
    inviteUrl,
    expiresAt
  };
}
