/**
 * 積み木ボードのデモデータ。
 * 実行: npm run seed   (既存データを消します — デモ/開発用)
 *
 * public/DashBoard_image.png と同じ絵になるように、
 * 「VTuber、ユーザー確保フェーズ」の盤を座標つきで作る。
 * 前後にも期間を1つずつ置いてあるので、← → がすぐ試せる。
 */
import { getDb, getSql, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { ACCOUNTS } from "@/lib/accounts";

/*
 * 安全弁: このスクリプトは全部消してから入れ直す。
 * つないでいる先が localhost でないときは、SEED_CONFIRM=1 が無いと動かない
 * (本番のDBを間違って空にしないため)。
 */
const url = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(url);
if (!url) {
  console.error("DATABASE_URL がありません。");
  process.exit(1);
}
if (!local && process.env.SEED_CONFIRM !== "1") {
  console.error(
    `これは localhost ではありません: ${url.replace(/:[^:@/]*@/, ":****@")}\n` +
      "本当に全部消して入れ直すなら SEED_CONFIRM=1 を付けてください。",
  );
  process.exit(1);
}

async function main() {
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
  await db.delete(schema.activityLog);
  await db.delete(schema.updates);
  await db.delete(schema.blockers);
  await db.delete(schema.blockWorkers);
  await db.delete(schema.tasks);
  await db.delete(schema.milestones);
  await db.delete(schema.workstreams);
  await db.delete(schema.objectives);
  await db.delete(schema.members);

  // ---- メンバー = 決まった3アカウント(src/lib/accounts.ts が正) ----------------
  const [soya, futo, other] = ACCOUNTS.map((a) => a.id);
  await db.insert(schema.members).values(
    ACCOUNTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: null,
        authUserId: null,
      isActive: 1,
      createdAt: ago(60),
    })),
  );

  // ---- 期間 = objectives。sort_order が ← → の並び。 -------------------------
  interface PeriodSeed {
    id: string;
    wsId: string;
    title: string;
    start: string;
    end: string;
    order: number;
  }
  async function period(title: string, start: string, end: string, order: number): Promise<PeriodSeed> {
    const id = newId("obj");
    const wsId = newId("ws");
    await db.insert(schema.objectives)
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
      });
    await db.insert(schema.workstreams)
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
      });
    return { id, wsId, title, start, end, order };
  }

  const past = await period("インドネシア需要検証フェーズ", day(-36), day(-1), 0);
  const now = await period("VTuber、ユーザー確保フェーズ", day(0), day(30), 1);
  const next = await period("収益化テストフェーズ", day(31), day(61), 2);

  // ---- 積み木 = milestones -----------------------------------------------------
  let msOrder = 0;
  async function block(
    p: PeriodSeed,
    title: string,
    owner: string,
    x: number,
    y: number,
    opts: { due?: string | null; done?: boolean; important?: boolean } = {},
  ): Promise<string> {
    const id = newId("ms");
    await db.insert(schema.milestones)
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
      });
    return id;
  }

  let taskOrder = 0;
  async function sub(blockId: string, wsId: string, title: string, owner: string, done = false) {
    const id = newId("task");
    await db.insert(schema.tasks)
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
      });
    return id;
  }

  // いまの期間 — 画像とおなじ配置(紙の座標)
  const dm = await block(now, "VTuber 10人にDMを送る", soya, 120, 80);
  await sub(dm, now.wsId, "候補リストを作る", soya, true);
  await sub(dm, now.wsId, "文面のたたきを書く", futo, true);
  await sub(dm, now.wsId, "5人に送る", soya);
  await sub(dm, now.wsId, "返信を記録する", other);
  await sub(dm, now.wsId, "断られた理由を聞く", futo);

  const script = await block(now, "初回セッションの台本を固める", futo, 500, 80, { due: day(1) });
  await sub(script, now.wsId, "流れを30分ぶん書く", futo);
  await sub(script, now.wsId, "Soyaに読んでもらう", soya);

  const discord = await block(now, "Discordサーバーを開く", soya, 860, 220);
  await sub(discord, now.wsId, "チャンネル構成を決める", other);

  const session = await block(now, "体験セッションを3回やる", other, 680, 340);
  await sub(session, now.wsId, "1回目の日程を決める", other);
  await sub(session, now.wsId, "録画の許可をもらう", soya);

  // 期限は先だが、手で「重要」の旗を立てた例
  const feedback = await block(now, "フィードバックを10件集める", other, 530, 460, { important: true });
  await sub(feedback, now.wsId, "聞くことを5つに絞る", futo);

  // 前の期間(だいたい終わっている)
  const survey = await block(past, "アンケート30件を集める", soya, 120, 80, { done: true });
  await sub(survey, past.wsId, "フォームを作る", soya, true);
  await sub(survey, past.wsId, "3コミュニティに投稿", other, true);
  await block(past, "インタビュー5人ぶん", futo, 500, 200, { done: true });
  await block(past, "有料意向を3人から取る", soya, 300, 400, { due: day(-3) });

  // 次の期間(まだ置いただけ)
  await block(next, "価格を2案つくる", soya, 120, 80);
  await block(next, "決済まわりを調べる", futo, 500, 190);

  // ---- いま取り組んでいる人(担当者とは別) ------------------------------------
  await db.insert(schema.blockWorkers)
    .values([
      { id: newId("bw"), milestoneId: dm, memberId: soya, startedAt: ago(1) },
      { id: newId("bw"), milestoneId: script, memberId: futo, startedAt: ago(0) },
      { id: newId("bw"), milestoneId: script, memberId: soya, startedAt: ago(0) },
    ]);

  // ---- 一覧ページ用に、盤に出ないタスクと記録も少しだけ ------------------------
  await db.insert(schema.tasks)
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
    });

  await db.insert(schema.updates)
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
    });

  await db.update(schema.workspace).set({ focusObjectiveId: now.id });

  console.log("seeded:");
  console.log(`  期間 3件 (${past.title} / ${now.title} / ${next.title})`);
  console.log(`  積み木 ${msOrder}件 / サブタスク ${taskOrder}件 / メンバー 3人`);


  await getSql().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
