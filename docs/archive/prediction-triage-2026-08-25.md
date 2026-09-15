# Prediction triage — 2026-08-25

_Ran because 63 CoachApp predictions sat past `verify_by` ungraded and `os-lint` had been RED on it
for weeks. **9 were settled without Jake** (4 on evidence, 5 as structurally unsettleable). The 54 below
are the ones that genuinely need him or a live check — grouped by WHAT settles them, not by `kind`,
because `kind` turned out not to partition that way (a `world` prediction saying "Jake will NOT complete
a live-verification pass" needs Jake exactly as much as an `owner` one)._

> **Grading rule.** Same standard as the bug ledger: Jake confirming, or evidence that actually ran.
> Never inference. An ungraded prediction is honest; a guessed one silently corrupts the calibration
> record, which is the only reason to keep predictions at all.

## A. One question each — answerable in seconds (18)

_All of the form "did you ask for X / did you keep doing Y". Jake knows each instantly._

- [ ] **pth-037** _(due 2026-07-22)_ — Jake will ask to automate more of the review/quality process — the pre-push hook will feel like the right direction and he'll want it extended or applied elsewhere
- [ ] **pth-040** _(due 2026-07-15)_ — Jake will ask for a fuller dbq() sweep across all ~15 remaining unguarded queries within the next 2 sessions — once he understands the value of the wrapper, he'll want it everywhere
- [ ] **pth-044** _(due 2026-07-14)_ — Jake will ask to implement Realtime client notifications (coach assigns program → client sees it without refresh) within the next 2 sessions
- [ ] **pth-046** _(due 2026-07-14)_ — Jake will continue actively auditing and expanding the memory system — he will suggest additional memory entries or categories within the next 3 sessions
- [ ] **pth-090** _(due 2026-07-08)_ — Jake will ask to expand the daily question list or adjust the questions after seeing the first few — the current list is calibrated for week 3 but he'll have opinions on tone or topic balance
- [ ] **pth-058** _(due 2026-07-26)_ — The discuss-then-approve working agreement will hold for the next 3+ sessions — Jake values it enough to maintain the discipline himself
- [ ] **pth-065** _(due 2026-07-15)_ — Jake will confirm the Test Client invite from the live site rather than revisiting it from localhost
- [ ] **pth-092** _(due 2026-08-05)_ — Jake will keep offering his own real account/credentials as a testing resource when automated E2E test accounts lack the real data needed (assigned programs, real 1RMs, etc.) -- a standing collaboration pattern, not a one-off
- [ ] **pth-100** _(due 2026-08-10)_ — Jake will not ask for a retroactive reclassification pass on the exercises left merged by the is_personal fix -- the forward-only fix will be sufficient for him
- [ ] **pth-111** _(due 2026-08-11)_ — Jake will use the new Personal > Library page to build at least one genuinely reusable template (assigned to more than one day slot or programme), rather than continuing to use the inline '+ Create new workout (this day only)' flow
- [ ] **pth-112** _(due 2026-08-11)_ — Jake will NOT ask to backfill/reclassify the 1537 pre-existing workout_templates rows that defaulted to is_personal = false — the open to-do will be dropped rather than actioned
- [ ] **pth-116** _(due 2026-08-11)_ — Jake will use 'Copy workouts to Library' on Hybrid Weapon Experiment as his first real action next session, rather than starting with the Part B features
- [ ] **pth-119** _(due 2026-08-11)_ — The no-auto-fill change to the runner table will STICK -- Jake will not ask for pre-fill / 1-tap repeat back after using it in real sessions
- [ ] **pth-124** _(due 2026-08-12)_ — The 3 program-workflow fixes (stale-view-on-assign, surgical propagation, edit-reaches-calendar) will STICK — Jake will not re-report any of the three from real use
- [ ] **pth-126** _(due 2026-08-08)_ — Jake will not ask to revert the restored per-workout Save-to-Library button (Option 1 over bulk-only was right)
- [ ] **pth-128** _(due 2026-08-05)_ — When Jake logs a real unilateral/timed/jump exercise in the new fast table, he will accept the fast-table UX and not ask to bring back the step-by-step wizard for them
- [ ] **pth-129** _(due 2026-07-31)_ — Jake will ask for ④ coach parity (the same rich per-exercise/per-workout analytics rendered read-only in the coach's client-profile view) before the 31 Jul beta
- [ ] **pth-130** _(due 2026-07-26)_ — Jake will flag the Recent-sessions diary showing 0/0/0 tiles for real sessions with no logged sets (his 'Push Day A') and ask to hide zero-total sessions or note them

## B. "Did it hold when you actually used it?" (18)

_Each predicts a shipped fix would stick. Settled by Jake using the feature, not by a test — most
already have a `fixed-awaiting-jake` ledger row, so one live pass grades several at once._

- [ ] **pth-043** _(due 2026-07-14)_ — The missing client INSERT policy on workout_log_sets will turn out to have been silently blocking client self-logging — once Jake tests client self-log post-RLS-migration, he'll confirm sets were previously not saving
- [ ] **pth-034** _(due 2026-07-05)_ — My Progress Strength tab will hit a PostgREST filter syntax issue on live — the workout_logs!inner join with .eq filter may not filter by client_id correctly and will return empty or over-scoped data
- [ ] **pth-061** _(due 2026-07-05)_ — Client notes will fail silently on first use after push — the SQL migration must be run before the feature works, and Jake has not yet run it
- [ ] **pth-086** _(due 2026-07-18)_ — Replacing the tone-beep rest-timer countdown with spoken numbers will fix Jake's silent-beep complaint when he next tests the runner in a real gym session
- [ ] **pth-089** _(due 2026-07-12)_ — The weight-goals feature (Starting/Goal weight inputs + chart Y-axis min/max) will work correctly end-to-end when Jake tests it on his own account -- save succeeds via the new RLS policy, and the chart visibly reshapes
- [ ] **pth-090** _(due 2026-07-12)_ — Removing the intensityMin exclusion from _isPlainStrengthExercise will make Trap Bar Jump show the strength table (matching Back Squat) with no other regressions, once Jake hard-refreshes and checks
- [ ] **pth-099** _(due 2026-08-10)_ — The program-picker fix (excluding program-owned templates from the reuse pool, relabeling the inline option) will fully resolve Jake's clutter complaint -- he will not ask for the originally-recommended tap-row live-filter UI redesign within the next month
- [ ] **pth-109** _(due 2026-08-11)_ — The workout_templates RLS tightening (adding `client_id is null` to the client-read policy) will not break any real client flow — no report of a missing programme, dashboard hero, or calendar session in the next month
- [ ] **pth-114** _(due 2026-08-11)_ — The tap-row workout picker will not need a follow-up fix for the 'which of my three Upper Body workouts is this' problem — name + description + exercise preview is enough to disambiguate in real use
- [ ] **pth-123** _(due 2026-07-31)_ — The new-coach starter-content seed will work correctly for a REAL new signup (a genuine new coach lands on a populated dashboard with the 40 exercises + sample workout + sample program), first time, no manual fix needed
- [ ] **pth-125** _(due 2026-07-25)_ — The week-tabs redesign (Programs builder + client Workouts page) will hold on Jake's own account with his real programs, no correction needed
- [ ] **pth-127** _(due 2026-08-15)_ — The 6-value metric_type model + typed workout_log_sets columns (avg_hr/max_hr/height_cm/side) will carry through sub-projects ②d/③/④ without needing a schema revision
- [ ] **pth-107** _(due 2026-07-30)_ — Jake will confirm the day-row prescriptions read well on his real programs, but will ask for at least one field to be dropped or reordered once he sees a dense real week on his phone (most likely tempo or the rest value).
- [ ] **pth-108** _(due 2026-07-30)_ — The Programs-page add-exercise bug will turn out to be about which SURFACE Jake was looking at (the program slot preview, not the template editor), not about the propagation logic — i.e. the two symptoms are one symptom described from the program page.
- [ ] **pth-109** _(due 2026-08-06)_ — Fixing the playwright.config.js viewport to a real 390px will surface at least one genuine mobile-only layout failure that the suite has been passing over.
- [ ] **pth-137** _(due 2026-08-25)_ — Jake will hit at least one of the three data-integrity fixes (RIR label, cool-down capture, set counts) in a real session within two weeks and confirm it, closing those ledger rows.
- [ ] **pth-138** _(due 2026-08-25)_ — The runner wizard deletion will NOT produce a live regression — no exercise will fail to render an input control.
- [ ] **pth-147** _(due 2026-08-19)_ — No user-visible regression from today's 16 commits will be reported by Jake within a week.

## C. Blocked on one SQL query (4)

_I cannot query the live DB. Each names its own query; running them grades the group._

- [ ] **pth-072** _(due 2026-07-31)_ — The ~49 remaining in-use duplicate base templates (Lower A/B, Upper A/B) will turn out to belong to leftover TEST programs, not real client-facing ones — so deleting those programs and re-sweeping is safe
- [ ] **pth-076** _(due 2026-07-31)_ — The read-only diagnostic SQL will confirm pth-072 (the ~49 duplicate templates belong to leftover test programs, none in a real client plan) — and the same pattern will recur again within a month unless deleteProgram() is fixed first
- [ ] **pth-095** _(due 2026-07-21)_ — Jake will run the exercises-library cleanup SQL (delete all exercises except those linked to his personal/solo account) and paste back the remaining_exercises count within the next few sessions, the same way he did for the orphaned-templates cleanup
- [ ] **pth-157** _(due 2026-08-25)_ — The stale-jump-target inspect query will return ZERO rows, making the data-repair item closable without any UPDATE.

## D. Blocked on a third party (1)

- [ ] **pth-156** _(due 2026-08-25)_ — Colin West will complete a password reset successfully without further code changes.

## E. Needs a session-record read I could not settle cleanly (13)

_Decidable in principle from LOG.md/`bugs/`, but the claim did not name the evidence that would settle
it, so reading the record honestly returns "ambiguous" rather than true or false.
**This group is the argument for `verify_how`** — see below._

- [ ] **pth-029** _(due 2026-08-20)_ — The sql-safety skill will be invoked before at least 2 of the next 5 SQL operations — reducing failed query iterations from average 3 to average 1
- [ ] **pth-035** _(due 2026-08-22)_ — The pre-push hook will catch at least one real bug before it reaches GitHub Pages in the next 10 pushes
- [ ] **pth-036** _(due 2026-07-22)_ — The hello-claude code review step (Step 4) will surface at least one issue per session for the next 3 sessions before the codebase stabilises
- [ ] **pth-015** _(due 2026-07-24)_ — The daily question cron will need to be recreated at most once per week — Jake starts Claude Code most working days and the 7-day auto-expiry aligns with that cadence
- [ ] **pth-063** _(due 2026-08-01)_ — Edit start date will be the first feature a real PT requests be changed — the lack of a confirmation step risks accidental date shifts that confuse clients mid-program
- [ ] **pth-067** _(due 2026-08-15)_ — The next LLM wiki ingest will consult wiki/sources.md and skip already-processed sources instead of re-reading them, cutting read volume versus this session
- [ ] **pth-097** _(due 2026-08-10)_ — The new missed-check-to-test skill will actually fire at least once in the next 5 sessions -- a bug's root cause will match its trigger shape ('checked A, not the closely-related B') and produce a new Playwright test in the same commit as the fix, not just get created and forgotten
- [ ] **pth-098** _(due 2026-07-31)_ — The client_programs/programs/program_phases/program_phase_workouts RLS fix will hold with no further gaps discovered in this specific embed chain -- the 4 policies applied are the complete set needed for a real client to see their assigned program end-to-end
- [ ] **pth-113** _(due 2026-08-11)_ — No further unguarded workout_templates delete path will be found — _deleteOwnedUnreferencedTemplates is now the single shared helper for both deletePhaseWeek and _cleanupPhaseWeeksBeyond, and deleteProgram has its own equivalent check
- [ ] **pth-115** _(due 2026-08-11)_ — Jake will hit the orphaned-week-clone bug again (periodization clones surviving a program delete as fake 'standalone' templates cluttering his picker) before it is fixed, because it is currently only logged as a decision-needed item
- [ ] **pth-117** _(due 2026-08-11)_ — The new-coach empty-app problem (0 exercises on signup) will be confirmed as the single biggest beta blocker -- if a real beta PT is onboarded before a default exercise library ships, they will stall or churn during their first session
- [ ] **pth-153** _(due 2026-08-25)_ — The remaining 5 of the 9 full-file-review findings will surface at least one MORE defect in my own fix while fixing them, as happened on bugs 1 and 2.
- [ ] **pth-155** _(due 2026-08-25)_ — Fixing the escapeAttr checker (bug 4) will reveal MORE than the 9 known concatenated sites once the rule can see that syntax form.

---

## The structural fix

Every one of the 63 carried a `verify_by` and **none carried a `verify_how`**. That is the whole
reason this backlog exists and why group E is stuck: `pth-157` is settleable because the claim names
its own query; `pth-024` never could be, because "prevented a wasted session" has no capture mechanism
and nothing records a non-event.

**A prediction should name the evidence that will settle it, or not be written.** `guardrails` RULE 6
already gates prediction appends, so requiring a non-empty `verify_how` there is the same RULE 0 shape
as everything else in this OS that has actually worked — and it would have made groups A–E unnecessary.
