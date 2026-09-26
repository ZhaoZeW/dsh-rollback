# 上架交接单（@nianchu/dsh-rollback）

**状态：本地全部就绪，只等 GitHub 授权。**

---

## 一、现在只差 3 步

### 第 1 步：建 GitHub 仓库（手动，30 秒）

打开 <https://github.com/new>，填：

| 字段 | 值 |
|---|---|
| Repository name | `dsh-rollback` |
| Owner | `nianchu` |
| Description | `TRAE-style conversation rollback for DeepSeek Harness: per-turn checkpoints, in-place context truncation, and an affected-file diff preview.` |
| Visibility | Public（注册表只收公开仓库） |
| Initialize this repository with | **全部留空**（不要加 README / .gitignore / license——本地已有，会冲突） |

### 第 2 步：给我一个 PAT，我推送

创建地址：<https://github.com/settings/personal-access-tokens/new>

- **Repository access** → `Only select repositories` → 勾 `nianchu/dsh-rollback`
- **Permissions** → 展开 `Repository permissions`，只开两项：
  - `Contents` → **Read and write**
  - `Pull requests` → **Read and write**
- 生成后是 `github_pat_...` 形式

然后在本会话里告诉我 token（或你自己执行下面这段，效果一样）：

```powershell
$env:GITHUB_TOKEN = 'github_pat_...'
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
git remote add origin "https://nianchu:$env:GITHUB_TOKEN@github.com/nianchu/dsh-rollback.git"
git push -u origin main
```

> token 用完即可到同一页面 Revoke。我不会把它写进任何文件。

### 第 3 步：加 topic + 等 24 小时

- 仓库页 → 右上齿轮（About）→ Topics 加 **`dsh-plugin`**
- **CI 硬门槛：仓库创建满 24 小时才接受 PR。** 所以第 1 步越早做越好。

---

## 二、24 小时后提 PR（我可以代做，只需你确认）

注册表仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>

**只加 1 个文件**，路径与内容已生成好：

```
data/plugins/nianchu__dsh-rollback.yml
```

```yaml
url: https://github.com/nianchu/dsh-rollback
name: nianchu/dsh-rollback
category: ui
description:
  en: 'TRAE-style conversation rollback for DeepSeek Harness: per-turn file checkpoints, restore plus in-place context truncation, an affected-file diff preview, and a /rollback doctor contract self-check.'
  zh: 'TRAE 式「回退」插件：按轮次建立文件检查点，一键把工作区文件与模型上下文同时回退到某一轮发起之前；带受影响文件 diff 预览与 /rollback doctor 契约自检。'
```

本地副本：`registry-pr/nianchu__dsh-rollback.yml`（已被 .gitignore，避免与注册表仓库那份漂移）

**不要**手工编辑该仓库的 README / README.zh.md——它们由 `data/plugins/*.yml` 生成。

---

## 三、npm 发布（可选，不影响收录）

官方原文：*"listing is unaffected either way"*。好处是市场能显示下载量，且预构建安装免掉 `allowBuilds` 构建授权。

你已确认 GitHub 用户名是 `nianchu`，**npm 的 scoped 包要求你拥有同名用户名或组织**——若你的 npm 用户名也是 `nianchu`，可直接发：

```powershell
npm adduser --registry=https://registry.npmjs.org     # 你自己登录，不要给我密码
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
npm publish --registry=https://registry.npmjs.org --access public
```

⚠️ 本机 `.npmrc` 的 registry 是 `https://registry.npmmirror.com`（**镜像站只能读不能发**），所以必须像上面这样显式指定官方 registry。

⚠️ `--access public` 是 scoped 包的必要项，否则会以私有包发布失败。

**硬性要求（官方核实过）**：已发布包的 `repository` 字段必须指回被收录的仓库，否则市场不会把两者关联。这一项已经填好：

```json
"repository": { "type": "git", "url": "git+https://github.com/nianchu/dsh-rollback.git" }
```

发布后自查：

```powershell
npm view @nianchu/dsh-rollback repository.url
# 应输出 git+https://github.com/nianchu/dsh-rollback.git
```

---

## 四、不发 npm 的替代方案

把预构建 tarball 挂到 GitHub Release，注册表条目加一个 `tarball:` 字段：

```powershell
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
node scripts/pack-tarball.mjs
# 产出 release/dsh-rollback.tgz（故意不带版本号）
gh release create v0.4.0 release/dsh-rollback.tgz --title "v0.4.0" --notes-file CHANGELOG.md
```

对应条目字段：

```yaml
tarball: https://github.com/nianchu/dsh-rollback/releases/latest/download/dsh-rollback.tgz
```

> 资产名**故意不带版本号**：`releases/latest/download/` 会在请求时解析 `latest` 但**照字面取文件名**，带版本号的名字提交当天有效、下次发版就 404（官方文档把它称为 "quiet rot"）。

---

## 五、日后如何更新

| 场景 | 做法 |
|---|---|
| 改代码后重发 | `node scripts/build.mjs` → 改 `package.json` 的 `version` → 提交 → 打 tag → `npm publish`（或更新 Release 资产） |
| 注册表条目**不需要动** | 下载量与版本由 registry 自动采集，条目里只有 url/name/category/description |
| 改描述或换分类 | 编辑注册表里你那**一个** yml 文件再提 PR（官方要求：只改自己那一条） |
| 换截图 | 在本仓库加 `screenshots.json` 并推自己的仓库即可，**不用提 PR**，市场下次构建自动生效 |
| 验证没改坏 | `node scripts/verify-artifacts.mjs` + `node scripts/run-tests.mjs`（当前 27/27 与 273/0） |

---

## 六、提交前可复跑的自检

```powershell
cd C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback
node scripts/build.mjs              # 产出 lib/
node scripts/verify-artifacts.mjs   # 27 项产物契约断言
node scripts/run-tests.mjs          # 273 个单元测试
node scripts/prepare-release.mjs --status   # 发布元数据齐备性
```

`--status` 在 `repository` 或 `dsh-plugin` topic 缺失时会以非零码退出，可直接当发布前门禁用。
