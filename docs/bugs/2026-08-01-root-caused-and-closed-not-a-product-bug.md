---
id: 2026-08-01-root-caused-and-closed-not-a-product-bug
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-01
status_detail: "fixed — awaiting Jake"
---

# root-caused and closed, not a product bug

✅ **FIXED + LIVE (LOCAL) 2026-08-01 — root-caused and closed, not a product bug.** Confirmed via direct DB query + a screenshot (not a guess): only ONE `[E2E] PT-Only Lift` row existed most of the time, but the test's own fixture-insert (`solo-account.spec.js:146-149`) never checked for a pre-existing same-named row first — so any earlier crashed run of this exact test (assertion failure between its own insert and its `finally` cleanup) left a permanent orphan, and the next real run inserted a second one on top of it, producing the strict-mode "2 elements" violation. Fixed by making the test self-heal (delete-by-name before insert) — same convention as `tests/helpers.js`'s `sweepPT2`. Also swept 15 unrelated, much older `[e2e]`/`[debug] rollback exercise <timestamp>` debris rows (dated 2026-07-07 to -13, from some earlier rollback-test session, confirmed via direct query before deleting) out of PT's real exercises table — this was blocking `checks.sh`'s pre-push smoke-test gate outright, not optional cleanup. Re-ran `solo-account.spec.js` in full: 15 passed, 1 conditional skip (no program assigned), 0 failed. — (orig) **NEW 2026-08-01 — strict-mode duplicate-locator violation, not a real product regression.**
