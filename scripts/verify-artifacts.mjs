// Verify the built artifacts satisfy the runtime contract DSH expects.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback'
const lib = (f) => join(ROOT, 'lib', f)

const checks = []
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail })

for (const f of ['index.js', 'invariant.js', 'client.js']) {
  ok(`lib/${f} exists`, existsSync(lib(f)), existsSync(lib(f)) ? `${statSync(lib(f)).size} bytes` : 'MISSING')
}

const index = existsSync(lib('index.js')) ? readFileSync(lib('index.js'), 'utf8') : ''
const client = existsSync(lib('client.js')) ? readFileSync(lib('client.js'), 'utf8') : ''

// Node half: ESM, correct plugin export shape.
ok('index.js exports apply', /export\s*\{[^}]*\bapply\b/.test(index) || /export function apply/.test(index))
ok('index.js exports name', /name/.test(index))
ok('index.js declares inject', /inject/.test(index))
// Every `@deepseek-ai/*` import in the node half is `import type`, so the bundler
// erases it and the shipped file legitimately has no runtime harness import — it
// resolves the services it injects through the plugin context instead. What must
// NOT happen is harness source being inlined.
ok('index.js inlines no harness package', !/from\s*["']@deepseek-ai\//.test(index))
ok('index.js has no bundled harness source', !/class Context extends/.test(index))
ok('index.js imports only node builtins', !/^\s*import\s[^\n]*from\s*["'](?!node:)/m.test(index))

// Browser half: the module-loader wrapper DSH's client expects.
ok('client.js has ModuleLoader wrapper', client.includes('window.__ModuleLoader__.load'))
ok('client.js registers the forked id', client.includes('@nianchu/dsh-rollback'))
ok('client.js has the factory closing', client.includes('return module.exports;'))
ok('client.js requires harness externals', /require\(["']@deepseek-ai\//.test(client))
ok('client.js requires react', /require\(["']react["']\)/.test(client))

// The identity scrub must hold in the SHIPPED bytes, not only in src/.
ok('no upstream author id anywhere in lib', !/domitor/i.test(index + client))
ok('no Buffer in client half', !/\bBuffer\b/.test(client))

// The fork's own names must be present.
ok('node half warns under the fork prefix', index.includes('[nianchu-rollback]'))
ok('client half logs under the fork prefix', client.includes('[nianchu-rollback]'))
ok('storage root renamed', index.includes('nianchu-rollback'))

// The shared preview format must actually reach BOTH halves: the dialog parses the
// host's text with the same parser the host rendered it with. A local second parser
// is the defect this asserts against.
ok('client half carries the shared parser', client.includes('cappedDiff') || client.includes('renderEntry') || client.includes('parsePreview'))
ok('client half imports no node-only global', !/\brequire\(["']node:/.test(client))
ok('client half carries the diff dialog', client.includes('rbk-diff'))
ok('client half carries the hide preference', client.includes('nianchu-rollback.hide-rolled-back'))
ok('client half registers the settings row', client.includes('settings.general.item'))
ok('client half carries the undo-last shortcut', client.includes('undo-last shortcut'))
ok('node half carries the doctor command', index.includes('doctor'))
ok('node half reads the disk for previews', index.includes('currentOnDisk'))

let failed = 0
for (const c of checks) {
  if (!c.pass) failed++
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
}
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed === 0 ? 0 : 1)
