---
id: 2026-08-02-client-id-in-your-clients-or-created-by-you
status: closed
priority: critical
reported: 2026-08-02
status_detail: "fixed — confirmed by Jake"
---

# client_id IN (your clients) OR created_by = you

✅ **FIXED + LIVE 2026-08-02 — CRITICAL RLS gap on `events` closed and confirmed red→green.** Root cause found from Jake's live diagnostic (`pg_policies`): the `"coach access"` policy is `cmd: ALL` with no explicit `WITH CHECK`, so Postgres reused its `qual` for writes too — `client_id IN (your clients) OR created_by = you`. The OR's second half exists to let a coach manage client-less personal calendar entries, but since the app always sets `created_by` to whoever's inserting, it trivially satisfied the write-check on ANY insert regardless of whose client_id was set. Fixed with a targeted `ALTER POLICY "coach access" ON events WITH CHECK (...)` that keeps the personal-event case (`client_id IS NULL AND created_by = auth.uid()`) but requires genuine ownership whenever `client_id` is actually set — read-side `qual`/DELETE untouched. Jake ran it live, confirmed. Re-ran the exact probe that caught this: red before, green after (×2). Also independently verified the fix didn't break legitimate coach writes (own-client event insert + client-less personal event insert both still succeed).
