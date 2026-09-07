/**
 * Single source of truth for every enum in the system.
 * These values appear verbatim in the DB, the UI, the REST API, and (later) MCP tools.
 */

export const OBJECTIVE_STATUS = ["active", "achieved", "missed", "archived"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUS)[number];

export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const HEALTH = ["on_track", "at_risk", "off_track"] as const;
export type Health = (typeof HEALTH)[number];

export const WORKSTREAM_STATUS = ["active", "done", "archived"] as const;
export type WorkstreamStatus = (typeof WORKSTREAM_STATUS)[number];

export const MILESTONE_STATUS = ["not_started", "in_progress", "achieved", "dropped"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export const TASK_STATUS = ["todo", "in_progress", "done", "dropped"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_PRIORITY = ["p0", "p1", "p2"] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const BLOCKER_STATUS = ["active", "resolved"] as const;
export type BlockerStatus = (typeof BLOCKER_STATUS)[number];

export const BLOCKER_SEVERITY = ["critical", "high", "medium"] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITY)[number];

export const ACTOR_TYPE = ["member", "agent", "system"] as const;
export type ActorType = (typeof ACTOR_TYPE)[number];

/** Health/confidence judgments older than this are shown as Stale. */
export const STALE_AFTER_DAYS = 7;

/**
 * Semantic definitions, shipped so humans and AI agents apply the enums consistently.
 * (Agent C, minor finding: bare enums without semantics drift.)
 */
export const HEALTH_MEANING: Record<Health, string> = {
  on_track: "順調 — 今のペースと証拠なら目標に届く見込み。",
  at_risk: "要注意 — 目標を脅かす具体的な問題がある。今対処すれば回復できる。",
  off_track: "危険 — 計画を変えない限り目標は達成できない。",
};

export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  high: "高 — ここまでの証拠は仮説を支持している。",
  medium: "中 — シグナルが混在、または判断するには薄い。",
  low: "低 — 証拠が仮説に反している、または決定的に不足している。",
};

/**
 * The Milestone rule (Agent C, M1):
 * Milestone = the OUTSIDE WORLD responded (users answered, VTubers signed, money moved).
 * Task = something we can complete by our own effort alone.
 */
export const MILESTONE_RULE =
  "マイルストーンは「外の世界の反応」— ユーザーが回答した、VTuberが契約した、お金が動いた。自分たちの作業だけで完了できるなら、それはタスク。";
