// Build the release tarball with a direct tar invocation.
//
// `npm pack` is the natural tool, but this environment blocks piped child stdio
// (npm's own output capture trips EPERM), so the archive is produced here with the
// same semantics: the `files` whitelist from package.json plus npm's always-included
// set (package.json, README, LICENSE), all under a leading `package/` directory —
// which is exactly what `dsh plugin add` / pnpm expect when installing a tarball.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, readdirSync, existsSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOT = 'C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback'
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const STAGE = join(ROOT, 'release', 'stage')
const OUT = join(ROOT, 'release')

rmSync(STAGE, { recursive: true, force: true })
mkdirSync(join(STAGE, 'package'), { recursive: true })

// npm always includes these, whatever `files` says.
const always = ['package.json', 'README.md', 'LICENSE']
// Plus the declared whitelist, expanding a directory to its files.
const declared = pkg.files ?? []
const wanted = [...always, ...declared]

const copied = []
for (const entry of wanted) {
  const from = join(ROOT, entry)
  if (!existsSync(from)) { console.log(`# 跳过（不存在）: ${entry}`); continue }
  const to = join(STAGE, 'package', entry)
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  copied.push(entry)
}

console.log(`# 打包内容 (${copied.length} 项):`)
for (const c of copied) console.log(`  ${c}`)

// The entry files DSH loads must be present, or the install is broken.
for (const must of ['lib/index.js', 'lib/invariant.js', 'lib/client.js', 'cordis.patch.yml']) {
  if (!existsSync(join(STAGE, 'package', must))) {
    console.error(`\n❌ 缺关键文件 ${must} — 先跑 node scripts/build.mjs`)
    process.exit(1)
  }
}

rmSync(join(OUT, 'dsh-rollback.tgz'), { force: true })
execFileSync('tar', ['-czf', join(OUT, 'dsh-rollback.tgz'), '-C', STAGE, 'package'], { stdio: 'inherit' })

// A tag-pinned copy too: `latest/download/` needs a version-free asset name, while
// a pinned release tag may use a versioned one.
const versioned = `dsh-rollback-${pkg.version}.tgz`
cpSync(join(OUT, 'dsh-rollback.tgz'), join(OUT, versioned))

const size = readFileSync(join(OUT, 'dsh-rollback.tgz')).length
console.log(`\n✅ release/dsh-rollback.tgz           ${(size / 1024).toFixed(1)} KB  ← 用 latest/download/ 时上传这个`)
console.log(`✅ release/${versioned}   ← 用钉住 tag 的 URL 时上传这个`)
console.log(`\n本地验证安装：`)
console.log(`  dsh plugin --profile web add file:${join(OUT, 'dsh-rollback.tgz').replace(/\\/g, '/')}`)
console.log(`\n上传到 Release：`)
console.log(`  https://github.com/ZhaoZeW/dsh-rollback/releases/new`)
console.log(`  Tag: v${pkg.version}   标题: v${pkg.version}   附件: 上传上面那个 tgz`)
