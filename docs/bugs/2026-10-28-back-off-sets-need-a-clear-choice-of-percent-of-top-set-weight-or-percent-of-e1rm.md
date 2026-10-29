---
id: 2026-10-28-back-off-sets-need-a-clear-choice-of-percent-of-top-set-weight-or-percent-of-e1rm
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-28
status_detail: "SHIPPED in v2026.10.7 (live 2026-10-29, verified byte-identical); waiting for Jake's check on his phone. A back-off set's 'Of' choice is now three-way: Last saved 1RM, Today's estimated 1RM (the old 'Today's top set', same meaning), or NEW Today's top set weight (a percentage of the weight actually lifted on the ticked top set, needing no effort rating); a worked example under it shows the kilos each gives, and the runner applies exactly the chosen basis (unit and browser tests pin all three). REQUESTED by Jake 2026-10-28 (screenshots of a back-off set's '% OF' dropdown, which today offers 'Last saved 1RM' and 'Today's top set'). He wants a dropdown for % of e1RM: the app works out the lifter's e1RM from the top set's weight and RPE, and the coach chooses whether a back-off set is a percentage of the top set's ACTUAL weight or a percentage of the weight at the e1RM; the workflow must be obvious and take few clicks. Not yet read: what 'Today's top set' computes at the moment (an e1RM-based percentage or a percentage of the lifted weight), and how the runner applies it. Needs the existing behaviour read first, a proposal, and approval before any build."
closing_conditions: "A back-off set can be prescribed as a percentage of the top set's actual weight or as a percentage of the e1RM worked out from the top set's weight and RPE, the choice is obvious in the editor and in the set's summary line, the runner applies exactly the chosen basis (a unit test pins both), and Jake confirms on his phone that it reads clearly."
---

# Back-off sets need a clear choice: percent of the top set's weight, or percent of its e1RM

## Jake's report (verbatim, 2026-10-28)

> 3. Include a dropdown for % of e1rm. The logic will be that we calculate the users e1rm from their top set weight and RPE, and then the user can choose whether to use % of the actual weight of the top set, or a % of the weight of the e1rm. We need to make the workflow clear for the user and not have too many clicks for them and make these options obvious for them.

**Closes when:** A back-off set can be prescribed as a percentage of the top set's actual weight or as a percentage of the e1RM worked out from the top set's weight and RPE, the choice is obvious in the editor and in the set's summary line, the runner applies exactly the chosen basis (a unit test pins both), and Jake confirms on his phone that it reads clearly.
