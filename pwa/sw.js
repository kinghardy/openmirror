// Party app service worker: keeps the app shell for an instant open, shows a friendly screen when the mirror can't be reached, and shows push notifications.
const V = 'party-v1', SHELL = ['/', '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png'];
const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0b0a14;color:#f4f2ff;font:18px/1.5 -apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><div><div style="font-size:60px">📡</div><h2>Can\'t reach the mirror</h2><p style="color:#9a97b8">Check that you\'re on the home Wi-Fi (or connected to Tailscale), then pull down to retry.</p></div>';
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/sw.js') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.pathname === '/' || u.pathname.startsWith('/pwa/') || u.pathname === '/manifest.webmanifest')) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || (u.pathname === '/' ? new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } }) : Response.error()))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (x) { d = { title: 'Party', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Party', { body: d.body || '', icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png', tag: d.tag || undefined, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => 'focus' in x); return c ? c.focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || '/'); }));
});
