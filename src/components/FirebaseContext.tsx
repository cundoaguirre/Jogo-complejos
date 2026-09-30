import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
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
  activeComplexId: string;
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
  activeComplexId: 'complejo_central',
  activeComplex: null,
  collaboratorData: null,
  signInWithGoogle: async () => null,
  logout: async () => {},
  setActiveComplexId: () => {},
  reloadCollaboratorData: async () => {},
});

const ADMIN_EMAILS = ['aguirrecundo@gmail.com', 'thekillerpro.fa@gmail.com'];

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeComplexId, setActiveComplexIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('activeComplexId');
        if (saved) return saved;
      } catch (e) {}
    }
    return 'complejo_central';
  });
  const [activeComplex, setActiveComplex] = useState<any | null>(null);
  const [collaboratorData, setCollaboratorData] = useState<CollaboratorProfile | null>(null);

  // Sync active complex metadata from Firestore 'complexes'
  useEffect(() => {
    if (!activeComplexId || activeComplexId === 'complejo_central') {
      setActiveComplex(null);
      return;
    }

    try {
      const complexDocRef = doc(db, 'complexes', activeComplexId);
      const unsub = onSnapshot(complexDocRef, (snap) => {
        if (snap.exists()) {
          setActiveComplex({ id: snap.id, ...snap.data() });
        } else {
          setActiveComplex(null);
        }
      }, (err) => {
        console.warn('Error fetching active complex:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Could not listen to complex doc:', e);
    }
  }, [activeComplexId]);

  const loadCollaborator = useCallback(async (currentUser: FirebaseUser | null) => {
    if (!currentUser) {
      setCollaboratorData(null);
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
        }
      }
    } catch (err) {
      console.warn('Error loading collaborator profile:', err);
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
        setCollaboratorData(null);
      }
      setLoading(false);
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
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      await loadCollaborator(result.user);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      return null;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setCollaboratorData(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const reloadCollaboratorData = async () => {
    if (user) {
      await loadCollaborator(user);
    }
  };

  const userEmail = user?.email?.toLowerCase() || '';
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(userEmail));

  return (
    <FirebaseContext.Provider 
      value={{ 
        user, 
        loading, 
        isAdmin, 
        activeComplexId,
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
