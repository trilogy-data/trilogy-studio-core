// Emits the manifest that `trilogy serve` reads to decide whether its cached
// studio bundle is current. Published under a stable asset name alongside the
// tarball, so serve can poll it via
// /releases/latest/download/manifest.json — a few hundred bytes, no GitHub API
// call, and therefore no unauthenticated rate limit to trip over.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

// Version of the remote store contract this bundle speaks; see
// docs/remote-store-contract.md. Bump on any breaking change to that contract
// so serve can refuse a studio build it cannot talk to.
const CONTRACT_VERSION = 1

const [, , tarballPath, outPath] = process.argv
if (!tarballPath || !outPath) {
  console.error('usage: build-release-manifest.mjs <tarball> <manifest-out.json>')
  process.exit(1)
}

const version = process.env.STUDIO_VERSION
if (!version) {
  console.error('STUDIO_VERSION is required (release tag with the leading `v` stripped)')
  process.exit(1)
}

// The bundle is built with an absolute base, so serve has to mount it at
// exactly this path or every asset 404s. Read it out of vite.config.ts rather
// than restating the literal here — drift would break the other repo silently.
const viteConfig = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')
const baseMatch = viteConfig.match(/^\s*base:\s*['"]([^'"]+)['"]/m)
if (!baseMatch) {
  console.error('Could not read `base` from vite.config.ts')
  process.exit(1)
}

const tarball = readFileSync(tarballPath)

const manifest = {
  name: 'trilogy-studio',
  version,
  contractVersion: CONTRACT_VERSION,
  basePath: baseMatch[1],
  commit: process.env.GITHUB_SHA || null,
  builtAt: new Date().toISOString(),
  tarball: {
    name: basename(tarballPath),
    bytes: tarball.length,
    sha256: createHash('sha256').update(tarball).digest('hex'),
  },
}

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${outPath}:\n${JSON.stringify(manifest, null, 2)}`)
