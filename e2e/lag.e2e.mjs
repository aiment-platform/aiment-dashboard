/* 遅いDBでも、動かした積み木がワープしないかを確かめる。
   前提: dev サーバーを DB_LATENCY_MS 付きで起動していること(npm run dev:slow)。
   遅延が効いていなければ、何も確かめられないのでスキップする。 */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};

// 遅延が本当に効いているか(盤の表示に 400ms 以上かかるか)
const t0 = Date.now();
await fetch(BASE, { headers: { cookie: "aiment_account=mem_soya" } });
const loadMs = Date.now() - t0;
if (loadMs < 400) {
  console.log(`盤の表示が ${loadMs}ms。遅延が効いていないのでスキップ(npm run dev:slow で起動してください)\n0/0 passed`);
  process.exit(0);
}
console.log(`盤の表示 ${loadMs}ms — 遅いDBの状態で確かめます`);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies([{ name: "aiment_account", value: "mem_soya", domain: "localhost", path: "/", sameSite: "Lax" }]);
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await page.waitForTimeout(1500);

const ids = await page.locator("[data-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
const at = (id) => page.locator(`[data-block="${id}"]`);
const yOf = async (id) => (await at(id).boundingBox()).y;
const drag = async (id, dx, dy) => {
  const r = await at(id).boundingBox();
  await page.mouse.move(r.x + r.width - 30, r.y + 26);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width - 30 + dx, r.y + 26 + dy, { steps: 8 });
  await page.mouse.up();
};
/** ms のあいだ見張って、いずれかの積み木が「期待する位置」から外れた回数を数える */
const watch = async (expect, ms) => {
  let bad = 0, n = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const [id, y] of Object.entries(expect)) {
      n++;
      if (Math.abs((await yOf(id)) - y) > 12) bad++;
    }
    await page.waitForTimeout(40);
  }
  return { bad, n };
};

// ---- 1. 1つ目を動かして、すぐ2つ目 ----
const [a, bId] = [ids[0], ids[ids.length - 1]];
await drag(a, 0, 180);
const aY = await yOf(a);
await drag(bId, -40, -120);
const bY = await yOf(bId);
let r = await watch({ [a]: aY, [bId]: bY }, 3500);
ok("2つ目を動かしても、1つ目が元の位置に戻らない", r.bad === 0, `${r.bad}/${r.n}`);

// ---- 2. 同じ積み木を続けて2回 ----
await drag(a, 0, 90);
await page.waitForTimeout(80);
await drag(a, 0, 90);
const aY2 = await yOf(a);
r = await watch({ [a]: aY2 }, 3500);
ok("同じ積み木を続けて2回動かしても、1回目の位置に戻らない", r.bad === 0, `${r.bad}/${r.n}`);

// ---- 3. 立て続けに5回 ----
const expect = {};
for (const id of ids.slice(0, 5)) {
  await drag(id, 0, 60);
  expect[id] = await yOf(id);
}
r = await watch(expect, 4000);
ok("立て続けに5つ動かしても、どれも戻らない", r.bad === 0, `${r.bad}/${r.n}`);

// ---- 4. 再読み込みしても、動かした位置にある(DB にちゃんと入った) ----
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await page.waitForTimeout(800);
let off = 0;
for (const [id, y] of Object.entries(expect)) if (Math.abs((await yOf(id)) - y) > 12) off++;
ok("再読み込みしても、全部動かした位置にある", off === 0, `${off}個ずれた`);

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
