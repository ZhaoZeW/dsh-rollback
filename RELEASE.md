# 上架交接单（@nianchu/dsh-rollback → github.com/ZhaoZeW/dsh-rollback）

**状态：仓库已建好、已推送、已加 topic。只差 24 小时的时间门槛和 npm 那一步。**

---

## 一、已完成（我做的，全部经 API 核对）

| 项 | 实测结果 |
|---|---|
| GitHub 仓库 | <https://github.com/ZhaoZeW/dsh-rollback>（**Public**） |
| 默认分支 | `main`，HEAD = `aa1fa36` |
| 文件数 | **73**，含 `lib/index.js`、`lib/client.js`、`lib/invariant.js` |
| 误入库 | `node_modules` 0 个、`tests/.suite` 0 个 |
| `dsh-plugin` topic | ✅ 已加（注册表 CI 会检查） |
| 仓库描述 | ✅ 已填 |
| `dsh.bundle` 声明 | ✅ `{ "patch": "./cordis.patch.yml" }` |
| `repository` 字段 | ✅ `git+https://github.com/ZhaoZeW/dsh-rollback.git` |
| **从 GitHub 安装实测** | ✅ 通过（`prepare` 真实重建了产物，`lib/` 也随包落地） |

### ⚠️ 两个关键修正（我原先说错的地方）

1. **你的 GitHub 登录名是 `ZhaoZeW`，不是 `nianchu`。**「nianchu」是你资料页的**显示名**（display name）。注册表用的是仓库 URL 与 owner，所以条目必须是 `ZhaoZeW/dsh-rollback`、文件名 `ZhaoZeW__dsh-rollback.yml`。
2. **`lib/` 必须提交进仓库**（我原先 gitignore 掉了，已修正）。原因：DSH 从 bundle patch 指向的文件加载插件，而 GitHub 安装不装 devDependencies——`scripts/build.mjs` 依赖 rolldown，在用户机器上跑不了。提交 `lib/` 是让 GitHub 安装真正可用的前提。已实测：装完 `lib/` 齐备。

---

## 二、只剩 1 个时间门槛

仓库创建于 **2026-09-26T11:08:03Z**。

**注册表 CI 硬性要求仓库创建满 24 小时**，即最早可提 PR 的时间：

```
2026-09-27T11:08:03Z  （北京时间 2026-09-27 19:08）
```

届时告诉我，我用同一个 token 提 PR（需 `Pull requests: Read and write`，已具备）。

---

## 三、待提交的注册表条目（已生成）

文件：`registry-pr/ZhaoZeW__dsh-rollback.yml`（本地，已 gitignore 以免与注册表那份漂移）

放进注册表仓库的 `data/plugins/` 下即可：

```yaml
url: https://github.com/ZhaoZeW/dsh-rollback
name: ZhaoZeW/dsh-rollback
category: ui
description:
  en: 'TRAE-style conversation rollback for DeepSeek Harness: per-turn file checkpoints, restore plus in-place context truncation, an affected-file diff preview, and a /rollback doctor contract self-check.'
  zh: 'TRAE 式「回退」插件：按轮次建立文件检查点，一键把工作区文件与模型上下文同时回退到某一轮发起之前；带受影响文件 diff 预览与 /rollback doctor 契约自检。'
```

**不要**手工编辑该仓库的 README / README.zh.md（由 `data/plugins/*.yml` 生成）。

---

## 四、npm 发布：需要你先做一个决定 ⚠️

我探测到：

| 包名 | 状态 |
|---|---|
| `dsh-rollback` | **已被占用** |
| `@zhaozew/dsh-rollback` | 可用 |
| `@nianchu/dsh-rollback` | 名称可用，**但 `nianchu` 这个 npm 用户名/组织不是你的** |

npm 的 scoped 包要求你**拥有同名用户名或组织**。你的 GitHub 是 `ZhaoZeW`：

- 若你的 **npm 用户名也是 `ZhaoZeW`** → 建议把包改名为 **`@zhaozew/dsh-rollback`**（我可以一键改，改名不影响已推送的仓库）
- 若你确实想用 `@nianchu` → 需要去 npmjs.com 建一个叫 `nianchu` 的组织。**但如果那个用户名已被别人注册，你就拿不到**（npm 用户名不可重复，用 GitHub 登录也不保证同名可用）
- **不发 npm 也完全可以**：官方明确说收录与 npm 无关，只是市场上没有下载量数字

无论哪个包名，**`repository` 字段必须指回 `ZhaoZeW/dsh-rollback`**（官方硬性要求，否则市场不会关联）——这一项已经填对。

发布命令（确定包名后）：

```powershell
npm adduser --registry=https://registry.npmjs.org        # 你自己登录，别给我密码
npm publish --registry=https://registry.npmjs.org --access public
```

⚠️ 本机 `.npmrc` 的 registry 是 `https://registry.npmmirror.com`（**镜像站只能读不能发**），所以必须显式指定官方 registry。⚠️ `--access public` 对 scoped 包是必需项。

---

## 五、不发 npm 的替代方案

把预构建 tarball 挂到 GitHub Release，条目加 `tarball:` 字段：

```powershell
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
node scripts/pack-tarball.mjs     # 产出 release/dsh-rollback.tgz（故意不带版本号）
```

然后到 <https://github.com/ZhaoZeW/dsh-rollback/releases/new> 手动上传该 tgz，打 tag `v0.4.0`。条目加：

```yaml
tarball: https://github.com/ZhaoZeW/dsh-rollback/releases/latest/download/dsh-rollback.tgz
```

> 资产名**故意不带版本号**：`releases/latest/download/` 会在请求时解析 `latest` 但照字面取文件名，带版本号的名字提交当天有效、下次发版就 404（官方称之为 "quiet rot"）。

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

**请你现在就到 <https://github.com/settings/personal-access-tokens> 把这个 token Revoke 掉**，等 24 小时后要提 PR 时再新建一个（只需 `Pull requests: Read and write` + `Contents: Read and write`，且可限定为 `Only select repositories` → `ZhaoZeW/dsh-rollback`，比现在这个权限小得多）。
