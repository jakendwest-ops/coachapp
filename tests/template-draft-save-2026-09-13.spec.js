const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2 } = require('./helpers')

test.describe('Template draft: creation', () => {
  test('opening a template builds window._templateDraft as an editable copy, untouched baseline kept separately', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Draft Model Test' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] },
        { template_id: t.id, exercise_name: '[E2E] Row', exercise_type: 'strength', order_index: 1, sets_json: [{ repsMin: '5' }] },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => ({
        templateId: window._templateDraft?.templateId,
        exerciseCount: window._templateDraft?.exercises?.length,
        baselineCount: window._templateDraft?.exercisesBaseline?.length,
        names: window._templateDraft?.exercises?.map(e => e.exercise_name),
        allHaveDraftKey: window._templateDraft?.exercises?.every(e => !!e._draftKey),
        allHaveRealId: window._templateDraft?.exercises?.every(e => typeof e.id === 'string'),
        // baseline and exercises must be SEPARATE arrays/objects, not the same reference —
        // otherwise mutating one mutates the other and there is nothing to diff against.
        separateArrays: window._templateDraft?.exercises !== window._templateDraft?.exercisesBaseline,
        meta: window._templateDraft?.meta,
        metaBaseline: window._templateDraft?.metaBaseline,
        separateMeta: window._templateDraft?.meta !== window._templateDraft?.metaBaseline,
      }))
      expect(r.templateId).toBe(setup.templateId)
      expect(r.exerciseCount).toBe(2)
      expect(r.baselineCount).toBe(2)
      expect(r.names).toEqual(['[E2E] Bench', '[E2E] Row'])
      expect(r.allHaveDraftKey, 'every draft row needs a stable local key for DOM/array matching').toBe(true)
      expect(r.allHaveRealId, 'a pre-existing row keeps its real database id in the draft').toBe(true)
      expect(r.separateArrays, 'exercises and exercisesBaseline must not be the same array reference').toBe(true)
      expect(r.meta).toEqual({ name: '[E2E] Draft Model Test', description: null })
      expect(r.separateMeta, 'meta and metaBaseline must not be the same object reference').toBe(true)

      // sets_json must be deep-cloned per draft row, not shared by reference between exercises
      // and exercisesBaseline. Both arrays are built by mapping the same fetched rows through
      // _toDraftRow, so a shallow copy would leave a draft-row edit silently corrupting the
      // "untouched baseline" the whole draft/baseline split exists to guarantee.
      const indep = await page.evaluate(() => {
        window._templateDraft.exercises[0].sets_json[0].repsMin = 'MUTATED'
        return {
          draftValue: window._templateDraft.exercises[0].sets_json[0].repsMin,
          baselineValue: window._templateDraft.exercisesBaseline[0].sets_json[0].repsMin,
          sameArray: window._templateDraft.exercises[0].sets_json === window._templateDraft.exercisesBaseline[0].sets_json,
        }
      })
      expect(indep.draftValue).toBe('MUTATED')
      expect(indep.baselineValue, 'mutating exercises[0].sets_json in place must not affect exercisesBaseline (sets_json must be deep-cloned, not a shared reference)').toBe('5')
      expect(indep.sameArray, 'exercises[0].sets_json and exercisesBaseline[0].sets_json must not be the same array reference').toBe(false)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})

test.describe('Template draft: rendering', () => {
  test('the exercise list and header repaint from the draft object, not a fresh fetch', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Render From Draft' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      // Mutate the draft directly (no UI action yet — that's later tasks) and force a repaint via
      // the extracted render function, proving the DOM comes from the draft, not another fetch.
      const r = await page.evaluate(() => {
        window._templateDraft.exercises[0].exercise_name = '[E2E] Squat RENAMED IN DRAFT ONLY'
        window._templateDraft.meta.name = '[E2E] Renamed Header'
        _renderTemplateExerciseList()
        return {
          headerText: document.querySelector('.page-title')?.textContent,
          listText: document.getElementById('tpl-ex-list')?.textContent || '',
        }
      })
      expect(r.headerText).toBe('[E2E] Renamed Header')
      expect(r.listText).toContain('[E2E] Squat RENAMED IN DRAFT ONLY')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
    // The database was never touched by the mutation above — it lived only in the draft.
    const stillOriginal = await page.evaluate(async (id) => {
      const { data } = await db.from('workout_templates').select('name').eq('id', id).maybeSingle()
      return data === null // already deleted in the finally above, which only succeeds if nothing else broke
    }, setup.templateId)
    expect(stillOriginal).toBe(true)
  })
})

test.describe('Template draft: staged exercise mutators', () => {
  const mountSetEditor = () => `
    const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
    mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
    mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
    // A bare <select> with no <option>s silently refuses any value assignment other than "" —
    // give it the same options the real Type field renders (js/app-workouts.js ~2280-2288) so
    // tests can select a non-default metric type and have it actually stick.
    const attTypeEl = document.getElementById('att-type')
    if (!attTypeEl.options.length) {
      ['weight_reps', 'unilateral', 'timed_hold', 'jump_height', 'jump_distance', 'interval'].forEach(v => {
        const o = document.createElement('option'); o.value = v; attTypeEl.appendChild(o)
      })
    }
  `

  test('_stageAddExercise appends to the draft and writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Add' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        ${mountSetEditor()}
        window._exerciseDetailPicked = { name: '[E2E] New Exercise', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe', repsMin: '8' }]
        _stageAddExercise()
        return {
          draftCount: window._templateDraft.exercises.length,
          added: window._templateDraft.exercises[0],
          dirty: _templateDraftIsDirty(),
        }
      })()`)
      expect(r.draftCount).toBe(1)
      expect(r.added.exercise_name).toBe('[E2E] New Exercise')
      expect(r.added.id, 'a newly staged exercise has no real database id yet').toBeNull()
      expect(r.dirty).toBe(true)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'nothing was written to the database').toBe(0)
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })

  test('_stageEditExercise updates the matching draft row by draftKey, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Edit' }).select('id').single()
      const { data: ex } = await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Original', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] }).select('id').single()
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        ${mountSetEditor()}
        const draftKey = window._templateDraft.exercises[0]._draftKey
        window._exerciseDetailPicked = { name: '[E2E] Renamed', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe', repsMin: '10' }]
        _stageEditExercise(draftKey)
        return {
          name: window._templateDraft.exercises[0].exercise_name,
          idUnchanged: window._templateDraft.exercises[0].id,
          dirty: _templateDraftIsDirty(),
        }
      })()`)
      expect(r.name).toBe('[E2E] Renamed')
      expect(r.idUnchanged, 'editing must not change the row\'s real database id').toBe(setup.exId)
      expect(r.dirty).toBe(true)
      const dbRow = await page.evaluate(async (exId) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('id', exId).single()
        return data.exercise_name
      }, setup.exId)
      expect(dbRow, 'the database row must be untouched').toBe('[E2E] Original')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('_stageRemoveExercise removes the row from the draft only, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Remove' }).select('id').single()
      const { data: ex } = await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] To Remove', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] }).select('id').single()
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => {
        const draftKey = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(draftKey)
        return { draftCount: window._templateDraft.exercises.length, dirty: _templateDraftIsDirty() }
      })
      expect(r.draftCount).toBe(0)
      expect(r.dirty).toBe(true)
      const dbRows = await page.evaluate(async (exId) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('id', exId)
        return data.length
      }, setup.exId)
      expect(dbRows, 'the database row must still exist').toBe(1)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  // Task 3 originally dropped the old saveExerciseToTemplate/saveEditTemplateExercise functions'
  // trailing _rememberExerciseMetricType(...) call — a fire-and-forget convenience that writes the
  // chosen metric_type back onto the library `exercises` row so the picker defaults to it next time.
  // These two tests restore proof that the staged mutators still do this, reading the real table back
  // (not a mock) after a short wait since the call is a `.then()`, never awaited by the caller.
  test('_stageAddExercise still remembers the chosen metric_type on the library exercise (fire-and-forget)', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Remember Metric Add' }).select('id').single()
      const { data: ex } = await db.from('exercises').insert({ coach_id: currentUser.id, name: '[E2E] Remember Metric Lift', metric_type: 'weight_reps' }).select('id').single()
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(`(() => {
        ${mountSetEditor()}
        window._exerciseDetailPicked = { name: '[E2E] Remember Metric Lift', id: ${JSON.stringify(setup.exId)} }
        document.getElementById('att-type').value = 'timed_hold'
        window._templateSets = [{ effortType: 'rpe', repsMin: '8' }]
        _stageAddExercise()
      })()`)
      // _rememberExerciseMetricType is a fire-and-forget .then(), not awaited by _stageAddExercise —
      // give it a moment to land before reading the library exercise back for real.
      await new Promise(r => setTimeout(r, 500))
      const libMetricType = await page.evaluate(async (exId) => {
        const { data } = await db.from('exercises').select('metric_type').eq('id', exId).single()
        return data.metric_type
      }, setup.exId)
      expect(libMetricType, 'staging an add must still update the library exercise metric_type default').toBe('timed_hold')
    } finally {
      await page.evaluate(async ({ templateId, exId }) => {
        await db.from('workout_template_exercises').delete().eq('template_id', templateId)
        await db.from('workout_templates').delete().eq('id', templateId)
        await db.from('exercises').delete().eq('id', exId)
      }, setup)
    }
  })

  test('_stageEditExercise still remembers the chosen metric_type on the library exercise (fire-and-forget)', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Remember Metric Edit' }).select('id').single()
      const { data: ex } = await db.from('exercises').insert({ coach_id: currentUser.id, name: '[E2E] Remember Metric Lift Edit', metric_type: 'weight_reps' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_id: ex.id, exercise_name: '[E2E] Remember Metric Lift Edit', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] })
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(`(() => {
        ${mountSetEditor()}
        const draftKey = window._templateDraft.exercises[0]._draftKey
        window._exerciseDetailPicked = { name: '[E2E] Remember Metric Lift Edit', id: ${JSON.stringify(setup.exId)} }
        document.getElementById('att-type').value = 'interval'
        window._templateSets = [{ effortType: 'rpe', repsMin: '10' }]
        _stageEditExercise(draftKey)
      })()`)
      await new Promise(r => setTimeout(r, 500))
      const libMetricType = await page.evaluate(async (exId) => {
        const { data } = await db.from('exercises').select('metric_type').eq('id', exId).single()
        return data.metric_type
      }, setup.exId)
      expect(libMetricType, 'staging an edit must still update the library exercise metric_type default').toBe('interval')
    } finally {
      await page.evaluate(async ({ templateId, exId }) => {
        await db.from('workout_template_exercises').delete().eq('template_id', templateId)
        await db.from('workout_templates').delete().eq('id', templateId)
        await db.from('exercises').delete().eq('id', exId)
      }, setup)
    }
  })
})

test.describe('Template draft: staged reorder', () => {
  test('_stageReorderExercise swaps the draft order and writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Reorder' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
        { template_id: t.id, exercise_name: '[E2E] C', exercise_type: 'strength', order_index: 2 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => {
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageReorderExercise(bKey, -1) // B moves up, ahead of A
        return {
          names: window._templateDraft.exercises.map(e => e.exercise_name),
          indexes: window._templateDraft.exercises.map(e => e.order_index),
          dirty: _templateDraftIsDirty(),
        }
      })
      expect(r.names).toEqual(['[E2E] B', '[E2E] A', '[E2E] C'])
      expect(r.indexes, 'order_index in the draft must reflect the new positions').toEqual([0, 1, 2])
      expect(r.dirty).toBe(true)
      const dbOrder = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name, order_index').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbOrder, 'the database order must be untouched').toEqual(['[E2E] A', '[E2E] B', '[E2E] C'])
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})

test.describe('Template draft: staged rename', () => {
  test('_stageRenameTemplate updates the draft meta only, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Rename Before' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) }; return e }
        mk('et-name').value = '[E2E] Stage Rename After'
        mk('et-desc').value = 'a new description'
        _stageRenameTemplate()
        return { meta: window._templateDraft.meta, dirty: _templateDraftIsDirty() }
      })()`)
      expect(r.meta).toEqual({ name: '[E2E] Stage Rename After', description: 'a new description' })
      expect(r.dirty).toBe(true)
      const dbRow = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_templates').select('name, description').eq('id', id).single()
        return data
      }, setup.templateId)
      expect(dbRow.name).toBe('[E2E] Stage Rename Before')
      expect(dbRow.description).toBeNull()
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })
})

test.describe('Template draft: Save workout button visibility', () => {
  test('the Save workout button appears only once the draft is dirty', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Save Button Visibility' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Only Exercise', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const before = await page.evaluate(() => !!document.getElementById('save-template-draft-btn'))
      expect(before, 'no unsaved changes yet, so no Save button').toBe(false)
      const after = await page.evaluate(() => {
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
        return !!document.getElementById('save-template-draft-btn')
      })
      expect(after, 'a staged change must show the Save button').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})

test.describe('Template draft: Save replay', () => {
  test('saveTemplateDraft resolves the editable template ID exactly once, then applies every queued change against it', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Save Replay' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(async () => {
        // Stage 2 different kinds of change: delete B, and add a new one (C). NOTE: removing the
        // only other row does not itself register as a "reorder" -- _diffTemplateDraft (Task 7,
        // unchanged here) compares the SURVIVING pre-existing rows' relative order, and with only
        // one survivor (A) left on both sides there is nothing to permute, so diff.reorder stays
        // null and no reorder entry is pushed. Verified empirically against the real diff engine
        // during Task 8's implementation -- this scenario exercises delete + insert, not reorder.
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageRemoveExercise(bKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] C', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        // Stub the propagation entry point so this test proves the WRITE half only -- Task 9 proves
        // the propagation half.
        let propagationCalledWith = null
        window._checkClientPlanPropagation = async (id, ctx, changes) => { propagationCalledWith = changes }

        let resolveCalls = 0
        const realResolve = window._resolveEditableTemplateId
        window._resolveEditableTemplateId = async (...args) => { resolveCalls++; return realResolve(...args) }

        await saveTemplateDraft()
        return { resolveCalls, propagationCalledWith, dirtyAfter: _templateDraftIsDirty() }
      })()`)
      expect(r.resolveCalls, '_resolveEditableTemplateId must run exactly once per Save, never once per queued change').toBe(1)
      expect(r.propagationCalledWith.length, 'the two staged changes (delete + insert) must produce two entries in the combined change list').toBe(2)
      expect(r.dirtyAfter, 'after a successful Save the draft is clean again').toBe(false)

      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbRows).toEqual(['[E2E] A', '[E2E] C'])
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('saveTemplateDraft refuses to save a template the current user does not own, at the app layer', async ({ page, browser }) => {
    const pt2Ctx = await browser.newContext()
    let foreignTemplateId
    try {
      const pt2Page = await pt2Ctx.newPage()
      await loginAsPT2(pt2Page)
      foreignTemplateId = await pt2Page.evaluate(async () => {
        const { data } = await db.from('workout_templates').insert({ coach_id: currentUser.id, name: '[E2E] Foreign Save Target', is_personal: false }).select('id').single()
        return data.id
      })

      await loginAsPT(page)
      const r = await page.evaluate(async (tid) => {
        // Constructed directly rather than via openTemplate(tid): RLS already refuses the SELECT
        // openTemplate needs to build a real draft for a template we don't own, so it would never
        // reach this code path in the first place. This test is specifically for the APP-LEVEL gate
        // saveTemplateDraft itself owns -- defense in depth, same reasoning the pre-existing
        // ownership-anchors suite already uses for its other (still-passing) tests.
        window._templateDraft = {
          templateId: tid,
          ctx: {},
          meta: { name: 'tampered', description: null },
          metaBaseline: { name: 'original', description: null },
          exercises: [], exercisesBaseline: [],
        }
        let toast = ''
        const origToast = window.showToast
        window.showToast = (m) => { toast = m }
        try {
          await saveTemplateDraft()
        } finally { window.showToast = origToast }
        return { toast }
      }, foreignTemplateId)
      expect(r.toast.toLowerCase(), 'must refuse with a permission message, not silently no-op').toContain('permission denied')

      // "Untouched" is checked from PT2's OWN session, not PT1's: PT1's session cannot SELECT a row it
      // does not own at all (RLS filters it out entirely, returning null) -- verified empirically while
      // implementing this task, and already documented as the reason tests/ownership-anchors-2026-08-21
      // .spec.js's own equivalent check settles for the app-level error message alone ("Asked from PT2's
      // perspective would be ideal, but PT cannot read PT2's rows; a null/empty read here is therefore
      // consistent with both 'refused' and 'invisible'"). Here we DO have PT2's own page in scope, so we
      // use it for a strictly stronger proof than that established pattern settled for.
      const nameAfter = await pt2Ctx.pages()[0].evaluate(async (tid) => {
        const { data } = await db.from('workout_templates').select('name').eq('id', tid).maybeSingle()
        return data?.name ?? null
      }, foreignTemplateId)
      expect(nameAfter, 'the foreign template must be completely untouched').toBe('[E2E] Foreign Save Target')
    } finally {
      if (foreignTemplateId) {
        await pt2Ctx.pages()[0].evaluate(async (tid) => { await db.from('workout_templates').delete().eq('id', tid) }, foreignTemplateId)
      }
      await pt2Ctx.close()
    }
  })
})
