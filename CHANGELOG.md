# 更新日志

## 0.4.0 — 由 nianchu 重建（基线：上游 0.3.1）

### 身份
- 包名 `@domitor-syh/dsh-rollback` → **`@nianchu/dsh-rollback`**；作者、仓库、模块注册 id、bundle patch、日志前缀、本地化命名空间、磁盘状态目录（`storages/nianchu-rollback/`）全部改为 nianchu。源码与**产物**中上游作者标识零残留（由 `scripts/verify-artifacts.mjs` 断言）。
- **框架契约名保留未改**：`conversation.chat.*` 槽名、`rollback-marker` 节点 kind、`source.plugin='rollback'` 标记来源——改动它们会直接破坏与 DSH 的集成。

### 正确性修复（均源于代码审查，已复现）
- **预览 diff 方向反了**：上游对 `restore`/`recover` 渲染的是「这一轮做了什么」，与其自身注释和 `delete` 分支的原则相反，用户在不可撤销确认框里看到的是按钮将要做的事的反面。现统一为执行路径的事实：`-` = 离开磁盘，`+` = 写回磁盘。
- **「事后状态未知」用空串冒充**：上游两处生产者以 `''` 占位，而 `''` 同时是「文件真的为空」的合法值；结果是重启后**所有**预览都会画出伪造的单边 diff，且「诚实说无法预览」的分支永远不可达。
- **预览基线会过期**：上游用跨度最后一次记录的 `after` 作 diff 现状侧，多轮回退同一文件时该值已过期。现改为**每次预览实时读盘**（`RollbackService.currentOnDisk`），因此重启前后逐字符一致，并顺带消除了「重启后无 diff」这一退化窗口。
- **空文本被算作 1 行**：`''.split('\n')` 是 `['']`，导致删除类预览凭空多出一行 `+ ` 与错误的 `(+1/-N)`。现空文本计 0 行。
- **diff 预算越界**：原公式在 `budget ≤ 3` 时会返回超过预算的行数，并可能算出负的「省略 N 行」。现保证 `lines.length ≤ budget` 且省略数恒正。
- **跳过原因被当成文件内容**：预览格式的 note 走白名单，`basis-unknown` 不匹配便落入 diff 体，被客户端当文件内容画出来。现 note 为自由格式并正确往返。
- **契约自检在 getter 抛错时整体失效**：`session.surface` 是会抛错的 getter，而探针未加守卫，一条抛错就让整份 `doctor` 报告消失——正是该模块要避免的结果。现捕获并报为 `degraded`。
- **`fs/observed` 探错了成员**：该事件由插件**发布**，上游探针却读监听侧。
- **表层替换的「旧拼写回退」实际是空转**：`appendRollbackMarker` 传入的箭头忽略了它收到的 `surfaceOp` 参数、只捕获外层 `range`，两次尝试因而写的是**同一个**拼写对象——旧拼写分支从未真正生效，「换个拼写重试」只是重复一次注定失败的调用。现写入方向只使用当前框架的拼写（`isReplaceOp` 要求恰好 `op`/`startSeq`/`endSeq`，旧拼写在任何受支持版本上都不可能被接受）；**读取**方向仍同时接受两种拼写，因为既有日志里可能有旧版本写下的标记，那些轮次必须继续被识别为已移除。

### 新增能力
- **`/rollback doctor`**：22 项框架契约逐条探测（服务、事件、文件系统原语、会话表层接缝、沙箱策略），每项给出 `[正常]/[缺失]/[降级]`、**实测值**与处置建议。用 `cordis_inspect_query` 对照 **0.1.7-rc.2 的真实签名**逐条核实；无活会话探测的接缝报「未探针」，绝不假报正常。
- **回退前 diff 预览**：`preview` 现在回传每个受影响文件的实时盘面差异，弹窗可展开查看 `+/-` 与统计；宿主与浏览器共用同一 wire format（`src/core/preview-format.ts`），两侧由构造保证一致。
- **`/rollback undo-last`（含 `undo` 别名）与 `preview last`**：不必先 `list` 再手输轮次号。
- **隐藏逻辑可开关**：新增设置项，可关闭标记驱动的界面隐藏。
- **英文文案补齐 + 弹窗键盘导航与无障碍**（焦点陷阱、Esc 关闭、aria）。
- **会话解析双路兜底**：`sessionOf()` 先取 `agent.session`，失败则回退 `ctx.sessions.get(agent.id)`——`Agent` 的 `session` 属运行时类型增强，此路保证任一形状下 `/rollback` 都可用。
- **构建与验证脚本化**：`scripts/build.mjs`（rolldown 直驱）、`scripts/verify-artifacts.mjs`（27 项产物断言）、`scripts/run-tests.mjs` + `scripts/tests-shim.mjs`（零外部依赖测试运行器）。

### 移除
- **全部 ≤0.1.1 兼容分支**：旧 `surfaceOp` 拼写的**写入**回退、`conversationEvents` 服务回退、旧附件动词（`addImages`/`pruneImages`）、`workspaces.openPath` 回退、旧图片重建接口。读取端仍接受旧拼写，因为日志是 append-only 的。
- **构造函数参数属性**（4 处）：展开为显式字段。这是等价改写，目的是让源码在没有转换器的类型剥离环境下也能直接执行。

### 测试
- 上游 13 个测试文件全部保留并修正既有断言（`RestoredFile` 新增 `after`）。
- 新增 `tests/preview-format.test.ts`、`tests/contract-audit.test.ts`、`tests/service-preview.test.ts`。
- 当前：**273 passed / 0 failed**（`node scripts/run-tests.mjs`）。
- 审查记录：测试运行器的 `toEqual` 曾把「期望侧缺键」整键跳过，掩盖了 5 条真实失败；该宽松语义已修正为只在两侧都 `undefined` 时忽略，修正后才得到上述绿线。

### 已知限制（沿用上游）
见 README「已知限制」。其中一条为本轮新记：边界重扫的未变判定只比较 `size + mtime`，同一尺寸同一毫秒内的改写会漏检。
