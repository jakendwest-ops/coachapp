# Decisions archive: 2026-10-11 (Node 24, the live check, row-checked writes)

Moved VERBATIM out of [decisions.md](../decisions.md) on 2026-10-17 (`os-lint`'s `docs-budget` and `context-budget` were over their ceilings after the Workouts-page entry; the oldest entry goes, never a ceiling).
Nothing below was edited. Relative links inside it point at `docs/` and need `../` from here.

---

**2026-10-11 — CI runs Node 24 like the dev machine, a release is checked live by script, and a database write that can be refused silently is row-checked.**
Jake approved three tooling fixes from his board ("approved"). *Node:* `deploy.yml` pinned 22 while this machine runs 24, which cost `v2026.09.12` its deploy; it now pins 24
(not chosen: pinning the machine down to 22, since everything is verified on 24; no `.nvmrc` or `engines` added, and `checks.sh` still prints a `[note]` if the two ever differ).
*Live check:* `node scripts/verify-live.mjs <tag>` compares every file the app loads with the tag, byte for byte, retrying while Pages catches up (exit 0 identical, 1 differs,
2 could not check); its self-test runs on every push (`checks.sh` 9t) and eight deliberate breakages each turn it red. *Silent refusals:* `savePeriodizationConfig` now row-checks each
tier write and the phase write (row-level security answers a refused UPDATE with 200 and no rows) and anchors the tier write on the verified phase, which closes the 2026-09-06 row.
*Found by the pre-push review:* a self-test that runs git in a temp folder inherits `GIT_DIR` from a pre-push hook run in a LINKED worktree and then commits to the real repo (reproduced);
the `verify-live` and `bump-versions` self-tests now strip `GIT_*`, and three release-only ones are named in `technical-debt.md`. The reviewers saw the version before the last fixes (the
anchor, the phase-row check, the self-test hardening): those are covered by tests and by deliberate breakage, not by a second review.
