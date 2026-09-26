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

**请你现在就到 <https://github.com/settings/personal-access-tokens> 把这个 token Revoke 掉**，等 24 小时后要提 PR 时再新建一个（只需 `Pull requests: Read and write` + `Contents: Read and write`，且可限定为 `Only select repositories` → `ZhaoZeW/dsh-rollback`，比现在这个权限小得多）。
