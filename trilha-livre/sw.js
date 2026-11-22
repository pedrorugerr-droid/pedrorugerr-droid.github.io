// Service worker: app livre inteiro offline. Lista e versão vêm do build (construir.js).
// Só guarda os arquivos do próprio app. O app livre não fala com nenhum servidor.
const VERSAO = "trilha-livre-ce706da77d6f";
const ARQUIVOS = [
 "./",
 "app.js",
 "base.css",
 "comum/armazem.js",
 "comum/pacote.js",
 "comum/telas.js",
 "dados/publico.json",
 "estado.js",
 "estilo.css",
 "fontes/inter-latin-400-normal.woff2",
 "fontes/inter-latin-600-normal.woff2",
 "fontes/inter-latin-700-normal.woff2",
 "fontes/inter-latin-ext-400-normal.woff2",
 "fontes/inter-latin-ext-600-normal.woff2",
 "fontes/inter-latin-ext-700-normal.woff2",
 "fontes/space-grotesk-latin-500-normal.woff2",
 "fontes/space-grotesk-latin-700-normal.woff2",
 "fontes/space-grotesk-latin-ext-500-normal.woff2",
 "fontes/space-grotesk-latin-ext-700-normal.woff2",
 "icone-180.png",
 "icone-192.png",
 "icone-512.png",
 "icone.svg",
 "index.html",
 "instalar.js",
 "licenca.js",
 "logica.js",
 "manifest.webmanifest",
 "nativo.js",
 "paciente/web/logica.js",
 "textos.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
