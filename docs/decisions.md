# Decisions

A flat, append-only, reverse-chronological log of significant, hard-to-reverse choices and why they
were made. New entries go at the top. No numbering, no per-decision files — see
[architecture.md](architecture.md) for the resulting shape, not the reasoning.

**Migrated 2026-09-15** from the Vault's `STATUS.md` "Continuity block" — ~40 dated, code-specific
engineering lessons. Most are too granular/line-specific to be "decisions" in this file's sense and
would go stale as the code changes; they're preserved in full, unedited, at
[archive/status-continuity-2026-09-08.md](archive/status-continuity-2026-09-08.md). The 5 genuinely
process-level entries below were pulled out and belong here.

---

**2026-09-27 — A push runs static checks only; the browser and the mutation self-test are the release's job.**
Jake: "make the commit and push cycle easy again". Pushing master stopped deploying on 2026-09-05, and
`release.mjs` runs the full suite plus `checks.sh` before every tag, so the push gate was checking the same
things twice.

Measured the same day:
- a push cost ~7 min: `checks.sh`'s static part 123 s, plus the 2-spec browser smoke run 5.0 min;
- the SQL mutation self-test alone was 45 s of the static part.

What changed:
- `checks.sh` now has two modes:
  - **FAST**, the local pre-push default: measured **51 s**. It skips the smoke run and the mutation self-test.
  - **FULL** (`CI=true`, i.e. GitHub Actions and `release.mjs`, or `CHECKS_FULL=1`): measured 96 s. It runs everything
    it ran before, minus the browser, which `release.mjs` covers with the full suite.
- `CHECKS_SMOKE=1` brings the smoke run back for one push.

**Accepted cost:** master can now carry a browser regression until the next release, where before the 2 smoke specs
would have caught some of them at push. Nothing reaches the live site without the full suite.

**Rejected:** a warn-only push that never blocks. Jake chose to keep the static checks blocking.

**Same day, the release became one command.** `release.mjs vX --push` now fills the notes' `{{AUTO:VERIFICATION}}`
line from its own suite run, commits the notes, tags and pushes. The old four steps were: `--record`, paste the
numbers by hand, commit, run again.
- The review found one blocking gap, fixed before commit: the notes commit and the tag were not pinned to the verified
  code.
- The script now refuses unless:
  - HEAD and the code fingerprint are unchanged since the suite ran;
  - the notes commit contains only the notes file (`--only`);
  - that commit sits directly on the verified commit.
- It then tags that exact commit.

**The suite's duration was investigated, not fixed.** The last run took 41.5 min against a "usual 14.0 min". A
same-day A/B refuted the guess that video recording and test output inside OneDrive cause it: the same 59 tests took
5.0 min as-is and 5.8 min with video off and output outside OneDrive. The likelier cause, unverified, is that the
14-minute baseline predates the suite's growth to 125 spec files.

**2026-09-27 — A write that spans tables goes through one transactional database function, not a browser chain.**
The app-code audit (`archive/app-code-audit-2026-09-27.md`, R1) found the programme lifecycle written as chains of separate
browser→API writes. Careful code could detect partial state, but it could not prevent it, and a restart could delete a
client's plan and then fail to insert the new one.
- **First instance:** `assign_program()` (`scripts/add-assign-program-rpc-2026-09-27.sql`), used by both assign buttons.
- **The shape, for the next ones (`deleteProgram`, `deletePhaseWeek`):**
  - `security invoker`, so row-level security stays the boundary and the function only adds checks;
  - a pinned `search_path`;
  - execute granted to `authenticated` only;
  - errors raised with codes the JS maps to plain messages;
  - verified on PGlite with the live policies and a mutation suite before Jake runs it.
- **Rejected: `security definer`.** It would have made the function the security boundary and bypassed every policy.
- **Rejected: keeping the browser chain with more guards.** Each guard adds a round-trip and one more place to forget, and
  no guard makes a sequence of writes atomic.
- **Cost:** the logic now lives in SQL as well as JS. The restart archive and sweep exist in both (`_archiveAssignmentBlock`
  / `_removeAssignmentAndClones` still serve unassign and delete), and each copy's comment names the other.

**2026-09-27 — The operating system was cut back to what refuses, what is broken, and what Jake can answer.** An audit
the same day found the OS disrupting its operator and its alarms meaning nothing. Changes:

- **The per-message hook is retired.** On this Windows machine every hook invocation opens a visible console window —
  a known Claude Code bug with no setting to suppress it (per a `claude-code-guide` research pass; the cited GitHub
  issues were not opened by hand). `standing-behaviours.mjs` fired on every message, so its static text moved into
  `CLAUDE.md` ("Standing behaviours"), which costs no process. Its unfinished-ritual check moved into `os-lint`
  (once per session). The remaining hooks (SessionStart, the Bash pre/post guard, Stop) still open a window each.
- **`os-lint` has three severities.** RED means the machinery is broken or a rule was just broken; WARN is worth
  knowing; DIGEST — stale bugs, ungraded predictions, the review and self-test cadence, the confirmation queue,
  and the new retirement list — prints once a week (`--report` any time). Before this, several items were RED at
  nearly every session start, which is the alarm fatigue the file names as its own worst failure mode.
- **Bug statuses are defined** (the `confirmed` status had no written meaning; 54 rows used it), and a new
  terminal status `unverified-accepted` exists for fixes Jake agrees, in a batch, to stop tracking. **Only Jake
  sets it, per batch** — never applied by age, which would break the closure rule. `scripts/ledger-batch.mjs`
  prints the oldest waiting rows as a numbered yes / no / accept list.
- **The release review gate checks WHAT was reviewed, not WHEN.** The review records a fingerprint of the code it
  saw (`scripts/lib/review-fingerprint.mjs`); `release.mjs` passes when HEAD is exactly that code. The old
  timestamp rule failed every correctly-reviewed ownership release (review before commit ⇒ marker older than the
  commit) and could only be passed by re-stamping the marker by hand. `release.mjs` also now waits out an
  in-progress CI run instead of failing with "0 tests ran".
- **Open security write-ups are embargoed** (`checks.sh` rule 9o): a bug row marked `security: true` and `open`
  refuses the push; keep it in `docs/bugs/embargo/` (git-ignored) until the fix is live. *Not chosen:* making the
  repo private — GitHub Pages on a free plan serves public repos only, so the live site would go down.
- **Hard-coded counts removed** from `CLAUDE.md`, `hello-claude`, `architecture.md`, `handover.md` and
  `technical-debt.md` ("~59 of ~757 tests", "2 of 105 spec files" — both stale).

*Not done, needs Jake:* applying any `unverified-accepted` batch; deciding whether the remaining Stop / Bash hooks
are worth a window each.

**Same day, Jake's call — CI no longer runs browser tests.** The `e2e` job in `deploy.yml` ran the same two spec files
the local pre-push hook already runs, against the one shared test account, so every push started a run that collided
with local suite runs (the CI-overlap guard in `tests/global-setup.js` then refused the local run — twice during the
v2026.09.8 release). A separate CI test account was the first idea and was rejected again for the reason recorded on
2026-09-04: a fresh account has no master/solo setup, so `solo-account.spec.js` would skip itself and CI would go
green having tested less. So the job was removed, and with it the CI-overlap guard and the release script's CI wait.
Browser coverage (superseded the same day — a push now runs no browser tests, see the entry above): the pre-push smoke gate (local, every push) and the full suite in `scripts/release.mjs` (every
release). *Lost:* a clean-Linux-machine run of those two files. The six test-login GitHub secrets are no longer read.

---

**2026-09-26 — A client may detach themselves from their coach, but may no longer point their own `clients` row at ANOTHER
coach; the rule lives in a trigger keyed on `current_user`.** Jake's read-only query of the live `clients` policies confirmed that
`clients_update_own_row` pins only `user_id`, so a client could rewrite their own `coach_id` to anyone's id and appear in a
stranger's roster (ledger `2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row`). Self-detach (setting it to
NULL) was already accepted when weight goals shipped and stays; Jake chose to close ONLY the attach half. Done as a
`BEFORE UPDATE OF coach_id` trigger, not a policy change: the policies OR together, so tightening one leaves the others open
(the coach policies and the invite-claim policy both write this column), whereas a trigger gives one rule for every path. It
refuses when `current_user` is `authenticated` or `anon` (the role PostgREST switches to), so the SQL editor, the service role
and admin-owned functions are untouched. *Not chosen:* `auth.role()` (reads a request claim rather than the role actually in
force); a column-level `REVOKE UPDATE (coach_id)` (would also stop coaches and the invite path, and would not distinguish
self-detach); blocking self-detach too (needs the cancellation workflow designed — banked). *Consequence, stated because it is
new:* self-detach is now ONE-WAY from the API (before the guard a client could set it back); undoing one is a line in the SQL
editor, and any future "resume coaching" flow needs the service role or an admin-owned function. *Limits:* a `SECURITY DEFINER`
function that changes `coach_id` is not caught (none is known, but the live database's functions are not all in the repo —
unverified); INSERT is covered by the existing policy pinning `coach_id`; the source of the `invite-client` Edge Function is not in
the repo, so it is unverified that it never changes `coach_id` under a caller's JWT (send one invite after applying). A
three-angle review found no blocking flaw in the SQL and one in its proof (the mutation for the admin exemption switched the
whole guard off instead, so nothing tested the exemption) — fixed before the commit.
The first verifier draft assumed an invitee's `UPDATE … WHERE id = … RETURNING` reaches the trigger; it does not — measured
2026-09-26 on the local copy of the live policies: a claim with `WHERE id` (with or without `RETURNING`) or `WHERE email … AND
user_id IS NULL` matches no row (the unclaimed row passes no SELECT policy, and any WHERE needs SELECT rights); only a
filter-free statement claims it. So through the app's normal filtered updates the "Client stamps own user_id" policy can never
fire — live invite acceptance must go through `handle_new_user` or an Edge Function (not in this repo; unverified). The verifier
therefore uses filter-free statements for the invitee cases and reproduces the hole BEFORE the script, which is what makes a
green result mean something. Applied only when Jake runs the script.

---

**2026-09-19 to 2026-09-21** — the unbounded-reads ratchet, local SQL execution (PGlite), paged reads of growing tables,
automatic error capture and the feedback link, deleting the Benchmarks tab — archived verbatim in
[archive/decisions-2026-09-19-to-2026-09-21.md](archive/decisions-2026-09-19-to-2026-09-21.md).

**Older entries (2026-09-15 to 2026-09-18)** — the repo becoming the system of record, the full Vault severing,
predictions moving into the repo, ritual markers, and the OS retrospective — are archived verbatim in
[archive/decisions-2026-09-15-to-2026-09-18.md](archive/decisions-2026-09-15-to-2026-09-18.md).
