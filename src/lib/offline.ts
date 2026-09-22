/**
 * Persistência offline — fila de sincronização de mutações.
 *
 * - `offlineFetch` substitui o `fetch` nas chamadas do cliente:
 *   - GET: em caso de falha de rede, devolve a última resposta boa guardada em cache.
 *   - POST/PUT/PATCH/DELETE: em caso de falha de rede, guarda a requisição numa fila
 *     persistida (localStorage) e devolve uma resposta sintética 202 (`offlineQueued: true`).
 *     Rejeições do SERVIDOR (respostas HTTP de erro) NÃO são enfileiradas — só falhas de rede.
 * - `flushOfflineQueue` reenvia as mutações pendentes (FIFO) quando a conexão volta,
 *   preservando a ordem original das alterações.
 */

const QUEUE_KEY = "offline_sync_queue_v1";
const CACHE_KEY = "offline_http_cache_v1";
const MAX_CACHE_ENTRIES = 40;
const MAX_ATTEMPTS = 10;

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  attempts: number;
}

export interface FlushResult {
  sent: number;
  failed: number;
  pending: number;
}

type OfflineListener = () => void;
const listeners = new Set<OfflineListener>();

/** Assina mudanças na fila/conexão. Retorna função para cancelar. */
export function subscribe(listener: OfflineListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // noop
    }
  });
}

export function isOnline(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function readQueue(): QueuedRequest[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedRequest[]) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("[offline] Falha ao persistir fila de sincronização:", e);
  }
  notify();
}

export function getPendingCount(): number {
  return readQueue().length;
}

export function getPendingRequests(): QueuedRequest[] {
  return readQueue();
}

interface CacheEntry {
  status: number;
  body: string;
  ts: number;
}

function readCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, MAX_CACHE_ENTRIES);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Cota cheia — descarta o cache (é best-effort) e segue
    try {
      window.localStorage.removeItem(CACHE_KEY);
    } catch {
      // noop
    }
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k] = v;
    });
  } else if (Array.isArray(headers)) {
    (headers as Array<[string, string]>).forEach(([k, v]) => {
      out[k] = v;
    });
  } else {
    Object.entries(headers).forEach(([k, v]) => {
      out[k] = v;
    });
  }
  return out;
}

function syntheticJsonResponse(
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function enqueueRequest(url: string, method: string, options: RequestInit): QueuedRequest {
  const item: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    url,
    method,
    headers: normalizeHeaders(options.headers),
    body: typeof options.body === "string" ? options.body : null,
    createdAt: Date.now(),
    attempts: 0,
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  return item;
}

function isNonSerializableBody(body: RequestInit["body"]): boolean {
  return body != null && typeof body !== "string";
}

/**
 * Drop-in de `fetch` com persistência offline.
 * Comportamento online é idêntico ao `fetch` original.
 */
export async function offlineFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  if (!isOnline()) {
    if (isMutation) {
      if (isNonSerializableBody(options.body)) {
        throw new Error("Offline: upload de arquivos requer conexão.");
      }
      enqueueRequest(url, method, options);
      return syntheticJsonResponse(
        202,
        { ok: true, offlineQueued: true },
        { "X-Offline-Queued": "1" }
      );
    }
    const cached = readCache()[url];
    if (cached) {
      try {
        return syntheticJsonResponse(cached.status, JSON.parse(cached.body), {
          "X-Offline-Cache": "1",
        });
      } catch {
        // Cache corrompido — trata como inexistente
      }
    }
    throw new Error("Offline e sem dados em cache para esta requisição.");
  }

  try {
    const res = await fetch(url, options);
    if (!isMutation && res.ok) {
      try {
        const body = await res.clone().text();
        const cache = readCache();
        cache[url] = { status: res.status, body, ts: Date.now() };
        writeCache(cache);
      } catch {
        // Cache é best-effort
      }
    }
    return res;
  } catch (networkError) {
    if (!isMutation) {
      const cached = readCache()[url];
      if (cached) {
        try {
          return syntheticJsonResponse(cached.status, JSON.parse(cached.body), {
            "X-Offline-Cache": "1",
          });
        } catch {
          // Cache corrompido — propaga o erro original
        }
      }
      throw networkError;
    }
    if (isNonSerializableBody(options.body)) {
      throw networkError; // FormData/Blob não pode ser enfileirado
    }
    enqueueRequest(url, method, options);
    return syntheticJsonResponse(
      202,
      { ok: true, offlineQueued: true },
      { "X-Offline-Queued": "1" }
    );
  }
}

let flushing = false;

/**
 * Reenvia (FIFO) as mutações enfileiradas enquanto estiver offline.
 * - 2xx: remove da fila.
 * - 4xx: rejeição permanente — descarta para não travar a fila.
 * - 5xx: mantém para tentar novamente depois.
 * - Falha de rede: interrompe e mantém o restante na fila, preservando a ordem.
 */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (flushing || !isOnline()) {
    return { sent: 0, failed: 0, pending: getPendingCount() };
  }
  const queue = readQueue();
  if (queue.length === 0) {
    return { sent: 0, failed: 0, pending: 0 };
  }

  flushing = true;
  notify();

  const remaining: QueuedRequest[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ?? undefined,
      });
      if (res.ok) {
        sent++;
      } else if (res.status >= 400 && res.status < 500) {
        failed++;
      } else {
        item.attempts += 1;
        if (item.attempts < MAX_ATTEMPTS) remaining.push(item);
        else failed++;
      }
    } catch {
      // Ainda sem rede — mantém o item atual e todo o restante na fila
      item.attempts += 1;
      if (item.attempts < MAX_ATTEMPTS) remaining.push(item);
      else failed++;
      for (const rest of queue.slice(i + 1)) remaining.push(rest);
      break;
    }
  }

  writeQueue(remaining);
  flushing = false;
  notify();
  return { sent, failed, pending: remaining.length };
}
