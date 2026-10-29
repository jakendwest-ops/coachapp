# Type-check the classic scripts, then decide on ES modules: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get compile-time checking (wrong column names, wrong argument counts, typo'd globals, duplicate functions) over all nine `js/` files without changing a byte the browser runs, then make the ES-modules decision on measured numbers.

**Architecture:** TypeScript's checker runs over the nine files *as classic scripts*, in `index.html` order, sharing one global scope, which is the same shape the browser and `tests-node/load-app.mjs` give them. Nothing is compiled or emitted. Types come from JSDoc comments plus generated Supabase table types. A per-file error-count ratchet (same semantics as `check-count-ratchet.mjs`: rising fails, falling asks to lower) makes it a gate from day one without needing zero errors first.

**Tech Stack:** `typescript` (devDependency, exact pin, `tsc --noEmit` only), `@supabase/supabase-js@2.117.2` as a types-only devDependency (same version the CDN tag loads), `node:test`, existing `scripts/checks.sh`.

**Spec:** none written. The source is the 2026-10-29 conversation ("ES modules first, then `@ts-check`"), revised by the measurements below.

## Why the order flipped (measured 2026-10-29)

The original suggestion was ES modules first. Measuring what depends on the shared global scope reversed it:

| What depends on globals | Count |
|---|---|
| Inline `on*="fn()"` handlers in JS template strings | 496 (+6 in `index.html`) |
| Specs calling app functions or reading `window._x` state via `page.evaluate` | 173 of 179 |
| Specs that read JS source text (`fetch('/js/…')` or `.toString()`) | 36 (107 mention a `js/app-*.js` path at all) |
| Top-level functions used outside their own file (name-match estimate) | 190 of 703 |
| `window.X =` assignments in `js/` | 77 |
| Top-level `let`/`var`/`const` | 160 |
| Scripts parsing `<script src>` / `?v=` | ~15 (`bump-versions`, `check-count-ratchet`, `check-references`, `load-app.mjs`, ...) |

Every inline handler needs its function on `window`, so a module migration would have to re-export roughly 500 names to `window`, and the global surface would barely shrink. Module scripts are also deferred and run in strict mode, which changes the load order that `load-app.mjs` calls load-bearing (`_runner` from `app-workouts` is used 259× in `app-runner`). The type checker gives most of the benefit (seeing cross-file references, catching typos and collisions) at no runtime risk. It also gives an exact cross-file reference count, which is the number Phase 2 needs.

## Global Constraints

- No build step. No emitted JS. `index.html` keeps loading `js/*.js` as classic `<script>` tags.
- Runtime behaviour unchanged by Phase 1: JSDoc comments, `.d.ts` files and tooling only. A real bug the checker finds becomes a file in `docs/bugs/` (intake rule) and is fixed in its own commit, never inside a typing commit.
- Any edited `js/` file gets its `?v=N` bumped in the same commit (comments change the bytes too).
- Pin exact versions (`"typescript": "5.x.y"`, not `^`). The supabase-js types package must equal the CDN version, `2.117.2`.
- `checks.sh` FAST mode must stay around 2 minutes. Measure `tsc` wall time and record it in the commit message.
- Every new check ships with a `.selftest.mjs`, the repo convention. Mutation-check it: break the code and watch it go red, with the clean run passing first.
- Not ownership/RLS work, so `multi-agent-review` runs before the push, not before each commit.

## Review Focus

1. **A wrong JSDoc type is a lie that passes.** Annotating a param as `string` when solo passes `null` (`coach_id = NULL`) teaches the checker the bug. Task 4 requires nullable unions (`string|null`) for every `coach_id`/`client_id`/`user_id`, and a test pins it.
2. **Types-package drift from the CDN.** If the `@supabase/supabase-js` devDependency diverges from the `<script>` version, column checks describe a different client. Task 3 adds a check that the two versions are equal.
3. **Generated DB types going stale after a schema change.** A new column (memory: embed selects are allowlists) would show as an error, which is safe, but a dropped column would still type-check. Task 3 records the regeneration command in `docs/schema.md` and adds the types file to the schema-change checklist.
4. **Baseline written above the real count** (a permit, not a ratchet). Task 2's `--write` may only lower, and its selftest pins that.
5. **`checks.sh` time creep.** Measured in Task 2. If `tsc` takes over 30 s, use `incremental: true` with the `.tsbuildinfo` git-ignored.

---

### Task 1: Checker runs over the nine files, baseline measured

**Files:**
- Create: `jsconfig.json`, `types/globals.d.ts`
- Modify: `package.json` (devDependency `typescript`, script `"typecheck": "tsc -p jsconfig.json"`), `.gitignore` (`*.tsbuildinfo`)

**Interfaces:**
- Produces: `npm run typecheck` exits non-zero with errors in `file(line,col): error TSnnnn` format, which Task 2 parses.

- [ ] **Step 1:** `jsconfig.json`: `compilerOptions` = `{ allowJs: true, checkJs: true, noEmit: true, target: "ES2022", lib: ["ES2022","DOM","DOM.Iterable"], strict: false, noImplicitAny: false, skipLibCheck: true }`, `files` = the nine `js/*.js` in `index.html` order plus `types/*.d.ts`. No `"module"` setting: files without `import`/`export` are global scripts to tsc, which is what we want.
- [ ] **Step 2:** `types/globals.d.ts` declares the two CDN globals: `declare const supabase: typeof import('@supabase/supabase-js')` and `declare const Chart: any` (Chart typing is out of scope).
- [ ] **Step 3:** Run `npm run typecheck`. Expected: it completes (errors are fine). Record total errors, errors per file, the top 10 error codes, and wall time.
- [ ] **Step 4:** Count TS2393/TS2451 (duplicate declarations) and compare with what `checks.sh`'s duplicate-function check reports. Expected: tsc finds at least the same set. Note any difference in the commit message. Don't remove the old check.
- [ ] **Step 5:** Commit: `chore: type-check js/ as classic scripts (no emit, no runtime change)`, with the measured numbers in the body.

### Task 2: Error-count ratchet as a FAST gate

**Files:**
- Create: `scripts/check-types.mjs`, `scripts/check-types.selftest.mjs`, `scripts/type-baseline.json`
- Modify: `scripts/checks.sh` (new block after `check-count-ratchet`, same `selftest || fail; check || fail` shape as lines 526-530)

**Interfaces:**
- Consumes: Task 1's `tsc -p jsconfig.json` output.
- Produces: `node scripts/check-types.mjs [--write]`. Exit 0 when every file's error count ≤ baseline, exit 1 naming each file that rose. `--write` lowers counts and never raises them.

- [ ] **Step 1: Selftests first** (`check-types.selftest.mjs`, fixture output passed via `TYPES_TSC_OUTPUT` and `TYPES_BASELINE` env vars):
  - `rising count fails`: baseline `{"js/a.js":2}`, output with 3 errors in `js/a.js` → exit 1, stdout contains `js/a.js 2 -> 3`
  - `equal passes`: 2 vs 2 → exit 0
  - `falling passes and asks to lower`: 1 vs 2 → exit 0, stdout contains `lower the baseline`
  - `--write never raises`: 3 vs 2 with `--write` → baseline file still says 2, exit 1
  - `new file not in baseline with errors fails`: → exit 1
- [ ] **Step 2:** Run the selftest. Expected: FAIL (script missing).
- [ ] **Step 3:** Implement `check-types.mjs`: run tsc (or read the env fixture), parse `^(js/[^()]+)\(\d+,\d+\): error TS\d+`, count per file, compare.
- [ ] **Step 4:** Selftest passes. Run `node scripts/check-types.mjs --write` once to set the baseline AT the Task 1 measurement.
- [ ] **Step 5: Mutation check.** Run clean first (expect exit 0). Then in a scratch copy, misspell one call (`escapeHtml` → `escapeHtlm`) in `js/app-core.js` and run against the copy. Expected: exit 1, and the error names `escapeHtlm`. Revert.
- [ ] **Step 6:** Time `bash scripts/checks.sh` FAST before and after. Commit: `ci: type-error ratchet in checks.sh (rising fails)`, with both timings.

### Task 3: Supabase table types, so a wrong column name is an error

**Files:**
- Create: `types/database.d.ts` (generated), `scripts/check-types-version.mjs` + selftest
- Modify: `package.json` (devDependency `@supabase/supabase-js: "2.117.2"`), `js/app-core.js` (JSDoc on the `db` declaration only, `?v=` bump), `docs/schema.md` (regeneration command + "after any schema change" line)

**Interfaces:**
- Produces: `db` typed as `import('@supabase/supabase-js').SupabaseClient<import('../types/database').Database>`, so `db.from('<table>').select('<cols>')` / `.eq('<col>', …)` are checked against real columns.

- [ ] **Step 1 (Jake, manual):** generate the types. This needs his Supabase login, so Claude never handles the token. Numbered steps go in the PR description: `npx supabase login`, then `npx supabase gen types typescript --project-id avilxuiacmtgeoxxhfhc > types/database.d.ts`.
- [ ] **Step 2:** `check-types-version.mjs` selftest: `index.html` CDN `supabase-js@2.117.2` with package.json `2.117.2` → exit 0, and `2.117.3` → exit 1 naming both versions. Implement it and wire it into `checks.sh`.
- [ ] **Step 3:** Annotate `db` in `app-core.js`. Run `npm run typecheck`. Expected: new errors appear for any real column mismatch. Triage each one: a real bug becomes a `docs/bugs/` file, and a type gap (an untyped RPC or a `select('*')` embed) gets a narrow `// @ts-expect-error <reason>`.
- [ ] **Step 4: Mutation check.** Change one `.eq('coach_id', …)` to `.eq('coach_idd', …)` in a scratch copy. Expected: a TS error naming `coach_idd`. Revert.
- [ ] **Step 5:** `node scripts/check-types.mjs --write` (lowers or holds; if a count rose because of genuinely new findings, the baseline is raised in THIS commit only, with each new error listed in the message). Commit.

### Task 4: Annotate app-core's shared helpers (the ones every module calls)

**Files:**
- Modify: `js/app-core.js` (JSDoc only, `?v=` bump)
- Test: `tests-node/types-core.test.mjs`

**Interfaces:**
- Produces: JSDoc on `escapeHtml(s: string|number|null|undefined): string`, `escapeAttr(...)`, `mountModal`, `_getCurrentClientId(): Promise<string|null>`, `showToast`, `confirmDialog`, `navigate`, `switchView`. Names come from the `page.evaluate` hit list, so these are the most-called cross-file functions.

- [ ] **Step 1: Test.** `types-core.test.mjs` runs tsc over a fixture `.js` that calls `_getCurrentClientId()` and uses the result as a non-null string without a check, with `strictNullChecks` on for that fixture only. Expected: a TS2322/TS18047 error. This pins Review Focus #1: ids are nullable.
- [ ] **Step 2:** Run it. Expected: FAIL (no annotation yet, so the return type is `any`).
- [ ] **Step 3:** Add the JSDoc. Every `coach_id`/`client_id`/`user_id` param or return is `string|null`.
- [ ] **Step 4:** Test passes. `npm run typecheck` count is ≤ baseline. `npm run test:unit` is green. Run the specs that call these helpers (`grep -l "confirmDialog\|showToast" tests/`).
- [ ] **Step 5:** `check-types.mjs --write` to lower the baseline. Commit.

**Then stop.** The other eight files are burned down one per commit in the same shape, with no plan needed beyond "JSDoc only, ratchet lowers, bump `?v=`". Order by error count from Task 1, highest first.

---

## Phase 2: ES modules, a decision gate, not tasks

Decide after Task 4, using:

- `tsc`'s cross-file reference count, from a small script over the checker API. This replaces the 190-of-703 name-match estimate above, which over-counts common names. How many names are actually shared between files?
- The inline-handler count at that time (`check-handler-targets.mjs` already lists them).

Three options to decide between then:

1. **Stay classic, split the big files.** Turn `app-workouts`/`app-runner`/`app-progress`/`app-programs` (3.4-4.7k lines each) into smaller classic scripts. The runtime model doesn't change, the checker already covers it, and every `?v=`-parsing script picks up new tags automatically.
2. **Event delegation first, then modules.** Replace inline `on*=` handlers with `data-action` plus one delegated listener per view, which removes the ~500 `window` exports. After that, modules shrink the global surface for real. This is a large job across all 9 files and 173 specs.
3. **Modules with a `window` export shim.** Least value: the global namespace stays, and you pay the strict-mode and load-order risk.

My recommendation now, before the Phase 1 data: option 1.

**Known module blocker found by Phase 1 (2026-10-29):** `js/app-workouts.js:4707-4708` assigns `_fakeRsTemplate` and `_fakeRsName` without `window.` (TS2304). This works in sloppy classic scripts, which create the global implicitly. In a module (strict mode) it throws a ReferenceError and breaks the "start this template" path. Options 2 and 3 must fix it first. Option 1 doesn't need to.

## Also found

`docs/architecture.md` says 17,599 lines across the nine modules. Today it's 21,256 (`wc -l js/*.js`). Fix it in Task 1's commit.
