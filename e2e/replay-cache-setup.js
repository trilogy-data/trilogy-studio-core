import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Share real upstream responses across browser projects and replacement
// workers, but never across runs: every run must verify the current deployment.
export default function setupReplayCache() {
  const directory = mkdtempSync(join(tmpdir(), 'trilogy-playwright-replay-'))
  process.env.PLAYWRIGHT_REPLAY_CACHE_DIR = directory
  return () => {
    delete process.env.PLAYWRIGHT_REPLAY_CACHE_DIR
    rmSync(directory, { recursive: true, force: true })
  }
}
