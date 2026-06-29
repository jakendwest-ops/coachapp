# Graph Report - coachapp  (2026-06-29)

## Corpus Check
- 26 files · ~49,625 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 390 nodes · 607 edges · 34 communities (28 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dfe7aa4a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `Standing session behaviours (active all session, not just at start)` - 27 edges
2. `closeModal()` - 23 edges
3. `Session start ritual` - 13 edges
4. `renderRunner()` - 11 edges
5. `Pre-deploy checklist` - 11 edges
6. `End-of-session save` - 11 edges
7. `navigate()` - 10 edges
8. `dbq()` - 9 edges
9. `switchTab()` - 9 edges
10. `CoachApp Security Audit` - 9 edges

## Surprising Connections (you probably didn't know these)
- `saveAssignProgramToClient()` --calls--> `showToast()`  [EXTRACTED]
  js/app.js → js/app.js  _Bridges community 2 → community 19_
- `loadUserInfo()` --calls--> `dbq()`  [EXTRACTED]
  js/app.js → js/app.js  _Bridges community 2 → community 9_
- `removePhaseWorkout()` --calls--> `dbq()`  [EXTRACTED]
  js/app.js → js/app.js  _Bridges community 2 → community 17_
- `showRunnerFinish()` --calls--> `dbq()`  [EXTRACTED]
  js/app.js → js/app.js  _Bridges community 2 → community 4_
- `renderClientDashboard()` --calls--> `escapeHtml()`  [EXTRACTED]
  js/app.js → js/app.js  _Bridges community 18 → community 20_

## Import Cycles
- None detected.

## Communities (34 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (7): db, EVENT_COLOURS, log, _NAV_ICONS, _NAV_ITEMS, PERF_CATEGORIES, PERF_COLOURS

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (29): _applyToAllSessions(), backToGoals(), _checkClientPlanPropagation(), closeModal(), copyPrevTemplateSet(), deleteExercise(), deleteGoal(), deleteTemplateExercise() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (29): backToClientWorkouts(), clientOverviewTab(), confirmEndRunner(), dbq(), delete1RM(), deletePerfLog(), deleteWeightLog(), deleteWorkoutLog() (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (27): After any UI change → mobile-check, After any UI or behaviour change → regression sweep, After building any new feature → add smoke tests in the same commit, After every end-to-end test → post-build-review, After every test session → check Supabase API logs, Always repost code in full when correcting, At session end → /save, Before any beta invite or significant deploy → /deploy-check (+19 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (27): addExtraCardioSet(), addExtraStrengthSet(), clearTimer(), fmtRestCountdown(), fmtRunnerTime(), launchRunner(), logRunnerSet(), parseRest() (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (16): { loginAsPT, loginAsClient }, { test, expect }, { loginAsClient }, { test, expect }, { test: base, expect }, loginAs(), loginAsClient(), loginAsPT() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (15): description, devDependencies, dotenv, @playwright/test, @supabase/supabase-js, license, name, repository (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (13): Cache-busting, Check for JS errors, Click a button, Fill a form field, Gotchas, Hosting, Interact with the running app, Prerequisites (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (12): If work goes in circles or a fix fails twice, Session start ritual, Step 1 — Start the preview server, Step 2 — Read the Vault, Step 3 — Summarise last session, Step 4 — Automated code review, Step 5 — Roadmap cross-check, Step 6 — Propose this session's plan (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (13): applyRoleUI(), deleteProgram(), deleteTemplate(), exitSudo(), _loadBranding(), loadUserInfo(), navigate(), renderNav() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (13): calNav(), deleteEvent(), _getCurrentClientId(), renderCalendar(), renderEventList(), renderPerformance(), renderProgress(), renderProgressCardio() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (11): 1. Cache bust, 2. Code review, 3. Playwright suite, 4. Supabase redirect URLs, 5. RLS — no open policies, 5b. Storage buckets — all private, 5c. GDPR features — present and wired, 6. Live smoke test — client login (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (11): 1. Container visibility, 2. Dual-surface rule, 3. Tap targets, 4. Modal class, 5. Input fields, 6. Viewport verification — always run this, 7. Bottom nav item count, Checklist — run every item, in order (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (11): End-of-session save, Step 10 — Confirm to Jake, Step 1 — Establish what was done this session, Step 2 — Cache bust check, Step 3 — Update STATUS.md, Step 4 — Write a LOG entry, Step 5 — Update memory and skills, Step 6 — Surface open to-dos for Jake (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (10): Console errors found, Failures — root cause, Key files, Result: X/26 passed, Run Playwright tests, Step 1 — Ensure the local server is running, Step 2 — Run the suite, Step 3 — Report results (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (9): 1. Storage buckets — all private, 2. No open RLS policies, 3. PII in console logs, 4. GDPR features present, 5. New tables since last audit — RLS check, 6. `delete_current_user()` covers all tables, 7. Signed URLs — no getPublicUrl calls, CoachApp Security Audit (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (6): Before any DELETE or UPDATE script, Before writing any RLS policy, CoachApp-specific notes, CoachApp SQL Safety Skill, Silent failure audit checklist (app.js), When adding a new role or account type

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (7): closeProgramModal(), deletePhase(), loadAllPhaseWorkouts(), openProgram(), removePhaseWorkout(), savePhase(), saveProgram()

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (6): _applyBrandingToSidebar(), escapeHtml(), openSessionDetail(), removeBrandingLogo(), renderDashboard(), renderSettings()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (6): _cloneProgramForClient(), renderClientPrograms(), saveAssignProgram(), saveAssignProgramToClient(), saveEditStartDate(), unassignProgram()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (6): renderClientDashboard(), saveClientCheckIn(), saveClientPB(), saveClientWeight(), saveGoalProgress(), toggleClientMilestone()

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (4): renderClientWorkoutsPage(), renderWorkouts(), renderWorkoutTemplates(), switchWorkoutTab()

### Community 22 - "Community 22"
Cohesion: 0.83
Nodes (3): fail(), checks.sh script, warn()

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (3): { createClient }, run(), signUpOrSignIn()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): calcPace1000(), fmtRestInput(), tsPace500Input()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (3): deleteProgressPhoto(), renderClientPhotos(), uploadProgressPhoto()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (3): fmtDuration(), fmtSet(), normalizeDuration()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (3): showAddEventModal(), showClientDayDetail(), showDayEvents()

## Knowledge Gaps
- **133 isolated node(s):** `log`, `db`, `_NAV_ICONS`, `_NAV_ITEMS`, `EVENT_COLOURS` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Standing session behaviours (active all session, not just at start)` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Session start ritual` connect `Community 8` to `Community 3`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `closeModal()` connect `Community 1` to `Community 0`, `Community 32`, `Community 2`, `Community 9`, `Community 10`, `Community 19`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `log`, `db`, `_NAV_ICONS` to the rest of the system?**
  _133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10098522167487685 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._