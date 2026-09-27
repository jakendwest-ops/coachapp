---
id: 2026-08-19-ctx-backlabel-and-clientname-rendered-raw
status: closed
priority: high
reported: 2026-08-19
status_detail: "CLOSED 2026-09-27 via closure rule (b): tests/template-back-label-escaping-2026-09-27.spec.js renders the real template Back button with a hostile client-name label and asserts no element is created. Proven that day: green on current code, RED with escapeHtml removed from _ctx.backLabel, green after a byte-identical restore. The escaping checker could NOT see this sink (continuation-line blind spot, filed as 2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line); .backLabel/.clientName were added to its FREE_TEXT with self-test cases."
---

# `_ctx.backLabel` and `_ctx.clientName` were rendered RAW — a live stored-XSS sink

Found 2026-08-19 while closing the escapeAttr class, by following the one value the checker could not
analyse (`const clientName = escapeAttr(...)`, app-programs.js:41).

`js/app-workouts.js:1205` rendered `${_ctx.backLabel}` and `:1207` rendered `${_ctx.clientName}` with
**no escaper at all**, into `innerHTML`.

## I was wrong about the mechanism first, and the truth is worse

My first read was that `escapeAttr` at the source left visible backslashes in the rendered text.
**Empirically false** — I tested it in the browser rather than reasoning further:

```
original: O'Brien <img src=x onerror=alert(1)>
runtime:  O'Brien <img src=x onerror=alert(1)>      roundTripsClean: true
```

`escapeAttr` round-trips CLEANLY through an onclick JS-string literal: the browser un-escapes the
attribute, JS un-escapes the string literal, and the runtime value is the ORIGINAL. So the source call
is correct — and the value arriving at the render site is raw attacker-controlled text.

The same probe confirmed the consequence: rendering that runtime value as text created a real element.

```
rawTextRenderCreatesElement: true
```

A client whose `full_name` is `<img src=x onerror=…>` therefore executes **in the coach's browser, with
the coach's own Supabase session**. RLS cannot defend against a stolen JWT.

## Why no checker caught it

`FREE_TEXT` matches `\.name\b`, and the property here is `.clientName` — `\.name` does not match
`.clientName`. `backLabel` is in no list at all. Both are ctx properties carrying free text, which is
the shape the rule was built for and the naming is what hid them.

## Fixed

`escapeHtml` at both sites. The source `escapeAttr` calls are left alone — they are correct for the
handler literal, and changing them would break the round trip.

CRITICAL.md documents four prior instances of this client→coach pattern (2026-07-13, -18, -23, -28) and
notes it has never once been caught by a systematic sweep. This is the fifth, and it was again found
incidentally — while fixing something else.

**Closes when:** Jake confirms, or a red→green test asserts both sites escape. A test exists for the
checker's two shapes; these two specific sinks are covered only by the class-wide checker run.
