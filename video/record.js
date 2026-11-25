// Records the how-to video: the real app doing the six steps inside video/stage.html, with captions and no sound.
// Run: node video/record.js [grfl|lp1] [vertical|landscape]   (no arguments: all four videos)
// Writes video/out/<name>.mp4. Needs ffmpeg. Nothing is sent anywhere: the app runs on the preview's sample data.
const fs = require("fs"), path = require("path"), { spawn, spawnSync } = require("child_process");
const { BASE, OUT, BRANDS, launch, route, receiptText } = require("./harness");

const SHAPES = { vertical: { width: 1080, height: 1920 }, landscape: { width: 1920, height: 1080 } };
const FILES = { grfl: "GR-Fuel-Log-how-to", lp1: "LIMIT1-Flex-Fuel-how-to" };
const FPS = 30;
// When each scene ends, in seconds: open, steps 1 to 6, close.
const END = { open: 3, s1: 10, s2: 18, s3: 28, s4: 40.5, s5: 56, s6: 65, close: 73 };
const STEPS = {
  grfl: [
    ["Add it to your home screen", "Open fuel.shadyacres.my. Tap Share, then Add to Home Screen. It opens like an app."],
    ["Sign in", "Type your email. We send you a code. No password."],
    ["Set up your car", "Pick your model year, your tune's ethanol limit and your E85 station."],
    ["Get your pump plan", "Enter miles to empty and your flex sensor reading. Pump that much E85 first, then fill up with gas."],
    ["Log the fill", "Tap Log this fill. Scan the receipt or type the gallons, then save."],
    ["Add the reading after", "Once the gauge settles, enter the new sensor reading. That's how the app learns your station's real E85."],
  ],
};
STEPS.lp1 = STEPS.grfl.map((s) => [...s]);
STEPS.lp1[0][1] = "Open the link LIMIT+1 sends you. Tap Share, then Add to Home Screen. It opens like an app.";
STEPS.lp1[2][1] = "Pick your car, model year, LIMIT+1 package and your E85 station.";

const today = () => new Date().toLocaleDateString("en-CA");

async function record(browser, brand, shapeName) {
  const size = SHAPES[shapeName], name = `${FILES[brand.id]}-${shapeName}`;
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: "light" });
  const outside = await route(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/video/stage.html?brand=${brand.id}&shape=${shapeName}`);
  const app = page.frameLocator("#app");
  await app.locator("#email").waitFor();
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await page.evaluate(() => document.fonts.ready); await frame.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  const stage = (fn, ...args) => page.evaluate(([f, a]) => window.stage[f](...a), [fn, args]);
  const steps = STEPS[brand.id];

  // Capture: the browser sends a picture whenever the screen changes; the latest one is written 30 times a second.
  const cdp = await ctx.newCDPSession(page);
  let latest = null;
  cdp.on("Page.screencastFrame", (f) => { latest = Buffer.from(f.data, "base64"); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  for (let i = 0; !latest && i < 100; i++) await page.waitForTimeout(50);
  if (!latest) throw new Error("the browser sent no picture");
  await page.waitForTimeout(400);
  const raw = path.join(OUT, `raw-${name}.mkv`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "copy", raw], { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((ok) => ff.on("close", ok));
  const t0 = Date.now(); let written = 0;
  const write = () => { const want = Math.floor((Date.now() - t0) / 1000 * FPS); while (written < want) { ff.stdin.write(latest); written++; } };
  const ticker = setInterval(write, 8);

  const hold = (ms) => page.waitForTimeout(ms);
  const until = async (sec, what) => { const left = t0 + sec * 1000 - Date.now(); if (left > 0) await hold(left); else if (left < -150) console.log(`    ${(-left / 1000).toFixed(1)}s late at ${what || sec}`); };
  // A finger tap: the ripple shows where, then the real click lands.
  const tap = async (loc, wait = 330) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await stage("tap", b.x + b.width / 2, b.y + b.height / 2);
    await hold(wait);
    await loc.click();
  };
  const type = async (loc, text, delay = 130) => { await tap(loc); await loc.pressSequentially(text, { delay }); };
  const glide = async (loc, block = "center") => { await loc.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block); await hold(650); };

  try {
    // Open: the title card
    await until(END.open - 0.5);
    await stage("step", 1, ...steps[0]); await stage("home", true);
    await until(END.open); await stage("card", null);

    // Step 1: add it to the home screen (a panel, not a recording)
    await until(END.s1);

    // Step 2: sign in with an emailed code
    await stage("step", 2, ...steps[1]); await hold(250); await stage("home", false);
    await hold(900);
    await type(app.locator("#email"), "you@example.com", 55); await hold(400);
    await tap(app.locator("button:has-text('Send me a code')")); await app.locator("#code").waitFor(); await hold(600);
    await type(app.locator("#code"), "482913", 140); await hold(450);
    await until(END.s2 - 0.9, "sign in");
    await tap(app.locator("button:has-text('Sign in')")); await app.locator("text=Set up your car").waitFor();
    await until(END.s2);

    // Step 3: set up the car
    await stage("step", 3, ...steps[2]); await hold(800);
    if (brand.id === "lp1") { await tap(app.locator("[data-k=model][data-v=grc]")); await app.locator("[data-k=year]").first().waitFor(); await hold(400); }
    await tap(app.locator("[data-k=year][data-v='2024']")); await hold(450);
    if (brand.id === "lp1") { await tap(app.locator("[data-k=pkg][data-v=kit]")); await hold(400); }
    await glide(app.locator("#c-e85"));
    await tap(app.locator("#c-e85")); await app.locator('.srow:has-text("911 Tek Dr")').waitFor(); await hold(1000);
    await tap(app.locator('.srow:has-text("911 Tek Dr")')); await app.locator("text=Set up your car").waitFor(); await hold(450);
    await glide(app.locator("button:has-text('Save and start')"));
    await until(END.s3 - 0.9, "setup");
    await tap(app.locator("button:has-text('Save and start')")); await app.locator("h1:has-text('Pump plan')").waitFor();
    await until(END.s3);

    // Step 4: the pump plan
    await stage("step", 4, ...steps[3]); await hold(1100);
    await type(app.locator("#dte"), "34", 190); await hold(350);
    await type(app.locator("#sensor"), "38", 190);
    await frame.waitForFunction(() => /gal/.test(document.querySelector("#readout").innerText));
    await hold(700);
    const rb = await app.locator("#readout").boundingBox();
    await stage("ring", rb.x, rb.y, rb.width, rb.height);
    await until(END.s4);

    // Step 5: log the fill, with a receipt photo
    await stage("step", 5, ...steps[4]); await hold(700);
    await tap(app.locator("#logPlan")); await app.locator("#ga0").waitFor(); await hold(650);
    await type(app.locator("#f-odo"), "18250", 110); await hold(300);
    const text = receiptText(today());
    await frame.evaluate((t) => { window.__ocrText = t; }, text);
    const scan = app.locator("[data-act=scan][data-i='0']");
    await glide(scan);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tap(scan)]);
    await stage("receipt", true, text); await hold(1150);
    await stage("snap"); await hold(420);
    await chooser.setFiles(path.join(__dirname, "..", "icons", "icon-192.png"));
    await frame.waitForFunction(() => document.querySelector("#ga0") && document.querySelector("#ga0").value === "5.612");
    await stage("receipt", false); await hold(1300);
    await glide(app.locator("#ga1"));
    await type(app.locator("#ga1"), "4.93", 120); await hold(250);
    await type(app.locator("#pr1"), "3.899", 110); await hold(300);
    await glide(app.locator("button:has-text('Save fill')"));
    await until(END.s5 - 2.2, "log");
    await tap(app.locator("button:has-text('Save fill')")); await app.locator("h1:has-text('History')").waitFor();
    await until(END.s5);

    // Step 6: next time, the reading after the fill
    await stage("step", 6, ...steps[5]); await hold(650);
    await tap(app.locator("#tabs nav a[href='#pump']")); await app.locator("form.after-ask").waitFor(); await hold(1300);
    await type(app.locator("#afterNow"), "40", 190); await hold(450);
    await tap(app.locator("form.after-ask button[type=submit]"));
    await frame.waitForFunction(() => !document.querySelector("form.after-ask"));
    await until(END.s6);

    // Close
    await stage("card", "close");
    await until(END.close);
  } finally {
    clearInterval(ticker); write();
    await cdp.send("Page.stopScreencast").catch(() => {});
    ff.stdin.end(); await closed;
    await ctx.close();
  }
  if (outside.length || errors.length) throw new Error(`${name}: reached outside (${outside.join(", ")}) or threw errors (${errors.join(" | ")})`);

  // Encode: H.264 with correct colors and a silent sound track, which some uploaders expect.
  const out = path.join(OUT, `${name}.mp4`);
  const enc = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest",
    "-vf", "scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", String(FPS), "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], { stdio: "inherit" });
  if (enc.status !== 0) throw new Error(`${name}: encoding failed`);
  fs.unlinkSync(raw);
  console.log(`  ${name}.mp4  ${(written / FPS).toFixed(1)}s  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const [b, s] = process.argv.slice(2);
  const brands = b ? [b] : Object.keys(BRANDS), shapes = s ? [s] : Object.keys(SHAPES);
  const browser = await launch();
  for (const id of brands) for (const shape of shapes) { console.log(`${BRANDS[id].name}, ${shape}`); await record(browser, BRANDS[id], shape); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
