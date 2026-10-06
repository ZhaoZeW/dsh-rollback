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
export const ROLLBACK_MARKER_KIND = 'plugin:rollback'

/** The `kind` the v3→v4 migration assigns to an unclassified plugin. */
export const LEGACY_ROLLBACK_MARKER_KIND = 'plugin'

/** This plugin's name in a legacy marker's `source.plugin`. */
export const LEGACY_ROLLBACK_MARKER_PLUGIN = 'rollback'

/**
 * Provenance stamped on the marker: a producer-owned source kind.
 *
 * No `plugin` field, because v4 forbids the `kind: 'plugin'` shape this used to
 * use and the migration drops that field when it rewrites one.
 */
export const ROLLBACK_MARKER_SOURCE = { kind: ROLLBACK_MARKER_KIND } as const

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
export function isRollbackMarkerSource(source: unknown): boolean {
  if (source === null || typeof source !== 'object') return false
  const candidate = source as { kind?: unknown; plugin?: unknown }
  if (candidate.plugin === LEGACY_ROLLBACK_MARKER_PLUGIN) return true
  return candidate.kind === ROLLBACK_MARKER_KIND
}
