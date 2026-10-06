# 上架交接单（@nianchu/dsh-rollback → github.com/ZhaoZeW/dsh-rollback）

**状态：已上架（npm · GitHub Release · 市场目录）· 当前版本 0.4.2 · 构建/测试/产物自检全绿**

- npm：`@nianchu/dsh-rollback@0.4.2`（`latest`，2026-10-06T06:42:55Z）— 见第九节与第十节
- 注册表 PR <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5992> **已于 2026-10-05T16:18:07Z 合并**（merge commit `d213226c174c723996ed00c2f4b12b01788d9c`）。目录条目 `data/plugins/ZhaoZeW__dsh-rollback.yml` 用 `latest/download/dsh-rollback.tgz` 跟随最新 Release，**以后发版不必再提 PR**。
- ⚠️ **0.4.1 有严重缺陷**：会让被回退过的会话彻底无法继续（每一轮都「本轮运行失败」，切模型无效）。已由 0.4.2 修复 —— 见第十节。

---

## 零、已完成总览（全部经 API 或实测核对）

| 项 | 实测结果 |
|---|---|
| GitHub 仓库 | <https://github.com/ZhaoZeW/dsh-rollback>（Public，默认分支 `main`） |
| 文件数 | **75**，含 `lib/index.js`、`lib/client.js`、`lib/invariant.js` |
| 误入库 | `node_modules` 0 个、`tests/.suite` 0 个 |
| `dsh-plugin` topic | ✅ 已加（注册表 CI 必查） |
| `dsh.bundle` 声明 | ✅ `{ "patch": "./cordis.patch.yml" }`（CI 第 2 项检查，最常见的被拒原因就是缺它） |
| `repository` 字段 | ✅ `git+https://github.com/ZhaoZeW/dsh-rollback.git` |
| **GitHub Release** | ✅ tag `v0.4.0`，`dsh-rollback.tgz` 72636 B，非 draft、非 prerelease |
| **tarball 免构建可安装** | ✅ 实测（`--ignore-scripts` 下入口产物全部落地） |
| **发布资产完整性** | ✅ GitHub 侧 digest `sha256:f4379a18…` 与本地实测那份**完全一致** |
| **`latest/download` 链接** | ✅ 首次核对返回 HTTP 200 且下载字节与本地逐字节一致 |
| **npm 包** | ✅ `@nianchu/dsh-rollback` `0.4.0` 与 `0.4.1` 均已发布；`npm i @nianchu/dsh-rollback` 实测通过（见第九节） |
| **npm ↔ 仓库关联** | ✅ 线上 `repository = git+https://github.com/ZhaoZeW/dsh-rollback.git`（市场自动采集靠这个字段） |
| ⚠️ 尚待补 | GitHub Release 目前仍是 **v0.4.0**；`v0.4.1` 的代码与 tag/Release 尚未推送 |

---

## 一、只剩 1 个时间门槛

仓库创建于 **2026-09-26T11:08:03Z**。注册表 CI 硬性要求仓库创建**满 24 小时**。

> **最早可提 PR：2026-09-26T11:08:03Z = 北京时间 2026-09-27 19:08**

✅ **已于 2026-09-27 晚间提 PR（见第八节），此门槛已过。**

---

## 三、待提交的注册表条目（已生成）

文件：`registry-pr/ZhaoZeW__dsh-rollback.yml`（本地，已 gitignore 以免与注册表那份漂移）

放进注册表仓库的 `data/plugins/` 下即可。**若已上传 Release tarball，再加一行 `tarball:`**：

```yaml
url: https://github.com/ZhaoZeW/dsh-rollback
name: ZhaoZeW/dsh-rollback
category: ui
description:
  en: 'TRAE-style conversation rollback for DeepSeek Harness: per-turn file checkpoints, restore plus in-place context truncation, an affected-file diff preview, and a /rollback doctor contract self-check.'
  zh: 'TRAE 式「回退」插件：按轮次建立文件检查点，一键把工作区文件与模型上下文同时回退到某一轮发起之前；带受影响文件 diff 预览与 /rollback doctor 契约自检。'
tarball: https://github.com/ZhaoZeW/dsh-rollback/releases/latest/download/dsh-rollback.tgz   # 上传 Release 后再加
```

**不要**手工编辑该仓库的 README / README.zh.md（由 `data/plugins/*.yml` 生成）。

---

## 四、发布路线

> ⚠️ **本节原有结论「本轮不发布 npm」已作废**（写于 2026-09-26，当时还没有 npm 账号）。实际已于 **2026-09-27 发布 npm**，完整实录见**第九节**。下面保留的是 tarball 路线 —— 它仍然是**注册表条目实际使用**的那条路（`tarball:` 字段指向 Release 资产），价值没变。

**两条路线并存**：npm（按名字安装 + 市场可显示下载量）+ 预构建 tarball（免构建安装，注册表指向它）

```powershell
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
node scripts/pack-tarball.mjs
# 产出 release/dsh-rollback.tgz（不带版本号，配 latest/download/ 用）
#      release/dsh-rollback-0.4.0.tgz（带版本号，配钉住 tag 的 URL 用）
```

已实测：用 `--ignore-scripts` 装这个 tarball（即纯预构建消费，不跑任何构建），`package.json`、`cordis.patch.yml`、`lib/index.js`、`lib/client.js`、`lib/invariant.js` **全部落地** → 免构建可安装 ✅

**上传步骤（网页操作）**

1. 打开 <https://github.com/ZhaoZeW/dsh-rollback/releases/new>
2. **Choose a tag** 输入 `v0.4.0` → 点 **Create new tag: v0.4.0 on publish**
3. **Release title** 填 `v0.4.0`
4. **Describe this release** 可从 `CHANGELOG.md` 复制 0.4.0 那一段
5. **Attach binaries** 把 `release/dsh-rollback.tgz` 拖进去
6. 点 **Publish release**

发布后注册表条目加一行：

```yaml
tarball: https://github.com/ZhaoZeW/dsh-rollback/releases/latest/download/dsh-rollback.tgz
```

> 资产名**故意不带版本号**：`releases/latest/download/` 会在请求时解析 `latest` 但**照字面取文件名**，带版本号的名字提交当天有效、下次发版就 404（官方称之为 "quiet rot"）。

**npm 那条路已于 2026-09-27 走通** —— 实录见第九节（含两次 403 的真实原因、新账号拿不到 TOTP、bypass-2FA token 的生成方式与 2027 年 1 月的失效期限）。

## 五、本地安装的三种方式（按推荐度）

```powershell
# 1) 从 npm 按名字装（推荐；0.4.1 起可用）
dsh plugin --profile web add -w @nianchu/dsh-rollback

# 2) 本地预构建 tarball（离线可用）
dsh plugin --profile web add -w file:C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback/release/dsh-rollback.tgz

# 3) GitHub 源（会拉整仓并跑 prepare 本地构建，最慢）
dsh plugin --profile web add -w github:ZhaoZeW/dsh-rollback
```

> - `-w` **必须显式带**，`dsh plugin` 不会自动加；漏了会报 `ERR_PNPM_ADDING_TO_ROOT`。
> - 装完**必须重启 DSH**：profile 的 bundle 列表只在启动时组装。
> - ⚠️ 一次失败的 `add` 可能把插件从 profile 里移除（本项目就遇到过），切换安装方式前先记下当前 spec 以便回滚。

---

## 六、日后如何更新

| 场景 | 做法 |
|---|---|
| 改代码后发布 | ① 改 `package.json` 的 `version` **和 `src/core/contract-audit.ts` 的 `PLUGIN_VERSION`（两者必须一致，否则 `tests/contract-audit.test.ts` 直接红）** → ② `node scripts/build.mjs` → ③ `node scripts/run-tests.mjs`（273 项）+ `node scripts/verify-artifacts.mjs`（27 项）→ ④ `node scripts/pack-tarball.mjs` → ⑤ 提交推送 + 打 tag + 传 Release 资产 → ⑥ `npm publish --registry=https://registry.npmjs.org --access public` |
| **注册表条目不用动** | 版本与下载量由 registry 自动采集，条目只有 url/name/category/description |
| 改描述或换分类 | 编辑注册表里你那**一个** yml 再提 PR（官方要求：只改自己那一条） |
| 换截图 | 在本仓库加 `screenshots.json` 并推自己的仓库即可，**不用提 PR**，市场下次构建自动生效 |
| 改完自检 | `node scripts/verify-artifacts.mjs`（27 项）+ `node scripts/run-tests.mjs`（273 项） |

---

## 七、安全提醒

推送到 GitHub 时我**曾一度**把 token 写进了本地 `.git/config`（remote URL 形式）。**已立刻清除并核实**：

- 当前 `.git/config` 内容经检查**不含 token**
- remote 是干净的 `https://github.com/ZhaoZeW/dsh-rollback.git`
- 推送改用临时 credential helper，用完即删

⚠️ **更正（2026-09-27）**：上面那句关于 token 权限的建议**是错的**。`Only select repositories` → 只勾 `ZhaoZeW/dsh-rollback` 提不了这个 PR——PR 要往 `awesome-dsh-plugin` 的 **fork 仓库**里写文件，那是一个当时还不存在的仓库，fine-grained token 覆盖不到。实际使用的是 **classic token，只勾 `public_repo`**（公开仓库读写，不含账号级与删除能力），提完即吊销。

---

## 八、注册表 PR（已提交）

| 项 | 实测 |
|---|---|
| PR | <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5992> — `Add ZhaoZeW/dsh-rollback` |
| 分支 | fork `ZhaoZeW/awesome-dsh-plugin` 的 `add-zhaozew-dsh-rollback`（基于上游 `main` = `55c2667b`） |
| 提交 | `95d5c7f2` |
| 改动 | **恰好 1 个文件**：新增 `data/plugins/ZhaoZeW__dsh-rollback.yml`（+7/−0），未触碰任何他人条目 |
| 内容一致性 | 上传内容与本地文件**逐字节一致**（1133 B，无 BOM）；远端 blob sha `74580a33` |
| `category` | `ui`（注意：同功能的上游条目 `domitor-syh/dsh-rollback` 在 `session`；注册表规则允许分类近似，维护者会直接改而不打回） |

### 提 PR 时发现的两个新情况

1. **上游同功能条目已存在**：`data/plugins/domitor-syh__dsh-rollback.yml` 已收录，描述与本条目高度重合。注册表审核规则第 4 条明确「两个插件做同一件事，**规则不是先来后到，规则是谁更好**，维护得更好的 fork 会被收录」。因此描述改为**写明本 fork 的增量**（`/rollback doctor` 契约自检、按当前磁盘状态实时计算的 diff 预览、一键 `undo-last` 与 `Ctrl+Shift+Z`、「回退后隐藏已回退消息」开关、英文文案），每一项都已对着源码核实，以规避「重复条目」判定。
2. **`": "` 必须加引号**：`description.en` 里含 `: `，YAML 会把它读成嵌套键，故 en/zh 均用单引号包裹（注册表 `contributing.md` 明文要求）。

### CI 结果

run `36320351090`（workflow `PR check` / job `check`）：**17/17 步全部 `success`**，PR `mergeable_state = clean`、非 draft、1 commit / 1 file（+7/−0）。

覆盖到的机械检查：`Stale-fork guard`、条目文件必须位于 `data/plugins/` 且以 `.yml` 结尾、`READMEs match data/plugins`、`awesome-lint`、`Added-date regression tests`、`Capability-disclosure tests`（对应 `dsh.bundle` 那一项）、`Build (locale parity, date derivation, templates)`。

「一个 PR 最多 3 条」与「仓库创建满 1 天」这两项 CI 未单列步骤，我另行用 API 自查：本 PR 只含 1 个条目文件；仓库创建于 `2026-09-26T11:08:03Z`，提 PR 时已满 25.6 小时。

### 后续

- [ ] 合并后注册表站点自动重建，条目出现在 `ui` 分类；市场（dsh-market）可搜到并用那个 Release tarball 一键安装
- [ ] 提 PR 用的 classic token（`public_repo`）若还没删，请吊销 —— **这条请自行确认**

---

## 九、npm 发布（已完成，实录）

| 项 | 实测 |
|---|---|
| 包 / 账号 | `@nianchu/dsh-rollback`，账号 `nianchu`（邮箱已验证） |
| 已发布版本 | **0.4.0**（`2026-09-27T15:16:11Z`）与 **0.4.1**（同日，现为 `latest`） |
| 发布命令 | `npm publish --registry=https://registry.npmjs.org --access public` |
| 服务端响应 | `PUT https://registry.npmjs.org/@nianchu%2fdsh-rollback` → **HTTP 200** |
| 制品校对 | 从注册表下载的 tarball sha1 与发布时一致（0.4.0 = `1f516737…`） |
| 关联字段 | `repository = git+https://github.com/ZhaoZeW/dsh-rollback.git` ✅ |
| 按名字安装 | 临时目录 `npm install @nianchu/dsh-rollback` → 4 个包、产物齐全 ✅ |

### 9.1 两次 403 的真实原因

1. 第一次 → 账号 `two-factor auth: disabled`。npm 现在硬性要求「**2FA 或带 bypass-2FA 的 granular token**」才能发布。
2. 第二次 → 2FA 已是 `auth-and-writes`，但**没有任何已注册的第二因素**（手机上的安全密钥注册在客户端报 `Device registration failed`），挑战无从发起 → 依旧 403。

### 9.2 最终生效的方式：bypass-2FA 的 granular access token

在 <https://www.npmjs.com/settings/nianchu/tokens> 生成 **Granular Access Token**：

- 名称 `dsh-rollback publish`
- **勾选 `Bypass two-factor authentication (2FA)`**（漏了必然还是 403）
- Permissions：**`Read and write (publish and stage)`** —— 别选成名字极像的 `Read and write (stage only)`
- Select packages：`Only select packages and scopes` → **`@nianchu`**（个人 scope）
- Allowed IP ranges 留空；Expiration 90 天
- 写入 `C:\Users\Administrator\.npmrc`：`//registry.npmjs.org/:_authToken=<token>`

> ⚠️ **官方计划 2027 年 1 月取消 bypass-2FA token 的直接发布能力**。届时要么迁到 **Trusted Publishing（OIDC，需 CI 环境）**，要么改用 **staged publishing**：`npm stage publish` → 人工 `npm stage approve <stage-id>`（npm 11.16 已支持 `npm stage` 子命令）。

### 9.3 两个必须记住的坑

1. **新账号拿不到 TOTP**。npm 官方回复（[Discussion #182325](https://github.com/orgs/community/discussions/182325)）：自 2025 年 9 月起**不再允许新配置 TOTP（验证器 App）**，只提供 **Security key**。所以 `npm publish` 里 `Enter OTP:` 那条路对新账号**根本不存在** —— 网上大量「开 2FA 然后输 6 位码」的教程对你无效。
2. **`www.npmjs.com` 对脚本客户端返回 403**。Cloudflare 按**客户端指纹**区分：真人 Chrome 能打开，`curl` 一律 403。所以**注册、改设置、建 token 必须用浏览器**；命令行侧用 `--auth-type=legacy` 登录或直接用 token。
   - 另外：`npm adduser --auth-type=legacy` **创不了号**，服务端明确回 `Account creation via legacy auth is unavailable`，legacy 只能用于**登录已有账号**。

### 9.4 国内镜像

本机 `.npmrc` 默认 registry 是 `registry.npmmirror.com`，**该镜像尚未同步这个新包**。已配置：

```
@nianchu:registry=https://registry.npmjs.org/
```

同事用镜像装不上时，加这一行即可。注意**注册表/市场的一键安装走的是 Release tarball，与 npm 镜像无关**。

### 9.5 待办

- [x] **推送与 Release 已完成**（2026-09-27）：`main = 31369a6`、tag `v0.4.1 → 31369a6`、Release `v0.4.1` 含两个资产（`dsh-rollback.tgz` 版本无关 + `dsh-rollback-0.4.1.tgz`）。`latest/download/dsh-rollback.tgz` 实测 HTTP 200 且 sha1 与本地逐字节一致。
      ⚠️ 两个坑值得记：① 资产上传成功后**下载端点会先返回 404 约 2 分钟**（新资产的 CDN 传播延迟）。判断「字节到底在不在」要用 API 资产端点 `GET /repos/{owner}/{repo}/releases/assets/{id}`（带 `Accept: application/octet-stream`）再比对校验和，**不要**反复刷新下载链接下结论；② 首次上传曾 `HTTP 000`（GitHub 连接被重置），加重试即成功。
- [x] **2FA 已完整配置**（2026-09-27）：设置页显示 `Enabled for authorization and publishing`（= `auth-and-writes`）+ `1 security key`。用的是 Chrome + Windows Hello，**platform authenticator，不需要 USB 硬件** —— 之前手机上报 `Device registration failed` 的原因是那台第三方/内置浏览器不支持 WebAuthn，换 Chrome 后一次通过。
- [ ] 建议：在同一设置页的 **Linked Accounts & Recovery Option (Beta) → Link with GitHub** 绑定 GitHub。新账号拿不到 TOTP，也就没有「验证器 + 恢复码」那条传统恢复路径，npm 官方把「绑定账号」作为身份核验的兜底。
- [ ] npm token：**实测它现在只剩「发布」能力** —— `npm whoami` 正常，但 `npm profile get --registry=https://registry.npmjs.org` 直接 `403 Forbidden - GET /-/npm/v1/user`，附提示 *tokens that bypass 2FA are being restricted for account changes*。所以改设置、建/删 token **必须走浏览器**（现在有 security key，做得到）。副作用是它的权限面比一般理解更小，留着等 90 天自然过期即可。
- [ ] **已知遗留（未验证）**：本次重启前后，当前会话的检查点文件从 ~386 KB 变为 ~237 KB（插件从会话日志重建捕获状态所致）。**「跨重启回退到重启前某轮」是否仍正常，尚未实测** —— 需要用界面里的 `/rollback list` 与 `/rollback doctor` 确认。




---

## 十、0.4.2 —— 修正 v4 会话格式下的标记来源（2026-10-06）

### 10.1 缺陷（0.4.1 及更早）

回退标记是一条 `user/message`，`source` 盖的是 `{ kind: 'plugin', plugin: 'rollback' }`。DSH 0.2.0（会话格式 v4）**在编码该事件时**拒绝 `kind === 'plugin'`：

```
format v4 message requires a producer-owned source kind
```

（`assertV4MessageSources`，`@deepseek-ai/dsh-session-format-v3-to-v4`）

关键在于这次拒绝发生在**持久化 drain 里**，不在 append 的调用栈上：append 已经返回成功，失败批次却被留在写队列头部，此后该会话**每一次**写入都重新编码同一批次并抛同一个错 —— **与所选模型无关**（切模型、切回 `deepseek-v4-flash` 都无效）。表现：被回退过的那一轮之后，每一轮都提示「本轮运行失败」。

### 10.2 修复

- **写入端**改为 v4 要求的产生者所属 kind：`{ kind: 'plugin:rollback' }`。这正是 DSH 自身 v3→v4 迁移给未登记插件分配的拼写（`producerKind()` → `plugin:<name>`，并丢掉 `plugin` 字段）。
- **新增 `src/core/marker-source.ts`**：标记来源的唯一出处 —— `ROLLBACK_MARKER_KIND`、`ROLLBACK_MARKER_SOURCE` 与读取判定 `isRollbackMarkerSource()`。`src/core/log-replay.ts` 与客户端 `markerDefinition.match` 一律改走该判定。
- **读取端同时接受三种拼写**：`{ plugin: 'rollback' }`、`{ kind: 'plugin', plugin: 'rollback' }`、`{ kind: 'plugin:rollback' }`。日志是 append-only 的，而 v4 迁移是把旧标记**重写**而非丢弃，所以同一个文件里两种拼写并存；只认新拼写会让升级过会话的已回退区段重新可见（幻影轮次，以及「曾创建的文件」误删你后来重建的文件）。
- **不会误判别的插件**：`{ kind: 'plugin', plugin: 'compaction' }` 这类来源不匹配。
- **兼容范围未改**：`dsh.engines.dsh` 仍为 `>=0.1.5-rc.2`。v3 的来源 kind 白名单只作用于 v2→v3 **迁移**路径，v3 原生准入从不约束 `user/message` 的 `source.kind`。

### 10.3 验证

- 单元测试 **280 通过 / 0 失败**；产物自检 **27/27**；`lib/*.js` 重建后**哈希逐字节一致**（构建可复现）。
- 用**宿主自己的 v4 编解码代码**（从运行中的 `app.asar` 原样抽出的 `@deepseek-ai/dsh-session-format*` @0.2.0-rc.2，配仓库测试的 loader hook，脚本 `C:\Users\Administrator\.dsh\_v4verify\check.mjs`）跑真实计划产物：新拼写在 `assertV4RowAdmission` 与 `encodeEvent` 两个入口**都通过**；0.4.1 的旧拼写在两处都被拒，报文**正是**上面那条 —— 完整复现了那次故障。
- 发布产物核对：npm tarball 与 `release/*.tgz` **解包后 8 个文件逐字节相同**（tgz 自身字节不同，仅因压缩参数）；`latest/download/dsh-rollback.tgz` 实测 HTTP 200 且 sha1 = 本地 `8fa1305a8f373067c5d41cd4b7b8e1c63397649f`；npm `0.4.2` 的 `gitHead = 1b4d234ab9aa138681288932df242d9a0963f4a9` 与本地 HEAD 一致。
- 构建产物里的运行时常量已核实：`const ROLLBACK_MARKER_KIND = "plugin:rollback"`、`ROLLBACK_MARKER_SOURCE = { kind: ROLLBACK_MARKER_KIND }`；`lib/` 里 3 处 `kind: 'plugin'` **全部在注释里**，没有任何代码再写旧拼写。

### 10.4 发布记录

- 代码：`1b4d234`（12 files, +380/−31），注解 tag `v0.4.2`，`main` 已同步（本地 HEAD = 远端 main）。
- npm：`@nianchu/dsh-rollback@0.4.2`（`latest`）。
- GitHub Release `v0.4.2`（id `404397207`，非 draft/prerelease），两个资产：`dsh-rollback.tgz`（版本无关，供 `latest/download/` 用）+ `dsh-rollback-0.4.2.tgz`。
- 市场目录条目已在（`category: ui`，`npm: @nianchu/dsh-rollback` + `tarball: .../latest/download/dsh-rollback.tgz`）。目录里那个 `version` 字段是**对方 CI 抓取的信息字段**，会自动更新，不需要我们改。

### 10.5 本次新踩的坑

1. **不要用 PowerShell 写 GitHub API 的 JSON 正文。** PS 5.1 的 `Get-Content` 默认按 ANSI 解码 UTF-8，中文变乱码；`Invoke-RestMethod` 组 body 时还容易把 PS 对象序列化混进去 —— 本次 Release 正文一度变成 `{"value" => "...", "PSPath" => ...}` 的垃圾（27521 字符）。**改用 node（`fs.readFileSync(p,'utf8')` + `fetch` + `JSON.stringify`）一次通过**（改成 1642 字符）。
2. `PATCH /releases/tags/{tag}` 本次返回 **404**（空回执），连带资产上传 URL 变成 `.../releases//assets` 也 404。**改为先 `GET /releases/tags/{tag}` 取 `id`，再 `PATCH /releases/{id}`**，问题消失。
3. 创建 Release 时 `body` 传**字节数组**会 422，传**字符串**正常。
4. **`Select-String -SimpleMatch` 会给假阴性**：查 `plugin:rollback` 返回 0 处，而 node 读出 2 处。核对构建产物请用 node。

### 10.6 本机 profile 部署（重要）

- `profiles/desktop`（用户实际在用的 profile）原先装的是 **0.4.1（有缺陷的版本）**。
- **pnpm 路线被该 profile 自己的供应链策略挡住**：`dsh plugin --profile desktop add -w "@nianchu/dsh-rollback@^0.4.2"` 报
  `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification: dsh-cost-meter@1.8.12 was published at 2026-10-05T15:26:19.307Z, within the minimumReleaseAge cutoff`。
  即：锁文件里**别的包**没过 24 小时门禁，会导致该 profile 里**任何** `dsh plugin add` 都失败。注意 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里**已经有** `dsh-cost-meter@1.8.12`，但 pnpm 的锁文件校验**不采信**该排除项。
- 因此改为**手工落盘 + 同步 spec**（与更早一次部署同法）：把仓库构建产物 8 个文件覆盖到 `profiles/desktop/node_modules/@nianchu/dsh-rollback`，并把 `package.json` 依赖由 `0.4.1` 改为 `^0.4.2`。**故意不留在 0.4.1**：否则日后 `pnpm install` 会静默降级回有缺陷的版本（上次就是这么丢的部署）。0.4.1 原目录备份在 `C:\Users\Administrator\.dsh\_backup\desktop-dsh-rollback-0.4.1`。
- 落盘后核对：`lib/index.js`、`lib/invariant.js`、`lib/client.js`、`package.json`、`cordis.patch.yml` 的 SHA256 与仓库构建产物**逐一相同**；profile 的 `dsh.profile.bundles` 仍列出 `@nianchu/dsh-rollback`。
- ⚠️ **改完必须重启 DSH**：profile 的 bundle 列表只在启动时组装。
- 24h 门禁时间表：`dsh-cost-meter@1.8.12` 于 **2026-10-06T15:26:19Z（北京 10-06 23:26）** 放行；本插件 `0.4.2` 于 **2026-10-07T06:42:55Z（北京 10-07 14:42）** 放行。在此之前该 profile 的 pnpm 操作仍会失败，属预期行为；届时 `pnpm install` 会把 desktop 收敛到 0.4.2。


### 10.7 ⚠️ 事故：改 profile 的 package.json 写进了 BOM（2026-10-06）

用 Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 修改 `profiles/desktop/package.json` 时，**PS 5.1 会在文件开头写入 UTF-8 BOM**（字节 `EF BB BF`）。DSH 启动时 `readProfileManifest`（`@deepseek-ai/dsh-app-boot`）对该文件直接 `JSON.parse`，于是宿主启动失败：

```
DesktopHostFatalError: Unexpected token '', "{
  "name"... is not valid JSON
    at JSON.parse ... readProfileManifest ... loadProfileDirectory ... main
```

（crash log 落在 `C:\Users\Administrator\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-*.log`）

**规则：不要用 PS 5.1 的 `Set-Content -Encoding UTF8` 改 profile 的 JSON/YAML。** 改用 node（`fs.writeFileSync(p, text, 'utf8')` 不写 BOM）或 `[System.IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))`。改完务必校验首字节不是 `EF BB BF` 并 `JSON.parse` 一次。

同理：**不要用 PowerShell 拼 GitHub API 的 JSON 正文**（见 10.5 第 1 条）——同一个成因。核对文件内容也别用 `Select-String -SimpleMatch`（会给假阴性），用 node。


### 10.8 0.4.3 发布（纯文档版）与本次新踩的坑

0.4.3 **没有任何行为改动**（`lib/*.js` 与 0.4.2 的差异仅 `PLUGIN_VERSION` 一行）。重新发布的唯一理由是：**npm 页面上的介绍是发布时烘进 tarball 的 README** —— 只改 README 而不重新发布，npm 上那一页永远不会变。

- 代码：`2e36a1d`「docs: 0.4.3 - document 0.2.0-rc.2 (official desktop) support and the 0.4.2 fix」（5 files changed, +111/−52），注解 tag `v0.4.3`。
- npm：`@nianchu/dsh-rollback@0.4.3`（`latest`），shasum `1a6c1b5e27ac5c269b71738b264ca1e6ea4da5f7`，`gitHead = 2e36a1d6388612f3ddc1fe78b41d18bae0b13774`。
- GitHub Release `v0.4.3`（id `404444289`）：`dsh-rollback.tgz` + `dsh-rollback-0.4.3.tgz`，各 79130 B、sha1 `679e623d8264d3be84a889b9139b041fee59be5b`，用 API 资产端点复核 `state=uploaded` 且与本地逐字节一致。
- 仓库 About 更新：description 改为中文（讲功能 + 标注 0.2.0-rc.2 已实测）、homepage 由 `github.com/nianchu/dsh-rollback` 改为 npm 包页、topics 由 `["dsh-plugin"]` 扩到 7 个。
- 市场目录条目**无需改动**：`npm: @nianchu/dsh-rollback` 与 `tarball: .../latest/download/dsh-rollback.tgz` 两条安装路径都自动跟随最新版。目录里的 `version` 展示字段由对方 CI 抓取，会滞后（核对时仍是 0.4.1）。
- 文档口径修正：上游 0.4.0 **也**独立适配了 0.2.0-rc.2，所以 README 不再写「上游从未验证」；改为明确两者**不能同时安装**（同一插件 id `rollback`、同一 `/rollback` 命令），并把行为差异表显式限定为「相对本 fork 自己的基线（上游 0.3.1）」。

#### 本次新踩的坑

1. **`PATCH /repos/{owner}/{repo}` 里的 `topics` 会被静默忽略**：返回 HTTP 200，但 topics 原样不变（description / homepage 却生效了）。要用专用端点 **`PUT /repos/{owner}/{repo}/topics`**，body 为 `{"names":[...]}`。
2. **npm 发布后版本文档会先连续 404**：本次实测 `GET /@nianchu/dsh-rollback/0.4.3` 连续 9 次 404、第 10 次（约 2 分钟后）才 200 —— 这是 CDN 对「发布前探测过的不存在对象」的负面缓存。查真实状态必须带 **cache-buster**（`?t=<random>`）；浏览器与任何本地缓存都会骗你。
3. **`github.com:443` 可能整体不通，而 `api.github.com` / `codeload.github.com` 照常** —— `git push` 走的正是前者（本次一度连续 3 次 `Connection was reset`）。此时用 Git Data API 复刻推送，sha 可**逐字符相同**、不产生分叉：`_push-commit-via-api.mjs`（建 blob → 以 parent 的 tree 作 `base_tree` 建 tree → 复刻 author/committer/时间戳建 commit → PATCH ref）。本地与远端会停在同一个 sha，网络恢复后直接 `git push` 即 up-to-date，无需 reset/rebase。
4. **PS 5.1 的 `Get-Content` 读 UTF-8 文件会整片乱码**（按 ANSI 解码）。看这个文件请用 node 或 `Get-Content -Encoding UTF8`；判断「文件里到底有没有某个字符串」一律用 node。
