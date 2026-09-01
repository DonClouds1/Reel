// service-worker.js — cache dell'app shell per installabilità e uso offline.
// Le tracce audio vivono in IndexedDB, non nella cache HTTP: restano disponibili
// offline indipendentemente da questo service worker.
//
// NOTA IMPORTANTE (fix bug iOS): Safari in modalità standalone rifiuta di servire
// una risposta che ha subito un redirect ("response served by service worker has
// redirections"). Cloudflare Pages a volte redirige la richiesta alla root "/" verso
// "/index.html" internamente, quindi la risposta memorizzata con cache.addAll normale
// arriva già "marcata" come redirected. Per questo qui ogni file viene scaricato e
// ricostruito come Response pulita prima di essere salvato in cache.
 
const CACHE_NAME = 'reel-shell-v3';
const SHELL_FILES = [
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
 
async function cachePutClean(cache, url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) return;
 
  if (response.redirected) {
    // Ricostruisce una Response "pulita" (senza il flag redirected) prima di salvarla.
    const body = await response.blob();
    const cleanResponse = new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: response.headers,
    });
    await cache.put(url, cleanResponse);
  } else {
    await cache.put(url, response.clone());
  }
}
 
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL_FILES.map((url) => cachePutClean(cache, url)))
    )
  );
  self.skipWaiting();
});
 
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});
 
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
 
  // Non intercettare le chiamate API (ricerca/conversione): devono sempre andare in rete.
  if (url.pathname.startsWith('/api/')) return;
 
  // Le richieste di navigazione (apertura dell'app) vengono sempre servite con
  // index.html dalla cache, per evitare di inoltrare al service worker un redirect
  // sulla root "/" — la causa del problema riscontrato su iOS.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(event.request))
    );
    return;
  }
 
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
 
