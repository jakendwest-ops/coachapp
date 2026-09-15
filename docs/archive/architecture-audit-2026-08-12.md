# CoachApp architecture audit — 2026-08-12

_A cold-start companion for a new developer. Sits alongside `CLAUDE.md` (the lean cheat-sheet) and
`/hello-claude` (the session-start ritual) — read this once, deeply, rather than every session._

## 1. Purpose &amp; how to use this document

This is the first full-codebase, structured review CoachApp has ever had. The existing review tooling
(`multi-agent-review`) only ever covers a current diff (pre-push) or the 2-3 highest-churn files (the
weekly full-file pass) — most of the 9 modules had never been read end-to-end by a review process before
this pass. This document exists to answer, for a developer who has never seen this codebase before: what
is this app, does the code match what the docs say it should be, and what's actually broken or
inconsistent right now.

It is intended to also finally resolve `data-model.md`'s two dangling `[[project-coachapp-architecture]]`
wikilinks (lines 3 and 56) — that's a follow-up edit for a future session, not done here.

**Methodology, up front:** 6 agents each read one or more whole JS modules (never a diff), running a
4-angle checklist (security/scoping, solo-mode correctness, duplicates/dead-code/regressions, and a new
documentation-alignment angle), then a synthesis/verification pass spot-checked the most severe and most
surprising claims directly against the live code before anything was written here or filed as a bug. This
is report-only — nothing was fixed as part of this pass. No RLS/SQL policy review was performed (no RLS
SQL is tracked in this repo; that needs a live Supabase probe and is a separately-scoped future task) — see
§11 for the full methodology and what this pass deliberately did not cover.

## 2. How to run it

From `CLAUDE.md`: plain vanilla JavaScript (ES6+), browser-native, no TypeScript, no framework, no build
step. `index.html` loads `css/main.css` and the `js/` modules directly via `<script>` tags. Backend is
Supabase (Postgres + RLS + Auth + Storage), project `avilxuiacmtgeoxxhfhc` (eu-west-1). Tests are Playwright
E2E only (`npm test`). Deploy is push to `master` → GitHub Actions → GitHub Pages — there is no PR gate;
committing straight to master is the normal workflow here. Every module has its own `?v=N` cache-bust on
its `<script>` tag — bump the version of any module you change, in the same commit.

## 3. Documented architecture — summary, with citations

Three roles: **coach**, **client**, **solo**. Solo shares the coach's `auth.uid()` — its `clients` row has
`coach_id = NULL`, which is why a bare `.eq('coach_id', …)` filter has silently excluded solo four separate
times in this project's history (CLAUDE.md). `is_personal` is a **display** flag distinguishing a coach's
personal-use content from client-facing content — never a security boundary, never belongs in an RLS
policy (a near-miss on this exact point is documented in this project's own memory).

**Template/program ownership model** (`data-model.md`): `program_id` set + `client_id` null = a master
template; `program_id` null + `client_id` set = a client's personal copy; both null = a standalone
reusable template. §6 below documents that the real code actually implements a **third, undocumented
state** (`generated_from_phase_id` set, both `program_id`/`client_id` null — a periodization-generated
week-clone) that this rule doesn't account for.

**`blueprint.md`** (the oldest Vault doc, 2026-06-19, "locked" v1 decisions) is **stale** against the later
solo-role redesign — most notably it still describes a self-signup page ("I'm training for myself → role:
solo"), directly contradicted by STATUS.md's Continuity block: public self-signup was removed entirely on
2026-07-24 (the "Scott West signup incident") and there is still no self-serve solo-account signup path
(onboarding is now the owner-gated "Invite a personal user" Edge Function, shipped 2026-08-09).

**Modal pattern** (STATUS.md's Continuity block) currently documents the canonical pattern as plain
`document.createElement` → `document.body.appendChild`, citing `showAssignProgramModal` — but this is
**stale**: `mountModal()` (`js/app-core.js:274-277`) was added later specifically to fix a real
double-overlay race (2026-07-04 incident, documented in its own comment), and even the doc's own cited
"canonical" example doesn't call it. See §5 and §6 for the fallout — two files never adopted `mountModal()`
and have reintroduced the exact race it was built to prevent.

## 4. Module map

| File | Lines | Owns | `dbq(` | `db.from(` | `log.*` |
|---|---|---|---|---|---|
| starter-content.js | 169 | New-coach seed data (~40 exercises + sample workout/programme) | 0 | 13 | 8 |
| app-clients.js | 513 | Client list/profile tabs, PB/weight/check-in forms | 0 | 12 | 22 |
| app-core.js | 668 | Auth, `log` utility, toasts, `dbq()` wrapper, `escapeHtml`/`escapeAttr`, `db` client, role resolution | 2 | 8 | 11 |
| app-dashboard.js | 847 | Coach/client/solo dashboards | 0 | 19 | 6 |
| app-calendar-goals.js | 1,005 | Calendar + goals | 0 | 22 | 31 |
| app-progress.js | 2,268 | My Progress (weight, PBs, cardio, charts), Settings | 4 | 35 | 43 |
| app-programs.js | 2,294 | Programmes/phases/periodization, assign/clone, client-programme views | 7 | 87 | 64 |
| app-workouts.js | 2,754 | Templates/library, template editor, session-detail drawer | 3 | 66 | 53 |
| app-runner.js | 3,227 | In-gym logger, wizard, rest timer, autosave | 7 | 30 | 24 |
| **Total** | **13,745** | | **23** | **292** | **262** |

Key shared globals: `_runner` (app-runner.js — a bare top-level `let`, ~25+ fields once runtime-added
fields are counted, not the ~10 STATUS.md's Continuity block currently lists — see §7), `window._templateCtx`
/`_templateGoBack` (app-workouts.js, navigation-back context), `window._builderWeekData`/`_builderActiveWeek`
(app-programs.js, per-phase week-tab cache), `window._soloClientId`/`_masterAccount` (app-core.js, resolved
once at login by `loadUserInfo`).

## 5. Cross-cutting drift signals

The bad and the good, so this document isn't pure criticism — both are real, verified signals.

**Healthy baselines:**
- **`escapeHtml`/`escapeAttr`** (app-core.js) are well-adopted — hundreds of call sites across every
  module, and every agent independently confirmed most render paths in their scope use them correctly.
  §6 lists the real exceptions, but they are exceptions against a generally-followed convention, not the
  norm.
- **`?v=N` cache-busting** on every module's `<script>` tag in `index.html` — 100% consistent, confirmed.
- **`starter-content.js`** — the "~40 exercises" claim in CLAUDE.md and STATUS.md is exactly right (40
  entries counted precisely), every insert correctly self-anchors on `coach_id: currentUser.id`, and a new
  solo signup is seeded identically to a new coach (confirmed clean by direct trace of `isSoloAccount`).

**Drift signals:**
- **`dbq()` adoption is thin and uneven — 23 of 292 `db.from()` calls repo-wide (≈8%).** Four files
  (`app-clients.js`, `app-dashboard.js`, `app-calendar-goals.js`, `starter-content.js`) use it **zero**
  times. `app-programs.js` alone accounts for ~30% of every raw, unwrapped `db.from()` call in the entire
  codebase (80 of 87). Root cause, traced directly: `dbq()`'s own definer, `app-core.js`, only uses it for
  2 of its own 8 `db.from()` calls — the file that should be the best advertisement for the wrapper isn't
  one, which plausibly explains why the rest of the codebase treats it as optional rather than a hard
  convention. There is no lint/type/runtime friction that flags a raw `db.from()` call as non-compliant.
- **No shared ownership-anchor helper exists for most tables that need one.** `_verifyTemplateOwnership`
  (`js/app-workouts.js:2560`) is the *only* such helper in the whole codebase, and even within its own
  file it's applied to 2 of 4 plausible call sites (see §6). No equivalent exists for `client_1rms`/
  `performance_logs`/`weight_logs`/`clients` (app-progress.js, app-runner.js, app-clients.js),
  `program_phases`/`program_phase_workouts`/`programs`/`client_programs` (app-programs.js), or
  `goals`/`goal_milestones` (app-calendar-goals.js) — see §6 and the 10 bug files this audit filed.
- **`log.*` density is uneven and doesn't correlate with error-path coverage.** `app-dashboard.js` has
  only 6 calls across 18 read queries spanning 3 role-branched dashboards, and none of the 6 sit inside an
  error branch — every one of those 18 queries silently swallows its own error (§6). By contrast
  `app-calendar-goals.js` (31 calls) and `app-progress.js` (43 calls) log almost every write failure, but
  several of those same functions still show the user nothing on failure (a delete that logs to console
  but leaves the UI silent — see the filed bug on this).
- **`mountModal()` — adopted in 4 of 6 files that build modals, absent in the other 2** (`app-clients.js`,
  `app-calendar-goals.js`), which is directly traceable to STATUS.md's stale documented pattern (§3). Two
  of the un-adopted modals are the exact `async`/await-before-mount shape the helper exists to fix.

## 6. Per-module findings

Ordered by worst finding's severity, not alphabetically. `file:line` citations throughout; severities are
post-synthesis (reconciled across all 6 agents on one rubric — see §11), not each agent's own raw guess.
Every finding below has a corresponding `bugs/*.md` file (id shown) unless marked "descriptive only."

### app-clients.js — 2 High

- **`saveClientPB`/`saveClientCheckIn`/`saveClientWeight` (7-75) have ZERO ownership check — not even a
  `coach_id` filter.** `clientId` is a bare parameter, never re-verified against the caller's own resolved
  client record. A signed-in client could call `saveClientWeight('<another clients uuid>')` directly from
  devtools. Directly matches the table family (`performance_logs`, `client_check_ins`, `weight_logs`) named
  in the 2026-07-12 storage-leak incident's class of bug, though a different vector. **High.**
  `bugs/2026-08-12-client-self-service-writes-zero-anchor-app-clients.md`
- **`showUpdateEmailModal` (394) re-renders the client's email raw**, reopening an attribute-breakout XSS
  class the sibling modal (`showEditClientModal:439`) correctly closes with `escapeHtml`. Plus:
  `app-clients.js` and `app-calendar-goals.js` are the only 2 files that never use `mountModal()` — 3
  modals here (incl. the async `showEditClientModal`) reintroduce the documented 2026-07-04 stacking race.
  **High.** `bugs/2026-08-12-mountmodal-not-adopted-clients-calendar-goals.md`,
  `bugs/2026-08-12-stored-xss-recurrence-across-5-files.md`

### app-runner.js — 1 High (security), 1 High (XSS), 1 Low

- **`saveRunnerOneRM`/`_savePostSessionOneRM` (2619, 2500) insert into `client_1rms` unverified** —
  same table, same gap shape as app-progress.js's `save1RM`. **High.**
  `bugs/2026-08-12-client-scoped-writes-no-ownership-anchor-progress-runner.md`
- **The "Your notes" textarea (844) renders `ex.clientNotes` raw, verified live** — breaks out via a
  literal `</textarea>`, and round-trips through the localStorage autosave draft, not just same-keystroke
  self-XSS. 3 more unescaped sites in the same file (787, 584/590, 1648/1666). **High.**
  `bugs/2026-08-12-stored-xss-recurrence-across-5-files.md`
- 2 dead functions left over from the 2026-08-11 wizard deletion (`startStrengthSetTimer` family,
  `addExtraStrengthSet`). **Low.** `bugs/2026-08-12-dead-code-post-wizard-deletion-runner.md`
- Deletes assuming FK cascade without verification (`deleteWorkoutLog:3195`) — matches the 2026-07-03
  incident class. **Medium, descriptive only** (not independently filed — same class as §9's scorecard,
  worth a live check rather than a speculative bug row).
- STATUS.md's Continuity block is stale on this file's `_runner` shape and exercise-shape docs (§7).

### app-progress.js — 1 High, 1 Medium

- **7 write functions (`save1RM`/`delete1RM`/`savePerformanceLog`/`deletePerfLog`/`saveWeightLog`/
  `saveWeightGoals`/`deleteWeightLog`, 208-895) write/delete `client_1rms`/`performance_logs`/
  `weight_logs`/`clients` rows with no ownership anchor**, plus an 8th instance (`sendClientInvite`'s
  `invited_at` stamp, 832). `saveWeightGoals` is the worst of the seven — it writes directly to the
  canonical `clients` row. **High.**
  `bugs/2026-08-12-client-scoped-writes-no-ownership-anchor-progress-runner.md`
- A `Chart.js` instance leak in `renderProgressWeight` (1339, 1351 — no destroy-before-create guard,
  unlike 3 other chart sites in the same file that all have one), plus 2 deletes (`deletePerfLog`,
  `deleteWeightLog`) that fail completely silently on error, no toast, no message. **Medium.**
  `bugs/2026-08-12-progress-chart-leak-and-silent-delete-failures.md`
- Verified clean: no PII in any of 43 `log.*` calls; no solo-mode bugs (the `.eq('coach_id', …)` bug shape
  doesn't apply anywhere in this file); the units-toggle convention matches STATUS.md exactly.

### app-programs.js — 1 High (systemic), 3 High (XSS)

- **~20+ write call sites across `program_phases`/`program_phase_workouts`/`programs`/`client_programs`
  have no ownership anchor**, and no equivalent of `_verifyTemplateOwnership` exists for this file's own
  tables despite it being the heaviest `db.from()` user in the repo (87 calls, only 7 wrapped). This is
  the single largest, most systemic finding of the whole audit. **High.**
  `bugs/2026-08-12-app-programs-phase-writes-no-ownership-anchor.md`
- **`renderClientPrograms`'s `sessionSummary` (87) is a confirmed, verified regression against a
  documented 2026-07-18 XSS fix** — byte-identical computation to `app-workouts.js:642`, which correctly
  escapes it; this one doesn't. STATUS.md's fix note names only 2 surfaces as covered; this is an
  uncatalogued 3rd. 3 more unescaped sites in the same function (program name:57, session name:101, phase
  name:134) plus `programs.description` (767, 892). **High** (confirmed regression, not merely plausible).
  `bugs/2026-08-12-stored-xss-recurrence-across-5-files.md`
- Doc-vs-code: the "no auto-renaming" cloning rule (data-model.md) is contradicted, without qualification,
  by `generatePhasePeriodization`'s deliberate `— W{n}` suffix — verified as an intentional, load-bearing
  exception (the suffix is explicitly stripped for display in 3 places), not a bug. **Descriptive only** —
  data-model.md needs a carve-out added, no code fix needed.
- The template-ownership model's undocumented third state (§3) is implemented and depended on here
  (`generatePhasePeriodization:1546-1547`, `_refreshProgramTemplates:2120-2126`). **Descriptive only.**

### app-calendar-goals.js + app-dashboard.js — 4 High

- **`toggleMilestone`/`toggleClientMilestone`/`saveGoalProgress` are still unanchored, as STATUS.md noted
  on 2026-08-02 — but that note was never actually filed as a `bugs/*.md` row**, and a previously-uncatalogued
  sibling (`saveCheckIn`'s own goal-update, calendar-goals.js:907) has the identical gap. `saveEditGoal`
  (the 4th item in that 2026-08-02 note) **was** fixed since — the old note is partially stale. **High.**
  `bugs/2026-08-12-goal-writes-unanchored-ledger-was-stale.md`
- `renderCalendar`'s `events` reads are entirely unscoped at the app layer, on the exact table with
  2026-07-12 write-side incident history — zero read-side defense-in-depth. Noted in the same bug file
  above given the shared file/table context.
- **All 3 dashboards' bulk fetches (18 queries total) silently swallow every error** — the first thing
  every user sees on every login has zero error visibility; a failed fetch is indistinguishable from a
  genuinely empty account. **High.** `bugs/2026-08-12-dashboard-silent-query-error-swallowing.md`
- Unescaped free text in both files: `pb.name`/`pb.unit` in both dashboards (534-535, 805-806),
  `clientMap[client_id]` unescaped in **both** files independently (calendar-goals.js:191,
  dashboard.js:119) — a genuine cross-file, shared-defect finding, same field, same gap, found twice.
  **High** (matches the recurring stored-XSS class directly).
  `bugs/2026-08-12-stored-xss-recurrence-across-5-files.md`
- Verified clean: solo-mode correctness across both files (traced every `.eq('coach_id', …)` and every
  dashboard-selection branch); no duplicate functions; no dead code; no timer leaks.

### app-workouts.js — 1 Medium

- **`saveExerciseToTemplate`/`moveTemplateExercise` skip `_verifyTemplateOwnership`**, contradicting this
  file's own documented convention (its comment names the intended pattern explicitly). Very likely
  RLS-backstopped (a live 2-account probe already covers the same table/policy family for siblings), which
  is why this is Medium and not High. **Medium.**
  `bugs/2026-08-12-app-workouts-ownership-anchor-inconsistency.md`
- Verified clean, exhaustively: every other write in the file correctly anchors and checks rowcount; no
  PII in logs; no storage/signed-URL issues; no timer leaks; no modal-stacking issues (this file uses
  `mountModal()` consistently); the template-cloning rule matches data-model.md exactly; the cardio/interval
  Continuity-block item matches exactly.

### app-core.js — descriptive only (no direct bugs filed, high-leverage design note)

- `dbq()`'s own error-handling has no PII-redaction of any kind — the "no PII in logs" discipline is
  entirely on the caller, not structurally enforced. Several of app-core.js's own `db.from()` calls
  silently swallow errors too (341, 380-383, 418, 423, 650) — including the pair that decides whether the
  Client/Personal view-switcher renders at all (380-383). **Descriptive/design-level — the low repo-wide
  `dbq()` adoption (§5) traces directly back to this file**, but no single bug row captures "the wrapper's
  own author doesn't dogfood it" cleanly; treat §5's finding as the actionable item.
- Verified clean: `_getCurrentClientId()` is the correct, canonical solo-safe fix and is the reason
  solo-mode bugs keep appearing in *consumers*, never here; `mountModal()` itself is correctly implemented.

### starter-content.js — clean

No findings. Every insert self-anchors, solo seeding is correct, no dead code, exercise count matches docs
exactly.

## 7. Documentation-vs-code disagreements

Pulled into one place from every module's Angle D findings, so a new developer doesn't have to hunt
module-by-module for "the docs lied here."

| Doc claim | Location | Verdict |
|---|---|---|
| Self-signup page exists ("I'm training for myself → role: solo") | blueprint.md | **Stale** — removed 2026-07-24, no self-serve solo signup exists |
| Canonical modal pattern = `createElement`→`appendChild`, no mention of `mountModal()` | STATUS.md Continuity block | **Stale** — `mountModal()` superseded this after a 2026-07-04 incident; 2 files never got the memo (§5, §6) |
| `saveEditGoal` still unanchored (2026-08-02 note) | STATUS.md prose | **Stale** — fixed since; but 3 siblings + 1 new sibling are still genuinely open (§6) |
| `_runner`'s documented shape (~10 fields) | STATUS.md Continuity block | **Stale/incomplete** — actual object carries ~25+ fields once runtime-added state is counted |
| Exercise-shape doc omits `metricType`/`exerciseId`/`restSecs`/`supersetGroup`/`tableRows`/`phases` | STATUS.md Continuity block | **Stale** — these fields are load-bearing for the ②a/②b/②c metric-type dispatch that dominates app-runner.js |
| `s.amrap → AMRAP mode` is live | STATUS.md Continuity block | **Cannot verify from app-runner.js alone** — zero matches for `amrap`/`AMRAP` in that file |
| "Save functions own no navigation... deferred to the caller" | STATUS.md Continuity block | **Contradicted** — `saveRunnerSession`/`saveWorkoutSession` both navigate internally |
| `workout_logs` row created "right after session starts" | data-model.md's runner-flow diagram | **Stale** — the row is only created at save time; the runner is explicitly localStorage-only until then, by the file's own header comment |
| "Save estimated 1RM" marked dashed/planned/not built | data-model.md's runner-flow diagram | **Stale** — fully shipped (`showPostSessionOneRMModal` et al.) |
| Template ownership: 2-state model (`program_id`/`client_id`) | data-model.md, STATUS.md | **Incomplete** — a genuine 3rd state exists (`generated_from_phase_id`-only rows) and is depended on by `app-programs.js` |
| "No auto-renaming" of cloned templates | data-model.md | **Incomplete** — periodization week-clones ARE auto-renamed (`— W{n}`), an intentional, undocumented carve-out |
| `EVENT_COLOURS`/`calendarYear`/`calendarMonth` live in app-clients.js per CLAUDE.md's module boundaries | CLAUDE.md | **Contradicted** — these are defined in `app-clients.js` but consumed exclusively by `app-calendar-goals.js`; an undocumented load-order dependency |
| `[[project-coachapp-architecture]]` link | data-model.md (×2) | **Broken** — no such file exists anywhere in the Vault; this document is a candidate to fill that gap (follow-up, not done here) |

Everything else cross-checked (units-toggle convention, week-tabs display model, cardio/interval
metric-type merge, cloning rule's 2-state core, solo dashboard's intentional missing check-in card) matched
the documentation exactly — noted per-module in §6 as "verified clean," not repeated here.

## 8. Known-vs-newly-found reconciliation

| Finding | Status |
|---|---|
| `workout_template_exercises` writes carry no app-level ownership anchor | Already tracked — `bugs/2026-08-01-workout-template-exercises-writes-carry-no-app-level-ownersh.md` (confirmed safe via live probe) |
| `goal_milestones`/`saveGoalProgress` unanchored | Previously noted in STATUS.md prose (2026-08-02) but **never actually filed** — refiled this pass with a corrected, current finding list |
| `save1RM`/`delete1RM`/`savePerformanceLog`/etc. unanchored | **New** — filed |
| `saveClientPB`/`saveClientCheckIn`/`saveClientWeight` zero anchor | **New** — filed |
| Stored-XSS recurrence (5 files) | **New** — filed (5th+ instance of an already-4x-recurred class) |
| `mountModal()` not adopted in 2 files | **New** — filed |
| Dashboard silent query-error swallowing | **New** — filed |
| `app-programs.js` phase-writes systemic gap | **New** — filed |
| `app-workouts.js` ownership-anchor inconsistency | **New** — filed |
| `app-progress.js` chart leak + silent deletes | **New** — filed |
| 2 dead functions post-wizard-deletion | **New** — filed |
| Every documentation staleness item in §7 | **New**, descriptive only — not filed as bugs, listed here and in STATUS.md's known-gaps pointer |

**10 new `bugs/*.md` files filed this pass** (7 High, 2 Medium, 1 Low), plus one corrected re-filing of a
previously-noted-but-never-tracked item.

## 9. Recurring bug-class scorecard

Against CRITICAL.md's incident timeline — the 5 classes that have already burned this project:

| Class | Prior incident(s) | Fresh instances found this pass |
|---|---|---|
| Incomplete RLS verb / app-level anchor coverage | 2026-07-01 (solo RLS gap) | **9 groups of findings** across 6 files (§6) — the dominant finding class of this entire audit |
| Storage bucket policy scoped too loosely | 2026-07-12 (progress-photos leak) | None found — the feature was removed same-day as that incident and no other storage usage exists outside app-progress.js's branding upload, which correctly uses signed URLs |
| Stored XSS via unescaped free text | 2026-07-13, -18, -23, -28 (4x) | **5th+ recurrence**, ~15 individual unescaped sites across 5 files (§6), including one confirmed regression against the specific 2026-07-18 fix |
| FK cascade/orphan gaps on delete | 2026-07-03 | 2 informational notes (app-runner.js's `deleteWorkoutLog`, app-programs.js's `deleteProgram`) — not independently confirmed broken, flagged as un-cross-referenced repetitions of the same assumption class |
| Solo `coach_id = NULL` trap | Recurred 4x total per CLAUDE.md | **None found** — every agent traced every `.eq('coach_id', …)` in their scope and found this specific bug shape absent everywhere; this appears to be the one recurring class the project has genuinely closed out |

## 10. If I were the next developer — do these first

1. **Build the two missing ownership-anchor helpers** — `_verifyClientOwnership(clientId, coachId)` for
   the client-scoped tables (app-progress.js/app-runner.js's 8 sites) and `_verifyProgramOwnership`/
   `_verifyPhaseOwnership` for app-programs.js's ~20+ sites. This single piece of work closes the two
   largest findings in the entire audit and establishes the pattern `_verifyTemplateOwnership` already
   proved out in app-workouts.js.
2. **Add `_verifyOwnClientId(clientId)` to `saveClientPB`/`saveClientCheckIn`/`saveClientWeight`** — the
   one finding with literally zero anchor of any kind, on the exact table family with prior incident
   history.
3. **Do the escaping sweep, one more time** — 5th+ recurrence of the same bug class means catching each
   instance individually during unrelated feature work isn't working; a one-time repo-wide grep for
   unescaped free-text interpolation (see the filed bug's suggested grep pattern) closes ~15 sites at once.
4. **Route `app-clients.js` and `app-calendar-goals.js`'s 7 modal-creators through `mountModal()`** —
   small, mechanical fix, closes a reintroduced, previously-fixed race.
5. **Add error-checking to the 3 dashboards' 18 bulk-fetch queries** — the highest-traffic pages in the
   app currently have zero error visibility.
6. **Confirm, live, whether RLS actually backstops any of the ownership-anchor gaps above** — this audit
   is app-level code review only; a 2-account probe (the same method already used for the 2026-07-30
   `workout_logs` incident, the 2026-07-12 storage leak, and the `workout_template_exercises` confirmation)
   would upgrade every "High, unverified" finding to either "Critical, confirmed" or "Medium, confirmed
   RLS-backstopped."
7. Smaller, still worthwhile: the app-progress.js chart leak + 2 silent deletes; the app-workouts.js
   `saveExerciseToTemplate`/`moveTemplateExercise` inconsistency; the 2 dead functions in app-runner.js;
   updating STATUS.md's stale `_runner`/exercise-shape/modal-pattern documentation; adding the 3rd
   template-ownership state to data-model.md; filling `data-model.md`'s dangling `[[project-coachapp-
   architecture]]` links with this document.
8. Consider making `dbq()` the enforced path rather than an optional one — its own low adoption traces
   directly to its own definer not using it consistently (§5, §6's app-core.js note). A lint rule or a
   simple repo-wide grep-based pre-push check (`checks.sh` already has room for this class of check) would
   close the gap mechanically rather than relying on developer discipline.

## 11. Methodology appendix

**Agent assignment** (6 parallel agents, one synthesis pass by the lead session):
- Agent 1 — `app-runner.js` alone (3,227 lines)
- Agent 2 — `app-workouts.js` alone (2,754 lines)
- Agent 3 — `app-progress.js` alone (2,268 lines)
- Agent 4 — `app-programs.js` alone (2,294 lines)
- Agent 5 — `app-calendar-goals.js` + `app-dashboard.js` (1,852 lines combined)
- Agent 6 — `app-clients.js` + `app-core.js` + `starter-content.js` (1,350 lines combined)

Each agent ran all 4 angles (security/scoping, solo-mode correctness, duplicates/dead-code/render-safety/
regressions, documentation alignment) against their own scope, with `CLAUDE.md`, `blueprint.md`,
`data-model.md`, and `js/app-core.js` as fixed reference context. The synthesis pass then: spot-checked
the most severe and most novel claims directly against the live repo (5 direct code reads confirmed 3
of the highest-severity claims exactly as reported, with corrected/verified line numbers where needed);
grouped findings sharing one root-cause fix into single `bugs/*.md` files rather than one file per line
number (mirroring the existing convention set by `bugs/2026-08-01-workout-template-exercises-...md`);
reconciled severity on one rubric across all 6 agents' independent guesses; and matched every surviving
finding against the existing 134-file `bugs/` ledger and STATUS.md/roadmap.md before deciding what was
genuinely new.

**What this pass deliberately did NOT cover:**
- **No fixing.** Report-only, matching how `multi-agent-review` itself operates — fixing happens after,
  under this project's normal build gates (red-before-green tests, full suite, mobile-check, diff-mode
  multi-agent-review, then push).
- **No direct RLS/SQL policy review.** No RLS SQL is tracked in this repository, so every "relying on
  unverified RLS as sole backstop" finding in §6 is exactly that — unverified. A live 2-account behavioral
  probe (this project's own established method) is the correct next step for each, not a guess from
  reading policy SQL that doesn't exist in-repo.
- **Exhaustive verification of every single finding.** ~5 of the highest-severity/most-surprising claims
  were independently re-read and confirmed by the synthesis pass directly; the remainder rely on each
  agent's own citation discipline (every finding required a `file:line` and either a concrete failure
  scenario or a named affected caller — no vibe-checks, per the same evidence bar `multi-agent-review`
  already enforces). If something in §6 reads as surprising, the fastest way to confirm it is to open the
  cited line — that's true of every finding in this document by design.
- **CSS/`css/main.css`, Playwright test-file quality, SQL migration scripts, or the Supabase Edge
  Function** — out of scope for this pass, which was JS-module-focused per the confirmed plan.
