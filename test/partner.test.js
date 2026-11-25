// LIMIT+1 Flex Fuel (the partner version in limitplus1/): welcome, approval gate, setup, logo, promo bar, About, Admin.
// Run: node test/partner.test.js   (uses the same stand-in database as ui.test.js)
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const W = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: 42.2411, longitude: -88.3162 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("supabase-js")) return route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(W + "/test/mock-supabase.js", "utf8") });
    if (u.includes("challenges.cloudflare.com")) return route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render:function(el,o){el.textContent='bot check ok';setTimeout(function(){o.callback('t');},10);return 'w1';}};" });
    if (u.startsWith("http://localhost:4173/")) { const p = W + new URL(u).pathname; return fs.existsSync(p) && fs.statSync(p).isFile() ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
    return route.abort();
  });
  const log = (...a) => console.log(...a);
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const shot = (n) => page.screenshot({ path: `${W}/test/shot-lp1-${n}.png`, fullPage: true });
  const text = async (sel = "#app") => (await page.locator(sel).innerText()).replace(/\n+/g, " | ");

  // Welcome: LIMIT+1's logo, the product name, "Powered by Shady Acres LLC" and the concept note
  await page.goto("http://localhost:4173/limitplus1/index.html");
  await page.waitForSelector("#email");
  const welcome = await text();
  log("1 welcome:", welcome.slice(0, 420));
  expect(await page.locator(".brandmark img[alt='LIMIT+1']").count() === 1 && /Flex Fuel/.test(welcome) && /Powered by Shady Acres LLC/.test(welcome), "welcome screen should show the LIMIT+1 logo, Flex Fuel and Powered by Shady Acres LLC");
  expect(/A concept by Shady Acres LLC/.test(await page.locator("p.fine").innerText()) && !/GR FUEL LOG/.test(welcome), "welcome should carry the concept note and no GR Fuel Log wordmark");
  expect(await page.title() === "LIMIT+1 Flex Fuel" && await page.getAttribute("meta[name=robots]", "content") === "noindex, nofollow", "title or noindex wrong");
  await shot("welcome");
  // Sign in: the account waits for approval, and the app stays locked
  await page.waitForFunction(() => document.querySelector("#bot-check") && document.querySelector("#bot-check").textContent.includes("ok"));
  await page.fill("#email", "kevin@example.com"); await page.click("text=Send me a code");
  await page.waitForSelector("#code"); await page.fill("#code", "123456"); await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Waiting for approval");
  const asked = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "partner_request").map((c) => c.args.p_partner));
  log("2 pending:", await text(), "| asked:", JSON.stringify(asked), "| tabs hidden:", await page.locator("#tabs").getAttribute("hidden"));
  expect(asked[0] === "limitplus1" && await page.locator("#tabs").getAttribute("hidden") !== null && !(await page.locator("#dte").count()), "the app should stay locked while the request waits");
  await shot("pending");
  await page.click("text=Check again"); await page.waitForSelector("text=Waiting for approval");
  // Approved: the short setup, with the car, package and profile questions
  await page.evaluate(() => { window.__partnerStatus = "approved"; });
  await page.click("text=Check again"); await page.waitForSelector("text=Set up your car");
  expect(await page.locator(".brandbar img[alt='LIMIT+1']").count() === 1, "the logo bar should be on the setup screen");
  const models = await page.locator("[data-k=model]").allInnerTexts();
  log("3 setup models:", models.join(", "), "|", (await text()).match(/GR Supra: coming soon\./) ? "Supra: coming soon" : "no Supra note");
  expect(models.join() === "GR Corolla,GR86 / BRZ" && /GR Supra: coming soon\./.test(await text()), "cars offered wrong");
  await page.click("[data-k=model][data-v=gr86]"); await page.waitForSelector("[data-k=year]");
  expect((await page.locator("[data-k=year]").allInnerTexts()).join() === "2022,2023,2024,2025,2026,2027", "GR86 years wrong");
  await page.click("[data-k=year][data-v='2024']"); await page.waitForSelector("[data-k=trans]");
  await page.click("[data-k=trans][data-v=at]");
  const pk = await page.locator("[data-k=pkg]").allInnerTexts();
  await page.click("[data-k=pkg][data-v=pp2]");
  const limitPicked = await page.locator("[data-k=tuneLimit][aria-pressed=true]").innerText();
  log("3a packages:", pk.join(", "), "| Power Package 2 sets tune limit:", limitPicked);
  expect(pk.join() === "Flex fuel kit,Power Package 2,Power Package 3" && /Not sure/.test(limitPicked), "package presets wrong");
  await page.fill("#c-forum", "shady_grc"); await page.fill("#c-ig", "@shady.gr");
  await page.click("#c-e85"); await page.waitForSelector(".srow");
  expect(await page.locator(".brandbar img").count() === 1, "the logo bar should be on the station picker too");
  await page.click('.srow:has-text("MotoMart")'); await page.waitForSelector("text=Set up your car");
  await shot("setup");
  await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
  const st = await page.evaluate(() => window.__db.profiles[0].settings);
  log("4 saved:", JSON.stringify({ model: st.model, year: st.year, trans: st.trans, pkg: st.pkg, limit: st.tuneLimit, notSure: st.tuneLimitNotSure, forum: st.forumName, ig: st.instagram }));
  expect(st.model === "gr86" && st.year === 2024 && st.trans === "at" && st.pkg === "pp2" && st.tuneLimitNotSure === true && st.forumName === "shady_grc" && st.instagram === "shady.gr", "setup saved the wrong settings");
  // The pump plan: the logo bar, the name, and the slim promo bar above the bottom menu, matched to the car
  log("5 pump top:", (await text()).slice(0, 120));
  expect(/LIMIT\+1 Flex Fuel/i.test(await page.locator(".eyebrow").first().innerText()), "pump eyebrow should name the app");
  const promo = await page.evaluate(() => {
    const p = document.querySelector("#promo"), nav = document.querySelector("#tabs nav");
    const half = p.querySelector(".half"), links = [...half.querySelectorAll("a")];
    return { h: Math.round(p.getBoundingClientRect().height), above: p.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1, anim: getComputedStyle(p.querySelector(".track")).animationName,
      first: links[0].textContent, names: links.map((a) => a.textContent), hrefs: links.map((a) => a.href), blank: links.every((a) => a.target === "_blank"), copyFocus: [...p.querySelectorAll(".half[aria-hidden] a")].every((a) => a.tabIndex === -1) };
  });
  const saleExpected = new Date().toLocaleDateString("en-CA") <= "2026-11-30";
  log("5a promo:", JSON.stringify({ h: promo.h, above: promo.above, anim: promo.anim, first: promo.first, n: promo.names.length, blank: promo.blank, copyFocus: promo.copyFocus }));
  log("   items:", promo.names.join(" · "));
  expect(promo.h <= 34 && promo.above && promo.anim === "promo-scroll" && promo.blank && promo.copyFocus, "the promo bar should be slim, above the menu, scrolling, and open links in a new tab");
  expect(saleExpected ? /Black Friday sale is live/.test(promo.first) : !/Black Friday/.test(promo.names.join()), "the sale line should lead the bar while the sale is on, and be gone after");
  expect(promo.names.slice(saleExpected ? 1 : 0).every((n) => /GR86/.test(n)) && promo.hrefs.every((h) => h.startsWith("https://limitplus1.com/")), "a GR86 owner should only see GR86 / BRZ products, all on limitplus1.com");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await shot("pump");
  // Service: Toyota's GR86 schedule for an automatic, with the BRZ note
  await page.evaluate(() => { location.hash = "service"; }); await page.waitForSelector("h1:has-text('Service')");
  const svc = await text();
  log("6 service:", svc.slice(0, 520));
  expect(/Reminders for your 2024 GR86 \/ BRZ/.test(svc) && /From Toyota's 2024 GR86 maintenance guide/.test(svc) && /BRZ owners: this is Toyota's GR86 schedule/.test(svc), "service source or BRZ note missing");
  expect(/Automatic transmission fluid/.test(svc) && /Fuel filter/.test(svc) && !/Transfer case oil/.test(svc) && !/Manual transmission oil/.test(svc), "GR86 automatic schedule wrong");
  await shot("service");
  // About: LIMIT+1's contact details, a support email with the car filled in, the version and Powered by
  await page.evaluate(() => { location.hash = "about"; }); await page.waitForSelector("text=About and contact");
  await page.waitForSelector("text=E85 stations as of");
  const about = await text();
  const support = decodeURIComponent(await page.getAttribute("a.item:has-text('Support request')", "href"));
  log("7 about:", about.slice(0, 700));
  log("7a support email:", support.replace(/\n/g, " / "));
  expect(await page.getAttribute("a.item:has-text('Call 815-345-3035')", "href") === "tel:+18153453035" && /Contact form/.test(about) && /limitplus1\.com/.test(about) && /4500 Northwest Hwy, Suite 800, Crystal Lake, IL 60014/.test(about), "contact details missing");
  expect(/^mailto:support@limitplus1\.com\?subject=LIMIT\+1 Flex Fuel: support request&body=App: LIMIT\+1 Flex Fuel, version 32\nCar: 2024 GR86 \/ BRZ \(automatic\)\nPackage: Power Package 2\nTune limit: E50 \(not sure\), target E40/.test(support), "support email wrong");
  expect(/Version 32/.test(about) && /Powered by Shady Acres LLC\./.test(about) && /A concept by Shady Acres LLC/.test(about), "version, Powered by or concept note missing");
  await shot("about");
  // More names the About page for LIMIT+1
  await page.evaluate(() => { location.hash = "more"; }); await page.waitForSelector("text=Signed in as");
  expect(/About and contact/.test(await text()), "More should list About and contact");
  // Admin: requests to use the partner version, with Approve
  await page.evaluate(() => { window.__partnerList = [{ user_id: "u-kevin", partner: "limitplus1", partner_name: "LIMIT+1 Flex Fuel", status: "pending", requested_at: "2026-11-25T15:00:00Z", email: "kevin@example.com", handle: null }]; location.hash = "admin"; });
  await page.waitForSelector("text=Partner versions · 1 waiting");
  log("8 admin:", (await page.locator("section:has-text('Partner versions')").innerText()).replace(/\n+/g, " | "));
  await page.click("[data-act=partnerDecide][data-ok='1']"); await page.waitForSelector("text=Partner versions · 0 waiting");
  const decided = await page.evaluate(() => window.__calls.filter((c) => c.rpc === "admin_partner_decide").pop().args);
  log("8a approved:", JSON.stringify(decided));
  expect(decided.p_user === "u-kevin" && decided.p_partner === "limitplus1" && decided.p_approve === true, "approve didn't reach the database");
  await shot("admin");
  // Dark mode: the white logo and the dark theme
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { location.hash = "pump"; }); await page.waitForSelector("h1:has-text('Pump plan')");
  await page.fill("#dte", "34"); await page.fill("#sensor", "38");
  await shot("pump-dark");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log("9 horizontal overflow:", overflow, "| errors:", errors.length ? errors : "none");
  expect(!overflow && !errors.length, "overflow or page errors");
  await browser.close();
  console.log("LIMIT+1 Flex Fuel checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
