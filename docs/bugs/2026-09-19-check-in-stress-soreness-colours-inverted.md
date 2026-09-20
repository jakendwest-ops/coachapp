---
id: 2026-09-19-check-in-stress-soreness-colours-inverted
status: closed
priority: medium
closed_by: tests/checkin-review-2026-09-20.spec.js
reported: 2026-09-19
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence (red before, green after; see the resolution at the bottom). Originally: found by a code read during the 2026-09-19 product review (not reported by Jake)."
---

# Check-in scores: stress and soreness are coloured as if high were good

Found 2026-09-19 while reviewing check-ins and progress tracking. Not reported by Jake.

On the coach's client Overview, `renderClientOverview` (`js/app-clients.js`) colours every check-in metric with
one local function, `ciColour(val)`: 1–2 red, 4–5 green, anything else the accent colour (defined at ~380, used at
~387, ~401 and ~415). That is right for **sleep** and **energy** (higher is better) and backwards for **stress**
and **soreness**, where a 5 is the bad answer. So stress 5/5 and soreness 5/5 — the two scores a coach most needs
to notice — render **green**, and 1/5 renders red.

**Plain English:** a client who reports being extremely stressed and very sore looks fine at a glance; a calm,
fresh client looks like a problem.

**What closes it:** a test that fails first and passes after — `renderClientOverview` with `db.from` stubbed to
fixture rows (no writes, no debris) asserting stress 5 / soreness 5 are not green and stress 1 is not red — then a
shared tone helper (`CHECKIN_METRICS` + `_checkInTone`, `js/app-core.js`) replacing `ciColour` at all three call
sites. Planned as Commit A of the check-in plan and R1d in
[the release plans](../superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md). Not built.

---

## 2026-09-20 — fixed; closed on rule-(b) evidence

**Fix.** The four metrics and their polarity now live once in `js/app-core.js` — `CHECKIN_METRICS` (each with
`goodWhen: 'high' | 'low'`), `_checkInTone` (1–2 bad, 3 ok, 4–5 good, after folding a low-is-good answer with
`6 - n`) and `_checkInColour`. The Overview uses them at all three colouring sites (the latest-check-in tiles, the
trend bars, the previous-check-ins list) and renders its metric list from `CHECKIN_METRICS` instead of two hard-coded
copies. The local `ciColour` is gone.

**Red → green** (`tests/checkin-review-2026-09-20.spec.js`, 4 tests, rendering the real `renderClientOverview` against
stubbed rows — no database rows, nothing to clean up). On the unfixed code the browser painted stress 5/5 as
`rgb(34, 197, 94)` (green) where the bad answer is `rgb(239, 68, 68)`, and soreness 1/5 red where it should be green —
in the tiles, the trend bars and the previous list; 2 of 4 failed. After: 4 pass. The assertions are relational
("stress 5/5 must look exactly like energy 1/5"), so they stay true whatever green and red the design uses.
Neuter proofs: stress flipped back to high-is-good → the tile, bar and previous-list assertions fail while both mirrors
hold; the "bad" threshold moved from 2 to 1 → **only** the absolute boundary assertion catches it (the relational
checks alone would have passed, which is why those absolute checks were added). I also looked at the rendered card at
390 px: stress 5/5 and soreness 4/5 read red, a stress-1 row reads green, layout unchanged.

**Two deliberate visible differences.** The good green is now the design system's `--success` token (`#10b981`) rather
than the old hard-coded `#22c55e`; red is `--danger`, which is the same red as before. And a missing score is now muted
instead of red (the old function read `null` as 0).

**Sibling sweep.** `ciColour` was the only value-based colouring of check-in scores. The client dashboard's
last-check-in tiles use a constant accent colour, so they are unaffected. Two hard-coded four-metric lists remain, both
in `js/app-dashboard.js` (~592, the display, and ~603, the form sliders), plus `saveClientCheckIn`'s per-field reads in
`js/app-clients.js` — all three are rebuilt by the check-in loop (Commit B), which will adopt `CHECKIN_METRICS`.

**Style ratchet.** `js/app-clients.js` fell from 23 to 21 style literals (the two hex colours left), so its baseline
is pinned at 21; `js/app-core.js` is unchanged at 16 — a hex code inside my new comment counted +1 and was reworded
rather than the baseline being raised.
