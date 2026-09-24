/**
 * aiment の MCP ツール一式。
 *
 * **ここに書いたものを、2つの入口が同じように使う**:
 *   ・Vercel 上の  /api/mcp          (HTTP。相方もURLだけで使える)
 *   ・手元の       npm run mcp       (stdio。開発用)
 *
 * どのツールも中で新しい処理はしない。盤の画面と同じ src/lib/services を呼ぶだけ。
 * だから AI が見る積み木と、画面に出ている積み木は必ず一致する。
 *
 * 書き込みは activity_log に actor_type='agent' として残る(誰がやったか分かる)。
 * 盤を開いている人には、Liveblocks で「変わったよ」を送るので、再読み込みなしで映る。
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/server";
import { Liveblocks } from "@liveblocks/node";
import { getDb, schema } from "@/lib/db";
import { ACCOUNTS } from "@/lib/accounts";
import { CONTACT_KIND, CONTACT_STATUS, type ContactKind, type ContactStatus } from "@/lib/constants";
import { detectAddress } from "@/lib/contacts-ui";
import type { Actor } from "@/lib/services/activity";
import { getBriefing, resolveMember } from "@/lib/services/briefing";
import * as contacts from "@/lib/services/contacts";
import * as milestones from "@/lib/services/milestones";
import * as periods from "@/lib/services/periods";
import * as tasks from "@/lib/services/tasks";

const MEMBER_HINT = `メンバーは ${ACCOUNTS.map((a) => a.name).join(" / ")} の名前で指定する`;
const member = z.string().describe(MEMBER_HINT);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

/** 結果を AI に返す形。JSON をそのまま文字にして渡す(AI は JSON を読むのが得意) */
const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

// ---- 書き込みのあと片づけ ------------------------------------------------------

/** 積み木がどの期間(盤)にあるか */
async function periodOfBlock(blockId: string): Promise<string | null> {
  const db = getDb();
  const m = (await db.select().from(schema.milestones).where(eq(schema.milestones.id, blockId)))[0];
  if (!m) return null;
  const ws = (await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, m.workstreamId)))[0];
  return ws?.objectiveId ?? null;
}

async function blockOfSubtask(taskId: string): Promise<string | null> {
  const t = (await getDb().select().from(schema.tasks).where(eq(schema.tasks.id, taskId)))[0];
  return t?.milestoneId ?? null;
}

/**
 * 盤を開いている人へ「変わったよ」を送る(画面側の合図と同じもの)。
 * 失敗しても書き込み自体は済んでいるので、黙って諦める。
 */
async function notifyBoard(periodId: string | null) {
  const key = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!key || !periodId) return;
  try {
    await new Liveblocks({ secret: key }).broadcastEvent(`board:${periodId}`, { type: "board-changed" });
  } catch {
    // 誰も開いていない部屋でも失敗することがある。問題ない
  }
}

async function mustBlock(id: string) {
  const p = await periodOfBlock(id);
  if (!p) throw new Error(`積み木が見つかりません: ${id}(get_board で id を確かめてください)`);
  return p;
}

// ---- 登録 ----------------------------------------------------------------------

export function registerAimentTools(server: McpServer, actor: Actor) {
  // ==== 読む ====

  server.registerTool(
    "get_briefing",
    {
      title: "今日なにやる？",
      description:
        "今の期間で「手をつけるべき積み木」と「連絡すべき相手」を、理由つき・目安の優先度順で返す。" +
        "『何からやる？』『今日のタスクは？』『いま何が詰まってる？』と聞かれたら最初にこれを使う。" +
        "理由(期限切れ・期限が近い・重要・止まっている・取り組み中・返事待ちが長い など)を根拠として答えること。" +
        "member を渡すとその人の担当・取り組み中だけに絞る。",
      inputSchema: z.object({ member: member.optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ member: m }) => ok(await getBriefing({ member: m ?? null })),
  );

  server.registerTool(
    "list_periods",
    {
      title: "期間の一覧",
      description: "盤の期間(フェーズ)を並び順で返す。is_now=true が今日を含む期間。別の期間を見たいときに id を調べるのに使う。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ok(await periods.listPeriods()),
  );

  server.registerTool(
    "get_board",
    {
      title: "盤を見る",
      description:
        "ある期間の盤をまるごと返す: 期間の目標と、全部の積み木(担当・期限・状態・重要・取り組み中の人・サブタスク)。" +
        "period_id を省くと今日の期間。積み木やサブタスクを書きかえる前に id を確かめるのにも使う。" +
        "status が achieved の積み木は完了済み。",
      inputSchema: z.object({ period_id: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ period_id }) => {
      const id = period_id ?? (await periods.defaultPeriodId());
      if (!id) return ok("まだ期間がありません");
      const board = await periods.getPeriodBoard(id);
      if (!board) throw new Error(`期間が見つかりません: ${id}`);
      return ok({
        period: board.period,
        blocks: board.blocks.map((b) => ({
          id: b.id,
          title: b.title,
          status: b.status,
          owner: b.owner?.name ?? null,
          due_date: b.due_date,
          important: b.important,
          working: b.workers.map((w) => w.name),
          stacked_on: b.parent_id,
          subtasks: b.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
        })),
      });
    },
  );

  server.registerTool(
    "list_contacts",
    {
      title: "連絡先を見る",
      description:
        "協力してくれるユーザー・VTuber などの連絡先。段階(candidate 候補 / contacted 声かけ済み / waiting 返事待ち / " +
        "active 協力中 / passed 見送り)と、最後に連絡した日を返す。kind・status・query で絞れる。",
      inputSchema: z.object({
        kind: z.enum(CONTACT_KIND).optional(),
        status: z.enum(CONTACT_STATUS).optional(),
        query: z.string().optional().describe("名前・ID・メモの部分一致"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ kind, status, query }) => {
      const q = query?.toLowerCase();
      const list = (await contacts.listContacts()).filter(
        (c) =>
          (!kind || c.kind === kind) &&
          (!status || c.status === status) &&
          (!q || [c.name, c.handle, c.discord, c.email, c.note].filter(Boolean).join(" ").toLowerCase().includes(q)),
      );
      return ok(list.map((c) => ({ ...c, owner: ACCOUNTS.find((a) => a.id === c.owner_id)?.name ?? null })));
    },
  );

  // ==== 書く: 積み木 ====

  server.registerTool(
    "create_block",
    {
      title: "積み木を置く",
      description: "盤に新しい積み木(やること)を置く。period_id を省くと今日の期間。置いた積み木の id を返す。",
      inputSchema: z.object({
        title: z.string().min(1),
        period_id: z.string().optional(),
        owner: member.optional(),
        due_date: date.optional(),
        important: z.boolean().optional(),
      }),
    },
    async ({ title, period_id, owner, due_date, important }) => {
      const pid = period_id ?? (await periods.defaultPeriodId());
      if (!pid) throw new Error("期間がありません。先に盤で期間を作ってください");
      const who = resolveMember(owner ?? null);
      const ws = await periods.ensureDefaultWorkstream(pid, who?.id ?? ACCOUNTS[0].id);
      const id = await milestones.createMilestone(
        { workstream_id: ws, title, target_value: 1, owner_id: who?.id ?? null, due_date: due_date ?? null },
        actor,
      );
      if (important) await milestones.updateMilestone(id, { important: true }, actor);
      await notifyBoard(pid);
      return ok({ id, message: `「${title}」を置きました` });
    },
  );

  server.registerTool(
    "update_block",
    {
      title: "積み木を書きかえる",
      description:
        "積み木の名前・担当・期限・重要の旗を変える。渡した項目だけ変わる。" +
        "期限や担当を外すときは clear_due / clear_owner を true にする。",
      inputSchema: z.object({
        block_id: z.string(),
        title: z.string().min(1).optional(),
        owner: member.optional(),
        clear_owner: z.boolean().optional(),
        due_date: date.optional(),
        clear_due: z.boolean().optional(),
        important: z.boolean().optional(),
      }),
    },
    async ({ block_id, title, owner, clear_owner, due_date, clear_due, important }) => {
      const pid = await mustBlock(block_id);
      const patch: Parameters<typeof milestones.updateMilestone>[1] = {};
      if (title !== undefined) patch.title = title;
      if (owner !== undefined) patch.owner_id = resolveMember(owner)!.id;
      if (clear_owner) patch.owner_id = null;
      if (due_date !== undefined) patch.due_date = due_date;
      if (clear_due) patch.due_date = null;
      if (important !== undefined) patch.important = important;
      await milestones.updateMilestone(block_id, patch, actor);
      await notifyBoard(pid);
      return ok("書きかえました");
    },
  );

  server.registerTool(
    "set_block_done",
    {
      title: "積み木をできたにする",
      description: "積み木を完了(done=true)にする、または未完了に戻す(done=false)。",
      inputSchema: z.object({ block_id: z.string(), done: z.boolean() }),
    },
    async ({ block_id, done }) => {
      const pid = await mustBlock(block_id);
      const row = (await getDb().select().from(schema.milestones).where(eq(schema.milestones.id, block_id)))[0];
      await milestones.updateMilestoneProgress(block_id, done ? row.targetValue : 0, actor, { skip_update_row: true });
      await notifyBoard(pid);
      return ok(done ? "できたにしました" : "未完了に戻しました");
    },
  );

  server.registerTool(
    "set_working",
    {
      title: "取り組み中の旗",
      description: "ある人が積み木に「いま取り組んでいる」印を付ける(working=true)/外す(false)。担当者とは別。",
      inputSchema: z.object({ block_id: z.string(), member, working: z.boolean() }),
    },
    async ({ block_id, member: m, working }) => {
      const pid = await mustBlock(block_id);
      await periods.setWorkingOnBlock(block_id, resolveMember(m)!.id, working, actor);
      await notifyBoard(pid);
      return ok(working ? "取り組み中にしました" : "取り組み中を外しました");
    },
  );

  server.registerTool(
    "delete_block",
    {
      title: "積み木を片づける",
      description: "積み木を盤から片づける。消えるのではなく「片づけた」状態になるので、盤の ⌘Z や restore=true で戻せる。",
      inputSchema: z.object({ block_id: z.string(), restore: z.boolean().optional() }),
      annotations: { destructiveHint: true },
    },
    async ({ block_id, restore }) => {
      const pid = await mustBlock(block_id);
      await milestones.setMilestoneStatus(block_id, restore ? "not_started" : "dropped", actor);
      await notifyBoard(pid);
      return ok(restore ? "戻しました" : "片づけました");
    },
  );

  // ==== 書く: サブタスク ====

  server.registerTool(
    "add_subtask",
    {
      title: "サブタスクを足す",
      description: "積み木の中に小さなやること(サブタスク)を足す。",
      inputSchema: z.object({ block_id: z.string(), title: z.string().min(1), owner: member.optional() }),
    },
    async ({ block_id, title, owner }) => {
      const pid = await mustBlock(block_id);
      const block = (await getDb().select().from(schema.milestones).where(eq(schema.milestones.id, block_id)))[0];
      const who = resolveMember(owner ?? null)?.id ?? block.ownerId ?? ACCOUNTS[0].id;
      const id = await tasks.createTask({ title, owner_id: who, milestone_id: block_id }, actor);
      await notifyBoard(pid);
      return ok({ id, message: `サブタスク「${title}」を足しました` });
    },
  );

  server.registerTool(
    "update_subtask",
    {
      title: "サブタスクを書きかえる",
      description: "サブタスクを完了にする(done)・名前を変える・消す(delete=true)。",
      inputSchema: z.object({
        subtask_id: z.string(),
        done: z.boolean().optional(),
        title: z.string().min(1).optional(),
        delete: z.boolean().optional(),
      }),
    },
    async ({ subtask_id, done, title, delete: del }) => {
      const blockId = await blockOfSubtask(subtask_id);
      if (!blockId) throw new Error(`サブタスクが見つかりません: ${subtask_id}`);
      const patch: Parameters<typeof tasks.updateTask>[1] = {};
      if (done !== undefined) patch.status = done ? "done" : "todo";
      if (title !== undefined) patch.title = title;
      if (del) patch.status = "dropped";
      await tasks.updateTask(subtask_id, patch, actor);
      await notifyBoard(await periodOfBlock(blockId));
      return ok("書きかえました");
    },
  );

  // ==== 書く: 連絡先 ====

  const address = z
    .string()
    .describe("X の ID や URL、Discord 名、メール、ページの URL。種類は自動で見分ける(address_type で指定も可)");
  const addressType = z.enum(["x", "discord", "email", "url"]).optional();
  const KEY = { x: "handle", discord: "discord", email: "email", url: "url" } as const;

  /** 連絡先の文字列を、どの列に入れるか決める */
  function addressPatch(raw: string, type?: keyof typeof KEY) {
    const found = detectAddress(raw);
    if (!found) return {};
    const key = type ? KEY[type] : found.key;
    const value = type && KEY[type] !== found.key ? raw.trim() : found.value;
    return { [key]: value } as Partial<contacts.ContactInput>;
  }

  server.registerTool(
    "create_contact",
    {
      title: "連絡先を足す",
      description: "協力してくれそうな人を連絡先に足す。kind は user(ユーザー) / vtuber / other。",
      inputSchema: z.object({
        name: z.string().min(1),
        kind: z.enum(CONTACT_KIND),
        status: z.enum(CONTACT_STATUS).optional(),
        address: address.optional(),
        address_type: addressType,
        owner: member.optional(),
        note: z.string().optional(),
      }),
    },
    async ({ name, kind, status, address: a, address_type, owner, note }) => {
      const id = await contacts.createContact(
        {
          name,
          kind: kind as ContactKind,
          status: status as ContactStatus | undefined,
          owner_id: resolveMember(owner ?? null)?.id ?? null,
          note: note ?? null,
          ...(a ? addressPatch(a, address_type) : {}),
        },
        actor,
      );
      return ok({ id, message: `「${name}」を足しました` });
    },
  );

  server.registerTool(
    "update_contact",
    {
      title: "連絡先を書きかえる",
      description:
        "連絡先の段階を進める(例: 声をかけた → contacted、返事待ち → waiting、協力が決まった → active)、" +
        "連絡先を足す、担当や備考を変える。段階を contacted / waiting にすると最後に連絡した日が今日になる。" +
        "note は上書きなので、追記したいときは今の内容に足して渡す。",
      inputSchema: z.object({
        contact_id: z.string(),
        status: z.enum(CONTACT_STATUS).optional(),
        name: z.string().min(1).optional(),
        kind: z.enum(CONTACT_KIND).optional(),
        address: address.optional(),
        address_type: addressType,
        owner: member.optional(),
        note: z.string().optional(),
      }),
    },
    async ({ contact_id, status, name, kind, address: a, address_type, owner, note }) => {
      if (!(await contacts.getContact(contact_id))) throw new Error(`連絡先が見つかりません: ${contact_id}`);
      await contacts.updateContact(
        contact_id,
        {
          ...(status ? { status: status as ContactStatus } : {}),
          ...(name ? { name } : {}),
          ...(kind ? { kind: kind as ContactKind } : {}),
          ...(owner ? { owner_id: resolveMember(owner)!.id } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(a ? addressPatch(a, address_type) : {}),
        },
        actor,
      );
      return ok("書きかえました");
    },
  );
}
