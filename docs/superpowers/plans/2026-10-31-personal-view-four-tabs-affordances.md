# Personal view four destinations — affordance table (Task 1, Step 1)

Every way in that the solo nav offered before this change, and where it is after. A destination that only moves under a parent keeps every
button on its page: the page itself is unchanged and still routable.

| Before (solo) | What it holds | After |
|---|---|---|
| Sidebar / bottom bar **Dashboard** (`solo-dashboard`) | Today card, week strip, tiles, weight, My calendar, goals | **Today** tab, same page (Task 3 changes its cards) |
| Sidebar / bottom bar **Workouts** (`workouts`) | Create a workout, Train now, Your workouts (search, Edit, Make a copy, Start), Recent sessions, Up next | **Train › Workouts**, same page, unchanged |
| Sidebar **Library** / More sheet **Library** (`library`) | Templates tab (+ New template, search, open/edit a template); Exercise Library tab (search, add/edit exercise) | **More › Exercise library**: Exercise Library tab only. Templates tab retired for solo: + New template → Train › Workouts "Create a workout"; open/edit → Your workouts "Edit"; search → Your workouts search |
| Sidebar / bottom bar **Training plans** (`programs`) | Plans list, + New program, open/build a plan, assign to self, Move to Personal / Copy to coaching | **Train › Plans**, same page, unchanged |
| Sidebar **Calendar** / More sheet **Calendar** (`calendar`) | Month/week calendar, add/move/delete events and sessions | Today's **Calendar** button (and `#calendar`), same page with a `‹ Today` link; Today tab lit |
| `goals` route (reached from the dashboard goals card; not in the nav) | Goals list, add/open/edit/delete goal, milestones, check-ins | **Progress › Goals** (the same `renderClientGoals` in Progress' Goals tab); `#goals` forwards there |
| Bottom bar / sidebar **Progress** (`progress`) | Body Weight, Personal Bests, Performance, Goals tabs | **Progress**: Goals, Records (Personal Bests + Performance, unchanged inside), Weight, Cardio (cardio records split out of Personal Bests) |
| Sidebar / More sheet **Settings** (`settings`) | Profile, units, appearance, consent/privacy, Download my data, Send feedback, owner error card | **More › Settings**, same page; More also has direct rows for Download my data, Send feedback, Privacy policy |
| Floating PT / Personal pill (`#mobile-view-switcher`) | Switch view (master account) | Unchanged; More adds **Switch to PT view** (master account only) |
| Sidebar sign-out button | Sign out | Unchanged; More adds **Sign out** |

No affordance is left without a home. Retired for solo only: the Library's Templates tab (its three actions are all on Train › Workouts).
