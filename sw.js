// Offline cache for the app shell. Videos always come from the network.
const VERSION = 'termed-v5';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js', 'js/state.js', 'js/db.js', 'js/util.js', 'js/ui.js', 'js/icons.js', 'js/views.js', 'js/food.js',
  'js/workout.js', 'js/coach.js', 'js/photos.js', 'js/importer.js', 'js/pdf-text.js', 'js/docx-text.js', 'js/parse-training.js', 'js/parse-nutrition.js',
  'js/figure.js', 'js/exercises.js', 'js/exview.js', 'js/activities.js', 'js/run.js', 'js/plan-views.js', 'js/habits.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'vendor/fonts/instrument-sans-latin-400-normal.woff2', 'vendor/fonts/instrument-sans-latin-500-normal.woff2',
  'vendor/fonts/instrument-sans-latin-600-normal.woff2', 'vendor/fonts/instrument-sans-latin-ext-400-normal.woff2',
  'vendor/fonts/instrument-sans-latin-ext-500-normal.woff2', 'vendor/fonts/instrument-sans-latin-ext-600-normal.woff2',
  'vendor/fonts/jetbrains-mono-latin-400-normal.woff2', 'vendor/fonts/jetbrains-mono-latin-500-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for the app's own files, so updates arrive; cache as fallback offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
