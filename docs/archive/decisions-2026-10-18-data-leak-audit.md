# Decision entry, archived verbatim: 2026-10-18, the data-leak and PII audit

Moved out of `docs/decisions.md` on 2026-10-25 to keep the docs under their size budget. The text below is the entry exactly as it stood.

---

**2026-10-18 — The data-leak and PII audit, and five push gates.** Jake: "tighten the whole codebase so prevent any data leaks or PII leaks"; plan approved first. *Measured:* a signed-out caller reads 0 rows on all 25 queried tables; no service-role key in any commit; 0 PII in 366 log calls; CDN scripts pinned with integrity hashes.
*Weak:* the gates were narrower than the code (query scoping covered 3 of 25 tables; the PII-log gate read one line per call and had no self-test) and a script published test-account passwords.
*Decided:* each gate is calibrated on the real tree, pinned AT the measurement, and `scripts/mutate-gates.mjs` removes each listed safeguard from a copy and requires its self-test to fail (129 of 129): `check-secrets` (9u), `check-sql-definer` (9v), `check-external-surface` (9w), `check-pii-logs` (9a, widened), `check-query-scope` (2, 21 tables; an unanchored read needs a stated `SCOPE-OK`, capped at 1).
It found two unanchored reads, fixed with live specs: the coach's "Goals due soon" (a join) and the Personal calendar's `events`. Google Fonts is TEMPORARY on the allowlist; `invite-client` is a dated KNOWN_MISSING. *Not chosen:* a CSP first.
