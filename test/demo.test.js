// The locked demos for other companies (demo/<id>/): each opens with no sign-in, runs on sample data, and reaches nothing
// but its own page and Google Fonts. Run: node test/demo.test.js
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const W = path.resolve(__dirname, ".."), BRANDS = require("../demos/brands");
(async () => {
  const browser = await chromium.launch();
  for (const [id, b] of Object.entries(BRANDS)) {
    if (b.mockup) continue; // no demo is built until it's approved
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: b.scheme });
    const page = await ctx.newPage();
    const errors = [], outside = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("http://localhost:4173/")) { const p = W + new URL(u).pathname; return fs.existsSync(p) && fs.statSync(p).isFile() ? route.fulfill({ path: p }) : route.fulfill({ status: 404, body: "" }); }
      if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) outside.push(u);
      return route.abort();
    });
    const expect = (c, m) => { if (!c) throw new Error(`${b.title}: ${m}`); };
    await page.goto(`http://localhost:4173/demo/${id}/index.html`);
    await page.waitForSelector("[data-act=previewStart]");
    const ribbon = await page.locator(".preview-ribbon").innerText();
    const logo = await page.locator(".brandmark img").evaluate((i) => i.complete && i.naturalWidth > 0);
    expect((b.lookOnly ? /Demo · GR Corolla sample data/ : /Demo · sample data, nothing is saved/).test(ribbon) && logo && !(await page.locator("#email").count()), "welcome should show the ribbon and logo, with no sign-in");
    expect(await page.title() === `${b.partner.name} · Demo` && await page.getAttribute("meta[name=robots]", "content") === "noindex, nofollow", "title or noindex wrong");
    expect(new RegExp(b.title).test(await page.locator("p.fine").innerText()), "the concept note should name the company");
    await page.click("[data-act=previewStart]"); await page.waitForSelector("text=Set up your car");
    await page.click("[data-k=model][data-v=grc]"); await page.waitForSelector("[data-k=year]"); await page.click("[data-k=year][data-v='2024']");
    await page.click("#c-e85"); await page.waitForSelector('.srow:has-text("911 Tek Dr")'); await page.click('.srow:has-text("911 Tek Dr")');
    await page.waitForSelector("text=Set up your car"); await page.click("button:has-text('Save and start')"); await page.waitForSelector("h1:has-text('Pump plan')");
    const d = await page.evaluate((k) => ({ fills: window.__preview.data().fills.length, stored: !!sessionStorage.getItem(k), promo: document.querySelectorAll("#promo .half a").length }), `${id}-demo-v1`);
    await page.fill("#dte", "34"); await page.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
    expect(d.fills === 12 && d.stored && d.promo >= 2, "the sample log, its own storage or the product bar is missing");
    await page.evaluate(() => { location.hash = "more"; }); await page.waitForSelector("[data-act=signOut]");
    await page.click("[data-act=signOut]"); await page.waitForSelector("[data-act=previewStart]");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${b.title}: 12 sample fills, ${d.promo} bar items | outside: ${outside.length ? outside : "none"} | overflow: ${overflow} | errors: ${errors.length ? errors : "none"}`);
    expect(!outside.length && !overflow && !errors.length, "reached outside, overflowed or threw errors");
    await ctx.close();
  }
  await browser.close();
  console.log("demo checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
