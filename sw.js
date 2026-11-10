'use strict';
/* KR BURGER & PIZZA — service worker sin dependencias (v11).
   Shell (HTML/CSS/JS/manifest) network-first: al recargar siempre se ve la última versión.
   Imágenes y fuentes cache-first (rápidas, offline); ./data/ network-first.
   Nada bajo /app/ se cachea a propósito (admin y scripts del taller).
   Al cambiar un asset estático, subir VERSION para limpiar las cachés viejas. */
const VERSION = 'v11';
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
// El "shell" es lo que define la versión visual: se pide a la red primero.
const SHELL = /\.(?:html|css|js|json)$/i;

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

function guardarEn(cache, peticion, respuesta) {
  const copia = respuesta.clone();
  caches.open(cache).then((abierta) => abierta.put(peticion, copia));
  return respuesta;
}

function respaldo(peticion, mensaje) {
  return caches
    .match(peticion)
    .then((cacheada) => cacheada || new Response('', { status: 503, statusText: mensaje }));
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/app/')) return;

  // Datos del menú: siempre intenta la red y guarda una copia (respaldo offline).
  if (url.pathname.includes('/data/')) {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => guardarEn(CACHE_DATOS, peticion, respuesta))
        .catch(() => respaldo(peticion, 'Sin conexión'))
    );
    return;
  }

  const esShell =
    peticion.mode === 'navigate' ||
    peticion.destination === 'document' ||
    SHELL.test(url.pathname);

  // Shell: network-first para que un reload traiga el diseño/fotos actualizados.
  if (esShell) {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => guardarEn(CACHE_ESTATICOS, peticion, respuesta))
        .catch(() => respaldo(peticion, 'Sin conexión'))
    );
    return;
  }

  // Imágenes: cache-first (con la versión se invalidan cuando cambian).
  evento.respondWith(
    caches.match(peticion).then(
      (cacheada) =>
        cacheada ||
        fetch(peticion).then((respuesta) => guardarEn(CACHE_ESTATICOS, peticion, respuesta))
    )
  );
});
