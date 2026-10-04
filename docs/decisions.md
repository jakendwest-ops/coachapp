# Decisions

A flat, append-only, reverse-chronological log of significant, hard-to-reverse choices and why they
were made. New entries go at the top. No numbering, no per-decision files — see
[architecture.md](architecture.md) for the resulting shape, not the reasoning.

**Migrated 2026-09-15** from the Vault's `STATUS.md` "Continuity block" — ~40 dated, code-specific
engineering lessons. Most are too granular/line-specific to be "decisions" in this file's sense and
would go stale as the code changes; they're preserved in full, unedited, at
[archive/status-continuity-2026-09-08.md](archive/status-continuity-2026-09-08.md). The 5 genuinely
process-level entries below were pulled out and belong here.

---

**2026-10-04 — The dashboard is one landing-page skeleton for solo, client and coach; the Today card is the only saturated block; the streak counts weeks that hit the whole plan; the coach's first version is logged-only.**
Jake's note of 2026-10-03: "The whole dashboard needs a rework for mobile view, as nothing really flows or stands out as a dashboard
or makes it feel like this is landing page and hub of your account." Scoped with him through a short form and a tappable prototype
(all three dashboards together; today first, then the week; body weight, streak, program progress and calendar; Goals stay; the
PT | Personal switch keeps floating; coach version "go with it"). *Chosen:* greeting, a Today card (the only saturated block, calm on
a rest day, a finished day or any other day), the week as seven tappable days (coach: bars of sessions logged), two quiet tiles
(streak and program; coach: trained this week and programs ending), then body weight, My calendar and Goals (coach: Needs attention,
Weigh-ins, Coming up, Goals due soon). Tapping a day swaps the Today card in place with no read. *The streak:* Monday-Sunday weeks;
inside the program's span every planned session must be logged and a week with none planned is skipped; outside it (before it began,
after it ended, or with no program) one session keeps it alive, so a finished program cannot let a long-idle person keep a streak;
this week counts once complete and is ignored until then (a Wednesday is not a missed week); 52 weeks of lookback. Solo and client now
share ONE loader (`_dashLoadOwn`) - the client's copy lacked `week_number` and `id`, so a periodised phase collapsed onto week 1 and
Start could not resolve the clone - and read a year of sessions in pages. *Coach is logged-only:* the database knows what each client
LOGGED, not what was PLANNED, so there is no "2 of 5 done"; that needs a new database view (SQL for Jake) and is a follow-up. Every
coach count comes from the paged per-client summary, because the `clients` read is cut at the API's 200 rows (the old "Total clients"
tile used a HEAD count for the same reason). *Not chosen:* a time-of-day greeting - the login helpers wait for an `h1` reading "Hi,"
(client) or "Welcome back" (coach) on 462 call sites, so those greetings are a contract; separate designs per role; durations or
exercise counts on the Today card (the app stores neither for a planned session); keeping the coach's adherence list and activity feed
(replaced by Needs attention; the per-client list lives on Clients); a session "Preview" (none exists - View program opens Workouts).
*Removed from the dashboards, Jake's choice:* Recent sessions, the personal bests / Benchmarks card and its read of `performance_logs`
(those live on Progress > Personal Bests), the stats strip, and the client page's inline weight / record / goal-update forms (they live
on Progress and Goals; the weekly check-in form stays). *Consequences stated:* every inline handler on the page is a literal - a button
builder spells its handler out, `_dashOpenWeight` / `_dashOpenGoals` are named functions - so the handler checker can still verify
them (its dynamic-handler baseline fell 7 to 6); the style-literal, date-format, loading-text and fixed-sleep baselines were lowered; the
PT | Personal switch no longer hides the last card on ANY page (`.main-content` gets extra bottom padding when it is shown); the
greeting now escapes the name (the client page printed it raw). *Found by the old suite while porting - a latent miss from the Stats commit, fixed here:* the
"every chart entry point destroys managed charts first" guard flagged the exercise card's chart draw; the right answer was a documented
exemption (a blanket destroy would kill the other cards' charts), not a destroy. *Verified:* 32 unit tests and 29
browser tests written for this, seven deliberate breakages each failing the matching test, 43 older tests across
12 files ported or retired with the cards they pinned, and the 21 dashboard-related spec files (214
tests) green. *Not verified:* how it reads on a phone with real data; `multi-agent-review` has not been run. Row: [bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md](bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md).

**2026-10-03 — An exercise's numbers come from ONE card, one set of maths and one read; records are sets; an RPE top-set exercise shows no ghost text.**
Jake's note of 2026-10-03: no grey last-session numbers on an RPE top-set exercise ("these fields should only be populated once the
top set has been established"), and the runner's Stats sheet should carry the data of the screenshot he sent and be consistent with
My progress. The Stats sheet and the My progress cards were two implementations that had drifted (plain Epley with no rep cap vs the
app's one `_estimate1RM`; 12 sessions vs the whole history; three measures vs five; one record vs four; a logged RPE counted in the
live chip but not in history), so the choice was between a parity test over two copies and one copy. *Chosen:* one copy -
`_mountExerciseStats` (js/app-progress.js) draws the card on both screens; `_xsSessionMetrics` and `_xsRecords` are the only place
the numbers are computed (`_metricPointsFor` and `_exerciseRecords` now read from them); `_fetchExerciseSessions` is the only read
for the runner's sheet (paged past the API's 200-row cap, scoped to the person, matched on the exercise NAME exactly as
`_buildExerciseSeries` groups it). Records are SETS (Jake's reaction to the prototype): "Heaviest set 117.5 kg x 3", and the
estimated 1RM names the set it came from, so a 1RM above the heaviest weight explains itself. The estimated 1RM counts a logged
RPE or RIR (one switch, `_XS_COUNT_EFFORT`), and a value with no scale is ignored rather than guessed, because the two scales run in
opposite directions. A failed read shows a message and Try again and NO numbers: records worked out from half a history would pass
for the whole one. *Not chosen:* matching on the exercise's library id (My progress groups by name, so the two screens would split a
renamed lift differently); showing the last session's sets when the full history fails (same reason); a toast on failure
(`log.error` toasts and reports, and the sheet already says it could not load). *Ghost text:* on an exercise whose first row is a top
set, last session now feeds no placeholder at all, so the weight boxes stay empty until the top set is ticked and the backoff rows
then show a percentage of today's top. *Consequences stated:* the finish screen's PR check (`_prBaseline`) still reads the history
its own way (it also matches by library id), so for a renamed lift it could in principle disagree with "Heaviest set" - not changed;
the runner's "Heaviest ever" row is gone because the records replace it; My progress now shows a full card for every weight x reps
exercise, which is a longer page. *Verified:* 28 unit tests and 17 browser tests written for this, four deliberate breakages each
failing the matching test, ten older tests ported, 211 tests across the 14 affected files green. *Not verified:* how it reads on a
phone with real history. Row: [bugs/2026-10-03-runner-stats-sheet-shows-less-than-my-progress-and-computes-est-1rm-differently.md](bugs/2026-10-03-runner-stats-sheet-shows-less-than-my-progress-and-computes-est-1rm-differently.md).

**2026-10-03 — A release tag is pushed only after GitHub's check on that commit is green; the saved test logins are kept young; a test that needs a live session signs in for real; the app's global Sign out is left alone.**
Four choices from the night `v2026.09.12` was tagged, pushed and never deployed. (1) The deploy job has `needs: check`, and the
check failed on GitHub (Node 22) while the dev machine (Node 24) was green, so the tag sat there undeployed with nothing saying so.
`release.mjs --push` now pushes master, waits for GitHub's code-quality run on that exact commit, and pushes the tag only on a clear
green; a red, missing or unreadable check leaves the tag local and exits 1 (`scripts/lib/ci-verdict.mjs`, with its I/O injected and
tested against a fake GitHub). **Rejected:** pushing both at once and telling the person to look (what failed); making CI and the
dev machine run the same Node first (right, but a tooling-wide change — recommended, not done; `checks.sh` now prints a note when the
majors differ). (2) The suite's sign-out specs revoke the shared PT login on the server (the app's `signOut()` is supabase-js's default
scope `global`), and a revoked login still looks alive, so only a call that asks the auth server notices. A test that needs a live
session signs in for real (`NO_SESSION_REUSE` around its login, previous value restored); `session-store.js` also re-captures a role's
saved session once it is 25 min old, because its access token lives 60 min and the suite takes 47–59. **Rejected:** a refresh
(a revoked refresh token cannot be refreshed — tried, failed); quarantining the test for good. (3) **Left alone, for Jake:** whether
Sign out should end only the current device. `signOut({ scope: 'local' })` would, and would remove this class of test problem at its
root, but ending every session is a product and security choice. (4) Long runs from Claude Code's Bash tool: a background call is
killed at exactly its `timeout`, so give `release.mjs` 7200000 (CLAUDE.md says so now).

**2026-10-01 — Hooks and servers resolve the tree they are RUN in; a dev server is a network service; a cleared ticked set does not count.**
Three choices from one day of fixing the tooling the RPE work exposed. (1) `guardrails.mjs` and `os-lint.mjs` named the
main checkout in a constant, so a commit or a lint made from a git worktree was judged against the WRONG tree (the
unreviewed-ownership block never saw a worktree's diff). Both now resolve the tree from the cwd and accept it only if git says
it shares the main repo's common dir; anything else falls back to main / skips the rule (fail open — this hook has refused the
legitimate user nine times). A lint of another tree is read-only for the shared size baselines (they ratchet DOWN; an older
branch would re-pin the ceiling under main). The hooks themselves still run from main's copy (settings.json), so the fix is
live only once it is on master. (2) `.claude/launch.json`'s server and the scratch Node server both served `/.env`; the latter
bound every interface. Both now refuse dot segments, 8.3 short names, `:` streams and unlisted file types; the Node one is
`scripts/preview-server.mjs` (binds 127.0.0.1, Host-checked), and ONE attack test runs against both. launch.json's PowerShell server CANNOT bind loopback only
(http.sys listens on every interface and matches only the Host NAME — measured by the pre-push review, a forged Host over the LAN got 200), so it
refuses any client whose address is not loopback instead. **Rejected:** a bare
"deny paths starting with a dot" (misses `ENV~1`, found by trying it). Serving an OLDER module on purpose (a neuter run) now
needs the explicit `ALLOW_SERVER_MODULE_MISMATCH=1`, because `global-setup` now compares every served script/stylesheet, not only
index.html. (3) A ticked set whose reps or weight is cleared afterwards is dropped from the session AND un-ticked
(`_rowIncompleteReason`, shared with the tick). **Rejected:** refusing at the edit (needs a re-render per keystroke, which
round 1 showed tears the table from under taps). **Jake confirmed it, with a warning (option B):** the finish screen says a ticked
set was left out and Save repeats it, so the drop is never silent. (4) The weekly percentage wave no longer rewrites a set pointed at
"today's top set" (Jake: option 2): wave numbers are percentages of a max, and on a back-off set they became a load nobody chose.

**2026-10-01 — The runner's effort field does NOT re-render on edit; it follows the same "edit, then re-tick" contract as weight and reps.**
Review round 1 found that typing an RPE *after* ticking the top set did nothing, and the first fix added an
`onchange` that called `renderRunner()` on a ticked row's effort field. Round 2 showed why that cannot stay:
mousedown on any other control blurs the field first, `change` fires, `renderRunner()` replaces the node under
the pointer, and the click is never dispatched — so the tap on, say, the next set's ✓ simply did nothing
(reproduced: with the old code that set stayed unlogged). A wider first version had already turned seven
passing tests red. It also made effort the *only* field that behaved that way. **Rejected:** (a) re-render on
change, for the reason above; (b) patching the chip and backoff placeholders in place on change, which would
create a second code path computing the same display as the renderer — one fact in two fields — in the
runner's hottest region. **Chosen:** no handler; the backoff row's note now says what to do ("Enter the top
set's RPE (0–10), then tick it again"). The same rule governs the builder's "top set has no effort" warning,
which is shown/hidden *in place* from `oninput` rather than by re-rendering the list. Do not add a
change/blur handler that replaces DOM containing other controls. Related: `_effortOrNull`
(`js/app-runner.js`) is the one definition of a storable effort value (0–10); every `effort_value` writer and
the live estimate go through it, and `tests-node/effort-guard.test.mjs` pins that.

**2026-09-30 — The preview server serves the checkout it was launched from, not a hardcoded path.**
`.claude/launch.json` is git-TRACKED and its PowerShell server hardcoded `Join-Path
'C:/Users/jaken/OneDrive/coachapp'`. Every git worktree therefore inherited it and served the MAIN
checkout's `js/` while Playwright ran the WORKTREE's specs — a worktree suite could go green having
tested code its author never wrote. Measured on `worktree-rpe-top-set`: 5 specs failed in ways that
read as application bugs; pointed at the right root the same specs went 13 passed / 3 failed, and
only the 3 genuinely unimplemented ones were red. It now serves `(Get-Location)` (Playwright spawns
`webServer` with cwd set to the config's own directory), refuses to start where there is no
`index.html`, and prints the directory it serves. **Rejected:** leaving it and relying on
`PREVIEW_SERVER_CMD` per run — a safeguard you must remember to apply is the failure mode, not the
fix. The real gap was that `global-setup`'s precondition only checked the `<title>`, which reads
"CoachApp" in every checkout; it now compares the served `index.html` against this checkout's
(normalising the BOM and CRLF), and `check-preview-server.selftest.mjs` gained cases 5 and 6 so both
the new refusal and the BOM false positive are pinned. Do not restore the absolute path.

**2026-09-28 — The runner is "log-first": the set table comes straight after the tabs, and the occasional things moved out of its way.**
Jake's runner walkthrough (items 7 and 8 of 8): "the UI on this page is not user friendly." Measured on a phone, the first
set row began **252px** below the tabs, under a Swap/Add row, a stats card and three prescription boxes. Now: Swap, Add and
Units are behind a "⋯" button (a sheet, the app's existing bottom-sheet `.modal-overlay`, because the app has no dropdown
precedent); the prescription is one line under the title; the table follows the tabs; the stats card is replaced by one
"Last time" line with a filled **Stats** button (a bare "›" was easy to miss, and Jake asked for something obviously
clickable) that opens a sheet with last session's sets, today vs last time, a Chart.js progress chart (Top set / Est. 1RM /
Volume, reusing the Progress page's `_renderMetricChart`) and the heaviest lift ever (`_prBaseline`); and the bottom bar is
always there — **Skip exercise** on an untouched exercise (the dashed "Log a set to continue" dead end is gone), Next
exercise once started, Finish when nothing is left, naming the exercise it goes to. (An untouched *last* exercise reads a neutral "Finish workout" and goes through the End button's own flow: a big green Finish there made a mis-tap end the session, and the finish screen has no way back to the runner.) Designed and approved from a working
prototype, not a description. Deliberate limits: the Stats sheet is for weight × reps exercises with a previous session (the
same gate the old card had); the cardio/interval screens keep their own controls and get only the new header. The history read
is the last 60 workouts and then only this exercise's rows in them, capped at 12 sessions, so it cannot be silently cut by the
API's 200-row limit.

**2026-09-28 — "Next exercise" goes to what is still to do, not to the next number; a tab shows completion, not position.**
Jake's runner walkthrough (items 2-6 of 8). The runner knew only an exercise's position: tab colour was "a lower number
than the current one" and Next was `exIdx++`, so skipping 1 to 3 left a never-touched 2 looking done and carried on to 4.
An exercise is now *complete* when every set is done (interval blocks count work rounds only, via `_countableSets`).
Tabs: green = complete, purple = current, plain otherwise. Next, from a complete exercise, goes to the lowest one still to
do; from an unfinished one (a skip) it goes to the next unfinished one AFTER it and finishes if there is none. The first
version wrapped round to the start when nothing lay ahead; review showed that cycles for ever when every exercise is half
done, so it does not. Every "which is next" question (button, "Next:" lines, rest bars, cardio auto-advance) asks the
one function, `_nextExerciseTarget`. Known consequence, left for the runner restructure: an exercise with no sets logged has
no Next/Skip button, so being sent back to a skipped one leaves the End button as the way out. The Back button is gone
(the tabs go back); the title shrinks to fit instead of being cut off. Ledger:
[bugs/2026-09-28-runner-tabs-show-position-not-completion-and-next-exercise-cannot-return-to-a-skipped-one.md](bugs/2026-09-28-runner-tabs-show-position-not-completion-and-next-exercise-cannot-return-to-a-skipped-one.md).

**2026-09-27 — A push runs static checks only; the browser and the mutation self-test are the release's job.**
Jake: "make the commit and push cycle easy again". Pushing master stopped deploying on 2026-09-05, and
`release.mjs` runs the full suite plus `checks.sh` before every tag, so the push gate was checking the same
things twice.

Measured the same day:
- a push cost ~7 min: `checks.sh`'s static part 123 s, plus the 2-spec browser smoke run 5.0 min;
- the SQL mutation self-test alone was 45 s of the static part.

What changed:
- `checks.sh` now has two modes:
  - **FAST**, the local pre-push default: measured **51 s**. It skips the smoke run and the mutation self-test.
  - **FULL** (`CI=true`, i.e. GitHub Actions and `release.mjs`, or `CHECKS_FULL=1`): measured 96 s. It runs everything
    it ran before, minus the browser, which `release.mjs` covers with the full suite.
- `CHECKS_SMOKE=1` brings the smoke run back for one push.

**Accepted cost:** master can now carry a browser regression until the next release, where before the 2 smoke specs
would have caught some of them at push. Nothing reaches the live site without the full suite.

**Rejected:** a warn-only push that never blocks. Jake chose to keep the static checks blocking.

**Same day, the release became one command.** `release.mjs vX --push` now fills the notes' `{{AUTO:VERIFICATION}}`
line from its own suite run, commits the notes, tags and pushes. The old four steps were: `--record`, paste the
numbers by hand, commit, run again.
- The review found one blocking gap, fixed before commit: the notes commit and the tag were not pinned to the verified
  code.
- The script now refuses unless:
  - HEAD and the code fingerprint are unchanged since the suite ran;
  - the notes commit contains only the notes file (`--only`);
  - that commit sits directly on the verified commit.
- It then tags that exact commit.

**The suite's duration was investigated, not fixed.** The last run took 41.5 min against a "usual 14.0 min". A
same-day A/B refuted the guess that video recording and test output inside OneDrive cause it: the same 59 tests took
5.0 min as-is and 5.8 min with video off and output outside OneDrive. The likelier cause, unverified, is that the
14-minute baseline predates the suite's growth to 125 spec files.

**2026-09-27 — A write that spans tables goes through one transactional database function, not a browser chain.**
The app-code audit (`archive/app-code-audit-2026-09-27.md`, R1) found the programme lifecycle written as chains of separate
browser→API writes. Careful code could detect partial state, but it could not prevent it, and a restart could delete a
client's plan and then fail to insert the new one.
- **First instance:** `assign_program()` (`scripts/add-assign-program-rpc-2026-09-27.sql`), used by both assign buttons.
- **The shape, for the next ones (`deleteProgram`, `deletePhaseWeek`):**
  - `security invoker`, so row-level security stays the boundary and the function only adds checks;
  - a pinned `search_path`;
  - execute granted to `authenticated` only;
  - errors raised with codes the JS maps to plain messages;
  - verified on PGlite with the live policies and a mutation suite before Jake runs it.
- **Rejected: `security definer`.** It would have made the function the security boundary and bypassed every policy.
- **Rejected: keeping the browser chain with more guards.** Each guard adds a round-trip and one more place to forget, and
  no guard makes a sequence of writes atomic.
- **Cost:** the logic now lives in SQL as well as JS. The restart archive and sweep exist in both (`_archiveAssignmentBlock`
  / `_removeAssignmentAndClones` still serve unassign and delete), and each copy's comment names the other.

**2026-09-27 — The operating system was cut back to what refuses, what is broken, and what Jake can answer.** An audit
the same day found the OS disrupting its operator and its alarms meaning nothing. Changes:

- **The per-message hook is retired.** On this Windows machine every hook invocation opens a visible console window —
  a known Claude Code bug with no setting to suppress it (per a `claude-code-guide` research pass; the cited GitHub
  issues were not opened by hand). `standing-behaviours.mjs` fired on every message, so its static text moved into
  `CLAUDE.md` ("Standing behaviours"), which costs no process. Its unfinished-ritual check moved into `os-lint`
  (once per session). The remaining hooks (SessionStart, the Bash pre/post guard, Stop) still open a window each.
- **`os-lint` has three severities.** RED means the machinery is broken or a rule was just broken; WARN is worth
  knowing; DIGEST — stale bugs, ungraded predictions, the review and self-test cadence, the confirmation queue,
  and the new retirement list — prints once a week (`--report` any time). Before this, several items were RED at
  nearly every session start, which is the alarm fatigue the file names as its own worst failure mode.
- **Bug statuses are defined** (the `confirmed` status had no written meaning; 54 rows used it), and a new
  terminal status `unverified-accepted` exists for fixes Jake agrees, in a batch, to stop tracking. **Only Jake
  sets it, per batch** — never applied by age, which would break the closure rule. `scripts/ledger-batch.mjs`
  prints the oldest waiting rows as a numbered yes / no / accept list.
- **The release review gate checks WHAT was reviewed, not WHEN.** The review records a fingerprint of the code it
  saw (`scripts/lib/review-fingerprint.mjs`); `release.mjs` passes when HEAD is exactly that code. The old
  timestamp rule failed every correctly-reviewed ownership release (review before commit ⇒ marker older than the
  commit) and could only be passed by re-stamping the marker by hand. `release.mjs` also now waits out an
  in-progress CI run instead of failing with "0 tests ran".
- **Open security write-ups are embargoed** (`checks.sh` rule 9o): a bug row marked `security: true` and `open`
  refuses the push; keep it in `docs/bugs/embargo/` (git-ignored) until the fix is live. *Not chosen:* making the
  repo private — GitHub Pages on a free plan serves public repos only, so the live site would go down.
- **Hard-coded counts removed** from `CLAUDE.md`, `hello-claude`, `architecture.md`, `handover.md` and
  `technical-debt.md` ("~59 of ~757 tests", "2 of 105 spec files" — both stale).

*Not done, needs Jake:* applying any `unverified-accepted` batch; deciding whether the remaining Stop / Bash hooks
are worth a window each.

**Same day, Jake's call — CI no longer runs browser tests.** The `e2e` job in `deploy.yml` ran the same two spec files
the local pre-push hook already runs, against the one shared test account, so every push started a run that collided
with local suite runs (the CI-overlap guard in `tests/global-setup.js` then refused the local run — twice during the
v2026.09.8 release). A separate CI test account was the first idea and was rejected again for the reason recorded on
2026-09-04: a fresh account has no master/solo setup, so `solo-account.spec.js` would skip itself and CI would go
green having tested less. So the job was removed, and with it the CI-overlap guard and the release script's CI wait.
Browser coverage (superseded the same day — a push now runs no browser tests, see the entry above): the pre-push smoke gate (local, every push) and the full suite in `scripts/release.mjs` (every
release). *Lost:* a clean-Linux-machine run of those two files. The six test-login GitHub secrets are no longer read.

---

**2026-09-26 — A client may detach themselves from their coach, but may no longer point their own `clients` row at ANOTHER
coach; the rule lives in a trigger keyed on `current_user`.** Jake's read-only query of the live `clients` policies confirmed that
`clients_update_own_row` pins only `user_id`, so a client could rewrite their own `coach_id` to anyone's id and appear in a
stranger's roster (ledger `2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row`). Self-detach (setting it to
NULL) was already accepted when weight goals shipped and stays; Jake chose to close ONLY the attach half. Done as a
`BEFORE UPDATE OF coach_id` trigger, not a policy change: the policies OR together, so tightening one leaves the others open
(the coach policies and the invite-claim policy both write this column), whereas a trigger gives one rule for every path. It
refuses when `current_user` is `authenticated` or `anon` (the role PostgREST switches to), so the SQL editor, the service role
and admin-owned functions are untouched. *Not chosen:* `auth.role()` (reads a request claim rather than the role actually in
force); a column-level `REVOKE UPDATE (coach_id)` (would also stop coaches and the invite path, and would not distinguish
self-detach); blocking self-detach too (needs the cancellation workflow designed — banked). *Consequence, stated because it is
new:* self-detach is now ONE-WAY from the API (before the guard a client could set it back); undoing one is a line in the SQL
editor, and any future "resume coaching" flow needs the service role or an admin-owned function. *Limits:* a `SECURITY DEFINER`
function that changes `coach_id` is not caught (none is known, but the live database's functions are not all in the repo —
unverified); INSERT is covered by the existing policy pinning `coach_id`; the source of the `invite-client` Edge Function is not in
the repo, so it is unverified that it never changes `coach_id` under a caller's JWT (send one invite after applying). A
three-angle review found no blocking flaw in the SQL and one in its proof (the mutation for the admin exemption switched the
whole guard off instead, so nothing tested the exemption) — fixed before the commit.
The first verifier draft assumed an invitee's `UPDATE … WHERE id = … RETURNING` reaches the trigger; it does not — measured
2026-09-26 on the local copy of the live policies: a claim with `WHERE id` (with or without `RETURNING`) or `WHERE email … AND
user_id IS NULL` matches no row (the unclaimed row passes no SELECT policy, and any WHERE needs SELECT rights); only a
filter-free statement claims it. So through the app's normal filtered updates the "Client stamps own user_id" policy can never
fire — live invite acceptance must go through `handle_new_user` or an Edge Function (not in this repo; unverified). The verifier
therefore uses filter-free statements for the invitee cases and reproduces the hole BEFORE the script, which is what makes a
green result mean something. Applied only when Jake runs the script.

---

**2026-09-19 to 2026-09-21** — the unbounded-reads ratchet, local SQL execution (PGlite), paged reads of growing tables,
automatic error capture and the feedback link, deleting the Benchmarks tab — archived verbatim in
[archive/decisions-2026-09-19-to-2026-09-21.md](archive/decisions-2026-09-19-to-2026-09-21.md).

**Older entries (2026-09-15 to 2026-09-18)** — the repo becoming the system of record, the full Vault severing,
predictions moving into the repo, ritual markers, and the OS retrospective — are archived verbatim in
[archive/decisions-2026-09-15-to-2026-09-18.md](archive/decisions-2026-09-15-to-2026-09-18.md).
