---
id: 2026-08-12-dead-code-post-wizard-deletion-runner
status: open
priority: low
reported: 2026-08-12
status_detail: "found by the full-codebase architecture audit; leftover from the 2026-08-11 wizard deletion"
---

# 2 more dead functions left over from the 2026-08-11 runner-wizard deletion

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`) — a sibling finding to the `deleted runner's dead wizard` cleanup already shipped (`262f092`, "155 lines, and the class that made it reachable").

## The two sites

- **`startStrengthSetTimer` / `renderStrengthSetTimer` / `stopStrengthSetTimer`** (js/app-runner.js:1087-1163) — `startStrengthSetTimer` has exactly one caller in the whole repo: `tests/weekly-review-2026-08-09.spec.js:23`, never wired to any UI `onclick`. Its own completion callback (1111) references `document.getElementById('wr-duration-input')`, an id that doesn't exist anywhere in the current table-only render output (confirmed via grep, zero matches) — the DOM it was written to update no longer exists.
- **`addExtraStrengthSet`** (js/app-runner.js:2039-2043) — zero callers anywhere in the repo. Its cardio sibling `addExtraCardioSet` is still wired (923); the strength-side twin was orphaned when the wizard was deleted and never removed.

## Suggested fix direction

Delete both, along with the now-pointless test at `tests/weekly-review-2026-08-09.spec.js:23` (which is testing a function with no live caller and asserting against a DOM id that no longer exists). Same "fix the class, not the instance" pattern as the earlier wizard cleanup — worth a quick grep for any other orphaned wizard-mode leftovers while in the file.
