---
id: 2026-08-22-os-lint-self-test-is-decorative-at-the-sub-branch-level
status: confirmed
priority: high
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22. Every spec now carries a required 'expect' substring asserted against the check's WHOLE RED message (continuation lines included), and multi-detector checks are split one spec per detector: 19 checks -> 31 detectors. A spec with no expect is reported DECORATIVE by design. Fixtures rebuilt to plant ONE defect each - the old memory fixture tripped two detectors at once, which is what hid the dead one. RED-BEFORE: re-ran the exact neuter that fooled the old version (checkMemory name-vs-filename branch) and it now reports 'DECORATIVE memory/name-mismatch - check did not fire at all' while the other five memory detectors stay BITES. Two specs reported DECORATIVE on first run from my own wrong expect strings (case mismatch, and 'no YAML frontmatter' vs 'no frontmatter') - fail-closed, corrected, 31/31."
status_detail: "Self-found 2026-08-22 when Jake asked what else I had 'verified' that could be broken. PROVEN: neutering one detector inside checkMemory still reports BITES memory and 19/19. The self-test built yesterday to end decorative checks is itself decorative one level down."
---

# `os-lint --self-test` proves a check produced *a* RED, not that the detector under test works

Built 2026-08-21 specifically to answer "does this alarm still have batteries?", after `gates-fired`
sat GREEN for weeks while structurally incapable of failing. It has the same defect one level down.

## Proven, not reasoned

`checkMemory` contains several independent detectors: frontmatter validity, name-vs-filename drift,
near-miss wikilinks, index consistency both ways, JSONL parseability. Its fixture (`memDir()`) trips
**two** of them at once — a name/filename mismatch *and* an index entry pointing at a missing file.

Neutering **only** the name-mismatch branch:

```
BITES       memory
19/19 checks proven to fire on a corpus that should trip them.
```

The detector is dead, and the self-test says the check bites — because the ghost-index detector still
fires and the assertion only greps for `RED memory`.

## The shape

This is precisely the defect found in the app the same day
(`2026-08-22-guard-verifies-one-id-while-the-write-keys-on-another`): **verifying one fact while the
thing that matters is another.** The self-test verifies "this check emitted RED". What matters is
"the specific detector I aimed at emitted RED".

Every multi-detector check is affected. `checkMemory` (5 detectors), `checkHooks` (3: missing script,
unregistered script, invalid JSON), `checkBugFrontmatter` (3: status, priority, reported),
`checkLiveDocs` (2: retired terms, dead paths), `checkDeadTools` (2: preview_* regex, allowlist).
**Roughly half the suite's detectors are unproven.** A single-detector check like `checkCorpora` is
genuinely covered; the rest are covered only in aggregate.

## Fix direction

Assert on the RED **message**, not just the check name. Each spec gains an expected substring — the
memory name-mismatch fixture asserts `does not match its filename`, the ghost-index fixture asserts
`points at`, and so on — which forces one fixture per detector rather than one per check. That turns
`19/19 checks` into something like `19 checks / ~35 detectors`, and the count becoming honest is the
point.

**Closes when:** neutering any single detector turns its own spec DECORATIVE, proven for at least the
five multi-detector checks named above.
