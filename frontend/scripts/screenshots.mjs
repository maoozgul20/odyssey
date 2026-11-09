// Takes a screenshot of every ODYSSEY page, with real answers, into docs/screenshots/.
// Run from the frontend folder while the backend and frontend are both running:
//   node scripts/screenshots.mjs                      (site on http://localhost:3000)
//   node scripts/screenshots.mjs http://localhost:3001

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const wait = (ms) => page.waitForTimeout(ms);
// wait until a streamed answer has finished (the blinking cursor disappears), at most 60 s
const answered = async () => {
  await wait(1500);
  await page.waitForFunction(() => !document.querySelector(".cursor"), null, { timeout: 60000 }).catch(() => {});
  await wait(800);
};
const shot = async (name) => {
  await page.screenshot({ path: OUT + name + ".png" });
  console.log("saved", name + ".png");
};

try {
  // 1. hub
  await page.goto(BASE + "/");
  await wait(2500);
  await shot("01-home");

  // 2. Mission Control: replay to the first crisis decision
  await page.goto(BASE + "/mission-control");
  await page.evaluate(() => localStorage.removeItem("odyssey.decisions"));
  await page.reload();
  await page.click(".intro li:nth-child(2) button:not([disabled])", { timeout: 20000 });
  await wait(1500);
  await shot("02-mission-control");
  await page.click(".mute"); // sound off
  await page.click(".speeds button >> nth=3");
  await page.waitForSelector(".decision-card", { timeout: 30000 });
  await wait(800);
  await shot("03-decision");
  await page.click(".dec-options li:nth-child(1) button");
  await page.click(".dec-actions .go");
  await page.waitForSelector(".dec-result", { timeout: 60000 });
  await wait(1000);
  await shot("04-decision-result");
  await page.click(".dec-actions .go");
  await page.click(".play");
  await wait(500);
  await page.click(".debrief-btn");
  await wait(800);
  await shot("05-debrief");

  // 3. Mars
  await page.goto(BASE + "/mars");
  await wait(2500);
  await page.click(".chips button >> nth=0");
  await wait(4000);
  await page.click(".mars-bar .go");
  await answered();
  await shot("06-mars");

  // 4. Starship
  await page.goto(BASE + "/starship");
  await wait(5000);
  await page.click(".chips button >> nth=0");
  await answered();
  await wait(2500);
  await shot("07-starship");

  // 5. Planet Lab
  await page.goto(BASE + "/planet-lab");
  await wait(2500);
  await page.click(".viz .go");
  await page.waitForSelector(".score", { timeout: 120000 }).catch(() => {});
  await answered();
  await shot("08-planet-lab");

  // 6. Knowledge Map
  await page.goto(BASE + "/knowledge-map");
  await wait(6000);
  await page.click(".chips button >> nth=0");
  await answered();
  await shot("09-knowledge-map");

  // 7. Evaluation
  await page.goto(BASE + "/eval");
  await wait(2500);
  await shot("10-evaluation");
  await page.screenshot({ path: OUT + "11-evaluation-full.png", fullPage: true });
  console.log("saved 11-evaluation-full.png");

  // 8. phone view of the home page
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/");
  await wait(2000);
  await shot("12-phone");
} catch (e) {
  console.error("\nStopped:", e.message);
} finally {
  await browser.close();
  console.log("\nScreenshots are in the docs\\screenshots folder.");
}
