// Minimal vitest-compatible runner.
//
// This environment's pnpm install leaves the virtual store complete but without
// top-level symlinks, so vitest cannot start (it cannot resolve `@vitest/utils`).
// The suites themselves only need `describe`, `it`, and `expect`, all of which are
// pure JavaScript — so they are provided here and `vitest` is resolved to this
// module through a loader hook. Nothing else about the tests changes.
//
// Run: node scripts/run-tests.mjs [file ...]
import { register } from 'node:module'
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

register('./tests-loader-hook.mjs', import.meta.url)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TESTS_DIR = join(ROOT, 'tests')

const args = process.argv.slice(2)
const files = args.length > 0
  ? args.map(f => resolve(f))
  : readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.ts'))
    .sort()
    .map(f => join(TESTS_DIR, f))

for (const file of files) {
  try {
    await import(pathToFileURL(file).href)
  } catch (error) {
    console.error(`\n!! failed to load ${file}`)
    console.error(error)
    process.exitCode = 1
  }
}

const { runSuites } = await import('./tests-shim.mjs')
process.exitCode = (await runSuites()) || process.exitCode || 0
