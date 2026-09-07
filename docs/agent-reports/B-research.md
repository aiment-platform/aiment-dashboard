# Agent B — Research Report: Dashboard & Goal/Progress Mechanics

## Per-product findings

### Linear (Initiatives / Projects / Updates) — strongest reference
- Hierarchy: Initiative → Project → Milestone → Issue. Overview shows health of latest update + rollup.
- **Progress % and health are deliberately separate signals** — a project can be 80% complete and At Risk.
- Health: `On track / At risk / Off track` — **manual human judgment** via a posted update, never auto-computed. Missing updates degrade to an explicit "Update Missing" state (stale = its own signal).
- Update = health pick + short rich text; system auto-appends deltas (progress change, target-date change) so the human writes only judgment. Weekly reminders to the lead only.
- Narrative sits next to numbers: latest update shown inline on overview.

### Atlassian Atlas (now Atlassian Goals/Home)
- **Two cadences**: projects weekly, goals monthly. Statuses include `awaiting update`. Word-limited summaries forced brevity. Designed to replace status meetings.

### Tability — best-in-class lightweight check-in
- Weekly check-in = exactly: **current metric value, confidence rating, short note** (why, blockers). Confidence framed as "not a grade, a help signal."

### Perdoo
- Check-in = KR progress + **confidence + blockers**, ~5 min/week. Confidence changes appended to the Objective **timeline** → visible confidence *trajectory*. "At risk" = *the lead lost confidence* — a belief statement, not arithmetic.

### Asana Goals
- Offers automatic task→goal % rollup — **exactly the conflation aiment forbids**. Manual goals use current/target value pairs. Status still manual.

### ClickUp Goals
- Goal = collection of typed **Targets** (number x of y, true/false, currency, task-list). Auto-averages without weights (crude). Donut hero charts invite false precision.

### Height — shut down Sept 2025
- Lesson: "autonomous PM" AI garnish didn't save a generic task tool; differentiation must be in the model.

### Attio
- Value is the **data model**: Objects → Records → Attributes + Lists, clean typed schema — why it's AI/API-friendly. Visual reference: compact rows, clear hierarchy, minimal chrome.

### Notion OKR templates
- Infinitely flexible linked databases, but: no enforced ritual, no staleness signal, progress = hand-rolled formulas, dashboards user-assembled. **Notion gives you a schema, not an operating cadence.**

### Jira / Monday / Productboard / Quantive / Lattice / Mooncamp
- Issue/board-first or enterprise OKR machines; same check-in triad where relevant; alignment trees meaningless below ~20 people.

### EOS / L10 / Founder patterns
- EOS: **3–7 Rocks per quarter** (hard cap), weekly measurables each with one owner and binary on/off-track. The discipline is the product.
- Investor updates: highlights / lowlights / metrics vs last period / **asks**. Blockers surfaced as explicit asks.

## Adopt for aiment

1. Health as manual human judgment, separate from computed progress (Linear).
2. **Staleness / "update missing" as first-class visible state** (Linear/Atlas). Silence is the leading indicator of trouble.
3. Check-in triad: value + confidence + short note with blockers (Tability/Perdoo). One tiny form, <60 sec.
4. Auto-append system deltas to updates (Linear) — humans write judgment, not bookkeeping.
5. Two cadences (Atlas): milestones/tasks continuous; objective confidence/health weekly ritual.
6. Typed measurable targets current/target (ClickUp/Asana manual): `18/30 responses`, never a naked %.
7. Confidence history as trend (Perdoo): falling confidence at rising progress is the single most valuable startup signal.
8. Hard cap on focus (EOS): ONE current Objective, few workstreams. Scarcity in the UI.
9. Blockers as asks (investor updates): carry "what would unblock this / who can help."
10. Attio-style clean typed entities → map 1:1 to REST/MCP tools.

## Reject for aiment

- Automatic task→goal % rollup (Asana/Monday/ClickUp default).
- Unweighted averaging (keep weights, show fractions so % is auditable).
- Alignment trees / cascading OKRs; Gantt, sprints, burndown, story points.
- Configurable dashboards/widget builders — the opinionated fixed layout IS the product.
- Custom fields / automation builders — flexibility is Notion's job; aiment's edge is opinion.
- Progress-only donut hero charts — always show evidence next to the number.

## Key transferable insights

1. Best tools treat **narrative + number as one atom** (update = health + prose; check-in = value + confidence + note).
2. **Staleness is a third dimension** alongside progress and health — critical for AI agents to summarize honestly.
3. **Manual health beats computed health**; computation is for progress, judgment is for health. Auto-health is a lie generator.
4. **Cadence is a product feature**: reminders to one owner, only for active items. Without ritual → graveyard (Notion-template failure mode).
5. **Denominators beat percentages**: `18/30 interviews` = evidence; `60%` = vibes. Show both, fraction first.
6. **Scarcity is the executive-dashboard trick**: the 3-second read comes from what's excluded.
7. **Goal↔work linkage visible in both directions** ("why am I doing this" from every task).
8. vs Notion/Linear: Linear's atom is the issue, Notion's the page; aiment's atom is the **validated milestone with evidence + confidence** — neither has that natively, neither enforces the ritual.

Sources: linear.app/docs/initiatives · linear.app/docs/initiative-and-project-updates · help.asana.com (goal progress) · guides.tability.io · tability.io/okrs (weekly ritual) · perdoo.com (confidence levels, statuses) · support.atlassian.com (update reminders) · atlassian.com/team-playbook (weekly updates) · help.clickup.com (goals) · alternativeto.net (Height shutdown) · attio.com/help (data model) · eosworldwide.com (L10) · visible.vc (investor updates)
