importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
    apiKey: "AIzaSyBM3h7T1Z_rSJfZRBhD71JHYJW7LweOHqc",
    authDomain: "cartao-de-ponto-5e801.firebaseapp.com",
    projectId: "cartao-de-ponto-5e801",
    storageBucket: "cartao-de-ponto-5e801.firebasestorage.app",
    messagingSenderId: "500861704454",
    appId: "1:500861704454:web:ac2fa633223078ff15e687",
    measurementId: "G-KTDZ3SR7FL"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon-192x192.png', // Fallback to standard PWA icon if specific logo not found
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification click Received.', event);
    event.notification.close();
    // Open the app
    event.waitUntil(
        clients.openWindow('/')
    );
});
