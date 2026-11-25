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
    if (u.includes("challenges.cloudflare.com")) return new Promise((r) => setTimeout(r, 400)).then(() => route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render:function(el,o){el.textContent='bot check ok';setTimeout(function(){o.callback('test-token');},10);return 'w1';}};" }));
    if (u.includes("tesseract")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-tesseract.js", "utf8") });
    if (u.startsWith("http://localhost:4173/")) { const p = W + "/" + (new URL(u).pathname.slice(1) || "index.html"); return fs.existsSync(p) ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
    return route.abort();
  });
  const log = (...a) => console.log(...a);
  const shot = (n) => page.screenshot({ path: `${W}/test/shot-${n}.png`, fullPage: true });
  await page.goto("http://localhost:4173/index.html");
  await page.waitForSelector("#email");
  log("1 sign-in screen:", await page.locator("h1, .wordmark").first().innerText());
  const fine = await page.locator("p.fine").innerText();
  if (!/Not affiliated with Toyota/.test(fine) || !/Use at your own risk/.test(fine)) throw new Error("disclaimer missing from sign-in");
  const fineBox = await page.locator("p.fine").boundingBox();
  log("1a disclaimer at bottom:", Math.round(fineBox.y + fineBox.height), "of 844 |", fine);
  if (fineBox.y + fineBox.height < 760) throw new Error("disclaimer isn't near the bottom of the screen");
  await shot("signin");
  await page.waitForFunction(() => document.querySelector("#bot-check") && document.querySelector("#bot-check").textContent.includes("bot check ok"), null, { timeout: 5000 });
  log("1b bot check box shows on screen");
  await page.fill("#email", "Jason.A.Church@shadyacres.my"); await page.click("text=Send me a code");
  await page.waitForSelector("#code");
  await page.fill("#code", "123456"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Set up your car");
  log("2 after sign-in:", await page.locator("h1").innerText());
  // Primary E85: pick a station members already use
  await page.click("#c-e85"); await page.waitForSelector(".srow");
  log("2b picker:", (await page.locator("#pickBody").innerText()).replace(/\n+/g, " | ").slice(0, 230));
  await shot("picker");
  // Current location: the closest E85 stations from every list, nearest first; the search box filters them
  await page.click("[data-act=pickerNear]"); await page.waitForSelector("text=Closest E85 stations to you");
  const near = (await page.locator("#pickBody .card.list").innerText()).replace(/\n+/g, " | ");
  log("2n near:", near);
  const nearArgs = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "stations_near").pop().args);
  if (!/^Thorntons · 813 N St Joseph Ave/.test(near) || !/1\.8 mi.*3\.1 mi.*5\.9 mi/.test(near) || !/E85 \$2\.35 on Nov 10/.test(near) || nearArgs.p_e85_only !== true || typeof nearArgs.p_lat !== "number") throw new Error("closest stations wrong");
  await page.locator("#pickBody").screenshot({ path: `${W}/test/shot-picker-near.png` });
  await page.fill("#pickQ", "morgan");
  log("2n2 filtered:", (await page.locator("#pickBody .card.list").innerText()).replace(/\n+/g, " | "));
  if (await page.locator("#pickBody .card.list").first().locator(".srow").count() !== 1) throw new Error("search did not filter the closest list");
  // With location on, typing still searches every E85 station: the whole-list results show under the nearby ones
  await page.waitForSelector("text=Searched all E85 stations");
  await page.fill("#pickQ", "Dallas"); await page.waitForSelector("text=Near Dallas, TX");
  log("2n3 near mode, Dallas:", (await page.locator("#pickBody").innerText()).replace(/\n+/g, " | ").slice(0, 220));
  await page.fill("#pickQ", "");
  // Searching by place covers every E85 station, not just the ones members use: "Dallas, Texas" lists the stations
  // nearest Dallas with their distance from it, and offers the other Dallases
  await page.click("[data-act=pickerNearOff]");
  await page.fill("#pickQ", "Dallas, Texas"); await page.waitForSelector("text=Near Dallas, TX");
  const dal = (await page.locator("#pickBody").innerText()).replace(/\n+/g, " | ");
  log("2s place search:", dal);
  const sArgs = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "stations_search").pop().args);
  if (!/QuikTrip · 1449 Inwood Rd.*4\.0 mi.*RaceTrac/.test(dal) || !/Did you mean \| ?Dallas, GA|Did you mean Dallas, GA/.test(dal) || sArgs.p_q !== "Dallas, Texas") throw new Error("place search wrong");
  await page.locator("#pickBody").screenshot({ path: `${W}/test/shot-picker-search.png` });
  await page.fill("#pickQ", "");
  if (await page.locator("text=Near Dallas, TX").count()) throw new Error("search results stayed after clearing the box");
  await page.click("[data-act=pickerNear]"); await page.waitForSelector("text=Closest E85 stations to you");
  // A failed lookup says so and offers Try again; it never claims there are no stations nearby
  await page.evaluate(() => { window.__nearFail = true; });
  await page.click(".near-btn"); await page.waitForSelector("[data-act=pickerNear]");
  await page.click(".near-btn"); await page.waitForSelector("text=Couldn't load stations near you");
  const failTxt = (await page.locator("#pickBody").innerText()).replace(/\n+/g, " | ");
  log("2n4 failed lookup:", failTxt.slice(0, 200));
  if (/within 50 miles/.test(failTxt) || !(await page.locator("#pickBody button:has-text('Try again')").count()) || !(await page.locator("[data-act=pickerNearOff]").count())) throw new Error("failed lookup shown wrong");
  await page.evaluate(() => { window.__nearFail = false; });
  await page.click("#pickBody button:has-text('Try again')"); await page.waitForSelector("text=Closest E85 stations to you");
  log("2n5 after Try again:", await page.locator("#pickBody .card.list .srow").count(), "stations");
  await page.click("[data-act=pickerNearOff] >> nth=0"); await page.waitForSelector("[data-act=pickerNear]");
  log("2n3 back to my stations:", await page.locator("#pickBody .srow-wrap").count(), "rows");
  // Swipe a station left to reveal its button
  await page.evaluate(() => {
    const el = document.querySelector("[data-swipe]"), r = el.getBoundingClientRect();
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 10 });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t(r.right - 20)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchmove", { touches: [t(r.right - 140)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
  });
  log("2b3 swipe:", await page.locator(".srow-wrap.open").count(), "row open, button:", await page.locator(".srow-wrap.open .srow-act").innerText());
  await page.click("[data-act=pickerEdit]");
  log("2b4 edit mode buttons:", (await page.locator(".srow-act").allInnerTexts()).join(", "));
  await page.waitForTimeout(300); await shot("picker-edit");
  await page.click('.srow-wrap:has-text("Casey") [data-act=pickerHide]'); await page.waitForSelector("#toast:not([hidden])");
  log("2b5 hide:", await page.locator('.srow-wrap:has-text("Casey")').count(), "shown |", (await page.locator("#toast").innerText()).replace(/\n+/g, " "), "| link:", await page.locator("[data-act=pickerShowHidden]").innerText());
  await page.click("#toast [data-act=toastAct]"); await page.waitForSelector('.srow-wrap:has-text("Casey")');
  await page.click('.srow-wrap:has-text("Speedway") [data-act=pickerDelete]'); await page.waitForSelector("#toast:not([hidden])");
  log("2b6 delete:", await page.locator('.srow-wrap:has-text("Speedway")').count(), "shown |", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("#toast [data-act=toastAct]");
  log("2b7 undo delete:", await page.locator('.srow-wrap:has-text("Speedway")').count(), "shown | delete sent to server:", await page.evaluate(() => window.__calls.some((c) => c.rpc === "delete_station")));
  await page.click("[data-act=pickerEdit]");
  await page.click('.srow:has-text("MotoMart")'); await page.waitForSelector("text=Set up your car");
  // First-time setup asks only for the car, the blend and the E85 station
  const firstRun = await page.evaluate(() => ({ gas: !!document.querySelector("#c-gas"), handle: !!document.querySelector("#c-handle"), share: !!document.querySelector("#c-share"), rx: !!document.querySelector("#c-rx"),
    years: [...document.querySelectorAll("[data-k=year]")].map((b) => b.textContent).join() }));
  log("2e first-time setup:", JSON.stringify(firstRun));
  if (firstRun.gas || firstRun.handle || firstRun.share || firstRun.rx || firstRun.years !== "2023,2024,2025,2026,2027") throw new Error("first-time setup should be short and ask the model year");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("text=Choose your model year.");
  await page.click("[data-k=year][data-v='2025']"); await page.waitForSelector("[data-k=trans]");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("text=Choose manual or automatic.");
  await page.click("[data-k=year][data-v='2024']");
  if (await page.locator("[data-k=trans]").count()) throw new Error("a 2024 GR Corolla is manual only, so no transmission question");
  log("2f after choosing 2024:", (await page.locator("#c-e85").innerText()).trim(), "| transmission asked:", await page.locator("[data-k=trans]").count());
  await shot("setup");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("text=Pump plan");
  const firstSaved = await page.evaluate(() => window.__db.profiles[0].settings);
  log("2g saved:", JSON.stringify({ year: firstSaved.year, trans: firstSaved.trans, e85: firstSaved.primaryE85, receipt: firstSaved.receiptMode, oilMiles: firstSaved.oilMiles }));
  if (firstSaved.year !== 2024 || firstSaved.trans !== "mt" || firstSaved.receiptMode !== "phone_first" || firstSaved.oilMiles !== null) throw new Error("first-time setup saved the wrong settings");
  // The rest lives in Your car. Primary gas: not listed yet, so add it from the map match and confirm the standard name
  await page.evaluate(() => { location.hash = "car"; }); await page.waitForSelector("text=Your data");
  await page.click("#c-gas"); await page.waitForSelector("text=Add a station that isn't listed");
  if (!(await page.getAttribute("[data-act=pickerAdd]", "class")).includes("link")) throw new Error("Add a station should be a small link");
  await page.click("text=Add a station that isn't listed"); await page.waitForSelector("text=Is it one of these?");
  await shot("picker-add");
  await page.fill("#pickLookup", "thorntons"); await page.waitForSelector("text=Matching stations");
  const found = (await page.locator("#pickBody .card.list").innerText()).replace(/\n+/g, " | ");
  log("2b2 search:", found);
  if (!/on the DOE and E85prices\.com lists/.test(found) || !/on the E85prices\.com list · E85 \$2\.39 on Nov 2 \(E85prices\.com\)/.test(found)) throw new Error("E85prices.com listing not shown in search");
  log("2b2a credit:", /E85prices\.com \(Renewable Fuels Association\)/.test(await page.locator("#app").innerText()));
  await page.fill("#pickLookup", ""); await page.waitForSelector("text=Is it one of these?");
  await page.click('.srow:has-text("Costco")'); await page.waitForSelector("#pickBrand");
  // Typing help: a likely misspelled brand, a street without a number, and city, state and ZIP split out of the street
  await page.fill("#pickBrand", "Cheveron"); await page.fill("#pickStreet", "victoria avenue ventura ca 93003");
  const hints = await page.locator("#pickHints").innerText(), pv = await page.locator("#pickPreview").innerText(), pl = (await page.locator("#pickPlace").innerText()).trim();
  log("2c0 hints:", hints.replace(/\n+/g, " | "), "| preview:", pv, pl);
  if (!/Did you mean Chevron/.test(hints) || !/street number/.test(hints)) throw new Error("name hints missing");
  if (pv !== "Cheveron · Victoria Ave" || pl !== "· Ventura, CA 93003") throw new Error("preview not cleaned");
  await shot("picker-hints");
  await page.click("[data-act=pickBrandFix]");
  log("2c1 after fix:", await page.inputValue("#pickBrand"), "|", await page.locator("#pickPreview").innerText());
  if (await page.inputValue("#pickBrand") !== "Chevron") throw new Error("brand fix not applied");
  await page.fill("#pickStreet", "4500 N Green River Road, Evansville, IN 47715");
  await page.fill("#pickBrand", "Costco");
  log("2c confirm preview:", await page.locator("#pickPreview").innerText());
  await page.click("button:has-text('Confirm and use')"); await page.waitForSelector("text=Your data");
  const sent = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "standardize_station").pop().args);
  log("2c2 saved:", JSON.stringify(sent));
  if (sent.p_street !== "4500 N Green River Rd" || sent.p_city !== "Evansville" || sent.p_state !== "IN" || sent.p_postcode !== "47715") throw new Error("address not split");
  log("2d primaries:", (await page.locator("#c-e85").innerText()).trim(), "|", (await page.locator("#c-gas").innerText()).trim());
  await page.fill("#c-handle", "jchurch");
  // Receipt photos are one switch now, not four choices
  const rx = await page.evaluate(() => ({ on: document.querySelector("#c-rx").checked, radios: document.querySelectorAll("[name=rm]").length }));
  log("2h receipt switch:", JSON.stringify(rx));
  if (!rx.on || rx.radios) throw new Error("receipt photos should be one on/off switch");
  await page.click("form[data-form=saveCar] button[type=submit]");
  await page.waitForSelector("text=Pump plan");
  // Confirmations show in the bottom bar only, not as a banner that pushes the pump plan down
  await page.waitForSelector("#toast:not([hidden])");
  log("2i saved message:", (await page.locator("#toast").innerText()).trim(), "| banners saying it:", await page.locator(".banner:has-text('Settings saved')").count());
  if (!/Settings saved/.test(await page.locator("#toast").innerText()) || await page.locator(".banner:has-text('Settings saved')").count()) throw new Error("the saved message should be in the bottom bar only");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  log("3 pump readout:", (await page.locator("#readout").innerText()).replace(/\n+/g, " | "));
  await shot("pump");
  // Standing at a known E85 station that isn't the primary: the app offers it
  await page.waitForSelector("text=Use it for this plan", { timeout: 5000 });
  log("3b suggestion:", await page.locator("#pumpSuggest").innerText());
  await page.click("text=Use it for this plan");
  log("  other station note:", (await page.locator("#readout p").innerText()).slice(0, 110));
  await page.click("[data-act=pumpRemove]"); await page.waitForSelector("#toast:not([hidden])");
  log("3c remove other:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "), "| button:", (await page.locator("[data-act=which][data-w=other]").innerText()).trim());
  if ((await page.locator("[data-act=which][data-w=other]").innerText()).trim() !== "Other station") throw new Error("the other station wasn't removed");
  await page.click("#toast [data-act=toastAct]");
  if (!/Speedway/.test(await page.locator("[data-act=which][data-w=other]").innerText())) throw new Error("Undo didn't bring the other station back");
  await page.click("[data-act=which][data-w=primary]");
  await page.click("#logPlan");
  await page.waitForSelector("text=Log a fill");
  // The plan's gallons show faded in the gallon boxes until the real amount is typed
  const planHint = () => page.evaluate(() => ({ e85: document.querySelector("#ga0").placeholder, gas: document.querySelector("#ga1").placeholder, e85v: document.querySelector("#ga0").value, readout: document.querySelector("#f-summary") ? document.querySelector("#f-summary").textContent : "" }));
  const h0 = await planHint();
  log("4p plan gallons faded:", JSON.stringify(h0));
  await page.evaluate(() => document.querySelector("#ga0").scrollIntoView({ block: "center" })); await page.screenshot({ path: `${W}/test/shot-plan-gallons.png` });
  await page.evaluate(() => document.querySelector("#ga1").scrollIntoView({ block: "center" })); await page.screenshot({ path: `${W}/test/shot-plan-gallons-gas.png` });
  if (!/^\d+\.\d$/.test(h0.e85) || !/^~\d+\.\d$/.test(h0.gas) || h0.e85v !== "") throw new Error("plan gallons not shown as placeholders");
  await page.fill("#ga0", "5.2");
  const h1 = await planHint();
  log("4q after typing:", h1.e85v, "| summary:", h1.readout);
  if (h1.e85v !== "5.2") throw new Error("typed gallons not kept");
  await page.fill("#ga0", "");
  await page.fill("#f-odo", "46340");
  // Pick another station for stop 1, then undo it
  await page.click("#st0"); await page.waitForSelector(".srow");
  await page.click('.srow:has-text("Speedway")'); await page.waitForSelector("#toast:not([hidden])");
  log("4a after pick:", (await page.locator("#st0").innerText()).trim(), "| bar:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("#toast [data-act=toastAct]");
  log("4b after undo:", (await page.locator("#st0").innerText()).trim());
  // Stop 1: phone OCR reads the E85 receipt fully
  await page.evaluate(() => { window.__ocrText = "MOTOMART #1234\n6328 E LLOYD EXPY\n11/05/26\nE85 FLEX FUEL\nGALLONS 5.312\nPRICE/GAL $2.379\nFUEL SALE $12.64"; });
  const img = W + "/icons/icon-192.png";
  const cam = await page.evaluate(() => ({ cam: document.querySelector("#ph0").getAttribute("capture"), lib: document.querySelector("#pl0") && document.querySelector("#pl0").getAttribute("capture") }));
  log("3c scan opens the camera:", JSON.stringify(cam), "| buttons:", (await page.locator("#stops .stop").first().locator(".row").last().innerText()).replace(/\n+/g, " | "));
  if (cam.cam !== "environment" || cam.lib !== null) throw new Error("Scan receipt should open the camera, and Choose a photo the library");
  await page.setInputFiles("#ph0", img);
  await page.waitForSelector("#stops .note-ok");
  log("4 stop 1 after phone read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st0").textContent.trim(), g: document.querySelector("#ga0").value, p: document.querySelector("#pr0").value, t: document.querySelector("#to0").value }))));
  // Stop 2: phone OCR misses gallons -> offer Claude -> Claude fills it
  await page.evaluate(() => { window.__ocrText = "COSTCO\nPREMIUM\nTHANK YOU"; });
  await page.setInputFiles("#pl1", img);   // a photo picked from the library
  // The phone missed the gallons, so Claude reads it on its own: no button to press.
  await page.waitForFunction(() => document.querySelector("#ga1") && document.querySelector("#ga1").value === "5.1");
  const note1 = await page.locator("#stops .stop").nth(1).locator(".note-ok").innerText();
  log("5 stop 2 read by Claude automatically:", note1, "| button left:", await page.locator("[data-act=claudeRead]").count(),
    "| invokes:", await page.evaluate(() => (window.__calls || []).filter((c) => c.fn === "read-receipt" || c.invoke === "read-receipt").length));
  if (!/Read by Claude/.test(note1) || await page.locator("[data-act=claudeRead]").count()) throw new Error("Claude didn't read the receipt automatically");
  await shot("log");
  log("6 after Claude read:", JSON.stringify(await page.evaluate(() => ({ st: document.querySelector("#st1").textContent.trim(), g: document.querySelector("#ga1").value, grade: document.querySelector("#g1").value, sum: document.querySelector("#f-summary").textContent }))));
  log("6b gas stop ethanol box:", await page.locator("#ge1").count());
  if (await page.locator("#ge1").count()) throw new Error("a gas stop shouldn't ask for Ethanol %");
  await page.fill("#f-after", "40");
  await page.click("button:has-text('Save fill')");
  await page.waitForSelector("text=History");
  const saved = await page.evaluate(() => window.__db.fills[0]);
  await page.evaluate(() => { window.__savedId = window.__db.fills[0].id; });
  log("7 saved fill:", JSON.stringify({ date: saved.date, odo: saved.odometer, before: saved.sensor_before, after: saved.sensor_after, plan: saved.plan, stops: saved.stops.map((s) => [s.kind, s.station, s.station_id, s.gallons, s.total, s.grade]) }));
  log("  history:", (await page.locator(".card.list").innerText()).replace(/\n+/g, " | "));
  await page.click(".card.list .item"); await page.waitForSelector("text=Delete this fill");
  await page.click("text=Delete this fill"); await page.click("[data-act=deleteFill]");
  await page.waitForSelector("#toast:not([hidden])");
  log("7b deleted:", await page.evaluate(() => window.__db.fills.length), "fills | bar:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("#toast [data-act=toastAct]"); await page.waitForFunction(() => window.__db.fills.length === 1);
  log("7c undo restored:", await page.evaluate(() => window.__db.fills.length), "fill, same id:", await page.evaluate(() => window.__db.fills[0].id === window.__savedId));
  // A new fill shows the last odometer reading, greyed out, and how far you've driven since
  await page.evaluate(() => { location.hash = "log"; }); await page.waitForSelector("text=Log a fill");
  log("7d new fill odometer:", "placeholder=" + await page.getAttribute("#f-odo", "placeholder"), "| hint:", await page.locator("#f-odo-hint").innerText());
  await page.fill("#f-odo", "46652");
  log("7e typed 46652:", await page.locator("#f-odo-hint").innerText());
  await page.fill("#f-odo", "46000");
  log("7f typed 46000:", await page.locator("#f-odo-hint").innerText(), "| class:", await page.getAttribute("#f-odo-hint", "class"));
  await shot("odo-hint");
  await page.click("[data-act=cancelFill]"); await page.waitForSelector("text=History");
  await shot("history");
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector("text=Stations members use");
  log("8a listed chip:", (await page.locator('.srow:has-text("Casey")').innerText()).replace(/\n+/g, " | "));
  await page.click('.srow:has-text("Casey")'); await page.waitForSelector("text=Price history");
  const cardTxt = (await page.locator("#app").innerText()).replace(/\n+/g, " | ");
  const e85pSec = cardTxt.slice(cardTxt.indexOf("E85prices.com"), cardTxt.indexOf("E85prices.com") + 170);
  log("8a2 E85prices.com section:", e85pSec);
  if (!/Last reported E85 price: \$2\.29 on Nov 8/.test(cardTxt)) throw new Error("E85prices.com price not on the station page");
  await page.evaluate(() => [...document.querySelectorAll("h2")].find((h) => h.textContent === "U.S. DOE E85 list").scrollIntoView()); await page.screenshot({ path: `${W}/test/shot-station-e85prices.png` });
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector("text=Stations members use");
  await page.click('.srow:has-text("MotoMart")'); await page.waitForSelector("text=Price history");
  log("8 station page:", (await page.locator("#app").innerText()).replace(/\n+/g, " | ").slice(0, 300));
  await shot("station");
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector('.srow:has-text("Speedway")');
  await page.click('.srow:has-text("Speedway")'); await page.waitForSelector("text=You added this station");
  await page.click("text=Fix the name"); await page.fill("#st-street", "N Main St"); await page.click("button:has-text('Save name')");
  await page.waitForSelector("text=Renamed to");
  log("8c renamed:", await page.locator("#toast").innerText());
  await page.click("text=Delete this station"); await page.click("[data-act=stDelete]"); await page.waitForSelector("text=Station deleted");
  log("8d deleted:", await page.locator("#toast").innerText(), "| still listed:", await page.locator('.srow:has-text("Speedway")').count());
  for (const v of ["community", "service", "learned", "car", "about", "admin", "more"]) {
    await page.evaluate((h) => { location.hash = h; }, v);
    await page.waitForTimeout(150);
    log(`8 ${v}:`, (await page.locator("#app").innerText()).replace(/\n+/g, " | ").slice(0, 170));
    await shot(v);
  }
  if (!/About and disclaimer/.test(await page.locator("#app").innerText())) throw new Error("About and disclaimer missing from More");
  await page.click("text=About and disclaimer"); await page.waitForSelector("h2:has-text('Disclaimer')");
  await page.waitForSelector("text=E85 stations as of");
  const about = (await page.locator("#app").innerText()).replace(/\n+/g, " | ");
  log("8e about:", about);
  if (!/Version 29/.test(about) || !/7,056 E85 stations as of Nov 22, 2026/.test(about) || !/E85prices\.com, updated Nov 22, 2026: 6,316 stations listed, 2,239 of them not on the DOE list \(9 added, 0 removed\), 31 with a price/.test(about) || !/U\.S\. DOE, updated Nov 16, 2026: 4,817 stations \(5 added\)/.test(about)) throw new Error("About version or station summary wrong");
  await shot("about");
  await page.evaluate(() => { location.hash = "car"; }); await page.waitForSelector("text=Your data");
  await page.click("[data-act=clearPrimary][data-k=primaryGas]"); await page.waitForSelector("#toast:not([hidden])");
  log("10 remove primary:", (await page.locator("#c-gas").innerText()).trim(), "| bar:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("#toast [data-act=toastAct]");
  log("10b undo:", (await page.locator("#c-gas").innerText()).trim());
  await page.click("text=Delete all my fills and service entries"); await page.click("[data-act=wipeLogs]"); await page.waitForSelector("text=were deleted");
  log("10c delete all:", await page.evaluate(() => window.__db.fills.length + window.__db.oil_changes.length), "left");
  // Removing your primary station takes it off the fill you're logging and the pump plan; Undo brings it back
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForSelector("text=Pump plan");
  await page.click("#logPlan"); await page.waitForSelector("text=Log a fill");
  log("11 stop before:", (await page.locator("#st0").innerText()).trim());
  await page.click("#st0"); await page.waitForSelector(".srow"); await page.click("[data-act=pickerEdit]");
  await page.click('.srow-wrap:has-text("MotoMart") [data-act=pickerHide]'); await page.waitForSelector("#toast:not([hidden])");
  log("11a bar:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("[data-act=pickerClose]"); await page.waitForSelector("text=Log a fill");
  log("11b stop after remove:", (await page.locator("#st0").innerText()).trim());
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForSelector("text=Pump plan");
  log("11c pump primary button:", (await page.locator("[data-act=which][data-w=primary]").innerText()).trim());
  await page.click("#toast [data-act=toastAct]"); await page.waitForTimeout(300);
  log("11d after undo, pump:", (await page.locator("[data-act=which][data-w=primary]").innerText()).trim());
  await page.evaluate(() => { location.hash = "log"; }); await page.waitForSelector("text=Log a fill");
  log("11e after undo, stop:", (await page.locator("#st0").innerText()).trim());
  // Delete pump stops on Log a fill: double-tap a stop's title or tap Remove, then confirm; Undo brings it back
  await page.evaluate(() => { location.hash = "log"; }); await page.waitForSelector("text=Log a fill");
  log("13 stops:", await page.locator(".stop").count());
  await page.dblclick(".stop[data-i='1'] .stop-head b");
  if (await page.locator("[data-act=removeStop]").count() || await page.locator("text=Double-tap").count()) throw new Error("a double-tap on a stop should do nothing now");
  await page.click(".stop[data-i='1'] [data-act=askRemoveStop]"); await page.waitForSelector("[data-act=removeStop]");
  log("13a Remove asks first:", (await page.locator(".stop[data-i='1'] .confirm").innerText()).replace(/\n+/g, " "));
  await shot("stop-confirm");
  await page.click("[data-act=removeStop]");
  log("13b after delete:", await page.locator(".stop").count(), "stop | bar:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "));
  await page.click("#toast [data-act=toastAct]");
  log("13c undo:", await page.locator(".stop").count(), "stops");
  await page.click(".stop[data-i='0'] [data-act=askRemoveStop]"); await page.click("[data-act=keepStop]");
  log("13d keep:", await page.locator(".stop").count(), "stops");
  for (const n of [1, 0]) { await page.click(`.stop[data-i='${n}'] [data-act=askRemoveStop]`); await page.click("[data-act=removeStop]"); }
  log("13e all deleted:", await page.locator(".stop").count(), "stops");
  await page.click("[data-act=addStop]");
  log("13f add again:", await page.locator(".stop").count(), "stop, kind:", await page.locator(".stop [aria-pressed=true]").first().innerText());
  await page.click("[data-act=cancelFill]");
  // The pump plan has no hidden double-tap either
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForSelector("text=Pump plan");
  await page.click("[data-act=which][data-w=primary]"); await page.click("[data-act=which][data-w=primary]");
  log("12 double-tap on the pump plan:", await page.locator(".confirm").count(), "confirm,", await page.locator("text=Double-tap").count(), "hint");
  if (await page.locator(".confirm").count() || await page.locator("text=Double-tap").count()) throw new Error("the pump plan should have no double-tap");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForTimeout(150);
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await shot("pump-dark");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log("9 horizontal overflow:", overflow, "| errors:", errors.length ? errors : "none");
  log("  rpc/fn calls:", JSON.stringify(await page.evaluate(() => window.__calls.filter((c) => c.rpc || c.fn || c.otp).map((c) => c.rpc || c.fn || "otp"))));
  // A member who typed station names before the shared list gets a clear way to match them
  await page.evaluate(() => sessionStorage.setItem("__preset", JSON.stringify({ share: true, target: 40, tuneLimit: 50, gasGrade: 93, primaryE85: "Casey's", primaryGas: "Casey's" })));
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload(); await page.waitForSelector("text=Pump plan");
  const banner = await page.locator("[data-act=matchPrimary]").allInnerTexts();
  log("14 unmatched banner:", banner.join(" | "));
  if (banner.length !== 1 || !/Match Casey's/.test(banner[0])) throw new Error("match banner wrong");
  await shot("match-banner");
  await page.click("[data-act=matchPrimary]"); await page.waitForSelector("text=Matching stations");
  log("14a picker search:", await page.inputValue("#pickLookup"), "| brand:", await page.inputValue("#pickBrand"));
  await page.click('#pickBody .srow:has-text("Thorntons")'); await page.waitForSelector("#toast:not([hidden])"); await page.waitForTimeout(300);
  const st = await page.evaluate(() => window.__db.profiles[0].settings);
  const left = await page.locator("[data-act=matchPrimary]").count(), btn = (await page.locator("[data-act=which][data-w=primary]").innerText()).trim();
  log("14b matched:", st.primaryE85, st.primaryE85Id, "|", st.primaryGas, st.primaryGasId, "| banner left:", left, "| pump button:", btn);
  if (st.primaryE85Id !== "afdc-th83" || st.primaryGasId !== "afdc-th83" || left !== 0 || !/Thorntons/.test(btn)) throw new Error("match not saved or shown");
  await page.evaluate(() => sessionStorage.removeItem("__preset"));
  // With today's Claude reads used up, a phone miss doesn't call Claude; it says so and leaves the numbers to type.
  await page.evaluate(() => { window.__quota = { used_today: 6, daily_limit: 6, month_used: 40, month_cap: 1000 }; window.__ocrText = "COSTCO\nPREMIUM\nTHANK YOU"; location.hash = "log"; });
  await page.waitForSelector("text=Log a fill");
  const before = await page.evaluate(() => window.__calls.filter((c) => c.fn === "read-receipt").length);
  await page.setInputFiles("#pl0", W + "/icons/icon-192.png");
  await page.waitForSelector("#stops .note-err"); await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__calls.filter((c) => c.fn === "read-receipt").length);
  const btnState = await page.locator("[data-act=claudeRead]").evaluateAll((b) => b.map((x) => x.disabled + " " + x.textContent.trim()));
  log("15 out of Claude reads:", await page.locator("#stops .note-err").first().innerText(), "| Claude calls:", after - before, "| button:", JSON.stringify(btnState));
  if (after !== before) throw new Error("Claude was called with no reads left");

  // ---- Service reminders, the after-fill reading, and the shorter screens ----
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA");
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(([d3, d80]) => {
    sessionStorage.setItem("__preset", JSON.stringify({ setupDone: true, target: 40, tuneLimit: 50, gasGrade: 93, primaryE85: "MotoMart · E Lloyd Expy", primaryE85Id: "st-moto", year: 2024, trans: "mt", receiptMode: "claude", oilMiles: 3000, oilMonths: 6, serviceStart: 46886 }));
    sessionStorage.setItem("__presetDb", JSON.stringify({
      fills: [{ id: "f1", user_id: "u-test", date: d3, odometer: 59700, dte: 30, sensor_before: 38, sensor_after: null, full: true, target: 40, plan: null, notes: null,
        stops: [{ kind: "e85", gallons: 5, price: 2.4, total: 12, station: "MotoMart · E Lloyd Expy", station_id: "st-moto" }, { kind: "gas", grade: 93, gallons: 5, price: 3.3, total: 16.5, station: "" }] }],
      oil_changes: [{ id: "o1", user_id: "u-test", item: "oil", date: d80, odometer: 57000, oil_type: "Mobil 1 0W-20", filter_type: null, notes: null }] }));
  }, [daysAgo(3), daysAgo(80)]);
  await page.evaluate(() => { location.hash = "pump"; }); await page.reload(); await page.waitForSelector("text=Pump plan");
  // The pump screen asks for the sensor reading the last fill is missing
  await page.waitForSelector("form.after-ask");
  log("16 after-fill ask:", (await page.locator("form.after-ask").innerText()).replace(/\n+/g, " | "));
  await shot("pump-notes");
  await page.fill("#afterNow", "41"); await page.click("form.after-ask button[type=submit]");
  await page.waitForFunction(() => window.__db.fills[0].sensor_after === 41);
  await page.waitForFunction(() => !document.querySelector("form.after-ask"));
  log("16a reading saved:", await page.evaluate(() => window.__db.fills[0].sensor_after), "| sensor box:", await page.inputValue("#sensor"), "| bar:", (await page.locator("#toast").innerText()).trim());
  expect(await page.inputValue("#sensor") === "41", "the saved reading should fill the sensor box");
  // The most pressing service shows as a note with Done and Later
  const note = () => page.locator(".svc-note").innerText().then((t) => t.replace(/\n+/g, " | "));
  log("17 service note:", await note());
  expect(/Tire rotation\. \| ?Due now, 9,700 miles over\./.test((await note()).replace(/\s+/g, " ")) || /Tire rotation\. Due now, 9,700 miles over/.test(await note()), "the note should lead with the overdue tire rotation");
  expect(/9 more/.test(await note()), "the note should count the other services coming due");
  await page.click(".svc-note [data-act=svcLater]"); await page.waitForSelector("#toast:not([hidden])");
  log("17a later:", (await page.locator("#toast").innerText()).replace(/\n+/g, " "), "| note now:", await note());
  expect(!/Tire rotation/.test(await note()) && await page.evaluate(() => !!window.__db.profiles[0].settings.service.tires.later), "Later should put the tire rotation off");
  await page.click("#toast [data-act=toastAct]"); await page.waitForFunction(() => /Tire rotation/.test(document.querySelector(".svc-note").textContent));
  await page.click(".svc-note [data-act=svcDone]"); await page.waitForSelector("h1:has-text('Tire rotation')");
  log("17b done opens:", await page.locator("h1").innerText(), "| odometer:", await page.inputValue("#o-odo"), "| oil box:", await page.locator("#o-oil").count());
  expect(await page.inputValue("#o-odo") === "59700" && !(await page.locator("#o-oil").count()), "Done should open the service with the odometer filled in and no oil question");
  await shot("service-item");
  await page.click("button:has-text('Save as done')"); await page.waitForSelector("h1:has-text('Service')");
  const tires = await page.evaluate(() => window.__db.oil_changes.find((o) => o.item === "tires"));
  log("17c logged:", JSON.stringify({ item: tires.item, odo: tires.odometer, oil: tires.oil_type }));
  expect(tires.odometer === 59700 && tires.oil_type === null, "the tire rotation wasn't logged");
  // The Service page: every reminder for this car and year, with its source
  const svc = (await page.locator("#app").innerText()).replace(/\n+/g, " | ");
  log("18 service page:", svc.slice(0, 900));
  expect(/From Toyota's 2024 GR Corolla maintenance guide, checked Nov 25, 2026\./.test(svc), "the schedule's source is missing");
  expect(/Manual transmission oil[^|]*\|[^|]*\|?[^|]*owner practice/.test(svc) && !/Automatic transmission/.test(svc), "a manual 2024 should show manual transmission oil as owner practice and nothing for an automatic");
  expect(/Engine oil and filter \| Due soon \| Due in 300 miles · at 60,000 mi/.test(svc), "the oil change should be due in 300 miles on the owner's 3,000 mile interval");
  expect(/Tire rotation \| Due at 64,700 mi or /.test(svc), "the tire rotation should count from when it was marked done");
  expect(/Done so far \| Tire rotation \| 59,700 mi/i.test(svc) && /Engine oil and filter \| 57,000 mi \|[^|]*Mobil 1 0W-20/.test(svc), "the done list is wrong");
  await shot("service");
  // An owner's own interval, back to Toyota's, and switching one off
  await page.click(".item:has-text('Engine oil and filter') >> nth=0"); await page.waitForSelector("h1:has-text('Engine oil and filter')");
  log("18a oil reminder:", (await page.locator("form[data-form=saveRem]").innerText()).replace(/\n+/g, " | "), "| miles:", await page.inputValue("#rem-mi"));
  expect(/Toyota's schedule: every 5,000 miles or 6 months\. You've set your own\./.test(await page.locator("form[data-form=saveRem]").innerText()) && await page.inputValue("#rem-mi") === "3000", "the oil reminder should show the owner's interval beside Toyota's");
  await page.fill("#rem-mi", "5000"); await page.click("button:has-text('Save reminder')"); await page.waitForFunction(() => window.__db.profiles[0].settings.oilMiles === null);
  log("18b back to Toyota's:", await page.evaluate(() => JSON.stringify([window.__db.profiles[0].settings.oilMiles, window.__db.profiles[0].settings.oilMonths])));
  await page.click("[data-act=svcClose]"); await page.waitForSelector("h1:has-text('Service')");
  await page.click(".item:has-text('Drive belt')"); await page.waitForSelector("h1:has-text('Drive belt')");
  await page.uncheck("#rem-on"); await page.click("button:has-text('Save reminder')"); await page.waitForFunction(() => window.__db.profiles[0].settings.service.drive_belt && window.__db.profiles[0].settings.service.drive_belt.off === true);
  await page.click("[data-act=svcClose]"); await page.waitForSelector("h1:has-text('Service')");
  log("18c drive belt off:", (await page.locator(".item:has-text('Drive belt')").innerText()).replace(/\n+/g, " | "));
  expect(/Off/.test(await page.locator(".item:has-text('Drive belt')").innerText()), "a switched-off reminder should say Off");
  // Editing an entry from the done list
  await page.click(".item:has-text('Mobil 1 0W-20')"); await page.waitForSelector("text=Edit this entry");
  log("18d edit entry:", await page.locator("h1").innerText(), "| oil:", await page.inputValue("#o-oil"));
  await page.fill("#o-odo", "57100"); await page.click("button:has-text('Save changes')"); await page.waitForFunction(() => window.__db.oil_changes.find((o) => o.id === "o1").odometer === 57100);
  // More shows Service with what's next
  await page.evaluate(() => { location.hash = "more"; }); await page.waitForSelector("text=Signed in as");
  log("19 More:", (await page.locator("nav[aria-label=More] .item").first().innerText()).replace(/\n+/g, " | "));
  expect(/^Service/.test(await page.locator("nav[aria-label=More] .item").first().innerText()) && !/Oil changes/.test(await page.locator("#app").innerText()), "More should list Service, not Oil changes");
  // One receipt switch that keeps whichever way of reading was set; off types the numbers in
  await page.evaluate(() => { location.hash = "car"; }); await page.waitForSelector("text=Your data");
  await page.click("form[data-form=saveCar] button[type=submit]"); await page.waitForSelector("text=Pump plan");
  expect(await page.evaluate(() => window.__db.profiles[0].settings.receiptMode) === "claude", "saving with the switch on should keep the way of reading that was set");
  await page.evaluate(() => { location.hash = "car"; }); await page.waitForSelector("text=Your data");
  await page.uncheck("#c-rx"); await page.click("[data-k=year][data-v='2027']");
  await page.click("form[data-form=saveCar] button[type=submit]"); await page.waitForSelector("text=Pump plan");
  const s2 = await page.evaluate(() => window.__db.profiles[0].settings), reported = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "report_unchecked_year").pop());
  log("20 switch off + 2027:", s2.receiptMode, s2.year, "| reported:", JSON.stringify(reported && reported.args));
  expect(s2.receiptMode === "off" && s2.year === 2027 && reported && reported.args.p_model === "grc" && reported.args.p_year === 2027, "receipt switch or unchecked year not handled");
  await page.evaluate(() => { location.hash = "log"; }); await page.waitForSelector("text=Log a fill");
  expect(!(await page.locator("[data-act=scan]").count()), "with receipt photos off there should be no scan button");
  await page.evaluate(() => { location.hash = "service"; }); await page.waitForSelector("h1:has-text('Service')");
  log("20a unchecked year:", (await page.locator("#app p.small.muted").first().innerText()));
  expect(/Toyota's 2027 GR Corolla guide hasn't been checked yet, so this uses the 2026 schedule\./.test(await page.locator("#app").innerText()), "an unchecked year should say which schedule it uses");
  // Plain words on the learned page; cost tables tucked behind a link on Community
  await page.evaluate(() => { location.hash = "learned"; }); await page.waitForSelector("text=What the app has learned");
  const learned = (await page.locator("#app").innerText()).replace(/\n+/g, " | ");
  log("21 fuel left:", learned.slice(learned.indexOf("FUEL LEFT"), learned.indexOf("FUEL LEFT") + 230));
  expect(/About 2\.4 gallons \| ?at 30 miles to empty|About 2\.4 gallons at 30 miles to empty/.test(learned) && !/DTE ÷/.test(learned), "fuel left should be in plain words");
  await page.evaluate(() => { location.hash = "community"; }); await page.waitForSelector("text=Stations members use");
  expect(!/Cost per mile by blend \|/i.test((await page.locator("#app").innerText()).replace(/\n+/g, " | ").replace("More numbers: cost per mile by blend and gas grade", "")), "the cost tables should start tucked away");
  await page.click("[data-act=moreNumbers]"); await page.waitForSelector("h2:has-text('Cost per mile by blend')");
  log("22 community more numbers:", await page.locator("h2").allInnerTexts());
  await shot("community");
  // With no model year yet, Service shows the oil change and asks for the year
  await page.evaluate(() => { sessionStorage.setItem("__preset", JSON.stringify({ setupDone: true, target: 40, tuneLimit: 50, gasGrade: 93, primaryE85: "MotoMart · E Lloyd Expy", primaryE85Id: "st-moto", oilMiles: 3000, oilMonths: 6 })); });
  await page.evaluate(() => { location.hash = "service"; }); await page.reload(); await page.waitForSelector("h1:has-text('Service')");
  const noYear = (await page.locator("#app").innerText()).replace(/\n+/g, " | ");
  log("23 no year yet:", noYear.slice(0, 330));
  expect(/Add your model year to see the full service schedule for your GR Corolla\./.test(noYear) && /Engine oil and filter/.test(noYear) && !/Brake fluid/.test(noYear), "without a model year only the oil change should show");
  await page.evaluate(() => { sessionStorage.removeItem("__preset"); sessionStorage.removeItem("__presetDb"); });
  const real = errors.filter((e) => !/Failed to load resource/.test(e)); // fonts and other outside files are blocked in the test
  log("24 errors:", real.length ? real : "none");
  expect(!real.length, "page errors: " + real.join(" | "));
  await browser.close();
})();
