# 上架交接单（@nianchu/dsh-rollback → github.com/ZhaoZeW/dsh-rollback）

**状态：npm 已发布 · GitHub 仓库与 Release 已发布 · 注册表 PR 已提交（等合并）**

- npm：`@nianchu/dsh-rollback@0.4.1`（`latest`）— 见第九节
- 注册表 PR：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5992> — 见第八节
- ⚠️ 待办：0.4.1 的**代码尚未推送**到 GitHub，`v0.4.1` 的 tag/Release 也还没建（需要一个新 GitHub token）

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


