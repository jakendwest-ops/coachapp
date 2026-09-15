// The propagation prompt was telling the truth about what it WOULD do, and nothing about what it
// would not.
//
// Measured against Jake's real data 2026-09-06: 18 of his session names have copies split across
// separate family_ids, because family_id landed on 2026-08-14 and his library predates it. Worst
// case: 13 sessions called "Upper Body STR" across SIX families. Propagation matches by family, so
// answering "yes, update the copies" updated a fraction of them — and the prompt said nothing about
// the rest. Where NO copy shared the family, there was no prompt at all: silence that reads as "there
// was nothing to do".
//
// Blanket-merging those families was rejected: the code's own dedupe comment records that Jake has
// genuinely different 6- and 9-exercise sessions both called "Upper Body STR", and merging them would
// make editing one silently rewrite the other. Worse than doing too little.
//
// So the prompt now states both halves — what will change, and what shares the name but will not.
//
// Task 9 (2026-09-13): _propagateModalHtml's signature changed from taking a single change's
// isRename/op flags to taking the whole `changes` array (saveTemplateDraft now batches every staged
// edit into one Save, so the propagation prompt has to describe all of them at once, not just the
// last one). Every call site below was updated to the array shape. `changes: [oneChange]` is a
// DELIBERATE design choice in _propagateModalHtml: a single-element array must render byte-identical
// wording to the old singular case, so the tests below prove that equivalence explicitly for all
// three single-change shapes (plain exercise change, rename, reorder) before proving the new
// multi-change summary.

const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Propagation prompt tells the whole truth (2026-09-06)', () => {
  test('counts same-named sessions that are NOT linked, and excludes the ones that are', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // One scope, six rows: the session being edited, two linked copies (same family), three that
      // share only the NAME, and one unrelated session that should never be counted.
      const rows = [
        { template_id: 'me',   workout_templates: { id: 'me',   name: 'Upper Body STR', family_id: 'famA' } },
        { template_id: 'kin1', workout_templates: { id: 'kin1', name: 'Upper Body STR', family_id: 'famA' } },
        { template_id: 'kin2', workout_templates: { id: 'kin2', name: 'Upper Body STR — W2', family_id: 'famA' } },
        { template_id: 'oth1', workout_templates: { id: 'oth1', name: 'Upper Body STR', family_id: 'famB' } },
        { template_id: 'oth2', workout_templates: { id: 'oth2', name: 'Upper Body STR', family_id: 'famC' } },
        { template_id: 'oth3', workout_templates: { id: 'oth3', name: 'Upper Body STR', family_id: 'famD' } },
        { template_id: 'else', workout_templates: { id: 'else', name: 'Lower Body STR', family_id: 'famE' } }
      ]
      const idOf = r2 => r2.template_id
      return {
        unlinked: _unlinkedSameNameCount(rows, idOf, 'me', 'Upper Body STR', ['kin1', 'kin2']),
        // A renamed week clone is LINKED, so it must not be counted as unlinked even though its name
        // differs — that is the whole reason matching is by family and not by name.
        weekCloneNotCounted: _unlinkedSameNameCount(rows, idOf, 'me', 'Upper Body STR', ['kin1', 'kin2']) === 3,
        noneWhenAllLinked: _unlinkedSameNameCount(
          rows.filter(x => ['me', 'kin1'].includes(x.template_id)), idOf, 'me', 'Upper Body STR', ['kin1'])
      }
    })
    expect(r.unlinked, 'three sessions share the name but sit in other families').toBe(3)
    expect(r.weekCloneNotCounted, 'a linked week clone is not "unlinked" just because it was renamed').toBe(true)
    expect(r.noneWhenAllLinked, 'nothing to warn about when every same-named session is linked').toBe(0)
  })

  test('the prompt says what will NOT change, not only what will', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const overlay = _propagateModalHtml({
        templateId: 't1', name: 'Upper Body STR', count: 3, label: 'this program',
        unlinked: 10, changes: [{ op: 'update', matchName: 'Bench Press' }]
      })
      return overlay
    })
    expect(html, 'still says what it will do').toMatch(/<strong>3<\/strong>/)
    expect(html, 'and now says what it will not').toContain('10')
    expect(html, 'in words a person can act on').toMatch(/not linked|will not change/i)
    expect(html, 'the session name is escaped, as it is user-supplied').not.toContain('<script')
  })

  test('a name with HTML in it is escaped in BOTH halves of the message', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => _propagateModalHtml({
      templateId: 't1', name: '<img src=x onerror=alert(1)>', count: 2, label: 'this program',
      unlinked: 4, changes: [{ op: 'update', matchName: 'Bench Press' }]
    }))
    expect(html, 'the payload must render as text, never as markup').not.toContain('<img src=x')
    expect(html, 'escaped instead').toContain('&lt;img')
  })

  test.describe('a single-change array renders byte-identical wording to the old singular case (Task 9)', () => {
    test('a single non-rename/reorder change: the generic "Only the exercise you changed" sentence', async ({ page }) => {
      await loginAsPT(page)
      const html = await page.evaluate(() => _propagateModalHtml({
        templateId: 't1', name: 'Upper Body STR', count: 2, label: 'this program', unlinked: 0,
        changes: [{ op: 'update', matchName: 'Bench Press' }]
      }))
      expect(html, 'a single update/add/delete change keeps the pre-Task-9 wording').toContain('Only the exercise you changed will be applied.')
      expect(html, 'a single non-rename/reorder change keeps the generic action label').toContain('Update all 3 copies')
    })

    test('a single rename change: the rename sentence and "Rename all N"', async ({ page }) => {
      await loginAsPT(page)
      const html = await page.evaluate(() => _propagateModalHtml({
        templateId: 't1', name: 'Upper Body STR', count: 2, label: 'this program', unlinked: 0,
        changes: [{ op: 'rename', name: 'Upper Body STR', description: null }]
      }))
      // _propagateModalHtml now runs the whole summary sentence through escapeHtml (Task 9 — summary
      // can carry user exercise names in the multi-change case, and this file has already shipped one
      // XSS from an un-escaped interpolation), so the literal quote marks around the week-marker
      // example come back as &quot; in the raw HTML string this function returns. A browser renders
      // that back to a literal '"' — this is a raw-string comparison, same convention the "escaped
      // instead" assertion two tests up already uses.
      expect(html, 'a single rename change keeps the pre-Task-9 rename sentence').toContain('Only the name and description will be applied — a week marker like &quot;— W2&quot; is kept.')
      expect(html, 'a single rename change keeps the Rename-specific action label').toContain('Rename all 3')
    })

    test('a single reorder change: the ORDER sentence and "Reorder all N"', async ({ page }) => {
      await loginAsPT(page)
      const html = await page.evaluate(() => _propagateModalHtml({
        templateId: 't1', name: 'Upper Body STR', count: 2, label: 'this program', unlinked: 0,
        changes: [{ op: 'reorder', names: ['A', 'B'] }]
      }))
      expect(html, 'a single reorder change keeps the pre-Task-9 ORDER sentence').toContain('Only the ORDER changes. Exercises a copy has that this one does not stay exactly where they are.')
      expect(html, 'a single reorder change keeps the Reorder-specific action label').toContain('Reorder all 3')
    })
  })

  test('a multi-change save produces one pluralized summary naming every op, not the singular wording (Task 9)', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => _propagateModalHtml({
      templateId: 't1', name: 'Upper Body STR', count: 2, label: 'this program', unlinked: 0,
      changes: [
        { op: 'delete', matchName: 'Old Row' },
        { op: 'add', matchName: 'New Curl' },
        { op: 'rename', name: 'Upper Body STR v2', description: null },
      ]
    }))
    expect(html, 'must say how many changes, not fall back to any singular wording').toContain('3 changes')
    expect(html, 'must NOT show the single-change sentence when more than one change is staged').not.toContain('Only the exercise you changed will be applied.')
    expect(html, 'names the delete').toMatch(/Old Row removed/)
    expect(html, 'names the add').toMatch(/New Curl added/)
    expect(html, 'names the rename').toMatch(/renamed/)
    // The action button is always the generic "Update all N copies" once more than one change is
    // staged — even though one of the staged changes IS a rename — a deliberate Task 9 choice, since
    // "Rename all" would be a lie about the other two ops riding along in the same Save.
    expect(html, 'a multi-change save always gets the generic action label, even with a rename among the changes').toContain('Update all 3 copies')
  })
})
