/**
 * Service Worker Offline-First para TerraCafé
 * Garante que a aplicação abra e funcione mesmo sem nenhuma conexão à internet.
 */

const CACHE_VERSION = "terracafe-sw-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

// Rotas essenciais para pré-cache na instalação
const PRECACHE_URLS = [
  "/",
  "/irrigacao/diario-campo",
  "/irrigacao/execucao",
  "/irrigacao/concluidos",
  "/visao-geral",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.svg",
  "/logo-terra-cafe.png",
  "/logo-terra-cafe-white.png"
];

// Instalação: baixa os arquivos fundamentais para a memória do aparelho
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Tenta fazer o pré-cache de cada URL individualmente para não falhar tudo se alguma rota não responder
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch {
            // Best-effort no pré-cache
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Ativação: assume o controle de abas abertas e limpa versões antigas de cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith("terracafe-sw-") && !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições de rede
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignora requisições de outros domínios
  if (url.origin !== self.location.origin) return;

  // 2. Sessão do NextAuth: permite carregar o usuário autenticado offline sem deslogar
  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkRes.clone());
            return networkRes;
          }
        } catch {
          // Sem rede — busca a última sessão válida em cache
        }
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
        });
      })()
    );
    return;
  }

  // 3. Não intercepta outras requisições de API no Service Worker
  // O app possui o 'offlineFetch' com IndexedDB para gerenciar a fila e o cache das APIs de forma transacional
  if (url.pathname.startsWith("/api/")) return;

  // 3. Navegação de páginas HTML (ex: abrir tela do Diário de Campo)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Tenta buscar da rede primeiro para ter a versão mais recente
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(request, networkRes.clone());
            return networkRes;
          }
        } catch {
          // Sem rede — busca a página no cache
        }

        // Tenta achar a rota exata no cache de páginas ou no cache estático
        const cachedPage = await caches.match(request);
        if (cachedPage) return cachedPage;

        // Tenta rota sem query string
        const cachedClean = await caches.match(url.pathname);
        if (cachedClean) return cachedClean;

        // Se navegou para sub-rota não cacheada, serve a tela inicial ou fallback
        const homeFallback = await caches.match("/");
        if (homeFallback) return homeFallback;

        // Resposta sintética amigável caso não haja nada em cache
        return new Response(
          `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TerraCafé Offline</title><style>body{background:#070c18;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center}h1{color:#10b981;font-size:20px;margin-bottom:8px}p{color:#94a3b8;font-size:14px;max-width:380px;line-height:1.5}button{margin-top:16px;padding:10px 20px;border-radius:12px;background:#10b981;color:#fff;border:none;font-weight:600;cursor:pointer}</style></head><body><div><h1>TerraCafé — Modo Offline</h1><p>Você está sem conexão com a internet. O aplicativo está disponível na memória local.</p><button onclick="window.location.reload()">Tentar Novamente</button></div></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })()
    );
    return;
  }

  // 4. Arquivos estáticos do Next.js (/_next/static/**) e mídias estáticas
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch {
          return new Response("", { status: 408, statusText: "Offline" });
        }
      })
    );
    return;
  }
});
