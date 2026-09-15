# Design-system scope — what branding will land on (2026-08-22)

Jake: *"we also need to scope the platform for consistency in regards to font, font size, field size
etc, as soon we will need to think about branding."*

Everything below is measured from the current tree, not estimated. Commands are in the appendix so
the numbers can be re-run rather than trusted.

## The headline

**Branding is a token swap — but only if there are tokens to swap.** Colour already has them and is
82% adopted. Typography and spacing have **none**. So a brand pass today would mean hand-editing
hundreds of inline declarations, and the result would drift again within weeks.

The work is not "make it pretty". It is *give the platform a vocabulary*, so that branding later is a
change to ~20 values instead of ~1,300 sites.

## What is already GOOD — do not touch it

- **Font family is consistent.** Exactly ONE declaration in the entire codebase:
  `'Inter', system-ui, -apple-system, sans-serif`. Nothing to fix.
- **Colour is largely tokenised.** 801 `var(--token)` uses against 176 hardcoded hex in `js/`. 28
  tokens exist (`--accent`, `--danger`, `--surface`, `--text-muted`, …).
- **Form fields are mostly disciplined.** Of 142 `<input>` tags, **97 use `.field-input`** and only
  16 carry an inline `style`. A `.field` / `.field-label` / `.field-input` / `.field-hint` system
  already exists in `main.css` and mostly works.

That last point matters: "field size" is the healthiest part of the platform, not the worst.

## What is genuinely drifting

### 1. Typography has no scale at all — the clearest gap
**25 distinct font sizes** are in use:

```
7 8 9 10 10.5 11 11.5 12 12.5 13 13.5 14 15 16 17 18 19 20 22 24 26 30 32 40 64
```

The half-pixel values (`10.5`, `11.5`, `12.5`, `13.5`) are the tell: those are not design decisions,
they are someone nudging one label until it fit. Three sizes carry most of the app — 13px (172 uses),
12px (145), 11px (140) — so a scale of about **8 steps** would cover everything with room to spare.

`main.css` defines **zero** typography or spacing tokens. Every size is a literal.

### 2. Inline styles outnumber classes
**1,317 `style="…"` against 1,176 `class="…"`** across `js/`. Concentrated, not uniform:

| module | inline | class | ratio |
|---|---|---|---|
| app-runner | 327 | 79 | **4.1 : 1** |
| app-progress | 316 | 183 | 1.7 : 1 |
| app-dashboard | 195 | 113 | 1.7 : 1 |
| app-workouts | 177 | 263 | 0.7 : 1 |
| app-programs | 143 | 183 | 0.8 : 1 |
| app-calendar-goals | 103 | 204 | 0.5 : 1 |
| app-clients | 37 | 113 | 0.3 : 1 |

`app-runner` is the outlier by a distance, and it is also the screen used in a gym on a phone.

### 3. Radius drifts DESPITE having tokens
`--radius` and `--radius-lg` exist, and yet **18 distinct literal values** are in use: 2, 3, 4, 5, 6,
7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 99, 100, 999px. A `7px` radius is not a decision anyone made
twice, and `99px` / `100px` / `999px` are three spellings of "fully round".

> **Corrected 2026-08-22.** This first said **8** distinct values. That number came from a command
> ending in `head -8` — a truncation reported as a total. Caught when the claim-check hook forced the
> figure to be re-counted. The drift is worse than first reported, which strengthens rather than
> weakens the case below.

This is the useful proof that *adding tokens is not enough on its own* — colour has tokens and still
has a 176-site tail.

### 4. Stray colours mostly RE-HARDCODE existing tokens
The top offenders are not exotic: `#ef4444` (46 uses) is `--danger`, `#f59e0b` (15) is `--warning`,
`#22c55e` (14) is `--success`. These are mechanical replacements, not design decisions.

### 5. Touch targets are barely specified
**12 explicit `44px`** across the whole codebase, against measured control heights of 26, 36, 40, 48,
52, 64px. For an app whose primary use is logging sets on a phone mid-session, tap-target size is a
usability property, not an aesthetic one — and it is currently accidental.

## What this means for branding

A brand pass needs to change: brand colour, accent, typeface, type scale, corner treatment, and
control density. Today only the **first two** are a token edit. The rest is a find-and-replace across
1,300 inline declarations, which is exactly the kind of change that half-lands and then rots.

## Proposed staging — cheapest and highest-leverage first

**Stage 1 — Define the vocabulary (small, no visual change).** Add type, space and control tokens to
`main.css` alongside the existing colour ones. Map the 25 font sizes onto ~8 steps and write down
which existing value maps to which step. **Nothing changes visually**; this is purely additive and
therefore near-zero risk.

**Stage 2 — Ratchet it (small).** A `checks.sh` rule that fails on a NEW hardcoded `font-size` /
`border-radius` outside the scale in `js/`. Following the falsy-zero precedent: grandfather the
existing sites, so the rule can only ever fire on a regression, and prove it can fail before trusting
it. Without this, stage 3 rots back — the radius tokens are the evidence.

**Stage 3 — Convert, module by module, worst first.** `app-runner` (4.1:1) then `app-progress`, then
`app-dashboard`. Each module is its own commit with a cache-bust and its own visual check. **Not one
big-bang restyle** — this codebase's own history says a wide change lands half-done.

**Stage 4 — Only then, brand.** Once the vocabulary exists, branding is editing the token block.

**Deliberately NOT proposed:** a CSS framework, a component library, or a rewrite of the inline-style
approach. The app has no build step by design, and 1,176 class uses show the class system already
works where it is used.

## Open questions for Jake — these are design calls, not technical ones

1. **Is Inter the brand typeface, or a placeholder?** Stage 1 is cheap either way, but if a real
   typeface is coming, the type scale should be defined against *its* metrics.
2. **How dense should the runner be?** It is the outlier on inline styles because it is genuinely
   information-dense. That may be correct for a gym screen — worth deciding deliberately rather than
   discovering after a restyle.
3. **Is there an existing brand direction** (colours, logo, feel) to design the token values against,
   or does the token layer get neutral values now and brand values later?

## Appendix — how to re-run every number

```bash
# token count
grep -oE '^\s*--[a-z-]+:' css/main.css | sort -u | wc -l
# inline vs class
grep -ohE 'style="' js/*.js | wc -l ; grep -ohE 'class="' js/*.js | wc -l
# distinct font sizes
grep -ohE 'font-size:\s*[0-9.]+px' js/*.js css/main.css | sed 's/.*:\s*//;s/px//' | sort -n -u
# radius drift -- note the sed: without normalising whitespace, "border-radius: 8px" and
# "border-radius:8px" count as different values. And NO `head`: truncating this listing is
# exactly how this document first reported 8 distinct values instead of 18.
grep -ohE 'border-radius:\s*[0-9]+px' js/*.js css/main.css | sed -E 's/border-radius:\s*//' | sort -u
# input discipline
grep -ohE '<input[^>]*class="[^"]*field-input' js/*.js | wc -l ; grep -ohE '<input' js/*.js | wc -l
# stray colour
grep -ohE '#[0-9a-fA-F]{3,8}\b' js/*.js | sort | uniq -c | sort -rn
```
