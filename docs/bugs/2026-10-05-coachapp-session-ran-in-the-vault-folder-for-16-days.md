---
id: 2026-10-05-coachapp-session-ran-in-the-vault-folder-for-16-days
status: fixed-awaiting-jake
priority: high
reported: 2026-10-05
status_detail: "REPORTED BY JAKE 2026-10-05: 'we shouldn't be in the vault, that was severed a month ago and everything now lives inside the repo' - the conversation that did the 2026-10-03/04 releases was created 2026-09-19 as 'Hello Claude' in the Vision OS folder (C:\Users\jaken\Claude) and ran there for 16 days and 8 compactions with none of the repo's CLAUDE.md, skills, hooks or memory ('Unknown skill: hello-claude' on its first command). Root causes, the controls added and the honest limits are in docs/decisions.md, 2026-10-05. FIXED 2026-10-05 and verified by their own self-tests (mutation-checked) and by this conversation's own transcript, not by a fresh session in either folder: the user-level SessionStart hook session-root-guard.mjs (fires in the Vault, a Vault worktree, the Git-Bash spelling and a compaction; silent in the repo, a prefix lookalike, ~/.claude and on empty, garbage or null input; its log shows the app really ran it at a compaction, with cwd = the repo); os-lint memory-split (RED, structural: the Vault-keyed memory folder is frozen), vault-rooted-session (WARN, calibrated on the real conversation: it fires on a slice from just before the move), no-vault-pointers widened to the launch folder (all three bite in os-lint --self-test); CoachApp memory merged into ONE folder (109 notes, Rule 0 green) with the Vault-keyed folder frozen as a stub; the Vault's CoachApp launch config, stale rule, kernel/vault-save references and two live Vault entries in ~/.claude/settings.json removed; CLAUDE.md, hello-claude and save now require a repo-rooted session. MEASURED about a move: change_directory carries the shell, hooks and skills at once, CLAUDE.md only at a later post-compaction re-read (about 45 minutes on) and never the memory path, so a NEW session on the repo is the clean fix (the guard says so). VERIFIED in a real Vault-rooted headless session: the guard fired and the model quoted its notice back (log: source startup, fired true). UNVERIFIED: that the desktop app shows the guard's systemMessage to Jake."
closing_conditions: "Jake starts a NEW desktop session in the Vault folder and the guard's message appears (and ~/.claude/state/session-root-guard.log gains a fired:true line), then starts one on the repo folder and sees /hello-claude register, the repo's CLAUDE.md load and memory come from c--Users-jaken-OneDrive-coachapp; or says it is closed."
---

# A desktop session rooted in the Vault ran CoachApp for 16 days

**Closes when:** see `closing_conditions`.

The Vault severing (2026-09-15..18) was verified on files, never on the folder sessions start in; see [decisions.md](../decisions.md), 2026-10-05, for the
seven reasons it went unseen and everything that now refuses or reports instead of relying on a sentence.
