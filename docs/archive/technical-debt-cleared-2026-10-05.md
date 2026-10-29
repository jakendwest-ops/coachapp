# Moved verbatim from docs/technical-debt.md on 2026-10-29 (resolved; history only)

**Cleared 2026-10-05:** `os-lint` had been RED at every session start on four checks (`context-budget`, `ritual-budget`, `docs-budget`,
`doc-obligations`) that predated the Vault-root work: `docs/*.md` had grown from 79.5k (2026-09-27) to 159.6k, 63.8k of it `decisions.md`, because the
conversation that grew it was rooted in the Vault and never ran `os-lint`. Fixed by moving detail VERBATIM into `docs/archive/`, not by raising a ceiling
(see [decisions.md](decisions.md), 2026-10-05).
