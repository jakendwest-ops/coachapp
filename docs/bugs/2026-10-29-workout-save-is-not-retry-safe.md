---
id: 2026-10-29-workout-save-is-not-retry-safe
status: open
priority: high
reported: 2026-10-29
status_detail: "open — R4a built 2026-10-29 on branch r4a-retry-safe-save, NOT merged or released. Red→green done (the new spec failed 7 of 9 on the old code; its 16 tests pass now; 15 deliberate breakages each fail their test against a clean baseline). Stays open until it ships and Jake's airplane-mode check passes on a phone. Live impact still unmeasured (R4-0(b) counts not run)."
---

# A workout save on bad signal can be lost, doubled or left empty

Both save paths, `saveRunnerSession` (`js/app-runner.js` ~3112) and `saveWorkoutSession` (~3804), do three separate
inserts with server-generated ids: `workout_logs`, then `workout_log_exercises`, then `workout_log_sets`. Read from source
on 2026-10-29:

- **Doubled:** if the server commits an insert but the response is lost, the page reads a failure; the next Save tap
  inserts a second session.
- **Left empty:** a failure on the exercises or sets insert is "rolled back" with deletes whose results are never checked
  (~3184, ~3286-3287). On a dead connection the deletes fail for the same reason, leaving a session with no data.
- **Lost:** `_loadRunnerDraft` (~187) discards any draft from a previous calendar day, so a workout that failed to save in
  the gym and is reopened the next day is gone.
- **Raw errors:** the toast shows `Save failed — ${error.message}` (internal text).

**Measured vs guessed.** The code shape is read; how often it happens live is **unmeasured**. The plan's R4-0(b) count queries
(sessions with no exercises; same-day duplicate names) would size it.

**Fix (R4a, 2026-09-19 plan):** client-chosen stable ids plus ignore-duplicate writes, so a retry converges to one complete
session; the retry updates name/notes; a failed save keeps the draft as pending for up to 14 days behind a page-level
"Workout not saved" bar with Retry / Discard; errors classified in plain English. Gated on R4-0(a), a read-only schema query
that decides whether each table accepts a client-chosen `id`.

**R4-0(a) answered by Jake, 2026-10-29.** All three `id` columns are `uuid` primary keys with a default only
(`gen_random_uuid()` / `uuid_generate_v4()`), so a client-supplied id is accepted: the stable-id design applies to all three
tables and no "delete children, then insert" fallback is needed. Children cascade on delete (`log_id` and
`workout_log_exercise_id` are `ON DELETE CASCADE`). A client may delete only an EMPTY log and EMPTY log exercises, and has no
DELETE on sets; since sets go in one batch, a partial save is either a bare log or a log plus set-less exercises, both of which
those policies allow a client to remove (exercises first, then the log). **UPDATE policy read 2026-10-29 (Jake):** `workout_logs_update_owned_client_only` has `USING (coach_id = auth.uid())`. A
log's `coach_id` is `COALESCE(clients.coach_id, clients.user_id)` (the INSERT check enforces it), so a coach and a Solo account
can update their own logs and a CLIENT account cannot. Design consequence: the log write uses ignore-duplicates with
`select('id')`, which returns the row only when it was newly inserted; when the log already existed and the name/notes changed
between attempts, a coach/Solo retry updates them, and a client retry keeps the first attempt's values and says so - never a
silent no-op.

**Built 2026-10-29 (R4a, branch `r4a-retry-safe-save`).** `_persistSession` (js/app-runner.js) is the one writer for the runner
and the manual Log session form: phone-chosen ids, skip-existing upserts, a rename on retry, then head counts of exactly the rows
it wrote (a skipped row that is not ours fails, never "saved"). A failed save is kept on the phone for 14 days behind a "Workout
not saved" bar (Retry / Discard). Two 3-angle reviews ran before the commit; their fixes are in: the typed name and notes survive
a reload; Discard first checks the server (any set means it had saved, so nothing is deleted; no signal means nothing is
dropped); sign-out asks first and counts every account's unsaved workouts (it still clears them all); another account's unsaved
workout on a shared phone is neither shown, discarded nor overwritten (a runner for that client refuses to start); the manual
form locks its rows after a failed save and tidies the partial session when closed with ✕ or Cancel; Back is refused only once
a write was actually sent; a master account sees each unsaved workout in the view it belongs to.

**Known limits, named not fixed:** a bare HTTP 500 with no code reads as "no signal" (kept, not reported); with no signal the
"Saving…" state lasts about 7 s before the message (supabase-js 2.117 retries a failed read); the bar names a coach's client only
when the save got as far as the client check; navigating away (rather than ✕ / Cancel) from a manual form after a failed save
leaves the partial session in the history, where it can be deleted; a master account's unsaved workout for its own client record
shows only in its client view; a workout reopened days later shows its duration in days on the finish screen; Discard while a
save is in flight is refused on the runner (Save button) and the form (guardReentry's in-flight set). Not built: true
all-or-nothing (a server-side function) and background saving while the app is closed (needs an installable app).
