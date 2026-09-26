//#region src/invariant.ts
const PACKAGE_NAME = "@nianchu/dsh-rollback";
/** Cordis companion plugin name. */
const name = "rollback-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No relational invariant of its own: the `rollback/truncate` event is a
* log-only plugin event (core invariant falls through to the merge-extensible
* default), and the observable capture state is keyed weakly by session so its
* lifetime is the session's, not a cross-plugin relation.
*/
const install = () => {};
/** Register this package's invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
