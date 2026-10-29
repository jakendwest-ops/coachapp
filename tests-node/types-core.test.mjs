// Pins the JSDoc types on app-core's most-called shared helpers, by running tsc over a fixture that
// uses them the way callers do.
//
// WHY THE IDS ARE THE POINT. Solo's clients row has coach_id = NULL, and a client with no record yet
// has no id at all - four separate bugs here were a nullable id treated as always present. If
// _getCurrentClientId() is typed (or inferred) as `any`, the checker waves `id.length` through and the
// type gate teaches nothing. Typed `Promise<string|null>`, the same code is an error under
// strictNullChecks. The fixture turns strictNullChecks on for ITSELF only; the app's jsconfig stays
// non-strict, so this pins the annotation without changing what the ratchet counts.
//
// Each case has a paired NEGATIVE line (the same use after a null check, which must NOT error) so a
// fixture that errors for some unrelated reason cannot pass vacuously.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { REPO } from './load-app.mjs'

const FIXTURE = `
async function _typesFixture () {
  const id = await _getCurrentClientId()
  /** @type {string} */ const unsafeId = id                       // L4: must error (string|null -> string)
  if (id) { /** @type {string} */ const safeId = id }              // L5: must NOT error
  const ok = await confirmDialog('Delete?')
  /** @type {string} */ const notBool = ok                         // L7: must error (boolean -> string)
  /** @type {boolean} */ const isBool = ok                         // L8: must NOT error
  /** @type {number} */ const notStr = escapeHtml(3)               // L9: must error (string -> number)
  /** @type {string} */ const isStr = escapeHtml(null)             // L10: must NOT error (accepts anything)
}
`

function fixtureErrors () {
  const dir = mkdtempSync(join(tmpdir(), 'types-core-'))
  try {
    writeFileSync(join(dir, 'fixture.js'), FIXTURE, 'utf8')
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { allowJs: true, checkJs: true, noEmit: true, target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'], strict: false, strictNullChecks: true, skipLibCheck: true, types: [] },
      files: [join(REPO, 'types', 'globals.d.ts'), join(REPO, 'js', 'app-core.js'), join(dir, 'fixture.js')]
    }), 'utf8')
    const r = spawnSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json', '--pretty', 'false'],
      { cwd: dir, encoding: 'utf8' })
    const out = (r.stdout || '') + (r.stderr || '')
    // Unattributed (config) errors would make every assertion below meaningless.
    assert.doesNotMatch(out, /^error TS/m, `tsc config error:\n${out}`)
    return new Set([...out.matchAll(/fixture\.js\((\d+),\d+\): error TS\d+/g)].map(m => Number(m[1])))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('app-core helper types: nullable ids, boolean confirm, string escape', () => {
  const lines = fixtureErrors()
  assert.ok(lines.has(4), '_getCurrentClientId() must be Promise<string|null> - an unchecked id must not type as string')
  assert.ok(!lines.has(5), 'the same id after a null check must type-check')
  assert.ok(lines.has(7), 'confirmDialog() must resolve to boolean')
  assert.ok(!lines.has(8), 'confirmDialog() boolean must be assignable to boolean')
  assert.ok(lines.has(9), 'escapeHtml() must return string')
  assert.ok(!lines.has(10), 'escapeHtml() must accept null (it returns "" for falsy input)')
})
