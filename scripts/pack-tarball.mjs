// Build the installable tarball for a GitHub Release.
//
// The registry recommends npm, but npm is OPTIONAL: a prebuilt `.tgz` attached to a
// GitHub Release gives the storefronts a one-click artifact instead of a
// build-from-source command, and the entry then carries a `tarball:` field.
//
// The asset name must be VERSION-FREE if the entry uses
// `releases/latest/download/<name>` — that URL resolves `latest` at request time
// but takes the filename literally, so a versioned name 404s the moment the next
// release is cut (the registry documents this as a "quiet rot").
//
// Usage: node scripts/pack-tarball.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const OUT = join(ROOT, 'release')
mkdirSync(OUT, { recursive: true })

// npm pack produces exactly the `files` whitelist, correctly prefixed `package/`.
const rawName = execFileSync('npm', ['pack', '--silent', '--pack-destination', OUT], {
  cwd: ROOT, encoding: 'utf8', shell: true,
}).trim().split('\n').pop().trim()

// The version-free asset name the registry wants for latest/download/ URLs.
const asset = 'dsh-rollback.tgz'
rmSync(join(OUT, asset), { force: true })
copyFileSync(join(OUT, rawName), join(OUT, asset))

console.log(`packed ${pkg.name}@${pkg.version}`)
console.log(`  versioned  : ${rawName}   (用 tag 钉住的 URL 时用这个)`)
console.log(`  version-free: ${asset}     (用 releases/latest/download/ 时用这个)`)
console.log(`\n发布命令（需 gh CLI 或 GitHub 网页上传）:`)
console.log(`  gh release create v${pkg.version} release/${asset} --title "v${pkg.version}" --notes-file CHANGELOG.md`)
console.log(`\n注册表条目里对应字段:`)
console.log(`  tarball: https://github.com/OWNER/REPO/releases/latest/download/${asset}`)
