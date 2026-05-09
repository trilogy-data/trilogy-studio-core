import { onMounted, watch } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import { idbGet, idbSet } from '@lib/data/idbKv'
import useLLMConnectionStore from '@lib/stores/llmStore'

/**
 * Persists LLM connections via lib's LocalStorage AND keeps a parallel
 * plaintext secrets bag in the host kv. Lib's toJSON deliberately redacts
 * apiKey to the literal string "saved" expecting a CredentialManager (which
 * studio wires up but explorer does not). Without rehydration, that
 * placeholder gets used verbatim as the apiKey on the next request.
 *
 * For Tauri the secrets file lives on disk at the user's app data dir
 * under kv/explorer_llm-secrets.json. Phase 5 plan moves keys to the OS
 * keychain (Tauri stronghold plugin) — until then, plaintext on local
 * disk is the same exposure surface as a localStorage entry.
 */
const SECRETS_KEY = 'explorer:llm-secrets'

interface SecretsBag {
  [connectionName: string]: string
}

export function useLLMPersistence(prefix = 'explorer:') {
  const store = useLLMConnectionStore()
  const storage = new LocalStorage(prefix)

  onMounted(async () => {
    const loaded = await storage.loadLLMConnections()
    let secrets: SecretsBag = {}
    try {
      const raw = await idbGet(SECRETS_KEY)
      if (raw) secrets = JSON.parse(raw) as SecretsBag
    } catch {
      // Secrets file missing or corrupt — fall back to no rehydration.
    }
    for (const conn of Object.values(loaded)) {
      const real = secrets[conn.name]
      if (real) conn.setApiKey(real)
      if (!store.connections[conn.name]) {
        store.addConnection(conn, false)
      }
    }
  })

  let flushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => store.connections,
    () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(async () => {
        const all = Object.values(store.connections)
        if (all.length === 0) return
        try {
          await storage.saveLLMConnections(all)
        } catch (e) {
          console.error('saveLLMConnections failed', e)
        }
        // Persist secrets in parallel. getApiKey() is `protected` on the
        // base class so we read via the public field via cast.
        const secrets: SecretsBag = {}
        for (const conn of all) {
          const key = (conn as unknown as { apiKey: string }).apiKey
          if (key && key !== 'saved' && key !== '') {
            secrets[conn.name] = key
          }
        }
        try {
          await idbSet(SECRETS_KEY, JSON.stringify(secrets))
        } catch (e) {
          console.error('save llm secrets failed', e)
        }
      }, 250)
    },
    { deep: true },
  )

  return { storage }
}
