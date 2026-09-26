/**
 * Regression suite for the framework-contract audit behind `/rollback doctor`.
 *
 * The audit exists for the failure that costs the most time: the plugin loads,
 * registers, and then does nothing observable because one seam it depends on was
 * renamed. Its whole value is that a bad answer names the seam AND the one
 * recovery step — so the id set, the check that ran for each id, and the rendered
 * text are pinned here.
 *
 * Contract revision this suite was written against (2026-09-26):
 *   - 22 findings in a fixed order, ids unique;
 *   - session-instance seams (`snapshotEvents`, `append`, `surface`) are probed on
 *     a live session, and answer `degraded` + `not probed: …` with no session;
 *   - `session.surface` is a GETTER, so it is probed by value, not by `typeof`;
 *   - `fs/observed` keys off `ctx.emit`, while the event listeners key off `ctx.on`;
 *   - `shapeOf` falls back to prototype method names for class instances.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  auditContracts,
  CONTRACT_IDS,
  formatAudit,
  PLUGIN_VERSION,
  type AuditContext,
  type ContractAudit,
  type ContractFinding,
} from '../src/core/contract-audit.ts'

/** The session-instance members the audit probes by name. */
function sessionStub(): Record<string, unknown> {
  return {
    snapshotEvents: () => [],
    append: () => {},
    // `session.surface` really is a getter on a live session, not a method.
    get surface() {
      return { start: 1, end: 4 }
    },
  }
}

/** A filesystem service exposing every primitive the audit probes. */
function fsStub(): Record<string, unknown> {
  return {
    resolve: () => {},
    processPath: (path: string) => path,
    stat: () => {},
    readText: () => '',
    writeText: () => {},
    editText: () => {},
  }
}

/** A context in which every probed seam answers `ok`. */
function healthyContext(overrides: Partial<AuditContext> = {}): AuditContext {
  const session = sessionStub()
  return {
    fs: fsStub(),
    sessions: { get: () => session, list: () => [session] },
    tools: { on: () => {} },
    commands: { register: () => {} },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/w' }) },
    on: () => {},
    emit: () => {},
    get: (name: string) => (name === 'dshBrand' ? { version: '0.1.7-rc.2' } : undefined),
    ...overrides,
  }
}

/** The complete id sequence a healthy composition produces. */
const HEALTHY_IDS = [
  CONTRACT_IDS.fs,
  CONTRACT_IDS.sessions,
  CONTRACT_IDS.tools,
  CONTRACT_IDS.commands,
  CONTRACT_IDS.sandboxPolicy,
  CONTRACT_IDS.resolve,
  CONTRACT_IDS.processPath,
  CONTRACT_IDS.stat,
  CONTRACT_IDS.readText,
  CONTRACT_IDS.writeText,
  CONTRACT_IDS.editText,
  CONTRACT_IDS.sessionStoreGet,
  CONTRACT_IDS.sessionStoreList,
  CONTRACT_IDS.snapshotEvents,
  CONTRACT_IDS.surfaceAppend,
  CONTRACT_IDS.sessionSurfaceLookup,
  CONTRACT_IDS.sandboxResolve,
  CONTRACT_IDS.sessionEvent,
  CONTRACT_IDS.sessionCreated,
  CONTRACT_IDS.toolsPreExecute,
  CONTRACT_IDS.toolsResult,
  CONTRACT_IDS.fsObserved,
]

/** The finding for one stable id. Fails loudly when the id is absent. */
function findingOf(audit: ContractAudit, id: string): ContractFinding {
  const found = audit.findings.find(finding => finding.id === id)
  if (found === undefined) throw new Error(`no finding "${id}"; ids=${audit.findings.map(f => f.id).join(',')}`)
  return found
}

/** The `[缺失]`/`[降级]`/`[未探针]` lines of a report, without the columns. */
function reportLines(audit: ContractAudit): string[] {
  return formatAudit(audit)
    .split('\n')
    .filter(line => /^ {2}\[[^\]]+\] /.test(line))
}

describe('CONTRACT_IDS', () => {
  // These strings are DSH framework names (event names, service members). A rename
  // here is the exact drift the audit exists to catch, so the pinned values double
  // as the list of seams the plugin depends on.
  it('pins the framework event names', () => {
    expect(CONTRACT_IDS.sessionEvent).toBe('session/event')
    expect(CONTRACT_IDS.sessionCreated).toBe('session/created')
    expect(CONTRACT_IDS.toolsPreExecute).toBe('tools/pre-execute')
    expect(CONTRACT_IDS.toolsResult).toBe('tools/result')
    expect(CONTRACT_IDS.fsObserved).toBe('fs/observed')
  })

  it('pins the filesystem members', () => {
    expect(CONTRACT_IDS.resolve).toBe('fs.resolve')
    expect(CONTRACT_IDS.processPath).toBe('fs.processPath')
    expect(CONTRACT_IDS.stat).toBe('fs.stat')
    expect(CONTRACT_IDS.readText).toBe('fs.readText')
    expect(CONTRACT_IDS.writeText).toBe('fs.writeText')
    expect(CONTRACT_IDS.editText).toBe('fs.editText')
  })

  it('pins the service ids and the session seams', () => {
    expect(CONTRACT_IDS.fs).toBe('filesystem')
    expect(CONTRACT_IDS.sessions).toBe('session-store')
    expect(CONTRACT_IDS.tools).toBe('tool-registry')
    expect(CONTRACT_IDS.commands).toBe('command-registry')
    expect(CONTRACT_IDS.sandboxPolicy).toBe('sandbox-policy')
    expect(CONTRACT_IDS.sessionStoreGet).toBe('sessions.get')
    expect(CONTRACT_IDS.sessionStoreList).toBe('sessions.list')
    expect(CONTRACT_IDS.snapshotEvents).toBe('session.snapshotEvents')
    expect(CONTRACT_IDS.surfaceAppend).toBe('session.append(surfaceOp)')
    expect(CONTRACT_IDS.sessionSurfaceLookup).toBe('session.surface')
    expect(CONTRACT_IDS.sandboxResolve).toBe('sandboxPolicy.resolve({ session })')
  })

  it('keeps every id unique, so a report can never name one seam twice', () => {
    const ids = Object.values(CONTRACT_IDS)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('PLUGIN_VERSION', () => {
  it('matches package.json, the version the release actually ships', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    expect(PLUGIN_VERSION).toBe(manifest.version)
  })
})

describe('auditContracts — healthy composition', () => {
  it('answers ok for all 22 probes, in one fixed order, and resolves the versions', async () => {
    const audit = await auditContracts(healthyContext())
    expect(audit.pluginVersion).toBe(PLUGIN_VERSION)
    expect(audit.dshVersion).toBe('0.1.7-rc.2')
    expect(audit.findings).toHaveLength(22)
    expect(audit.findings.map(finding => finding.id)).toEqual(HEALTHY_IDS)
    const bad = audit.findings.filter(finding => finding.status !== 'ok')
    expect(bad.map(finding => `${finding.id}:${finding.status}:${finding.observed}`)).toEqual([])
  })

  it('says which check actually ran for each seam it cannot fully verify', async () => {
    const audit = await auditContracts(healthyContext())
    // The event names themselves are validated by the framework at registration,
    // so the probe must not claim it verified a name.
    expect(findingOf(audit, CONTRACT_IDS.sessionEvent).observed).toContain('registrar only')
    expect(findingOf(audit, CONTRACT_IDS.sessionCreated).observed).toContain('registrar only')
    expect(findingOf(audit, CONTRACT_IDS.toolsPreExecute).observed).toContain('registrar only')
    expect(findingOf(audit, CONTRACT_IDS.toolsResult).observed).toContain('registrar only')
    expect(findingOf(audit, CONTRACT_IDS.fsObserved).observed).toContain('ctx.emit')
  })

  it('reports the sandbox policy answer it actually received', async () => {
    const audit = await auditContracts(healthyContext())
    expect(findingOf(audit, CONTRACT_IDS.sandboxResolve).observed).toContain('workspaceRoot')
  })

  it('probes the session-instance seams on a live session, including the surface getter', async () => {
    const audit = await auditContracts(healthyContext())
    expect(findingOf(audit, CONTRACT_IDS.snapshotEvents).observed).toBe('session.snapshotEvents present')
    expect(findingOf(audit, CONTRACT_IDS.surfaceAppend).observed).toBe('session.append present')
    expect(findingOf(audit, CONTRACT_IDS.sessionSurfaceLookup).observed).toContain('session.surface present')
  })
})

describe('auditContracts — missing services', () => {
  it('reports a missing injected service with the recovery step', async () => {
    const audit = await auditContracts(healthyContext({ fs: undefined }))
    const missing = findingOf(audit, CONTRACT_IDS.fs)
    expect(missing.status).toBe('missing')
    expect(missing.observed).toContain('ctx.get')
    expect(missing.remedy).toBeTruthy()
  })

  it('degrades every fs primitive when the filesystem service itself is gone', async () => {
    const audit = await auditContracts(healthyContext({ fs: undefined }))
    for (const id of [
      CONTRACT_IDS.resolve,
      CONTRACT_IDS.processPath,
      CONTRACT_IDS.stat,
      CONTRACT_IDS.readText,
      CONTRACT_IDS.writeText,
      CONTRACT_IDS.editText,
    ]) {
      const finding = findingOf(audit, id)
      expect(finding.status, id).toBe('missing')
      expect(finding.observed, id).toContain('is not a function')
      expect(finding.remedy, id).toBeTruthy()
    }
  })

  it('names the single primitive that is missing while the rest stay ok', async () => {
    const partial = { ...fsStub(), editText: undefined }
    const audit = await auditContracts(healthyContext({ fs: partial }))
    expect(findingOf(audit, CONTRACT_IDS.editText).status).toBe('missing')
    expect(findingOf(audit, CONTRACT_IDS.writeText).status).toBe('ok')
    expect(audit.findings.filter(finding => finding.status === 'missing')).toHaveLength(1)
  })

  it('reports the session store members the command path calls by name', async () => {
    const audit = await auditContracts(healthyContext({ sessions: {} }))
    for (const id of [CONTRACT_IDS.sessionStoreGet, CONTRACT_IDS.sessionStoreList]) {
      const finding = findingOf(audit, id)
      expect(finding.status, id).toBe('missing')
      expect(finding.observed, id).toContain('is not a function')
      expect(finding.remedy, id).toBeTruthy()
    }
  })

  it('reports a missing events registrar against every event listener', async () => {
    const audit = await auditContracts(healthyContext({ on: undefined }))
    for (const id of [
      CONTRACT_IDS.sessionEvent,
      CONTRACT_IDS.sessionCreated,
      CONTRACT_IDS.toolsPreExecute,
      CONTRACT_IDS.toolsResult,
    ]) {
      const finding = findingOf(audit, id)
      expect(finding.status, id).toBe('missing')
      expect(finding.observed, id).toContain('ctx.on')
      expect(finding.remedy, id).toBeTruthy()
    }
  })

  it('keys fs/observed off emit, not off on', async () => {
    // `on` gone but `emit` present: the listeners are broken, the publish side is not.
    const noOn = await auditContracts(healthyContext({ on: undefined }))
    expect(findingOf(noOn, CONTRACT_IDS.fsObserved).status).toBe('ok')

    const noEmit = await auditContracts(healthyContext({ emit: undefined }))
    const finding = findingOf(noEmit, CONTRACT_IDS.fsObserved)
    expect(finding.status).toBe('degraded')
    expect(finding.observed).toContain('ctx.emit')
    expect(finding.remedy).toContain('FS_STALE_VERSION')
  })

  it('omits the sandbox resolve probe entirely when the service has no resolve', async () => {
    const audit = await auditContracts(healthyContext({ sandboxPolicy: { workspaceRoot: '/w' } }))
    expect(audit.findings.some(finding => finding.id === CONTRACT_IDS.sandboxResolve)).toBe(false)
    expect(audit.findings).toHaveLength(21)
  })
})

describe('auditContracts — session seams with nothing to probe', () => {
  it('answers "not probed" rather than "ok" when the store holds no session', async () => {
    const audit = await auditContracts(healthyContext({ sessions: { get: () => {}, list: () => [] } }))
    for (const id of [
      CONTRACT_IDS.snapshotEvents,
      CONTRACT_IDS.surfaceAppend,
      CONTRACT_IDS.sessionSurfaceLookup,
    ]) {
      const finding = findingOf(audit, id)
      expect(finding.status, id).toBe('degraded')
      expect(finding.observed, id).toContain('not probed: no live session available')
      expect(finding.remedy, id).toContain('/rollback doctor')
    }
    expect(audit.findings).toHaveLength(22)
  })

  it('treats a store without list as nothing to probe', async () => {
    const audit = await auditContracts(healthyContext({ sessions: { get: () => {} } }))
    expect(findingOf(audit, CONTRACT_IDS.snapshotEvents).observed).toContain('not probed')
  })

  it('treats a list that returns a non-array as nothing to probe', async () => {
    const audit = await auditContracts(healthyContext({ sessions: { get: () => {}, list: () => undefined } }))
    expect(findingOf(audit, CONTRACT_IDS.snapshotEvents).observed).toContain('not probed')
  })

  it('treats a throwing list as nothing to probe instead of failing the audit', async () => {
    const audit = await auditContracts(healthyContext({
      sessions: {
        get: () => {},
        list: () => {
          throw new Error('store offline')
        },
      },
    }))
    expect(findingOf(audit, CONTRACT_IDS.snapshotEvents).observed).toContain('not probed')
  })

  it('reports the session-instance member that is missing on a live session', async () => {
    const noAppend = { snapshotEvents: () => [], surface: { start: 1, end: 2 } }
    const audit = await auditContracts(healthyContext({ sessions: { get: () => noAppend, list: () => [noAppend] } }))
    expect(findingOf(audit, CONTRACT_IDS.snapshotEvents).status).toBe('ok')
    const missing = findingOf(audit, CONTRACT_IDS.surfaceAppend)
    expect(missing.status).toBe('missing')
    expect(missing.observed).toBe('session.append is not a function')
    expect(missing.remedy).toBeTruthy()
  })

  it('flags a session that has no surface at all', async () => {
    const noSurface = { snapshotEvents: () => [], append: () => {} }
    const audit = await auditContracts(healthyContext({ sessions: { get: () => noSurface, list: () => [noSurface] } }))
    const finding = findingOf(audit, CONTRACT_IDS.sessionSurfaceLookup)
    expect(finding.status).toBe('missing')
    expect(finding.observed).toBe('session.surface is undefined')
  })

  // A getter that throws is read by `probe()` with no guard around the property
  // access, so the whole `/rollback doctor` answer is lost — the one outcome the
  // audit exists to avoid. Reported as a defect; see the handover notes.
  it('keeps answering when a live session surface getter throws', async () => {
    const hostile = {
      snapshotEvents: () => [],
      append: () => {},
      get surface(): unknown {
        throw new Error('surface unavailable')
      },
    }
    const audit = await auditContracts(healthyContext({ sessions: { get: () => hostile, list: () => [hostile] } }))
    expect(findingOf(audit, CONTRACT_IDS.sessionSurfaceLookup).status).toBe('degraded')
  })
})

describe('auditContracts — degraded shapes', () => {
  it('degrades the sandbox policy when resolve stops returning a workspaceRoot', async () => {
    const audit = await auditContracts(healthyContext({ sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) } }))
    const finding = findingOf(audit, CONTRACT_IDS.sandboxResolve)
    expect(finding.status).toBe('degraded')
    expect(finding.observed).toContain('resolve({}) ->')
    expect(finding.remedy).toContain('workspaceRoot')
  })

  it('degrades the sandbox policy when resolve throws, and keeps the message', async () => {
    const audit = await auditContracts(healthyContext({
      sandboxPolicy: {
        resolve: () => {
          throw new Error('boom')
        },
      },
    }))
    const finding = findingOf(audit, CONTRACT_IDS.sandboxResolve)
    expect(finding.status).toBe('degraded')
    expect(finding.observed).toContain('threw: boom')
    expect(finding.remedy).toBeTruthy()
  })

  it('degrades the sandbox policy when resolve throws a non-Error', async () => {
    const audit = await auditContracts(healthyContext({
      sandboxPolicy: {
        resolve: () => {
          throw 'nope'
        },
      },
    }))
    expect(findingOf(audit, CONTRACT_IDS.sandboxResolve).observed).toContain('nope')
  })

  it('never throws on an empty context — `/rollback doctor` must answer even then', async () => {
    const audit = await auditContracts({})
    expect(audit.pluginVersion).toBe(PLUGIN_VERSION)
    expect(audit.dshVersion).toBeUndefined()
    expect(audit.findings).toHaveLength(21)
    expect(audit.findings.filter(finding => finding.status === 'ok')).toEqual([])
    expect(audit.findings.filter(finding => finding.status === 'missing')).toHaveLength(17)
    expect(audit.findings.filter(finding => finding.status === 'degraded')).toHaveLength(4)
    expect(() => formatAudit(audit)).not.toThrow()
  })
})

describe('auditContracts — observed column', () => {
  // A Cordis service is normally a class instance whose methods live on the
  // prototype, so `Object.keys` alone reported `{  }` for every service.
  it('names prototype methods for a class instance', async () => {
    class ServiceLike {
      resolve(): void {}
      processPath(): void {}
      stat(): void {}
      readText(): void {}
      writeText(): void {}
      editText(): void {}
    }
    const audit = await auditContracts(healthyContext({ fs: new ServiceLike() }))
    expect(findingOf(audit, CONTRACT_IDS.fs).observed)
      .toBe('{ resolve, processPath, stat, readText, writeText, editText }')
  })

  it('truncates a long prototype method list with a count', async () => {
    class Wide {
      m0(): void {}
      m1(): void {}
      m2(): void {}
      m3(): void {}
      m4(): void {}
      m5(): void {}
      m6(): void {}
      m7(): void {}
      m8(): void {}
      m9(): void {}
    }
    const audit = await auditContracts(healthyContext({ fs: new Wide() }))
    expect(findingOf(audit, CONTRACT_IDS.fs).observed)
      .toBe('{ m0, m1, m2, m3, m4, m5, m6, m7, +2 }')
  })

  it('prefers own enumerable keys when the service is a plain object', async () => {
    const audit = await auditContracts(healthyContext({ commands: { register: () => {} } }))
    expect(findingOf(audit, CONTRACT_IDS.commands).observed).toBe('{ register }')
  })

  it('describes primitives and null without pretending they are services', async () => {
    const primitives = await auditContracts(healthyContext({ tools: 7 }))
    expect(findingOf(primitives, CONTRACT_IDS.tools).observed).toBe('number')

    const nullish = await auditContracts(healthyContext({ tools: null }))
    expect(findingOf(nullish, CONTRACT_IDS.tools).observed).toBe('null')
  })
})

describe('auditContracts — DSH version resolution', () => {
  it('tries dshBrand, then brand, then packageManifest', async () => {
    const brand = await auditContracts(healthyContext({
      get: (name: string) => (name === 'brand' ? { version: 'from-brand' } : undefined),
    }))
    expect(brand.dshVersion).toBe('from-brand')

    const manifest = await auditContracts(healthyContext({
      get: (name: string) => (name === 'packageManifest' ? { version: 'from-manifest' } : undefined),
    }))
    expect(manifest.dshVersion).toBe('from-manifest')
  })

  it('prefers dshBrand when several services expose a version', async () => {
    const audit = await auditContracts(healthyContext({ get: () => ({ version: 'first' }) }))
    expect(audit.dshVersion).toBe('first')
  })

  it('reports no DSH version for an empty or non-string version', async () => {
    expect((await auditContracts(healthyContext({ get: () => ({ version: '' }) }))).dshVersion).toBeUndefined()
    expect((await auditContracts(healthyContext({ get: () => ({}) }))).dshVersion).toBeUndefined()
    expect((await auditContracts(healthyContext({ get: () => undefined }))).dshVersion).toBeUndefined()
  })

  it('survives a context without a get()', async () => {
    const audit = await auditContracts(healthyContext({ get: undefined }))
    expect(audit.dshVersion).toBeUndefined()
    // The rest of the audit still answers: `dshVersion: undefined` is a valid result.
    expect(audit.findings).toHaveLength(22)
  })
})

describe('formatAudit', () => {
  it('summarises a healthy audit with the versions and every ok id', async () => {
    const audit = await auditContracts(healthyContext())
    const text = formatAudit(audit)
    const lines = text.split('\n')
    expect(lines[0]).toBe(`回退插件契约自检 · 插件 ${PLUGIN_VERSION} · DSH 0.1.7-rc.2`)
    expect(lines[1]).toBe('全部 22 项依赖正常。')
    expect(lines.filter(line => line.startsWith('  [正常] '))).toHaveLength(22)
    expect(lines).toContain('  [正常] session.surface')
    expect(text).not.toContain('[缺失]')
    expect(text).not.toContain('[降级]')
    expect(text).not.toContain('[未探针]')
    expect(lines[lines.length - 1]).toContain('「未探针」')
  })

  it('leaves the DSH version out of the header when it is unknown', async () => {
    const audit = await auditContracts({})
    expect(formatAudit(audit).split('\n')[0]).toBe(`回退插件契约自检 · 插件 ${PLUGIN_VERSION}`)
  })

  it('counts the bad findings, tags each one and prints its observed value and remedy', async () => {
    const audit = await auditContracts(healthyContext({ fs: undefined }))
    const text = formatAudit(audit)
    const lines = text.split('\n')
    const bad = audit.findings.filter(finding => finding.status !== 'ok')
    expect(bad).toHaveLength(7) // filesystem + six fs primitives
    expect(lines[1]).toBe('22 项依赖中有 7 项异常：')
    expect(text).toContain('  [缺失] filesystem — filesystem access: capture, restore, delete')
    expect(text).toContain('         实测：service not resolvable through ctx.get')
    expect(text).toContain('         处置：the fs service is required; without it the plugin cannot load')
    // A healthy audit lists the ok ids; an unhealthy one does not.
    expect(text).not.toContain('  [正常] ')
  })

  it('uses the degraded tag and names the remedy for a degraded seam', async () => {
    const audit = await auditContracts(healthyContext({ sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) } }))
    const text = formatAudit(audit)
    expect(text).toContain('  [降级] sandboxPolicy.resolve({ session })')
    expect(text).toContain('处置：sandboxPolicy.resolve() no longer returns a workspaceRoot')
  })

  it('tags an unprobed seam `未探针` instead of claiming it is degraded', async () => {
    const audit = await auditContracts(healthyContext({ sessions: { get: () => {}, list: () => [] } }))
    const text = formatAudit(audit)
    expect(text.split('\n')[1]).toBe('22 项依赖中有 3 项异常：')
    expect(text).toContain('  [未探针] session.snapshotEvents — ')
    expect(text).toContain('  [未探针] session.append(surfaceOp) — ')
    expect(text).toContain('  [未探针] session.surface — ')
    expect(text).not.toContain('[降级]')
    expect(text).toContain('实测：not probed: no live session available')
  })

  it('omits the remedy line for a finding that has none', () => {
    const audit: ContractAudit = {
      dshVersion: undefined,
      pluginVersion: '9.9.9',
      findings: [
        { id: 'seam', purpose: 'purpose', status: 'missing', observed: 'seen' },
        { id: 'slow-seam', purpose: 'other', status: 'degraded', observed: 'not probed: nothing there' },
      ],
    }
    const lines = formatAudit(audit).split('\n')
    expect(lines[0]).toBe('回退插件契约自检 · 插件 9.9.9')
    expect(lines[1]).toBe('2 项依赖中有 2 项异常：')
    expect(lines[2]).toBe('  [缺失] seam — purpose')
    expect(lines[3]).toBe('         实测：seen')
    expect(lines[4]).toBe('  [未探针] slow-seam — other')
    expect(lines[5]).toBe('         实测：not probed: nothing there')
    expect(lines.some(line => line.includes('处置：'))).toBe(false)
  })

  it('handles an audit with no findings at all', () => {
    const lines = formatAudit({ dshVersion: '0.1.7-rc.2', pluginVersion: '1.0.0', findings: [] }).split('\n')
    expect(lines[0]).toBe('回退插件契约自检 · 插件 1.0.0 · DSH 0.1.7-rc.2')
    expect(lines[1]).toBe('全部 0 项依赖正常。')
  })

  it('lists the bad findings in the order the audit produced them', async () => {
    const audit = await auditContracts(healthyContext({ fs: undefined }))
    const ids = reportLines(audit).map(line => line.replace(/^ {2}\[[^\]]+\] /, '').split(' — ')[0])
    expect(ids).toEqual([
      CONTRACT_IDS.fs,
      CONTRACT_IDS.resolve,
      CONTRACT_IDS.processPath,
      CONTRACT_IDS.stat,
      CONTRACT_IDS.readText,
      CONTRACT_IDS.writeText,
      CONTRACT_IDS.editText,
    ])
  })
})
