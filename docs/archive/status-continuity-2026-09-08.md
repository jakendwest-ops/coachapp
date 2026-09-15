# STATUS.md "Continuity block" — archived 2026-09-15

Migrated verbatim from the Vault's `STATUS.md` (as of its 2026-09-08 save) as part of retiring the
Vault as CoachApp's system of record. This is ~40 dated, code-specific engineering lessons — hard
technical gotchas, not process decisions. The most durable, process-level entries were pulled into
`docs/decisions.md`; this file preserves everything, including the highly code-specific ones that
will drift as the code changes and aren't worth hand-maintaining going forward.

**Not independently re-verified against current code** — several entries were already flagged as
stale by the 2026-08-12 architecture audit (`docs/archive/architecture-audit-2026-08-12.md`) even
before this migration; treat line numbers and "current" claims below as dated to their entry's own
timestamp, not to 2026-09-15.

---

### A guard that cannot BLOCK is decorative — the test is "does it await?" (2026-08-28)
`guardReentry` was registered on `showAddExerciseToTemplateModal`. After the picker-latency change
that function contains ZERO awaits — it starts a promise and hands it to `_openExercisePicker`,
which mounts synchronously. The wrapper acquired and released inside one microtask and blocked
nothing.

**A re-entry guard only does work across an await.** Before wrapping anything, check the function
actually suspends; if it does not, the real guard is whatever synchronous check runs first. Found by
the pre-push review, not by me. `generatePhasePeriodization` is unwrapped for the mirror-image
reason: its `confirm()` blocks the thread, so the dialog is already the barrier.

### The DISPLAY value is a lossy proxy for the stored one (2026-08-26)
Full lesson: **memory `feedback_display_value_is_not_the_stored_value`** — the canonical home, because
it carries an `enforced_by` pointer and is recalled contextually.

Collapsed to this pointer on 2026-08-28. The same lesson had been written into BOTH places in the same
session, which is `feedback_two_fields_one_fact` applied to this OS itself — and the continuity copy is
the weaker of the two. **This is the shape every continuity entry should take once it has a memory
file:** the lesson lives in one place, and this block points at it.

### A NAME is not an identity — but it is also not always redundant (2026-08-26)
Two halves, and they pull in opposite directions:

- **`exercise_id` must always be written.** A `client_1rms` row without it survives only on the name
  and breaks the moment the lift is renamed. Three of four writers omitted it; all three ALREADY HELD
  the id and discarded it building an intermediate list. Fixed 52923dd, with a class guard.
- **`exercise_name` must STAY.** Exercises can be deleted (`app-workouts.js:1083`), so the name is a
  historical snapshot, not a redundant copy — dropping it would orphan every max recorded against a
  since-deleted lift. **This is why it is not a BCNF violation:** the defect is the MISSING id, never
  the present name. Normalising the name away would destroy data.

The general form: store the FK for identity and the label for history. Ask whether the parent can be
deleted — if it can, the label is a snapshot and belongs in the row.

### A ceiling set ABOVE current is a permit, not a ratchet (2026-08-25)
The three baselines in this OS that HELD — `scripts/style-baseline.json`, `state/rule0-baseline.txt`,
`state/predictions-baseline.txt` — are all pinned at what was MEASURED. The two that did not hold were
round numbers picked by hand with slack above the current state: `RITUAL_BUDGET` was set to 44,000
while the rituals measured 38,856, and the rituals then grew +9 lines THROUGH the rebuild that was
supposed to trim them. `CONTEXT_BUDGET` was 300,000 against 273,681, and 38,171 chars of what it was
policing were a stale history block STATUS.md's own masthead claimed to have deleted.

Both now derive from `state/size-baseline.json` via `measuredCeiling()` in `os-lint.mjs`, which
**ratchets DOWN and never up**: a trim is locked in the moment it lands, growth past 2% is refused.
Auto-tightening can only ever make a check STRICTER, so it cannot manufacture the false refusal that
gets a rule switched off (les-071). The env budget overrides still win when set — that is what keeps
the existing `--self-test` fixtures meaningful.

**The general form: before adding a threshold, measure the thing, then set the threshold AT it.**
A threshold with headroom does not prevent drift, it authorises exactly that much of it.

### A document that asserts its own cleanup will lie about it (2026-08-25)
STATUS.md's masthead said the `Previous: … Previous: …` chain "was deleted 2026-08-23 after verifying
each session had a `## <date>` entry". It had not been: 38,171 chars survived on ONE line, plus a second
stale chain above it. The same file separately carried **three** conflicting claims about the last push
(`d361f87` correct, `d337418` 11 days stale, `1a5cb72` 16 days stale).

`masthead-drift` did not catch any of it — it compares `_Last updated:` against body dates and nothing
else. **A cleanup is only done when the bytes are gone; a sentence saying it was done is not evidence.**
Verify a deletion by measuring the file, never by reading its own account of itself.

### Measure a gate BEFORE giving it teeth — and `_isOwnerAccount` is not `_masterAccount` (2026-08-25)
Two invariants from flipping `checks.sh` rule 2 to blocking.

**1. Never flip a warn to a fail without first counting what it flags on a clean tree.** Rule 2's
`clients` sub-check was VACUOUS — it required that no `clients` query anywhere carried `coach_id`
within 5 lines, and 40 do, so it could never fire. The other two were single-LINE greps against a
codebase that writes the anchor on the NEXT line; they flagged 4 correct queries. Flipping them as
written would have refused every push. The rule is now `scripts/check-query-scope.mjs`, and
`checks.sh` runs its self-test FIRST and fails on that — a checker nothing verifies is the decorative
shape being replaced. **`.or('coach_id.eq.<uid>,user_id.eq.<uid>')` is a first-class anchor there, not
a fallback**; a rule accepting only `.eq('coach_id')` would manufacture the solo bug it exists to stop.

**2. `_isOwnerAccount()` and `window._masterAccount` are DIFFERENT predicates.** The first means "is
the owner"; the second means only "holds both a coached and a solo `clients` row". They look
interchangeable. Collapsing them would hand impersonation (`sudoAsClient`) to any dual-row user.
`_isOwnerAccount` is a UI-affordance gate only — RLS is the boundary, same category as `is_personal`.

### The consent gate's read MUST stay a separate, fail-open query (2026-08-24)
`_loadConsentState()` in `js/app-core.js` fetches `consented_at` / `consent_policy_version` on its own
and returns `null` on ANY error; `_needsConsent(null)` is `false`. This looks like an obvious tidy-up
— "why not just add those two columns to `loadUserInfo`'s select?" **Do not.** That select uses
`.single()`; if the columns are ever absent (a fresh environment, a rolled-back migration) it ERRORS,
which nulls `currentProfile`, which trips `showApp`'s fail-closed branch, which locks **every user out
of the whole app, including the owner**. A gate whose failure mode is total lockout is worse than the
gap it closes. `tests/consent-gate-2026-08-24.spec.js` pins the fail-open property directly; if you
find yourself deleting that test to make a refactor pass, the refactor is the bug.

Corollary: the gate is enforced inside `navigate()` rather than per-caller, because every route into
the app funnels through it — and `switchView()` still needs its OWN guard because it calls
`applyRoleUI()` before `navigate()`. Both bypasses (browser Back, "View as") were live and were found
by review, not by testing.

### A second helper doing the first one's job is where the bug will be (2026-08-22)
`_verifyOwnClientId` (app-clients) and `_verifyClientAccess` (app-core) both answer "may I write for
this clientId?". The duplicate is the one that broke "View as": `_verifyClientAccess` allows a coach
via `coach_id === me`, the strict-self copy does not. Before writing an ownership helper, grep for an
existing one — this codebase now has FOUR (`_verifyTemplateOwnership`, `_verifyClientAccess`,
`_verifyGoalAccess`, `_verifyMilestoneAccess`) and they must not multiply further.

### "View as" (sudo) is a coach-for-a-client render path, and it is easy to miss (2026-08-22)
`sudoAsClient` (app-dashboard.js:240) sets `window._sudoClientId` and forces
`currentProfile.role = 'client'` while `currentUser` stays the COACH. `renderClientDashboard` then
renders the weight / PB / check-in forms with the SUDO'D client's id. Any guard that assumes
"role === client means the id is my own record" breaks it. `_getCurrentClientId()` returns null in
sudo. Enumerating render sites by grepping the onclick is NOT enough — this one derives its id from a
window global set by a different function.

### An ownership guard's risk is refusing the LEGITIMATE user, not admitting a stranger (2026-08-22)
Every guard added on 2026-08-21/22 sits over RLS that already refuses. So a refusal test cannot go red
before the fix, and cannot detect the real failure either. **Every guard needs a happy-path test per
ROLE that can reach it** — coach, client, solo, and sudo. The sudo break shipped into a commit because
no sudo happy-path test existed.

### A check that cannot FAIL is worse than no check (2026-08-21)
`gates-fired` tested its patterns against the whole of LOG.md, so one occurrence in July kept it GREEN
forever. It was the only os-lint check that looks at behaviour rather than artifacts, and it was
structurally incapable of failing. Found only because Jake asked a question that forced someone to read
the source — not a repeatable discovery process. `os-lint --self-test` now points every check at a
fixture built to trip it and names any that stay green as DECORATIVE. **Never add an os-lint check
without an env override for its input** — an untestable check cannot be distinguished from a dead one.

### A green verdict over ZERO items is a switched-off checker (2026-08-21)
`loadSkills()` returns `[]` when the skills dir is missing; six checks then loop zero times and each
report success ("all **0** skills have name: + description:"). Rename `~/.claude/skills` and os-lint goes
almost entirely green while inspecting nothing. Anything reporting "all N ..." must assert N non-zero.

### The pre-push gate is 57 of 523 tests, and widening it is harder than it looks (2026-08-21)
Attempted and reverted. **A glob in playwright's positional args silently no-ops** — args are OR-ed filter
regexes, so `test a.spec.js b.spec.js missing-*.spec.js` exits 0 and just runs a+b. Verify any gate change
with `--list` and confirm the file COUNT, never the exit code. Selecting specs by filename prefix selects
an ERA, not a category. And the cross-tenant probes take their cleanup id from the offending session's own
`.insert().select()`, so they cannot clean up in exactly the regression case they detect — harden those
before any future widening. (Superseded figures as of 2026-09-15: ~59 of ~757 — see
`docs/architecture.md`.)

### The assign modal closes BEFORE the clone work is awaited (2026-08-21)
`app-programs.js:758` removes `#apc-modal`; `:763` then awaits `_cloneProgramForClient`, which batches its
`client_program_workouts` inserts once at `:473`. **Modal-detach is not a barrier on the clone.** Any test
that treats it as one races the batch insert. The app is correct — this is a test-synchronisation trap.

### `escapeAttr` ROUND-TRIPS CLEANLY through a handler — the danger is the render site (2026-08-19)
Verified empirically, not reasoned: `escapeAttr(x)` inside `onclick="fn('${…}')"` survives the browser's
attribute un-escaping and JS's string-literal un-escaping, so the RUNTIME value is the ORIGINAL string —
no backslash. That makes the source call CORRECT, and means any ctx value it produced is raw
attacker-controlled text by the time something renders it.

`_ctx.backLabel` and `_ctx.clientName` were rendered RAW into innerHTML on that basis
(`app-workouts.js:1205`/`:1207`) — a live stored-XSS sink, 5th instance of the client→coach pattern
`docs/critical.md` tracks. **Do not "fix" the source `escapeAttr` calls; escape at the RENDER site.**

`FREE_TEXT` in check-escaping.mjs matches `\.name\b`, which does NOT match `.clientName` — that naming is
why no checker saw it.

### A class guard is only closed once proven against EVERY syntax the codebase uses (2026-08-19)
The escapeAttr rule shipped 2026-08-16 matched only the INTERPOLATED shape, exited 0, and nine
CONCATENATED sites (`value="' + escapeAttr(x) + '"`, built inside `mini()`/`gmini()`) stayed live for
three days while the class was reported closed. **Grep how the construct is actually written** — the 14
characters before every call — rather than assuming a second form. A test now plants one of each shape.

**A rule that flags correct code is worse than no rule.** An indirection check (`const x = escapeAttr(…)`)
was written and removed within the hour when its only live hit turned out to be correct; the comment
explaining why is in the file so nobody re-adds it. Indirection is a full-file-review job, not a regex one.

### Reorder propagation permutes SLOTS, never positions (2026-08-19)
A sibling copy legitimately holds a different set of exercises, so copying `order_index` values across
would collide with, or displace, exercises the target has and the source does not.
`_propagateReorderToTemplates` permutes only the SHARED names into the source's relative order, **reusing
the slots they already occupy** — the set of order_index values in play never changes, so a collision is
impossible by construction rather than by care.

### A guard must sit ABOVE the code that dereferences state it does not need (2026-08-19)
`startIntervalPhaseTimer`'s zero-length refusal is placed before `stopIntervalTimer()`, which dereferences
`_runner`. `_runner` is `let`-declared in `app-workouts.js:3041`, so a top-level `let` in a classic script
creates NO window property and **no test can set it**. Refusing first is both better code and the only
reason the guard is testable without driving a whole workout.

### The runner labels per-side; the prescription formatter does too (2026-08-19)
`_fmtSetDetail` gained "per side" on 2026-08-14; `_buildTargetCols` did not, so the athlete entering L/R
had nothing saying the target was per side. Now carried on the reps LABEL ("8–10 REPS/SIDE") rather than a
fifth column — the target bar is horizontal on a 390px screen. AMRAP + unilateral keeps both as
"AMRAP/SIDE".

### A policy-refused write returns `{ data: [], error: null }` (2026-08-18)
No error, ZERO rows. **Checking only `error` reports a refusal as a success.** Every write that a user is
told succeeded must `.select()` and branch on ROWCOUNT — the pattern is `deletePerfLog`
(`js/app-progress.js`). Six sites were fixed in `ad83591` after `saveCoachNotes` was found showing a green
"Saved ✓" over a write that never landed (a client transferred between coaches keeps `coach_id` = the OLD
coach on every pre-transfer `workout_logs` row).

**The asymmetry is deliberate and must not be "fixed":** in `_propagateExerciseChangeToTemplates`, only the
INSERT branch counts 0 rows as a failure. For update/delete, 0 rows is the documented "this target doesn't
contain that exercise" no-op, and counting it would fire alarms on the common case. There is a test pinning
this (`tests/silent-refusal-2026-08-18.spec.js`).

### A recovery link ESTABLISHES A SESSION (2026-08-18)
So `currentUser` is set the moment the user opens it. Without a guard, `showApp()` fires and the app boots
straight past the set-password form into the dashboard — the user lands logged in with the single-use link
already burned and no password set. `onAuthStateChange` must show the form on `PASSWORD_RECOVERY` **and** on
a `type=recovery` hash, and the app shell must stay hidden until the password is set
(`js/app-progress.js`, tests in `tests/password-reset-2026-08-18.spec.js`). This used to be a bare
`if (event === 'PASSWORD_RECOVERY') return`, which is why a dashboard-sent recovery link did nothing at all.

`_initialHash` is captured at the TOP of `app-core.js`, before the supabase client is constructed, because
supabase-js consumes and clears the hash while establishing the session. Anything reading the link type must
read `_initialHash`, never `window.location.hash`.

### `_cleanTemplateSets` is an ALLOWLIST, and EVERY writer must call it (2026-08-18)
42 emitted keys; a key it stops emitting is silently gone from every saved row with no error at any layer.
`tests/stale-set-fields-2026-08-18.spec.js` pins the count — if it changes, a field was added or removed on
the save path for every template exercise.

`flushTemplateSets` deliberately PRESERVES fields the current type does not render, so the metric-type gates
inside `_cleanTemplateSets` are the only thing stopping a stale field riding onto the wrong exercise type.
**The EDIT path skipped it entirely until `53071cf`** while both siblings cleaned.

Gate **per key, never per family**: `targetHeightCm` only on `jump_height`, `targetDistanceM` only on
`jump_distance`. A family-wide gate still let a `jump_distance` row keep a height, and `_fmtSetDetail`
prefers height unconditionally — so the preview showed "40cm" where the runner showed "2.4 m".

### `_fmtSetDetail` infers the exercise type from SET DATA, the runner from `metric_type` (2026-08-18)
`} else if (s.targetHeightCm || s.targetDistanceM) {` (`js/app-workouts.js:290`). That is why a stale field
makes the coach's plan preview and the athlete's in-gym screen disagree about what the exercise is, across
six surfaces. **Fix stale data at the gate, never in the renderer** — patching `_fmtSetDetail` leaves the
bad data on disk and hides only one of the six.

### Playwright `has-text()` is a case-insensitive SUBSTRING match (2026-08-18)
`button:has-text("End")` matched a new **"S-end- reset link"** button and broke 24 runner assertions. Use
`button:text-is("End")` for an exact match. 30 locators across 5 files were tightened; adding any button
whose label contains a shorter button's label will otherwise break unrelated specs.

### A block ends where the same programme's NEXT RUN begins (2026-08-17)
`client_program_blocks.ended_at` is the day RESTART WAS PRESSED, not the day the block's training finished,
and the next block's start is snapped back to ITS OWN Monday — so the two can overlap by up to six days or
leave a gap. **No rule about the end date alone can fix that.** `_ptsInBlock` is a plainly INCLUSIVE filter;
the overlap is resolved once in `_clampBlockChain` (`js/app-progress.js`), scoped to the same `progKey` so
two genuinely concurrent programmes still overlap legitimately.

### The BW toggle must render unconditionally (2026-08-17)
It used to render only `${s.bodyweight ? … : ''}` — and that toggle is the ONLY thing that can set the flag.
A bootstrap deadlock: no template exercise created after that gate could ever be marked bodyweight, which
also made the bodyweight reps-charting unreachable for new data. Same defect that got `assisted` deleted on
2026-08-11. `_BW_TYPES` is deliberately WIDER than `_AMRAP_TYPES` (it includes `timed_hold` — the runner has
always rendered a BW cell for a hold).

### NEVER use `toISOString()` for a calendar date (2026-08-16)
It converts to UTC, so a local-midnight Date in any UTC+ zone (Europe/London under BST — most of the year)
reports the PREVIOUS day. Use `_ymdLocal` (`js/app-core.js`). This silently turned `_mondayOfWeek`'s Monday
into a Sunday. Millisecond date arithmetic is equally unsafe across a DST change — local midnight to local
midnight over a spring-forward is 7 days MINUS an hour; anchor at NOON (`_blockWeekIndex`).

### A weight unit is a TEST DIMENSION, not a display detail (2026-08-14)
`weightToPref` (`js/app-core.js:85`) returns a **number** in kg but a **STRING** in lb — its lb branch exits
through `_stripTrailingZero`, which is `String(v).replace(...)`. So **never call a number method on its
return value**; `parseFloat` first, exactly as `fmtWeight` (`js/app-core.js:110`) does. Writing
`weightToPref(x).toFixed(1)` threw `TypeError` and killed the entire Progress page for any lb user with a
recorded 1RM — caught by pre-push review, never shipped.

**The whole Playwright suite runs at the `kg` default (`js/app-core.js:72`) and nothing flips it**, so this
class is invisible to every existing test. Any new surface rendering a weight needs a kg/lb matrix test —
the precedent is `tests/screenshot-feedback-2026-08-14.spec.js` ("1RM grid survives a non-default weight
unit"). Same reasoning applies to `jumpHeightToPref` / `cardioDistanceToPref`, which have the identical
number-or-string shape.

### `flushTemplateSets` preserves un-rendered fields — so every per-set flag needs a type gate (2026-08-14)
Switching an exercise's Type does **not** clear set fields the new type doesn't render; that is deliberate
(it lets a user flip back without retyping). The consequence: a per-set flag toggled under one type survives
into another where it is meaningless. `amrap` toggled on weight_reps then switched to Jump produced "AMRAP
jumps" in the runner, "AMRAP:" as the set label in two detail views, and **nothing** in the collapsed day
row — three surfaces disagreeing about one set.

**Gate it once at `_cleanTemplateSets`, never at the render sites** — that function takes `metricType` as a
third argument for exactly this (`_AMRAP_TYPES`). The same class already has a guard for stale `weight` on a
jump set in `_buildTargetCols` (`js/app-runner.js`). Note `_cleanTemplateSets` is an **allowlist**, so a
caller that forgets the third argument silently drops the flag — that is a feature, and a test caught it.

### Cardio/interval — one metric_type now, not two (2026-08-09)
`'cardio'` is **no longer a selectable metric_type** — the builder's exercise-type `<select>` only offers
`'interval'` for the whole cardio family now (Jake: "having cardio and intervals as 2 separate categories
is redundant"). A steady, single-round effort is just an interval block with `sets:1, cycles:1` and zero
warmup/rest/recovery/cooldown — **derive "is this steady" from the block's actual fields, never store a
separate flag** (`_isSteadyIntervalBlock(b)` in app-workouts.js is the one shared predicate; the runner's
`_isSteadyEffortBlock(ex)` delegates to it — don't reimplement this check a third time). The runner's
manual/no-timer LOG button now works for a steady-effort block too (previously interval-only-off); a
genuine multi-round/multi-cycle block still requires the live timer. `'cardio'` stays DB-allowed (no CHECK
constraint tightened) since historical `workout_log_exercises` rows and the `'amrap'` precedent both rely
on the DB permitting values the UI no longer writes — don't "clean up" that constraint without checking
history first. All real `workout_template_exercises`/`exercises` rows were migrated live
(`scripts/merge-cardio-into-interval-2026-08-09.sql`, backed up first) — if you ever see a `metric_type`
value of `'cardio'` in live data again, that's new/unexpected, not a leftover.

### New-account provisioning — Edge Function pattern, not raw service-key scripts (2026-08-09)
Public self-signup is gone for good (2026-07-24 incident) and there is still no self-serve solo-account
signup (deliberately deferred, Jake's own call). The supported way to create a brand-new account (coach,
client, or now solo) that needs privileged (service-role / bypasses-RLS) logic is a **Supabase Edge
Function**, deployed via the Dashboard's browser-based "Via Editor" flow (no CLI is installed or tracked in
this repo — don't assume one exists). `supabase/functions/invite-solo-user/index.ts` is the second such
function (after the pre-existing, undocumented-source `invite-client`) and the first one with its source
actually tracked in this repo — do that for any future Edge Function too, even though Supabase itself
doesn't require it. **Every Edge Function that does anything privileged must independently re-verify the
caller's identity server-side** (`supabase.auth.getUser()` against the caller's own Authorization header,
never a body param) — a client-side email/role gate hiding a button is a UI convenience only, not a
security boundary; this was verified live (a real non-owner session got a genuine 403 from the deployed
function, not just a hidden button). The one-off local script pattern (`SUPABASE_SERVICE_KEY=... node
scripts/*.cjs`, service-role key pasted into `.env` each time) still exists as a documented fallback
(`scripts/invite-solo-user.cjs`) but is explicitly NOT how Jake wants repeated/at-scale operations done —
he pushed back hard on it ("too convoluted... won't scale"). Default to the Edge Function + in-app UI
shape for anything a coach/Jake will need to do more than once.

### Week-tabs display model (2026-07-18) — Programs builder + client Workouts page
Both surfaces render phase→week→day→workout the same way: **weeks = tabs** (`.week-tab`, one week on screen at a time), **days = rows**, and a day/slot **opens its workout inline**. The full-screen session-detail slider (`openSessionDetail`) is **no longer called** by either surface — it survives only for the standalone Templates list (app-workouts.js). Read page (`renderClientWorkoutsPage`) pre-renders every week into hidden `.rw-week` panels toggled by `_selectReadWeek`; the first phase (`pi===0`) is open by default. Builder (`loadAllPhaseWorkouts`) renders per-phase week tabs + **only the active week's grid**, cached in `window._builderWeekData[phaseId]` and re-rendered by `_selectBuilderWeek` (no refetch); the active week persists in `window._builderActiveWeek[phaseId]`, clamped to a valid week on every render. Builder slots expand inline (`_toggleBuilderSlot`) to **Edit** (`_editPhaseWorkout` → `openTemplate` with the program back-ctx — same ctx the removed slider passed) / **Remove** / **Save to Library** (`saveTemplateToLibrary(id, btnEl)`, moved onto the slot from the removed drawer). Responsive: `.pwk-days` is a vertical list on mobile, a grid ≥768px. **Any name/exercise-name interpolated into these renders must be `escapeHtml`'d** — the DAY-header `sessionSummary` was a raw coach→client XSS, escaped 2026-07-18.

### Modal pattern — body-level only
All modals: `document.createElement` → `document.body.appendChild`. Never embed in `el.innerHTML`. See `showAssignProgramModal` as canonical pattern. `class="modal-overlay"` wraps `class="modal-box"`. **Known stale per the 2026-08-12 audit:** `mountModal()` superseded this after a 2026-07-04 stacking-race incident; `app-clients.js`/`app-calendar-goals.js` never adopted it.

### `program_id` constraint
Templates with `program_id` set are hidden from flat Workouts list. Client plan clones: `program_id: null`, `client_id: set`. Master templates: `program_id: set`, `client_id: null`. Standalone: both null. (See `docs/schema.md` for the 3rd, undocumented `generated_from_phase_id`-only state found by the 2026-08-12 audit.)

### Timed sets dual format
`s.duration` = `mm:ss` string (from editor). `s.repsMin` = seconds integer string (from programmatic build). Render must handle both. Pattern: `parseRest(s.duration) || parseInt(s.repsMin)`.

### Dynamic nav — event delegation
`renderNav(role)` rewrites `.sidebar-nav` and `.bottom-nav` innerHTML on every call. Click handlers use event delegation on parent containers — never inline onclick on nav items.

### `_runner` global structure
`{ clientId, name, date, exercises, exIdx, startTime, _timerInterval, _restInterval, _afterRest, lastSession }`
Each exercise: `{ name, type, targetSets, targetReps, targetWeight, loggedSets, bodyweight, sets_json, notes, oneRM, clientNotes }`
**Known stale per the 2026-08-12 audit:** the actual runtime object carries ~25+ fields once runtime-added state is counted, not the ~10 listed here.

### `sets_json` flags
`s.timed` → duration field; `s.unilateral` → L/R split; `s.bodyweight` → BW display; `s.amrap` → AMRAP mode

### `_afterRest` pattern
Between-exercise rests: `() => { _runner.exIdx = nextExIdx; renderRunner() }`. Between-set rests: `skipRestTimer()` calls `renderRunner()` directly.

### `_templateCtx` / `_templateGoBack`
Back-nav context for template editor. Always set `backFn` when opening template from non-standard location. `_templateGoBack` checks: `backFn` → `clientId` → `backTo` → default `'workouts'`.

### Save functions own no navigation
`save*` functions save only. Navigation is role-aware at the call site. **Known contradicted per the 2026-08-12 audit:** `saveRunnerSession`/`saveWorkoutSession` both navigate internally.

### Master account / solo account
`window._masterAccount = true` when coach user has any client record (coached or personal). `window._soloClientId` = personal client record ID (coach_id = null). `window._masterClientId` = coached client record ID (coach_id set). `currentProfile.role` cycles between `'coach'`, `'client'`, `'solo'` via `switchView()`. `localStorage._activeView` persists choice. Client pill only shown when `_masterClientId` set; Personal pill only when `_soloClientId` set.

**Genuinely-solo accounts are a separate mechanism (2026-08-01) — `role='solo'` is now NATIVE, not cycled.**
`clients.user_id` has a real UNIQUE constraint (`clients_user_id_idx`, documented `tests/gdpr-export.spec.js:84-97`)
— an account can hold AT MOST ONE `clients` row, ever, so a real account is either a master account (matches
one of the two `Promise.all` queries above) OR a genuinely-solo account, never a hybrid of both. For the
latter, `profiles.role` is stored as `'solo'` directly in the DB (migrated by `scripts/migrate-solo-role-
2026-08-01.sql`, one real account today) — `loadUserInfo()` treats `role==='solo'` (or the pre-migration
transitional shape `role==='coach' && solo_only===true`, kept as a permanent OR-clause defense against
deploy-before-migration ordering, not a temporary shim) as its own branch: looks up the self-referential
`clients` row for `_soloClientId`, never touches `_masterAccount`, and `switchView()` is therefore always a
no-op for this account (it never had a coach view to switch to). `solo_only` stays in the schema, unused as
the steady-state signal but doubling as that transitional safety net.

### Storage — signed URLs
Private buckets: logos (604800s = 7 days), progress-photos (3600s = 1hr). Never `getPublicUrl`. Use `createSignedUrl` (single) or `createSignedUrls` (batch).

### Cache busting
Each of the 9 module files (incl. `starter-content.js`, shipped 2026-07-12 — don't glob for `app-*.js`, enumerate
`js/*.js` on disk) has its own independent `?v=N`. Any commit that changes a module file must bump that file's own
version in index.html — bump only the files that changed, not all 9. (Version numbers as of the 2026-08-01 save
are stale — see `git blame index.html` for current values, not this entry.)

### metric_type — the single source of exercise shape (shipped live 2026-07-19, 95e8e8f)
`metric_type` is now first-class and intrinsic to an exercise: one of `weight_reps` · `unilateral` · `timed_hold` · `cardio` · `jump_height` · `jump_distance` (6 values, CHECK-constrained). It lives on `exercises` (source-of-truth default), denormalized onto `workout_template_exercises` + `workout_log_exercises` (same flow as legacy `exercise_type`, because a logged row's `exercise_id` is nullable so history can't join back). **AMRAP is NOT a metric_type — it's a per-set flag** (like `bodyweight`/`assisted`); it tracks reps, same as `weight_reps`. The builder picker sets metric_type and DERIVES legacy `exercise_type` (cardio/strength) + per-set `unilateral`/`timed` flags from it (`_deriveFromMetricType`, app-workouts.js) so the current runner keeps working. The runner routes by metric_type (`_isPlainStrengthExercise` → `_METRIC_TABLE_TYPES` via `_exMetricType`, with a legacy-flag fallback): the fast table handles all 5 strength types, only cardio stays on the wizard. `workout_log_sets` carries `avg_hr`/`max_hr`/`height_cm`/`side` (populated by ②b/②c/②d).

### Strength table (Hevy-style runner v1)
`_isPlainStrengthExercise(ex)` gates the table vs. wizard: excludes cardio, any set with `timed`/`unilateral`/`intensityMin`, and carry/sled/lunge-name exercises (regex-matched, same list used elsewhere). `ex.tableRows` = `[{weight, reps, done}]`, lazily built by `_ensureTableRows` (seeded from `_prevSetsByIndex`, keyed by `set_number - 1` against `_runner.lastSession[ex.name]`). `toggleTableSet(i)` flips `done` and calls `_syncLoggedSetsFromTable`, which **rebuilds** `ex.loggedSets` from scratch each time (`filter(done).map({weight,reps})`) rather than pushing — verified safe: every consumer (`saveRunnerSession`, `showRunnerFinish`, header dots) only reads `.length`/iterates, never holds a stale reference. `renderRunnerLastSession` was extended (not just the table added) to retroactively backfill blank rows if the async last-session fetch resolves after the table's first paint — guarded against re-triggering itself (row already non-blank → skip → no re-render loop).

### Deleting a program's templates — ownership AND live-references, always both (2026-07-11)
Any code path that deletes `workout_templates` belonging to a program/phase must ask **two separate questions**, and they are NOT the same question:
1. **Ownership** — is this template the program's own (`program_id` match) or its own periodization week-clone (`generated_from_phase_id` match)? A coach's reusable **standalone** template merely slotted into a week is *not ours to delete* — destroying it rips it out of every other program too (the `deleteProgram()` data-loss bug, 2026-07-10).
2. **Live references** — "Duplicate week" is *cheap by design*: the new week's rows share the **source week's `template_id`** until someone forks on edit (`_resolveEditableTemplateId`). So a template we genuinely own may still be needed by a surviving row in another week.

Both live in **`_deleteOwnedUnreferencedTemplates(templateIds, programId, phaseId)`**, shared by `deletePhaseWeek` and `_cleanupPhaseWeeksBeyond`. They are in one helper *precisely because they silently diverged before*: `deletePhaseWeek` got the guards on 2026-07-10, `_cleanupPhaseWeeksBeyond` did not — and that gap destroyed real Week-1 workouts until 2026-07-11. **Never add a third delete path without calling this helper.** Callers must delete their own `program_phase_workouts` rows FIRST, so whatever still references the template afterwards is a genuine survivor.

### `is_personal` — a UI display split, NOT a security boundary (2026-07-11)
`exercises.is_personal` (2026-07-10) and `workout_templates.is_personal` (2026-07-11) exist because the PT account and the solo/Personal account are **the same login** — same `auth.uid()`, same `coach_id`. Without the flag, anything built in Personal view bleeds into the PT's real client-facing library and vice versa. Every standalone-template/exercise read filters `.eq('is_personal', currentProfile?.role === 'solo')`; `saveNewTemplate`/`saveNewExercise`/`_createExerciseFromPicker` stamp it from the same expression. Clone paths (`_cloneSharedMasterTemplate`, `_cloneTemplateForClient`, `generatePhasePeriodization`) **carry the source's value over** rather than recomputing from the current role — and each of their source `select()`s must therefore include `is_personal` explicitly (a plain object-literal insert silently drops an `undefined`, falling back to the DB default; this exact no-op was caught by the multi-agent review on 2026-07-11).

**Deliberately NOT enforced at RLS — do not "fix" this.** The client Dashboard hero (`app-dashboard.js`) and client Calendar (`app-calendar-goals.js`) embed the **master** templates through `program_phase_workouts` — not the client's clones. A program built in Personal view carries `is_personal = true` masters, so an RLS `is_personal = false` restriction would silently null that embed and break the client's dashboard/calendar (the exact PostgREST silent-null failure mode from sessions 23/24). `is_personal` answers "which of Jake's two libraries does this belong to," not "who may read this." The genuine multi-tenant boundary is `coach_id` + `client_id`, and that is what the RLS fix of 2026-07-11 tightened.

### Periodization — week_number / tier
`program_phases.periodization_type` (`'linear'`/`'undulating'`/null) + `periodization_config` (jsonb). `program_phase_workouts.week_number` (default 1) lets one phase hold distinct day/template assignments per week — phases that never use periodization just have week_number=1 rows, which the client calendar/workouts-page render as repeating every week (legacy behaviour, unchanged). `program_phase_workouts.tier` (`'heavy'`/`'moderate'`/`'light'`) is undulating-only, set per day-slot. `generatePhasePeriodization(phaseId, programId)` clones Week 1's templates into weeks 2..duration_weeks, recalculating only sets where `intensityMin`/`intensityMax` is set — everything else (reps, rest, tempo) is copied unchanged. Regeneration is idempotent (`_cleanupPhaseWeeksBeyond` deletes stale weeks + their templates, both master and any already-propagated client copies, before regenerating) — the same helper runs when a phase's `duration_weeks` is edited down. Client propagation: assigning a program clones week_number through (`_cloneTemplateForClient`/`_cloneProgramForClient`); if a client is *already* assigned when new weeks are generated, `generatePhasePeriodization` propagates to them too.

**%1RM vs RPE — not interchangeable (clarified 2026-07-03):** the phase-level Start/End % (or undulating tiers) only scales sets that were built with the **%1RM field** in the set editor (`intensityMin`/`intensityMax` on that set). Sets built with RPE/RIR instead are left completely untouched by design — periodization has nothing to scale on an RPE-based set, so the session-detail drawer correctly shows nothing extra for them. This is a per-exercise, per-set authoring choice in the set editor, not a phase-wide toggle. Found via Jake's test program: Phase 1 set to Linear 70→80%, but Bench/Squat/Row were all built with RPE, so nothing visibly changed — expected behaviour, not a bug.

### Unit preference — `window._unitPrefs`, canonical storage, conversion only at the boundary (2026-07-25)
`profiles.weight_unit`/`jump_height_unit`/`cardio_distance_unit` (kg/lb, cm/in, km/mi — independent, not one
metric/imperial switch) are read into `window._unitPrefs` by `loadUserInfo()` and used by every render/save
function that touches a weight, jump height, or cardio distance. **Storage is always canonical (kg/cm/metres) —
never write a converted value to the DB.** Conversion happens ONLY through the shared helpers: `weightToPref`/
`weightFromPref`/`fmtWeight` and `jumpHeightToPref`/`jumpHeightFromPref`/`fmtJumpHeight` (app-core.js),
`distanceToPref`/`distanceFromPref` extending `fmtDistanceM` (app-workouts.js). `*FromPref` always returns a
NUMBER (via `parseFloat`), even for the native/unconverted unit — a raw `.value` string read straight off an
input is NOT the same type; don't assume string-vs-string equality still holds after routing a field through
one of these. `*ToPref`'s native-unit branch is a bare passthrough with **no forced rounding** — a display site
that always showed a fixed decimal count (e.g. `.toFixed(1)`) before the toggle existed must pass `fmtWeight`'s
`decimals` option explicitly, or it will silently lose that formatting for kg-only users (this exact regression
shipped and was caught by review in the same session that added the option). Entry-field reads must use the
explicit existence-check pattern — `const el = document.getElementById(id); s.field = el ? (converter(el.value)
?? fallback) : s.field` — not a naive `?.value ?? s.field` wrapped in a converter, which can't tell "field not
rendered for this metric type" from "user deliberately cleared it." **Account-wide, not per-role**: coach and
solo share one `profiles` row by design (same `auth.uid()`) so they always share one unit preference; a real,
separate client account has its own row and is never affected by their coach's setting — do not "fix" either
of those.

**Second entry point, 2026-08-08**: `_saveUnitPrefs(weight, jumpHeight, cardioDistance)` (app-core.js) is now the
shared DB-write core — `saveSettingsUnits()` (Settings page) and the new `_saveQuickPrefs()` (the quick-prefs
popover, reachable from the runner and builder via `_quickPrefsIconHtml()`/`_openQuickPrefsPopover()`) both
call it rather than duplicating the update/overwrite-`window._unitPrefs` logic. Same popover also holds the
4 cardio-capture-metric toggles (`_cardioCaptureToggles`, localStorage — see the cardio capture ledger row,
2026-08-08) — one shared preference surface, two entry points, not two divergent copies.

### Playwright nav clicks — always clickVisible/waitForVisible, never raw page.click (2026-07-25)
`playwright.config.js` now genuinely runs at 390×844 (a config bug previously made every test run at desktop's
1280×720 instead — fixed). The app's `renderNav()` (`js/app-core.js`) intentionally writes an identical
`data-page="x"` link into BOTH the sidebar nav and the bottom nav for every page — that's correct, normal
product behavior, not a bug to "fix" — CSS alone (a 900px breakpoint) decides which is shown. Any NEW Playwright
test that clicks a nav item, the Personal view-switcher, or signs out must use `clickVisible`/`waitForVisible`
(`tests/helpers.js`) — e.g. `clickVisible(page, '[data-page="workouts"]')` or
`clickVisible(page, ['#vs-personal', '#mvs-personal'])` — never a bare `page.click('[data-page="x"]')` or
`page.click('text=Personal')`, which will resolve to the sidebar's (hidden, at 390px) copy and time out. A
locator that specifically needs "the currently-visible mobile copy" (e.g. an existence assertion, not a click)
can target `.bottom-nav-item[data-page="x"]` directly, since the suite's only project is fixed at real mobile
width.

### 1RM assignment-time check
`_getProgramOneRMStatus(programId, clientId)` scans Week 1 only (sufficient — generated weeks reuse the same exercise names) for %1RM-tagged sets, diffs against `client_1rms` (trim+lowercase exact match — same limitation as the rest of the app; exercise_id-based matching is a deferred future decision, see roadmap). `_renderOneRMQuickEntry(idPrefix, name)` is the shared toggleable kg/Epley-estimate row component — parameterized by idPrefix so multiple rows coexist. `window._missingOneRMExercises` holds the current checklist's missing-name list (index-matched to `mor-N` DOM ids) between refresh and save. `_refreshMissingOneRMs` is token-guarded (`_oneRMRefreshToken`) so a stale in-flight refresh can't overwrite a newer one if the PT changes the client/program selection quickly. Wired into both assign entry points (`showAssignProgramModal`/`showAssignProgramToClientModal`) — 1RM entries must be saved *before* the modal is removed, not after (DOM reads fail silently on a detached modal).
