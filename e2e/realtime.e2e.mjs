/* ふたりで同時に見る機能の E2E。ブラウザの箱を2つ作って(=別のブラウザで開いたのと同じ)、
   矢印・「いま居る人」・変更の伝わり方を確かめる。
   前提: dev サーバー + .env.local に LIVEBLOCKS_SECRET_KEY。無ければ全部スキップして成功扱い。 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};

const hasKey = /^LIVEBLOCKS_SECRET_KEY=\S+/m.test(readFileSync(".env.local", "utf8"));
if (!hasKey) {
  console.log("LIVEBLOCKS_SECRET_KEY が無いのでスキップ\n0/0 passed");
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function open(account) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: "aiment_account", value: account, domain: "localhost", path: "/", sameSite: "Lax" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => ok(`[${account}] ページにエラーが出ない`, false, e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-block]");
  return page;
}
const settle = (p, ms) => p.waitForTimeout(ms);
const cursors = (p) => p.locator("[data-testid='other-cursor']");
const cursorNames = async (p) => (await cursors(p).evaluateAll((els) => els.map((e) => e.getAttribute("data-name")))).sort();

const soya = await open("mem_soya");
const futo = await open("mem_futo");
await settle(soya, 4000);

// ---- いま居る人 ----
ok("開いただけで、左上に相手が出る(Soyaの画面にFuto)", (await soya.locator("[data-testid='presence']").innerText()).includes("Futo"));
ok("開いただけで、左上に相手が出る(Futoの画面にSoya)", (await futo.locator("[data-testid='presence']").innerText()).includes("Soya"));
ok("まだ動かしていないので矢印は無い", (await cursors(soya).count()) === 0 && (await cursors(futo).count()) === 0);

// ---- 矢印 ----
await futo.mouse.move(400, 400);
await futo.mouse.move(560, 430, { steps: 8 });
await settle(soya, 1200);
ok("Futoが動かすと、Soyaの画面にFutoの矢印", (await cursorNames(soya)).join() === "Futo");
ok("Futo自身の画面には自分の矢印は出ない", (await cursors(futo).count()) === 0);
await soya.mouse.move(700, 300);
await soya.mouse.move(760, 340, { steps: 8 });
await settle(futo, 1200);
ok("Soyaが動かすと、Futoの画面にSoyaの矢印", (await cursorNames(futo)).join() === "Soya");

// ---- 盤の外へ出ても消えない(タブを切り替えるときの動き) ----
await futo.mouse.move(560, 0, { steps: 6 });
await futo.locator(".board-surface").dispatchEvent("pointerleave");
await settle(soya, 1000);
ok("相手が盤の外へ出ても、最後の位置に矢印が残る", (await cursors(soya).count()) === 1);

// ---- 矢印は紙の座標(相手がパンしても自分の紙の上で正しい場所) ----
const before = await cursors(soya).first().boundingBox();
await soya.keyboard.down("Space");
await soya.mouse.move(900, 700); await soya.mouse.down();
await soya.mouse.move(700, 600, { steps: 8 }); await soya.mouse.up();
await soya.keyboard.up("Space");
await settle(soya, 400);
const after = await cursors(soya).first().boundingBox();
ok("自分が紙を動かすと、相手の矢印も紙と一緒に動く", Math.round(after.x - before.x) === -200, `${Math.round(after.x - before.x)}px`);

// ---- 矢印の大きさは画面基準(拡大しても変わらない) ----
const w0 = (await cursors(soya).first().locator("svg").boundingBox()).width;
for (let i = 0; i < 4; i++) await soya.locator("[data-testid='zoom-in']").click();
await settle(soya, 300);
const wIn = (await cursors(soya).first().locator("svg").boundingBox()).width;
for (let i = 0; i < 9; i++) await soya.locator("[data-testid='zoom-out']").click();
await settle(soya, 300);
const wOut = (await cursors(soya).first().locator("svg").boundingBox()).width;
ok("拡大しても縮小しても、矢印の大きさは変わらない", Math.abs(wIn - w0) < 1.5 && Math.abs(wOut - w0) < 1.5, `${Math.round(w0)} / ${Math.round(wIn)} / ${Math.round(wOut)}px`);
await soya.getByRole("button", { name: "はじめの位置にもどす" }).click();
await settle(soya, 300);

// ---- 変更が伝わる ----
const n0 = await futo.locator("[data-block]").count();
await soya.mouse.dblclick(1000, 560);
await settle(soya, 400);
await soya.keyboard.type("同期確認");
await soya.keyboard.press("Enter");
await settle(futo, 3000);
ok("Soyaが置いた積み木が、再読み込みなしでFutoに映る", (await futo.locator("[data-block]").count()) === n0 + 1);
ok("文字も届いている", (await futo.getByText("同期確認").count()) > 0);

// 後片づけ
await soya.keyboard.press("Meta+z");
await settle(soya, 1500);

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
