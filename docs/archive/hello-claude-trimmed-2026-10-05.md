# hello-claude: text trimmed on 2026-10-05

Removed VERBATIM from `.claude/skills/hello-claude/SKILL.md` because `os-lint`'s `ritual-budget` check was red (41,348 bytes for hello-claude + save
against a ceiling of 40,915). All of it is history or justification, except the "gate is NOT the suite" paragraph, which described a two-spec push gate
that stopped existing on 2026-09-27; a two-sentence replacement stays in the skill. Blocks appear in file order.

---

<!-- was lines 13-21 of hello-claude/SKILL.md -->
**Step 0b — write the checklist to
`~/.claude/state/ritual-hello-claude.md`, one `- [ ]` line per step below.** Tick each one off in the
file as you complete it. An interrupted ritual must be *visibly* unfinished. On 2026-07-13 Jake typed
`/brainstorming` at Step 6; the steps after it silently never ran, and nothing anywhere noticed.
A checklist nobody can see is not a checklist.

> This mandated `TodoWrite` until 2026-08-20 — a tool that doesn't exist in this harness, so this  <!-- LINT-OK: naming the dead tool is the POINT of this note, not a call -->
> ritual's own anti-drop safeguard silently never ran from the day it was written. `os-lint`'s
> `mandated-dead-tools` check now catches this class.

---

<!-- was lines 111-112 of hello-claude/SKILL.md -->
(A self-assessed "first session of the week" version of this never once fired in 10 days — the
marker replaced it after 5 unscoped `app-clients.js` queries survived ~12 diff-only reviews.)

---

<!-- was lines 143-146 of hello-claude/SKILL.md -->
> This step used to say *"never carry forward a to-do that current evidence resolves"* — the one absolute
> in the old logic forbade retention, licensing exactly "a robot looked instead of Jake." That closed the
> slow-Workouts-page report on a guess (2026-07-06); Jake re-reported it, still broken, seven days later.
>

---

<!-- was lines 228-248 of hello-claude/SKILL.md -->
**The gate is NOT the suite.** It runs `runner.spec.js` + `solo-account.spec.js` only — two spec files, a small
fraction of the suite (no count written here: hard-coded counts drift; `ls tests/*.spec.js`). This skill claimed "the Playwright suite" until 2026-08-20; the vast
majority of the suite has never blocked a push, and `ledger-fixes-2026-08-02.spec.js` sat RED for 3
days across ~4 deploys because it was outside the gate. **Run `npm test` before any push touching a
module you did not hand-test** — the gate will not do it for you.

**Widening it is harder than it looks — attempted and reverted 2026-08-20.** Three traps, all found by
`multi-agent-review` on the attempt itself:
1. **A glob in playwright's positional args silently no-ops** (OR-ed filters, not required paths — a
   typo'd/renamed pattern just runs fewer files at exit 0). Verify with `--list`, check the file
   COUNT, never the exit code.
2. **Filename-prefix selection picks an era, not a category** — `ledger-fixes-*` matched 5 old files
   and excluded the newer spec that motivated the widening.
3. **The cross-tenant probes aren't cleanup-safe at push frequency** — several derive their cleanup id
   from the very INSERT being tested, so a permissive-INSERT regression skips its own cleanup and
   strands a junk row on a real client. Harden those (`ledger-fixes-2026-08-01.spec.js` shows the fix)
   before ever putting them in the gate.

**Known blind spot, unfixed:** 16 solo tests are `test.skip`-gated on `soloAvailable`. If
`window._soloClientId` ever fails to populate — the exact bug class that has shipped four times here —
all 16 skip and the push passes green. The gate is blind to the one failure that would disable it.
