---
id: 2026-09-28-interval-initial-countdown-is-the-only-time-field-not-in-0-00-format
status: open
priority: low
reported: 2026-09-28
status_detail: "Reported by Jake (item 2 of a second 2026-09-28 walkthrough note): 'format needs to be 0:00'. Confirmed by reading: it is the one time field in the interval editor still built as a plain number box. Not yet fixed."
---

# Interval editor: "Initial countdown" is a number of seconds; every other time field is 0:00

## What Jake saw

In the interval block editor the row "Initial countdown" shows `10`, while the field under it shows `1:00`. His words: "format needs to be 0:00".

## Where

`js/app-workouts.js:1908` builds it as `type="number"` with the raw seconds; the save at `:1704` reads it with `num('ts-countdown-0')`.
Its siblings, Warm-up, Work and Rest (`:1909`, `:1918`, `:1921`), are `type="text" placeholder="0:00"` with
`oninput="this.value=fmtRestInput(this.value)"` and a value shown through `fmtRestCountdown(secs)`.

## Proposed fix (not applied)

Build the countdown exactly like Warm-up: text field, `0:00` placeholder, `fmtRestInput` on input, value shown through
`fmtRestCountdown`, and on save read it with the same parser Warm-up's save uses so `countdownSecs` stays stored in seconds
(no data migration: existing `10` displays as `0:10`).

**Closes when** the field shows `0:10` for a stored 10, accepts `0:30`, and saves 30 seconds — proved by a spec that round-trips it.
