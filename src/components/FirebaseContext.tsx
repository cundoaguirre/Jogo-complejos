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
  activeRole: ComplexUserRole;
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
  activeRole: 'owner',
  isOwner: true,
  isManager: false,
  isStaff: false,
  clearAuthError: () => {},
  signInWithGoogle: async () => null,
  logout: async () => {},
  setActiveComplexId: () => {},
  reloadCollaboratorData: async () => {},
});

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
  const [activeRole, setActiveRole] = useState<ComplexUserRole>('owner');
  const expirationTimerRef = useRef<NodeJS.Timeout | null>(null);

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
        setActiveComplexIdState(null);
        setActiveComplex(null);
        setActiveRole('owner');
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
        setActiveComplexIdState(null);
        setActiveComplex(null);
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
        setActiveComplexIdState(null);
        setActiveComplex(null);
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
      setLoading(false);
    });

    return () => unsubColab();
  }, [user]);

  // 3. Real-Time Complexes Status Listeners (Reactive Authorization):
  // Dynamically subscribes to onSnapshot on each complexId in memberships.
  // Evaluates canonical commercial authorization:
  // - active -> allowed
  // - trial && now < trialEndsAt -> allowed
  // - trial && now >= trialEndsAt -> DENIED
  // - paused -> DENIED
  // - inactive -> DENIED
  // Employs a targeted timer to flip authorization the exact moment a trial expires.
  useEffect(() => {
    if (!user || memberships.length === 0) {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
      setAuthorizedComplexes([]);
      setHasAccess(false);
      setActiveComplexIdState(null);
      setActiveComplex(null);
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
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setLoading(false);
      return;
    }

    // In-memory live mirror of complex documents
    const liveComplexMap: Record<string, any> = {};
    const respondedComplexIds = new Set<string>();

    const recomputeAuthorization = () => {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }

      const authorized: AuthorizedComplexItem[] = [];
      const nowMs = Date.now();
      const upcomingExpirations: number[] = [];

      for (const m of memberships) {
        const cData = liveComplexMap[m.complexId];
        if (!cData) continue;

        const rawStatus = (cData.clientStatus || '').toString().toLowerCase().trim();
        const isAuthorized = isComplexCommerciallyAuthorized(cData, nowMs);

        if (isAuthorized) {
          authorized.push({
            complexId: m.complexId,
            complexName: cData.name || cData.company || m.complexName || 'Mi Complejo',
            role: m.role || 'operator',
            clientStatus: rawStatus === 'active' ? 'active' : 'trial'
          });

          if (rawStatus === 'trial') {
            const expMs = parseTrialExpiration(cData.trialEndsAt || cData.trialEndDate);
            if (expMs !== null && expMs > nowMs) {
              upcomingExpirations.push(expMs);
            }
          }
        } else {
          console.log(`[Auth] Real-time: Complex ${m.complexId} clientStatus is "${rawStatus}" (authorized: false). Access disallowed.`);
        }
      }

      if (authorized.length > 0) {
        // At least one complex has active/trial status: ACCESS GRANTED
        // Select or retain activeComplexId strictly among authorized complexes
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

        // Update activeComplex metadata directly from real-time snapshot
        const currentDoc = liveComplexMap[chosenId];
        if (currentDoc) {
          setActiveComplex({ id: chosenId, ...currentDoc });
        }

        // Targeted expiration timer: flips state the exact moment the trial expires
        if (upcomingExpirations.length > 0) {
          const nextExpMs = Math.min(...upcomingExpirations);
          const delayMs = Math.min(2147483647, Math.max(100, nextExpMs - Date.now() + 500));
          console.log(`[Auth] Scheduled targeted trial expiration timer in ${Math.round(delayMs / 1000)}s.`);
          expirationTimerRef.current = setTimeout(() => {
            console.log('[Auth] Trial expiration timer fired! Recomputing authorization...');
            recomputeAuthorization();
          }, delayMs);
        }

        // Atomically set access, complex id and release loading in the exact same cycle
        setAuthorizedComplexes(authorized);
        setHasAccess(true);
        setActiveComplexIdState(chosenId);
        setLoading(false);
      } else {
        // Only if all complexes have responded at least once
        const allResponded = complexIds.every(id => respondedComplexIds.has(id));
        if (allResponded) {
          console.log('[Auth] Real-time: All complex snapshots received, none authorized. Setting hasAccess=false.');
          setAuthorizedComplexes([]);
          setHasAccess(false);
          setActiveComplexIdState(null);
          setActiveComplex(null);
          try {
            localStorage.removeItem('activeComplexId');
          } catch (e) {}
          setLoading(false);
        }
      }
    };

    // Attach onSnapshot to every complex document in memberships
    const unsubs = complexIds.map((cid) => {
      const compRef = doc(db, 'complejos', cid);
      return onSnapshot(compRef, (snap) => {
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
      });
    });

    return () => {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
      unsubs.forEach(u => u());
    };
  }, [user, memberships, collaboratorData?.activeComplexId]);

  // 4. Real-Time Complex Membership & Active Role Listener:
  // Subscribes to complejos/{activeComplexId}/members/{user.uid}
  // - Auto-creates owner member record if user is owner and no member doc exists.
  // - Synchronizes activeRole ('owner' | 'manager' | 'staff') in real-time.
  // - If member doc is removed by admin and user is not ownerUid: immediately clears access & kicks user out.
  useEffect(() => {
    if (!user || !activeComplexId) {
      setActiveRole('owner');
      return;
    }

    const memberDocRef = doc(db, 'complejos', activeComplexId, 'members', user.uid);

    // Check if the current user is owner according to venue profile, email, or memberships
    const isOwnerByComplex = activeComplex?.ownerUid === user.uid ||
      Boolean(activeComplex?.ownerEmail && user.email && activeComplex.ownerEmail.toLowerCase() === user.email.toLowerCase());
    const isOwnerByMembership = memberships.some(
      m => m.complexId === activeComplexId && (m.role === 'owner' || m.role === 'admin' || !m.role)
    );
    const isLikelyOwner = isOwnerByComplex || isOwnerByMembership;

    const unsubMember = onSnapshot(memberDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawRole = (data?.role || '').toString().toLowerCase().trim();
        const normalizedRole: ComplexUserRole = (rawRole === 'manager' || rawRole === 'encargado')
          ? 'manager'
          : (rawRole === 'staff')
            ? 'staff'
            : 'owner';
        setActiveRole(normalizedRole);
      } else {
        // Document does not exist
        if (isLikelyOwner) {
          // Auto-provision owner member doc
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
          const isInviteRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/');
          if (isInviteRoute) {
            return;
          }

          // Non-owner user whose member doc was deleted/does not exist:
          // Administrator removed this member from the complex!
          console.warn('[Members] User membership removed or not found. Revoking access for UID:', user.uid);

          // Clean up user's own collaborator document
          const remainingMemberships = memberships.filter(m => m.complexId !== activeComplexId);
          const remainingComplexIds = remainingMemberships.map(m => m.complexId);

          if (remainingMemberships.length === 0) {
            deleteDoc(doc(db, 'collaborators', user.uid)).catch(() => {
              setDoc(doc(db, 'collaborators', user.uid), {
                memberships: [],
                complexIds: [],
                activeComplexId: '',
                updatedAt: serverTimestamp()
              }, { merge: true }).catch(() => {});
            });
          } else {
            setDoc(doc(db, 'collaborators', user.uid), {
              memberships: remainingMemberships,
              complexIds: remainingComplexIds,
              activeComplexId: remainingMemberships[0].complexId,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(() => {});
          }

          // Immediately revoke session in memory without page reload
          setAuthorizedComplexes(prev => prev.filter(c => c.complexId !== activeComplexId));
          setHasAccess(false);
          setActiveComplexIdState(null);
          setActiveComplex(null);
          setActiveRole('owner');
          try {
            localStorage.removeItem('activeComplexId');
          } catch (e) {}
        }
      }
    }, (err) => {
      console.warn('[Members] Real-time member listener error:', err);
      // Fallback to owner if user is known owner
      if (isLikelyOwner) {
        setActiveRole('owner');
      }
    });

    return () => unsubMember();
  }, [user, activeComplexId, activeComplex?.ownerUid, activeComplex?.ownerEmail, memberships]);

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
      setActiveComplexIdState(null);
      setActiveComplex(null);
      setActiveRole('owner');
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
