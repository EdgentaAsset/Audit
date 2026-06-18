/* Service Worker — App Audit Aset HoSZA
 * Naikkan VERSION setiap kali deploy (atau bila Data.xlsx/app-data.js dikemas kini)
 * supaya pengguna dapat versi terbaharu secara automatik.
 */
const VERSION = 'hosza-audit-202606190100';
const SHELL = [
  './',
  './index.html',
  './app-data.js',
  './zxing.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {})
  );
  // Jangan auto-skipWaiting — tunggu pengguna tekan "Muat Semula"
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Hanya kendali permintaan same-origin (app shell + data).
  // Backend (Apps Script), ZXing CDN, SharePoint dll. biar terus ke rangkaian.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate: pulang dari cache (laju/offline), kemas kini di latar.
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
