// Builds the LIMIT+1 sales slideshow: the same scenes as the sales video (video/sales-record.js), one still per scene,
// as a PowerPoint the viewer clicks through at their own pace. Captions are on the slides and in the speaker notes.
// Run: node video/sales-slides.js [vertical|landscape]   (no argument: both)
// Writes video/out/LIMIT1-Flex-Fuel-sales-<shape>.pptx. Nothing is sent anywhere.
const fs = require("fs"), path = require("path");
const { BASE, OUT, launch, route } = require("./harness");
const pptxgen = require("pptxgenjs");
const mocks = require("./mocks");

const SHAPES = { vertical: { width: 1080, height: 1920 }, landscape: { width: 1920, height: 1080 } };
const TOTAL = 12; // scenes with a caption, for the progress bar
const YOURS = ["yours", "For your customers"], LIMIT = ["limit", "For LIMIT+1"], REQUEST = ["request", "On request"];
const CAP = {
  problem: ["ask", "The problem", "How much E85 do I pump?", "Every flex fuel customer asks it at every fill. Pump E85 changes with the season and the station, and their tune has a limit."],
  gallons: [...YOURS, "The exact gallons, every fill", "They enter miles to empty and the flex sensor reading. The plan never lands within 2 points of their tune's ethanol limit."],
  learns: [...YOURS, "It learns each station's real E85", "Every logged fill is a measurement. It spots the switch to winter blend and corrects the next plan."],
  service: [...YOURS, "Service reminders for their car", "Toyota's schedule by model, year and transmission. What's due soon shows on the pump screen."],
  brand: [...LIMIT, "Your brand in their pocket", "Your logo on every screen, in your look, on their home screen."],
  sale: [...LIMIT, "Your sale and your parts at every fill", "A slim bar shows your current sale, then products that fit their car. One tap opens your store."],
  support: [...LIMIT, "You're one tap away", "Call, text, or a support request that arrives with their car, package and tune limit filled in."],
  tuner: [...REQUEST, "Send my fuel log to my tuner", "One tap sends the fills a tuner needs to see."],
  shop: [...REQUEST, "Parts links on reminders", "Oil change due? The reminder links to the parts in your store."],
  cars: [...REQUEST, "More cars", "GR Supra next, then any car you sell a flex fuel kit for."],
  share: [...REQUEST, "Share my month", "An image of their month with your logo, ready to post and tag you."],
  runs: [...LIMIT, "Nothing for you to build or run", "No app store. iPhone and Android. Each customer is approved before it opens. Shady Acres LLC keeps it running and up to date."],
};
const ORDER = Object.keys(CAP);

async function record(browser, shapeName) {
  const size = SHAPES[shapeName], name = `LIMIT1-Flex-Fuel-sales-${shapeName}`;
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: "light" });
  const outside = await route(ctx, { history: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/video/stage.html?brand=lp1&shape=${shapeName}&kind=sales`);
  const app = page.frameLocator("#app");
  const frame = page.frames().find((f) => f !== page.mainFrame());

  // Before the recording starts (the title card covers the phone): sign in, set up a 2024 GR Corolla with the flex
  // fuel kit, and start the app again so the sample history is loaded.
  await app.locator("#email").fill("you@example.com"); await app.locator("text=Send me a code").click();
  await app.locator("#code").fill("482913"); await app.locator("button:has-text('Sign in')").click();
  await app.locator("[data-k=model][data-v=grc]").click(); await app.locator("[data-k=year][data-v='2024']").click(); await app.locator("[data-k=pkg][data-v=kit]").click();
  await app.locator("#c-e85").click(); await app.locator('.srow:has-text("911 Tek Dr")').click();
  await app.locator("button:has-text('Save and start')").click(); await app.locator("h1:has-text('Pump plan')").waitFor();
  await frame.evaluate(() => { setTimeout(() => location.reload(), 0); }); await page.waitForTimeout(400);
  await app.locator("#sensor").waitFor(); await app.locator(".svc-note").waitFor();
  await app.locator("#sensor").fill("");
  await frame.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.evaluate(() => document.fonts.ready); await frame.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  const stage = (fn, ...args) => page.evaluate(([f, a]) => window.stage[f](...a), [fn, args]);
  const caption = (key) => stage("caption", ...CAP[key], ORDER.indexOf(key) + 1, TOTAL);
  const hold = (ms) => page.waitForTimeout(ms);
  const ring = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); if (b) await stage("ring", b.x, b.y, b.width, b.height); };
  const go = async (hash, sel) => { await frame.evaluate((h) => { location.hash = h; }, hash); await app.locator(sel).first().waitFor(); await frame.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.hidden = true; }); };
  const slides = [];
  // One still per scene. A ring is fully drawn from 0.4 to 1.3 seconds after it starts, so the picture is taken inside that.
  const snap = async (key, ringed) => {
    await hold(ringed ? 650 : 900);
    const file = path.join(OUT, `slide-${shapeName}-${String(slides.length + 1).padStart(2, "0")}-${key}.png`);
    await page.screenshot({ path: file });
    slides.push({ key, file });
    if (ringed) await hold(1400);
  };

  await snap("open");
  await caption("problem"); await stage("card", null); await hold(900); await snap("problem");

  await caption("gallons");
  await app.locator("#dte").fill("34"); await app.locator("#sensor").fill("38");
  await frame.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
  await frame.evaluate(() => document.activeElement && document.activeElement.blur());
  await hold(500); await ring(app.locator("#readout")); await snap("gallons", true);

  await caption("learns"); await go("learned", "h1:has-text('What the app has learned')");
  await hold(500); await ring(app.locator("#app section.dark").first()); await snap("learns", true);

  await caption("service"); await go("service", "h1:has-text('Service')");
  await hold(500); await ring(app.locator(".item:has-text('Engine oil and filter')").first()); await snap("service", true);

  await caption("brand"); await go("history", "h1:has-text('History')");
  await hold(500); await ring(app.locator(".brandbar img")); await snap("brand", true);

  await caption("sale"); await go("pump", "h1:has-text('Pump plan')");
  await hold(500); await ring(app.locator("#promo")); await snap("sale", true);

  await caption("support"); await go("about", "text=E85 stations as of");
  await hold(500); await ring(app.locator("a.item:has-text('Support request')")); await snap("support", true);

  await caption("tuner"); await go("history", "h1:has-text('History')"); await mocks.tuner(frame);
  await hold(500); await ring(app.locator("#mock-tuner")); await snap("tuner", true);

  await caption("shop"); await go("service", "h1:has-text('Service')");
  await app.locator(".item:has-text('Engine oil and filter')").first().click(); await app.locator("h1:has-text('Engine oil and filter')").waitFor(); await mocks.shop(frame);
  await hold(500); await ring(app.locator("#mock-shop")); await snap("shop", true);

  await caption("cars"); await go("car", "text=Gas grade you mix with"); await mocks.cars(frame);
  await hold(500); await ring(app.locator('[aria-label="Model"]')); await snap("cars", true);

  await caption("share"); await go("history", "h1:has-text('History')"); await hold(400); await mocks.share(frame); await snap("share");

  await caption("runs"); await mocks.clear(frame); await go("more", "[data-act=signOut]");
  await frame.evaluate(() => document.querySelector("[data-act=signOut]").click()); await app.locator("#email").waitFor(); await snap("runs");

  await stage("card", "close"); await snap("close");
  await ctx.close();
  if (outside.length || errors.length) throw new Error(`${name}: reached outside (${outside.join(", ")}) or threw errors (${errors.join(" | ")})`);

  // The deck: each slide is the scene's picture, edge to edge. The caption's words go in the picture's description
  // (for screen readers) and the speaker notes.
  const pres = new pptxgen();
  const wide = shapeName === "landscape", W = wide ? 13.333 : 7.5, H = wide ? 7.5 : 13.333;
  pres.defineLayout({ name: "SCENE", width: W, height: H }); pres.layout = "SCENE";
  pres.title = "LIMIT+1 Flex Fuel"; pres.author = "Shady Acres LLC";
  const WORDS = { open: "LIMIT+1 Flex Fuel. A concept by Shady Acres LLC.", close: "Let's talk. Jason Church, Shady Acres LLC." };
  for (const s of slides) {
    const c = CAP[s.key], words = c ? `${c[1]}: ${c[2]}. ${c[3]}` : WORDS[s.key];
    const slide = pres.addSlide(); slide.background = { color: "000000" };
    slide.addImage({ path: s.file, x: 0, y: 0, w: W, h: H, altText: words });
    slide.addNotes(words);
  }
  const out = path.join(OUT, `${name}.pptx`);
  await pres.writeFile({ fileName: out });
  console.log(`  ${name}.pptx  ${slides.length} slides  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shapes = process.argv[2] ? [process.argv[2]] : Object.keys(SHAPES);
  const browser = await launch();
  for (const shape of shapes) { console.log(`LIMIT+1 sales slides, ${shape}`); await record(browser, shape); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
