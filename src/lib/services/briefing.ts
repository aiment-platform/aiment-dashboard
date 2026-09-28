import { ASSIGNEES, isAssignedTo } from "@/lib/accounts";
import { daysAgo } from "@/lib/contacts-ui";
import { listContacts } from "./contacts";
import { defaultPeriodId, getPeriodBoard, type PeriodBlock } from "./periods";

/**
 * 「今日なにからやる？」の材料。
 *
 * ここでは**決めない**。やるべき順を決めるのは AI(や人)で、ここは
 * 「なぜ気にするべきか」の理由を1つ1つ付けて、目安の順に並べて渡すだけ。
 * 理由が付いていれば、AI は「期限切れが2つ、返事待ちが1人」と根拠つきで話せる。
 */

export interface BriefingBlock {
  id: string;
  title: string;
  owner: string | null;
  due_date: string | null;
  /** 目安の重さ。大きいほど先に見るべき */
  score: number;
  /** なぜ気にするべきか(日本語で、そのまま人に見せられる形) */
  reasons: string[];
  subtasks_left: { id: string; title: string }[];
  working: string[];
}

export interface BriefingContact {
  id: string;
  name: string;
  kind: string;
  status: string;
  owner: string | null;
  days_since_contact: number | null;
  reasons: string[];
}

export interface Briefing {
  today: string;
  period: { id: string; title: string; end_date: string | null; days_left: number | null } | null;
  /** 絞り込んだ人(指定があれば) */
  for_member: string | null;
  blocks: BriefingBlock[];
  contacts: BriefingContact[];
  counts: { open_blocks: number; done_blocks: number; overdue: number; due_soon: number; waiting_contacts: number };
}

const DAY = 86_400_000;
const daysUntil = (iso: string, today: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);

function scoreBlock(b: PeriodBlock, today: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (b.due_date) {
    const d = daysUntil(b.due_date, today);
    if (d < 0) {
      score += 100 + Math.min(-d, 30) * 3;
      reasons.push(`期限切れ(${-d}日過ぎ)`);
    } else if (d === 0) {
      score += 90;
      reasons.push("今日が期限");
    } else if (d <= 3) {
      score += 70 - d * 5;
      reasons.push(`期限まであと${d}日`);
    } else if (d <= 7) {
      score += 30;
      reasons.push(`期限まであと${d}日`);
    }
  }
  if (b.important) {
    score += 40;
    reasons.push("重要の旗が立っている");
  } else if (b.urgent) {
    score += 30;
    reasons.push("止まっている(ブロッカーあり)");
  }
  if (b.workers.length > 0) {
    score += 15;
    reasons.push(`取り組み中: ${b.workers.map((w) => w.name).join("・")}`);
  }
  const left = b.subtasks.filter((s) => !s.done).length;
  if (b.subtasks.length > 0 && left > 0 && b.done_subtasks > 0) {
    score += 10;
    reasons.push(`サブタスク残り${left}/${b.subtasks.length}(途中まで進んでいる)`);
  }
  if (!b.owner) {
    score += 5;
    reasons.push("担当者がいない");
  }
  return { score, reasons };
}

/** member は名前(Soya / Futo / Other)でもIDでもよい */
export async function getBriefing(opts: { member?: string | null; periodId?: string | null } = {}): Promise<Briefing> {
  const today = new Date().toISOString().slice(0, 10);
  const member = resolveMember(opts.member ?? null);
  const periodId = opts.periodId ?? (await defaultPeriodId());
  const [board, contacts] = await Promise.all([
    periodId ? getPeriodBoard(periodId) : Promise.resolve(null),
    listContacts(),
  ]);

  // メモ(タスクではないもの)はやることではないので数えない
  const all = (board?.blocks ?? []).filter((b) => b.kind !== "note");
  const open = all.filter((b) => b.status !== "achieved");

  // 依存の矢印: A → B は「A が終わってから B」。
  // まだ終わっていない前提がある積み木は後回し、待たれている積み木は先に。
  const info = new Map<string, { title: string; done: boolean }>();
  for (const b of board?.blocks ?? []) info.set(b.id, { title: b.title, done: b.status === "achieved" });
  for (const [id, o] of Object.entries(board?.outside ?? {})) info.set(id, { title: o.title, done: o.done });
  const depend = (b: PeriodBlock) => {
    const reasons: string[] = [];
    let score = 0;
    for (const l of board?.links ?? []) {
      if (l.to_id === b.id) {
        const pre = info.get(l.from_id);
        if (pre && !pre.done) {
          score -= 25;
          reasons.push(`先に「${pre.title}」が要る(まだ終わっていない)`);
        }
      }
      if (l.from_id === b.id) {
        const next = info.get(l.to_id);
        if (next && !next.done) {
          score += 20;
          reasons.push(`「${next.title}」がこれを待っている`);
        }
      }
    }
    return { score, reasons };
  };
  // Both の仕事は Soya にも Futo にも数える
  const mine = (b: PeriodBlock) =>
    !member || isAssignedTo(b.owner?.id, member.id) || b.workers.some((w) => w.id === member.id);

  const blocks: BriefingBlock[] = open
    .filter(mine)
    .map((b) => {
      const base = scoreBlock(b, today);
      const dep = depend(b);
      return {
        id: b.id,
        title: b.title,
        owner: b.owner?.name ?? null,
        due_date: b.due_date,
        score: base.score + dep.score,
        reasons: [...base.reasons, ...dep.reasons],
        subtasks_left: b.subtasks.filter((s) => !s.done).map((s) => ({ id: s.id, title: s.title })),
        working: b.workers.map((w) => w.name),
      };
    })
    .sort((a, b) => b.score - a.score || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  const people: BriefingContact[] = contacts
    .filter((c) => !member || isAssignedTo(c.owner_id, member.id))
    .map((c) => {
      const since = daysAgo(c.last_contacted_at);
      const reasons: string[] = [];
      if (c.status === "waiting" && since !== null && since >= 3) reasons.push(`返事待ちが${since}日続いている(催促する?)`);
      if (c.status === "contacted" && since !== null && since >= 5) reasons.push(`声をかけてから${since}日、返事がない`);
      if (c.status === "candidate" && c.owner_id) reasons.push("候補のまま。まだ声をかけていない");
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        status: c.status,
        owner: ASSIGNEES.find((a) => a.id === c.owner_id)?.name ?? null,
        days_since_contact: since,
        reasons,
      };
    })
    .filter((c) => c.reasons.length > 0)
    .sort((a, b) => (b.days_since_contact ?? 0) - (a.days_since_contact ?? 0));

  const end = board?.period.end_date?.slice(0, 10) ?? null;
  return {
    today,
    period: board
      ? { id: board.period.id, title: board.period.title, end_date: end, days_left: end ? daysUntil(end, today) : null }
      : null,
    for_member: member?.name ?? null,
    blocks,
    contacts: people,
    counts: {
      open_blocks: open.length,
      done_blocks: all.length - open.length,
      overdue: blocks.filter((b) => b.reasons.some((r) => r.startsWith("期限切れ"))).length,
      due_soon: blocks.filter((b) => b.reasons.some((r) => r.startsWith("期限まで") || r === "今日が期限")).length,
      waiting_contacts: contacts.filter((c) => c.status === "waiting").length,
    },
  };
}

/** 「Soya」「soya」「mem_soya」どれでも受ける */
export function resolveMember(v: string | null): { id: string; name: string } | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  const hit = ASSIGNEES.find((a) => a.id === v.trim() || a.name.toLowerCase() === t);
  if (hit) return hit;
  throw new Error(`知らないメンバー: ${v}(${ASSIGNEES.map((a) => a.name).join(" / ")} のどれか)`);
}
