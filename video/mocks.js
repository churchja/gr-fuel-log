// Mock-ups for the sales video: four extras that are NOT in the app. Each one adds a piece to a real screen of the
// LIMIT+1 version while it's being recorded, so it looks like the app would. Nothing here ships to owners.
// Each function takes the app's page or frame, already on the screen named in its comment.

// On History: a card that sends the fuel log to the owner's tuner.
const tuner = (f) => f.evaluate(() => {
  const h1 = document.querySelector("#app h1");
  const card = document.createElement("section");
  card.className = "card"; card.id = "mock-tuner";
  card.innerHTML = `<h2>Your tuner</h2><p class="small muted">Sends your last 12 fills: dates, gallons, blends, and flex sensor readings before and after.</p>
    <button type="button" class="btn primary full">Send my fuel log to my tuner</button>`;
  (h1.closest(".stack") || h1).after(card);
  window.scrollTo(0, 0);
});

// On a service's own page (opened from Service): a link to the parts in LIMIT+1's store.
const shop = (f) => f.evaluate(() => {
  const due = document.querySelector("#app section.dark");
  const box = document.createElement("section");
  box.className = "card"; box.id = "mock-shop";
  box.innerHTML = `<h2>Parts for this service</h2><p class="small muted">Oil and filter that fit your 2024 GR Corolla, from LIMIT+1.</p>
    <a class="btn primary full" href="#service" style="text-decoration:none">Shop oil change parts at LIMIT+1</a>`;
  due.after(box);
  window.scrollTo(0, 0);
});

// On Your car and settings: the GR Supra offered like the other cars.
const cars = (f) => f.evaluate(() => {
  const seg = document.querySelector('#app [aria-label="Model"]');
  const b = document.createElement("button");
  b.type = "button"; b.setAttribute("aria-pressed", "false"); b.textContent = "GR Supra";
  seg.appendChild(b);
  const soon = [...seg.parentElement.querySelectorAll("span.small")].find((x) => /coming soon/.test(x.textContent));
  if (soon) soon.textContent = "Any car you sell a flex fuel kit for can be added.";
  window.scrollTo(0, 0);
});

// On History: a sheet with an image of the owner's month, ready to share.
const share = (f) => f.evaluate(() => {
  const stat = (v, k) => `<div><b style="font:700 32px/1 var(--display)">${v}</b><br><span style="font-size:13px;color:#c8caca">${k}</span></div>`;
  const sheet = document.createElement("div");
  sheet.id = "mock-share";
  sheet.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:60;display:flex;align-items:flex-end";
  sheet.innerHTML = `<div style="background:var(--bg);width:100%;border-radius:18px 18px 0 0;padding:20px 16px 22px;display:grid;gap:14px">
    <b style="font:600 19px/1.2 var(--display)">Share my month</b>
    <div style="background:#111111;color:#ffffff;border-radius:14px;padding:22px;display:grid;gap:16px">
      <img src="logo-white.png" alt="LIMIT+1" style="height:24px;width:auto;justify-self:start">
      <span style="font:600 12px/1 var(--display);letter-spacing:.14em;text-transform:uppercase;color:#c8caca">My November on flex fuel</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${stat("E40", "average blend")}${stat("23.5", "MPG")}${stat("$0.132", "per mile")}${stat("5 of 5", "fills on target")}</div>
      <span style="font-size:14px;color:#c8caca">2024 GR Corolla · LIMIT+1 flex fuel kit</span>
    </div>
    <button type="button" class="btn primary full">Share</button>
  </div>`;
  // It slides up like a real sheet.
  const panel = sheet.firstElementChild;
  sheet.style.opacity = "0"; sheet.style.transition = "opacity .25s"; panel.style.transform = "translateY(100%)"; panel.style.transition = "transform .32s ease-out";
  document.body.appendChild(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.opacity = "1"; panel.style.transform = "none"; }));
});

const clear = (f) => f.evaluate(() => document.querySelectorAll("#mock-tuner, #mock-shop, #mock-share").forEach((x) => x.remove()));

module.exports = { tuner, shop, cars, share, clear };
