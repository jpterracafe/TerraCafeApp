/**
 * IndexedDB Storage Layer para o TerraCafé
 * 
 * Fornece armazenamento local ilimitado, seguro contra expurgo e compatível com binários (Blobs de fotos/vídeos).
 * Sem dependências externas.
 */

const DB_NAME = "terracafe_offline_v2";
const DB_VERSION = 1;

export interface OfflineQueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  attempts: number;
  status: "pending" | "syncing" | "failed" | "auth_error";
  lastError?: string;
  // Anexo de mídia local (foto/vídeo capturado offline no campo)
  media?: {
    id: string;
    fileName: string;
    fileType: string;
    blob: Blob;
  };
}

export interface CacheRecord {
  key: string;
  status: number;
  body: any;
  ts: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB não disponível neste ambiente"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // Store para a fila de sincronização de mutações
      if (!db.objectStoreNames.contains("queue")) {
        const queueStore = db.createObjectStore("queue", { keyPath: "id" });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Store para cache HTTP de requisições GET
      if (!db.objectStoreNames.contains("http_cache")) {
        db.createObjectStore("http_cache", { keyPath: "key" });
      }

      // Store para registros locais do diário (para visualização imediata offline)
      if (!db.objectStoreNames.contains("local_diario_logs")) {
        db.createObjectStore("local_diario_logs", { keyPath: "id" });
      }

      // Store de dead-letter (itens que falharam mas NUNCA são apagados)
      if (!db.objectStoreNames.contains("retained_failed")) {
        db.createObjectStore("retained_failed", { keyPath: "id" });
      }

      // Store de metadados gerais
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("[IndexedDB] Erro ao abrir banco:", request.error);
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Métodos para Fila de Mutações (Queue) ─────────────────────────────────────

export async function idbSaveQueueItem(item: OfflineQueueItem): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Falha ao salvar item na fila:", err);
  }
}

export async function idbGetQueueItems(): Promise<OfflineQueueItem[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readonly");
      const store = tx.objectStore("queue");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as OfflineQueueItem[];
        // Ordena por ordem de criação (FIFO)
        items.sort((a, b) => a.createdAt - b.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Falha ao buscar itens da fila:", err);
    return [];
  }
}

export async function idbRemoveQueueItem(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Falha ao remover item da fila:", err);
  }
}

export async function idbRetainFailedItem(item: OfflineQueueItem, errorMsg: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("retained_failed", "readwrite");
      const store = tx.objectStore("retained_failed");
      const req = store.put({
        ...item,
        status: "failed",
        lastError: errorMsg,
        failedAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    // Remove da fila ativa para não travar novas sincronizações
    await idbRemoveQueueItem(item.id);
  } catch (err) {
    console.error("[IndexedDB] Falha ao reter item com erro:", err);
  }
}

export async function idbGetRetainedFailedItems(): Promise<any[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("retained_failed", "readonly");
      const store = tx.objectStore("retained_failed");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// ── Métodos para Cache HTTP ──────────────────────────────────────────────────

export async function idbSetCache(key: string, status: number, body: any): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("http_cache", "readwrite");
      const store = tx.objectStore("http_cache");
      const req = store.put({ key, status, body, ts: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache é best-effort
  }
}

export async function idbGetCache(key: string): Promise<CacheRecord | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("http_cache", "readonly");
      const store = tx.objectStore("http_cache");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbClearCache(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("http_cache", "readwrite");
      const store = tx.objectStore("http_cache");
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // noop
  }
}

// ── Métodos para Logs do Diário Criados Offline ──────────────────────────────

export async function idbSaveLocalDiarioLog(log: any): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("local_diario_logs", "readwrite");
      const store = tx.objectStore("local_diario_logs");
      const req = store.put(log);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Falha ao salvar log local do diário:", err);
  }
}

export async function idbGetLocalDiarioLogs(): Promise<any[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("local_diario_logs", "readonly");
      const store = tx.objectStore("local_diario_logs");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbRemoveLocalDiarioLog(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("local_diario_logs", "readwrite");
      const store = tx.objectStore("local_diario_logs");
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // noop
  }
}

// ── Persistência de Armazenamento no Navegador ───────────────────────────────

/**
 * Solicita armazenamento persistente ao navegador (Chrome, Safari iOS, Edge).
 * Isso impede que o sistema operacional limpe os dados locais mesmo com pouco espaço livre no disco.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`[Storage] Armazenamento persistente concedido: ${isPersisted}`);
      return isPersisted;
    }
  } catch (e) {
    console.warn("[Storage] Não foi possível solicitar armazenamento persistente:", e);
  }
  return false;
}
