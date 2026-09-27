# CoachApp application-code audit (app code, not the OS)

## Context
Jake asked for the "deep operational review" prompt applied to the **application code** (`js/`, `css/`,
`index.html`, the data layer) rather than the hooks, skills and ledger machinery. This file is the audit
(sections 1–12), followed by the execution plan for what to do with it.

**Evidence labels.** **[V]** means verified in this session (file read, grep count, or raw bytes).
**[R]** means read from code but not run in a browser; it must be reproduced before anything is fixed
(per the "no speculative fixes" rule). Counts come from direct grep/wc on 2026-09-27.

**Measured baseline [V]:**

| Measure | Value |
|---|---|
| App JS | 19,242 lines, 9 classic `<script>` files, 588 top-level declarations, all in one global scope |
| Four largest modules | workouts 3,776 · runner 3,610 · progress 3,456 · programs 2,846 (75–109 functions each) |
| Full-line comments | 4,372 (23% of all lines; app-core 37%, workouts 28%). 371 of them are dated history notes |
| Raw `db.from(` calls | 318 |
| `dbq()` wrapper uses | 26 (~8%; the 2026-08-12 audit found 23 of 292, so adoption hasn't moved) |
| `.rpc(` calls | 1 (`delete_current_user`); every other multi-step write is orchestrated from the browser |
| `innerHTML =` assignments | 181 |
| Inline `onclick=` strings | 349 |
| Ownership helpers (`_verify*`) | 8, up from 1 at the August audit |
| Duplicate top-level function names | 0 |
| Spec files | 122 (architecture.md says 105) |
| Bug ledger (245 files) | 95 fixed-awaiting-jake · 54 confirmed · 47 open · 37 closed · 12 deferred |

---

## 1. Executive Summary
The app is defensively written in the small and fragile in the large. Individual functions are
unusually well guarded: ownership checks come first, rowcounts are checked, and failures are loud. The
August audit's top recommendation (ownership helpers) has been carried out. The remaining risk is
**structural**, and the per-site discipline cannot fix it:

1. **No transactions.** Assign, restart, clone, and program and phase deletes are chains of 2 to ~100
   separate browser→API writes. A dropped connection or a refused step midway leaves partial state. The
   code *detects and reports* partial state carefully, but it cannot *prevent* it.
2. **Fixes land on one path.** Sign-out has 4 call sites. Only one clears the PII runner drafts, and on
   phones that one is hidden. This is the "fix the class" failure again, now in app code.
3. **The release gate can be bypassed without a tag.** supabase-js and Chart.js load on floating major
   versions (`@2`, `@4`) from CDNs with no integrity hash. A third-party release changes production with
   no tag, no test and no review.
4. **Knowledge is stored as comments, not constraints.** 23% of lines are comments and 371 are dated
   incident stories. Memory `feedback_written_rules_dont_reduce_errors` measured that written rules don't
   prevent errors, and the same applies here: a comment is a written rule placed next to the code.

## 2. Strengths
- **Ownership-first discipline [V].** `deleteProgram` verifies ownership as its *first* statement, and
  its comment explains why placing the check second failed (`app-programs.js:1535-1543`). There are 8
  `_verify*` helpers.
- **Silent-failure hunting [V].** Rowcount checks on deletes (`app-programs.js:1590-1600`); clone
  rollback with its own rowcount check (`:525-530`); the RLS-nulled-embed detector (`:572`); 200-row cap
  handling (`app-core.js:310+`).
- **Privacy-bounded error capture [V].** `_reportClean`/`_reportCode` allow-list what gets stored, redact
  email addresses, cap volume and never recurse (`app-core.js:31-80`).
- **Double-tap guard plus a DB unique index** on assignment (`app-programs.js:437-442`).
- **No duplicate globals [V],** despite 588 names in one scope; checks.sh enforces this.
- **The no-build static stack** keeps deploys trivial and debuggable for a solo builder.

## 3. Weaknesses
| # | Weakness | Evidence |
|---|---|---|
| W1 | Multi-write flows aren't atomic | `deleteProgram` deletes slot rows (`:1586`, result unchecked), sweeps templates, *then* deletes the program. If that last step fails, the program survives but its workouts are gone. `saveAssignProgram`'s restart path removes the old assignment and clones (`:450`) *before* inserting the new one (`:453`), so an insert failure leaves the client with no plan. [V] |
| W2 | Clone is N+1 sequential | `_cloneProgramForClient` awaits 2 requests per session in a loop (`:565-576`). A 12-week × 4-session program is ~97 sequential round-trips, on gym Wi-Fi. [V code, R timing] |
| W3 | Session teardown is split and partial | Draft cleanup exists only in the sidebar button (`app-core.js:1372-1380`). Settings sign-out (`app-progress.js:3007`), the consent-gate sign-out (`app-core.js:937`) and account delete (`app-progress.js:3454`) call `db.auth.signOut()` directly. The sidebar is `display:none` at ≤900px (`main.css:812`). Global-state reset lives in `onAuthStateChange`, **inside app-progress.js** (`:1341`), not app-core. [V code; R: whether phones have another sign-out route, e.g. the More sheet] |
| W4 | Mobile "View as" pill shown to everyone | `#mobile-view-switcher` is forced to `display:flex !important` at ≤900px (`main.css:814`), and no JS ever hides the container. Only the Client and Personal buttons are toggled, so every phone user (clients included) sees a floating "PT" pill. `switchView` refuses non-master users, so this is cosmetic, not a security issue. [R — check at 390px as a client] |
| W5 | Mojibake on the login screen | `index.html` has 3 double-encoded lines. The **password placeholder** (line 37) is `â€¢â€¢…`, visible to every user on the first screen they see. [V bytes] |
| W6 | Unpinned CDN dependencies, no SRI | `index.html:148-149`. [V] |
| W7 | Error handling is bespoke at every site | 8% `dbq` adoption and 253 hand-destructured `{data,error}` sites. Raw calls that ignore `error` (`app-programs.js:1573,1576,1586`) never reach `_reportProblem`, so the owner's error card cannot see them. [V] |
| W8 | HTML built by string concatenation | 181 `innerHTML` writes plus manual `escapeHtml`. Stored XSS has recurred 8 times (critical.md). The cause is structural: every interpolation is opt-in escaping. [V counts] |
| W9 | ~~Global-name coupling~~ **REFUTED 2026-09-27** | `scripts/check-handler-targets.mjs` (with a self-test covering the rename case) already blocks onclick strings that name a missing function. The remaining residue is only the size of the global namespace. |
| W10 | Comment weight | See the baseline. Dated narratives ("Until 2026-09-02 this path DISCARDED…") duplicate git history and the bug ledger, and slow down reading the logic. |

## 4. Assumptions Audit
| Assumption | Holds? |
|---|---|
| "RLS is the security boundary; `_verify*` is defence in depth" | Correct, but only as good as the behavioural cross-tenant specs, which run outside the push gate. The client-side checks protect against *our own* bugs, not attackers. Each adds a round-trip, and they have refused legitimate users before (memory `feedback_guard_risk_is_refusing_the_legitimate_user`). |
| "Careful per-site code substitutes for transactions" | **False under network failure.** Detection ≠ prevention (W1). |
| "Master doesn't deploy; releases are gated" | **Partly false:** CDN floats move production (W6). |
| "A comment next to the hazard prevents recurrence" | Contradicted by the project's own measurement (9 of 12 errors had a pre-existing rule). |
| "E2E against the live DB is enough testing" | Pure logic (periodization %, unit conversion, PR detection) only gets tested through a browser, single-worker. That is slow, so the push gate is narrow, so regressions ship. |
| "One user today, so scale can wait" | Reasonable for roster UX (memory `project_no_clients_yet`). Not reasonable for atomicity: partial state accrues from day one and is permanent. |
| "`fixed-awaiting-jake` ≈ fixed" | 95 of 245 ledger rows (39%) are unconfirmed. The app's real defect state is unknown for those. |

## 5. Contradictions and Conflicts
- architecture.md: 105 specs and 17,599 lines vs 122 and 19,242 actual. It is stale 12 days after migration, despite the "update in the same commit" convention.
- CLAUDE.md "the gate is at the release" vs floating CDN versions.
- `OWNER_EMAIL` (`app-core.js:28`): its own comment criticises "copies of a personal email in the source of a public site" while keeping one. Acceptable as a UI-only gate, but the stated rationale argues against itself.
- The sign-out PII fix (2026-07-10) was written for "shared/gym devices", which are phones, yet it is wired only to the desktop-only button.
- The `dbq()` convention exists but is used at 8%. A convention nobody follows is a false signal to the next reader.

## 6. Failure Modes
| Trigger | Result |
|---|---|
| Wi-Fi drops mid-assign (~97 sequential writes) | `client_programs` row plus some sessions. The toast says "do not rely", but the state persists. |
| Restart assignment, insert then fails | The old plan is deleted and there is no new plan. The client's programme is gone. |
| Program delete: final row delete refused or fails | Program shell with its slot rows and templates already deleted. |
| Coach signs out on a gym phone via Settings | Previous client's in-progress workout (name, weights) stays in localStorage. [R] |
| supabase-js ships a breaking 2.x minor | Every user is broken; no release was cut, so rollback isn't a tag revert. |
| A CDN is compromised | Arbitrary JS runs with the user's Supabase session (no SRI). |
| A function renamed, one onclick string missed | Dead button, found only by a user click. [R] |
| New render adds an unescaped `${x}` | Stored XSS #9. |

## 7. Complexity Review
- **Necessary complexity:** multi-tenancy (coach, client, solo with NULL `coach_id`), propagation of
  template edits to clones, and 1RM-driven periodization. These are genuine domain complexity.
- **Accidental complexity:**
  - Browser-orchestrated cascades that Postgres does natively (FK cascade and transactions).
  - Three copies of the leave-guard choice handling (technical-debt.md).
  - Four sign-out paths.
  - The auth listener living in the progress module.
  - Two propagation regimes (content edits prompt; week-structure edits don't).
  - History-narrative comments.
- **Simplify by moving work down a layer** (into the DB) rather than adding more guards in the browser.
  Each new client-side guard adds a round-trip and a new place to forget.

## 8. Scalability Review
- **Data volume:** the 200-row cap is solved with a helper, and rule 9n pins unbounded reads. The roster reads are still unpaged (deferred; OK while there are 0 clients).
- **Write latency:** clone cost grows with sessions per program (W2). This is the first thing a real coach with long programs will feel.
- **Code scale:** four ~3.5k-line files in one global namespace. Each new feature raises the collision and coupling surface. The single-worker E2E suite already makes a full run expensive (122 specs), which is why the gate is 2 specs.
- **People scale:** a second contributor or reviewer would struggle. There are no module boundaries, and the invariants live in prose comments rather than code.

## 9. Risk Register
| ID | Risk | Likelihood | Impact | Priority |
|---|---|---|---|---|
| R1 | Partial or lost programme state from non-atomic assign, restart and delete (W1/W2) | Med (gym networks) | High (client's plan is wrong or gone; permanent) | **P1** |
| R2 | Floating CDN dependency breaks or compromises prod (W6) | Low–Med | High | **P1** |
| R3 | PII drafts survive mobile sign-out (W3) | Med | Med (privacy-policy exposure) | **P1** (after repro) |
| R4 | Stored XSS recurrence (W8) | Med (8 so far) | High | **P2** |
| R5 | Invisible failures from raw calls that ignore `error` (W7) | High | Med | **P2** |
| R6 | Login mojibake / mobile PT pill (W4/W5) | Certain / likely | Low (trust and polish; beta testers see it first) | **P2** (cheap) |
| R7 | Unknown true defect state (95 unconfirmed fixes) | — | Med | **P3** (process) |
| R8 | Global-namespace and onclick coupling (W9) | Med | Low–Med | **P3** |
| R9 | Comment weight slows every change (W10) | Ongoing | Low | **P3** |

## 10. Prioritised Recommendations
| # | Action | Measure of done |
|---|---|---|
| 1 | Move **assign + clone**, **restart**, **deleteProgram**, **deletePhaseWeek** into Postgres functions (`security invoker`, so RLS still applies), each one transaction; the browser makes 1 RPC call. Run through the sql-safety skill. | 0 browser-orchestrated multi-write flows for these 4. A fault-injection spec (none exists today) aborts mid-flow and asserts no partial rows. Assign latency ~97 round-trips → 1. |
| 2 | Pin exact versions and add `integrity` + `crossorigin` (or vendor both libraries into `vendor/`, which needs no build step). Add a checks.sh rule refusing an unpinned or un-hashed external script. | Rule proven to fail on a fixture (per memory `feedback_reports_success_doing_nothing`). |
| 3 | One teardown function in app-core, called from `onAuthStateChange('SIGNED_OUT')`. Move the listener from app-progress to app-core; all 4 sign-out paths become plain `signOut()`. | Spec: at 390px, sign out via Settings, and `_runnerDraft_*` keys are gone (red before, green after). |
| 4 | An auto-escaping `html` tagged template in app-core, where raw HTML requires an explicit `raw()`. New renders must use it; migrate XSS-history hotspots first. Ratchet the count of `innerHTML` writes that don't go through it. | Ratchet count decreases monotonically; no new XSS row in critical.md. |
| 5 | Decide on `dbq`: either make it mandatory with a count-ratchet on raw `db.from`, or delete the convention. Minimum: no write whose `error` is ignored (checks.sh rule). | Ignored-error write count = 0. |
| 6 | Fix the login-placeholder mojibake and the 2 comment lines. Hide `#mobile-view-switcher` unless master (JS toggles the container, CSS default stays hidden). | Visual check at 390px as client and as master. |
| 7 | Comment diet: when touching a function, replace dated narratives with a one-line invariant plus a bug-file id. No big-bang rewrite. | Ratchet the dated-comment count (371) downward. |
| 8 | Refresh the architecture.md counts (19,242 lines / 122 specs) and add them to an os-lint staleness check, or stop quoting exact counts. | — |
| 9 | Confirmation sweep of the 95 `fixed-awaiting-jake` rows: batch the ones a red→green test can close; Jake eyeballs the rest in one session. | That bucket < 30. |

## 11. Top Three Improvements
1. **Transactional RPCs for the programme lifecycle** (rec 1). Removes the largest class of permanent data damage and the worst latency in one move.
2. **Close the release-gate bypass** (rec 2). This is currently the one way prod changes with no tag, test or review.
3. **Centralised session teardown** (rec 3). Small, testable, and it makes an existing privacy fix actually work on the devices it was written for.

## 12. Revised Design (target shape; incremental, still no build step)
```
Browser (vanilla JS, classic scripts for now)
  app-core: auth lifecycle (the ONLY onAuthStateChange + teardown), db client,
            dbq (mandatory for writes), html`` auto-escape, mountModal, leave-guard helper (1 copy)
  feature modules: render + event wiring only; call dbq(...) or db.rpc(...)
Postgres (Supabase)
  RLS = the security boundary (unchanged, behaviourally tested)
  Integrity in the DB: FK cascades, guard triggers (like the clients.coach_id trigger shipped in v2026.09.8),
  and transactional RPCs for every flow that writes > 1 table:
    assign_program(client_id, program_id, start_date, restart bool)
    delete_program(program_id) · delete_phase_week(phase_id, week) · save_template(...)
  Client-side _verify* kept only where it improves the UX message; not relied on for integrity.
Assets: pinned + SRI (or vendored) third-party libs.
Checks: pinned-script rule · ignored-error-write rule · innerHTML ratchet · dated-comment ratchet.
```
Deferred on purpose: ES-module conversion and splitting the four large files. These are high-churn with
low immediate payoff, and should be revisited if a second contributor joins.

---

## Step 1 results (2026-09-27)
- **W3 CONFIRMED** by a Playwright probe at 390px: sidebar sign-out hidden; a draft survives Settings sign-out.
- **W4 CONFIRMED:** a client sees the "PT" pill (screenshot).
- **W9 REFUTED** (see the W9 row).
- **Incidental:** the goal card shows "In -35 days".
- Filed in `docs/bugs/2026-09-27-*` (4 files).
- Step 2 is **on hold**: another session has uncommitted changes in the tree (hooks, skills, CLAUDE.md, checks.sh, docs).

## Execution plan (if approved)
1. **Reproduce the [R] findings first; no fixes yet:**
   - W3: sign out via Settings at 390px, then inspect localStorage.
   - W4: log in as a client at 390px; is the PT pill visible?
   - W9: does checks.sh validate onclick targets?

   File each confirmed finding as a `docs/bugs/` file (intake rule).
2. **Quick, low-risk batch (recs 2, 3, 6)**, each with a red→green spec:
   - Files: `index.html`, `app-core.js`, `app-progress.js`, `css/main.css`, `scripts/checks.sh`.
   - Bump `?v=` on the modules that change.
   - Run `multi-agent-review` before the commit, since rec 3 touches auth/session.
3. **RPC migration (rec 1)** as its own release:
   - sql-safety skill first; Jake applies the SQL, with the query pasted inline.
   - Write the fault-injection spec first (it should be RED against the current code).
   - Swap the callers in `app-programs.js` (`saveAssignProgram`, `saveAssignProgramToClient`, `_cloneProgramForClient`, `deleteProgram`, `deletePhaseWeek`).
   - Run the full `npm test`.
4. **Structural ratchets (recs 4, 5, 7)** in later cycles, each proven able to fail on a fixture.
5. **Docs:** refresh architecture.md counts; add a decisions.md entry for "multi-table writes go through RPCs".

## Verification
- Every fix: a spec that is red before and green after; the full `npm test` before the push (the push gate is only 2 specs).
- RPCs: the fault-injection spec plus the existing assign/clone/delete specs; a cross-tenant probe calling each RPC with another coach's ids must be refused.
- CDN rule: a checks.sh self-test fixture containing an unpinned `<script src>` must fail.
- UI: `mobile-check` skill at 390×844 as a client, a coach and the master account.
