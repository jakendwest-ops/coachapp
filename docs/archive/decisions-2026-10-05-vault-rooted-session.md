# Decisions archive: 2026-10-05 (the Vault-rooted session)

Moved VERBATIM out of [decisions.md](../decisions.md) on 2026-10-05 (the docs-budget trim); `decisions.md` keeps a summary. Nothing below was edited.

---

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse.**
Jake: "we shouldn't be in the vault, that was severed a month ago and everything now lives inside the repo ... investigate how this has happened even
after you confirmed the vault was severed, and then ensure this does not reoccur." *What happened:* the conversation that did the 2026-10-03/04 releases
was created on 2026-09-19 as "Hello Claude" in `C:\Users\jaken\Claude` (the Vision OS folder) and carried on there through 8 context compactions: 17,892 of
its 18,253 working-folder records before it was moved name the Vault (the other 361: one terminal call that passed the repo as its cwd, and the half hour
after the move was requested). Its first command, `/hello-claude`, answered "Unknown skill"; so did `/save` on 2026-09-28. The repo's CLAUDE.md, skills,
hooks (os-lint at start, guardrails on every tool call, claim-check at stop - all registered at PROJECT level, so they exist only in a repo-rooted session)
and auto-memory never loaded; the Vision OS kernel did. Memory was read from, and written to, a second folder keyed to the Vault (51 notes) while the
repo-keyed folder held 57 others, neither complete. The hard gates (git hooks, `release.mjs`, CI) held, which is why two releases shipped green from a
session with none of the soft ones. *Why the severing did not catch it (each is a hole, not an accident):* (1) it was verified on FILES - docs, hooks,
skills, ledgers - the easy evidence class; nobody checked where Jake's sessions START, and all 22 sessions the app lists (this one included) started in the
Vision OS folder or one of its worktrees (20 still sit there; two were moved to the repo later - a 2026-09-07 session, and this one) (his own opening prompts on 09-17/18
were "please read the repo to get up to date before this session" - the workaround pattern). (2) `os-lint`'s `no-vault-pointers` matched `Claude/Vault`, the
data subfolder, and was BLIND to the folder above it that sessions actually start in. (3) The `cd` guard in `hello-claude`/`save` was circular - it lives in
skills that are not registered in the failing case - and would have masked the problem where it did run, since a shell `cd` loads no CLAUDE.md, hooks or
memory; CLAUDE.md and the memory note both said "not yet verified" with no owner or date, for 17 days. (4) The failure was visible on command one and was
ACCOMMODATED: the 2026-10-04 pre-push-review entry's Process note ends "so it is not registered in a session whose folder is the Vault - follow it by
reading the file", and my own summaries said "harness cwd is the Vault; real work uses absolute paths" - a fault written down as a workaround, never
escalated. (5) Auto-memory is keyed by launch folder and lives outside the repo, so a mis-rooted session silently gets different memory and no check
compared the two. (6) The Vault still carried a welcome mat: its kernel and `/vault-save` called CoachApp's `/save` "legitimate and current" and gave CoachApp
a branch in the Vault ritual; its local `launch.json` held a CoachApp preview server; and the USER-level `~/.claude/settings.json` held two live Vault
entries no check scans - a permission to append to `Vault/ledgers/log.md` and `Vault/ledgers` as an extra directory for EVERY session. (7) On 2026-10-04 I
confirmed "severed" again, from inside the Vault session, with "Shell cwd was reset to C:\Users\jaken\Claude" on screen after every command.
*What changed (each one refuses or reports, none is only a sentence):* a user-level SessionStart hook, `.claude/hooks/session-root-guard.mjs` (code in this
repo, registered in `~/.claude/settings.json` so it fires in the Vault; its self-test, mutation-checked against 13 mutations, proves it fires on the Vault, a
Vault worktree, the Git-Bash spelling, a lower-case drive and a compaction, and stays silent in the repo, a prefix lookalike, `~/.claude` and on empty, garbage
or JSON `null` input) tells Jake (`systemMessage`) and the model (`additionalContext`) on every start, resume and compaction to move the session to the repo
with `mcp__ccd_directory__change_directory` instead of working around it - and what a move does not carry (below) - and logs each run to
`~/.claude/state/session-root-guard.log`. `os-lint` goes RED through its `hooks` check if that registration is lost; RED through the new `memory-split` check if
anything new lands in the Vault-keyed memory folder (now a frozen stub; it keys on the folder, not on the word "CoachApp", because 24 of the 51 notes a
Vault-rooted session really wrote never contain it); WARNs through `vault-rooted-session` when a recent transcript's last working folder is still the Vault and it
has made 3 or more tool calls on the repo's files (calibrated on this conversation: 9 of its 10 windows had 7-21 such calls, and on a real slice from just before
the move it reads 18); and `no-vault-pointers` now also matches the launch root. Memory was merged into ONE folder (the repo-keyed one: 109 notes, index and Rule 0
green; the seven notes that still told a session to use the Vault were corrected, and the originals of the Vault-keyed folder archived untouched beside a stub
index that tells a Vault-rooted session to stop). Removed: the Vault's CoachApp preview server and a stale rule from its local config, the two live Vault entries
in `~/.claude/settings.json`, and the CoachApp references in the Vault's own kernel and `/vault-save` (committed in the Vault repo, not pushed). `CLAUDE.md`,
`hello-claude` and `save` now say the session's ROOT must be the repo: stop, start a NEW session there (or move, then read what a move does not carry), never `cd`
past it. *What a move carries (measured in this conversation's own transcript, 2026-10-05):* it was moved with `change_directory` (requested 03:43Z; the
transcript's working folder is the repo from 04:14Z). Hooks followed - os-lint ran at the next compaction, and the guard logged `cwd` = the repo with the same
session id, the first real hook input seen - and so did the skill listing (`hello-claude` and the other repo skills appear at 04:37Z). CLAUDE.md and the
auto-memory path did NOT follow at once: at the 04:40Z compaction the harness re-attached the Vault's CLAUDE.md and the Vault-keyed `MEMORY.md`; at 05:25Z, the first turn after that compaction, it re-read its instruction files (`reason: compaction`) and swapped in the repo's CLAUDE.md, while the memory index stayed the Vault-keyed one (re-read from disk: the stub). A Terminal-panel tab Jake had opened earlier stayed at `PS C:\Users\jaken\Claude>` until he pointed at it ("This terminal should be in the repo always"); a tab opened after the move started in the repo, and an assistant cannot close a tab the user opened. A moved session is therefore only
partly re-rooted, which the guard, CLAUDE.md and `hello-claude` now say (read the repo's CLAUDE.md and memory index yourself; write memory only into the repo-keyed
folder); a NEW session on the repo is the clean fix. *Superseded:* the "follow it by reading the file" accommodation in the 2026-10-04 pre-push-review entry - a
wrong-folder session is stopped, not worked around. *Honest limits:* the desktop app's default folder for a new session is the app's, not ours (its settings tool
exposes none), so a session can still START in the Vault - the guard makes that visible rather than impossible. VERIFIED the same day for a real Vault-rooted start: a headless CLI session started in the Vault folder fired the guard and the model quoted its notice back (log line `source: startup`, `fired: true`). UNVERIFIED: that the desktop app shows the guard's
`systemMessage` to Jake (the `additionalContext` route is proven: the model quoted it), and what a Vault-rooted START looks like in the desktop app - the next
new session in the Vault folder will show it (the log gains a `fired: true` line). The long transcript now sits in the repo-keyed project folder; about a dozen stale
July worktrees under the Vault still hold copies of the old CoachApp launch config (inert). *Review and calibration:* a fresh-context review of this change found
nothing blocking; it and the calibration it prompted turned up these faults, fixed before commit: the guard crashed on a JSON `null` input; the first
`memory-split` keyed on the word "CoachApp" and would have missed 24 of the 51 notes a Vault-rooted session wrote; the first `vault-rooted-session` counted mentions
(the guard's own text inflates them) and trusted a file's mtime (a 09-18 session read as live on 10-03); the first measurement of what a move carries stopped at the 04:40Z compaction and read CLAUDE.md as never following, which the 05:25Z re-read overturned (above); and this
entry's counts were off.
