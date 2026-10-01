// Fixes from the pre-push multi-agent review of 2026-10-01 — one test per finding that is checkable without a browser.
//
// Each case names the finding it pins. They all went RED on the code as reviewed and GREEN on the fix.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)
beforeEach(() => { run('renderRunner = function () {}') })

const blank = mt => get('_blankTableRow')({ metricType: mt })
const mk = (mt, rows, extra = {}) => ({ name: 'Ex', type: 'strength', metricType: mt, sets_json: [{}], tableRows: rows, loggedSets: [], ...extra })
const setRunner = exs => { ctx.__exs = exs; run('_runner = { exercises: __exs, exIdx: 0 }') }

describe('review B2 — a 0 kg load on a one-sided (unilateral) set survives the read-back', () => {
  test('a numeric 0 weight is kept as 0, a blank one is null, reps still gate the set', () => {
    const ex = mk('unilateral', [
      { ...blank('unilateral'), done: true, leftReps: '8', leftWeight: 0, rightReps: '8', rightWeight: '' }
    ])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets.length, 1)
    assert.equal(ex.loggedSets[0].leftWeight, 0, 'the 0 kg load vanished (0 || null) while the tick accepted the set')
    assert.equal(ex.loggedSets[0].rightWeight, null, 'a blank weight is still null, not 0')
  })
  test('a string "0" and an ordinary weight are unchanged', () => {
    const ex = mk('unilateral', [{ ...blank('unilateral'), done: true, leftReps: '5', leftWeight: '0', rightReps: '5', rightWeight: 20 }])
    get('_syncLoggedSetsFromTable')(ex)
    assert.equal(ex.loggedSets[0].leftWeight, '0')
    assert.equal(ex.loggedSets[0].rightWeight, 20)
  })
})

describe('review C4 — deleting row 0 when the ONLY prescription is the top set', () => {
  const TOP = { isTopSet: true, repsMin: '3', effortType: 'rpe', effortMin: '8' }
  test('no appended row is crowned the top set', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps'), done: true, weight: '100', reps: '3', effort: '8' }, { ...blank('weight_reps') }], { sets_json: [TOP] })
    setRunner([ex]); ex._liveE1RM = 115.9
    get('deleteTableRow')(0)
    assert.equal(ex.tableRows.length, 1)
    assert.ok(!ex.sets_json[0]?.isTopSet, 'the appended row slid into index 0 and inherited the top-set prescription')
    assert.equal(ex._liveE1RM, null)
  })
  test('deleting a LATER row of a lone top-set prescription leaves the top set alone', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps') }, { ...blank('weight_reps') }], { sets_json: [TOP] })
    setRunner([ex])
    get('deleteTableRow')(1)
    assert.equal(ex.sets_json[0].isTopSet, true)
  })
  test('a lone NON-top prescription is still left alone (the earlier rule)', () => {
    const ex = mk('weight_reps', [{ ...blank('weight_reps') }, { ...blank('weight_reps') }], { sets_json: [{ repsMin: '8' }] })
    setRunner([ex])
    get('deleteTableRow')(0)
    assert.equal(ex.sets_json.length, 1)
  })
})

describe('review B3 — the builder shows a prescribed effort of 0 instead of a blank box', () => {
  function render(sets, type = 'weight_reps') {
    const els = {}
    ctx.document.getElementById = id => (els[id] ||= { innerHTML: '', style: {}, dataset: {}, value: '' })
    ctx._templateSets = sets
    get('renderTemplateSets')('att-sets-container', type)
    return els['att-sets-container'].innerHTML
  }
  const valueOf = (html, id) => { const m = new RegExp(`id="${id}"[^>]*`).exec(html); return m ? (/value="([^"]*)"/.exec(m[0]) || [])[1] ?? null : undefined }

  test('numeric 0 in stored sets_json renders as value="0" (a blank box was flushed back to "" on the next save)', () => {
    const html = render([{ repsMin: '5', effortType: 'rir', effortMin: 0, effortMax: 0 }])
    assert.equal(valueOf(html, 'ts-emin-0'), '0')
    assert.equal(valueOf(html, 'ts-emax-0'), '0')
  })
  test('a string "0" and an ordinary range still render', () => {
    const a = render([{ repsMin: '5', effortMin: '0' }])
    assert.equal(valueOf(a, 'ts-emin-0'), '0')
    const b = render([{ repsMin: '5', effortMin: '7', effortMax: '9' }])
    assert.equal(valueOf(b, 'ts-emin-0'), '7'); assert.equal(valueOf(b, 'ts-emax-0'), '9')
  })
  test('no effort prescribed renders no value attribute (the fix must not invent one)', () => {
    const html = render([{ repsMin: '5' }, { repsMin: '5', effortMin: '', effortMax: null }])
    assert.equal(valueOf(html, 'ts-emin-0'), null)
    assert.equal(valueOf(html, 'ts-emin-1'), null)
    assert.equal(valueOf(html, 'ts-emax-1'), null)
  })
})

describe('review A7/C6 — an exercise name with * still finds its own row', () => {
  const pat = n => get('_exerciseNamePattern')(n)
  test('* becomes the single-character wildcard, so it can no longer match every name that starts the same way', () => {
    assert.equal(pat('Curl*'), 'Curl_')
    assert.equal(pat('a*b*'), 'a_b_')
  })
  test('LIKE metacharacters are still escaped first, and an ordinary name is untouched', () => {
    assert.equal(pat('50%_x'), String.raw`50\%\_x`)
    assert.equal(pat('Bench Press'), 'Bench Press')
    assert.equal(pat(String.raw`a\b*`), String.raw`a\\b_`)
  })
})
