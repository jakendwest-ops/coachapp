# Personal view: four destinations (Today, Train, Progress, More)

**Date:** 2026-10-31 · **Status:** design, awaiting Jake's approval · **Source:** Solo product review MVP item 7
([plan](../plans/2026-10-29-solo-product-review.md)), a question-by-question session with Jake on 2026-10-31, and the tappable mock-up
he approved as "right, write it up" (private Artifact, version 3: https://claude.ai/artifact/SicUsZHwRpQ2rLkF1iDPDf).

## Intent and why

Personal view (role `solo`, and Jake's master account in Personal view) has too many places to go and splits one job three ways.
Today the sidebar lists 7 destinations (`_NAV_ITEMS.solo`, `js/app-core.js`): Dashboard, Workouts, Library, Training plans,
Calendar, Progress, Settings; `soloPages` also routes `goals`. The phone bottom bar shows Dashboard, Workouts, Training plans,
Progress and a More sheet (Library, Calendar, Settings) — `_NAV_BOTTOM`, D2 of 2026-09-07.

What Jake said (2026-10-31):
- In the gym he starts from the **Dashboard's Today card**.
- Outside sessions he opens **Progress** and **Library / Workouts** weekly; Goals and Calendar are not weekly.
- **Plans, workouts and the library feel like one job split three ways.**
- Goals belong inside Progress.
- **Personal view only.** Coach and client views do not change in this work.

## Goals

Four destinations, the same on the phone bottom bar and the desktop sidebar:

| Destination | What it holds |
|---|---|
| **Today** (the app opens here) | Today's session card with Start, or on a rest day "Nothing planned today" + the next session and its date + **Train anyway**; this week's strip; a **Calendar** button that opens the month IN PLACE (no Calendar destination); a quick **body-weight log** (number input + Log); a **goals snapshot** with "See all" → Progress › Goals. No "Up next" row (Jake: drop it). |
| **Train** | Two switches: **Workouts** (opens first) — every workout in one list, the plan's and the ones saved on their own, each startable; **Plans** — the current plan first, then the others, New plan. |
| **Progress** | Four switches: **Goals** (opens first), **Records**, **Weight**, **Cardio** (see "Jake's answers"). |
| **More** | **Exercise library** (top row; opens the library with a back link to More), Settings, Download my data, Send feedback, Privacy policy, **Switch to PT view**, Sign out. |

## Non-goals

- Coach and client views: unchanged (their nav, pages and the coach dashboard).
- No new data, no SQL, no schema change. Every screen is built from what the existing pages already render (Cardio reads data that is
  already stored).
- Redesigning the Performance views or charts (Jake has changes in mind: separate work).
- No change to how a workout runs, saves or is edited; the runner, the template editor and the programme builder are reached
  from the new places, not rewritten.
- The "advanced controls behind 'advanced'" idea in the review (#7) is separate work.

## Anti-goals (failure even if it "works")

- **A page or an action that becomes unreachable.** The old Workouts, Library, Training plans, Calendar and Goals pages each carry
  buttons (New workout, Save to library, assign, the exercise editor, goal steps, calendar session moves…). Removing a container
  drops every affordance it hosted (2026-10 memory: the week-tabs redesign silently killed Save-to-Library). Each one must have a
  named new home or be named as deliberately dropped, before building.
- **Breaking coach or client** by editing a shared render function for Personal view's sake (solo/coach/client share
  `renderWorkouts`, `renderCalendar`, `renderProgress`, the goals module).
- **Old links and stored state landing nowhere**: `#library`, `#calendar`, `#goals`, `#programs`, `#workouts`, `localStorage._activePage`
  and `_progressTab` from before the change must land somewhere sensible, not "Page not found" or a blank page.
- More taps to start a workout than today (today: open app → Start on the Today card).

## Constraints

- Vanilla JS classic scripts, no build; bump `?v=` for every changed module; mobile verified at 480 px and 390 px; the desktop sidebar is
  the same four.
- Native inputs only (the body-weight input is `<input type="number" inputmode="decimal">`).
- `checks.sh` ratchets (type errors, `role==='solo'` count ratchet, unbounded reads, duplicate functions) must not rise.
- Specs that drive Personal view use `soloReady()` and `navigate('<page>')` by page id: every spec that navigates to a solo page
  being retired must be found and updated in the same change (grep `navigate('library'|'calendar'|'goals'|'programs'` and `soloNav`).
- Approve before build; `multi-agent-review` before the push; full suite at release.

## Decided

- Four destinations, labels **Today / Train / Progress / More**, icons as in the mock-up (calendar, dumbbell, trend line, three dots).
- Today opens by default for solo (`defaultPage`).
- Train opens on **Workouts**; Plans second. **Exercises are not a Train switch**: the library moves to **More › Exercise library**.
- Progress opens on **Goals**. Goals stop being their own destination.
- Calendar is not a destination: Today's Calendar button opens the month in place.
- Rest-day Today: "Nothing planned today", the next planned session with its date, **Train anyway**.
- "Switch to PT view" sits in More (the master account only); see the builder's call below for the floating pill.

## Left to the builder

- Whether Train is one new page with switches or the existing pages re-hosted under a switch row (prefer re-hosting the existing
  render functions to rewriting them).
- How the Calendar opens under Today (an inline month or a sheet), reusing `renderCalendar`'s month view where possible.
- The floating PT/Personal pill (`#mobile-view-switcher`): keep or remove on phones once "Switch to PT view" is in More — state the call.
- Route aliases for retired page ids (e.g. `#library` → More › Exercise library; `#goals` → Progress › Goals; `#calendar` → Today with
  the calendar open; `#programs` → Train › Plans; `#workouts` → Train › Workouts).
- The new hash names, if any (`today`/`train`), or keep `solo-dashboard`/`workouts` as ids under new labels.

## Jake's answers (2026-10-31, after the builder check)

- **Cardio is its own Progress switch.** CORRECTION (2026-10-31, while planning): Claude told Jake there was no cardio section today; that was
  wrong. Since 2026-09-30 Personal Bests holds two sections: the 1RMs (`renderClient1RMs`) and every `performance_logs` record
  (`renderClientPerformance`, all four `PERF_CATEGORIES`: strength, cardio, body metric, benchmark). So nothing is reversed: the Cardio
  switch shows the `cardio` category of those records, and Records keeps the other three categories.
- **Performance moves into Records** ("a 5k run is as important to some people as their bench pb"). Records = today's Personal Bests
  (the 1RMs, then the strength / body-metric / benchmark records) followed by Performance's two views (per-exercise progression charts,
  per-session comparison); Performance stops being its own switch. Its charts move intact.
- **Not in this work:** Jake also wants "some adjustments to the performance page and charts". That is a separate piece, to be described
  by him; this change moves those views without redesigning them.

## Settled from the builder check (Claude's calls; Jake can overrule)

- **Templates live in Train › Workouts.** Jake approved "every workout you have, in one list" with New workout on it, so the Library's
  **Templates** tab (New template, search, edit, delete, Save to library targets) merges into Train › Workouts; only the **Exercise
  Library** tab moves to More. Every affordance of both old pages gets a named home in the plan's affordance table before building.
- **This document wins over the mock-up.** The mock-up is a reference for layout and icons; where they differ, follow this text, and
  Today's cards reuse the existing dashboard sections (`dash-hero`, `dash-week`, `dash-weight`, `dash-goals`) rather than new markup.
- **Clients see no change, including in Progress.** The Goals-first order, the new labels and the Records/Cardio switches are solo-only
  through a separate solo entry point (a wrapper over the shared section renderers), not role checks inside `renderProgress`, so the
  `role==='solo'` ratchet does not rise.
