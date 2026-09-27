/**
 * Framework-contract audit (`/rollback doctor`).
 *
 * The failure this module exists for is the one that costs the most time: the
 * plugin loads, registers, and then does nothing observable, because one seam it
 * depends on was renamed by a newer DSH build. "It does nothing" is not a
 * diagnosis — so every seam the plugin needs is probed BY NAME and answered with
 * available / missing / degraded, plus the one recovery step that applies.
 *
 * The probe reads the live services through `ctx.get`, never a version number:
 * the answer describes THIS composition, which is the only thing that decides
 * whether the plugin works.
 *
 * Pure formatting lives here too, so the command handler and the client-side
 * report produce the same text from the same findings.
 *
 * @module @nianchu/dsh-rollback/core/contract-audit
 */

/** How one probe answered. */
export type ContractStatus = 'ok' | 'missing' | 'degraded'

/** One probed dependency. */
export interface ContractFinding {
  /** Stable id, so the same seam is named the same way across versions. */
  readonly id: string
  /** What the plugin uses it for, in one sentence. */
  readonly purpose: string
  /** What the probe found. */
  readonly status: ContractStatus
  /** What the probe actually saw (a method list, a shape, an error). */
  readonly observed: string
  /** The recovery step when the status is not `ok`. */
  readonly remedy?: string
}

/** A complete audit. */
export interface ContractAudit {
  /**
   * DSH version string, when the host exposes one.
   *
   * Measured `undefined` on 0.1.7-rc.2: its live Service catalog contains no
   * `dshBrand`, `brand` or `packageManifest` service, and the `@deepseek-ai/dsh-brand`
   * package is a compile-time `brandString`/`brandNumber` helper, not a version
   * provider. The candidate list is kept so a future build that does expose one is
   * picked up, but no measured build answers it — the report must not imply the
   * version was checked when there is nothing to check it against.
   */
  readonly dshVersion: string | undefined
  /** Plugin version, when resolvable. */
  readonly pluginVersion: string
  /** Findings in a stable, meaningful order. */
  readonly findings: readonly ContractFinding[]
}

/** The plugin's own release, mirrored from package.json at build time by hand. */
export const PLUGIN_VERSION = '0.4.1'

/** Capability ids, so callers and tests name seams without string duplication. */
export const CONTRACT_IDS = {
  fs: 'filesystem',
  sessions: 'session-store',
  tools: 'tool-registry',
  commands: 'command-registry',
  sandboxPolicy: 'sandbox-policy',
  sessionEvent: 'session/event',
  sessionCreated: 'session/created',
  toolsPreExecute: 'tools/pre-execute',
  toolsResult: 'tools/result',
  fsObserved: 'fs/observed',
  writeText: 'fs.writeText',
  editText: 'fs.editText',
  resolve: 'fs.resolve',
  processPath: 'fs.processPath',
  stat: 'fs.stat',
  readText: 'fs.readText',
  surfaceAppend: 'session.append(surfaceOp)',
  snapshotEvents: 'session.snapshotEvents',
  sandboxResolve: 'sandboxPolicy.resolve({ session })',
  sessionStoreGet: 'sessions.get',
  sessionStoreList: 'sessions.list',
  sessionSurfaceLookup: 'session.surface',
} as const

/**
 * Read one property path off an unknown object without throwing.
 *
 * The property access is guarded because a live object can carry a GETTER that
 * throws — `Session.surface` is one, and a session whose surface cannot be built
 * is exactly the state a doctor run is meant to diagnose. Letting that getter's
 * error escape would lose the whole report, which is the one outcome this module
 * exists to prevent.
 */
function probe(root: unknown, path: readonly string[]): { ok: boolean; value?: unknown; error?: Error } {
  let current: unknown = root
  for (const key of path) {
    if (current === null || current === undefined) return { ok: false }
    if (typeof current !== 'object' && typeof current !== 'function') return { ok: false }
    try {
      current = (current as Record<string, unknown>)[key]
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }
  return current === undefined ? { ok: false } : { ok: true, value: current }
}

/** Whether a nested property path resolves to a function. */
function hasFunction(root: unknown, path: readonly string[]): boolean {
  const found = probe(root, path)
  return found.ok && typeof found.value === 'function'
}

/** Describe a service's shape compactly, for the `observed` column. */
function shapeOf(value: unknown, limit = 8): string {
  if (value === undefined) return 'absent'
  if (value === null) return 'null'
  if (typeof value !== 'object' && typeof value !== 'function') return typeof value
  const own = Object.keys(value as object)
  // A Cordis service is usually a class instance: its methods live on the
  // prototype and are NOT enumerable, so `Object.keys` alone reported `{  }` for
  // every service — an `observed` column that says nothing is how an audit fails
  // to answer the question it was run to answer.
  const names = own.length > 0 ? own : prototypeMethodNames(value as object)
  const shown = names.slice(0, limit).join(', ')
  return names.length > limit ? `{ ${shown}, +${names.length - limit} }` : `{ ${shown} }`
}

/** The method names on an object's prototype, or `[]` when it has none worth naming. */
function prototypeMethodNames(value: object): string[] {
  try {
    const proto = Object.getPrototypeOf(value)
    if (proto === null || proto === Object.prototype) return []
    return Object.getOwnPropertyNames(proto).filter(name => {
      if (name === 'constructor') return false
      try {
        return typeof (value as Record<string, unknown>)[name] === 'function'
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

/** The first live session in the store, or undefined when none can be read. */
function liveSession(sessions: unknown): unknown {
  const list = (sessions as { list?: unknown } | undefined)?.list
  if (typeof list !== 'function') return undefined
  try {
    const all = (list as () => unknown).call(sessions)
    return Array.isArray(all) ? all[0] : undefined
  } catch {
    return undefined
  }
}

/** The minimal context face this audit reads. */
export interface AuditContext {
  readonly get?: (name: string) => unknown
  readonly fs?: unknown
  readonly sessions?: unknown
  readonly tools?: unknown
  readonly commands?: unknown
  readonly sandboxPolicy?: unknown
  /** A probe for whether an event mode exists, when the context offers one. */
  readonly on?: unknown
  /** The publish side of the same bus; a delete's `fs/observed` needs THIS one. */
  readonly emit?: unknown
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
export async function auditContracts(ctx: AuditContext): Promise<ContractAudit> {
  const findings: ContractFinding[] = []

  // --- Services named in `inject`: absence here parks the fiber entirely. ---
  const required: ReadonlyArray<readonly [string, unknown, string, string]> = [
    [CONTRACT_IDS.fs, ctx.fs, 'filesystem access: capture, restore, delete', 'the fs service is required; without it the plugin cannot load'],
    [CONTRACT_IDS.sessions, ctx.sessions, 'resolving the calling session and its policy', 'the sessions service is required; without it the plugin cannot load'],
    [CONTRACT_IDS.tools, ctx.tools, 'observing write/edit tool results', 'the tools service is required; without it the plugin cannot load'],
    [CONTRACT_IDS.commands, ctx.commands, 'the /rollback command surface', 'the commands service is required; without it the plugin cannot load'],
    [CONTRACT_IDS.sandboxPolicy, ctx.sandboxPolicy, 'resolving the per-session sandbox policy for restores', 'the sandboxPolicy service is required; without it the plugin cannot load'],
  ]
  for (const [id, value, purpose, remedy] of required) {
    findings.push(value === undefined
      ? { id, purpose, status: 'missing', observed: 'service not resolvable through ctx.get', remedy }
      : { id, purpose, status: 'ok', observed: shapeOf(value) })
  }

  // --- Filesystem primitives: one missing method degrades one feature. ---
  const fs = ctx.fs
  const primitives: ReadonlyArray<readonly [string, readonly string[], string, string]> = [
    [CONTRACT_IDS.resolve, ['resolve'], 'turning a display path into a filesystem target', 'restore and capture cannot resolve paths without it'],
    [CONTRACT_IDS.processPath, ['processPath'], 'mapping a target to its host path for delete and empty-directory cleanup', 'file deletion and empty-directory cleanup are unavailable without it'],
    [CONTRACT_IDS.stat, ['stat'], 'detecting created-vs-updated and version guards', 'the plugin cannot tell a new file from an edited one without it'],
    [CONTRACT_IDS.readText, ['readText'], 'reading pre-turn content for str_replace_editor', 'str_replace_editor pre-capture falls back to an unknown basis'],
    [CONTRACT_IDS.writeText, ['writeText'], 'restoring pre-turn content', 'file restore is unavailable without it'],
    [CONTRACT_IDS.editText, ['editText'], 'the drive-root write fallback', 'the Windows drive-root fallback is inactive without it'],
  ]
  for (const [id, path, purpose, remedy] of primitives) {
    const present = hasFunction(fs, path)
    findings.push(present
      ? { id, purpose, status: 'ok', observed: `fs.${path.join('.')} present` }
      : { id, purpose, status: 'missing', observed: `fs.${path.join('.')} is not a function`, remedy })
  }

  // --- Session store seams the command path calls by name. ---
  const sessions = ctx.sessions
  const storeSeams: ReadonlyArray<readonly [string, readonly string[], string, string]> = [
    [CONTRACT_IDS.sessionStoreGet, ['get'], 'resolving the calling session from the agent id in a /rollback command', 'the command cannot find its session and answers "无法定位当前会话"'],
    [CONTRACT_IDS.sessionStoreList, ['list'], 'seeding checkpoints for sessions already live when the plugin loaded', 'sessions opened before the plugin loaded keep no checkpoints until a new turn runs'],
  ]
  for (const [id, path, purpose, remedy] of storeSeams) {
    const present = hasFunction(sessions, path)
    findings.push(present
      ? { id, purpose, status: 'ok', observed: `sessions.${path.join('.')} present` }
      : { id, purpose, status: 'missing', observed: `sessions.${path.join('.')} is not a function`, remedy })
  }

  // --- Session surface contract: without this a rollback restores files but
  //     cannot truncate the conversation, which is half the feature. These are
  //     members of a Session INSTANCE, not of the store, so they are probed on a
  //     live session — and with no session to probe, the honest answer is "not
  //     checked", never "ok". ---
  const sessionSeams: ReadonlyArray<readonly [string, string, string, string]> = [
    [CONTRACT_IDS.snapshotEvents, 'snapshotEvents', 'replaying a stored log so a resumed session keeps its checkpoints', 'checkpoints are not rebuilt after a resume; /rollback list stays empty until new turns run'],
    [CONTRACT_IDS.surfaceAppend, 'append', 'truncating the conversation in place', 'files can be restored but the conversation cannot be truncated — half the feature is gone'],
  ]
  const probeSession = liveSession(sessions)
  for (const [id, member, purpose, remedy] of sessionSeams) {
    if (probeSession === undefined) {
      findings.push({ id, purpose, status: 'degraded', observed: 'not probed: no live session available', remedy: 'run /rollback doctor from inside a session to probe this seam' })
      continue
    }
    const present = hasFunction(probeSession, [member])
    findings.push(present
      ? { id, purpose, status: 'ok', observed: `session.${member} present` }
      : { id, purpose, status: 'missing', observed: `session.${member} is not a function`, remedy })
  }

  // `session.surface` is a GETTER returning the node range, not a function: a
  // function-only probe would have called a working seam broken.
  const surfacePurpose = 'reading the model-visible node range the truncation replaces'
  if (probeSession === undefined) {
    findings.push({ id: CONTRACT_IDS.sessionSurfaceLookup, purpose: surfacePurpose, status: 'degraded', observed: 'not probed: no live session available', remedy: 'run /rollback doctor from inside a session to probe this seam' })
  } else {
    const found = probe(probeSession, ['surface'])
    if (found.ok) {
      findings.push({ id: CONTRACT_IDS.sessionSurfaceLookup, purpose: surfacePurpose, status: 'ok', observed: `session.surface present (${shapeOf(found.value)})` })
    } else if (found.error !== undefined) {
      // The seam exists but READING it throws — strictly worse than absent,
      // because the plugin will hit the same throw while planning. A distinct
      // status keeps that from hiding behind a plain "missing".
      findings.push({ id: CONTRACT_IDS.sessionSurfaceLookup, purpose: surfacePurpose, status: 'degraded', observed: `session.surface threw: ${found.error.message}`, remedy: 'the truncation range cannot be computed; fix the session surface before rolling back' })
    } else {
      findings.push({ id: CONTRACT_IDS.sessionSurfaceLookup, purpose: surfacePurpose, status: 'missing', observed: 'session.surface is undefined', remedy: 'the truncation range cannot be computed, so a rollback refuses instead of guessing' })
    }
  }

  // --- Sandbox policy shape: `resolve({ session })` must still take a session. ---
  const policyService = ctx.sandboxPolicy as { resolve?: unknown; workspaceRoot?: unknown } | undefined
  if (policyService !== undefined && typeof policyService.resolve === 'function') {
    let observed: string
    let status: ContractStatus = 'ok'
    let remedy: string | undefined
    try {
      const resolved = (policyService.resolve as (request?: unknown) => unknown)({})
      const shape = resolved as { mode?: unknown; workspaceRoot?: unknown } | undefined
      const hasRoot = typeof shape?.workspaceRoot === 'string'
      observed = `resolve({}) -> ${shapeOf(resolved)}`
      if (!hasRoot) {
        status = 'degraded'
        remedy = 'sandboxPolicy.resolve() no longer returns a workspaceRoot; restores may be sandbox-refused'
      }
    } catch (error) {
      status = 'degraded'
      observed = `resolve({}) threw: ${error instanceof Error ? error.message : String(error)}`
      remedy = 'sandboxPolicy.resolve() refused an empty request; restore calls may fail'
    }
    findings.push({
      id: CONTRACT_IDS.sandboxResolve,
      purpose: 'resolving the workspace root restores are written under',
      status,
      observed,
      ...(remedy === undefined ? {} : { remedy }),
    })
  }

  // --- Events the plugin observes. A missing event name means the listener is
  //     never called, which looks exactly like "the plugin is asleep". ---
  const eventProbes: ReadonlyArray<readonly [string, string, string]> = [
    [CONTRACT_IDS.sessionEvent, 'folding turns and surface positions into checkpoints', 'the plugin cannot build checkpoints without it'],
    [CONTRACT_IDS.sessionCreated, 'rebuilding checkpoints when a session is resumed', 'rollback coverage starts only after this plugin sees the session'],
    [CONTRACT_IDS.toolsPreExecute, 'pre-reading str_replace_editor targets', 'str_replace_editor changes lose their pre-turn basis'],
    [CONTRACT_IDS.toolsResult, 'capturing write/edit before-and-after content', 'no file change can be captured, so rollback restores nothing'],
  ]
  for (const [id, purpose, remedy] of eventProbes) {
    // What is verifiable from here is the registrar, not the NAME. `ctx.on` is
    // present on every Cordis context, so a renamed event reports `ok` while its
    // listener silently never fires — precisely the "the plugin is asleep" case
    // this command exists to name. `observed` says which check actually ran
    // rather than implying one that did not.
    const canListen = typeof ctx.on === 'function'
    findings.push(canListen
      ? { id, purpose, status: 'ok', observed: 'ctx.on present — registrar only; the event NAME is not verifiable from here' }
      : { id, purpose, status: 'missing', observed: 'ctx.on is not a function', remedy })
  }

  // --- fs/observed: emitted by the plugin after a delete so the model's next
  //     write sees "absent" rather than a stale version. Publishing needs `emit`,
  //     a different member from the `on` the probes above read. ---
  const canEmit = typeof ctx.emit === 'function'
  const observedPurpose = 'refreshing the observation cache after a rollback deletes or rewrites a file'
  findings.push(canEmit
    ? { id: CONTRACT_IDS.fsObserved, purpose: observedPurpose, status: 'ok', observed: 'ctx.emit present' }
    : { id: CONTRACT_IDS.fsObserved, purpose: observedPurpose, status: 'degraded', observed: 'ctx.emit is not a function', remedy: 'a write right after a rollback may report FS_STALE_VERSION; re-read the file' })

  return {
    dshVersion: dshVersionOf(ctx),
    pluginVersion: PLUGIN_VERSION,
    findings,
  }
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
function dshVersionOf(ctx: AuditContext): string | undefined {
  const candidates = ['dshBrand', 'brand', 'packageManifest'] as const
  for (const name of candidates) {
    const service = ctx.get?.(name)
    const version = (service as { version?: unknown } | undefined)?.version
    if (typeof version === 'string' && version !== '') return version
  }
  return undefined
}

/** One-line-per-finding human report. */
export function formatAudit(audit: ContractAudit): string {
  const bad = audit.findings.filter(finding => finding.status !== 'ok')
  const head = [
    `回退插件契约自检 · 插件 ${audit.pluginVersion}${audit.dshVersion === undefined ? '' : ` · DSH ${audit.dshVersion}`}`,
    bad.length === 0
      ? `全部 ${audit.findings.length} 项依赖正常。`
      : `${audit.findings.length} 项依赖中有 ${bad.length} 项异常：`,
  ]
  const lines: string[] = head
  for (const finding of bad) {
    const tag = finding.status === 'missing'
      ? '[缺失]'
      : finding.observed.startsWith('not probed:') ? '[未探针]' : '[降级]'
    lines.push(`  ${tag} ${finding.id} — ${finding.purpose}`)
    lines.push(`         实测：${finding.observed}`)
    if (finding.remedy !== undefined) lines.push(`         处置：${finding.remedy}`)
  }
  if (bad.length === 0) {
    for (const finding of audit.findings) lines.push(`  [正常] ${finding.id}`)
  }
  lines.push('  说明：「缺失」= 该功能完全不可用；「降级」= 功能可用但能力受限；「未探针」= 本次没有可探测的对象，结果未知。')
  return lines.join('\n')
}
