const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const W = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("supabase-js")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-supabase.js", "utf8") });
    if (u.includes("tesseract")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-tesseract.js", "utf8") });
    if (u.startsWith("http://app.test/")) { const p = W + "/" + (new URL(u).pathname.slice(1) || "index.html"); return fs.existsSync(p) ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
    return route.abort();
  });
  const log = (...a) => console.log(...a);
  const shot = (n) => page.screenshot({ path: `${W}/test/shot-${n}.png`, fullPage: true });
  await page.goto("http://app.test/index.html");
  await page.waitForSelector("#email");
  log("1 sign-in screen:", await page.locator("h1, .wordmark").first().innerText());
  await shot("signin");
  await page.fill("#email", "Jason.A.Church@shadyacres.my"); await page.click("text=Send me a code");
  await page.waitForSelector("#code");
  await page.fill("#code", "123456"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Set up your car");
  log("2 after sign-in:", await page.locator("h1").innerText());
  await page.fill("#c-e85", "MotoMart E Lloyd"); await page.fill("#c-gas", "Costco Cross Pointe"); await page.fill("#c-handle", "jchurch");
  await page.click("button:has-text('Save and start')");
  await page.waitForSelector("text=Pump plan");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  log("3 pump readout:", (await page.locator("#readout").innerText()).replace(/\n+/g, " | "));
  await shot("pump");
  await page.click("[data-act=which][data-w=other]");
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
  log("4 stop 1 after phone read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st0").value, g: document.querySelector("#ga0").value, p: document.querySelector("#pr0").value, t: document.querySelector("#to0").value }))));
  // Stop 2: phone OCR misses gallons -> offer Claude -> Claude fills it
  await page.evaluate(() => { window.__ocrText = "COSTCO\nPREMIUM\nTHANK YOU"; });
  await page.setInputFiles("#ph1", img);
  await page.waitForSelector("[data-act=claudeRead]");
  log("5 stop 2 offer:", await page.locator("[data-act=claudeRead]").innerText());
  await shot("log");
  await page.click("[data-act=claudeRead]");
  await page.waitForFunction(() => document.querySelector("#ga1") && document.querySelector("#ga1").value === "5.1");
  log("6 after Claude read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st1").value, g: document.querySelector("#ga1").value, grade: document.querySelector("#g1").value, sum: document.querySelector("#f-summary").textContent }))));
  await page.fill("#f-after", "40");
  await page.click("button:has-text('Save fill')");
  await page.waitForSelector("text=History");
  const saved = await page.evaluate(() => window.__db.fills[0]);
  log("7 saved fill:", JSON.stringify({ date: saved.date, odo: saved.odometer, before: saved.sensor_before, after: saved.sensor_after, plan: saved.plan, stops: saved.stops.map((s) => [s.kind, s.station, s.gallons, s.total, s.grade]) }));
  log("  history:", (await page.locator(".card.list").innerText()).replace(/\n+/g, " | "));
  await shot("history");
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
