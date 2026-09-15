# Vision

Source: the Vault's `blueprint.md` ("Locked decisions. Do not change without Jake's explicit
agreement," last updated 2026-06-19), migrated in full 2026-09-15 as part of retiring the Vault as
CoachApp's system of record. This replaces an earlier, inference-based version of this file written
when the real source was believed unreachable — it was not; see [decisions.md](decisions.md).

**One known staleness in the source itself, carried forward rather than silently fixed:** an August
2026 architecture audit (`docs/archive/architecture-audit-2026-08-12.md`) found this document's
signup-flow section already stale against a later redesign (see "Signup flow" below). Flagged in
place rather than corrected, since the correction itself needs verifying against current code.

## Product vision

A PT/coach management platform, built PT-first. Solo and client accounts added on top. Goal:
best-in-class UX for coaches managing 5-20 clients. Feature depth second, workflow speed first.

## Account types

| Role | `coach_id` | Description |
|---|---|---|
| `coach` | own ID | Manages clients, builds programs, monitors all client data |
| `client` | PT's ID | Invited by PT; sees own data, logs sessions, adds personal events |
| `solo` | null | Personal training log only; no PT relationship |

**Key principle:** Client and solo share the same data model — `coach_id` is nullable. A solo user
is a client with no coach attached. One profile type, not two systems. (Full schema detail:
[schema.md](schema.md).)

## Permissions model

| User | Can see | Can write |
|---|---|---|
| Coach | All their clients, all data | Everything for their clients |
| Client | Own profile only | Own weight logs, session logs, feedback, personal calendar events |
| Solo | Own profile only | Everything on own profile |

Coach has **read access** to client-added calendar events (holidays, competitions affect
programming). Coach cannot edit or delete client-created events.

## Invite flow

1. PT creates client record in CoachApp
2. PT clicks "Send invite" → Supabase `inviteUserByEmail()` sends magic link
3. Invite URL carries PT's ID as metadata
4. Client clicks link → lands on signup page → account created → auto-linked to PT
5. v1: Supabase default email branding. v2: customise with PT's name/logo (not yet built — unverified
   whether this remains planned).

## Signup flow

**As originally locked (2026-06-19):** two explicit paths on the signup page — "I'm a coach or PT"
(role: `coach`) and "I'm training for myself" (role: `solo`), with client accounts created only via
PT invite, no self-signup as `client`.

**Known stale, per the 2026-08-12 architecture audit:** public self-serve solo signup was removed
entirely on 2026-07-24 (referenced there as "the Scott West signup incident," full detail not
migrated into this file). As of that audit, onboarding for a solo/personal user is instead an
owner-gated "Invite a personal user" Edge Function (shipped 2026-08-09), not a self-signup page.
**Not independently re-verified against current code in this migration — check `index.html`'s
signup path and `supabase/functions/invite-solo-user/` before relying on either description.**

## Dashboard (PT — Monday morning view)

- Upcoming sessions this week (per client)
- Recent client updates (weights logged, sessions completed)
- Any feedback submitted by clients
- Flagged items (missed sessions, goal deadlines approaching)

## Client dashboard

- Own upcoming sessions (PT-assigned + personal events)
- Personal calendar (PT sessions shown, personal events added by client)
- Own weight / performance progress
- Goals set by PT

## Calendar

- PT assigns structured sessions to specific dates
- Client adds personal events: competitions, holidays, gym sessions, other
- Both event types visible in one calendar view — visually distinct (PT-assigned vs client-created)
- PT has read-only access to client-created events

## Original build order (2026-06-19, historical — not a current roadmap)

1. Schema updates — add `client` role to profiles, make `coach_id` nullable, add `events` table
2. Weight tracking UI
3. Invite system
4. Client dashboard + calendar
5. Performance / PB tracking
6. Programs (phases, weeks, day slots)
7. Solo user flow (signup path + stripped-down dashboard)
8. Macros, progress photos, invoices, comms log — lower priority

For what's actually shipped and what's next now, see [architecture.md](architecture.md) and
[roadmap.md](roadmap.md), not this historical list.

## What was explicitly NOT being built in v1 (2026-06-19)

- Client self-signup (invite only)
- Native mobile app (PWA first, Capacitor later)
- Custom invite email branding (v2)
- AI features
- Marketplace / PT discovery

Not re-verified whether any of these have since changed — see [roadmap.md](roadmap.md) for current
scope.

## Requires Validation

- The signup-flow discrepancy above (locked-doc version vs. 2026-08-12 audit's correction) has not
  been independently re-verified against current code in this migration pass.
- The beta timeline is deliberately not stated here — the Vault's own `roadmap.md` still shows
  31 July 2026 (already past, as of this writing 2026-09-15) as of its last edit, which contradicts
  an earlier claim in this documentation set (sourced from prior-session memory) that it was
  deprioritized 2026-07-29. That memory-sourced claim now looks more likely wrong than right, but
  neither is confirmed — see [roadmap.md](roadmap.md)'s own Requires Validation.
- Whether the "Original build order"/"What was NOT being built" sections still reflect current
  intent, or are purely historical, was not confirmed with Jake in this pass.
