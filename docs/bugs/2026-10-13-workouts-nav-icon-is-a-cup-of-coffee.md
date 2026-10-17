---
id: 2026-10-13-workouts-nav-icon-is-a-cup-of-coffee
status: confirmed
priority: low
reported: 2026-10-13
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item W4). FIXED 2026-10-13, on master (not yet in a release); awaits Jake on his phone. The Workouts nav item is a dumbbell in the bottom bar and the sidebar. Test: tests/solo-workouts-page-2026-10-12.spec.js (nav icon test; one breakage caught)."
---

# The Workouts nav icon is a cup of coffee

## Jake's report (verbatim, 2026-10-13)

> change this to a dumbbell icon not a cup of coffee

Attached: the bottom nav with the Workouts item selected (a steaming cup).

## What the code does

`_NAV_ICONS.workouts` (`js/app-core.js`) is a cup-and-steam SVG, and `_NAV_ICONS.library` is an identical copy of it. Both the bottom bar and the sidebar read this map. Only Workouts was named; the Library icon is left as it is and flagged to Jake.

## What would close it

**Closes when** the Workouts item shows a dumbbell in the bottom bar and the sidebar, and Jake confirms on his phone. A test that fails without it: the Workouts nav item carries the dumbbell icon, not the cup path.

## Built (2026-10-13)

`_NAV_ICONS.workouts` is a dumbbell (`data-icon="dumbbell"`). The Library icon is still the cup (only Workouts was named); say if it should change too. A phone check of the bottom bar is the open item: "Training plans" still wraps to two lines.
