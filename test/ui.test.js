const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const W = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: 37.9716, longitude: -87.5711 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("supabase-js")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-supabase.js", "utf8") });
    if (u.includes("challenges.cloudflare.com")) return route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render:function(el,o){el.textContent='bot check ok';setTimeout(function(){o.callback('test-token');},10);return 'w1';}};" });
    if (u.includes("tesseract")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-tesseract.js", "utf8") });
    if (u.startsWith("http://localhost:4173/")) { const p = W + "/" + (new URL(u).pathname.slice(1) || "index.html"); return fs.existsSync(p) ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
    return route.abort();
  });
  const log = (...a) => console.log(...a);
  const shot = (n) => page.screenshot({ path: `${W}/test/shot-${n}.png`, fullPage: true });
  await page.goto("http://localhost:4173/index.html");
  await page.waitForSelector("#email");
  log("1 sign-in screen:", await page.locator("h1, .wordmark").first().innerText());
  await shot("signin");
  await page.fill("#email", "Jason.A.Church@shadyacres.my"); await page.click("text=Send me a code");
  await page.waitForSelector("#code");
  await page.fill("#code", "123456"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Set up your car");
  log("2 after sign-in:", await page.locator("h1").innerText());
  // Primary E85: pick a station members already use
  await page.click("#c-e85"); await page.waitForSelector(".srow");
  log("2b picker:", (await page.locator("#pickBody").innerText()).replace(/\n+/g, " | ").slice(0, 230));
  await shot("picker");
  await page.click('.srow:has-text("MotoMart")'); await page.waitForSelector("text=Set up your car");
  // Primary gas: not listed yet, so add it from the map match and confirm the standard name
  await page.click("#c-gas"); await page.waitForSelector("text=Add a station that isn't listed");
  await page.click("text=Add a station that isn't listed"); await page.waitForSelector("text=Is it one of these?");
  await shot("picker-add");
  await page.fill("#pickLookup", "thorntons"); await page.waitForSelector("text=Matches");
  log("2b2 search:", (await page.locator("#pickBody .card.list").innerText()).replace(/\n+/g, " | "));
  await page.fill("#pickLookup", ""); await page.waitForSelector("text=Is it one of these?");
  await page.click('.srow:has-text("Costco")'); await page.waitForSelector("#pickBrand");
  await page.fill("#pickBrand", "Costco");
  log("2c confirm preview:", await page.locator("#pickPreview").innerText());
  await page.click("button:has-text('Confirm and use')"); await page.waitForSelector("text=Set up your car");
  log("2d primaries:", (await page.locator("#c-e85").innerText()).trim(), "|", (await page.locator("#c-gas").innerText()).trim());
  await page.fill("#c-handle", "jchurch");
  await page.click("button:has-text('Save and start')");
  await page.waitForSelector("text=Pump plan");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  log("3 pump readout:", (await page.locator("#readout").innerText()).replace(/\n+/g, " | "));
  await shot("pump");
  // Standing at a known E85 station that isn't the primary: the app offers it
  await page.waitForSelector("text=Use it for this plan", { timeout: 5000 });
  log("3b suggestion:", await page.locator("#pumpSuggest").innerText());
  await page.click("text=Use it for this plan");
  log("  other station note:", (await page.locator("#readout p").innerText()).slice(0, 110));
  await page.click("[data-act=which][data-w=primary]");
  await page.click("#logPlan");
  await page.waitForSelector("text=Log a fill");
  await page.fill("#f-odo", "46340");
  // Stop 1: phone OCR reads the E85 receipt fully
  await page.evaluate(() => { window.__ocrText = "MOTOMART #1234\n6328 E LLOYD EXPY\n11/05/26\nE85 FLEX FUEL\nGALLONS 5.312\nPRICE/GAL $2.379\nFUEL SALE $12.64"; });
  const img = W + "/icons/icon-192.png";
  await page.setInputFiles("#ph0", img);
  await page.waitForSelector("#stops .note-ok");
  log("4 stop 1 after phone read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st0").textContent.trim(), g: document.querySelector("#ga0").value, p: document.querySelector("#pr0").value, t: document.querySelector("#to0").value }))));
  // Stop 2: phone OCR misses gallons -> offer Claude -> Claude fills it
  await page.evaluate(() => { window.__ocrText = "COSTCO\nPREMIUM\nTHANK YOU"; });
  await page.setInputFiles("#ph1", img);
  await page.waitForSelector("[data-act=claudeRead]");
  log("5 stop 2 offer:", await page.locator("[data-act=claudeRead]").innerText());
  await shot("log");
  await page.click("[data-act=claudeRead]");
  await page.waitForFunction(() => document.querySelector("#ga1") && document.querySelector("#ga1").value === "5.1");
  log("6 after Claude read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st1").textContent.trim(), g: document.querySelector("#ga1").value, grade: document.querySelector("#g1").value, sum: document.querySelector("#f-summary").textContent }))));
  await page.fill("#f-after", "40");
  await page.click("button:has-text('Save fill')");
  await page.waitForSelector("text=History");
  const saved = await page.evaluate(() => window.__db.fills[0]);
  log("7 saved fill:", JSON.stringify({ date: saved.date, odo: saved.odometer, before: saved.sensor_before, after: saved.sensor_after, plan: saved.plan, stops: saved.stops.map((s) => [s.kind, s.station, s.station_id, s.gallons, s.total, s.grade]) }));
  log("  history:", (await page.locator(".card.list").innerText()).replace(/\n+/g, " | "));
  await shot("history");
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector("text=Stations members use");
  log("8a listed chip:", (await page.locator('.srow:has-text("Casey")').innerText()).replace(/\n+/g, " | "));
  await page.click('.srow:has-text("MotoMart")'); await page.waitForSelector("text=Price history");
  log("8 station page:", (await page.locator("#app").innerText()).replace(/\n+/g, " | ").slice(0, 300));
  await shot("station");
  for (const v of ["community", "oil", "learned", "car", "admin", "more"]) {
    await page.evaluate((h) => { location.hash = h; }, v);
    await page.waitForTimeout(150);
    log(`8 ${v}:`, (await page.locator("#app").innerText()).replace(/\n+/g, " | ").slice(0, 170));
    await shot(v);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForTimeout(150);
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await shot("pump-dark");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log("9 horizontal overflow:", overflow, "| errors:", errors.length ? errors : "none");
  log("  rpc/fn calls:", JSON.stringify(await page.evaluate(() => window.__calls.filter((c) => c.rpc || c.fn || c.otp).map((c) => c.rpc || c.fn || "otp"))));
  await browser.close();
})();
