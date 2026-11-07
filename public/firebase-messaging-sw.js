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
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Jogo';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Nueva actualización en tu complejo',
    icon: '/logo-white.png',
    badge: '/logo-white.png',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
