---
id: 2026-08-19-unilateral-pill-does-not-exist
status: confirmed
closed_by: "clause (b), 2026-08-22 sweep. tests/unilateral-runner-2026-08-19.spec.js drives the REAL _buildTargetCols (not re-typed logic) and asserts the exact string Jake was asked to eyeball: REPS/SIDE. RED-BEFORE RE-PROVEN TODAY, not just when written - neutering app-runner.js's `perSide` to '' turned 2 of 5 red; restored, 5 pass. The other 3 cover bilateral / AMRAP+unilateral / jumps and correctly stay green under that neuter."
priority: high
reported: 2026-08-19
status_detail: "FIXED commit 0d1d80b, live 2026-08-19 (app-runner v72). The PILL was never the problem — it renders correctly in both the builder and runner add-exercise modals, verified by driving each. What never existed was any PER-SIDE indicator in the runner itself. 5 red-before tests in tests/unilateral-runner-2026-08-19.spec.js. Awaiting Jake: start a workout with a unilateral exercise and confirm the target bar reads REPS/SIDE."
---

# The Unilateral pill does not exist

**Jake, 2026-08-19, verbatim:** *"the unilateral pill does not exist"*

**This is a RE-REPORT.** It was item 3 of his five screenshot items on 2026-08-14, shipped that day and
sitting at `fixed — awaiting Jake` since — see
[[2026-08-14-amrap-and-unilateral-need-to-be-toggle-pills]]. So it either never worked, or it regressed
between 2026-08-14 and now.

**Do not close the 2026-08-14 row on this investigation** — it is the same feature, and closing it would
be exactly the inference-closure the rule forbids. Update both.

## Investigation to do

The pill renders from `renderTemplateSets` into a SEPARATE host from the set toggles:

```js
const showSetToggles = type === 'weight_reps' || type === 'unilateral'
const pillHost = document.getElementById(containerId === 'att-sets-container' ? 'att-metric-pills' : 'ett-metric-pills')
if (pillHost) { pillHost.innerHTML = showSetToggles ? _togPill('Unilateral (per side)', …) : '' }
```

Note `if (pillHost)` — **it fails SILENTLY when the container is absent.** First thing to check is whether
`#att-metric-pills` / `#ett-metric-pills` are actually rendered by the modal markup. If a container was
removed or renamed, this is the same "removing a container drops every affordance it hosted" shape as
les-043 and as the 2026-08-19 GDPR consent finding.

Second thing to check: I edited `renderTemplateSets` on 2026-08-17 (`6fc7c50`, the bodyweight toggle),
adding `showAmrap`/`showBodyweight`/`showToggleRow` alongside `showSetToggles`. **Verify I did not break
the pillHost branch** — that is a same-file, same-function change three days before this report.

**Closes when:** Jake sees the Unilateral pill in the exercise editor, plus a red→green test asserting it
renders for a fresh `weight_reps` set.
