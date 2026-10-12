---
id: 2026-10-12-client-profile-shows-the-overview-under-another-tab-when-the-overview-loads-last
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 on master, unreleased (app-clients v21), at Jake's go ('fix'). Every tab render now gets its own fresh #tab-content pane (_freshTabPane in switchTab), so a superseded render writes into a pane that is no longer in the page. Red before, green after: tests/client-profile-tab-race-2026-10-12.spec.js (holds the Overview render open, taps Workouts, releases it). Closes when the full release suite runs without the rpe-e2e-journey / runner-edit-delete flake on this click."
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

## Built (Jake: "fix", 2026-10-12)

`_freshTabPane` replaces the `#tab-content` element on every `switchTab`; the initial Overview render keeps the pane `openClient` made, so tapping a tab replaces it too. A repaint that looks `#tab-content` up by id after an action finds the live pane. The spec holds the Overview render on a gate, taps Workouts, releases the gate and asserts the Workouts content and button are what is shown (mutation-checked: without the fix it fails).

## Review follow-ups (2026-10-12)

Built: the Weight, Performance and 1RMs tab renderers now stop after their fetch when their pane is no longer in the page (`el.isConnected`). A superseded render still ran global side effects that hit the live tab: `_destroyManagedCharts` destroys EVERY chart (so a late Performance fetch blanked the Weight chart), Performance reset `window.__perfChartData`, 1RMs rebound `window._oneRMGridRows`. Each has a spec with a connected-pane control (`tests/client-profile-tab-race-2026-10-12.spec.js`, mutation-checked).

**Still open (pre-existing, not worsened):** save and delete paths that repaint by looking `#tab-content` up by id AFTER an await will paint into whatever pane is live if the coach switched tabs mid-save: `app-programs.js` 461, 792, 834; `app-progress.js` 1090, 1112, 1133 (and the helpers at 24 and 37); `app-calendar-goals.js` 728, 855, 1174 (`deleteGoal` has no null guard); `app-runner.js` 3843 and 4064. The fix shape is to capture the pane before the await and repaint only if it is still connected. The window is narrow (a tab switch during a save), so it was named, not fixed.
