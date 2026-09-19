# Backlog Snapshot

**The live bug ledger is now [`docs/bugs/`](bugs/)** — one markdown file per bug, migrated wholesale
from the Vault 2026-09-15. This file is a snapshot/index over it, not a live query — counts below
will drift as bugs get filed/closed.

**Resolved 2026-09-15:** `os-lint`'s `BUGS` path now points at `docs/bugs/`. Verified: its open-bug
count (43) matches this file's count below. **File new bugs here only.**

**Bug intake/closure rule** (migrated from the Vault's `STATUS.md`, verbatim in spirit): the moment
Jake reports a bug, it becomes a file in `docs/bugs/` — before investigation starts, not at
session-end. Each file is `bugs/NNN-slug.md` with YAML frontmatter (`status`, `priority`,
`reported`, `status_detail`) plus the full original description as the body. **A Jake-reported item
closes only on (a) Jake confirming it, or (b) a test that went red before the fix and green after**
— never by inference, never because a commit message claimed it. `fixed-awaiting-jake` is a relabel,
not a close.

**Snapshot:** 2026-09-15, counted from frontmatter. **2026-09-16:** hand-checked all 18
`closure-candidates` rows against real spec content. 5 closed (genuine rule-(b) evidence); 8 left
open on purpose (row text reserves closure for Jake); 1 left open with a note (real fix, no
asserting spec); 4 citations were false-positive matches. Counts below reflect the 5 closures.

## Status breakdown (227 total, exact count)

| Status | Count |
|---|---|
| fixed-awaiting-jake | 93 |
| confirmed | 54 |
| open | 43 |
| closed | 25 |
| deferred | 12 |

## Priority breakdown (exact count)

| Priority | Count |
|---|---|
| high | 93 |
| medium | 84 |
| low | 37 |
| critical | 11 |
| unset | 2 |

**Critical bugs (11) by current status:** 4 fixed-awaiting-jake, 3 confirmed, 3 closed, 1 deferred
(one critical row — the assisted-lift weight-sign-flip bug — closed 2026-09-16 via a genuine
red-before/green-after test; see below). **None are currently `open`.**

## The 1 deferred critical

GDPR consent capture (deferred by Jake, 2026-08-19) — `docs/bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md`.

**Important correction found during the 2026-09-15 Vault migration:** this row's status is
misleading. Per the Vault's `roadmap.md`, 5 of the underlying work's 6 steps shipped 2026-08-25 —
privacy policy, hosting, linking, consent checkbox, and a read-side enforcement gate are all live.
Only verifying `delete_current_user()` exists in the DB remains, and needs Jake directly (can't be
tested without destroying a real account). The row stays `deferred` here because only Jake or a
red→green test may close it per this project's own rule — but "GDPR consent capture is unresolved"
is no longer an accurate reading of this row. Full detail: [roadmap.md](roadmap.md).

## Open-bug themes (43 open, this session's own categorization by filename — interpretive)

Each bug was assigned to a single primary theme; several plausibly span more than one, so treat
these as directional, not precise:

| Theme | Count |
|---|---|
| RLS / ownership / security | 7 |
| UI/UX (incl. 2 feature requests) | 7 |
| Data integrity / orphans / silent failures | 6 |
| Process/meta (ledger hygiene, tooling, agent governance) | 6 |
| Test/CI hygiene | 5 |
| Programs/data-logic bugs | 4 |
| Dead code | 4 |
| Performance | 2 |
| GDPR | 1 |
| Verification/testing task | 1 |

## Requires Validation

- This snapshot is already stale the moment it's read — no regeneration process exists yet. If this
  file matters going forward, building a small script to regenerate it from the ledger is worth
  doing; not built in this pass.
- The theme breakdown above is this session's own read of 43 real filenames, not a verified,
  per-bug review of content — a bug filed under one theme may turn out to be more accurately
  described by another once actually read.
- Whether the 93-item "fixed-awaiting-jake" bucket represents a confirmation-workflow bottleneck or
  normal cadence is not established — it's the largest single bucket, which is worth Jake's own
  attention, but no claim is made here about why. **Partially addressed 2026-09-18:** `os-lint`'s
  new `checkConfirmationQueue` surfaces the oldest 8 of these every session (WARN-level) as a
  starting worklist — it doesn't resolve the bottleneck question, just makes the pile actionable
  instead of an undifferentiated count.
- The 12 deferred bugs beyond the GDPR one are mostly scope/infra decisions (e.g. a Supabase Pro
  upgrade, a runner "Phase 2," a client self-detach workflow gap) rather than live defects, based on
  filenames only — not individually verified here.
