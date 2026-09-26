/**
 * Regression suite for the host/browser preview wire format.
 *
 * `preview-format` is the one module both halves of the plugin share: the host
 * renders `/rollback preview <turn>` with `renderEntry`, the browser parses the
 * same text back with `parsePreview`. A drift between the two is invisible in
 * isolation and shows up as a confirmation dialog that promises something other
 * than what the button does — so the round trip is asserted here, not assumed.
 *
 * Covered: `cappedDiff` (counts, caps, truncation, line budgets), `renderEntry`,
 * `parsePreview` (round trip, tolerances, block boundaries), `diffable`
 * (content cap, byte accounting) and browser-bundle safety.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cappedDiff,
  diffable,
  MAX_PREVIEW_CONTENT_BYTES,
  MAX_PREVIEW_DIFF_LINES,
  MAX_PREVIEW_DIFF_TOTAL,
  MAX_PREVIEW_LINE_CHARS,
  parsePreview,
  renderEntry,
  tagOf,
  type PreviewEntry,
} from '../src/core/preview-format.ts'

/** `n` lines `prefix0`, `prefix1`, … — no trailing newline, no blank line. */
function lines(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`).join('\n')
}

describe('preview-format constants', () => {
  it('exposes the transport budgets both halves rely on', () => {
    expect(MAX_PREVIEW_DIFF_LINES).toBe(24)
    expect(MAX_PREVIEW_DIFF_TOTAL).toBe(160)
    expect(MAX_PREVIEW_LINE_CHARS).toBe(200)
    expect(MAX_PREVIEW_CONTENT_BYTES).toBe(256 * 1024)
    // The per-file budget must fit inside the whole-preview budget, or one file
    // could never be shown in full.
    expect(MAX_PREVIEW_DIFF_LINES).toBeLessThanOrEqual(MAX_PREVIEW_DIFF_TOTAL)
  })
})

describe('tagOf', () => {
  it('names every action with the Chinese tag the host emits', () => {
    expect(tagOf('restore')).toBe('[恢复]')
    expect(tagOf('recover')).toBe('[找回]')
    expect(tagOf('delete')).toBe('[删除]')
    expect(tagOf('skip')).toBe('[跳过]')
  })
})

describe('cappedDiff', () => {
  it('reports no diff for identical content', () => {
    expect(cappedDiff('a\nb', 'a\nb')).toEqual({ added: 0, removed: 0, lines: [] })
  })

  it('diffs a one-line update and anchors the context line at the first change', () => {
    const diff = cappedDiff('a\nb\nc', 'a\nB\nc')
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.note).toBeUndefined()
    expect(diff.lines).toEqual(['@@ 第 2 行起 @@', '- b', '+ B'])
  })

  it('diffs an append as added lines only, anchored after the shared prefix', () => {
    const diff = cappedDiff('a\nb', 'a\nb\nc')
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(0)
    expect(diff.lines).toEqual(['@@ 第 3 行起 @@', '+ c'])
  })

  it('diffs a deletion as removed lines only', () => {
    const diff = cappedDiff('a\nb\nc', 'a\nc')
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(1)
    expect(diff.lines).toEqual(['@@ 第 2 行起 @@', '- b'])
  })

  // Regression: `''.split('\n')` is `['']`, i.e. one phantom empty line. That made
  // a created file render as `(+1/-0)` with a spurious `+ ` row and a removed file
  // as if one blank line had been deleted.
  it('treats an empty text as zero lines, not one blank line', () => {
    const created = cappedDiff('', 'x')
    expect(created.added).toBe(1)
    expect(created.removed).toBe(0)
    expect(created.lines).toEqual(['@@ 第 1 行起 @@', '+ x'])

    const deleted = cappedDiff('x', '')
    expect(deleted.added).toBe(0)
    expect(deleted.removed).toBe(1)
    expect(deleted.lines).toEqual(['@@ 第 1 行起 @@', '- x'])

    expect(cappedDiff('', '')).toEqual({ added: 0, removed: 0, lines: [] })
  })

  // Characterisation, not a wish: lines are counted by splitting on '\n', so a
  // text WITH a trailing newline carries a trailing empty line. Pinned here so a
  // future change to line counting is a deliberate one.
  it('counts every \\n-separated segment, including the one after a trailing newline', () => {
    const diff = cappedDiff('', '\n')
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(0)
    expect(diff.lines).toEqual(['@@ 第 1 行起 @@', '+ ', '+ '])
  })

  it('never emits a carriage return, so CRLF files do not desync the parser', () => {
    const diff = cappedDiff('a\r\nb\r', 'A\r\nB\r')
    expect(diff.removed).toBe(2)
    expect(diff.added).toBe(2)
    for (const line of diff.lines) expect(line).not.toContain('\r')
    expect(diff.lines).toEqual(['@@ 第 1 行起 @@', '- a', '- b', '+ A', '+ B'])
  })

  it('clamps an over-long line to the transport budget and says it did', () => {
    const long = 'x'.repeat(MAX_PREVIEW_LINE_CHARS + 40)
    const diff = cappedDiff(long, 'short')
    const removedRow = diff.lines[1]!
    expect(removedRow.startsWith('- ')).toBe(true)
    expect(removedRow.endsWith('…')).toBe(true)
    // "- " prefix + MAX_PREVIEW_LINE_CHARS content + the ellipsis character.
    expect(removedRow.length).toBe(2 + MAX_PREVIEW_LINE_CHARS + 1)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
  })

  it('keeps both ends of a long change, refuses to overshoot the budget and counts exactly', () => {
    const diff = cappedDiff(lines('o', 30), lines('n', 30), 24)
    expect(diff.added).toBe(30)
    expect(diff.removed).toBe(30)
    expect(diff.note).toBe('diff-truncated')
    // context line + 11 kept rows + ellipsis + 11 kept rows, never more than 24.
    expect(diff.lines.length).toBeLessThanOrEqual(24)
    expect(diff.lines[0]).toBe('@@ 第 1 行起 @@')
    expect(diff.lines[1]).toBe('- o0')
    expect(diff.lines[diff.lines.length - 1]).toBe('+ n29')
    expect(diff.lines).toContain(`… 省略 ${60 - 22} 行 …`)
  })

  it('respects every budget from 4 up without ever exceeding it', () => {
    for (let budget = 4; budget <= 24; budget++) {
      const diff = cappedDiff(lines('o', 40), lines('n', 40), budget)
      expect(diff.added, `budget ${budget}`).toBe(40)
      expect(diff.removed, `budget ${budget}`).toBe(40)
      expect(diff.note, `budget ${budget}`).toBe('diff-truncated')
      expect(diff.lines.length, `budget ${budget}`).toBeLessThanOrEqual(budget)
    }
  })

  it('degrades to the context line alone when the budget cannot hold a window', () => {
    for (const budget of [1, 2, 3]) {
      const diff = cappedDiff(lines('o', 5), lines('n', 5), budget)
      expect(diff.lines, `budget ${budget}`).toEqual(['@@ 第 1 行起 @@'])
      expect(diff.note, `budget ${budget}`).toBe('diff-truncated')
      // The counts stay exact even when nothing can be shown.
      expect(diff.added, `budget ${budget}`).toBe(5)
      expect(diff.removed, `budget ${budget}`).toBe(5)
    }
  })

  it('does not truncate when the body exactly fills the budget', () => {
    // 3 removed + 3 added = 6 body rows, budget 6.
    const diff = cappedDiff('o0\no1\no2', 'n0\nn1\nn2', 6)
    expect(diff.note).toBeUndefined()
    expect(diff.lines.length).toBe(7)
  })
})

describe('renderEntry', () => {
  it('renders the tag, the path, the counts, the note and the diff body in one block', () => {
    expect(renderEntry({
      action: 'restore',
      path: 'C:\\work\\a.txt',
      added: 3,
      removed: 1,
      diff: ['@@ 第 12 行起 @@', '- old', '+ new'],
    })).toEqual([
      '  [恢复] C:\\work\\a.txt  (+3/-1)',
      '    @@ 第 12 行起 @@',
      '    - old',
      '    + new',
    ])
  })

  it('omits the count suffix when either count is unknown', () => {
    expect(renderEntry({ action: 'delete', path: '/b.txt' })).toEqual(['  [删除] /b.txt'])
    expect(renderEntry({ action: 'delete', path: '/b.txt', added: 2 })).toEqual(['  [删除] /b.txt'])
    expect(renderEntry({ action: 'delete', path: '/b.txt', removed: 2 })).toEqual(['  [删除] /b.txt'])
  })

  it('prints explicit zero counts rather than dropping them', () => {
    expect(renderEntry({ action: 'recover', path: '/gone', added: 1, removed: 0 }))
      .toEqual(['  [找回] /gone  (+1/-0)'])
  })

  it('puts the note before the diff body and prints it in parentheses', () => {
    expect(renderEntry({ action: 'restore', path: '/a', note: 'binary', diff: ['- x'] }))
      .toEqual(['  [恢复] /a', '    (binary)', '    - x'])
  })
})

describe('parsePreview', () => {
  it('returns nothing for empty, null or undefined input', () => {
    expect(parsePreview('')).toEqual([])
    expect(parsePreview(null)).toEqual([])
    expect(parsePreview(undefined)).toEqual([])
    expect(parsePreview('   \n\n')).toEqual([])
  })

  it('round-trips every action through renderEntry', () => {
    const entries: PreviewEntry[] = [
      { action: 'restore', path: 'C:\\a.txt', added: 1, removed: 1, diff: ['@@ 第 2 行起 @@', '- b', '+ B'] },
      { action: 'recover', path: '/gone.txt', added: 1, removed: 0, diff: ['@@ 第 1 行起 @@', '+ back'] },
      { action: 'delete', path: '/new.txt', added: 0, removed: 1, diff: ['@@ 第 1 行起 @@', '- gone'] },
      { action: 'skip', path: '/bin.dat', note: 'basis-unknown' },
    ]
    const text = entries.flatMap(entry => renderEntry(entry)).join('\n')
    expect(parsePreview(text)).toEqual(entries)
  })

  it('parses the host text that index.ts actually produces, footer and all', () => {
    // Mirrors `planText`: a header line, one block per file, the skip block and
    // the truncation footer. The header/footer must not become entries, and the
    // 2-space-indented footer must not be swallowed as diff content.
    const text = [
      '回退到第 3 轮发起前，受影响文件：',
      ...renderEntry({
        action: 'restore',
        path: 'C:\\work\\a.txt',
        added: 1,
        removed: 1,
        diff: ['@@ 第 12 行起 @@', '- old', '+ new'],
      }),
      ...renderEntry({ action: 'skip', path: 'C:\\work\\bin.dat', note: 'basis-unknown' }),
      '  对话截断：将截断',
    ].join('\n')

    expect(parsePreview(text)).toEqual([
      { action: 'restore', path: 'C:\\work\\a.txt', added: 1, removed: 1, diff: ['@@ 第 12 行起 @@', '- old', '+ new'] },
      { action: 'skip', path: 'C:\\work\\bin.dat', note: 'basis-unknown' },
    ])
  })

  it('accepts the English tag spelling of every action', () => {
    const text = ['  [restore] /a', '  [recover] /b', '  [delete] /c', '  [skip] /d'].join('\n')
    expect(parsePreview(text).map(entry => entry.action)).toEqual(['restore', 'recover', 'delete', 'skip'])
  })

  it('parses a preview from an older build that carries no counts and no diff', () => {
    expect(parsePreview('  [恢复] /a.txt')).toEqual([{ action: 'restore', path: '/a.txt' }])
  })

  it('keeps a path containing spaces intact', () => {
    expect(parsePreview('  [恢复] C:\\my dir\\a b.txt  (+1/-2)'))
      .toEqual([{ action: 'restore', path: 'C:\\my dir\\a b.txt', added: 1, removed: 2 }])
  })

  it('tolerates CRLF line endings', () => {
    const text = '  [恢复] /a  (+1/-1)\r\n    @@ 第 1 行起 @@\r\n    - x\r\n    + y\r\n'
    expect(parsePreview(text)).toEqual([
      { action: 'restore', path: '/a', added: 1, removed: 1, diff: ['@@ 第 1 行起 @@', '- x', '+ y'] },
    ])
  })

  it('keeps any parenthesised reason as the note, including ones an allowlist would drop', () => {
    const reasons = ['binary', 'too-large', 'diff-truncated', '跳过预览', 'basis-unknown', 'io-error: EPERM']
    for (const reason of reasons) {
      expect(parsePreview(renderEntry({ action: 'skip', path: '/a', note: reason }).join('\n')), reason)
        .toEqual([{ action: 'skip', path: '/a', note: reason }])
    }
  })

  // Regression: an allowlisted note vocabulary silently turned every reason it did
  // not list into a diff row, which the dialog drew as if it were file content.
  it('never turns an unlisted note into a diff row', () => {
    const parsed = parsePreview(renderEntry({ action: 'skip', path: '/a', note: 'io-error: EPERM' }).join('\n'))
    expect(parsed[0]!.note).toBe('io-error: EPERM')
    expect(parsed[0]!.diff).toBeUndefined()
  })

  it('does not let a diff row that looks like a tag start a new entry', () => {
    const entry: PreviewEntry = {
      action: 'restore',
      path: '/a',
      added: 1,
      removed: 0,
      diff: ['@@ 第 1 行起 @@', '+ [恢复] /fake'],
    }
    const parsed = parsePreview(renderEntry(entry).join('\n'))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.path).toBe('/a')
    expect(parsed[0]!.diff).toEqual(['@@ 第 1 行起 @@', '+ [恢复] /fake'])
  })

  it('ends a block on a non-indented line so two blocks never merge', () => {
    const text = ['  [恢复] /a', '  对话截断：否', '  [删除] /b'].join('\n')
    expect(parsePreview(text)).toEqual([
      { action: 'restore', path: '/a' },
      { action: 'delete', path: '/b' },
    ])
  })

  it('ignores an unknown tag instead of inventing an entry', () => {
    expect(parsePreview('  [其他] /a')).toEqual([])
  })

  it('ignores a tag line that has no path', () => {
    expect(parsePreview('  [恢复]')).toEqual([])
  })
})

describe('diffable', () => {
  it('refuses when either side of the change is unknown', () => {
    expect(diffable(null, 'x')).toBe(false)
    expect(diffable('x', null)).toBe(false)
    expect(diffable(null, null)).toBe(false)
  })

  it('refuses when nothing changed', () => {
    expect(diffable('x', 'x')).toBe(false)
    expect(diffable('', '')).toBe(false)
  })

  it('refuses binary content', () => {
    expect(diffable('a\u0000b', 'c')).toBe(false)
    expect(diffable('a', 'c\u0000d')).toBe(false)
  })

  it('accepts content exactly at the byte cap and refuses one byte past it', () => {
    const at = 'a'.repeat(MAX_PREVIEW_CONTENT_BYTES)
    const over = 'a'.repeat(MAX_PREVIEW_CONTENT_BYTES + 1)
    // Self-check the fixture against Node's own byte count.
    expect(Buffer.byteLength(at, 'utf8')).toBe(MAX_PREVIEW_CONTENT_BYTES)
    expect(Buffer.byteLength(over, 'utf8')).toBe(MAX_PREVIEW_CONTENT_BYTES + 1)
    expect(diffable(at, 'x')).toBe(true)
    expect(diffable(over, 'x')).toBe(false)
    expect(diffable('x', over)).toBe(false)
  })

  it('measures multi-byte text in bytes, not code units', () => {
    const cjkAt = '汉'.repeat(87_381)          // 262143 bytes
    const cjkOver = '汉'.repeat(87_382)        // 262146 bytes
    expect(Buffer.byteLength(cjkAt, 'utf8')).toBeLessThanOrEqual(MAX_PREVIEW_CONTENT_BYTES)
    expect(Buffer.byteLength(cjkOver, 'utf8')).toBeGreaterThan(MAX_PREVIEW_CONTENT_BYTES)
    expect(diffable(cjkAt, 'x')).toBe(true)
    expect(diffable(cjkOver, 'x')).toBe(false)
  })

  it('measures astral characters as four bytes each', () => {
    const emojiAt = '😀'.repeat(65_536)        // 262144 bytes
    const emojiOver = '😀'.repeat(65_537)      // 262148 bytes
    expect(Buffer.byteLength(emojiAt, 'utf8')).toBe(MAX_PREVIEW_CONTENT_BYTES)
    expect(diffable(emojiAt, 'x')).toBe(true)
    expect(diffable(emojiOver, 'x')).toBe(false)
  })

  // A lone surrogate encodes as the 3-byte replacement character; the cap must
  // agree with Node's own arithmetic, because a browser and the host both apply it.
  it('agrees with Node on lone surrogates', () => {
    const at = '\uD800'.repeat(87_381)         // 262143 bytes
    const over = '\uD800'.repeat(87_382)       // 262146 bytes
    expect(Buffer.byteLength(at, 'utf8')).toBeLessThanOrEqual(MAX_PREVIEW_CONTENT_BYTES)
    expect(Buffer.byteLength(over, 'utf8')).toBeGreaterThan(MAX_PREVIEW_CONTENT_BYTES)
    expect(diffable(at, 'x')).toBe(true)
    expect(diffable(over, 'x')).toBe(false)
  })
})

describe('browser bundle safety', () => {
  it('does not reference a Node-only global in its source', () => {
    // The client half bundles this module for the page, where `Buffer` and
    // `process` do not exist. A single `Buffer.byteLength` is a ReferenceError the
    // moment the browser calls `diffable`. Comments may (and do) explain the
    // history, so they are stripped before the scan.
    const source = readFileSync(new URL('../src/core/preview-format.ts', import.meta.url), 'utf8')
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map(line => line.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(code).not.toMatch(/\bBuffer\b/)
    expect(code).not.toMatch(/\bprocess\./)
    expect(code).not.toMatch(/\brequire\s*\(/)
    expect(code).not.toMatch(/from\s+'node:/)
    expect(code).not.toMatch(/from\s+"node:/)
  })

  it('keeps working with the Buffer global removed', () => {
    const holder = globalThis as { Buffer?: unknown }
    const saved = holder.Buffer
    let dropped = false
    try {
      dropped = delete holder.Buffer
      expect(diffable('a', 'b')).toBe(true)
      expect(diffable('a', 'a')).toBe(false)
      expect(diffable('a'.repeat(MAX_PREVIEW_CONTENT_BYTES + 1), 'b')).toBe(false)
    } finally {
      if (saved !== undefined) holder.Buffer = saved
    }
    // If this runtime refused the delete, the source scan above is the guard that
    // still holds; the runtime probe simply had nothing to prove.
    expect(typeof dropped).toBe('boolean')
  })
})
