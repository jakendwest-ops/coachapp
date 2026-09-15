---
id: 2026-07-05-claude-backup-repo-jakendwest-ops-claude-config-gitignore-on
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-05
status_detail: "fixed — awaiting Jake"
---

# claude backup repo (jakendwest-ops/claude-config) .gitignore only allowlists one project's memory dir

**`~/.claude` backup repo (`jakendwest-ops/claude-config`) `.gitignore` only allowlists one project's memory dir** — this project's auto-memory isn't covered, likely true of every other project's. Widen the allowlist, or confirm per-project memory is intentionally out of scope. — ✅ **VERIFIED FIXED 2026-08-09.** `.gitignore` was generalized to a three-step alternating re-include (`!/projects`, `!/projects/*`, `/projects/*/*`, then re-include memory), so ANY current or future project's memory dir is covered automatically. Verified the way the banked lesson demands — with `git check-ignore` on genuinely NEW paths, not `git ls-files` (tracked files stay tracked regardless of gitignore, which is how an earlier 'fix' passed while still broken): a new file under the existing project's memory → tracked; a new file under a hypothetical FUTURE project's memory → tracked; transcripts and settings.local.json → still ignored.
