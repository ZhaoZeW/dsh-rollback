import { describe, expect, it } from 'vitest'
import {
  isRollbackMarkerSource,
  LEGACY_ROLLBACK_MARKER_KIND,
  LEGACY_ROLLBACK_MARKER_PLUGIN,
  ROLLBACK_MARKER_KIND,
  ROLLBACK_MARKER_SOURCE,
} from '../src/core/marker-source.ts'

describe('ROLLBACK_MARKER_SOURCE', () => {
  it('carries a producer-owned kind, which is the v4 encoder’s whole rule', () => {
    // DSH 0.2.0 (session format v4) refuses a message source whose kind is empty
    // or exactly 'plugin' — `assertV4MessageSources`, "format v4 message requires
    // a producer-owned source kind". It refuses it while ENCODING, inside the
    // persistence drain, NOT on the append call: the append resolved, the failed
    // batch stayed at the head of the write queue, and every later write of that
    // session threw the same error, whatever model was selected. So this asserts
    // the framework's rule, not this plugin's spelling of it.
    expect(typeof ROLLBACK_MARKER_SOURCE.kind).toBe('string')
    expect(ROLLBACK_MARKER_SOURCE.kind.length).toBeGreaterThan(0)
    expect(ROLLBACK_MARKER_SOURCE.kind).not.toBe(LEGACY_ROLLBACK_MARKER_KIND)
  })

  it('matches what the v3→v4 migration itself assigns to an unlisted plugin', () => {
    // `producerKind()` maps a plugin DSH does not list to `plugin:<name>` and
    // drops the `plugin` field. Writing that same shape means a marker this build
    // writes and a pre-0.2 marker the migration rewrote are indistinguishable —
    // which is what lets one reader rule serve both.
    expect(ROLLBACK_MARKER_KIND).toBe(`plugin:${LEGACY_ROLLBACK_MARKER_PLUGIN}`)
    expect(ROLLBACK_MARKER_SOURCE.kind).toBe(ROLLBACK_MARKER_KIND)
  })

  it('keeps the marker a bare kind, with no `plugin` field beside it', () => {
    expect(Object.keys(ROLLBACK_MARKER_SOURCE)).toEqual(['kind'])
  })
})

describe('isRollbackMarkerSource', () => {
  it('reads every spelling a log can hold', () => {
    // One log holds all three: the migration REWROTE the oldest form to
    // `plugin:rollback` instead of dropping those markers, sessions written
    // between then and this release kept `{kind:'plugin',plugin:'rollback'}`, and
    // this build writes the v4 form.
    expect(isRollbackMarkerSource({ plugin: 'rollback' })).toBe(true)
    expect(isRollbackMarkerSource({ kind: 'plugin', plugin: 'rollback' })).toBe(true)
    expect(isRollbackMarkerSource({ kind: 'plugin:rollback' })).toBe(true)
  })

  it('never claims another plugin’s marker', () => {
    // `{kind:'plugin', plugin:'compaction'}` is the live shape next to ours: a
    // compaction also carries a surface `replace` but undoes nothing, so matching
    // it here would fold turns that still stand.
    expect(isRollbackMarkerSource({ kind: 'plugin', plugin: 'compaction' })).toBe(false)
    expect(isRollbackMarkerSource({ kind: 'plugin:compaction' })).toBe(false)
    expect(isRollbackMarkerSource({ kind: 'plugin' })).toBe(false)
    expect(isRollbackMarkerSource({ kind: 'runtime-context' })).toBe(false)
    expect(isRollbackMarkerSource({ plugin: 'rollbacks' })).toBe(false)
  })

  it('survives a missing or malformed source', () => {
    expect(isRollbackMarkerSource(undefined)).toBe(false)
    expect(isRollbackMarkerSource(null)).toBe(false)
    expect(isRollbackMarkerSource('rollback')).toBe(false)
    expect(isRollbackMarkerSource(42)).toBe(false)
    expect(isRollbackMarkerSource([])).toBe(false)
    expect(isRollbackMarkerSource({})).toBe(false)
  })
})
