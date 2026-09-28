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

// ---- 連絡手段は名前の横にタグで。＋ で足す ----
const row1 = rowOf(names.v1);
const tags = () => row1.locator("[data-testid^='link-']:not([data-testid^='link-type-']):not([data-testid^='link-edit-'])").count();
const addLink = async (text) => {
  await row1.locator("[data-testid='address-add']").click();
  await row1.locator("[data-testid='address-input']").fill(text);
  const guessed = await row1.locator("[data-testid='address-guess']").getAttribute("data-key");
  await page.keyboard.press("Enter");
  await settle(1000);
  return guessed;
};
await row1.locator("[data-testid='address-add']").click();
ok("＋ を押すとすぐ入力欄が出る", (await row1.locator("[data-testid='address-input']").count()) === 1);
await page.keyboard.press("Escape");
await settle(200);

ok("X の URL を貼ると X と見分ける", (await addLink("https://x.com/e2e_luna?s=21")) === "x");
ok("保存すると ID だけ残る", (await row1.locator("[data-testid='link-x']").innerText()).includes("@e2e_luna"));
ok("Instagram の URL は Insta と見分ける", (await addLink("https://www.instagram.com/e2e.luna/")) === "instagram");
ok("Messenger の URL は Messenger と見分ける", (await addLink("https://m.me/e2e.luna")) === "messenger");
ok("メールはメールと見分ける", (await addLink("e2e@example.com")) === "email");

// タグを押すと候補(9種類)。自動判定と違う種類も選べる
await row1.locator("[data-testid='address-add']").click();
await row1.locator("[data-testid='address-input']").fill("e2e_only_word");
const badge = row1.locator("[data-testid='address-guess']");
ok("1語だけなら X と仮定する", (await badge.getAttribute("data-key")) === "x");
await badge.click();
const menu = page.locator("[data-testid='address-type-menu']");
ok("タグを押すと候補が出る", (await menu.count()) === 1);
ok("候補は X / Instagram / TikTok / YouTube / Discord / Messenger / LINE / メール / ページ / その他 の10個", (await menu.locator("[data-testid^='type-']").count()) === 10);
await menu.locator("[data-testid='type-line']").click();
ok("候補から LINE を選べる(自動判定より優先)", (await badge.getAttribute("data-key")) === "line");
ok("選んでも入力欄は消えない", (await row1.locator("[data-testid='address-input']").count()) === 1);
await page.keyboard.press("Enter");
await settle(1000);
// 5つ目なので閉じた行では「+N」に隠れる。API で種類を確かめる
const saved = (await (await page.request.get(`${BASE}/api/v1/contacts`)).json()).contacts.find((c) => c.name === names.v1);
ok("選んだ種類で保存される", saved?.links.some((l) => l.channel === "line" && l.value === "e2e_only_word"));

// 閉じているときは2つまで、あふれは +N
ok("閉じているときは2つまで見せる", (await tags()) === 2);
ok("あふれた分は「+N」にまとまる", (await row1.locator("[data-testid='address-more']").innerText()) === "+3");

// 既にあるタグの種類を変える
await row1.locator("[data-testid='link-type-x']").click();
await page.locator("[data-testid='address-type-menu'] [data-testid='type-tiktok']").click();
await settle(1100);
ok("既にある連絡手段もタグから種類を変えられる(X → TikTok)", (await row1.locator("[data-testid='link-tiktok']").count()) === 1 && (await row1.locator("[data-testid='link-x']").count()) === 0);

// 値をその場で書きかえる
await row1.locator("[data-testid='link-tiktok'] button[title='クリックで書きかえ']").click();
await row1.locator("[data-testid='link-edit-tiktok']").fill("e2e_luna2");
await page.keyboard.press("Enter");
await settle(1100);
ok("連絡手段の値をその場で書きかえられる", (await row1.locator("[data-testid='link-tiktok']").innerText()).includes("@e2e_luna2"));

// ---- 行の空いている所を押しても開く ----
const emptySpot = async (r) => {
  const box = await r.locator("[data-testid='contact-addresses']").boundingBox();
  return { x: box.x + box.width - 8, y: box.y + box.height / 2 };
};
const sp = await emptySpot(row1);
await page.mouse.click(sp.x, sp.y);
await settle(300);
ok("行の空きを押すと開く", (await row1.getAttribute("data-open")) === "true");
ok("開くと隠れていた分も全部見える(5つ)", (await tags()) === 5);
ok("「+N」は開いたら消える", (await row1.locator("[data-testid='address-more']").count()) === 0);
const ed = row1.locator("[data-testid='contact-editor']");
ok("「＋ 一言」ボタンは無い", (await page.locator("[data-testid='contact-summary-add']").count()) === 0);
ok("開いた中身は 一言(1行) と 詳細(長文) の2つ", (await ed.locator("input").count()) === 1 && (await ed.locator("textarea").count()) === 1);
const fieldTops = await ed.evaluate((el) => [
  el.querySelector("[data-testid='contact-summary-field']").getBoundingClientRect().top,
  el.querySelector("[data-testid='contact-note']").getBoundingClientRect().top,
]);
ok("一言が上、詳細がその下", fieldTops[0] < fieldTops[1]);
const footTags = ed.locator("[data-testid='contact-channels'] [data-testid^='channel-tag-']");
ok("「この連絡先を消す」の右に、選べるタグが10個並ぶ(その他を含む)", (await footTags.count()) === 10);
const pressed = (await footTags.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.dataset.testid.replace("channel-tag-", "")))).sort();
ok("持っている種類は選択中になっている", pressed.join(",") === "email,instagram,line,messenger,tiktok", pressed.join(","));
const [delBox, tagsBox] = [await ed.locator("[data-testid='contact-delete']").boundingBox(), await ed.locator("[data-testid='contact-channels']").boundingBox()];
ok("タグは「消す」の右側", tagsBox.x > delBox.x + delBox.width - 1);
// 持っていないタグを押す → アドレス無しでタグだけ付く(アドレスは任意)
await ed.locator("[data-testid='channel-tag-youtube']").click();
await settle(1100);
ok("持っていないタグを押すと、入力欄は開かずにタグだけ付く", (await row1.locator("[data-testid='address-input']").count()) === 0 && (await ed.locator("[data-testid='channel-tag-youtube']").getAttribute("aria-pressed")) === "true");
ok("アドレスは空のまま(小さな ＋ だけ出る)", (await row1.locator("[data-testid='link-empty-youtube']").count()) === 1);
// あとからタグの中でアドレスを入れる
await row1.locator("[data-testid='link-empty-youtube']").click();
await row1.locator("[data-testid='link-edit-youtube']").fill("https://youtube.com/@e2e");
await page.keyboard.press("Enter");
await settle(1100);
ok("あとからタグの中でアドレスを入れられる", (await row1.locator("[data-testid='link-youtube']").innerText()).includes("youtube.com/@e2e"));
// アドレスを消してもタグは残る
await row1.locator("[data-testid='link-youtube'] button[title='クリックで書きかえ']").click();
await row1.locator("[data-testid='link-edit-youtube']").fill("");
await page.keyboard.press("Enter");
await settle(1100);
ok("アドレスを空にしてもタグは残る", (await row1.locator("[data-testid='link-empty-youtube']").count()) === 1);
// 持っているタグを押す → 確認して外す
let dialogShown = false;
const onDialog = (d) => { dialogShown = true; d.dismiss(); };
page.on("dialog", onDialog);
await ed.locator("[data-testid='channel-tag-youtube']").click();
await settle(1100);
page.off("dialog", onDialog);
ok("選択中のタグを押すと、確認なしですぐ外れる", !dialogShown);
ok("外れたタグは選択中でなくなる", (await ed.locator("[data-testid='channel-tag-youtube']").getAttribute("aria-pressed")) === "false" && (await row1.locator("[data-testid='link-youtube']").count()) === 0);
await ed.locator("[data-testid='contact-summary-field']").fill("E2Eの一言");
await page.keyboard.press("Enter");
await settle(1100);
await ed.locator("[data-testid='contact-note']").fill("E2Eの詳細\n2行目");
await ed.locator("[data-testid='contact-note']").blur();
await settle(1200);
await page.reload({ waitUntil: "networkidle" });
await rowOf(names.v1).locator("[data-testid='contact-toggle']").click();
await settle(300);
ok("詳細は再読み込みしても残る", (await rowOf(names.v1).locator("[data-testid='contact-note']").inputValue()) === "E2Eの詳細\n2行目");
ok("一言も再読み込みしても残る", (await rowOf(names.v1).locator("[data-testid='contact-summary-field']").inputValue()) === "E2Eの一言");
await rowOf(names.v1).locator("[data-testid='link-email'] button[aria-label='メール を消す']").click();
await settle(1200);
ok("× で連絡手段を消せる", (await rowOf(names.v1).locator("[data-testid='link-email']").count()) === 0);
const sp2 = await emptySpot(rowOf(names.v1));
await page.mouse.click(sp2.x, sp2.y);
await settle(300);
ok("もう一度押すととじる", (await rowOf(names.v1).getAttribute("data-open")) === "false");
ok("閉じると一言が名前の下に見える", (await rowOf(names.v1).locator("[data-testid='contact-summary']").innerText()) === "E2Eの一言");
// 閉じたまま一言を押すと、その場で書きかえられる(今までどおり)
await rowOf(names.v1).locator("[data-testid='contact-summary']").click();
await rowOf(names.v1).locator("[data-testid='contact-summary-input']").fill("E2Eの一言2");
await page.keyboard.press("Enter");
await settle(1100);
ok("閉じたまま一言を押して、その場で書きかえられる", (await rowOf(names.v1).locator("[data-testid='contact-summary']").innerText()) === "E2Eの一言2");

// ---- 連絡手段で絞る ----
await page.goto(`${BASE}/contacts?via=messenger`, { waitUntil: "networkidle" });
ok("連絡手段で絞れる(Messenger を持つ人だけ)", (await rowOf(names.v1).count()) === 1 && (await rowOf(names.u1).count()) === 0);
ok("絞り込み中の手段は押した状態で出る", (await page.locator("[data-testid='via-messenger']").getAttribute("aria-pressed")) === "true");
await page.locator("[data-testid='via-messenger']").click();
await page.waitForURL((u) => !u.search.includes("via="));
ok("もう一度押すと絞り込みが外れる", !page.url().includes("via="));

// ---- タブ・さがす ----
await page.goto(`${BASE}/contacts?kind=vtuber`, { waitUntil: "networkidle" });
ok("VTuberタブではユーザーは出ない", (await rowOf(names.u1).count()) === 0 && (await rowOf(names.v1).count()) === 1);
await page.goto(`${BASE}/contacts?kind=user`, { waitUntil: "networkidle" });
ok("ユーザータブではVTuberは出ない", (await rowOf(names.u1).count()) === 1 && (await rowOf(names.v1).count()) === 0);
await page.goto(`${BASE}/contacts?q=${encodeURIComponent("E2E田中")}`, { waitUntil: "networkidle" });
ok("名前でさがせる", (await rowOf(names.u1).count()) === 1 && (await rowOf(names.v1).count()) === 0);

// ---- API ----
const api = await (await page.request.get(`${BASE}/api/v1/contacts`)).json();
ok("API から同じものが取れる(連絡手段と一言も)", api.contacts.some((c) => c.name === names.v1 && c.owner_id === "mem_futo" && c.summary === "E2Eの一言2" && c.links.some((l) => l.channel === "messenger")));

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
