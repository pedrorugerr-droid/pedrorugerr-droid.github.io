/* Service worker do aplicativo Mindfulness-IBE.
   Rede primeiro (para que versões novas apareçam logo) e cópia local quando não há internet.
   Ao mudar qualquer arquivo do aplicativo, aumente VERSAO. */
var VERSAO = 'mindfulness-app-v1';
var ARQUIVOS = [
  './', 'index.html', 'app.css', 'regras.js', 'pdf.js', 'app.js',
  'protocolo.json', 'instrumentos.json', 'manifest.webmanifest',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-512.png', 'icones/apple-touch-icon.png'
];
self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n.indexOf('mindfulness-app-') === 0 && n !== VERSAO; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/mindfulness-app/') !== 0) return;
  ev.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(VERSAO).then(function (c) { c.put(req, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        return r || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
      });
    })
  );
});
