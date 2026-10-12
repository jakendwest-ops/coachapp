---
id: 2026-10-12-client-profile-shows-the-overview-under-another-tab-when-the-overview-loads-last
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Found by me, not reported by Jake: three intermittent test failures in two days, one with a screenshot showing the Workouts tab highlighted over the Overview content. A real race in js/app-clients.js (openClient fires the Overview render without waiting; a tab tapped before its three queries finish is overwritten when they land). Fix proposed, not built; waiting on Jake's go."
---

# A coach's client profile can show the Overview under the Workouts (or any) tab when a slow Overview load finishes last

## Evidence

- The `rpe-e2e-journey-2026-10-01` coach test timed out on 2026-10-12 waiting for "Start workout" with "element was detached from the DOM, retrying". Its failure screenshot and page snapshot show the **Workouts tab highlighted** and, under it, the **Overview** card (Status / Email / Phone / Date of birth / Height). Earlier the same two days `runner-edit-delete-2026-10-01` (twice, one in the release run) failed the same way on the client row and on "Start workout". All three pass on their own (12 of 12, 3 of 3) and failed only when a response was slow.
- The race is in old code, not in the 2026-10-12 changes. It did not show in the v2026.09.15 release's full run (one unrelated flaky test); it showed on 2026-10-11 and 2026-10-12, when two runaway processes of mine were also using about two CPU cores (see the console-window row), so the machine was slower than usual. The slowness is what exposes the race; it is not proven to be what caused it to appear.

## Cause

`openClient` (`js/app-clients.js:336`) starts `renderClientOverview` WITHOUT awaiting it, and that render makes three database calls before it writes `#tab-content` (line 381 onwards). `switchTab` (line 339) clears `#tab-content` and starts another render. Whichever render finishes last writes last. Tap Workouts before the Overview's calls return and the Overview lands afterwards, over the Workouts pane, while the Workouts button stays highlighted. Any slow tab can do this to the one after it. A person on a slow connection who opens a client and taps a tab straight away can see it.

## Proposed fix (not built)

Give every tab render its own host: `openClient` and `switchTab` replace `#tab-content` with a fresh element each time, so a render that was superseded writes into its detached old element and the visible pane only ever shows the latest tab. Re-render calls that look `#tab-content` up by id after an action keep working (they find the new element). A deterministic test holds one of the Overview's queries with a route, taps Workouts, releases it and asserts the pane still shows Workouts. Check that a superseded render's later `getElementById` lookups fail quietly (they would find nothing).

## What would close it

**Closes when** the fix is built with a spec that fails without it (the held-query test above), and `rpe-e2e-journey`, `runner-edit-delete` and the release suite stop flaking on this click.
