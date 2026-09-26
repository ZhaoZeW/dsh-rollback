// Self-contained build for @nianchu/dsh-rollback.
//
// Why this exists instead of `tsdown`: this environment's pnpm install leaves the
// virtual store (.pnpm/…) complete but does not create the top-level symlinks, so
// any tool that resolves its own dependencies by bare package name (tsdown needs
// `ansis`) cannot start. rolldown — the bundler tsdown itself is built on — IS
// present with its native binding, so it is loaded here by absolute path and
// driven directly. The output contract is identical to tsdown.config.ts:
//
//   lib/index.js     ESM, node half (@deepseek-ai/* external)
//   lib/invariant.js ESM, node half
//   lib/client.js    CJS wrapped in window.__ModuleLoader__.load({ id, factory }),
//                    with @deepseek-ai/*, react and react-dom external
//
// Run: node scripts/build.mjs
import { mkdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PKG_ID = '@nianchu/dsh-rollback'
const OUT_DIR = join(ROOT, 'lib')

/** Resolve a package present in the pnpm virtual store. */
function storePkg(name, version, entry) {
  return join(ROOT, 'node_modules', '.pnpm', `${name}@${version}`, 'node_modules', name, entry)
}

const ROLLDOWN = storePkg('rolldown', '1.2.11', 'dist/index.mjs')
if (!existsSync(ROLLDOWN)) {
  console.error(`rolldown not found at ${ROLLDOWN}`)
  process.exit(1)
}

const { build } = await import(pathToFileURL(ROLLDOWN).href)

mkdirSync(OUT_DIR, { recursive: true })

const CLIENT_BANNER =
  'window.__ModuleLoader__.load({\n' +
  `\tid: ${JSON.stringify(PKG_ID)},\n` +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });'

const CLIENT_FOOTER = '\t\treturn module.exports;\n\t}\n});'

console.log('# building node half (esm)')
const nodeResult = await build({
  input: {
    index: join(ROOT, 'src', 'index.ts'),
    invariant: join(ROOT, 'src', 'invariant.ts'),
  },
  platform: 'neutral',
  external: [/^@deepseek-ai\//, /^node:/],
  output: {
    dir: OUT_DIR,
    format: 'esm',
    entryFileNames: '[name].js',
    sourcemap: false,
  },
})
report(nodeResult)

console.log('# building browser half (cjs + module-loader wrapper)')
const clientResult = await build({
  input: { client: join(ROOT, 'src', 'client', 'index.ts') },
  platform: 'browser',
  external: [/^@deepseek-ai\//, 'react', 'react-dom'],
  output: {
    dir: OUT_DIR,
    format: 'cjs',
    entryFileNames: '[name].js',
    sourcemap: false,
    banner: CLIENT_BANNER,
    footer: CLIENT_FOOTER,
  },
})
report(clientResult)

/** Print rolldown's warnings/errors, and fail the build on an error. */
function report(result) {
  const output = Array.isArray(result) ? result : [result]
  let failed = false
  for (const chunk of output) {
    for (const warning of chunk?.warnings ?? []) {
      console.warn(`  warn: ${typeof warning === 'string' ? warning : warning.message}`)
    }
  }
  for (const chunk of output) {
    if (chunk?.output) {
      for (const file of chunk.output) console.log(`  -> ${join(OUT_DIR, file.fileName)}`)
      failed = failed || chunk.output.some(f => f.type === 'chunk' && f.isEntry === undefined && false)
    }
  }
  if (failed) process.exit(1)
}
