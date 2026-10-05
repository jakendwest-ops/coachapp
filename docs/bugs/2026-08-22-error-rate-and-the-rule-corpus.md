---
id: 2026-08-22-error-rate-and-the-rule-corpus
status: open
priority: high
reported: 2026-08-22
status_detail: "Jake-reported process problem, not an app bug. 2026-09-28: the measurement lapsed 5 weeks with no trigger attached to it (proving the row's own diagnosis). First real computation taken today on the row's actual metric (errors reaching Jake/a commit, not near-misses): zero — but this is session 1 of the count starting now, not 1 of 3 already in progress. A save-skill step now prompts this every session so it doesn't lapse again."
---

# Jake: "you have gotten numerous things wrong over the last 24 hours" — and the rules did not prevent it

Jake raised this directly on 2026-08-22, then asked whether the rule corpus itself was the cause
("Do you have too many rules that contradict"). Filed as a row because the remedies shipped the same
day but **the measurement that decides whether they worked has not been taken.**

## What was measured, not asserted

- **Roughly seventeen distinct errors in 24 hours**, in three groups: generalising from one instance
  to a class; stating a rule and breaking it in the same edit; skipping verification when a claim
  felt too small to check.
- **All six of the day's error classes ALREADY had a rule.** Not one was a gap. So rule availability
  was never the binding constraint, and adding a rule buys nothing.
- Corpus at the time: 41 feedback memories, ~309 imperatives across ~3,100 lines, growing ~20 new
  rules per month (24 in July, 16 in the first 22 days of August).
- **Contradictions: one live, created that same hour** — the review-timing rule changed in two places
  and left four stale. An earlier contradiction had already been found and fixed. So contradiction is
  a symptom, not the mechanism.

## The diagnosis

The rules are stated as things to KNOW; the failures are failures to ENUMERATE. Where an enumeration
actually ran that day the work was right first time (45 write sites across 23 functions, no review
finding against it) because the rule says COUNT. Every failure was somewhere a space was reasoned
about instead of listed.

Aggravating factor: **writing the rule produces the feeling of having applied it.** Three times in
24 hours a principle was stated in a comment and violated in the same edit.

## What shipped in response

- **RULE 0** — an incident produces a CHECK, or it produces nothing. Enforced by `os-lint`'s `rule-0`
  check (new memories must carry `enforced_by:`), not by prose. Proven able to go RED.
- Six prose rules converted to checks: piped-runner exit codes, unreviewed ownership commits, `git
  stash`, throwaway probe files, concurrent test runs, falsy-zero fields.
- Review moved from pre-push to **pre-commit** for ownership/RLS work.
- Five memory families merged, one deleted. 41 → 40.
- Two rules measured as NOT mechanisable and recorded as `enforced_by: none` with the reason.

## What is NOT settled

- **Trimming was measured to be the weakest lever.** Files fell 41→35 in the merge but imperatives
  only 129→125 — merging without summarising moves text rather than removing it. The prediction that
  the merge would kill most imperatives was **wrong**.
- The guards produced **six false refusals** on their first day. None blocked real work (all on
  read-only inspection or the wrong repo), and each is now a permanent self-test case — but three
  shared one cause: *the guard examining a wider span than the rule covers*. The class was not fixed
  when the first instance was.
- Session length and number of concurrent concerns were **not** tested as a cause. They remain the
  live alternative hypothesis.

## Closes when

**The measurement is taken, not when the fixes are admired.** The number is *errors per session in
classes that already had a rule*. On 2026-08-22 it was **six of six**. If that ratio does not fall
over the next few sessions, the diagnosis was wrong and the corpus was never the mechanism — in which
case the honest next suspects are session length and concurrent scope, and this row should say so.

Jake closes this, or three consecutive sessions of the ratio do.

## 2026-09-28 — the measurement lapsed for 5 weeks; partial data, and why it isn't session 1 of 3

Nobody took this measurement between 2026-08-22 and today. That is itself evidence for the diagnosis this
row already reached: a rule stated once ("the measurement is taken, not when the fixes are admired") with
no trigger attached to it does not fire — exactly [[feedback_written_rules_dont_reduce_errors]], now
demonstrated on this row about rules not reducing errors.

**What was actually measured today, honestly, and why it does not count as session 1 of 3:**

The 2026-08-22 count (six of six error classes already had a rule) was built from errors that **reached
Jake** — things he noticed, complained about, or that a review caught after the fact. Reviewing this
session's own work for the same thing: **zero errors reached a commit, a claim to Jake, or a shipped
conclusion.** But that is not the same population as five self-caught near-misses that happened DURING the
session's own working process and were corrected before becoming a claim — a flawed test assertion that
would have reported a false "clobber" (caught by reading the failure output before concluding anything,
same class as sql-safety's "a check that observes the wrong signal"), an instinct to copy a sibling
function's exact fallback page without checking it was still valid for a different role (caught by reading
`js/app-core.js`'s per-role page lists before shipping), and three earlier-session instances already on
record (a self-contaminating test methodology, an invented helper call, a misread self-test harness) — all
in classes [[feedback_reports_success_doing_nothing]] or standing behaviour 3 ("no claim without a check
actually run") already cover, all caught before shipping.

Counting near-misses as if they were the same metric as 2026-08-22's Jake-perceived count would be
comparing two different things and calling it a trend — the exact "one fact in two fields" shape
[[feedback_two_fields_one_fact]] warns about, just within one row instead of across two. So: **today's
honest number, on the row's own defined metric (errors reaching Jake or a shipped claim, in a class that
already had a rule), is zero — but this is the FIRST time the metric has actually been computed since
2026-08-22, not a third of a trend.** Self-assessment also has an obvious blind spot this row's original
methodology didn't have to contend with: Jake did the counting on 2026-08-22, and a session cannot see the
mistake it doesn't notice it made.

**Mechanism added, so this stops lapsing:** `.claude/skills/save/SKILL.md` Step 1 now explicitly prompts
this measurement every session, scoped to the row's actual metric (errors that reached Jake, a commit, or a
shipped claim — not self-caught near-misses), with a pointer to log a dated entry here. This is a save-skill
step, not an os-lint hard gate — the classification itself needs judgement no mechanical check can do, and
the mechanism is deliberately the trigger this row's own diagnosis says a bare rule needs. Still: Jake
closes this, or three consecutive sessions computed THIS way do.

## 2026-09-28, later the same day — the runner-rebuild phase, and a correction to the entry above

**Correction first.** The entry above's "zero" missed a real instance from EARLIER the same session, before
it was written: cutting the v2026.09.7 release, I ran two `git push` commands concurrently (one via a
mistaken shell-backgrounding trick, one the normal tracked call) — both fired their own pre-push Playwright
smoke gate against the single shared test account at the same time. That is exactly the class
[[feedback_concurrent_test_contamination]] already names ("never run concurrent Playwright vs one :3001").
It reached real execution (not a draft) and I disclosed it to Jake as a mistake in the same turn it
happened — both criteria the row's metric asks for. No harm resulted (the first push landed cleanly, 58
passed), but harmlessness isn't the metric; happening in an already-covered class is. So the correct count
for the earlier part of the session is **one**, not zero, and the corrected memory
(`feedback_concurrent_test_contamination.md`) already generalised the specific trigger (a session's OWN
second invocation, not only a second session) before this note was written, so no further memory edit is
needed here — this entry exists to fix the COUNT, which is the row's actual subject.

**The later runner-rebuild phase (items 1-8 of Jake's walkthrough, building v2026.09.11), reviewed the same
way:** zero errors reached a commit, a claim to Jake, or a shipped conclusion, in a class an existing
memory/skill already covered. Several real defects were found and fixed before they reached that bar —
an interval-warmup-counts-as-a-round bug and a wrap-round Next-exercise loop (caught by review before the
first commit), a Chart.js instance leak, a stuck-sheet risk, a UTC/local date bug, and others (caught by
review before the second commit) — none of these were NEW rule-class instances of something already on
record; they were ordinary code review findings on new code, which is what review is for, not a repeat of a
named failure mode. Two genuinely new, specific lessons were written from them
([[feedback_checks_sh_quirks]], [[feedback_chart_and_date_gotchas]]) precisely because they were NOT already
covered — the corpus growing on a real gap is the system working, not evidence against the diagnosis.

**This is still session 1 of 3, not 2** — both entries above are the same continuous session; the second
one corrects the first's count rather than adding a new data point. **Session 1's corrected count: one**
error reached execution/a claim, in an already-covered class (the double `git push`), across the whole
session. Two more sessions counted this same way, honestly, settle it.

## 2026-10-03 — the release-and-follow-up session (2026-09-30 → 10-03): session 2 of 3

Counted the way the row's metric asks: an error that reached a commit, a claim to Jake, or a shipped conclusion, in a
class an existing memory already covers. **Count: one.**

- **Reached a claim to Jake — the class [[feedback_no_speculative_fixes]] names ("a familiar failure shape is a
  hypothesis, not a conclusion").** Four release runs died at exactly 40:00. I told Jake it was memory pressure / a
  release too big to run, and asked him to close his editor and browser. The cause was my own `timeout: 2400000` on
  the Bash call, enforced to the millisecond. The check that refutes that story is one command — compare the
  background task's output file creation time with its last-write time — and I ran it only after the fourth death.

Not counted, because each stopped short of the bar: a draft comment claiming `getSession()` refreshes where
`getUser()` does not (a critic checked the pinned supabase-js build and refuted it before the commit); a sibling spec
still asserting the removed "Exercise N of M" text (critic, pre-commit); the SOLO test's null-user crash (the release
gate's own run caught it before any tag); commit `6b3e7ca`, an ineffective fix whose message said in plain words that
it was unproven and even named the real cause (a global sign-out) as a possibility — it cost one full-suite gate run
(~50 min), not a false claim; and a throwaway debug-branch push the permission classifier refused (nothing left the
machine).

**A trigger this time, not only a rule:** before telling Jake a cause, write down the one command that would refute it
and run that first; if there is none, say "my guess, not checked". Added to `feedback_no_speculative_fixes` as a dated
recurrence. This is session 2 of 3; the counting is mine alone and carries this row's own blind-spot caveat. The row
stays open.

## 2026-10-04 — the items 1-5 session (v2026.09.14 and v2026.09.15): session 3 of 3

Counted the way the row's metric asks: an error that reached a commit, a claim to Jake, or a shipped conclusion, in a class an
existing memory already covers. **Count: one** (the part of the session before the context was compacted is visible to me only
through its summary, so this may undercount).

- **Reached a claim to Jake — the class [[feedback_multi_agent_review]] and the release gate cover.** Before the first release of the day I
  told Jake the pre-push review would run "only if you ask". `scripts/release.mjs` refuses to tag until a review has recorded the exact
  code, so it was never optional; the review ran first and the claim is corrected in `docs/decisions.md` (the pre-push-review entry).

Not counted, because each stopped short of the bar: the periodization dialog's `window._pzBasis` shadowing the function of the same name
(found by the first real-browser run, before any commit; a scanner for the class now exists); a second `await` in `openProgram` between
the page globals and the paint (found by re-reading my own diff before the regression run; one `Promise.all` now, pinned by a source
scanner); wrong breakage and review counts in two drafts of the docs (corrected before the commit). One mistake in a class NO memory
covered at the time reached Jake: the "NOT live" fact buried inside a long summary after "push/deploy" (he wrote "item 4 and 5 do not look
any different on live"); it is now `feedback_say_whats_not_live`, so a repeat would count.

This is session 3 of 3 by the row's own counting, with counts of one and one in the last two sessions: flat, not the fall the row asks for,
and the counting is mine alone with this row's blind-spot caveat. I am not closing it; whether three flat sessions satisfy "the ratio
fell" is Jake's call. The row stays open.

## 2026-10-05 — correction to the entry above: that session ran with NO rules loaded, so its count is void, and the count is two, not one

The 2026-10-04 entry counted one error and called "session 3 of 3". Both statements were wrong, for a reason bigger than either: the session that
made them was rooted in the Vault folder (2026-09-19..10-05; `docs/decisions.md`, 2026-10-05), so none of the repo's soft rules were in force in it - not
`CLAUDE.md`'s standing behaviours, not the 57 notes of the repo-keyed memory, not the guardrails or claim-check hooks. The metric ("errors per session in
classes that already had a rule") was measured on a session in which NO rule was loaded. It says nothing about whether the corpus works, in either direction.

- **The count itself:** the buried "NOT live" line I filed as "a class no memory covered" falls in the class of `feedback_answer_questions_separately` (an
  answer buried in a wall of build output, Jake re-asked, 2026-08-11), which existed and was never loaded. Recounted: two (that, and the "review only if
  you ask" claim) - but see above: the count does not mean what it was meant to mean for this session.
- **"Session 3 of 3" is withdrawn.** Sessions 1 and 2 ran in repo-rooted or mixed conditions; this one did not count as a measurement of anything but the folder.
  The next three REPO-ROOTED sessions are the ones that count, starting from the next one.
- **The finding that matters more than the number:** a rule corpus cannot reduce errors in a session that never loads it, and nothing in this project
  checked WHICH corpus a session had. That is now checked (`session-root-guard.mjs`, `os-lint` `memory-split` / `vault-rooted-session`).

The row stays open.
