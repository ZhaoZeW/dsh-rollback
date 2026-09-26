// Prepare the community-registry submission for @nianchu/dsh-rollback.
//
// Fills in the two things that must match a real GitHub repository — the
// `repository`/`homepage`/`bugs` fields in package.json (npm requires the
// published package to point back at the listed repo, otherwise the two are not
// linked) and the one YAML entry file the registry PR adds.
//
// Usage:
//   node scripts/prepare-release.mjs <github-owner> <repo-name>
//   node scripts/prepare-release.mjs --status
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PKG_NAME = '@nianchu/dsh-rollback'
const CATEGORY = 'ui'

const [ownerArg, repoArg] = process.argv.slice(2)

if (ownerArg === '--status' || ownerArg === undefined) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  console.log(`package        : ${pkg.name}@${pkg.version}`)
  console.log(`repository     : ${pkg.repository?.url ?? '(未设置 — 发布 npm 前必须填)'}`)
  console.log(`dsh.bundle     : ${pkg.dsh?.bundle?.patch ?? '(缺失 — 会被注册表 CI 拒绝)'}`)
  console.log(`dsh-plugin topic in keywords: ${(pkg.keywords ?? []).includes('dsh-plugin')}`)
  if (ownerArg === undefined) {
    console.log('\n用法: node scripts/prepare-release.mjs <github-owner> <repo-name>')
    process.exit(0)
  }
}

if (ownerArg === undefined || repoArg === undefined || ownerArg.startsWith('--')) {
  console.log('\n需要两个参数: <github-owner> <repo-name>')
  process.exit(1)
}

const owner = ownerArg
const repo = repoArg
const slug = `${owner}/${repo}`
const url = `https://github.com/${slug}`

// 1) package.json: repository/homepage/bugs + the dsh-plugin topic the registry asks for.
const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.repository = { type: 'git', url: `git+${url}.git` }
pkg.homepage = `${url}#readme`
pkg.bugs = { url: `${url}/issues` }
const keywords = new Set(pkg.keywords ?? [])
keywords.add('dsh-plugin')
pkg.keywords = [...keywords]
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`updated package.json  repository=${pkg.repository.url}`)

// 2) The registry entry. Only `description.en` is required upstream; both are
//    written because a good zh line is free here and the maintainers otherwise
//    have to add one.
const entryPath = join(ROOT, 'registry-entry.example.yml')
const entryName = `${owner}__${repo}.yml`
const description = {
  en: 'TRAE-style conversation rollback for DeepSeek Harness: per-turn file checkpoints, restore plus in-place context truncation, an affected-file diff preview, and a /rollback doctor contract self-check.',
  zh: 'TRAE 式「回退」插件：按轮次建立文件检查点，一键把工作区文件与模型上下文同时回退到某一轮发起之前；带受影响文件 diff 预览与 /rollback doctor 契约自检。',
}
// Single-quoted because the `en` line contains ": " — unquoted, YAML reads it as a
// nested key and the entry fails to parse.
const yaml = [
  `url: ${url}`,
  `name: ${slug}`,
  `category: ${CATEGORY}`,
  'description:',
  `  en: '${description.en.replace(/'/g, "''")}'`,
  `  zh: '${description.zh.replace(/'/g, "''")}'`,
  '',
].join('\n')

writeFileSync(entryPath, yaml)
console.log(`wrote registry-entry.example.yml (rename to ${entryName} in the registry PR)`)
console.log(`\n--- ${entryName} ---\n${yaml}`)

// 3) Keep a copy under the exact name the registry expects, for convenience when
//    the user forks the registry repo and drops the file in.
const dataDir = join(ROOT, 'registry-pr')
mkdirSync(dataDir, { recursive: true })
writeFileSync(join(dataDir, entryName), yaml)
console.log(`also wrote registry-pr/${entryName}`)
console.log('\n下一步：确认仓库已创建满 24 小时、加上 dsh-plugin topic，然后把该文件放进')
console.log('awesome-dsh-plugin 仓库的 data/plugins/ 下并提 PR。')
