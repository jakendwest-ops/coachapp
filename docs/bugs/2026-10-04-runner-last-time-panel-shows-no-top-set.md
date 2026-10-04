---
id: 2026-10-04-runner-last-time-panel-shows-no-top-set
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-04
status_detail: "REPORTED BY JAKE 2026-10-04, with a phone screenshot of the runner's 'Last time' panel on Pull Up (LAST TIME - 29 SEPT / 2 sets, top 23 kg / Stats): 'This panel needs to show top set.' The panel named the heaviest WEIGHT but not the reps it was lifted for, and counted warm-ups in 'N sets' while the Stats card does not. APPROVED 2026-10-04 and BUILT the same day, committed on master, not released, awaiting his look on a phone. The panel shows the TOP SET as weight x reps ('Top set 23 kg x 5'), with the RPE or RIR when one was logged ('Top set 100 kg x 3 @9', '@2 RIR'), and the set count moves up beside the date ('LAST TIME - 29 SEPT - 2 SETS'). 'Top set' is the Stats card's definition (the heaviest set, a tie going to the set with more reps), counted without warm-ups, so the panel and the card cannot disagree; a bodyweight exercise reads 'Top set 12 reps'. The read behind the panel now asks for each set's phase (it did not, so a warm-up could not be told from a working set). VERIFIED: 12 unit tests (the top-set row, the wording, the tie rule, effort and its scale, warm-ups, bodyweight, pounds); 10 browser tests in tests/runner-last-time-top-set-2026-10-04.spec.js (Jake's screenshot case, the old wording gone, RPE, RIR, bodyweight, pounds, warm-up, no panel without history, the panel and the Stats card name the SAME set, the read asks for phase); six deliberate breakages each failed the matching test; the 26 spec files around the runner, the Stats sheet and the source scanners pass; checks.sh passes. SIDE FINDING: three older tests counted every Chart on the page and broke (1 became 2) when the test account's weigh-ins were re-seeded, because the dashboard's weight sparkline sits behind the runner; they now count the charts of the card under test. UNVERIFIED: how it reads on Jake's phone with his real history; reviewed 2026-10-04 by multi-agent-review (diff mode: security and tenant scoping, solo-mode correctness, duplicates and regressions, plus a verifier pass; no blocking findings, follow-ups in docs/decisions.md)."
closing_conditions: "Jake opens a workout on his phone with a previous session and confirms the Last time panel shows the top set he expects (or tells me what to change)."
---

# Runner, Last time panel: show the top set

**Closes when:** see `closing_conditions`.

Jake, 2026-10-04: "This panel needs to show top set"
