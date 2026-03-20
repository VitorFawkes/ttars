// Service Worker — Web Push Notifications (WelcomeCRM)
// Minimal: só escuta push events e notification clicks

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'WelcomeCRM', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || data.type || 'default',
    data: { url: data.url || '/' },
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'WelcomeCRM', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Foca aba existente do CRM se houver
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Senão, abre nova aba
      return clients.openWindow(url);
    })
  );
});
