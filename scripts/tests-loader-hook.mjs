// Loader hook that maps the `vitest` specifier onto this package's own minimal
// implementation, so the existing suites run without the real vitest (which this
// environment cannot start). See scripts/tests-shim.mjs for the implementation.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const SHIM = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'tests-shim.mjs')).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest' || specifier.startsWith('vitest/')) {
    return { url: SHIM, shortCircuit: true, format: 'module' }
  }
  return nextResolve(specifier, context)
}
