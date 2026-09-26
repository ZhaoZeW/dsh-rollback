# 隔离 profile 端到端回归清单（/rollback 插件）

> 状态：**全部未执行**。原因见文末「未能执行的原因」。本文件是可直接照抄执行的清单，不是执行记录。
> 与主理人纠偏一致：**重启后 preview 不再退化为「(跳过预览)」，正确预期是与重启前逐字符相同。**

## 0. 前置条件（不满足则后面全部无效）

| 项 | 检查命令 | 期望 |
|---|---|---|
| 宿主版本 | `node -e "console.log(require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json').version)"` | `0.1.7-rc.2` |
| 产物存在且比 src 新 | `Get-ChildItem .\lib, .\src -Recurse -File \| Sort-Object LastWriteTime \| Select-Object -Last 3 FullName,LastWriteTime` | `lib/index.js`、`lib/client.js`、`lib/invariant.js` 的 mtime ≥ 最近一次 src 改动 |
| 客户端产物无 Node 全局 | `Select-String .\lib\client.js -Pattern 'Buffer\.(byteLength\|from)\|require\(' -AllMatches` | 0 命中（`lib/index.js` 允许有，宿主侧） |
| 包内自检 | `/rollback doctor` | 16 个服务/fs 缝全 `[正常]`；无 `[缺失]` |

**安装陷阱（已知事实，必须处理）**：`dsh plugin --profile verify add <pkg>` 只写 `dependencies`，**不登记 `dsh.profile.bundles`**；不登记插件完全不加载。安装后必须手工确认 profile 配置里出现该 bundle，再启动。

## 1. 搭建隔离环境（不碰用户 web profile）

```powershell
$DSH  = 'C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh'
$HOME = 'C:\Users\Administrator\.dsh\_verify\home'          # 隔离 DSH_HOME
$PKG  = 'C:\Users\Administrator\.dsh\nianchu-plugins\dsh-rollback'
$RUN  = 'C:\Users\Administrator\.dsh\_plugin-research\run.mjs'   # 管道被禁时的输出捕获包装器

# 1) 安装本包（本地路径）
node $RUN $PKG e2e-add pnpm exec dsh plugin --profile verify add "file:$PKG"   # 具体子命令以 dsh plugin --help 为准
# 2) 打开 <$HOME 对应 profile>/config…，确认 bundles 含 @nianchu/dsh-rollback，否则手工加上
# 3) 启动（端口 3099，避免与用户 3080 冲突）
node $RUN $HOME e2e-boot node "$DSH\bin\dsh.js" web --profile verify --port 3099
```
启动日志在 `C:\Users\Administrator\.dsh\_verify\logs\e2e-boot.{out,err}.txt`。

**期望**：`零插件失败`（无 `plugin failed to load` / `fiber parked`）、`零契约告警`（无 `invalid surfaceOp`、无 `is not a function`）。

## 2. 命令矩阵（宿主半边）

| # | 前置条件 | 操作步骤 | 预期结果 |
|---|---|---|---|
| E1 | 刚启动、未进入任何会话 | 执行 `/rollback doctor` | 首行 `回退插件契约自检 · 插件 0.4.0`（0.1.7-rc.2 实测不提供 `dshBrand/brand/packageManifest`，故**不出现** `· DSH <版本>`）；22 项中 19 项 `[正常]`，3 项会话实例缝（`session.snapshotEvents`/`session.append(surfaceOp)`/`session.surface`）显示 **`[未探针]`**（无活会话），**不是** `[缺失]`/`[降级]`；末行含「未探针」说明 |
| E2 | 会话内 | `/rollback doctor` | 22 项全 `[正常]`（会话实例缝此时可探） |
| E3 | 新会话，尚无文件改动 | `/rollback list` | `当前会话没有可回退的轮次。(仅最近 10 轮)` |
| E4 | — | 让模型用 `write` 工具新建 `e2e\a.txt`（内容 3 行），等该轮结束 | 无插件报错；`/rollback list` 列出该轮号 |
| E5 | E4 之后 | `/rollback preview last` | 首行 `回退到第 N 轮发起前（最后一轮），受影响文件：`；块行 `  [删除] <path>  (+0/-3)`（新增文件待删，`-` 为当前盘上内容）；footer `  对话截断：将截断` |
| E6 | E4 之后，用 `write` 把 `a.txt` 改成 5 行 | `/rollback preview last` | `  [恢复] <path>  (+3/-2)` 形态；`-` 行 = **当前盘上**的 5 行，`+` 行 = 回退前的 3 行 |
| E7 | E4 之后，外部把 `a.txt` 内容再改一次（`Set-Content`） | `/rollback preview last` | `-` 行反映**刚才外部改动后**的内容（`currentOnDisk` 生效；若沿用跨度记录会显示旧内容 → 视为失败） |
| E8 | E4 之后，外部删除 `a.txt` | `/rollback preview last` | 该文件块为 `  [删除] <path>  (+0/-3)` 或带 `(跳过预览)`；**不得**出现「盘上当前为空」的错误表述；`-` 行不得凭空显示被删内容 |
| E9 | E4 之后，外部把 `a.txt` 截成 0 字节 | `/rollback preview last` | **不出现** `(跳过预览)`；`after === ''` 被当作「真的是空文件」，正常渲染（`-` 行为空） |
| E10 | E6 之后 | 关闭宿主，用同一 profile/会话重新启动，再执行 `/rollback preview last` | **与重启前逐字符相同**（主理人纠偏后的正确预期；出现 `(跳过预览)` 即为失败） |
| E11 | E6 之后 | `/rollback undo-last` | 文件内容回到该轮之前；对话被就地截断；出现 rollback 分隔/标记（`rollback-marker` 节点，`source.plugin === 'rollback'`）；无 `invalid replace surfaceOp` 告警 |
| E12 | E11 之后 | `/rollback preview last` / `/rollback list` | 已回退的轮不再可回退；不复活已删除文件 |
| E13 | 任一时刻 | `/rollback 0`、`/rollback abc`、`/rollback preview 9999` | 分别返回用法提示 / `用法：/rollback [list \| doctor \| preview <turn> \| <turn> \| undo-last]` / 超范围拒绝（`windowRefusal` 文案），均不抛栈 |
| E14 | 用 `str_replace_editor` 做一次编辑 | `/rollback preview last` | 该文件能预览（预读 basis 生效），无「basis-unknown」误判 |
| E15 | 文件有 NUL 字节（二进制） | `/rollback preview last` | 该文件带 `(binary)` 或 `(跳过预览)`，不把二进制当文本 diff |

## 3. 浏览器半边（http://127.0.0.1:3099）

| # | 操作 | 预期 |
|---|---|---|
| W1 | 助手消息尾部 | 出现回退按钮（`conversation.chat.assistant-actions` 槽） |
| W2 | 点击回退按钮 | 弹出确认框，逐文件列出文件与 `+a/-b` 统计；可展开看 diff 行（`+`/`-` 着色） |
| W3 | 键盘 | `Tab` 焦点困在弹窗内；`Esc` 关闭；`aria-*` 属性存在（`role="dialog"`、`aria-modal`） |
| W4 | 设置项 | 设置页出现插件开关，可切换逻辑标记隐藏；切换后刷新仍生效 |
| W5 | 一键入口 | `undo-last` 一键回退可用，快捷键触发与按钮一致 |
| W6 | 文案 | 中英文均完整（无中文直出到 en、无未翻译 key） |
| W7 | 回退后 | 该 turn 之后的对话从界面消失（就地截断），无残留 receipt |
| W8 | 弹窗取消 | 取消后不产生任何命令 receipt（RPC 行被隐藏） |
| W9 | 控制台 | 无 `ReferenceError: Buffer is not defined` 等异常 |

## 4. 批量回归（本目录的自动化用例）

```powershell
# A. 主理人提供的 shim runner（当前可用，覆盖 tests/*.test.ts 全部）
node scripts/run-tests.mjs

# B. 本会话可用的真实 vitest 2.1.9 执行器（tests/.suite，一次性、可删）
node "$PKG\tests\.suite\run-suite.mjs" --reporter=basic

# C. 权威命令（需先修好 node_modules 链接；当前仍失败）
node $RUN $PKG vitest-canonical pnpm exec vitest run --reporter=basic
```

| 用例组 | 覆盖 | 期望 |
|---|---|---|
| `preview-format.test.ts`（40） | `cappedDiff` 计数/预算/截断/CRLF/超长行、`renderEntry`、`parsePreview` 往返与容错、`diffable` 字节上限、浏览器安全 | 40/40 通过 |
| `contract-audit.test.ts`（43） | 22 项 finding 的 id/顺序/状态、`[未探针]`、`ctx.emit` vs `ctx.on`、getter 按值探、`shapeOf` 原型、`formatAudit` 全部渲染分支 | 43/43 通过 |
| `service-preview.test.ts`（12） | `preview()` 用盘上内容覆盖 `after`；空文件 vs 读不到；不可读→`null`；policy 抛错回退；重启前后计划一致 | 12/12 通过 |
| 既有 13 个上游用例 | 捕获/回退/截断/根目录写/边界重扫 | runner A 报 0 失败；**runner B 报 5 失败（真实）**，见 §5-R2 |

**两个 runner 的分歧本身就是证据**：同一批文件、同一个工作区，
- runner A（`scripts/tests-shim.mjs`）：`273 passed, 0 failed`
- runner B（真实 vitest 2.1.9）：`Tests 5 failed | 268 passed (273)`

分歧全部来自 `boundary-pipeline.test.ts` 中 5 处期望对象缺 `after` 键。**runner B 是对的**（见 §5-R2 的机制），所以「0 failed」这一行目前不能作为验收依据。

## 5. 执行中必须盯住的已知红点与限制

- **R1（已由主理人修复，回归用例保留）**：`auditContracts` 曾对活会话 `session.surface` getter 抛错整体抛出。现 `probe()` 已兜住并报 `degraded`。用例：`tests/contract-audit.test.ts` → `keeps answering when a live session surface getter throws`。**本轮实测：43/43 通过。**
- **R2（未修，只在真实 vitest 下暴露）**：`tests/boundary-pipeline.test.ts` 有 5 处 `toEqual` 的期望对象缺 `RestoredFile.after` 键。真实 vitest 判定不等；`scripts/tests-shim.mjs:199` 的 `toEqual` 把它判成相等（见 R3）。位置与实收 `after` 值：行 93–95 → `''`；125–127 → `'clobbered by a shell command'`；151–153 → `''`；184–186 → `''`；228–230 → `'clobbered'`。
- **R3（测试基础设施缺陷，建议修 `scripts/tests-shim.mjs:199`）**：`deepEqual` 在 `ignoreUndefined` 模式下写的是
  `if (ignoreUndefined && (left === undefined || right === undefined)) continue`。
  只要**期望**侧没有该键（`right === undefined`），整个键就被跳过 —— 于是实际对象上任何**多出来的、有值的**属性都被无声忽略。jest/vitest 的 `` toEqual `` 只忽略「两侧都为 `undefined`」的属性，`{ after: '' }` 与 `{}` **不相等**。最小修复：
  `if (ignoreUndefined && left === undefined && right === undefined) continue`。
  不修此处的后果：任何「新增字段」「多余字段」类回归在 runner A 下都会假绿 —— 本任务里已经真实发生过一次（5 条）。
- **R4（已知限制，`boundary-scan.ts` 不在本轮改动范围）**：`unchangedByStat` 只凭 `size + mtimeMs` 判定「未变」。同一毫秒内、以**相同字节数**改写文件时 NTFS 的 mtime 不前进，扫描会走 stat-only 快速路径而不读取内容 → 该次内容变化被漏检。现实风险低（人/工具操作间隔远大于 1ms），但它是 `boundary-rescan.test.ts` 那条用例偶发失败的根因；已用 `utimes(file, now, now + 1000)` 让用例确定性越过该快速路径。若将来要根治实现，需在快速路径上补一次内容哈希或强制 mtime 单调性，并配套新增「同尺寸同毫秒改写」用例。
- **R5（集成观察，非本轮结论）**：`src/client/index.ts:134` 自带一份 `parsePreview`，只解析 `{action, path}`，不含 `added/removed/diff/note`，且该文件未 import `../core/preview-format.ts`（只 import 了 `turn-entry.ts`、`rollback-guard.ts`）。因此「宿主与浏览器共用同一套 wire format」这条设计目标当前**未成立**，确认弹窗也拿不到 diff。证据：`lib/client.js` 中 `codePointAt` 命中数 0（共享模块未被客户端打包）。修完后再跑 W2 才有意义。
- **R6（已核对，正确）**：`lib/index.js` 里的 `Buffer.byteLength` 来自 `src/root-write-fallback.ts`（宿主侧，允许）；`lib/client.js` 中 `Buffer` 命中数 0。共享模块 `src/core/preview-format.ts` 已不含 `Buffer`，由 `preview-format.test.ts` 的源码扫描用例守护。

## 6. 本轮实际执行记录（与上面的「建议用例」严格区分）

| 命令 | 实际结果 | 日志 |
|---|---|---|
| `node C:\Users\Administrator\.dsh\_plugin-research\run.mjs C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback suite-shim node C:/Users/Administrator/.dsh/nianchu-plugins/dsh-rollback/scripts/run-tests.mjs` | `273 passed, 0 failed`（exit 0）——**其中 5 条为 shim `toEqual` 假绿，见 R2/R3** | `_verify\logs\suite-shim.out.txt` |
| `node …\run.mjs <pkg> suite-final-realvitest node <pkg>\tests\.suite\run-suite.mjs --reporter=basic` | `Test Files 1 failed \| 15 passed (16)`；`Tests 5 failed \| 268 passed (273)`；失败全部在 `boundary-pipeline.test.ts` | `_verify\logs\suite-final-realvitest.out.txt` |
| `node …\run.mjs <pkg> test8 pnpm exec vitest run …`（权威命令） | **失败**：`ERR_MODULE_NOT_FOUND: Cannot find package '@vitest/utils' imported from node_modules\vitest\dist\chunks\cac.CB_9Zo9Q.js` | `_verify\logs\canonical-vitest.err.txt` |

本轮**未执行**：§1–§3 的全部 E*/W* 端到端与浏览器步骤。

## 未能执行的原因（如实标注）

1. 本清单所有 E*/W* 步骤 **未执行**：需要真正启动 DSH 宿主（子进程 + 管道 stdio）与浏览器交互；本会话沙箱禁止带管道的子进程 spawn，架构师已实测 `Access is denied`（本会话我也复现过同类拒绝）。
2. `lib/` 产物在本会话 17:35 才出现（属开发者职责范围），此前无任何可安装产物；因此我没有启动过宿主。
3. `pnpm exec vitest run`（权威命令）在本会话仍失败（见上表第 3 行）。§4 的 runner A/B 是绕过该环境限制的两条替代路径，执行的都是**同一批真实测试文件与真实 src**；runner B 用的是真实 vitest 2.1.9，runner A 用的是 `scripts/tests-shim.mjs` 的 `expect` 实现（其 `toEqual` 目前偏宽，见 R3）。
