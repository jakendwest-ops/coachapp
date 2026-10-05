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

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse.**
Jake: "we shouldn't be in the vault, that was severed a month ago and everything now lives inside the repo ... investigate how this has happened even
after you confirmed the vault was severed, and then ensure this does not reoccur." *What happened:* the conversation that did the 2026-10-03/04 releases
was created on 2026-09-19 as "Hello Claude" in `C:\Users\jaken\Claude` (the Vision OS folder) and carried on there through 8 context compactions: 17,892 of
its 18,253 working-folder records before it was moved name the Vault (the other 361: one terminal call that passed the repo as its cwd, and the half hour
after the move was requested). Its first command, `/hello-claude`, answered "Unknown skill"; so did `/save` on 2026-09-28. The repo's CLAUDE.md, skills,
hooks (os-lint at start, guardrails on every tool call, claim-check at stop - all registered at PROJECT level, so they exist only in a repo-rooted session)
and auto-memory never loaded; the Vision OS kernel did. Memory was read from, and written to, a second folder keyed to the Vault (51 notes) while the
repo-keyed folder held 57 others, neither complete. The hard gates (git hooks, `release.mjs`, CI) held, which is why two releases shipped green from a
session with none of the soft ones. *Why the severing did not catch it (each is a hole, not an accident):* (1) it was verified on FILES - docs, hooks,
skills, ledgers - the easy evidence class; nobody checked where Jake's sessions START, and all 22 sessions the app lists (this one included) started in the
Vision OS folder or one of its worktrees (20 still sit there; two were moved to the repo later - a 2026-09-07 session, and this one) (his own opening prompts on 09-17/18
were "please read the repo to get up to date before this session" - the workaround pattern). (2) `os-lint`'s `no-vault-pointers` matched `Claude/Vault`, the
data subfolder, and was BLIND to the folder above it that sessions actually start in. (3) The `cd` guard in `hello-claude`/`save` was circular - it lives in
skills that are not registered in the failing case - and would have masked the problem where it did run, since a shell `cd` loads no CLAUDE.md, hooks or
memory; CLAUDE.md and the memory note both said "not yet verified" with no owner or date, for 17 days. (4) The failure was visible on command one and was
ACCOMMODATED: the 2026-10-04 pre-push-review entry's Process note ends "so it is not registered in a session whose folder is the Vault - follow it by
reading the file", and my own summaries said "harness cwd is the Vault; real work uses absolute paths" - a fault written down as a workaround, never
escalated. (5) Auto-memory is keyed by launch folder and lives outside the repo, so a mis-rooted session silently gets different memory and no check
compared the two. (6) The Vault still carried a welcome mat: its kernel and `/vault-save` called CoachApp's `/save` "legitimate and current" and gave CoachApp
a branch in the Vault ritual; its local `launch.json` held a CoachApp preview server; and the USER-level `~/.claude/settings.json` held two live Vault
entries no check scans - a permission to append to `Vault/ledgers/log.md` and `Vault/ledgers` as an extra directory for EVERY session. (7) On 2026-10-04 I
confirmed "severed" again, from inside the Vault session, with "Shell cwd was reset to C:\Users\jaken\Claude" on screen after every command.
*What changed (each one refuses or reports, none is only a sentence):* a user-level SessionStart hook, `.claude/hooks/session-root-guard.mjs` (code in this
repo, registered in `~/.claude/settings.json` so it fires in the Vault; its self-test, mutation-checked against 13 mutations, proves it fires on the Vault, a
Vault worktree, the Git-Bash spelling, a lower-case drive and a compaction, and stays silent in the repo, a prefix lookalike, `~/.claude` and on empty, garbage
or JSON `null` input) tells Jake (`systemMessage`) and the model (`additionalContext`) on every start, resume and compaction to move the session to the repo
with `mcp__ccd_directory__change_directory` instead of working around it - and what a move does not carry (below) - and logs each run to
`~/.claude/state/session-root-guard.log`. `os-lint` goes RED through its `hooks` check if that registration is lost; RED through the new `memory-split` check if
anything new lands in the Vault-keyed memory folder (now a frozen stub; it keys on the folder, not on the word "CoachApp", because 24 of the 51 notes a
Vault-rooted session really wrote never contain it); WARNs through `vault-rooted-session` when a recent transcript's last working folder is still the Vault and it
has made 3 or more tool calls on the repo's files (calibrated on this conversation: 9 of its 10 windows had 7-21 such calls, and on a real slice from just before
the move it reads 18); and `no-vault-pointers` now also matches the launch root. Memory was merged into ONE folder (the repo-keyed one: 109 notes, index and Rule 0
green; the seven notes that still told a session to use the Vault were corrected, and the originals of the Vault-keyed folder archived untouched beside a stub
index that tells a Vault-rooted session to stop). Removed: the Vault's CoachApp preview server and a stale rule from its local config, the two live Vault entries
in `~/.claude/settings.json`, and the CoachApp references in the Vault's own kernel and `/vault-save` (committed in the Vault repo, not pushed). `CLAUDE.md`,
`hello-claude` and `save` now say the session's ROOT must be the repo: stop, start a NEW session there (or move, then read what a move does not carry), never `cd`
past it. *What a move carries (measured in this conversation's own transcript, 2026-10-05):* it was moved with `change_directory` (requested 03:43Z; the
transcript's working folder is the repo from 04:14Z). Hooks followed - os-lint ran at the next compaction, and the guard logged `cwd` = the repo with the same
session id, the first real hook input seen - and so did the skill listing (`hello-claude` and the other repo skills appear at 04:37Z). CLAUDE.md and the
auto-memory path did NOT follow at once: at the 04:40Z compaction the harness re-attached the Vault's CLAUDE.md and the Vault-keyed `MEMORY.md`; at 05:25Z, the first turn after that compaction, it re-read its instruction files (`reason: compaction`) and swapped in the repo's CLAUDE.md, while the memory index stayed the Vault-keyed one (re-read from disk: the stub). A moved session is therefore only
partly re-rooted, which the guard, CLAUDE.md and `hello-claude` now say (read the repo's CLAUDE.md and memory index yourself; write memory only into the repo-keyed
folder); a NEW session on the repo is the clean fix. *Superseded:* the "follow it by reading the file" accommodation in the 2026-10-04 pre-push-review entry - a
wrong-folder session is stopped, not worked around. *Honest limits:* the desktop app's default folder for a new session is the app's, not ours (its settings tool
exposes none), so a session can still START in the Vault - the guard makes that visible rather than impossible. VERIFIED the same day for a real Vault-rooted start: a headless CLI session started in the Vault folder fired the guard and the model quoted its notice back (log line `source: startup`, `fired: true`). UNVERIFIED: that the desktop app shows the guard's
`systemMessage` to Jake (the `additionalContext` route is proven: the model quoted it), and what a Vault-rooted START looks like in the desktop app - the next
new session in the Vault folder will show it (the log gains a `fired: true` line). The long transcript now sits in the repo-keyed project folder; about a dozen stale
July worktrees under the Vault still hold copies of the old CoachApp launch config (inert). *Review and calibration:* a fresh-context review of this change found
nothing blocking; it and the calibration it prompted turned up these faults, fixed before commit: the guard crashed on a JSON `null` input; the first
`memory-split` keyed on the word "CoachApp" and would have missed 24 of the 51 notes a Vault-rooted session wrote; the first `vault-rooted-session` counted mentions
(the guard's own text inflates them) and trusted a file's mtime (a 09-18 session read as live on 10-03); the first measurement of what a move carries stopped at the 04:40Z compaction and read CLAUDE.md as never following, which the 05:25Z re-read overturned (above); and this
entry's counts were off.

**2026-10-04 — Jake answered the two questions that came with the program-page build: the Undulating Reps boxes are removed, and a program opens on the phase the viewer's own plan is in (built, not released).**
His words: "remove and open current phase." This supersedes the last sentence of the entry below ("'open the phase you are in' ... is not built")
and its choice to leave the % side's Reps boxes alone. *Reps:* the % Undulating tiers had a "Reps" box that saved to
`periodization_config.tiers.<tier>.reps` and that nothing read when weeks were generated (only a tier's %1RM / RPE is read). Of the three
options I gave him (make it work, remove it, leave it and say so) he took the removal. The boxes are gone from both methods; a tier is its
%1RM or its RPE and nothing else; saving the dialog writes only that, so reps typed earlier are dropped from the stored config the next
time a phase is saved (nothing read them; a rollback would show the old dialog's default Reps text instead of the old value). The 2026-09-20
escaping spec had pinned those inputs; its hostile-string test now proves that a stored reps string reaches NOTHING (no input, no
attribute, no element), and a new test in the RPE spec pins the save shape. *Current phase:* `openProgram` used to open the first phase.
It now asks `_existingAssignment(window._soloClientId, programId)` - the viewer's OWN record of the program - in parallel with the program
query, and `_pgmCurrentPhaseId` turns that into a phase: the phase today falls in, counted by `_programWeeksElapsed` (Monday-to-Sunday weeks,
the dashboard's count) and `_programPhaseAt`. That last function is the loop that already lived inside `_dashProgramInfo`, moved unchanged
into `app-dashboard.js` and now called by both, so the program tile and the program page are one rule for a running plan, not two copies
that could drift (a unit test walks the tile and the helper across 71 days for four start days, and a browser test puts the tile and the
page side by side). The current phase opens on a first visit, wears a small "Now" pill whether folded or open, and what Jake opens or folds
afterwards is kept like before (a phase added later starts folded; `_pgmOpenState` takes the current phase as a third argument and keeps
its fresh-set rule). *Choices made on Jake's behalf, all reversible:* only the viewer's own plan counts - a coach looking at a program they
built for a client still sees the first phase open, because the coach is not the one following it; a plan that has not started yet (its
Monday is a later week), a plan that has finished, a program the viewer is not following, a failed lookup and a program with no phases all
open the first phase and show no "Now" (there is no current phase to claim). The dashboard tile still says the LAST phase for a finished plan
- it has to say something - so the tile and the page differ there on purpose. *Found by re-reading my own change before the regression
run:* the plan lookup was awaited a second time, AFTER `openProgram` had set `window._openProgramId` / `_openProgramPhases` and before it
painted; the old code had no yield between those two steps, so a quick second visit (or a tap on another tab) could set the globals under
the first visit's paint and leave the buttons reading a different program from the one on screen. It is now one `Promise.all` - the program
and the plan in the same round trip, a single await before anything is set - and a source-scanner unit test fails if an `await` ever comes
back between the globals and the paint. *Verified:* 17 new unit tests (the open state, the shared phase rule on every boundary,
`_pgmCurrentPhaseId` including errors and odd dates, and the await scanner with its own control), 6 new browser tests (a running plan
opens its phase with the right bar block and Now badge and paints it; the six boundary weeks 0, 1, 2, 4, 5 and 6; not following / not
started / finished; choices kept and Now stays; the tile and the page name the same phase; no Reps box on the % side and the save shape),
and 21 deliberate breakages, each of which must fail a test (11 on the pure helpers and the scanner, 10 on the browser specs): one
survived the first time - an error-result guard that real data never needs, since a failed lookup carries no start date anyway - and a
test with an error that does carry a date now kills it.
*Reviewed* by the pinned `multi-agent-review` (diff mode, three fixed angles, over this increment only; cut off once more by Jake's usage
limit and resumed from their saved context, the repo untouched in between): no blocking finding at any angle. *Fixed:* the shape comment
for the RPE Undulating config still listed `reps`; the % tier input lacked the `aria-label` its RPE twin has (added, and the attribute-list
assertion that pinned it updated); the hostile-reps test had only absence assertions, which a dialog that rendered nothing would also
pass (it now also checks that each tier shows its stored %1RM); one test title claimed the Sunday-before edge while only varying whole
weeks (renamed - the node tests own that edge). *Checked by the reviewers and worth keeping:* the shared phase function equals the
removed loop on about 592,000 input combinations in each of six time zones (four with daylight-saving changes), zero differences; the
page's week rule agrees with the calendar's and the tile's over 4,620 calendar days, zero disagreements; the one new read (`_existingAssignment`)
returns only the viewer's own row under the policies mirrored in the repo, and a client cannot reach the page. *Accepted and recorded*
([technical-debt.md](technical-debt.md)): "Now" follows the assignment of THIS program while the tile, the Workouts hero and the calendar
follow the newest assignment across all programs, so with two plans running at once the older program's page also says Now (one more read
would fix it; it was judged not worth it for a case that is rare and cosmetic); the Workouts hero keeps a third copy of the phase loop
because it also needs the week within the phase. *Honest limits:* the reviewers are the same model as the author and none ran a browser;
the browser block runs as the PT in coach view only (solo view and a pure coach share the one branch, `window._soloClientId ? … : null`,
and were reasoned about, not driven); the "tile and page name the same phase" browser test feeds the page's row to the tile function
rather than the tile's own newest-assignment pick, and its unit twin is a drift guard now that the tile calls the helper - the equivalence
with the OLD loop rests on the reviewers' brute-force run, not on a test in the repo.

**2026-10-04 — The program page is an overview plus fold-up phases, and periodization has an RPE method beside %: built (not released).**
Jake's items 4 and 5 (his 2026-10-04 note), scoped by form, shown as a tappable prototype, then "approved - build both". (He later noticed
neither was on the live site: right - `v2026.09.14` carried items 1-3 only, and the build was still in progress.) *The page:* the top says
what the program is - the name, "N phases · W weeks · a-b sessions a week", the description clamped to two lines with "Show more" (only when
it really is cut off), the one main button, and a bar with a block per phase (as wide as its weeks, coloured by method, tap to jump). Each
phase is a fold-up card. A folded card holds NOTHING of the builder in the DOM - the body is painted from the cached sessions on unfold, so
a 12-phase program no longer draws 12 weeks at once - and only the first phase starts open (the first phase added to an empty program opens
too: `programs.spec.js` adds a phase through the form and then looks for the day slots, which is how the rule was found). Inside an open
phase: the periodization row (Add / Edit periodization and Generate weeks stay visible, because Generate is the step to remember after
editing Week 1 - a deviation from the prototype, which hid it in the menu), the week tabs with the week's ⋯, and, below 768 px, the seven
days as slim rows (a rest day is one thin line with + Add; a day with two workouts stacks them); the 7-column desktop week is unchanged.
Edit / Remove a phase and Duplicate / Delete a week moved behind ⋯ sheets built like the runner's ⋯ menu - this app has no popover
precedent, so the prototype's dropdowns became sheets. A sheet row carries only a literal `kind`; the program, phase and week live in
`window._pgmMenu`, so no id and no free text sits in a handler string. Units moved into Manage (as in the runner's menu), and "add a second
workout on this day" moved from every filled day into the opened workout's panel. The `.week-tab` style is shared with the read-only
Workouts page, so it is restyled only under `.pgm`.
*Periodization:* the dialog has a "% of 1RM | RPE" switch, one method per phase. The method is `basis:'rpe'` inside the phase's untyped
`periodization_config`, so every existing phase is % and there is no migration (a % save still writes the shape it always did, with no
`basis`). Linear is start RPE to end RPE in half points with an optional deload week at its own RPE; Undulating gives Heavy / Moderate / Light
an RPE. Generation steps `effortMin` / `effortMax` of every Week-1 set that already has one (RIR converts, RIR = 10 - RPE; a real 0 counts),
and never touches a weight or a % field, so a "% of today's top set" back-off keeps the % the coach typed. The dialog shows a week-by-week
preview (Week 1 reads "as typed": generation never rewrites Week 1) and a heads-up that counts, with the wave functions themselves, exactly
the sets Generate will rewrite - and warns when there are none, or when Week 1 mixes values (every generated week gives them all one value,
as % does today). Generate itself ends in an amber toast, not a green one, when an RPE phase had nothing to step. The numbers typed for both
methods survive flipping the switch or the type. *Choices made on Jake's behalf, all reversible:* sheets, not dropdowns; Generate weeks
visible; no Reps boxes on the Undulating RPE tiers, because the same boxes on the % side are saved but never applied to a generated week
(filed: [bugs/2026-10-04-undulating-tier-reps-are-saved-but-never-applied.md](bugs/2026-10-04-undulating-tier-reps-are-saved-but-never-applied.md));
RPE accepts 1 to 10 in half points and a new RPE phase starts at 7 → 9; the amber "nothing stepped" toast is for RPE only (a % phase has
always been allowed to generate copies, for example an Undulating phase used just for its tier labels).
*Found by running the browser, not by the unit tests:* the dialog kept its current method in `window._pzBasis` while a function `_pzBasis()`
read a phase's method - a window property of the same name REPLACES the function, so after the first dialog open the page died with
"_pzBasis is not a function" and sat on "Loading…" after the next save. The state is now `window._pzMethod`, and
`tests-node/window-shadow.test.mjs` scans every script for a `window.x =` that shares a function's name (it found no other). Also found by
existing tests: the failure-counter source scanner (`silent-write-failures-2026-08-11.spec.js`) wants a `showToast` within four lines of each
counter, which an inserted note had pushed out; and the survivors of the deliberate breakages (a redundant snapshot call that a test now
kills by setting a value without an input event; a test aimed at the wrong selection; an untested phrase).
*Reviewed* by the pinned `multi-agent-review` (diff mode, three fixed angles; the reviewers were cut off once by Jake's usage limit and
resumed from their saved context, the repo untouched in between): no blocking finding at any angle, nine smaller points - *fixed:* "Delete
week" repainted only the sessions, so the overview line, the bar width, the card header and "Weeks 2-N follow Week 1" kept the old week count
(it now repaints the page, as Duplicate week does when it extends a phase); the periodization heads-up could describe an earlier visit's
Week 1 if the dialog was opened before the sessions loaded (a visit now starts with an empty cache and the open dialog redraws when the
sessions land); a test of "typed numbers survive flipping the switch" existed only for RPE (now also for the % side and the tiers); a
vacuous assertion (it ran before the sessions had loaded); a day with two workouts squeezed both names into one row on a phone (they stack
now); the keyboard lost its place on the bar after a jump and on the Method switch after a tap (restored); the week menus did not re-check the
phase against the page, as the phase menus do. *Carried* ([technical-debt.md](technical-debt.md)): `savePeriodizationConfig` ignores the
result of each per-session tier write (pre-existing, now shared by the RPE method), and a stored object with no callable `toString` would
make the dialog throw (needs crafted jsonb from the phase's own owner). Reviewers also confirmed: `basis` survives the only copy path
(`copyProgramToCoaching`), client copies receive the generated RPE values, no new query, no PII in logs, every new interpolation escaped.
*Verified:* 56 new unit tests (`tests-node`: periodization-rpe 40, program-page 13, window-shadow 3) and 36 new browser tests (the real
generator against real rows - Linear, Undulating, deload, nothing-to-step, a % phase unchanged - the real dialog, and the page); 75
deliberate breakages (29 on the pure helpers, 46 on the browser specs), each of which must fail a test - three survived the first time (a
redundant snapshot call, a mis-aimed test selection, an untested phrase) and each now has a test that kills it; the 24 existing builder /
periodization spec files and the 13 specs that name `app-programs.js` (seven of them read it as text) pass (`programs.spec.js` reaches
Duplicate / Delete week through the week's sheet - the same checks); `checks.sh` passes with the style-literal baselines unchanged; the full
node unit suite passes (347); screenshots read at 480, 320 and 1280 px, in the PT view and in the owner's Personal view. *Honest limits:*
nothing was seen on Jake's phone with his real six-phase program; the reviewers are the same model as the author (and none of them ran a
browser), so the review reduces anchoring, not shared blind spots; the follow-up fixes were verified by tests and breakages and were NOT
re-reviewed by the agents; "open the phase you are in" (rather than always the first) is not built.

**2026-10-04 — The pre-push multi-agent review found nothing blocking and twelve smaller points: eight fixed before the release, four carried; and that review is a hard gate in `release.mjs`, not an option.**
Jake said "push/deploy". I had told him the pre-push review would run "only if you ask" - wrong: `scripts/release.mjs` (gate 5) refuses to
tag until a review has recorded the exact code (`scripts/lib/review-fingerprint.mjs --record`, the last step of the pinned skill), and the
marker on disk predated the whole 2026-10-03/04 stack. So the pinned skill ran in diff mode over the 14 unpushed commits: three reviewers
with fixed angles (security and tenant scoping; solo-mode correctness across coach, client and solo; duplicates, render-safety and
regressions) and a verifier pass done by me against the cited lines. The reviewers were interrupted once by Jake's usage limit and resumed
from their saved context; the repo was checked untouched in between. *Result:* no blocking finding in any angle. *Fixed before the
release (each with a test written first and a deliberate breakage that fails it):* the coach dashboard's "Programs ending" counted
weeks x 7 days from the start date, so a Thursday start named a date 3 days after the client's calendar was empty (a Sunday start, 6
days) - the same slip as the program tile, now `_dashProgramEnd`; the Today card and the calendar card showed a periodised week's copy
name ("Upper Body — W2") while Up next showed "Upper Body" - one `_dashSessionName` for all three; "view as client" (owner only) left the
dashboard's weight, goals, calendar and program cards opening Progress, Workouts and Calendar, which show the OWNER's own record - those
cards and buttons are inert while it is on (CSS `.dash-sudo`); "Program complete" appeared in week 5 of 6 when a lengthened phase had no
sessions generated for the new weeks - it now says "No more sessions are set up yet" until the last week is reached; the folded
exercise line went stale after a measure pill was tapped on the open card; `_perfView` is now set before any chart is drawn; the chart
registry is filtered by the chart (Chart.js clears `chart.canvas` on destroy, so filtering by canvas never matched); a stale comment.
*Carried (docs/technical-debt.md):* the coach "Goals due soon" read is scoped by database permissions alone (unchanged from the page it
replaced; anchoring it would silently drop goals past 200 clients); raw ids in the Up next button's handler (uuids, the pre-existing
shape); the Stats sheet matches history by exercise name while Last time matches by exercise id first; dead code the dashboard rework
left (`_pbFormHtml` and its helpers). Also filed: view-as only works on the dashboard
([bugs/2026-10-04-view-as-client-only-works-on-the-dashboard.md](bugs/2026-10-04-view-as-client-only-works-on-the-dashboard.md)). *Honest limits:* the reviewers
are the same model as the author, so the review reduces anchoring, not shared blind spots (most likely "the live security rules are
right", which neither side can see from the repo); none of them ran the browser; the fixes above were verified by tests and
deliberate breakages and were NOT re-reviewed by the agents. *Process:* the pinned skill now lives only in the CoachApp repo
(`.claude/skills/multi-agent-review/SKILL.md`; the copy under `~/.claude/skills` that an older note points to is gone), so it is not
registered in a session whose folder is the Vault - follow it by reading the file.

**2026-10-04 — "Up next" names the session you would do next and agrees with the dashboard; program weeks are Monday-to-Sunday like the calendar; the Last time panel shows the top set; My progress cards fold up and only open ones draw a chart; the program page gets fold-up phases and periodization gains an RPE method (scoped, prototype next).**
Jake's note of 2026-10-04 had five items; three were small enough to approve from a before-and-after sketch and two were scoped with him
the way the dashboard was (a short form, then a tappable prototype, then his "approved"). *Up next (Workouts page).* He asked for the
workout's name. Reading the code showed the card (`_buildWorkoutsHero`) took the FIRST session of the current program week and ignored
both today's date and what was already logged, so after Monday's workout it still pointed at Monday's and a name would sometimes have
named the wrong workout. *Chosen:* the dashboard's reading of a day - a planned session TODAY that is not logged yet, otherwise the
first planned session after today (`_dashNextSession`) - found with the calendar's own date map (`_programWorkoutsByDate`, which now
also records each session's phase and its week of that phase). The card says "Up next - Today" or "Up next - Mon 5 Oct", names the
workout (a periodised week copy's " - W2" suffix is not shown), says "Program - Phase - Week N" and "+1 more today" when two sessions
share the day, and Start launches the client's OWN copy. When every dated session is behind us it says "Program complete" and offers a
freeform session; with no start date there is no dated plan and the old reading is kept, with the name. *Not chosen:* just adding the
name to the old card; offering the second session of a two-a-day once the first is logged (the dashboard counts a day as done once
anything is logged on it, and one rule on both screens matters more than that edge). *Program weeks:* the calendar anchors week 1 to
the MONDAY of the start date's week, but the dashboard's "Wk N of M" tile and the old card counted seven-day blocks from the start
date, so for a program that started mid-week they disagreed for a few days of every week (my slip in the dashboard commit);
`_programWeeksElapsed` now counts Monday-to-Sunday weeks and both use it. *Last time panel:* it now says "Top set 23 kg x 5" (with
"@9" for a logged RPE, "@2 RIR" for RIR, "12 reps" for a bodyweight lift) under "Last time - 29 Sept - 2 sets". "Top set" is the Stats
card's definition (the heaviest set, a tie going to more reps, warm-ups never counted), so the two cannot disagree; the read behind the
panel now asks for each set's phase, which is what lets a warm-up be told from a working set. *Fold-up cards (My progress, Per
exercise):* every exercise was a card about 800px tall and every chart was drawn at once. Cards now start FOLDED (name and the card's
own one-line best, via the shared `_xsCaption`), open with a tap, and a Collapse all / Expand all button sits above the list; only an
open card has a body or a chart. Which cards are open is kept while the page is in use (a Map by exercise name in
`window._trendState.open`) so the search box, the range select and the measure pills do not close them; a search that finds exactly one
exercise opens it, but that automatic opening is not remembered and a card the person folded stays folded. Toggling touches ONE card;
the full list re-render (search, range, pills) is unchanged. *Not chosen:* re-rendering the whole list on every tap (it would redraw
the other open cards' charts); remembering open cards across visits (browser storage for a convenience nobody asked for);
folding the cards inside the runner's Stats sheet (it shows one exercise). *Scoped, not built:* the program page - Jake said all four of
too much scrolling, too many buttons, no overview and a cluttered top bother him, and chose fold-up phase cards (the Workouts page's
pattern); and periodization gets a "% of 1RM | RPE" tab, ONE method per phase (his answer: one or the other). The RPE method is
proposed as: Linear (start RPE to end RPE in half points, with an optional deload week) and Undulating (a Heavy / Moderate / Light RPE),
stepping the RPE target of every Week-1 set that has one and leaving weights, reps and "% of top set" back-offs as typed; a set written
in RIR converts (RIR = 10 - RPE); stored in the phase's untyped `periodization_config` so no database change is needed and every
existing phase stays on %. Prototype for his reaction: https://claude.ai/artifact/JQZDoiQAhpgWBxfJKPHgjr (a private page with example data). *Found and not fixed:* the runner
stamps a session with the UTC calendar day while every reader compares with the local day - harmless for a UK user except between
midnight and 1 am in summer, wrong every evening for anyone west of UTC; it changes saved data, so it has its own row. *Test hygiene:*
three existing tests counted every Chart on the page and broke when the test account's weigh-ins were re-seeded (the dashboard's
sparkline sits behind the runner), so they now count the charts of the card under test. *Verified:* 43 new unit tests and
29 new browser tests; twenty-seven deliberate breakages (six, eleven and ten across the three builds)
each failing the matching test; the specs around each change green (the 26, 34 and 32 spec files around the three changes). *Not verified:* how any of it
reads on a phone with real data; `multi-agent-review` ran on 2026-10-04 before the push (diff mode, three angles and a verifier: no blocking findings; its follow-ups are listed below). Rows: [bugs/2026-10-04-my-progress-exercise-cards-cannot-be-collapsed.md](bugs/2026-10-04-my-progress-exercise-cards-cannot-be-collapsed.md),
[bugs/2026-10-04-workouts-up-next-card-does-not-name-the-workout.md](bugs/2026-10-04-workouts-up-next-card-does-not-name-the-workout.md),
[bugs/2026-10-04-runner-last-time-panel-shows-no-top-set.md](bugs/2026-10-04-runner-last-time-panel-shows-no-top-set.md),
[bugs/2026-10-04-program-page-needs-a-ui-rework.md](bugs/2026-10-04-program-page-needs-a-ui-rework.md),
[bugs/2026-10-04-periodization-has-no-rpe-method.md](bugs/2026-10-04-periodization-has-no-rpe-method.md).

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
tests) green. *Not verified:* how it reads on a phone with real data; `multi-agent-review` ran on 2026-10-04 before the push (diff mode, three angles and a verifier: no blocking findings; its follow-ups are listed below). Row: [bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md](bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md).

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
