importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCSUXe7oQjQEPAXjG0ktDmUjWCVLVUXEk0",
  authDomain: "crm-jogo-76af9.firebaseapp.com",
  projectId: "crm-jogo-76af9",
  storageBucket: "crm-jogo-76af9.firebasestorage.app",
  messagingSenderId: "942487451950",
  appId: "1:942487451950:web:b1ebe0acb3769443f962bf"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Si payload.notification ya existe, el navegador muestra la notificación automáticamente.
  // NO ejecutar showNotification para evitar duplicados.
  if (payload.notification) {
    return;
  }

  // Notificación manual para data-messages con el logo verde oficial de Jogo
  const notificationTitle = payload.data?.title || 'Jogo';
  const notificationOptions = {
    body: payload.data?.body || 'Nueva actualización en tu complejo',
    icon: '/Logo-jogo-verde.jpg',
    badge: '/Logo-jogo-verde.jpg',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Obtener enlace destino provisto en payload.data o fcmOptions
  const targetUrl = event.notification?.data?.url ||
                    event.notification?.data?.link ||
                    event.notification?.data?.click_action ||
                    event.notification?.data?.fcmOptions?.link ||
                    '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) {
          if (client.url && targetUrl !== '/' && !client.url.includes(targetUrl) && 'navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
