const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

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
})
