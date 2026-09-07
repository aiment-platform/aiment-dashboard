# Agent E — Architecture Proposal

## 1. Tech stack decision

**Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Drizzle ORM + SQLite (better-sqlite3), no auth in MVP. Supabase/Vercel deferred to a documented migration path.**

- (a) `npm run dev` with zero accounts: Supabase fails this (provisioning, keys, network). SQLite is a file (`data/aiment.db`), seedable, inspectable with `sqlite3`. This alone decides the MVP.
- (b) 1–5 users: SQLite with WAL is ample.
- (c) Later deploy + MCP: handled by portability discipline.

Driver: **better-sqlite3** (contained via `serverExternalPackages: ['better-sqlite3']`, server-only). libsql adds async mismatch for unneeded remote capability. Prisma rejected (heavier toolchain; Drizzle schema-as-code doubles as docs for AI agents).

**Portability rules (day 1):** all services async; no SQLite-only SQL (aggregate in TS); dates as ISO-8601 TEXT (UTC); enums as TEXT validated in `constants.ts`; only column types with 1:1 pg equivalents.

**Migration path:** swap `sqlite-core` → `pg-core` in one schema file, point at Supabase, `drizzle-kit push`, 50-line copy script. Add Supabase Auth then (`members.auth_user_id` reserved, nullable).

**Auth: none in MVP.** Members are plain rows. "Who am I" = `member_id` cookie set by a member-picker.

## 2. Data model

**IDs:** text PKs, `prefix_nanoid(10)`: `obj_ ws_ ms_ task_ blk_ upd_ mem_`. Self-describing in logs/URLs/LLM tool calls. No slugs.

**Enums** (TEXT, single source `src/lib/constants.ts`):
```
objective.status: active|achieved|missed|archived    confidence: high|medium|low
health: on_track|at_risk|off_track                   workstream.status: active|done|archived
milestone.status: not_started|in_progress|achieved|dropped
task.status: todo|in_progress|done|dropped           task.priority: p0|p1|p2
blocker.status: active|resolved                      blocker.severity: critical|high|medium
actor_type: member|agent|system
```

### Tables (columns abridged; see schema.ts for authority)

- **workspace** (singleton `'workspace'`): name, focus_objective_id FK
- **members**: name, role, auth_user_id (reserved), is_active
- **objectives**: title, description, owner_id, start_date, target_date, status, confidence, confidence_note (WHY — crucial for AI), confidence_updated_at
- **workstreams**: objective_id, name, owner_id, status, health, health_note, health_updated_at (staleness signal, flag >7d), next_action (one line, manual), sort_order
- **milestones** ("achieved STATE, not work"): workstream_id, title, target_value REAL, current_value REAL, unit, weight (objective-scoped), status, due_date, sort_order
- **tasks**: title, workstream_id, milestone_id (nullable), owner_id, status, priority, due_date, note, completed_at, sort_order
- **blockers** (first-class): title, detail, workstream_id, task_id (nullable), owner_id (who UNBLOCKS), severity, status, resolution (learning record), resolved_at
- **updates** (heartbeat): workstream_id, author_id, what (required), result, next, milestone_id + value_before + value_after (provenance of counter moves)
- **activity_log** (append-only, machine-first): ts, actor_type, actor_id, entity_type, entity_id, action, detail JSON {field, before, after}

### Key decisions

- **Progress stored vs computed:** only milestone current/target stored. Milestone p = min(current/target, 1); `achieved` forces 1.0; `dropped` excluded. Workstream = Σ(w·p)/Σw of its milestones; Objective = Σ(w·p)/Σw across ALL its milestones (weights objective-scoped → levels can never disagree). **Never persisted**; computed in `progress.ts`. Change provenance in updates + activity_log.
- **Blocker:** separate entity, anchored to workstream, optional task pin, unblock-owner, resolution field. Flags can't hold ownership/age/resolution.
- **Update:** structured-lite. `what` required; result/next optional. No required blocker field — "+ blocker" creates a real blockers row. May carry a milestone value change ("18→20 because X").
- **Health:** manual per workstream (+ note + timestamp); dashboard shows "stale" badge >7 days. **Objective health = worst of active workstreams (computed, never stored).** Confidence only on objective, manual, note required in UI.
- **No soft delete**; terminal statuses + append-only activity_log written by service layer on every mutation.

## 3. API surface

**All business logic in plain async TS services; Server Actions are 3-line wrappers; thin read-only REST proves machine-readability; future MCP imports services directly.**

```
src/lib/services/
  dashboard.ts   getCurrentFocus(), getDashboardSummary()
  objectives.ts  getObjective(), listObjectives(), setConfidence(), setFocus()
  workstreams.ts listWorkstreams(), updateHealth(), setNextAction()
  milestones.ts  listMilestones(), createMilestone(), updateMilestoneProgress(), setStatus()
  tasks.ts       listTasks(), getMyTasks(), createTask(), updateTask()
  blockers.ts    getBlockers(), createBlocker(), resolveBlocker()
  updates.ts     getRecentUpdates(), addUpdate()   ← may also move a milestone
  members.ts     listMembers(), createMember()
  progress.ts    pure: milestoneProgress(), rollup()  (no db import)
  activity.ts    logActivity() — called by every mutating service
```

Rules: services import only db + constants + progress (no next/*, no React). Mutating services take `actor: {type, id}` → activity_log attributes agent writes.

- UI reads: RSC pages call services directly. UI writes: Server Actions → zod → service → revalidatePath.
- REST MVP: `GET /api/v1/summary|tasks|blockers|updates`, `POST /api/v1/tasks|updates`.
- Future MCP: `mcp/server.ts` (stdio), tools 1:1 to services, same SQLite file. Half-day task later.

## 4. Machine-readable response shapes

`getDashboardSummary()`: one call answers "aiment今どんな感じ?" — denormalized owner names alongside IDs, explicit enums, ISO dates, `as_of`, progress 0..1, `health_stale` booleans, `days_remaining`, current_milestone with current/target/unit, blockers with age_days, recent_updates with milestone_change {from, to}.

`getMyTasks(memberId)`: pre-sorted (p0 → overdue → due date), each task carrying its chain up (workstream {name, health}, milestone {title, progress}, blocked_by []).

## 5. Project structure

```
aiment_Dashboard/
├── next.config.ts                  # serverExternalPackages: ['better-sqlite3']
├── drizzle.config.ts
├── data/                           # gitignored; aiment.db
├── src/
│   ├── app/
│   │   ├── page.tsx                # THE dashboard (RSC)
│   │   ├── actions.ts              # all Server Actions
│   │   ├── objective/[id]/page.tsx
│   │   ├── workstream/[id]/page.tsx
│   │   ├── tasks/page.tsx
│   │   └── api/v1/{summary,tasks,blockers,updates}/route.ts
│   ├── components/                 # dashboard/*, ui/* (shadcn)
│   ├── lib/{constants.ts, db/, services/, ids.ts}
│   └── scripts/seed.ts             # seeds the Indonesia-validation example
└── mcp/server.ts                   # FUTURE (documented stub only)
```

## 6. Explicitly NOT in MVP

| Cut | Reason |
|---|---|
| Auth / login | Trusted tool; member-picker cookie; auth_user_id reserved |
| Supabase / hosted DB | Fails zero-setup; schema pg-portable by rule |
| Multi-workspace | Singleton row keeps the door open |
| Realtime sync | Refresh-on-action fine for 5 users |
| Notifications | Staleness badges replace push |
| MCP server | Post-MVP; services make it half a day |
| Comments/chat, files, Gantt, automation, analytics, permissions | Don't affect the 6 questions |
| Version history | activity_log covers it |

Biggest product risk isn't schema — it's `next_action` and `health` rotting from manual upkeep; staleness timestamps are the schema-level hook the UX must exploit.
