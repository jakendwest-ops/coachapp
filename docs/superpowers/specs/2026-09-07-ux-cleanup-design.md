# UX cleanup pass — design (2026-09-07)

Jake walked four areas at phone width off an interactive board and picked **all 18** flagged
items. `D1` (solo vs client dashboard convergence) is **deferred to its own session** — the vault
already flags it as needing dedicated room (ripples into calendar parity + redundant 1RM displays).
This doc covers the other **16**, grouped by module, one short design each.

Board tags: `polish` = visual (spacing, alignment, weak affordance); `flow` = structural (taps,
order, dead ends). `flow` items carry an open question at the end.

## Guardrails (apply to every item)

- **Tokens only.** Every line touched uses `var(--…)`; no new `font-size:Npx` / `border-radius:Npx` /
  hex literals in `js/` (the `checks.sh` style-count ratchet will block the push otherwise). Existing
  literals on a touched line get converted while there.
- **Cache-bust per module.** Each changed `js/` module and `css/main.css` bumps its own `?v=N` in
  `index.html`, same commit.
- **No behaviour change** to save paths, navigation ownership, or RLS. This is presentation only.
- **Per-area gate:** smoke tests green → `/feature-audit` + `/mobile-check` → `/multi-agent-review`
  (diff mode) before the push. One area per commit (or two). No release tag until each is eyeballed
  on the live preview.
- Order: **runner → builder → progress → dashboards.**

---

## Area 1 — Workout runner  (`js/app-runner.js`, bump `app-runner`)

### R1 — Weak set-complete control  · polish
`inDone()` at `app-runner.js:690`. Incomplete state today: a 44×44 white box, `2px solid #9ca3af`
border, `✓` rendered in `color:transparent` — i.e. invisible. It is the primary action of the screen
and its faintest element.
**Fix:** incomplete state shows a **visible faint tick** (`color: var(--text-muted)`) on a light
`var(--surface-2)` fill so it reads as a pressable target; on the **current** set's row, upgrade the
border to `var(--accent)` so "this is your next tap" is unmistakable. Done state unchanged (green +
white ✓). Tokenise the `#9ca3af` / `#fff` literals.
**Risk:** very low, visual only. Smoke: runner spec already toggles sets — add an assert that the
control's computed colour is not transparent.

### R2 — Advancing isn't a button  · flow
`app-runner.js:911-914`. Table exercise, 0 sets logged → the footer is centred hint text
"Check off a set to continue". After the first set it becomes a real 52px full-width button
(`Next exercise →` / `Finish 🏁`).
**Fix:** the footer slot is **always a full-width 52px control**. Pre-first-set, render it as a muted
block — `Log a set to continue` + a small up-arrow to the table — that **is tappable**: tapping it
scrolls to and focuses the first empty weight (or reps, for bodyweight) input. Post-first-set:
unchanged (`Next exercise →` / `Finish 🏁`).
**Also fixes R4** — see below.
**Decision (2026-09-07):** tappable → focuses the first empty input.

### R3 — Inputs read as disabled  · polish
`inCell()` default `ph:'—'` (`app-runner.js:686`); the weight_reps branch falls back to `'—'` for
both fields when there's no last-session ghost and no %1RM target (`:764-765`).
**Fix:** fallback placeholder → the unit for weight (`window._unitPrefs.weight`, e.g. "kg") and
`"reps"` for reps — exactly what the unilateral / jump branches already do. Ghost-value behaviour
(showing last session's numbers) is untouched.
**Risk:** low. The "no pre-fill" lesson (2026-07-11) is about `value`, not `placeholder`; placeholder
hints are already used across this table.

### R4 — Dead space below notes  · polish
Structural: the runner's scroll region is `flex:1`, so short content + a bottom-anchored footer
leaves a gap — and when the footer is just tiny hint text (R2's pre-first-set state) that gap reads
as a void.
**Fix:** resolved by **R2** — a full-height footer control anchors the bottom and the gap becomes
ordinary "space above a button". Ship R2, re-look, and only add more (e.g. cap the notes block) if it
still reads empty. Expect no separate change.

### R5 — Swap / add exercise links  · polish
`app-runner.js:844-847`: two bare-text `<button>`s, 11px, `var(--text-muted)`, crowded directly
under the exercise title.
**Fix:** render as two **compact outline buttons** (icon + label, ~32px tall, `1px solid
var(--border)`, `var(--surface)` fill) side by side — bigger tap targets, clearly interactive, still
visually secondary. No handler change.
**Risk:** low. Verify the header doesn't grow too tall at 390px (short labels, should sit on one row).

---

## Area 2 — Programs builder  (`js/app-programs.js`, `css/main.css`; bump `app-programs` + `css`)

### B1 — Action buttons eat the first screen  · flow
`app-programs.js:1138-1146`: a `flex-wrap` row of up to 5 buttons — Edit, Assign to client
(`_assignBtnHtml`), Copy workouts to Library, Copy to coaching / Move to Personal, Delete — wrapping
to ~5 rows on mobile before "Phases".
**Fix:** keep the one primary (`Assign to client` / `Add to my plan`) as a leading button; move
**Edit, Copy workouts to Library, Copy to coaching / Move to Personal, Delete** into a single
**"⋯ Manage" menu** (small popover, body-level per the modal rule). One clear action + one overflow,
instead of a ragged 5-button block.
**Decision (2026-09-07):** "⋯ Manage" menu.
**Risk:** medium — `deleteProgram` / `moveProgramToPersonal` / `copyProgramToCoaching` etc. handlers
must keep working; this is a pure markup reshuffle that doesn't touch them. Smoke: programs spec opens
a program — assert the primary action is still reachable.

### B2 — Desktop day grid wraps 5 + 2  · polish
`css/main.css:832-834`: `@media (min-width:768px){ .pwk-days{ grid-template-columns:
repeat(auto-fit, minmax(160px,1fr)) } }` → ~5 columns on a ~1000px canvas, so the 7 days break to a
second row orphaning Sat/Sun. (Already noted in STATUS.)
**Fix:** at `min-width:900px`, `grid-template-columns: repeat(7, minmax(0,1fr))` — the whole week on
one row, matching the mental model. Keep `auto-fit` for the 768–900px tablet band.
**Risk:** low, CSS-only. Check 900–1100px isn't cramped (7 × ~130px is fine).

### B3 — Day slots are tall / nested borders  · polish
`.pwk-day` (border + radius + 8px pad, `main.css:835`) contains `.pwk-slot` (border + radius, `:837`)
and `.pwk-add` (border, `:855`) — an **empty** day is a bordered card wrapping a bordered button, so
a 7-day week is a long mobile scroll.
**Fix:** an **empty** day drops the `.pwk-day` border/background — just the `DOW` label + a slim
dashed `+ add` row (~32px). A day **with** workouts keeps the card. Roughly halves the empty-week
scroll on mobile. Needs a `.pwk-day.is-empty` class from the render (`app-programs.js:2266`).
**Decision (2026-09-07):** de-emphasise empty days.
**Risk:** low-medium. Mobile-check after.

### B4 — Unlabeled gear icon  · polish
`_quickPrefsIconHtml()` (`app-core.js:396`) — a 36×36 `⚙` button, `title="Preferences"`, opens the
units / cardio-capture popover. Shared by the runner **and** builder headers.
**Fix:** widen to a labelled pill — `⚙ Units` — on both surfaces, so it stops reading as "program
settings".
**Decision (2026-09-07):** label `⚙ Units` everywhere. If the runner header gets tight at 390px,
absorb that with a layout tweak in the same commit (e.g. drop the icon, keep "Units").
**Risk:** low.

### B5 — Periodization bar placement  · flow
`app-programs.js:1169-1183`: a full-width slab — `Periodization: <type> | Configure | Generate weeks`
— wedged between the phase header row and the day grid, shown only when `duration_weeks > 1`.
**Fix (recommended):** collapse the **status** into the phase header line as a chip next to the
duration (`4 weeks · Linear 70→80%`); move `Configure` behind the phase's existing `Edit` (or a small
gear on that row). Keep `Generate weeks` as a single button under the header — it's an action, not
status — not a slab.
**Decision (2026-09-07):** `Generate weeks` stays top-level (a button under the phase header).
**Risk:** medium — touches the phase render; `showPeriodizationModal` / `generatePhasePeriodization`
handlers unchanged. week-tabs spec + a manual check.

---

## Area 3 — Progress / personal bests  (`js/app-progress.js`, `css/main.css`; bump `app-progress` + `css`)

### P1 — Four rows of pills before content (Performance)  · flow
Stacked on the Performance tab: main Progress tabs (`app-progress.js:1382`), Performance sub-tabs
(`:1432`), the trend-range row `1M–All` (`:2244`), then per-card metric chips.
**Fix:** merge the range row **into** the sub-tab row — one toolbar line: `[Per exercise | Per
session | Per program]` on the left, range as a compact `<select>` (or small popover) on the right.
Performance drops from 3 stacked pill rows to 1 toolbar + the search box. Per-card metric chips stay
(they're per-exercise, not global chrome).
**Decision (2026-09-07):** range → a compact native `<select>` on the sub-tab toolbar row.
**Risk:** medium — `_setTrendRange` unchanged, just re-homed. progress-trend spec + manual.

### P2 — Tab pills wrap raggedly  · polish
Main Progress tabs (`:1382`) `flex-wrap:wrap` → 2 + 2 at 390px; the metric chips wrap 4 + 1.
**Fix:** one shared pill-row treatment — `display:flex; flex-wrap:nowrap; overflow-x:auto` (scrollbar
hidden, scroll-snap), active pill scrolled into view — horizontal scroll instead of wrapping. Add a
`.chip-row` / `.chip` pair to `main.css` and switch the three inline pill groups (Progress tabs,
Performance sub-tabs, range row) to it. Bonus: removes a chunk of inline style (helps the ratchet).
**Decision (2026-09-07):** horizontal-scroll `.chip-row` for all progress pill rows.
**Risk:** low-medium. Mobile-check at 390 **and** 320.

### P3 — Body weight leads with an editor  · flow
`renderProgressWeight` (`:1662`) renders `addWeightBtn` + `goalsCard` (a big "Weight goals" editor:
starting + goal inputs + Save) **above** the stat tiles, chart, and history.
**Fix:** when starting **and** goal are both already set, replace the card with a one-line summary —
`Start 90 kg → Goal 82 kg · Edit` — that expands to the editor on tap. Show the full card only when a
value is missing (then it's a genuine setup prompt). Data leads.
**Risk:** low — `saveWeightGoals` unchanged. Manual check both states.

### P4 — 1RM rows cramped on mobile  · polish
`renderClient1RMs` (`:229-262`): each lift is a value row **plus** a `Dated <date> | Estimate from a
set` row (plus a hidden estimate row, plus history). The date + estimate row crowds and wraps at
390px.
**Fix:** collapse the `Dated / Estimate` row by default; reveal it under a lift only when that lift's
value input is focused or changed. Default row = `[name / recorded date]  [value]  [unit]`. Keeps the
bulk "Save all" model; roughly halves row height.
**Decision (2026-09-07):** reveal on focus of the value input.
**Risk:** medium — per-row show/hide is JS; `saveOneRMGrid` reads the same ids, unchanged.
estimate1rm spec + manual.

---

## Area 4 — Dashboards  (`js/app-dashboard.js`, `js/app-core.js`, `css/main.css`)

### D2 — Solo bottom nav is crammed (7 items)  · polish
`_NAV_ITEMS.solo` (`app-core.js:914-922`): Dashboard, Workouts, Library, Programs, Calendar,
Progress, Settings — 7 in the mobile bottom bar (coach has 6, client 5).
**Fix (a subset D1 can build on):** trim the **bottom bar** to 5 — Dashboard, Workouts, Programs,
Progress, and a **"More"** sheet holding Library, Calendar, Settings. The desktop sidebar keeps all 7.
**Decision (2026-09-07):** bottom bar = Dashboard / Workouts / Programs / Progress + More
(Library, Calendar, Settings).
**Risk:** medium — nav is delegation-based (`renderNav` + the handler at `app-core.js:1282`); a "More"
item needs a small sheet. solo-account spec + mobile-check. Overlaps D1 (deferred) — keep this a
subset, not a throwaway.

### D3 — Empty sessions clutter "recent"  · polish
Client dashboard (`app-dashboard.js:300` fetch `limit(5)`, `:487` render) shows every `workout_log`,
including ones with 0 `workout_log_exercises` (`probe · 0 exercises` in the walkthrough).
**Fix:** fetch `limit(15)`, filter to sessions with ≥1 exercise, take the first 5. Apply the same
filter to the client Workouts-page list (`app-workouts.js:816`).
**Separately (not this pass):** check whether the runner/save path can create a 0-exercise
`workout_log` for a real user or if these are only test probes — if real, fix at the source. File as
its own ledger row.
**Risk:** low — display filter only, no data touched.

### D4 — PT stat tiles wrap 2 + 1  · polish
`css/main.css:793`: `@media (max-width:640px){ .pt-stats{ grid-template-columns: repeat(2,1fr) } }`
→ 3 tiles wrap 2 + 1, third alone.
**Fix:** `repeat(3,1fr)` on mobile too — the tiles are a number + a short label, 3 × ~120px fits at
390px. Keep 2-col only below ~400px if the labels look bad there.
**Risk:** trivial, CSS-only.

---

## Decisions — resolved with Jake 2026-09-07

| # | Decision |
|---|---|
| R2 | Pre-first-set footer block is **tappable** → scrolls to + focuses the first empty input. |
| B1 | **"⋯ Manage" menu** for the 4 secondary actions; primary stays visible. |
| B3 | **De-emphasise empty days** — no card border/bg, slim dashed add row. |
| B4 | Label **`⚙ Units`** on both runner and builder; absorb any runner-header tightness in the same commit. |
| B5 | **`Generate weeks` stays top-level** (button under the phase header). |
| P1 | Trend range → compact native **`<select>`** on the sub-tab toolbar row. |
| P2 | **Horizontal-scroll `.chip-row`** for all progress pill rows. |
| P4 | 1RM date/estimate controls **reveal on focus** of the value input. |
| D2 | Solo bottom bar = **Dashboard / Workouts / Programs / Progress + More** (Library, Calendar, Settings). |

No open questions remain. Ready to build.

## Sequencing / progress

| Commit | Scope | Cache-bust | Status |
|---|---|---|---|
| 1 | Runner — R1–R5 | `app-runner` | ✅ `1598622` + `885fb0f`. Pushed (`7de8546`), CI green. Not tagged/live. |
| 2 | Builder — B1–B5 | `app-programs`, `app-core` (B4), `css` | ✅ `6190ab1` + `8bcbb92`. Pushed, CI green. Not tagged/live. |
| 3 | Progress — P1–P4 | `app-progress`, `css` | ✅ `253398e`. checks.sh green, 3-agent review clean. Not pushed. |
| 4 | Dashboards — D2–D4 | `app-dashboard`, `app-core` (D2), `css` | ⬜ next |

Each commit: smoke green → `/feature-audit` + `/mobile-check` → `/multi-agent-review` (diff) → push.
`/playwright` full suite before the release tag that ships the set.

**Commit 2 review note (2026-09-07):** the 3-agent diff review found the B1–B5 change clean; the
one item — a `:has()` selector for hiding the mobile view-switcher under a modal — was scoped too
narrowly (`.app-shell:has` can't see `mountModal`'s body-level overlays). Fixed in `8bcbb92`:
`body:has(.modal-overlay:not([style*="display:none"])...)`, verified across static + dynamic modals.
