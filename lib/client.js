window.__ModuleLoader__.load({
	id: "@nianchu/dsh-rollback",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/core/marker-source.ts
		/**
		* The provenance stamped on a rollback marker, in every shape a log can hold it.
		*
		* A marker is an ordinary `user/message` whose `source` identifies this plugin.
		* That one field has now been through three spellings, and the session format
		* validates it differently at each step:
		*
		* - `{ plugin: 'rollback' }` — the earliest builds. Tolerated by the v2→v3
		*   migration's own whitelist and still read here.
		* - `{ kind: 'plugin', plugin: 'rollback' }` — what 0.4.1 wrote. The in-memory
		*   session check only demands a non-empty string `kind`, so this was accepted
		*   when appended — but DSH 0.2.0 (session format v4) refuses it while ENCODING,
		*   with `format v4 message requires a producer-owned source kind`
		*   (`assertV4MessageSources` in @deepseek-ai/dsh-session-format-v3-to-v4: a
		*   message source may not be `kind === 'plugin'`). The rejection happens when
		*   the persistence drain encodes the batch, one turn later and off the append
		*   call's stack, so the append itself never threw — and the failed batch is
		*   retained at the head of the write queue, which wedges EVERY later write of
		*   that session with the same error, whatever model is selected.
		* - `{ kind: 'plugin:rollback' }` — the v4 spelling, and what this module now
		*   writes. It is the same rewrite DSH's own v3→v4 migration applies to an
		*   unknown plugin (`producerKind()` maps an unlisted plugin to `plugin:<name>`,
		*   dropping the `plugin` field), so a marker written here and an upgraded
		*   pre-0.2 marker are indistinguishable afterwards. v3 also accepts it: its
		*   whitelist of source kinds is only consulted by the v2→v3 MIGRATION path, and
		*   v3-native admission never constrains a `user/message` source kind, so the
		*   plugin stays loadable on the older engine it declares.
		*
		* Writers must use {@link ROLLBACK_MARKER_SOURCE}; every reader must match with
		* {@link isRollbackMarkerSource}, because one log file legitimately holds both
		* shapes — the migration rewrote the old markers rather than dropping them, and
		* markers written before this change are still in the file.
		*
		* @module @nianchu/dsh-rollback/core/marker-source
		*/
		/** The producer-owned `source.kind` DSH v4 requires of this plugin's marker. */
		const ROLLBACK_MARKER_KIND = "plugin:rollback";
		/**
		* Whether one event's `source` is a rollback marker written by any release.
		*
		* Both spellings are accepted, since a single log holds markers written before
		* the v4 rule and after it (and, in older logs, the field-less `plugin` form).
		* A different plugin's `{ kind: 'plugin', plugin: 'compaction' }` must NOT match,
		* so the `plugin` test does not degenerate into "any plugin".
		* @param source - the event's `data.source`, as the log carries it.
		* @returns true when this plugin wrote it.
		*/
		function isRollbackMarkerSource(source) {
			if (source === null || typeof source !== "object") return false;
			const candidate = source;
			if (candidate.plugin === "rollback") return true;
			return candidate.kind === ROLLBACK_MARKER_KIND;
		}
		//#endregion
		//#region src/core/preview-format.ts
		/** Tag spelling per action, in both locales. */
		const TAGS = {
			restore: ["恢复", "restore"],
			recover: ["找回", "recover"],
			delete: ["删除", "delete"],
			skip: ["跳过", "skip"]
		};
		/** Map a tag's inner text (either locale) back to an action. */
		function actionOf(inner) {
			const needle = inner.trim().toLowerCase();
			for (const action of Object.keys(TAGS)) if (TAGS[action].some((tag) => tag.toLowerCase() === needle)) return action;
		}
		/**
		* Parse the host's preview text back into entries.
		*
		* Lines that are not a file block are ignored, so the trailing
		* `对话截断：…` summary and any future addition ride along harmlessly.
		* @param text - the command's output text.
		* @returns the parsed entries, in host order.
		*/
		function parsePreview(text) {
			if (text === null || text === void 0 || text === "") return [];
			const out = [];
			let current;
			const flush = () => {
				if (current === void 0) return;
				out.push({
					action: current.action,
					path: current.path,
					...current.added === void 0 ? {} : { added: current.added },
					...current.removed === void 0 ? {} : { removed: current.removed },
					...current.diff.length === 0 ? {} : { diff: current.diff },
					...current.note === void 0 ? {} : { note: current.note }
				});
				current = void 0;
			};
			for (const rawLine of text.split("\n")) {
				const line = rawLine.replace(/\r$/, "");
				const file = /^\s*\[([^\]]+)\]\s+(.+?)\s*$/.exec(line);
				if (file !== null) {
					const action = actionOf(file[1]);
					if (action !== void 0) {
						flush();
						const rest = file[2];
						const stats = /^(.*?)\s*\(\+(\d+)\/-(\d+)\)$/.exec(rest);
						current = stats !== null ? {
							action,
							path: stats[1].trim(),
							added: Number(stats[2]),
							removed: Number(stats[3]),
							diff: []
						} : {
							action,
							path: rest.trim(),
							diff: []
						};
						continue;
					}
				}
				if (current === void 0) continue;
				const note = /^\s*\((.+)\)\s*$/.exec(line);
				if (note !== null) {
					current.note = note[1];
					continue;
				}
				if (/^\s{4}/.test(line)) {
					current.diff.push(line.trim());
					continue;
				}
				if (line.trim() === "") continue;
				flush();
			}
			flush();
			return out;
		}
		//#endregion
		//#region src/core/turn-entry.ts
		/**
		* Whether the turn footer is the only place this turn's rollback entry can go.
		* @param closing - the turn's closing assistant node, or null/undefined without one.
		* @returns true when the assistant action strip cannot offer the entry.
		*/
		function footerEntryNeeded(closing) {
			if (closing === null || closing === void 0) return true;
			const messageId = closing.finalNode?.messageId;
			return typeof messageId !== "string" || messageId === "";
		}
		//#endregion
		//#region src/core/rollback-guard.ts
		/**
		* The oldest rollback-able turn named by the host's `/rollback list` text.
		*
		* The action entries read the range from that command's human-readable output, so the
		* parse lives here where a test can pin it. Only the comma-separated run of numbers
		* DIRECTLY after the marker counts: the same line carries a window hint with a number
		* of its own ("仅最近 10 轮"), and folding that one into the range would disable turns
		* that are perfectly rollback-able.
		*
		* A marker with no numbers means the host can roll back nothing (`Infinity`, so every
		* entry greys out). Text this function does not recognize yields null — "unknown",
		* which blocks nothing: the host refuses out-of-range targets itself, so the cost of
		* not knowing is a refused click rather than a disabled button.
		* @param text - the command's output, as the client received it.
		* @returns the oldest available turn, or null when the text says nothing usable.
		*/
		function oldestTurnOf(text) {
			if (text === null || text === void 0 || text === "") return null;
			const marker = text.includes("：") ? "：" : text.includes(":") ? ":" : null;
			if (marker === null) return null;
			const list = /^\s*((?:\d+\s*,\s*)*\d+)/.exec(text.slice(text.indexOf(marker) + 1));
			if (list === null) return Number.POSITIVE_INFINITY;
			const turns = list[1].split(",").map((part) => Number(part.trim())).filter((turn) => Number.isSafeInteger(turn) && turn >= 1);
			return turns.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...turns);
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* Rollback plugin, browser half — a per-message "回退" action on the
		* finalized assistant message's IconActions strip.
		*
		* The button rides DSH's official `conversation.chat.assistant-actions` slot
		* (the same surface the Like/Dislike feedback uses), so the placement and
		* life-cycle are framework-managed — no DOM injection, no MutationObserver
		* button correlation. Clicking opens the affected-files dialog (host RPC
		* through the shipped `commands` Remote) with an irreversible confirm.
		*
		* The remaining DOM-touching helpers (`syncHides`, `syncHiddenRpcRows`) are not
		* button placement: they hide chat seats DSH renders but this plugin rolls
		* back, and suppress the receipt cards of button-dispatched command calls —
		* both are durable-log side effects with no official slot.
		*
		* @module @nianchu/dsh-rollback/client
		*/
		/**
		* Required services: slots, the `commands` Remote, locale, and workspaces.
		*
		* The conversation node registry is deliberately NOT named here. 0.1.5 moved it
		* to `uiConversation.events` and no longer provides `conversationEvents` at all,
		* and cordis reads a plain array as a REQUIRED set: a name no service ever
		* provides parks this fiber in "pending" forever, so `apply()` never runs and the
		* plugin is invisible with no error anywhere — the exact silence this file keeps
		* having to design against. The registry is therefore acquired dynamically and
		* the result is audited (see `registerMarkerDefinition`, `auditContracts`).
		*/
		const inject = [
			"slots",
			"remote",
			"remote.commands",
			"locale",
			"workspaces"
		];
		/** Bundle revision — always reported once at apply, so a stale cached bundle is
		* identifiable in the console instead of looking like "the fix did nothing". */
		const BUNDLE_REV = 20;
		/**
		* Warn once per key about a condition that makes the UI silently wrong.
		*
		* Deliberately NOT gated by {@link DEBUG}: every call site fires only when the
		* plugin malfunctions (a thrown hide pass, a marker whose state cannot be read),
		* and those failures look exactly like "the plugin did nothing at all" — the
		* most expensive way to learn about a bug. Routine tracing stays behind the flag.
		* @param key - the once-per-key identity of this warning.
		* @param parts - the message and any values worth printing.
		*/
		function warnOnce(key, ...parts) {
			const seen = warnOnce;
			if (seen[key] === true) return;
			seen[key] = true;
			console.warn("[nianchu-rollback]", ...parts);
		}
		/**
		* Report once per key a broken framework contract — the loud half of
		* {@link warnOnce}, for conditions where the plugin cannot work at all.
		* @param key - the once-per-key identity of this report.
		* @param parts - the message and any values worth printing.
		*/
		function errorOnce(key, ...parts) {
			const seen = errorOnce;
			if (seen[key] === true) return;
			seen[key] = true;
			console.error("[nianchu-rollback]", ...parts);
		}
		/** Extract a message from an unknown error. */
		function msg(e) {
			if (e !== null && typeof e === "object" && typeof e.message === "string") return e.message;
			return String(e);
		}
		/** Dictionary namespace owned by this plugin. */
		const NS = "rollback";
		const zh = {
			"action.label": "回退到本轮对话发起前",
			"action.running": "本轮还在进行中：暂停或等它结束后才能回退",
			"dialog.title": "回退到本轮对话发起前",
			"dialog.aria": "回退确认",
			"dialog.warning": "此操作不可撤销，将恢复本轮及之后受影响的工作区文件并截断模型上下文。",
			"dialog.analyzing": "正在分析受影响文件…",
			"dialog.openInEditor": "在编辑器中打开",
			"dialog.cancel": "取消",
			"dialog.confirm": "确认回退",
			"dialog.busy": "回退中…",
			"tag.restore": "恢复",
			"tag.recover": "找回",
			"tag.delete": "删除",
			"tag.skip": "跳过",
			"dialog.expand": "显示差异",
			"dialog.collapse": "收起差异",
			"note.basisUnknown": "无法预览（未记录回退前内容）",
			"note.truncated": "差异已截断（过长）",
			"note.noDiff": "无法预览",
			"note.binary": "二进制文件，不预览",
			"note.tooLarge": "文件过大，不预览",
			"action.undoLast": "回退最近一轮",
			"settings.hide.title": "回退后隐藏已回退的消息",
			"settings.hide.description": "关闭后，回退只截断模型上下文与工作区文件，不再隐藏界面上的聊天记录。",
			"settings.hide.on": "已开启",
			"settings.hide.off": "已关闭",
			"hero.title": "已回退到对话发起前",
			"hero.sub": "对话与文件已恢复 · 在下方输入框继续"
		};
		const en = {
			"action.label": "Roll back to before this turn",
			"action.running": "This turn is still running: pause it or wait for it to finish",
			"dialog.title": "Roll back to before this turn",
			"dialog.aria": "Rollback confirmation",
			"dialog.warning": "This action is irreversible. It will restore workspace files affected by this turn and later, and truncate the model context.",
			"dialog.analyzing": "Analyzing affected files…",
			"dialog.openInEditor": "Open in editor",
			"dialog.cancel": "Cancel",
			"dialog.confirm": "Roll back",
			"dialog.busy": "Rolling back…",
			"tag.restore": "restore",
			"tag.recover": "recover",
			"tag.delete": "delete",
			"tag.skip": "skip",
			"dialog.expand": "Show diff",
			"dialog.collapse": "Hide diff",
			"note.basisUnknown": "Cannot preview (no pre-turn content was recorded)",
			"note.truncated": "Diff truncated (too long)",
			"note.noDiff": "Cannot preview",
			"note.binary": "Binary file, not previewed",
			"note.tooLarge": "File too large, not previewed",
			"action.undoLast": "Roll back the last turn",
			"settings.hide.title": "Hide rolled-back messages",
			"settings.hide.description": "When off, a rollback still truncates the model context and restores files, but leaves the transcript visible.",
			"settings.hide.on": "On",
			"settings.hide.off": "Off",
			"hero.title": "Rolled back to the start",
			"hero.sub": "Conversation and files restored · continue below"
		};
		/**
		* The note vocabulary the host emits, localized for display.
		*
		* The host's note is FREE-FORM (it carries a skip reason or a truncation marker),
		* so an unknown value is shown verbatim rather than dropped: a preview that says
		* nothing about why it cannot show a diff is worse than a slightly untranslated one.
		*/
		function noteText(t, note) {
			if (note === "basis-unknown") return t("note.basisUnknown");
			if (note === "diff-truncated") return t("note.truncated");
			if (note === "跳过预览") return t("note.noDiff");
			if (note === "binary") return t("note.binary");
			if (note === "too-large") return t("note.tooLarge");
			if (note.startsWith("io-error")) return `${t("note.noDiff")} — ${note.slice(9).trim()}`;
			return note;
		}
		/**
		* Command executions this client itself dispatched (the Web button's preview
		* and execute RPCs). Their durable receipt cards are hidden by
		* {@link syncHiddenRpcRows}: a canceled preview must leave no trace, and a
		* confirmed rollback is already narrated by the rollback divider. Manual
		* `/rollback` invocations never enter this set, so their output stays visible.
		*/
		const RPC_HIDE_KEY = "nianchu-rollback.hidden-command-ids";
		const COMMAND_KEY_PREFIX = "7:command";
		/**
		* Longest text a hidden row may have. Conversation content is long; a command receipt is
		* not. This guard exists because a text-based matcher once hid assistant messages, and
		* the mutation observer then hid another one on every re-render.
		*/
		const MAX_RECEIPT_CHARS = 500;
		/** Every chat seat the plugin may act on. */
		const FLOW_ROW_SELECTOR = "[data-chat-flow-key]:not([hidden])";
		/** Every command receipt seat the plugin may act on. */
		/**
		* Command receipts, INCLUDING rows DSH folded away with `hidden`.
		*
		* Deliberately unqualified: the plugin's own receipts must stay hidden even when the
		* browser's find-in-page reveals the folded group they sit in. The emptiness decision
		* is the opposite case — a folded row must not count as standing content — so it keeps
		* the qualified {@link FLOW_ROW_SELECTOR}.
		*/
		const FLOW_COMMAND_ROW_SELECTOR = "[data-chat-flow-kind=\"command\"][data-chat-flow-key]";
		const hiddenRpcIds = (() => {
			try {
				return new Set(JSON.parse(localStorage.getItem(RPC_HIDE_KEY) ?? "[]"));
			} catch {
				return /* @__PURE__ */ new Set();
			}
		})();
		/** Command seats present at the last button dispatch (see `markPendingCommandDispatch`). */
		let pendingCommandSeen = null;
		/** Track one command execution dispatched by this client (best-effort persistence). */
		function trackRpcId(commandId) {
			if (typeof commandId !== "string" || commandId === "" || hiddenRpcIds.has(commandId)) return;
			hiddenRpcIds.add(commandId);
			try {
				localStorage.setItem(RPC_HIDE_KEY, JSON.stringify([...hiddenRpcIds]));
			} catch {}
			pendingCommandSeen = null;
			syncHiddenRpcRows();
			requestAnimationFrame(() => {
				syncHiddenRpcRows();
			});
		}
		/** display:none the seats of button-dispatched command executions (removes the flex gap entirely). */
		function syncHiddenRpcRows() {
			const ids = [...hiddenRpcIds];
			for (const el of document.querySelectorAll(FLOW_COMMAND_ROW_SELECTOR)) {
				const key = el.getAttribute("data-chat-flow-key") ?? "";
				if (key === "") continue;
				if ((el.textContent ?? "").length > MAX_RECEIPT_CHARS) continue;
				for (const id of ids) if (id !== "" && key.endsWith(id)) {
					el.style.display = "none";
					break;
				}
			}
		}
		/**
		* In-flight receipt capture: the button's preview/execute RPCs mint durable
		* command nodes. Those used to mount visibly and then be hidden after the RPC
		* resolved — a grow-then-shrink that made the transcript "shake" on every
		* click. Snapshot the command seats present at dispatch, then hide any that
		* appear afterwards (synchronously in the MutationObserver, before paint).
		*/
		function markPendingCommandDispatch() {
			const seen = /* @__PURE__ */ new Set();
			for (const el of document.querySelectorAll(FLOW_COMMAND_ROW_SELECTOR)) {
				const key = el.getAttribute("data-chat-flow-key") ?? "";
				if (key.startsWith(COMMAND_KEY_PREFIX)) seen.add(key.slice(9));
			}
			pendingCommandSeen = seen;
		}
		/** Hide command receipts that appeared since {@link markPendingCommandDispatch}. */
		function syncPendingRpcRow() {
			if (pendingCommandSeen === null) return;
			let caught = false;
			for (const el of document.querySelectorAll(FLOW_COMMAND_ROW_SELECTOR)) {
				const key = el.getAttribute("data-chat-flow-key") ?? "";
				if (!key.startsWith(COMMAND_KEY_PREFIX)) continue;
				const id = key.slice(9);
				if (pendingCommandSeen.has(id)) continue;
				if (!hiddenRpcIds.has(id)) {
					hiddenRpcIds.add(id);
					caught = true;
				}
				el.style.display = "none";
			}
			if (caught) {
				pendingCommandSeen = null;
				try {
					localStorage.setItem(RPC_HIDE_KEY, JSON.stringify([...hiddenRpcIds]));
				} catch {}
			}
		}
		/**
		* Opening one affected file in the editor, across both DSH generations.
		*
		* 0.1.5 deleted `IWorkspaces.openPath`, so the first-party way in is the right
		* Sidebar's navigation controller: `ctx.sidebarRight.openResource(address)`, with
		* the address built by `fileAddressFor` — the exact shape `dsh-client-ui-chat` and
		* `dsh-client-ui-sidebar-files` call it with. `sidebarRight` is resolved through
		* `ctx.get` and never named in `inject`, for the reason spelled out on the inject
		* comment above: on a build that lacks it, a plain-array entry would park this
		* fiber forever.
		*
		* The address builder is COPIED here rather than imported. `fileAddressFor` lives in
		* `@deepseek-ai/dsh-util-workspace-path`, which is not a client module: it declares
		* no `dsh.client`, ships no browser bundle, and is not one of the frontend's
		* platform seed words (`react`, `cordis`, `dsh-client-store`,
		* `dsh-client-ui-slots`, `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`) — the
		* first-party client bundles inline its source instead of requiring it. A `require`
		* of it would miss the module table and take the whole client half down at load.
		*/
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Component-encode one id or path segment, keeping `:` literal for drive letters. */
		function encodeAddressSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		/** Encode a `/`-separated path segment by segment. */
		function encodeAddressPath(path) {
			return path.split("/").map(encodeAddressSegment).join("/");
		}
		/** Build the address of a file read through one session. */
		function sessionFileAddress(sessionId, path) {
			const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
			return `${FILE_ADDRESS_PREFIX}session/${encodeAddressSegment(sessionId)}/${encodeAddressPath(normalized)}`;
		}
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/** Whether a path is absolute in either spelling the host accepts. */
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* The `dsh-resource://file/…` address for a path as this plugin holds it: a
		* workspace-relative path, or an absolute path inside the session's workspace,
		* becomes a relative session address; anything else keeps its absolute spelling.
		* @param sessionId - the session the path is read in.
		* @param cwd - that session's workspace root, when known.
		* @param path - absolute or workspace-relative path, in either separator spelling.
		*/
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		/**
		* The session's workspace root, from the sessions list the way first-party code
		* reads it. `undefined` is a legal answer (the address builder then keeps an
		* absolute path absolute), so an unreadable list degrades instead of throwing.
		* @param ctx - a context able to resolve services.
		* @param sessionId - the session whose root is wanted.
		*/
		function sessionCwdOf(ctx, sessionId) {
			try {
				const row = ctx?.get?.("sessions")?.list?.getSnapshot?.()?.byId?.[sessionId];
				return typeof row?.cwd === "string" && row.cwd !== "" ? row.cwd : void 0;
			} catch {
				return;
			}
		}
		/**
		* Open one path in the editor: the 0.1.5 right-Sidebar route first, the 0.1.1
		* `workspaces.openPath` route when this build still has it, else a one-time
		* warning.
		*
		* `openResource` is the primary because it is the only route 0.1.5 ships. It can
		* legitimately refuse (no session surface mounted, or no registered tab type
		* claims the address), and on a build that still ships `openPath` that refusal
		* must not leave the click with no effect — so the legacy opener is tried as a
		* fallback rather than merely skipped. A build with neither is reported once.
		* @param ctx - the plugin's own context.
		* @param sessionId - the session the file belongs to.
		* @param path - the affected file's path, as the preview reported it.
		*/
		async function openFileInEditor(ctx, sessionId, path) {
			const sidebarRight = ctx?.get?.("sidebarRight");
			const workspaces = ctx?.get?.("workspaces");
			const modern = sidebarRight !== void 0 && typeof sidebarRight.openResource === "function" ? sidebarRight : void 0;
			const legacy = workspaces !== void 0 && typeof workspaces.openPath === "function" ? workspaces : void 0;
			if (modern === void 0 && legacy === void 0) {
				warnOnce("open-editor", "no way to open a file in the editor is available: neither ctx.sidebarRight.openResource (0.1.5) nor ctx.workspaces.openPath (0.1.1) exists");
				return;
			}
			if (modern !== void 0) try {
				modern.openResource(fileAddressFor(sessionId, sessionCwdOf(ctx, sessionId), path));
				return;
			} catch (error) {
				if (legacy === void 0) {
					warnOnce("open-resource", "could not open the file in the right sidebar", path, msg(error));
					return;
				}
				warnOnce("open-resource-legacy", "the right sidebar refused the file address; falling back to workspaces.openPath", path, msg(error));
			}
			try {
				await legacy.openPath(path);
			} catch (error) {
				warnOnce("open-path", "workspaces.openPath failed", path, msg(error));
			}
		}
		/**
		* Rebuild draft attachments for the images a rolled-back turn had, so the composer
		* holds them again.
		*
		* Two generations of the same idea:
		*
		* - **0.1.5**: durable bytes are read with `uiConversation.imageUrl(sessionId, ref)`
		*   (the same loader the transcript images use; it hands back an object URL over
		*   the stored bytes), turned into a browser `File`, and registered as runtime
		*   draft attachments with `conversation.createDrafts(sessionId, files)`. That is
		*   exactly how first-party code attaches a picked or pasted file, and it is what
		*   makes the bytes ride the next prompt instead of a client-side preview.
		*   `resolveImage` and `createDraftImages` are gone in 0.1.5, hence the split.
		* - **0.1.1**: `conversation.resolveImage` + `conversation.createDraftImages`, kept
		*   verbatim so the older build behaves exactly as it did.
		*
		* The two are alternatives, not a chain, and neither is guessed: a build whose
		* verbs cannot be found is reported once instead of quietly restoring nothing.
		* A single image that fails (an unreadable attachment, an unsupported type, a
		* browser that refuses the fetch) is skipped and the rest still restore.
		* @param ctx - the plugin's own context.
		* @param sessionId - the session the images belong to.
		* @param images - the rolled-back turn's image blocks, in order.
		* @returns the created draft attachment ids, in order, or an empty list.
		*/
		async function restoreDraftImages(ctx, sessionId, images) {
			const conversation = ctx?.get?.("conversation");
			const uiConversation = ctx?.get?.("uiConversation");
			if (conversation !== void 0 && typeof conversation.createDrafts === "function" && uiConversation !== void 0 && typeof uiConversation.imageUrl === "function") {
				const ids = [];
				for (const img of images) try {
					const url = await uiConversation.imageUrl(sessionId, img.attachment);
					const blob = await (await fetch(url)).blob();
					const file = new File([blob], img.name || "image", { type: img.mediaType || "image/png" });
					const id = conversation.createDrafts(sessionId, [file])?.[0]?.id;
					if (typeof id === "string" && id !== "") ids.push(id);
				} catch {}
				return ids;
			}
			if (conversation !== void 0 && typeof conversation.resolveImage === "function" && typeof conversation.createDraftImages === "function") {
				const ids = [];
				for (const img of images) try {
					const url = await conversation.resolveImage(sessionId, img.attachment);
					const blob = await (await fetch(url)).blob();
					const file = new File([blob], img.name || "image", { type: img.mediaType || "image/png" });
					const drafts = conversation.createDraftImages([file]);
					if (drafts !== null && drafts[0] !== void 0 && drafts[0].id !== void 0) ids.push(drafts[0].id);
				} catch {}
				return ids;
			}
			warnOnce("restore-images-api", "no image-restore API is available: neither conversation.createDrafts + uiConversation.imageUrl (0.1.5) nor conversation.resolveImage + createDraftImages (0.1.1) exists, so rolled-back images cannot be re-attached");
			return [];
		}
		/** A `/rollback` command through the shipped Remote, unwrapping its envelope. */
		function extCommand(ctx, sessionId, line) {
			return ctx.remote.commands.execute(sessionId, line, []).then((r) => {
				if (!r || r.ok === false) throw new Error(r?.error?.message ?? "command failed");
				const exec = r.value;
				if (exec === void 0 || exec === null) throw new Error(`cannot resolve command: ${line}`);
				trackRpcId(exec.commandId);
				const result = exec.result;
				if (result.kind === "error") throw new Error(result.text ?? "command failed");
				return { text: result.text };
			});
		}
		const CSS = ".rbk-act{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:5px;border:none;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;}.rbk-act:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);}.rbk-act:disabled{cursor:default;opacity:.4;}.rbk-overlay{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;background:rgb(0 0 0/.4);backdrop-filter:blur(2px);}.rbk-panel{width:min(460px,calc(100vw - 32px));max-height:70vh;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:0 16px 48px rgb(0 0 0/.35);color:var(--dsw-alias-label-primary);}.rbk-head{padding:14px 16px 8px;font-size:14px;font-weight:700;}.rbk-warn{padding:0 16px 8px;font-size:12px;color:var(--dsw-alias-label-secondary);}.rbk-list{overflow-y:auto;padding:2px 8px;flex:1;}.rbk-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:12.5px;cursor:pointer;}.rbk-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);}.rbk-tag{flex:none;font-size:11px;padding:1px 6px;border-radius:5px;}.rbk-tag-restore{background:color-mix(in srgb,var(--dsw-alias-state-success-primary, #3fb27f) 22%,transparent);color:var(--dsw-alias-state-success-primary, #3fb27f);}.rbk-tag-recover{background:color-mix(in srgb,var(--dsw-static-blue-500, #3b82f6) 22%,transparent);color:var(--dsw-static-blue-500, #3b82f6);}.rbk-tag-delete{background:color-mix(in srgb,var(--dsw-alias-state-error-primary, #e5484d) 22%,transparent);color:var(--dsw-alias-state-error-primary, #e5484d);}.rbk-tag-skip{background:color-mix(in srgb,var(--dsw-alias-label-secondary) 18%,transparent);color:var(--dsw-alias-label-secondary);}.rbk-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.rbk-item{border-radius:7px;}.rbk-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);}.rbk-rowhead{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;}.rbk-pathlink{flex:1;min-width:0;text-align:left;border:none;background:transparent;padding:0;color:var(--dsw-alias-label-primary);font-size:12.5px;cursor:pointer;font-family:inherit;}.rbk-pathlink:hover{text-decoration:underline;}.rbk-stats{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}.rbk-exp{flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;line-height:1;}.rbk-exp:hover{background:var(--dsw-alias-interactive-bg-hover);}.rbk-diffbody{padding:0 8px 6px;}.rbk-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 0 4px;}.rbk-diff{margin:2px 0 0;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;max-height:220px;overflow:auto;white-space:pre;}.rbk-diffline{display:block;}.rbk-del{color:var(--dsw-alias-state-error-primary, #e5484d);}.rbk-add{color:var(--dsw-alias-state-success-primary, #3fb27f);}.rbk-ctx{color:var(--dsw-alias-label-tertiary);}.rbk-pref{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:4px 0;}.rbk-preftext{min-width:0;}.rbk-pref-title{font-size:13px;color:var(--dsw-alias-label-primary);}.rbk-pref-sub{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-top:2px;}.rbk-switch{flex:none;padding:4px 12px;border-radius:100px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;font-family:inherit;}.rbk-switch:hover{background:var(--dsw-alias-interactive-bg-hover);}.rbk-switch-on{border-color:var(--dsw-alias-state-success-primary, #3fb27f);color:var(--dsw-alias-state-success-primary, #3fb27f);}.rbk-empty{padding:16px;font-size:12.5px;opacity:.65;text-align:center;}.rbk-err{padding:8px 16px;font-size:12px;color:var(--dsw-alias-state-error-primary, #e5484d);}.rbk-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);}.rbk-cancel{padding:5px 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12.5px;cursor:pointer;}.rbk-cancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);}.rbk-confirm{padding:5px 12px;border-radius:7px;border:none;background:var(--dsw-alias-state-error-primary, #e5484d);color:#fff;font-size:12.5px;cursor:pointer;}.rbk-confirm:hover:not(:disabled){filter:brightness(1.12);}.rbk-confirm:disabled{opacity:.6;cursor:wait;}.rbk-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:40vh;padding:40px 24px;text-align:center;}.rbk-hero-brand{color:var(--dsw-alias-label-secondary);opacity:.85;}.rbk-hero-brand svg{width:44px;height:auto;}.rbk-hero-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary);}.rbk-hero-sub{font-size:13px;color:var(--dsw-alias-label-tertiary);}";
		/** The curved reply/return arrow (↩), as a React element this time. */
		function ReplyIcon() {
			return react.createElement("svg", {
				width: 18,
				height: 18,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true
			}, react.createElement("path", {
				d: "M6.6 3.4 3 7l3.6 3.6",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}), react.createElement("path", {
				d: "M3 7h6.4c2.3 0 4 1.7 4 3.9V13",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round"
			}));
		}
		/** The turn NUMBER from a node's location (object form or bare number). */
		function turnNoOf(loc) {
			const t = loc?.turn;
			const n = t !== null && typeof t === "object" ? t.turn : t;
			return typeof n === "number" && Number.isSafeInteger(n) && n >= 1 ? n : void 0;
		}
		/**
		* The chat slice every read below works on, from whichever route this DSH
		* version publishes it on.
		*
		* 0.1.5 removed `chat` from the session snapshot and instead hands the chat
		* target to every session-scoped slot entry as the session kit hook `useChat`
		* (the standard source `chat` that ui-chat provides). 0.1.1 had no such hook and
		* carried the slice on the snapshot. Preferring the hook keeps 0.1.5 working and
		* the fallback keeps 0.1.1 working — with neither, the caller passes undefined
		* and every read no-ops, so the absence is what {@link auditContracts} and the
		* driver's own check report.
		*
		* The hook is called only when the prop is a function: React forbids a changing
		* hook order, and this prop is fixed for the whole life of a DSH version, so the
		* branch is stable — while calling an absent prop would throw.
		* @param useChat - the session kit hook from props, when this build has one.
		* @param snapshot - the session snapshot, for the 0.1.1 route.
		* @returns the chat snapshot, or undefined when this session has none yet.
		*/
		function useChatOrSnapshot(useChat, snapshot) {
			return (typeof useChat === "function" ? useChat((s) => s) : void 0) ?? snapshot?.chat;
		}
		/**
		* Plain text of the turn-opening user prompt for one turn.
		* @param chat - the chat snapshot slice (see {@link useChatOrSnapshot}).
		* @param turn - the 1-based turn whose opening prompt is wanted.
		*/
		function findUserPrompt(chat, turn) {
			const order = chat?.order;
			const store = chat?.nodes;
			if (!Array.isArray(order) || typeof store?.get !== "function") return "";
			for (const key of order) {
				const node = store.get(key);
				if (node?.kind !== "user" || turnNoOf(node.location) !== turn) continue;
				const content = node?.data?.content;
				if (!Array.isArray(content)) return "";
				return content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
			}
			return "";
		}
		/**
		* Image blocks of a turn-opening user prompt, for re-attaching to the composer.
		* @param chat - the chat snapshot slice (see {@link useChatOrSnapshot}).
		* @param turn - the 1-based turn whose images are wanted.
		*/
		function findUserImages(chat, turn) {
			const order = chat?.order;
			const store = chat?.nodes;
			if (!Array.isArray(order) || typeof store?.get !== "function") return [];
			for (const key of order) {
				const node = store.get(key);
				if (node?.kind !== "user" || turnNoOf(node.location) !== turn) continue;
				const content = node?.data?.content;
				if (!Array.isArray(content)) return [];
				return content.filter((b) => b?.type === "image" && b?.attachment).map((b) => ({
					name: b.attachment.name ?? "image",
					mediaType: b.attachment.mediaType ?? "image/png",
					attachment: b.attachment
				}));
			}
			return [];
		}
		/**
		* The turn a finalized assistant `messageId` belongs to, resolved from the chat
		* snapshot. `assistant-actions` fires once per settled turn with its closing
		* message, so this maps the end-of-turn anchor back to its 1-based turn — and an
		* undefined result is what leaves the rollback button permanently disabled, so
		* the chat slice has to come from the right route (see {@link useChatOrSnapshot}).
		* @param chat - the chat snapshot slice.
		* @param messageId - the closing assistant message's durable id.
		* @returns the 1-based turn, or undefined when this build published no chat data.
		*/
		function turnForMessageId(chat, messageId) {
			const order = chat?.order;
			const store = chat?.nodes;
			if (!Array.isArray(order) || typeof store?.get !== "function") return void 0;
			for (const key of order) {
				const node = store.get(key);
				if (node?.kind !== "assistant-step") continue;
				const finalNode = node?.data?.finalNode;
				if (finalNode !== null && finalNode !== void 0 && finalNode.messageId === messageId) {
					const turn = node?.data?.turn;
					return typeof turn === "number" && Number.isSafeInteger(turn) ? turn : turnNoOf(node?.location);
				}
			}
		}
		/**
		* The conversation scrollport, mirroring ChatView.scrollerOf. Used only to
		* reset bottom-follow after a rollback collapses the transcript.
		*/
		function scrollportOf(column) {
			if (column === null) return null;
			return column.closest("[data-conversation-scroll]") ?? column.parentElement;
		}
		/** DSH's floating "back to bottom" chip, across the shipped locales. */
		const TO_BOTTOM_LABELS = /* @__PURE__ */ new Set(["回到底部", "Back to bottom"]);
		/** The rendered back-to-bottom button(s) inside one scrollport, if shown. */
		function toBottomButtons(scrollport) {
			if (scrollport === null) return [];
			const out = [];
			for (const btn of scrollport.querySelectorAll("button[aria-label]")) if (TO_BOTTOM_LABELS.has(btn.getAttribute("aria-label") ?? "")) out.push(btn);
			return out;
		}
		/**
		* DSH's "load earlier" paging control, across the shipped locales. 0.1.5 renders
		* it as the sole button of a `div.older` that is a direct child of the chat
		* column (`t("chat.loadOlder")`:
		* dsh-client-ui-chat/lib/client.js:2526-2533, labels at :2639 and :2745).
		*/
		const LOAD_EARLIER_LABELS = /* @__PURE__ */ new Set(["加载更早", "Load earlier"]);
		/**
		* The visible "load earlier" control of one chat column, or null.
		*
		* Identity, not position. An earlier version hid whatever button sat inside the
		* column's first non-seat child — a guess about layout, and the same class of
		* inference that once hid conversation rows. The control is recognized by its own
		* label, and a button whose label cannot be read is never touched, so a layout
		* change costs a stranded paging button instead of a hidden control the user
		* needed.
		* @param column - the chat flow column, when the page has one.
		* @returns the paging button, or null when none could be identified.
		*/
		function loadEarlierButtonOf(column) {
			if (column === null) return null;
			for (const btn of column.querySelectorAll(":scope > div:not([data-chat-flow-key]) button")) if (LOAD_EARLIER_LABELS.has((btn.textContent ?? "").trim())) return btn;
			return null;
		}
		/**
		* The replaced window a rollback-marker node records, in three readings.
		*
		* - a number: the first seq the rollback shadowed, so exactly `[cut, seq)` was
		*   taken out of the conversation (the host's `replace` form);
		* - `null`: the rollback replaced NOTHING — the host's `append` form, written when
		*   the system-prompt clamp left no replaceable node. That is an empty range BY
		*   CONTRACT, not a missing one: the node still proves a rollback happened (which
		*   is what the emptiness decision needs), and it covers no seq, so it cannot hide
		*   a row (see {@link coveredByRollback});
		* - `undefined`: unreadable, reported rather than guessed. Such a marker
		*   contributes no window at all, which is the only safe reading of one.
		*
		* This is the ONE place that knows the marker state's shape, which `start()`
		* writes as a FLAT `{ seq, truncatedFromSeq }` for a replacement and as a FLAT
		* `{ seq, replacedNothing: true }` for an append. Reading it through a stale path
		* is how a working rollback once became a silent no-op: the host truncated the
		* conversation, the client collected zero markers, and nothing was hidden. A
		* marker without a readable cut is therefore reported rather than skipped — and
		* skipping it is what keeps the account safe: an unresolvable marker hides
		* nothing.
		* @param node - a chat node of kind `rollback-marker`.
		* @returns the cut seq, `null` for a marker that replaced nothing, or `undefined`
		* when the node carries no readable reading.
		*/
		function markerCutOf(node) {
			if (node?.data?.replacedNothing === true) return null;
			const from = node?.data?.truncatedFromSeq;
			if (typeof from === "number" && Number.isSafeInteger(from) && from >= 0) return from;
			errorOnce("marker-cut", "rollback marker node carries no readable cut seq, so its range stays visible", {
				dataKeys: node?.data === null || node?.data === void 0 ? String(node?.data) : Object.keys(node.data).join(","),
				truncatedFromSeq: node?.data?.truncatedFromSeq
			});
		}
		/**
		* The first shadowed sequence one `replace` surface operation declared.
		*
		* 0.1.5 names the two ends `startSeq`/`endSeq`:
		* `export type SurfaceOp = 'append' | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }`
		* (`dsh-session/lib/types/types.d.ts:429-433`), and the validator the CLIENT runs
		* on every event it receives demands exactly those three keys
		* (`dsh-session/lib/index.js:262-264`, reached from
		* `dsh-api-session-controller/lib/types/client/session-wire-event.js:40`) — so a
		* replace-shaped event the browser can see always carries `startSeq`, and a
		* reader looking at `start` alone finds nothing on this build. This plugin's own
		* host half still writes the earlier `start`/`end` spelling, so both are read: a
		* marker must never be skipped, and a range must never be guessed from the wrong
		* field.
		* @param op - the event's surface operation, as the log carries it.
		* @returns the shadowed range's first seq, or undefined when unreadable.
		*/
		function surfaceCutOf(op) {
			for (const candidate of [op?.startSeq, op?.start]) if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0) return candidate;
		}
		/** Report once a marker event whose shadowed-range start cannot be read. */
		function reportUnreadableCut(op) {
			if (surfaceCutOf(op) !== void 0) return;
			errorOnce("marker-cut-event", "rollback marker event carries no readable shadowed-range start: neither surfaceOp.startSeq (0.1.5) nor surfaceOp.start (<=0.1.1) is a seq, so its range stays visible", { surfaceOpKeys: op === null || typeof op !== "object" ? String(op) : Object.keys(op).join(",") });
		}
		/**
		* Chat node kinds that are infrastructure rather than conversation content.
		*
		* A visible one of these must not hold the welcome hero back once every real
		* message is hidden: `turn-tail` is a per-turn action affordance, and `command`
		* is a slash-command receipt (this plugin hides its own receipts separately),
		* and `system-prompt` is the official collapsed prompt-disclosure row: a rollback
		* to the very first turn leaves exactly those two on an otherwise empty screen.
		* Anything NOT listed counts as content, so an unrecognized kind errs toward
		* keeping the hero away rather than showing it over a message.
		*/
		const INFRASTRUCTURE_KINDS = /* @__PURE__ */ new Set([
			"turn-tail",
			"command",
			"system-prompt"
		]);
		/**
		* Whether the transcript is currently emptied by a rollback, as {@link syncHides}
		* last determined.
		*
		* The driver reads this and renders the welcome hero into a host element IT
		* injects into the transcript. The hero used to be revealed by un-hiding the
		* marker node's own seat — which silently produced nothing whenever that seat was
		* missing, or nested inside a container the hide pass had collapsed. Hosting it
		* ourselves removes that dependency entirely.
		*
		* Only a pass that PROVED the emptiness sets it: the log count must be zero AND
		* no content seat may still be visible (see {@link syncHides}), and every
		* fail-closed path clears it. A hero standing over a visible transcript is the
		* one thing this flag must never express.
		*/
		const heroWanted = { visible: false };
		/**
		* The attribute marking a seat THIS plugin's rollback passes hid, so those
		* passes can hand every one of them back the moment they cannot prove what they
		* are looking at.
		*
		* Hiding a row is a claim about durable state — "this row is inside a rollback's
		* shadowed range". When the claim's inputs stop looking like the shape it was
		* written against, the only safe answer is "hide nothing", and that also means
		* restoring whatever an earlier, better-informed pass hid. Only the rollback
		* passes use this attribute: the receipt sweeps hide by identity for a different
		* reason and are never revealed here.
		*/
		const RBK_HIDDEN_ATTR = "data-rbk-hidden";
		/** Seats the rollback passes hid, for the fail-closed restore. */
		const rollbackHiddenSeats = /* @__PURE__ */ new Set();
		/** Hide one seat as a rollback side effect, remembering it for the restore. */
		function hideRollbackSeat(el) {
			el.setAttribute(RBK_HIDDEN_ATTR, "");
			el.style.display = "none";
			rollbackHiddenSeats.add(el);
		}
		/** Give back one seat — and only one this plugin hid. */
		function revealRollbackSeat(el) {
			rollbackHiddenSeats.delete(el);
			if (!el.hasAttribute(RBK_HIDDEN_ATTR)) return;
			el.removeAttribute(RBK_HIDDEN_ATTR);
			el.style.display = "";
		}
		/**
		* Give back every seat the rollback passes hid. The fail-closed direction: a
		* pass that cannot establish what it is looking at must not leave a transcript
		* it hid earlier on the strength of a reading it can no longer make.
		*/
		function revealAllRollbackSeats() {
			for (const el of [...rollbackHiddenSeats]) {
				if (!document.body.contains(el)) {
					rollbackHiddenSeats.delete(el);
					continue;
				}
				revealRollbackSeat(el);
			}
		}
		/** What a chat node actually looks like, for the one loud line a broken shape earns. */
		function nodeShapeOf(node) {
			if (node === null) return "null";
			if (node === void 0) return "undefined";
			if (typeof node !== "object") return typeof node;
			return `kind=${String(node.kind)} keys=[${Object.keys(node).join(",")}]`;
		}
		/**
		* Whether a node's own position provably sits inside a rollback's shadowed
		* window.
		*
		* This is THE content-hiding predicate of this file: `from` is the first seq the
		* replacement shadowed and `seq` is the marker event's own seq, so the window is
		* exactly the range the rollback removed. Both the emptiness count and the hide
		* pass call it, which is what makes them provably agree.
		*
		* A `from` of `null` is a marker that replaced nothing (the append form), and it
		* answers `false` for EVERY seq — by this rule, never by an accident of
		* arithmetic — so an append-form marker can never hide a row.
		* @param markers - the readable marker windows, oldest first.
		* @param seq - the node's anchor position.
		* @returns whether this position was rolled back.
		*/
		function coveredByRollback(markers, seq) {
			return markers.some((m) => m.from !== null && seq >= m.from && seq < m.seq);
		}
		/**
		* Refuse to hide anything, loudly.
		*
		* The one outcome this file must never produce is a blank transcript, and every
		* hide below reads a framework shape. So when the shape is not the one the
		* passes were written against, they hide NOTHING and give back what they hid
		* before: a future framework change degrades to "no hiding at all", never to
		* "hide the conversation".
		* @param key - once-per-key identity of this report.
		* @param what - the observation, in the caller's words.
		* @param observed - the values that made the shape unrecognizable.
		*/
		function failClosedHides(key, what, observed) {
			heroWanted.visible = false;
			revealAllRollbackSeats();
			errorOnce(key, "hiding disabled for this pass: " + what, observed);
		}
		/**
		* Visually hide every chat seat inside a rollback's shadowed range, and reset
		* bottom-follow over a short armed window after a NEW marker lands. Durable-log
		* side effect: hidden seats need no slot because DSH renders them from events
		* this plugin declared non-surface.
		* @param chat - the chat snapshot slice, resolved by the caller
		* (see {@link useChatOrSnapshot}); a build that publishes neither route passes
		* undefined, and the missing contract is reported by the audit, not here.
		*/
		function syncHides(chat) {
			const order = chat?.order;
			const store = chat?.nodes;
			if (!Array.isArray(order)) {
				failClosedHides("hides-order", "the chat slice has no readable node order (order is not an array)", {
					orderType: typeof order,
					chatKeys: chat === null || chat === void 0 ? "no chat slice" : Object.keys(chat).join(",")
				});
				return;
			}
			if (typeof store?.get !== "function") {
				failClosedHides("hides-store", "the chat node store has no get(key) reader", {
					storeType: typeof store,
					storeKeys: store === null || store === void 0 ? String(store) : Object.keys(store).join(",")
				});
				return;
			}
			const nodes = [];
			for (const key of order) nodes.push({
				key,
				node: typeof key === "string" ? store.get(key) : void 0
			});
			if (nodes.length > 0 && !nodes.some((entry) => typeof entry.node?.anchorSeq === "number")) {
				const sample = nodes.find((entry) => entry.node !== void 0 && entry.node !== null) ?? nodes[0];
				failClosedHides("hides-anchor", "no chat node carries a numeric anchorSeq, so neither a rollback range nor an emptiness can be established", {
					orderLength: nodes.length,
					sampleKey: sample.key,
					sampleNode: nodeShapeOf(sample.node)
				});
				return;
			}
			const seatByKey = /* @__PURE__ */ new Map();
			for (const el of document.querySelectorAll(FLOW_ROW_SELECTOR)) {
				const k = el.getAttribute("data-chat-flow-key");
				if (k !== null) seatByKey.set(k, el);
			}
			const markers = [];
			for (const { node } of nodes) {
				if (node?.kind !== "rollback-marker") continue;
				const from = markerCutOf(node);
				if (from === void 0) continue;
				const seq = typeof node?.data?.seq === "number" ? node.data.seq : node?.anchorSeq;
				if (typeof seq !== "number") {
					errorOnce("marker-seq", "rollback marker node carries no readable seq, so its range stays visible", nodeShapeOf(node));
					continue;
				}
				markers.push({
					from,
					seq
				});
			}
			if (markers.length === 0) {
				heroWanted.visible = false;
				revealAllRollbackSeats();
				return;
			}
			const latestSeq = markers[markers.length - 1].seq;
			let hasContentAfter = false;
			for (const { node } of nodes) {
				const seq = node?.anchorSeq;
				if (typeof seq === "number" && seq > latestSeq && node?.kind !== "rollback-marker") {
					hasContentAfter = true;
					break;
				}
			}
			let contentLeft = 0;
			for (const { node } of nodes) {
				const seq = node?.anchorSeq;
				if (typeof seq !== "number") continue;
				if (node?.kind === "rollback-marker") continue;
				if (INFRASTRUCTURE_KINDS.has(node?.kind)) continue;
				if (coveredByRollback(markers, seq)) continue;
				contentLeft += 1;
			}
			const emptied = contentLeft === 0;
			let hidden = 0;
			let markerSeats = 0;
			for (const { key, node } of nodes) {
				if (node?.kind !== "rollback-marker") continue;
				const el = seatByKey.get(key);
				if (el === void 0) {
					warnOnce("marker-seat", "rollback marker node has no DOM seat", {
						key,
						seq: node?.anchorSeq
					});
					continue;
				}
				markerSeats += 1;
				hideRollbackSeat(el);
				hidden += 1;
			}
			for (const { key, node } of nodes) {
				const el = seatByKey.get(key);
				if (el === void 0) continue;
				const seq = node?.anchorSeq;
				if (typeof seq !== "number" || node?.kind === "rollback-marker") continue;
				const strayInfrastructure = emptied && INFRASTRUCTURE_KINDS.has(node?.kind);
				if (coveredByRollback(markers, seq) || strayInfrastructure) {
					hideRollbackSeat(el);
					hidden += 1;
				} else revealRollbackSeat(el);
			}
			let contentSeatsVisible = 0;
			for (const { key, node } of nodes) {
				if (node?.kind === "rollback-marker") continue;
				if (INFRASTRUCTURE_KINDS.has(node?.kind)) continue;
				const el = seatByKey.get(key);
				if (el === void 0 || el.style.display === "none") continue;
				contentSeatsVisible += 1;
			}
			heroWanted.visible = emptied && contentSeatsVisible === 0;
			const column = document.querySelector("[data-chat-flow=\"\"]");
			if (heroWanted.visible) {
				const loadEarlier = loadEarlierButtonOf(column);
				if (loadEarlier === null) warnOnce("load-earlier", "no readable \"load earlier\" control was found in the emptied transcript", { columnPresent: column !== null });
				else hideRollbackSeat(loadEarlier);
			}
			const sig = (emptied ? "f" : "p") + ":" + latestSeq + ":" + (hasContentAfter ? "restart" : "clean") + ":" + hidden;
			if (sig !== syncHides.sig) {
				syncHides.sig = sig;
				"" + latestSeq + hidden;
				console.info("[nianchu-rollback] hides:", {
					markers: markers.length,
					latestMarker: latestSeq,
					markerSeats,
					seatsInDom: seatByKey.size,
					contentLeft,
					contentSeatsVisible,
					emptied,
					hiddenSeats: hidden,
					hero: heroWanted.visible ? "wanted" : "no"
				});
			}
			const scrollMeta = syncHides;
			if (scrollMeta.collapseKey !== latestSeq) {
				scrollMeta.collapseKey = latestSeq;
				scrollMeta.clearUntil = Date.now() + 800;
			}
			if (scrollMeta.clearUntil !== void 0 && Date.now() < scrollMeta.clearUntil && !hasContentAfter) {
				const scrollport = scrollportOf(column);
				if (scrollport !== null) scrollport.scrollTop = scrollport.scrollHeight;
				for (const btn of toBottomButtons(scrollport)) try {
					btn.click();
				} catch {}
			}
		}
		/**
		* Keep the hero's host element in step with the emptiness `syncHides` reported.
		*
		* The host is a plain element this plugin owns, appended to the transcript, and
		* the driver portals the hero into it. Owning the location is what makes the hero
		* reliable: revealing the marker node's own seat depended on that seat existing
		* and on nothing above it having been collapsed, and a rollback that hid the
		* whole transcript could therefore show nothing at all.
		*
		* This pass can only ever ADD an element (and take it back): it never hides a
		* seat, so a wrong input here cannot blank the transcript. Its one real risk is
		* that the column belongs to React, which knows nothing about a foreign child —
		* so the host is inserted only when the PROVEN empty state asks for it, always as
		* the last child, and it is removed the moment the flag clears (including on
		* driver unmount), which keeps React's own appends below it and the hero last.
		* @param ref - the driver's host slot.
		* @param setOn - React state setter; React bails out when the value is unchanged.
		*/
		function syncHeroHost(ref, setOn) {
			let host = ref.current;
			if (host !== null && !document.body.contains(host)) {
				ref.current = null;
				host = null;
			}
			if (!heroWanted.visible) {
				if (host !== null) {
					host.remove();
					ref.current = null;
				}
				setOn(false);
				return;
			}
			const column = document.querySelector("[data-chat-flow=\"\"]");
			if (column === null) {
				setOn(false);
				return;
			}
			if (host === null || !column.contains(host)) {
				host?.remove();
				host = document.createElement("div");
				host.setAttribute("data-rbk-hero-host", "true");
				column.appendChild(host);
				ref.current = host;
			} else if (column.lastElementChild !== host) column.appendChild(host);
			setOn(true);
		}
		/** Module-level bridge: the assistant action opens the single dock-hosted dialog. */
		let openRollbackDialog = null;
		/**
		* Module-level bridge for the one-key "roll back the last turn".
		*
		* Published by the mounted {@link RollbackDriver} (which owns the session's Remote
		* calls) and consumed by the global shortcut listener {@link apply} installs. It is
		* null whenever no driver is mounted, so the shortcut is inert outside a
		* conversation instead of guessing a session.
		*/
		let openRollbackLast = null;
		/** The rollback action rendered on each finalized assistant message's action strip. */
		function RollbackAction({ messageId, useSession, useChat, t }) {
			if (typeof useSession !== "function") {
				warnOnce("action-session", "assistant action lacks useSession");
				return null;
			}
			const snapshot = useSession((s) => s);
			const chat = useChatOrSnapshot(useChat, snapshot);
			const oldest = useRollbackOldest();
			const open = snapshot?.running === true;
			const turn = react.useMemo(() => turnForMessageId(chat, messageId), [chat, messageId]);
			const disabled = open || turn === void 0 || turn !== void 0 && oldest !== null && turn < oldest;
			const label = open ? t("action.running") : t("action.label");
			const button = react.createElement("button", {
				type: "button",
				className: "rbk-act",
				"aria-label": label,
				disabled,
				onClick: () => {
					if (!disabled && turn !== void 0 && openRollbackDialog !== null) openRollbackDialog(turn);
				}
			}, react.createElement(ReplyIcon));
			return react.createElement(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "bottom"
			}, button);
		}
		/**
		* Routing selector for the turn-footer entry, and the reason this entry is a CHAIN
		* contribution: a chain entry MUST supply `select` (the framework throws without it),
		* and its non-null result becomes the component's `matched` prop.
		*
		* Returning null whenever the assistant action strip can offer the button keeps the
		* familiar placement and guarantees one button per turn — the footer shows up only
		* where that strip cannot exist (an interrupted turn, which has no closing message).
		* The tail data is read through the location's own reader rather than from the node,
		* because the selector only ever receives the owner props.
		*/
		function selectFooterAction(owner) {
			const location = owner?.turn;
			const turnNo = turnNoOf(location);
			if (turnNo === void 0) return null;
			let closing;
			try {
				closing = location?.data?.get?.("turn-tail")?.closing;
			} catch (e) {
				warnOnce("footer-tail-data", "turn footer could not read its tail data", e);
				return { turn: turnNo };
			}
			if (!footerEntryNeeded(closing)) return null;
			return { turn: turnNo };
		}
		/**
		* The oldest turn the host can still roll back to, published by the driver.
		*
		* `null` means "not known yet" and blocks nothing: guessing a range (say, "the newest
		* turn minus ten") would grey out turns that are perfectly rollback-able, a silent
		* loss of function — the failure mode this plugin keeps having to design against.
		* `Infinity` means the host reported no rollback-able turn at all.
		*/
		let rollbackOldest = null;
		/**
		* The NEWEST rollback-able turn, published beside the oldest.
		*
		* The one-click entry needs a target, and "the last turn" is the only one the user
		* can name without reading numbers off the screen. Kept beside `rollbackOldest`
		* because both come from the same `/rollback list` reply and must never disagree
		* about the window.
		*/
		let rollbackNewest = null;
		const rollbackRangeListeners = /* @__PURE__ */ new Set();
		/** Publish the rollback range to the action components. */
		function publishRollbackOldest(oldest) {
			rollbackOldest = oldest;
			for (const listener of [...rollbackRangeListeners]) try {
				listener();
			} catch (e) {
				warnOnce("range-listener", "a rollback-range listener threw", e);
			}
		}
		/**
		* The greatest turn the host's `/rollback list` text names, or null when it names
		* none. Same parse as {@link oldestTurnOf} but taking the far end, so the
		* one-click entry targets a turn the host has actually retained.
		* @param text - the command's output.
		* @returns the newest available turn, or null when the text says nothing usable.
		*/
		function newestTurnOf(text) {
			if (text === null || text === void 0 || text === "") return null;
			const marker = text.includes("：") ? "：" : text.includes(":") ? ":" : null;
			if (marker === null) return null;
			const list = /^\s*((?:\d+\s*,\s*)*\d+)/.exec(text.slice(text.indexOf(marker) + 1));
			if (list === null) return null;
			const turns = list[1].split(",").map((part) => Number(part.trim())).filter((turn) => Number.isSafeInteger(turn) && turn >= 1);
			return turns.length === 0 ? null : Math.max(...turns);
		}
		/** Read the published rollback range, re-rendering whenever the driver publishes. */
		function useRollbackOldest() {
			const [, bump] = react.useState(0);
			react.useEffect(() => {
				const listener = () => {
					bump((n) => n + 1);
				};
				rollbackRangeListeners.add(listener);
				return () => {
					rollbackRangeListeners.delete(listener);
				};
			}, []);
			return rollbackOldest;
		}
		/**
		* Preference key for the interface-hiding half of a rollback.
		*
		* Deliberately client-local storage rather than a host setting: hiding is a
		* pure VIEW concern — the model context and the files are truncated/restored by
		* the host either way — so it must not require a host round trip, and it must
		* work even while the host is busy. It is per browser, which matches how it is
		* used (a display preference, not a session property).
		*/
		const HIDE_PREF_KEY = "nianchu-rollback.hide-rolled-back";
		function readHidePref() {
			try {
				return localStorage.getItem(HIDE_PREF_KEY) !== "false";
			} catch {
				return true;
			}
		}
		function writeHidePref(next) {
			try {
				localStorage.setItem(HIDE_PREF_KEY, next ? "true" : "false");
			} catch {}
		}
		/** Subscribers of the hide preference; the settings row and the driver share it. */
		const hidePrefListeners = /* @__PURE__ */ new Set();
		/** Set the hide preference and notify every live reader. */
		function setHidePref(next) {
			writeHidePref(next);
			for (const listener of [...hidePrefListeners]) try {
				listener();
			} catch {}
		}
		/** Read the hide preference, re-rendering the caller when it changes. */
		function useRollbackHidden() {
			const [on, setOn] = react.useState(readHidePref);
			react.useEffect(() => {
				const listener = () => setOn(readHidePref());
				hidePrefListeners.add(listener);
				return () => {
					hidePrefListeners.delete(listener);
				};
			}, []);
			return on;
		}
		/**
		* The General-settings row that owns the hide preference.
		*
		* The `settings.general.item` slot supplies NO props and draws no label — the row
		* owns its own copy and control (verified against the live slot catalogue, which
		* documents exactly that). It renders a label, a description, and a switch, and
		* re-reads the preference through the same hook the driver uses so both stay in
		* step.
		*/
		function RollbackSettingsRow({ t }) {
			const on = useRollbackHidden();
			return react.createElement("div", { className: "rbk-pref" }, react.createElement("div", { className: "rbk-preftext" }, react.createElement("div", { className: "rbk-pref-title" }, t("settings.hide.title")), react.createElement("div", { className: "rbk-pref-sub" }, t("settings.hide.description"))), react.createElement("button", {
				type: "button",
				className: "rbk-switch" + (on ? " rbk-switch-on" : ""),
				role: "switch",
				"aria-checked": on,
				"aria-label": t("settings.hide.title"),
				onClick: () => setHidePref(!on)
			}, on ? t("settings.hide.on") : t("settings.hide.off")));
		}
		/**
		* The same rollback action, rendered in the turn FOOTER for turns the assistant
		* action strip cannot serve.
		*
		* There is no in-progress state to handle here: the footer node only exists once its
		* turn ENDED (`tailData` requires a `turn/end` match), so a running turn simply has no
		* footer to render into. The host refuses a rollback while any turn is open, which is
		* the rule that actually has to hold — the button's absence during a run is a
		* consequence of that, not a second mechanism.
		*/
		function RollbackTurnAction({ turn: location, matched, useSession, t }) {
			if (typeof useSession !== "function") {
				warnOnce("footer-action-session", "turn footer action lacks useSession");
				return null;
			}
			const turnNo = matched?.turn ?? turnNoOf(location);
			const oldest = useRollbackOldest();
			if (turnNo === void 0) {
				warnOnce("footer-action-turn", "turn footer action could not resolve its turn", location);
				return null;
			}
			const blocked = oldest !== null && turnNo < oldest;
			const button = react.createElement("button", {
				type: "button",
				className: "rbk-act",
				"aria-label": t("action.label"),
				disabled: blocked,
				onClick: () => {
					if (!blocked && openRollbackDialog !== null) openRollbackDialog(turnNo);
				}
			}, react.createElement(ReplyIcon));
			return react.createElement(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("action.label"),
				side: "bottom"
			}, button);
		}
		/**
		* Invisible per-session driver: runs the durable-log side-effect passes (hide
		* rolled-back seats, suppress button command receipts) and hosts the single
		* confirmation dialog, opened from the assistant action through the module
		* bridge. Renders nothing into its own dock seat.
		*/
		function RollbackDriver({ preview, execute, list, openFile, useSession, useChat, inputActions, restoreImages, releaseImages, t }) {
			if (typeof useSession !== "function") {
				warnOnce("useSession", "props lack useSession", Object.keys({ useSession }));
				return null;
			}
			const chatRef = react.useRef(void 0);
			const ensureRef = react.useRef(() => {});
			const snapshot = useSession((s) => s);
			const chat = useChatOrSnapshot(useChat, snapshot);
			if (typeof useChat !== "function" && chat === void 0 && snapshot !== void 0) errorOnce("chat-snapshot", "framework contract mismatch: no chat snapshot — neither the session kit hook \"useChat\" nor snapshot.chat is available, so no turn can be resolved and the rollback button will never enable");
			const [dialogTurn, setDialogTurn] = react.useState(null);
			const [files, setFiles] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [expanded, setExpanded] = react.useState(null);
			const [heroOn, setHeroOn] = react.useState(false);
			const heroHostRef = react.useRef(null);
			const hidesOn = useRollbackHidden();
			const openDialog = react.useCallback((turn) => {
				setDialogTurn(turn);
				setFiles(null);
				setError(null);
				markPendingCommandDispatch();
				preview(turn).then(setFiles, (e) => setError(msg(e)));
			}, [preview]);
			react.useEffect(() => {
				openRollbackDialog = openDialog;
				openRollbackLast = () => {
					if (rollbackNewest === null) {
						warnOnce("undo-last-unknown", "the rollback range is not known yet, so the one-click rollback has no target; use the per-turn button");
						return;
					}
					openDialog(rollbackNewest);
				};
				chatRef.current = chat;
				list().then((text) => {
					publishRollbackOldest(oldestTurnOf(text));
					rollbackNewest = newestTurnOf(text);
				}, (e) => {
					warnOnce("rollback-list", "could not read the rollback range", e);
				});
				let raf = 0;
				const ensure = () => {
					if (!readHidePref()) {
						heroWanted.visible = false;
						revealAllRollbackSeats();
					} else try {
						syncHides(chatRef.current);
					} catch (error) {
						heroWanted.visible = false;
						revealAllRollbackSeats();
						warnOnce("sync-hides", "syncHides threw", error);
					}
					try {
						syncHiddenRpcRows();
					} catch (e) {
						warnOnce("sync-rpc-rows", "syncHiddenRpcRows threw", e);
					}
					try {
						syncHeroHost(heroHostRef, setHeroOn);
					} catch (e) {
						warnOnce("sync-hero", "syncHeroHost threw", e);
					}
				};
				ensureRef.current = () => {
					if (raf) cancelAnimationFrame(raf);
					raf = requestAnimationFrame(() => {
						raf = 0;
						ensure();
					});
				};
				ensure();
				const obs = new MutationObserver(() => {
					syncPendingRpcRow();
					ensureRef.current();
				});
				obs.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					obs.disconnect();
					if (raf) cancelAnimationFrame(raf);
					openRollbackDialog = null;
					openRollbackLast = null;
					heroWanted.visible = false;
					heroHostRef.current?.remove();
					heroHostRef.current = null;
				};
			}, [hidesOn]);
			react.useEffect(() => {
				chatRef.current = chat;
				ensureRef.current();
			});
			/**
			* Run one rollback against an explicit turn.
			*
			* Takes the turn as an argument rather than reading the dialog state so the
			* dialog's own confirm button and the one-click "roll back the last turn" both
			* go through exactly one code path.
			* @param turn - the turn to roll back to before.
			* @returns when the host call has settled (success or failure).
			*/
			const confirmTurn = (turn) => {
				const promptBefore = findUserPrompt(chatRef.current, turn);
				const imagesBefore = findUserImages(chatRef.current, turn);
				setBusy(true);
				setError(null);
				markPendingCommandDispatch();
				return execute(turn).then(() => {
					setBusy(false);
					setDialogTurn(null);
					ensureRef.current();
					const prompt = findUserPrompt(chatRef.current, turn) || promptBefore;
					const images = findUserImages(chatRef.current, turn);
					const restored = images.length > 0 ? images : imagesBefore;
					if (inputActions !== void 0) {
						inputActions.setDraft(prompt);
						if (inputActions.pruneAttachments !== void 0) inputActions.pruneAttachments([]);
						else if (inputActions.pruneImages !== void 0) inputActions.pruneImages([]);
					}
					if (restored.length > 0 && restoreImages !== void 0 && inputActions !== void 0) {
						const add = inputActions.addAttachments !== void 0 ? (ids) => inputActions.addAttachments(ids) : inputActions.addImages !== void 0 ? (ids) => inputActions.addImages(ids) : void 0;
						if (add === void 0) warnOnce("input-add-attachments", "input actions expose neither addAttachments (0.1.5) nor addImages (0.1.1), so the rolled-back images cannot be re-attached");
						else restoreImages(restored).then((ids) => {
							if (ids.length === 0) return;
							if (add(ids) === false) releaseImages?.(ids);
						}, (e) => {
							warnOnce("restore-images", "could not rebuild the composer attachments of the rolled-back turn", e);
						});
					}
				}, (e) => {
					setBusy(false);
					setError(msg(e));
				});
			};
			const hero = heroOn && heroHostRef.current !== null ? (0, react_dom.createPortal)(react.createElement(RollbackHero, { t }), heroHostRef.current) : null;
			/** Start a rollback and own its failure, so no rejection escapes unhandled. */
			const startRollback = (turn) => {
				confirmTurn(turn).then(void 0, (e) => {
					setBusy(false);
					setError(msg(e));
				});
			};
			const dialog = dialogTurn === null ? null : (0, react_dom.createPortal)(react.createElement("div", {
				className: "rbk-overlay",
				onMouseDown: (ev) => {
					if (ev.target === ev.currentTarget) setDialogTurn(null);
				}
			}, react.createElement("div", {
				className: "rbk-panel",
				role: "dialog",
				"aria-modal": true,
				"aria-label": t("dialog.aria"),
				onKeyDown: (ev) => {
					if (ev.key === "Escape" && !busy) {
						ev.preventDefault();
						setDialogTurn(null);
					}
				}
			}, react.createElement("div", { className: "rbk-head" }, t("dialog.title")), react.createElement("div", { className: "rbk-warn" }, t("dialog.warning")), react.createElement("div", { className: "rbk-list" }, files === null && error === null ? react.createElement("div", { className: "rbk-empty" }, t("dialog.analyzing")) : null, files !== null && files.length > 0 ? files.map((f) => previewRow(f, t, openFile, expanded, setExpanded)) : null, error !== null ? react.createElement("div", { className: "rbk-err" }, error) : null), react.createElement("div", { className: "rbk-foot" }, react.createElement("button", {
				type: "button",
				className: "rbk-cancel",
				disabled: busy || files === null,
				onClick: () => startRollback(dialogTurn)
			}, t("action.undoLast")), react.createElement("button", {
				type: "button",
				className: "rbk-cancel",
				disabled: busy,
				onClick: () => setDialogTurn(null)
			}, t("dialog.cancel")), react.createElement("button", {
				type: "button",
				className: "rbk-confirm",
				disabled: busy || files === null || error !== null,
				autoFocus: true,
				onClick: () => startRollback(dialogTurn)
			}, busy ? t("dialog.busy") : t("dialog.confirm"))))), document.body);
			if (hero === null && dialog === null) return null;
			return react.createElement(react.Fragment, null, hero, dialog);
		}
		/**
		* One affected file as an expandable row.
		*
		* The row itself opens the file in the editor (the established behaviour), and a
		* chevron reveals the unified diff the host rendered. Diff lines are coloured by
		* their own prefix — `-` leaves the disk, `+` comes back — so the dialog reads as
		* the inverse of what the turn did, which is exactly what the button does.
		* @param f - the parsed preview entry.
		* @param t - the namespace translator.
		* @param openFile - the host call that opens a path in the editor.
		* @param expanded - the path currently expanded, or null.
		* @param setExpanded - sets the expanded path.
		*/
		function previewRow(f, t, openFile, expanded, setExpanded) {
			const lines = f.diff ?? [];
			const stats = f.added === void 0 || f.removed === void 0 ? null : `+${f.added} / -${f.removed}`;
			const isOpen = expanded === f.path;
			const canExpand = lines.length > 0;
			const header = react.createElement("div", { className: "rbk-rowhead" }, react.createElement("span", { className: "rbk-tag rbk-tag-" + f.action }, t("tag." + f.action)), react.createElement("button", {
				type: "button",
				className: "rbk-path rbk-pathlink",
				title: t("dialog.openInEditor"),
				onClick: () => {
					openFile(f.path).catch(() => {});
				}
			}, f.path), stats === null ? null : react.createElement("span", { className: "rbk-stats" }, stats), canExpand ? react.createElement("button", {
				type: "button",
				className: "rbk-exp",
				"aria-expanded": isOpen,
				"aria-label": isOpen ? t("dialog.collapse") : t("dialog.expand"),
				onClick: () => setExpanded(isOpen ? null : f.path)
			}, isOpen ? "▾" : "▸") : null);
			const body = react.createElement("div", { className: "rbk-diffbody" }, f.note === void 0 ? null : react.createElement("div", { className: "rbk-note" }, noteText(t, f.note)), isOpen ? react.createElement("pre", { className: "rbk-diff" }, lines.map((line, index) => {
				const kind = line.startsWith("+") ? "rbk-add" : line.startsWith("-") ? "rbk-del" : "rbk-ctx";
				return react.createElement("span", {
					key: index,
					className: "rbk-diffline " + kind
				}, line + "\n");
			})) : null);
			return react.createElement("div", {
				key: f.path,
				className: "rbk-item"
			}, header, body);
		}
		/** The durable rollback checkpoint node, recognized from the event itself. */
		const markerDefinition = {
			kind: "rollback-marker",
			target: "chat",
			match: (event) => {
				const op = event?.surfaceOp;
				if (event?.type === "user/message") {
					const source = event?.data?.source;
					if (!isRollbackMarkerSource(source)) return null;
					if (op === "append" || op === void 0) return {
						id: String(event.seq),
						role: "start"
					};
					if (op?.op !== "replace") return null;
					reportUnreadableCut(op);
					return {
						id: String(event.seq),
						role: "start"
					};
				}
				if (event?.type === "assistant/message" && event?.data?.message?.rollback !== void 0) {
					if (op === void 0 || op === "append" || op?.op !== "replace") return null;
					reportUnreadableCut(op);
					return {
						id: String(event.seq),
						role: "start"
					};
				}
				return null;
			},
			start: (_context, match) => {
				const event = match?.event;
				const seq = typeof event?.seq === "number" && Number.isSafeInteger(event.seq) ? event.seq : 0;
				const op = event?.surfaceOp;
				if (op === "append" || op === void 0) return {
					seq,
					replacedNothing: true
				};
				return {
					seq,
					truncatedFromSeq: surfaceCutOf(op)
				};
			},
			update: (context) => context.state,
			buildViewNode: (context) => {
				if (context.state === void 0) return null;
				const loc = context.start?.location ?? context.matches?.[0]?.location ?? { kind: "unresolved" };
				return {
					key: context.key,
					kind: "rollback-marker",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.seq,
					location: loc,
					visibility: "visible",
					data: context.state
				};
			}
		};
		/**
		* The conversation-node registry this DSH build ships, in preference order.
		*
		* 0.1.5 keeps it on `uiConversation` (`uiConversation.events`, a
		* `ConversationEventRegistry`); 0.1.1 provided the same role as a service of its
		* own, `conversationEvents`. Both are looked up through `ctx.get`, which needs no
		* `inject` entry and returns undefined while the providing fiber is inactive — so
		* this answers "can the registry be used right now", not "does the package
		* exist". Naming either one in `inject` is what must never happen (see the
		* `inject` comment): the other version would park the fiber forever.
		* @param ctx - a context able to resolve services.
		* @returns the registry, or undefined when neither route is available.
		*/
		function eventRegistryOf(ctx) {
			const modern = ctx?.get?.("uiConversation")?.events;
			if (modern !== void 0 && typeof modern.register === "function") return modern;
			const legacy = ctx?.get?.("conversationEvents");
			if (legacy !== void 0 && typeof legacy.register === "function") return legacy;
		}
		/** Whether the marker Definition is registered, and for which plugin context. */
		let markerRegistered = false;
		let markerOwner = null;
		/**
		* Register the marker Definition on whichever registry this build ships.
		*
		* Exactly once per plugin context: `register` THROWS when the kind is already
		* taken, and both registries could exist in one future composition, so the two
		* waits in `apply()` must not race into a duplicate. A different (new) plugin
		* context re-attempts the registration instead of trusting the flag, because a
		* registration belongs to the fiber that made it — a re-run whose anchor silently
		* vanished is precisely the failure mode this file exists to prevent, and a
		* still-live Definition turns the second attempt into the reported duplicate
		* rather than into two markers.
		*
		* The registry owns the registration's lifetime through the CALLER's context
		* (cordis rebinds the service to the caller), so passing the plugin's own `ctx`
		* — never an injected child's — ties the marker to this plugin and not to a
		* transient dependency wait.
		* @param ctx - the plugin's own context.
		* @returns whether a registry was found (and now carries the Definition).
		*/
		function registerMarkerDefinition(ctx) {
			if (markerRegistered && markerOwner === ctx) return true;
			const registry = eventRegistryOf(ctx);
			if (registry === void 0) return false;
			try {
				registry.register(markerDefinition);
			} catch (error) {
				warnOnce("marker-dup", "rollback marker Definition is already registered on this registry", msg(error));
			}
			markerRegistered = true;
			markerOwner = ctx;
			return true;
		}
		/**
		* Whether the session kit declares the 0.1.5 `chat` hook (delivered to entries as
		* the `useChat` prop).
		*
		* It is read from the live session-standard roster — the very object the renderer
		* turns into props — rather than guessed from a version number. The roster lists
		* every DECLARED hook even while no Session is selected, so the answer is about
		* the composition, not about the current conversation.
		* @param ctx - a context able to resolve services.
		* @returns true/false when the roster is readable, undefined when this build has
		* no readable roster (the audit then stays silent instead of guessing).
		*/
		function chatHookDeclared(ctx) {
			const hooks = ctx?.get?.("uiSession")?.adapter?.current?.getSnapshot?.()?.hooks;
			if (hooks === null || typeof hooks !== "object") return void 0;
			return Object.prototype.hasOwnProperty.call(hooks, "chat");
		}
		/**
		* How long the start-up audit keeps re-checking before it reports (ms), and how
		* often it looks in that window. The wait exists because a MISSING seam and a
		* NOT-YET-MOUNTED one are indistinguishable at boot: our bundle may be applied
		* before the plugin that ships the seam (nothing makes ui-chat load first), so a
		* single early check would name a healthy composition as broken. A seam that is
		* still absent after this window is a real mismatch for this page load.
		*/
		const AUDIT_WINDOW_MS = 8e3;
		const AUDIT_INTERVAL_MS = 500;
		/**
		* The framework seams this bundle needs and cannot find right now, by name.
		*
		* The chat hook is audited only where the modern registry route is in play,
		* because that is by definition the route that moved chat off the session
		* snapshot: on the legacy route `snapshot.chat` is the expected source, so a
		* roster without a `chat` hook proves nothing there.
		* @param ctx - the plugin's own context.
		* @returns one message per missing seam, empty when both are present.
		*/
		function missingContracts(ctx) {
			const missing = [];
			if (!markerRegistered) missing.push("conversation-node registry — neither ctx.get(\"uiConversation\").events nor ctx.get(\"conversationEvents\") is available, so the rollback marker cannot be anchored");
			if (ctx?.get?.("uiConversation")?.events !== void 0 && chatHookDeclared(ctx) === false) missing.push("chat snapshot hook — the session kit declares no \"chat\" hook, so no useChat prop reaches the entries and 0.1.5 has no snapshot.chat to fall back to");
			return missing;
		}
		/**
		* Start-up audit of the two framework seams this bundle cannot work without,
		* reported LOUDLY and by name.
		*
		* Written for the failure this port hit: the browser half loaded, `apply()` never
		* ran because a service it named no longer existed, and a plugin that renders
		* nothing is indistinguishable from a plugin that was never installed. "It does
		* nothing" is not a diagnosis, so each seam is named individually — and only
		* after {@link AUDIT_WINDOW_MS} of re-checking, so a seam that merely arrives
		* late is never reported. The driver reports the chat half again per session,
		* where the props make it directly observable.
		* @param ctx - the plugin's own context.
		*/
		function auditContracts(ctx) {
			const deadline = Date.now() + AUDIT_WINDOW_MS;
			const check = () => {
				const missing = missingContracts(ctx);
				if (missing.length === 0) return;
				if (Date.now() < deadline) {
					setTimeout(check, AUDIT_INTERVAL_MS);
					return;
				}
				errorOnce("contracts", "framework contract mismatch: " + missing.join("; ") + " — still missing 8s after the client applied");
			};
			if (typeof setTimeout === "function") setTimeout(check, 0);
			else check();
		}
		/** The marker node's view: nothing at all.
		*
		* It exists as the durable anchor `syncHides` reads the replaced range from — a
		* range that a `replace` marker states and an `append` marker states as empty
		* (nothing was left to replace) — and a rollback must leave no trace in the
		* transcript: no divider, no notice. The welcome hero is NOT rendered here,
		* because a node's seat can be missing or sit inside a container the hide pass
		* collapsed, which would swallow the hero silently; the driver hosts it instead
		* (see {@link RollbackHero}). */
		function RollbackMarkerView() {
			return null;
		}
		/** The welcome page a rollback shows once the transcript is empty.
		*
		* Rendered by {@link RollbackDriver} into a host element it injects into the
		* transcript, so its visibility never depends on any node's seat. */
		function RollbackHero({ t }) {
			return react.createElement("div", {
				className: "rbk-hero",
				role: "status",
				"data-rbk-hero": "true"
			}, react.createElement("div", { className: "rbk-hero-brand" }, react.createElement(_deepseek_ai_dsh_client_ui_primitives.FishLogo, { size: 44 })), react.createElement("div", { className: "rbk-hero-title" }, t("hero.title")), react.createElement("div", { className: "rbk-hero-sub" }, t("hero.sub")));
		}
		/** Client plugin body: stylesheet, dictionaries, the assistant action, and the driver. */
		function apply(ctx) {
			console.info("[nianchu-rollback] client bundle rev", BUNDLE_REV);
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "rollback";
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => style.remove();
			});
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "rollback: dictionaries");
			if (!registerMarkerDefinition(ctx) && typeof ctx.inject === "function") {
				ctx.inject(["uiConversation"], () => {
					registerMarkerDefinition(ctx);
				});
				ctx.inject(["conversationEvents"], () => {
					registerMarkerDefinition(ctx);
				});
			}
			auditContracts(ctx);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "rollback-marker",
				locale: NS
			}, RollbackMarkerView));
			ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
				name: "conversation.chat.assistant-actions",
				id: "rollback",
				order: 20,
				locale: NS
			}, RollbackAction));
			ctx.slots.inject("conversation.chat.turnTail", () => {
				try {
					const dispose = ctx.slots.register({
						name: "conversation.chat.turnTail",
						select: selectFooterAction,
						locale: NS
					}, RollbackTurnAction);
					console.info("[nianchu-rollback] turn-footer action registered (rev 20)");
					return dispose;
				} catch (error) {
					console.error("[nianchu-rollback] turn-footer action registration FAILED — interrupted turns will have no rollback button", error);
					return () => {};
				}
			});
			ctx.slots.inject("conversation.input.dock", () => {
				const dispose = ctx.slots.register({
					name: "conversation.input.dock",
					id: "rollback-driver",
					locale: NS,
					inject: (sessionId) => ({
						preview: async (turn) => {
							return parsePreview((await extCommand(ctx, sessionId, "/rollback preview " + turn)).text);
						},
						execute: async (turn) => {
							await extCommand(ctx, sessionId, "/rollback " + turn);
						},
						list: async () => (await extCommand(ctx, sessionId, "/rollback list")).text ?? "",
						openFile: (path) => openFileInEditor(ctx, sessionId, path),
						restoreImages: (images) => restoreDraftImages(ctx, sessionId, images),
						releaseImages: (ids) => {
							const conversation = ctx.get?.("conversation");
							if (conversation?.releaseDraftAttachment === void 0) return;
							for (const id of ids) try {
								conversation.releaseDraftAttachment(id);
							} catch {}
						}
					})
				}, RollbackDriver);
				return () => dispose();
			});
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "rollback-hide",
				order: 40,
				locale: NS
			}, RollbackSettingsRow));
			ctx.effect(() => {
				const onKeyDown = (event) => {
					if (!event.ctrlKey || !event.shiftKey || event.altKey) return;
					if (event.key !== "Z" && event.key !== "z") return;
					if (openRollbackLast === null) return;
					const target = event.target;
					if (target !== null && typeof target.closest === "function" && target.closest("[role=\"dialog\"]") !== null) return;
					event.preventDefault();
					openRollbackLast();
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => document.removeEventListener("keydown", onKeyDown, true);
			}, "rollback: undo-last shortcut");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.newestTurnOf = newestTurnOf;
		return module.exports;
	}
});
