# @nianchu/dsh-rollback · TRAE 式「回退」插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 端提供「回退到本轮对话发起前」：按轮次建立检查点，一次性把**工作区文件**与**模型上下文**同时回退到某一轮发起之前，并保持同一 session id。

本包是 `@domitor-syh/dsh-rollback` 的**重建版**（原作者已停止对新版 DSH 的验证）。代码在本仓库内维护，标识统一为 `nianchu`，并针对 DSH **0.1.7-rc.2** 做了实证与创造。

## 为什么会有这个 fork

1. **上游从未在 0.1.7 上验证过**。上游 `0.3.1` 发布于 `0.1.7-rc.2` 前 7 小时，其 README 却把 0.1.7 全系列标为「未验证」。本仓库把「未验证」变成「已实测」，并把验证方式固化成可复跑的脚本。
2. **上游存在两处会在确认弹窗里给错信息的缺陷**：预览 diff 方向与其自身注释相反；「事后状态未知」用空串冒充，导致重启后所有预览都会画出伪造的单边 diff。
3. **上游没有诊断能力**。插件一旦因框架改名而失效，表现是「装了什么也没发生」。本版内置 `/rollback doctor`，逐项点名哪条契约不可用。

## 兼容矩阵

| DSH 版本 | 状态 | 说明 |
| --- | --- | --- |
| **0.1.7-rc.2** | **已实测** | 本仓库的构建、产物校验、273 条单元测试、隔离 profile 引导均在此版本上执行 |
| 0.1.5-rc.2 | 按设计支持，**未实测** | 上游的适配基线；本版删除了对 ≤0.1.1 的兼容分支，0.1.5 的写入契约与此版本一致，但未在本机跑过 |
| ≤0.1.1 | **不支持** | 已移除旧拼写（`surfaceOp` 的 `start`/`end`）的写入路径与旧服务回退分支 |

> 读取端仍接受旧拼写的回退标记：日志是 append-only 的，升级前写下的标记必须继续能被识别，否则那些轮次会作为幽灵重新出现。

## 与上游的行为差异

| 方面 | 上游 0.3.1 | 本版 |
| --- | --- | --- |
| 预览 diff 方向 | 与自身注释相反（`restore` 画的是「这一轮做了什么」） | 统一为「`-` 离开磁盘 / `+` 写回磁盘」，与执行路径一致 |
| 预览的现状基线 | 跨度最后一次记录的 `after`（重启后丢失、多轮后过期） | **每次预览实时读盘**，因此重启前后一致、且不会落后于后续轮次 |
| 未知事后状态 | 空串冒充「未观测」，渲染出伪造单边 diff | 读不到即 `null`，明确显示「跳过预览」；真空文件读为空串并正常出 diff |
| 诊断 | 仅控制台告警 | `/rollback doctor`，22 项契约逐条点名 |
| 无算术入口 | 需先 `list` 再手输轮次 | `/rollback undo-last` |
| 隐藏逻辑 | 无开关 | 可在设置中关闭 |
| 0.1.1 兼容分支 | 保留大量双路回退 | 已清理，只维护 0.1.7 契约 |
| 构建 | `tsdown` | 同为 rolldown 驱动，但用自带脚本（见「构建」） |
| 标识 | `@domitor-syh/*` | `@nianchu/*` |

## 功能

| 能力 | 说明 |
| --- | --- |
| 按轮次检查点 | 每轮发起前建立检查点，只记录该轮实际触碰的文件（Copy-before-Write 前置内容），非全量快照 |
| 10 轮滑动窗口 | 超出窗口的检查点被丢弃；`/rollback list` 与按钮据此置灰 |
| 文件回退 | 修改过的写回旧内容、被删除的放回来、本轮新建的删除、无法恢复的单独报告「跳过」 |
| 原位截断 | 向 `session.surface` 的对应区间 append 一条带 `surfaceOp:{op:'replace',startSeq,endSeq}` 的 `user/message`（与官方 `/compact` 同款原语），**当场生效**，session id 不变 |
| 回退前预览 | 弹窗逐条列出受影响文件与动作，并给出**实时盘面**的统一 diff |
| 两种触发入口 | 人工命令 `/rollback`；Web 端每轮结束后的「回退」按钮（正常轮次在动作条、被中断的轮次在轮次页脚） |
| 契约自检 | `/rollback doctor`：22 项依赖逐条给出 正常/缺失/降级 与处置建议 |
| 运行中禁止回退 | 只要有一轮还在跑就整体拒绝，必须等它结束或暂停 |

## 安装

### 方式一：本地目录（无需上架、无需联网）

```powershell
# 在 DSH 的插件管理界面，或使用 CLI：
dsh plugin --profile web add file:C:\path\to\dsh-rollback
```

> **必须把包登记进 profile 的 `dsh.profile.bundles`**。`dsh plugin add` 只写 `dependencies`，不会登记 bundles；漏登记的表现是「插件装好了但完全不生效」。

### 方式二：npm（上架后）

```powershell
dsh plugin --profile web add @nianchu/dsh-rollback
```

两种方式对运行时完全等价：DSH 从 **profile 的 `node_modules`** 解析插件，不要求它来自 npm。

## 使用

1. **Web 按钮**：每条已完成 AI 回复的动作条里出现 ↩「回退」→ 弹窗列出受影响文件与 diff → 确认。
2. **人工命令**：
   - `/rollback list` — 列出可回退到的轮次
   - `/rollback preview <n>` / `preview last` — 预览会影响的文件与 diff（不执行）
   - `/rollback <n>` — 回退到第 n 轮发起之前
   - `/rollback undo-last` — 回退最近一轮
   - `/rollback doctor` — 契约自检

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
node scripts/verify-artifacts.mjs  # 产物契约校验（19 项断言）
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
