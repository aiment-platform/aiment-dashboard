# aiment Operating Dashboard — Design Decisions

> Synthesis of four independent agent reviews (see `docs/agent-reports/`):
> A = Product Strategy, B = Market Research, C = Critique, E = Architecture.
> This document is the binding spec for implementation. Where agents disagreed, the ruling is recorded here.

## What this product is

**The AI-readable shared memory of aiment's validation state.** It answers, in 3 seconds, whether the current hypothesis ("Indonesian VTuber fans want this enough to pay") is being proven or disproven — not whether the team is busy.

The 6 questions every screen and API answer serves:
1. What are we trying to achieve?  2. How far are we?  3. Are we on track?
4. What is blocking us?  5. Who is doing what?  6. What should happen next?

## Non-negotiable principles

1. **Evidence is the only progress.** Progress derives exclusively from milestone `current/target` counters. No task-derived % exists anywhere (UI or API).
2. **One focus.** Exactly one active Objective drives the dashboard. Scarcity is enforced by the UI.
3. **The cheapest input wins.** Milestone counter bump ≤5 sec, update note ≤30 sec, one interaction deep.
4. **Honest about doubt and decay.** Confidence ⊥ Progress. Judgments show their age. Silence degrades to a visible `Stale` state — the dashboard admits when it's lying.
5. **The screen and the API are the same thing.** The dashboard renders `getDashboardSummary()`; an AI agent calling it sees exactly what the founder sees.

## Entity model (final)

```
Workspace (singleton)
└── Objective  — the hypothesis being validated. ONE active at a time (UI-enforced).
    └── Workstream (≤5) — activity area. Owner, manual Health + note, one Next Action line.
        └── Milestone — an EVIDENCE STATE: "the outside world responded".
            current_value / target_value / unit. Weight (objective-scoped, default 1).
        └── Task — an action completable by our own effort alone.
Blocker — first-class: what's stuck, who unblocks it, how old, what would unblock it.
Update  — the heartbeat: what changed (required) / result / next, may carry a counter bump.
ActivityLog — append-only machine stream of every mutation (member | agent | system).
Member  — plain row, no login.
```

**The Milestone rule (from C-M1):** Milestone = *the outside world responded* (users answered, VTubers signed, money moved). Task = *we can complete it by our own effort*. The creation form enforces it: a milestone requires `target_value + unit` phrased as external evidence; if you can't fill that, it's a task.

## Rulings on agent disagreements

| Question | Ruling | Rationale |
|---|---|---|
| `task.workstream_id` required (E) vs nullable+Inbox (C) | **Nullable.** Unassigned tasks appear in an Inbox strip on the tasks page, never on the dashboard. | Fake milestones/workstreams invented to satisfy a NOT NULL are worse than an inbox. |
| Health: manual (B) vs system-computed default (C) | **Manual, with automatic `Stale` degradation.** When `health_updated_at` > 7 days, the UI shows `Stale (was On Track, 9d ago)` — a distinct visual state, not a fake At Risk. | Research is unanimous that auto-health lies; but staleness pressure is mechanical and honest. |
| Progress %: keep (spec) vs kill (C partial) | **Keep, demoted.** Fractions (18/30) are the primary display; the derived % is secondary, never stored, breakdown always one glance away. Milestone model changes are logged so any % jump is explainable. | Counts are the trustworthy part (A); % is a useful summary only when auditable (B). |
| Update structure: 4 required fields (spec) vs 1 (A, C) | **Only `what` is required.** `result` / `next` optional. "+ Blocker" creates a real blocker row. An update can carry a milestone counter change (before → after) as provenance. | Required structure kills the habit; a rotted dashboard is worse than none. |
| Priority taxonomy | 3 values (`p0 do-now / p1 / p2`), default p1, no ceremony. | |
| Confidence | Objective-level only. Enum low/med/high + required one-line note + timestamp. Changes logged → trend arrow (`Medium ↓`). | "75% progress, falling confidence" is the single most valuable startup signal (B, Perdoo). |

## Progress computation (final)

- Stored: only `milestone.current_value`, `target_value`, `weight`, `status`.
- Milestone progress `p = min(current/target, 1)`; `achieved` forces 1.0; `dropped` excluded from all rollups.
- Workstream progress = Σ(w·p)/Σw over its non-dropped milestones.
- Objective progress = Σ(w·p)/Σw over ALL its non-dropped milestones (weights are objective-scoped → the two levels can never disagree).
- Computed at read time in `progress.ts`. Never persisted, never hand-editable.
- Objective health = worst health among active workstreams (computed, never stored).

## Dashboard information hierarchy (refined by Agent D, see D-ux-design.md)

Delta-led, scarcity-driven, one screen:

1. **CURRENT FOCUS** — objective title (largest text), evidence fractions per milestone, derived %, Confidence word + note + age + trend, Health word + reason, days remaining, and a "last 7 days" delta line (+N evidence, M updates, K new blockers).
2. **WORKSTREAMS** — dense rows (not cards): name · owner · health (text) · current milestone fraction · next action · blocker count. Stale rows visibly degraded.
3. **BLOCKERS** — sorted oldest first, each with age in days, owner, what-would-unblock.
4. **MY TASKS** — top 3 for the current member, each showing the milestone it feeds.
5. **RECENT UPDATES** — compact human-authored heartbeat, value changes inline.

Quick capture (update + counter bump) is reachable from the dashboard in one interaction.

## Stack (final)

Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Drizzle + better-sqlite3 (WAL), no auth (member-picker cookie), REST read layer `/api/v1/*`, services in plain TS importable by a future MCP `mcp/server.ts`. Postgres/Supabase migration path documented in E-architecture.md. IDs: `prefix_nanoid(10)`.

## Explicitly out of MVP

Auth/login · Supabase · multi-workspace · realtime · notifications · MCP server itself (half-day later) · comments/chat · files · Gantt/charts · automation · analytics · permissions · version history (activity_log suffices).
