import { 
  doc, 
  getDoc, 
  setDoc, 
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
  complexName?: string;
  errorMessage?: string;
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
    const inviteRef = doc(db, 'saasInvitations', cleanToken);
    const snap = await getDoc(inviteRef);

    if (!snap.exists()) {
      return { valid: false, reason: 'not_found' };
    }

    const inv = { token: snap.id, ...snap.data() } as SaaSInvitation;

    if (inv.status === 'claimed') {
      return { valid: false, reason: 'claimed', invitation: inv };
    }

    if (inv.status === 'revoked') {
      return { valid: false, reason: 'revoked', invitation: inv };
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
      return { valid: false, reason: 'expired', invitation: inv };
    }

    if (inv.status !== 'pending') {
      return { valid: false, reason: 'revoked', invitation: inv };
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
  user: FirebaseUser
): Promise<{ success: boolean; complexId: string; complexName: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token de invitación inválido.');
  }
  if (!user || !user.uid) {
    throw new Error('Usuario no autenticado.');
  }

  const inviteRef = doc(db, 'saasInvitations', cleanToken);
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

    // 5. Set complex clientStatus to 'trial' (NOT 'active') and record trial dates
    if (compSnap.exists()) {
      const cData = compSnap.data();
      const now = new Date();
      const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // exactly +30 days

      const complexUpdates: any = {
        clientStatus: 'trial',
        trialStartedAt: serverTimestamp(),
        trialEndsAt: Timestamp.fromDate(trialEnds),
        updatedAt: serverTimestamp()
      };
      if (!cData.isActivated) {
        complexUpdates.isActivated = true;
      }
      if (!cData.ownerUid) {
        complexUpdates.ownerUid = user.uid;
        complexUpdates.ownerEmail = user.email || '';
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
