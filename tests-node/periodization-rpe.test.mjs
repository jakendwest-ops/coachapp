// Periodization by RPE (Jake, 2026-10-04: "Add periodization should come with a % and RPE tab so the user can choose how they
// wish to periodize their training"; scoped as ONE method per phase).
//
// A phase's periodization_config (an UNTYPED jsonb column) carries basis:'rpe' to step the RPE target of the Week-1 sets
// instead of the percentage of 1RM. No basis - every phase saved before 2026-10-04 - means '%'. These are the pure parts:
// reading the basis, the week-by-week value, the rewrite of one set (RPE or RIR), the Week-1 report behind the dialog's
// heads-up, the label, and the typed-RPE parser. The wiring (dialog, save, generate) is covered by the browser spec.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const basis = c => get('_pzBasis')(c)
const parse = v => get('_pzParseRpe')(v)
const rpeFor = (type, cfg, week, total, tier) => get('_computePeriodizedRpe')(type, cfg, week, total, tier)
const wave = (s, rpe) => get('_applyWaveRpe')(s, () => rpe)
const report = (b, pws) => get('_pzWeek1Report')(b, pws)
const label = ph => get('_periodizationLabel')(ph)
// Arrays built inside the app's vm context have that context's Array.prototype; copy them across before a strict deepEqual.

// One Week-1 slot as loadAllPhaseWorkouts returns it: the slot, its template and the template's exercises with their sets.
const slot = (...exercises) => ({ workout_templates: { name: 'Upper', workout_template_exercises: exercises.map(sets_json => ({ sets_json })) } })

describe('_pzBasis - which method a phase uses', () => {
  test("only an explicit 'rpe' is RPE; no config, no basis and anything else is %", () => {
    assert.equal(basis({ basis: 'rpe', startRpe: 7 }), 'rpe')
    assert.equal(basis({ startPct: 65, endPct: 85 }), 'pct', 'a phase saved before RPE existed')
    assert.equal(basis({ basis: 'pct' }), 'pct')
    assert.equal(basis(null), 'pct')
    assert.equal(basis(undefined), 'pct')
    assert.equal(basis({}), 'pct')
    assert.equal(basis({ basis: 'RPE' }), 'pct', 'the stored value is exact, not guessed at')
    assert.equal(basis({ basis: ' rpe' }), 'pct')
    assert.equal(basis({ basis: ['rpe'] }), 'pct')
    assert.equal(basis('rpe'), 'pct', 'a config that is a bare string is not a config')
  })
})

describe('_pzParseRpe - what may be typed into an RPE box', () => {
  test('whole and half points from 1 to 10 are accepted, text or number', () => {
    assert.equal(parse('7'), 7)
    assert.equal(parse('7.5'), 7.5)
    assert.equal(parse(' 8 '), 8)
    assert.equal(parse('10'), 10)
    assert.equal(parse('1'), 1)
    assert.equal(parse(9.5), 9.5)
    assert.equal(parse('6.0'), 6)
  })
  test('anything else is refused: off the half-point grid, out of range, empty, not a number', () => {
    for (const bad of ['7.3', '7.25', '10.5', '11', '0.5', '0', '-8', '', '  ', 'abc', '7,5', null, undefined, NaN, Infinity, true, {}, []]) {
      assert.equal(parse(bad), null, `${JSON.stringify(bad)} must be refused`)
    }
  })
})

describe('_computePeriodizedRpe - the RPE a given week gets', () => {
  const lin = { basis: 'rpe', startRpe: 7, endRpe: 9 }

  test('Linear steps evenly from start to end across the phase, rounded to half points', () => {
    assert.deepEqual([1, 2, 3, 4].map(w => rpeFor('linear', lin, w, 4)), [7, 7.5, 8.5, 9])
    assert.deepEqual([1, 2, 3, 4, 5].map(w => rpeFor('linear', { startRpe: 6, endRpe: 10 }, w, 5)), [6, 7, 8, 9, 10])
  })

  test('Linear can step DOWN as well as up', () => {
    assert.deepEqual([1, 2, 3].map(w => rpeFor('linear', { startRpe: 9, endRpe: 7 }, w, 3)), [9, 8, 7])
  })

  test('a one-week phase just gets the start value (no divide by zero)', () => {
    assert.equal(rpeFor('linear', lin, 1, 1), 7)
  })

  test('the deload week gets its own RPE and the other weeks still step across the whole phase', () => {
    const c = { startRpe: 7, endRpe: 9, deloadWeek: 4, deloadRpe: 6 }
    assert.deepEqual([1, 2, 3, 4].map(w => rpeFor('linear', c, w, 4)), [7, 7.5, 8.5, 6])
  })

  test('a deload week with no deload RPE falls through to the ordinary step', () => {
    assert.equal(rpeFor('linear', { startRpe: 7, endRpe: 9, deloadWeek: 4 }, 4, 4), 9)
  })

  test('a missing or unusable start/end gives no number (the set is then left alone)', () => {
    assert.equal(rpeFor('linear', {}, 2, 4), null)
    assert.equal(rpeFor('linear', { startRpe: 7 }, 2, 4), null)
    assert.equal(rpeFor('linear', { endRpe: 9 }, 2, 4), null)
    assert.equal(rpeFor('linear', { startRpe: 'abc', endRpe: 9 }, 2, 4), null)
    assert.equal(rpeFor('linear', null, 2, 4), null)
  })

  test('numbers saved as text still work, and a real 0 start is not mistaken for missing', () => {
    assert.equal(rpeFor('linear', { startRpe: '7', endRpe: '9' }, 4, 4), 9)
    assert.equal(rpeFor('linear', { startRpe: 0, endRpe: 4 }, 1, 3), 1, 'clamped up to the lowest RPE, not dropped as falsy')
  })

  test('the result always stays on the 1 to 10 scale, whatever the stored config says', () => {
    assert.equal(rpeFor('linear', { startRpe: 12, endRpe: 14 }, 1, 2), 10)
    assert.equal(rpeFor('linear', { startRpe: -3, endRpe: 0 }, 2, 2), 1)
  })

  test('Undulating gives each tier its own RPE, week after week, and Moderate when the slot has no tier', () => {
    const c = { basis: 'rpe', tiers: { heavy: { rpe: 9, reps: '3-5' }, moderate: { rpe: 8, reps: '6-8' }, light: { rpe: 7, reps: '10-12' } } }
    assert.equal(rpeFor('undulating', c, 1, 4, 'heavy'), 9)
    assert.equal(rpeFor('undulating', c, 3, 4, 'light'), 7)
    assert.equal(rpeFor('undulating', c, 2, 4, 'moderate'), 8)
    assert.equal(rpeFor('undulating', c, 2, 4), 8)
    assert.equal(rpeFor('undulating', c, 2, 4, null), 8)
  })

  test('Undulating with a tier that has no RPE (or an unknown tier) gives no number', () => {
    const c = { tiers: { heavy: { rpe: 9 }, moderate: {}, light: { rpe: '' } } }
    assert.equal(rpeFor('undulating', c, 1, 4, 'moderate'), null)
    assert.equal(rpeFor('undulating', c, 1, 4, 'light'), null)
    assert.equal(rpeFor('undulating', c, 1, 4, 'extreme'), null)
    assert.equal(rpeFor('undulating', {}, 1, 4, 'heavy'), null)
    assert.equal(rpeFor('undulating', null, 1, 4, 'heavy'), null)
  })

  test('no periodization type, or a type this does not know, gives no number', () => {
    assert.equal(rpeFor(null, lin, 2, 4), null)
    assert.equal(rpeFor('', lin, 2, 4), null)
    assert.equal(rpeFor('wave', lin, 2, 4), null)
  })
})

describe('_applyWaveRpe - rewriting one set', () => {
  test('a set with an RPE target gets the week\'s RPE on both ends, and nothing else about it changes', () => {
    const s = { repsMin: '5', repsMax: '5', weightMin: '100', restMin: '2:00', effortType: 'rpe', effortMin: '8', effortMax: '8', isTopSet: true }
    const r = wave(s, 9)
    assert.equal(r.effortMin, 9); assert.equal(r.effortMax, 9)
    assert.equal(r.effortType, 'rpe')
    assert.deepEqual({ ...r, effortMin: s.effortMin, effortMax: s.effortMax }, s, 'only the two effort ends moved')
  })

  test('a set with no effortType is on the RPE scale (the default everywhere else in the app)', () => {
    const r = wave({ effortMin: '7', effortMax: '7' }, 8.5)
    assert.equal(r.effortMin, 8.5); assert.equal(r.effortMax, 8.5)
  })

  test('a range collapses to the week\'s one number, like the % wave does', () => {
    const r = wave({ effortType: 'rpe', effortMin: '7', effortMax: '9' }, 8)
    assert.equal(r.effortMin, 8); assert.equal(r.effortMax, 8)
  })

  test('a set that has only one end filled in still counts as carrying an RPE', () => {
    assert.equal(wave({ effortMin: '7' }, 8).effortMax, 8)
    assert.equal(wave({ effortMax: '7' }, 8).effortMin, 8)
  })

  test('a RIR set converts: the week\'s RPE 9 is 1 rep in reserve, so "harder" means the same on both scales', () => {
    const r = wave({ effortType: 'rir', effortMin: '2', effortMax: '2' }, 9)
    assert.equal(r.effortType, 'rir', 'the set stays on its own scale')
    assert.equal(r.effortMin, 1); assert.equal(r.effortMax, 1)
    assert.equal(wave({ effortType: 'rir', effortMin: 3, effortMax: 3 }, 7.5).effortMin, 2.5)
  })

  test('RPE 10 on a RIR set is 0 - "to failure" is a real value and is written, not dropped', () => {
    const r = wave({ effortType: 'rir', effortMin: '2', effortMax: '2' }, 10)
    assert.equal(r.effortMin, 0); assert.equal(r.effortMax, 0)
  })

  test('a RIR 0 set already in Week 1 counts as carrying an effort (0 is real, not blank)', () => {
    const r = wave({ effortType: 'rir', effortMin: 0, effortMax: 0 }, 8)
    assert.equal(r.effortMin, 2); assert.equal(r.effortMax, 2)
    const t = wave({ effortType: 'rir', effortMin: '0', effortMax: '' }, 8)
    assert.equal(t.effortMin, 2)
  })

  test('a set with no effort target is returned untouched, and the wave is not even computed for it', () => {
    let called = 0
    for (const s of [{ repsMin: '5' }, { effortMin: '', effortMax: '' }, { effortMin: null, effortMax: undefined }, {}]) {
      const r = get('_applyWaveRpe')(s, () => { called++; return 9 })
      assert.equal(r, s)
    }
    assert.equal(called, 0)
  })

  test('a week with no RPE (null) leaves the set alone', () => {
    const s = { effortMin: '8', effortMax: '8' }
    assert.equal(wave(s, null), s)
    assert.equal(wave(s, undefined), s)
  })

  test('the % fields are never touched - a stored-1RM set and a top-set-based back-off keep the % the coach typed', () => {
    for (const intensityBasis of ['stored', 'topSet', undefined]) {
      const s = { intensityMin: '85', intensityMax: '85', intensityBasis, effortMin: '8', effortMax: '8' }
      const r = wave(s, 9)
      assert.equal(r.intensityMin, '85'); assert.equal(r.intensityMax, '85'); assert.equal(r.intensityBasis, intensityBasis)
      assert.equal(r.effortMin, 9)
    }
  })

  test('the input set is not modified', () => {
    const s = { effortType: 'rpe', effortMin: '8', effortMax: '8' }
    const copy = { ...s }
    const r = wave(s, 9)
    assert.notEqual(r, s)
    assert.deepEqual(s, copy)
  })
})

describe('_pzWeek1Report - what the dialog\'s heads-up counts', () => {
  const rpeSet = { effortType: 'rpe', effortMin: '8', effortMax: '8' }

  test('no Week 1 at all', () => {
    for (const none of [undefined, null, []]) {
      const r = report('rpe', none)
      assert.equal(r.sessions, 0); assert.equal(r.stepped, 0); assert.equal(r.mixed, false); assert.deepEqual(Array.from(r.values), [])
    }
  })

  test('RPE: counts the sets that carry an effort and the sessions they sit in', () => {
    const r = report('rpe', [slot([rpeSet, rpeSet, { repsMin: '5' }]), slot([rpeSet])])
    assert.equal(r.sessions, 2); assert.equal(r.stepped, 3)
    assert.deepEqual(Array.from(r.values), [8]); assert.equal(r.mixed, false)
  })

  test('RPE: a Week 1 with sessions but no RPE anywhere steps nothing - the warning case', () => {
    const r = report('rpe', [slot([{ repsMin: '5', intensityMin: '80' }, { repsMin: '5' }])])
    assert.equal(r.sessions, 1); assert.equal(r.stepped, 0)
  })

  test('RPE: a RIR set is read as its RPE, so RPE 8 and RIR 2 are the same value, and RPE 7 with RIR 2 are two', () => {
    const same = report('rpe', [slot([rpeSet, { effortType: 'rir', effortMin: '2', effortMax: '2' }])])
    assert.deepEqual(Array.from(same.values), [8]); assert.equal(same.mixed, false); assert.equal(same.stepped, 2)
    const mixed = report('rpe', [slot([{ effortMin: '7', effortMax: '7' }, { effortType: 'rir', effortMin: '2', effortMax: '2' }])])
    assert.deepEqual(Array.from(mixed.values), [7, 8]); assert.equal(mixed.mixed, true)
  })

  test('RPE: a RIR 0 set counts (0 is a real effort)', () => {
    const r = report('rpe', [slot([{ effortType: 'rir', effortMin: 0, effortMax: 0 }])])
    assert.equal(r.stepped, 1); assert.deepEqual(Array.from(r.values), [10])
  })

  test('RPE: it says how many of the stepped sets are written in RIR (the heads-up mentions the conversion only then)', () => {
    const r = report('rpe', [slot([rpeSet, { effortType: 'rir', effortMin: '2', effortMax: '2' }, { effortType: 'rir', effortMin: 1 }])])
    assert.equal(r.stepped, 3); assert.equal(r.rir, 2)
    assert.equal(report('rpe', [slot([rpeSet])]).rir, 0)
    assert.equal(report('pct', [slot([{ intensityMin: '70', effortType: 'rir', effortMin: '2' }])]).rir, 0, 'the % wave never counts RIR')
  })

  test('% : counts the sets the % wave will rewrite and, apart, the back-offs pointed at today\'s top set that keep their %', () => {
    const stored = { intensityMin: '70', intensityMax: '70' }
    const off = { intensityMin: '85', intensityMax: '85', intensityBasis: 'topSet' }
    const r = report('pct', [slot([stored, stored, off, off, off, { repsMin: '5' }])])
    assert.equal(r.stepped, 2); assert.equal(r.held, 3)
    assert.deepEqual(Array.from(r.values), [70]); assert.equal(r.mixed, false)
  })

  test('% : two different percentages in Week 1 are flagged as mixed', () => {
    const r = report('pct', [slot([{ intensityMin: '70' }, { intensityMin: '80' }])])
    assert.equal(r.mixed, true); assert.deepEqual(Array.from(r.values), [70, 80])
  })

  test('it counts exactly the sets generation will rewrite - both waves, set by set', () => {
    const sets = [
      { intensityMin: '70' }, { intensityMin: '80', intensityBasis: 'topSet' }, { intensityMin: '', intensityMax: '' },
      { effortMin: '8' }, { effortType: 'rir', effortMin: 0 }, { effortMin: '', effortMax: '' }, { repsMin: '5' }, { intensityMin: '75', effortMin: '7' }
    ]
    const pctRewritten = sets.filter(s => get('_applyWavePct')(s, () => 80) !== s).length
    const rpeRewritten = sets.filter(s => get('_applyWaveRpe')(s, () => 8) !== s).length
    assert.equal(report('pct', [slot(sets)]).stepped, pctRewritten)
    assert.equal(report('rpe', [slot(sets)]).stepped, rpeRewritten)
  })

  test('missing pieces never throw: no template, no exercises, sets that are not a list, holes in the list', () => {
    const r = report('rpe', [
      { workout_templates: null }, {}, { workout_templates: { workout_template_exercises: null } },
      slot(null), slot('nope'), slot([null, undefined, rpeSet])
    ])
    assert.equal(r.stepped, 1)
    assert.equal(r.sessions, 4, 'a slot whose template is missing is not a session')
  })
})

describe('_periodizationLabel - the phase chip', () => {
  test('RPE Linear reads "Linear RPE 7→9"', () => {
    assert.equal(label({ periodization_type: 'linear', periodization_config: { basis: 'rpe', startRpe: 7, endRpe: 9 } }), 'Linear RPE 7→9')
    assert.equal(label({ periodization_type: 'linear', periodization_config: { basis: 'rpe', startRpe: 7.5, endRpe: 9.5 } }), 'Linear RPE 7.5→9.5')
  })

  test('RPE Undulating lists Heavy / Moderate / Light', () => {
    const cfg = { basis: 'rpe', tiers: { heavy: { rpe: 9 }, moderate: { rpe: 8 }, light: { rpe: 7 } } }
    assert.equal(label({ periodization_type: 'undulating', periodization_config: cfg }), 'Undulating RPE (9/8/7)')
  })

  test('a thin RPE config still gets a chip', () => {
    assert.equal(label({ periodization_type: 'linear', periodization_config: { basis: 'rpe' } }), 'Linear RPE')
    assert.equal(label({ periodization_type: 'undulating', periodization_config: { basis: 'rpe' } }), 'Undulating RPE')
  })

  test('% chips are exactly what they were', () => {
    assert.equal(label({ periodization_type: 'linear', periodization_config: { startPct: 65, endPct: 85 } }), 'Linear 65→85%')
    assert.equal(label({ periodization_type: 'undulating', periodization_config: { tiers: { heavy: { pct: 85 }, moderate: { pct: 70 }, light: { pct: 55 } } } }), 'Undulating (85%/70%/55%)')
    assert.equal(label({ periodization_type: null, periodization_config: null }), null)
  })

  test('every stored value is escaped - the chip is interpolated raw into the phase header', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const lin = label({ periodization_type: 'linear', periodization_config: { basis: 'rpe', startRpe: evil, endRpe: '"><b>' } })
    assert.ok(!/<img|<b>/.test(lin), lin)
    assert.ok(lin.includes('&lt;img'), lin)
    const und = label({ periodization_type: 'undulating', periodization_config: { basis: 'rpe', tiers: { heavy: { rpe: evil }, moderate: { rpe: 8 }, light: { rpe: 7 } } } })
    assert.ok(!/<img/.test(und), und)
  })
})
