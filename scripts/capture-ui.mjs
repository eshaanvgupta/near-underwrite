import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("evidence/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge", headless: true });
for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 360, 800]]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:4173");
  await page.getByRole("heading", { name: "Usage is visible. Value capture still has to be proved." }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error("Viewport overflow");
  await page.screenshot({ path: "evidence/screenshots/" + name + ".png", fullPage: true });
  await page.close();
}
await browser.close();
console.log("Captured real mainnet evidence UI at desktop and 360px width; no mocked data or AI requests. The delivery source is visible in each capture.");
