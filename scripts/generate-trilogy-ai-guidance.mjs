import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const generatorPath = join(repoRoot, 'pyserver', 'scripts', 'generate_ai_guidance.py')

const virtualEnvPython =
  process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python')
const candidates = [
  process.env.PYTHON,
  process.env.VIRTUAL_ENV && join(process.env.VIRTUAL_ENV, virtualEnvPython),
  join(repoRoot, '.venv', virtualEnvPython),
  join(repoRoot, 'venv', virtualEnvPython),
  process.platform === 'win32' ? 'python.exe' : 'python3',
  'python',
].filter(Boolean)

const failures = []
for (const candidate of candidates) {
  if (isAbsolute(candidate) && !existsSync(candidate)) continue
  const attempt = spawnSync(candidate, [generatorPath, ...process.argv.slice(2)], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 10 * 1024 * 1024,
  })
  if (attempt.status === 0) {
    process.stdout.write(attempt.stdout)
    process.exit(0)
  }
  // The generator ran and chose to fail -- `--check` on a stale file exits 1
  // and explains itself on stdout. That is a real answer, not a broken
  // interpreter, so surface it and stop rather than trying the next candidate
  // and reporting "unable to import pytrilogy".
  if (attempt.status !== null && !attempt.error) {
    process.stdout.write(attempt.stdout)
    process.stderr.write(attempt.stderr)
    process.exit(attempt.status)
  }
  failures.push(`${candidate}: ${attempt.error?.message || attempt.stderr.trim()}`)
}

console.error(
  'Unable to import pytrilogy. Install pyserver requirements in the repository virtualenv first.',
)
console.error(failures.join('\n'))
process.exit(1)
