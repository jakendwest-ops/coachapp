---
id: 2026-09-19-check-in-stress-soreness-colours-inverted
status: open
priority: medium
reported: 2026-09-19
status_detail: "open — found by a code read during the 2026-09-19 product review (not reported by Jake); closes on a red→green test, planned as R1d"
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
