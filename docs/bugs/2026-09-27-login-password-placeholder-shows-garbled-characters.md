---
id: 2026-09-27-login-password-placeholder-shows-garbled-characters
status: closed
priority: low
reported: 2026-09-27
status_detail: "CLOSED 2026-09-27 by rule (b): tests/app-audit-quickfixes-2026-09-27.spec.js 'the login password placeholder is not double-encoded' went RED before the fix (received 'â€¢â€¢…') and GREEN after. Live once the next release is cut."
---

# The login screen's password placeholder showed garbled characters

**Plain English.** The password box on the sign-in screen should show dots as a hint. The file stored those dots
double-encoded, so the box showed `â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢` instead, on the first screen every beta tester sees.

## Evidence

- `index.html` was the only app file containing double-encoded UTF-8: 3 lines (the placeholder plus two HTML comments);
  0 in js/ and css/.

## Fix

The three lines were rewritten with the real characters (`•`, `═`); nothing else in the file changed (BOM and line
endings preserved, confirmed in review).
