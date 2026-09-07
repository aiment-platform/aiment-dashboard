/* 画面を撮るだけの補助。使い方: node e2e/shot.mjs <出力ディレクトリ> */
import { chromium } from "playwright-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3939}`;
const DIR = process.argv[2] ?? "/tmp";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text()));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-testid='period-pill']", { timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/board-collapsed.png` });

// 1枚目の積み木を開く(画像とおなじ絵にする)
await page.locator("[data-testid='block-handle']").first().click();
await page.waitForTimeout(450);
await page.screenshot({ path: `${DIR}/board-expanded.png` });

console.log("blocks:", await page.locator("[data-block]").count());
console.log("title:", await page.locator("[data-testid='period-title']").innerText());
console.log("range:", await page.locator("[data-testid='period-range']").innerText());
await browser.close();
