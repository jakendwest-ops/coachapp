---
id: 2026-11-08-close-buttons-are-an-x-instead-of-the-word-close
status: open
priority: low
reported: 2026-11-08
status_detail: "open - REPORTED by Jake 2026-11-08 in the training plan page mock-up (note on the opened day): 'x needs to be replaced with Close. We also need to consider this logic for all UI across the app'. A grep the same day counted 52 ✕/× glyphs across 7 modules in js/ (not all are close buttons; some are remove buttons or multiplication signs). The plan page build changes that page's own; the rest are not yet done."
closing_conditions: "Every close control in the app reads 'Close' (or is named in this file as a deliberate exception), and Jake confirms it on his phone."
---

# Close buttons are a ✕ instead of the word "Close"

Jake wants the word, everywhere, not the symbol.

Closes when Jake confirms the change on his phone (see closing_conditions above); a commit message alone never closes it.
