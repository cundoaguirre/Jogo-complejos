import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, app } from './firebase';

const VAPID_KEY = 'BE3J8LZglBVz5jSV3i-SvzARqRfUP2P9VEOMGR4gBBa_UhEJpu4SXCETPZ9ptmm007ZGXpWowrhN1TJpi3rBMiw';

export async function requestNotificationPermissionAndGetToken(complexId: string): Promise<string | null> {
  try {
    if (typeof window === 'undefined') return null;

    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Notificaciones Push no soportadas en este navegador.');
      return null;
    }

    if (!('Notification' in window)) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Permiso de notificaciones denegado por el usuario.');
      return null;
    }

    // Registrar el service worker si no está activo
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token && complexId) {
      const tokenRef = doc(db, 'complejos', complexId, 'fcm_tokens', token);
      await setDoc(tokenRef, {
        token,
        complexId,
        platform: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });

      console.log('[FCM] Token registrado con éxito para el complejo:', complexId);
      return token;
    }
    return null;
  } catch (error) {
    console.error('[FCM] Error al solicitar token de notificación:', error);
    return null;
  }
}

export async function initForegroundNotificationListener(onNotificationReceived?: (payload: any) => void) {
  try {
    if (typeof window === 'undefined') return;

    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log('[FCM] Notificación recibida en primer plano:', payload);
      onNotificationReceived?.(payload);
    });
  } catch (err) {
    console.warn('[FCM] Error inicializando listener foreground:', err);
  }
}
