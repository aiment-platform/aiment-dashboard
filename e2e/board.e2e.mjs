/* 積み木ボードの実操作E2E。
   期間ナビ → Scratch式の積み上げ(上/横/下 + 点線ガイド) → 持ち手で開閉
   → サブタスク完了/追加 → 担当者変更 → ドラッグ保存とやり直し
   → ダブルクリックで新しい積み木 → タイトル書きかえ → 期間の編集 → 片づけ
   → カメラ(水玉が紙に貼りつく / ページ自体は拡大しない)

   前提: npm run seed 直後の状態 + dev サーバー。
   使い方: npm run e2e:board  (別ポートなら PORT=xxxx か BASE=... ) */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3939}`;
const SHOT_DIR = process.argv[2] ?? "/tmp";
const stamp = new Date().toISOString().slice(11, 19);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
// 「Soyaとして書く」状態で始める(アカウント選択のCookieを直接入れる)
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([
  { name: "aiment_account", value: "mem_soya", domain: "localhost", path: "/", sameSite: "Lax" },
]);
const page = await context.newPage();
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

const settle = (ms = 700) => page.waitForTimeout(ms);
const closeLayers = async () => {
  if (await page.locator("[data-radix-popper-content-wrapper]").count()) {
    await page.keyboard.press("Escape");
    await settle(250);
  }
};
// 複製で同じ名前が複数出ることがあるので first() で取る
const boxOf = (text) => page.locator("[data-block]").filter({ hasText: text }).first().boundingBox();
/** 積み木を選ぶ = 面の右あたり(タイトル以外)をクリック。右に道具箱が出る。 */
const selectBlock = async (text) => {
  const r = await boxOf(text);
  await page.mouse.click(r.x + r.width - 26, r.y + 26);
  await settle(400);
};
const tool = (id) => page.locator(`[data-testid='block-toolbar'] [data-testid='${id}']`);
const dragTo = async (from, to, release = true) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  if (!release) return;
  await page.mouse.up();
  await settle(1400);
};

// 0) アカウントを選んでいない人は、まず選択画面へ送られる
const fresh = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const freshPage = await fresh.newPage();
await freshPage.goto(BASE, { waitUntil: "networkidle" });
ok("未選択なら「だれとして書く？」へ送られる", freshPage.url().endsWith("/who"), freshPage.url());
ok(
  "Soya / Futo / Other の3つから選べる",
  (await freshPage.locator("[data-testid^='account-mem_']").count()) === 3,
);
await freshPage.locator("[data-testid='account-mem_futo']").click();
await freshPage.waitForTimeout(1200);
ok("選ぶと盤が開く", !freshPage.url().includes("/who"), freshPage.url());
ok(
  "選んだ名前が左上に出る",
  (await freshPage.locator("[data-testid='current-account']").innerText()).includes("Futo"),
);
await fresh.close();

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-testid='period-pill']", { timeout: 20000 });

// ---- 1. 期間 --------------------------------------------------------------
const title = page.locator("[data-testid='period-title']");
const range = page.locator("[data-testid='period-range']");
const firstTitle = await title.innerText();
ok("既定で今日を含む期間が開く", firstTitle.includes("VTuber"), firstTitle);
ok("ピルに期間が出る", /^\d+\/\d+ ~ \d+\/\d+$/.test(await range.innerText()), await range.innerText());

const blockCount = await page.locator("[data-block]").count();
ok("積み木が盤に並ぶ", blockCount === 5, `${blockCount}個`);
ok("期限が近い積み木は桃色になる", (await page.locator("[data-block][data-tone='urgent']").count()) >= 1);

await page.locator("[data-testid='period-next']").click();
await settle();
const nextTitle = await title.innerText();
ok("› で次の期間へ", nextTitle !== firstTitle, nextTitle);
await page.locator("[data-testid='period-prev']").click();
await settle();
ok("‹ で戻る", (await title.innerText()) === firstTitle);

// ---- 2. Scratch式の積み上げ(seed直後の配置を前提にするので先にやる) --------
let src = await boxOf("初回セッション");
let dst = await boxOf("VTuber 10人");
const baseW0 = dst.width;

await dragTo({ x: src.x + 180, y: src.y + 26 }, { x: dst.x + 180, y: dst.y + 8 }, false);
await settle(350);
ok("くっつく前に点線ガイドが出る", (await page.locator("[data-testid='drop-preview']").count()) === 1);
await page.mouse.up();
await settle(1500);

let top = await boxOf("初回セッション");
let base = await boxOf("VTuber 10人");
ok("上に載せると上の段へ移る", top.y < base.y - 40, `${Math.round(base.y - top.y)}px上`);
ok("土台は上の段を支える幅まで伸びる", base.width >= top.width - 1, `${Math.round(baseW0)} → ${Math.round(base.width)}`);
ok("重ねた積み木は左ぞろえ", Math.abs(top.x - base.x) < 2, `x差 ${Math.round(top.x - base.x)}`);
ok("重ねた積み木はぴったりくっつく", Math.abs(base.y - (top.y + top.height)) < 2, `すき間 ${Math.round(base.y - top.y - top.height)}px`);

src = await boxOf("Discordサーバー");
dst = await boxOf("初回セッション");
await dragTo({ x: src.x + 180, y: src.y + 26 }, { x: dst.x + dst.width - 12, y: dst.y + 26 });
const sideA = await boxOf("初回セッション");
const sideB = await boxOf("Discordサーバー");
base = await boxOf("VTuber 10人");
ok("横から割り込むと同じ段に並ぶ", Math.abs(sideA.y - sideB.y) < 4, `y差 ${Math.round(sideA.y - sideB.y)}`);
ok("横に並んだ積み木もぴったり隣り合う", Math.abs(sideB.x - (sideA.x + sideA.width)) < 2, `すき間 ${Math.round(sideB.x - sideA.x - sideA.width)}px`);
ok(
  "2つ載ると土台はその合計まで伸びる",
  Math.abs(base.width - (sideA.width + sideB.width)) < 2,
  `土台 ${Math.round(base.width)} = ${Math.round(sideA.width)} + ${Math.round(sideB.width)}`,
);
ok("短い名前の積み木は短いまま", (await boxOf("Discordサーバー")).width < 300, `${Math.round((await boxOf("Discordサーバー")).width)}px`);
// 取り組み中の輪は、他の積み木に被っている所だけ薄くする(線が交差して読めなくなるのを防ぐ)
const ringRects = await page.locator("rect.ants").count();
const ringMasks = await page.locator("mask[id^='ring-']").count();
ok(
  "輪は「うっすら1周 + 被っていない所だけくっきり」の2本で描く",
  ringRects === ringMasks * 2 && ringMasks >= 2,
  `輪 ${ringMasks}本 / rect ${ringRects}個`,
);

// 描画順: 上の段ほど手前(下の積み木が上の積み木を塗りつぶさない)
const zOf = (t) => page.locator("[data-block]").filter({ hasText: t }).first().evaluate((el) => Number(el.style.zIndex));
ok(
  "上の段ほど奥に描かれる(下の積み木が手前)",
  (await zOf("初回セッション")) < (await zOf("VTuber 10人")),
  `土台 ${await zOf("VTuber 10人")} > 上 ${await zOf("初回セッション")}`,
);

// 3つ目を横に足す
src = await boxOf("フィードバック");
let last = await boxOf("Discordサーバー");
await dragTo({ x: src.x + 150, y: src.y + 26 }, { x: last.x + last.width - 18, y: last.y + 26 });
const rowY = (await boxOf("初回セッション")).y;
const three = [];
for (const t of ["初回セッション", "Discordサーバー", "フィードバック"]) {
  const r = await boxOf(t);
  three.push({ t, x: Math.round(r.x), y: Math.round(r.y) });
}
ok("横並びは3つ以上つなげられる", three.every((r) => Math.abs(r.y - rowY) < 3), three.map((r) => `${r.t}(${r.x})`).join(" "));
ok("3つ目は右端に並ぶ", three[2].x > three[1].x, `${three[1].x} → ${three[2].x}`);

// 並んでいるブロックの「間」へ割り込む
last = await boxOf("Discordサーバー");
src = await boxOf("フィードバック");
await dragTo({ x: src.x + 150, y: src.y + 26 }, { x: last.x + 16, y: last.y + 26 });
const between = [];
for (const t of ["初回セッション", "フィードバック", "Discordサーバー"]) {
  const r = await boxOf(t);
  between.push({ t, x: Math.round(r.x) });
}
ok(
  "ブロックとブロックの間に割り込める",
  between[0].x < between[1].x && between[1].x < between[2].x,
  between.map((r) => `${r.t}(${r.x})`).join(" → "),
);
await page.keyboard.press("Meta+z");
await settle(1300);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("横並びの割り込みも ⌘Z で戻せる", Math.abs((await boxOf("フィードバック")).y - rowY) > 40);

const towerY = base.y;
src = await boxOf("体験セッション");
await dragTo({ x: src.x + 180, y: src.y + 26 }, { x: base.x + base.width / 2, y: base.y + 44 });
const newBase = await boxOf("体験セッション");
const lifted = await boxOf("VTuber 10人");
ok("下に敷くと新しい土台が一番下に来る", newBase.y > lifted.y, `${Math.round(newBase.y - lifted.y)}px下`);
ok("下に敷くと塔が持ち上がる", lifted.y < towerY - 20, `${Math.round(towerY - lifted.y)}px上へ`);
ok("新しい土台の幅も自分の名前で決まる", Math.abs(newBase.x - lifted.x) < 2, `左ぞろえ x差 ${Math.round(newBase.x - lifted.x)}`);

// 掴んでいる間、上に載っている積み木も一緒についてくる
const carrier = await boxOf("VTuber 10人");
const rider = await boxOf("初回セッション");
await dragTo({ x: carrier.x + 180, y: carrier.y + 26 }, { x: carrier.x + 480, y: carrier.y + 26 }, false);
await settle(300);
const carrierNow = await boxOf("VTuber 10人");
const riderNow = await boxOf("初回セッション");
ok(
  "掴んでいる間、上の積み木も一緒に動く",
  Math.abs(riderNow.x - rider.x - (carrierNow.x - carrier.x)) < 3,
  `土台 ${Math.round(carrierNow.x - carrier.x)}px / 上 ${Math.round(riderNow.x - rider.x)}px`,
);
await page.mouse.up();
await settle(1400);

await page.keyboard.press("Meta+z");
await settle(1500);
await page.keyboard.press("Meta+z");
await settle(1600);
ok("⌘Z で積み替えを取り消せる", Math.abs((await boxOf("VTuber 10人")).y - towerY) < 6);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await settle(600);
ok("積み上げはリロードしても残る", Math.abs((await boxOf("初回セッション")).y - sideA.y) < 6);

// ---- 2a. 日本語変換中の Enter で確定してしまわないこと ---------------------
await page.mouse.dblclick(1240, 690); // 右下は操作の島がいるので避ける
await settle(350);
await page.keyboard.type("へんかんちゅう");
// 「変換を確定する Enter」= isComposing が立った状態の Enter
await page.locator(".inset-field").last().evaluate((el) => {
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }),
  );
});
await settle(500);
ok("変換中の Enter では入力が閉じない", (await page.locator("input[placeholder='なにをする？']").count()) === 1);
await page.keyboard.press("Escape");
await settle(300);

// ---- 2b. 重要の切り替え ---------------------------------------------------
const toneOf = (t) => page.locator("[data-block]").filter({ hasText: t }).first().getAttribute("data-tone");
const discord = page.locator("[data-block]").filter({ hasText: "Discordサーバー" }).first();
ok("選ぶ前は道具箱が出ていない", (await page.locator("[data-testid='block-toolbar']").count()) === 0);
await selectBlock("Discordサーバー");
ok("積み木を選ぶと右に道具箱が出る", (await page.locator("[data-testid='block-toolbar']").count()) === 1);
ok("期限も旗もない積み木は普通の色", (await toneOf("Discordサーバー")) === "normal");
await tool("block-important").click();
await settle(1200);
ok("旗を立てると重要(桃色)になる", (await toneOf("Discordサーバー")) === "urgent", await toneOf("Discordサーバー"));
await tool("block-important").click();
await settle(1200);
ok("旗をはずすと普通に戻る", (await toneOf("Discordサーバー")) === "normal");
await tool("block-important").click();
await settle(1200);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("重要の切り替えも ⌘Z で戻せる", (await toneOf("Discordサーバー")) === "normal");

// ---- 2c. 「これに取り組む」 ------------------------------------------------
const plates = () => page.locator("[data-testid='worker-plate']").count();
const platesBefore = await plates();
await selectBlock("Discordサーバー");
await tool("block-working").click();
await settle(1200);
ok("「取り組む」を押すと名札が出る", (await plates()) === platesBefore + 1, `${platesBefore} → ${await plates()}`);
ok("名札にいまのメンバー名が入る", (await page.locator("[data-testid='worker-plate']").last().innerText()) === "Soya");
await tool("block-working").click();
await settle(1200);
ok("もう一度押すと取り組みをやめる", (await plates()) === platesBefore);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("取り組みの切り替えも ⌘Z で戻せる", (await plates()) === platesBefore + 1);
await selectBlock("Discordサーバー");
await tool("block-working").click();
await settle(1200);

// ---- 2d. 期限を決める -----------------------------------------------------
const dueLabel = discord.locator("[data-testid='block-due-label']");
ok("期限がなければ積み木に日付は出ない", (await dueLabel.count()) === 0);
await selectBlock("Discordサーバー");
await tool("block-due").click();
await settle(400);
await page.locator("[data-radix-popper-content-wrapper] button", { hasText: "明日" }).first().click();
await settle(1300);
await closeLayers();
const tomorrow = new Date(Date.now() + 86400000);
ok(
  "「明日」で期限が入る",
  (await dueLabel.innerText()).trim() === `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`,
  await dueLabel.innerText(),
);
ok("期限が近いので自動で桃色になる", (await toneOf("Discordサーバー")) === "urgent");
await selectBlock("Discordサーバー");
await tool("block-due").click();
await settle(400);
await page.locator("[data-radix-popper-content-wrapper] [data-testid='due-clear']").click();
await settle(1300);
await closeLayers();
ok("期限をはずすと普通の色に戻る", (await toneOf("Discordサーバー")) === "normal");
ok("期限をはずすと日付も消える", (await dueLabel.count()) === 0);

// ---- 3. サブタスク --------------------------------------------------------
const first = page.locator("[data-block]").filter({ hasText: "VTuber 10人" });
await first.locator("[data-testid='block-handle']").click();
await settle(500);
ok("持ち手を押すとサブタスクが枝で開く", (await first.locator(".branch").count()) === 6);
await first.locator("[data-testid='block-handle']").click();
await settle(400);
ok("もう一度押すと閉じる", (await first.locator(".branch").count()) === 0);

await first.locator("[data-testid='block-handle']").click();
await settle(500);
const box = first.locator(".branch").nth(2).locator("button[aria-label]").first();
const labelBefore = await box.getAttribute("aria-label");
await box.click();
await settle(900);
const labelAfter = await first.locator(".branch").nth(2).locator("button[aria-label]").first().getAttribute("aria-label");
ok("サブタスクのチェックで状態が変わる", labelBefore !== labelAfter, `${labelBefore} → ${labelAfter}`);
await first.locator(".branch").nth(2).locator("button[aria-label]").first().click();
await settle(900);

const subTitle = `E2Eのサブタスク ${stamp}`;
await first.locator("[data-testid='add-subtask']").click();
await page.keyboard.type(subTitle);
await page.keyboard.press("Enter");
await settle(1100);
ok("＋サブタスクで追加できる", (await page.getByText(subTitle).count()) > 0);

const face = first.locator("button[aria-label^='担当']").first();
const ownerBefore = await face.getAttribute("aria-label");
await face.click();
await settle(350);
await page
  .locator("[data-radix-popper-content-wrapper] button")
  .filter({ hasNotText: ownerBefore?.replace("担当 ", "") ?? "" })
  .nth(1)
  .click();
await settle(1000);
await closeLayers();
ok("担当者アイコンで担当を変えられる", ownerBefore !== (await first.locator("button[aria-label^='担当']").first().getAttribute("aria-label")));
await first.locator("[data-testid='block-handle']").click();
await settle(400);

// ---- 4. 自由なドラッグとやり直し(誰にもくっつかない空きへ) -----------------
const solo = await boxOf("フィードバック");
await dragTo({ x: solo.x + 180, y: solo.y + 26 }, { x: solo.x + 180, y: solo.y + 246 });
const moved = await boxOf("フィードバック");
ok("空きスペースへは自由に置ける", Math.abs(moved.y - solo.y - 220) < 12, `${Math.round(moved.y - solo.y)}px`);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("⌘Z で動かす前の位置に戻る", Math.abs((await boxOf("フィードバック")).y - solo.y) < 8);
await page.keyboard.press("Meta+Shift+z");
await settle(1300);
ok("⇧⌘Z でもう一度動く", Math.abs((await boxOf("フィードバック")).y - moved.y) < 8);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-block]");
await settle(600);
ok("位置はリロードしても残る", Math.abs((await boxOf("フィードバック")).y - moved.y) < 8);

// ---- 4b. 範囲選択・まとめて操作・複製 --------------------------------------
const count = () => page.locator("[data-block]").count();
const before5 = await count();

// 何もない所からドラッグ = 範囲選択
const topRow = await boxOf("初回セッション");
await page.mouse.move(60, topRow.y - 42);
await page.mouse.down();
await page.mouse.move(1380, topRow.y + 30, { steps: 12 });
ok("ドラッグ中に選択の枠が出る", (await page.locator("[data-testid='marquee']").count()) === 1);
await page.mouse.up();
await settle(500);
ok("囲んだ積み木がまとめて選ばれる", (await page.locator("[data-testid='multi-toolbar']").count()) === 1);
const label = (await page.locator("[data-testid='multi-toolbar']").innerText()).split("\n")[0];
ok("何個選んだかが出る", /^\d+個$/.test(label), label);

// まとめて複製
await page.locator("[data-testid='multi-duplicate']").click();
await settle(1600);
const dupCount = await count();
ok("まとめて複製できる", dupCount > before5, `${before5} → ${dupCount}`);
await page.keyboard.press("Meta+z");
await settle(1600);
ok("複製も ⌘Z で取り消せる", (await count()) === before5);

// ⌘C → ⌘V(ポインタの位置に貼られる)
await page.mouse.click(1300, 780); // 選択解除。右下の島には当てない
await settle(300);
await selectBlock("Discordサーバー");
await page.keyboard.press("Meta+c");
await settle(400);
await page.mouse.move(1180, 780);
await page.keyboard.press("Meta+v");
await settle(1700);
ok("⌘C → ⌘V で貼り付けられる", (await count()) === before5 + 1, `${before5} → ${await count()}`);
await page.keyboard.press("Meta+z");
await settle(1600);
ok("貼り付けも ⌘Z で取り消せる", (await count()) === before5);

// ⌥ドラッグ = その場に複製(元は動かない / 掴んでいる最中からもう1つ見えている)
await page.mouse.click(1300, 780); // 選択解除。右下の島には当てない
await settle(300);
const src5 = await boxOf("Discordサーバー");
await page.keyboard.down("Alt");
await dragTo(
  { x: src5.x + src5.width - 30, y: src5.y + 26 },
  { x: src5.x + src5.width - 30, y: src5.y + 240 },
  false,
);
await settle(350);
ok("⌥ドラッグは離す前から増えて見える", (await count()) === before5 + 1, `${before5} → ${await count()}`);
ok("複製中は「+」の合図が出る", (await page.locator("[data-testid='duplicate-badge']").count()) === 1);
ok("複製中も元の積み木は動かない", Math.abs((await boxOf("Discordサーバー")).y - src5.y) < 3);
await page.mouse.up();
await settle(1500);
await page.keyboard.up("Alt");
ok("⌥ドラッグで複製できる", (await count()) === before5 + 1, `${before5} → ${await count()}`);
ok(
  "⌥ドラッグでは元の積み木は動かない",
  Math.abs((await boxOf("Discordサーバー")).y - src5.y) < 4,
);
await page.keyboard.press("Meta+z");
await settle(1600);
ok("⌥ドラッグの複製も ⌘Z で取り消せる", (await count()) === before5);

// スペース + ドラッグ = 紙を動かす(範囲選択ではなく)
const panBefore = await page.locator("[data-block]").first().boundingBox();
await page.keyboard.down("Space");
await dragTo({ x: 1300, y: 830 }, { x: 1100, y: 830 });
await page.keyboard.up("Space");
ok(
  "スペース + ドラッグで紙が動く",
  Math.round((await page.locator("[data-block]").first().boundingBox()).x - panBefore.x) === -200,
);
// Backspace で選んだ積み木を片づける
await page.keyboard.press("Escape");
await settle(300);
await selectBlock("体験セッション");
await page.keyboard.press("Backspace");
await settle(1500);
ok("Backspace で選んだ積み木を片づけられる", (await count()) === before5 - 1, `${before5} → ${await count()}`);
await page.keyboard.press("Meta+z");
await settle(1600);
ok("Backspace も ⌘Z で戻せる", (await count()) === before5);
await page.keyboard.press("Escape");
await settle(300);

// ---- 5. 作成・書きかえ・片づけ --------------------------------------------
const newTitle = `E2Eの積み木 ${stamp}`;
await page.mouse.dblclick(1240, 690); // 右下は操作の島がいるので避ける
await settle(350);
await page.keyboard.type(newTitle);
await page.keyboard.press("Enter");
await settle(1300);
ok("ダブルクリックで積み木を置ける", (await page.locator("[data-block]").count()) === blockCount + 1);
await page.keyboard.press("Meta+z");
await settle(1300);
ok("⌘Z で置いた積み木を取り消せる", (await page.locator("[data-block]").count()) === blockCount);
await page.locator("[data-testid='redo']").click();
await settle(1300);
ok("やり直しボタンで置きなおせる", (await page.locator("[data-block]").count()) === blockCount + 1);

const renamed = `${newTitle}(改)`;
await page.getByText(newTitle, { exact: true }).click();
await settle(300);
await page.keyboard.press("Meta+A");
await page.keyboard.type(renamed);
await page.keyboard.press("Enter");
await settle(1300);
ok("タイトルをその場で書きかえられる", (await page.getByText(renamed).count()) > 0);

await page.locator("[data-testid='period-pill']").click();
await settle(400);
await page.locator("[data-radix-popper-content-wrapper] input[name='title']").fill(firstTitle);
await page.locator("[data-radix-popper-content-wrapper] button[type='submit']").click();
await settle(1300);
await closeLayers();
ok("ピルから期間の目標を保存できる", (await title.innerText()) === firstTitle);

await selectBlock(renamed);
await tool("block-delete").click();
await settle(1300);
ok("積み木を片づけると盤から消える", (await page.locator("[data-block]").count()) === blockCount);

// ---- 6. カメラ ------------------------------------------------------------
const readDots = () =>
  page.locator("[data-testid='whiteboard']").evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: s.backgroundSize, pos: s.backgroundPosition };
  });
const dotsBefore = await readDots();
const anyBefore = await page.locator("[data-block]").first().boundingBox();
// 何もない所のドラッグは範囲選択になったので、パンはスペース併用
await page.keyboard.down("Space");
await dragTo({ x: 1300, y: 890 }, { x: 1100, y: 790 });
await page.keyboard.up("Space");
const dotsPanned = await readDots();
const anyPanned = await page.locator("[data-block]").first().boundingBox();
ok(
  "パンで水玉が紙と一緒に動く",
  dotsPanned.pos !== dotsBefore.pos && Math.round(anyPanned.x - anyBefore.x) === -200,
  `水玉 ${dotsBefore.pos} → ${dotsPanned.pos} / 積み木 ${Math.round(anyPanned.x - anyBefore.x)}px`,
);

const pageW0 = await page.evaluate(() => document.body.getBoundingClientRect().width);
await page.mouse.move(700, 500);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -200);
await page.keyboard.up("Control");
await settle(400);
const pageW1 = await page.evaluate(() => document.body.getBoundingClientRect().width);
const dotsZoomed = await readDots();
ok("⌘ホイールでページ自体は拡大しない", pageW0 === pageW1, `${pageW0} → ${pageW1}`);
ok("拡大すると水玉の間隔も広がる", dotsZoomed.size !== dotsPanned.size, `${dotsPanned.size} → ${dotsZoomed.size}`);

await page.screenshot({ path: `${SHOT_DIR}/e2e-final.png` });
await browser.close();

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
