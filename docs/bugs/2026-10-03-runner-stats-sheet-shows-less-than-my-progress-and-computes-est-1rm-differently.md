---
id: 2026-10-03-runner-stats-sheet-shows-less-than-my-progress-and-computes-est-1rm-differently
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-03
status_detail: "REPORTED BY JAKE 2026-10-03 (his words are kept below). FIXED 2026-10-03, RELEASED in v2026.09.14 (2026-10-04, live on the site; the full suite and the deploy were green), awaiting his look on a phone. The runner's Stats sheet and the My progress exercise cards are now ONE card (_mountExerciseStats, js/app-progress.js), fed by ONE set of maths (_xsSessionMetrics, _xsRecords) and ONE read (_fetchExerciseSessions: paged, matched on the exercise name exactly as My progress groups it, scoped to the person), so they cannot disagree again. The card has: measure pills (Top set, Est 1RM, Volume, Intensity, Total reps); a chart you can tap; a strip for the selected session (Volume, Top set, Est. 1RM, Sets, Reps, each with its change against the session before); records NAMED BY SET with their dates (Heaviest set 117.5 kg x 3; Best est. 1RM 132 kg 'from 117.5 x 3 @9'; Biggest set; Best session volume); and every set of every session (the newest five, then 'Show all N sessions'). In the runner it also adds a dashed Today point and a first 'Today - in progress' row from the sets ticked so far. WHAT CHANGED IN BEHAVIOUR: (1) Est. 1RM is one rule everywhere - a single rep is measured, nothing over 12 reps is projected, and a logged RPE or RIR is counted, so a top set of 3 at RPE 8 reads the same in history as in the live chip (a switch, _XS_COUNT_EFFORT, flips it in one place); (2) the runner now reads the whole history (it read the last 12 sessions); (3) 'Heaviest ever' is gone, replaced by the records; (4) a bodyweight exercise now charts Reps instead of saying 'no logged weight'; (5) labels: Heaviest weight is Heaviest set, Best set is Biggest set, Best session vol is Best session volume, the chip 'Top weight' is 'Top set'. Only weight x reps cards change on My progress; other exercise types keep their cards. VERIFIED: tests-node/exercise-stats.test.mjs (28 tests: the maths and the change arrows); tests/exercise-stats-shared-2026-10-03.spec.js (17 browser tests: both screens print IDENTICAL figures from one history, a history past the API's 200-row cap, another person's rows never appear, a failed read shows no numbers and no toast, pounds, bodyweight, one session, Chart.js missing, 480 and 320 px); four deliberate breakages each made the matching test fail (one of them exposed a weak assertion, which was fixed); ten older tests that pinned the old sheet or the old labels were ported; the 14 spec files that touch these screens plus the new one, 211 tests, pass; checks.sh passes; 480x844 and 320 px screenshots were read. UNVERIFIED: how it reads on Jake's phone with his real history; whether a full card for every weight x reps exercise makes My progress too long to scroll."
closing_conditions: "Jake opens the Stats sheet on a real exercise, then My progress for the same exercise, on his phone, and confirms the figures match and the card reads well."
---

# Runner stats sheet shows less than My Progress, and computes Est. 1RM differently

**Closes when:** see `closing_conditions`.

Second instance of the pattern the project keeps hitting: two copies of one job, which then disagree. The fix is the
class fix - one component, one data read, used by both screens - not a patch to either.

Built 2026-10-03 after Jake reacted to a tappable prototype (private page, example data, not the real app:
https://claude.ai/artifact/6UH1ZcoNVbQvxZ8wCMb64T) and said "approved". Decision record: [decisions.md](../decisions.md), 2026-10-03.

## What was wrong (measured by reading the code, then pinned by tests)

The two screens were separate implementations that had already drifted: (1) Est. 1RM - My progress used _estimate1RM (a single
rep counts as measured, nothing over 12 reps is projected); the runner sheet used plain Epley with no cap, so 100 x 1 read 103.3 in
one place and 100.0 in the other, and a 15-rep set was projected in the runner only. (2) History - the runner read the last 60
workouts and plotted 12 sessions; My progress reads the whole history, paged. (3) Measures - three in the runner, five on My
progress. (4) Records - one in the runner ("Heaviest ever"), four on My progress. (5) The history on both ignored a logged RPE while
the live top-set chip used it, so a top-set session read differently in the chip and in the history.

## Jake's reaction to the prototype (2026-10-03)

"The heaviest weight is just the weight, and the e1RM is significantly higher than this (I'm assuming this is because the
heaviest weight was 117 for reps, not a single rep). I think the heaviest weight needs a more clear name, like 'heaviest
set' and then it would be 117 x 3, and then that makes the e1rm more clear to the user."

Applied: records are SETS, each with its date - "Heaviest set 117.5 kg x 3" (a tie on weight goes to the set with more reps),
"Best est. 1RM 132 kg, from 117.5 x 3 @9" (it names the set it was worked out from), "Biggest set" (most weight x reps in one
set; renamed from "Best set" so it does not clash with "Heaviest set") and "Best session volume". The name "Biggest set" is
mine - Jake has not confirmed it.
