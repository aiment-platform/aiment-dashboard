# Agent D — UI Specification

## 1. Screen inventory & navigation

**Pages (5, no more):**

| Route | Purpose |
|---|---|
| `/` | THE dashboard. 80% of usage. |
| `/workstream/[id]` | Drill-down: milestones (edit counters/weights), tasks, updates history, blockers, health editing. |
| `/tasks` | All tasks grouped by owner + Inbox strip (unassigned). The only place the full task list exists. |
| `/objective/[id]` | Edit hypothesis text, target date, confidence (+ required note), milestone weights; confidence history. |
| `/settings` | Members, workspace name. Visited ~once. |

**Navigation: thin topbar, no sidebar.** Topbar (48px): left — wordmark `aiment` (links `/`) + muted link `Tasks`; right — `+ Update` primary button (ink), member-picker (avatar + name, dropdown sets cookie), gear → `/settings`.

## 2. The Dashboard

Single centered column, `max-w-[1080px] px-6`, section gap 40px. Order: **HERO → WORKSTREAMS → BLOCKERS → (MY TASKS ‖ RECENT UPDATES two-col)**. Hero + workstreams + blockers fit above the fold at 1440×900.

### 2.1 CURRENT FOCUS hero

**The single visual anchor is the objective title** (30px/600, tracking-tight). Never make the % the anchor.

Two-zone layout: left column (~65%) = *what & evidence*; right rail (~35%) = *judgment & time*. Evidence numerals live only on the left, judgment words only on the right — this prevents number soup.

- **Eyebrow row**: `CURRENT FOCUS` (11px uppercase, tracking-wide, muted). Right: `41 days left · target Sep 30` (12px muted; amber <14d, red + `overdue` past due).
- **Title**, then hypothesis description: one line, 14px muted, truncated.
- **Evidence strip**: all non-dropped milestones as inline chips separated by `divide-x` (not boxes). Per chip: fraction mono 20px/600 `tabular-nums` (current ink, `/30` muted); label 11px muted; 2px bar (ink on stone-200). Achieved: `5/5 ✓` green. After last chip, set apart: `≈49%` — 14px, muted, never bold; tooltip "weighted from 3 milestones". The `≈` is deliberate honesty.
- **Right rail**: labeled lines (label 11px uppercase muted, value word-first):
  - `Health` → `▲ At Risk` (14px/600 amber) + note 12px muted ("reply rate dropped last week"). Computed = worst workstream; note from that workstream.
  - `Confidence` → `Medium ↓` (arrow from last logged change) + note + `reviewed 2d ago` 11px. Note >10d old → age turns amber (`review overdue`).
- **Delta line** (bottom, 13px muted): `This week: +5 evidence · 4 updates · 1 new blocker`; `· 1 milestone achieved ✓` when true. Zero-activity: `This week: no recorded evidence` in amber — the honesty meter.

### 2.2 WORKSTREAMS — dense rows

Table, `divide-y`, rows ~56px, whole row links to workstream page. Grid: `grid-cols-[1.3fr_130px_1.5fr_1.8fr_48px]` → NAME · HEALTH · EVIDENCE · NEXT ACTION · ⚑.

- **Name**: 14px/500; below, 16px avatar + owner 12px muted.
- **Health**: glyph + word, never color alone: `● On Track` green / `▲ At Risk` amber / `■ Off Track` red / `◌ Stale` gray. Note truncated beneath 11px. Stale shows `was On Track · 9d`.
- **Evidence**: current milestone (first non-achieved by sort_order): `18/30 survey resp.` mono 14px + 2px bar. All achieved → `all milestones ✓` green.
- **Next action**: 13px text. Missing → muted italic `no next action — set one` (the nudge is the feature).
- **⚑**: active blocker count, amber if >0, `—` if 0.

**Stale row**: only judgment cells (health, next action) drop to 60% opacity + dashed border on chip. Evidence stays full-strength — counters don't rot, judgments do.

Manual `sort_order`, never auto-sorted: stable geography enables the 3-second scan.

### 2.3 BLOCKERS

Full-width. Sorted oldest first. Row:
- **Age chip dominates**: left, mono 13px/700 fixed width: `12d`. Neutral <7d, amber 7–14d, red >14d.
- Title 14px/500; right meta: `User Demand · ◉ Soya` (owner = who unblocks).
- Second line 12px muted: `unblock: get intros to 3 Discord servers via mutuals` (detail field, phrased as ask).
- Hover → ghost `Resolve` → inline "How was it resolved?" → row disappears (resolution stored).
- Zero state: `✓ No active blockers` muted green.

### 2.4 MY TASKS (top 3)

Cookie member scoped. Sort: p0 → overdue → nearest due. Row: checkbox (optimistic, fades out) · title 14px · second line 12px: `now` chip (p0, amber) or `due Fri` / `due 2d ago` red · `feeds 3/5 session participants` mono — the "why am I doing this" line. Unlinked: `— inbox`. Header `all tasks →`; footer `4 more →`.

### 2.5 RECENT UPDATES

Right column, last 6, `divide-y`. Per item: meta 11px (`Soya · User Demand · 2h ago`); body 13px: `what`, `→ result`; counter change as mono chip `[15→18 resp.]` green-tinted; `next: …` 12px muted. A heartbeat, not a social feed.

### 2.6 Empty & stale states

- **Fresh install**: hero becomes setup panel: "**What is aiment trying to prove right now?**" → title + target date → "Add your first evidence milestone" with the rule inline: *"A milestone is something the outside world does — '30 users answered', not 'send survey'."* One ghost row `+ add workstream`. Other sections hidden.
- **Fully stale** (nothing for 14d): banner under topbar: `Nothing recorded for 14 days. This dashboard may be lying — log what actually happened. [+ Update]`. All health chips `◌ Stale`; delta line amber.

## 3. The two golden inputs

**① Counter bump (≤5s), lives where evidence lives.** Hover fraction → `[−][+]` micro-steppers; click fraction → popover: number input (autofocus, value selected), optional one-line note, `Save ⏎`. Enter saves, Esc closes. Hitting target → `✓` flip + toast `Milestone achieved 🎉` — the only celebratory moment.

**② Quick update (≤30s): centered command-style dialog.** Triggers: `+ Update` button, `u` anywhere, `+` on workstream row (pre-scoped).

```
┌ Log an update ────────────────────────────┐
│ What changed?  [__________________ ]      │  ← required, autofocus
│ [User Demand ▾]                           │  ← defaults to last-used
│ + result   + next   + counter   + blocker │  ← ghost links reveal fields
│                              [Save ⏎]     │
└───────────────────────────────────────────┘
```

`+ counter` reveals milestone select + `18 → [21]`. `+ blocker` reveals title + unblock-hint → real blockers row. Typical path: `u`, one sentence, Enter — ~8 sec.

## 4. Visual language

**Theme: light, single theme for MVP** (Stripe precedent for dense data; avoids Linear-clone gravity). Tokens structured so dark can come later.

**Fonts** (next/font/google, self-hosted): **Inter** (UI) + **JetBrains Mono** (every measuring numeral, `tabular-nums`).

**Type scale**: objective title 30/600 (the ONE big element; nothing else >20px) · eyebrows 11/600 uppercase tracking-[0.08em] · row primary 14/500 · meta 12 · micro 11 · hero fractions mono 20/600 · row fractions mono 14/600.

**Tailwind v4 `@theme` tokens:**

```css
@theme {
  --color-bg: #fafaf9;          --color-surface: #ffffff;
  --color-border: #e7e5e4;      --color-ink: #1c1917;
  --color-muted: #78716c;       --color-faint: #a8a29e;
  --color-track: #e7e5e4;
  --color-ontrack: #15803d;  --color-ontrack-bg: #f0fdf4;
  --color-atrisk: #b45309;   --color-atrisk-bg: #fffbeb;
  --color-offtrack: #b91c1c; --color-offtrack-bg: #fef2f2;
  --color-stale: #57534e;    --color-stale-bg: #f5f5f4;
  --color-achieved: #15803d; --color-delta: #047857;
}
```

Near-monochrome chrome: primary button ink/white; **the only saturated colors are semantic** (health, ages, deltas), always paired with word or glyph (`●▲■◌`). Confidence is text-only (word + arrow, no chip) to stay distinct from health. Sections 40px apart, rows 48–56px, `divide-y`, zero shadows, 6px radii; hero is the only bordered "panel".

## 5. Information scent details

- Activity ages: `2h ago` / `3d ago`. Judgment ages: `reviewed 2d ago` (verb = a human judged). Stale: `was On Track · 9d`.
- Blocker ages: bare `12d` — the terseness is the alarm.
- Delta grammar: `This week: +5 evidence · 4 updates · 1 new blocker`; zero-case amber.
- Fraction beats %: fraction mono semibold ink; % `≈49%` smaller muted, never bold/colored, never alone.

## 6. Deliberately excluded from the dashboard

- Charts/sparklines — decoration at n≤5 weeks of data.
- Full task table — task-manager gravity; my top 3 only.
- Activity log feed — machine food; humans get authored Updates.
- Objective switcher/tabs — one focus is the spine.
- Filters/view options/widget config — the fixed layout IS the product.
- Team presence row — n=3, you know who's who.
- Notification bell — staleness pressure replaces push.
- Per-workstream confidence — objective-only ruling.
- Global ⌘K search — 5 routes need none; the muscle-memory key is `u` (capture).

Note: `/workstream/[id]` reuses the exact same row/chip primitives — no new visual vocabulary.
