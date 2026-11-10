'use strict';
/* KR BURGER & PIZZA — service worker sin dependencias (v8).
   Cache-first para los estáticos de la cápsula y network-first para ./data/.
   Nada bajo /app/ se cachea a propósito (admin y scripts del taller).
   VERSION v8 invalida los caches anteriores (fotos nuevas de productos). */
const VERSION = 'v8';
const CACHE_ESTATICOS = `kr-burger-estaticos-${VERSION}`;
const CACHE_DATOS = `kr-burger-datos-${VERSION}`;
const ESTATICOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'assets/ui/icono-192.png',
  'assets/ui/icono-512.png',
  'assets/ui/poster.jpg',
  'assets/ui/logo-cabecera.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ESTATICOS)
      .then((cache) => cache.addAll(ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((clave) => ![CACHE_ESTATICOS, CACHE_DATOS].includes(clave))
            .map((clave) => caches.delete(clave))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/app/')) return;
  if (url.pathname.includes('/data/')) {
    // Network-first: el menú se actualiza desde el taller; la copia local es el respaldo.
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_DATOS).then((cache) => cache.put(peticion, copia));
          return respuesta;
        })
        .catch(() =>
          caches
            .match(peticion)
            .then((cacheada) => cacheada || new Response('', { status: 503, statusText: 'Sin conexión' }))
        )
    );
    return;
  }
  // Cache-first para los estáticos.
  evento.respondWith(
    caches.match(peticion).then(
      (cacheada) =>
        cacheada ||
        fetch(peticion).then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_ESTATICOS).then((cache) => cache.put(peticion, copia));
          return respuesta;
        })
    )
  );
});
