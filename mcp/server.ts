/**
 * aiment Dashboard MCP server (stdio)
 *
 * ダッシュボードと同一のサービス層を1:1でツール化する薄いラッパー。
 * ビジネスロジックはすべて src/lib/services/ にあり、ここには一切書かない。
 *
 * 起動:   npm run mcp            (リポジトリ外から起動されてもDBパスが合うよう chdir する)
 * 登録例: claude mcp add aiment -- npx tsx /path/to/aiment_Dashboard/mcp/server.ts
 * 書き込みは activity_log に actor_type='agent' として記録される
 * (エージェント名は環境変数 AIMENT_AGENT_NAME、既定 "mcp")。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

// サービス層は process.cwd()/data/aiment.db を開くため、必ずリポジトリルートに移動する
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Actor } from "@/lib/services/activity";
import * as dashboard from "@/lib/services/dashboard";
import * as objectives from "@/lib/services/objectives";
import * as workstreams from "@/lib/services/workstreams";
import * as milestones from "@/lib/services/milestones";
import * as tasks from "@/lib/services/tasks";
import * as blockers from "@/lib/services/blockers";
import * as updates from "@/lib/services/updates";
import * as members from "@/lib/services/members";

const actor: Actor = { type: "agent", id: process.env.AIMENT_AGENT_NAME ?? "mcp" };

type Args = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
const n = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));

interface Tool {
  description: string;
  inputSchema: object;
  handler: (args: Args) => Promise<unknown>;
}

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const obj = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});

const TOOLS: Record<string, Tool> = {
  // ---- 読み取り ----
  get_dashboard_summary: {
    description:
      "「aiment今どんな感じ？」に一発で答える。フォーカス目標(進捗・確信度・ヘルス)、ワークストリーム、ブロッカー(年齢付き)、最近の更新、週次デルタ、無音日数 — ダッシュボード画面とまったく同じデータ。",
    inputSchema: obj({}),
    handler: () => dashboard.getDashboardSummary(),
  },
  get_current_focus: {
    description: "現在のフォーカス目標の要約(進捗・確信度・ヘルス・残り日数)のみ。",
    inputSchema: obj({}),
    handler: () => dashboard.getCurrentFocus(),
  },
  get_my_tasks: {
    description:
      "「今日僕は何をすべき？」用。指定メンバーの未完了タスクを優先度順(p0→期限超過→期限近い順)で返す。各タスクはどのマイルストーン(証拠)に貢献するかを持つ。",
    inputSchema: obj({ member_id: str("メンバーID (mem_...)") }, ["member_id"]),
    handler: (a) => tasks.getMyTasks(String(a.member_id)),
  },
  list_members: {
    description: "メンバー一覧(id・名前・役割)。get_my_tasks のIDはここから。",
    inputSchema: obj({}),
    handler: () => members.listMembers(),
  },
  list_objectives: {
    description: "目標一覧(フォーカスかどうか・状態つき)。",
    inputSchema: obj({}),
    handler: () => objectives.listObjectives(),
  },
  get_objective: {
    description: "目標の詳細: 全マイルストーン・重み・確信度の履歴つき。",
    inputSchema: obj({ id: str("目標ID (obj_...)") }, ["id"]),
    handler: (a) => objectives.getObjective(String(a.id)),
  },
  list_workstreams: {
    description: "ワークストリーム一覧(ヘルス・鮮度・進捗・現在のマイルストーン・次の一手つき)。",
    inputSchema: obj({ objective_id: str("目標IDで絞り込み(任意)") }),
    handler: (a) => workstreams.listWorkstreams(s(a.objective_id)),
  },
  list_milestones: {
    description: "マイルストーン(証拠の状態)一覧。current/target/unit が進捗の唯一の根拠。",
    inputSchema: obj({ workstream_id: str("ワークストリームIDで絞り込み(任意)") }),
    handler: (a) => milestones.listMilestones(s(a.workstream_id)),
  },
  list_tasks: {
    description: "タスク一覧(フィルタ可)。",
    inputSchema: obj({
      owner_id: str("担当メンバーID(任意)"),
      status: str("todo | in_progress | done | dropped(任意)"),
      workstream_id: str("ワークストリームID(任意)"),
    }),
    handler: (a) =>
      tasks.listTasks({
        owner_id: s(a.owner_id),
        status: s(a.status),
        workstream_id: s(a.workstream_id),
      }),
  },
  get_blockers: {
    description: "ブロッカー一覧。古い順(年齢=最重要情報)。解除条件と解除責任者つき。",
    inputSchema: obj({ status: str("active(既定) | resolved") }),
    handler: (a) => blockers.getBlockers(a.status === "resolved" ? "resolved" : "active"),
  },
  get_recent_updates: {
    description: "最近の更新(人間が書いた鼓動)。カウンター変化のprovenance(15→18)つき。",
    inputSchema: obj({
      limit: num("件数(既定10)"),
      workstream_id: str("ワークストリームIDで絞り込み(任意)"),
    }),
    handler: (a) =>
      updates.getRecentUpdates({ limit: n(a.limit), workstream_id: s(a.workstream_id) }),
  },

  // ---- 書き込み ----
  create_task: {
    description: "タスクを作成。milestone_id を渡すと workstream は自動推定される。",
    inputSchema: obj(
      {
        title: str("タスク名"),
        owner_id: str("担当メンバーID"),
        workstream_id: str("ワークストリームID(任意)"),
        milestone_id: str("貢献するマイルストーンID(任意)"),
        priority: str("p0 | p1(既定) | p2"),
        due_date: str("期限 YYYY-MM-DD(任意)"),
        note: str("メモ(任意)"),
      },
      ["title", "owner_id"],
    ),
    handler: (a) =>
      tasks.createTask(
        {
          title: String(a.title),
          owner_id: String(a.owner_id),
          workstream_id: s(a.workstream_id) ?? null,
          milestone_id: s(a.milestone_id) ?? null,
          priority: s(a.priority),
          due_date: s(a.due_date) ?? null,
          note: s(a.note) ?? null,
        },
        actor,
      ),
  },
  update_task: {
    description: "タスクを更新(状態・優先度・期限・担当など)。",
    inputSchema: obj(
      {
        id: str("タスクID (task_...)"),
        title: str("(任意)"),
        status: str("todo | in_progress | done | dropped(任意)"),
        priority: str("p0 | p1 | p2(任意)"),
        due_date: str("YYYY-MM-DD(任意)"),
        owner_id: str("(任意)"),
        milestone_id: str("(任意)"),
      },
      ["id"],
    ),
    handler: async (a) => {
      await tasks.updateTask(
        String(a.id),
        {
          ...(a.title !== undefined && { title: String(a.title) }),
          ...(a.status !== undefined && { status: String(a.status) }),
          ...(a.priority !== undefined && { priority: String(a.priority) }),
          ...(a.due_date !== undefined && { due_date: s(a.due_date) ?? null }),
          ...(a.owner_id !== undefined && { owner_id: String(a.owner_id) }),
          ...(a.milestone_id !== undefined && { milestone_id: s(a.milestone_id) ?? null }),
        },
        actor,
      );
      return { ok: true };
    },
  },
  add_progress_update: {
    description:
      "更新を記録する(30秒の儀式と同じ)。what のみ必須。milestone_id + new_value でカウンターも同時に動かせる(provenance付き)。blocker_title を渡すとブロッカーも起票。",
    inputSchema: obj(
      {
        workstream_id: str("ワークストリームID"),
        author_id: str("記録者のメンバーID"),
        what: str("何があったか(必須・一行)"),
        result: str("結果(任意)"),
        next: str("次にやること(任意)"),
        milestone_id: str("動かすマイルストーンID(任意)"),
        new_value: num("マイルストーンの新しい現在値(任意)"),
        blocker_title: str("新規ブロッカーのタイトル(任意)"),
        blocker_detail: str("解除条件(任意)"),
      },
      ["workstream_id", "author_id", "what"],
    ),
    handler: (a) =>
      updates.addUpdate(
        {
          workstream_id: String(a.workstream_id),
          author_id: String(a.author_id),
          what: String(a.what),
          result: s(a.result) ?? null,
          next: s(a.next) ?? null,
          milestone_id: s(a.milestone_id) ?? null,
          new_value: n(a.new_value) ?? null,
          blocker: a.blocker_title
            ? { title: String(a.blocker_title), detail: s(a.blocker_detail) ?? null }
            : null,
        },
        actor,
      ),
  },
  update_milestone_progress: {
    description: "マイルストーンのカウンターを更新(18→19)。目標到達で自動的に達成になる。",
    inputSchema: obj(
      {
        milestone_id: str("マイルストーンID (ms_...)"),
        new_value: num("新しい現在値"),
        note: str("何があったか(任意、書くと更新フィードにも載る)"),
      },
      ["milestone_id", "new_value"],
    ),
    handler: (a) =>
      milestones.updateMilestoneProgress(String(a.milestone_id), Number(a.new_value), actor, {
        note: s(a.note),
      }),
  },
  create_milestone: {
    description:
      "マイルストーンを作成。ルール: 外の世界の反応(『30人が回答』)であること。target_value + unit 必須の設計。",
    inputSchema: obj(
      {
        workstream_id: str("ワークストリームID"),
        title: str("達成状態(例: 30人がアンケートに回答)"),
        target_value: num("目標値"),
        unit: str("単位(例: 回答)"),
        weight: num("目標内での重み(既定1)"),
        due_date: str("期限 YYYY-MM-DD(任意)"),
      },
      ["workstream_id", "title", "target_value"],
    ),
    handler: (a) =>
      milestones.createMilestone(
        {
          workstream_id: String(a.workstream_id),
          title: String(a.title),
          target_value: Number(a.target_value),
          unit: s(a.unit) ?? null,
          weight: n(a.weight),
          due_date: s(a.due_date) ?? null,
        },
        actor,
      ),
  },
  create_blocker: {
    description: "ブロッカーを起票。owner_id は「解除の責任者」。detail には解除条件をお願い形式で。",
    inputSchema: obj(
      {
        title: str("何が詰まっているか"),
        workstream_id: str("ワークストリームID"),
        owner_id: str("解除責任者のメンバーID"),
        detail: str("何があれば解除できるか(任意)"),
        severity: str("critical | high(既定) | medium"),
      },
      ["title", "workstream_id", "owner_id"],
    ),
    handler: (a) =>
      blockers.createBlocker(
        {
          title: String(a.title),
          workstream_id: String(a.workstream_id),
          owner_id: String(a.owner_id),
          detail: s(a.detail) ?? null,
          severity: s(a.severity),
        },
        actor,
      ),
  },
  resolve_blocker: {
    description: "ブロッカーを解決。どう解決したか(resolution)は学びの記録として必須。",
    inputSchema: obj(
      { blocker_id: str("ブロッカーID (blk_...)"), resolution: str("どう解決したか") },
      ["blocker_id", "resolution"],
    ),
    handler: async (a) => {
      await blockers.resolveBlocker(String(a.blocker_id), String(a.resolution), actor);
      return { ok: true };
    },
  },
  update_health: {
    description:
      "ワークストリームのヘルスを更新(人間の判断の代行は慎重に)。on_track 以外は理由(note)必須。同じ値でも記録すれば鮮度がリセットされ「更新切れ」が消える。",
    inputSchema: obj(
      {
        workstream_id: str("ワークストリームID"),
        health: str("on_track | at_risk | off_track"),
        note: str("なぜ？(on_track以外は必須)"),
      },
      ["workstream_id", "health"],
    ),
    handler: async (a) => {
      await workstreams.updateHealth(
        String(a.workstream_id),
        String(a.health) as "on_track" | "at_risk" | "off_track",
        s(a.note) ?? null,
        actor,
      );
      return { ok: true };
    },
  },
  set_next_action: {
    description: "ワークストリームの「次の一手」(一行)を設定。",
    inputSchema: obj(
      { workstream_id: str("ワークストリームID"), next_action: str("次に何をすべきか(一行)") },
      ["workstream_id", "next_action"],
    ),
    handler: async (a) => {
      await workstreams.setNextAction(String(a.workstream_id), s(a.next_action) ?? null, actor);
      return { ok: true };
    },
  },
  set_confidence: {
    description:
      "目標の確信度(仮説をまだ信じているか)を更新。理由(note)必須。変更は履歴に残りトレンド(↓↑)になる。",
    inputSchema: obj(
      {
        objective_id: str("目標ID (obj_...)"),
        confidence: str("high | medium | low"),
        note: str("なぜ？(必須・一行)"),
      },
      ["objective_id", "confidence", "note"],
    ),
    handler: async (a) => {
      await objectives.setConfidence(
        String(a.objective_id),
        String(a.confidence) as "high" | "medium" | "low",
        String(a.note),
        actor,
      );
      return { ok: true };
    },
  },
};

const server = new Server(
  { name: "aiment-dashboard", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS[req.params.name];
  if (!tool) {
    return {
      content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }
  try {
    const result = await tool.handler((req.params.arguments ?? {}) as Args);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aiment MCP server ready (stdio)");
}

main().catch((e) => {
  console.error("aiment MCP server failed:", e);
  process.exit(1);
});
