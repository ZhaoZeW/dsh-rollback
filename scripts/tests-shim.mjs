// Minimal `vitest` implementation: exactly the surface these suites use.
//
// Verified surface (grepped from tests/): describe / it (+ .each) / expect with
// toBe, toEqual, toStrictEqual, toMatchObject, toContain, toBeNull, toBeUndefined,
// toBeDefined, toBeTruthy, toBeFalsy, toHaveLength, toMatch, toBeGreaterThan,
// toBeLessThanOrEqual, toThrow, toHaveBeenCalledTimes, toHaveBeenCalledWith, and
// their `.not` forms — plus beforeEach / afterEach and vi.fn.
//
// `toEqual` follows vitest/jest semantics for this codebase's use: recursive
// structural equality in which `undefined` properties are ignored (that is what
// lets a plan literal omit optional fields). `toBe` is Object.is.

const suites = []
let current = null
const beforeEachHooks = []
const afterEachHooks = []

class Assertion {
  constructor(actual, negated = false) {
    this.actual = actual
    this.negated = negated
  }

  get not() {
    return new Assertion(this.actual, !this.negated)
  }

  /**
   * `await expect(promise).rejects.toX(...)`: settles the promise and asserts on
   * the rejection reason. An un-rejected promise is itself a failure (mirroring
   * vitest), and so is a resolved one for `resolves`.
   */
  get rejects() {
    return this.#settled('rejects')
  }

  /** `await expect(promise).resolves.toX(...)`: asserts on the fulfilled value. */
  get resolves() {
    return this.#settled('resolves')
  }

  #settled(kind) {
    const thenable = this.actual
    const run = async (assertion) => assertion()
    // Each matcher is exposed as an async function awaiting the promise first.
    const handler = {
      get: (_target, property) => {
        if (typeof property !== 'string') return undefined
        return async (...args) => {
          let settled
          try {
            settled = await thenable
          } catch (error) {
            if (kind === 'rejects') {
              const inner = new Assertion(error, this.negated)
              return run(() => inner[property](...args))
            }
            throw new Error(`expected promise to resolve, but it rejected: ${fmt(error)}`)
          }
          if (kind === 'rejects') {
            throw new Error(`expected promise to reject, but it resolved with ${fmt(settled)}`)
          }
          const inner = new Assertion(settled, this.negated)
          return run(() => inner[property](...args))
        }
      },
    }
    return new Proxy({}, handler)
  }

  /** Report one outcome, flipping the verdict when `.not` is chained. */
  #check(pass, message) {
    if (pass === !this.negated) return
    throw new Error(this.negated ? `expected NOT to ${message}` : `expected to ${message}`)
  }

  toBe(expected) {
    this.#check(Object.is(this.actual, expected), `be ${fmt(expected)} (received ${fmt(this.actual)})`)
  }

  toStrictEqual(expected) {
    this.#check(deepEqual(this.actual, expected, false), `strictly equal ${fmt(expected)} (received ${fmt(this.actual)})`)
  }

  toEqual(expected) {
    this.#check(deepEqual(this.actual, expected, true), `equal ${fmt(expected)} (received ${fmt(this.actual)})`)
  }

  toMatchObject(expected) {
    this.#check(matchesObject(this.actual, expected), `match object ${fmt(expected)} (received ${fmt(this.actual)})`)
  }

  toContain(needle) {
    const actual = this.actual
    const pass = typeof actual === 'string'
      ? actual.includes(needle)
      : Array.isArray(actual)
        ? actual.some(item => deepEqual(item, needle, true))
        : false
    this.#check(pass, `contain ${fmt(needle)} (received ${fmt(actual)})`)
  }

  toBeNull() { this.#check(this.actual === null, `be null (received ${fmt(this.actual)})`) }
  toBeUndefined() { this.#check(this.actual === undefined, `be undefined (received ${fmt(this.actual)})`) }
  toBeDefined() { this.#check(this.actual !== undefined, `be defined (received ${fmt(this.actual)})`) }
  toBeTruthy() { this.#check(Boolean(this.actual), `be truthy (received ${fmt(this.actual)})`) }
  toBeFalsy() { this.#check(!this.actual, `be falsy (received ${fmt(this.actual)})`) }

  toHaveLength(length) {
    const actualLength = this.actual?.length
    this.#check(actualLength === length, `have length ${length} (received ${fmt(actualLength)})`)
  }

  toMatch(pattern) {
    const text = String(this.actual)
    const pass = pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))
    this.#check(pass, `match ${String(pattern)} (received ${fmt(this.actual)})`)
  }

  toBeGreaterThan(n) { this.#check(this.actual > n, `be > ${n} (received ${fmt(this.actual)})`) }
  toBeLessThan(n) { this.#check(this.actual < n, `be < ${n} (received ${fmt(this.actual)})`) }
  toBeLessThanOrEqual(n) { this.#check(this.actual <= n, `be <= ${n} (received ${fmt(this.actual)})`) }
  toBeGreaterThanOrEqual(n) { this.#check(this.actual >= n, `be >= ${n} (received ${fmt(this.actual)})`) }

  toThrow(expected) {
    if (typeof this.actual !== 'function') {
      this.#check(false, 'be a function that throws')
      return
    }
    let thrown
    let threw = false
    try {
      this.actual()
    } catch (error) {
      threw = true
      thrown = error
    }
    if (!threw) {
      this.#check(false, 'throw')
      return
    }
    if (expected === undefined) {
      this.#check(true, 'throw')
      return
    }
    // vitest accepts a message substring, a RegExp, an Error INSTANCE (compared
    // structurally), or an Error CONSTRUCTOR (checked with instanceof). The
    // suites use the latter two, so all four are supported.
    let pass
    if (expected instanceof RegExp) {
      pass = expected.test(thrown instanceof Error ? thrown.message : String(thrown))
    } else if (typeof expected === 'function') {
      pass = thrown instanceof expected
    } else if (expected instanceof Error) {
      pass = thrown instanceof Error
        && thrown.constructor === expected.constructor
        && thrown.message === expected.message
    } else {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      pass = message.includes(String(expected))
    }
    this.#check(pass, `throw matching ${fmt(expected)} (threw ${fmt(thrown instanceof Error ? `${thrown.constructor.name}: ${thrown.message}` : thrown)})`)
  }

  toHaveBeenCalledTimes(n) {
    this.#check(this.actual?.mock?.calls?.length === n, `have been called ${n} times (was ${this.actual?.mock?.calls?.length})`)
  }

  toHaveBeenCalledWith(...expected) {
    const calls = this.actual?.mock?.calls ?? []
    const pass = calls.some(args => deepEqual(args, expected, true))
    this.#check(pass, `have been called with ${fmt(expected)} (calls: ${fmt(calls)})`)
  }

  toHaveBeenLastCalledWith(...expected) {
    const calls = this.actual?.mock?.calls ?? []
    const last = calls[calls.length - 1]
    this.#check(last !== undefined && deepEqual(last, expected, true),
      `have been last called with ${fmt(expected)} (calls: ${fmt(calls)})`)
  }

  toHaveBeenCalled() {
    this.#check((this.actual?.mock?.calls?.length ?? 0) > 0, 'have been called')
  }
}

/** Recursive structural equality; `ignoreUndefined` mirrors jest's `toEqual`. */
function deepEqual(a, b, ignoreUndefined) {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i], ignoreUndefined))
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const left = a[key]
    const right = b[key]
    // jest/vitest ignore an own property whose value is `undefined` ON BOTH SIDES
    // only. Ignoring a key present on one side alone is how an extra, VALUED
    // property silently passes — which is exactly the regression class this
    // matcher exists to catch (a new `after` field on every plan entry).
    if (ignoreUndefined && left === undefined && right === undefined) continue
    if (!deepEqual(left, right, ignoreUndefined)) return false
  }
  return true
}

/** Whether every property of `expected` is present and equal in `actual`. */
function matchesObject(actual, expected) {
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected)
  if (actual === null || typeof actual !== 'object') return false
  for (const [key, value] of Object.entries(expected)) {
    if (value !== null && typeof value === 'object') {
      if (!matchesObject(actual[key], value)) return false
    } else if (!deepEqual(actual[key], value, true)) {
      return false
    }
  }
  return true
}

function fmt(value) {
  try {
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
    const text = JSON.stringify(value)
    if (text === undefined) return String(value)
    return text.length > 300 ? `${text.slice(0, 300)}…` : text
  } catch {
    return String(value)
  }
}

/** `describe(title, body)`; nesting appends to the current path. */
export function describe(title, body) {
  const previous = current
  const suite = { path: [...(previous?.path ?? []), title], tests: [] }
  suites.push(suite)
  current = suite
  try {
    body()
  } catch (error) {
    suite.tests.push({ name: '<suite body threw>', fn: () => { throw error } })
  } finally {
    current = previous
  }
}

function registerTest(name, fn) {
  if (current === null) {
    // A top-level `it` (no describe) still gets a suite to live in.
    const suite = { path: ['<top level>'], tests: [] }
    suites.push(suite)
    current = suite
    current = null
    suite.tests.push({ name, fn })
    return
  }
  current.tests.push({ name, fn })
}

export function it(name, fn) {
  registerTest(name, fn)
}

it.each = (cases) => (name, fn) => {
  const rows = Array.isArray(cases) ? cases : Object.entries(cases).map(([k, v]) => [k, v])
  for (const row of rows) {
    const values = Array.isArray(row) ? row : [row]
    const label = typeof name === 'string' ? name.replace(/%[sdifjo]/g, () => fmt(values.shift())) : String(name)
    registerTest(label, () => fn(...(Array.isArray(row) ? row : [row])))
  }
}
it.skip = (name) => { registerTest(`${name} (skipped)`, () => {}) }
it.only = it

export function beforeEach(fn) { beforeEachHooks.push(fn) }
export function afterEach(fn) { afterEachHooks.push(fn) }
export function beforeAll(fn) { beforeEachHooks.push(fn) }
export function afterAll(fn) { afterEachHooks.push(fn) }

export const expect = actual => new Assertion(actual)

/** `vi.fn` with the call record the suites assert on. */
export const vi = {
  fn(implementation) {
    const mock = function (...args) {
      mock.mock.calls.push(args)
      if (implementation !== undefined) return implementation(...args)
      return undefined
    }
    mock.mock = { calls: [], results: [] }
    mock.mockClear = () => { mock.mock.calls.length = 0 }
    mock.mockReset = () => { mock.mock.calls.length = 0 }
    return mock
  },
}

/**
 * Run every registered suite.
 * @returns the number of failures.
 */
export async function runSuites() {
  let passed = 0
  const failures = []
  for (const suite of suites) {
    const label = suite.path.join(' > ')
    console.log(`\n${label}`)
    for (const test of suite.tests) {
      try {
        for (const hook of beforeEachHooks) await hook()
        await test.fn()
        for (const hook of afterEachHooks) await hook()
        passed++
        console.log(`  ok   ${test.name}`)
      } catch (error) {
        failures.push({ label, name: test.name, error })
        console.log(`  FAIL ${test.name}`)
      }
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`)
  for (const failure of failures) {
    console.log(`\n--- ${failure.label} > ${failure.name}`)
    console.log(failure.error?.stack ?? String(failure.error))
  }
  return failures.length
}
