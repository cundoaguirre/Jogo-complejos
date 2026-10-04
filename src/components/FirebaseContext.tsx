import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, testConnection, db } from '../lib/firebase';

export interface ComplexMembership {
  complexId: string;
  complexName: string;
  role: string;
}

export interface CollaboratorProfile {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  activeComplexId: string;
  memberships: ComplexMembership[];
  createdAt?: any;
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  activeComplexId: string | null;
  activeComplejoName: string;
  activeComplex: any | null;
  collaboratorData: CollaboratorProfile | null;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  setActiveComplexId: (complexId: string) => void;
  reloadCollaboratorData: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  activeComplexId: null,
  activeComplejoName: 'Complejo Deportivo',
  activeComplex: null,
  collaboratorData: null,
  signInWithGoogle: async () => null,
  logout: async () => {},
  setActiveComplexId: () => {},
  reloadCollaboratorData: async () => {},
});

const ADMIN_EMAILS = [
  'aguirrecundo@gmail.com', 
  'cundooaguirre@gmail.com', 
  'thekillerpro.fa@gmail.com'
];

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeComplexId, setActiveComplexIdState] = useState<string | null>(null);
  const [activeComplex, setActiveComplex] = useState<any | null>(null);
  const [collaboratorData, setCollaboratorData] = useState<CollaboratorProfile | null>(null);

  // Configure explicit browserLocalPersistence as required by Directiva Técnica
  useEffect(() => {
    try {
      setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn('[Auth] Error setting browserLocalPersistence:', err);
      });
    } catch (e) {
      console.warn('[Auth] Exception setting persistence:', e);
    }
  }, []);

  // Sync active complex metadata strictly from canonical collection 'complejos/{activeComplexId}'
  // ONLY if activeComplexId is valid and user is authenticated
  useEffect(() => {
    if (!activeComplexId || !user) {
      setActiveComplex(null);
      return;
    }

    try {
      const complexDocRef = doc(db, 'complejos', activeComplexId);
      const unsub = onSnapshot(complexDocRef, (snap) => {
        if (snap.exists()) {
          setActiveComplex({ id: snap.id, ...snap.data() });
        } else {
          setActiveComplex(null);
        }
      }, (err) => {
        console.warn('[Firestore] Error fetching active complex:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('[Firestore] Could not listen to complejos doc:', e);
    }
  }, [activeComplexId, user]);

  const loadCollaborator = useCallback(async (currentUser: FirebaseUser | null) => {
    if (!currentUser) {
      if (typeof window !== 'undefined' && localStorage.getItem('jogo_dev_bypass') === 'true') {
        const devAdmin = {
          uid: 'dev_admin',
          email: 'aguirrecundo@gmail.com',
          displayName: 'Admin Jogo',
          photoURL: null
        } as any;
        setUser(devAdmin);
        const adminColab: CollaboratorProfile = {
          uid: 'dev_admin',
          email: 'aguirrecundo@gmail.com',
          name: 'Admin Jogo',
          photoURL: null,
          activeComplexId: 'B',
          memberships: [{ complexId: 'B', complexName: 'Colo loco', role: 'owner' }]
        };
        setCollaboratorData(adminColab);
        setActiveComplexIdState('B');
        setLoading(false);
        return;
      }
      setCollaboratorData(null);
      setActiveComplexIdState(null);
      setActiveComplex(null);
      try {
        localStorage.removeItem('activeComplexId');
      } catch (e) {}
      setLoading(false);
      return;
    }

    try {
      const colabRef = doc(db, 'collaborators', currentUser.uid);
      const snap = await getDoc(colabRef);
      if (snap.exists()) {
        const data = snap.data() as CollaboratorProfile;
        setCollaboratorData(data);
        if (data.activeComplexId) {
          setActiveComplexIdState(data.activeComplexId);
          try {
            localStorage.setItem('activeComplexId', data.activeComplexId);
          } catch (e) {}
        } else {
          setActiveComplexIdState(null);
        }
      } else {
        // Check if admin email to auto-provision initial collaborator doc for 'B'
        const emailLower = (currentUser.email || '').toLowerCase();
        if (ADMIN_EMAILS.includes(emailLower)) {
          const adminColab: CollaboratorProfile = {
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Administrador',
            photoURL: currentUser.photoURL,
            activeComplexId: 'B',
            memberships: [{ complexId: 'B', complexName: 'Colo loco', role: 'owner' }],
            createdAt: serverTimestamp()
          };
          try {
            await setDoc(doc(db, 'collaborators', currentUser.uid), adminColab, { merge: true });
          } catch (e) {
            console.warn('[Collaborators] Error saving admin record:', e);
          }
          setCollaboratorData(adminColab);
          setActiveComplexIdState('B');
          try {
            localStorage.setItem('activeComplexId', 'B');
          } catch (e) {}
        } else {
          // Regular user without an assigned complex:
          // Do NOT assign complex 'B'. User must activate via code.
          setCollaboratorData(null);
          setActiveComplexIdState(null);
          try {
            localStorage.removeItem('activeComplexId');
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('[Collaborators] Error loading collaborator profile:', err);
      setCollaboratorData(null);
      setActiveComplexIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Validate connection to Firestore on initial boot
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadCollaborator(currentUser);
      } else {
        await loadCollaborator(null);
      }
    });

    return () => unsubscribe();
  }, [loadCollaborator]);

  const setActiveComplexId = useCallback((newId: string) => {
    if (!newId) return;
    setActiveComplexIdState(newId);
    try {
      localStorage.setItem('activeComplexId', newId);
    } catch (e) {}

    // Update in collaborator profile if logged in
    if (user) {
      try {
        setDoc(doc(db, 'collaborators', user.uid), { activeComplexId: newId }, { merge: true }).catch(() => {});
      } catch (e) {}
    }
  }, [user]);

  const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      await loadCollaborator(result.user);
      return result.user;
    } catch (error) {
      console.error('[Auth] Error signing in with Google:', error);
      setLoading(false);
      return null;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setCollaboratorData(null);
      setActiveComplexIdState(null);
      setActiveComplex(null);
      try {
        localStorage.removeItem('activeComplexId');
      } catch (e) {}
    } catch (error) {
      console.error('[Auth] Error signing out:', error);
    }
  };

  const reloadCollaboratorData = async () => {
    if (user) {
      await loadCollaborator(user);
    }
  };

  const userEmail = user?.email?.toLowerCase() || '';
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(userEmail));

  const activeComplejoName = activeComplex?.name || activeComplex?.company || (collaboratorData?.memberships?.[0]?.complexName) || 'Complejo Deportivo';

  return (
    <FirebaseContext.Provider 
      value={{ 
        user, 
        loading, 
        isAdmin, 
        activeComplexId,
        activeComplejoName,
        activeComplex,
        collaboratorData,
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
