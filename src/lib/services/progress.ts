import type { Health } from "@/lib/constants";
import { HEALTH, STALE_AFTER_DAYS } from "@/lib/constants";

/**
 * Pure progress math. No DB imports — this module is the single provenance
 * for every % in the product. Nothing here is ever persisted.
 */

export interface MilestoneLike {
  currentValue: number;
  targetValue: number;
  weight: number;
  status: string; // MilestoneStatus
}

/** Progress of one milestone, 0..1. `achieved` forces 1; capped at 1. */
export function milestoneProgress(m: MilestoneLike): number {
  if (m.status === "achieved") return 1;
  if (m.targetValue <= 0) return 0;
  return Math.min(m.currentValue / m.targetValue, 1);
}

/**
 * Weighted rollup over non-dropped milestones, 0..1.
 * Weights are objective-scoped, so workstream and objective rollups use the
 * same function and can never disagree.
 */
export function rollup(milestones: MilestoneLike[]): number {
  const active = milestones.filter((m) => m.status !== "dropped");
  const totalWeight = active.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return 0;
  const sum = active.reduce((s, m) => s + m.weight * milestoneProgress(m), 0);
  return sum / totalWeight;
}

/** Objective health = worst health among its active workstreams. */
export function worstHealth(healths: Health[]): Health {
  for (const h of ["off_track", "at_risk", "on_track"] as const) {
    if (healths.includes(h)) return h;
  }
  return "on_track";
}

export function isValidHealth(h: string): h is Health {
  return (HEALTH as readonly string[]).includes(h);
}

/** Days elapsed since an ISO timestamp (floored, min 0). */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** A judgment (health/confidence) is stale when older than STALE_AFTER_DAYS. */
export function isStale(iso: string | null | undefined, now = new Date()): boolean {
  const d = daysSince(iso, now);
  return d === null || d > STALE_AFTER_DAYS;
}

/** カレンダー日での残り日数(今日が期限=0、超過は負)。 */
export function daysRemaining(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}
