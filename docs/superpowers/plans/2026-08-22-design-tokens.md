# Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CoachApp a token vocabulary for type, radius and colour so that branding later is an edit to ~20 values in `main.css` instead of 1,027 scattered literals — with zero visual change today.

**Architecture:** Add tokens to `main.css` `:root` (additive only). Add a per-file count ratchet to `checks.sh` BEFORE any conversion, because `--radius` has existed for months while the code drifted to 18 distinct radius values — tokens without enforcement demonstrably do not hold. Then a node codemod rewrites literals to `var(--token, <literal>)` inside `style="…"` attributes only, module by module, one commit each, verified by a byte-identical round-trip proof.

**Tech Stack:** Plain vanilla JS (ES6+), **no build step**, no bundler. CSS custom properties. `sh` for `scripts/checks.sh`. Node (ESM `.mjs`) for scripts. Playwright for tests.

**Spec:** `docs/superpowers/specs/2026-08-22-design-tokens-design.md`

## Global Constraints

- **No build step exists.** Every `js/*.js` file is loaded directly by `index.html` and shares ONE global scope. Do not add bundling, imports, or a framework.
- **Cache-bust is mandatory.** Any changed `js/*.js` or `css/main.css` MUST have its `?v=N` incremented in `index.html` **in the same commit**.
- **Zero visual change.** Every replacement is exact-value. No rounding, ever. An unmatched value is reported and left alone.
- **Fallbacks always.** Emit `var(--token, <original literal>)`, never bare `var(--token)`.
- **Scope: inside `style="…"` attributes only** (plus declarations in `css/main.css`). Never touch a hex in a JavaScript string — `js/app-progress.js:2303` passes colours to Chart.js on a canvas, which does not resolve `var()`.
- **`--radius` stays 10px and `--radius-lg` stays 14px.** Both have live `var()` consumers. Never change an existing token's value.
- **Commit style:** end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Never pipe a test/gate/push command** — `pipefail` is off, so the exit code would be the pipe's. Redirect to a file and read the summary line.
- **Prove every new check can FAIL before trusting it.** A check that has only been seen passing is indistinguishable from a dead one.

---

## File Structure

| file | responsibility |
|---|---|
| `css/main.css` | **Modify.** Add type/radius tokens + `--font` to `:root`. Bump `?v=` in `index.html`. |
| `index.html` | **Modify.** Cache-bust bumps only. |
| `scripts/checks.sh` | **Modify.** Replace rule 3 (cache-bust) with a diff-aware version; add rule 3b (style-literal ratchet). |
| `scripts/style-baseline.json` | **Create.** Per-file literal counts. Revised downward as modules convert. |
| `scripts/tokenise.mjs` | **Create.** The codemod. Dry-run by default. |
| `scripts/tokenise-verify.mjs` | **Create.** Round-trip proof: expand `var()` back, assert byte-identical. |
| `tests/design-tokens-2026-08-22.spec.js` | **Create.** Asserts every token resolves in a real browser. |
| `js/*.js` (8 files) | **Modify.** One module per commit, converted by the codemod. |

---

## Task 1: Cache-bust check that detects a MISSED BUMP

The existing rule 3 asserts a `?v=` **exists**. It cannot detect a changed module whose version did not rise — which is how three modules shipped their ownership guards behind a stale cache on 2026-08-22. It also hardcodes **8** modules and omits `starter-content.js`, so that file has never been checked at all.

This plan requires NINE consecutive version bumps, so this lands first.

**Files:**
- Modify: `scripts/checks.sh:81-94` (rule 3)

**Interfaces:**
- Consumes: nothing
- Produces: a `checks.sh` rule that fails when a changed module's `?v=` did not rise. No exported symbols.

- [ ] **Step 1: Prove the CURRENT rule cannot fail on this defect**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cp js/app-core.js /tmp/t1.bak
printf '\n// probe\n' >> js/app-core.js       # change a module, do NOT bump index.html
CI=true sh scripts/checks.sh > /tmp/t1.out 2>&1; echo "EXIT=$?"
grep -c "FAIL" /tmp/t1.out
cp /tmp/t1.bak js/app-core.js && rm /tmp/t1.bak
```

Expected: `EXIT=0` and `0` FAILs — the current rule is blind to it. Record this; it is the red-before.

- [ ] **Step 2: Replace rule 3 with a diff-aware version**

Replace `scripts/checks.sh` lines 81-94 entirely with:

```sh
# -- 3. Cache bust -- a CHANGED module's ?v= must RISE, not merely exist --
# The old rule only asserted a ?v= was PRESENT. On 2026-08-22 three modules shipped their
# ownership guards with no bump at all and this rule passed on every one of those pushes --
# a returning browser ran the OLD, UNGUARDED code while index.html said nothing had changed.
# It also hardcoded 8 modules and omitted starter-content.js, which had never been checked.
# Enumerate from disk; compare versions between origin/master and HEAD.
echo "Checking cache bust..."
CB_BASE=origin/master
if ! git rev-parse --verify "$CB_BASE" >/dev/null 2>&1; then
  echo "  [SKIP] $CB_BASE not available -- cannot diff versions. This is a SKIP, not a pass."
else
  CB_BAD=""
  for f in js/*.js css/main.css; do
    git diff --quiet "$CB_BASE" HEAD -- "$f" && continue          # unchanged, nothing to check
    key=$(echo "$f" | sed 's#/#\\/#g')
    old=$(git show "$CB_BASE:index.html" 2>/dev/null | grep -oE "${f}\?v=[0-9]+" | grep -oE '[0-9]+$')
    new=$(grep -oE "${f}\?v=[0-9]+" index.html | grep -oE '[0-9]+$')
    if [ -z "$new" ]; then CB_BAD="$CB_BAD $f(no-tag)"; continue; fi
    if [ -z "$old" ]; then continue; fi                            # new file, nothing to compare
    if [ "$new" -le "$old" ]; then CB_BAD="$CB_BAD $f($old->$new)"; fi
  done
  if [ -n "$CB_BAD" ]; then
    fail "changed file(s) whose ?v= did not rise:$CB_BAD -- a cached browser will run the OLD code"
  else
    echo "  Every changed module's ?v= rose."
  fi
fi
```

- [ ] **Step 3: Prove the NEW rule fails on the same probe**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cp js/app-core.js /tmp/t1.bak
printf '\n// probe\n' >> js/app-core.js
CI=true sh scripts/checks.sh > /tmp/t1.out 2>&1; echo "EXIT=$?"
grep "did not rise" /tmp/t1.out
cp /tmp/t1.bak js/app-core.js && rm /tmp/t1.bak
```

Expected: `EXIT=1` and a line naming `js/app-core.js`. **If it does not fail, the rule is dead — stop and fix it before continuing.**

- [ ] **Step 4: Prove it does NOT fire on a correct change**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cp js/app-core.js /tmp/t1.bak; cp index.html /tmp/t1h.bak
printf '\n// probe\n' >> js/app-core.js
sed -i 's#js/app-core\.js?v=15#js/app-core.js?v=16#' index.html
CI=true sh scripts/checks.sh > /tmp/t1.out 2>&1; echo "EXIT=$?"
cp /tmp/t1.bak js/app-core.js; cp /tmp/t1h.bak index.html; rm /tmp/t1.bak /tmp/t1h.bak
```

Expected: `EXIT=0`. A guard's real risk here is refusing a legitimate push.

- [ ] **Step 5: Confirm the tree is clean, then commit**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git status --short           # must show ONLY scripts/checks.sh
git add scripts/checks.sh
git commit -F- <<'MSG'
fix: cache-bust check now detects a MISSED bump, not just a missing tag

The old rule asserted a ?v= EXISTED. It could not detect a changed module whose
version did not rise -- which is how app-clients, app-calendar-goals and app-progress
shipped their ownership guards behind a stale cache on 2026-08-22, passing this rule
on every push. It also hardcoded 8 modules and omitted starter-content.js entirely.

Now enumerates from disk and compares each CHANGED file's ?v= between origin/master
and HEAD. An unavailable base prints [SKIP], never a silent pass.

Proven both ways: a changed module with no bump is refused by name; the same change
WITH a bump passes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Task 2: The token vocabulary

**Files:**
- Modify: `css/main.css` (`:root` block)
- Modify: `index.html:15` (`css/main.css?v=9` → `?v=10`)

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--font`, `--text-2xs|xs|sm|md|base|lg|xl|2xl|3xl|4xl|display`, `--legacy-text-*`, `--radius-xs|sm|md|xl|full`, `--legacy-radius-*`. Task 4's codemod maps literals onto exactly these names.

- [ ] **Step 1: Verify no existing token is about to be redefined**

```bash
cd c:/Users/jaken/OneDrive/coachapp
grep -nE '^\s*--(font|text-|legacy-|radius-(xs|sm|md|xl|full))' css/main.css
```

Expected: **no output**. If any name already exists, STOP — redefining it would move pixels.

- [ ] **Step 2: Add the tokens to `:root`**

Append inside the existing `:root { … }` block in `css/main.css`, immediately after the last existing token:

```css
  /* ── TYPE ──────────────────────────────────────────────────────────────
     Derived from measured usage on 2026-08-22, not from a typographic ratio:
     13px carries the app because it already did. 11 canonical steps cover
     635 of 721 uses. --font is the single swap point when the real brand
     typeface arrives; Inter is a placeholder. */
  --font:          'Inter', system-ui, -apple-system, sans-serif;
  --text-2xs:      9px;
  --text-xs:      10px;
  --text-sm:      11px;
  --text-md:      12px;
  --text-base:    13px;
  --text-lg:      14px;
  --text-xl:      16px;
  --text-2xl:     18px;
  --text-3xl:     20px;
  --text-4xl:     24px;
  --text-display: 32px;

  /* LEGACY TYPE -- 86 uses across 14 off-scale values. These exist so nothing
     moves today. Each FOLD comment is a to-do for a later, per-site pass that
     needs eyes on the screen -- folding them MOVES PIXELS and is out of scope. */
  --legacy-text-7:    7px;    /* FOLD -> --text-2xs     */
  --legacy-text-8:    8px;    /* FOLD -> --text-2xs     */
  --legacy-text-10-5: 10.5px; /* FOLD -> --text-xs      */
  --legacy-text-11-5: 11.5px; /* FOLD -> --text-sm  (18 uses -- a real decision) */
  --legacy-text-12-5: 12.5px; /* FOLD -> --text-md      */
  --legacy-text-13-5: 13.5px; /* FOLD -> --text-base    */
  --legacy-text-15:   15px;   /* FOLD -> undecided  (25 uses -- needs Jake) */
  --legacy-text-17:   17px;   /* FOLD -> --text-xl      */
  --legacy-text-19:   19px;   /* FOLD -> --text-2xl     */
  --legacy-text-22:   22px;   /* FOLD -> --text-3xl     */
  --legacy-text-26:   26px;   /* FOLD -> --text-4xl     */
  --legacy-text-30:   30px;   /* FOLD -> --text-display */
  --legacy-text-40:   40px;   /* FOLD -> --text-display */
  --legacy-text-64:   64px;   /* FOLD -> --text-display */

  /* ── RADIUS ────────────────────────────────────────────────────────────
     --radius (10px) and --radius-lg (14px) are NOT redefined: both have live
     var() consumers, so changing either would move real pixels.
     Monotonic: xs 4 · sm 8 · radius 10 · md 12 · lg 14 · xl 20. */
  --radius-xs:    4px;
  --radius-sm:    8px;
  --radius-md:   12px;
  --radius-xl:   20px;
  --radius-full: 999px;   /* folds 99px / 100px / 999px, all "fully round" */

  --legacy-radius-2:   2px;
  --legacy-radius-3:   3px;
  --legacy-radius-5:   5px;
  --legacy-radius-7:   7px;
  --legacy-radius-9:   9px;
  --legacy-radius-16: 16px;
  --legacy-radius-18: 18px;
  --legacy-radius-24: 24px;
```

- [ ] **Step 3: Write the failing token-resolution test**

Create `tests/design-tokens-2026-08-22.spec.js`:

```javascript
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Asserts every token RESOLVES in a real browser. The round-trip proof in
// scripts/tokenise-verify.mjs proves no VALUE changed; it cannot prove a token is
// DEFINED. A typo'd var(--text-bse, 13px) round-trips perfectly and silently uses
// its fallback forever, so this is the layer that catches that.
const EXPECTED = {
  '--text-2xs': '9px', '--text-xs': '10px', '--text-sm': '11px', '--text-md': '12px',
  '--text-base': '13px', '--text-lg': '14px', '--text-xl': '16px', '--text-2xl': '18px',
  '--text-3xl': '20px', '--text-4xl': '24px', '--text-display': '32px',
  '--legacy-text-7': '7px', '--legacy-text-8': '8px', '--legacy-text-10-5': '10.5px',
  '--legacy-text-11-5': '11.5px', '--legacy-text-12-5': '12.5px', '--legacy-text-13-5': '13.5px',
  '--legacy-text-15': '15px', '--legacy-text-17': '17px', '--legacy-text-19': '19px',
  '--legacy-text-22': '22px', '--legacy-text-26': '26px', '--legacy-text-30': '30px',
  '--legacy-text-40': '40px', '--legacy-text-64': '64px',
  '--radius-xs': '4px', '--radius-sm': '8px', '--radius-md': '12px',
  '--radius-xl': '20px', '--radius-full': '999px',
  '--legacy-radius-2': '2px', '--legacy-radius-3': '3px', '--legacy-radius-5': '5px',
  '--legacy-radius-7': '7px', '--legacy-radius-9': '9px', '--legacy-radius-16': '16px',
  '--legacy-radius-18': '18px', '--legacy-radius-24': '24px'
}

test.describe('design tokens resolve', () => {
  test('every type and radius token resolves to its intended value', async ({ page }) => {
    await loginAsPT(page)
    const actual = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement)
      const out = {}
      for (const n of names) out[n] = cs.getPropertyValue(n).trim()
      return out
    }, Object.keys(EXPECTED))
    for (const [name, want] of Object.entries(EXPECTED)) {
      expect(actual[name], `${name} must resolve to ${want} -- an undefined token silently falls back forever`).toBe(want)
    }
  })

  test('the two PRE-EXISTING radius tokens are unchanged', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return { radius: cs.getPropertyValue('--radius').trim(), lg: cs.getPropertyValue('--radius-lg').trim() }
    })
    expect(r.radius, '--radius has 7 var() consumers; changing it moves pixels').toBe('10px')
    expect(r.lg, '--radius-lg has 2 var() consumers; changing it moves pixels').toBe('14px')
  })

  test('--font is defined, so the typeface has a single swap point', async ({ page }) => {
    await loginAsPT(page)
    const f = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font').trim())
    expect(f).toContain('Inter')
  })
})
```

- [ ] **Step 4: Run the test — it must FAIL first**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git stash list                      # MUST be inspected, never popped -- a real WIP stash lives here
npx playwright test tests/design-tokens-2026-08-22.spec.js --reporter=line > /tmp/t2.out 2>&1; echo "EXIT=$?"
grep -E "[0-9]+ (passed|failed)" /tmp/t2.out
```

Run this BEFORE step 2's edit is saved if possible; otherwise temporarily comment out the token block. Expected: FAIL, because the tokens do not resolve. This is the red-before.

- [ ] **Step 5: Bump the CSS cache-bust**

```bash
cd c:/Users/jaken/OneDrive/coachapp
sed -i 's#css/main\.css?v=9#css/main.css?v=10#' index.html
grep -n "main.css" index.html
```

Expected: `css/main.css?v=10`.

- [ ] **Step 6: Run the test — it must PASS**

```bash
cd c:/Users/jaken/OneDrive/coachapp
npx playwright test tests/design-tokens-2026-08-22.spec.js --reporter=line > /tmp/t2.out 2>&1; echo "EXIT=$?"
grep -E "[0-9]+ (passed|failed)" /tmp/t2.out
```

Expected: `EXIT=0`, 3 passed.

- [ ] **Step 7: Full suite, then commit**

```bash
cd c:/Users/jaken/OneDrive/coachapp
CI=true sh scripts/checks.sh > /tmp/t2c.out 2>&1; echo "CHECKS_EXIT=$?"
git add css/main.css index.html tests/design-tokens-2026-08-22.spec.js
git commit -F- <<'MSG'
feat: design token vocabulary -- type, radius, --font swap point (css v10)

Purely additive. No existing token changes value: --radius stays 10px (7 var()
consumers) and --radius-lg stays 14px (2 consumers). An earlier draft moved
--radius-lg to 12px because 14px has one LITERAL use -- but a literal count is not
a consumer count, and that would have moved real pixels. 12px is --radius-md instead.

11 canonical type steps cover 635 of 721 measured uses. The 86 off-scale uses get
--legacy-* aliases carrying FOLD comments: they exist so NOTHING moves today, and
folding them is a later per-site pass that needs eyes on the screen.

Nothing consumes these yet -- the codemod lands separately. Test asserts every token
RESOLVES in a real browser, which the round-trip proof structurally cannot do: a
typo'd var(--text-bse, 13px) round-trips perfectly and uses its fallback forever.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Task 3: The style-literal ratchet

Ships BEFORE any conversion. `--radius` existed for months while the code drifted to 18 values — tokens without enforcement do not hold.

**Files:**
- Create: `scripts/style-baseline.json`
- Modify: `scripts/checks.sh` (add rule 3b after rule 3)

**Interfaces:**
- Consumes: nothing
- Produces: `scripts/style-baseline.json` — a flat `{ "<path>": <integer> }` map. Tasks 5-7 revise entries downward.

- [ ] **Step 1: Generate the baseline from the current tree**

```bash
cd c:/Users/jaken/OneDrive/coachapp
{
  echo '{'
  first=1
  for f in js/*.js css/main.css; do
    n=$(sed -E 's/var\([^)]*\)//g' "$f" | grep -ohE 'font-size:[[:space:]]*[0-9.]+px|border-radius:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l)
    [ $first -eq 0 ] && echo ','
    printf '  "%s": %s' "$f" "$n"
    first=0
  done
  echo ''
  echo '}'
} > scripts/style-baseline.json
cat scripts/style-baseline.json
```

Expected (from the 2026-08-22 audit): `app-runner.js` 293, `app-progress.js` 271, `app-dashboard.js` 153, `app-workouts.js` 111, `app-programs.js` 90, `app-calendar-goals.js` 45, `app-clients.js` 38, `app-core.js` 26, `starter-content.js` 0, `css/main.css` 112. **If the numbers differ materially, STOP** — the tree has changed since the audit and the spec's figures need re-deriving.

- [ ] **Step 2: Add rule 3b to `scripts/checks.sh`**

Insert immediately after rule 3's closing `fi`, before `# -- 4. No bare alert() calls --`:

```sh
# -- 3b. Style-literal ratchet -- a file's count must never RISE --
# --radius has existed for months and the code still drifted to 18 distinct radius
# values, including three spellings of "fully round" (99px/100px/999px). Tokens
# without enforcement demonstrably do not hold, so this ships BEFORE the conversion.
# PER-FILE, not a global total: one total would let ten literals added to the runner
# be offset by ten removed from clients. A file with no baseline entry gets 0, so a
# new module carrying literals fails immediately -- allowlist, not denylist.
# var(...) is stripped BEFORE counting: the fallback form var(--danger, #ef4444)
# would otherwise be miscounted as unconverted work (verified 2026-08-22).
echo "Checking style-literal ratchet..."
SB=scripts/style-baseline.json
if [ ! -f "$SB" ]; then
  fail "$SB is missing -- the ratchet cannot run, and a missing baseline is not a pass"
else
  SB_BAD=""
  for f in js/*.js css/main.css; do
    n=$(sed -E 's/var\([^)]*\)//g' "$f" | grep -ohE 'font-size:[[:space:]]*[0-9.]+px|border-radius:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l | tr -d ' ')
    b=$(grep -oE "\"$(echo "$f" | sed 's#/#\\/#g')\"[[:space:]]*:[[:space:]]*[0-9]+" "$SB" | grep -oE '[0-9]+$')
    [ -z "$b" ] && b=0
    if [ "$n" -gt "$b" ]; then SB_BAD="$SB_BAD $f($b->$n)"; fi
  done
  if [ -n "$SB_BAD" ]; then
    fail "style literals INCREASED:$SB_BAD -- use a token from css/main.css, or lower the baseline if you converted"
  else
    echo "  No file exceeds its style-literal baseline."
  fi
fi
```

- [ ] **Step 3: Prove it REFUSES a new literal**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cp js/app-core.js /tmp/t3.bak
printf '\nconst _p = `<div style="font-size:13px">x</div>`\n' >> js/app-core.js
CI=true sh scripts/checks.sh > /tmp/t3.out 2>&1; echo "EXIT=$?"
grep "style literals INCREASED" /tmp/t3.out
cp /tmp/t3.bak js/app-core.js && rm /tmp/t3.bak
```

Expected: `EXIT=1`, naming `js/app-core.js(26->27)`. **If it does not fail, the rule is dead — stop.** `checks.sh` rule 2b shipped dead on 2026-08-22 because its character class was malformed in POSIX ERE and nobody made it fail first.

- [ ] **Step 4: Prove it ALLOWS a tokenised addition**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cp js/app-core.js /tmp/t3.bak
printf '\nconst _p = `<div style="font-size:var(--text-base, 13px)">x</div>`\n' >> js/app-core.js
CI=true sh scripts/checks.sh > /tmp/t3.out 2>&1; echo "EXIT=$?"
cp /tmp/t3.bak js/app-core.js && rm /tmp/t3.bak
```

Expected: `EXIT=0`. This is the case that proves the `var()` strip works — the fallback contains `13px` and must NOT be counted.

- [ ] **Step 5: Confirm clean, then commit**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git status --short          # ONLY scripts/checks.sh and scripts/style-baseline.json
git add scripts/checks.sh scripts/style-baseline.json
git commit -F- <<'MSG'
feat: per-file style-literal ratchet in checks.sh

Ships BEFORE any conversion, deliberately. --radius has existed for months and the
code still drifted to 18 distinct radius values, including three spellings of
"fully round". Tokens without enforcement do not hold.

Per-file, not a global total: one total lets ten literals added to the runner be
offset by ten removed from clients. A file with no baseline entry gets 0, so a new
module carrying literals fails immediately.

var(...) is stripped before counting -- the fallback form var(--danger, #ef4444)
would otherwise be miscounted as unconverted work.

Proven both ways: a bare literal is refused by name with its before->after count;
the same addition written as var(--text-base, 13px) passes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Task 4: The codemod and its round-trip verifier

Built and proven on a fixture. **Nothing in `js/` is converted in this task.**

**Files:**
- Create: `scripts/tokenise.mjs`
- Create: `scripts/tokenise-verify.mjs`

**Interfaces:**
- Consumes: the token names from Task 2.
- Produces:
  - `node scripts/tokenise.mjs <file> [--apply]` — dry-run unless `--apply`. Prints a per-value replacement table and the before/after literal count.
  - `node scripts/tokenise-verify.mjs <original-file> <converted-file>` — exit 0 if expanding every `var(--t, lit)` in the converted file yields a byte-identical match to the original; exit 1 with the first differing line otherwise.

- [ ] **Step 1: Write `scripts/tokenise.mjs`**

```javascript
#!/usr/bin/env node
// Rewrites style literals to var(--token, <literal>) INSIDE style="..." attributes only.
//
// The scope rule is the safety property. js/app-progress.js:2303 passes colours to
// Chart.js on a canvas, which does not resolve var() -- substituting there would
// silently strip the chart's colours. Of 176 hex in js/, 116 are CSS declarations and
// 60 are JavaScript string values; only the former are in scope.
//
// EXACT-VALUE ONLY. A value with no exactly-matching token is REPORTED, never rounded.
// That is what makes "zero visual change" a property of this script rather than a hope.
import { readFileSync, writeFileSync } from 'node:fs'

const TYPE = {
  '9px': '--text-2xs', '10px': '--text-xs', '11px': '--text-sm', '12px': '--text-md',
  '13px': '--text-base', '14px': '--text-lg', '16px': '--text-xl', '18px': '--text-2xl',
  '20px': '--text-3xl', '24px': '--text-4xl', '32px': '--text-display',
  '7px': '--legacy-text-7', '8px': '--legacy-text-8', '10.5px': '--legacy-text-10-5',
  '11.5px': '--legacy-text-11-5', '12.5px': '--legacy-text-12-5', '13.5px': '--legacy-text-13-5',
  '15px': '--legacy-text-15', '17px': '--legacy-text-17', '19px': '--legacy-text-19',
  '22px': '--legacy-text-22', '26px': '--legacy-text-26', '30px': '--legacy-text-30',
  '40px': '--legacy-text-40', '64px': '--legacy-text-64'
}
const RADIUS = {
  '4px': '--radius-xs', '8px': '--radius-sm', '10px': '--radius', '12px': '--radius-md',
  '14px': '--radius-lg', '20px': '--radius-xl',
  '99px': '--radius-full', '100px': '--radius-full', '999px': '--radius-full',
  '2px': '--legacy-radius-2', '3px': '--legacy-radius-3', '5px': '--legacy-radius-5',
  '7px': '--legacy-radius-7', '9px': '--legacy-radius-9', '16px': '--legacy-radius-16',
  '18px': '--legacy-radius-18', '24px': '--legacy-radius-24'
}
const COLOUR = {
  '#ef4444': '--danger', '#f59e0b': '--warning', '#22c55e': '--success'
}

const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file) { console.error('usage: tokenise.mjs <file> [--apply]'); process.exit(2) }

const src = readFileSync(file, 'utf8')
const stats = new Map()
const unmatched = new Map()
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)

// Only the inside of a style="..." attribute is ever touched.
const out = src.replace(/style="([^"]*)"/g, (whole, body) => {
  let b = body

  b = b.replace(/font-size:(\s*)([0-9.]+px)/g, (m, sp, val) => {
    const t = TYPE[val]
    if (!t) { bump(unmatched, `font-size:${val}`); return m }
    bump(stats, `font-size ${val} -> var(${t})`)
    return `font-size:${sp}var(${t}, ${val})`
  })

  b = b.replace(/border-radius:(\s*)([0-9]+px)/g, (m, sp, val) => {
    const t = RADIUS[val]
    if (!t) { bump(unmatched, `border-radius:${val}`); return m }
    bump(stats, `border-radius ${val} -> var(${t})`)
    return `border-radius:${sp}var(${t}, ${val})`
  })

  // Colour only where it follows a colour-bearing property, so a hex inside a
  // gradient string or an unrelated token is never touched.
  b = b.replace(/(background|background-color|color|border-color|fill|stroke)(:\s*)(#[0-9a-fA-F]{3,8})\b/g,
    (m, prop, sep, val) => {
      const t = COLOUR[val.toLowerCase()]
      if (!t) { bump(unmatched, `${prop}:${val}`); return m }
      bump(stats, `${prop} ${val} -> var(${t})`)
      return `${prop}${sep}var(${t}, ${val})`
    })

  return `style="${b}"`
})

const count = s => (s.replace(/var\([^)]*\)/g, '')
  .match(/font-size:\s*[0-9.]+px|border-radius:\s*[0-9]+px|#[0-9a-fA-F]{3,8}\b/g) || []).length

console.log(`\n${file}  ${apply ? '[APPLY]' : '[DRY RUN -- nothing written]'}`)
console.log(`  literals before: ${count(src)}   after: ${count(out)}`)
console.log('  replacements:')
for (const [k, v] of [...stats].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
if (unmatched.size) {
  console.log('  LEFT ALONE (no exact token -- never rounded):')
  for (const [k, v] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
}
if (apply) { writeFileSync(file, out); console.log('  written.') }
```

- [ ] **Step 2: Write `scripts/tokenise-verify.mjs`**

```javascript
#!/usr/bin/env node
// ROUND-TRIP PROOF. Expands every var(--token, literal) back to its literal and asserts
// the result is BYTE-IDENTICAL to the original file.
//
// This is the primary verification and it is a proof over the WHOLE diff, not a sample:
// if the codemod rounded a value, touched the wrong property, or mangled a quote, the
// expansion stops matching. Deterministic, no browser, cannot flake.
//
// What it does NOT prove: that the tokens are DEFINED. A typo'd var(--text-bse, 13px)
// round-trips perfectly. tests/design-tokens-2026-08-22.spec.js covers that.
import { readFileSync } from 'node:fs'

const [, , origPath, convPath] = process.argv
if (!origPath || !convPath) { console.error('usage: tokenise-verify.mjs <original> <converted>'); process.exit(2) }

const orig = readFileSync(origPath, 'utf8')
const conv = readFileSync(convPath, 'utf8')

// var(--anything, LITERAL) -> LITERAL
const expanded = conv.replace(/var\(--[a-z0-9-]+,\s*([^)]*)\)/gi, (_m, lit) => lit.trim())

if (expanded === orig) {
  console.log(`ROUND-TRIP OK -- ${convPath} expands byte-identically to ${origPath}`)
  process.exit(0)
}

const a = orig.split('\n'), b = expanded.split('\n')
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.error(`ROUND-TRIP FAILED at line ${i + 1}`)
    console.error(`  original : ${JSON.stringify(a[i])}`)
    console.error(`  expanded : ${JSON.stringify(b[i])}`)
    break
  }
}
process.exit(1)
```

- [ ] **Step 3: Prove the verifier can FAIL**

```bash
cd c:/Users/jaken/OneDrive/coachapp
T=$(cd /tmp && pwd -W)     # node cannot resolve a bash /tmp path -- use the Windows form
printf 'a\n<div style="font-size:13px">x</div>\nb\n' > /tmp/orig.txt
printf 'a\n<div style="font-size:var(--text-base, 13px)">x</div>\nb\n' > /tmp/good.txt
printf 'a\n<div style="font-size:var(--text-base, 12px)">x</div>\nb\n' > /tmp/bad.txt
node scripts/tokenise-verify.mjs "$T/orig.txt" "$T/good.txt"; echo "GOOD_EXIT=$?"
node scripts/tokenise-verify.mjs "$T/orig.txt" "$T/bad.txt";  echo "BAD_EXIT=$?"
rm /tmp/orig.txt /tmp/good.txt /tmp/bad.txt
```

Expected: `GOOD_EXIT=0`, `BAD_EXIT=1` with the differing line printed. **A verifier that has only been seen passing is worthless.**

- [ ] **Step 4: Dry-run the codemod against every module, change nothing**

```bash
cd c:/Users/jaken/OneDrive/coachapp
for f in js/*.js; do node scripts/tokenise.mjs "$f"; done > /tmp/t4.out 2>&1
grep -E "literals before|LEFT ALONE" -A3 /tmp/t4.out | head -60
git status --short          # MUST be empty -- dry run writes nothing
```

Read the whole report. **Every entry under `LEFT ALONE` must be explainable** — expected ones are `font-size` values already covered by a legacy token (none should appear), and hex colours that are not `--danger`/`--warning`/`--success`. If a value you expected to convert is left alone, the map in Task 4 Step 1 is missing it.

- [ ] **Step 5: Commit the scripts**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git add scripts/tokenise.mjs scripts/tokenise-verify.mjs
git commit -F- <<'MSG'
feat: token codemod + round-trip verifier (nothing converted yet)

tokenise.mjs rewrites style literals to var(--token, <literal>) INSIDE style="..."
attributes only. That scope rule is the safety property: js/app-progress.js:2303
passes colours to Chart.js on a canvas, which does not resolve var(). Of 176 hex in
js/, 116 are CSS declarations and 60 are JS string values; only the former are in scope.

EXACT-VALUE ONLY -- a value with no exactly-matching token is REPORTED, never rounded.
Dry-run by default; --apply writes.

tokenise-verify.mjs is the primary verification: expand every var(--t, lit) back and
assert BYTE-IDENTICAL to the original. A proof over the whole diff, not a sample.
Proven able to fail on a deliberately wrong fallback.

No js/ file is converted in this commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Task 5: Review the codemod, then pilot on `app-core`

**Files:**
- Modify: `js/app-core.js` (26 literals)
- Modify: `index.html` (`app-core.js?v=15` → `?v=16`)
- Modify: `scripts/style-baseline.json` (`js/app-core.js` → new count)

**Interfaces:**
- Consumes: `scripts/tokenise.mjs`, `scripts/tokenise-verify.mjs` from Task 4.
- Produces: nothing new. Establishes the per-module loop that Tasks 6-7 repeat.

- [ ] **Step 1: Run `multi-agent-review` on the codemod script — ONCE, not per module**

Review `scripts/tokenise.mjs` and `scripts/tokenise-verify.mjs`. The script is the risk; the modules are its output. Fix any finding before proceeding.

- [ ] **Step 2: Snapshot the original, dry-run, and read the report**

```bash
cd c:/Users/jaken/OneDrive/coachapp
node scripts/tokenise.mjs js/app-core.js
```

Read every line. `app-core.js` is the pilot precisely because 26 replacements fit in one screen.

- [ ] **Step 3: Apply, then run the round-trip proof**

```bash
cd c:/Users/jaken/OneDrive/coachapp
node scripts/tokenise.mjs js/app-core.js --apply
node scripts/tokenise-verify.mjs js/app-core.js; echo "ROUNDTRIP_EXIT=$?"
node --check js/app-core.js && echo "SYNTAX OK"
```

Expected: `ROUNDTRIP_EXIT=0`. **If it is 1, STOP — do not patch and continue.** The codemod is wrong and needs rethinking, not narrowing.

- [ ] **Step 4: Read the diff line by line**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git diff js/app-core.js
```

Every changed line must be explainable. **If anything is unexplainable, stop** — this is the stopping condition from spec §7.3.

- [ ] **Step 5: Bump the cache-bust and lower the baseline**

```bash
cd c:/Users/jaken/OneDrive/coachapp
sed -i 's#js/app-core\.js?v=15#js/app-core.js?v=16#' index.html
n=$(sed -E 's/var\([^)]*\)//g' js/app-core.js | grep -ohE 'font-size:[[:space:]]*[0-9.]+px|border-radius:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l | tr -d ' ')
echo "new app-core count: $n"
sed -i -E "s#(\"js/app-core\.js\"[[:space:]]*:[[:space:]]*)[0-9]+#\1${n}#" scripts/style-baseline.json
grep "app-core" scripts/style-baseline.json
```

- [ ] **Step 6: Gates green**

```bash
cd c:/Users/jaken/OneDrive/coachapp
CI=true sh scripts/checks.sh > /tmp/t5c.out 2>&1; echo "CHECKS_EXIT=$?"
npx playwright test --reporter=line > /tmp/t5t.out 2>&1; echo "TEST_EXIT=$?"
grep -E "[0-9]+ (passed|failed|flaky)" /tmp/t5t.out
```

Expected: `CHECKS_EXIT=0`. For the suite, read the **summary line**, not just the status — and classify any failure as login-timeout flake vs product assertion before treating it as a regression.

- [ ] **Step 7: Commit**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git add js/app-core.js index.html scripts/style-baseline.json
git commit -F- <<'MSG'
refactor: tokenise app-core (core v16) -- pilot, zero visual change

First module through the codemod. app-core (26 literals) is the pilot rather than the
worst offender: worst-first would have put maximum risk on run #1, when the script is
least proven, on the screen used mid-session in a gym.

Round-trip proof BYTE-IDENTICAL: expanding every var(--t, lit) back yields the original
file exactly, so the only difference across the whole diff is var() wrappers around
values that did not change.

Baseline lowered accordingly, so the ratchet holds the new floor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

- [ ] **Step 8: Push and hand to Jake for the visual spot-check**

```bash
cd c:/Users/jaken/OneDrive/coachapp
git push > /tmp/t5p.out 2>&1; echo "PUSH_EXIT=$?"; tail -2 /tmp/t5p.out
```

Then STOP and ask Jake to look at the app. All three verification layers prove nothing moved *unintentionally*; none would notice if a value was wrong to begin with. **Do not start Task 6 until he has looked.**

---

## Task 6: Convert `app-runner` (293 literals)

The highest-consequence module — used on a phone mid-session in a gym.

**Files:**
- Modify: `js/app-runner.js`
- Modify: `index.html` (`app-runner.js?v=74` → `?v=75`)
- Modify: `scripts/style-baseline.json`

**Interfaces:**
- Consumes: Task 4's scripts. Produces: nothing new.

- [ ] **Step 1: Snapshot and dry-run**

```bash
cd c:/Users/jaken/OneDrive/coachapp
node scripts/tokenise.mjs js/app-runner.js
```

Read the `LEFT ALONE` section carefully — the runner holds the densest layouts, so an unmatched value here is most likely to be a deliberate nudge.

- [ ] **Step 2: Apply and prove**

```bash
cd c:/Users/jaken/OneDrive/coachapp
node scripts/tokenise.mjs js/app-runner.js --apply
node scripts/tokenise-verify.mjs js/app-runner.js; echo "ROUNDTRIP_EXIT=$?"
node --check js/app-runner.js && echo "SYNTAX OK"
```

Expected `ROUNDTRIP_EXIT=0`. If not, revert with `git checkout -- js/app-runner.js` and stop.

- [ ] **Step 3: Bump, lower the baseline, run gates**

```bash
cd c:/Users/jaken/OneDrive/coachapp
sed -i 's#js/app-runner\.js?v=74#js/app-runner.js?v=75#' index.html
n=$(sed -E 's/var\([^)]*\)//g' js/app-runner.js | grep -ohE 'font-size:[[:space:]]*[0-9.]+px|border-radius:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l | tr -d ' ')
sed -i -E "s#(\"js/app-runner\.js\"[[:space:]]*:[[:space:]]*)[0-9]+#\1${n}#" scripts/style-baseline.json
CI=true sh scripts/checks.sh > /tmp/t6c.out 2>&1; echo "CHECKS_EXIT=$?"
npx playwright test tests/runner.spec.js tests/runner-fast-table-metrics.spec.js tests/unilateral-runner-2026-08-19.spec.js --reporter=line > /tmp/t6t.out 2>&1; echo "TEST_EXIT=$?"
grep -E "[0-9]+ (passed|failed|flaky)" /tmp/t6t.out
```

- [ ] **Step 4: Full suite, then commit and push**

```bash
cd c:/Users/jaken/OneDrive/coachapp
npx playwright test --reporter=line > /tmp/t6full.out 2>&1; echo "TEST_EXIT=$?"
grep -E "[0-9]+ (passed|failed|flaky)" /tmp/t6full.out
git add js/app-runner.js index.html scripts/style-baseline.json
git commit -F- <<'MSG'
refactor: tokenise app-runner (runner v75) -- zero visual change

The densest module: 293 literals, and the screen used on a phone mid-session in a gym.
Round-trip proof BYTE-IDENTICAL, so the only difference across the diff is var()
wrappers around unchanged values.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push > /tmp/t6p.out 2>&1; echo "PUSH_EXIT=$?"; tail -2 /tmp/t6p.out
```

---

## Task 7: Convert the remaining six modules

Same loop, one commit and one cache-bust each. **Do them one at a time**, in this order — a wide change in this codebase lands half-done.

| module | literals | version bump |
|---|---|---|
| `js/app-progress.js` | 271 | `v=50` → `v=51` |
| `js/app-dashboard.js` | 153 | `v=12` → `v=13` |
| `js/app-workouts.js` | 111 | `v=76` → `v=77` |
| `js/app-programs.js` | 90 | `v=44` → `v=45` |
| `js/app-calendar-goals.js` | 45 | `v=16` → `v=17` |
| `js/app-clients.js` | 38 | `v=14` → `v=15` |

`js/starter-content.js` is at **0** — already conformant, nothing to do.

**Files:** Modify each module, `index.html`, `scripts/style-baseline.json`.

**Interfaces:** Consumes Task 4's scripts. Produces: nothing new.

- [ ] **Step 1: For EACH module in the table above, run this loop**

Substitute `<MOD>` (e.g. `app-progress`), `<OLD>` and `<NEW>` from the table:

```bash
cd c:/Users/jaken/OneDrive/coachapp
node scripts/tokenise.mjs js/<MOD>.js                    # dry run -- READ the report
node scripts/tokenise.mjs js/<MOD>.js --apply
node scripts/tokenise-verify.mjs js/<MOD>.js; echo "ROUNDTRIP_EXIT=$?"
node --check js/<MOD>.js && echo "SYNTAX OK"
sed -i 's#js/<MOD>\.js?v=<OLD>#js/<MOD>.js?v=<NEW>#' index.html
n=$(sed -E 's/var\([^)]*\)//g' js/<MOD>.js | grep -ohE 'font-size:[[:space:]]*[0-9.]+px|border-radius:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l | tr -d ' ')
sed -i -E "s#(\"js/<MOD>\.js\"[[:space:]]*:[[:space:]]*)[0-9]+#\1${n}#" scripts/style-baseline.json
CI=true sh scripts/checks.sh > /tmp/<MOD>c.out 2>&1; echo "CHECKS_EXIT=$?"
npx playwright test --reporter=line > /tmp/<MOD>t.out 2>&1; echo "TEST_EXIT=$?"
grep -E "[0-9]+ (passed|failed|flaky)" /tmp/<MOD>t.out
git add js/<MOD>.js index.html scripts/style-baseline.json
git commit -m "refactor: tokenise <MOD> (<MOD> v<NEW>) -- zero visual change

Round-trip proof byte-identical.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push > /tmp/<MOD>p.out 2>&1; echo "PUSH_EXIT=$?"; tail -2 /tmp/<MOD>p.out
```

`ROUNDTRIP_EXIT` must be `0` before committing. If it is `1`, restore with `git checkout -- js/<MOD>.js` and stop.

- [ ] **Step 2: Final verification across the whole tree**

```bash
cd c:/Users/jaken/OneDrive/coachapp
cat scripts/style-baseline.json
node scripts/tokenise.mjs js/app-core.js       # idempotency: must report 0 replacements
git status --short                              # must be empty
npx playwright test tests/design-tokens-2026-08-22.spec.js --reporter=line > /tmp/final.out 2>&1; echo "EXIT=$?"
```

Expected: every `js/` baseline entry substantially lower than its Task 3 starting value; the re-run reports zero replacements (proving idempotency); the token test green.

- [ ] **Step 3: Record the outcome in the Vault**

Update `Vault/projects/CoachApp/design-system-scope-2026-08-22.md` with the achieved counts, move the roadmap's design-system section to `✅ Done` with the commit range, and note what remains **out of scope**: spacing (233 compound shorthands), the 60 JS-string colours, class extraction, folding the `--legacy-*` aliases, and touch-target sizing.

---

## Self-Review

**Spec coverage.** §3 vocabulary → Task 2. §4 ratchet → Task 3. §5 codemod → Task 4. §6.1 round-trip → Tasks 4/5/6/7. §6.2 token-resolution test → Task 2 Step 3. §6.3 suite → every module task. §6.4 human spot-check → Task 5 Step 8. §7 sequencing → task order; step 0 → Task 1. §7.2 review → Task 5 Step 1. §7.3 stopping condition → Task 5 Step 3/4, Task 6 Step 2. §8 out-of-scope → Task 7 Step 3. §10 success criteria → Task 7 Step 2.

**Gap found and closed:** the spec's §7 table lists step 0 as the cache-bust diff check but does not mention that rule 3 also omits `starter-content.js`. Task 1 fixes both defects and says so.

**Placeholder scan.** No TBD/TODO. Task 7 uses `<MOD>`/`<OLD>`/`<NEW>` substitution against an explicit table rather than prose — the values are all present, not deferred.

**Type consistency.** Token names in Task 2's CSS, Task 2's test `EXPECTED` map, and Task 4's `TYPE`/`RADIUS`/`COLOUR` maps all use the same identifiers. `--radius` and `--radius-lg` appear in Task 4's `RADIUS` map as targets but are never redefined in Task 2 — correct and deliberate.
