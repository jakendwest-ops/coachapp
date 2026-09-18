# Decisions — archived entries, pre-2026-09-15

Moved out of `docs/decisions.md` on 2026-09-18 to clear `docs-budget` (that file alone was 16,058 of
the top-level docs' 90,246 chars against a 79,921 ceiling). These entries are well-settled — none
have been revisited or reversed since — and predate the 2026-09-15 Vault-replaces-repo migration,
the natural "recent, active period" cutoff every other archived doc in this set already uses. Moved
verbatim, unedited; `docs/decisions.md` keeps a pointer here. This is historical record, not current
guidance — read it for traceability, not as a live instruction.

---

**2026-08-25 — A threshold must be set AT the measurement, not with headroom above it.** Baselines
that held (`style-baseline.json`, `rule0-baseline.txt`, `predictions-baseline.txt`) were pinned at
what was actually measured. Two that were picked by hand with slack above current state
(`RITUAL_BUDGET`, `CONTEXT_BUDGET`) both grew *through* the rebuilds meant to trim them, because
headroom is exactly the amount of drift a check with slack permits.
*Why:* a ceiling set above current isn't a ratchet, it's a permit. Applies to any future
threshold/baseline this project adds, not just the two that failed.

**2026-08-25 — Never flip a warn to a blocking fail without first counting what it flags on a clean
tree.** `checks.sh` rule 2's `clients` sub-check was vacuous (could never fire); two siblings were
single-line greps that flagged 4 correct queries. Flipping either to blocking as originally written
would have refused every push.
*Why:* an unmeasured gate given teeth either blocks nothing (decorative) or blocks everything
(false refusals) — measure first, always.

**2026-08-21 — Every automated check needs a way to prove it can fail.** `gates-fired` tested its
pattern against the whole of `LOG.md`, so one match in July kept it green forever — the only
behavioural os-lint check, and structurally incapable of failing. `os-lint --self-test` now points
every check at a fixture built to trip it; any check that stays green is flagged decorative.
*Why:* an untestable check can't be distinguished from a dead one, and this one was dead for months
before anyone noticed.

**2026-08-22 — Grep for an existing ownership-anchor helper before writing a new one.** This
codebase already has four (`_verifyTemplateOwnership`, `_verifyClientAccess`, `_verifyGoalAccess`,
`_verifyMilestoneAccess`) with subtly different semantics — the "View as" (sudo) break shipped
because a second helper answering the same question as an existing one allowed a case the original
didn't.
*Why:* a duplicate ownership check is where the next ownership bug hides, almost by definition.

**2026-08-09 — Privileged/recurring operations get an Edge Function + in-app UI, not a one-off
script.** The supported way to do anything requiring service-role/RLS-bypass logic is a Supabase
Edge Function with its source tracked in-repo, re-verifying the caller's identity server-side —
not a local `SUPABASE_SERVICE_KEY=... node scripts/*.cjs` run by hand.
*Why:* Jake's explicit call after pushback on the script-based pattern ("too convoluted... won't
scale"). The script pattern still exists as a documented fallback, not the default.

---

**2026-09-05 — Deploy only fires on a `v*` tag push; pushing to `master` no longer deploys.**
Every push to `master` still runs `checks.sh`, so `master` stays continuously verified, but the
`deploy` job in `.github/workflows/deploy.yml` now requires `startsWith(github.ref, 'refs/tags/v')`.
Shipping is now a deliberate act (`node scripts/release.mjs <version>`, then push the tag), not
whatever happened to be on `master`.
*Why (quoted from the workflow file):* "before this, a release was whatever happened to be on
master, and 'don't push that yet' was a thing to remember rather than a thing that refuses. This
project's own measured rule is that written rules do not reduce errors — only checks that refuse
do." Same commit also made the `deploy` job depend only on `check`, not `e2e` — the e2e job's own
flakiness profile has never been measured, and blocking every deploy on an unmeasured gate was
judged a way for the gate to get bypassed rather than trusted.

**2026-08-22 — Ownership/RLS review moved to before the commit, not before the push.**
For diffs touching `_verifyX`-style ownership checks, `coach_id`/`client_id` scoping, `auth.uid()`,
or RLS policies, `multi-agent-review` now runs before the commit. Everything else still reviews
before the push.
*Why (per `CLAUDE.md`):* reviewing at push time caught issues a full review cycle late — every
ownership commit reviewed on the day this changed came back with a real finding.
`hooks/guardrails.mjs` blocks `git commit` on unreviewed ownership diffs to enforce this.

**2026-08-20 — Widening the pre-push test gate beyond 2 specs was tried and reverted.**
The pre-push gate currently runs only `tests/runner.spec.js` and `tests/solo-account.spec.js` — a
small fraction of the 105-file suite.
*Why (per `CLAUDE.md`):* the wider glob silently no-ops in some configurations, and the
cross-tenant probes in the broader suite aren't cleanup-safe at push frequency (they'd leave debris
in the live Supabase project on every push). A spec outside the narrow gate once sat red for 3 days
across ~4 deploys before anyone noticed — the narrow gate is a known, accepted tradeoff, not an
oversight.

**Foundational (decision moment undated, but the repo's start date is now checked)**

- **No build step, no framework, no TypeScript.** The entire frontend is plain ES6+ loaded directly
  by `index.html`. Checked via `git log --reverse`: the repo's very first commit
  (`ef4a4db`, **2026-06-20**, "CoachApp v1 — full app build") already contains the whole app built
  this way in one shot — there is no earlier "decision commit" to find, because the choice predates
  version control itself. 2026-06-20 is the earliest date this project can be dated to, not the date
  of the decision. (See [../vision.md](../vision.md) for the dogfooding-by-a-solo-PT framing this is
  consistent with.)
- **`scripts/checks.sh` + `check-*.mjs` instead of adopting ESLint/TypeScript.** A substantial
  hand-built static-analysis layer exists in place of standard tooling — still undated; unlike the
  entry above, this one plausibly grew incrementally rather than as a single traceable commit, and
  was not checked against `git log` history for each `check-*.mjs` file's own first-added date.

## Requires Validation

- Neither foundational entry above has a discoverable *rationale* anywhere this analysis could
  read — only the repo's start date was checkable (via `git log --reverse`), not the reasoning
  behind either choice. They're listed because they're clearly deliberate, load-bearing choices —
  not because their history is fully known. If Jake recalls the actual reasoning, replace these
  entries rather than leaving them inferred.
- This log was seeded from `CLAUDE.md` prose and `.github/workflows/deploy.yml` comments in the
  session that first wrote it — it has not been cross-checked against the Vault's `LOG.md`, which
  likely has a fuller and more precisely dated decision history.
