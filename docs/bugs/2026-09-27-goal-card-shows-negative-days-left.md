---
id: 2026-09-27-goal-card-shows-negative-days-left
status: confirmed
priority: low
reported: 2026-09-27
status_detail: "Seen 2026-09-27 in a probe screenshot of the E2E client's dashboard at 390x844: a goal card reads 'In -35 days'. Incidental to the app-code audit. Code site not yet located."
---

# A goal whose date has passed says "In -35 days"

**Plain English.** On the client dashboard, a goal ("Lose 5kg") whose target date has already passed shows "In -35 days"
instead of something like "35 days overdue". The number is presumably correct, but the wording reads as a glitch.

## Evidence

- Screenshot of the E2E client dashboard, 2026-09-27 (Goals card, top right of the goal row).

## Fix shape

Find where the days-left label is built (app-dashboard / app-calendar-goals) and handle a negative count with its own
wording. Check the same label everywhere goals render.
