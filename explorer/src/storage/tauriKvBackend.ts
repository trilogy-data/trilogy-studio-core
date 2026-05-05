import { invoke } from '@tauri-apps/api/core'
import type { KvBackend } from '@lib/data/idbKv'

/**
 * KvBackend backed by Tauri commands defined in src-tauri/src/lib.rs.
 * Each kv key (e.g. "explorer:projects") becomes a single JSON file in the
 * app's data directory. Studio's IndexedDB path stays untouched — this is
 * only installed when running inside the Tauri shell.
 */
export const tauriKvBackend: KvBackend = {
  async get(key: string): Promise<string | null> {
    const result = await invoke<string | null>('kv_get', { key })
    return result ?? null
  },
  async set(key: string, value: string): Promise<void> {
    await invoke('kv_set', { key, value })
  },
  async del(key: string): Promise<void> {
    await invoke('kv_del', { key })
  },
  async keys(): Promise<string[]> {
    return invoke<string[]>('kv_keys')
  },
}

/** True when the page is loaded inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
