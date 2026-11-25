// Storyboard stills for the LIMIT+1 sales video: the real LIMIT+1 version on the preview's sample history, plus four
// mock-ups of extras that aren't built (video/mocks.js).
// Run: node video/sales-shots.js   (writes video/out/sales-<scene>.png)
const fs = require("fs"), path = require("path");
const { BASE, OUT, launch, route } = require("./harness");
const mocks = require("./mocks");

const PHONE = { width: 390, height: 844 };

// Signs in and sets up a 2024 GR Corolla with the flex fuel kit; the sample history loads on the next start.
async function setUp(page) {
  await page.goto(BASE + "/limitplus1/index.html"); await page.waitForSelector("#email");
  await page.fill("#email", "you@example.com"); await page.click("text=Send me a code");
  await page.waitForSelector("#code"); await page.fill("#code", "482913"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Set up your car");
  await page.click("[data-k=model][data-v=grc]"); await page.waitForSelector("[data-k=year]");
  await page.click("[data-k=year][data-v='2024']"); await page.click("[data-k=pkg][data-v=kit]");
  await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("911 Tek Dr")');
  await page.click('.srow:has-text("911 Tek Dr")'); await page.waitForSelector("text=Set up your car");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  await page.reload(); await page.waitForSelector("h1:has-text('Pump plan')");
  await page.evaluate(() => document.fonts.ready);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, colorScheme: "light" });
  const outside = await route(ctx, { history: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `sales-${name}.png`) }); console.log("  shot", name); };
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); await page.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.hidden = true; window.scrollTo(0, 0); }); };

  // The sign-in screen, before anything else
  await page.goto(BASE + "/limitplus1/index.html"); await page.waitForSelector("#email"); await page.evaluate(() => document.fonts.ready);
  await shot("welcome");
  await setUp(page);

  await page.fill("#sensor", ""); await shot("pump-empty");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await page.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot("pump-plan");
  console.log("  plan:", (await page.locator("#readout").innerText()).replace(/\n+/g, " | ").slice(0, 150));
  await go("learned", "h1:has-text('What the app has learned')"); await shot("learned");
  await go("service", "h1:has-text('Service')"); await shot("service");
  await go("history", "h1:has-text('History')"); await shot("history");
  await go("about", "text=E85 stations as of"); await shot("about");

  // The four extras, as mock-ups
  await go("history", "h1:has-text('History')"); await mocks.tuner(page); await shot("mock-tuner");
  await go("service", "h1:has-text('Service')");
  await page.click(".item:has-text('Engine oil and filter') >> nth=0"); await page.waitForSelector("h1:has-text('Engine oil and filter')");
  await mocks.shop(page); await shot("mock-shop");
  await go("car", "text=Gas grade you mix with"); await mocks.cars(page); await shot("mock-cars");
  await go("history", "h1:has-text('History')"); await mocks.share(page); await shot("mock-share");

  console.log("  outside requests:", outside.length ? outside : "none", "| errors:", errors.length ? errors : "none");
  await browser.close();
  if (outside.length || errors.length) throw new Error("the recording reached outside or threw errors");
  console.log("sales stills written to video/out");
})().catch((e) => { console.error(e); process.exit(1); });
