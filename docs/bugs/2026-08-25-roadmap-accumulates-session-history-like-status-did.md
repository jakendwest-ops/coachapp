---
id: 2026-08-25-roadmap-accumulates-session-history-like-status-did
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-25
status_detail: "RESOLVED BY PRUNING (option 1), 2026-08-25, per Jake. 23 sections removed = 68,027 chars; roadmap 143,453 -> 75,283. context-budget GREEN and the ratchet auto-re-pinned 229,178 -> 167,461, so the saving is locked in. The ceiling was NOT raised."
---

# roadmap.md carries 31 session backlogs — the same history duplication STATUS.md just shed

`context-budget` went **RED** at the end of the 2026-08-25 session-2 save:

```
STATUS.md 92,178 + roadmap.md 143,453 = 235,631 chars (ceiling 233,762, baseline 229,178)
```

**This is the check working, not misfiring.** The session added 6,453 chars of genuinely new, live
content (+2,259 continuity invariants to STATUS, +4,194 a session backlog to roadmap) — 2.8% against a
2% tolerance.

**The real finding is what the RED points at.** `roadmap.md` now holds **31** `Session backlog` sections
going back months. Every one of them is a record of what a session did — which is `LOG.md`'s job, and
`LOG.md` already has an entry for each. It is byte-for-byte the same class as the 38,171-char
`Previous: … Previous: …` chain removed from STATUS.md hours earlier, and it grows by ~4k every save.

**Do NOT resolve this by raising the ceiling.** The check's own message says so, and raising it is
exactly how the previous two ritual trims were undone. Two real options:

1. **Prune.** Keep the most recent 2–3 session backlogs in `roadmap.md`; the rest live in `LOG.md`
   already. Verify per-section that LOG carries the same date before deleting, the same way the
   STATUS.md cut was verified (40 SHAs checked, 34 verbatim in LOG, 6 accounted for).
2. **Widen the tolerance deliberately, with the reason written down.** 2% ≈ 4,583 chars ≈ one save's
   worth of backlog, so the current setting effectively refuses every second save. If backlogs are
   *meant* to live in the roadmap, the tolerance is simply mis-set and should say so.

Option 1 is the one consistent with "STATUS/roadmap hold live state, LOG holds history". **Jake's call.**

**Closing evidence:** `context-budget` GREEN on a real run, without `SIZE_TOLERANCE` or the baseline
having been raised to achieve it.
