/**
 * Rollback plugin body (Host half).
 *
 * Wires the {@link RollbackService} capture observers and registers the human
 * `/rollback` command. The browser half (rollback button + affected-file dialog)
 * ships via `./client` and reaches this host through the already-shipped
 * `commands` Remote (`/rollback preview|list|<turn>`).
 *
 * Every command path resolves its `Session` through one helper
 * ({@link sessionOf}) rather than reading `invocation.agent.session` inline: the
 * framework's `Agent` is typed as `{ id }` and only the runtime type augmentation
 * adds `session`, so the property is an implementation detail that a future build
 * may drop. Resolving by id through `ctx.sessions` keeps the command working on
 * both shapes, and the doctor reports which route is live.
 *
 * @module @nianchu/dsh-rollback
 */

import type { Context } from '@deepseek-ai/cordis'
import { auditContracts, formatAudit } from './core/contract-audit.ts'
import {
  cappedDiff,
  diffable,
  MAX_PREVIEW_DIFF_LINES,
  MAX_PREVIEW_DIFF_TOTAL,
  renderEntry,
  type PreviewEntry,
} from './core/preview-format.ts'
import type { RollbackPlan } from './core/restore-plan.ts'
import { installRootWriteFallback } from './root-write-fallback.ts'
import { RollbackService, summarize } from './service.ts'

export const name = 'rollback'
export const inject = ['fs', 'sessions', 'tools', 'commands', 'sandboxPolicy']

/** Retained checkpoint window, mirrored in the user-facing hints. */
const WINDOW = 10
const WINDOW_HINT = `(仅最近 ${WINDOW} 轮)`

/**
 * Runtime context the model reads every request.
 *
 * A file changed only through a shell command is invisible to this plugin, so it
 * cannot be rolled back — steering content changes to the file tools is what keeps
 * them inside the captured path. Phrased as the consequence rather than as a rule,
 * so it stays true whatever the model decides.
 */
const FILE_TOOL_HINT =
  'Only files touched by the write/edit tools are tracked for rollback; change file contents with those tools rather than a shell command.'

/** The shape this module needs from a command invocation's agent. */
interface InvocationAgent {
  readonly id?: unknown
  readonly session?: unknown
}

/** The minimal session face the service uses, structurally. */
type SessionLike = Parameters<RollbackService['preview']>[0]

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
function sessionOf(ctx: Context, agent: InvocationAgent | undefined): SessionLike | undefined {
  const direct = agent?.session
  if (direct !== undefined && direct !== null) return direct as SessionLike
  const id = agent?.id
  if (typeof id !== 'string' || id === '') return undefined
  return ctx.sessions.get(id as never) as SessionLike | undefined
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
function planText(plan: RollbackPlan, header: string): string {
  const lines: string[] = [header]
  let budget = MAX_PREVIEW_DIFF_TOTAL

  for (const file of plan.restored) {
    const entry: PreviewEntry = {
      action: file.action,
      path: file.path,
    }
    // `after` is what the file holds RIGHT NOW, read from disk by
    // `RollbackService.preview` — not the span's last recorded output — so the diff
    // cannot go stale behind later turns, a shell command, or the user's own editor.
    // `null` means the file could not be read (deleted, unreadable, not text), which
    // is reported as "cannot preview" rather than rendered as an empty file.
    const current = file.after
    const target = file.action === 'delete' ? '' : (file.content ?? '')
    if (current === null) {
      lines.push(...renderEntry(file.action === 'delete' ? entry : { ...entry, note: '跳过预览' }))
      continue
    }
    if (budget > 0 && diffable(current, target)) {
      const diff = cappedDiff(current, target, Math.min(MAX_PREVIEW_DIFF_LINES, budget))
      budget -= diff.lines.length
      lines.push(...renderEntry({
        ...entry,
        added: diff.added,
        removed: diff.removed,
        diff: diff.lines,
        ...(diff.note === undefined ? {} : { note: diff.note }),
      }))
      continue
    }
    lines.push(...renderEntry(entry))
  }

  for (const file of plan.skipped) {
    lines.push(...renderEntry({ action: 'skip', path: file.path, note: file.reason }))
  }

  // No "no file changes" line: the plugin cannot see everything (a file written by
  // a shell command it never watched is invisible), so claiming this span changed
  // no files would be a claim it cannot back up — and it would read as a promise
  // that the workspace is untouched.
  lines.push(`  对话截断：${plan.truncation === null ? '否' : '将截断'}`)
  return lines.join('\n')
}

/** List the turns the sliding window can still roll back to. */
function listText(service: RollbackService, session: SessionLike): string {
  const fold = service.foldFor(session as never)
  const turns = fold.snapshots().map(cp => cp.turn)
  if (turns.length === 0) return `当前会话没有可回退的轮次。${WINDOW_HINT}`
  return `可回退到的轮次：${turns.join(', ')} ${WINDOW_HINT}`
}

/** The exact usage line, so every rejection names the same grammar. */
const USAGE = '/rollback [list | doctor | preview <turn> | <turn> | undo-last]'

export function apply(ctx: Context): void {
  const service = new RollbackService(ctx)

  // Let `write` reach a file directly under a drive root instead of failing with
  // the provider's mkdir EPERM and pushing the model onto the shell.
  installRootWriteFallback(ctx)

  // Tell the model what the capture can and cannot see, so it does not route a
  // content change through a channel this plugin cannot roll back.
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({
      name: 'rollback:file-tools',
      order: 199,
      text: () => FILE_TOOL_HINT,
    })
  })

  ctx.commands.register({
    name: 'rollback',
    description: '回退到某一轮对话发起前（恢复文件并截断对话，同一会话）',
    input: { hint: '[list | doctor | preview <turn> | <turn> | undo-last]' },
    async handler(invocation) {
      const raw = invocation.rawInput.trim()
      const head = raw.split(/\s+/, 1)[0] ?? ''

      try {
        // `doctor` needs no session: it audits the framework contracts this
        // plugin depends on, which is exactly what to run when the UI looks
        // inert and nothing has been logged yet.
        if (head === 'doctor') {
          return { kind: 'success', text: formatAudit(await auditContracts(ctx)) }
        }

        const session = sessionOf(ctx, invocation.agent as InvocationAgent)
        if (session === undefined) {
          return {
            kind: 'error',
            text: '无法定位当前会话：Agent 既没有 session 也没有可解析的 id。请运行 /rollback doctor 查看契约诊断。',
          }
        }

        if (raw === '' || head === 'list') {
          return { kind: 'success', text: listText(service, session) }
        }

        if (head === 'doctor') {
          return { kind: 'success', text: formatAudit(await auditContracts(ctx)) }
        }

        // `undo-last` is the no-arithmetic path: roll back the most recent turn
        // the window still holds. A user who just saw a bad edit should not have
        // to read a turn number off the screen first.
        if (head === 'undo-last' || head === 'undo') {
          const turns = service.foldFor(session as never).snapshots().map(cp => cp.turn)
          if (turns.length === 0) return { kind: 'error', text: `当前会话没有可回退的轮次。${WINDOW_HINT}` }
          const turn = Math.max(...turns)
          const outcome = await service.execute(session as never, turn, invocation.signal)
          return { kind: 'success', text: outcome.summary }
        }

        if (head === 'preview') {
          const rest = raw.slice('preview'.length).trim()
          if (rest === 'last') {
            const turns = service.foldFor(session as never).snapshots().map(cp => cp.turn)
            if (turns.length === 0) return { kind: 'error', text: `当前会话没有可回退的轮次。${WINDOW_HINT}` }
            const turn = Math.max(...turns)
            const plan = await service.preview(session as never, turn)
            return { kind: 'success', text: planText(plan, `回退到第 ${turn} 轮发起前（最后一轮），受影响文件：`) }
          }
          const turn = Number(rest)
          if (!Number.isSafeInteger(turn) || turn < 1) {
            return { kind: 'error', text: `用法：${USAGE}   （turn 为正整数轮次）` }
          }
          const plan = await service.preview(session as never, turn)
          return { kind: 'success', text: planText(plan, `回退到第 ${turn} 轮发起前，受影响文件：`) }
        }

        const turn = Number(raw)
        if (!Number.isSafeInteger(turn) || turn < 1) {
          return { kind: 'error', text: `用法：${USAGE}` }
        }
        const outcome = await service.execute(session as never, turn, invocation.signal)
        return { kind: 'success', text: outcome.summary }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'error', text: `回退失败：${message}` }
      }
    },
  })
}
