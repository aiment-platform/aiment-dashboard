/**
 * 積み木ボードのデモデータ。
 * 実行: npm run seed   (既存データを消します — デモ/開発用)
 *
 * public/DashBoard_image.png と同じ絵になるように、
 * 「VTuber、ユーザー確保フェーズ」の盤を座標つきで作る。
 * 前後にも期間を1つずつ置いてあるので、← → がすぐ試せる。
 */
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

const db = getDb();

function iso(d: Date): string {
  return d.toISOString();
}
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}
function ago(days: number): string {
  return iso(new Date(Date.now() - days * 86_400_000));
}

// wipe (demo/dev only)
db.delete(schema.activityLog).run();
db.delete(schema.updates).run();
db.delete(schema.blockers).run();
db.delete(schema.blockWorkers).run();
db.delete(schema.tasks).run();
db.delete(schema.milestones).run();
db.delete(schema.workstreams).run();
db.delete(schema.objectives).run();
db.delete(schema.members).run();

// ---- メンバー(担当者アイコンの色は id から決まる) --------------------------
const soya = newId("mem");
const rin = newId("mem");
const kai = newId("mem");
db.insert(schema.members)
  .values([
    { id: soya, name: "Soya", role: "Founder", isActive: 1, createdAt: ago(60) },
    { id: rin, name: "Rin", role: "Co-founder", isActive: 1, createdAt: ago(60) },
    { id: kai, name: "Kai", role: "Community", isActive: 1, createdAt: ago(40) },
  ])
  .run();

// ---- 期間 = objectives。sort_order が ← → の並び。 -------------------------
interface PeriodSeed {
  id: string;
  wsId: string;
  title: string;
  start: string;
  end: string;
  order: number;
}
function period(title: string, start: string, end: string, order: number): PeriodSeed {
  const id = newId("obj");
  const wsId = newId("ws");
  db.insert(schema.objectives)
    .values({
      id,
      title,
      description: null,
      ownerId: soya,
      startDate: start,
      targetDate: end,
      status: "active",
      confidence: "medium",
      sortOrder: order,
      createdAt: ago(60 - order * 10),
      updatedAt: ago(1),
    })
    .run();
  db.insert(schema.workstreams)
    .values({
      id: wsId,
      objectiveId: id,
      name: "メイン",
      ownerId: soya,
      status: "active",
      health: "on_track",
      healthUpdatedAt: ago(2),
      sortOrder: 0,
      createdAt: ago(60 - order * 10),
      updatedAt: ago(1),
    })
    .run();
  return { id, wsId, title, start, end, order };
}

const past = period("インドネシア需要検証フェーズ", day(-36), day(-1), 0);
const now = period("VTuber、ユーザー確保フェーズ", day(0), day(30), 1);
const next = period("収益化テストフェーズ", day(31), day(61), 2);

// ---- 積み木 = milestones -----------------------------------------------------
let msOrder = 0;
function block(
  p: PeriodSeed,
  title: string,
  owner: string,
  x: number,
  y: number,
  opts: { due?: string | null; done?: boolean; important?: boolean } = {},
): string {
  const id = newId("ms");
  db.insert(schema.milestones)
    .values({
      id,
      workstreamId: p.wsId,
      ownerId: owner,
      title,
      targetValue: 1,
      currentValue: opts.done ? 1 : 0,
      unit: null,
      weight: 1,
      status: opts.done ? "achieved" : "not_started",
      dueDate: opts.due ?? null,
      important: opts.important ? 1 : 0,
      sortOrder: msOrder++,
      boardX: x,
      boardY: y,
      createdAt: ago(20),
      updatedAt: ago(2),
    })
    .run();
  return id;
}

let taskOrder = 0;
function sub(blockId: string, wsId: string, title: string, owner: string, done = false) {
  const id = newId("task");
  db.insert(schema.tasks)
    .values({
      id,
      title,
      workstreamId: wsId,
      milestoneId: blockId,
      ownerId: owner,
      status: done ? "done" : "todo",
      priority: "p1",
      dueDate: null,
      note: null,
      completedAt: done ? ago(2) : null,
      sortOrder: taskOrder++,
      createdAt: ago(10),
      updatedAt: ago(2),
    })
    .run();
  return id;
}

// いまの期間 — 画像とおなじ配置(紙の座標)
const dm = block(now, "VTuber 10人にDMを送る", soya, 120, 80);
sub(dm, now.wsId, "候補リストを作る", soya, true);
sub(dm, now.wsId, "文面のたたきを書く", rin, true);
sub(dm, now.wsId, "5人に送る", soya);
sub(dm, now.wsId, "返信を記録する", kai);
sub(dm, now.wsId, "断られた理由を聞く", rin);

const script = block(now, "初回セッションの台本を固める", rin, 500, 80, { due: day(1) });
sub(script, now.wsId, "流れを30分ぶん書く", rin);
sub(script, now.wsId, "Soyaに読んでもらう", soya);

const discord = block(now, "Discordサーバーを開く", soya, 860, 220);
sub(discord, now.wsId, "チャンネル構成を決める", kai);

const session = block(now, "体験セッションを3回やる", kai, 680, 340);
sub(session, now.wsId, "1回目の日程を決める", kai);
sub(session, now.wsId, "録画の許可をもらう", soya);

// 期限は先だが、手で「重要」の旗を立てた例
const feedback = block(now, "フィードバックを10件集める", kai, 530, 460, { important: true });
sub(feedback, now.wsId, "聞くことを5つに絞る", rin);

// 前の期間(だいたい終わっている)
const survey = block(past, "アンケート30件を集める", soya, 120, 80, { done: true });
sub(survey, past.wsId, "フォームを作る", soya, true);
sub(survey, past.wsId, "3コミュニティに投稿", kai, true);
block(past, "インタビュー5人ぶん", rin, 500, 200, { done: true });
block(past, "有料意向を3人から取る", soya, 300, 400, { due: day(-3) });

// 次の期間(まだ置いただけ)
block(next, "価格を2案つくる", soya, 120, 80);
block(next, "決済まわりを調べる", rin, 500, 190);

// ---- いま取り組んでいる人(担当者とは別) ------------------------------------
db.insert(schema.blockWorkers)
  .values([
    { id: newId("bw"), milestoneId: dm, memberId: soya, startedAt: ago(1) },
    { id: newId("bw"), milestoneId: script, memberId: rin, startedAt: ago(0) },
    { id: newId("bw"), milestoneId: script, memberId: soya, startedAt: ago(0) },
  ])
  .run();

// ---- 一覧ページ用に、盤に出ないタスクと記録も少しだけ ------------------------
db.insert(schema.tasks)
  .values({
    id: newId("task"),
    title: "経費のレシートをまとめる",
    workstreamId: null,
    milestoneId: null,
    ownerId: soya,
    status: "todo",
    priority: "p2",
    dueDate: day(4),
    note: null,
    completedAt: null,
    sortOrder: 900,
    createdAt: ago(3),
    updatedAt: ago(3),
  })
  .run();

db.insert(schema.updates)
  .values({
    id: newId("upd"),
    workstreamId: now.wsId,
    authorId: soya,
    what: "VTuber 3人にDMを送った",
    result: "1人が興味あり、日程調整中",
    next: "残り7人に送る",
    milestoneId: dm,
    valueBefore: null,
    valueAfter: null,
    createdAt: ago(1),
  })
  .run();

db.update(schema.workspace).set({ focusObjectiveId: now.id }).run();

console.log("seeded:");
console.log(`  期間 3件 (${past.title} / ${now.title} / ${next.title})`);
console.log(`  積み木 ${msOrder}件 / サブタスク ${taskOrder}件 / メンバー 3人`);
