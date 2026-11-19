import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Explicitly target the shared Firestore database instance from firebase-applet-config.json
export const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId ||
  'ai-studio-apidegestindecli-29cae824-e5de-47b3-b428-1f598e3f8424';

function createFirestoreInstance(): Firestore {
  try {
    // Force long-polling to avoid WebChannel/HTTP2 stream stalls in proxied/iframe environments
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      FIRESTORE_DATABASE_ID
    );
  } catch {
    return getFirestore(app, FIRESTORE_DATABASE_ID);
  }
}

export const db = createFirestoreInstance(); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Force account selection so users with multiple Google accounts can choose which one to sign in with
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

let connectionTestPromise: Promise<void> | null = null;

export async function testConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  if (connectionTestPromise) return connectionTestPromise;

  connectionTestPromise = (async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log('Connected to Firestore database instance:', FIRESTORE_DATABASE_ID);
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn(
          'Firestore backend unreachable (offline mode). Retrying automatically when network stabilizes. Database:',
          FIRESTORE_DATABASE_ID
        );
      }
    } finally {
      connectionTestPromise = null;
    }
  })();

  return connectionTestPromise;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { signInWithPopup, signOut };
