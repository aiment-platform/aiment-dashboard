/* 連絡先ページの E2E。実機Chromeで、足す・段階を変える・書きかえる・絞る・消す を通す。
   前提: dev サーバー(localhost:3939)。データは自分で作って自分で消す。 */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.addCookies([{ name: "aiment_account", value: "mem_soya", domain: "localhost", path: "/", sameSite: "Lax" }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => ok("ページにエラーが出ない", false, e.message));

const stamp = Date.now().toString(36);
const names = { v1: `E2E星野${stamp}`, u1: `E2E田中${stamp}`, v2: `E2Eねこ${stamp}` }; // v1 は途中で改名する
const rowOf = (name) => page.locator("[data-testid='contact-row']").filter({ hasText: name });
const rows = () => page.locator("[data-testid='contact-row']").count();
const settle = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle" });
const n0 = await rows();

// ---- タブ ----
ok("タブが4つ(すべて/VTuber/ユーザー/その他)", (await page.locator("[data-testid^='tab-']").count()) === 4);

// ---- 足す: 「すべて」では種類を選ぶ / タブを開いていればその種類で ----
await page.locator("[data-testid='add-kind-user']").click();
await page.locator("[data-testid='add-contact-name']").fill(names.u1);
await page.keyboard.press("Enter");
await settle(900);
await page.locator("[data-testid='tab-vtuber']").click();
await page.waitForURL(/kind=vtuber/);
await settle(400);
ok("VTuberタブでは種類を選ばなくてよい", (await page.locator("[data-testid='add-kind-user']").count()) === 0);
for (const name of [names.v1, names.v2]) {
  await page.locator("[data-testid='add-contact-name']").fill(name);
  await page.keyboard.press("Enter");
  await settle(900);
}
ok("VTuberタブで足したものはVTuberになる", (await rowOf(names.v1).innerText()).includes("VTuber"));
ok("足したあと入力欄が空に戻る", (await page.locator("[data-testid='add-contact-name']").inputValue()) === "");
await page.locator("[data-testid='tab-all']").click();
await page.waitForURL((u) => !u.search.includes("kind="));
await settle(400);
ok("すべてのタブで3人とも見える", (await rows()) === n0 + 3, `${n0} → ${await rows()}`);

// ---- 段階 ----
await rowOf(names.v1).locator("[data-testid='contact-status']").selectOption("waiting");
await settle(1200);
ok("段階を「返事待ち」に変えられる", (await rowOf(names.v1).getAttribute("data-status")) === "waiting");
ok("変えた日が「最後に連絡した日」に入る", (await rowOf(names.v1).innerText()).includes("今日"));
const firstHeading = await page.locator("section p").first().innerText();
ok("返事待ちが一番上に来る", firstHeading.startsWith("返事待ち"), firstHeading);

// ---- 名前はその場で書きかえ ----
await rowOf(names.v1).locator("[data-testid='contact-name']").click();
await page.locator("[data-testid='contact-name-input']").fill(names.v1 + "改");
await page.keyboard.press("Enter");
await settle(1200);
names.v1 = names.v1 + "改";
ok("名前を押してその場で書きかえられる", (await rowOf(names.v1).count()) === 1);

// ---- 担当はマークから ----
await rowOf(names.v1).locator("[data-testid='contact-owner']").click();
await page.locator("[data-testid='owner-mem_futo']").click();
await settle(1200);
ok("担当のマークを押して選べる", (await rowOf(names.v1).locator("[data-testid='contact-owner']").getAttribute("title")) === "担当: Futo");

// ---- 連絡先は名前の横で、＋から足す ----
const row1 = rowOf(names.v1);
const chips = () => row1.locator("[data-testid='address-handle'], [data-testid='address-discord'], [data-testid='address-email'], [data-testid='address-url']").count();
// ＋ を押すと種類を選ばずにすぐ入力欄。貼った文字から見分ける
await row1.locator("[data-testid='address-add']").click();
ok("＋ を押すと種類の候補は出ず、すぐ入力欄", (await row1.locator("[data-testid='address-input']").count()) === 1 && (await page.locator("[data-testid^='address-pick-']").count()) === 0);
await row1.locator("[data-testid='address-input']").fill("https://x.com/e2e_luna?s=21");
ok("X の URL を貼ると「X」と見分ける", (await row1.locator("[data-testid='address-guess']").getAttribute("data-key")) === "handle");
await page.keyboard.press("Enter");
await settle(1200);
ok("保存すると ID だけ残る", (await row1.locator("[data-testid='address-handle']").innerText()).includes("@e2e_luna"));
for (const [val, key] of [["e2e#0001", "discord"], ["e2e@example.com", "email"], ["https://example.com/e2e", "url"]]) {
  await row1.locator("[data-testid='address-add']").click();
  await row1.locator("[data-testid='address-input']").fill(val);
  ok(`「${val}」を ${key} と見分ける`, (await row1.locator("[data-testid='address-guess']").getAttribute("data-key")) === key);
  await page.keyboard.press("Enter");
  await settle(1000);
}
// 札を押すと候補の小窓。自動判定と違う種類も選べる
await row1.locator("[data-testid='address-add']").click();
await row1.locator("[data-testid='address-input']").fill("e2e_only_word");
const badge = row1.locator("[data-testid='address-guess']");
ok("1語だけなら X と仮定する", (await badge.getAttribute("data-key")) === "handle");
await badge.click();
const menu = page.locator("[data-testid='address-type-menu']");
ok("札を押すと候補の小窓が出る", (await menu.count()) === 1);
ok("候補は X / Discord / メール / ページ の4つ", (await menu.locator("[data-testid^='type-']").count()) === 4);
await menu.locator("[data-testid='type-email']").click();
ok("小窓からメールを選べる(自動判定より優先)", (await badge.getAttribute("data-key")) === "email");
ok("小窓を閉じても入力欄は消えていない", (await row1.locator("[data-testid='address-input']").count()) === 1);
await page.keyboard.press("Escape");
await settle(300);

// 既にある連絡先の種類も、ラベルを押して変えられる
await row1.locator("[data-testid='address-type-discord']").click();
ok("既存のラベルを押しても同じ小窓が出る", (await page.locator("[data-testid='address-type-menu']").count()) === 1);
ok("既に入っている種類には「上書き」の印", (await page.locator("[data-testid='type-email']").innerText()).includes("上書き"));
await page.keyboard.press("Escape");
await settle(200);
// url を消してから discord → url に移す(上書きでない経路)。閉じていると url は隠れているので開く
await row1.locator("[data-testid='contact-toggle']").click();
await settle(300);
await row1.locator("[data-testid='address-url'] button[aria-label='ページ を消す']").click();
await settle(1000);
await row1.locator("[data-testid='address-type-discord']").click();
await page.locator("[data-testid='type-url']").click();
await settle(1200);
ok("種類を変えると値が別の列へ移る(Discord → ページ)", (await row1.locator("[data-testid='address-discord']").count()) === 0 && (await row1.locator("[data-testid='address-url']").innerText()).includes("e2e#0001"));
ok("移した先は https 付きに整う", (await row1.locator("[data-testid='address-url'] a[title='開く']").getAttribute("href")) === "https://e2e#0001");
await row1.locator("[data-testid='contact-toggle']").click(); // 閉じて元の状態に
await settle(300);
ok("閉じているときは2つまで見せる", (await chips()) === 2);
ok("あふれた分は「+N」にまとまる", /^\+\d$/.test(await row1.locator("[data-testid='address-more']").innerText()));

// ---- 連絡先はその場で書きかえ ----
await row1.locator("[data-testid='address-handle'] button[title='クリックで書きかえ']").click();
await row1.locator("[data-testid='address-edit-handle']").fill("e2e_luna2");
await page.keyboard.press("Enter");
await settle(1200);
ok("連絡先を押してその場で書きかえられる", (await row1.locator("[data-testid='address-handle']").innerText()).includes("@e2e_luna2"));

// ---- 行の空いている所を押しても開く ----
// 連絡先の並びは左詰めなので、その箱の右端は必ず空いている
const emptySpot = async (r) => {
  const box = await r.locator("[data-testid='contact-addresses']").boundingBox();
  return { x: box.x + box.width - 8, y: box.y + box.height / 2 };
};
const sp = await emptySpot(row1);
await page.mouse.click(sp.x, sp.y);
await settle(300);
ok("行の空きを押すと開く", (await row1.getAttribute("data-open")) === "true");
ok("開くと隠れていた分も全部見える(この時点で3つ)", (await chips()) === 3);
ok("「+2」は開いたら消える", (await row1.locator("[data-testid='address-more']").count()) === 0);
const ed = row1.locator("[data-testid='contact-editor']");
ok("開いた中身は備考だけ", (await ed.locator("input").count()) === 0 && (await ed.locator("textarea").count()) === 1);
await ed.locator("[data-testid='contact-note']").fill("E2Eのメモ");
await ed.locator("[data-testid='contact-note']").blur();
await settle(1200);
await page.reload({ waitUntil: "networkidle" });
await rowOf(names.v1).locator("[data-testid='contact-toggle']").click();
await settle(300);
ok("備考は再読み込みしても残る", (await rowOf(names.v1).locator("[data-testid='contact-note']").inputValue()) === "E2Eのメモ");
await rowOf(names.v1).locator("[data-testid='address-handle'] button[aria-label='X を消す']").click();
await settle(1200);
ok("× で連絡先を消せる", (await rowOf(names.v1).locator("[data-testid='address-handle']").count()) === 0);
// 再読み込みで位置が変わっているので測り直す
const sp2 = await emptySpot(rowOf(names.v1));
await page.mouse.click(sp2.x, sp2.y);
await settle(300);
ok("もう一度押すととじる", (await rowOf(names.v1).getAttribute("data-open")) === "false");

// ---- タブ・さがす ----
await page.goto(`${BASE}/contacts?kind=vtuber`, { waitUntil: "networkidle" });
ok("VTuberタブではユーザーは出ない", (await rowOf(names.u1).count()) === 0 && (await rowOf(names.v1).count()) === 1);
await page.goto(`${BASE}/contacts?kind=user`, { waitUntil: "networkidle" });
ok("ユーザータブではVTuberは出ない", (await rowOf(names.u1).count()) === 1 && (await rowOf(names.v1).count()) === 0);
await page.goto(`${BASE}/contacts?q=${encodeURIComponent("E2E田中")}`, { waitUntil: "networkidle" });
ok("名前でさがせる", (await rowOf(names.u1).count()) === 1 && (await rowOf(names.v1).count()) === 0);

// ---- API ----
const api = await (await page.request.get(`${BASE}/api/v1/contacts`)).json();
ok("API から同じものが取れる", api.contacts.some((c) => c.name === names.v1 && c.owner_id === "mem_futo"));

// ---- 消す(後片づけ) ----
await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle" });
page.on("dialog", (d) => d.accept());
for (const name of Object.values(names)) {
  await rowOf(name).locator("[data-testid='contact-toggle']").click();
  await settle(250);
  await rowOf(name).locator("[data-testid='contact-delete']").click();
  await settle(1000);
}
ok("消すと一覧から消える", (await rows()) === n0, `${await rows()} 人(最初は ${n0})`);

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
