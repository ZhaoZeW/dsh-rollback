/**
 * Affected-file preview: the shared wire format between the host and the browser.
 *
 * The host renders `/rollback preview <turn>` into text; the client parses the very
 * same text to draw the confirmation dialog. Both sides therefore agree by
 * construction rather than by two hand-kept copies — a drift between them is how a
 * dialog once showed one thing while the host did another.
 *
 * Format (one block per file):
 *
 * ```text
 * 回退到第 3 轮发起前，受影响文件：
 *   [恢复] C:\work\a.txt  (+3/-1)
 *     @@ line 12 @@
 *     - old line
 *     + new line
 *   [删除] C:\work\b.txt
 *   对话截断：将截断
 * ```
 *
 * The tag brackets stay the anchor the parser keys on; everything else is
 * optional decoration, so a preview from an older build still parses (with no
 * diff) instead of being dropped.
 *
 * `note` is free-form data, not a closed vocabulary: `renderEntry` emits whatever
 * the producer recorded (`binary`, `too-large`, `diff-truncated`, `跳过预览`,
 * `basis-unknown`, `io-error: …`) and `parsePreview` accepts any parenthesised
 * line, so adding a reason never needs a matching parser change. Presentation
 * (localising a reason, deciding an icon) belongs to the caller; this module only
 * carries the token.
 *
 * Pure and environment-free: it is bundled for the browser as well as the host,
 * so nothing here may touch a Node global.
 *
 * @module @nianchu/dsh-rollback/core/preview-format
 */

/** The four things a rollback can do to one file. */
export type PreviewAction = 'restore' | 'recover' | 'delete' | 'skip'

/** One affected file as both halves understand it. */
export interface PreviewEntry {
  readonly action: PreviewAction
  readonly path: string
  /** Added lines in the change, when the host knew the before-state. */
  readonly added?: number
  /** Removed lines in the change, when the host knew the before-state. */
  readonly removed?: number
  /** Unified-diff body, already truncated and without the file header. */
  readonly diff?: readonly string[]
  /** Why the change cannot be previewed, when it cannot (`binary`, `too-large`). */
  readonly note?: string
}

/** Tag spelling per action, in both locales. */
const TAGS: Readonly<Record<PreviewAction, readonly string[]>> = {
  restore: ['恢复', 'restore'],
  recover: ['找回', 'recover'],
  delete: ['删除', 'delete'],
  skip: ['跳过', 'skip'],
}

/** The bracket form of one action's tag. */
export function tagOf(action: PreviewAction): string {
  return `[${TAGS[action][0]}]`
}

/** Map a tag's inner text (either locale) back to an action. */
function actionOf(inner: string): PreviewAction | undefined {
  const needle = inner.trim().toLowerCase()
  for (const action of Object.keys(TAGS) as PreviewAction[]) {
    if (TAGS[action].some(tag => tag.toLowerCase() === needle)) return action
  }
  return undefined
}

/** Per-file diff budget, so one huge file cannot dominate the receipt. */
export const MAX_PREVIEW_DIFF_LINES = 24
/** Total diff budget across one preview. */
export const MAX_PREVIEW_DIFF_TOTAL = 160
/** Longest single diff line rendered. */
export const MAX_PREVIEW_LINE_CHARS = 200
/** Content larger than this is not diffed at all. */
export const MAX_PREVIEW_CONTENT_BYTES = 256 * 1024

/** The diff of one entry, capped, plus its line counts. */
export interface CappedDiff {
  readonly added: number
  readonly removed: number
  readonly lines: readonly string[]
  /** Set when the body was truncated or skipped. */
  readonly note?: string
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
function linesOf(text: string): string[] {
  return text === '' ? [] : text.split('\n')
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
export function cappedDiff(before: string, after: string, budget = MAX_PREVIEW_DIFF_LINES): CappedDiff {
  const beforeLines = linesOf(before)
  const afterLines = linesOf(after)

  // Trim the shared prefix and suffix first: the interesting part of a small
  // edit inside a large file is not the file.
  let head = 0
  while (head < beforeLines.length && head < afterLines.length && beforeLines[head] === afterLines[head]) head++
  let tail = 0
  while (
    tail < beforeLines.length - head
    && tail < afterLines.length - head
    && beforeLines[beforeLines.length - 1 - tail] === afterLines[afterLines.length - 1 - tail]
  ) tail++

  const removedLines = beforeLines.slice(head, beforeLines.length - tail)
  const addedLines = afterLines.slice(head, afterLines.length - tail)
  const removed = removedLines.length
  const added = addedLines.length

  const body: string[] = []
  for (const line of removedLines) body.push(`- ${clampLine(line)}`)
  for (const line of addedLines) body.push(`+ ${clampLine(line)}`)

  if (body.length === 0) {
    return { added: 0, removed: 0, lines: [] }
  }

  const context = `@@ 第 ${head + 1} 行起 @@`
  if (body.length <= budget) {
    return { added, removed, lines: [context, ...body] }
  }

  // Keep both ends of the change: the first lines explain the intent and the last
  // ones usually show how it was closed. The context line and the ellipsis cost
  // two lines before either window can show anything, so the two windows split
  // exactly what is left — a budget that overshoots is how one preview floods the
  // command receipt the budget exists to protect.
  if (budget < 4) {
    return { added, removed, lines: [context], note: 'diff-truncated' }
  }
  const side = Math.floor((budget - 2) / 2)
  const kept = [
    ...body.slice(0, side),
    `… 省略 ${body.length - side * 2} 行 …`,
    ...body.slice(body.length - side),
  ]
  return { added, removed, lines: [context, ...kept], note: 'diff-truncated' }
}

/** Clamp one diff line to the transport budget. */
function clampLine(line: string): string {
  const normalized = line.replace(/\r$/, '')
  return normalized.length <= MAX_PREVIEW_LINE_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_PREVIEW_LINE_CHARS)}…`
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
function utf8Bytes(text: string): number {
  let bytes = 0
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
  }
  return bytes
}

/** Whether a change is worth diffing at all. */
export function diffable(before: string | null, after: string | null): boolean {
  if (before === null || after === null) return false
  if (before === after) return false
  if (before.includes('\u0000') || after.includes('\u0000')) return false
  return utf8Bytes(before) <= MAX_PREVIEW_CONTENT_BYTES
    && utf8Bytes(after) <= MAX_PREVIEW_CONTENT_BYTES
}

/**
 * Render one entry as its text block.
 * @param entry - the entry to render.
 * @returns the lines of the block, without a trailing newline.
 */
export function renderEntry(entry: PreviewEntry): string[] {
  const stats = entry.added === undefined || entry.removed === undefined
    ? ''
    : `  (+${entry.added}/-${entry.removed})`
  const lines = [`  ${tagOf(entry.action)} ${entry.path}${stats}`]
  if (entry.note !== undefined) lines.push(`    (${entry.note})`)
  for (const line of entry.diff ?? []) lines.push(`    ${line}`)
  return lines
}

/**
 * Parse the host's preview text back into entries.
 *
 * Lines that are not a file block are ignored, so the trailing
 * `对话截断：…` summary and any future addition ride along harmlessly.
 * @param text - the command's output text.
 * @returns the parsed entries, in host order.
 */
export function parsePreview(text: string | null | undefined): PreviewEntry[] {
  if (text === null || text === undefined || text === '') return []
  const out: PreviewEntry[] = []
  let current: {
    action: PreviewAction
    path: string
    added?: number
    removed?: number
    diff: string[]
    note?: string
  } | undefined

  const flush = (): void => {
    if (current === undefined) return
    out.push({
      action: current.action,
      path: current.path,
      ...(current.added === undefined ? {} : { added: current.added }),
      ...(current.removed === undefined ? {} : { removed: current.removed }),
      ...(current.diff.length === 0 ? {} : { diff: current.diff }),
      ...(current.note === undefined ? {} : { note: current.note }),
    })
    current = undefined
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const file = /^\s*\[([^\]]+)\]\s+(.+?)\s*$/.exec(line)
    if (file !== null) {
      const action = actionOf(file[1]!)
      if (action !== undefined) {
        flush()
        const rest = file[2]!
        const stats = /^(.*?)\s*\(\+(\d+)\/-(\d+)\)$/.exec(rest)
        current = stats !== null
          ? { action, path: stats[1]!.trim(), added: Number(stats[2]), removed: Number(stats[3]), diff: [] }
          : { action, path: rest.trim(), diff: [] }
        continue
      }
    }
    if (current === undefined) continue
    // Any parenthesised line is a note. The parser deliberately does NOT keep a
    // copy of the vocabulary `renderEntry` emits: an allowlist here silently
    // turned every reason it did not list (`basis-unknown`, `io-error: …`) into a
    // diff body row, which the dialog then drew as if it were file content.
    const note = /^\s*\((.+)\)\s*$/.exec(line)
    if (note !== null) {
      current.note = note[1]!
      continue
    }
    if (/^\s{4}/.test(line)) {
      current.diff.push(line.trim())
      continue
    }
    // A non-indented, non-file line ends the current block.
    if (line.trim() === '') continue
    flush()
  }
  flush()
  return out
}
