# Library page — "Last used" ordering and search

**Date:** 2026-09-04
**Scope:** the **Library** page, **Personal (solo) view only**. Coach view is a later, separate piece.
**Status:** design approved in conversation; migration already run on production.

---

## The problem, measured

`renderWorkoutTemplates` (`js/app-workouts.js`) ends with a single flat list:

```js
el.innerHTML = `<div class="list">${templates.map(templateRow).join('')}</div>`
```

fetched with `.order('name').limit(100)`. Jake's own console reported **77 templates** on his account
(recorded on the 2026-08-07 ledger row — his reading, not re-counted here). So the page is 77 rows in
one alphabetical run.

Jake's description: *"one long string of sessions"*.

**What he uses the page for, in his words:** *find one to edit*. The page is a means to an end, not a
place he browses.

**How he identifies the one he wants:** *"I scroll till I recognise it."* Not by name — which is the
finding that shaped everything else, because **search alone would not have fixed this**. A row does not
carry enough to recognise a session.

**Why a row tells him so little.** Every row renders the same 💪 icon; the subtitle is the description
if one exists, otherwise `"5 exercises"`; the right-hand side then says `"5 ex"` again. For a session
with no description the row says the same thing twice and nothing else.

---

## Decisions

### 1. Order by "last used", not alphabetically

One concept, one label, one sort key: **the most recent of edited-or-trained**.

Jake's own simplification, and it is better than the two-label version it replaced
(`Trained 2d ago · edited 3w ago`) for a specific reason: trained-dates start EMPTY (see §3), so the
two-label version would have shown **"Never trained"** across the entire library on day one — a
visible hole, on a page whose whole problem is that it tells you nothing. With one label, edited-dates
carry it from the start and training quietly improves it. The gap is never seen.

It also removes a distinction the user does not care about. "When did I last touch this" is the
question; whether the touch was an edit or a session is not.

### 2. Search

A filter box above the list, matching on name, filtering as you type.

Client-side: all rows are already loaded, so it costs no round-trip and no extra query. Name-only to
start — matching exercise names would require fetching them, which the query does not do today.

Jake asked for this on both Personal and Coach. It arrives with Personal; Coach inherits it when that
page is built.

### 3. The row

```
  Bench Day
  Last used 2 days ago                5 ex ›
```

The subtitle becomes the "last used" line. The duplicated exercise count goes — the right-hand `5 ex`
stays, the subtitle's `5 exercises` is replaced. Icon, name, chevron and tap target unchanged.

**Descriptions:** currently the subtitle shows the description when one is set. That is displaced by
this change. Accepted deliberately — Jake identifies sessions by recency, not by description, and a
row cannot carry both without becoming three lines.

---

## What has to change beneath it

### Migration — DONE, run on production 2026-09-04

`scripts/add-template-updated-at-2026-09-04.sql`. Adds `workout_templates.updated_at`, backfills it
from `created_at`, and maintains it with two triggers.

**The trigger on the CHILD table is the load-bearing part.** Editing a session almost never touches
the `workout_templates` row — adding an exercise, reordering, changing sets all write to
`workout_template_exercises`. Counted: **13 write paths** across three modules. An app-maintained
`updated_at`, or a trigger on the parent alone, would report "edited 6 months ago" on a session
changed this morning.

`security definer` on the child trigger is deliberate and narrow (one column, one row, by primary
key). Without it the bump runs as the calling user and is subject to RLS; if any path can write a child
row but not update its parent, the refusal fails the statement and **editing breaks**. That failure
mode is worse than the feature is valuable.

**Verified after running:** 273 rows, `nulls_must_be_zero = 0`, spread 2026-07-04 → 2026-09-04. (273 is
every template in the table; the Library list filters to standalone, non-personal-mismatched rows, so
it displays far fewer.)

### `saveRunnerSession` must record `template_id` — NOT yet done

`js/app-runner.js:2437` inserts `coach_id, client_id, name, date, notes`. **No `template_id`.** Only
`saveWorkoutSession` (`:3045`), the manual "log a past session" form, records it.

So today a session trained through the actual runner leaves no link back to the template it came from.
Without this fix, "trained" never contributes to "last used" for the main flow.

**Historical data cannot be recovered** — past runner sessions have no template link and no way to
derive one. "Trained" therefore starts empty and fills forward. This is precisely why the single
"last used" label matters: the empty half is invisible.

---

## Explicitly out of scope

- **The Coach Workouts/Library page.** Built later, as its own piece. See "On not forking yet" below.
- **The Exercise Library tab.** Different list, different job, not the complaint.
- **Searching by exercise name.** Would need the query to fetch names it currently does not.
- **Deleting dead sessions.** "Last used 8 months ago" makes them visible; acting on them is separate.

## On not forking yet

Coach and Personal share `renderWorkoutLibrary` / `renderWorkoutTemplates` today and differ by **one
line** — the title. Jake's instinct was to copy the page and change it. The agreed approach is to build
once in the shared function and split only when Coach genuinely diverges, extracting the common parts
(row, search) at that point.

Reason: forking before divergence creates two near-identical copies, which is how this codebase grew
its duplicate-cluster problem. Cost of waiting: none — Personal gets the feature either way.

---

## Testing

- **Sort:** a template edited today ranks above one edited last month. Red-before by seeding two
  templates with known `updated_at` values.
- **The child trigger is the thing most likely to be silently wrong**, so it gets a direct test: insert
  an exercise into a template, assert the parent's `updated_at` moved. Then delete one and assert the
  same. Without this, the whole feature can look right while never updating.
- **Search:** typing filters the list and clearing restores it; a term matching nothing shows an empty
  state rather than a blank page.
- **Row content:** the "last used" line renders, and the duplicated exercise count is gone.
- **`saveRunnerSession`:** a session saved through the runner carries `template_id`; red-before by
  asserting it is null on the current code.
- **No regression in load time.** The page already carries an open "feels slow" complaint. "Last used"
  must not add a query per template — one grouped query at most, alongside the existing one.

---

## Noted, not in scope

The **Personal → Workouts** page (a different page from Library) shows *"Your coach hasn't added any
workout templates yet"* on a solo account, where there is no coach. Client-role copy leaking into solo.
Found while screenshotting for this design; filed separately rather than folded in.
