---
id: 2026-07-13-high-latent
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# HIGH (latent)

**HIGH (latent) — `renderClientWorkoutsPage` resolves the client record with an ambiguous `.single()`** (app-workouts.js:241): `from(clients).eq(user_id, currentUser.id).single()` with **no coach_id discriminator**. A master account can hold TWO clients rows (coached + solo) — tests/rls-audit.spec.js:133 documents exactly this hazard. Two rows → PGRST116 → null → the Workouts page renders No client profile found, silently. Latent only because Jake account currently has just the solo record (no Client pill in his view switcher). Fires the moment a coached self-record exists. The canonical resolver `_getCurrentClientId()` (app-core.js:414) exists and is NOT used by any of the 3 reviewed modules. Same ambiguous query at app-workouts.js:2013 (startWorkoutRunner) with no fallback.
