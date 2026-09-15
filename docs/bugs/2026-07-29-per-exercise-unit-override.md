---
id: 2026-07-29-per-exercise-unit-override
status: open
priority: medium
reported: 2026-07-29
status_detail: "open — needs scoping"
---

# per-exercise unit override

**NEW — per-exercise unit override.** Jake wants specific exercises to always display in a chosen unit regardless of the account-wide toggle (e.g. Trap Bar Jump always in cm even if the account default is inches). The account-wide toggle (shipped 2026-07-25) is wired through a large number of call sites across the builder/runner/Progress page — a per-exercise override changes the formula at every one. **Needs a scoping conversation** (which unit types need it, where it's set) before building — not started.
