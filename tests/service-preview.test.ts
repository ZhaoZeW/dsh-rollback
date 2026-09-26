/**
 * Regression suite for `RollbackService.preview()`'s disk refresh.
 *
 * `preview()` does not trust the recorded post-state: for every file the plan
 * will touch it re-reads the file through the session's sandbox policy and
 * overwrites `RestoredFile.after` with what is on the disk RIGHT NOW. That single
 * decision carries three claims worth pinning:
 *
 *   1. `after` is current reality, not the record â€?later turns, a shell command
 *      or the user's own editor can all have moved on since the span ended;
 *   2. `after === null` means "could not read" (deleted / unreadable / outside the
 *      resolved root), while `after === ''` means "the file really is empty" â€? *      the two must never be conflated, because the first renders `(è·³è¿‡é¢„è§ˆ)` and
 *      the second renders a real diff;
 *   3. nothing about the current file depends on the durable sidecar, so a preview
 *      taken after a restart is the same preview (no "restart cliff").
 *
 * The plan is the only input the host's preview text is a pure function of
 * (`planText` renders `restored` + `truncation`), so equal plans are equal text.
 */
import { describe, expect, it } from 'vitest'
import { RollbackService } from '../src/service.ts'

interface ResolveCall {
  readonly path: string
  readonly options: unknown
}

/** One file the plan must act on, spelled the way the fold records a change. */
interface Mutation {
  readonly path: string
  readonly operation: 'create' | 'update' | 'remove'
  readonly before: string | null
  readonly after: string
}

interface HarnessOptions {
  /** Current content per display path; a thrown value models an unreadable file. */
  readonly disk?: Readonly<Record<string, string | Error>>
  /** Whether `fs.resolve` itself fails. */
  readonly resolveThrows?: boolean
  /** Whether `sandboxPolicy.resolve` fails (no workspace root to resolve against). */
  readonly policyThrows?: boolean
  /** Absolute path handed to `fs.resolve` as the workspace root. */
  readonly workspaceRoot?: string
}

/** A service with a fully controllable filesystem, plus the calls it made. */
function harness(options: HarnessOptions = {}) {
  const calls: ResolveCall[] = []
  const reads: string[] = []
  const disk = options.disk ?? {}
  const workspaceRoot = options.workspaceRoot ?? '/workspace'

  const ctx = {
    on: () => {},
    emit: () => {},
    sessions: { get: () => undefined, list: () => [] },
    sandboxPolicy: {
      resolve: () => {
        if (options.policyThrows === true) throw new Error('no policy')
        return { mode: 'workspace-write', workspaceRoot }
      },
    },
    fs: {
      resolve: async (path: string, resolveOptions: unknown) => {
        calls.push({ path, options: resolveOptions })
        if (options.resolveThrows === true) throw new Error('resolve refused')
        return { displayPath: path, target: path }
      },
      readText: async (target: { displayPath?: string }) => {
        const path = target.displayPath ?? ''
        reads.push(path)
        const value = disk[path]
        if (value instanceof Error) throw value
        return value ?? ''
      },
      processPath: (target: unknown) => target,
      stat: async () => undefined,
      writeText: async () => ({}),
      editText: async () => ({}),
    },
  }

  const service = new RollbackService(ctx as never)
  /**
   * A session object with no string id (`preview()` then skips the durable
   * re-scan) and an empty model-visible surface, which is all `preview()` reads
   * besides the fold.
   */
  const session = { events: [], surface: { nodes: [] } } as never

  /** Fold one turn, with or without a file change, the way the observer would. */
  const seedTurn = (turn: number, mutation?: Mutation): void => {
    const fold = service.foldFor(session)
    fold.fold({ kind: 'turn-start', turn, seq: turn * 2 - 2 })
    fold.fold({ kind: 'surface', seq: turn * 2 - 1 })
    if (mutation !== undefined) fold.fold({ kind: 'fs-mutation', mutation })
    fold.fold({ kind: 'turn-end', turn, seq: turn * 2 - 1 })
  }

  return { service, session, seedTurn, calls, reads, workspaceRoot }
}

const UPDATED: Mutation = { path: 'notes.txt', operation: 'update', before: 'OLD', after: 'stale record' }
const CREATED: Mutation = { path: 'new.txt', operation: 'create', before: null, after: 'created' }

describe('preview() â€?after is read from disk', () => {
  it('overwrites the recorded post-state with the current file content', async () => {
    const h = harness({ disk: { 'notes.txt': 'CURRENT' } })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored).toEqual([
      { path: 'notes.txt', action: 'restore', content: 'OLD', kind: 'updated', after: 'CURRENT' },
    ])
    expect(plan.fromTurn).toBe(1)
    expect(h.reads).toEqual(['notes.txt'])
  })

  it('refresh a created file too, so a delete preview can show what it removes', async () => {
    const h = harness({ disk: { 'new.txt': 'CURRENT' } })
    h.seedTurn(1, CREATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored).toEqual([
      { path: 'new.txt', action: 'delete', content: null, kind: 'created', after: 'CURRENT' },
    ])
  })

  it('reads every file in the plan, keeping the plan order', async () => {
    const h = harness({ disk: { 'a.txt': 'A-now', 'b.txt': 'B-now' } })
    h.seedTurn(1, { path: 'a.txt', operation: 'update', before: 'A-old', after: 'A-stale' })
    h.seedTurn(2, { path: 'b.txt', operation: 'update', before: 'B-old', after: 'B-stale' })

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored.map(file => [file.path, file.after])).toEqual([['a.txt', 'A-now'], ['b.txt', 'B-now']])
    expect(h.reads).toEqual(['a.txt', 'b.txt'])
  })

  it('reports a genuinely empty file as an empty string, not as unreadable', async () => {
    const h = harness({ disk: { 'notes.txt': '' } })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored[0]!.after).toBe('')
  })

  it('resolves through the policy workspace root and passes it as cwd', async () => {
    const h = harness({ disk: { 'notes.txt': 'CURRENT' }, workspaceRoot: 'C:\\work' })
    h.seedTurn(1, UPDATED)

    await h.service.preview(h.session, 1)

    expect(h.calls).toEqual([{ path: 'notes.txt', options: { cwd: 'C:\\work' } }])
  })

  it('does not touch the filesystem when the plan restores nothing', async () => {
    const h = harness()
    h.seedTurn(1)
    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored).toEqual([])
    expect(h.calls).toEqual([])
    expect(h.reads).toEqual([])
  })
})

describe('preview() â€?unreadable becomes null, never an empty file', () => {
  it('reports null when the file can no longer be read', async () => {
    const h = harness({ disk: { 'notes.txt': new Error('ENOENT') } })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored[0]!.after).toBeNull()
    // The one-sided diff the renderer would otherwise show is what this prevents.
    expect(plan.restored[0]!.after).not.toBe('')
  })

  it('reports null when the path cannot be resolved', async () => {
    const h = harness({ resolveThrows: true })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored[0]!.after).toBeNull()
  })

  it('keeps reading the remaining files after one fails', async () => {
    const h = harness({ disk: { 'a.txt': new Error('EPERM'), 'b.txt': 'B-now' } })
    h.seedTurn(1, { path: 'a.txt', operation: 'update', before: 'A-old', after: 'A-stale' })
    h.seedTurn(2, { path: 'b.txt', operation: 'update', before: 'B-old', after: 'B-stale' })

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored.map(file => file.after)).toEqual([null, 'B-now'])
    expect(h.reads).toEqual(['a.txt', 'b.txt'])
  })

  it('still reads the files when the sandbox policy refuses to resolve', async () => {
    const h = harness({ disk: { 'notes.txt': 'CURRENT' }, policyThrows: true })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored[0]!.after).toBe('CURRENT')
    // No policy means no workspace root: the fs service falls back to its default.
    expect(h.calls).toEqual([{ path: 'notes.txt', options: {} }])
  })

  it('does not leak a failure into the rest of the plan', async () => {
    const h = harness({ disk: { 'notes.txt': new Error('ENOENT') } })
    h.seedTurn(1, UPDATED)

    const plan = await h.service.preview(h.session, 1)

    expect(plan.restored[0]!.content).toBe('OLD')
    expect(plan.restored[0]!.action).toBe('restore')
    expect(plan.restored[0]!.kind).toBe('updated')
  })
})

describe('preview() â€?no restart cliff', () => {
  it('produces the same plan whatever post-state the record carried', async () => {
    // Two runs of the same session: the live one still had the span's output in
    // memory, the resumed one only has the sidecar's degraded projection (`''`).
    // Neither may reach the preview â€?the file on disk decides.
    const live = harness({ disk: { 'notes.txt': 'CURRENT' }, workspaceRoot: '/w' })
    live.seedTurn(1, { path: 'notes.txt', operation: 'update', before: 'OLD', after: 'the span output' })

    const resumed = harness({ disk: { 'notes.txt': 'CURRENT' }, workspaceRoot: '/w' })
    resumed.seedTurn(1, { path: 'notes.txt', operation: 'update', before: 'OLD', after: '' })

    const livePlan = await live.service.preview(live.session, 1)
    const resumedPlan = await resumed.service.preview(resumed.session, 1)

    expect(resumedPlan).toEqual(livePlan)
    // The host renders its text from exactly this plan (`planText`), so equal
    // plans are equal text â€?there is nothing else for the restart to change.
    expect(livePlan.restored[0]!.after).toBe('CURRENT')
  })
})
