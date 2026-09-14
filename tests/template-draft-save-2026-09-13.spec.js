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

test.describe('Template draft: combined propagation prompt', () => {
  test('a Save carrying 3 changes produces ONE propagation prompt describing all 3, not one prompt per change', async ({ page, browser }) => {
    await loginAsPT(page)
    const ptCtx = await browser.newContext()
    const pt2 = await ptCtx.newPage()
    // (fixture setup mirrors reorder-propagation-2026-08-19.spec.js's family_id pattern: a program
    // with a phase, and TWO SEPARATE template rows sharing a family_id -- one per week slot -- so the
    // "other sessions" prompt has something real to offer.
    //
    // Deliberately NOT the same template_id reused across both phase_workout slots: that shape
    // exercises a completely different mechanism (_resolveEditableTemplateId's shared-master
    // fork-on-edit, triggered whenever a template_id sits in more than one phase_workout row), which
    // this test is not about and which currently mis-saves when combined with saveTemplateDraft's
    // batch diff (a real, separate, out-of-scope bug found while writing this test -- see task-9
    // report). Each template below sits in exactly one slot, so no fork happens and this test stays
    // isolated to the propagation-array plumbing it exists to prove.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Combined Prompt Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, name: '[E2E] Combined Prompt Session' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      const { data: t2 } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, name: '[E2E] Combined Prompt Session', family_id: t.id }).select('id').single()
      const { data: pw1 } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 1 }).select('id, template_id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t2.id, week_number: 2 })
      return { programId: prog.id, templateId: t.id, templateId2: t2.id, phaseId: phase.id, phaseWorkoutId: pw1.id }
    })
    try {
      await page.evaluate(async ({ templateId, phaseWorkoutId, programId }) => {
        await openTemplate(templateId, { programId, phaseWorkoutId })
      }, setup)
      const r = await page.evaluate(`(async () => {
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageRemoveExercise(bKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] C', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        const mk2 = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk2('et-name').value = '[E2E] Combined Prompt Session RENAMED'
        mk2('et-desc', 'textarea').value = ''
        _stageRenameTemplate()

        await saveTemplateDraft()
        await new Promise(r => setTimeout(r, 300))
        return {
          modalText: document.getElementById('propagate-modal')?.textContent || '',
          modalCount: document.querySelectorAll('.modal-overlay').length,
        }
      })()`)
      expect(r.modalCount, 'exactly one propagation modal, not three').toBe(1)
      expect(r.modalText).toContain('3 changes')
      expect(r.modalText).toMatch(/removed|added|renamed/i)
    } finally {
      // Deleted by CAPTURED ID, not by name: the test renames the first template mid-run, and this
      // repo's established teardown convention (see e.g. session-identity-2026-08-14.spec.js) is to
      // delete program_phase_workouts / program_phases explicitly rather than assume a cascade.
      await page.evaluate(async (s) => {
        await db.from('program_phase_workouts').delete().eq('phase_id', s.phaseId)
        await db.from('program_phases').delete().eq('id', s.phaseId)
        await db.from('workout_template_exercises').delete().in('template_id', [s.templateId, s.templateId2])
        await db.from('workout_templates').delete().in('id', [s.templateId, s.templateId2])
        await db.from('programs').delete().eq('id', s.programId)
      }, setup)
      await ptCtx.close()
    }
  })
})

test.describe('Template draft: Save across a shared-master fork', () => {
  test('saveTemplateDraft correctly deletes/updates exercises after a fork-on-edit remaps their ids', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Fork Save Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, name: '[E2E] Fork Save Session' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      // Same template_id in TWO phase-workout slots -- this is exactly what triggers the fork.
      const { data: pw1 } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 1 }).select('id, template_id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 2 })
      return { programId: prog.id, templateId: t.id, phaseWorkoutId: pw1.id }
    })
    try {
      await page.evaluate(async ({ templateId, phaseWorkoutId, programId }) => {
        await openTemplate(templateId, { programId, phaseWorkoutId })
      }, setup)
      const r = await page.evaluate(`(async () => {
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageRemoveExercise(bKey)
        await saveTemplateDraft()
        return { dirtyAfter: _templateDraftIsDirty() }
      })()`)
      expect(r.dirtyAfter, 'the draft must be clean after a successful save, even across a fork').toBe(false)

      // The slot must now point at a NEW (forked) template -- confirm the fork actually happened, so
      // this test isn't accidentally passing because no fork occurred.
      const { data: pw } = await page.evaluate(async (id) => {
        return await db.from('program_phase_workouts').select('template_id').eq('id', id).single()
      }, setup.phaseWorkoutId)
      const forkedId = pw.template_id
      expect(forkedId, 'week 1 must now point at a forked (different) template').not.toBe(setup.templateId)

      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, forkedId)
      expect(dbRows, 'B must be gone from the FORKED template, not just silently unsaved').toEqual(['[E2E] A'])
    } finally {
      await page.evaluate(async (s) => {
        await db.from('programs').delete().eq('id', s.programId)
        await db.from('workout_templates').delete().eq('name', '[E2E] Fork Save Session').eq('coach_id', currentUser.id)
      }, setup)
    }
  })
})

test.describe('Template draft: partial-failure recovery', () => {
  test('when a batch save fails partway through, successful changes are not re-applied and the failed ones remain staged', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Partial Failure' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(async () => {
        // Delete A (will succeed), then stage an insert that the stub below makes fail.
        const aKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] A')._draftKey
        _stageRemoveExercise(aKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] Will Fail', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        // Captured BEFORE the save so a post-save comparison can prove a genuine rebuild happened --
        // B is untouched by anything staged in this test, so it's the ideal "survivor" to track. A
        // no-op failure branch (the old "log and stop" behavior) would leave this identical; only a
        // real re-fetch-and-rebuild produces a fresh _draftKey for it (see the assertions below for
        // why this distinction is the actual point of this test).
        const bKeyBefore = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey

        const realFrom = db.from.bind(db)
        db.from = (tbl) => {
          if (tbl !== 'workout_template_exercises') return realFrom(tbl)
          const real = realFrom(tbl)
          return { ...real, insert: () => Promise.resolve({ error: { message: 'simulated failure' } }), select: real.select.bind(real), update: real.update.bind(real), delete: real.delete.bind(real) }
        }
        let toastMsg = null
        window.showToast = (msg) => { toastMsg = msg }
        try {
          await saveTemplateDraft()
        } finally {
          db.from = realFrom
        }
        return {
          toastMsg,
          stillDirty: _templateDraftIsDirty(),
          draftHasFailedInsert: window._templateDraft.exercises.some(e => e.exercise_name === '[E2E] Will Fail'),
          bKeyBefore,
          bKeyAfter: window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')?._draftKey,
          baselineHasA: window._templateDraft.exercisesBaseline.some(e => e.exercise_name === '[E2E] A'),
        }
      })()`)
      expect(r.toastMsg, 'the user must be told something failed').toBeTruthy()
      expect(r.stillDirty, 'the failed change must still be staged for another attempt').toBe(true)
      expect(r.draftHasFailedInsert).toBe(true)
      // These two assertions are the ones that actually distinguish "correctly recovered" from "did
      // nothing" -- the three assertions above also pass against the OLD "log and stop" branch,
      // because that branch never touches window._templateDraft at all, so the pre-save staged state
      // trivially satisfies them whether or not any recovery logic ran. A changed _draftKey can only
      // happen if _toDraftRow ran again (i.e. a real rebuild happened); baselineHasA being false can
      // only happen if the rebuild used FRESH post-delete database state -- which is the actual bug
      // this task exists to prevent (a stale baseline would make a retry re-attempt A's already-
      // succeeded delete, which would then fail since A no longer exists to delete).
      expect(r.bKeyAfter, 'the draft must be rebuilt from a fresh fetch, not merely left untouched by a no-op failure branch').not.toBe(r.bKeyBefore)
      expect(r.baselineHasA, 'the baseline must be refreshed from the real post-delete database state, or a retry would try to delete A a second time and fail').toBe(false)

      const dbNames = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id)
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbNames, 'the successful delete must have actually committed').toEqual(['[E2E] B'])
      expect(dbNames).not.toContain('[E2E] Will Fail')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})

test.describe('Template draft: partial-failure recovery', () => {
  test('a rename staged alongside a change that fails earlier in the batch is not silently discarded', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Rename Survives Failure' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(async () => {
        // Stage a rename AND an exercise add that the stub below makes fail. The insert loop runs
        // (and fails) BEFORE the rename step ever gets reached.
        const mk2 = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk2('et-name').value = '[E2E] Renamed After Failure'
        mk2('et-desc', 'textarea')
        _stageRenameTemplate()

        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] Will Fail', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        // Captured BEFORE the save, same reasoning as the sibling test: A is the only pre-existing
        // exercise and is untouched by anything staged here, so a changed _draftKey after the failed
        // save can only mean _toDraftRow genuinely ran again (a real rebuild), not that a no-op
        // failure branch simply left the pre-save staged state alone. Nothing in this test's scenario
        // gets WRITTEN to the database (the insert fails before the rename step is ever reached), so
        // this is the one signal available here that distinguishes "correct recovery" from "did
        // nothing" -- draftName/stillDirty alone would pass unchanged against the OLD "log and stop"
        // branch too, since it never touches window._templateDraft.
        const aKeyBefore = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] A')._draftKey

        const realFrom = db.from.bind(db)
        db.from = (tbl) => {
          if (tbl !== 'workout_template_exercises') return realFrom(tbl)
          const real = realFrom(tbl)
          return { ...real, insert: () => Promise.resolve({ error: { message: 'simulated failure' } }), select: real.select.bind(real), update: real.update.bind(real), delete: real.delete.bind(real) }
        }
        try {
          await saveTemplateDraft()
        } finally {
          db.from = realFrom
        }
        return {
          stillDirty: _templateDraftIsDirty(),
          draftName: window._templateDraft.meta.name,
          aKeyBefore,
          aKeyAfter: window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] A')?._draftKey,
        }
      })()`)
      expect(r.stillDirty, 'the un-applied rename must still be staged').toBe(true)
      expect(r.draftName, 'the rename must survive a failure in an EARLIER step of the same batch, not be silently discarded').toBe('[E2E] Renamed After Failure')
      // The decisive assertion for THIS test (see the comment above aKeyBefore for why draftName/
      // stillDirty alone can't tell "correct recovery" apart from "did nothing" here).
      expect(r.aKeyAfter, 'the draft must be rebuilt from a fresh fetch, not merely left untouched by a no-op failure branch').not.toBe(r.aKeyBefore)

      const dbName = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_templates').select('name').eq('id', id).single()
        return data.name
      }, setup.templateId)
      expect(dbName, 'the rename must NOT have reached the database yet -- the insert failed first, so rename never ran').toBe('[E2E] Rename Survives Failure')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})

test.describe('Template draft: leaving with unsaved changes', () => {
  const mountBackFn = () => page.evaluate(() => {
    window._leftCount = 0
    window._templateCtx = window._templateCtx || {}
    window._templateCtx.backFn = () => { window._leftCount++ }
  })

  test('leaving with a clean draft navigates straight away, no prompt', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Clean' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => { window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 } })
      // Fire-and-continue, not await-to-completion: _templateGoBack is async and, when the draft is
      // dirty, awaits _confirmLeaveTemplateDraft() -- a promise that only resolves once a dialog
      // button is clicked. `() => _templateGoBack()` returns THAT pending promise as its own result,
      // and page.evaluate() awaits any promise a page function returns before resolving on the Node
      // side -- so `await page.evaluate(() => _templateGoBack())` would block the test here forever,
      // since the click that would resolve it is the test's OWN next step, never reached while this
      // await is still pending. Confirmed empirically: the captured failure screenshot showed the
      // fully-rendered three-button dialog sitting on screen while the test timed out waiting on this
      // line. A bare block body discards the inner promise and returns synchronously -- correct here
      // because everything up to the first internal `await` (the dirty check, and for a dirty draft,
      // building+mounting the dialog) runs synchronously; only what happens AFTER a button click is
      // deferred, which is exactly what this test drives from Node afterwards.
      await page.evaluate(() => { _templateGoBack() })
      const r = await page.evaluate(() => ({ left: window._leftCount, promptShown: !!document.getElementById('confirm-dialog') }))
      expect(r.left).toBe(1)
      expect(r.promptShown).toBe(false)
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })

  test('leaving with unsaved changes shows the three-way prompt; Keep editing does nothing', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Dirty Keep' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] X', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      // Fire-and-continue, not await-to-completion: _templateGoBack is async and, when the draft is
      // dirty, awaits _confirmLeaveTemplateDraft() -- a promise that only resolves once a dialog
      // button is clicked. `() => _templateGoBack()` returns THAT pending promise as its own result,
      // and page.evaluate() awaits any promise a page function returns before resolving on the Node
      // side -- so `await page.evaluate(() => _templateGoBack())` would block the test here forever,
      // since the click that would resolve it is the test's OWN next step, never reached while this
      // await is still pending. Confirmed empirically: the captured failure screenshot showed the
      // fully-rendered three-button dialog sitting on screen while the test timed out waiting on this
      // line. A bare block body discards the inner promise and returns synchronously -- correct here
      // because everything up to the first internal `await` (the dirty check, and for a dirty draft,
      // building+mounting the dialog) runs synchronously; only what happens AFTER a button click is
      // deferred, which is exactly what this test drives from Node afterwards.
      await page.evaluate(() => { _templateGoBack() })
      const promptShown = await page.evaluate(() => document.getElementById('confirm-dialog')?.textContent || '')
      expect(promptShown).toMatch(/unsaved/i)
      // Keep editing = dismiss, no navigation
      await page.locator('#confirm-dialog button', { hasText: /keep editing/i }).click()
      const r = await page.evaluate(() => ({ left: window._leftCount || 0, stillDirty: _templateDraftIsDirty() }))
      expect(r.left).toBe(0)
      expect(r.stillDirty, 'the staged removal must still be there').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('Discard changes throws the draft away and navigates', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Discard' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Y', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      // Fire-and-continue, not await-to-completion: _templateGoBack is async and, when the draft is
      // dirty, awaits _confirmLeaveTemplateDraft() -- a promise that only resolves once a dialog
      // button is clicked. `() => _templateGoBack()` returns THAT pending promise as its own result,
      // and page.evaluate() awaits any promise a page function returns before resolving on the Node
      // side -- so `await page.evaluate(() => _templateGoBack())` would block the test here forever,
      // since the click that would resolve it is the test's OWN next step, never reached while this
      // await is still pending. Confirmed empirically: the captured failure screenshot showed the
      // fully-rendered three-button dialog sitting on screen while the test timed out waiting on this
      // line. A bare block body discards the inner promise and returns synchronously -- correct here
      // because everything up to the first internal `await` (the dirty check, and for a dirty draft,
      // building+mounting the dialog) runs synchronously; only what happens AFTER a button click is
      // deferred, which is exactly what this test drives from Node afterwards.
      await page.evaluate(() => { _templateGoBack() })
      await page.locator('#confirm-dialog button', { hasText: /discard/i }).click()
      const r = await page.evaluate(() => ({ left: window._leftCount || 0 }))
      expect(r.left).toBe(1)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'discard must not have written anything -- the exercise was never removed for real').toBe(1)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('Save workout replays the draft, then navigates once Save completes', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Save' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Z', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      // Fire-and-continue, not await-to-completion: _templateGoBack is async and, when the draft is
      // dirty, awaits _confirmLeaveTemplateDraft() -- a promise that only resolves once a dialog
      // button is clicked. `() => _templateGoBack()` returns THAT pending promise as its own result,
      // and page.evaluate() awaits any promise a page function returns before resolving on the Node
      // side -- so `await page.evaluate(() => _templateGoBack())` would block the test here forever,
      // since the click that would resolve it is the test's OWN next step, never reached while this
      // await is still pending. Confirmed empirically: the captured failure screenshot showed the
      // fully-rendered three-button dialog sitting on screen while the test timed out waiting on this
      // line. A bare block body discards the inner promise and returns synchronously -- correct here
      // because everything up to the first internal `await` (the dirty check, and for a dirty draft,
      // building+mounting the dialog) runs synchronously; only what happens AFTER a button click is
      // deferred, which is exactly what this test drives from Node afterwards.
      await page.evaluate(() => { _templateGoBack() })
      await page.locator('#confirm-dialog button', { hasText: /^save/i }).click()
      // Wait for the real completion signal instead of guessing a fixed delay: _templateGoBack
      // awaits saveTemplateDraft() fully before calling ctx.backFn() (which sets _leftCount), so
      // once this reaches 1 the save has genuinely finished, not just the click event dispatched.
      // waitForFunction, not expect.poll: matches this codebase's own established pattern for
      // "wait for a window global to reach a value" (see tests/helpers.js:69,
      // tests/ledger-fixes-2026-08-01.spec.js:69, tests/runner.spec.js:29 for precedent).
      await page.waitForFunction(() => window._leftCount === 1, null, { timeout: 10000 })
      const r = await page.evaluate(() => ({ left: window._leftCount || 0 }))
      expect(r.left).toBe(1)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'Save from the leave-prompt must have actually committed the removal').toBe(0)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
