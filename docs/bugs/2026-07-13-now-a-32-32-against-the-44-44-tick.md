---
id: 2026-07-13-now-a-32-32-against-the-44-44-tick
status: unverified-accepted
priority: high
reported: 2026-07-13
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'go ahead' to: accept rows whose fix is still in the code, and the general older rows; keep security/data-safety rows for an audit). No red->green test proves this one; no longer tracked."
---

# now a 32×32 × against the 44×44 tick

✅ **FIXED + LIVE 2026-07-23 (7fe41e0)** — now a 32×32 × against the 44×44 tick. The ≥8px gap is KEPT (separate 2026-07-05 request, own regression test — smaller and spaced are not in conflict). **Needs your eyes.** — (orig) **RE-REPORTED 2026-07-23** (10 days open): *"the 'delete' button could stand to be a little smaller"*. Screenshot shows a full-width-ish red **Delete** label against a small unlabelled tick — the destructive control is still the easier tap. — **Runner: delete-set button must be SMALLER than the complete-set button** — they compete at equal weight mid-set, and the destructive one should never be the easier tap. (Jake's alternative, below, may supersede this.)
