# CoachApp Roadmap
_Last updated: 2026-09-08._

> Session narratives belong in `LOG.md`. This masthead carried a write-up of the 2026-08-14 session
> until OS v3; that session has a `## 2026-08-14` entry in `LOG.md`, so it was removed rather than
> kept in two places. `os-lint`'s `masthead-drift` check now fails if this date falls behind the
> newest dated content in this file.
---

## 🎨 Design system — ✅ Stages 1-3 DONE 2026-08-23 (`857c5e1`); Stage 4 (brand) awaits Jake

Jake, 2026-08-22: *"we also need to scope the platform for consistency in regards to font, font size,
field size etc, as soon we will need to think about branding."* Full audit in
`design-system-scope-2026-08-22.md` — every figure re-runnable from the appendix there.

**The finding: branding is a token swap, but only where tokens exist.** Colour has them (801 `var()`
vs 176 stray hex). Typography and spacing have **none** — 25 distinct font sizes including 10.5/11.5/
12.5/13.5px, which are nudges rather than decisions.

**Already healthy, leave alone:** font-family (ONE declaration app-wide), and form fields — 97 of 142
`<input>` use `.field-input`. "Field size" is the best-behaved part of the platform, not the worst.

**Drifting:** 1,317 inline `style=` vs 1,176 `class=`, concentrated in app-runner (4.1:1), app-progress
and app-dashboard. Radius drifts to 18 distinct values *despite* `--radius` existing — proof that
adding tokens without a ratchet does not hold. 12 explicit `44px` touch targets in a phone-first gym app.

- ✅ **Stage 1 — vocabulary** (`62efa9a`, css v10) (type/space/control tokens in `main.css`). Additive, no visual
  change, near-zero risk.
- ✅ **Stage 2 — ratchet** (`48f704d`+`37ea1c3`+`a342d46`, checks.sh rule 3b + style-count.sh) (`checks.sh` rule refusing NEW off-scale font-size/radius, grandfathering
  existing sites). Without this, stage 3 rots back; the radius tokens are the evidence.
- ✅ **Stage 3 — converted, 1,027 → 256 literals** (`17c3d99`..`80634c1`) (runner → progress → dashboard), one commit and
  one cache-bust each. Explicitly NOT a big-bang restyle.
- 🗓 **Stage 4 — brand** — NOW UNBLOCKED. Edit the `:root` block., once the vocabulary exists.

**Needs Jake before stage 1:** is Inter the brand typeface or a placeholder; how dense should the runner
be (its inline-style outlier status may be correct for a gym screen); and is there a brand direction to
set token values against, or do they get neutral values now?

---

> **🗄 23 session-backlog sections (2026-07-10 → 2026-08-20) were REMOVED on 2026-08-25.**
>
> **STANDING RULE from 2026-08-27: keep the 3 most recent dates, plus 2026-07-05 and
> 2026-07-08** (six live cross-references in the feature tables point into those two by “Area N #M”).
> Prune the rest as part of each `/save`. Measured: one save adds ~4.5k here, and `context-budget`’s
> 2% tolerance is ~3.4k — so WITHOUT this rule the check goes red every single save, which is how a
> useful gate gets switched off. Pruning the oldest at the same time keeps the file flat instead.
> They were 68,027 chars — **47% of this file** — and every one was 100% closed rows duplicating
> `LOG.md`, which carries a `## <date>` entry for each. Verified before deletion: every pruned date
> resolves to a LOG entry, zero pruned section held an open/planned row, and no surviving
> cross-reference points into one.
>
> **Kept deliberately:** the 3 most recent (working context), plus **2026-07-05 and 2026-07-08** —
> six live cross-references in the feature tables below point into those two by “Area N #M”, and
> deleting them would have broken every one. Enumerate a container’s children before removing it.
>
> **This file is a ROADMAP.** Session history belongs in `LOG.md`. `os-lint`’s `context-budget` now
> ratchets down on what is left, so this saving cannot quietly regrow the way the last two did.

## 🛠 Session backlog — 2026-09-07/08 — UX cleanup pass: runner + builder + progress shipped (3 of 4 areas)

Jake: *"the app feels slightly clunky to me in places. I want to improve the UI and UX of certain areas."*
→ `/superpowers:brainstorming` → walked the 4 areas he picked (runner, programs builder, progress, dashboards)
at phone width in a served HTML board he ticked selections on → 16-item design, `docs/superpowers/specs/2026-09-07-ux-cleanup-design.md`.
**D1 (solo↔client dashboard convergence) deferred to its own session** — it's a structural piece the vault
already flags as such. 9 flow-item forks resolved with Jake in-session via AskUserQuestion.

| Area | Commit | Status |
|---|---|---|
| Runner R1–R5 | `1598622`+`885fb0f` (app-runner v85→87) | ✅ Pushed (`7de8546`), CI green. Not tagged/live. |
| Builder B1–B5 | `6190ab1`+`8bcbb92` (app-programs v53→54, app-core v27→28, css v12→14) | ✅ Pushed, CI green. Not tagged/live. |
| Progress P1–P4 | `253398e` (app-progress v58→59, css v14→15) | ✅ Local only. checks.sh green, 3-agent review clean. |
| Dashboards D2–D4 | — | ⬜ NOT started — awaits Jake's go |

**Per commit:** tokenised (style literals fell — app-runner 62→58, app-progress 76→67, baselines lowered),
`checks.sh` green, `/feature-audit` + `/mobile-check` run, a fresh 3-agent `multi-agent-review` (diff mode) —
**every review came back clean**; the only finding across all three (a `:has()` selector scoped too
narrowly to catch body-level modals) was fixed in `8bcbb92`.

**What shipped, plainly:**
- **Runner:** the set-complete tick was an invisible transparent glyph → now visible + the current set's
  row is accent-highlighted; the pre-first-set footer was dead text → now a tappable "Log a set to
  continue" that jumps you into the first field; empty kg/reps fields hint the unit not "—"; swap/add are
  real 44px buttons.
- **Builder:** the 5-button program header → one primary + a "⋯ Manage" menu; desktop day grid is 7-across
  (was 5+2); empty days lose the heavy card; the ⚙ is now labelled "⚙ Units"; the periodization slab → a
  header chip + compact buttons. Bonus fix: the mobile view-switcher pill no longer floats over any open
  modal's content.
- **Progress:** the Performance tab was 3 stacked pill rows + search → 1 toolbar row (range is a `<select>`
  now) + search; pill rows scroll sideways instead of wrapping 2+2; Body Weight leads with the data, goals
  collapse to a one-liner; the 1RM list is ~half the height — date/estimate hide until you tap a value.

**Not done / next:**
- **Dashboards D2–D4** (the pass's last commit): D2 solo bottom-nav → 5 items + a "More" sheet
  (Dashboard/Workouts/Programs/Progress + More→Library/Calendar/Settings); D3 filter 0-exercise sessions
  out of the client dashboard's "recent"; D4 PT stat tiles 3-across on mobile (was 2+1).
- **Release** — nothing is live. When the pass is complete (or Jake wants 1–3 out now), cut
  `v2026.09.3` via `scripts/release.mjs` — needs a full `npm test` pass + release notes first.

**Style-density note:** Stage 3 of the design-system work (roadmap §Design system) converted ~1,027→256
inline style literals; this pass trimmed another ~15 from app-runner + app-progress as a side effect of
the token cleanup. app-runner and app-progress are still the two densest modules.

## 🛠 Session backlog — 2026-09-06 (session 2) — os-lint drained 5 RED to 2; a 44-day live security hole closed; weekly review ran

**Shipped earlier the same day:** `v2026.09.2` (tag `67380b1`). **No app code changed in this second
half of the session.**

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | **Public self-signup was still ENABLED on live** | ✅ Closed 2026-09-06 | 44 days. The 2026-07-24 fix removed the form *because* `db.auth.signUp` is callable from devtools, and said a dashboard toggle was still needed — never flipped. Probed (`disable_signup:false`), Jake flipped it, re-probed `true`. Admin invite path proven unaffected end-to-end. |
| 2 | **`os-lint`: 5 RED to 2 RED** | ✅ Done | `self-test` (39/39 checks bite, nothing decorative), `doc-obligations` (paid 3x — it re-fired correctly each time a tracked-class bug was filed), `full-file-review`. |
| 3 | **Weekly full-file review** | ✅ Ran 2026-09-06, marker updated | Scope `app-programs.js` + `app-core.js` (4,012 lines), 3 pinned angles + verifier. First attempt killed mid-read by a rate limit; marker deliberately left RED until the re-run finished. |
| 4 | 8th instance of the unescaped-render class | 🐛 Bug (open, high) | `app-programs.js:1744`. **`check-escaping.mjs` exits 0 over it** — the blind spot matters more than the site. Fix order: checker RED first, then escape. |
| 5 | Solo users can create an undeletable orphan programme | 🐛 Bug (open, high) | Reachable today on 4 of 9 live accounts. The mirror gate already argues the case; only the inbound direction was ever fixed. |
| 6 | 3 MEDIUM rows from the review | 🐛 Bugs (open) | Unverified slot ids from a stale-able global; 4th fan-out missing `_propagationTargets`; a toast clobbering the message its twin exists to preserve. |
| 7 | 2 rows from the mechanical sweep | 🐛 Bugs (open) | GDPR export can ship an incomplete bundle silently; the role self-heal block is inert **and** would misclassify solo (measured unreachable — filed, deliberately not fixed). |

**Measured, worth keeping:**
- **`closure-candidates` converts leads to closures at ~1 in 18.** 17 of 18 were dismissals, and most
  say "awaiting Jake" in their own text. It nonetheless earned its keep by routing attention to the
  signup row. Keep at WARN; never give it teeth.
- **45 `value=` interpolation sites with no escaper, exactly 1 exploitable.** The 2 look-alikes are
  named in the bug row so they are not re-derived later.
- **20 of 29 open rows state no closure condition**, exactly what
  `2026-08-29-most-open-rows-never-say-what-would-close-them` predicted.

**Deliberately NOT done:**
- **The two backlogs.** 29 stale rows, 65 ungraded predictions — both need Jake.
- **Fixing any of the 7 new bug rows.** Session was scoped to os-lint remediation and the review; the
  escaping fix in particular has a required order that deserves a fresh run.

---

## 🛠 Session backlog — 2026-08-28 — live double-press bug fixed; STATUS cut 30%; the OS question answered honestly

| # | Item | Status | Detail |
|---|---|---|---|
| 1 | **Adding a workout/exercise to a live program: slow, and double-press DUPLICATES** (Jake, live) | ✅ Shipped `66003ce` | 6 commits. `guardReentry` in app-core: one shared wrapper, one try/finally, registered on 8 write paths. All 3 bespoke `_*Pending` flags deleted. Picker now paints immediately (accepts a promise for coachId; two resolution queries parallelised). Proven both ways: guard removed → 2 rows, guard in place → 1. |
| 2 | The criterion changed the member list BOTH ways | ✅ | ADDED `copyProgramToCoaching` (100-line deep copy, not confirm-gated) which the plan missed; EXCLUDED `generatePhasePeriodization` (its `confirm()` blocks the thread, so the dialog IS the barrier). |
| 3 | **STATUS.md 93,955 → 65,999** | ✅ | "What's working (verified)" was 29,017 bytes of SHIPPED history in a file whose masthead says history belongs in LOG.md. Moved verbatim. Same violation as the 38,171-char `Previous:` chain removed 3 days earlier — **same file, second instance, missed by that cleanup**. |
| 4 | `continuity-budget` ratchet added to os-lint | ✅ | Pinned at the measurement, refuses growth past 2%, fixture-safe. Deliberately NOT a semantic duplicate-detector: a trial fuzzy matcher produced weak pairings, and a check that flags correct entries gets switched off. os-lint self-test now **39/39 bite**. |
| 5 | Continuity ↔ memory duplication | 🔧 In progress | 14 of 51 continuity entries also have a memory file; the top several are near-identical. ONE collapsed to a pointer today (the ratchet forced it — adding an entry means removing one). The other ~13 need a judgement pass. |
| 6 | Two non-retrying `.count()` assertions | ✅ `91341e8` | One was a **vacuous pass** — `if (count === 0) return` with no settle-wait, so it returned having asserted nothing. Fixing it exposed a broken assertion underneath (`text=Exercises` matched 2 elements). |
| 7 | Would refactoring the OS/MD files reduce errors? | ✅ Answered: **no** | Measured: ~185 written rules vs 51 things that can refuse. **9 of my 12 errors this week had a pre-existing rule**, one of them injected into the very turn I broke it. OS v2 already tried cutting rules (33→13) and errors continued. Do the OS work for token cost (~12k/session), not for error rate. |

**Not done:** OS step 2 (make memory canonical for the remaining duplicated entries) — judgement-heavy,
needs its own pass. Sprint/release trial and the targeted platform work are both still queued.

## 🛠 Session backlog — 2026-08-26 — three of Jake’s picks: one already fixed, two real bugs shipped

| # | Item | Status | Detail |
|---|---|---|---|
| 1 | **Propagation to duplicated sessions** (2026-08-14, high, 12d open) | ✅ Not a bug — already fixed | Causes 3 and 4 re-checked: cause 3 fixed via `family_id`; **cause 4 was a FALSE PREMISE** (the Library lists only templates in NO programme, so there are no siblings to offer). Jake pushed back on being handed the verification — rightly: the two existing tests each covered HALF the scenario and nothing joined them. New end-to-end test (`a4b8739`) drives the real generator, real modal, real clicks. Row → `fixed-awaiting-jake`. |
| 2 | **Programs builder slowdown** (2026-08-07, high) | 🗓 Blocked on Jake | One question outstanding: was the cardio edit that did not save on the **programme slot preview** or the **template editor**? The row bundles two symptoms; guessing cost two wasted rounds on a similar row (les-069). |
| 3 | **1RM 0.5kg shift** (2026-07-09, high, 48d) | 🐛 Still open — two OTHER bugs found and fixed | Live repro done as the row demanded. Both prior investigations traced the wrong writer (`save1RM`; there are five). Found + fixed a real lb display round-trip corruption (`d320220`) — but it is bounded at ~0.023 kg and **cannot** produce 199.5, so the row stays open. Only `step="0.5"` + a deliberate keypress yields exactly 0.5. |
| 4 | **Phase 1 of the normalization work** | ✅ Done `52923dd` | Every `client_1rms` writer persists `exercise_id`. THREE offenders, not the two the ledger row claimed. Pure refactor — no migration. |
| 5 | Weight round-trip class | ✅ Done `d320220` | 7 sites, one shared helper. Enumerated as 5; my own class guard caught the 2 I missed. |
| 6 | E2E specs strand `[E2E]` rows on the live coach account | 🐛 Bug (open) | 14 client rows + 12 1RM rows. Cleanup EXISTS and outnumbers creation (23 deletes vs 16 creates) — so it is not running, not missing. |
| 7 | Test flakiness | 🐛 Bug (open, worse than filed) | Now **three** files, not two. Runs 1 and 2 were byte-identical code with different outcomes. |

**Decided:** the `exercise_name`/`exercise_id` pair is **not** a BCNF violation — exercises can be
deleted, so the name is a historical snapshot. Phase 1 (write the id) is a pure refactor and shipped;
the migration half (drop the name) is **explicitly not being done** and would destroy data.

**Blocked on Jake:** one read-only SQL query would decide whether a backfill is even possible — how
many `client_1rms` rows have a null `exercise_id` AND a name matching no `exercises` row.

## 🔴 GDPR — BLOCKS INVITING ANY NEW USER (found 2026-08-11 by /deploy-check)

**Does not block deploying code.** Two different gates: "is this code safe to ship" (yes) and "are we
lawful for a new data subject" (no). Do not conflate them.

> ### ⚠️ THIS SECTION'S PREMISE WAS WRONG FOR 13 DAYS — corrected 2026-08-24 (OS v3)
>
> It said the app has *"no privacy policy at all"* and made *"write the privacy policy"* the long pole,
> **Jake's to write or approve**. Verified false by direct check:
>
> - **`privacy-policy.html` EXISTS** — 7,679 bytes, in the repo since **2026-06-29**, served from the
>   live Pages site. Read it: 11 sections (who we are · what data · legal basis · where stored · who we
>   share with · how long · your UK GDPR rights · cookies · security · changes · contact), naming
>   special-category data, `eu-west-1`, erasure and the controller.
> - **It is linked from nowhere.** `grep -rn "privacy-policy" js/ index.html` returns **zero** hits.
> - The checkbox and the link both existed once and were removed by **`57a188a` (2026-07-24)** along
>   with the public signup form they sat on.
>
> The ledger row's `status_detail` recorded this correction on 2026-08-19 and **this document never
> picked it up** — so planning kept reading a weeks-long legal task that is really an afternoon of code.
> **Nothing here is blocked on Jake writing a document.**

**Status 2026-08-25: SHIPPED AND LIVE** (`a6af110`, verified on the Pages URL: core v18 carried the
gate, `privacy-policy.html` returns 200). The migration is applied and verified in Supabase. `CRITICAL.md` classes this app as handling UK GDPR
**special-category (health) data**, and a real outside beta tester was onboarded 2026-08-09 under the
gap — live, not hypothetical.

Already in place beforehand: **the policy page itself**, the Settings "Data & privacy" card,
`downloadMyData()` (full export bundle), `deleteAccount()` → `delete_current_user`, and EU storage.

1. ✅ **Write the privacy policy** — DONE since 2026-06-29 (`privacy-policy.html`).
2. ✅ **Host it** — DONE; served from the Pages site.
3. ✅ **Link it** — SHIPPED 2026-08-24. Settings "Data & privacy" card + the invite form.
   `grep -rn "privacy-policy" js/ index.html` went 0 → 8.
4. ✅ **Consent checkbox on `#invite-form`** — SHIPPED, with a JS guard that refuses even when the
   `required` attribute is stripped, and a write that asserts on the returned row (a policy-refused
   upsert returns `{ data: [], error: null }`).
5. ✅ **Retroactive consent — SOLVED BY MECHANISM, no longer a chase.** The pre-push review proved
   the checkbox covered only ONE of three routes to an active account: `#new-password-form` (the
   recovery link, which is how the 2026-08-09 tester was actually recovered) and directly-provisioned
   coach accounts were both ungated, and nothing read `consented_at` back, so nobody was ever
   prompted. A **read-side gate** in `showApp()` now blocks the app for ANY role whose consent is
   missing or whose stored version is superseded. Every existing account — 4 real ones as of
   2026-08-24, including Jake's — is prompted on next login. Nobody needs chasing.
   Its consent read is a **separate query that fails open**: folding the columns into
   `loadUserInfo`'s select would error pre-migration → null `currentProfile` → `showApp`'s fail-closed
   branch → total lockout for every user. Two bypasses (browser Back via `navigate()`'s blanket
   overlay clear; the "View as" switcher) were found by the same review and closed.
6. 🗓 **Verify `delete_current_user` exists in the DB** — the only remaining item. The call site is
   there but cannot be tested without destroying a real account. SQL in the ledger file. **Needs Jake.**
7. ✅ **The version coupling is now ENFORCED — added 2026-08-25.** Steps 3-5 all hinge on
   `PRIVACY_POLICY_VERSION` matching the date printed in `privacy-policy.html`: `_needsConsent()`
   re-prompts ONLY on a mismatch. That invariant lived in a source COMMENT, so editing the policy text
   without bumping the constant would have left every user consented to a document they never saw,
   with no error and no user-visible symptom — the consent gate would simply stop firing.
   `checks.sh` rule 9e (`scripts/check-policy-version.mjs`, 8-case self-test incl. a live-plumbing
   case) now BLOCKS such a push. Measured first: zero violations on a clean tree, so it is a pure
   ratchet. **Local only as of 2026-08-25 — not yet pushed.**

**Migration applied 2026-08-24** (`scripts/add-consent-2026-08-24.sql`): two nullable columns on
`profiles`, plus a stamp for the 3 E2E fixture accounts so the gate does not block the suite. Verified
by SELECT — all 3 rows carry a timestamp and version `2026-06-29`. Real accounts deliberately NOT
stamped. `profiles` RLS confirmed as two policies covering INSERT/UPDATE/SELECT on `id = auth.uid()`.

Ledger: `bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md` — priority `critical`,
status **`deferred` by Jake 2026-08-19** (the ledger is authoritative; only Jake may change it).
Worth revisiting now that 5 of its 6 steps are built.

## 🗓 Solo/signup — data model done, onboarding path now built (2026-08-09), open PUBLIC signup still deferred

Jake's own decomposition during brainstorming: the data model (done, see below) and public signup/onboarding
for new solo accounts (a real, larger future need — "some users will sign up... and will not have a link to
a coach or PT") are two separate subsystems. **Update 2026-08-09**: the "no UI path to create a solo account
without Jake running SQL by hand" half of this gap is now closed — Jake needed to onboard a beta-testing
friend, first tried a local script (too convoluted, wouldn't scale for repeated use), then an in-app
"Invite a personal user" Settings card + a new `invite-solo-user` Edge Function, gated to Jake's own account
only. Deployed live, verified end to end (real invite sent, `role='solo'`, self-referential `clients` row
confirmed). **Still NOT built, still a deliberate deferral**: genuine OPEN public signup (anyone with the
URL self-provisioning a solo account with no gate) — `handle_new_user` still hard-codes `role='coach'` for
every raw signup, and self-signup itself is still removed client-side (2026-07-24 incident). The new
mechanism is invite-only, triggered by Jake per person, not a public form — that remains its own future
decision if/when Jake wants genuinely open solo signup, not something this session's work should be read as
having quietly shipped.

## 🔴 Security follow-up needed — 2026-07-30

The `workout_logs` RLS fix (STATUS.md ledger, confirmed) only covered `workout_logs` itself. Flagged but not
independently probed this session: `workout_log_exercises`/`workout_log_sets` (reasoned as safe — they
anchor via the parent `workout_logs.coach_id`, which is now correctly anchored — but not behaviourally
tested the way `workout_logs` itself was). Also still open, same "unanchored write" shape, lower priority
(UPDATE not DELETE): `saveGoalProgress`, `saveEditGoal`, `toggleMilestone`, `toggleClientMilestone`
(js/app-calendar-goals.js). Worth a dedicated session folding into the existing "PT/Personal boundary audit
across EVERY remaining table" backlog item (STATUS.md, open since 2026-07-13) rather than another one-off.

---

## 🚨 Beta blocker surfaced 2026-07-11 — a new coach signs up to a COMPLETELY EMPTY app

**Status: 🗓 Needs scoping. Highest beta risk identified so far.**

Verified in code: `signUp` (app-core.js:332) creates the auth user, and the `handle_new_user` trigger creates **only** the `profiles` row (deliberately — the les-006 fix). There is **no starter data of any kind**. A brand-new PT lands on:

- **0 exercises** ← the hard blocker: you cannot build a workout without them, and the only route is typing each one in by hand
- 0 templates · 0 programs · 0 clients

**Jake has never experienced this.** His account has 200+ exercises accumulated over months of building. The app is excellent *once populated* and close to unusable *before* — and every beta PT starts at zero. A beta user's first session is data entry, not coaching.

**Scope (needs a decision):** ship a default exercise library on coach signup — how many, which ones, editable/deletable, and whether a sample template/programme comes with it (the "copy-paste simplicity + sensible default" product principle already in [[project-coachapp]] argues yes). Consider whether the existing `scripts/seed-test-data.js` exercise list is the starting point.

### Raised 2026-07-11, logged but NOT prioritised (Jake's explicit call — recorded so they aren't lost)

| Item | Why it may bite | Status |
|---|---|---|
| **Error monitoring / crash reporting** | `log.error` only reaches the *user's own* browser console. A beta PT hits a crash and Jake never finds out. The 2026-07-10 empty-phase crash was caught only because Jake personally hit it. Without this, the beta teaches you little about what's actually breaking. | Raised, deprioritised |
| **Backup / restore posture** | The 2026-07-11 data-loss bug destroyed real workouts. If that had hit a beta user, could they be restored? Supabase free-tier PITR is limited. Worth knowing the answer *before* strangers have data in there. | Raised, deprioritised |
| **Beta ops — feedback channel + invite email deliverability** | No in-app route for a beta PT to report a problem. And the invite Edge Function has only ever mailed Jake's own addresses — spam-folder risk untested, and a client who never receives their invite is a dead beta account. | Raised, deprioritised |
| **`max_rows = 200` cap** | Set during DB security hardening. A coach with >200 clients/templates/exercises silently truncates — this already bit once (Workouts page needed an explicit `.limit(100)`). | Known, unscoped |

---

## How to read this

Each feature has a **status tag**: `✅ Done` / `🔧 In progress` / `🗓 Planned` / `💡 Future consideration` / `🐛 Bug`
Features inside a section are in priority order. Update status tags during each `/save`.

---

## 🐛 Session backlog — 2026-07-08 (mid-session live-test report, session 22 3rd follow-up)

_Jake reported 6 more items while the Workouts-polish build (hero card + session-history rename) was in progress. Priority order below reflects severity, not report order._

| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 1 | **BUG (data leak)** — PT-facing Workouts page showed workouts linked to the personal/solo account | **🔴 Critical** | **✅ Fixed, pushed this session** | Root cause confirmed: `renderWorkoutTemplates` (app-workouts.js) and `renderClientWorkoutsPage`'s flat-list fallback both filtered `.is('client_id', null).is('program_id', null)` but not `.is('generated_from_phase_id', null)` — periodization-generated week clones (e.g. "Bench Press — W2") have client_id/program_id both null too, so they leaked into the flat Templates list. Since solo shares `coach_id` with the PT account, Jake's own solo-program week-clones were cluttering his professional templates list. Not a cross-account RLS leak (coach_id scoping was intact throughout) — a query-completeness bug. Fixed by adding the missing filter, matching the pattern already used correctly elsewhere (`app-programs.js:589`, the phase day-slot assign picker). New Playwright regression test added. **Related, not fixed:** `startWorkoutRunner`'s freeform template list (app-workouts.js, when no specific templateId given) has no client_id/program_id/generated_from_phase_id filtering at all — same bug class, lower urgency since it's a template-picker list not a primary nav page; needs its own check. |
| 2 | **BUG** — Personal > Workouts page not loading | **🔴 High** | **✅ Fixed — was self-inflicted** | Caused by an in-progress hero-card edit (this session's own Workouts-polish build) left mid-flight by a session restart — `app-workouts.js` was calling two not-yet-defined functions. Completed the edit; confirmed via full Playwright suite. |
| 3 | **BUG** — "Log weight" button does nothing | **🟠 High** | **✅ Fixed, pushed this session** | Same shape as the "Log PB" bug fixed earlier this session: `showClientWeightForm()` toggled a DOM node (`client-weight-form`) that existed on the Dashboard pages, never on the Progress page's Body Weight tab it's actually clicked from. Added the form to `renderProgressWeight`; fixed `saveClientWeight`'s refresh target to detect Progress page vs. either dashboard (was unconditionally calling `renderClientDashboard`, which was also wrong for a solo user saving from their own dashboard's copy of this same form — same bug class fixed for `saveClientPB` earlier). |
| 4 | **BUG?** — Starting weight still doesn't populate in the weight logger | **🟠 High** | **Code confirmed correct — needs Jake's live re-check** | Re-verified the exact fix from earlier this session (`effectiveStarting = startingWeightKg ?? first.weight_kg`, `renderProgressWeight` app-progress.js) is intact and correct — no regression found. Three possible explanations for the continued report, in order of likelihood: (a) browser cache — testing before the `app-progress.js?v=7` deploy propagated; (b) testing on the PT-facing client-profile Weight tab (`renderClientWeight`), which has never had a "Starting" stat tile at all (only Current/Change/Entries) — only the client/solo self-view tab has one; (c) a genuinely different code path not yet found. Needs Jake to confirm which page he's testing on and do a hard refresh before this is investigated further — per the systematic-debugging rule, don't guess a second fix without new information. |
| 5 | Runner should round %1RM-calculated target weights down to the nearest 2.5kg | 🟡 Medium | **✅ Done 2026-07-10** | Turned out there's only one shared function (`_calcWeightFromPct`) behind every %1RM display site, so "round every displayed target" and "round the pre-fill" were the same code change, not two options as originally framed. Now floors to nearest 2.5kg. app-runner v18. |
| 6 | Plate calculator | 🟢 Low | **✅ Done 2026-07-10 → ❌ REMOVED 2026-07-11** | Shipped, then removed 8 days later at Jake's request after real gym use ("Remove plate calculator") — it was noise, not help. See Runner features table below. |

---

## 🐛 Session backlog — 2026-07-08 (Solo-account live-test pass, session 22)

_Jake sent a 12-item list of things noticed while using his own solo/personal account. Grouped by area, same convention as the 2026-07-05 backlog below. File:line refs were confirmed via 3 read-only Explore-agent passes over the actual code — "Confirmed" = root cause verified in code; "Needs live repro" = static reading couldn't confirm; "Needs scoping" = a real, currently-nonexistent feature needing a design conversation before building. **Same-day follow-up:** 3 confirmed bugs (#4, #7 bug half, #9) were fixed and pushed; the Cardio-blank report (#8) closed with no code needed; and every remaining "needs scoping" item except #11 was resolved via a dedicated scoping round (6 decisions via AskUserQuestion) — see each row's Status column._

### Area 1 — Programs
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 1 | Program overview panel (collapsible: phase name, progression structure, sessions/week, phase notes) + edit name/description/duration | Medium | **Ready to build — scoped 2026-07-08** | **Decided:** duration is display-only (shown as the existing sum of phase durations) — no new edit capability, since name/description already work (`showEditProgramModal`/`saveProgram`, app-programs.js:722-761) and editing total duration directly would require auto-resizing phases with no clear rule for which one absorbs the change. Build: extend the existing periodization badge (app-programs.js:644-650) into a full per-phase summary; new `program_phases.notes` column (text, nullable — none exists today); derive sessions/week from `program_phase_workouts`. |
| 2 | Linear periodization: let the user enter a bespoke % per week (set phase duration, then one %-field per week) instead of the current Start%→End% formula | Medium | **Ready to build — scoped 2026-07-08** | **Decided:** new `periodization_type = 'custom'` value alongside `linear`/`undulating` — existing Linear (`{startPct,endPct}`, app-programs.js:979-988) stays untouched, no migration needed. New config shape `{ weekPcts: [...] }`, one entry per week. `_computePeriodizedPct` (app-programs.js:1115-1122) gets a new `'custom'` branch indexing `weekPcts[week-1]`. Configure modal renders N `%` inputs when `'custom'` is selected, N driven by `duration_weeks`. |
| 3 | "Delete week" button on a phase | Medium | **✅ Done 2026-07-10** | Built as scoped: renumbers weeks after the deleted one down by 1, decrements `duration_weeks`, same 4-step cleanup pattern as `_cleanupPhaseWeeksBeyond` filtered to one week. Multi-agent review caught a real gap before push — the ownership check alone wasn't enough because `duplicatePhaseWeek` shares `template_id` across weeks until forked-on-edit, so deleting one week could destroy a template a sibling week's surviving row still needed. Fixed with an extra "is this template still referenced by any surviving row" check; dedicated regression test added. app-programs v14. |

### Area 2 — Workouts
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 4 | **BUG** — editing a workout from the flat Workouts list (not via a Program phase) and saving throws an error | **High** | **✅ Defensive fix pushed 2026-07-08 (6d8c6a8)** — root-cause confirmation still open | `saveEditTemplate`/`deleteTemplate` (app-workouts.js) hardcoded `.eq('coach_id', currentUser.id)`; new `_resolveTemplateOwnerCoachId()` helper makes this role-aware (matching `startWorkoutRunner`'s established pattern), same as the read side already did. **Honest caveat:** on deeper trace, both reachable roles (solo, coach) already resolved to a matching coach_id before this fix — the original "asymmetric filter" hypothesis didn't fully hold up. The fix is a real hardening, not confirmed to be THE exact bug Jake hit. If it recurs, need his exact repro (program-assigned session vs. flat standalone list; the exact error text). |
| 5 | Hero card on the Workouts page — program name, phase/week, "next up", Start button — to cut clicks to start a workout | Medium | **✅ Shipped this session** | Built as `_buildWorkoutsHero`/`_renderWorkoutsHeroHtml` (app-workouts.js) — standalone functions, not shared with the dashboards' own inline hero logic (deliberate: avoids touching two already-working renders for a pure dedup benefit). Extended one step further than the dashboards' own hero: resolves the actual next scheduled session's `templateId` (first `program_phase_workouts` row in the current phase/week) so the Start button launches it directly instead of just linking back to this page. |
| 6 | Rename "Session history" → "Recent sessions", cap to last 5, date only | Low | **✅ Shipped this session** | Applied to both sites: `renderClientWorkoutsPage` and the PT client-profile's `renderClientWorkouts` — label changed, `.slice(0, 5)` added, rows simplified to date-only (dropped workout name/exercise count per Jake's exact spec). |

### Area 3 — Progress & Performance
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 7 | **BUG + redesign** — Body Weight: entered a starting weight but the graph didn't reshape; tiles should read Start → Current → Difference; add a dynamic "past 7 days" grid + collapsible month-sorted historic entries | **High** | **✅ Bug half pushed 2026-07-08 (6d8c6a8)** — redesign half still open | Fixed: "Starting" tile now prefers `starting_weight_kg` over the earliest `weight_logs` row; tile order is now Start→Current→Change; Y-axis clamp now activates with *either* starting or goal weight set (blended with actual logged range), not requiring both. **Still open (not built):** the dynamic "past 7 days" grid and collapsible month-sorted historic entries — that redesign half needs its own build, no scoping blockers. |
| 8 | **BUG?** — Cardio section is blank | Medium | **Closed 2026-07-08 — no code change** | Jake confirmed he hasn't actually logged a cardio session yet, so there's nothing to reproduce against. `renderProgressCardio` (app-progress.js:1137-1185) is fully wired to real `distance_m`/`duration_seconds` data — the empty state is correct as-is. Re-open only if a real logged cardio session still shows blank. |
| 9 | **BUG** — "Log PB" button does nothing; should open a modal to log a strength or cardio PB (exercise, weight/reps or duration/distance/time) | **High** | **✅ Wiring fix pushed 2026-07-08 (6d8c6a8)** — full modal redesign folded into item 10 | Fixed: the button's form (previously only existing on Dashboard pages, `app-dashboard.js:532,:800`) is now also rendered on the Progress page itself (`renderProgressPBs`, app-progress.js:1198+); `saveClientPB` (app-clients.js) now refreshes whichever view is actually showing it — also fixed a real solo-mode bug where saving from the solo dashboard's own PB form used to call the wrong (client) dashboard render. The bigger "proper strength/cardio type-select modal" ask is scoped into item 10's Personal Bests restructure below, not built standalone. |
| 10 | Fold Cardio + 1RMs into Personal Bests; restructure "Performance" into a "Per session" tab (recent-vs-previous comparison, expand to a progression graph) and a "Per exercise" tab (alphabetical, collapsible, live-search like the Exercise Picker); move the Workouts-page 1RM grid into this area too | Medium/Large | **✅ v1 shipped 2026-07-08 (e600010)** — supersedes the "Personal Bests / Performance merge" item below | Personal Bests now hosts the manual PB list, 1RMs (`renderClient1RMs`), and Cardio bests (`renderProgressCardio`) as sub-sections. Performance's old "Progressions" tab replaced with "Per exercise" (alphabetical, live-search reusing the exercise-picker filter pattern) and "Per session" (net new — lists `workout_logs` most-recent-first, expand a session to compare each exercise vs. its own previous occurrence, expand further for a progression chart). Moved the Workouts-page 1RM grid here, removing its now-dead backing query. Ships to client/solo self-view only — PT-facing `renderClientPerformance` (app-progress.js:304) is a fast-follow, not yet built. A 3-agent review caught and fixed 2 real issues before push: a stale-cache race where switching Client/Personal view mid-fetch could show the wrong client's data (fixed with the same token-guard pattern as `_oneRMRefreshToken`), and the new search box leaking a fresh set of Chart.js instances on every keystroke (fixed with tracked-and-destroyed chart instances). 6 new Playwright tests, 78/78 + pre-push 39/39 green. |

### Area 4 — Cross-cutting
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 11 | Client view and solo/personal account view should be almost identical UI/UX; personal account should have zero links to any PT or client page | Medium | **Deliberately deferred to its own dedicated session — decided 2026-07-08** | Re-checked today: the solo nav (app-core.js:211-218) and the PT/Personal view-switcher gating (app-core.js:129, :244-269) already have no leaked PT/client links reachable from a true solo account — that half already holds. The real remaining gaps are unchanged from the last check: `renderSoloDashboard` (app-dashboard.js:593-836) still lacks the sudo-banner and coach-branding-banner `renderClientDashboard` has (app-dashboard.js:339-352), and keeps its own unique 4-tile stats row instead of matching the client dashboard's layout. Jake explicitly chose not to resolve this in the same round as the other items — it ripples into calendar parity + redundant 1RMs and warrants focused attention on its own, not a quick call alongside everything else. |

**Status as of 2026-07-08, end of session:** #4, #7 (bug half), #9 pushed live (6d8c6a8). #8 closed, no code needed. #10 (Performance restructure) shipped (e600010). #5/#6 (Workouts hero card + session-rename) shipped this session. #1, #2, #3 are fully scoped and ready to build — no more open questions. Only #11 remains deliberately deferred to its own dedicated session. Remaining suggested build order: #1/#2/#3 (Programs trio, can be done independently of each other) → #7's redesign half (Body Weight 7-day grid + monthly collapse). See the newer "mid-session live-test report" backlog above for 6 additional items reported this session — 3 already fixed alongside this work, 2 need Jake's live input, 1 (rounding) is a new unscoped feature request.

---

## 🐛 Session backlog — 2026-07-05 (Jake's live-test pass)

_Jake live-tested a real gym session plus the wider app end-to-end and reported 16 items in one pass. Grouped by area so we can work through one at a time — priority is within each area, not across all 16. File:line refs were confirmed via a read-only code pass: "Confirmed" = root cause verified in the code; "Needs live repro" = static reading couldn't confirm it, next session should reproduce it live first._

### Area 1 — Runner (highest priority: live-blocking + silent-wrong-data bugs)
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 1 | "Save workout" produced an error at the end of a gym session | High | ✅ Built 2026-07-05 | Root cause was (a): `dbq`'s client-lookup fired a false-positive "Save failed" toast even though a safe fallback let the save continue — fixed with `{showUserError:false}` in 3 places (`saveRunnerSession`, `saveWorkoutSession`, `showLogSessionModal`). (b) was also real — fixed 2026-07-06 with a proper rollback (delete the partial `workout_logs`/`workout_log_exercises`/`workout_log_sets` rows on failure) after a review agent found the original fix let a retry silently duplicate the session instead of just re-enabling the button. |
| 2 | Swap/Add exercise + new rest time doesn't overwrite the original | High | ✅ Built 2026-07-05 | `_confirmRunnerExerciseFromModal` now derives `restSecs` from the entered rest field for both swap and add modes. |
| 3 | Trap Bar Jump UI inconsistent with sibling exercises in the same workout | Medium | ✅ Built 2026-07-05 | Live evidence with Jake overturned the original "broad jump" regex hypothesis — actual cause was `_isPlainStrengthExercise` deliberately excluding any exercise with `intensityMin` (%1RM) set, regardless of name. Fixed by removing that exclusion (the table's target bar already computed %1RM→kg correctly). Timed/unilateral exercises still excluded by design — no change there. |
| 4 | Runner delete-set button too close to the complete-set (✓) button | Medium | ✅ Built 2026-07-05 | `margin-left:8px` added between the two buttons. |
| 5 | Runner RPE field — header already says RPE/RIR, field itself redundantly repeats "RPE" | Low | ✅ Built 2026-07-05 | Mobile placeholder now shows a numeric range hint (`1–10`/`0–5`) instead of repeating "RPE". |
| 6 | Add Superset — replace the AMRAP button in the add-exercise modal with "Add Superset"; runner should treat the pair as one on-screen unit, tracking which set/exercise within the pair | Future | Scoping needed | Confirmed superset today is an exercise-level text field (app-workouts.js:906, ~1035), not a per-set pairing — a data-model change, not a label swap. Jake explicitly wants to scope this together. **Confirmed 2026-07-29: this is a SEPARATE ask from WOD/circuit training** (N-exercise timed block, round counting) — see `LOG.md` 2026-07-29 (that session backlog was pruned from this file 2026-08-25). Both need scoping, but as two distinct conversations, not one. |

### Area 2 — Progress & Stats
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 7 | Workout-preview slider shows blank fields for cardio exercises | High | ✅ Built 2026-07-05 | `openSessionDetail`'s set-line builder now branches `isCardio` first and reuses the exact cardio-formatting logic already used by the template-card preview. |
| 8 | Entering a new 1RM with the same kg value as an existing entry silently changes the new value (e.g. entering 200kg when another exercise is already 200kg saves as 199.5kg) | High | Needs live repro | No rounding/dedup/nudge logic found anywhere in `save1RM`/`saveBig5OneRMs`/Epley paths (app-progress.js:229-290, 79-92). Likely DB-side (trigger/constraint) or a data-entry artifact. |
| 9 | Progress > 1RM "Update" — fields populate outside the modal, not inside it | Medium | ✅ Built 2026-07-05 | Root cause: `.modal-box` (used by 5 modal sites across app-progress.js/app-runner.js) had zero CSS definition anywhere — swapped all 5 to the correctly-styled `.modal` class. |
| 10 | Personal Bests and Performance tabs are redundant — move 1RMs into Personal Bests; repurpose Performance to track saved-workout-session progress over time (date completed + progress) | Medium/Future | Design decision | Jake: flesh out in a future session. Confirmed real overlap today between `renderProgressPBs` and `renderClientPerformance` (both surface `performance_logs`, app-progress.js:1109, 300). |
| 11 | Bodyweight graph Y-axis too fractional — should step in 0.5kg increments; lowest tick = goal weight, highest tick = 1kg above starting weight | Low (quick win) | ✅ Built 2026-07-05, fixed 2026-07-06 | 0.5kg stepSize added to Chart.js config. Goal/starting weight come from 2 new nullable `clients` columns (`starting_weight_kg`, `goal_weight_kg`). **2026-07-06 correction:** the 2026-07-05 build only wired this into the PT-facing `renderClientWeight` (client-profile Weight tab) — a review agent caught that the client/solo's own "My Progress → Body Weight" page uses a separate, untouched function (`renderProgressWeight`), so neither the goals form nor the Y-axis fix was reachable by the actual target user. Ported into `renderProgressWeight` too, and fixed a second bug found in the same review: the min/max calc assumed goal < starting (weight-loss only) — a weight-gain goal inverted the axis. Now uses `Math.min`/`Math.max` of the two values. |

### Area 3 — Personal / Solo account
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 12 | Personal account calendar — text overflows outside the calendar cells | Medium | Confirmed | app-calendar-goals.js:119-153 — zero calendar CSS classes exist anywhere (all inline styles); grid cells lack `min-width:0`, text is `white-space:nowrap` — classic CSS Grid overflow. |
| 13 | Personal > Workouts page shows 1RMs — redundant with Progress section | Low | **✅ Done 2026-07-08 (e600010)** — _was stale, ticked 2026-07-11_ | Already removed as part of item 10's Performance/Personal Bests restructure, which moved the Workouts-page 1RM grid into Personal Bests "removing its now-dead backing query" (LOG, session 22). Verified 2026-07-11: `client_1rms` has **zero** references in `app-workouts.js`. This row sat marked open for 3 days and was nearly rebuilt from scratch during planning — the reason `/save` now has a mandatory roadmap-reconciliation step (Step 3b). |
| 14 | Personal > Calendar should also show the workout-preview slider (parity with elsewhere) | Medium | Confirmed gap | `showClientDayDetail` (app-calendar-goals.js:215-263) never calls `openSessionDetail` — only renders exercise name + set count. |
| 15 | Personal account should structurally mirror the Client view exactly — the only difference should be no client/PT linkage | Future | Design decision | Jake's own architecture statement. Confirmed real diffs exist today: `renderSoloDashboard` (app-dashboard.js:583-819) lacks the sudo/branding banners `renderClientDashboard` (219-580) has, and has a unique 4-tile solo-stats row the client dash doesn't. Needs a dedicated session — affects items 13/14 too. |

### Area 4 — Dashboard
| # | Item | Priority | Status | Notes |
|---|---|---|---|---|
| 16 | Dashboard should show a program-name header (mirroring "Up next") with a "View program" button next to it | Medium | ✅ Built 2026-07-05 | Added above the "Up next" hero card on both client and solo dashboards, routes to the Workouts page. |

**Suggested order:** Area 1 (Runner) first — includes a live save-blocking error and a silent wrong-data bug — then Area 2 (Progress, its own data-integrity concern), then Area 3 (Personal/Solo), then Area 4 (Dashboard, quick win, slots in anytime).

**Two items need Jake in the room before building, not just code:** #6 (Add Superset — data model design) and #15 (Personal-mirrors-Client — architecture decision, ripples into #13/#14).

---

## PT-facing features

### Core shell
| Feature | Status | Notes |
|---|---|---|
| Auth — login / signup / session persistence | ✅ Done | |
| Coach dashboard shell | ✅ Done | |
| Sidebar + bottom nav | ✅ Done | Dashboard, Clients, Workouts, Calendar |
| Sign out | ✅ Done | |

### Client management
| Feature | Status | Notes |
|---|---|---|
| Client list | ✅ Done | |
| Add client | ✅ Done | |
| Client profile (tabs) | ✅ Done | Overview / Goals / Workouts / Weight / Performance / Programs / 1RMs. **Photos tab removed 2026-07-12** (Jake, "for now"); bucket + data retained, restorable from git history at app-progress v9. Removed alongside fixing a live cross-tenant leak in its storage policies — see CRITICAL.md storage section + `breach-procedure.md` §6. |
| Edit client details | ✅ Done | |
| Update client email (modal) | ✅ Done | |
| Invite client via email | ✅ Done | Edge Function — stamps user_id + invited_at at send time |
| Resend invite | ✅ Done | |
| Client compliance tracking | ✅ Done | Sessions per client this week — colour-coded card on PT dashboard |
| In-app PT→client messaging / notes thread | 💡 Future | Supabase Realtime; simple thread per client profile |
| **Client cannot self-detach from their PT except via a proper cancellation workflow** | 🗓 Planned, not scoped | 2026-07-05: surfaced while adding a client-role UPDATE policy on `clients` (for self-service weight goals). RLS in this app is row-level, not column-level, so any client-writable-row policy technically permits a client to update `coach_id` on their own record directly via the API, detaching themselves from their PT with no workflow, no notice, no PT-side visibility. Accepted as consistent with the existing trust model for now (same class of risk already present on `weight_logs`/`client_1rms`), but Jake flagged it as a real gap needing an actual designed cancellation/detach flow — not scoped yet. |

### PT dashboard
| Feature | Status | Notes |
|---|---|---|
| Stats row (active clients, sessions this week) | ✅ Done | |
| Recent activity feed (weight + workout logs, last 7 days) | ✅ Done | |
| This week's sessions compliance card | ✅ Done | |
| Goals due soon (next 14 days) | ✅ Done | |

### Calendar
| Feature | Status | Notes |
|---|---|---|
| Calendar page (monthly grid) | ✅ Done | |
| Month navigation | ✅ Done | |
| Add event (modal — title, date, type, client, notes) | ✅ Done | |
| Delete event | ✅ Done | |
| Per-client calendar view | 💡 Future | Filter calendar to one client's events |

### Exercise library
| Feature | Status | Notes |
|---|---|---|
| Global exercise library per coach | ✅ Done | |
| Add / edit / delete exercises | ✅ Done | |
| Muscle groups tagging | ✅ Done | |

### Workout templates
| Feature | Status | Notes |
|---|---|---|
| Create / edit / delete templates | ✅ Done | |
| Add exercises to template | ✅ Done | |
| Set form — AMRAP / Uni / Timed, Reps, Weight, %1RM, Rest, RPE/RIR, Tempo, Notes | ✅ Done | |
| Cardio set form — Pace/500m, Pace/km, HR Zone, Rest, Stroke rate, Duration, Distance | ✅ Done | |
| Template card set preview | ✅ Done | |
| Section labels ([WARM-UP] / [MAIN SET] / [COOL-DOWN]) | ✅ Done | |
| Log workout against template | ✅ Done | |
| View workout log | ✅ Done | |
| Template propagation → syncs client plan copies | ✅ Done | Apply-to-all now updates client plan copies via program_phase_workout_id FK |
| Custom exercise demo videos (YouTube link) | 🗓 Planned | Per exercise in library; competitor standard (TrainHeroic 1,500+, PT Distinction 1,656) |

### Workout runner
| Feature | Status | Notes |
|---|---|---|
| Real-time gym logger | ✅ Done | |
| Cardio mode + interval timer | ✅ Done | **Redesigned 2026-07-28** — intervals is now its own first-class exercise type (block model + phase-walk runner), superseding the 2026-07-24 get-ready-countdown-only version. Steady-state cardio's own timer is untouched and stays separate by design. Full detail in STATUS.md/LOG.md 2026-07-28. |
| AMRAP / EMOM / circuit timer mode | 🗓 Planned | Dedicated timer for AMRAP (count-down), EMOM (minute boundary beep), circuit (rounds × work/rest); competitor standard on TrainHeroic |
| Rest timer | ✅ Done | |
| Bodyweight / assisted / superset support | ✅ Done | |
| Timed sets — Start button + countdown overlay | ✅ Done | v169 — ▶ Start → fullscreen ring timer → auto-fills duration on complete |
| Unilateral L/R logging | ✅ Done | |
| Set X of Y counter + progress dots | ✅ Done | Positioned below last-session strip, above inputs |
| Session summary / finish screen | ✅ Done | PR badge, stats row, exercise cards |
| Runner target chips (pace, duration, stroke rate, rest HR) | ✅ Done | |
| Client notes per exercise | ✅ Done | Saves to workout_log_exercises.client_notes |
| Voice cue at 10s rest + beeps at 3/2/1 | ✅ Done | v169 — Web Speech API; unlocked on first gesture |
| Last session data accuracy | ✅ Done | v169 — fixed stale query ordering |
| Stats bar removed — timer only in header | ✅ Done | v169 — cleaner runner layout |
| **Runner redesign → Hevy-style table logger** (supersedes "set input pre-fill") | ✅ Done (v1) — **revised 2026-07-11** | 2026-07-02, pushed 6e6402a: all-sets-visible table, tap-✓ to complete, non-blocking rest timer. **v1 = plain strength only**; cardio/timed/unilateral stay on the wizard — phase 2 still 🗓 Planned. **Two v1 design choices were REVERSED on 2026-07-11 (app-runner v21) after Jake used it in real gym sessions:** (a) the `PREVIOUS` column is gone — last session is now **ghost text** in the KG/REPS inputs, so each value sits under the column it belongs to instead of being squashed into one cramped 54px cell; (b) **pre-fill / "1-tap repeat" removed** — rows now start EMPTY. A pre-filled value is indistinguishable from one you actually entered, so you could tick a set off having never confirmed the weight was right. Logging accuracy beat tap-count. See STATUS "What's working" + "In progress" for the two known v1 gaps (superset auto-switch, bodyweight live-verify) |
| **Runner redesign phase 2** — extend table (or equivalent) to cardio/timed/unilateral/%1RM exercises | 🗓 Planned | Scope not yet defined; v1 deliberately excluded these to ship the strength-only case first |
| **Plate calculator (what to load on the bar)** | **❌ REMOVED 2026-07-11** (shipped 2026-07-10, app-runner v19; deleted app-runner v21) | Built after repeated requests (2026-07-02 competitor research): standard 20kg bar + greedy per-side breakdown, as a PLATES/SIDE column in the strength table's target bar plus a live hint under the wizard's weight input. **Jake used it in a real gym session and asked for it to be removed outright** — in practice it was noise, not help. Deleted rather than hidden behind a flag (`_calcPlateBreakdown`/`_updatePlateBreakdown`/`_PLATE_SIZES` and its 5 tests all gone). **Lesson worth keeping: "repeatedly requested in research" did not survive contact with real use** — the only test that mattered was Jake actually lifting with it. |
| **Improve workout-tracking visuals + underlying data model** | 🗓 Planned | Jake, 2026-07-04: wants a better look at how a workout is tracked in the runner, and to reconsider where/how that data is stored. The "where it's stored" half is now done (runner autosave, below); the visuals half is still unscoped — needs a sounding-board session. |
| **Runner session autosave (localStorage draft)** | **✅ Done 2026-07-10** | Built as scoped: localStorage-only draft, checkpoint on every `renderRunner()` + a 10s safety-net tick, key `_runnerDraft_<clientId>`, captures `loggedSets` + `tableRows`, same-day staleness cutoff, resume/discard confirm modal. **Refined from the original scoping note:** wired into `launchRunner()`, not `startWorkoutRunner()` — reading the real code showed `launchRunner` is the true single choke point both the fast templateId path and the setup modal's own Start button funnel through, so `startWorkoutRunner()` alone would have missed the modal path. Cleared inside `discardRunner()` (covers both abandon and post-save). Multi-agent review caught a real gap before push: resumed drafts skipped the audio/speech-unlock gesture, so a resumed session's rest-timer cues could silently never fire — fixed. Fixes the 2026-07-04 live incident (runner freeze + forced reload wiped an entire in-progress gym session). app-runner v17. |
| **Rest time not overwritten on swap/add** | 🐛 Bug (confirmed 2026-07-05) | Swap mode never reassigns `ex.restSecs`; add mode hardcodes 90s, ignoring the entered value. See session backlog Area 1 #2. |
| **App feels slow saving an updated workout, and navigating dashboard → Workouts page** | ✅ Done 2026-07-07 | Root cause of save: `saveRunnerSession`/`saveWorkoutSession` inserted one exercise + one sets-batch per exercise, sequentially (up to ~26 round trips for 6 exercises) — batched into 2 inserts total, measured 14 requests/4.7s → 4 requests/1.1s. Root cause of Workouts-page load: both template queries had no `.limit()`, riding the 200-row server cap — added `.limit(100)` to both; also cleaned up 103 confirmed-orphaned `workout_templates`. Pushed 444d0f3. |
| **Exercise picker modal shrinks/drifts toward the bottom of the screen as search results narrow** | ✅ Done 2026-07-07 | Jake reported live: as fewer results match a typed query, the modal (and the search input itself) visually shrinks and slides down the screen, crowding the on-screen keyboard on mobile. Root cause: `max-height:85vh` with no fixed `height`, combined with mobile's bottom-anchored overlay. Fixed with `height:70vh` so the box stays constant size/position regardless of result count. Pushed 682f86f. |
| **Add Superset (redefine current AMRAP button)** | 🗓 Planned, needs scoping | 2026-07-05: Jake wants the add-exercise modal's AMRAP button replaced with "Add Superset" — pairs two exercises so the runner shows both on one screen and tracks sets/exercise within the pair. Confirmed today's superset field is exercise-level text, not a per-set pairing — data-model change, not a label swap. Supersedes/extends the "Superset auto-advance" gap already tracked in [[coachapp-runner-architecture]]. See session backlog Area 1 #6. |

### Weight tracking
| Feature | Status | Notes |
|---|---|---|
| Log weight (kg) + body fat % | ✅ Done | |
| Stats row (current / starting / change) | ✅ Done | |
| Chart.js line chart | ✅ Done | |
| Log table | ✅ Done | |

### Performance / PB tracking
| Feature | Status | Notes |
|---|---|---|
| Log performance (4 categories: strength / cardio / body metric / benchmark) | ✅ Done | |
| Best per exercise grouped by category | ✅ Done | |
| PB badge (gold) | ✅ Done | |
| Expandable history per exercise | ✅ Done | |
| Chart.js progression chart per exercise | ✅ Done | |
| Delete log entry | ✅ Done | |
| **Personal Bests / Performance merge** | **✅ v1 shipped 2026-07-08 (e600010)** | 2026-07-05: Jake — the two tabs are redundant. Move 1RMs into Personal Bests; repurpose Performance to track saved-workout-session progress over time (date completed + trend). See roadmap session backlog Area 2 #10. **2026-07-08:** shipped as scoped — Personal Bests now hosts manual PBs + 1RMs + Cardio bests; Performance split into Per session (net new) / Per exercise (alphabetical + search). PT-facing client-profile tab (`renderClientPerformance`) still uses the old form — fast-follow, not yet done. See session backlog 2026-07-08 Area 3 #10 for full detail. |

### Goals
| Feature | Status | Notes |
|---|---|---|
| Create / edit goals with target dates | ✅ Done | |
| Milestones | ✅ Done | |
| Check-ins | ✅ Done | |
| Goals due soon on PT dashboard | ✅ Done | |
| Goals overhaul — granular mini-goals and milestones | 🗓 Planned | Medium priority |

### Programs (phase-based training plans)
| Feature | Status | Notes |
|---|---|---|
| Programs schema (4 tables) | ✅ Done | |
| Programs UI — create / edit / delete programs | ✅ Done | |
| Program phases (weeks, ordering) | ✅ Done | |
| Assign workout templates to phase days — inline 7-day grid, no modal | ✅ Done | 2026-07-01 — replaced the old "+ Assign workout" modal (day→session→template, one at a time) with an always-visible searchable grid on the phase card; picking a template assigns immediately. Built to cut repetition, not just polish the old picker — matches the new "efficiency is the platform's spec" standing principle. |
| Assign program to client with start date | ✅ Done | |
| Edit start date | ✅ Done | Shifts entire calendar |
| Remove program from client | ✅ Done | |
| PT client programs accordion (Phase → Day → SESSION N/M → exercises) | ✅ Done | |
| Client plan editing (PT edits client's sessions) | ✅ Done | Apply-to-all propagation + client copy sync |
| Auto-create calendar events from program schedule | 💡 Future | |
| Periodization (Linear / Undulating) — phase-level %1RM automation | ✅ Done | 2026-07-01 — generatePhasePeriodization(); propagates to already-assigned clients |
| 1RM system — inline runner prompt, Epley estimator, Big 5 quick-start, post-session suggestion | ✅ Done | Found already built and live 2026-07-01 (STATUS.md v181 entry was stale) — `showRunnerOneRMSheet`, `showAdd1RMModal`, `saveBig5OneRMs`, `showPostSessionOneRMModal` |
| 1RM assignment-time missing-1RM check | ✅ Done | 2026-07-01 — PT quick-fills known/estimated 1RMs inline on the Assign modal when a program needs lifts the client doesn't have; covers both assign entry points + solo; never blocks. Playwright smoke tests added. |
| Exercise identity — move from free-text name matching to exercise-library-linked (exercise_id) entry | ✅ Done 2026-07-06 | Jake reported the runner's "previous session" data goes missing when the same exercise is typed slightly differently across two workout templates. Confirmed root cause: exact-string-match fragility, not workout isolation. **Built:** a real `exercise_id` FK on `workout_log_exercises` and `client_1rms` (`workout_template_exercises` already had one), with a name-match fallback for older/unlinked rows — wired through `saveRunnerSession`, `saveWorkoutSession`, `save1RM`, `saveBig5OneRMs`, `_getProgramOneRMStatus`, `fetchRunnerLastSession`, `_lookupClientOneRM`. **Historical data migrated:** one-time SQL seeded the (previously empty) exercise library from real usage and linked 4777 template exercises, 27 logged exercises, 18/19 1RMs; Jake reviewed his actual exercise list and told me which spelling variants to merge (Close Grip Pulldown, RowErg, Trap Bar Jump, etc.). **New shared Exercise Picker** (search-as-you-type, explicit "Create new exercise", collapsible archived section) replaces the old dropdown+free-text entry everywhere — workout builder (add + edit), runner swap/add, 1RM entry. Archive/unarchive added to the Exercise Library management page. The old "1RM lifts quick-pick + auto-scroll" dropdown shortcut was dropped (Jake confirmed fine with this) — the underlying %1RM calculation itself was untouched and unaffected. 4 real bugs found and fixed via multi-agent review: a race condition wiping the search box, two missing RLS policies (clients had no INSERT/SELECT on `exercises` at all), an apostrophe-escaping bug breaking the picker for names like "Farmer's Carry", and two double-tap duplicate-row races. **Pushed** (`1526704`). First push attempt was blocked by the pre-push hook's smoke-test pass — initially misdiagnosed as environmental flakiness, but the real cause was a genuine test-suite race condition (`loginAsClient` not waiting for the client dashboard to finish rendering, unlike `loginAsPT`); fixed and pushed separately (`31698fe`). |
| Progression rules engine | 💡 Future | Auto-calculates target weight per session |
| Individual session skip/move on client calendar | 💡 Future | Defer until real PT usage data |

### Branding / UI
| Feature | Status | Notes |
|---|---|---|
| Branding — logo upload, display on dashboards | ✅ Done | v151 — private logos bucket, signed URLs, sidebar + PT/client dashboards |
| UI consistency pass | ✅ Done | SESSION N/M labels + exercise lists unified across all surfaces (v143) |
| Progress tabs — pill grid (no scroll) | ✅ Done | v171 — flex-wrap pills, all 5 visible at once on mobile |
| **Dashboard consistency pass (PT/client/solo)** | ✅ Done | 2026-07-05 (main.css v4, app-dashboard v2): `.dashboard-card`/`.card-header`/`.card-title` were used ~37× across all 3 dashboards with zero CSS definitions (rendered with no background/border/shadow) — added real rules. Consolidated 3 duplicated grid `<style>` blocks into one `.dashboard-split-grid`. Fixed 4 bare `class="btn"` Cancel buttons (no matching CSS) to `.btn-secondary`. Replaced hardcoded hex colors with design tokens. Fixed PT stat strip (no mobile override, cramped at 480px) and solo stat strip (`display:none` below 640px, vanished entirely) to pair up on mobile instead. |
| **App-wide undefined CSS vars/classes — found 2026-07-05** | ✅ Done 2026-07-23 (`c72eb14`) | `var(--surface-2)` ×48, `var(--bg-accent)` ×3, `var(--text-accent)` ×3 — 54 references, defined nowhere, so every one silently rendered transparent/inherited. Audited all 48 `--surface-2` sites first (every one a `background`), then defined all three in `:root`. Shipped alongside the builder repaint (15 hardcoded greys → 0). main.css v5→v6. 18 days open. **Awaiting Jake's eyes** — it changes surface styling app-wide, not just the builder. |
| Metric / imperial toggle | ✅ Done 2026-07-25 (`23a2493`) | Account-wide, per-metric-type (weight kg/lb, jump height cm/in, cardio distance km/mi) — not one global switch; revised scope after confirming the real need (Jake, kg weight + inch jump height simultaneously). Storage stays canonical; new Settings "Units" card. Jump distance deliberately deferred — no friction hit there yet. See STATUS.md/LOG.md 2026-07-25 for the full build + the 5 review findings fixed pre-push. |

### Leaderboards
| Feature | Status | Notes |
|---|---|---|
| Client leaderboard (most weight lost, heaviest squat, etc.) | 💡 Future | |

---

## Client-facing features

### Client dashboard
| Feature | Status | Notes |
|---|---|---|
| Client login (invite acceptance) | ✅ Done | |
| Client dashboard (this-week banner, check-in, recent sessions, weight chart) | ✅ Done | |
| Client calendar | ✅ Done | Monthly grid; program workouts mapped to dates; day detail modal |
| Client Workouts page | ✅ Done | Phase → Day → SESSION N/M → exercise list → Start button |
| Client logs own weight | ✅ Done | |
| Client logs own workouts (runner) | ✅ Done | |
| Client views own goals + progress | ✅ Done | |
| Client adds own PBs | ✅ Done | |
| Client video submission (form review) | 💡 Future | |

### Solo user / Personal account (self-coached)

_Jake's master account gets a third "Personal" pill. Solo user's own client record has `coach_id = NULL` (not `auth.uid()` — corrected 2026-07-04, verified against `app-core.js:132`'s `.is('coach_id', null)` lookup), identified instead via `user_id = auth.uid()` + null coach_id. `window._soloClientId` holds that record's id. Solo write access to tables like `client_1rms`/`client_programs` needed its own explicit RLS policies (added 2026-07-01) precisely because they don't inherit coach-scoped policies through a `coach_id` match._

| Feature | Status | Notes |
|---|---|---|
| Third pill — Personal view in master account switcher | ✅ Done | `switchView('solo')` — both desktop sidebar + mobile |
| Solo nav + dashboard | ✅ Done | No Clients section; personal dashboard |
| Self-coached client record (coach_id = auth.uid()) | ✅ Done | Jake West record migrated; severed from PT account |
| One-time data migration SQL | ✅ Done | 8 tables cloned from old Jake West client record |
| Program self-assign flow | ✅ Done | Hyrox Hero assigned to solo account |
| Solo weight + PB tracking | ✅ Done | |
| Solo workout runner | ✅ Done | |
| My Progress — 5 tabs incl. 1RMs | ✅ Done | v170 — Body Weight, Strength, Cardio, Personal Bests, 1RMs |
| Delete old Jake West PT-account client record | 🗓 Planned | Clean up PT dashboard — only real/test clients should remain |
| Upgrade path: solo → PT-coached | 💡 Future | Solo accepts PT invite, coach_id stamped, retains history |
| Upgrade path: solo → becomes a PT | 💡 Future | Role change; gains coach dashboard + client management |
| **Solo becomes a genuine, stored account type (data model)** | **✅ Done 2026-08-01, pushed same month** | `profiles.role='solo'` now genuinely stored for the locked-down `solo_only` account, not computed in memory every login — see STATUS.md/design spec. **Separate mechanism from this table's other rows**, which are about the MASTER account's own Personal/solo view (Jake's own account, still role-cycling via `switchView()`, unaffected). **Onboarding path added 2026-08-09** — in-app "Invite a personal user" (Settings card + Edge Function), no SQL by hand needed anymore. Genuinely open public signup for new solo accounts still NOT built — deliberate, see the box near the top of this file. |
| **Personal account mirrors Client view exactly** | 🗓 Planned, needs scoping | 2026-07-05: Jake's own architecture statement — the only difference between Personal and Client should be no client/PT linkage. Confirmed real diffs exist today (`renderSoloDashboard` lacks the sudo/branding banners `renderClientDashboard` has; solo has a unique 4-tile stats row). Needs a dedicated session — ripples into the redundant-1RMs-on-Workouts-page and calendar-preview-parity items. See roadmap session backlog Area 3 #15. **2026-07-08 re-confirmed:** Jake restated this more strongly — solo should have zero links to any PT/client page. Re-checked: the solo nav and view-switcher gating already have no leaked links, so that half already holds. The gaps are unchanged (sudo/branding banners, unique stats row) — see session backlog 2026-07-08 Area 4 #11. |

---

## Business / platform features

| Feature | Status | Notes |
|---|---|---|
| Branding / custom logo | ✅ Done | v151 — coach_branding table, RLS, logo signed URLs, business name |
| Marketplace — sell programs to non-clients | 💡 Future | |
| Assistant coach support (multi-coach) | 💡 Future | |
| MFP / nutrition CSV import | 💡 Future | |

---

## Infrastructure / tech

| Item | Status | Notes |
|---|---|---|
| Supabase project (avilxuiacmtgeoxxhfhc) | ✅ Done | |
| RLS policies — coach-scoped | ✅ Done | |
| RLS policies — client-scoped | ✅ Done | Optimised 2026-06-23; (SELECT auth.uid()) caching |
| Audit log (DB-side triggers on 17 tables) | ✅ Done | |
| Structured console logging (JS-side) | ✅ Done | |
| Silent failure audit + dbq() wrapper | ✅ Done | |
| Edge Function — invite-client | ✅ Done | |
| Git (master branch) + GitHub Pages deploy | ✅ Done | Auto-deploys on push |
| PWA — manifest.json + service worker | 🗓 Planned | Makes app installable on iOS/Android from browser; no app store required; use PWABuilder (free, Microsoft) |
| Native app (Capacitor wrapper) | 💡 Future | Wraps existing JS in native shell; enables push notifications + app store listing |
| Pre-push git hook + GitHub Actions CI | ✅ Done | 10 static checks + Playwright (local only; CI skips — no credentials) |
| Playwright E2E suite | ✅ Done | 18 tests; 10 passing in CI, 8 solo skipped (need Jake's account); runner + client + auth + settings flows |
| SQL safety skill | ✅ Done | |
| Vault → GitHub backup | ✅ Done | jakendwest-ops/vault; auto-pushed on /save |

---

## Beta prep — target date: **31 July 2026**

_Date pushed from the original Jul 22–31 window to a single date, 31 July, per Jake's 2026-07-06 decision. Sessions 9–12 (Jul 2–3) went entirely into the runner redesign — a deliberate, research-backed pivot (approved after the Jul 2 competitor research), not drift. The pre-beta gates below still haven't moved and remain the real risk to hitting even the new date._

- ✅ **BETA BLOCKER SOLVED 2026-07-12 (`90c6d9e`):** a brand-new coach's first login now seeds ~40 exercises + a sample workout + a sample program (`js/starter-content.js`, gated by `profiles.starter_seeded`, resumable). Not auto-assigned; examples deletable. Live-verify pending: a real new signup landing on a populated dashboard.
- **⚠️ Pre-beta gates — action before 31 July:**
  - ✅ **ICO breach-notification procedure** — **Done 2026-07-12** (`breach-procedure.md`; CRITICAL.md now ✅).
  - ✅ **`/deploy-check` run end-to-end** — **Done 2026-07-12**, first time ever. 8/9 gates green; found + fixed a live cross-tenant storage leak in the process. One manual gate left: a live client smoke test (Jake-only).
  - ✅ **Supabase redirect URL** — confirmed present (`…github.io/coachapp/**` + Site URL). 2026-07-12.
  - **Delete old Jake West client record** from the PT account (see "Solo user" section)
  - **Supabase Pro upgrade** — unlocks leaked-password (HaveIBeenPwned) protection
- Full walkthrough, Playwright suite (127 passing), `/deploy-check` — ✅ redirect-URL + RLS + storage gates done
- **Beta invites: single date, 31 July** (previously staggered Jul 25/28/31 — simplified to one date)
- ✅ **1RM system built + tested** (done 2026-07-01) — drives %1RM in programs
