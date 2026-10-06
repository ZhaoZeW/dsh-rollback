import { open, readFile, readdir, rename, rmdir, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
//#region src/core/contract-audit.ts
/** The plugin's own release, mirrored from package.json at build time by hand. */
const PLUGIN_VERSION = "0.4.2";
/** Capability ids, so callers and tests name seams without string duplication. */
const CONTRACT_IDS = {
	fs: "filesystem",
	sessions: "session-store",
	tools: "tool-registry",
	commands: "command-registry",
	sandboxPolicy: "sandbox-policy",
	sessionEvent: "session/event",
	sessionCreated: "session/created",
	toolsPreExecute: "tools/pre-execute",
	toolsResult: "tools/result",
	fsObserved: "fs/observed",
	writeText: "fs.writeText",
	editText: "fs.editText",
	resolve: "fs.resolve",
	processPath: "fs.processPath",
	stat: "fs.stat",
	readText: "fs.readText",
	surfaceAppend: "session.append(surfaceOp)",
	snapshotEvents: "session.snapshotEvents",
	sandboxResolve: "sandboxPolicy.resolve({ session })",
	sessionStoreGet: "sessions.get",
	sessionStoreList: "sessions.list",
	sessionSurfaceLookup: "session.surface"
};
/**
* Read one property path off an unknown object without throwing.
*
* The property access is guarded because a live object can carry a GETTER that
* throws — `Session.surface` is one, and a session whose surface cannot be built
* is exactly the state a doctor run is meant to diagnose. Letting that getter's
* error escape would lose the whole report, which is the one outcome this module
* exists to prevent.
*/
function probe(root, path) {
	let current = root;
	for (const key of path) {
		if (current === null || current === void 0) return { ok: false };
		if (typeof current !== "object" && typeof current !== "function") return { ok: false };
		try {
			current = current[key];
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error))
			};
		}
	}
	return current === void 0 ? { ok: false } : {
		ok: true,
		value: current
	};
}
/** Whether a nested property path resolves to a function. */
function hasFunction(root, path) {
	const found = probe(root, path);
	return found.ok && typeof found.value === "function";
}
/** Describe a service's shape compactly, for the `observed` column. */
function shapeOf(value, limit = 8) {
	if (value === void 0) return "absent";
	if (value === null) return "null";
	if (typeof value !== "object" && typeof value !== "function") return typeof value;
	const own = Object.keys(value);
	const names = own.length > 0 ? own : prototypeMethodNames(value);
	const shown = names.slice(0, limit).join(", ");
	return names.length > limit ? `{ ${shown}, +${names.length - limit} }` : `{ ${shown} }`;
}
/** The method names on an object's prototype, or `[]` when it has none worth naming. */
function prototypeMethodNames(value) {
	try {
		const proto = Object.getPrototypeOf(value);
		if (proto === null || proto === Object.prototype) return [];
		return Object.getOwnPropertyNames(proto).filter((name) => {
			if (name === "constructor") return false;
			try {
				return typeof value[name] === "function";
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}
/** The first live session in the store, or undefined when none can be read. */
function liveSession(sessions) {
	const list = sessions?.list;
	if (typeof list !== "function") return void 0;
	try {
		const all = list.call(sessions);
		return Array.isArray(all) ? all[0] : void 0;
	} catch {
		return;
	}
}
/**
* Probe every seam the plugin depends on.
*
* The order is deliberate: the services the plugin names in `inject` come first
* (a failure there parks the whole fiber and nothing else matters), then the
* events it observes, then the individual filesystem primitives whose absence
* would degrade one feature rather than the plugin.
* @param ctx - the live plugin context.
* @returns the audit, ready to format.
*/
async function auditContracts(ctx) {
	const findings = [];
	const required = [
		[
			CONTRACT_IDS.fs,
			ctx.fs,
			"filesystem access: capture, restore, delete",
			"the fs service is required; without it the plugin cannot load"
		],
		[
			CONTRACT_IDS.sessions,
			ctx.sessions,
			"resolving the calling session and its policy",
			"the sessions service is required; without it the plugin cannot load"
		],
		[
			CONTRACT_IDS.tools,
			ctx.tools,
			"observing write/edit tool results",
			"the tools service is required; without it the plugin cannot load"
		],
		[
			CONTRACT_IDS.commands,
			ctx.commands,
			"the /rollback command surface",
			"the commands service is required; without it the plugin cannot load"
		],
		[
			CONTRACT_IDS.sandboxPolicy,
			ctx.sandboxPolicy,
			"resolving the per-session sandbox policy for restores",
			"the sandboxPolicy service is required; without it the plugin cannot load"
		]
	];
	for (const [id, value, purpose, remedy] of required) findings.push(value === void 0 ? {
		id,
		purpose,
		status: "missing",
		observed: "service not resolvable through ctx.get",
		remedy
	} : {
		id,
		purpose,
		status: "ok",
		observed: shapeOf(value)
	});
	const fs = ctx.fs;
	const primitives = [
		[
			CONTRACT_IDS.resolve,
			["resolve"],
			"turning a display path into a filesystem target",
			"restore and capture cannot resolve paths without it"
		],
		[
			CONTRACT_IDS.processPath,
			["processPath"],
			"mapping a target to its host path for delete and empty-directory cleanup",
			"file deletion and empty-directory cleanup are unavailable without it"
		],
		[
			CONTRACT_IDS.stat,
			["stat"],
			"detecting created-vs-updated and version guards",
			"the plugin cannot tell a new file from an edited one without it"
		],
		[
			CONTRACT_IDS.readText,
			["readText"],
			"reading pre-turn content for str_replace_editor",
			"str_replace_editor pre-capture falls back to an unknown basis"
		],
		[
			CONTRACT_IDS.writeText,
			["writeText"],
			"restoring pre-turn content",
			"file restore is unavailable without it"
		],
		[
			CONTRACT_IDS.editText,
			["editText"],
			"the drive-root write fallback",
			"the Windows drive-root fallback is inactive without it"
		]
	];
	for (const [id, path, purpose, remedy] of primitives) {
		const present = hasFunction(fs, path);
		findings.push(present ? {
			id,
			purpose,
			status: "ok",
			observed: `fs.${path.join(".")} present`
		} : {
			id,
			purpose,
			status: "missing",
			observed: `fs.${path.join(".")} is not a function`,
			remedy
		});
	}
	const sessions = ctx.sessions;
	const storeSeams = [[
		CONTRACT_IDS.sessionStoreGet,
		["get"],
		"resolving the calling session from the agent id in a /rollback command",
		"the command cannot find its session and answers \"无法定位当前会话\""
	], [
		CONTRACT_IDS.sessionStoreList,
		["list"],
		"seeding checkpoints for sessions already live when the plugin loaded",
		"sessions opened before the plugin loaded keep no checkpoints until a new turn runs"
	]];
	for (const [id, path, purpose, remedy] of storeSeams) {
		const present = hasFunction(sessions, path);
		findings.push(present ? {
			id,
			purpose,
			status: "ok",
			observed: `sessions.${path.join(".")} present`
		} : {
			id,
			purpose,
			status: "missing",
			observed: `sessions.${path.join(".")} is not a function`,
			remedy
		});
	}
	const sessionSeams = [[
		CONTRACT_IDS.snapshotEvents,
		"snapshotEvents",
		"replaying a stored log so a resumed session keeps its checkpoints",
		"checkpoints are not rebuilt after a resume; /rollback list stays empty until new turns run"
	], [
		CONTRACT_IDS.surfaceAppend,
		"append",
		"truncating the conversation in place",
		"files can be restored but the conversation cannot be truncated — half the feature is gone"
	]];
	const probeSession = liveSession(sessions);
	for (const [id, member, purpose, remedy] of sessionSeams) {
		if (probeSession === void 0) {
			findings.push({
				id,
				purpose,
				status: "degraded",
				observed: "not probed: no live session available",
				remedy: "run /rollback doctor from inside a session to probe this seam"
			});
			continue;
		}
		const present = hasFunction(probeSession, [member]);
		findings.push(present ? {
			id,
			purpose,
			status: "ok",
			observed: `session.${member} present`
		} : {
			id,
			purpose,
			status: "missing",
			observed: `session.${member} is not a function`,
			remedy
		});
	}
	const surfacePurpose = "reading the model-visible node range the truncation replaces";
	if (probeSession === void 0) findings.push({
		id: CONTRACT_IDS.sessionSurfaceLookup,
		purpose: surfacePurpose,
		status: "degraded",
		observed: "not probed: no live session available",
		remedy: "run /rollback doctor from inside a session to probe this seam"
	});
	else {
		const found = probe(probeSession, ["surface"]);
		if (found.ok) findings.push({
			id: CONTRACT_IDS.sessionSurfaceLookup,
			purpose: surfacePurpose,
			status: "ok",
			observed: `session.surface present (${shapeOf(found.value)})`
		});
		else if (found.error !== void 0) findings.push({
			id: CONTRACT_IDS.sessionSurfaceLookup,
			purpose: surfacePurpose,
			status: "degraded",
			observed: `session.surface threw: ${found.error.message}`,
			remedy: "the truncation range cannot be computed; fix the session surface before rolling back"
		});
		else findings.push({
			id: CONTRACT_IDS.sessionSurfaceLookup,
			purpose: surfacePurpose,
			status: "missing",
			observed: "session.surface is undefined",
			remedy: "the truncation range cannot be computed, so a rollback refuses instead of guessing"
		});
	}
	const policyService = ctx.sandboxPolicy;
	if (policyService !== void 0 && typeof policyService.resolve === "function") {
		let observed;
		let status = "ok";
		let remedy;
		try {
			const resolved = policyService.resolve({});
			const hasRoot = typeof resolved?.workspaceRoot === "string";
			observed = `resolve({}) -> ${shapeOf(resolved)}`;
			if (!hasRoot) {
				status = "degraded";
				remedy = "sandboxPolicy.resolve() no longer returns a workspaceRoot; restores may be sandbox-refused";
			}
		} catch (error) {
			status = "degraded";
			observed = `resolve({}) threw: ${error instanceof Error ? error.message : String(error)}`;
			remedy = "sandboxPolicy.resolve() refused an empty request; restore calls may fail";
		}
		findings.push({
			id: CONTRACT_IDS.sandboxResolve,
			purpose: "resolving the workspace root restores are written under",
			status,
			observed,
			...remedy === void 0 ? {} : { remedy }
		});
	}
	const eventProbes = [
		[
			CONTRACT_IDS.sessionEvent,
			"folding turns and surface positions into checkpoints",
			"the plugin cannot build checkpoints without it"
		],
		[
			CONTRACT_IDS.sessionCreated,
			"rebuilding checkpoints when a session is resumed",
			"rollback coverage starts only after this plugin sees the session"
		],
		[
			CONTRACT_IDS.toolsPreExecute,
			"pre-reading str_replace_editor targets",
			"str_replace_editor changes lose their pre-turn basis"
		],
		[
			CONTRACT_IDS.toolsResult,
			"capturing write/edit before-and-after content",
			"no file change can be captured, so rollback restores nothing"
		]
	];
	for (const [id, purpose, remedy] of eventProbes) {
		const canListen = typeof ctx.on === "function";
		findings.push(canListen ? {
			id,
			purpose,
			status: "ok",
			observed: "ctx.on present — registrar only; the event NAME is not verifiable from here"
		} : {
			id,
			purpose,
			status: "missing",
			observed: "ctx.on is not a function",
			remedy
		});
	}
	const canEmit = typeof ctx.emit === "function";
	const observedPurpose = "refreshing the observation cache after a rollback deletes or rewrites a file";
	findings.push(canEmit ? {
		id: CONTRACT_IDS.fsObserved,
		purpose: observedPurpose,
		status: "ok",
		observed: "ctx.emit present"
	} : {
		id: CONTRACT_IDS.fsObserved,
		purpose: observedPurpose,
		status: "degraded",
		observed: "ctx.emit is not a function",
		remedy: "a write right after a rollback may report FS_STALE_VERSION; re-read the file"
	});
	return {
		dshVersion: dshVersionOf(ctx),
		pluginVersion: PLUGIN_VERSION,
		findings
	};
}
/**
* The DSH version, read from a loaded core service when one exposes it.
*
* `ctx.get` returns `undefined` for a name no fiber provides (Cordis
* `reflect.get(name, strict)`), so an absent service is a silent `undefined`
* rather than a throw — which is why this cannot be the only signal that the
* composition is healthy, and why {@link ContractAudit.dshVersion} is allowed to
* stay empty.
*/
function dshVersionOf(ctx) {
	for (const name of [
		"dshBrand",
		"brand",
		"packageManifest"
	]) {
		const version = (ctx.get?.(name))?.version;
		if (typeof version === "string" && version !== "") return version;
	}
}
/** One-line-per-finding human report. */
function formatAudit(audit) {
	const bad = audit.findings.filter((finding) => finding.status !== "ok");
	const lines = [`回退插件契约自检 · 插件 ${audit.pluginVersion}${audit.dshVersion === void 0 ? "" : ` · DSH ${audit.dshVersion}`}`, bad.length === 0 ? `全部 ${audit.findings.length} 项依赖正常。` : `${audit.findings.length} 项依赖中有 ${bad.length} 项异常：`];
	for (const finding of bad) {
		const tag = finding.status === "missing" ? "[缺失]" : finding.observed.startsWith("not probed:") ? "[未探针]" : "[降级]";
		lines.push(`  ${tag} ${finding.id} — ${finding.purpose}`);
		lines.push(`         实测：${finding.observed}`);
		if (finding.remedy !== void 0) lines.push(`         处置：${finding.remedy}`);
	}
	if (bad.length === 0) for (const finding of audit.findings) lines.push(`  [正常] ${finding.id}`);
	lines.push("  说明：「缺失」= 该功能完全不可用；「降级」= 功能可用但能力受限；「未探针」= 本次没有可探测的对象，结果未知。");
	return lines.join("\n");
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
/** The bracket form of one action's tag. */
function tagOf(action) {
	return `[${TAGS[action][0]}]`;
}
/**
* The lines of a text, where the empty string is ZERO lines.
*
* `''.split('\n')` is `['']` — one empty line, not none. That single element is
* what made a file removed by a shell command render as `(+1/-N)` with a
* spurious `+ ` row, and a file restored from nothing look as if one blank line
* were about to be written. An empty text has no lines; saying so here is what
* keeps every count below exact.
* @param text - the text to split.
* @returns its lines.
*/
function linesOf(text) {
	return text === "" ? [] : text.split("\n");
}
/**
* A line-oriented unified diff, capped for transport.
*
* This is deliberately not a minimal-edit diff: the plugin knows the whole
* before and after text, and users read this to answer "what will change", not
* to apply a patch. A common-prefix/suffix trim plus a bounded middle window
* gives an honest picture at a bounded cost, and the line counts are exact even
* when the window is trimmed.
*
* `before` is the text as it stands and `after` is the text the action will
* leave: `-` lines leave the disk, `+` lines are written to it.
* @param before - the current content.
* @param after - the content the action will leave behind.
* @param budget - how many diff lines this file may contribute.
* @returns the capped diff and the exact counts.
*/
function cappedDiff(before, after, budget = 24) {
	const beforeLines = linesOf(before);
	const afterLines = linesOf(after);
	let head = 0;
	while (head < beforeLines.length && head < afterLines.length && beforeLines[head] === afterLines[head]) head++;
	let tail = 0;
	while (tail < beforeLines.length - head && tail < afterLines.length - head && beforeLines[beforeLines.length - 1 - tail] === afterLines[afterLines.length - 1 - tail]) tail++;
	const removedLines = beforeLines.slice(head, beforeLines.length - tail);
	const addedLines = afterLines.slice(head, afterLines.length - tail);
	const removed = removedLines.length;
	const added = addedLines.length;
	const body = [];
	for (const line of removedLines) body.push(`- ${clampLine(line)}`);
	for (const line of addedLines) body.push(`+ ${clampLine(line)}`);
	if (body.length === 0) return {
		added: 0,
		removed: 0,
		lines: []
	};
	const context = `@@ 第 ${head + 1} 行起 @@`;
	if (body.length <= budget) return {
		added,
		removed,
		lines: [context, ...body]
	};
	if (budget < 4) return {
		added,
		removed,
		lines: [context],
		note: "diff-truncated"
	};
	const side = Math.floor((budget - 2) / 2);
	return {
		added,
		removed,
		lines: [context, ...[
			...body.slice(0, side),
			`… 省略 ${body.length - side * 2} 行 …`,
			...body.slice(body.length - side)
		]],
		note: "diff-truncated"
	};
}
/** Clamp one diff line to the transport budget. */
function clampLine(line) {
	const normalized = line.replace(/\r$/, "");
	return normalized.length <= 200 ? normalized : `${normalized.slice(0, 200)}…`;
}
/**
* UTF-8 byte length of a string, without `Buffer`.
*
* This module is bundled into the browser half, where `Buffer` does not exist: a
* `Buffer.byteLength` call here is a `ReferenceError` in the page the moment
* `diffable` runs client-side, and it is also the reason the file used to be
* host-only. Scanning code points performs the same arithmetic `Buffer` does —
* 1/2/3/4 bytes by range, a lone surrogate counted as its 3-byte replacement —
* so the cap means the same thing on both sides.
* @param text - the string to measure.
* @returns its length in UTF-8 bytes.
*/
function utf8Bytes(text) {
	let bytes = 0;
	for (const char of text) {
		const point = char.codePointAt(0) ?? 0;
		bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
	}
	return bytes;
}
/** Whether a change is worth diffing at all. */
function diffable(before, after) {
	if (before === null || after === null) return false;
	if (before === after) return false;
	if (before.includes("\0") || after.includes("\0")) return false;
	return utf8Bytes(before) <= 262144 && utf8Bytes(after) <= 262144;
}
/**
* Render one entry as its text block.
* @param entry - the entry to render.
* @returns the lines of the block, without a trailing newline.
*/
function renderEntry(entry) {
	const stats = entry.added === void 0 || entry.removed === void 0 ? "" : `  (+${entry.added}/-${entry.removed})`;
	const lines = [`  ${tagOf(entry.action)} ${entry.path}${stats}`];
	if (entry.note !== void 0) lines.push(`    (${entry.note})`);
	for (const line of entry.diff ?? []) lines.push(`    ${line}`);
	return lines;
}
//#endregion
//#region src/core/literal-edit.ts
/** How much of the file decides the dominant line-ending style. */
const LINE_ENDING_SAMPLE_BYTES = 4096;
/**
* Collapse CRLF to LF — the canonical in-memory form every edit and diff basis
* uses. Lone `\r` bytes (not followed by `\n`) are left untouched.
* @param content - decoded text in whatever style the file had.
* @returns the text with every `\r\n` pair replaced by `\n`.
*/
function normalizeLineEndings(content) {
	return content.replaceAll("\r\n", "\n");
}
/**
* Detect the dominant line-ending style from the head of the file, so a write-back
* can restore it.
* @param raw - decoded text as read.
* @returns `CRLF` when it outnumbers bare LF, else `LF`.
*/
function detectLineEndings(raw) {
	const sample = raw.slice(0, LINE_ENDING_SAMPLE_BYTES);
	const crlfCount = sample.split("\r\n").length - 1;
	return crlfCount > sample.split("\n").length - 1 - crlfCount ? "CRLF" : "LF";
}
/**
* Convert normalized content back to the style detected at read time.
* @param content - the normalized (edited) text.
* @param lineEndings - the original file's style.
* @returns the text in the original file's line-ending style.
*/
function restoreLineEndings(content, lineEndings) {
	return lineEndings === "LF" ? content : normalizeLineEndings(content).split("\n").join("\r\n");
}
/**
* Count occurrences of a needle, scanning forward past each match (the provider's
* counting rule, which never counts overlapping matches).
* @param content - haystack.
* @param needle - non-empty needle.
* @returns the number of occurrences.
*/
function countOccurrences(content, needle) {
	let count = 0;
	let index = 0;
	while (true) {
		const found = content.indexOf(needle, index);
		if (found === -1) return count;
		count += 1;
		index = found + needle.length;
	}
}
/**
* Apply one literal replacement, reproducing the provider's checks and wording.
* @param content - current content, already line-ending normalized.
* @param oldString - literal text to find; CRLF inside it is normalized first.
* @param newString - literal replacement; normalized the same way.
* @param replaceAll - replace every match instead of requiring exactly one.
* @param displayPath - caller-facing path used in the failure messages.
* @returns the edited content, or the failure to raise.
*/
function applyLiteralEdit(content, oldString, newString, replaceAll, displayPath) {
	const oldNorm = normalizeLineEndings(oldString);
	if (oldNorm.length === 0) return {
		ok: false,
		code: "FS_EDIT_NOT_FOUND",
		message: "old_string must be a non-empty string"
	};
	const newNorm = normalizeLineEndings(newString);
	const replacements = countOccurrences(content, oldNorm);
	if (replacements === 0) return {
		ok: false,
		code: "FS_EDIT_NOT_FOUND",
		message: `old_string was not found in "${displayPath}"`
	};
	if (!replaceAll && replacements > 1) return {
		ok: false,
		code: "FS_AMBIGUOUS_EDIT",
		message: `old_string matched ${replacements} times in "${displayPath}"; provide a more specific old_string or set replace_all to true`
	};
	return {
		ok: true,
		content: content.split(oldNorm).join(newNorm),
		replacements
	};
}
//#endregion
//#region src/core/root-write.ts
/** A Windows drive root WITH its trailing separator: `E:\` or `E:/`. */
const DRIVE_ROOT = /^[A-Za-z]:[\\/]$/;
/** A `mkdir '<drive root>'` mention, for errors that arrive without the fields. */
const DRIVE_ROOT_MKDIR = /mkdir\s+['"]?[A-Za-z]:[\\/]['"]?/;
/**
* Whether an error is exactly the drive-root mkdir failure this fallback exists
* for — and nothing else.
*
* The check is deliberately narrow: a broader match would let an unrelated EPERM
* (a real permission denial, a locked file) take the fallback path, which is the
* one outcome this design must never produce.
* @param error - the value thrown by the wrapped `writeText`.
* @returns true only for `EPERM` from a `mkdir` of a drive root.
*/
function isRootMkdirEperm(error) {
	if (error === null || typeof error !== "object") return false;
	const shape = error;
	if (shape.code !== "EPERM") return false;
	if (typeof shape.path === "string") {
		if (!DRIVE_ROOT.test(shape.path)) return false;
		return shape.syscall === void 0 || shape.syscall === "mkdir";
	}
	return typeof shape.message === "string" && DRIVE_ROOT_MKDIR.test(shape.message);
}
/**
* Whether the sandbox policy would have allowed this write.
*
* The fallback only ever runs after the provider already threw the drive-root
* mkdir EPERM, and in the current implementation that means the sandbox's
* containment check PASSED first: `SandboxedFileSystem.writeText` awaits
* `checkedTarget(target, sandboxPolicy)` before delegating to the writer that
* performs the mkdir. So on its own, observing the failure proves permission.
*
* This check keeps that conclusion true even if the order ever changes: it
* re-derives permission from the policy the TOOL stamped on the call, and fails
* CLOSED whenever a confined target cannot be proven to sit inside the workspace
* root. It is not a reimplementation of the sandbox's path identity rules — a
* drive-root target can only be inside a workspace whose root IS that volume, so
* lexical containment answers exactly the question asked here.
* @param mode - the effective sandbox mode, or undefined when nothing confines.
* @param workspaceRoot - the writable root the policy carries, when it has one.
* @param targetPath - the host path the write is aimed at.
* @returns whether taking the fallback stays within what the policy allows.
*/
function rootWriteAllowed(mode, workspaceRoot, targetPath) {
	if (mode === void 0 || mode === "danger-full-access") return true;
	if (mode === "read-only") return false;
	if (typeof workspaceRoot !== "string" || workspaceRoot === "") return false;
	return isWithin(targetPath, workspaceRoot);
}
/**
* Lexical containment for the Windows paths this fallback can see, erring toward
* refusal: separators are unified, the comparison is case-insensitive (Windows
* drive letters and names are), and a trailing separator never changes the answer.
* @param path - candidate host path.
* @param root - the writable root to test against.
* @returns whether `path` is `root` itself or sits beneath it.
*/
function isWithin(path, root) {
	const candidate = normalizeRootPath(path);
	const boundary = normalizeRootPath(root);
	if (candidate === boundary) return true;
	return candidate.startsWith(`${boundary}/`);
}
/** Unify separators, drop a trailing separator, and case-fold for comparison. */
function normalizeRootPath(path) {
	let out = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
	if (out.length > 1 && out.endsWith("/")) out = out.replace(/\/+$/, "");
	return out.toLowerCase();
}
/**
* A sibling temp path for the atomic replace: same directory (so `rename` stays
* within one volume and therefore atomic), dot-prefixed, and impossible to
* confuse with the destination.
* @param targetPath - host path of the intended destination.
* @param unique - caller-supplied uniquifier (pid + time + randomness).
* @returns the host path to stage the bytes at before renaming.
*/
function rootWriteTempPath(targetPath, unique) {
	const separator = Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\"));
	return `${separator === -1 ? "" : targetPath.slice(0, separator + 1)}.${separator === -1 ? targetPath : targetPath.slice(separator + 1)}.${unique}.rbk-tmp`;
}
//#endregion
//#region src/root-write-fallback.ts
/**
* Root-directory write fallback for the `write` tool.
*
* On Windows, `write` fails for any file directly under a drive root: the provider
* pre-creates the parent directory, `dirname('E:\\file.txt')` is `'E:\\'` with its
* trailing separator, and Windows answers a `mkdir` on a volume root with EPERM.
* The model then abandons `write` and reaches for the shell — where this plugin
* cannot see the change and therefore cannot roll it back.
*
* `ctx.fs.writeText` is wrapped so the ORIGINAL implementation always runs first
* and, on exactly that failure, the bytes are staged and renamed in place WITHOUT
* the mkdir preflight. Every other outcome is untouched, which is what keeps this
* safe to ship:
*
* - normal writes take the original path and behave identically;
* - any other error propagates unchanged (see `isRootMkdirEperm`);
* - a target the policy would not have permitted is refused (see
*   `rootWriteAllowed`);
* - if the provider ever stops pre-creating the directory, the original succeeds
*   and this code becomes unreachable — it retires itself.
*
* Only the byte landing changes: the write tool still builds its own result from
* the outcome returned here, so the plugin's existing capture (which reads
* `before`/`after` off the tool result) keeps working unchanged. The plugin's own
* rollback restore calls the same wrapped method, so restoring a file at a drive
* root is fixed by the same code.
*
* @module @nianchu/dsh-rollback/root-write-fallback
*/
/**
* Prior content read for the outcome's diff basis is capped: a drive-root file is
* unlikely to be enormous, and the provider itself refuses to read an unbounded
* file for a diff (returning `before: null`, which this plugin reports honestly as
* unrestorable rather than restoring a guess).
*/
const BEFORE_LIMIT_BYTES = 8388608;
/**
* Install the fallback on this deployment's fs service.
*
* Both mutations are wrapped, because both reach the same preflight: `write`
* creates a file directly under a drive root and `edit` changes one that is
* already there, and either one sends the model to the shell instead.
*
* Safe to call more than once: the service carries the marker.
* @param ctx - context carrying `fs` (and `sandboxPolicy` under a confined backend).
*/
function installRootWriteFallback(ctx) {
	const fs = ctx.fs;
	if (fs.__rollbackWriteWrapped === true) return;
	if (typeof fs.writeText === "function") {
		const originalWrite = fs.writeText.bind(fs);
		fs.writeText = async (target, content, expected, signal, sandboxPolicy) => {
			try {
				return await originalWrite(target, content, expected, signal, sandboxPolicy);
			} catch (error) {
				if (!isRootMkdirEperm(error)) throw error;
				if (!permitted(ctx, sandboxPolicy, fs, target)) throw error;
				return await writeAtDriveRoot(ctx, fs, target, content, expected, signal, error);
			}
		};
	}
	if (typeof fs.editText === "function") {
		const originalEdit = fs.editText.bind(fs);
		fs.editText = async (target, edit, expected, signal, sandboxPolicy) => {
			try {
				return await originalEdit(target, edit, expected, signal, sandboxPolicy);
			} catch (error) {
				if (!isRootMkdirEperm(error)) throw error;
				if (!permitted(ctx, sandboxPolicy, fs, target)) throw error;
				return await editAtDriveRoot(ctx, fs, target, edit, expected, signal, error);
			}
		};
	}
	fs.__rollbackWriteWrapped = true;
}
/**
* Whether the policy that governed this call allows the fallback to proceed.
*
* The per-call policy is the tool's own; without one (a caller that let the
* provider resolve its default) the deployment default is resolved here, which is
* exactly what the sandbox's own containment check does in that case. A deployment
* with no confining backend at all has no sandbox policy service, and nothing to
* bypass.
* @param ctx - context for the optional `sandboxPolicy` service.
* @param sandboxPolicy - the per-call policy, when the caller supplied one.
* @param fs - the fs service (for the target's host path).
* @param target - the resolved target being written.
* @returns whether the write is within what the policy permits.
*/
function permitted(ctx, sandboxPolicy, fs, target) {
	const hostPath = fs.processPath(target);
	const perCall = sandboxPolicy;
	if (perCall?.mode !== void 0) return rootWriteAllowed(perCall.mode, perCall.workspaceRoot, hostPath);
	const service = ctx.get?.("sandboxPolicy");
	if (service === void 0) return true;
	const resolved = service.resolve?.();
	if (resolved?.mode === void 0) return false;
	return rootWriteAllowed(resolved.mode, resolved.workspaceRoot, hostPath);
}
/**
* Land the bytes without the parent-directory preflight.
*
* Staging in the destination's own directory keeps the replace on one volume and
* therefore atomic, and the two guarded-mutation preconditions the provider
* enforces are reproduced here so the fallback cannot write something the original
* would have refused.
* @param ctx - context for logging.
* @param fs - the fs service.
* @param target - the resolved target.
* @param content - the text to write.
* @param expected - the tool's write intent, when it stamped one.
* @param signal - caller cancellation.
* @param cause - the drive-root mkdir failure being compensated for.
* @returns the outcome the caller would have received from the original path.
*/
async function writeAtDriveRoot(ctx, fs, target, content, expected, signal, cause) {
	const hostPath = fs.processPath(target);
	const display = displayPathOf(target, hostPath);
	signal?.throwIfAborted();
	const existing = await fs.stat(target, signal);
	if (existing !== void 0 && existing.type !== void 0 && existing.type !== "file") throw failure("FS_NOT_REGULAR_FILE", `cannot write "${display}": not a regular file`, cause, "write to a regular file instead");
	const intent = expected;
	if (intent?.kind === "replaceIfVersion") {
		if (existing === void 0) throw failure("FS_STALE_VERSION", `cannot write "${display}": file no longer exists`, cause, "re-read the file, then retry");
		if (existing.version !== intent.version) throw failure("FS_STALE_VERSION", `cannot write "${display}": file changed since it was read`, cause, "re-read the file, then retry");
	} else if (intent?.kind === "createIfAbsent" && existing !== void 0) throw failure("FS_NOT_OBSERVED", `cannot overwrite existing "${display}" without reading it first`, cause, "read the file, then retry");
	const before = await readPriorText(fs, target, content, signal);
	await landBytes(hostPath, content, existing !== void 0, signal);
	const after = await fs.stat(target, signal);
	ctx.logger?.info?.(`[nianchu-rollback] wrote "${display}" past the drive-root mkdir failure`);
	return {
		operation: existing === void 0 ? "create" : "update",
		version: after?.version ?? `missing:${hostPath}`,
		before,
		after: normalizeLineEndings(content)
	};
}
/**
* Land an edit's bytes the way the provider would have.
*
* The literal match, the line endings and the failure codes are the provider's own
* (see `src/core/literal-edit.ts`); only the publication differs, by staging beside
* the destination instead of pre-creating its parent directory.
* @param ctx - context for logging.
* @param fs - the fs service.
* @param target - the resolved target.
* @param edit - the literal search/replace request.
* @param expected - the version guard, when the tool stamped one.
* @param signal - caller cancellation.
* @param cause - the drive-root mkdir failure being compensated for.
* @returns the outcome the caller would have received from the original path.
*/
async function editAtDriveRoot(ctx, fs, target, edit, expected, signal, cause) {
	const hostPath = fs.processPath(target);
	const display = displayPathOf(target, hostPath);
	signal?.throwIfAborted();
	const existing = await fs.stat(target, signal);
	if (existing === void 0) throw failure("FS_STALE_VERSION", `cannot edit "${display}": file changed since it was read`, cause, "re-read the file, then retry");
	if (existing.type !== void 0 && existing.type !== "file") throw failure("FS_NOT_REGULAR_FILE", `cannot edit "${display}": not a regular file`, cause);
	const guard = expected;
	if (guard?.version !== void 0 && existing.version !== guard.version) throw failure("FS_STALE_VERSION", `cannot edit "${display}": file changed since it was read`, cause, "re-read the file, then retry");
	const original = await readForEditAt(hostPath, display, signal);
	const request = edit ?? {};
	const applied = applyLiteralEdit(original.content, typeof request.oldString === "string" ? request.oldString : "", typeof request.newString === "string" ? request.newString : "", request.replaceAll === true, display);
	if (!applied.ok) throw failure(applied.code, applied.message, cause);
	await landBytes(hostPath, restoreLineEndings(applied.content, original.lineEndings), true, signal);
	const after = await fs.stat(target, signal);
	ctx.logger?.info?.(`[nianchu-rollback] edited "${display}" past the drive-root mkdir failure`);
	return {
		version: after?.version ?? `missing:${hostPath}`,
		before: original.content,
		after: applied.content
	};
}
/**
* Stage `content` beside the destination and rename it into place — the same
* atomic replace the provider performs, minus the parent-directory preflight.
*
* On Windows this cannot carry a destination's explicitly modified ACL the way the
* provider's Win32 copy does; an inherited ACL (the ordinary case, since the staged
* file is created in the same directory) is identical either way. The POSIX mode is
* preserved explicitly.
* @param hostPath - destination host path.
* @param content - text to publish.
* @param replacing - whether a file already exists there.
* @param signal - caller cancellation.
*/
async function landBytes(hostPath, content, replacing, signal) {
	const tempPath = rootWriteTempPath(hostPath, `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
	let handle;
	try {
		handle = await open(tempPath, "wx");
		await handle.writeFile(content, "utf8");
		if (replacing) {
			const mode = await stat(hostPath).then((info) => info.mode & 4095).catch(() => void 0);
			if (mode !== void 0) await handle.chmod(mode);
		}
		await handle.sync();
		await handle.close();
		handle = void 0;
		signal?.throwIfAborted();
		await rename(tempPath, hostPath);
	} catch (error) {
		try {
			await handle?.close();
		} catch {}
		try {
			await unlink(tempPath);
		} catch {}
		throw error;
	}
}
/**
* Read a file for editing the way the provider does: reject binaries and invalid
* UTF-8, and return normalized content plus the style to restore on write-back.
* @param hostPath - file to read.
* @param display - caller-facing path used in failures.
* @param signal - caller cancellation.
* @returns normalized content and the detected line-ending style.
*/
async function readForEditAt(hostPath, display, signal) {
	const buffer = await readFile(hostPath, signal === void 0 ? {} : { signal });
	signal?.throwIfAborted();
	if (buffer.includes(0)) throw failure("FS_NOT_TEXT", `cannot edit "${display}": binary file`, void 0);
	let raw;
	try {
		raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
	} catch {
		throw failure("FS_NOT_TEXT", `cannot edit "${display}": invalid UTF-8 text`, void 0);
	}
	return {
		content: normalizeLineEndings(raw),
		lineEndings: detectLineEndings(raw)
	};
}
/**
* The prior text for the outcome's diff basis, or null when it is not worth (or
* not safe) to carry. Line endings are normalized exactly as the provider does, so
* the fallback's outcome is indistinguishable from the original path's.
* @param fs - the fs service.
* @param target - the resolved target.
* @param content - the text about to be written.
* @param signal - caller cancellation.
* @returns the normalized prior text, or null.
*/
async function readPriorText(fs, target, content, signal) {
	if (Buffer.byteLength(content, "utf8") >= BEFORE_LIMIT_BYTES) return null;
	try {
		const prior = await fs.readText(target, signal);
		return Buffer.byteLength(prior, "utf8") >= BEFORE_LIMIT_BYTES ? null : normalizeLineEndings(prior);
	} catch {
		return null;
	}
}
/** The display path the provider would name in a message. */
function displayPathOf(target, fallback) {
	const display = target?.displayPath;
	return typeof display === "string" && display !== "" ? display : fallback;
}
/**
* A guarded-mutation failure in the provider's shape.
*
* The code is preserved because retry and permission layers route on it; the
* recovery instruction is baked into the message because the tool layer only
* appends one to its own `FsError` instances, which this plugin cannot construct
* without taking a runtime dependency on the harness. Only the codes that layer
* treats as remediable carry one, matching its behaviour exactly.
* @param code - the provider's error code.
* @param message - the provider's condition message.
* @param cause - the drive-root mkdir failure being compensated for, when there is one.
* @param remedy - the recovery instruction the tool layer would have appended.
* @returns the error to throw.
*/
function failure(code, message, cause, remedy) {
	const error = new Error(remedy === void 0 ? message : `${message} — ${remedy}`, { cause });
	error.code = code;
	return error;
}
//#endregion
//#region src/core/model.ts
/** A turn checkpoint with no file changes and no surface events yet. */
function emptyCheckpoint(turn) {
	return {
		turn,
		startSeq: null,
		endSeq: null,
		changes: {}
	};
}
//#endregion
//#region src/core/capture.ts
/**
* Apply a surface position to a checkpoint. Recorded once per turn: the first
* surface event fixes `startSeq`, every surface event advances `endSeq`.
* @param cp - the checkpoint to advance.
* @param surfaceSeq - absolute seq of the surface event, or null if none.
*/
function surfacePos(cp, surfaceSeq) {
	if (surfaceSeq === null) return cp;
	return {
		...cp,
		startSeq: cp.startSeq === null ? surfaceSeq : cp.startSeq,
		endSeq: surfaceSeq
	};
}
/**
* Fold one fs mutation into the checkpoint. The FIRST mutation of a path
* records its `before` (the pre-turn content); later mutations within the
* same turn only advance `after`, so the checkpoint always restores to the
* pre-turn state.
*/
function recordChange(cp, mutation) {
	const existing = cp.changes[mutation.path];
	if (existing === void 0) {
		const kind = mutation.operation === "create" ? "created" : mutation.operation === "remove" ? "removed" : "updated";
		const change = {
			path: mutation.path,
			kind,
			before: mutation.before,
			after: mutation.after,
			basisKnown: mutation.before !== null || mutation.operation === "create"
		};
		return {
			...cp,
			changes: {
				...cp.changes,
				[mutation.path]: change
			}
		};
	}
	const merged = {
		...existing,
		after: mutation.after
	};
	return {
		...cp,
		changes: {
			...cp.changes,
			[mutation.path]: merged
		}
	};
}
//#endregion
//#region src/core/sliding-window.ts
/**
* Sliding-window checkpoint store. The tutorial's "仅最近 10 轮" limit is a
* rolling window: older checkpoints are dropped to bound memory.
*
* Pure, dependency-free, and independent of any per-session keying — the host
* plugin owns one instance per live session.
*
* @module @nianchu/dsh-rollback/core/sliding-window
*/
var SlidingWindow = class {
	items = [];
	/**
	* Declared and assigned explicitly rather than as a constructor parameter
	* property: this module is executed directly by tooling that strips types
	* without transforming them (Node's type stripping), and a parameter property
	* is a transformation, not a type, so it would fail to load there.
	*/
	capacity;
	constructor(capacity) {
		if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("SlidingWindow capacity must be a positive safe integer");
		this.capacity = capacity;
	}
	/** Append one item, evicting the oldest when over capacity. */
	push(item) {
		this.items.push(item);
		if (this.items.length > this.capacity) this.items.shift();
	}
	/** A fresh copy of the retained items, oldest first. */
	snapshot() {
		return [...this.items];
	}
	/** Number of retained items. */
	size() {
		return this.items.length;
	}
	/** Drop everything (HMR / session disposal safety). */
	clear() {
		this.items = [];
	}
};
//#endregion
//#region src/core/session-fold.ts
/**
* Session fold: consume ordered lifecycle descriptors (turn boundaries +
* surface positions + fs mutations) and maintain per-turn checkpoints in a
* sliding window plus the current surface tail.
*
* Pure and dependency-free — the host plugin feeds it translated session
* events, but the folding logic unit-tests in isolation.
*
* @module @nianchu/dsh-rollback/core/session-fold
*/
/**
* Extract an {@link FsMutation} from a `write`/`edit` tool's canonical value,
* or return null when the name/value pair is not a tracked mutation.
*
* `write` returns `{ path, operation, before, after }`; `edit` returns
* `{ path, before, after }` (operation is implicitly `update`).
*/
function fsMutationFrom(toolName, value) {
	if (!["write", "edit"].includes(toolName)) return null;
	if (value === null || typeof value !== "object") return null;
	const v = value;
	if (typeof v["path"] !== "string") return null;
	if (typeof v["after"] !== "string") return null;
	const before = v["before"];
	if (before !== null && typeof before !== "string") return null;
	const operation = v["operation"] === "create" ? "create" : "update";
	return {
		path: v["path"],
		operation,
		before,
		after: v["after"]
	};
}
/**
* Maintains the retained per-turn checkpoints for one session.
*
* Checkpoints are pushed on `turn-end` (the tutorial's per-turn checkpoint
* boundary) into a sliding window; the current in-flight turn is a pending
* checkpoint the fold mutates as surface events and fs mutations arrive.
*/
var SessionFold = class {
	checkpoints;
	current = null;
	tail = null;
	/** Explicit field, not a constructor parameter property — see SlidingWindow. */
	capacity;
	constructor(capacity = 10) {
		this.capacity = capacity;
		this.checkpoints = new SlidingWindow(capacity);
	}
	/** Feed one ordered descriptor. */
	fold(event) {
		switch (event.kind) {
			case "turn-start":
				this.closeCurrent();
				this.current = emptyCheckpoint(event.turn);
				break;
			case "turn-end":
				this.closeCurrent();
				break;
			case "surface":
				this.tail = event.seq;
				if (this.current !== null) this.current = surfacePos(this.current, event.seq);
				break;
			case "fs-mutation": if (this.current !== null) this.current = recordChange(this.current, event.mutation);
		}
	}
	closeCurrent() {
		const done = this.current;
		this.current = null;
		if (done === null) return;
		if (done.startSeq === null && Object.keys(done.changes).length === 0) return;
		this.checkpoints.push(done);
	}
	/** The currently-open turn number, or null between turns. */
	inProgressTurn() {
		return this.current === null ? null : this.current.turn;
	}
	/**
	* Record one fs mutation against a SPECIFIC turn, open or already closed.
	*
	* The boundary re-scan reads the filesystem asynchronously, so the turn it anchors
	* to can close while it waits — and folding then would drop the mutation, losing
	* exactly the change the re-scan exists to catch. A turn that already left the
	* retained window cannot take the change; the caller is told so.
	* @param turn - the turn the mutation belongs to.
	* @param mutation - the change to record.
	* @returns whether the mutation found a home.
	*/
	mutationInto(turn, mutation) {
		if (this.current !== null && this.current.turn === turn) {
			this.current = recordChange(this.current, mutation);
			return true;
		}
		const retained = this.checkpoints.snapshot();
		const index = retained.findIndex((checkpoint) => checkpoint.turn === turn);
		if (index === -1) return false;
		const merged = recordChange(retained[index], mutation);
		const rebuilt = [
			...retained.slice(0, index),
			merged,
			...retained.slice(index + 1)
		];
		this.checkpoints.clear();
		for (const checkpoint of rebuilt) this.checkpoints.push(checkpoint);
		return true;
	}
	/** Retained checkpoints, oldest first (ascending turn). */
	snapshots() {
		return this.checkpoints.snapshot();
	}
	/** Current tail seq of the model-visible surface, or null when empty. */
	surfaceTail() {
		return this.tail;
	}
	/**
	* After a successful rollback to before `fromTurn`, drop every retained
	* checkpoint with `turn >= fromTurn` (their file changes have been undone)
	* while keeping earlier checkpoints intact.
	*/
	dropFrom(fromTurn) {
		this.replaceWindow(fromTurn, null);
	}
	/**
	* Drop the undone checkpoints EXCEPT the entries for paths that could not be undone.
	*
	* A rollback that had to skip a file — its pre-turn content was never recorded, or
	* the filesystem refused the write — still truncates the conversation and reports
	* the skip. If the records describing that file were dropped with everything else,
	* the file would leave rollback coverage for good. Keeping just those entries lets a
	* later rollback try again, which is the difference between "a file lock cost you
	* one restore" and "a file lock cost you the file".
	* @param fromTurn - the turn the rollback targeted.
	* @param keepPaths - paths whose changes were NOT undone.
	*/
	dropFromExcept(fromTurn, keepPaths) {
		this.replaceWindow(fromTurn, keepPaths);
	}
	/** Rebuild the retained window, optionally keeping only the named paths' changes. */
	replaceWindow(fromTurn, keepPaths) {
		const kept = [];
		for (const checkpoint of this.checkpoints.snapshot()) {
			if (checkpoint.turn < fromTurn) {
				kept.push(checkpoint);
				continue;
			}
			if (keepPaths === null) continue;
			const changes = {};
			for (const [path, change] of Object.entries(checkpoint.changes)) if (keepPaths.has(path)) changes[path] = change;
			if (Object.keys(changes).length > 0) kept.push({
				...checkpoint,
				changes
			});
		}
		this.checkpoints.clear();
		for (const checkpoint of kept) this.checkpoints.push(checkpoint);
		this.current = null;
	}
	/** Repoint the surface tail (the truncation replace rewrites the tail). */
	setTail(seq) {
		this.tail = seq;
	}
	/** Drop retained state (HMR / session disposal safety). */
	clear() {
		this.current = null;
		this.tail = null;
		this.checkpoints.clear();
	}
};
//#endregion
//#region src/core/restore-plan.ts
/**
* Compute a rollback plan.
*
* The "before" of a file touched across several turns is its content before
* the FIRST touch in the window: restoring to any target turn only ever needs
* that earliest original content, and a file created inside the window is
* deleted outright.
*
* @param checkpoints - retained per-turn checkpoints, ascending by turn.
* @param fromTurn - restore the state before this turn (removes it and later).
* @param lastSurfaceSeq - current tail seq of the model-visible surface, or
*   null when the surface is empty.
*/
function planRollback(checkpoints, fromTurn, lastSurfaceSeq) {
	const window = checkpoints.filter((cp) => cp.turn >= fromTurn);
	window.sort((a, b) => a.turn - b.turn);
	const firstTouch = /* @__PURE__ */ new Map();
	for (const cp of window) for (const change of Object.values(cp.changes)) if (!firstTouch.has(change.path)) firstTouch.set(change.path, change);
	const restored = [];
	const skipped = [];
	for (const change of firstTouch.values()) if (change.kind === "created") restored.push({
		path: change.path,
		action: "delete",
		content: null,
		kind: "created",
		after: change.after
	});
	else if (change.basisKnown && change.before !== null) restored.push({
		path: change.path,
		action: change.kind === "removed" ? "recover" : "restore",
		content: change.before,
		kind: change.kind,
		after: change.after
	});
	else skipped.push({
		path: change.path,
		reason: "basis-unknown"
	});
	const start = window.length > 0 ? window[0].startSeq : null;
	return {
		fromTurn,
		restored,
		skipped,
		truncation: start !== null && lastSurfaceSeq !== null && lastSurfaceSeq >= start ? {
			start,
			end: lastSurfaceSeq
		} : null
	};
}
//#endregion
//#region src/core/dir-cleanup.ts
/**
* The epoch ms at which `turn` opened, or undefined when the log does not say.
*
* The LAST matching `turn/start` wins, matching how the turn boundary itself is
* resolved (`turnStartSeqFor`): a session damaged by an older plugin build can hold
* two starts under one number, and the real turn is the later one.
* @param events - the session log, structurally.
* @param turn - the 1-based turn number.
* @returns the opening time in epoch ms, or undefined.
*/
function turnStartTimeMs(events, turn) {
	let found;
	for (const event of events) {
		if (event.type !== "turn/start") continue;
		if (event.data?.turn !== turn) continue;
		if (typeof event.time === "number" && Number.isFinite(event.time)) found = event.time;
	}
	return found;
}
/**
* The parent directory of a path, or null at a filesystem root.
*
* A Windows drive root is returned WITH its separator (`E:\`), so the walk can
* reach it and then stop: nothing above it belongs to the workspace.
* @param path - absolute path, file or directory.
* @returns the parent directory, or null when there is none.
*/
function parentDirOf(path) {
	const trimmed = path.replace(/[\\/]+$/, "");
	const separator = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
	if (separator < 0) return null;
	const parent = trimmed.slice(0, separator);
	if (parent === "") return trimmed.startsWith("/") ? "/" : null;
	if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
	return parent;
}
/** How deeply nested a path is, for removal ordering. */
function depthOf(path) {
	return path.split(/[\\/]/).length;
}
/**
* The comparison key for a path: Windows-style paths are case-insensitive, POSIX
* paths are not.
* @param path - absolute path.
* @returns the key used to dedupe planned directories.
*/
function keyOf(path) {
	return path.includes("\\") ? path.toLowerCase() : path;
}
/** One entry's absolute path, using the separator style of its directory. */
function joinEntry(directory, name) {
	return `${directory}${directory.endsWith("\\") || directory.endsWith("/") ? directory.slice(-1) : directory.includes("\\") ? "\\" : "/"}${name}`;
}
/**
* The directories a rollback may remove, deepest first.
*
* Starts from each deleted file's parent and climbs while a directory was created at
* or after the rollback point and holds nothing that will still be there once this
* plan runs. The first directory that fails either test ends that chain, because it
* — and therefore everything above it — either predates the span or keeps content.
* @param deletedPaths - host paths of the files this rollback deleted.
* @param spanStartMs - epoch ms at which the rolled-back turn opened.
* @param probe - the filesystem probe.
* @param neverRemove - a path this pass must leave alone even if it looks removable
*   (the session workspace root: it predates every turn, so removing it would mean
*   the rule misfired, and the consequences would not be recoverable).
* @returns absolute directory paths, deepest first, without duplicates.
*/
async function planEmptyDirCleanup(deletedPaths, spanStartMs, probe, neverRemove) {
	const protectedKey = neverRemove === void 0 ? void 0 : keyOf(neverRemove);
	const planned = /* @__PURE__ */ new Map();
	const everPlanned = /* @__PURE__ */ new Set();
	for (const file of deletedPaths) {
		let directory = parentDirOf(file);
		while (directory !== null) {
			const key = keyOf(directory);
			if (key === protectedKey) break;
			if (everPlanned.has(key)) {
				directory = parentDirOf(directory);
				continue;
			}
			everPlanned.add(key);
			const current = directory;
			const created = await probe.birthtimeMs(current);
			if (created === void 0 || created < spanStartMs) break;
			const entries = await probe.entries(current);
			if (entries === null) break;
			if (entries.some((name) => !planned.has(keyOf(joinEntry(current, name))))) break;
			planned.set(key, current);
			directory = parentDirOf(current);
		}
	}
	return [...planned.values()].sort((a, b) => depthOf(b) - depthOf(a) || (a < b ? -1 : a > b ? 1 : 0));
}
//#endregion
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
* Provenance stamped on the marker: a producer-owned source kind.
*
* No `plugin` field, because v4 forbids the `kind: 'plugin'` shape this used to
* use and the migration drops that field when it rewrites one.
*/
const ROLLBACK_MARKER_SOURCE = { kind: ROLLBACK_MARKER_KIND };
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
//#region src/core/log-replay.ts
/**
* What a log replay must ignore.
*
* The session log is append-only, so a rollback does not remove the turns it undid:
* it appends a `user/message` carrying a surface `replace` over their range. Replaying
* the raw log therefore walks straight through history the user already rolled back —
* every one of those turns re-enters the checkpoint window, `/rollback list` offers
* turns the transcript no longer shows, plans name files from rolled-back turns, and a
* "created file" recorded there can make a later rollback DELETE a file the user has
* since recreated. Measured on a real session: 25 turns in the log, 19 rollback
* markers, and 18 of those turns sitting inside a replaced range.
*
* So a replay first collects the ranges some rollback replaced and then skips every
* event inside them. Pure and DSH-free, because the rule deserves a test.
*
* @module @nianchu/dsh-rollback/core/log-replay
*/
/**
* The inclusive range one marker's surface op declares, whichever way it is spelled.
*
* DSH 0.1.5 renamed the two ends: `SurfaceOp` is now
* `{ op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }` and the validator
* demands exactly those three keys, where <=0.1.1 used `start`/`end`. Both are
* read because the log outlives the build that wrote it — the same session file
* holds markers written before the upgrade and after it, and a marker whose range
* goes unread is precisely the bug this module exists to prevent: its turns come
* back as phantoms, offering turns the transcript no longer shows and letting a
* "created file" recorded there delete a file the user has since recreated.
* Neither pair is trusted blindly; each is validated as a real seq.
* @param op - the event's `surfaceOp`, as the log carries it.
* @returns the range, or null when the op is not a readable positional replace.
*/
function replacedRangeOf(op) {
	if (op === null || typeof op !== "object") return null;
	const candidate = op;
	if (candidate.op !== "replace") return null;
	const [start, end] = "startSeq" in candidate ? [candidate.startSeq, candidate.endSeq] : [candidate.start, candidate.end];
	if (typeof start !== "number" || typeof end !== "number") return null;
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < 0) return null;
	return {
		start,
		end
	};
}
/**
* The surface ranges rollbacks replaced, from the log's own markers.
*
* Overlapping and nested markers are expected — rolling back twice over the same span
* re-replaces it — so the ranges are returned as-is and membership is tested against
* all of them.
* @param events - the session log, in any order.
* @returns the replaced ranges.
*/
function replacedSurfaceRanges(events) {
	const ranges = [];
	for (const event of events) {
		if (event.type !== "user/message") continue;
		const source = event.data?.source;
		if (!isRollbackMarkerSource(source)) continue;
		const range = replacedRangeOf(event.surfaceOp);
		if (range === null) continue;
		ranges.push(range);
	}
	return ranges;
}
/**
* Whether an event's seq belongs to history a rollback already replaced.
* @param seq - the event's seq.
* @param ranges - the replaced ranges.
* @returns true when the event must not be replayed.
*/
function isReplacedSeq(seq, ranges) {
	return ranges.some((range) => seq >= range.start && seq <= range.end);
}
/**
* The turn numbers a rollback already removed.
*
* A turn whose `turn/start` sits inside a replaced range is gone: its history is not in
* the model's context and, more importantly, its FILE changes were undone. Nothing
* about it may be resurrected — not its checkpoints, and not its paths.
*
* That last part is why this exists. The boundary re-scan keeps re-checking the paths
* the file tools once touched, and it learned about them from the durable sidecar,
* which still holds records for turns a rollback removed. Watching those paths means
* noticing that their files are missing — because the rollback correctly deleted them —
* and recording that as a change of the CURRENT turn, so the next rollback "brings
* back" files an earlier rollback had already removed. Measured on a real session: six
* Desktop files deleted at turn 26 and again at turn 28 for exactly this reason, and
* then restored by a later rollback.
* @param events - the session log, in any order.
* @returns the turn numbers that no longer exist.
*/
function deadTurnsOf(events) {
	const ranges = replacedSurfaceRanges(events);
	const dead = /* @__PURE__ */ new Set();
	if (ranges.length === 0) return dead;
	for (const event of events) {
		if (event.type !== "turn/start") continue;
		if (!isReplacedSeq(event.seq, ranges)) continue;
		const turn = event.data?.turn;
		if (typeof turn === "number" && Number.isSafeInteger(turn)) dead.add(turn);
	}
	return dead;
}
//#endregion
//#region src/core/rollback-guard.ts
/**
* The one rule about WHEN a rollback may run.
*
* No rollback while a turn is open, whatever the target turn. The agent loop holds a
* position in the model-visible surface and keeps appending to it, so truncating
* underneath a running turn would shadow history that turn is still writing while its
* later output stays; restoring files underneath it would fight whatever it is doing.
* A command does not interrupt the run either, so this refusal — not the command's
* own timing — is what keeps a run and a rollback from interleaving.
*
* Pure and DSH-free, so the wording and the rule can be pinned by a test.
*
* @module @nianchu/dsh-rollback/core/rollback-guard
*/
/**
* Why this rollback must not run, or null when it may.
* @param inProgressTurn - the currently open turn, or null between turns.
* @returns the user-facing refusal, or null.
*/
function rollbackRefusal(inProgressTurn) {
	if (inProgressTurn === null) return null;
	return `第 ${inProgressTurn} 轮还在进行中，不能回退：请先暂停（或等这一轮输出结束）再回退。`;
}
/**
* Why this TARGET is out of reach, or null when it can be honored.
*
* Retained checkpoints are a sliding window, so a target older than the oldest one
* cannot be reconstructed: the records that would describe that state were dropped
* long ago. Planning anyway does not fail — it silently restores from the OLDEST
* retained records instead, which is a different state than the one the user asked
* for, and says nothing about it. Refusing is the only honest answer.
*
* A target INSIDE the window is fine even when that particular turn kept no
* checkpoint (a turn with no output and no file changes is not retained): the
* records from the turns after it are exactly the ones that describe it.
* @param fromTurn - the turn the rollback targets.
* @param availableTurns - turns with retained checkpoints.
* @returns the user-facing refusal, or null.
*/
function windowRefusal(fromTurn, availableTurns) {
	if (availableTurns.length === 0) return "当前会话没有可回退的轮次。";
	const oldest = Math.min(...availableTurns);
	const newest = Math.max(...availableTurns);
	if (fromTurn >= oldest) return null;
	return `超出可回退范围：只能回退到最近保留的检查点（第 ${oldest}–${newest} 轮，共 ${availableTurns.length} 轮），更早的已丢弃。`;
}
//#endregion
//#region src/core/boundary-scan.ts
/**
* Whether a stat fingerprint alone proves the file is untouched since the last look.
*
* The fast path that keeps this scan cheap: a boundary re-checks every watched file,
* and almost all of them are unchanged, so only a changed size or mtime earns a read.
* @param tracked - what the plugin recorded at the last look.
* @param size - current size in bytes.
* @param mtimeMs - current modification time in epoch ms.
* @returns whether the file can be skipped without reading it.
*/
function unchangedByStat(tracked, size, mtimeMs) {
	return !tracked.missing && tracked.size === size && tracked.mtimeMs === mtimeMs;
}
/**
* The turn a finding belongs to.
*
* The scan runs at a turn's END, so that is the first moment the plugin learns a watched
* file changed or vanished -- but "first noticed" is not "when it happened", and a
* finding attributed to the noticing turn claims that turn did it. A rollback acts on
* exactly that claim, so getting it wrong invents file changes in turns that made none:
* rolling back an ordinary conversation turn offered files that had disappeared many
* turns earlier, because noticing was all that happened in that turn.
*
* The honest attribution is the turn AFTER the last moment the file was confirmed to
* exist, since the change happened somewhere in between. When that confirmation came in
* the very turn being scanned, the change did happen inside it -- the case the re-scan
* exists for, a shell command deleting a file the same turn wrote -- and it stays
* attributed to that turn so rolling it back restores the file.
* @param lastSeenTurn - the turn that last confirmed the file existed, or null when this
*   plugin has never confirmed it.
* @param scannedTurn - the turn whose end the scan is running at.
* @returns the turn the finding must be recorded against.
*/
function findingTurn(lastSeenTurn, scannedTurn) {
	if (lastSeenTurn == null) return scannedTurn;
	return lastSeenTurn === scannedTurn ? scannedTurn : lastSeenTurn + 1;
}
/**
* Decide what a re-check found.
* @param tracked - what the plugin recorded at the last look.
* @param observed - the file's current state, or null when it is absent.
* @returns the action to take.
*/
function planBoundaryAction(tracked, observed) {
	if (observed === null) {
		if (tracked.missing) return { kind: "none" };
		if (tracked.lastKnown === null) return { kind: "unrestorable" };
		return {
			kind: "missing",
			before: tracked.lastKnown
		};
	}
	if (tracked.missing || tracked.lastKnown === null) return {
		kind: "adopt",
		observed
	};
	if (observed.content === tracked.lastKnown) return { kind: "none" };
	return {
		kind: "changed",
		before: tracked.lastKnown,
		after: observed.content,
		observed
	};
}
//#endregion
//#region src/boundary-rescan.ts
/**
* Host side of the boundary re-scan: the watched-file registry and the filesystem
* probe. See `src/core/boundary-scan.ts` for the decisions themselves.
*
* Watched files are the ones the file tools touched — the plugin's whole window onto
* the workspace. A shell command can rewrite or delete any of them without the
* plugin hearing about it, so every user-message boundary re-checks them and records
* what changed, anchored at that boundary. The scan runs off the message path and
* never throws: a failure here costs coverage, never the user's message.
*
* @module @nianchu/dsh-rollback/boundary-rescan
*/
/**
* The largest file the scan will keep a restorable copy of. Beyond it the plugin
* stops watching the path rather than pretending it could restore it.
*/
const MAX_WATCHED_BYTES = 8388608;
/** Re-checks watched files at each user-message boundary. */
var BoundaryRescan = class {
	/** Per session: display path to what the plugin last observed. */
	watched = /* @__PURE__ */ new Map();
	/** The scan currently running per session. */
	inFlight = /* @__PURE__ */ new Map();
	/** A newer anchor requested while a scan was already running. */
	queued = /* @__PURE__ */ new Map();
	/** Warnings that should appear once per path, not once per boundary. */
	warned = /* @__PURE__ */ new Set();
	/** Explicit field, not a constructor parameter property — see SlidingWindow. */
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Note what a file tool just left behind, so the next boundary compares against it
	* instead of against the previous generation.
	*
	* `content` is null when the tool never reported it — the `str_replace_editor`
	* tool returns only rendered text, so its capture is a pre-read and knows the
	* BEFORE state alone. Passing its empty placeholder as real content would tell the
	* registry the file is now empty, and the next boundary would record a phantom
	* rewrite whose restore content is an empty string: a rollback would blank the
	* file. An unknown content instead makes the next check read the file and adopt
	* what it finds, recording nothing.
	* @param sessionId - the session.
	* @param path - the display path the tool reported.
	* @param content - the content the tool left behind, or null when it never said.
	*/
	observe(sessionId, path, content, turn = null) {
		this.registryFor(sessionId).set(path, {
			lastKnown: content,
			size: null,
			mtimeMs: null,
			missing: false,
			lastSeenTurn: turn
		});
	}
	/**
	* Re-check every watched file of one session, anchored at `turn`.
	*
	* Fire-and-forget by design: the caller invokes it from the event path and ignores
	* the promise, and the scan swallows its own failures. A request arriving while a
	* scan is already running is remembered and run afterwards, so a finding is never
	* anchored to a turn the user has already left behind.
	* @param sessionId - the session to scan.
	* @param turn - the turn the boundary belongs to.
	* @returns the running scan, for a caller that needs to wait for it.
	*/
	scan(sessionId, turn) {
		const running = this.inFlight.get(sessionId);
		if (running !== void 0) {
			this.queued.set(sessionId, turn);
			return running;
		}
		const task = (async () => {
			try {
				await this.runOnce(sessionId, turn);
				while (this.queued.has(sessionId)) {
					const next = this.queued.get(sessionId);
					this.queued.delete(sessionId);
					await this.runOnce(sessionId, next);
				}
			} finally {
				this.inFlight.delete(sessionId);
				this.queued.delete(sessionId);
			}
		})();
		this.inFlight.set(sessionId, task);
		return task;
	}
	/**
	* Wait for any running scan of this session to finish.
	*
	* A rollback can be asked for the very instant a turn ends, while the scan that
	* turn triggered is still reading files; planning without waiting would miss
	* exactly the change the user is rolling back.
	* @param sessionId - the session.
	*/
	async settled(sessionId) {
		await this.inFlight.get(sessionId);
	}
	/** One pass over the session's watched files. */
	async runOnce(sessionId, turn) {
		const tracked = this.registryFor(sessionId);
		for (const [path, state] of [...tracked]) try {
			await this.checkOne(sessionId, turn, path, state, tracked);
		} catch (error) {
			this.deps.warn(`[nianchu-rollback] boundary re-check failed for ${path}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/**
	* Load the paths the durable sidecar already holds, so a restarted process keeps
	* watching them. Called once per session; a later rollback deliberately does NOT
	* re-prime, because the sidecar still describes the state the rollback undid and
	* comparing against it would invent changes.
	* @param sessionId - the session.
	*/
	prime(sessionId) {
		const known = this.deps.knownContent(sessionId);
		const primed = /* @__PURE__ */ new Map();
		for (const path of this.deps.watchedPaths(sessionId)) {
			const entry = known.get(path);
			primed.set(path, {
				lastKnown: entry?.content ?? null,
				size: null,
				mtimeMs: null,
				missing: false,
				lastSeenTurn: entry?.turn ?? null
			});
		}
		this.watched.set(sessionId, primed);
	}
	/**
	* Forget what the plugin knows about a session's watched files, keeping the paths
	* themselves watched.
	*
	* Used after a rollback, which rewrote the very files the registry describes: the
	* next scan adopts whatever is on disk now and records nothing, where comparing
	* against the pre-rollback picture would have invented a change for every file the
	* rollback touched. Dropping the paths instead would quietly end their coverage.
	* @param sessionId - the session.
	*/
	forget(sessionId) {
		const tracked = this.watched.get(sessionId);
		if (tracked === void 0) return;
		for (const path of [...tracked.keys()]) {
			const previous = tracked.get(path);
			tracked.set(path, {
				lastKnown: null,
				size: null,
				mtimeMs: null,
				missing: false,
				lastSeenTurn: previous?.lastSeenTurn ?? null
			});
		}
	}
	/** This session's registry, empty until primed or observed. */
	registryFor(sessionId) {
		const existing = this.watched.get(sessionId);
		if (existing !== void 0) return existing;
		const created = /* @__PURE__ */ new Map();
		this.watched.set(sessionId, created);
		return created;
	}
	/** Probe one path and act on what the decision says. */
	async checkOne(sessionId, turn, path, state, registry) {
		const hostPath = await this.deps.hostPathOf(sessionId, path);
		if (hostPath === void 0) return;
		const fingerprint = await statFingerprint(hostPath);
		if (fingerprint !== null && unchangedByStat(state, fingerprint.size, fingerprint.mtimeMs)) return;
		if (fingerprint !== null && fingerprint.size > MAX_WATCHED_BYTES) {
			this.warnOnce(`oversize:${sessionId}:${path}`, `[nianchu-rollback] no longer watching ${path}: ${fingerprint.size} bytes exceeds the ${MAX_WATCHED_BYTES}-byte limit`);
			registry.delete(path);
			return;
		}
		const action = planBoundaryAction(state, fingerprint === null ? null : await readObserved(hostPath));
		switch (action.kind) {
			case "none":
				if (fingerprint !== null) registry.set(path, {
					...state,
					size: fingerprint.size,
					mtimeMs: fingerprint.mtimeMs,
					missing: false,
					lastSeenTurn: turn
				});
				return;
			case "adopt":
				registry.set(path, {
					lastKnown: action.observed.content,
					size: action.observed.size,
					mtimeMs: action.observed.mtimeMs,
					missing: false,
					lastSeenTurn: turn
				});
				return;
			case "changed": {
				const anchor = findingTurn(state.lastSeenTurn, turn);
				this.deps.record(sessionId, anchor, {
					path,
					operation: "update",
					before: action.before,
					after: action.after
				});
				registry.set(path, {
					lastKnown: action.after,
					size: action.observed.size,
					mtimeMs: action.observed.mtimeMs,
					missing: false,
					lastSeenTurn: turn
				});
				return;
			}
			case "missing": {
				const removeAnchor = findingTurn(state.lastSeenTurn, turn);
				this.deps.record(sessionId, removeAnchor, {
					path,
					operation: "remove",
					before: action.before,
					after: ""
				});
				registry.set(path, {
					...state,
					lastKnown: action.before,
					size: null,
					mtimeMs: null,
					missing: true
				});
				return;
			}
			case "unrestorable":
				this.warnOnce(`unread:${sessionId}:${path}`, `[nianchu-rollback] ${path} disappeared before the plugin ever read it; a rollback cannot restore it`);
				registry.set(path, {
					...state,
					size: null,
					mtimeMs: null,
					missing: true
				});
		}
	}
	/** Report one condition once per key. */
	warnOnce(key, message) {
		if (this.warned.has(key)) return;
		this.warned.add(key);
		this.deps.warn(message);
	}
};
/** Current size and mtime of a regular file, or null when it is absent or not one. */
async function statFingerprint(hostPath) {
	try {
		const info = await stat(hostPath);
		if (!info.isFile()) return null;
		return {
			size: info.size,
			mtimeMs: info.mtimeMs
		};
	} catch {
		return null;
	}
}
/** Read a file for the re-scan. A read failure leaves it unobserved, which the
* decision treats as absent — and an absent file with no known content is reported
* rather than recorded, so a transient read error cannot sabotage a rollback. */
async function readObserved(hostPath) {
	try {
		const info = await stat(hostPath);
		return {
			content: await readFile(hostPath, "utf8"),
			size: info.size,
			mtimeMs: info.mtimeMs
		};
	} catch {
		return null;
	}
}
//#endregion
//#region src/empty-dirs.ts
/**
* Filesystem side of the empty-directory cleanup.
*
* See `src/core/dir-cleanup.ts` for WHY creation time decides this; this module is
* only the probe and the removal. It uses `node:fs` directly, exactly as the
* rollback's file deletion does, so it works for the same set of backends (the
* local one) and needs no delete primitive from the filesystem service.
*
* @module @nianchu/dsh-rollback/empty-dirs
*/
/**
* Remove the directories a rollback emptied and the rolled-back span created.
*
* Never throws: a directory that cannot be removed is reported, because failing the
* whole rollback over a leftover empty directory would be worse than leaving it.
* @param deletedHostPaths - host paths of the files the rollback deleted.
* @param spanStartMs - epoch ms at which the rolled-back turn opened.
* @param neverRemove - a path the cleanup must never remove (see the planner).
* @returns the directories removed and those that resisted.
*/
async function cleanupEmptyDirs(deletedHostPaths, spanStartMs, neverRemove) {
	const planned = await planEmptyDirCleanup(deletedHostPaths, spanStartMs, {
		async entries(path) {
			try {
				return await readdir(path);
			} catch {
				return null;
			}
		},
		async birthtimeMs(path) {
			try {
				const info = await stat(path);
				return info.birthtimeMs > 0 ? info.birthtimeMs : void 0;
			} catch {
				return;
			}
		}
	}, neverRemove);
	const removed = [];
	const failed = [];
	for (const directory of planned) try {
		await rmdir(directory);
		removed.push(directory);
	} catch (error) {
		failed.push({
			path: directory,
			reason: error instanceof Error ? error.message : String(error)
		});
	}
	return {
		removed,
		failed
	};
}
//#endregion
//#region src/core/truncation-plan.ts
/**
* Truncation planning: locate the surface range a rollback must shadow and build
* the replacement `user/message` that takes its place.
*
* The harness rewrites model-visible history exactly this way for its own
* compaction: append a `user/message` carrying a positional `replace` surface op
* (`compaction-basic`'s `commitCompactionBody`). A rollback reuses that
* primitive — only the replacement text differs — and that choice is what lets
* the marker land IMMEDIATELY, from the `/rollback` command itself:
*
* - `user/message` is the one message-producing event the session invariant
*   leaves unconstrained, so it may be appended BETWEEN turns, when no turn and
*   no step is open. An empty-content `assistant/message` — which would be
*   invisible to the model — is accepted only INSIDE an open step, so it cannot
*   be written until the next turn opens, leaving the rollback visually absent
*   (and undone by a page refresh) until then.
* - It needs no step, so the compaction token meter stays satisfied without the
*   plugin inventing a step number (which the sequential-step invariant rejects).
*
* The cost is that the model DOES see the replacement text. It is framed the way
* the harness frames its own compaction checkpoint — explicit about what it is,
* and instructing the model not to acknowledge it.
*
* `deriveEventMessage` projects a `user/message` VERBATIM, so nothing beyond
* `content` may ride the message: everything the client needs is derived from
* the event instead (the shadowed range from `surfaceOp`, and an emptied surface
* from the nodes that surround the marker), and never becomes model input.
*
* The marker's range leaves this module as plain seqs and is SPELLED at the
* framework boundary: 0.1.5 renamed that op's two ends to `startSeq`/`endSeq` and
* validates the key set exactly, so a plan carrying the old names cannot be
* appended at all. {@link withReplaceSurfaceOpFallback} owns the choice.
*
* One further rule shapes WHERE the range may start: 0.1.5 protects SURFACE NODE 0.
* A `replace` whose shadowed range begins at that node is refused — "surface
* replace: node 0 holds the system prompt and may be rewritten only by a
* system/message over exactly that node" (`dsh-session/lib/index.js:379-383`) —
* and the harness appends the system prompt INSIDE the first turn's own step
* (`dsh-agent-loop/lib/index.js:1023`, after `turn/start`), so the system-prompt
* node is surface node 0 while its seq sits inside turn 1's range. A rollback of
* turn 1 therefore used to hand the framework a range starting at node 0 and be
* rejected wholesale — with every file already restored. The range never includes
* that node: {@link systemPromptNodeSeq} identifies it and
* {@link shadowedSurfaceFrom} starts one node later, which keeps the system prompt
* in the model's history (it is the one node the session must never lose).
*
* Pure and DSH-free: callers pass a structural view of the session.
*
* @module @nianchu/dsh-rollback/core/truncation-plan
*/
/**
* The model-facing text of the replacement checkpoint.
*
* Framed like the harness's own compaction checkpoint (`frameSummary`): it says
* what it is and tells the model to continue from the messages that follow
* without acknowledging it, so the model neither has to guess why an
* unexplained user turn appeared nor act on it. The file sentence is the one
* fact a rollback adds beyond compaction — the workspace was reverted too, so
* the model must not keep reasoning about content its own edits had produced.
*
* Everything here is load-bearing, and nothing else is: the four facts are (1)
* this is machine-generated, not something the user said, (2) the messages after
* this point are gone, so stop reasoning about them, (3) the workspace files were
* reverted with them, so their later edits are not on disk, and (4) continue from
* what remains and do not mention the checkpoint. The marker stays in the model's
* context for the REST OF THE SESSION — a later rollback replaces it, nothing else
* removes it — so every word is paid on every subsequent request. That is why the
* wording is this terse: it is roughly a third of the prose it replaced, with the
* same four facts and no new ambiguity. `tests/truncation-plan.test.ts` pins a
* character budget so it cannot quietly grow back.
*/
const ROLLBACK_CHECKPOINT_TEXT = "Automated checkpoint: earlier messages removed, files restored to that point. Continue from what remains; don't mention this checkpoint.";
/**
* The seq of the `turn/start` that opens `turn`, or null when the log has none.
*
* The LAST match wins: a session damaged by an older plugin build can hold a
* synthetic marker turn and the real turn under the same number, and the real
* turn is the later of the two.
*/
function turnStartSeqFor(view, turn) {
	let found = null;
	for (const event of view.events) {
		if (event.type !== "turn/start") continue;
		if (event.data?.turn === turn) found = event.seq;
	}
	return found;
}
/** The type of the event stored at one seq, or null when the view's log lacks it. */
function eventTypeAtSeq(view, seq) {
	for (const event of view.events) if (event.seq === seq) return event.type;
	return null;
}
/**
* The surface seq of the system-prompt node a rollback must never shadow, or null
* when node 0 holds something else.
*
* 0.1.5's rule is positional: it protects surface NODE 0 and only when the event
* recorded there is a `system/message` (`dsh-session/lib/index.js:379-381` — the
* same check the browser replays through `dsh-client-connection/lib/client.js:1952-1955`).
* Later `system/message` nodes carry no protection at all ("later system nodes
* carry no protection and a compaction range may shadow them"), so this answers
* for index 0 and nothing else, and it answers by type — not by a hard-coded seq
* — because the harness appends the system prompt from inside the first turn's own
* step (`dsh-agent-loop/lib/index.js:1023`), each build and each resumed session
* giving it whatever seq that step reached.
*
* A node whose event cannot be read is NOT reported as the system prompt: the
* framework makes the same lookup against the same log and also declines to
* protect it, so the two agree on what may be replaced.
* @param view - the session view, whose surface and log are addressed by seq.
* @returns the protected node's seq, or null when there is none.
*/
function systemPromptNodeSeq(view) {
	const head = view.surface.nodes[0];
	if (head === void 0) return null;
	return eventTypeAtSeq(view, head) === "system/message" ? head : null;
}
/**
* Surface nodes at or after `fromTurn`'s opening boundary, BEFORE the
* system-prompt protection is applied — the range an unprotected build would take.
*/
function boundarySurfaceFrom(view, fromTurn) {
	const boundary = turnStartSeqFor(view, fromTurn);
	if (boundary === null) return [];
	const nodes = view.surface.nodes;
	const startIdx = nodes.findIndex((seq) => seq >= boundary);
	if (startIdx === -1) return [];
	return [...nodes.slice(startIdx)];
}
/**
* Drop the protected system-prompt node from a range that would start on it.
*
* The clamp is one node deep and CONDITIONAL, both by the framework's own rule: a
* range that starts later than node 0 is untouched, and a node 0 that is not the
* system prompt (a build that keeps the prompt out of history ships a session
* whose first surface node is the user's own message) is replaceable as before.
* Clamping unconditionally would be a real defect — it would leave that first
* rolled-back user message in the model's context.
* @param view - the session view.
* @param shadowed - the pre-clamp range, in surface order.
* @returns the range a marker may actually replace; empty when the clamp consumed it.
*/
function withoutSystemPromptHead(view, shadowed) {
	const head = view.surface.nodes[0];
	if (shadowed.length === 0 || head === void 0 || shadowed[0] !== head) return [...shadowed];
	if (systemPromptNodeSeq(view) !== head) return [...shadowed];
	return shadowed.slice(1);
}
/**
* Surface nodes a rollback to before `fromTurn` may replace: the nodes at or after
* that turn's opening boundary, minus the system-prompt node. Empty when the turn
* never opened, when the surface holds nothing from it, or when the ONLY node the
* clamp left in range was the system prompt itself.
*
* The marker is appended in the same breath as this computation, so the live
* surface IS the range: nothing can have been appended in between, which is why
* no captured-range bookkeeping is needed.
*/
function shadowedSurfaceFrom(view, fromTurn) {
	return withoutSystemPromptHead(view, boundarySurfaceFrom(view, fromTurn));
}
/**
* Build the replacement checkpoint for one rollback, or null when the surface
* holds nothing to shadow (an earlier marker already covers the range).
*
* Two outcomes carry a marker. Normally the range is the clamped surface tail from
* the targeted turn, and the marker replaces it. When the clamp leaves NOTHING to
* replace — the only node in range was the system prompt — the marker still
* carries the checkpoint text but no replacement ({@link TruncationMarkerPlan.range}
* is null), because a `replace` over that node is exactly what the framework
* refuses and a `replace` over nothing cannot be spelled. The distinction is drawn
* from the PRE-clamp range: a rollback that found no surface output at all writes
* nothing, exactly as before.
*/
function planTruncationMarker(view, input) {
	const boundary = boundarySurfaceFrom(view, input.fromTurn);
	if (boundary.length === 0) return null;
	const shadowed = withoutSystemPromptHead(view, boundary);
	const data = {
		id: input.messageId,
		role: "user",
		source: ROLLBACK_MARKER_SOURCE,
		content: [{
			type: "text",
			text: ROLLBACK_CHECKPOINT_TEXT
		}]
	};
	if (shadowed.length === 0) return {
		shadowed,
		data,
		range: null,
		sourceEventSeqs: []
	};
	return {
		shadowed,
		data,
		range: {
			start: shadowed[0],
			end: shadowed[shadowed.length - 1]
		},
		sourceEventSeqs: [...shadowed]
	};
}
//#endregion
//#region src/store.ts
/**
* Durable checkpoint store: persists each captured file mutation's full pre-turn
* content so rollback can restore it ACROSS process restarts — the one piece the
* session log itself cannot provide (the JSONL stores only 3-line diff hunks,
* not whole files).
*
* Layout (v2): one JSONL file per session under
* `$DSH_HOME/storages/nianchu-rollback/checkpoints-v2/<sessionId>.jsonl`
* (falls back to `~/.dsh`). Per-session files replace the former single global
* `checkpoints.jsonl` so reading one session no longer scans every session's
* history, and the version lives in the directory name.
*
* Retention: each load prunes records older than `KEEP_TURNS` turns back (a
* margin above the 10-turn rollback window) and rewrites the file, so the
* sidecar stays bounded instead of growing without limit. Corrupt or
* malformed lines are skipped, counted, and reported, rather than being
* silently absorbed.
*
* This is a plugin-owned sidecar under the DSH home, completely separate from
* the session logs: a broken/missing sidecar can only degrade rollback to
* "skip that file", never affect DSH session loading.
*
* All reads/writes are synchronous on purpose: `loadCheckpoints` must be atomic
* with the seed replay (no async race with live events), and `append` must be
* on-disk before the process can exit. One small line write per file mutation.
*
* @module @nianchu/dsh-rollback/store
*/
/** Sidecar layout version, encoded in the storage directory name. */
const FORMAT_VERSION = 2;
/**
* Per-session retention, a superset of the 10-turn rollback window. The fold
* only ever asks for recent turns' checkpoints, so older records are pruned on
* load to keep the sidecar bounded.
*/
const KEEP_TURNS = 20;
/** DSH home, honoring an explicit override (the `$DSH_HOME` convention). */
function dshHome() {
	const override = process.env.DSH_HOME?.trim();
	return override !== void 0 && override !== "" ? override : join(homedir(), ".dsh");
}
function storageRoot() {
	return join(dshHome(), "storages", "nianchu-rollback", `checkpoints-v${FORMAT_VERSION}`);
}
/** Per-session file, with a defensive strip of filesystem-hostile characters. */
function sessionFile(sessionId) {
	const safe = sessionId.replace(/[\\/:*?"<>|]/g, "_");
	return join(storageRoot(), `${safe}.jsonl`);
}
/** Structural validation for one line read back from the sidecar. */
function validRecord(value, sessionId) {
	if (value === null || typeof value !== "object") return false;
	const r = value;
	return r.sessionId === sessionId && Number.isSafeInteger(r.turn) && typeof r.path === "string" && (r.operation === "create" || r.operation === "update" || r.operation === "remove") && (r.before === null || typeof r.before === "string") && (r.after === void 0 || typeof r.after === "string");
}
/** Append one captured mutation to the store (best-effort durability). */
function appendCheckpoint(record) {
	try {
		const file = sessionFile(record.sessionId);
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
	} catch {}
}
/**
* Every structurally valid record in one session's sidecar, in file order.
* @param sessionId - the session whose sidecar to read.
* @returns the records, oldest first.
*/
function readRecords(sessionId) {
	const file = sessionFile(sessionId);
	if (!existsSync(file)) return [];
	const rows = [];
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			try {
				const parsed = JSON.parse(line);
				if (validRecord(parsed, sessionId)) rows.push(parsed);
			} catch {}
		}
	} catch {}
	return rows;
}
/**
* Load every durable checkpoint for one session. The FIRST record per
* (turn, path) is the turn's pre-content (later touches in the same turn only
* advance the after-state, which restore does not need). Records older than the
* retention window are pruned and the file is rewritten; corrupt lines are
* skipped and reported.
*/
function loadCheckpoints(sessionId, skipTurns) {
	const file = sessionFile(sessionId);
	const out = /* @__PURE__ */ new Map();
	if (!existsSync(file)) return out;
	const rows = [];
	let corrupt = 0;
	let maxTurn = 0;
	try {
		const text = readFileSync(file, "utf8");
		for (const line of text.split("\n")) {
			if (line.trim() === "") continue;
			let parsed;
			try {
				parsed = JSON.parse(line);
			} catch {
				corrupt += 1;
				continue;
			}
			if (!validRecord(parsed, sessionId)) {
				corrupt += 1;
				continue;
			}
			rows.push(parsed);
			if (parsed.turn > maxTurn) maxTurn = parsed.turn;
		}
	} catch {}
	const cutoff = maxTurn - KEEP_TURNS + 1;
	const dropped = (record) => record.turn < cutoff || skipTurns?.has(record.turn) === true;
	let pruned = 0;
	for (const record of rows) {
		if (dropped(record)) {
			pruned += 1;
			continue;
		}
		let byPath = out.get(record.turn);
		if (byPath === void 0) {
			byPath = /* @__PURE__ */ new Map();
			out.set(record.turn, byPath);
		}
		if (!byPath.has(record.path)) byPath.set(record.path, {
			operation: record.operation,
			before: record.before
		});
	}
	if (corrupt > 0 || pruned > 0) try {
		const kept = rows.filter((record) => !dropped(record));
		writeFileSync(file, kept.map((record) => JSON.stringify(record)).join("\n") + (kept.length > 0 ? "\n" : ""), "utf8");
	} catch {}
	if (corrupt > 0) console.warn(`[nianchu-rollback] checkpoints: skipped ${corrupt} corrupt line(s) for session ${sessionId}`);
	if (pruned > 0) console.warn(`[nianchu-rollback] checkpoints: dropped ${pruned} record(s) (stale or from rolled-back turns) for session ${sessionId}`);
	return out;
}
function loadWatched(sessionId, skipTurns) {
	const watched = /* @__PURE__ */ new Map();
	for (const row of readRecords(sessionId)) {
		if (skipTurns?.has(row.turn) === true) continue;
		if (row.operation === "remove") continue;
		const previous = watched.get(row.path);
		if (previous !== void 0 && previous.turn !== null && previous.turn > row.turn) continue;
		const content = typeof row.after === "string" && row.after !== "" ? row.after : null;
		watched.set(row.path, {
			content,
			turn: row.turn
		});
	}
	return watched;
}
/** Minimal split of the tools/result event and its session attribution. */
function mutationOf(exec, value) {
	if (exec.agent?.session === void 0) return null;
	return fsMutationFrom(exec.name ?? "", value);
}
/** Human/machine one-line summary of a rollback plan. */
function summarize(plan, options = {}) {
	const restored = plan.restored.filter((f) => f.action === "restore").length;
	const recovered = plan.restored.filter((f) => f.action === "recover").length;
	const deleted = plan.restored.filter((f) => f.action === "delete").length;
	const parts = [];
	if (restored > 0) parts.push(`${restored} 个文件恢复`);
	if (recovered > 0) parts.push(`${recovered} 个文件找回`);
	if (deleted > 0) parts.push(`${deleted} 个新建文件删除`);
	const removedDirs = options.removedDirs ?? [];
	if (removedDirs.length > 0) parts.push(`${removedDirs.length} 个空目录删除`);
	if (plan.skipped.length > 0) {
		const detail = plan.skipped.map((s) => `${s.path}（${s.reason}）`).join("；");
		parts.push(`${plan.skipped.length} 个文件无法恢复，已保持现状（记录保留，下次回退会再试）：${detail}`);
	}
	const filePart = parts.length > 0 ? parts.join("，") : "无文件变更";
	const truncatePart = plan.truncation === null ? "无对话可截断" : "已截断对话";
	return `已回退到第 ${plan.fromTurn} 轮发起前：${filePart}；${truncatePart}。`;
}
/** A fresh id for the replacement checkpoint node. */
function markerMessageId() {
	return `rollback-truncation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
/**
* The session as the pure truncation planner sees it.
*
* The bare cast is NOT enough, and this is the same defect class as the one
* {@link eventsOf} fixes: `SessionView.events` has no counterpart on a 0.1.5
* session (its log is private), so handing the pure planner the session itself
* gives it `undefined` and `turnStartSeqFor`'s `for (const event of view.events)`
* throws `TypeError: view.events is not iterable` — on the plugin's OWN
* `/rollback preview` and `/rollback` paths. The view is therefore built rather
* than asserted: events through the accessor the installed build ships, surface
* read live.
* @param session - the session to view.
* @returns the structural view the pure planner consumes.
*/
function viewOf(session) {
	return {
		events: eventsOf(session),
		surface: session.surface
	};
}
/**
* Append the rollback marker, spelling its surface op the way the INSTALLED
* framework accepts.
*
* 0.1.5 renamed the op's range ends to `startSeq`/`endSeq` and validates the key
* set exactly, so the older `start`/`end` spelling the plugin used to write is
* refused with `carries an invalid replace surfaceOp` — the marker never landed,
* and with it the whole point of a rollback. `withReplaceSurfaceOpFallback` tries
* the modern spelling and retries with the legacy one only on that refusal, which
* persists nothing (see its doc for the `log.push`-comes-after-validation
* evidence). This is the one place the union is narrowed to the framework's own
* `SurfaceOp`; the shape itself is decided and tested in the core.
*
* A plan with NO range (`plan.range === null`) is the degenerate outcome of the
* system-prompt clamp: the rollback's only shadowed node was the protected system
* prompt, so there is nothing to replace. It is appended as a plain surface
* append — `'append'` is a `SurfaceOp` on every supported build, and the two
* remaining spellings are both impossible: a `replace` over node 0 is what the
* framework refuses, and omitting the marker entirely is refused too
* (`session event "user/message" is surface-eligible and requires a surfaceOp
* marker`, `dsh-session/lib/index.js:276`). No `sourceEventSeqs` rides this
* append: the framework demands a non-empty list when the key is present
* (`:289`), and an append shadows nothing to cite.
* @param session - the session to append to.
* @param plan - the planned marker.
* @returns the logged marker event, for the surface tail to follow.
* @throws whatever the append threw, when neither spelling is accepted.
*/
function appendRollbackMarker(session, plan) {
	const range = plan.range;
	if (range === null) return session.append("user/message", plan.data, { surfaceOp: "append" });
	return session.append("user/message", plan.data, {
		surfaceOp: {
			op: "replace",
			startSeq: range.start,
			endSeq: range.end
		},
		sourceEventSeqs: [...plan.sourceEventSeqs]
	});
}
/**
* The paths one session's sidecar holds — everything worth watching.
*
* The sidecar is the durable record of what the file tools touched, so it is also
* the list a restarted process should keep re-checking.
* @param sessionId - the session.
* @returns distinct display paths, in no particular order.
*/
/**
* The session's event log, through the accessor this framework build ships.
*
* 0.1.5 made the log private and exposes `snapshotEvents()`; <=0.1.1 handed the
* array out as `session.events`. This is not cosmetic: reading a missing
* accessor throws, and this code runs inside the `session/created` observer, so
* the throw made the HOST's own session resume fail — every affected session
* rendered an empty transcript ("resume failed for session … TypeError: events is
* not iterable"), which is a far worse outcome than any bug in this plugin's own
* features. Hence a total function: an unreadable log degrades to "no events".
* @param session - the session whose log to read.
* @returns the events, oldest first; empty when they cannot be read.
*/
function eventsOf(session) {
	try {
		if (typeof session?.snapshotEvents === "function") {
			const events = session.snapshotEvents();
			return Array.isArray(events) ? events : [];
		}
		if (Array.isArray(session?.events)) return session.events;
	} catch {}
	return [];
}
function watchablePaths(sessionId, skipTurns) {
	const paths = /* @__PURE__ */ new Set();
	for (const byPath of loadCheckpoints(sessionId, skipTurns).values()) for (const [path, record] of byPath) if (record.operation !== "remove") paths.add(path);
	return [...paths];
}
/** The rollback service: capture + preview + execute, keyed by live session. */
var RollbackService = class {
	folds = /* @__PURE__ */ new WeakMap();
	/** Copy-before-Write carrier for `str_replace_editor`, keyed by call id. */
	pendingBefore = /* @__PURE__ */ new Map();
	/** Watchdog for files the file tools touched, re-checked at message boundaries. */
	rescan;
	/**
	* Turns the log proves a rollback already removed, per session.
	*
	* Their sidecar records describe state that no longer exists — their file changes
	* were undone — so both the watch list and the known-content map must ignore them.
	* Without this, files an earlier rollback correctly deleted come back as "missing"
	* findings on the CURRENT turn and a later rollback resurrects them.
	*/
	deadTurns = /* @__PURE__ */ new Map();
	/** Explicit field, not a constructor parameter property — see SlidingWindow. */
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
		this.rescan = new BoundaryRescan({
			hostPathOf: async (sessionId, path) => {
				const session = this.ctx.sessions.get(sessionId);
				if (session === void 0) return void 0;
				const policy = this.ctx.sandboxPolicy.resolve({ session });
				const target = await this.ctx.fs.resolve(path, { cwd: policy.workspaceRoot });
				return this.ctx.fs.processPath(target);
			},
			watchedPaths: (sessionId) => watchablePaths(sessionId, this.deadTurns.get(sessionId)),
			knownContent: (sessionId) => loadWatched(sessionId, this.deadTurns.get(sessionId)),
			record: (sessionId, turn, mutation) => {
				const session = this.ctx.sessions.get(sessionId);
				if (session === void 0) return;
				if (!this.foldFor(session).mutationInto(turn, mutation)) {
					console.warn(`[nianchu-rollback] turn ${turn} left the retained window before its boundary scan finished; ${mutation.path} was not recorded`);
					return;
				}
				appendCheckpoint({
					sessionId,
					turn,
					path: mutation.path,
					operation: mutation.operation,
					before: mutation.before,
					after: mutation.after
				});
			},
			warn: (message) => console.warn(message)
		});
		ctx.on("session/event", (_session, event) => {
			try {
				const session = _session;
				const fold = this.foldFor(session);
				switch (event.type) {
					case "turn/start":
						fold.fold({
							kind: "turn-start",
							turn: event.data.turn,
							seq: event.seq
						});
						break;
					case "turn/end": {
						const endedSessionId = typeof session.id === "string" ? session.id : "";
						if (endedSessionId !== "") this.rescan.scan(endedSessionId, event.data.turn).catch((error) => {
							console.warn("[nianchu-rollback] boundary re-scan failed; the host keeps working:", error);
						});
						fold.fold({
							kind: "turn-end",
							turn: event.data.turn,
							seq: event.seq
						});
						break;
					}
					case "user/message":
					case "assistant/message":
					case "tool/result":
						if (event.surfaceOp === "append") fold.fold({
							kind: "surface",
							seq: event.seq
						});
						if (event.type === "user/message") {
							const openedTurn = fold.inProgressTurn();
							const sessionId = typeof session.id === "string" ? session.id : "";
							if (openedTurn !== null && sessionId !== "") this.rescan.scan(sessionId, openedTurn).catch((error) => {
								console.warn("[nianchu-rollback] boundary re-scan failed; the host keeps working:", error);
							});
						}
				}
			} catch (error) {
				console.warn("[nianchu-rollback] session/event observer failed; the host keeps working:", error);
			}
		});
		ctx.on("tools/pre-execute", async (exec, next) => {
			if (exec.name !== "str_replace_editor") return next();
			try {
				await this.captureBefore(exec);
			} catch (error) {
				console.warn("[nianchu-rollback] tools/pre-execute observer failed; the host keeps working:", error);
			}
			return next();
		});
		ctx.on("tools/result", (exec, result) => {
			try {
				const callId = exec.callId ?? "";
				const pending = this.pendingBefore.get(callId);
				this.pendingBefore.delete(callId);
				if (result.isError) return;
				const session = exec.agent?.session;
				if (session === void 0) return;
				const sessionObj = session;
				const reported = mutationOf(exec, result.value);
				const mutation = reported ?? (pending === void 0 ? null : {
					path: pending.path,
					operation: pending.kind === "created" ? "create" : "update",
					before: pending.before,
					after: ""
				});
				if (mutation === null) return;
				const fold = this.foldFor(sessionObj);
				fold.fold({
					kind: "fs-mutation",
					mutation
				});
				const sessionId = typeof sessionObj.id === "string" ? sessionObj.id : "";
				if (sessionId !== "") this.rescan.observe(sessionId, mutation.path, reported === null ? null : reported.after);
				const turn = fold.inProgressTurn();
				if (turn !== null && sessionId !== "") appendCheckpoint({
					sessionId,
					turn,
					path: mutation.path,
					operation: mutation.operation,
					before: mutation.before,
					...reported === null ? {} : { after: reported.after }
				});
			} catch (error) {
				console.warn("[nianchu-rollback] tools/result observer failed; the host keeps working:", error);
			}
		});
		ctx.on("session/created", (session) => {
			try {
				this.seedFromLog(session);
			} catch (error) {
				console.warn("[nianchu-rollback] session/created observer failed; the host keeps working:", error);
			}
		});
		for (const session of this.ctx.sessions.list()) this.seedFromLog(session);
	}
	/**
	* Rebuild one session's fold from its stored log (resume/restart support).
	*
	* Turn boundaries and surface positions replay exactly. File mutations are
	* reconstructed from the `write`/`edit` tool calls' logged arguments: a
	* `write` whose result says "Created file" restores as a delete (no prior
	* content needed); everything else records an unknown pre-turn basis, so it
	* previews honestly and is skipped by restore rather than mis-restored.
	*/
	seedFromLog(session) {
		if (this.folds.has(session)) return;
		const fold = this.foldFor(session);
		const replaced = replacedSurfaceRanges(eventsOf(session));
		const sessionKey = typeof session.id === "string" ? session.id : "";
		if (sessionKey !== "") this.deadTurns.set(sessionKey, deadTurnsOf(eventsOf(session)));
		if (sessionKey !== "") this.rescan.prime(sessionKey);
		const durable = loadCheckpoints(String(session.id), this.deadTurns.get(sessionKey));
		const calls = /* @__PURE__ */ new Map();
		for (const event of eventsOf(session)) {
			if (isReplacedSeq(event.seq, replaced)) continue;
			switch (event.type) {
				case "tool/call":
					calls.set(event.data.callId, {
						name: event.data.name,
						argsRaw: event.data.arguments
					});
					break;
				case "tool/result": {
					if (event.surfaceOp === "append") fold.fold({
						kind: "surface",
						seq: event.seq
					});
					const call = calls.get(event.data.message?.source?.callId ?? "");
					if (call === void 0 || call.name !== "write" && call.name !== "edit") break;
					let args;
					try {
						args = JSON.parse(call.argsRaw);
					} catch {
						args = void 0;
					}
					if (typeof args?.file_path !== "string") break;
					const path = resolve(session.header?.cwd ?? process.cwd(), args.file_path);
					const resultText = (() => {
						const block = event.data.message?.content?.[0];
						return block?.type === "text" && typeof block.text === "string" ? block.text : "";
					})();
					const created = call.name === "write" && resultText.includes("Created file");
					const stored = durable.get(event.data.turn)?.get(path);
					const operation = stored?.operation ?? (created ? "create" : "update");
					const before = stored !== void 0 ? stored.before : null;
					fold.fold({
						kind: "fs-mutation",
						mutation: {
							path,
							operation,
							before,
							after: ""
						}
					});
					break;
				}
				case "user/message":
				case "assistant/message":
					if (event.surfaceOp === "append") fold.fold({
						kind: "surface",
						seq: event.seq
					});
					break;
				case "turn/start":
					fold.fold({
						kind: "turn-start",
						turn: event.data.turn,
						seq: event.seq
					});
					break;
				case "turn/end": fold.fold({
					kind: "turn-end",
					turn: event.data.turn,
					seq: event.seq
				});
			}
		}
	}
	/** The per-session fold, created on first observation. */
	foldFor(session) {
		let fold = this.folds.get(session);
		if (fold === void 0) {
			fold = new SessionFold(10);
			this.folds.set(session, fold);
		}
		return fold;
	}
	/**
	* Read the `str_replace_editor` target before its `create`/`str_replace`/
	* `insert` command mutates it, so the checkpoint can restore the pre-turn
	* content even though the tool's own result value is only a rendered string.
	*/
	async captureBefore(exec) {
		const args = exec.arguments ?? {};
		if (args.command !== "create" && args.command !== "str_replace" && args.command !== "insert") return;
		const path = args.path;
		if (typeof path !== "string" || path === "") return;
		const session = exec.agent?.session;
		if (session === void 0) return;
		const cwd = session.header?.cwd;
		const target = await this.ctx.fs.resolve(path, cwd === void 0 ? {} : { cwd });
		if (await this.ctx.fs.stat(target) === void 0) {
			this.pendingBefore.set(exec.callId ?? "", {
				path: target.displayPath,
				kind: "created",
				before: null
			});
			return;
		}
		const before = await this.ctx.fs.readText(target);
		this.pendingBefore.set(exec.callId ?? "", {
			path: target.displayPath,
			kind: "updated",
			before
		});
	}
	/**
	* Compute a read-only rollback plan (does not mutate anything).
	*
	* Waits for a boundary re-scan already running, for the same reason `execute`
	* does: a plan computed a moment after a turn ends must include what that turn's
	* scan found, or the preview would under-report what the rollback will do.
	* @param session - the session to plan against.
	* @param fromTurn - restore the state before this turn.
	* @returns the plan.
	*/
	async preview(session, fromTurn) {
		const fold = this.foldFor(session);
		const sessionId = typeof session.id === "string" ? session.id : "";
		if (sessionId !== "") await this.rescan.settled(sessionId);
		const outOfRange = windowRefusal(fromTurn, fold.snapshots().map((checkpoint) => checkpoint.turn));
		if (outOfRange !== null) throw new Error(outOfRange);
		const plan = planRollback(fold.snapshots(), fromTurn, fold.surfaceTail());
		const shadowed = shadowedSurfaceFrom(viewOf(session), fromTurn);
		const current = await this.currentOnDisk(session, plan.restored);
		return {
			...plan,
			restored: current,
			truncation: shadowed.length > 0 ? {
				start: shadowed[0],
				end: shadowed[shadowed.length - 1]
			} : null
		};
	}
	/**
	* Read what is on the disk RIGHT NOW for each file a preview will touch, so the
	* confirmation dialog diffs against reality rather than against a record.
	*
	* `RestoredFile.after` is the post-state the rolled-back span last left behind,
	* which is not the same thing as the current file: later turns, a shell command,
	* or the user's own editor can all have moved on since. Diffing a stale basis
	* against the restore content would understate or misstate the change exactly
	* where the user is asked to confirm something irreversible.
	*
	* Reading now also removes the restart cliff: nothing about the current file
	* depends on the durable sidecar having recorded a post-state, so a preview
	* after a restart is as accurate as one taken live.
	*
	* A path that cannot be read (deleted, unreadable, outside the resolved root)
	* becomes `null`, which the renderer reports as "cannot preview" instead of
	* inventing a diff. Both outcomes are honest: `null` never means "empty file" —
	* a genuinely empty file reads as `''` and previews correctly.
	* @param session - the session whose sandbox policy resolves the paths.
	* @param files - the plan's restore/delete entries.
	* @returns the same entries with `after` refreshed from disk.
	*/
	async currentOnDisk(session, files) {
		if (files.length === 0) return [...files];
		let cwd;
		try {
			cwd = this.ctx.sandboxPolicy.resolve({ session }).workspaceRoot;
		} catch {
			cwd = void 0;
		}
		const out = [];
		for (const file of files) try {
			const target = await this.ctx.fs.resolve(file.path, cwd === void 0 ? {} : { cwd });
			const onDisk = await this.ctx.fs.readText(target);
			out.push({
				...file,
				after: onDisk
			});
		} catch {
			out.push({
				...file,
				after: null
			});
		}
		return out;
	}
	/**
	* Execute a rollback: restore/delete affected files, then truncate the
	* conversation surface in place.
	*
	* @throws when any turn is still open (a mid-run rollback is unsafe).
	*/
	async execute(session, fromTurn, signal) {
		const fold = this.foldFor(session);
		const refusal = rollbackRefusal(fold.inProgressTurn());
		if (refusal !== null) throw new Error(refusal);
		const outOfRange = windowRefusal(fromTurn, fold.snapshots().map((checkpoint) => checkpoint.turn));
		if (outOfRange !== null) throw new Error(outOfRange);
		const settlingId = typeof session.id === "string" ? session.id : "";
		if (settlingId !== "") await this.rescan.settled(settlingId);
		const plan = planRollback(fold.snapshots(), fromTurn, fold.surfaceTail());
		const restored = [];
		const skipped = [...plan.skipped];
		/** Host paths of the files this rollback deleted, for the empty-directory pass. */
		const deletedHostPaths = [];
		const policy = this.ctx.sandboxPolicy.resolve({ session });
		for (const file of plan.restored) try {
			const resolveOpts = { cwd: policy.workspaceRoot };
			const target = await this.ctx.fs.resolve(file.path, resolveOpts);
			const observationActor = { agent: { session } };
			if (file.action === "delete") {
				const hostPath = this.ctx.fs.processPath(target);
				try {
					await unlink(hostPath);
				} catch (error) {
					if (error?.code !== "ENOENT") throw error;
				}
				deletedHostPaths.push(hostPath);
				this.ctx.emit("fs/observed", target, { kind: "absent" }, observationActor);
			} else {
				const outcome = await this.ctx.fs.writeText(target, file.content ?? "", void 0, signal, policy);
				this.ctx.emit("fs/observed", target, {
					kind: "present",
					version: outcome.version
				}, observationActor);
			}
			restored.push(file);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			skipped.push({
				path: file.path,
				reason: `io-error: ${message}`
			});
		}
		const removedDirs = [];
		if (deletedHostPaths.length > 0) {
			const spanStartMs = turnStartTimeMs(eventsOf(session), fromTurn);
			if (spanStartMs === void 0) console.warn(`[nianchu-rollback] no turn/start time for turn ${fromTurn}; skipping empty-directory cleanup`);
			else {
				const cleanup = await cleanupEmptyDirs(deletedHostPaths, spanStartMs, policy.workspaceRoot);
				removedDirs.push(...cleanup.removed);
				for (const failure of cleanup.failed) console.warn(`[nianchu-rollback] could not remove emptied directory ${failure.path}: ${failure.reason}`);
			}
		}
		const markerPlan = planTruncationMarker(viewOf(session), {
			fromTurn,
			messageId: markerMessageId()
		});
		const truncated = markerPlan !== null && markerPlan.range !== null;
		if (markerPlan !== null) try {
			const marker = appendRollbackMarker(session, markerPlan);
			fold.setTail(marker.seq);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`回退失败：工作区文件已恢复，但对话截断未能写入（${message}）。请重试回退。`);
		}
		fold.dropFromExcept(fromTurn, new Set(skipped.map((entry) => entry.path)));
		if (typeof session.id === "string" && session.id !== "") this.rescan.forget(session.id);
		return {
			fromTurn,
			executed: true,
			truncated,
			restored,
			skipped,
			summary: summarize({
				fromTurn,
				restored,
				skipped,
				truncation: markerPlan?.range ?? null
			}, { removedDirs })
		};
	}
};
//#endregion
//#region src/index.ts
const name = "rollback";
const inject = [
	"fs",
	"sessions",
	"tools",
	"commands",
	"sandboxPolicy"
];
const WINDOW_HINT = `(仅最近 10 轮)`;
/**
* Runtime context the model reads every request.
*
* A file changed only through a shell command is invisible to this plugin, so it
* cannot be rolled back — steering content changes to the file tools is what keeps
* them inside the captured path. Phrased as the consequence rather than as a rule,
* so it stays true whatever the model decides.
*/
const FILE_TOOL_HINT = "Only files touched by the write/edit tools are tracked for rollback; change file contents with those tools rather than a shell command.";
/**
* Resolve the calling session, tolerating both `Agent` shapes.
*
* `invocation.agent.session` is the direct route the runtime augmentation
* provides; `ctx.sessions.get(agent.id)` is the typed route that survives the
* augmentation being dropped. Both are tried, direct first, because the direct
* one cannot be confused by a stale store entry.
* @param ctx - the plugin context (for the session store).
* @param agent - the invocation's agent.
* @returns the session, or undefined when neither route resolves one.
*/
function sessionOf(ctx, agent) {
	const direct = agent?.session;
	if (direct !== void 0 && direct !== null) return direct;
	const id = agent?.id;
	if (typeof id !== "string" || id === "") return void 0;
	return ctx.sessions.get(id);
}
/**
* Format a plan's affected-file list into the shared preview format.
*
* The same text is what the browser parses back into the confirmation dialog, so
* the diff is rendered HERE, once, under ONE convention: `-` is content the
* rollback TAKES OFF the disk, `+` is content it WRITES BACK. A `delete` loses the
* file's recorded content, a `recover` brings the pre-turn content back, and a
* `restore` trades the span's output for the pre-turn content. Rendering a
* restore the other way round told the user the opposite of what the button was
* about to do.
*
* The total diff budget keeps one preview from flooding the command receipt,
* which lands in the session log; files past the budget keep their entry line and
* say so.
* @param plan - the plan to render.
* @param header - the localized header sentence.
* @returns the text block the command returns and the client parses.
*/
function planText(plan, header) {
	const lines = [header];
	let budget = 160;
	for (const file of plan.restored) {
		const entry = {
			action: file.action,
			path: file.path
		};
		const current = file.after;
		const target = file.action === "delete" ? "" : file.content ?? "";
		if (current === null) {
			lines.push(...renderEntry(file.action === "delete" ? entry : {
				...entry,
				note: "跳过预览"
			}));
			continue;
		}
		if (budget > 0 && diffable(current, target)) {
			const diff = cappedDiff(current, target, Math.min(24, budget));
			budget -= diff.lines.length;
			lines.push(...renderEntry({
				...entry,
				added: diff.added,
				removed: diff.removed,
				diff: diff.lines,
				...diff.note === void 0 ? {} : { note: diff.note }
			}));
			continue;
		}
		lines.push(...renderEntry(entry));
	}
	for (const file of plan.skipped) lines.push(...renderEntry({
		action: "skip",
		path: file.path,
		note: file.reason
	}));
	lines.push(`  对话截断：${plan.truncation === null ? "否" : "将截断"}`);
	return lines.join("\n");
}
/** List the turns the sliding window can still roll back to. */
function listText(service, session) {
	const turns = service.foldFor(session).snapshots().map((cp) => cp.turn);
	if (turns.length === 0) return `当前会话没有可回退的轮次。${WINDOW_HINT}`;
	return `可回退到的轮次：${turns.join(", ")} ${WINDOW_HINT}`;
}
/** The exact usage line, so every rejection names the same grammar. */
const USAGE = "/rollback [list | doctor | preview <turn> | <turn> | undo-last]";
function apply(ctx) {
	const service = new RollbackService(ctx);
	installRootWriteFallback(ctx);
	ctx.inject(["systemPrompt"], (scope) => {
		scope.systemPrompt.context({
			name: "rollback:file-tools",
			order: 199,
			text: () => FILE_TOOL_HINT
		});
	});
	ctx.commands.register({
		name: "rollback",
		description: "回退到某一轮对话发起前（恢复文件并截断对话，同一会话）",
		input: { hint: "[list | doctor | preview <turn> | <turn> | undo-last]" },
		async handler(invocation) {
			const raw = invocation.rawInput.trim();
			const head = raw.split(/\s+/, 1)[0] ?? "";
			try {
				if (head === "doctor") return {
					kind: "success",
					text: formatAudit(await auditContracts(ctx))
				};
				const session = sessionOf(ctx, invocation.agent);
				if (session === void 0) return {
					kind: "error",
					text: "无法定位当前会话：Agent 既没有 session 也没有可解析的 id。请运行 /rollback doctor 查看契约诊断。"
				};
				if (raw === "" || head === "list") return {
					kind: "success",
					text: listText(service, session)
				};
				if (head === "doctor") return {
					kind: "success",
					text: formatAudit(await auditContracts(ctx))
				};
				if (head === "undo-last" || head === "undo") {
					const turns = service.foldFor(session).snapshots().map((cp) => cp.turn);
					if (turns.length === 0) return {
						kind: "error",
						text: `当前会话没有可回退的轮次。${WINDOW_HINT}`
					};
					const turn = Math.max(...turns);
					return {
						kind: "success",
						text: (await service.execute(session, turn, invocation.signal)).summary
					};
				}
				if (head === "preview") {
					const rest = raw.slice(7).trim();
					if (rest === "last") {
						const turns = service.foldFor(session).snapshots().map((cp) => cp.turn);
						if (turns.length === 0) return {
							kind: "error",
							text: `当前会话没有可回退的轮次。${WINDOW_HINT}`
						};
						const turn = Math.max(...turns);
						return {
							kind: "success",
							text: planText(await service.preview(session, turn), `回退到第 ${turn} 轮发起前（最后一轮），受影响文件：`)
						};
					}
					const turn = Number(rest);
					if (!Number.isSafeInteger(turn) || turn < 1) return {
						kind: "error",
						text: `用法：${USAGE}   （turn 为正整数轮次）`
					};
					return {
						kind: "success",
						text: planText(await service.preview(session, turn), `回退到第 ${turn} 轮发起前，受影响文件：`)
					};
				}
				const turn = Number(raw);
				if (!Number.isSafeInteger(turn) || turn < 1) return {
					kind: "error",
					text: `用法：${USAGE}`
				};
				return {
					kind: "success",
					text: (await service.execute(session, turn, invocation.signal)).summary
				};
			} catch (error) {
				return {
					kind: "error",
					text: `回退失败：${error instanceof Error ? error.message : String(error)}`
				};
			}
		}
	});
}
//#endregion
export { apply, inject, name };
