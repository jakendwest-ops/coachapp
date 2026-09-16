---
name: multi-agent-review
description: The pinned local multi-agent code review for CoachApp — 3 fixed review angles plus a verifier pass. Run before the COMMIT for ownership/RLS work and before any push for everything else (diff mode), and once a week against whole high-churn modules (full-file mode). Replaces improvising the review prompt fresh each session so rigor stays consistent and can't silently narrow.
---

# Multi-agent code review (pinned)

This is the fixed, versioned review prompt. **Do not improvise a new set of angles each session** — that was the old failure mode: with no pinned baseline there was no way to tell if rigor was drifting, and nothing forced the review to look past the current diff. Run this skill instead.

Two modes:
- **Diff mode** (default) — before the COMMIT for ownership/RLS work (enforced by hooks/guardrails.mjs),
  before the push for everything else. Reviews only what changed this session.
- **Full-file mode** — the weekly deep pass (hello-claude Step 4). Reviews whole high-churn modules, not a diff, to catch latent bugs in code no recent session touched.

**On `/code-review ultra` (corrected 2026-07-13):** it *does* exist in the VSCode extension — the long-standing claim across four skill files that it "is NOT available" was true of the desktop app and went stale here. It is **user-triggered and billed**, so you cannot launch it yourself. You may *offer* it (it's a deeper cloud review than this local substitute); never assume it, and never depend on it. This skill remains the default, because it always works and costs nothing extra.

---

## Step 0 — Establish scope

**Diff mode:** capture the exact diff under review.
```
cd C:\Users\jaken\OneDrive\coachapp && git diff HEAD   # or git diff <last-pushed>..HEAD
```
List the changed files and hand the *diff* (plus enough surrounding context to reason about callers) to each agent.

**Full-file mode:** pick the 2–3 highest-churn modules. Confirm, don't assume:
```bash
for f in js/*.js; do echo "$(git log --since='30 days ago' --oneline -- "$f" | wc -l) $f"; done | sort -rn
```
Hand each agent the *whole file(s)*, not a diff.

**After a full-file run, update the marker** — otherwise `os-lint` keeps (correctly) reporting that this gate
has never fired:
```bash
node -e "require('fs').writeFileSync('C:/Users/jaken/.claude/state/last-full-file-review', new Date().toISOString())"
```

State which mode you are running at the top of the report.

---

## Step 1 — Spawn 3 review agents in parallel

Spawn all three at once (independent). Each gets the scope from Step 0 and its own fixed angle below. Each agent must **cite concrete evidence** for every finding (file:line, a specific input that breaks it, or a specific other caller affected) — no vibe-checks, no "consider reviewing X." An agent that finds nothing says so explicitly.

### Agent A — Security & multi-tenant scoping
- Every `db.from('<table>')` in scope: is it scoped by `coach_id` and/or `client_id` correctly for the role that runs it? Flag any query on `clients`, `workout_templates`, `programs`, `workout_logs`, `weight_logs`, `performance_logs`, `goals`, `events`, `client_1rms`, `client_programs` that filters by `id` only with no ownership anchor.
- Any new/changed write path: is there an RLS policy covering the exact operation (SELECT/INSERT/UPDATE/DELETE checked **separately** — a working INSERT does not imply UPDATE/DELETE)?
- Any `getPublicUrl` (must be signed URLs). Any PII (names, emails, weights, health values) in `log.*` calls — IDs and dates only.
- Any `auth.users` referenced in RLS (must be `auth.uid()`/`auth.email()`).

### Agent B — Solo-mode correctness
- For every branch keyed on `currentProfile?.role` or `isClientPlan`: is there a correct `'solo'` path or `window._soloClientId` fallback? A fetch gated only by `isClientPlan` returns empty in solo mode.
- Trace any shared render/save function touched (`renderCalendar`, `renderWorkouts`, `renderProgress`, etc.) through **all three roles** — coach, client, AND solo — not just the one being developed.
- `coach_id` derivation for a logged-in client/solo user must use the client record's `coach_id` (falling back to `currentUser.id` for solo), never a bare `currentUser.id` for coach-owned tables.

### Agent C — Duplicates, render-safety & regressions
- Duplicate function definitions (second silently wins). Dead/orphaned functions. Copy-paste drift.
- Render loops: any function that conditionally calls `renderRunner()`/`renderX()` again — prove it is bounded, not recursive.
- Timer/interval leaks (`setInterval` without a matching clear). Modal stacking (any overlay opened over the runner's z-index:300 layer must set z-index ≥1000).
- Regression: what did the old code cover (loading/disabled/mid-flow states, an overlay, a query filter) that the new code now exposes or drops?

---

## Step 2 — Verifier pass

After the three agents report, run one verifier (yourself or a fourth agent) that does NOT take the findings at face value:
- For each **claimed bug**, confirm it is real by reading the cited line — reject anything the citation doesn't support.
- For each agent's **"clean" claim on a specific risk**, spot-check one instance to confirm the agent actually looked (e.g. if Agent A says "all queries scoped," open one query it didn't cite and verify).
- Resolve contradictions between agents.

Only findings that survive the verifier go in the report.

---

## Step 3 — Report

Report, most-severe first:
- **Mode** (diff / full-file) and scope reviewed.
- **Blocking findings** (must fix before push) — file:line, the concrete failure, the fix.
- **Non-blocking** (worth doing, not a blocker).
- **Verified clean** — the specific risks that were checked and ruled out (so "clean" means "looked and found nothing," not "didn't look").

Do not fix in this skill — report. Fixing happens after, under the normal build gates.

---

## Step 4 — Record that the review ran

```bash
cp "C:/Users/jaken/.claude/state/session-current" "C:/Users/jaken/.claude/state/review-ran"
```

`hooks/guardrails.mjs` **blocks `git commit`** when the staged diff touches ownership/RLS scoping
(`_verifyX`, `coach_id`, `client_id`, `auth.uid`, `create policy`) and no review has run this session.
This marker is what clears it. If you skip this step the next ownership commit is refused — which is
the intended behaviour, not a bug: write the marker *after* the review, never before it.

**Why the rule moved from pre-push to pre-commit (2026-08-22).** Reviewing before the push caught
things one full cycle too late. Every ownership commit reviewed that day came back with a real finding
— an anchor resolved from the wrong id, a guard sitting after a destructive write, and a decorative
test assertion — all found after the code had been written and staged as finished. The marker is
session-scoped rather than diff-hash-scoped on purpose: a hash marker would re-block after every
review-fix edit, and refusing the legitimate user is this project's most-shipped guard bug.

---

## Notes

- Keep the three angles fixed. If a genuinely new class of bug appears repeatedly, add it to the relevant agent's checklist here (and note it in the LOG) — evolve the pinned prompt deliberately, never silently per-session.
- This skill is referenced by hello-claude ("Before any git push" standing behaviour + Step 4 weekly deep pass) and by deploy-check Step 2.
