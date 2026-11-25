// Mock-up screens for the branded demos: the real app (the partner version's code) in each company's look, on the
// preview's sample data. Nothing is sent anywhere, and nothing here is published.
// Run: node demos/shots.js [brand ...]   (writes demos/out/<brand>-<screen>.png; logos are fetched once into demos/out)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { BASE, ROOT, launch, route } = require("../video/harness");
const BRANDS = require("./brands");
const OUT = path.join(__dirname, "out");
const PHONE = { width: 390, height: 844 };

function logoFile(id, b) {
  const ext = /\.svg(\?|$)/.test(b.logo) ? "svg" : "png", file = path.join(OUT, `${id}-logo.${ext}`);
  if (!fs.existsSync(file)) execFileSync("curl", ["-s", "-f", "-o", file, b.logo]);
  return { file, ext };
}

async function run(browser, id) {
  const b = BRANDS[id], logo = logoFile(id, b);
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, colorScheme: b.scheme });
  const outside = await route(ctx, { history: true });
  // On top of the shared set-up: this company's settings, look and logo in place of LIMIT+1's.
  const partner = { ...b.partner, logo: { light: "demo-logo." + logo.ext, dark: "demo-logo." + logo.ext, alt: b.title } };
  await ctx.route("**/limitplus1/partner.js*", (r) => r.fulfill({ contentType: "application/javascript", body: `window.PARTNER = ${JSON.stringify(partner)};` }));
  await ctx.route("**/limitplus1/partner.css*", (r) => r.fulfill({ contentType: "text/css",
    body: `@import url("https://fonts.googleapis.com/css2?${b.fonts}&display=swap");\n${fs.readFileSync(path.join(ROOT, "limitplus1/partner.css"), "utf8")}\n/* ${b.title} */\n${b.css}` }));
  await ctx.route("**/limitplus1/demo-logo.*", (r) => r.fulfill({ path: logo.file }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = async (name) => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${id}-${name}.png`) }); };
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); await page.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.hidden = true; window.scrollTo(0, 0); }); };

  await page.goto(BASE + "/limitplus1/index.html"); await page.waitForSelector("#email");
  await shot("1-welcome");
  await page.fill("#email", "you@example.com"); await page.click("text=Send me a code");
  await page.waitForSelector("#code"); await page.fill("#code", "482913"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Set up your car");
  await page.click("[data-k=model][data-v=grc]"); await page.waitForSelector("[data-k=year]"); await page.click("[data-k=year][data-v='2024']");
  await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("911 Tek Dr")'); await page.click('.srow:has-text("911 Tek Dr")');
  await page.waitForSelector("text=Set up your car"); await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  await page.reload(); await page.waitForSelector(".svc-note");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await page.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot("2-pump");
  await go("service", "h1:has-text('Service')"); await shot("3-service");
  await go("about", "text=E85 stations as of"); await shot("4-about");
  await ctx.close();
  console.log(`${b.title}: 4 screens | outside: ${outside.length ? outside : "none"} | errors: ${errors.length ? errors : "none"}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BRANDS);
  const browser = await launch();
  for (const id of ids) await run(browser, id);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
