// Records the LIMIT+1 sales video: the LIMIT+1 version on the preview's sample history inside video/stage.html, with
// captions and no sound, plus four mock-ups of extras that aren't built (video/mocks.js).
// Run: node video/sales-record.js [vertical|landscape]   (no argument: both)
// Writes video/out/LIMIT1-Flex-Fuel-sales-<shape>.mp4. Nothing is sent anywhere.
const fs = require("fs"), path = require("path");
const { BASE, OUT, launch, route, capture, encode } = require("./harness");
const mocks = require("./mocks");

const SHAPES = { vertical: { width: 1080, height: 1920 }, landscape: { width: 1920, height: 1080 } };
// When each scene ends, in seconds.
const END = { open: 4, problem: 10, gallons: 20, learns: 28, service: 35, brand: 42, sale: 50, support: 58, tuner: 62, shop: 67, cars: 71, share: 76, runs: 83, close: 91 };
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
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: "light" });
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
  const raw = path.join(OUT, `raw-${name}.mkv`);
  const cap = await capture(ctx, page, size, raw);
  const t0 = cap.t0;
  const hold = (ms) => page.waitForTimeout(ms);
  const until = async (sec, what) => { const left = t0 + sec * 1000 - Date.now(); if (left > 0) await hold(left); else if (left < -150) console.log(`    ${(-left / 1000).toFixed(1)}s late at ${what || sec}`); };
  const tap = async (loc, wait = 330) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await stage("tap", b.x + b.width / 2, b.y + b.height / 2);
    await hold(wait);
    await loc.click();
  };
  const type = async (loc, text, delay = 150) => { await tap(loc); await loc.pressSequentially(text, { delay }); };
  const ring = async (loc) => { const b = await loc.boundingBox(); if (b) await stage("ring", b.x, b.y, b.width, b.height); };
  const go = async (hash, sel) => { await frame.evaluate((h) => { location.hash = h; }, hash); await app.locator(sel).first().waitFor(); };
  const quiet = () => frame.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.hidden = true; });
  let seconds = 0;

  try {
    // Open: the title card
    await until(END.open - 0.4);
    await caption("problem");
    await until(END.open); await stage("card", null);

    // The problem: the pump screen, waiting for numbers
    await until(END.problem);

    // The exact gallons
    await caption("gallons"); await hold(900);
    await type(app.locator("#dte"), "34", 200); await hold(400);
    await type(app.locator("#sensor"), "38", 200);
    await frame.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
    await hold(700); await ring(app.locator("#readout"));
    await until(END.gallons);

    // It learns each station's real E85
    await caption("learns"); await hold(500);
    await tap(app.locator("#tabs nav a[href='#more']")); await app.locator("a.item[href='#learned']").waitFor(); await hold(500);
    await tap(app.locator("a.item[href='#learned']")); await app.locator("h1:has-text('What the app has learned')").waitFor();
    await hold(900); await ring(app.locator("#app section.dark").first());
    await until(END.learns);

    // Service reminders
    await caption("service"); await hold(500);
    await tap(app.locator("#tabs nav a[href='#more']")); await app.locator("a.item[href='#service']").waitFor(); await hold(450);
    await tap(app.locator("a.item[href='#service']")); await app.locator("h1:has-text('Service')").waitFor();
    await hold(800); await ring(app.locator(".item:has-text('Engine oil and filter')").first());
    await until(END.service);

    // Your brand in their pocket: the logo stays put from screen to screen
    await caption("brand"); await hold(600);
    await ring(app.locator(".brandbar img"));
    await hold(900); await tap(app.locator("#tabs nav a[href='#history']")); await app.locator("h1:has-text('History')").waitFor();
    await hold(1500); await tap(app.locator("#tabs nav a[href='#community']")); await app.locator("text=owners sharing").waitFor();
    await until(END.brand - 0.8, "brand");
    await tap(app.locator("#tabs nav a[href='#pump']")); await app.locator("h1:has-text('Pump plan')").waitFor();
    await until(END.brand);

    // Your sale and your parts: the bar above the bottom menu
    await caption("sale"); await hold(900);
    await ring(app.locator("#promo")); await hold(3200);
    await ring(app.locator("#promo"));
    await until(END.sale);

    // You're one tap away
    await caption("support"); await hold(500);
    await tap(app.locator("#tabs nav a[href='#more']")); await app.locator("a.item[href='#about']").waitFor(); await hold(450);
    await tap(app.locator("a.item[href='#about']")); await app.locator("text=E85 stations as of").waitFor();
    await hold(900); await ring(app.locator("a.item:has-text('Support request')"));
    await until(END.support);

    // On request: four mock-ups
    await caption("tuner"); await hold(230); await go("history", "h1:has-text('History')"); await quiet(); await mocks.tuner(frame);
    await hold(700); await ring(app.locator("#mock-tuner"));
    await until(END.tuner);

    await caption("shop"); await hold(230); await go("service", "h1:has-text('Service')");
    await tap(app.locator(".item:has-text('Engine oil and filter')").first()); await app.locator("h1:has-text('Engine oil and filter')").waitFor(); await mocks.shop(frame);
    await hold(700); await ring(app.locator("#mock-shop"));
    await until(END.shop);

    await caption("cars"); await hold(230); await go("car", "text=Gas grade you mix with"); await mocks.cars(frame);
    await hold(700); await ring(app.locator('[aria-label="Model"]'));
    await until(END.cars);

    await caption("share"); await hold(230); await go("history", "h1:has-text('History')"); await hold(500); await mocks.share(frame);
    await until(END.share);

    // Nothing to build or run: back at the sign-in screen
    await caption("runs"); await hold(230);
    await mocks.clear(frame); await go("more", "[data-act=signOut]");
    await frame.evaluate(() => document.querySelector("[data-act=signOut]").click()); await app.locator("#email").waitFor();
    await until(END.runs);

    // Close
    await stage("card", "close");
    await until(END.close);
  } finally {
    seconds = await cap.stop();
    await ctx.close();
  }
  if (outside.length || errors.length) throw new Error(`${name}: reached outside (${outside.join(", ")}) or threw errors (${errors.join(" | ")})`);
  const out = path.join(OUT, `${name}.mp4`);
  encode(raw, out);
  console.log(`  ${name}.mp4  ${seconds.toFixed(1)}s  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shapes = process.argv[2] ? [process.argv[2]] : Object.keys(SHAPES);
  const browser = await launch();
  for (const shape of shapes) { console.log(`LIMIT+1 sales video, ${shape}`); await record(browser, shape); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
