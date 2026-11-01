# Merge lift names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax. **Ownership/RLS work: `multi-agent-review` before every commit that touches SQL or `coach_id`/`client_id`/`auth.uid`.** SQL is applied by Jake (one statement per message, pasted inline) and verified locally first on PGlite.

**Goal:** A person can say "these two names are the same lift" and from then on every screen (charts, Blocks, the runner's "last time", personal-best detection, saved bests) treats them as one, with an undo.

**Architecture:** Rewrite the name on the person's own logged rows to the kept name, keeping the old name in a `merged_from` column so it can be undone, and record the merge in a small `lift_name_merges` table so FUTURE logging under the old name (a template that still says "Back Squat") lands under the kept name. Every reader already groups by name, so none of them change. The rewrite runs in one SECURITY DEFINER function that checks ownership itself, because a coached client's database rules allow them to INSERT and SELECT their own logged exercises but not UPDATE them (`live-schema.mjs`: "Client inserts own workout log exercises", "Client reads own workout log exercises"; only the coach's "manage" policy updates).

**Tech Stack:** Postgres function + table (Supabase), vanilla JS in `js/app-progress.js` and `js/app-runner.js`, `node:test`, Playwright, the PGlite verifier in `scripts/sql-verify/`.

**Spec:** `docs/superpowers/specs/2026-10-31-performance-charts-design.md` goal 5 and "Jake's merge decisions, 2026-11-01"; his answers there: a merge reaches everywhere; the owner of the history and the coach can merge; nothing merges without his choice (capital-letter-only pairs: open question below).

## Global Constraints

- A merge touches only the named client's rows. The function checks `clients.user_id = auth.uid()` (the person) or `clients.coach_id = auth.uid()` (their coach); solo has `coach_id` NULL and `user_id = auth.uid()`. Never trust the client id the browser sends.
- Reversible: `merged_from` keeps each row's original name; `unmerge_lift_names` puts it back. Nothing is deleted.
- Never merges across people. Never rewrites templates, programmes or the exercise library (those are shared and coach-owned).
- Function locked down like the others: `security definer`, `set search_path = public, pg_temp`, revoked from `public` and `anon`, executable by `authenticated` only (`scripts/check-sql-definer.mjs` enforces).
- The app must keep working before the SQL is applied: the new calls fail soft ("Merging isn't switched on yet") and logging is unchanged.
- No `log.*` with names. Weights in kg in the database, the person's unit on screen.

## Review Focus

- A merge chain (A into B, then B into C): the old row names resolve to C, with no cycle (A into B then B into A is refused).
- Two people with the same lift name: merging for one never changes the other.
- The runner saving a session mid-merge (a set logged under the old name seconds before the merge).
- A lift that exists only as a saved best (`client_1rms`) with no logged sessions.
- Case/space only differences ("Depth jump" / "Depth Jump"): the kept name is the one the person picked, never guessed.
- Undo after new sessions were logged under the kept name: only rows that carry `merged_from` revert.
- A coach merging a client's lifts while the client has the runner open.

---

### Task 0: Read the live facts (Jake runs ONE query per message; I paste each)

- [ ] Columns of `workout_log_exercises`, `client_1rms` and any record table that stores a lift name (information_schema).
- [ ] Policies and triggers on `workout_log_exercises` and `client_1rms` (pg_policies, pg_trigger), so the function is built against what is live, and nothing UPDATE-guarding rejects it.
- [ ] Write what came back into `scripts/sql-verify/` fixtures (the verifier loads the live schema).

### Task 1: The SQL, verified locally

**Files:** Create `scripts/add-merge-lift-names-2026-11-XX.sql`, `scripts/sql-verify/merge-lift-names.verify.mjs` and `.mutations.mjs`.

**Interfaces:** Produces
- columns `workout_log_exercises.merged_from text`, `client_1rms.merged_from text` (nullable)
- table `lift_name_merges(id, client_id uuid not null, from_name text not null, to_name text not null, created_by uuid, created_at)`, unique on `(client_id, lower(trim(from_name)))`, RLS: select for the person and their coach, no direct insert/update/delete
- `merge_lift_names(p_client_id uuid, p_from text, p_to text) returns jsonb` -> `{ sessions, bests }`
- `unmerge_lift_names(p_client_id uuid, p_from text) returns jsonb`

- [ ] Verifier first (red): refuses another coach, another client, no identity, same name, a cycle; merges only that client's rows; solo works; a coached client works; the coach works; undo restores exactly the rewritten rows; the function is revoked from public and anon.
- [ ] Mutation file: drop the ownership check, drop the client filter, drop the cycle check; each must turn the verifier red.
- [ ] Write the SQL; verify green; add the rollback (drop function, drop table, drop columns).
- [ ] `multi-agent-review` before the commit (ownership). Jake applies it live, read-back query after.

### Task 2: Pure JS with node tests

**Files:** Modify `js/app-progress.js`; Create `tests-node/lift-names.test.mjs`.

**Interfaces:** Produces `_liftNameGroups(names)` -> groups of names that differ only by case, spaces or hyphens (flagged "same lift") and likely typos (one edit apart, flagged "maybe"); `_canonLiftName(name, merges)` -> the kept name, following chains, case-insensitive, cycle-safe.

- [ ] Red tests, then implement; mutation-check the cycle guard.

### Task 3: The merge screen

**Files:** Modify `js/app-progress.js`, `css/main.css`; Create `tests/merge-lift-names-2026-11-XX.spec.js`.

- [ ] On a lift card in Lifts: **Merge into…** (pick the name to keep from the person's other lifts), a confirm sheet that says the counts ("12 sessions and 2 bests will count as Barbell Back Squat. You can undo this."), then the RPC call, then redraw.
- [ ] **Tidy up lift names** card at the top of Lifts: suggestions from `_liftNameGroups`, each with the kept name chosen by the person (nothing preselected for "maybe"), one tap per merge.
- [ ] **Merged names** list with **Undo** per merge.
- [ ] Soft-fail copy when the function is missing; 44 px targets; 320 px no sideways scroll.
- [ ] Specs (read-only stubs plus one real round trip on an `[E2E-MERGE]` fixture, torn down with `.select('id')` and a row-count assertion).

### Task 4: New logging lands under the kept name

**Files:** Modify `js/app-runner.js` (the five places that write `exercise_name`: the session save at ~3368 and ~3465, the PB write ~3669, ~3807, and the manual log ~4138).

- [ ] Load the person's merges once per runner session; one helper `_canonLiftName` at those five writes.
- [ ] Runner specs: log "Back Squat" after merging it into "Barbell Back Squat": the saved rows carry the kept name, "last time" prefill finds the older sessions, and a PB against the old history is detected.
- [ ] `multi-agent-review`; full suite.

### Task 5: Gates and release order

- [ ] checks.sh, mobile check, review (ownership, so before each commit), docs (decisions, roadmap, the charts design status).
- [ ] Release order: SQL applied and read back by Jake FIRST, then the release (the JS fails soft if it ever runs first).
- [ ] Coach's client-profile merge screen is a second step (the profile's Performance tab does not share this page's code); the function already lets the coach merge.

## Open question for Jake

Capital-letter-only pairs (Depth jump / Depth Jump, Barbell hold / Hold, Trap bar jump / Jump): you said they should merge on their own. Options: (1) one tap on the Tidy up card merges all of them, (2) they merge by themselves the first time Lifts opens. Recommended: (1): a page view that writes to your history is a surprise, and one tap costs a second.
