# Design tokens — a vocabulary for branding

**Date:** 2026-08-22
**Status:** approved, not started
**Origin:** Jake — *"we also need to scope the platform for consistency in regards to font, font size,
field size etc, as soon we will need to think about branding."*
**Audit this builds on:** `Vault/projects/CoachApp/design-system-scope-2026-08-22.md`

---

## 1. Problem

Branding is a token swap — but only where tokens exist. Measured on the current tree:

| | state |
|---|---|
| font-family | **healthy** — exactly ONE declaration app-wide |
| form fields | **healthy** — 97 of 142 `<input>` use `.field-input`; only 16 inline-styled |
| colour | 801 `var(--token)` vs 176 hardcoded hex; 28 tokens exist |
| **typography** | **NO tokens at all.** 25 distinct sizes, including 10.5 / 11.5 / 12.5 / 13.5px |
| **radius** | tokens exist and are ignored — **18 distinct literal values** |
| spacing | no tokens; 233 compound shorthand declarations |

"Field size", the thing that prompted this, is the healthiest part of the platform. The drift is in
type and radius.

**The radius finding is the load-bearing one.** `--radius` has existed for months and the code still
drifted to 18 values, including three different spellings of "fully round" (`99px`, `100px`, `999px`).
Adding tokens without enforcement demonstrably does not hold — which is why the ratchet ships *before*
the conversion, not after.

## 2. Decisions taken (Jake, 2026-08-22)

| decision | choice | consequence |
|---|---|---|
| Visual change | **Zero, first** | off-scale values become aliases; nothing moves in Stage 1 |
| Whose brand | **One brand — Jake's** | tokens are static in `main.css`; no per-tenant layer |
| Typeface | **Inter is a placeholder** | add a `--font` token as the swap point; step VALUES are provisional, the structure and call sites are final |
| Runner | **Tokens inside inline styles** | no markup extraction anywhere; `style="…"` attributes stay |
| Spacing | **Excluded from this pass** | 233 compound shorthands stay literal |
| Fallbacks | **Yes** | emit `var(--token, <literal>)` |

## 3. The token vocabulary

Added to `main.css` `:root`, alongside the existing 28. **Purely additive — no existing token changes
value.**

### 3.1 Font

```css
--font: 'Inter', system-ui, -apple-system, sans-serif;   /* single swap point for the typeface */
```

### 3.2 Type scale — 11 canonical steps

Covers **635 of 721** uses (88%).

```css
--text-2xs:      9px;   /*  15 uses */
--text-xs:      10px;   /*  45 */
--text-sm:      11px;   /* 140 */
--text-md:      12px;   /* 145 */
--text-base:    13px;   /* 172  <- the workhorse */
--text-lg:      14px;   /*  54 */
--text-xl:      16px;   /*  32 */
--text-2xl:     18px;   /*  16 */
--text-3xl:     20px;   /*  11 */
--text-4xl:     24px;   /*   3 */
--text-display: 32px;   /*   2 */
```

### 3.3 Type aliases — 86 uses across 14 values

Each carries its FOLD target as a comment. These exist so Stage 1 moves nothing; they are the
Stage 3 to-do list.

```css
--legacy-text-7:    7px;    /*  1 use   FOLD -> --text-2xs   */
--legacy-text-8:    8px;    /*  3       FOLD -> --text-2xs   */
--legacy-text-10-5: 10.5px; /*  1       FOLD -> --text-xs    */
--legacy-text-11-5: 11.5px; /* 18       FOLD -> --text-sm    */
--legacy-text-12-5: 12.5px; /*  3       FOLD -> --text-md    */
--legacy-text-13-5: 13.5px; /*  5       FOLD -> --text-base  */
--legacy-text-15:   15px;   /* 25       FOLD -> needs a call */
--legacy-text-17:   17px;   /* 10       FOLD -> --text-xl    */
--legacy-text-19:   19px;   /*  4       FOLD -> --text-2xl   */
--legacy-text-22:   22px;   /*  9       FOLD -> --text-3xl   */
--legacy-text-26:   26px;   /*  1       FOLD -> --text-4xl   */
--legacy-text-30:   30px;   /*  2       FOLD -> --text-display */
--legacy-text-40:   40px;   /*  3       FOLD -> --text-display */
--legacy-text-64:   64px;   /*  1       FOLD -> --text-display */
```

**`--legacy-text-15` (25 uses) and `--legacy-text-11-5` (18 uses) are not one-off nudges.** Folding
them is a real design decision per site, taken during Stage 3 where the change is visible — not
mechanically.

### 3.4 Radius

`--radius` **keeps its current value of 10px**. Renaming it to 8px would silently move every existing
`var(--radius)` consumer, which violates decision 1. New siblings are added around it.

```css
--radius-xs:    4px;    /* 16 uses */
--radius-sm:    8px;    /* 48 */
/* --radius:   10px;      50  -- UNCHANGED, already defined, 7 var() consumers */
--radius-md:   12px;    /* 28 */
/* --radius-lg: 14px;      1  -- UNCHANGED, already defined, 2 var() consumers */
--radius-xl:   20px;    /* 16 */
--radius-full: 999px;   /* folds 99px, 100px, 999px */
```

Monotonic: xs 4 · sm 8 · radius 10 · md 12 · lg 14 · xl 20.

**NO existing token changes value.** An earlier draft moved `--radius-lg` from 14px to 12px on the
grounds that `14px` has a single literal use — but a literal count is not a consumer count.
**Verified 2026-08-22: `--radius-lg` has 2 `var()` consumers** (`css/main.css:556` and `:705`), so
changing it would have moved pixels on two real rules and violated decision 1. `12px` gets the new
name `--radius-md` instead. This is exactly the "verified one thing while another was what mattered"
error this project keeps hitting, caught here by the spec self-review.

Radius aliases, same pattern, for the values with no canonical step:
`--legacy-radius-2/3/5/7/9/16/18/24`. (`14px` is not aliased — it already has `--radius-lg`.)

### 3.5 Colour

**No new colour tokens.** The 176 strays map onto tokens that already exist:
`#ef4444` → `--danger` (46), `#f59e0b` → `--warning` (15), `#22c55e` → `--success` (14).

## 4. The ratchet — `checks.sh`

Ships **before** any conversion, with today's tree as the baseline.

### 4.1 Rule

Per-file count of style literals must never **exceed** its recorded baseline in
`scripts/style-baseline.json`. Revised downward as each module converts.

**Per-file, not global** — a single total lets ten literals added to the runner be offset by ten
removed from clients. Per-file makes each module monotonic.

**A file with no baseline entry has a baseline of 0** — so a new module carrying literals fails
immediately. Allowlist, not denylist.

**It fails the push.** `--radius` drifting to 18 values under an existing token is the evidence that
a warning does not hold, and the remedy (use the token) costs nothing.

### 4.2 Baseline (2026-08-22)

```
app-runner.js          293      app-programs.js         90
app-progress.js        271      app-calendar-goals.js   45
app-dashboard.js       153      app-clients.js          38
app-workouts.js        111      app-core.js             26
                               starter-content.js        0
css/main.css           112   (54 font-size, 21 radius, 37 hex)
```

Total in `js/`: **1,027**.

### 4.3 Counting

Strip `var(…)` expressions **before** counting. **Verified 2026-08-22:** the font-size regex ignores
`font-size:var(--text-base, 13px)`, but the hex regex matches the fallback in
`color:var(--danger, #ef4444)` and would miscount it as unconverted work.
`sed -E 's/var\([^)]*\)//g'` fixes it.

### 4.4 What it deliberately does not do

Counts literals; does not judge their values. `font-size:13px` and `font-size:99px` both count 1. A
value-aware rule needs a parser to avoid false positives, and the codemod replaces all of them anyway.
Unambiguous beats clever for something that blocks a push.

### 4.5 Acceptance

**Must be seen refusing before it is trusted.** Add one literal to a module → push refused, naming the
file; remove it → green. `checks.sh` rule 2b shipped DEAD earlier the same day because its character
class was malformed in POSIX ERE and nobody made it fail first.

## 5. The codemod — `scripts/tokenise.mjs`

### 5.1 Scope rule

**Only rewrites values inside a `style="…"` attribute**, plus declarations in `main.css`. Nothing else.

This eliminates the Chart.js hazard by construction. Measured: of 176 hex in `js/`, **116 are in CSS
declarations and 60 are JavaScript string values** — lookup tables, ternaries, and the Chart.js config
at `js/app-progress.js:2303` (`new Chart(el.getContext('2d'), …)`). A canvas does not resolve `var()`,
so substituting there would silently strip the chart's colours.

**The 60 JS-string colours are out of scope** and stay literal. The ratchet still counts them, so they
remain visible as work. Converting them needs a runtime `getComputedStyle` resolution — a different
job with a different risk profile.

### 5.2 Required properties

1. **Exact-value only.** `13px` → `var(--text-base, 13px)` *because* `--text-base: 13px`. A value with
   no exactly-matching token is **left untouched** — never rounded, never guessed.
2. **Idempotent.** Skips anything already `var(…)`; running twice is a no-op.
3. **Dry-run first.** `--dry-run` prints per-file before/after counts and every distinct replacement,
   writing nothing.
4. **Emits fallbacks.** `var(--token, <original literal>)`, so an undefined, typo'd or later-deleted
   token renders the original value rather than an invalid declaration.

### 5.3 Refusals

- anything outside a `style="…"` attribute
- anything already inside `var()`
- any rounding — an unmatched value is **reported**, not converted
- `--radius`, whose 10px value is unchanged

## 6. Verification

### 6.1 Round-trip proof (primary)

Take the **post**-conversion file, expand every `var(--token, …)` back to that token's value, assert
the result is **byte-identical** to the pre-conversion file.

Proves that across the whole diff the only difference is `var()` wrappers around identical values. Not
a sample. Deterministic, seconds, cannot flake. If the script rounded, touched the wrong property, or
mangled a quote, the round-trip is no longer byte-identical.

### 6.2 Token-resolution test (browser)

Layer 1 does not prove the tokens are **defined** — `var(--text-bse, 13px)` round-trips fine and
silently uses the fallback forever. A Playwright test reads
`getComputedStyle(document.documentElement)` and asserts every token resolves to its intended value.

### 6.3 Existing suite

`npm test` on every module commit. Necessary, but weakest here — few tests assert on styling.

### 6.4 Human spot-check

Jake looks at the first converted module. Not proof; the thing tests structurally cannot do. All three
layers prove nothing moved *unintentionally*; none would notice if `13px` was the wrong choice.

## 7. Sequencing

| # | step | cache-bust |
|---|---|---|
| 0 | **Cache-bust DIFF check** (`bugs/2026-08-22-checks-sh-cache-bust-rule-cannot-detect-a-missed-bump`) | — |
| 1 | Tokens into `main.css`, additive only | `css v9 → v10` |
| 2 | Ratchet + baseline, proven able to fail | — |
| 3 | Codemod + round-trip verifier — **dry-run only** | — |
| 4 | **Pilot: `app-core` (26)** | core v15 → v16 |
| 5 | `app-runner` (293) | runner v74 → v75 |
| 6 | `app-progress` (271) | progress v50 → v51 |
| 7 | `app-dashboard` (153) | dashboard v12 → v13 |
| 8 | `app-workouts` (111), `app-programs` (90), `app-calendar-goals` (45), `app-clients` (38) | one bump each |

`starter-content.js` is at 0 — already conformant.

**Pilot smallest, then worst-first.** An earlier draft said worst-first throughout; that put maximum
risk on run #1 when the codemod is least proven, on the screen used mid-session in a gym. `app-core`
validates the pipeline at a size reviewable in one diff, and nothing is urgent because the value is
not realised until branding.

**Step 0 is not padding.** This plan requires NINE consecutive version bumps, and on 2026-08-22 three
modules shipped their ownership guards with no cache-bust at all — caught by `/save`, not by any gate.
The existing rule asserts a `?v=` EXISTS, never that a CHANGED module's rose.

### 7.1 Per-module loop

dry-run → read report → apply → round-trip proof → cache-bust → `npm test` → commit → push.
**One commit per module**, so a revert is `git revert <sha>` with nothing to untangle.

### 7.2 Review

No ownership/RLS code is touched, so the pre-commit gate does not apply and the normal pre-push rule
holds. **Run `multi-agent-review` once on the codemod script itself, before step 4** — the script is
the risk; the modules are its output. Not per module.

### 7.3 Stopping condition

If the pilot's round-trip proof fails, or its diff contains anything that cannot be explained line by
line, **stop and rethink** — do not patch and continue.

## 8. Out of scope

- **Spacing** — 233 compound shorthands. Needs a spacing scale and per-site judgement.
- **The 60 JS-string colours** — need runtime `getComputedStyle` resolution.
- **Class extraction** — no markup changes anywhere; `style="…"` attributes stay.
- **Per-tenant branding** — decided against; one brand, static tokens.
- **A CSS framework or component library** — no build step by design.
- **Touch-target sizing** — 12 explicit `44px` against control heights of 26/36/40/48/52/64px is a
  real finding from the audit, but it is a usability decision, not a token swap. Its own piece of work.
- **FOLDING the legacy aliases** — this spec is complete when every in-scope literal is wrapped in
  `var(--token, <literal>)`, INCLUDING the `--legacy-*` ones. Collapsing `--legacy-text-11-5` into
  `--text-sm` moves pixels, so by decision 1 it cannot happen here. The aliases carry FOLD comments so
  they read as a to-do list rather than as a finished scale — that work is a separate, later, per-site
  pass and needs Jake's eyes on each screen.

## 9. Risks

| risk | mitigation |
|---|---|
| Codemod rewrites something outside CSS | scope rule limits it to `style="…"`; round-trip proof would catch it |
| A token is typo'd or later deleted | `var(--token, <literal>)` fallback renders the original value |
| An existing token's value moves | none do — `--radius-lg` keeps 14px; verified it has 2 consumers, so 12px got a new name instead |
| One of nine cache-busts is missed | step 0 builds the diff check first |
| Wide change lands half-done | one commit per module; ratchet makes each module's progress monotonic |
| Ratchet miscounts fallbacks as unconverted | strip `var(…)` before counting — verified 2026-08-22 |

## 10. Success criteria

1. `main.css` defines the type scale, the `--font` swap point, and the radius siblings.
2. `checks.sh` refuses a new style literal, **demonstrated failing** before being trusted.
3. All 1,027 in-scope literals in `js/` carry `var(--token, <literal>)`.
4. Round-trip proof byte-identical for every converted module.
5. Token-resolution test green.
6. `npm test` green on every module commit.
7. Branding is then an edit to the `:root` block.
