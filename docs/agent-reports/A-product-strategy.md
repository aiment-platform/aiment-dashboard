# Agent A — Product Strategist Report

## 1. Core problem statement

**The dashboard must answer, in seconds, whether aiment's current validation hypothesis is actually being proven or disproven — not whether the team is busy.**

Pre-PMF, the only real progress is validated learning — evidence for or against "Indonesian VTuber fans want this enough to pay." Tasks (DMs sent, posts written) are cheap and feel productive while the proof milestones (30 responses, 5 session participants, 3 paid intents) silently stall. The failure mode this product exists to prevent is *weeks of motion with zero evidence*.

## 2. What makes this structurally not a todo app

Three load-bearing concepts:

1. **Milestone-as-evidence-state with a countable target.** A milestone is "18/30 Indonesian users responded," never "send survey." Countable → objective and un-gameable. Tasks merely *feed* milestones. A todo app cannot represent "we completed 40 tasks and produced 0 evidence."
2. **Progress ⊥ Confidence.** Progress = how far through the plan. Confidence = do we still believe the hypothesis will validate. `Progress 75% / Confidence Low` = "we're executing the plan and the market is saying no" → pivot conversation *now*.
3. **Blockers as first-class, aging objects.** A blocker with an owner and visible age ("12 days old") turns the dashboard into a "what do we attack today" instrument.

## 3. The 6 questions → exact minimal data

| Question | Minimal data element |
|---|---|
| What are we trying to achieve? | The single `objective` with `status='active'` (enforce exactly one): title, description (hypothesis), target_date |
| How far are we? | `objective.progress` = Σ(weight × current/target). **Display raw counts (18/30) alongside % — counts are the trustworthy part.** |
| Are we on track? | `confidence` (low/med/high, manual, age shown) + `health` (**text**, required reason when not on_track) + days remaining |
| What is blocking us? | `blocker`: title, workstream, owner (who unblocks), **age in days**, status. Sort oldest first. |
| Who is doing what? | `workstream.owner` + in-progress tasks grouped by owner (cap ~3/person) |
| What should happen next? | `workstream.next_action` (one curated line) + each member's top todo |

## 4. Noise list — cut or defer

- Task lists on the dashboard (only *my* top tasks; full views one click away)
- Any task-count-derived %, anywhere (even secondary)
- Multiple simultaneous objectives in the UI (enforce ONE active)
- Priority taxonomies (binary or 3 levels max)
- Charts over time (theater at this data volume)
- Raw activity feeds in UI (log to DB for AI; show humans only human-authored Updates)
- Workspace management UI (one hardcoded workspace)
- Per-milestone confidence (objective level only)
- Required 4-field Updates (one free-text box, structure as optional prompts)
- Auth beyond minimum needed to attribute owners

## 5. Daily-use reality check

**3-second view (above the fold):** objective title → one big % with per-milestone counts → Confidence word + Health word → oldest blocker with age → next action line.

**Input budget:** ~60–90 sec/day + ~5 min weekly. Ranked write-paths:

1. **Milestone count bump (18→19) — highest-value input. One click / inline edit, ≤5 seconds.** If buried in a modal, the dashboard rots in two weeks; a stale dashboard is *worse* than none.
2. Task check-off — near-zero cost.
3. Update note — one text box, ≤30 seconds, optional structured prompts.
4. Confidence/health review — **weekly, prompted** ("last reviewed 6d ago"), not daily.

Task fields: everything except title optional; infer workstream from milestone. Weights set once at creation.

**Staleness must be visible.** `confidence: Medium (reviewed 6d ago)`. The dashboard must admit when it's lying.

## 6. "Why not Notion/Linear?"

For task management, Notion/Linear are better; don't compete there. Defensible claims:

1. **Opinionated constraint, not capability.** Makes the wrong thing (task-count progress) *impossible*; works in 10 minutes with zero configuration.
2. **A fixed 3-second read.** Non-configurable home screen answering the 6 questions.
3. **Machine-readable company state — first-class differentiator NOW.** One call returns objective + progress + confidence + blockers + updates in a stable schema.

The product earns its existence through zero-config opinionation + ≤5-second evidence capture + the API/MCP story. Compromise any of the three → "use Notion."

## 7. Top 5 design principles (priority order)

1. **Evidence is the only progress.** Progress derives exclusively from milestone current/target counts. No task-derived % anywhere.
2. **One focus.** Exactly one active objective; home screen subordinate to it.
3. **The cheapest input wins.** Every daily write is one interaction deep, ≤5 seconds.
4. **Honest about doubt and decay.** Confidence independent of progress; off-track requires a reason; every judgment displays its age.
5. **The screen and the API are the same thing.** If the dashboard renders it, one API call returns it. An agent is a first-class user from day one.
