# Decisions archive: 2026-10-05 (the Vault-rooted session, the in-file summary)

Moved VERBATIM out of [decisions.md](../decisions.md) on 2026-10-12 (the docs-budget headroom was gone and a new entry needed room). Nothing below was edited. The longer entry is [decisions-2026-10-05-vault-rooted-session.md](decisions-2026-10-05-vault-rooted-session.md).

---

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse.**
Jake: "we shouldn't be in the vault, that was severed a month ago and everything now lives inside the repo ... ensure this does not reoccur." *What happened:* the
conversation that did the 2026-10-03/04 releases was created on 2026-09-19 in the Vision OS folder (`C:\Users\jaken\Claude`) and ran there through 8 compactions, so the
repo's CLAUDE.md, skills, hooks and auto-memory never loaded (its `/hello-claude` answered "Unknown skill"); only the hard gates (git hooks, `release.mjs`, CI) held.
*Why the severing missed it:* it was verified on FILES, not on where Jake's sessions START (all 22 sessions the app lists started in the Vision OS folder);
`os-lint`'s `no-vault-pointers` matched the data subfolder, not the folder above it; the `cd` guard lived in skills that are not registered in the failing case;
the wrong folder was visible on command one and was written down as a workaround, never escalated; and auto-memory is keyed by launch folder, so a second
51-note memory folder grew unseen. *What changed (each refuses or reports):* a user-level SessionStart hook, `.claude/hooks/session-root-guard.mjs`, tells Jake and the
model to move the session to the repo and logs to `~/.claude/state/session-root-guard.log`; `os-lint` goes RED if its registration is lost or anything new lands in the
now-frozen Vault-keyed memory folder, and WARNs when a recent transcript is still Vault-rooted; memory is merged into ONE folder (the repo-keyed one); CLAUDE.md,
`hello-claude` and `save` now say the ROOT must be the repo (stop, start a NEW session there, never `cd` past it). *A move is only a partial re-root (measured):* hooks and
skills follow at once, CLAUDE.md only at the next post-compaction re-read, the memory path never, and a Terminal tab opened earlier stays in the Vault. *Honest limits:*
the desktop app's default folder for a new session is its own choice, so a session can still START in the Vault (the guard makes that visible, not impossible);
UNVERIFIED that the desktop app shows the guard's `systemMessage` to Jake. The full entry, with every number, timestamp and the review's findings:
[archive/decisions-2026-10-05-vault-rooted-session.md](archive/decisions-2026-10-05-vault-rooted-session.md).
