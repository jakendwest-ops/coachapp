---
id: 2026-10-03-runner-stats-sheet-shows-less-than-my-progress-and-computes-est-1rm-differently
status: open
priority: medium
reported: 2026-10-03
status_detail: "REPORTED BY JAKE 2026-10-03, with a screenshot of another app's exercise screen (a volume chart, a strip of Volume / Max weight / Sets / Reps for the selected session, and a history listing every set as weight x reps with the session's volume): 'The progress/stats page within the runner should have more data like the screenshot I sent you. This amount of data should also be consistent with the My progress page.' MEASURED by reading the code (not run) - the two screens are separate implementations that have already drifted: (1) Est. 1RM - My Progress uses _estimate1RM (Epley, a single counts as measured, nothing over 12 reps); the runner sheet's _RS_METRICS.e1rm is plain Epley with no cap, so 100 x 1 reads 103.3 in one place and 100.0 in the other, and a 15-rep set is projected in the runner but not on My Progress. (2) History depth - the runner reads the last 60 workouts and plots 12 sessions; My Progress reads the whole history (paged) with a range filter. (3) Measures - the runner offers Top set / Est. 1RM / Volume; My Progress offers Top weight / Est 1RM / Volume / Intensity / Total reps. (4) Records - the runner shows one (heaviest ever); My Progress shows four (heaviest, best est. 1RM, best set, best session volume). (5) Sessions listed - the runner lists last session's sets only; My Progress lists the last 10 sessions. (6) History e1RM on both ignores a logged RPE, while the live top-set chip uses it, so a top-set session reads differently in the chip and in the history. NOTHING BUILT: a prototype (one shared component shown in both places, with the open choices as switches) comes first, then Jake's explicit yes."
closing_conditions: "Jake approves the design from the prototype, it is built as ONE shared component used by both the runner sheet and My Progress (so the numbers cannot drift again), and Jake confirms on his phone that the same exercise shows the same figures in both places."
---

# Runner stats sheet shows less than My Progress, and computes Est. 1RM differently

**Closes when:** see `closing_conditions`.

Second instance of the pattern the project keeps hitting: two copies of one job, which then disagree. The fix is the
class fix - one component, one data read, used by both screens - not a patch to either.

Plan of record (not started): [feedback_prototype_first] prototype -> Jake's reaction -> explicit "approved" -> build
test-first -> `multi-agent-review` before the push.

Prototype (private page, example data, not the real app): https://claude.ai/artifact/6UH1ZcoNVbQvxZ8wCMb64T - one component
shown in the runner sheet and on a My progress card, with the open choices as switches (every set vs grouped, volume per
session, change vs previous, Est. 1RM using the logged RPE, workout in progress).
