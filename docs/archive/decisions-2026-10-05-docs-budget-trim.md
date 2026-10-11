# Decisions archive: 2026-10-05 (the docs-budget trim)

Moved VERBATIM out of [decisions.md](../decisions.md) on 2026-10-11 (the docs-budget headroom was about 1.2k and a new entry needed room). Nothing below was edited.

---

**2026-10-05 — The four red `os-lint` checks were cleared by moving detail into `docs/archive/` verbatim, never by raising a ceiling.**
Jake: "fix the red checks". They had been RED at every session start since the Vault-rooted conversation that grew them (it never ran `os-lint`): `docs-budget` 159.6k
against a 79.9k ceiling (`decisions.md` alone 63.8k, from 8k on 2026-09-27), `context-budget` (`current-sprint.md` + `roadmap.md`) 18.2k against 9.3k, `ritual-budget`
(`hello-claude` + `save`) 41.3k against 40.9k, and `doc-obligations` (`critical.md` behind on four security rows). *Done:* every move was asserted lossless before it was
written. The `decisions.md` entries of 2026-09-26..10-04 and the full Vault-root entry, the 2026-09-20/21 security-timeline entries and the 2026-08-12 architecture-debt
summary went to `docs/archive/` byte for byte; `roadmap`, `current-sprint`, `session-context` and `technical-debt` were rewritten shorter, each with a verbatim copy of its old
text in `docs/archive/`; `hello-claude` lost history prose and one paragraph that described the old two-spec push gate (gone since 2026-09-27), kept verbatim in
`docs/archive/hello-claude-trimmed-2026-10-05.md`; `critical.md` got one entry (its only new content was an open row about the escaping checker's blind spot: the
other three flagged rows were already recorded, and the check fired because closing a row rewrites its file). *Not chosen:* raising a ceiling, which the lint forbids and
which is how earlier trims were undone. *Consequence, stated because it is new:* each budget's baseline ratchets down to whatever size it lands at, so headroom is always about
2% (roughly 1.5k for `docs/*.md`): the next long `decisions.md` entry will trip `docs-budget` again unless entries older than the current release cycle are archived as they
age. `/save` is the natural place; this entry does not add that step.
