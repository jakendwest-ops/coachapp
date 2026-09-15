---
id: 2026-09-05-workout-logs-template-id-is-not-ownership-checked
status: open
priority: low
reported: 2026-09-05
status_detail: "Found by Agent A of the pinned multi-agent review, 2026-09-05, and VERIFIED INERT before being recorded. Jake was asked and the ruling is deliberate: do NOT fix now. The proposed fix puts a refusal risk on the hot write path (every session save) to close a gap with no demonstrated blast radius — this project's most-shipped guard bug. Read 'Why fixing it is currently the riskier move' before acting on this row."
---

# `workout_logs.template_id` is written from client state and never ownership-checked

`scripts/fix-workout-logs-insert-policy-2026-07-30.sql:67-101` — both the INSERT and the UPDATE
`with_check` clauses verify `client_id` against `coach_id`:

```sql
exists (select 1 from public.clients c
         where c.id = client_id
           and (c.coach_id = auth.uid() or c.user_id = auth.uid())
           and workout_logs.coach_id = coalesce(c.coach_id, c.user_id))
```

Neither mentions `template_id`. Two write paths set it — `saveRunnerSession` (`js/app-runner.js:2443`,
added 2026-09-04) and `saveWorkoutSession` (`js/app-runner.js:3050`) — and both take the value from
client-side JS state. So a coach, or a tampered client session, can write a log whose `template_id`
points at a template they do not own.

## Why it is inert — verified, not assumed

- **No cross-tenant read.** `workout_logs` SELECT is independently scoped by
  `using (coach_id = auth.uid())` (same file, `:58-62`), behaviourally covered by
  `tests/rls-audit.spec.js`. Another coach cannot see the forged row at all.
- **No cross-tenant write.** The forged value is a pointer; it confers nothing on the target template.
- **Nothing reads it across a tenant boundary.** The Library's trained-dates query only asks for
  `template_id`s drawn from the caller's own templates. The deletion-guard read in
  `js/app-programs.js:403-408` is scoped the same way.

Worst realistic outcome: a user corrupts **their own** Library recency data.

## Why fixing it is currently the riskier move

The natural fix adds to both `with_check` clauses:

```sql
and (template_id is null
     or exists (select 1 from workout_templates wt
                 where wt.id = template_id and wt.coach_id = workout_logs.coach_id))
```

That runs on **every session save**, including a user finishing a workout in a gym. If any legitimate
path writes a log whose template is owned differently from the log — master templates, shared or
cloned templates, a solo record whose `coach_id` is NULL — the save is refused and the user loses
their session. Refusing the legitimate user is the failure this project ships most often, and the
gap being defended has no demonstrated blast radius.

**Do not apply the policy change without first enumerating every path that writes `template_id` and
proving each one satisfies the check.**

## Reopen / escalate if

`template_id` gains a reader that crosses a tenant boundary — any aggregate, report or coach-facing
view that resolves a log's template without re-anchoring on `coach_id`. At that point this stops being
inert and the policy fix becomes worth its risk.

## Related

- `scripts/fix-workout-logs-insert-policy-2026-07-30.sql` — the policy this would amend
- Introduced alongside `js/app-runner.js` recording `template_id` for the Library "last used" feature
