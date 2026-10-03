---
id: 2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page
status: open
priority: medium
reported: 2026-10-03
status_detail: "REPORTED BY JAKE 2026-10-03, with a phone screenshot of the solo 'My Training' dashboard: 'The whole dashboard needs a rework for mobile view, as nothing really flows or stands out as a dashboard or makes it feel like this is landing page and hub of your account. I'm happy to fully scope this out after the above works is done.' NOT STARTED, by Jake's own sequencing: it follows the two runner items filed the same day. First observations from the screenshot (for the scoping session, not decisions): the tiles are same-weight cards stacked in one column, so the one action that matters most - starting today's session - sits second, under a weight chart; the floating PT | Personal switch overlaps the content above the bottom bar; there is no summary line or greeting that says where the account stands this week. Open questions for scoping: which of the three roles (coach, client, solo) the rework covers, what the landing page should answer in the first screen, and what is in the hub (shortcuts, streaks, recent PBs, the week's sessions)."
closing_conditions: "A scoped design Jake has approved (via a tappable prototype, per his standing preference), built, and confirmed on his phone."
---

# The dashboard needs a mobile rework as a landing page and hub

**Closes when:** see `closing_conditions`.

Process, per the standing rules: sounding-board questions first ([feedback_sounding_board]), then a tappable prototype
([feedback_prototype_first]), then an explicit "approved" before any code.

Related, corrected 2026-10-03: D2-D4 of the 2026-09-07 UX cleanup (the solo bottom bar and More sheet, the empty-session
filter, the PT stat tiles) SHIPPED on 2026-09-08 (`8cba8e8`, live since `v2026.09.10`) - an earlier version of this row, and
the roadmap, wrongly called them "not started". What was deferred then is **D1, solo/client dashboard convergence**
(`docs/superpowers/specs/2026-09-07-ux-cleanup-design.md`); this rework includes it.

## Scoped with Jake, 2026-10-03 (a short form)

Answers: **all three dashboards together** (solo, client, coach); the top of the screen shows **both, today first and then the
week**; **also on it:** body weight, streak, program progress, calendar (not chosen: latest PBs, quick log buttons); the
**PT | Personal switch stays floating**; no reference app named.

My reading, shown in a prototype for Jake to correct (private page, example data):
https://claude.ai/artifact/TtFsmgxVWpB69zBt2DDJNJ

- One skeleton for every role: greeting; a big Today card (the only saturated block, calm on a rest day or a finished day);
  the week as a tappable strip; streak and program as two quiet tiles; body weight; calendar.
- Goals, Recent sessions and the Personal bests tile leave the dashboard (Goals have lived on Progress since v2026.09.13).
- The floating switch keeps floating; the page now ends above it, so the last card is never stuck behind it.
- Coach is MY INTERPRETATION of the list, flagged as such: Today = today's client sessions and who is done, plus "needs
  attention"; the week strip = client sessions done per day; streak = clients on a streak; program = programs ending soon;
  body weight = this week's weigh-ins; calendar = goals due, programs ending, events.
- Data: solo is verified - every input is already read by `renderSoloDashboard` (programmed workouts by date, workout logs,
  weights, events, the assigned program); the client dashboard is built from the same tables (check at build time). The
  streak and the week strip are derived, no new tables. **UNVERIFIED for coach:** "today's client sessions" and "weigh-ins
  this week" probably need new reads (the current coach tiles use the `coach_client_summary` view, which counts this week
  only) - check before building.
- Open: what "streak" counts - weeks hitting the whole plan, sessions in a row, or sessions this month (switchable in the
  prototype).
