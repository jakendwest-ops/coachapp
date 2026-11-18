# Progress: the items that need the database (plan, 2026-11-18)

Not built and not run. These are the Personal/solo items from the Progress audit ([2026-11-17-progress-section-audit.md](2026-11-17-progress-section-audit.md)) that touch the database, written up overnight for Jake to decide.

**Run rules:**
- Every SQL statement below is for Jake to run himself, one query per message, in the order given.
- Run the read-only check first in each item.
- Nothing here is built until Jake approves that item.

## 1. A lift goal that tracks the estimated 1RM (backlog #7, second half)

**Why:** a lift goal moves only on a heavier set. 190 kg × 3 (an estimated 1RM of about 209 kg) leaves "Deadlift 200 kg" where it was.

**The blocker:** `goals.linked_metric` has a check constraint allowing only `bodyweight` and `top_set` (`scripts/add-goal-links-2026-11-08.sql`).

**Step 1, read-only:** find the constraint's real name.

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.goals'::regclass and contype = 'c';
```

**Step 2:** widen the constraint. This is additive: no row changes, and no security rule changes.
- **The SQL below assumes the name is `goals_linked_metric_check`.** Use the name step 1 returns.
- **Rollback:** the same statement with the old list `('bodyweight', 'top_set')`. Run it only after setting any `e1rm` goals back to `top_set`.

```sql
alter table public.goals drop constraint goals_linked_metric_check, add constraint goals_linked_metric_check check (linked_metric in ('bodyweight', 'top_set', 'e1rm'));
```

**Code, after the SQL:**
- **New goal sheet:** a third option, "From a lift's estimated 1RM".
- **Live value:** `_goalsApplyLive` reads the best estimated 1RM since the goal began, with `_fetchExerciseSessions` plus `_sessionBestE1RM`. That's the same estimate as the Lifts tab: warm-ups left out, RPE counted.
- **Projection:** the goal page's projection uses each session's estimated 1RM.
- **Tests:**
  - a unit test for the live value;
  - a goals-rework spec case.

## 2. Volume per muscle group per week (backlog #8)

**What already exists:** `exercises.muscle_group`, one of Chest, Back, Shoulders, Arms, Core, Legs, Glutes, Cardio or Full Body, set in the library editor (`js/app-workouts.js`). There is also an unused `muscle_groups text[]`.

**So it may need no schema change at all.** A logged exercise carries `exercise_id`, and the Sessions read could pick up `exercises(muscle_group)` alongside it.

**The real question is coverage.** How many of the exercises you actually log have a muscle group set?

**Step 1, read-only.** It counts your logged exercises with and without a muscle group, over the last 90 days. Replace `<your client id>` with your Personal client id.

```sql
select (e.muscle_group is not null) as has_group, count(distinct wle.exercise_name) as lifts from workout_log_exercises wle join workout_logs wl on wl.id = wle.log_id left join exercises e on e.id = wle.exercise_id where wl.client_id = '<your client id>' and wl.date >= current_date - 90 group by 1;
```

**Then one of:**
- **Coverage is good:**
  - build "Sets per muscle group this week" on Sessions, beside the weekly bars;
  - working sets only, with no cardio, as the bars already count;
  - a lift with no group counts as "Other".
- **Coverage is poor:** a one-time "Tag your lifts" list on Records first. That's a write to your own library through the existing editor's save path, so it needs no new SQL.

**Open choices for Jake:**
- Count every working set, or only hard sets (RPE 7 or more, or RIR 3 or less) when an effort was logged?
- Should a compound lift count for one group, or more than one (the unused `muscle_groups` array)?

## 3. Body measurements (backlog #15)

**Why:** "am I building muscle?" has no answer today. Weight, body fat % and resting heart rate are all that's stored.

**Proposal:** a new table, and a "+ Add measurements" option in the Bodyweight log sheet, folded away like body fat. The fields:
- waist
- hips
- chest
- upper arm
- thigh

Each is optional and stored in cm, then shown in cm or inches by a new length preference.

**SQL:** the table, then its security rules, one statement each. The rules mirror `weight_logs` exactly: the client or solo user through `clients.user_id`, the coach through `clients.coach_id`.
- **Rollback:** `drop table public.body_measurements;`. The table is new, so nothing else depends on it.

```sql
create table public.body_measurements (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade, date date not null, waist_cm numeric, hips_cm numeric, chest_cm numeric, arm_cm numeric, thigh_cm numeric, notes text, created_at timestamptz default now());
```
```sql
alter table public.body_measurements enable row level security;
```
```sql
create policy "Client manages own body measurements" on public.body_measurements for all to authenticated using (exists (select 1 from clients where clients.id = body_measurements.client_id and clients.user_id = (select auth.uid())));
```
```sql
create policy "Coach manages body measurements" on public.body_measurements for all to authenticated using (exists (select 1 from clients where clients.id = body_measurements.client_id and clients.coach_id = (select auth.uid())));
```

**Before any of this runs:**
- the `sql-safety` skill checklist;
- an RLS probe spec (another coach reads nothing; solo reads its own);
- `multi-agent-review` before the commit, which the hook enforces for this kind of change;
- adding it to the GDPR export (`_buildMyDataBundle`) and to account deletion.
