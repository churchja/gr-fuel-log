// LIMIT+1 Flex Fuel preview (limitplus1/preview/): no sign-in, sample data, and nothing sent anywhere.
// Run: node test/preview.test.js
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const W = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch();
  // No location permission here: the preview pretends the phone is in Crystal Lake and never asks.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [], outside = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith("http://localhost:4173/")) { const p = W + new URL(u).pathname; return fs.existsSync(p) && fs.statSync(p).isFile() ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) outside.push(u); // anything else would be the preview reaching out
    return route.abort();
  });
  const log = (...a) => console.log(...a);
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const shot = (n) => page.screenshot({ path: `${W}/test/shot-preview-${n}.png`, fullPage: true });
  const text = async (sel = "#app") => (await page.locator(sel).innerText()).replace(/\n+/g, " | ");
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); };
  const URL0 = "http://localhost:4173/limitplus1/preview/index.html";

  // 1 Welcome: the ribbon, the logo, one Start button, and no email, code or bot check
  await page.goto(URL0);
  await page.waitForSelector("[data-act=previewStart]");
  const welcome = await text(), ribbon = await page.locator(".preview-ribbon").innerText();
  const logo = await page.locator(".brandmark img").evaluate((i) => i.complete && i.naturalWidth > 0);
  log("1 welcome:", ribbon, "|", welcome.slice(0, 520));
  expect(/Preview · sample data, nothing is saved · Start over/.test(ribbon) && logo, "ribbon or logo missing");
  expect(!(await page.locator("#email, #code, #bot-check").count()) && /No sign-in/.test(welcome) && /Powered by Shady Acres LLC/.test(welcome) && /A concept by Shady Acres LLC/.test(welcome), "the preview welcome is wrong");
  expect(await page.title() === "LIMIT+1 Flex Fuel · Preview" && await page.getAttribute("meta[name=robots]", "content") === "noindex, nofollow", "title or noindex wrong");
  await shot("welcome");

  // 2 Start: the same quick setup a new customer gets
  await page.click("[data-act=previewStart]"); await page.waitForSelector("text=Set up your car");
  await page.click("[data-k=model][data-v=grc]"); await page.waitForSelector("[data-k=year]");
  await page.click("[data-k=year][data-v='2025']"); await page.waitForSelector("[data-k=trans]");
  await page.click("[data-k=trans][data-v=mt]");
  await page.click("[data-k=pkg][data-v=pp2]");
  await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("911 Tek Dr")');
  const picker = await text("#pickBody");
  log("2 picker:", picker.slice(0, 420));
  expect(/Thorntons · 911 Tek Dr/.test(picker) && /Crystal Lake, IL · 7 members/.test(picker) && /E67/.test(picker), "the picker should list the sample community's stations near Crystal Lake");
  // Search works over the DOE snapshot: a town, a ZIP, a brand, and a place outside it
  const find = async (q, sel) => { await page.fill("#pickQ", q); await page.waitForSelector(sel); return text("#pickBody"); };
  const cary = await find("Cary", "h2:has-text('Near Cary, IL')");
  const zip = await find("60014", "h2:has-text('Near 60014')");
  const brand = await find("speedway", "h2:has-text('Matching stations')");
  const far = await find("Dallas", "text=No stations match");
  log("2a search Cary:", cary.slice(0, 200)); log("   60014:", zip.slice(0, 160)); log("   speedway:", brand.slice(0, 200)); log("   Dallas:", far.slice(0, 120));
  expect(/Thorntons · 800 NW Hwy/.test(cary) && /Casey's · 639 E Terra Cotta Ave/.test(zip) && /Speedway · 22055 N Kelsey Rd/.test(brand) && /Speedway · 110 Arrowhead Dr/.test(brand), "search over the snapshot wrong");
  await page.fill("#pickQ", ""); await page.waitForSelector('.srow:has-text("911 Tek Dr")');
  await page.click('.srow:has-text("911 Tek Dr")'); await page.waitForSelector("text=Set up your car");
  await page.fill("#c-forum", "grc_preview");
  await shot("setup");
  const pickedNote = await page.locator("#toast").innerText();
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  // Saving replaces the "Station set · Undo" note, so it doesn't cover the pump plan with nothing left to undo
  const savedNote = await page.locator("#toast").innerText();
  log("2b note before save:", pickedNote.replace(/\n+/g, " "), "| after:", savedNote.replace(/\n+/g, " "));
  expect(/Station set to Thorntons · 911 Tek Dr/.test(pickedNote) && /^Settings saved\.$/.test(savedNote.trim()), "the saved note should replace the Undo note");

  // 3 Pump: the sample log is in, the sensor box holds the last blend, and the oil change is coming due
  const pump = await text(), sensor = await page.inputValue("#sensor");
  log("3 pump:", pump.slice(0, 600), "| sensor:", sensor);
  expect(Number(sensor) >= 36 && Number(sensor) <= 44, "the sensor box should hold the last fill's blend");
  expect(/Engine oil and filter\./.test(pump) && /1 more/.test(pump) && /E67/.test(pump), "the oil reminder or the learned E85 is missing");
  await page.fill("#dte", "34");
  await page.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
  const readout = (await page.locator("#readout").innerText()).replace(/\n+/g, " | ");
  log("3a plan:", readout.slice(0, 300));
  await shot("pump");

  // 4 History: twelve fills over about ten weeks, one landing low after the winter blend switch
  await go("history", "h1:has-text('History')");
  const hist = await text(), d = await page.evaluate(() => window.__preview.data());
  const blends = d.fills.map((f) => f.sensor_after);
  log("4 history:", hist.slice(0, 520));
  log("   fills:", d.fills.length, "| first", d.fills[0].date, d.fills[0].odometer, "| last", d.fills[11].date, d.fills[11].odometer, "| after readings:", blends.join(","));
  expect(d.fills.length === 12 && blends.filter((b) => b !== null).every((b) => b >= 33 && b <= 46) && blends.some((b) => b !== null && b <= 37), "the sample fills look wrong");
  await shot("history");

  // 5 Learned: the station's switch, the sensor, fuel left, accuracy
  await go("learned", "h1:has-text('What the app has learned')");
  const learned = await text();
  log("5 learned:", learned.slice(0, 700));
  expect(/Primary · Thorntons · 911 Tek Dr/.test(learned) && /Blend switch spotted/.test(learned) && /from E79 to E67/.test(learned) && /average miss, last 10 fills/.test(learned), "the learned page is missing its sample numbers");
  await shot("learned");

  // 6 Service: the 2025 GR Corolla manual schedule, oil and tires coming due, nothing else
  await go("service", "h1:has-text('Service')");
  const svc = await text();
  log("6 service:", svc.slice(0, 640));
  expect(/2025 GR Corolla/.test(svc) && /Manual transmission oil/.test(svc) && /Transfer case oil/.test(svc), "GR Corolla schedule missing");
  const svcRows = await page.evaluate(() => [...document.querySelectorAll(".chip")].map((c) => c.textContent));
  log("   chips:", svcRows.join(", "));
  await shot("service");

  // 7 Community: sample owners, stations, and a station page
  await go("community", "text=owners sharing");
  const com = await text();
  log("7 community:", com.slice(0, 600));
  expect(/24 owners sharing/.test(com) && /Thorntons · 911 Tek Dr/.test(com) && /Switched from E79/.test(com), "community sample missing");
  await page.click('.srow:has-text("911 Tek Dr")'); await page.waitForSelector("text=U.S. DOE E85 list");
  const station = await text();
  log("7a station:", station.slice(0, 520));
  expect(/Listed as selling E85 from a blender pump/.test(station) && /24 hours daily/.test(station) && /\$2\.39/.test(station), "station page wrong");
  await shot("station");

  // 8 About: version, contact details, station counts
  await go("about", "text=E85 stations as of");
  const about = await text();
  log("8 about:", about.slice(0, 300));
  expect(/Version 35/.test(about) && /Call 815-345-3035/.test(about), "About page wrong");

  // 9 A reload keeps the tab's preview; Start over wipes it
  await page.reload(); await page.waitForSelector(".brandbar");
  const kept = await page.evaluate(() => window.__preview.data().fills.length);
  await page.click("[data-preview-reset]"); await page.waitForSelector("[data-act=previewStart]");
  const wiped = await page.evaluate(() => ({ stored: sessionStorage.getItem("lp1-preview-v1"), fills: window.__preview.data().fills.length, hash: location.hash }));
  log("9 reload kept", kept, "fills | after Start over:", JSON.stringify(wiped));
  expect(kept === 12 && wiped.stored === null && wiped.fills === 0, "reload or Start over wrong");

  // 10 A GR86 / BRZ owner: its own schedule and reminder, in dark mode
  await page.emulateMedia({ colorScheme: "dark" });
  await page.click("[data-act=previewStart]"); await page.waitForSelector("text=Set up your car");
  await page.click("[data-k=model][data-v=gr86]"); await page.waitForSelector("[data-k=year]");
  await page.click("[data-k=year][data-v='2024']"); await page.waitForSelector("[data-k=trans]");
  await page.click("[data-k=trans][data-v=at]");
  await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("800 NW Hwy")');
  await page.click('.srow:has-text("800 NW Hwy")'); await page.waitForSelector("text=Set up your car");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  const pump86 = await text(), d86 = await page.evaluate(() => window.__preview.data());
  log("10 GR86 pump:", pump86.slice(0, 300));
  log("   oil change logged at", d86.oil_changes[0].odometer, "on", d86.oil_changes[0].date, "| last fill", d86.fills[11].odometer, "| station", d86.my_stations[0].display_name, "E" + Math.round(d86.my_stations[0].value));
  expect(/Engine oil and filter\./.test(pump86) && d86.fills[11].odometer - d86.oil_changes[0].odometer === 7240 && /E70/.test(pump86), "GR86 sample wrong");
  await page.fill("#dte", "30");
  await shot("pump-gr86-dark");
  await go("service", "h1:has-text('Service')");
  expect(/Fuel filter/.test(await text()) && /BRZ owners/.test(await text()), "GR86 schedule missing");

  // 11 Sign out starts over too; nothing left the page; no errors or sideways scrolling
  await go("more", "text=Signed in as");
  log("11 more:", (await text()).slice(0, 200));
  await page.click("[data-act=signOut]"); await page.waitForSelector("[data-act=previewStart]");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log("   requests outside the page:", outside.length ? outside : "none", "| overflow:", overflow, "| errors:", errors.length ? errors : "none");
  expect(!outside.length && !overflow && !errors.length, "the preview reached out, overflowed or threw errors");
  await browser.close();
  console.log("LIMIT+1 preview checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
