---
id: 2026-08-29-quick-prefs-popover-silently-reverts-a-unit-change
status: closed
priority: medium
reported: 2026-08-29
closed_by: "tests/review-fixes-2026-08-29.spec.js 'toggling a capture chip does not revert an unsaved unit change' — RED without the prefill (Expected 'lb', Received 'kg'), GREEN with it. Fixed 4bf805d."
status_detail: "CLOSED 4bf805d. The popover accepts a prefill and the chip toggle snapshots the live selects first. Red-before: Expected lb, Received kg. _toggleQuickPrefsCapture re-renders the whole popover from window._unitPrefs, which is only updated after a successful DB write. Changing Weight to Pounds then tapping a capture chip snaps the select back to kg with no message, and Done saves kg. Its sibling _toggleCardioCaptureMetric snapshots live fields for exactly this reason; the app-core twin was written without it."
---

# Changing a unit then tapping a capture chip silently reverts the unit

**js/app-core.js:449-454** — found by the weekly full-file review (Agent C).

    function _toggleQuickPrefsCapture(key) { ...; _saveCardioCaptureToggles(t); _openQuickPrefsPopover() }

`_openQuickPrefsPopover` rebuilds the three `<select>`s from `window._unitPrefs` (`:416`, `:423`,
`:430`), which is only updated by `_saveUnitPrefs` **after** a successful DB write (`:378`).

**Sequence, in the gym:** in the runner tap ⚙, change **Weight** from Kilograms to Pounds, then tap the
**HR** capture chip. The popover re-renders and the Weight select silently snaps back to kg. Tap **Done**
and `_saveQuickPrefs` reads kg and writes kg. **The change is gone with no message.**

**Exact drift from its own sibling.** `_toggleCardioCaptureMetric` (`app-runner.js:1780-1792`) takes a
`snapshot` of every live field and passes it back as `prefill` for precisely this reason — its comment
names the les-048 class. The `app-core` twin was written without it.

**Why this is worse than it looks:** the whole Playwright suite runs at the `kg` default and nothing flips
it, so a unit-preference bug is invisible to the entire suite — see
[[feedback_unit_preference_is_a_test_dimension]]. That is exactly how an lb-only crash stayed invisible to
428 tests on 2026-08-14.

**Fix:** snapshot the three selects before re-rendering and pass them through as selected values — or
better, write the chip's DOM state directly instead of re-rendering the whole popover, since the chips are
the only thing that changed.

**Closes when:** a spec sets weight to lb, toggles a capture chip, and asserts the select still reads lb
and that Done persists lb — RED before the fix. It must run at the **lb** preference, not the kg default.

---

## CLOSED 2026-08-29 (`4bf805d`)

`_openQuickPrefsPopover` now accepts a `prefill`, and `_toggleQuickPrefsCapture` snapshots the three
live selects before re-rendering — exactly what its sibling `_toggleCardioCaptureMetric`
(`app-runner.js:1780`) already did, and whose comment names this class.

**The test runs at the `lb` preference, deliberately.** The whole suite runs at the `kg` default and
nothing flips it, so a unit bug is invisible to all ~580 tests — which is precisely how an lb-only crash
survived 428 of them on 2026-08-14. See
[[feedback_unit_preference_is_a_test_dimension]]. Asserting kg here would have proved nothing.

**Proven both ways:** neutering the prefill gives `Expected: "lb", Received: "kg"`.
