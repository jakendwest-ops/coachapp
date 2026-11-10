# Schema

Source: the Vault's `data-model.md`, migrated in full 2026-09-15. This is the canonical schema
reference — previously `architecture.md`/`technical-debt.md`/`handover.md` all flagged "no
canonical schema exists," which was true of the repo but not of the Vault. That gap is closed now.

The source of truth for actual live constraints is still Supabase itself (`information_schema`),
not this file — this is the design reference, kept in sync manually. Any schema change (new table,
new FK, renamed column) should update this file in the same commit as the migration, per
[decisions.md](decisions.md)'s documentation-maintenance rule.

## Core entity relationships

```mermaid
erDiagram
    CLIENTS ||--o{ WEIGHT_LOGS : logs
    CLIENTS ||--o{ PERFORMANCE_LOGS : logs
    CLIENTS ||--o{ WORKOUT_LOGS : logs
    CLIENTS ||--o{ GOALS : has
    CLIENTS ||--o{ EVENTS : has
    CLIENTS ||--o{ CLIENT_CHECK_INS : submits
    CLIENTS ||--o{ CLIENT_1RMS : has
    CLIENTS ||--o{ CLIENT_PROGRAMS : assigned

    PROGRAMS ||--o{ PROGRAM_PHASES : has
    PROGRAMS ||--o{ CLIENT_PROGRAMS : "assigned as"
    PROGRAM_PHASES ||--o{ CLIENT_PROGRAM_WORKOUTS : schedules

    CLIENT_PROGRAMS ||--o{ CLIENT_PROGRAM_WORKOUTS : contains
    CLIENT_PROGRAM_WORKOUTS }o--|| WORKOUT_TEMPLATES : "runs (client copy)"

    WORKOUT_TEMPLATES ||--o{ WORKOUT_TEMPLATE_EXERCISES : contains
    WORKOUT_TEMPLATES ||--o{ WORKOUT_LOGS : "logged from"

    WORKOUT_LOGS ||--o{ WORKOUT_LOG_EXERCISES : contains
    WORKOUT_LOG_EXERCISES ||--o{ WORKOUT_LOG_SETS : contains

    GOALS ||--o{ GOAL_MILESTONES : has
    GOALS ||--o{ GOAL_CHECK_INS : has

    CLIENTS {
        uuid id PK
        uuid user_id FK "unique — one record per user"
        uuid coach_id FK "null = solo/personal account"
    }
    PROGRAMS {
        uuid id PK
        uuid coach_id FK
    }
    WORKOUT_TEMPLATES {
        uuid id PK
        uuid program_id FK "set = master template"
        uuid client_id FK "set = client plan clone"
    }
```

## The two-level editing model (the part that matters most)

The single highest-risk area in the schema — getting it wrong means one client's edit silently
changes another client's plan, or vice versa.

```mermaid
flowchart TD
    A[PT builds a Program] -->|workout_templates: program_id SET, client_id NULL| B[Master Template]
    B -->|Assign to Client X| C["Clone row-by-row (client_programs + client_program_workouts)"]
    C -->|workout_templates: program_id NULL, client_id SET| D[Client X's Plan Copy]
    B -->|Assign to Client Y| E["Clone row-by-row"]
    E -->|workout_templates: program_id NULL, client_id SET| F[Client Y's Plan Copy]

    D -->|PT edits Client X's plan| D
    D -.->|"NEVER affects"| F
    D -.->|"NEVER affects"| B

    B -->|"PT edits a master workout's content"| G["Offered once per Save: 'Update assigned clients?' — copies change only if the PT accepts"]
    B -->|"PT duplicates, deletes or generates weeks, or shortens a phase"| H["Applied to assigned clients' plans automatically — no prompt"]
```

**Corrected 2026-09-20** (read from `js/app-programs.js` / `js/app-workouts.js`, not run): the diagram used to
say master edits reach *future* assignments only. A workout's content edit is offered to assigned clients once per
Save (`_checkClientPlanPropagation`); week-structure edits (`duplicatePhaseWeek`, `generatePhasePeriodization`,
`deletePhaseWeek`, shortening a phase) rewrite assigned clients' plans automatically. Whether that mix is
intended is Jake's call.

**Rule:** `program_id` set + `client_id` null = master. `program_id` null + `client_id` set =
personal copy. Never both set, never both null for a real template (standalone templates are both
null). No auto-renaming — template names only change manually, which is what lets "apply to all
sessions named X" work reliably.

**A third state exists and is not covered by the rule above** (per the 2026-08-12 architecture
audit, `docs/archive/architecture-audit-2026-08-12.md`): `generated_from_phase_id` set, with both
`program_id`/`client_id` null — a periodization-generated week-clone. Depended on directly by
`generatePhasePeriodization`/`_refreshProgramTemplates` in `app-programs.js`. Not independently
re-verified in this migration; flagged as a known doc gap in the source itself, carried forward
rather than silently patched.

**"No auto-renaming" also has an undocumented carve-out** (same audit): periodization week-clones
ARE auto-renamed with a `— W{n}` suffix, stripped for display in 3 places — verified by that audit
as intentional and load-bearing, not a bug.

## Account types / roles

```mermaid
flowchart LR
    U[auth.users] --> P[profiles]
    P -->|role: coach| PT[PT account]
    PT --> CL1["clients.coach_id = PT's id (one row per coached client)"]
    PT -.->|"if PT also has own client record with coach_id = null"| SOLO[Personal / Solo view]

    P -->|role: client| CLV[Client account]
    CLV --> CR["clients row, user_id = auth.uid(), coach_id = assigned PT"]

    SOLO --> SR["Same clients row, coach_id = null (self-coached)"]
```

**Key facts:**
- `clients.user_id` has a unique constraint — exactly one client record per user, ever.
- Solo/Personal is **not** a separate record — it's the same client record with `coach_id` nulled.
- `window._masterAccount` = true when the logged-in coach also has any client record (coached or
  personal).
- RLS anchor for solo: `client_id in (select id from clients where user_id = auth.uid() and coach_id is null)`.

## Workout logging flow (runner)

```mermaid
flowchart TD
    A[Client/PT starts session from Workouts page] --> B[workout_logs row created]
    B --> C[Runner: set-by-set logging]
    C --> D[workout_log_exercises, one row per exercise]
    D --> E[workout_log_sets, one row per set]
    C -->|"%1RM set type"| F[client_1rms looked up for target weight]
    E --> G[Session summary / finish screen]
    G -->|optional| H[Save estimated 1RM from today's sets]
```

**Two corrections to this diagram, per the 2026-08-12 audit** (not independently re-verified here):
the `workout_logs` row is only created at **save** time, not session start — the runner is
localStorage-only until then, by the runner module's own header comment. And "Save estimated 1RM"
is fully shipped (`showPostSessionOneRMModal` et al.), not planned/dashed as the original diagram
marked it.

## Schema changes 2026-07-12 → 2026-08-24

Archived verbatim on 2026-11-10: [archive/schema-changes-2026-07-12-to-2026-08-24.md](archive/schema-changes-2026-07-12-to-2026-08-24.md). [architecture.md](architecture.md) lists the migration files.

## How to keep this in sync

- Any schema change (new table, new FK, renamed column) → update this file in the same commit as
  the migration.
- The source of truth for actual constraints is Supabase itself (`information_schema`) and
  [critical.md](critical.md), not this file — this is the design reference.
- Don't duplicate this elsewhere — one file.
- `types/database.d.ts` is generated, never hand-written (first generated 2026-10-29; it needs Jake's
  Supabase login, `npx.cmd supabase login`). Regenerate it in the same commit as any schema change, from
  PowerShell in the repo folder (`npx.cmd`, because PowerShell blocks `npx.ps1`; `Out-File -Encoding utf8`,
  because PowerShell 5.1's `>` writes UTF-16):
  `npx.cmd supabase gen types typescript --project-id avilxuiacmtgeoxxhfhc | Out-File -Encoding utf8 types/database.d.ts`.
  A NEW column shows up as a type error until regenerated, which is safe. A DROPPED column keeps
  type-checking against the stale file, which is not.

**goals.linked_metric, goals.linked_exercise_id** (2026-11-08): a goal that follows body weight or a lift. Progress is derived when read, never stored; see scripts/add-goal-links-2026-11-08.sql.

## Requires Validation

- This file was reconciled against migrations through 2026-08-24 in its original Vault form; this
  migration pass added the newer columns/tables already documented in `architecture.md`
  (`workout_templates.updated_at`, `workout_logs.template_id`) but did **not** independently
  re-verify every table/column against a live `information_schema` query — that's still owed.
- The third template-ownership state (`generated_from_phase_id`) and the periodization auto-rename
  carve-out are carried from the 2026-08-12 audit, not independently re-checked against current code.
- The two runner-flow diagram corrections above are likewise carried from that audit, not re-verified.
