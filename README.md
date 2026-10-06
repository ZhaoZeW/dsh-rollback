# @nianchu/dsh-rollback · TRAE 式「回退」插件

[![npm](https://img.shields.io/npm/v/@nianchu/dsh-rollback)](https://www.npmjs.com/package/@nianchu/dsh-rollback)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

把**工作区文件**和**模型上下文**同时退回某一轮对话发起之前 —— 一键、原位、同一个 session id。

> **适用版本**：DeepSeek Harness（DSH）**0.2.0-rc.2 —— 官方桌面版当前捆绑的构建，已实测**。0.1.5-rc.2 及以上同样支持，详见[兼容矩阵](#兼容矩阵)。

## 它解决什么问题

模型的行为由**对话历史**和**工作区文件**共同决定。所以「回到刚才那一步」必须同时回滚两者，否则会出现幻觉延续或状态冲突：只删对话，文件还留着刚才的改动；只还原文件，模型还记得自己改过什么。

本插件把这件事做成一步：

1. **恢复文件** —— 本轮及之后被改过的写回旧内容，被删掉的放回来，本轮新建的删掉；
2. **截断对话** —— 用 DSH 自带的表层 `replace` 原语就地替换这段历史（与官方 `/compact` 同款），**当场生效**，session id 不变。

## 功能

| 能力 | 说明 |
| --- | --- |
| 按轮次检查点 | 每轮发起前建立检查点，只记录该轮**实际触碰**的文件（Copy-before-Write 前置内容），不是全量快照 |
| 10 轮滑动窗口 | 借鉴 TRAE「仅最近 10 轮」，超出窗口的检查点被丢弃，`list` 与按钮据此置灰 |
| 文件回退 | 修改过的写回旧内容、被删除的放回来、本轮新建的删除、无法恢复的单独报告「跳过」 |
| 原位截断 | 一条带 `surfaceOp:{op:'replace',startSeq,endSeq}` 的 `user/message`，当场把这段历史移出模型上下文，session id 不变 |
| 回退前预览 | 弹窗逐条列出受影响文件与动作，并给出**实时读盘**的统一 diff（`-` 离开磁盘 / `+` 写回磁盘），重启前后一致 |
| 两种触发入口 | 人工命令 `/rollback`；Web 端每轮结束后的「回退」按钮（正常轮次在动作条、被中断的轮次在轮次页脚） |
| 契约自检 | `/rollback doctor`：22 项框架契约逐条给出 `[正常]/[缺失]/[降级]`、实测值与处置建议 |
| 回退后隐藏 | 被回退的消息从对话流里隐藏，可在**设置**里关闭 |
| 运行中禁止回退 | 只要有一轮还在跑就整体拒绝，必须等它结束或暂停 |
| **不提供模型工具** | 回退**只能由人发起**：模型自己回退必然发生在「某一轮进行中」，而这一情形一律被拒绝。本插件不注册任何 tool（`inject` 列表里没有 `tools` 服务） |

## 使用

1. **Web 按钮**：每条已完成 AI 回复的动作条里出现 ↩「回退」→ 弹窗列出受影响文件与 diff → 确认。
2. **人工命令**：

   | 命令 | 作用 |
   | --- | --- |
   | `/rollback list` | 列出可回退到的轮次 |
   | `/rollback preview <n>` / `preview last` | 预览会影响的文件与 diff（不执行） |
   | `/rollback <n>` | 回退到第 n 轮发起之前 |
   | `/rollback undo-last` | 回退最近一轮（别名 `undo`） |
   | `/rollback doctor` | 22 项框架契约自检 |

## 安装

```powershell
# npm（推荐）
dsh plugin --profile web add @nianchu/dsh-rollback

# 或从本地目录（无需联网）
dsh plugin --profile web add file:C:\path\to\dsh-rollback
```

> `--profile` 换成你自己的 profile 名（官方桌面版通常是 `desktop`）。装完**重启 DSH**。
>
> **必须把包登记进 profile 的 `dsh.profile.bundles`**。`dsh plugin add` 只写 `dependencies`，不会登记 bundles；漏登记的表现是「插件装好了但完全不生效」。

## 本次更新修了什么

### 0.4.2 —— 修掉「回退之后，这个会话再也发不出去」（重要）

**症状**：用过一次回退之后，该会话**每一轮**都失败 —— 报错原文是

```
format v4 message requires a producer-owned source kind
```

而且**跟你选哪个模型无关**：切到别的模型、再切回来，都是一样的错。这个会话从此写不进任何东西。

**根因**：回退标记是一条 `user/message`，0.4.1 及更早版本给它盖的来源是

```js
source = { kind: 'plugin', plugin: 'rollback' }
```

DSH **0.2.0** 启用了会话格式 **v4**，v4 要求每条消息的来源 kind 必须**由产生者持有**（`plugin:<名字>` 这种拼写）。于是编码时被 `assertV4MessageSources` 拒绝。真正致命的不是「被拒绝」，而是**拒绝发生的位置**：它在**持久化 drain** 里，不在 `append` 的调用栈上 —— `append` 已经返回成功，失败的批次却被留在写队列头部，此后该会话**每一次**写入都要重新编码同一批次、抛同一个错。

**修法**：标记改写成 v4 要的拼写

```js
source = { kind: 'plugin:rollback' }
```

与 DSH 自己 v3→v4 迁移时给未登记插件分配的拼写一致（`producerKind()` → `plugin:<name>`，并丢掉 `plugin` 字段）。

**读取端同时接受三种拼写**（`{plugin:'rollback'}`、`{kind:'plugin',plugin:'rollback'}`、`{kind:'plugin:rollback'}`）：日志是 append-only 的，升级前写下的标记必须继续被识别，否则那些轮次会作为幽灵重新出现。判定收敛到单一出处 `src/core/marker-source.ts`，宿主半与浏览器半共用，避免两处规则再次分叉。

**已用真实编码器验证**：从官方桌面版 app.asar 里原样抽出 `@deepseek-ai/dsh-session-format-v3-to-v4@0.2.0-rc.2`，新拼写在 `assertV4RowAdmission` 与 `releasedV4SessionFormatCodec.encodeEvent` 两个入口都被准入，旧拼写两处都抛上面那句错。

### 0.4.3 —— 文档与兼容矩阵

- 本版**无行为变更**（`lib/*.js` 与 0.4.2 的差异仅限 `PLUGIN_VERSION` 字符串）。
- 更新说明与兼容矩阵，明确 **0.2.0-rc.2（官方桌面版）已实测**，并写清 0.4.2 修了什么。
- 为什么要在文档上再发一版：npm 页面上的介绍是**发布时烘进 tarball 的 README**，只有重新发布才能刷新。

## 兼容矩阵

| DSH 版本 | 状态 | 说明 |
| --- | --- | --- |
| **0.2.0-rc.2**（官方桌面版） | **已实测** | 本版的目标构建：回退、续写、重启前后预览一致均在它上面跑通；v4 标记修复也以它为准绳验证 |
| 0.1.7-rc.2 | **已实测**（0.4.1 及更早） | 上一代适配基线：构建、产物校验、单元测试、隔离 profile 引导均在此版本上执行 |
| 0.1.5-rc.2 | 按设计支持，**未实测** | 写入契约与 0.1.7 一致，但未在本机跑过 |
| ≤0.1.1 | **不支持** | 已移除旧拼写（`surfaceOp` 的 `start`/`end`）的写入路径与旧服务回退分支 |

> 新拼写在旧引擎上同样可用：v3 的来源 kind 白名单只作用于 **v2→v3 迁移**路径，v3 原生准入从不约束 `user/message` 的 `source.kind`，因此 `dsh.engines.dsh` 保持 `>=0.1.5-rc.2` 不变。

## 与上游的关系

本包是 `@domitor-syh/dsh-rollback` 的**重建版**，基线是上游 **0.3.1**，代码在本仓库内维护、标识统一为 `nianchu`。

上游在 0.4.0 也独立完成了对 0.2.0-rc.2 的适配，两个包现在身处同一条战线。需要注意的是：**两者不能同时安装** —— 它们注册同一个插件 id（`rollback`）与同一个 `/rollback` 命令。**请二选一。**

下面这张表只说明本 fork 相对**自己的基线（上游 0.3.1）**做了什么，不构成对上游当前版本的判断：

| 方面 | 上游 0.3.1 | 本版 |
| --- | --- | --- |
| 预览 diff 方向 | 与自身注释相反（`restore` 画的是「这一轮做了什么」） | 统一为「`-` 离开磁盘 / `+` 写回磁盘」，与执行路径一致 |
| 预览的现状基线 | 跨度最后一次记录的 `after`（重启后丢失、多轮后过期） | **每次预览实时读盘**，重启前后一致、不会落后于后续轮次 |
| 未知事后状态 | 空串冒充「未观测」，渲染出伪造的单边 diff | 读不到即 `null`，明确显示「跳过预览」；真空文件读为空串并正常出 diff |
| 诊断 | 仅控制台告警 | `/rollback doctor`，22 项契约逐条点名 |
| 无算术入口 | 需先 `list` 再手输轮次 | `/rollback undo-last` |
| 隐藏逻辑 | 无开关 | 可在设置中关闭 |
| ≤0.1.1 兼容分支 | 保留大量双路回退 | 已清理，只维护 0.1.5+ 契约 |
| 验证方式 | 上游自己的测试 | 构建可复现 + 27 项产物断言 + 单元测试 + 真实 v4 编码器准入测试，全部可复跑 |
| 标识 | `@domitor-syh/*` | `@nianchu/*` |

## 架构

| 文件 | 职责 |
| --- | --- |
| `src/core/` | 纯逻辑、零 DSH 依赖：检查点模型、捕获合并、回退规划、截断规划、滑动窗口、会话折叠、预览格式、契约自检、字面量编辑、空目录规划 |
| `src/service.ts` | Host 侧执行：`tools/result` 捕获写/改前置内容、`session/event` 折叠轮次、预览实时读盘、执行恢复/删除/截断 |
| `src/index.ts` | 插件体：`/rollback` 命令（含 `doctor`/`undo-last`）与系统提示词注入 |
| `src/client/index.ts` | 浏览器侧：动作条与轮次页脚按钮、带 diff 的确认弹窗、标记驱动的隐藏（可开关）、欢迎页、本地化 |
| `scripts/` | 构建、产物校验、测试运行器 |

## 构建与验证

```powershell
node scripts/build.mjs             # 产出 lib/index.js、lib/invariant.js、lib/client.js
node scripts/verify-artifacts.mjs  # 产物契约校验（27 项断言）
node scripts/run-tests.mjs         # 全部单元测试
```

`scripts/build.mjs` 直接驱动 **rolldown**（`tsdown` 的底层引擎）而不是 `tsdown` CLI，原因见该文件顶部注释：本机 pnpm 安装只填满了虚拟店 `.pnpm/` 却没有创建顶层符号链接，任何按包名解析自身依赖的工具（`tsdown` 需要 `ansis`、`vitest` 需要 `@vitest/utils`）都无法启动。构建脚本按绝对路径加载 rolldown，产物契约与 `tsdown.config.ts` 完全一致。

同理，`scripts/run-tests.mjs` 用 Node 原生类型剥离执行测试，并通过模块钩子把 `vitest` 解析到 `scripts/tests-shim.mjs`（只实现这批判测试用到的 `describe`/`it`/`expect` 子集）。若你的环境 pnpm 链接正常，`pnpm exec vitest run` 可直接使用，是更权威的通道。

## 已知限制

- **无法恢复的文件被跳过，而不是中止整次回退**：能恢复的照做、对话照样截断，跳过项在预览里就标着「跳过」，其记录保留以便下次重试。
- **超出保留范围的回退目标被拒绝**：检查点是 10 轮滑动窗口，更早的状态无法重建。
- **聊天轨迹仍保留已回退的消息**：日志 append-only 且表层 `replace` 只作用于模型上下文，界面隐藏由日志里的持久标记驱动。
- **模型会读到一行检查点文字**（约 34 token），词表由字符预算测试钉住。
- **shell 新建的文件、以及从未被文件工具碰过的文件不在回退范围**：插件只从 `write`/`edit` 的结果捕获改动，并在轮次边界复查已登记路径。
- **边界重扫的未变判定只比较 size + mtime**：同一尺寸、同一毫秒内的改写会被漏检（真实操作间隔远大于 1ms，风险极低）。
- **回退不可撤销**：执行即替换历史，不提供 redo。
- **新建文件删除与空目录清理走本地文件系统**：文件系统抽象层没有删除原语，因此仅对本地后端可靠。

## 许可证

MIT。本仓库包含源自 `@domitor-syh/dsh-rollback`（作者 domitor-syh，MIT）的工作，已按 MIT 条款保留其许可与出处说明；随后的修改与维护由 nianchu 进行。
