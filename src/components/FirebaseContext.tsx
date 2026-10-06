import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, testConnection, db } from '../lib/firebase';
import { parseTrialExpiration, isComplexCommerciallyAuthorized } from '../lib/invitations';
import type { ComplexMembership, CollaboratorProfile, ComplexClientStatus } from '../types';

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
  authError: string | null;
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
  authError: null,
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
  const [activeComplex, setActiveComplex] = useState<any | null>(null);
  const [collaboratorData, setCollaboratorData] = useState<CollaboratorProfile | null>(null);
  const [memberships, setMemberships] = useState<ComplexMembership[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const expirationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
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
      setLoading(false);
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
      setLoading(false);
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

      setAuthorizedComplexes(authorized);

      if (authorized.length === 0) {
        // All user's complexes are inactive, paused or expired trial: ACCESS REVOKED IMMEDIATELY
        console.log('[Auth] Real-time: No authorized complexes with active/trial status. Setting hasAccess=false.');
        setHasAccess(false);
        setActiveComplexIdState(null);
        setActiveComplex(null);
        try {
          localStorage.removeItem('activeComplexId');
        } catch (e) {}
      } else {
        // At least one complex has active/trial status: ACCESS GRANTED
        setHasAccess(true);

        // Select or retain activeComplexId strictly among authorized complexes
        setActiveComplexIdState((prevId) => {
          let chosenId = authorized[0].complexId;
          let savedPref: string | null = null;
          try {
            savedPref = localStorage.getItem('activeComplexId');
          } catch (e) {}

          const candidate = prevId || collaboratorData?.activeComplexId || savedPref;
          if (candidate && authorized.some(c => c.complexId === candidate)) {
            chosenId = candidate;
          }

          try {
            localStorage.setItem('activeComplexId', chosenId);
          } catch (e) {}

          // Update activeComplex metadata directly from real-time snapshot
          const currentDoc = liveComplexMap[chosenId];
          if (currentDoc) {
            setActiveComplex({ id: chosenId, ...currentDoc });
          }

          return chosenId;
        });

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
      }

      setLoading(false);
    };

    // Attach onSnapshot to every complex document in memberships
    const unsubs = complexIds.map((cid) => {
      const compRef = doc(db, 'complejos', cid);
      return onSnapshot(compRef, (snap) => {
        if (snap.exists()) {
          liveComplexMap[cid] = snap.data();
        } else {
          delete liveComplexMap[cid];
        }
        recomputeAuthorization();
      }, (err) => {
        console.warn(`[Auth] Real-time snapshot error for complejo ${cid}:`, err);
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
      const errorCode = error?.code || '';
      const errorMessage = error?.message || '';

      if (errorCode === 'auth/popup-closed-by-user') {
        console.warn('[Auth] Google sign-in popup closed by user.');
        setAuthError('popup-closed');
      } else {
        console.warn('[Auth] Google Sign-in warning:', errorMessage);
        setAuthError(errorMessage || 'Error al iniciar sesión con Google.');
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
        authError,
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
