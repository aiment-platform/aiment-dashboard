/* MCP の E2E。本物の MCP クライアント(公式SDK)で /api/mcp を叩く。
   読む・書く・鍵の確認・「AIが書いたら開いている盤に映るか」まで通す。
   前提: dev サーバー + .env.local の MCP_TOKEN。 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = "http://localhost:3939";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};
const env = readFileSync(".env.local", "utf8");
const token = env.match(/^MCP_TOKEN=(.+)$/m)?.[1]?.trim();
const realtime = /^LIVEBLOCKS_SECRET_KEY=\S+/m.test(env);
if (!token) { console.log("MCP_TOKEN が無いのでスキップ\n0/0 passed"); process.exit(0); }

// ---- 鍵 ----
const post = (auth) => fetch(`${BASE}/api/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: auth } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
ok("鍵なしは 401", (await post(null)).status === 401);
ok("違う鍵は 401", (await post("Bearer wrong")).status === 401);

const client = new Client({ name: "e2e", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
}));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
};

// ---- 読む ----
const { tools } = await client.listTools();
ok("正しい鍵ならツールが見える(13個)", tools.length === 13, tools.map((t) => t.name).join(","));
ok("読む道具には読み取り専用の印が付いている", tools.filter((t) => t.annotations?.readOnlyHint).length === 4);
const brief = await call("get_briefing");
ok("get_briefing は今の期間を返す", typeof brief.period?.title === "string", brief.period?.title);
ok("積み木ごとに理由が付いている", brief.blocks.length > 0 && brief.blocks.every((b) => Array.isArray(b.reasons)));
ok("優先度の目安順に並んでいる", brief.blocks.every((b, i, a) => i === 0 || a[i - 1].score >= b.score));
const futoOnly = await call("get_briefing", { member: "Futo" });
ok("member で絞れる", futoOnly.for_member === "Futo" && futoOnly.blocks.length <= brief.blocks.length);
const board = await call("get_board");
ok("get_board は盤の積み木を返す", board.blocks.length > 0);
ok("list_periods は期間を返す", (await call("list_periods")).length >= 1);
ok("list_contacts で段階を絞れる", (await call("list_contacts", { status: "waiting" })).every((c) => c.status === "waiting"));
let threw = false;
try { await call("get_briefing", { member: "Taro" }); } catch { threw = true; }
ok("知らないメンバーはエラーで知らせる", threw);

// ---- 書く(盤を開いた状態で。AI の書き込みが再読み込みなしで映るか) ----
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies([{ name: "aiment_account", value: "mem_soya", domain: "localhost", path: "/", sameSite: "Lax" }]);
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await page.waitForTimeout(3000);
const n0 = await page.locator("[data-block]").count();

const title = `MCPの積み木 ${Date.now().toString(36)}`;
const made = await call("create_block", { title, owner: "Futo", due_date: "2099-01-01", important: true });
ok("create_block で積み木を置ける", typeof made.id === "string");
if (realtime) {
  await page.waitForTimeout(3000);
  ok("AI が置いた積み木が、開いている盤に再読み込みなしで映る", (await page.locator("[data-block]").count()) === n0 + 1);
}
let b = (await call("get_board")).blocks.find((x) => x.id === made.id);
ok("担当・期限・重要が入っている", b?.owner === "Futo" && b.due_date === "2099-01-01" && b.important === true);

await call("update_block", { block_id: made.id, title: title + "改", owner: "Soya", clear_due: true, important: false });
b = (await call("get_board")).blocks.find((x) => x.id === made.id);
ok("update_block で名前・担当・期限・旗を変えられる", b.title === title + "改" && b.owner === "Soya" && b.due_date === null && b.important === false);

const sub = await call("add_subtask", { block_id: made.id, title: "下書き" });
await call("update_subtask", { subtask_id: sub.id, done: true });
b = (await call("get_board")).blocks.find((x) => x.id === made.id);
ok("サブタスクを足して完了にできる", b.subtasks.length === 1 && b.subtasks[0].done);

await call("set_working", { block_id: made.id, member: "Futo", working: true });
b = (await call("get_board")).blocks.find((x) => x.id === made.id);
ok("取り組み中の旗を立てられる", b.working.includes("Futo"));

await call("set_block_done", { block_id: made.id, done: true });
b = (await call("get_board")).blocks.find((x) => x.id === made.id);
ok("できたにできる", b.status === "achieved");

threw = false;
try { await call("update_block", { block_id: "ms_nope", title: "x" }); } catch { threw = true; }
ok("無い積み木を指すとエラーで知らせる", threw);

// 連絡先: 住所の種類を自動で見分ける
const person = await call("create_contact", { name: "MCPテスト", kind: "vtuber", address: "https://x.com/mcp_test?s=1", owner: "Futo" });
await call("update_contact", { contact_id: person.id, status: "waiting", address: "mcp@example.com", note: "AIが足した" });
const c = (await call("list_contacts", { query: "MCPテスト" }))[0];
ok("create_contact で X の URL から ID だけ取り出す", c?.handle === "mcp_test");
ok("update_contact で段階を進め、メールを足し、連絡日が今日になる", c.status === "waiting" && c.email === "mcp@example.com" && c.last_contacted_at === new Date().toISOString().slice(0, 10));

// 後片づけ
await call("delete_block", { block_id: made.id });
ok("delete_block で片づけると盤から消える", !(await call("get_board")).blocks.some((x) => x.id === made.id));
await fetch(`${BASE}/api/v1/contacts`); // (読み取り専用。連絡先は画面で消す想定なので DB から直接)
const { execSync } = await import("node:child_process");
execSync(`/opt/homebrew/opt/postgresql@17/bin/psql -d aiment -qc "delete from contacts where name='MCPテスト'"`);

// activity_log に AI がやったと残っているか
const log = execSync(`/opt/homebrew/opt/postgresql@17/bin/psql -d aiment -tAc "select count(*) from activity_log where actor_type='agent' and entity_id='${made.id}'"`).toString().trim();
ok("AI の書き込みは activity_log に agent として残る", Number(log) > 0, `${log}件`);

await browser.close();
await client.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
