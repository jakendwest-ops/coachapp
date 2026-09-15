---
id: 2026-07-09-1rm-value-silently-shifts-by-0-5kg-when-the-entered-value-ma
status: fixed-awaiting-jake
priority: high
reported: 2026-07-09
reported_detail: re-checked 2026-08-02
status_detail: "ACCIDENTAL VECTOR FOUND AND FIXED 2026-09-04. A mouse wheel over a focused number input steps it by one step in real Chrome 152 and real Edge, and NOT in Playwright bundled Chromium 149 — which is why two prior investigations tested this route and found nothing. Jake confirms the unit was kg, where one notch is EXACTLY 0.5 kg. Guarded globally across all 95 number inputs. Awaiting Jake: does it recur? One detail of the original report — that it happened when the value MATCHED another entry — is still unexplained."
---

# 1RM value silently shifts by 0.5kg when the entered value matches an existing entry (e.g

**1RM value silently shifts by 0.5kg when the entered value matches an existing entry** (e.g. entering 200kg when another exercise is already 200kg saves as 199.5kg). **Re-investigated 2026-08-02, same conclusion reached independently**: traced `save1RM` (the actual save path, app-progress.js) end to end — `weightFromPref` passes a kg-preference value straight through with no rounding, and there's no dedup/cross-exercise logic anywhere in the insert/update path. Also checked the display formatter (`fmtWeight` via `latest.one_rm_kg`) — no rounding there either. Nothing in the code explains this mechanism. Needs a live repro (devtools open, watch the actual network request/response) before any further attempt — reading the code twice hasn't found a lead. NOT the %1RM-target rounding fixed 2026-07-10.

## INVESTIGATED 2026-08-26 — two real bugs found, but NEITHER explains the 0.5. Row STAYS OPEN.

This row demanded a live repro before any further attempt. Done. Findings, in order of certainty:

**1. Both prior investigations traced the wrong writer.** They followed `save1RM`. There are FIVE
`client_1rms` write paths; the grid (`saveOneRMGrid`, app-progress.js:119) is a different one and is
the surface where “another exercise is already 200” actually happens — you copy the number you can see.

**2. CONFIRMED + FIXED (different bug):** in lb, the display is a lossy proxy — 200 kg paints as
“440.9”, typing that back stores 199.99, and the next render rounds it to “200” so the drift is
invisible. Filed and fixed as
[[2026-08-26-lb-display-value-saved-back-corrupts-the-stored-kg]] (d320220, 7 sites).

**3. It does NOT explain this row.** The lb round trip is bounded at **~0.023 kg** and cannot
produce 199.5. The only thing in this path that yields exactly 0.5 is `step="0.5"` on the grid input
(app-progress.js:234) plus a deliberate arrow/spinner press — confirmed: one ArrowDown from a painted
“200” gives exactly “199.5”. Tested the accidental route (mouse wheel over a focused input) and it did
**NOT** step the value — caveat: headless Chromium, real Chrome may differ and I could not test that.

**Deliberately not closed.** Forcing the mechanism I found to be the one Jake reported is the les-049
failure (a confidently wrong root cause, repeated before checking). Two real bugs were fixed; his
symptom is still unexplained.

**The one question that would settle it:** was the weight unit set to **lb**, and do you remember
using the up/down arrows or the field’s spinner?
  - lb + no arrows → the fixed bug is very likely what you saw, and “0.5” was an approximation.
  - kg + arrows → it is the step, and the fix is to remove `step="0.5"` from a field where a stray
    keypress silently rewrites training data.
  - kg + no arrows → **both findings are the wrong track** and this needs a fresh investigation.

---

## 2026-09-04 — the untestable branch, tested. A mouse wheel steps the field in Jake's browsers.

The 2026-08-02 entry above closed with a caveat it could not resolve: *"Tested the accidental route
(mouse wheel over a focused input) and it did **NOT** step the value — caveat: headless Chromium, real
Chrome may differ and I could not test that."*

**Tested properly, on an isolated `data:` URL containing nothing but
`<input type="number" step="0.5" value="200">`** — no app, no login, no fixture, so the result is
about the browser and nothing else:

| browser | wheel over the focused field |
|---|---|
| Playwright's bundled Chromium 149 | 200 → 200 — no change |
| **real Chrome 152** | **200 → 200.5 — STEPPED** |
| **real Edge** | **200 → 200.5 — STEPPED** |

**That is why two investigations found nothing.** The suite runs the bundled build, which does not have
the behaviour. This is the same class of blind spot as the 2026-08-07 Tracking-Prevention finding:
Playwright's browser is not the user's browser, and a negative result from it is not a negative result.

### Jake's answer closes the decision tree

The row asked: *lb + no arrows*, *kg + arrows*, or *kg + no arrows*. **Jake confirmed kg** (2026-09-04).

Measured through the app's own `weightFromPref`, because every weight input **hardcodes** its step —
none is unit-aware, unlike the cardio-distance field:

| unit | one notch, displayed | stored change |
|---|---|---|
| **kg** | 200 → 200.5 | **exactly 0.5 kg** |
| lb | 200 → 200.5 | 0.2268 kg |

So the hazard exists in **both** units — Jake asked directly — but **only kg produces exactly
"0.5kg"**, which is what he reported. The lb round-trip bug fixed on 2026-08-26 is bounded at ~0.023 kg
and could never produce it either.

**A wheel requires no deliberate action at all** — scrolling a page while a field happens to hold focus
is enough. That makes it a far better fit for "silently shifts" than a spinner press.

### Fixed as a class

One `document`-level listener blurs a focused number input on `wheel` (`app-core.js`, v25). It covers
all **95** number inputs, 17 of which carry `step="0.5"`. `blur()` over `preventDefault()` because both
were measured to work and blur can stay `passive`, so page scrolling is untouched.
Spec: `tests/wheel-guard-2026-09-04.spec.js`, verified RED with the listener removed.

The test asserts the MITIGATION (the field loses focus), not the symptom — a test scrolling a field and
asserting the value is unchanged would pass on a completely unguarded app in the bundled browser. That
is the vacuous-green trap this row already walked into once.

### What is still NOT explained — stated rather than papered over

The original report says the shift happened **"when the entered value matches an existing entry"**
(200kg entered while another exercise already held 200kg). Nothing in the wheel mechanism explains that
correlation. It may be an artefact of recollection — the value was memorable *because* it matched — or
it may be a second signal. Forcing the mechanism found to be the whole story is exactly the
confidently-wrong root cause this row warned about twice, so it is not being claimed.

**Also checked and clean:** whether the 2026-08-26 lossy-proxy fix missed a 1RM field. `#1rm-weight`
(`app-progress.js:302`) renders `value="${weight}"` with no `data-kg`/`data-shown` — the exact shape
that fix exists to catch — but it is only ever prefilled from its OWN displayed value when the user
swaps exercise mid-modal, never painted from a stored kg, so the round trip cannot reach it. The 1RM
grid, which IS painted from stored kg, correctly carries `weightInputAttrs` and reads back through
`weightFromInput`. No eighth missed site.

### Decided 2026-09-04 — `step="0.5"` STAYS

The arrow keys and spinner still step by 0.5. That is a deliberate keypress, not an accident, and
0.5 kg is a genuinely useful increment for a 1RM. **Jake's call, 2026-09-04: keep it.** Removing it
would cost a real affordance to defend against an action the user meant to take, now that the
ACCIDENTAL vector (the wheel) is closed. Do not re-propose removing it without new evidence that a
deliberate arrow press is causing real data loss.

**Closes when** Jake confirms he no longer sees it.
