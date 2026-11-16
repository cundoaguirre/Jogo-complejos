import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, testConnection, db } from '../lib/firebase';
import { parseTrialExpiration, isComplexCommerciallyAuthorized } from '../lib/invitations';
import type { ComplexMembership, CollaboratorProfile, ComplexClientStatus, ComplexUserRole } from '../types';
import type { BillingConfig } from '../lib/weeklyBilling';
import { DEFAULT_BILLING_CONFIG, subscribeBillingConfig } from '../lib/weeklyBilling';

export interface AuthorizedComplexItem {
  complexId: string;
  complexName: string;
  role: string;
  clientStatus: ComplexClientStatus;
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  hasAccess: boolean;
  authorizedComplexes: AuthorizedComplexItem[];
  activeComplexId: string | null;
  activeComplejoName: string;
  activeComplex: any | null;
  collaboratorData: CollaboratorProfile | null;
  billingConfig: BillingConfig;
  authError: string | null;
  activeRole: ComplexUserRole | null;
  isOwner: boolean;
  isManager: boolean;
  isStaff: boolean;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  setActiveComplexId: (complexId: string) => void;
  reloadCollaboratorData: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  hasAccess: false,
  authorizedComplexes: [],
  activeComplexId: null,
  activeComplejoName: 'Complejo Deportivo',
  activeComplex: null,
  collaboratorData: null,
  billingConfig: DEFAULT_BILLING_CONFIG,
  authError: null,
  activeRole: null,
  isOwner: false,
  isManager: false,
  isStaff: false,
  clearAuthError: () => {},
  signInWithGoogle: async () => null,
  logout: async () => {},
  setActiveComplexId: () => {},
  reloadCollaboratorData: async () => {},
});

function normalizeMemberRole(rawRoleValue: any): ComplexUserRole {
  const raw = (rawRoleValue || '').toString().toLowerCase().trim();
  if (raw === 'owner' || raw === 'propietario') return 'owner';
  if (raw === 'manager' || raw === 'encargado') return 'manager';
  return 'staff';
}

// Super admin email list for support purposes
const SUPER_ADMIN_EMAILS = [
  'aguirrecundo@gmail.com', 
  'cundooaguirre@gmail.com', 
  'thekillerpro.fa@gmail.com'
];

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [authorizedComplexes, setAuthorizedComplexes] = useState<AuthorizedComplexItem[]>([]);
  const [activeComplexId, setActiveComplexIdState] = useState<string | null>(null);
  const activeComplexIdRef = useRef<string | null>(null);
  const [activeComplex, setActiveComplex] = useState<any | null>(null);
  const [collaboratorData, setCollaboratorData] = useState<CollaboratorProfile | null>(null);
  const [memberships, setMemberships] = useState<ComplexMembership[]>([]);
  const [billingConfig, setBillingConfig] = useState<BillingConfig>(DEFAULT_BILLING_CONFIG);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<ComplexUserRole | null>(null);
  const expirationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const revokedCleanupAttemptedRef = useRef<Set<string>>(new Set());

  const isOwner = activeRole === 'owner';
  const isManager = activeRole === 'manager';
  const isStaff = activeRole === 'staff';

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Subscribe in real-time to ERP billing config (settings/billing_config)
  useEffect(() => {
    const unsubBilling = subscribeBillingConfig((config) => {
      setBillingConfig(config);
    });
    return () => unsubBilling();
  }, []);

  // Configure explicit browserLocalPersistence
  useEffect(() => {
    try {
      setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn('[Auth] Error setting browserLocalPersistence:', err);
      });
    } catch (e) {
      console.warn('[Auth] Exception setting persistence:', e);
    }
  }, []);

  // Test Firestore connection on boot
  useEffect(() => {
    testConnection();
  }, []);

  // 1. Auth State Observer:
  // Listens to Firebase Authentication changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        if (expirationTimerRef.current) {
          clearTimeout(expirationTimerRef.current);
          expirationTimerRef.current = null;
        }
        setCollaboratorData(null);
        setMemberships([]);
        setAuthorizedComplexes([]);
        setHasAccess(false);
        activeComplexIdRef.current = null;
        setActiveComplexIdState(null);
        setActiveComplex(null);
        setActiveRole(null);
        revokedCleanupAttemptedRef.current.clear();
        try {
          localStorage.removeItem('activeComplexId');
        } catch (e) {}
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-Time Collaborator Listener:
  // Listens to collaborators/{user.uid} with onSnapshot (never stale getDoc cache)
  useEffect(() => {
    if (!user) {
      // Do not prematurely set loading(false) here while waiting for initial auth state
      return;
    }

    setLoading(true);
    const colabRef = doc(db, 'collaborators', user.uid);
    const unsubColab = onSnapshot(colabRef, (colabSnap) => {
      if (!colabSnap.exists()) {
        console.log('[Auth] Collaborator document does not exist for UID:', user.uid);
        setCollaboratorData(null);
        setMemberships([]);
        setAuthorizedComplexes([]);
        setHasAccess(false);
        activeComplexIdRef.current = null;
        setActiveComplexIdState(null);
        setActiveComplex(null);
        setActiveRole(null);
        try {
          localStorage.removeItem('activeComplexId');
        } catch (e) {}
        setLoading(false);
        return;
      }

      const data = colabSnap.data() as CollaboratorProfile;
      setCollaboratorData(data);
      const mList = Array.isArray(data.memberships) ? data.memberships : [];
      setMemberships(mList);

      if (mList.length === 0) {
        console.log('[Auth] Collaborator has 0 memberships for UID:', user.uid);
        setAuthorizedComplexes([]);
        setHasAccess(false);
        activeComplexIdRef.current = null;
        setActiveComplexIdState(null);
        setActiveComplex(null);
        setActiveRole(null);
        try {
          localStorage.removeItem('activeComplexId');
        } catch (e) {}
        setLoading(false);
      }
    }, (err) => {
      console.warn('[Collaborators] Real-time listener error:', err);
      setCollaboratorData(null);
      setMemberships([]);
      setAuthorizedComplexes([]);
      setHasAccess(false);
      activeComplexIdRef.current = null;
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole(null);
      setLoading(false);
    });

    return () => unsubColab();
  }, [user]);

  const cleanupRevokedMemberships = useCallback((uid: string, revokedIds: string[], currentMemberships: ComplexMembership[]) => {
    if (!uid || revokedIds.length === 0) return;
    const isInviteRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/');
    if (isInviteRoute) return;

    const unattempted = revokedIds.filter(id => !revokedCleanupAttemptedRef.current.has(`${uid}:${id}`));
    if (unattempted.length === 0) return;
    for (const id of unattempted) {
      revokedCleanupAttemptedRef.current.add(`${uid}:${id}`);
    }

    const revokedSet = new Set(revokedIds);
    const remainingMemberships = currentMemberships.filter(m => m?.complexId && !revokedSet.has(m.complexId));
    const remainingComplexIds = remainingMemberships.map(m => m.complexId);

    if (remainingMemberships.length === 0) {
      deleteDoc(doc(db, 'collaborators', uid)).catch(() => {
        setDoc(doc(db, 'collaborators', uid), {
          memberships: [],
          complexIds: [],
          activeComplexId: '',
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      });
    } else {
      setDoc(doc(db, 'collaborators', uid), {
        memberships: remainingMemberships,
        complexIds: remainingComplexIds,
        activeComplexId: remainingMemberships[0].complexId,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(() => {});
    }
  }, []);

  // 3. Real-Time Complexes + Memberships Authorization (Reactive Authorization):
  // Dynamically subscribes to onSnapshot on each complejos/{cid} AND complejos/{cid}/members/{user.uid}.
  // NEVER grants hasAccess=true until confirming that complejos/{cid}/members/{user.uid} exists
  // (unless complexData.ownerUid === user.uid) AND commercial status is valid.
  useEffect(() => {
    if (!user || memberships.length === 0) {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
      setAuthorizedComplexes([]);
      setHasAccess(false);
      activeComplexIdRef.current = null;
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole(null);
      // Keep loading: true while waiting for collaborator snapshot; if collaborator had 0 memberships, listener already set loading(false).
      return;
    }

    const complexIds = Array.from(new Set(memberships.map(m => m.complexId).filter(Boolean)));
    if (complexIds.length === 0) {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
      setAuthorizedComplexes([]);
      setHasAccess(false);
      activeComplexIdRef.current = null;
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole(null);
      setLoading(false);
      return;
    }

    // In-memory live mirror of complex & member documents
    const liveComplexMap: Record<string, any> = {};
    const liveMemberMap: Record<string, { exists: boolean; role: ComplexUserRole | null }> = {};
    const respondedComplexIds = new Set<string>();
    const respondedMemberIds = new Set<string>();

    const recomputeAuthorization = () => {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }

      const authorized: AuthorizedComplexItem[] = [];
      const revokedComplexIds: string[] = [];
      const nowMs = Date.now();
      const upcomingExpirations: number[] = [];

      for (const m of memberships) {
        const cid = m.complexId;
        if (!cid) continue;
        if (!respondedComplexIds.has(cid) || !respondedMemberIds.has(cid)) continue;

        const cData = liveComplexMap[cid];
        if (!cData) {
          revokedComplexIds.push(cid);
          continue;
        }

        const isOwnerByComplexUid = cData.ownerUid === user.uid;
        const memberState = liveMemberMap[cid];
        const hasVerifiedMemberDoc = Boolean(memberState?.exists);

        // Strict rule: DO NOT grant access if members/{uid} does not exist and user is not ownerUid
        if (!hasVerifiedMemberDoc && !isOwnerByComplexUid) {
          console.warn(`[Auth] Revoked or missing member doc for complex ${cid} (UID: ${user.uid}). Blocking access.`);
          revokedComplexIds.push(cid);
          continue;
        }
        revokedCleanupAttemptedRef.current.delete(`${user.uid}:${cid}`);

        const resolvedRole: ComplexUserRole = isOwnerByComplexUid
          ? 'owner'
          : (memberState?.role || 'staff');

        const rawStatus = (cData.clientStatus || '').toString().toLowerCase().trim();
        const isAuthorized = isComplexCommerciallyAuthorized(cData, nowMs);

        if (isAuthorized) {
          authorized.push({
            complexId: cid,
            complexName: cData.name || cData.company || m.complexName || 'Mi Complejo',
            role: resolvedRole,
            clientStatus: rawStatus === 'active' ? 'active' : 'trial'
          });

          if (rawStatus === 'trial') {
            const expMs = parseTrialExpiration(cData.trialEndsAt || cData.trialEndDate);
            if (expMs !== null && expMs > nowMs) {
              upcomingExpirations.push(expMs);
            }
          }
        } else {
          console.log(`[Auth] Real-time: Complex ${cid} clientStatus is "${rawStatus}" (authorized: false). Access disallowed.`);
        }
      }

      if (revokedComplexIds.length > 0) {
        cleanupRevokedMemberships(user.uid, revokedComplexIds, memberships);
      }

      if (authorized.length > 0) {
        // Select or retain activeComplexId strictly among verified & authorized complexes
        let chosenId = authorized[0].complexId;
        let savedPref: string | null = null;
        try {
          savedPref = localStorage.getItem('activeComplexId');
        } catch (e) {}

        const candidate = activeComplexIdRef.current || collaboratorData?.activeComplexId || savedPref;
        if (candidate && authorized.some(c => c.complexId === candidate)) {
          chosenId = candidate;
        }

        try {
          localStorage.setItem('activeComplexId', chosenId);
        } catch (e) {}

        activeComplexIdRef.current = chosenId;

        const currentDoc = liveComplexMap[chosenId];
        if (currentDoc) {
          setActiveComplex({ id: chosenId, ...currentDoc });
        }

        const chosenMemberState = liveMemberMap[chosenId];
        const chosenRole: ComplexUserRole | null = currentDoc?.ownerUid === user.uid
          ? 'owner'
          : (chosenMemberState?.exists ? (chosenMemberState.role || 'staff') : null);

        if (upcomingExpirations.length > 0) {
          const nextExpMs = Math.min(...upcomingExpirations);
          const delayMs = Math.min(2147483647, Math.max(100, nextExpMs - Date.now() + 500));
          console.log(`[Auth] Scheduled targeted trial expiration timer in ${Math.round(delayMs / 1000)}s.`);
          expirationTimerRef.current = setTimeout(() => {
            console.log('[Auth] Trial expiration timer fired! Recomputing authorization...');
            recomputeAuthorization();
          }, delayMs);
        }

        setAuthorizedComplexes(authorized);
        setActiveRole(chosenRole);
        setHasAccess(true);
        setActiveComplexIdState(chosenId);
        setLoading(false);
      } else {
        const allResponded = complexIds.every(
          id => respondedComplexIds.has(id) && respondedMemberIds.has(id)
        );
        if (allResponded) {
          console.log('[Auth] Real-time: All complex & member checks completed, none authorized. Setting hasAccess=false.');
          setAuthorizedComplexes([]);
          setHasAccess(false);
          activeComplexIdRef.current = null;
          setActiveComplexIdState(null);
          setActiveComplex(null);
          setActiveRole(null);
          try {
            localStorage.removeItem('activeComplexId');
          } catch (e) {}
          setLoading(false);
        }
      }
    };

    // Attach onSnapshot to every complex document AND member document in memberships
    const unsubs: Array<() => void> = [];

    for (const cid of complexIds) {
      const compRef = doc(db, 'complejos', cid);
      unsubs.push(
        onSnapshot(compRef, (snap) => {
          respondedComplexIds.add(cid);
          if (snap.exists()) {
            liveComplexMap[cid] = snap.data();
          } else {
            delete liveComplexMap[cid];
          }
          recomputeAuthorization();
        }, (err) => {
          console.warn(`[Auth] Real-time snapshot error for complejo ${cid}:`, err);
          respondedComplexIds.add(cid);
          delete liveComplexMap[cid];
          recomputeAuthorization();
        })
      );

      const memberRef = doc(db, 'complejos', cid, 'members', user.uid);
      unsubs.push(
        onSnapshot(memberRef, (snap) => {
          respondedMemberIds.add(cid);
          if (snap.exists()) {
            liveMemberMap[cid] = {
              exists: true,
              role: normalizeMemberRole(snap.data()?.role)
            };
          } else {
            liveMemberMap[cid] = { exists: false, role: null };
          }
          recomputeAuthorization();
        }, (err) => {
          console.warn(`[Auth] Real-time member snapshot error for complejo ${cid}:`, err);
          respondedMemberIds.add(cid);
          liveMemberMap[cid] = { exists: false, role: null };
          recomputeAuthorization();
        })
      );
    }

    return () => {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
      unsubs.forEach(u => u());
    };
  }, [user, memberships, collaboratorData?.activeComplexId, cleanupRevokedMemberships]);

  // 4. Real-Time Complex Membership & Active Role Listener:
  // Subscribes to complejos/{activeComplexId}/members/{user.uid}
  // - Auto-creates owner member record ONLY if activeComplex.ownerUid === user.uid.
  // - Synchronizes activeRole ('owner' | 'manager' | 'staff') in real-time.
  // - If member doc is removed/denied and user is not ownerUid: immediately revokes access & cleans collaborator doc.
  useEffect(() => {
    if (!user || !activeComplexId) {
      setActiveRole(null);
      return;
    }

    const memberDocRef = doc(db, 'complejos', activeComplexId, 'members', user.uid);
    const isOwnerByComplexUid = activeComplex?.ownerUid === user.uid;

    const revokeActiveComplexAccess = () => {
      const isInviteRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/');
      if (isInviteRoute) return;

      console.warn('[Members] User membership removed or not found. Revoking access for UID:', user.uid);
      cleanupRevokedMemberships(user.uid, [activeComplexId], memberships);

      setAuthorizedComplexes(prev => prev.filter(c => c.complexId !== activeComplexId));
      setHasAccess(false);
      activeComplexIdRef.current = null;
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole(null);
      try {
        localStorage.removeItem('activeComplexId');
      } catch (e) {}
    };

    const unsubMember = onSnapshot(memberDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const normalizedRole: ComplexUserRole = isOwnerByComplexUid
          ? 'owner'
          : normalizeMemberRole(data?.role);
        setActiveRole(normalizedRole);
      } else {
        if (isOwnerByComplexUid) {
          // Auto-provision owner member doc ONLY when complex.ownerUid === user.uid
          setActiveRole('owner');
          setDoc(memberDocRef, {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Propietario',
            photoURL: user.photoURL || null,
            role: 'owner',
            joinedAt: serverTimestamp()
          }, { merge: true }).catch((err) => {
            console.warn('[Members] Auto-provision owner member error:', err);
          });
        } else {
          revokeActiveComplexAccess();
        }
      }
    }, (err) => {
      console.warn('[Members] Real-time member listener error:', err);
      if (isOwnerByComplexUid) {
        setActiveRole('owner');
      } else {
        revokeActiveComplexAccess();
      }
    });

    return () => unsubMember();
  }, [user, activeComplexId, activeComplex?.ownerUid, memberships, cleanupRevokedMemberships]);

  /**
   * Switch active complex among the authorized complexes.
   * Never allows arbitrary complexIds.
   */
  const setActiveComplexId = useCallback((newId: string) => {
    if (!newId) return;

    // Security check: Must exist in authorizedComplexes
    const isAuthorized = authorizedComplexes.some(c => c.complexId === newId);
    if (!isAuthorized) {
      console.warn('[Auth] Denied switch to unauthorized complexId:', newId);
      return;
    }

    activeComplexIdRef.current = newId;
    setActiveComplexIdState(newId);
    try {
      localStorage.setItem('activeComplexId', newId);
    } catch (e) {}

    // Persist UI selection in collaborator profile
    if (user) {
      setDoc(doc(db, 'collaborators', user.uid), { 
        activeComplexId: newId,
        updatedAt: serverTimestamp() 
      }, { merge: true }).catch(() => {});
    }
  }, [authorizedComplexes, user]);

  const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
    try {
      setLoading(true);
      setAuthError(null);
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      return result.user;
    } catch (error: any) {
      const errorCode = error?.code || 'auth/unknown';
      const errorMessage = error?.message || 'Error desconocido';

      // Registro diagnóstico del error real de Firebase sin datos sensibles (sin tokens ni credenciales)
      console.error('[Auth Diagnostic] Fallo en signInWithGoogle:', {
        code: errorCode,
        message: errorMessage,
        name: error?.name,
        origin: typeof window !== 'undefined' ? window.location.origin : null,
        hostname: typeof window !== 'undefined' ? window.location.hostname : null
      });

      if (errorCode === 'auth/popup-closed-by-user') {
        setAuthError('La ventana de autenticación fue cerrada antes de completar el inicio de sesión (auth/popup-closed-by-user).');
      } else {
        setAuthError(errorMessage ? `${errorMessage} (${errorCode})` : `Error al iniciar sesión con Google (${errorCode}).`);
      }
      setLoading(false);
      return null;
    }
  };

  const logout = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('activeComplexId');
      }
      await signOut(auth);
      setUser(null);
      setCollaboratorData(null);
      setMemberships([]);
      setAuthorizedComplexes([]);
      setHasAccess(false);
      activeComplexIdRef.current = null;
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole(null);
      revokedCleanupAttemptedRef.current.clear();
      setAuthError(null);
    } catch (error) {
      console.error('[Auth] Error signing out:', error);
    }
  };

  const reloadCollaboratorData = async () => {
    // With onSnapshot active, state synchronizes automatically,
    // but we can touch state to trigger an immediate flush if needed
    if (user) {
      setLoading(true);
    }
  };

  const userEmail = user?.email?.toLowerCase() || '';
  const isAdmin = Boolean(user && SUPER_ADMIN_EMAILS.includes(userEmail));

  const activeComplejoName = activeComplex?.name || 
    activeComplex?.company || 
    (authorizedComplexes.find(c => c.complexId === activeComplexId)?.complexName) || 
    'Complejo Deportivo';

  return (
    <FirebaseContext.Provider 
      value={{ 
        user, 
        loading, 
        isAdmin, 
        hasAccess,
        authorizedComplexes,
        activeComplexId,
        activeComplejoName,
        activeComplex,
        collaboratorData,
        billingConfig,
        authError,
        activeRole,
        isOwner,
        isManager,
        isStaff,
        clearAuthError,
        signInWithGoogle, 
        logout,
        setActiveComplexId,
        reloadCollaboratorData
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
