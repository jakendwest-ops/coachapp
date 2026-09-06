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
        unlinked: 10, isRename: false, op: 'update'
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
      unlinked: 4, isRename: false, op: 'update'
    }))
    expect(html, 'the payload must render as text, never as markup').not.toContain('<img src=x')
    expect(html, 'escaped instead').toContain('&lt;img')
  })
})
