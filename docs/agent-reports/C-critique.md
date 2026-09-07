# Agent C — Devil's Advocate Critique

## CRITICAL

### C1. The weighted % is progress theater, and it corrupts the model it measures
Failure: founder adds a newly-discovered milestone and the headline drops 49%→38% overnight — so they stop editing milestones to protect the number. The 30/30/40 weights are invented precision. Partial credit (18/30 = 60%) contradicts "milestone = achieved state"; evidence is nonlinear (first 18 responses may already say NO).

**Change:** Progress is **evidence-first, derived-only**:
- Milestone carries `current_value / target_value / unit`. Raw counters are the primary display.
- Objective % is derived at read time, never stored, never hand-editable, breakdown one glance away.
- Adding/removing/reweighting milestones writes an event ("model changed, % recalculated"). Milestones can be `dropped` without deleting history.
- Default weights equal; weight editing is a plain number field.

### C2. The dashboard will silently rot, then lie
Failure: founder heads-down 6 days; dashboard still says "On Track · 49%"; now actively wrong; trust dies. The spec's input burden as written is 10–15 min/day; a founder sustains ~2 min.

**Change:**
- **Staleness first-class.** Every entity has `last_activity_at`; show "last update 6 days ago"; health degrades to a distinct `Stale` state (not fake "At Risk") after N silent days.
- **One-line update ritual:** only "what changed" required; result/next/blocker optional; counters bumpable inline ("+3 responses"). ≤30 sec.
- Task states: todo / doing / done. No ceremony.
- Lead with **delta, not state**: "Since Friday: +2 responses, 1 new blocker, User Demand → At Risk." A static % can't beat a text file; a diff can.

### C3. As specced, Notion IS enough — nail the one wedge
Steelman: 1–3 people, near-zero coordination overhead; one Notion page does 90% of this in 30 min. What defeats it: **this dashboard is the AI's shared memory of the company** — trustworthy, causally-linked, queryable state; updates in seconds; drift/staleness machine-detectable. Notion returns block soup; Linear has no objective/evidence layer.

**Change:** cut auth, CRUD breadth, visual excess. MVP = (1) schema, (2) 30-second capture, (3) one excellent dashboard, (4) MCP-ready read/write layer (same code path as UI).

## MAJOR

### M1. Milestone vs Task ambiguity — countability is a broken litmus test
「インタビュー5件実施」(countable but activity), 「LPを公開」(feels like state but is deliverable), 「候補50人リストアップ」(countable but grind).

**Rule: Milestone = the outside world responded (users, VTubers, money moved); Task = completable by our own effort alone.** "50 listed" = task; "3 VTubers signed" = milestone; behind the LP is "50 signups via LP". Enforce in the creation form: milestone requires target_value + unit phrased as external evidence.

### M2. Self-reported Health at n=1–3 is optimism theater
Solo founders won't mark their baby "Off Track."

**Change:** system proposes health from staleness / due-slip / open blockers ("suggest At Risk: no evidence in 9 days — agree?"); human override requires one line of why, logged. Decision-forcing prompt, not vanity field.

### M3. Confidence without a "why" and a trend is noise
**Change:** enum Low/Med/High; every change requires a one-line reason; display trend (`Medium ↓`) from the event log. This captures "75% progress, Low confidence — kill it?" — the most startup-critical signal in the spec.

### M4. The static dashboard doesn't let the founder decide anything
"49% · At Risk · 3 blockers" → anxiety, not information.

**Change:** every At Risk carries its reason inline; every blocker links to the milestone it blocks + "what would unblock" + owner; every workstream shows exactly one **Next Action**. The dashboard's job is to end with "today, do X."

### M5. Premature infrastructure
Auth + RLS + login = days of plumbing, zero value at n≤3, hurts AI access too.

**Change:** single hardcoded workspace; plain members table (no login); add Supabase Auth when a non-founder joins. Keep workspace_id columns if free.

### M6. The rigid 5-level chain has no place for real work
Admin/exploratory/recurring tasks belong to no milestone; forcing them creates fake milestones.

**Change:** task.milestone_id AND task.workstream_id nullable (unassigned → "Inbox" strip); no subtasks; soft-cap workstreams ~5; recurrence out of scope.

## MINOR

- Two logging systems → **one `events`/activity stream**; human updates and system events are rows of different type. It's exactly what an AI wants to read.
- Hand-editable computed values are AI-hostile: every number is either raw input (counters) or derived-with-provenance (%). Never both writable.
- Define At Risk vs Off Track in one sentence each, in code/docs.
- Priority: single focus flag or 3-value enum, max.

## Top 5 changes the implementation MUST adopt

1. Evidence-first progress: counters primary; % derived at read time, never stored; model changes logged.
2. Staleness first-class + delta-led dashboard; health auto-degrades to `Stale` on silence.
3. 30-second update ritual: one required field, optional rest, inline counter bumps, unified event stream.
4. The Milestone rule — "the world responded" — enforced at creation; tasks attach freely (nullable links).
5. Cut auth/CRUD breadth; ship the MCP-ready derived read model as the same functions the UI renders from.
