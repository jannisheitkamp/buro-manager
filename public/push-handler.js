/* Push-Nachrichten im Service Worker anzeigen und beim Antippen die passende Seite öffnen.
   Wird vom generierten Service Worker per importScripts geladen. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Büro Manager', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Büro Manager';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Zahl am App-Symbol (wo unterstützt)
      self.navigator && 'setAppBadge' in self.navigator && data.badge ? self.navigator.setAppBadge(data.badge).catch(() => {}) : Promise.resolve(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
