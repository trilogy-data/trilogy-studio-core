// Tiny IndexedDB key-value wrapper with in-memory fallback.
// Falls back to a Map when IndexedDB is unavailable (SSR, jsdom tests,
// some private-browsing modes). Values are stored as JSON strings so
// size accounting is trivial and matches localStorage semantics.
//
// A host app can swap the backend (e.g. to filesystem in a Tauri shell)
// via setKvBackend(); when set, all idb* calls route through the host
// backend and the IDB/memory paths below are bypassed.

const DB_NAME = 'trilogy-studio'
const STORE_NAME = 'kv'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null
const memoryStore = new Map<string, string>()

export interface KvBackend {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

let hostBackend: KvBackend | null = null

/**
 * Replace the kv backend. Pass null to revert to the default IDB+memory
 * implementation. Called by Tauri / Electron hosts at boot to route storage
 * to disk instead of the WebView's IndexedDB.
 */
export function setKvBackend(backend: KvBackend | null): void {
  hostBackend = backend
}

export function getKvBackend(): KvBackend | null {
  return hostBackend
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  }).catch((err: unknown) => {
    dbPromise = null
    throw err
  })
  dbPromise = p
  return p
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const req = fn(store)
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function idbGet(key: string): Promise<string | null> {
  if (hostBackend) return hostBackend.get(key)
  if (!hasIndexedDb()) return memoryStore.get(key) ?? null
  try {
    const v = await withStore<string>('readonly', (s) => s.get(key))
    return v === undefined ? null : v
  } catch {
    return memoryStore.get(key) ?? null
  }
}

export async function idbSet(key: string, value: string): Promise<void> {
  if (hostBackend) return hostBackend.set(key, value)
  if (!hasIndexedDb()) {
    memoryStore.set(key, value)
    return
  }
  try {
    await withStore('readwrite', (s) => s.put(value, key))
  } catch {
    memoryStore.set(key, value)
  }
}

export async function idbDel(key: string): Promise<void> {
  if (hostBackend) return hostBackend.del(key)
  if (!hasIndexedDb()) {
    memoryStore.delete(key)
    return
  }
  try {
    await withStore('readwrite', (s) => s.delete(key))
  } catch {
    memoryStore.delete(key)
  }
}

export async function idbKeys(): Promise<string[]> {
  if (hostBackend) return hostBackend.keys()
  if (!hasIndexedDb()) return Array.from(memoryStore.keys())
  try {
    const res = await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    return (res ?? []).map(String)
  } catch {
    return Array.from(memoryStore.keys())
  }
}

/** Byte size of a single key's value (0 if missing). Uses TextEncoder. */
export async function idbSize(key: string): Promise<number> {
  const v = await idbGet(key)
  if (v === null) return 0
  return new TextEncoder().encode(v).length
}

/** Test-only: reset the in-memory fallback store. */
export function __resetIdbMemoryForTests(): void {
  memoryStore.clear()
}
