# 上架准备说明（@nianchu/dsh-rollback）

DSH 社区**不是**一个提交式市场，而是一个 GitHub 上的精选注册表：

- 站点：https://awesome-dsh-plugin.com
- 数据源仓库：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- 当前收录：4353 个插件
- **上架方式 = 提 1 个 PR，只加 1 个 YAML 文件**（不要手工改 README，README 是脚本生成的）

## 一、注册表条目的确切格式

文件路径：`data/plugins/<owner>__<repo>.yml`（`owner`/`repo` 是你 GitHub 仓库的归属与名）

```yaml
url: https://github.com/OWNER/REPO
name: OWNER/REPO
category: ui
description:
  en: 'TRAE-style conversation rollback for DeepSeek Harness: per-turn file checkpoints, restore plus in-place context truncation, an affected-file diff preview, and a /rollback doctor contract self-check.'
  zh: 'TRAE 式「回退」插件：按轮次建立文件检查点，一键把工作区文件与模型上下文同时回退到某一轮发起之前；带受影响文件 diff 预览与 /rollback doctor 契约自检。'
```

规则要点（逐条核对过官方 contributing.md）：

| 规则 | 本插件状态 |
|---|---|
| `description.en` 必填，`zh` 可选 | ✅ 两个都写好了 |
| 描述含 `: ` 必须加引号 | ✅ 已用单引号包住 |
| 描述必须**属实**（会被对着代码核） | ⚠️ 见下方「描述自查」 |
| 仓库 `package.json` 须声明 `dsh.bundle` | ✅ 已声明 `{ "patch": "./cordis.patch.yml" }` |
| 仓库须有真实可用代码 | ✅ 273 个单测 + 实机引导验证 |
| **仓库创建满 1 天**（CI 自动查） | ⏳ 取决于你何时建仓库——**这是唯一的时间门槛** |
| 仓库加 `dsh-plugin` topic | ⏳ 建仓库后加 |
| 项目处于活跃维护 | ✅ |
| 一个 PR 最多 3 条 | ✅ 只提 1 条 |
| 分类选贴合实际的 | `ui`（界面增强）。落 `ui` 是因为主要价值体现在 Web 端交互；若你更认「会话与消息」，可改 `session`——官方明确说分类不会被拒 |
| `awesome-lint` + 站点构建 | 双语文案已就绪 |
| 不要手工编辑 README | ✅ 只加数据文件 |

## 二、描述自查（官方最看重的一条）

描述里提到的每个命令/API 都必须真实存在，否则会被打回。本插件实际提供：

- 命令：`/rollback`、`/rollback list`、`/rollback doctor`、`/rollback preview <turn>`、`/rollback preview last`、`/rollback undo-last`、`/rollback undo`、`/rollback <turn>`
- 界面：每条已完成回复动作条的「回退」按钮、被中断轮次的页脚入口、带可展开 diff 的确认弹窗、设置→通用里的隐藏开关
- 快捷键：`Ctrl+Shift+Z`
- 能力：10 轮滑动窗口检查点、文件恢复/找回/删除/跳过、原位对话截断、22 项契约自检
- 数据目录：`storages/nianchu-rollback/checkpoints-v2/`

**因此描述里不要写**"支持 N 种语言"之类未经核实的数字；上面这段就是我实际实现并验证过的范围。

## 三、npm 发布（可选，但推荐）

官方说明：**发不发 npm 都不影响收录**。好处是市场能显示下载量，且预构建安装可以免掉 `allowBuilds` 构建授权。

硬性要求：**已发布包的 `repository` 字段必须指回被收录的那个仓库**，否则两者不会关联。

⚠️ 本机 `.npmrc` 的 registry 是 `https://registry.npmmirror.com`（镜像站，只能读不能发布）。发布必须走官方 registry，命令里显式指定：

```powershell
npm publish --registry=https://registry.npmjs.org --access public
```

`--access public` 是 scoped 包的必要项，否则会作为私有包发布失败。

## 四、需要你提供的凭据（正确形态）

### GitHub —— 不要给密码

GitHub 早已不接受密码做 git/API 认证。正确做法是**细粒度 PAT**（Fine-grained personal access token），只授权必要的两项：

- 权限：`Contents: Read and write`（用于推送分支）
- 权限：`Pull requests: Read and write`（用于开 PR）
- 建议把 token 的 Repository access 限制为 **只选你将要创建的那一个仓库**，而不是 All repositories

token 形态形如 `github_pat_...`。拿到后设置到环境变量即可，我不需要看到它写进任何文件：

```powershell
$env:GITHUB_TOKEN = 'github_pat_...'   # 仅当前会话
```

### npm —— 你自己登录，不要把密码给我

npm 发布需要你的账号凭据。最安全的方式是**你在终端里自己跑一次登录**，凭据落在本机 npm 配置里，我只是调用发布命令：

```powershell
npm adduser --registry=https://registry.npmjs.org
# 或
npm login --registry=https://registry.npmjs.org
```

如果 `@nianchu` 不是你的 npm 用户名，你需要**先创建一个同名组织**（npmjs.com → Organizations → Create），才能发布 `@nianchu/*`。

## 五、我准备好的本地交付物

| 文件 | 作用 |
|---|---|
| `RELEASE.md`（本文件） | 上架流程与规则核对 |
| `registry-entry.example.yml` | 待填 owner/repo 的注册表条目模板 |
| `scripts/prepare-release.mjs` | 填好 owner/repo 后生成条目文件与 package.json 的 `repository` 字段 |
| `scripts/pack-tarball.mjs` | 生成 GitHub Release 用的 `.tgz`（不发 npm 时的替代方案） |

## 六、执行顺序（凭据就位后）

1. 你提供 GitHub 用户名/repo 名 → 我生成 `repository` 字段与注册表条目
2. 初始化 git 并提交 → 我推送（需 PAT）
3. **等到仓库满 24 小时**（CI 硬门槛，不可绕过）
4. 加 `dsh-plugin` topic
5. fork `awesome-dsh-plugin` → 加 `data/plugins/<owner>__<repo>.yml` → 提 PR
6. （可选）npm 发布，并用 `npm view` 确认 `repository` 已正确回指
