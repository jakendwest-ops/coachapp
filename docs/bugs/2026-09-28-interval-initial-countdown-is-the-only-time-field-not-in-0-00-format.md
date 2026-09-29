---
id: 2026-09-28-interval-initial-countdown-is-the-only-time-field-not-in-0-00-format
status: closed
priority: low
reported: 2026-09-28
closed_by: tests/intervals-redesign-2026-07-25.spec.js
status_detail: "CLOSED 2026-09-28 on rule-(b) evidence, this row's own stated closing condition. Reported by Jake (item 2 of a second 2026-09-28 walkthrough note): 'format needs to be 0:00'. The new spec 'Initial countdown is a text field formatted 0:00, like Warm-up' went RED on the old code (type=\"number\", not \"text\") and GREEN after the fix; reviewed (fmtRestCountdown traced as pure-arithmetic-safe for any input, round-trip confirmed for an existing stored value) with no blocking findings. Uncommitted-to-a-release until it ships."
---

# Interval editor: "Initial countdown" is a number of seconds; every other time field is 0:00

## What Jake saw

In the interval block editor the row "Initial countdown" shows `10`, while the field under it shows `1:00`. His words: "format needs to be 0:00".

## Where

`js/app-workouts.js:1908` builds it as `type="number"` with the raw seconds; the save at `:1704` reads it with `num('ts-countdown-0')`.
Its siblings, Warm-up, Work and Rest (`:1909`, `:1918`, `:1921`), are `type="text" placeholder="0:00"` with
`oninput="this.value=fmtRestInput(this.value)"` and a value shown through `fmtRestCountdown(secs)`.

## Resolution (2026-09-28)

Built exactly as proposed: `js/app-workouts.js:1908` is now `type="text" placeholder="0:00"` with `fmtRestInput` on input and
`fmtRestCountdown(s.countdownSecs||0)` for display; `:1704`'s save now reads it with `mmss()` (the same `parseRest`-backed
helper Warm-up's save uses), not `num()`. `countdownSecs` stays stored in seconds — no migration; an existing stored `10`
now displays as `0:10`.

**Reviewed finding, accepted as-is:** the XSS-hardening test for this field's own value attribute previously relied on
`type="number"`'s browser-level coercion (a hostile string reads back as `""`). Now `type="text"`, so a hostile string
instead flows through `fmtRestCountdown`'s arithmetic and renders as the harmless literal text `"NaN:NaN"` — never the
payload, never live markup (traced: `fmtRestCountdown` forces `ToNumber` on its input via `/` and `%`, and no numeric
`toString()` output can contain `< > " ' =`). Matches the Warm-up field's own pre-existing behaviour on the same class of
input; not a new or weaker pattern, and not fixed further since it isn't reachable through real typing.
