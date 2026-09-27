# 上架交接单（@nianchu/dsh-rollback → github.com/ZhaoZeW/dsh-rollback）

**状态：仓库已发布、Release 已发布、条目已提交 PR：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5992>**

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

## 四、发布路线：不走 npm（已确认采用）⚠️

用户**没有 npm 账号**，而 `@nianchu` / `@zhaozew` 这类 scope 需要拥有同名用户名或组织，因此本轮**不发布 npm**。

官方对此明确表态：*"listing is unaffected either way"* —— **收录与 npm 无关**，只是市场上不显示下载量数字。

**已实测的替代方案：预构建 tarball + GitHub Release**

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

**如果日后想改用 npm**（可选，随时可加）：

1. 到 <https://www.npmjs.com/signup> 注册账号（免费），验证邮箱
2. 若要用 scoped 包名，需用户名与 scope 同名；否则改用无 scope 名（`dsh-rollback` 已被占用，需另想名字）
3. `npm adduser --registry=https://registry.npmjs.org`（**你自己登录，不要把密码给我**）
4. `npm publish --registry=https://registry.npmjs.org --access public`
5. ⚠️ 本机 `.npmrc` 的 registry 是 `https://registry.npmmirror.com`（**镜像站只能读不能发**），所以上面两条命令**必须显式指定**官方 registry
6. ⚠️ `--access public` 对 scoped 包是必需项，否则会以私有包发布失败
7. 发布后自查 `repository` 是否回指本仓库（官方硬性要求，否则市场不会关联）：
   ```powershell
   npm view @你的scope/dsh-rollback repository.url
   ```

**当前 `repository` 字段已填对**：`git+https://github.com/ZhaoZeW/dsh-rollback.git`，所以日后无论走 npm 还是 tarball 都不会踩这个坑。

## 五、替代方案的本地验证

```powershell
dsh plugin --profile web add file:C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback/release/dsh-rollback.tgz
```

---

## 六、日后如何更新

| 场景 | 做法 |
|---|---|
| 改代码后发布 | `node scripts/build.mjs` → 改 `package.json` 的 `version` → 提交推送 → 打 tag → `npm publish` 或更新 Release 资产 |
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
- [ ] **立即吊销**那个 classic token（已无用）

