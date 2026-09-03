// Loads the nine js/ modules into a Node vm context so pure functions can be unit-tested.
//
// WHY THIS EXISTS. The app has ~65 strictly pure functions (formatters, date maths, the periodization
// percentage, set normalisation) and the ONLY way to call any of them was to boot Chromium, log into
// Supabase (~2.5s), and reach them through `page.evaluate`. tests/full-file-review-2026-08-01.spec.js
// does exactly that to test `_buildTargetCols`. Here the same call is sub-millisecond.
//
// It changes NOTHING the browser runs. The nine files are loaded verbatim, in the order index.html
// declares, as classic scripts sharing one global — the same shape the browser gives them.
//
// SCRIPT ORDER IS READ FROM index.html, never hardcoded. Order is load-bearing here: `_runner` is
// declared in app-workouts.js and used 259 times in app-runner.js, and app-dashboard.js reads
// `_METRIC_COLORS` from app-progress.js which loads six scripts later. A hardcoded list in this file
// would be a second copy of that fact, free to drift from the real one.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = join(HERE, '..')

/** Script sources in index.html order. BOM-stripped: 3 of the 9 files open with a `function` on line
 *  1, and a leading ﻿ makes `^function` scanning (and JSON.parse, and line-1 diffing) miss it. */
export function scriptOrder () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  const files = [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
  if (!files.length) throw new Error('load-app: no <script src="js/…"> tags found in index.html')
  return files
}

/** A DOM stub that is deliberately permissive: getElementById returns an element for ANY id.
 *  Three top-level calls are NOT optional-chained — app-core.js:992 (#login-form), :1017
 *  (#sign-out-btn) and app-progress.js:1091 (#invite-form) — so returning null there throws during
 *  load and nothing gets defined. Returning a stub is what makes the whole file set loadable. */
function makeElement () {
  const el = {
    style: {}, dataset: {}, classList: { add () {}, remove () {}, toggle () {}, contains: () => false },
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false, children: [],
    addEventListener () {}, removeEventListener () {}, appendChild () {}, removeChild () {},
    remove () {}, setAttribute () {}, getAttribute: () => null, removeAttribute () {},
    querySelector: () => makeElement(), querySelectorAll: () => [], closest: () => null,
    focus () {}, blur () {}, click () {}, scrollIntoView () {}, insertAdjacentHTML () {},
    getContext: () => ({})
  }
  return el
}

/** Supabase stub. Every query method returns `this` so a chain of any length resolves, and awaiting
 *  it yields the empty-but-shaped result the real client gives. A unit test that reaches the network
 *  is a unit test in name only — if a function under test touches `db`, that is a signal it is not
 *  pure and does not belong in this harness. */
function makeSupabase () {
  const result = { data: null, error: null, count: 0 }
  const chain = {
    then: (res) => res(result),          // awaitable
    select () { return chain }, insert () { return chain }, update () { return chain },
    delete () { return chain }, upsert () { return chain }, eq () { return chain },
    neq () { return chain }, gt () { return chain }, gte () { return chain }, lt () { return chain },
    lte () { return chain }, like () { return chain }, ilike () { return chain }, is () { return chain },
    in () { return chain }, or () { return chain }, not () { return chain }, order () { return chain },
    limit () { return chain }, range () { return chain }, single () { return chain },
    maybeSingle () { return chain }, head () { return chain }
  }
  return {
    createClient: () => ({
      from: () => chain,
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe () {} } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
      functions: { invoke: async () => ({ data: null, error: null }) }
    })
  }
}

/**
 * Load every module and return the sandbox global.
 * Every top-level `function` declaration becomes a property on it, so tests call them by name.
 */
export function loadApp () {
  const files = scriptOrder()

  const sandbox = {}
  const doc = {
    getElementById: () => makeElement(),
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    addEventListener () {}, removeEventListener () {},
    body: makeElement(), documentElement: makeElement(),
    head: makeElement()
  }

  Object.assign(sandbox, {
    window: sandbox,                     // `window.x = 1` and a bare `x` must be the same slot
    globalThis: sandbox,
    document: doc,
    supabase: makeSupabase(),
    location: { hash: '', href: 'http://localhost:3001/', search: '', pathname: '/' },
    localStorage: {
      _v: {},
      getItem (k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null },
      setItem (k, v) { this._v[k] = String(v) },
      removeItem (k) { delete this._v[k] },
      clear () { this._v = {} }
    },
    navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
    Chart: Object.assign(function Chart () { return { destroy () {}, update () {} } },
      { getChart: () => null, register () {} }),
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({}) }),
    alert () {}, confirm: () => true, prompt: () => null,
    // `location` is read as window.location at app-core.js:2.
    addEventListener () {}, removeEventListener () {},
    URL, URLSearchParams, TextEncoder, TextDecoder, Intl, Math, JSON, Date
  })
  sandbox.window = sandbox
  sandbox.globalThis = sandbox

  const context = vm.createContext(sandbox)

  for (const rel of files) {
    const src = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '')
    try {
      new vm.Script(src, { filename: rel }).runInContext(context)
    } catch (err) {
      // Name the file. A failure here means a NEW top-level side effect was added that the stubs do
      // not cover — the fix is to widen the stub, never to skip the file, because a partially loaded
      // set would silently leave later functions undefined and every test would "pass" by absence.
      throw new Error(`load-app: ${rel} failed to load in the Node sandbox — a new top-level side ` +
        `effect probably needs a stub.\n  ${err.message}`)
    }
  }
  return context
}

/**
 * Read a top-level binding by name, whether it is a `function` declaration or a `const` arrow.
 *
 * This distinction is not academic. A top-level `function foo()` becomes a PROPERTY of the global
 * object; a top-level `const foo = …` is a LEXICAL binding that does not. So Object.keys(sandbox)
 * finds `_deltaBadge` but not `_rollingAvg` (js/app-progress.js:2340), even though both are
 * reachable by bare name from any later script.
 *
 * That is the SAME mechanism that makes the 20 cross-file bindings invisible to tooling — `_runner`,
 * `currentUser`, `EVENT_COLOURS` and the rest are lexical, so nothing can see them without
 * evaluating in the context. Reading a name through here is the reliable way.
 */
export function get (name, context = app()) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`get: unsafe identifier ${name}`)
  try {
    return vm.runInContext(name, context)
  } catch {
    throw new Error(`get: no top-level binding named ${name} — check it is not misspelt, and that ` +
      `its module is in index.html script order`)
  }
}

/** Convenience: load once per process. */
let _cached = null
export function app () {
  if (!_cached) _cached = loadApp()
  return _cached
}
