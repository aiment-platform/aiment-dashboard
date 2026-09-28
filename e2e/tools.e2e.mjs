/* ホワイトボードの道具の E2E(Figma化)。
   道具箱 → メモ(タスクではないもの) → 直線 → ペン → セクションで囲う(中身ごと動く)
   → 揃えのガイド(スナップ) → 依存の矢印 → 広い範囲(10%〜 / 全体) → 担当 Both
   → 分割画面(別々に動く / 枠をまたぐ矢印 / 閉じる)

   前提: npm run seed 直後の状態 + dev サーバー。
   使い方: npm run e2e:tools */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3939}`;
const stamp = new Date().toISOString().slice(11, 19);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: "aiment_account", value: "mem_soya", domain: "localhost", path: "/", sameSite: "Lax" }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};
const settle = (ms = 700) => page.waitForTimeout(ms);
const tid = (id) => page.locator(`[data-testid='${id}']`);
const drag = async (from, to, steps = 14) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
};
/** 何も置いていない紙の場所か(紙そのものに当たるか) */
const isPaper = (x, y) =>
  page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains("board-surface") ?? false, [x, y]);
/** 左上から探して、w×h の何も無い四角を見つける */
async function emptyRect(w, h, from = { x: 200, y: 200 }) {
  for (let y = from.y; y < 900 - h; y += 40) {
    for (let x = from.x; x < 1300 - w; x += 40) {
      let free = true;
      for (let dy = 0; dy <= h && free; dy += 20) for (let dx = 0; dx <= w && free; dx += 20) free = await isPaper(x + dx, y + dy);
      if (free) return { x, y };
    }
  }
  throw new Error("空き地が見つからない");
}
const camOf = (root = page) =>
  root.locator(".board-surface > div[style*='transform']").first().getAttribute("style");

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-block]", { timeout: 20000 });

// ---- 0. 道具箱 ----
ok("左に道具箱(5つ)が出る", (await page.locator("[data-testid='tool-palette'] [data-testid^='tool-']").count()) === 5);
ok("はじめは「選ぶ」", (await tid("tool-select").getAttribute("aria-pressed")) === "true");

// 道具を試す場所を先に広げておく: 少し引いて(縮小して)空き地を作る
await tid("zoom-out").click();
await settle(300);

// ---- 1. メモ(タスクではないもの) ----
const noteTitle = `メモ ${stamp}`;
let spot = await emptyRect(260, 120);
await page.keyboard.press("c");
ok("C でメモ(コメント)の道具になる", (await tid("tool-note").getAttribute("aria-pressed")) === "true");
await page.mouse.click(spot.x + 10, spot.y + 10);
await settle(300);
ok("紙を押すとメモの入力欄が出る", (await tid("note-input").count()) === 1);
await page.keyboard.type(noteTitle);
await page.keyboard.press("Shift+Enter");
await page.keyboard.type("2行目");
ok("Shift+Enter では確定せず改行になる", (await tid("note-input").inputValue()) === `${noteTitle}\n2行目`);
await page.keyboard.press("Enter");
await settle(1300);
const note = page.locator("[data-testid='note-block']").filter({ hasText: noteTitle });
ok("メモは点線・半透明の積み木で置かれる", (await note.count()) === 1);
ok("メモには担当者の顔が付かない", (await note.locator("button[aria-label^='担当']").count()) === 0);
ok("置いたら道具は「選ぶ」に戻る", (await tid("tool-select").getAttribute("aria-pressed")) === "true");
{
  const r = await note.boundingBox();
  await page.mouse.click(r.x + r.width - 10, r.y + r.height / 2);
  await settle(400);
}
ok("メモを選ぶとメモ用の道具箱", (await tid("note-toolbar").count()) === 1);
{
  // 同じ縮尺の、1行のタスクの面と比べる
  const one = (await page.locator("[data-block] [data-testid='block-handle']").first().boundingBox()).height;
  const two = (await note.boundingBox()).height;
  ok("改行したメモは2行ぶんの高さになる", two > one * 1.15, `1行 ${Math.round(one)}px / メモ ${Math.round(two)}px`);
}
{
  const h0 = (await note.boundingBox()).height;
  await tid("note-size-28").click();
  await settle(1300);
  const h1 = (await note.boundingBox()).height;
  ok("文字を「特大」にするとメモが大きくなる", h1 > h0 + 20, `${Math.round(h0)} → ${Math.round(h1)}px`);
  ok("選んだ大きさが押された状態になる", (await tid("note-size-28").getAttribute("aria-pressed")) === "true");
  await page.keyboard.press("Meta+z");
  await settle(1300);
  ok("⌘Z で文字の大きさが戻る", Math.abs((await note.boundingBox()).height - h0) < 2);
}
await tid("note-to-task").click();
await settle(1300);
ok("「タスクにする」でふつうの積み木になる", (await page.locator("[data-block]").filter({ hasText: noteTitle }).locator("[data-testid='block-handle']").count()) === 1);
{
  const t = page.locator("[data-block]").filter({ hasText: noteTitle }).first();
  const r = await t.boundingBox();
  await page.mouse.click(r.x + r.width - 20, r.y + 20);
  await settle(400);
}
ok("タスクの道具箱に「メモにする」がある", (await tid("block-to-note").count()) === 1);
ok("道具箱の文字が折り返さない", (await tid("block-toolbar").evaluate((el) => el.getBoundingClientRect().height)) < 48);
await tid("block-to-note").click();
await settle(1300);
ok("「メモにする」でメモに戻せる", (await page.locator("[data-testid='note-block']").filter({ hasText: noteTitle }).count()) === 1);
await page.keyboard.press("Meta+z");
await settle(1300);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("⌘Z でメモに戻る", (await page.locator("[data-testid='note-block']").filter({ hasText: noteTitle }).count()) === 1);
await page.keyboard.press("Escape");

// ---- 2. 直線 ----
spot = await emptyRect(240, 60, { x: 200, y: 360 });
await page.keyboard.press("l");
await drag({ x: spot.x + 10, y: spot.y + 30 }, { x: spot.x + 220, y: spot.y + 34 });
await settle(900);
ok("L → ドラッグで直線が引ける", (await tid("stroke-line").count()) === 1);
ok("線を引くと「選ぶ」に戻る", (await tid("tool-select").getAttribute("aria-pressed")) === "true");
{
  const r = await tid("stroke-line").boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await settle(300);
}
ok("線を押すと選べて、道具箱が出る", (await tid("item-toolbar").count()) === 1);
const lineBefore = await tid("stroke-line").boundingBox();
await drag(
  { x: lineBefore.x + lineBefore.width / 2, y: lineBefore.y + lineBefore.height / 2 },
  { x: lineBefore.x + lineBefore.width / 2 + 60, y: lineBefore.y + lineBefore.height / 2 + 40 },
);
await settle(900);
const lineAfter = await tid("stroke-line").boundingBox();
// 積み木と同じく方眼に吸い付くので、数px の差は許す
ok("線はドラッグで動かせる", Math.abs(lineAfter.x - lineBefore.x - 60) <= 12, `${Math.round(lineAfter.x - lineBefore.x)}px`);
{
  const b0 = await tid("stroke-line").boundingBox();
  await drag({ x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, { x: b0.x + b0.width / 2 - 72, y: b0.y + b0.height / 2 - 48 });
  await settle(900);
  const b1 = await tid("stroke-line").boundingBox();
  ok("線は左上にも動かせる", b1.x < b0.x - 40 && b1.y < b0.y - 25, `${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)}`);
}
await page.keyboard.press("Backspace");
await settle(900);
ok("Backspace で線を消せる", (await tid("stroke-line").count()) === 0);
await page.keyboard.press("Meta+z");
await settle(900);
ok("⌘Z で線が戻る", (await tid("stroke-line").count()) === 1);

// ---- 3. ペン ----
spot = await emptyRect(200, 100, { x: 200, y: 460 });
await page.keyboard.press("p");
await page.mouse.move(spot.x + 10, spot.y + 50);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(spot.x + 10 + i * 9, spot.y + 50 + Math.sin(i / 2) * 30);
await page.mouse.up();
await settle(900);
ok("P → なぞるとペンで描ける", (await tid("stroke-pen").count()) === 1);
ok("ペンは続けて描けるよう、道具が残る", (await tid("tool-pen").getAttribute("aria-pressed")) === "true");
await page.keyboard.press("Escape");
ok("Esc で「選ぶ」に戻る", (await tid("tool-select").getAttribute("aria-pressed")) === "true");

// ---- 4. セクション(中身ごと動く) ----
const inner = page.locator("[data-block]").filter({ hasText: noteTitle }).first();
const nb = await inner.boundingBox();
await page.keyboard.press("s");
await drag({ x: nb.x - 40, y: nb.y - 60 }, { x: nb.x + nb.width + 40, y: nb.y + nb.height + 40 });
await settle(900);
ok("S → 囲むとセクションができる", (await tid("section-title-input").count()) === 1);
ok("できたらすぐ名前を付けられる", (await tid("section-title-input").count()) === 1);
// 開いたときは「セクション」が選ばれているので、打つとそのまま置きかわる
await page.keyboard.type("調査まわり");
await page.keyboard.press("Enter");
await settle(900);
ok("セクションの名前は打つだけで置きかわる", (await tid("section-title").innerText()).trim() === "調査まわり", await tid("section-title").innerText());
const t0 = await tid("section-title").boundingBox();
await drag({ x: t0.x + t0.width / 2, y: t0.y + t0.height / 2 }, { x: t0.x + t0.width / 2 + 80, y: t0.y + t0.height / 2 + 50 });
await settle(1500);
const nb2 = await inner.boundingBox();
const t1 = await tid("section-title").boundingBox();
ok(
  "セクションを動かすと中の積み木も同じだけ動く",
  Math.abs(nb2.x - nb.x - (t1.x - t0.x)) < 1.5 && Math.abs(nb2.y - nb.y - (t1.y - t0.y)) < 1.5 && t1.x - t0.x > 40,
  `枠 ${Math.round(t1.x - t0.x)},${Math.round(t1.y - t0.y)} / 中身 ${Math.round(nb2.x - nb.x)},${Math.round(nb2.y - nb.y)}`,
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await settle(600);
ok("再読み込みしてもセクション・線・ペンが残る", (await tid("section-title").count()) === 1 && (await tid("stroke-line").count()) === 1 && (await tid("stroke-pen").count()) === 1);

// ---- 5. 揃えのガイド(スナップ) ----
const blocks = page.locator("[data-block]:has([data-testid='block-handle'])");
const a = await blocks.nth(0).boundingBox();
const b = await blocks.nth(1).boundingBox();
// b を「a と左端が揃う少し手前」まで運ぶ(離さない)
spot = await emptyRect(b.width + 20, b.height + 20, { x: a.x - 3, y: a.y + a.height + 60 });
await page.mouse.move(b.x + b.width - 20, b.y + 20);
await page.mouse.down();
await page.mouse.move(a.x + 4 + b.width - 20, spot.y + 20, { steps: 16 });
await settle(200);
ok("揃う位置に近づくとピンクのガイド線が出る", (await tid("snap-guide").count()) > 0, `${await tid("snap-guide").count()}本`);
await page.mouse.up();
await settle(1400);
const b2 = await blocks.nth(1).boundingBox();
ok("離すとぴったり揃う(左端が同じ)", Math.abs(b2.x - a.x) < 1.5, `ずれ ${Math.abs(b2.x - a.x).toFixed(1)}px`);
ok("離したらガイドは消える", (await tid("snap-guide").count()) === 0);

// ---- 6. 依存の矢印 ----
const linksBefore = await tid("link-path").count();
const from = await blocks.nth(0).boundingBox();
const to = await blocks.nth(2).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + 20);
await settle(250);
ok("積み木に乗ると右端に持ち手が出る", (await tid("link-handle").count()) === 1);
const h = await tid("link-handle").boundingBox();
await drag({ x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: to.x + to.width / 2, y: to.y + 20 }, 18);
await settle(1300);
ok("持ち手を別の積み木へ引くと矢印でつながる", (await tid("link-path").count()) === linksBefore + 1);
// 逆向き(輪になる)は断る
{
  const back = await blocks.nth(2).boundingBox();
  await page.mouse.move(back.x + back.width / 2, back.y + 20);
  await settle(250);
  const hb = await tid("link-handle").boundingBox();
  const fb = await blocks.nth(0).boundingBox();
  await drag({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: fb.x + fb.width / 2, y: fb.y + 20 }, 18);
  await settle(900);
  ok("輪になる矢印は引けない", (await tid("link-path").count()) === linksBefore + 1);
}
// 矢印は積み木についてくる
const pathD = () => tid("link-path").last().getAttribute("d");
const d0 = await pathD();
const tb = await blocks.nth(2).boundingBox();
spot = await emptyRect(tb.width + 20, tb.height + 20, { x: 700, y: 600 });
await drag({ x: tb.x + tb.width - 20, y: tb.y + 20 }, { x: spot.x + tb.width, y: spot.y + 20 });
await settle(1400);
ok("積み木を動かすと矢印もついてくる", (await pathD()) !== d0);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
ok("再読み込みしても矢印が残る", (await tid("link-path").count()) === linksBefore + 1);
await tid("link-path").last().dispatchEvent("pointerdown");
await settle(300);
ok("矢印を押すと × が出る", (await tid("link-delete").count()) === 1);
await page.keyboard.press("Backspace");
await settle(1200);
ok("Backspace で矢印を外せる", (await tid("link-path").count()) === linksBefore);
await page.keyboard.press("Meta+z");
await settle(1200);
ok("⌘Z で矢印が戻る", (await tid("link-path").count()) === linksBefore + 1);

// ---- 7. 広い範囲 ----
for (let i = 0; i < 20; i++) await tid("zoom-out").click();
ok("10% まで引ける", (await tid("zoom-level").innerText()) === "10%", await tid("zoom-level").innerText());
await tid("zoom-fit").click();
await settle(400);
const inView = await page.evaluate(() =>
  [...document.querySelectorAll("[data-block]")].every((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }),
);
ok("「全体」で置いたもの全部が画面に収まる", inView);

// ---- 8. 担当 Both ----
const faceId = await blocks.nth(0).getAttribute("data-block");
const face = page.locator(`[data-block='${faceId}'] button[aria-label^='担当']`).first();
await face.click();
await settle(350);
const opts = await page.locator("[data-radix-popper-content-wrapper] button").allInnerTexts();
ok("担当者の候補に Both がある", opts.some((t) => t.includes("Both")), opts.join("/"));
await page.locator("[data-radix-popper-content-wrapper] button").filter({ hasText: "Both" }).first().click();
await settle(1100);
ok("Both を担当にできる", (await face.getAttribute("aria-label")) === "担当 Both", await face.getAttribute("aria-label"));
await page.keyboard.press("Escape");
{
  const who = await browser.newContext();
  const wp = await who.newPage();
  await wp.goto(`${BASE}/who`, { waitUntil: "networkidle" });
  ok("「だれとして書く？」には Both は出ない", (await wp.locator("[data-testid='account-mem_both']").count()) === 0);
  await who.close();
}

// ---- 9. 分割画面 ----
await tid("split-open").click();
await page.waitForSelector("[data-testid='split-view']", { timeout: 15000 });
await page.waitForSelector("[data-pane-index='1'] [data-block]", { timeout: 15000 });
await settle(800);
ok("「分割」で2つ並ぶ", (await page.locator("[data-pane]").count()) === 2);
ok("URL に2つの期間が入る(そのまま共有できる)", (new URL(page.url()).searchParams.getAll("p").length === 2), page.url());
const left = page.locator("[data-pane-index='0']");
const right = page.locator("[data-pane-index='1']");
const lt = await left.locator("[data-testid='period-title']").innerText();
const rt = await right.locator("[data-testid='period-title']").innerText();
ok("左右で別の期間が開く", lt !== rt, `${lt} | ${rt}`);

// 右だけパンする
const camL0 = await camOf(left);
const camR0 = await camOf(right);
const rb = await right.boundingBox();
await page.keyboard.down("Space");
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height - 200);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width / 2 - 120, rb.y + rb.height - 260, { steps: 8 });
await page.mouse.up();
await page.keyboard.up("Space");
await settle(300);
ok("右をパンしても左は動かない", (await camOf(left)) === camL0 && (await camOf(right)) !== camR0);
// 左だけズーム
await left.locator("[data-testid='zoom-in']").click();
await settle(300);
ok("左だけズームできる", (await left.locator("[data-testid='zoom-level']").innerText()) !== (await right.locator("[data-testid='zoom-level']").innerText()));

// 左の積み木 → 右の積み木へ、枠をまたいで矢印
/** その枠の中に見えている(はみ出していない)タスクの積み木 */
async function visibleBlock(pane) {
  const pb = await pane.boundingBox();
  const all = pane.locator("[data-block]:has([data-testid='block-handle'])");
  for (let i = 0; i < (await all.count()); i++) {
    const r = await all.nth(i).boundingBox();
    if (r && r.x > pb.x + 90 && r.x + r.width < pb.x + pb.width - 20 && r.y > pb.y + 180 && r.y + r.height < pb.y + pb.height - 100) return all.nth(i);
  }
  throw new Error("枠の中に見えている積み木が無い");
}
const lb = await visibleBlock(left);
const rbk = await visibleBlock(right);
const lbb = await lb.boundingBox();
await page.mouse.move(lbb.x + lbb.width / 2, lbb.y + 20);
await settle(250);
const lh = await left.locator("[data-testid='link-handle']").boundingBox();
const rbb = await rbk.boundingBox();
await drag({ x: lh.x + lh.width / 2, y: lh.y + lh.height / 2 }, { x: rbb.x + rbb.width / 2, y: rbb.y + 20 }, 20);
await settle(2500);
ok("枠をまたいで矢印をつなげる", (await tid("cross-link").count()) >= 1, `${await tid("cross-link").count()}本`);
const x0 = await tid("cross-link").first().getAttribute("d");
await page.keyboard.down("Space");
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height - 200);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width / 2 + 60, rb.y + rb.height - 170, { steps: 6 });
await page.mouse.up();
await page.keyboard.up("Space");
await settle(400);
ok("片方をパンすると、またぐ矢印も追いかける", (await tid("cross-link").first().getAttribute("d")) !== x0);

// またぐ矢印も押して外せる
await tid("cross-link-hit").first().dispatchEvent("pointerdown");
await settle(300);
ok("またぐ矢印を押すと × が出る", (await tid("cross-link-delete").count()) === 1);
const crossN = await tid("cross-link").count();
await page.keyboard.press("Backspace");
await settle(2500);
ok("Backspace でまたぐ矢印を外せる", (await tid("cross-link").count()) === crossN - 1, `${await tid("cross-link").count()}`);
ok("そのとき積み木は消えない", (await left.locator("[data-block]").count()) > 0);
await page.keyboard.press("Meta+z");
await settle(2500);
ok("⌘Z でまたぐ矢印が戻る", (await tid("cross-link").count()) === crossN);

// 期間の移動は、その枠だけ
const rNext = right.locator("[data-testid='period-prev']");
if (await rNext.isEnabled()) {
  await rNext.click();
  await page.waitForTimeout(2000);
  ok("枠の ← は、その枠の期間だけ変える", (await left.locator("[data-testid='period-title']").innerText()) === lt);
}
await right.locator("[data-testid='pane-close']").click();
await page.waitForTimeout(2000);
ok("× で分割を閉じて1枚に戻る", (await page.locator("[data-pane]").count()) === 0 && (await page.locator("[data-testid='period-pill']").count()) === 1);

ok("ページにエラーが出ない", errors.length === 0, errors.join(" / "));
await browser.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
