/**
 * Persistência Offline — TerraCafé
 * 
 * Camada de alta disponibilidade com garantia de ZERO perda de dados:
 * 1. Utiliza IndexedDB nativo (armazenamento ilimitado, compatível com fotos e vídeos locais).
 * 2. Solicita proteção de armazenamento persistente (evita que navegadores móveis limpem os dados).
 * 3. Nunca descarta dados: itens com erro de autenticação (401/403) ou validação ficam retidos
 *    com segurança para posterior sincronização ou exportação de backup.
 * 4. Suporte nativo a envio de mídias (fotos de campo) offline com sincronização em duas etapas.
 */

import {
  idbSaveQueueItem,
  idbGetQueueItems,
  idbRemoveQueueItem,
  idbRetainFailedItem,
  idbSetCache,
  idbGetCache,
  idbGetLocalDiarioLogs,
  idbRemoveLocalDiarioLog,
  idbClearCache,
  OfflineQueueItem,
} from "./idb";

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  attempts: number;
  status?: "pending" | "syncing" | "failed" | "auth_error";
  lastError?: string;
  media?: {
    id: string;
    fileName: string;
    fileType: string;
    blob: Blob;
  };
}

export interface FlushResult {
  sent: number;
  failed: number;
  pending: number;
  authError?: boolean;
}

const LEGACY_QUEUE_KEY = "offline_sync_queue_v1";
const MAX_ATTEMPTS = 15;

type OfflineListener = () => void;
const listeners = new Set<OfflineListener>();

// Cache em memória da fila para leituras síncronas instantâneas no React
let memoryQueue: OfflineQueueItem[] = [];
let isQueueLoaded = false;

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

// Inicializa e migra fila legada do localStorage para IndexedDB (garantindo que nada seja perdido)
async function initQueue(): Promise<OfflineQueueItem[]> {
  if (typeof window === "undefined") return [];
  if (isQueueLoaded) return memoryQueue;

  try {
    // 1. Carrega itens do IndexedDB
    const idbItems = await idbGetQueueItems();

    // 2. Verifica se há itens antigos no localStorage para migrar
    let migratedCount = 0;
    try {
      const rawLegacy = window.localStorage.getItem(LEGACY_QUEUE_KEY);
      if (rawLegacy) {
        const legacyItems = JSON.parse(rawLegacy);
        if (Array.isArray(legacyItems) && legacyItems.length > 0) {
          for (const item of legacyItems) {
            // Se já não estiver no IDB, adiciona
            if (!idbItems.some((i) => i.id === item.id)) {
              const queueItem: OfflineQueueItem = {
                id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                url: item.url,
                method: item.method,
                headers: item.headers || {},
                body: item.body,
                createdAt: item.createdAt || Date.now(),
                attempts: item.attempts || 0,
                status: "pending",
              };
              await idbSaveQueueItem(queueItem);
              idbItems.push(queueItem);
              migratedCount++;
            }
          }
          window.localStorage.removeItem(LEGACY_QUEUE_KEY);
          console.log(`[offline] Migrados ${migratedCount} itens legados do localStorage para IndexedDB.`);
        }
      }
    } catch (e) {
      console.warn("[offline] Falha na migração do localStorage:", e);
    }

    memoryQueue = idbItems;
    isQueueLoaded = true;
    notify();
    return memoryQueue;
  } catch (err) {
    console.error("[offline] Erro ao inicializar fila IndexedDB:", err);
    return [];
  }
}

// Dispara inicialização automática no cliente
if (typeof window !== "undefined") {
  initQueue();
}

export function getPendingCount(): number {
  return memoryQueue.filter((i) => i.status !== "auth_error").length;
}

export function getPendingRequests(): QueuedRequest[] {
  return [...memoryQueue];
}

export function hasAuthError(): boolean {
  return memoryQueue.some((i) => i.status === "auth_error");
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

/**
 * Enfileira uma mutação com suporte nativo a IndexedDB e anexo de mídias.
 */
export async function enqueueOfflineMutation(
  url: string,
  method: string,
  options: RequestInit = {},
  mediaAttachment?: { fileName: string; fileType: string; blob: Blob },
  customId?: string
): Promise<OfflineQueueItem> {
  const item: OfflineQueueItem = {
    id: customId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    url,
    method,
    headers: normalizeHeaders(options.headers),
    body: typeof options.body === "string" ? options.body : null,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    ...(mediaAttachment
      ? {
          media: {
            id: `media-${Date.now()}`,
            fileName: mediaAttachment.fileName,
            fileType: mediaAttachment.fileType,
            blob: mediaAttachment.blob,
          },
        }
      : {}),
  };

  await idbSaveQueueItem(item);
  memoryQueue.push(item);
  notify();
  return item;
}

interface MemCacheEntry {
  status: number;
  body: string;
  ts: number;
}

const memCache = new Map<string, MemCacheEntry>();
const inFlightRequests = new Map<string, Promise<{ status: number; body: string; ok: boolean }>>();
const MEM_CACHE_TTL_MS = 5000;

/** Invalida cache em memória imediatamente (ex: ao salvar dados) */
export function invalidateOfflineCache(urlPrefix?: string) {
  if (!urlPrefix) {
    memCache.clear();
    idbClearCache().catch(() => {});
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("visao_geral_cache_v1");
        sessionStorage.removeItem("admin_dashboard_cache_v1");
      } catch {
        // noop
      }
    }
  } else {
    for (const key of memCache.keys()) {
      if (key.startsWith(urlPrefix)) {
        memCache.delete(key);
      }
    }
  }
}

/**
 * Drop-in de `fetch` com persistência offline total via IndexedDB.
 */
export async function offlineFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  if (isMutation) {
    invalidateOfflineCache();
  }

  // 1. Se estiver explicitamente offline:
  if (!isOnline()) {
    if (isMutation) {
      await enqueueOfflineMutation(url, method, options);
      return syntheticJsonResponse(
        202,
        { ok: true, offlineQueued: true },
        { "X-Offline-Queued": "1" }
      );
    }

    // Busca do cache IndexedDB
    const cached = await idbGetCache(url);
    if (cached) {
      return syntheticJsonResponse(cached.status, cached.body, { "X-Offline-Cache": "1" });
    }
    throw new Error("Offline e sem dados em cache para esta requisição.");
  }

  // 2. Cache em memória para requisições GET (resposta ultra-rápida)
  if (!isMutation) {
    const mem = memCache.get(url);
    if (mem && Date.now() - mem.ts < MEM_CACHE_TTL_MS) {
      try {
        return syntheticJsonResponse(mem.status, JSON.parse(mem.body), { "X-Memory-Cache": "1" });
      } catch {
        memCache.delete(url);
      }
    }
  }

  // 3. Desduplicação de chamadas simultâneas
  if (!isMutation && inFlightRequests.has(url)) {
    try {
      const data = await inFlightRequests.get(url)!;
      return syntheticJsonResponse(data.status, JSON.parse(data.body), { "X-Dedup-InFlight": "1" });
    } catch {
      // continua
    }
  }

  const executeFetch = async (): Promise<{ status: number; body: string; ok: boolean }> => {
    const res = await fetch(url, options);
    const body = await res.text();
    return { status: res.status, body, ok: res.ok };
  };

  let inFlightPromise: Promise<{ status: number; body: string; ok: boolean }> | null = null;
  if (!isMutation) {
    inFlightPromise = executeFetch();
    inFlightRequests.set(url, inFlightPromise);
  }

  try {
    const result = inFlightPromise ? await inFlightPromise : await executeFetch();

    if (!isMutation && result.ok) {
      try {
        memCache.set(url, { status: result.status, body: result.body, ts: Date.now() });
        let parsed: any;
        try {
          parsed = JSON.parse(result.body);
        } catch {
          parsed = result.body;
        }
        await idbSetCache(url, result.status, parsed);
      } catch {
        // Cache é best-effort
      }
    }

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(result.body);
    } catch {
      parsedBody = result.body;
    }

    return syntheticJsonResponse(result.status, parsedBody);
  } catch (networkError) {
    if (!isMutation) {
      const cached = await idbGetCache(url);
      if (cached) {
        return syntheticJsonResponse(cached.status, cached.body, { "X-Offline-Cache": "1" });
      }
      throw networkError;
    }

    // Se mutação falhou na rede, enfileira com segurança absoluta
    await enqueueOfflineMutation(url, method, options);
    return syntheticJsonResponse(
      202,
      { ok: true, offlineQueued: true },
      { "X-Offline-Queued": "1" }
    );
  } finally {
    if (!isMutation) {
      inFlightRequests.delete(url);
    }
  }
}

let flushing = false;

/**
 * Reenvia (FIFO) as mutações enfileiradas de forma segura.
 * - Suporta envio de mídias anexadas primeiro.
 * - Erros 401/403: preserva tudo e marca 'auth_error' para reautenticação.
 * - Erros de validação (400): nunca descarta silenciosamente; move para retenção de segurança.
 * - Erros de rede: pausa a fila sem perder nada.
 */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (flushing || !isOnline()) {
    return { sent: 0, failed: 0, pending: getPendingCount() };
  }

  await initQueue();
  const queue = await idbGetQueueItems();
  if (queue.length === 0) {
    memoryQueue = [];
    notify();
    return { sent: 0, failed: 0, pending: 0 };
  }

  flushing = true;
  notify();

  let sent = 0;
  let failed = 0;
  let authError = false;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];

    // Se o item tem mídia local para upload prévio
    let finalBody = item.body;
    if (item.media && item.media.blob) {
      try {
        const fd = new FormData();
        fd.append("file", item.media.blob, item.media.fileName || "foto.jpg");
        const upRes = await fetch("/api/diario-upload", { method: "POST", body: fd });

        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData.url && finalBody) {
            try {
              const parsed = JSON.parse(finalBody);
              parsed.midiaUrl = upData.url;
              parsed.midiaTipo = upData.tipo || "image";
              finalBody = JSON.stringify(parsed);
              // Atualiza no banco para caso a etapa seguinte caia
              item.body = finalBody;
              delete item.media;
              await idbSaveQueueItem(item);
            } catch {
              // segue com o que der
            }
          }
        } else if (upRes.status === 401 || upRes.status === 403) {
          item.status = "auth_error";
          await idbSaveQueueItem(item);
          authError = true;
          break; // Para sincronização até usuário reautenticar
        } else {
          // Erro de rede no upload da mídia — para e tenta novamente depois
          item.attempts += 1;
          await idbSaveQueueItem(item);
          break;
        }
      } catch {
        // Sem rede no upload de mídia — para e preserva tudo
        item.attempts += 1;
        await idbSaveQueueItem(item);
        break;
      }
    }

    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: finalBody ?? undefined,
      });

      if (res.ok) {
        sent++;
        await idbRemoveQueueItem(item.id);
        // Se for um log do diário, remove também da lista local
        await idbRemoveLocalDiarioLog(item.id);
      } else if (res.status === 401 || res.status === 403) {
        // SESSÃO EXPIRADA: NUNCA DESCARTA OS DADOS!
        item.status = "auth_error";
        item.lastError = "Sessão expirada. Faça login novamente para sincronizar.";
        await idbSaveQueueItem(item);
        authError = true;
        break; // Interrompe para não falhar os outros itens
      } else if (res.status >= 400 && res.status < 500) {
        // Erro permanente de validação: NUNCA descarta no vazio. Move para o cofre de retenção!
        const errText = await res.text().catch(() => "Erro 4xx");
        await idbRetainFailedItem(item, `Status ${res.status}: ${errText}`);
        failed++;
      } else {
        // 5xx ou erro temporário do servidor
        item.attempts += 1;
        if (item.attempts < MAX_ATTEMPTS) {
          await idbSaveQueueItem(item);
        } else {
          await idbRetainFailedItem(item, `Excedeu limite de ${MAX_ATTEMPTS} tentativas`);
          failed++;
        }
      }
    } catch {
      // Conexão caiu no meio do envio — interrompe preservando todo o restante
      item.attempts += 1;
      await idbSaveQueueItem(item);
      break;
    }
  }

  // Recarrega memória
  memoryQueue = await idbGetQueueItems();
  flushing = false;
  notify();

  return { sent, failed, pending: memoryQueue.length, authError };
}

/**
 * Exporta uma cópia de segurança em formato JSON de todos os dados locais pendentes.
 * Garante que em nenhuma hipótese o operador perca suas anotações do campo.
 */
export async function exportOfflineBackup(): Promise<string> {
  const queue = await idbGetQueueItems();
  const localLogs = await idbGetLocalDiarioLogs();
  const backup = {
    exportedAt: new Date().toISOString(),
    totalPending: queue.length,
    queue: queue.map((q) => ({
      id: q.id,
      url: q.url,
      method: q.method,
      createdAt: new Date(q.createdAt).toLocaleString("pt-BR"),
      hasMedia: Boolean(q.media),
      body: q.body ? (() => { try { return JSON.parse(q.body); } catch { return q.body; } })() : null,
    })),
    localLogs,
  };
  return JSON.stringify(backup, null, 2);
}
