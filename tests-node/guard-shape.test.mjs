// The re-entry guard is a SHAPE contract, and shape contracts are the ones that break silently.
//
// `guardReentry(name)` (js/app-core.js:117) works by replacing `window[name]` with a wrapper holding
// one try/finally. That only works if `name` is a top-level `function` declaration, because those —
// and ONLY those — are properties of the global object. Convert any target to
// `const saveX = async () => {}` and three things happen at once:
//
//   1. `window[name]` is `undefined` at registration time, so guardReentry bails out early;
//   2. the bare name every caller and every onclick= string uses still resolves — to the UNWRAPPED
//      function, via the lexical binding;
//   3. the `guardReentry('saveX')` line is still sitting there in the source, so the code READS as
//      guarded to anyone reviewing it.
//
// The result is a double-press path that looks protected and is not. That is the
// reports-success-while-doing-nothing class this project keeps shipping — see
// [[feedback_reports_success_doing_nothing]] — and the refactor plan explicitly forbids changing the
// declaration shape of these 12 functions. A rule nobody can break by accident needs a check that
// refuses, not a line in a plan ([[feedback_written_rules_dont_reduce_errors]]).
//
// There IS a console.error on that path, but nothing reads the browser console in CI, and the
// existing Playwright spec (tests/reentry-guard-2026-08-28.spec.js) covers behaviour on a handful of
// paths, not the shape of all twelve.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { get, app, scriptOrder, REPO } from './load-app.mjs'

/**
 * The registrations, PARSED FROM SOURCE — deliberately not a list in this file.
 *
 * A hardcoded list of twelve names would be a second copy of a fact that lives in the js/ files, and
 * it would go stale in the one direction that matters: add a 13th `guardReentry(...)` call and the
 * hardcoded list would keep passing while saying nothing about the new one.
 *
 * Anchored at the START of a line, which is what separates a real registration from the three places
 * the identifier merely appears — `function guardReentry(name)` itself and the two comments at
 * app-core.js:60 and :120 that name it in prose.
 */
function registrations () {
  const found = []
  for (const rel of scriptOrder()) {
    // BOM-stripped for the same reason load-app strips it: 3 of the 9 files open with a BOM, and a
    // leading ﻿ defeats ^-anchored scanning on line 1.
    const src = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '')
    src.split(/\r?\n/).forEach((line, i) => {
      const m = /^guardReentry\(\s*['"]([A-Za-z0-9_$]+)['"]\s*\)/.exec(line)
      if (m) found.push({ name: m[1], where: `${rel}:${i + 1}` })
    })
  }
  return found
}

describe('re-entry guard shape', () => {
  test('the registrations are found at all — a scan that matches nothing would pass every test below', () => {
    const regs = registrations()
    // Twelve as of 2026-09-03. Asserted as a FLOOR, not an equality: adding a guard is a good thing
    // and must not turn this red, but losing one silently must.
    assert.ok(regs.length >= 12,
      `expected at least 12 guardReentry() registrations, found ${regs.length}: ` +
      regs.map(r => r.where).join(', '))
    // Distinct names: registering the same name twice is a no-op by design (guardReentry is
    // idempotent), so a duplicate is a copy-paste error hiding a function that was meant to be guarded.
    const names = regs.map(r => r.name)
    assert.equal(new Set(names).size, names.length, `duplicate registration: ${names.join(', ')}`)
  })

  test('every guarded name resolves to a WRAPPER, by the bare name callers actually use', () => {
    for (const { name, where } of registrations()) {
      // get() evaluates the bare identifier inside the sandbox, so this is the same lookup an
      // onclick="saveNewTemplate()" string performs — not a window[...] read that could disagree with it.
      const fn = get(name)
      assert.equal(typeof fn, 'function', `${where}: ${name} is not a function after load`)
      assert.equal(fn._reentryGuarded, true,
        `${where}: ${name} is NOT guarded. The usual cause is its declaration changing from ` +
        `\`function ${name}(…)\` to \`const ${name} = …\`: a const is a lexical binding, not a ` +
        `property of the global object, so guardReentry() found nothing to wrap and returned early — ` +
        `while the guardReentry('${name}') line still reads as though it worked.`)
    }
  })

  test('the bare name and the global property are the SAME object — the exact thing a const splits', () => {
    const ctx = app()
    for (const { name, where } of registrations()) {
      assert.equal(get(name), ctx[name],
        `${where}: the bare \`${name}\` and \`window.${name}\` are different objects. That is the ` +
        `signature of a lexical declaration shadowing the global property — callers would get one ` +
        `and guardReentry would have wrapped the other.`)
    }
  })

  test('the unwrapped function is still reachable through _inner (the test seam)', () => {
    for (const { name, where } of registrations()) {
      const fn = get(name)
      assert.equal(typeof fn._inner, 'function', `${where}: ${name}._inner missing`)
      assert.notEqual(fn._inner, fn, `${where}: ${name}._inner is the wrapper itself — nothing was wrapped`)
      assert.notEqual(fn._inner._reentryGuarded, true, `${where}: ${name} was double-wrapped`)
    }
  })

  test('guardReentry refuses a name that does not exist rather than pretending to guard it', () => {
    // The failure mode this whole file exists for, exercised directly. Registering a name with no
    // function behind it must not create a guarded-looking binding out of nothing.
    const ctx = app()
    get('guardReentry')('_noSuchFunctionAnywhere')
    assert.equal(ctx._noSuchFunctionAnywhere, undefined,
      'guardReentry invented a binding for a name that has no function')
  })

  test('registering twice is a no-op, not a double wrap', () => {
    const first = registrations()[0]
    const before = get(first.name)
    get('guardReentry')(first.name)
    assert.equal(get(first.name), before, `${first.where}: re-registration replaced the wrapper`)
  })
})
