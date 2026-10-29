> **Provenance and status (2026-10-29).** A product-level review of the Solo experience, asked for by Jake ("stop thinking at
> the individual feature level"). Written from `docs/vision.md`, `docs/roadmap.md`, `docs/session-context.md`, the
> [2026-09-19 product review](2026-09-19-product-review-ranked-backlog-and-releases.md) and a read of the Solo code paths
> (`app-core` routing, the dashboards, `starter-content`, the runner, progress). **The app was not used on a phone for this
> review**: anything about how a screen feels is inferred from code. **Nothing in this file is built or approved.** Any item
> starts with a file-by-file summary and Jake's "approved" (CLAUDE.md rule 8).

# Solo product review

## The core finding: Solo has no stated product vision

`vision.md` defines the product as "PT-first … coaches managing 5-20 clients", with Solo "added on top". Jake has no clients
yet, so in practice Solo *is* the product and Jake is its only real user. Much of the feature-level granularity comes from this:
with no stated job for Solo, every rough edge met in the gym becomes a ledger row, and the rows set the agenda (55 open, 16
awaiting Jake, 9 releases unchecked on a phone, as of 2026-10-29).

**Proposed positioning:** "Train yourself the way a good PT would." Solo offers real programming (blocks, periodisation,
autoregulation) for people who coach themselves, and it is the same app a coach uses, so there is a natural upgrade path to
having one. It should not try to be a better Hevy at logging.

## 1-9: Analysis

1. **Vision gaps.** No written answer to who Solo is for, why they would pay, or how it relates to the coach product. No
   success measure is defined. Adherence is the right one, and the plan-adherence streak already measures it.
2. **Missing journeys.**
   - Discovery and sign-up: none. Self-signup was removed 2026-07-24 (`js/app-core.js` ~1453); accounts come only from the
     owner-gated invite Edge Function.
   - "I have finished my block, what now?": no review and no next-block step.
   - "I am switching from Strong or Hevy": no import, so a new user starts with zero history.
   - "I want a coach": no path from Solo to client.
3. **Missing workflows.**
   - Nothing says what to lift next time on a non-periodised plan. There is a Last time panel, but no target.
   - Solo has no readiness check-in. It is client-only: `_dashLoadOwn(..., { checkIn: isClient })` (`js/app-dashboard.js` ~836).
   - No reminders of any kind.
   - No weekly or monthly review.
4. **Missing high-value features.** A next-session target (progression). A library of proven plans: today there is one
   "Example - 4-Week Foundation". An installable app: no manifest, no service worker. A workout save that survives bad gym
   signal: R4a (retry-safe save) is planned, not built.
5. **Weak experiences.**
   - First run: you land on a hub with example content but no "here is your plan, start Monday".
   - Exercise library: 40 seeded exercises with no how-to notes.
   - Vocabulary: template, workout, training plan, programme, library, "Your workouts", PT view vs Solo view, "Move to Personal".
6. **Overlap and duplication.**
   - "What's today" appears in four places: the dashboard Today card and week strip, the Workouts "Up next" hero, the programme
     page's "Now", and the Calendar.
   - Goals appear in three: the dashboard card, Progress > Goals, and the Goals page.
   - Library vs Workouts > templates: two homes for "my workouts".
7. **Simplify.**
   - Navigation: Solo has 8 destinations (`soloPages`, `js/app-core.js` ~1136). Cut to 4: Today; Train (plans, workouts and
     the library together); Progress (records, body weight, goals); More.
   - Calendar: a view under Today, not a top-level page.
   - Advanced controls: undulating tiers, RPE vs % periodisation and the unit overrides go behind "advanced".
8. **Feels incomplete.** Onboarding; the end of a block; any outcome summary; save resilience; installability.
9. **Beyond MVP.** The periodisation engine (% and RPE ramps, deload weeks, undulating tiers); RPE top-set autoregulation with
   a live e1RM; interval timers with count-ins; jump-height and per-type cardio units; the process machinery around the app.
   Mostly good work, especially the first two, but it was built before the basics a stranger meets on day one.

## The five questions

**Can Solo stand alone as a paid product?** Not today, and the reasons are basic ones rather than missing features: nobody can
sign up, it cannot be installed, a workout can be lost on bad signal, and no one except Jake has used it. The training engine
underneath is above paid-product level.

**Why choose it over the alternatives?** Strong and Hevy are loggers: they record what you did and do not plan what you will do.
Alpha Progression plans with an algorithm, but it is a black box you cannot edit. Trainerize is a coach's tool; a solo user there
is a client with no coach. CoachApp's pitch: a plan written by a real PT, which you can see and edit, that tells you what to lift
next and adjusts with RPE, with a coach one tap away. Today it loses to all of them on polish, exercise library, offline use and
social features, and should not try to win on those.

**Strongest differentiators.**
1. Periodised blocks plus RPE autoregulation.
2. An honest adherence measure: plan-based, not a vanity count of sessions.
3. One stats card, so the runner's Stats sheet and My progress show the same numbers.
4. The same data model as a coached client, which gives the upgrade path.
5. Jake is a PT, and his programming is content no competitor has.

**Biggest weaknesses.** No acquisition path; no progression guidance on ordinary plans; a fragile save and no install; too many
surfaces and too much vocabulary; no outside user feedback.

**Biggest increase in user value.** A next-session target in the runner, together with proven starter plans. Telling someone what
to lift and what plan to follow is what changes training outcomes; everything else improves the record of training rather than
the training itself. The target is shown beside the set ("aim 80 x 8, 8, 8"), never typed into it: that respects Jake's
2026-07-11 decision that a pre-filled value cannot be told apart from one actually entered.

## Lifecycle

| Stage | Interaction | Supported? |
|---|---|---|
| Sign-up | Find the app, create an account | No (invite-only) |
| | Consent, units | Yes |
| | Goal / days-per-week / experience setup | No |
| | Pick a plan | Partly (one example plan) |
| | Add to home screen | No |
| First workout | "Train now" or start from a template | Yes |
| | Wake lock, rest timer | Yes |
| | Know what weight to use | No |
| | Save on bad signal | Partly (not retry-safe) |
| | PRs on the finish screen | Yes (a first-ever log counts as a PR: Q4 of the 2026-09-19 plan, still open) |
| First week | Week strip and adherence streak | Yes |
| | Weekly target (default 3) | Yes |
| | Body weight | Yes |
| | Readiness check-in | No |
| | Reminders | No |
| First month | Progression on a periodised plan | Yes (strong) |
| | Progression on any other plan | No |
| | Deload | Yes, if set up |
| | Block ends: review and next block | No / partly (the "Week 15" hero fix is planned as R3b; whether built is unverified) |
| | Monthly summary | No |
| Long-term | PBs, e1RM trends, goals with milestones | Yes |
| | Data export | Yes |
| | Clone and reuse plans | Yes |
| | Import history | No |
| | Backup restore | Partly (never tried) |
| | Upgrade to a coach | No (unverified: no flow found) |

## Roadmap, ranked by impact

**MVP: sellable to the first 10 outside users**
1. Real outside users on real phones for two weeks. No code.
2. A workout save that can never be lost or doubled (planned as R4a in the 2026-09-19 plan).
3. A next-session target in the runner: a target to aim for, not a pre-filled value.
4. Sign-up and a three-question setup that picks a starter plan.
5. Four to six proven plans written by Jake.
6. Installable to the home screen (PWA).
7. Navigation from 8 destinations to 4.
8. Plan complete: a review and the next block (partly planned as R3b).

**V2: retention and switching**
1. Import history from a Strong / Hevy CSV.
2. A weekly readiness check-in for Solo, reusing the client one.
3. A weekly summary: sessions, PRs, volume per muscle.
4. Reminders: email first, then push.
5. "Invite my coach": a Solo account becomes a client.
6. Exercise how-to notes and demo links.
7. Payments, once people train on it weekly.

**V3: leverage the coaching engine**
1. Block-to-block adjustment from RPE drift and adherence.
2. Coaches publish plans that Solo users can buy.
3. An offline-first runner.
4. Real supersets and circuits.
5. Measurements and photos, only with the erasure path restored.
6. A native wrapper; wearables.

**Stop or freeze:** new Solo-only power features (more periodisation modes, per-exercise unit overrides); the PT/Solo view
switching and the "Move to Personal" / "Copy to coaching" bridges, which serve Jake's own dual account rather than a customer;
Calendar and Library as top-level Solo destinations.

## Requires Validation

- Not checked by using the app: every "feels" claim, and the lifecycle table's Yes/No marks, come from code and docs.
- Whether R3b's programme-complete hero fix is built (the 2026-09-19 plan says not started).
- Whether any Solo-to-client upgrade path exists outside the code read here.
- The positioning, the MVP list and the "stop or freeze" list are recommendations; none is Jake's decision yet. When he decides,
  record it in [decisions.md](../../decisions.md).
