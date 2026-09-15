---
id: 2026-07-13-1rm-column-shows-the-percentage-the-derived-kg-moved-to-the-
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# 1RM column shows the PERCENTAGE; the derived kg moved to the KG ghost text and now outranks last session (on a

✅ **FIXED + LIVE 2026-07-23 (7fe41e0)** — 1RM column shows the PERCENTAGE; the derived kg moved to the KG ghost text and now outranks last session (on a %1RM set the prescription is the meaningful reference). Review caught that the ghost was computed inside the weight_reps branch only, so UNILATERAL sets would have shown a % and no load — hoisted above the branches. **Needs your eyes.** — (orig) **RE-REPORTED 2026-07-23 with the full design** (10 days open). Jake, with screenshot: *"change the 1rm target to the % requirement, and then the ghost text in the weight fields should be populated with the required weight. I dont want to get the runner too overcrowded as this could be overwhelming."* So it is not just a relabel — the calculated kg MOVES into the KG inputs' ghost text. **Design question to settle first:** ghost text currently carries LAST SESSION's weight (deliberate, 2026-07-11 — rows start empty so a value is never mistaken for one you typed). %1RM target and last-session weight compete for the same slot. `_buildTargetCols` (app-runner.js) already shows % when no 1RM is known and kg when one is — this inverts that. — **Runner: `1RM target` field should show the PERCENTAGE, not the weight** — the weight is already ghost-texted per set below it, so the field duplicates it. Show e.g. `80%` (as authored on the exercise); let the ghost text carry the actual kg per set.
