// A `window.x = …` assignment REPLACES a top-level `function x()` of the same name: in a classic script every top-level function
// declaration is a property of window, so the assignment overwrites the function and the next call dies with "x is not a
// function". 2026-10-04: the periodization dialog kept its current method in window._pzBasis while a function _pzBasis() read a
// config's basis - the first time the dialog opened, the function was gone, and the program page was stuck on "Loading…" after
// the next save. The unit tests could not see it (they never open the dialog); only a browser run did.
//
// This pins the CLASS, not the instance: no `window.NAME =` anywhere may share its name with a top-level function or var.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, scriptOrder } from './load-app.mjs'

// sources: { file: text }. Returns [{ name, assignedIn, line, definedIn }].
export function findShadows (sources) {
  const defined = new Map()
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) defined.set(m[1], file)
    for (const m of src.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=/gm)) defined.set(m[1], file)
  }
  const out = []
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
      if (defined.has(m[1])) out.push({ name: m[1], assignedIn: file, line: src.slice(0, m.index).split('\n').length, definedIn: defined.get(m[1]) })
    }
  }
  return out
}

describe('window.x = … never shadows a top-level function', () => {
  test('the scanner finds a shadow when there is one (so a green run means something)', () => {
    const found = findShadows({
      'a.js': 'function _basis(cfg) { return 1 }\n',
      'b.js': 'function show() {\n  window._basis = 2\n}\n'
    })
    assert.deepEqual(found, [{ name: '_basis', assignedIn: 'b.js', line: 2, definedIn: 'a.js' }])
  })

  test('and not for an ordinary window property, a comparison, or an assignment to something else', () => {
    assert.deepEqual(findShadows({
      'a.js': 'function _basis(cfg) {}\nwindow._other = 1\nif (window._basis === 2) {}\nconst x = window._basis\nwindow._basisX = 3\n'
    }), [])
  })

  test('no script in index.html assigns a window property that is also one of its functions', () => {
    const sources = {}
    for (const rel of scriptOrder()) sources[rel] = readFileSync(join(REPO, rel), 'utf8').replace(/^﻿/, '')
    const found = findShadows(sources)
    assert.deepEqual(found, [], 'rename the window property (the state), not the function: ' + JSON.stringify(found))
  })
})
