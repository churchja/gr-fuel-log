// Storyboard stills for the how-to video: each step's real screen, for both versions of the app.
// Run: node video/shots.js   (writes video/out/<brand>-<step>.png)
const fs = require("fs"), path = require("path");
const { BASE, OUT, BRANDS, launch, route, receiptText } = require("./harness");

const PHONE = { width: 390, height: 844 };
const today = () => new Date().toLocaleDateString("en-CA");

async function run(browser, brand) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, colorScheme: "light" });
  const outside = await route(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${brand.id}-${name}.png`) }); console.log("  shot", `${brand.id}-${name}`); };
  const quiet = () => page.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.hidden = true; });

  // 1 Sign in: email, then the emailed code
  await page.goto(BASE + brand.page); await page.waitForSelector("#email");
  await page.evaluate(() => document.fonts.ready);
  await page.fill("#email", "you@example.com");
  await shot("1-signin");
  await page.click("text=Send me a code"); await page.waitForSelector("#code");
  await page.fill("#code", "482913");
  await shot("2-code");
  await page.click("button:has-text('Sign in')"); await page.waitForSelector("text=Set up your car");

  // 2 Set up the car
  if (brand.id === "lp1") { await page.click("[data-k=model][data-v=grc]"); await page.waitForSelector("[data-k=year]"); }
  await page.click("[data-k=year][data-v='2024']");
  if (brand.id === "lp1") await page.click("[data-k=pkg][data-v=kit]");
  await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("911 Tek Dr")');
  await shot("3-station");
  await page.click('.srow:has-text("911 Tek Dr")'); await page.waitForSelector("text=Set up your car");
  await quiet();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("4-setup");
  await page.screenshot({ path: path.join(OUT, `${brand.id}-4-setup-full.png`), fullPage: true });
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  await quiet();

  // 3 The pump plan
  await shot("5-pump-empty");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await page.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot("6-pump-plan");
  console.log("  plan:", (await page.locator("#readout").innerText()).replace(/\n+/g, " | ").slice(0, 200));

  // 4 Log the fill: scan the E85 receipt, type the gas
  await page.click("#logPlan"); await page.waitForSelector("#ga0");
  await page.fill("#f-odo", "18250");
  await page.evaluate((t) => { window.__ocrText = t; }, receiptText(today()));
  await page.setInputFiles("#ph0", path.join(__dirname, "..", "icons", "icon-192.png"));
  await page.waitForFunction(() => document.querySelector("#ga0") && document.querySelector("#ga0").value === "5.612");
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#stops").getBoundingClientRect().top + window.scrollY - 70));
  await shot("7-log-receipt");
  await page.fill("#ga1", "4.93"); await page.fill("#pr1", "3.899");
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, document.body.scrollHeight); });
  await shot("8-log-save");
  await page.screenshot({ path: path.join(OUT, `${brand.id}-8-log-full.png`), fullPage: true });
  await page.click("button:has-text('Save fill')"); await page.waitForSelector("h1:has-text('History')");
  await quiet();
  await shot("9-history");

  // 5 Next time at the pump: the reading after the fill
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForSelector("form.after-ask");
  await page.fill("#afterNow", "40");
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot("10-after");
  await page.click("form.after-ask button[type=submit]");
  await page.waitForFunction(() => !document.querySelector("form.after-ask"));
  await shot("11-after-saved");

  // The closing card's screens
  await page.evaluate(() => { location.hash = "service"; }); await page.waitForSelector("h1:has-text('Service')");
  await quiet(); await shot("12-service");
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector("text=owners sharing");
  await shot("13-community");

  console.log("  outside requests:", outside.length ? outside : "none", "| errors:", errors.length ? errors : "none");
  await ctx.close();
  if (outside.length || errors.length) throw new Error(`${brand.name}: the recording reached outside or threw errors`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  for (const id of Object.keys(BRANDS)) { console.log(BRANDS[id].name); await run(browser, BRANDS[id]); }
  await browser.close();
  console.log("stills written to video/out");
})().catch((e) => { console.error(e); process.exit(1); });
