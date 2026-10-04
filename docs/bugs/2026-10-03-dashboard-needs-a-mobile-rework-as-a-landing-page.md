---
id: 2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-03
status_detail: "REPORTED BY JAKE 2026-10-03, with a phone screenshot of the solo 'My Training' dashboard: 'The whole dashboard needs a rework for mobile view, as nothing really flows or stands out as a dashboard or makes it feel like this is landing page and hub of your account.' Scoped with him the same day (a short form, then a tappable prototype he approved): all three dashboards together; today first, then the week; body weight, streak, program progress, calendar; Goals stay; the PT | Personal switch keeps floating; streak = weeks hitting the whole plan; coach version 'go with it'. BUILT 2026-10-04, committed on master, not released, awaiting his look on a phone. ONE skeleton for solo, client and coach: greeting; a Today card (the only saturated block on the page, calm on a rest day, a finished day or any other day); the week as seven tappable days (coach: bars of sessions logged per day) - tapping a day swaps the Today card in place, with no new read; two quiet tiles (streak and program; coach: trained this week and programs ending); then body weight with its trend, My calendar and Goals (coach: Needs attention, Weigh-ins, Coming up, Goals due soon). The client page keeps its weekly check-in (a banner when due that scrolls to the form, and the form at the bottom). The streak: Monday-Sunday weeks; inside the program's span every planned session must be logged and a week with none planned is skipped; outside it (before it began, after it ended, or with no program) one session keeps it alive; this week counts once complete and is ignored until then. REMOVED from the dashboards: Recent sessions, the personal bests / Benchmarks card and its read of performance_logs, the stats strip, the client page's inline weight / record / goal-update forms (they live on Progress and Goals), the coach's per-client adherence list with its At risk filter and the recent-activity feed. SIDE EFFECTS: the PT | Personal switch no longer hides the last card on any page; solo and client share one loader (the client's copy lacked week_number and id, so a periodised phase collapsed onto week 1 and Start could not resolve the clone); the greeting now escapes the name (the client page printed it raw). COACH IS LOGGED-ONLY: the database knows what each client logged, not what was planned, so there is no '2 of 5 done'; that needs a new database view (SQL for Jake to run) and is a follow-up if he wants it. VERIFIED: 32 unit tests of the streak, week strip and program tile; 29 browser tests in tests/dashboard-rework-2026-10-03.spec.js (clock pinned, nothing written to the database: each state of the Today card, tap a day, the streak breaking, a year of sessions read in pages, a failed read, names as text, 480 and 320 px, the floating switch, the coach page's numbers); 43 older tests across 12 spec files ported or retired with the cards they pinned; seven deliberate breakages each failed the matching test; the 21 dashboard-related spec files, 214 tests, pass; checks.sh passes; 480 and 320 px screenshots of every state were read. UNVERIFIED: how it reads on Jake's phone with his real data; the coach's Today card on a real roster; reviewed 2026-10-04 by multi-agent-review (diff mode: security and tenant scoping, solo-mode correctness, duplicates and regressions, plus a verifier pass; no blocking findings, follow-ups in docs/decisions.md)."
closing_conditions: "Jake opens the personal dashboard, a coached client's dashboard and the coach dashboard on his phone and confirms each reads as a landing page and hub (or tells me what to change)."
---

# The dashboard needs a mobile rework as a landing page and hub

**Closes when:** see `closing_conditions`.

Built 2026-10-04 from the tappable prototype Jake reacted to (private page, example data, not the real app:
https://claude.ai/artifact/TtFsmgxVWpB69zBt2DDJNJ) and his "approved". Decision record: [decisions.md](../decisions.md), 2026-10-04.

Related, corrected 2026-10-03: D2-D4 of the 2026-09-07 UX cleanup (the solo bottom bar and More sheet, the empty-session filter, the
PT stat tiles) SHIPPED on 2026-09-08 (`8cba8e8`, live since `v2026.09.10`) - an earlier version of this row, and the roadmap,
wrongly called them "not started". What was deferred then was **D1, solo/client dashboard convergence**; this rework includes it.

## Scoped with Jake, 2026-10-03

Answers: **all three dashboards together** (solo, client, coach); the top of the screen shows **both, today first and then the
week**; **also on it:** body weight, streak, program progress, calendar (not chosen: latest PBs, quick log buttons); the
**PT | Personal switch stays floating**; **streak = weeks hitting the whole plan**; the coach reading is right ("go with it");
**Goals come back** onto the page (Recent sessions and the Personal bests tile stay off).

## What planning found about the data (2026-10-03)

(1) The database holds what each client LOGGED, not what was PLANNED for today, so a coach "x of y done" and "clients on a streak"
need a new database view; the first coach version is logged-only. (2) The app stores no session length or planned-session exercise
count, so the Today card shows neither. (3) About 24 existing spec files mentioned the old dashboards; they are ported or retired
(the list is in [decisions.md](../decisions.md)).
