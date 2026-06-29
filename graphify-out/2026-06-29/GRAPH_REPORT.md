# Graph Report - .  (2026-06-29)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 298 nodes · 545 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee4d4a0c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_App Core & UI Utilities|App Core & UI Utilities]]
- [[_COMMUNITY_Database Queries & Modals|Database Queries & Modals]]
- [[_COMMUNITY_Workout Runner & Timers|Workout Runner & Timers]]
- [[_COMMUNITY_Goals & Template Management|Goals & Template Management]]
- [[_COMMUNITY_E2E Test Helpers & Fixtures|E2E Test Helpers & Fixtures]]
- [[_COMMUNITY_Project Skills & Docs|Project Skills & Docs]]
- [[_COMMUNITY_Package Configuration|Package Configuration]]
- [[_COMMUNITY_Calendar & Client Progress|Calendar & Client Progress]]
- [[_COMMUNITY_Navigation & Role UI|Navigation & Role UI]]
- [[_COMMUNITY_Branding & Settings|Branding & Settings]]
- [[_COMMUNITY_Client Overview & Editing|Client Overview & Editing]]
- [[_COMMUNITY_Program Assignment|Program Assignment]]
- [[_COMMUNITY_Template Set Management|Template Set Management]]
- [[_COMMUNITY_Client Dashboard & Check-ins|Client Dashboard & Check-ins]]
- [[_COMMUNITY_Exercise & Template Loading|Exercise & Template Loading]]
- [[_COMMUNITY_Client Workouts Pages|Client Workouts Pages]]
- [[_COMMUNITY_Deploy Checks Script|Deploy Checks Script]]
- [[_COMMUNITY_Test Data Seeding|Test Data Seeding]]
- [[_COMMUNITY_Pace & Rest Formatting|Pace & Rest Formatting]]
- [[_COMMUNITY_Duration & Set Formatting|Duration & Set Formatting]]
- [[_COMMUNITY_Calendar Event Modals|Calendar Event Modals]]
- [[_COMMUNITY_Workout Creation Modals|Workout Creation Modals]]
- [[_COMMUNITY_Runner Last Session|Runner Last Session]]
- [[_COMMUNITY_Workout Log Rendering|Workout Log Rendering]]
- [[_COMMUNITY_Playwright Config|Playwright Config]]

## God Nodes (most connected - your core abstractions)
1. `closeModal()` - 23 edges
2. `hello-claude SKILL.md` - 12 edges
3. `renderRunner()` - 11 edges
4. `navigate()` - 10 edges
5. `dbq()` - 9 edges
6. `switchTab()` - 9 edges
7. `deploy-check SKILL.md` - 9 edges
8. `showToast()` - 8 edges
9. `renderClientDashboard()` - 8 edges
10. `logRunnerSet()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `deploy-check SKILL.md` --references--> `UK GDPR Compliance`  [EXTRACTED]
  .claude/skills/deploy-check/SKILL.md → privacy-policy.html
- `deploy-check SKILL.md` --references--> `GitHub Pages Hosting`  [EXTRACTED]
  .claude/skills/deploy-check/SKILL.md → .github/workflows/deploy.yml
- `deploy-check SKILL.md` --references--> `Supabase (Auth + DB)`  [EXTRACTED]
  .claude/skills/deploy-check/SKILL.md → index.html
- `deploy-check SKILL.md` --references--> `scripts/checks.sh`  [EXTRACTED]
  .claude/skills/deploy-check/SKILL.md → .github/workflows/deploy.yml
- `hello-claude SKILL.md` --references--> `UK GDPR Compliance`  [EXTRACTED]
  .claude/skills/hello-claude/SKILL.md → privacy-policy.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Session Start Ritual Skills** — claude_skills_hello_claude_skill_hello_claude, claude_skills_run_coachapp_skill_run_coachapp, claude_skills_playwright_skill_playwright, claude_skills_mobile_check_skill_mobile_check, claude_skills_security_audit_skill_security_audit [EXTRACTED 0.95]
- **Pre-Deploy Safety Checks** — claude_skills_deploy_check_skill_deploy_check, claude_skills_security_audit_skill_security_audit, claude_skills_playwright_skill_playwright, concept_cache_bust, concept_rls, concept_gdpr [EXTRACTED 0.95]
- **GDPR / Data Protection Flow** — privacy_policy, concept_gdpr, claude_skills_security_audit_skill_security_audit, concept_rls, concept_supabase [EXTRACTED 0.90]

## Communities (26 total, 5 thin omitted)

### Community 0 - "App Core & UI Utilities"
Cohesion: 0.03
Nodes (7): db, EVENT_COLOURS, log, _NAV_ICONS, _NAV_ITEMS, PERF_CATEGORIES, PERF_COLOURS

### Community 1 - "Database Queries & Modals"
Cohesion: 0.08
Nodes (31): backToClientWorkouts(), closeProgramModal(), confirmEndRunner(), dbq(), delete1RM(), deletePerfLog(), deletePhase(), deleteProgressPhoto() (+23 more)

### Community 2 - "Workout Runner & Timers"
Cohesion: 0.13
Nodes (27): addExtraCardioSet(), addExtraStrengthSet(), clearTimer(), fmtRestCountdown(), fmtRunnerTime(), launchRunner(), logRunnerSet(), parseRest() (+19 more)

### Community 3 - "Goals & Template Management"
Cohesion: 0.11
Nodes (25): _applyToAllSessions(), backToGoals(), _checkClientPlanPropagation(), closeModal(), deleteExercise(), deleteGoal(), deleteTemplateExercise(), moveTemplateExercise() (+17 more)

### Community 4 - "E2E Test Helpers & Fixtures"
Cohesion: 0.14
Nodes (16): { loginAsPT, loginAsClient }, { test, expect }, { loginAsClient }, { test, expect }, { test: base, expect }, loginAs(), loginAsClient(), loginAsPT() (+8 more)

### Community 5 - "Project Skills & Docs"
Cohesion: 0.21
Nodes (18): 404.html (SPA Redirect), deploy-check SKILL.md, hello-claude SKILL.md, mobile-check SKILL.md, playwright SKILL.md, run-coachapp SKILL.md, save SKILL.md, security-audit SKILL.md (+10 more)

### Community 6 - "Package Configuration"
Cohesion: 0.12
Nodes (15): description, devDependencies, dotenv, @playwright/test, @supabase/supabase-js, license, name, repository (+7 more)

### Community 7 - "Calendar & Client Progress"
Cohesion: 0.21
Nodes (13): calNav(), deleteEvent(), _getCurrentClientId(), renderCalendar(), renderEventList(), renderPerformance(), renderProgress(), renderProgressCardio() (+5 more)

### Community 8 - "Navigation & Role UI"
Cohesion: 0.22
Nodes (11): applyRoleUI(), deleteProgram(), deleteTemplate(), exitSudo(), loadUserInfo(), navigate(), renderNav(), showApp() (+3 more)

### Community 9 - "Branding & Settings"
Cohesion: 0.29
Nodes (8): _applyBrandingToSidebar(), escapeHtml(), _loadBranding(), openSessionDetail(), removeBrandingLogo(), renderDashboard(), renderSettings(), saveBrandingSettings()

### Community 10 - "Client Overview & Editing"
Cohesion: 0.25
Nodes (8): clientOverviewTab(), infoItem(), openClient(), openClientProgramsTab(), renderClientOverview(), saveEditClient(), saveUpdateEmail(), _templateGoBack()

### Community 11 - "Program Assignment"
Cohesion: 0.33
Nodes (6): _cloneProgramForClient(), renderClientPrograms(), saveAssignProgram(), saveAssignProgramToClient(), saveEditStartDate(), unassignProgram()

### Community 12 - "Template Set Management"
Cohesion: 0.47
Nodes (6): copyPrevTemplateSet(), flushTemplateSets(), renderTemplateSets(), setTsEffort(), showEditTemplateExerciseModal(), toggleTsSet()

### Community 13 - "Client Dashboard & Check-ins"
Cohesion: 0.33
Nodes (6): renderClientDashboard(), saveClientCheckIn(), saveClientPB(), saveClientWeight(), saveGoalProgress(), toggleClientMilestone()

### Community 15 - "Client Workouts Pages"
Cohesion: 0.50
Nodes (4): renderClientWorkoutsPage(), renderWorkouts(), renderWorkoutTemplates(), switchWorkoutTab()

### Community 16 - "Deploy Checks Script"
Cohesion: 0.83
Nodes (3): fail(), checks.sh script, warn()

### Community 17 - "Test Data Seeding"
Cohesion: 0.67
Nodes (3): { createClient }, run(), signUpOrSignIn()

### Community 18 - "Pace & Rest Formatting"
Cohesion: 0.67
Nodes (3): calcPace1000(), fmtRestInput(), tsPace500Input()

### Community 19 - "Duration & Set Formatting"
Cohesion: 0.67
Nodes (3): fmtDuration(), fmtSet(), normalizeDuration()

### Community 20 - "Calendar Event Modals"
Cohesion: 0.67
Nodes (3): showAddEventModal(), showClientDayDetail(), showDayEvents()

## Knowledge Gaps
- **37 isolated node(s):** `log`, `db`, `_NAV_ICONS`, `_NAV_ITEMS`, `EVENT_COLOURS` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `closeModal()` connect `Goals & Template Management` to `App Core & UI Utilities`, `Database Queries & Modals`, `Calendar & Client Progress`, `Navigation & Role UI`, `Client Overview & Editing`, `Program Assignment`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `log`, `db`, `_NAV_ICONS` to the rest of the system?**
  _37 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Core & UI Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.03333333333333333 - nodes in this community are weakly interconnected._
- **Should `Database Queries & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.07956989247311828 - nodes in this community are weakly interconnected._
- **Should `Workout Runner & Timers` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._
- **Should `Goals & Template Management` be split into smaller, more focused modules?**
  _Cohesion score 0.11333333333333333 - nodes in this community are weakly interconnected._
- **Should `E2E Test Helpers & Fixtures` be split into smaller, more focused modules?**
  _Cohesion score 0.13768115942028986 - nodes in this community are weakly interconnected._