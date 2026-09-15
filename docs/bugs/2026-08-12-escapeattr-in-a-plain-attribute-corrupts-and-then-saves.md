---
id: 2026-08-12-escapeattr-in-a-plain-attribute-corrupts-and-then-saves
status: fixed-awaiting-jake
priority: high
reported: 2026-08-12
---

# escapeAttr in a plain attribute corrupted the value — and it was being SAVED

Introduced by my own escaping sweep on 2026-08-12 and caught by the pre-push review before it
shipped. Recorded because the near-miss is the lesson, not the fix.

`escapeAttr` (`app-core.js:251`) is for a user string inside a **JS string literal** in an attribute —
`onclick="fn('${escapeAttr(x)}')"`. Its own docstring says so. It backslash-escapes `\ ' \n \r`
BEFORE html-escaping. In a plain `value=""` that backslash is not protection, it is corruption:

    stored full_name : O'Brien
    rendered         : value="O\&#39;Brien"
    input.value      : O\'Brien        <- browser decodes the entity, backslash survives
    saveSettingsProfile writes THAT to profiles.full_name

And it compounds, because the corrupted value is escaped again next time:
`O'Brien -> O\'Brien -> O\\\'Brien -> O\\\\\\\'Brien`. Every Settings visit ending in Save
adds backslashes, and the name then renders that way in the sidebar, dashboard and calendar.

`escapeHtml` is correct for a plain attribute — the parser delimits the attribute value BEFORE entity
decoding, so `&quot;`/`&#39;` are inert and cannot inject an attribute. `app-clients.js:442` had done
exactly this on the same field all along, so my commit briefly made one field behave two different
ways in two forms.

**Root cause of the mistake:** I generalised from the `jsArg` trap — which is real, but specific to
JS-string-in-attribute — into a rule that does not hold, and wrote that wrong rule confidently into
the spec's own comments.

Fixed `9d0003b` at all 3 sites, with a test whose payload contains an apostrophe (the first version's
payload did not, so `escapeAttr`'s backslash pass never fired and it PASSED against broken code).

**Closes when:** Jake saves his name in Settings with an apostrophe in it and it round-trips.
