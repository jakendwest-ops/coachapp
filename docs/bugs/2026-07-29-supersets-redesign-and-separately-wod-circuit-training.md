---
id: 2026-07-29-supersets-redesign-and-separately-wod-circuit-training
status: open
priority: medium
reported: 2026-07-29
status_detail: "open — needs scoping"
---

# supersets redesign, and separately, WOD/circuit training

**NEW — supersets redesign, and separately, WOD/circuit training.** Confirmed as two distinct asks (Jake's own call when asked directly). Supersets: today `superset_group` is a free-text letter, runner just auto-switches after a set logs — no paired display, no round tracking; already flagged for its own scoping session since 2026-07-05. WOD/circuits: brand new — N exercises in one timed block, fixed rep target per exercise per round, count total rounds completed. No existing data model for this (closest precedent is the 2026-07-25 intervals block model, but that's single-exercise; a WOD groups multiple exercises). **Neither built — both need their own scoping conversation.** WOD/circuits specifically is realistically an intervals-redesign-scale build (new block-group concept + new runner round-counting state machine), not a same-session add-on.
