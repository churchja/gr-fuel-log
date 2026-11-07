// GR Fuel Log app. Plain JavaScript: renders views from state, talks to Supabase, uses calc.js for the math.
(function () {
  "use strict";
  const C = window.Calc, CFG = window.APP_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = C.num;
  const today = () => new Date().toLocaleDateString("en-CA");
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const fmtShort = (d) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  const money = (x) => x === null || x === undefined ? "—" : "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const miles = (x) => Math.round(x).toLocaleString("en-US");
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  const deviceId = (() => { let id = store.get("device-id"); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store.set("device-id", id); } return id; })();
  const ICONS = {
    pump: "M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h12M6 9h6M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3",
    log: "M9 3h6v3H9zM8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M12 10v7M8.5 13.5h7",
    history: "M3 3v18h18M7 15l4-4 3 3 5-6",
    community: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    more: "M4 6h16M4 12h16M4 18h16",
    camera: "M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    chevron: "M9 6l6 6-6 6",
  };
  const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"></path></svg>`;

  // ---------- state ----------
  const S = {
    ready: false, user: null, profile: null, settings: C.withDefaults({}), fills: [], oil: [], car: null, myStations: [], stations: [], quota: null,
    community: null, communityDays: 90, admin: null, view: "pump", offline: !navigator.onLine, flash: "",
    pump: { dte: "", sensor: "", which: "primary" },
    form: null, oilForm: null, carForm: null,
    signin: { step: "email", email: store.get("last-email") || "", code: "", error: "", busy: false, captcha: "" },
  };
  const isAdmin = () => !!(S.profile && S.profile.is_admin);
  const approved = () => !!(S.profile && S.profile.status === "approved");
  const needsSetup = () => approved() && !S.settings.primaryE85 && S.fills.length === 0 && !S.setupDone;

  // ---------- data ----------
  async function loadAll() {
    const uid = S.user.id;
    const [p, f, o, c, ms, st, q] = await Promise.all([
      sb.from("profiles").select("*").eq("id", uid).single(),
      sb.from("fills").select("*").order("date").order("odometer"),
      sb.from("oil_changes").select("*").order("date"),
      sb.from("car_model").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("my_stations").select("*"),
      sb.from("station_estimates").select("*"),
      sb.rpc("receipt_quota"),
    ]);
    S.profile = p.data || null;
    S.settings = C.withDefaults(S.profile && S.profile.settings);
    S.fills = f.data || []; S.oil = o.data || []; S.car = c.data || null; S.myStations = ms.data || []; S.stations = st.data || []; S.quota = q.data || null;
    if (S.pump.sensor === "") { const last = C.deriveRows(S.fills, S.settings).slice(-1)[0]; if (last && last.blend !== null) S.pump.sensor = String(Math.round(last.blend)); }
  }
  async function reloadFills() {
    const [f, o] = await Promise.all([sb.from("fills").select("*").order("date").order("odometer"), sb.from("oil_changes").select("*").order("date")]);
    S.fills = f.data || S.fills; S.oil = o.data || S.oil;
  }
  // The learn function runs a moment after each change; pick up what it learned.
  function refreshLearning(delay = 5000) {
    setTimeout(async () => {
      const [c, ms, st] = await Promise.all([sb.from("car_model").select("*").eq("user_id", S.user.id).maybeSingle(), sb.from("my_stations").select("*"), sb.from("station_estimates").select("*")]);
      S.car = c.data || S.car; S.myStations = ms.data || S.myStations; S.stations = st.data || S.stations; S.community = null;
      if (["pump", "learned", "community"].includes(S.view)) render();
    }, delay);
  }
  async function refreshQuota() { const q = await sb.rpc("receipt_quota"); if (q.data) S.quota = q.data; }

  // ---------- routing ----------
  const VIEWS = ["pump", "log", "history", "community", "more", "oil", "learned", "car", "admin"];
  function go(view) { if (location.hash !== "#" + view) location.hash = view; else { S.view = view; render(); } }
  function route() {
    let v = location.hash.replace("#", "") || "pump";
    if (!VIEWS.includes(v)) v = "pump";
    if (v === "admin" && !isAdmin()) v = "more";
    S.view = v;
    if (v === "log" && !S.form) S.form = newForm();
    if (v === "community" && !S.community) loadCommunity();
    if (v === "admin") loadAdmin();
    if (v === "car") S.carForm = null;
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---------- rendering ----------
  function render() {
    const app = $("#app");
    let html = "";
    if (!S.ready) html = `<p class="muted">Loading…</p>`;
    else if (!S.user) html = vSignin();
    else if (!S.profile) html = `<p class="muted">Setting up your account…</p>`;
    else if (S.profile.status !== "approved") html = vPending();
    else if (needsSetup()) html = vCar(true);
    else html = banners() + ({ pump: vPump, log: vLog, history: vHistory, community: vCommunity, more: vMore, oil: vOil, learned: vLearned, car: () => vCar(false), admin: vAdmin }[S.view])();
    document.body.classList.toggle("signin", !S.user || (S.profile && S.profile.status !== "approved"));
    app.innerHTML = html;
    $("#tabs").hidden = !(S.user && approved() && !needsSetup());
    if (!$("#tabs").hidden) renderTabs();
    if (!S.user) mountTurnstile();
    if (S.view === "pump" && approved()) renderReadout();
  }
  function renderTabs() {
    const tab = { pump: "pump", log: "log", history: "history", community: "community" }[S.view] || "more";
    $("#tabs").innerHTML = `<nav aria-label="Sections">${[["pump", "Pump"], ["log", "Log"], ["history", "History"], ["community", "Community"], ["more", "More"]]
      .map(([id, label]) => `<a href="#${id}" aria-current="${tab === id ? "page" : "false"}">${icon(id === "log" ? "log" : id)}<span>${label}</span></a>`).join("")}</nav>`;
  }
  function banners() {
    const out = [];
    if (S.offline) out.push(`<div class="banner info">You're offline. The pump plan still works; saving waits for a connection.</div>`);
    if (S.flash) { out.push(`<div class="banner info" role="status">${esc(S.flash)}</div>`); S.flash = ""; }
    const os = C.oilStatus(S.oil, S.fills, S.settings, today());
    if (os.last && os.level !== "ok" && S.view !== "oil") {
      const txt = os.level === "due" ? `Oil change due now${os.milesLeft <= 0 ? `: ${miles(-os.milesLeft)} miles over` : ""}.` : `Oil change coming due: ${miles(Math.max(0, os.milesLeft))} miles or ${Math.max(0, os.daysLeft)} days left.`;
      out.push(`<div class="banner ${os.level === "due" ? "bad" : "warn"}"><span>${txt}</span><a href="#oil" class="link">View</a></div>`);
    }
    return out.join("");
  }

  // ---------- sign in ----------
  function vSignin() {
    const s = S.signin;
    const err = s.error ? `<p class="note-err" role="alert">${esc(s.error)}</p>` : "";
    const form = s.step === "email" ? `
      <form class="card" data-form="sendCode" style="color: var(--ink)">
        <label class="field" for="email">Email<input id="email" type="email" autocomplete="email" inputmode="email" required value="${esc(s.email)}"></label>
        <div id="bot-check"></div>
        ${err}
        <button class="btn primary full" type="submit" ${s.busy ? "disabled" : ""}>${s.busy ? '<span class="spinner"></span>' : ""}Send me a code</button>
      </form>` : `
      <form class="card" data-form="verifyCode" style="color: var(--ink)">
        <p class="note-ok">Code sent to ${esc(s.email)}. Check your email, then enter the code here.</p>
        <label class="field" for="code">Code<input id="code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]{6,10}" required value="${esc(s.code)}"></label>
        ${err}
        <button class="btn primary full" type="submit" ${s.busy ? "disabled" : ""}>${s.busy ? '<span class="spinner"></span>' : ""}Sign in</button>
        <div class="row"><button type="button" class="link" data-act="resend">Send a new code</button><span class="grow"></span><button type="button" class="link" data-act="otherEmail">Use another email</button></div>
      </form>`;
    return `<div class="stack"><span class="wordmark">GR FUEL LOG</span><p class="soft" style="font-size:17px;color:var(--readout-soft)">Blend math at the pump, a log that learns your E85, and real numbers from other GR Corolla owners.</p></div>
      ${form}<p style="color:var(--readout-soft);font-size:14px">No password. New here? Signing in creates your account.${CFG.turnstileSiteKey ? " A quick bot check runs first." : ""}</p>`;
  }
  function mountTurnstile() {
    const el = $("#bot-check");
    if (!el || !CFG.turnstileSiteKey) return;
    const ready = () => window.turnstile && typeof window.turnstile.render === "function";
    const draw = () => ready() && window.turnstile.render(el, { sitekey: CFG.turnstileSiteKey, theme: "auto", callback: (t) => { S.signin.captcha = t; }, "expired-callback": () => { S.signin.captcha = ""; } });
    if (ready()) draw();
    else if (!document.querySelector("script[data-turnstile]")) {
      const sc = document.createElement("script");
      sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.dataset.turnstile = "1"; sc.onload = draw;
      document.head.appendChild(sc);
    }
  }
  async function sendCode(email) {
    const s = S.signin; s.email = email.trim().toLowerCase(); s.error = ""; s.busy = true; render();
    if (!/^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+$/.test(s.email)) { s.busy = false; s.error = "That email address doesn't look right. Check for typos like a double dot."; render(); return; }
    if (CFG.turnstileSiteKey && !s.captcha) { s.busy = false; s.error = "Finish the bot check above, then send the code."; render(); return; }
    const { error } = await sb.auth.signInWithOtp({ email: s.email, options: { shouldCreateUser: true, captchaToken: s.captcha || undefined } });
    s.busy = false; s.captcha = "";
    if (error) { s.error = /rate|seconds/i.test(error.message) ? "Too many codes requested. Wait a minute, then try again." : /captcha/i.test(error.message) ? "The bot check didn't go through. Reload the page and try again." : (error.status || 0) >= 500 ? "The app couldn't send email just now. Try again in a few minutes." : "Couldn't send the code. Check the address and try again."; }
    else { s.step = "code"; store.set("last-email", s.email); }
    render();
    if (s.step === "code") setTimeout(() => $("#code") && $("#code").focus(), 50);
  }
  async function verifyCode(code) {
    const s = S.signin; s.code = code.replace(/\D/g, ""); s.error = ""; s.busy = true; render();
    const { error } = await sb.auth.verifyOtp({ email: s.email, token: s.code, type: "email" });
    s.busy = false;
    if (error) { s.error = "That code didn't work. Check it, or send a new one."; render(); }
  }

  function vPending() {
    const rejected = S.profile.status === "rejected";
    return `<span class="wordmark">GR FUEL LOG</span>
      <div class="card" style="color: var(--ink)">
        <h1>${rejected ? "This account wasn't approved" : "Waiting for approval"}</h1>
        <p>${rejected ? "Contact the person who shared the app with you if you think this is a mistake." : "New sign-ups are approved automatically most of the time. This one is waiting for the admin to check it. You can close the app and come back later."}</p>
        <div class="row">${rejected ? "" : `<button class="btn primary" data-act="recheck">Check again</button>`}<button class="btn" data-act="signOut">Sign out</button></div>
      </div>`;
  }

  // ---------- pump plan ----------
  function vPump() {
    const s = S.settings;
    return `<header class="head"><div class="stack"><span class="eyebrow">GR Fuel Log</span><h1>Pump plan</h1></div>
        <div class="stepper" role="group" aria-label="Target blend"><button type="button" data-act="target" data-d="-1" aria-label="Lower target">−</button><span id="tgt">E${s.target}</span><button type="button" data-act="target" data-d="1" aria-label="Raise target">+</button></div></header>
      <section class="card">
        <div class="grid2">
          <label class="field" for="dte">Miles to empty (DTE)<input id="dte" type="number" inputmode="decimal" min="0" data-pump="dte" value="${esc(S.pump.dte)}" placeholder="35"></label>
          <label class="field" for="sensor">Flex sensor now (%)<input id="sensor" type="number" inputmode="decimal" min="0" max="100" data-pump="sensor" value="${esc(S.pump.sensor)}" placeholder="38"></label>
        </div>
        <div class="stack"><span class="small muted" id="stLabel">E85 station</span>
          <div class="seg" role="group" aria-labelledby="stLabel">
            <button type="button" data-act="which" data-w="primary" aria-pressed="${S.pump.which === "primary"}">${s.primaryE85 ? "Primary · " + esc(s.primaryE85) : "Primary"}</button>
            <button type="button" data-act="which" data-w="other" aria-pressed="${S.pump.which === "other"}">Other station</button>
          </div></div>
        <p class="small muted">Gas: ${esc(s.primaryGas || "your gas station")} · ${s.ethanolFree ? "ethanol-free " : ""}${s.gasGrade} octane (E${C.gasEthanol(s)})</p>
      </section>
      <section class="dark readout" id="readout" aria-live="polite"></section>
      <div id="planWarn" class="gap"></div>
      <button class="btn primary full" id="logPlan" data-act="logPlan" disabled>Log this fill</button>`;
  }
  function currentPlan() {
    const s = S.settings, dte = num(S.pump.dte), sensor = num(S.pump.sensor);
    const as = C.e85Assumption({ which: S.pump.which, settings: s, myStations: S.myStations, stations: S.stations, car: S.car, today: today() });
    if (dte === null || sensor === null || dte < 0 || sensor < 0 || sensor > 100) return { as, p: null };
    const p = C.plan({ dte, sensor, target: s.target, tuneLimit: s.tuneLimit, e85: as.value, e85Sd: as.sd, gasEth: C.gasEthanol(s), car: S.car });
    return { as, p, dte, sensor };
  }
  function renderReadout() {
    const el = $("#readout"); if (!el) return;
    const s = S.settings, { as, p, sensor } = currentPlan();
    const pct = (v) => ((Math.min(85, Math.max(20, v)) - 20) / 65 * 100).toFixed(2) + "%";
    const ticks = [20, 30, 40, 50, 60, 70, 80].map((v) => `<span class="tick" style="left:${pct(v)}">E${v}</span>`).join("");
    const strip = `<div class="strip" aria-hidden="true"><div class="track"></div><div class="band" style="left:${pct(s.target - 3)};width:calc(${pct(s.target + 3)} - ${pct(s.target - 3)})"></div><div class="limit" style="left:${pct(s.tuneLimit)}"></div>${p ? `<div class="mark" style="left:${pct(p.predicted)}"></div>` : ""}${ticks}</div>`;
    const gasLabel = `${s.gasGrade} octane`;
    const last = as.last ? ` Last measured E${Math.round(as.last.value)} on ${fmtShort(as.last.date)}.` : "";
    const biasNote = S.car && S.car.bias_basis > 0 && Math.abs(S.car.bias) >= 0.5 ? ` Your sensor's ${S.car.bias > 0 ? "+" : ""}${Number(S.car.bias).toFixed(1)} offset is corrected.` : "";
    const warn = [];
    let e85Txt = "— gal", gasTxt = "fill to full", landTxt = "E—", rangeTxt = "";
    if (p) {
      if (sensor >= s.tuneLimit) warn.push(["bad", `The tank reads E${sensor} right now, at or past your tune's E${s.tuneLimit} limit. The plan below brings it back down.`]);
      if (p.clamped === "zero" && p.overCap) {
        e85Txt = "0 gal"; gasTxt = "don't fill yet"; landTxt = "E" + Math.round(p.predicted);
        warn.push(["bad", `Even a full tank of gas lands at about E${Math.round(p.predicted)}, within 2 points of your tune's E${s.tuneLimit} limit. Burn this tank down further and re-run.`]);
      } else {
        e85Txt = p.e85gal.toFixed(1) + " gal"; gasTxt = `fill to full (~${p.gas.toFixed(1)} gal)`; landTxt = "~E" + Math.round(p.predicted);
        rangeTxt = `likely E${Math.round(p.lo)} to E${Math.round(p.hi)}`;
        if (p.clamped === "zero") warn.push(["warn", `The tank is already rich, so skip E85 this fill. Gas alone lands at about E${Math.round(p.predicted)}.`]);
        if (p.clamped === "full") warn.push(["warn", `All E85 still can't reach E${s.target} this fill: the pump's E85 is running about E${Math.round(as.value)}. It lands at about E${Math.round(p.predicted)}.`]);
      }
      if (as.last && Math.abs(as.last.value - as.value) >= 8) warn.push(["warn", `Your last fill here measured E${Math.round(as.last.value)}, ${Math.round(Math.abs(as.last.value - as.value))} points off what this plan assumes. The station may have switched blends, so check the sensor after this fill.`]);
    }
    el.classList.toggle("idle", !p);
    el.innerHTML = `<div class="line"><span class="k">E85</span><span class="v">${e85Txt}</span></div>
      <div class="line"><span class="k">${esc(gasLabel)}</span><span class="v mid">${gasTxt}</span></div>
      <div class="line"><span class="k">Lands at</span><span class="stack" style="justify-items:end"><span class="v mid">${landTxt}</span><span class="range">${rangeTxt}</span></span></div>
      ${strip}
      <p class="small soft">${p ? "" : "Enter DTE and the flex sensor reading. "}E85 assumed at E${Math.round(as.value)} ±${Math.max(1, Math.round(as.sd))} (${esc(as.why)}).${last}${biasNote}${p ? ` About ${p.R.toFixed(1)} gal left in the tank.` : ""} Red line: your tune's E${s.tuneLimit} limit.</p>`;
    $("#planWarn").innerHTML = warn.map(([k, t]) => `<div class="banner ${k}">${esc(t)}</div>`).join("");
    const btn = $("#logPlan"); if (btn) btn.disabled = !p || (p.clamped === "zero" && p.overCap);
  }

  // ---------- log a fill ----------
  function blankStop(kind) {
    const s = S.settings;
    return { kind, station: kind === "e85" ? s.primaryE85 : kind === "gas" ? s.primaryGas : "", grade: s.gasGrade, ethanol: kind === "gas" ? null : "", fuelName: "",
      gallons: "", price: "", total: "", totalManual: false, note: "", noteKind: "", hl: {}, image: null, offerClaude: false, busy: false };
  }
  function newForm(fromPlan) {
    const s = S.settings;
    const f = { id: null, date: today(), odometer: "", dte: "", sensor_before: "", sensor_after: "", full: true, notes: "", target: s.target, plan: null, stops: [blankStop("e85"), blankStop("gas")], confirmDelete: false, error: "" };
    if (fromPlan) {
      const { as, p, dte, sensor } = currentPlan();
      if (p) { f.dte = String(dte); f.sensor_before = String(sensor); f.plan = { e85: p.e85gal, predicted: C.r1(p.predicted), e85Assumed: Math.round(as.value) }; f.stops[0].note = `Plan: ${p.e85gal.toFixed(1)} gal of E85, then fill to full with gas.`; }
      if (S.pump.which === "other") f.stops[0].station = "";
    }
    return f;
  }
  function editForm(fill) {
    return { id: fill.id, date: fill.date, odometer: String(fill.odometer ?? ""), dte: fill.dte ?? "", sensor_before: fill.sensor_before ?? "", sensor_after: fill.sensor_after ?? "",
      full: fill.full !== false, notes: fill.notes || "", target: fill.target ?? S.settings.target, plan: fill.plan || null, confirmDelete: false, error: "",
      stops: (fill.stops || []).map((st) => ({ ...blankStop(st.kind || "e85"), ...st, gallons: st.gallons ?? "", price: st.price ?? "", total: st.total ?? "", ethanol: st.ethanol ?? (st.kind === "gas" ? null : ""), totalManual: st.total !== null && st.total !== undefined, note: "", noteKind: "", hl: {}, image: null })) };
  }
  function vLog() {
    const f = S.form;
    const stations = [...new Set([S.settings.primaryE85, S.settings.primaryGas, ...S.fills.flatMap((x) => (x.stops || []).map((s) => s.station)), ...S.stations.map((s) => s.display_name)].filter(Boolean))];
    return `<header class="head"><h1>${f.id ? "Edit fill" : "Log a fill"}</h1><span class="chip target">Target E${esc(f.target)}</span></header>
      <datalist id="stationList">${stations.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
      <form class="gap" data-form="saveFill" novalidate>
        <section class="card">
          <div class="grid2">
            <label class="field" for="f-date">Date<input id="f-date" type="date" data-f="date" value="${esc(f.date)}" required></label>
            <label class="field" for="f-odo">Odometer<input id="f-odo" type="number" inputmode="decimal" data-f="odometer" value="${esc(f.odometer)}"></label>
          </div>
          <h2>Before filling</h2>
          <div class="grid2">
            <label class="field" for="f-dte">Miles to empty<input id="f-dte" type="number" inputmode="decimal" data-f="dte" value="${esc(f.dte)}"></label>
            <label class="field" for="f-before">Flex sensor (%)<input id="f-before" type="number" inputmode="decimal" data-f="sensor_before" value="${esc(f.sensor_before)}"></label>
          </div>
        </section>
        <section class="card">
          <div class="head"><h2>Pump stops</h2><span class="small muted">${S.settings.receiptMode === "off" ? "" : "Photos are read, then discarded"}</span></div>
          <div id="stops" class="gap">${f.stops.map(stopHtml).join("")}</div>
          <button type="button" class="btn" data-act="addStop">Add a pump stop</button>
        </section>
        <section class="card">
          <h2>After filling</h2>
          <label class="field" for="f-after">Flex sensor after the fill (%)<input id="f-after" type="number" inputmode="decimal" data-f="sensor_after" value="${esc(f.sensor_after)}" placeholder="Add once the gauge settles"></label>
          <label class="check" for="f-full"><input id="f-full" type="checkbox" data-f="full" ${f.full ? "checked" : ""}>Filled to full</label>
          <label class="field" for="f-notes">Notes<textarea id="f-notes" data-f="notes" rows="2">${esc(f.notes)}</textarea></label>
        </section>
        <p class="small muted" id="f-summary">${esc(formSummary())}</p>
        ${f.error ? `<p class="note-err" role="alert">${esc(f.error)}</p>` : ""}
        <div class="row"><button class="btn primary grow" type="submit" data-busy>Save fill</button><button type="button" class="btn" data-act="cancelFill">Cancel</button></div>
        ${f.id ? (f.confirmDelete ? `<div class="confirm"><span class="grow">Delete this fill for good?</span><button type="button" class="btn danger" data-act="deleteFill">Delete</button><button type="button" class="btn" data-act="keepFill">Keep it</button></div>` : `<button type="button" class="btn danger" data-act="askDeleteFill">Delete this fill</button>`) : ""}
      </form>`;
  }
  function stopHtml(st, i) {
    const s = S.settings, mode = s.receiptMode;
    const hl = (k) => (st.hl[k] === "missing" ? "missing" : st.hl[k] ? "hl" : "");
    const kinds = [["e85", "E85"], ["gas", `Gas · ${st.grade || s.gasGrade}`], ["other", "Other"]];
    const quota = S.quota ? Math.max(0, S.quota.daily_limit - S.quota.used_today) : null;
    const claudeOk = mode !== "phone" && mode !== "off";
    return `<div class="stop" data-i="${i}">
      <div class="head"><b>Stop ${i + 1}</b>${S.form.stops.length > 1 ? `<button type="button" class="link" data-act="removeStop" data-i="${i}">Remove</button>` : ""}</div>
      <div class="seg" role="group" aria-label="Fuel for stop ${i + 1}">${kinds.map(([k, l]) => `<button type="button" data-act="stopKind" data-i="${i}" data-k="${k}" aria-pressed="${st.kind === k}">${esc(l)}</button>`).join("")}</div>
      ${st.kind === "gas" ? `<div class="grid2"><label class="field" for="g${i}">Grade<select id="g${i}" data-s="grade" data-i="${i}">${C.GRADES.map((g) => `<option value="${g}" ${Number(st.grade) === g ? "selected" : ""}>${g} octane</option>`).join("")}</select></label>
        <label class="field" for="ge${i}">Ethanol %<input id="ge${i}" type="number" inputmode="decimal" data-s="ethanol" data-i="${i}" value="${esc(st.ethanol ?? "")}" placeholder="${C.gasEthanol(s, st.grade)}"></label></div>` : ""}
      ${st.kind === "other" ? `<div class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)"><label class="field" for="fn${i}">What fuel<input id="fn${i}" type="text" data-s="fuelName" data-i="${i}" value="${esc(st.fuelName)}" placeholder="Race fuel, blender pump E30…"></label>
        <label class="field" for="oe${i}">Ethanol %<input id="oe${i}" type="number" inputmode="decimal" data-s="ethanol" data-i="${i}" value="${esc(st.ethanol ?? "")}" class="${hl("ethanol")}"></label></div>
        <p class="note">For ethanol-free gas, race fuel, a blender pump or any blend that isn't your usual. The math uses the ethanol % you enter.</p>` : ""}
      <label class="field" for="st${i}">Station<input id="st${i}" type="text" list="stationList" autocomplete="off" data-s="station" data-i="${i}" value="${esc(st.station)}" class="${hl("station")}"></label>
      <div class="grid3">
        <label class="field" for="ga${i}">Gallons<input id="ga${i}" type="number" inputmode="decimal" step="0.001" data-s="gallons" data-i="${i}" value="${esc(st.gallons)}" class="${hl("gallons")}"></label>
        <label class="field" for="pr${i}">$ per gal<input id="pr${i}" type="number" inputmode="decimal" step="0.001" data-s="price" data-i="${i}" value="${esc(st.price)}" class="${hl("price")}"></label>
        <label class="field" for="to${i}">Total $<input id="to${i}" type="number" inputmode="decimal" step="0.01" data-s="total" data-i="${i}" value="${esc(st.total)}" class="${hl("total")}" placeholder="auto"></label>
      </div>
      ${mode !== "off" ? `<input type="file" accept="image/*" id="ph${i}" data-photo="${i}" hidden><button type="button" class="btn" data-act="scan" data-i="${i}" ${st.busy ? "disabled" : ""}>${st.busy ? '<span class="spinner"></span>' : icon("camera", 20)}Scan receipt</button>` : ""}
      ${st.note ? `<p class="${st.noteKind === "ok" ? "note-ok" : st.noteKind === "err" ? "note-err" : "note"}" aria-live="polite">${esc(st.note)}</p>` : ""}
      ${st.offerClaude && claudeOk && st.image ? `<button type="button" class="btn dark" data-act="claudeRead" data-i="${i}" ${st.busy || quota === 0 ? "disabled" : ""}>Read it with Claude <span class="small" style="color:var(--readout-soft)">· ${quota === null ? "" : quota + " left today"}</span></button>` : ""}
    </div>`;
  }
  function renderStops() { const el = $("#stops"); if (el) el.innerHTML = S.form.stops.map(stopHtml).join(""); updateSummary(); }
  function formSummary() {
    const t = C.stopTotals({ stops: cleanStops(S.form.stops) }, S.settings);
    if (!t.gallons) return "";
    const parts = [t.e85 && `${t.e85.toFixed(2)} E85`, t.gas && `${t.gas.toFixed(2)} gas`, t.other && `${t.other.toFixed(2)} other`].filter(Boolean).join(", ");
    return `${t.gallons.toFixed(2)} gal so far (${parts}) for ${money(t.cost)}.`;
  }
  function updateSummary() { const el = $("#f-summary"); if (el) el.textContent = formSummary(); }
  function cleanStops(stops) {
    return stops.map((st) => {
      const g = num(st.gallons), p = num(st.price); let t = num(st.total);
      if (t === null && g !== null && p !== null) t = Math.round(g * p * 100) / 100;
      const out = { kind: st.kind, station: String(st.station || "").trim(), gallons: g, price: p, total: t };
      if (st.kind === "gas") { out.grade = Number(st.grade) || S.settings.gasGrade; if (num(st.ethanol) !== null) out.ethanol = num(st.ethanol); }
      if (st.kind === "other") { out.fuelName = String(st.fuelName || "").trim(); out.ethanol = num(st.ethanol); }
      return out;
    }).filter((st) => st.gallons !== null || st.total !== null);
  }
  async function saveFill() {
    const f = S.form; f.error = "";
    const fail = (m) => { f.error = m; render(); };
    if (!/^\d{4}-\d\d-\d\d$/.test(f.date)) return fail("Enter the fill date.");
    const odo = num(f.odometer); if (odo === null || odo <= 0) return fail("Enter the odometer reading.");
    const stops = cleanStops(f.stops);
    if (!stops.length) return fail("Add the gallons for at least one pump stop.");
    if (stops.some((s) => s.gallons === null || s.gallons < 0)) return fail("Every pump stop needs its gallons.");
    if (stops.some((s) => s.kind === "other" && (s.ethanol === null || s.ethanol < 0 || s.ethanol > 100))) return fail("Enter the ethanol % for each Other fuel stop.");
    const gallons = stops.reduce((a, s) => a + s.gallons, 0);
    if (gallons > C.TANK + 1) return fail(`That's ${gallons.toFixed(2)} gal, more than the ${C.TANK} gal tank holds. Check the gallons.`);
    for (const [k, label] of [["sensor_before", "The before reading"], ["sensor_after", "The after reading"]]) { const v = num(f[k]); if (v !== null && (v < 0 || v > 100)) return fail(`${label} must be between 0 and 100.`); }
    const row = { date: f.date, odometer: odo, dte: num(f.dte), sensor_before: num(f.sensor_before), sensor_after: num(f.sensor_after), full: !!f.full,
      target: num(f.target), stops, plan: f.plan, notes: String(f.notes || "").trim() || null };
    const res = f.id ? await sb.from("fills").update(row).eq("id", f.id) : await sb.from("fills").insert(row);
    if (res.error) return fail(S.offline ? "You're offline. Save again once you have a signal." : "Couldn't save. Check your connection and try again.");
    S.form = null; S.flash = f.id ? "Fill updated." : "Fill saved. The app is learning from it now.";
    await reloadFills(); refreshLearning(); go("history");
  }

  // ---------- receipt reading ----------
  async function shrink(file, maxSide = 1568) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    const base64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    return { blob, base64 };
  }
  let tesseractLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tesseractLoading) tesseractLoading = new Promise((ok, bad) => { const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js"; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); });
    return tesseractLoading;
  }
  async function phoneText(blob) {
    await loadTesseract();
    const worker = await window.Tesseract.createWorker("eng");
    try { const { data } = await worker.recognize(blob); return data.text || ""; } finally { await worker.terminate(); }
  }
  function applyReceipt(i, r, source) {
    const st = S.form.stops[i]; st.hl = {};
    const filled = [];
    if (r.fuel === "e85" || r.fuel === "E85") { st.kind = "e85"; filled.push("fuel"); }
    else if (r.fuel === "gas") { st.kind = "gas"; if (r.octane) st.grade = r.octane; filled.push("fuel"); }
    else if (r.fuel === "other") st.kind = "other";
    if (num(r.ethanol ?? r.ethanol_percent) !== null && st.kind !== "e85") st.ethanol = num(r.ethanol ?? r.ethanol_percent);
    if (r.station) { st.station = matchStation(r.station); st.hl.station = 1; filled.push("station"); }
    const g = num(r.gallons), p = num(r.price ?? r.price_per_gallon), t = num(r.total);
    if (g !== null && g > 0 && g < 40) { st.gallons = String(g); st.hl.gallons = 1; filled.push("gallons"); } else st.hl.gallons = "missing";
    if (p !== null && p > 0 && p < 15) { st.price = String(p); st.hl.price = 1; filled.push("price"); }
    if (t !== null && t > 0 && t < 400) { st.total = String(t); st.totalManual = true; st.hl.total = 1; filled.push("total"); }
    if (i === 0 && !S.form.id && /^\d{4}-\d\d-\d\d$/.test(r.date || "")) S.form.date = r.date;
    const ok = filled.includes("gallons") && (filled.includes("price") || filled.includes("total"));
    st.note = ok ? `${source === "claude" ? "Read by Claude" : "Read on your phone"}. Check the highlighted numbers before saving.` : source === "claude" ? "Claude couldn't read this receipt clearly. Type the numbers in." : "Your phone couldn't read every number on this receipt.";
    st.noteKind = ok ? "ok" : "err";
    return ok;
  }
  function matchStation(text) {
    const known = [S.settings.primaryE85, S.settings.primaryGas, ...S.stations.map((s) => s.display_name), ...S.fills.flatMap((f) => (f.stops || []).map((s) => s.station))].filter(Boolean);
    const words = C.stationKey(text).split(" ").filter((w) => w.length > 2);
    const hit = known.find((k) => words.some((w) => C.stationKey(k).split(" ").includes(w)));
    return hit || String(text).slice(0, 60);
  }
  async function scanReceipt(i, file) {
    const st = S.form.stops[i], mode = S.settings.receiptMode;
    st.busy = true; st.note = "Preparing the photo…"; st.noteKind = ""; st.offerClaude = false; renderStops();
    try { st.image = await shrink(file); } catch { st.busy = false; st.note = "That photo couldn't be opened. Try another one."; st.noteKind = "err"; renderStops(); return; }
    if (mode === "claude") { st.busy = false; return claudeRead(i); }
    st.note = "Reading on your phone…"; renderStops();
    let ok = false;
    try { ok = applyReceipt(i, C.parseReceiptText(await phoneText(st.image.blob)), "phone"); }
    catch { st.note = "Your phone couldn't read this receipt."; st.noteKind = "err"; }
    st.busy = false;
    if (ok || mode === "phone") st.image = null;
    else { st.offerClaude = true; await refreshQuota(); }
    renderStops(); updateDateInput();
  }
  async function claudeRead(i) {
    const st = S.form.stops[i];
    if (!st.image) return;
    st.busy = true; st.note = "Claude is reading the receipt…"; st.noteKind = ""; renderStops();
    const { data, error } = await sb.functions.invoke("read-receipt", { body: { image: st.image.base64, media_type: "image/jpeg" } });
    st.busy = false;
    if (error) {
      let code = "";
      try { code = (await error.context.json()).error; } catch { /* no body */ }
      st.note = { daily_limit: "You've used today's Claude reads. Type the numbers in, or try tomorrow.", month_cap: "This month's Claude reads are used up, so the app is using phone reading only until next month.",
        not_configured: "Claude reading isn't switched on yet. Type the numbers in.", unreadable: "Claude couldn't read this receipt clearly. Type the numbers in." }[code] || "Couldn't reach Claude. Check your signal and try again.";
      st.noteKind = "err"; st.offerClaude = code !== "daily_limit" && code !== "month_cap" && code !== "unreadable";
    } else {
      applyReceipt(i, data.receipt || {}, "claude");
      st.image = null; st.offerClaude = false;
    }
    await refreshQuota(); renderStops(); updateDateInput();
  }
  function updateDateInput() { const d = $("#f-date"); if (d && S.form) d.value = S.form.date; }

  // ---------- history ----------
  function vHistory() {
    const rows = C.deriveRows(S.fills, S.settings);
    if (!rows.length) return `<h1>History</h1><section class="card"><p class="muted">No fills yet. Log your first one from the Log tab and it shows up here with its blend, cost and cost per mile.</p><a class="btn primary" href="#log">Log a fill</a></section>`;
    const last = C.summarize(rows.slice(-5)), all = C.summarize(rows);
    const stat = (v, k) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`;
    const chartRows = rows.filter((r) => r.blend !== null).slice(-10);
    const vals = chartRows.map((r) => r.blend), tgt = S.settings.target;
    const lo = Math.min(tgt - 8, ...vals) - 2, hi = Math.max(tgt + 8, ...vals) + 2, H = 130, pad = 12;
    const y = (v) => (pad + (hi - v) / (hi - lo) * (H - 2 * pad)).toFixed(1) + "px";
    const color = { on: "var(--good)", low: "var(--low)", high: "var(--high)", danger: "var(--danger)", none: "var(--muted)" };
    const grid = [Math.ceil(lo / 10) * 10, Math.ceil(lo / 10) * 10 + 10, Math.ceil(lo / 10) * 10 + 20].filter((v) => v < hi);
    const chart = chartRows.length ? `<div class="chart" role="img" aria-label="Blend after each of the last ${chartRows.length} fills">
        <div class="bandarea" style="top:${y(tgt + 3)};height:${(6 / (hi - lo) * (H - 2 * pad)).toFixed(1)}px"></div>
        ${grid.map((v) => `<div class="gl" style="top:${y(v)}"><span>E${v}</span></div>`).join("")}
        ${chartRows.map((r, i) => `<div class="dot" style="left:calc(34px + ${((i + 0.5) / chartRows.length * 88).toFixed(1)}%);top:${y(r.blend)};background:${color[r.band]}"></div>`).join("")}
      </div><div class="legend"><span><i style="background:var(--good)"></i>On target, within 3</span><span><i style="background:var(--low)"></i>More than 3 low</span><span><i style="background:var(--high)"></i>More than 3 high</span></div>` : "";
    const label = { on: "on target", low: "low", high: "high", danger: "near limit", none: "no reading" };
    return `<h1>History</h1>
      <section class="card"><h2>Last 5 fills</h2>
        <div class="stats">${stat(last.cpm === null ? "—" : "$" + last.cpm.toFixed(3), "Cost per mile")}${stat(last.mpg === null ? "—" : last.mpg.toFixed(1), "MPG")}${stat(last.avgBlend === null ? "—" : "E" + last.avgBlend.toFixed(1), "Average blend")}${stat(last.onTarget === null ? "—" : Math.round(last.onTarget * 100) + "%", "On target")}</div>
        ${chart}
        <p class="small muted num">All time: ${all.count} fills, ${money(all.spent)} spent${all.cpm === null ? "" : `, $${all.cpm.toFixed(3)} per mile`}${all.mpg === null ? "" : `, ${all.mpg.toFixed(1)} mpg`}${all.onTarget === null ? "" : `, ${Math.round(all.onTarget * 100)}% on target`}.</p>
      </section>
      <section class="card list">${[...rows].reverse().map((r) => `<button type="button" class="item" data-act="editFill" data-id="${esc(r.f.id)}">
          <span class="t">${fmtDate(r.f.date)}</span><span class="r"><span class="chip ${r.band}">${r.blend === null ? "no reading" : `E${C.r1(r.blend)} · ${label[r.band]}`}</span></span>
          <span class="d num">${miles(r.f.odometer)} mi · ${r.t.e85 ? r.t.e85.toFixed(2) + " E85" : ""}${r.t.gas ? " + " + r.t.gas.toFixed(2) + " gas" : ""}${r.t.other ? " + " + r.t.other.toFixed(2) + " other" : ""}</span>
          <span class="d r num">${money(r.t.cost)}${r.cpm ? " · $" + r.cpm.toFixed(3) + "/mi" : ""}</span></button>`).join("")}</section>`;
  }

  // ---------- community ----------
  async function loadCommunity() {
    const { data } = await sb.rpc("community_stats", { p_days: S.communityDays || null });
    S.community = data || { owners: 0, stations: [], blends: [], grades: [] };
    if (S.view === "community") render();
  }
  function vCommunity() {
    const c = S.community;
    const head = `<div class="stack"><h1>Community</h1><p class="muted">${c ? `${c.owners} owner${c.owners === 1 ? "" : "s"} sharing · ${S.communityDays ? "last 90 days" : "all time"}` : "Loading…"}</p></div>
      <div class="seg" role="group" aria-label="Time span"><button type="button" data-act="days" data-d="90" aria-pressed="${S.communityDays === 90}">Last 90 days</button><button type="button" data-act="days" data-d="0" aria-pressed="${!S.communityDays}">All time</button></div>`;
    if (!c) return head;
    const pos = (v) => ((Math.min(85, Math.max(50, v)) - 50) / 35 * 100).toFixed(1) + "%";
    const stations = c.stations.length ? c.stations.map((s) => `<div class="stack" style="gap:6px"><div class="head"><span>${esc(s.name)}</span><span class="big" style="font:700 28px/1 var(--display)">E${s.value}</span></div>
        <div class="bar"><div class="fill" style="width:${pos(s.value)}"></div>${s.switch_from ? `<div class="was" style="left:${pos(s.switch_from)}"></div>` : ""}</div>
        <span class="small soft">${s.switch_date ? `Switched from E${s.switch_from} on ${fmtShort(s.switch_date)} · ` : ""}${s.n} fills from ${s.owners} owners</span></div>`).join("")
      : `<p class="soft">No station has fills from 2 or more sharing owners yet. Stations show up here once they do.</p>`;
    const blends = c.blends.length ? `<table><thead><tr><th>Blend</th><th class="n">$/mile</th><th class="n">MPG</th><th class="n">Fills</th></tr></thead><tbody>${c.blends.map((b) => `<tr><td>${esc(b.label)}</td><td class="n">$${Number(b.cpm).toFixed(3)}</td><td class="n">${b.mpg ?? "—"}</td><td class="n">${b.n}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">Shows once a blend range has fills from 2 or more owners.</p>`;
    const grades = c.grades.length ? `<div class="grid3">${c.grades.map((g) => `<div class="stat"><b style="font-size:22px">$${Number(g.cpm).toFixed(3)}</b><span>${esc(g.grade)} octane</span></div>`).join("")}</div>` : `<p class="muted small">Shows once a grade has fills from 2 or more owners.</p>`;
    return head + `<section class="dark"><h2>Real E85 strength by station</h2>${stations}<p class="small dim">Bar runs from E50 to E85. Grey tick: the reading before the last blend switch.</p></section>
      <section class="card"><h2>Cost per mile by blend</h2>${blends}</section>
      <section class="card"><h2>Cost per mile by gas grade</h2>${grades}${c.on_target !== null && c.on_target !== undefined ? `<p><b>${c.on_target}%</b> of shared fills landed within 3 points of their owner's target.</p>` : ""}</section>
      <section class="card" style="background:var(--sunken)"><p class="small"><b>${S.settings.share ? "Your fills are shared." : "Your fills are private."}</b> Only the month, station, blend, E85 strength, mpg, cost per mile and pump prices leave a log. No location is ever shown.</p><a href="#car" class="link">Change sharing</a></section>`;
  }

  // ---------- more, oil, learned ----------
  function vMore() {
    const os = C.oilStatus(S.oil, S.fills, S.settings, today());
    const items = [
      ["oil", "Oil changes", os.last ? `Next due at ${miles(os.dueMiles)} mi or ${fmtShort(os.dueDate)}` : "Log your last oil change to start reminders", os.last && os.level !== "ok" ? `<span class="chip ${os.level}">${os.level === "due" ? "Due now" : "Due soon"}</span>` : ""],
      ["learned", "What the app has learned", "E85 strength, your sensor, fuel left, accuracy", ""],
      ["car", "Your car and settings", "Target, tune limit, gas, receipts, sharing", ""],
    ];
    if (isAdmin()) items.push(["admin", "Admin", "Sign-ups, warnings, receipt budget", ""]);
    return `<div class="stack"><h1>More</h1><p class="muted">Signed in as ${esc(S.profile.handle || S.user.email)}</p></div>
      <nav class="card list" aria-label="More">${items.map(([href, t, d, badge]) => `<a class="item" href="#${href}" style="grid-template-columns:minmax(0,1fr) auto auto;align-items:center"><span class="stack"><span class="t">${t}</span><span class="d">${esc(d)}</span></span>${badge || "<span></span>"}${icon("chevron", 18)}</a>`).join("")}</nav>
      <button class="btn full" data-act="signOut">Sign out</button>`;
  }
  function oilChoices() {
    const mine = [...new Set([...(S.settings.oilTypes || []), ...S.oil.map((o) => o.oil_type)].filter(Boolean))];
    return { mine: mine.filter((o) => !C.COMMON_OILS.includes(o)), common: C.COMMON_OILS };
  }
  function vOil() {
    const os = C.oilStatus(S.oil, S.fills, S.settings, today());
    const f = S.oilForm || (S.oilForm = { id: null, date: today(), odometer: os.odoNow ? String(os.odoNow) : "", oil: (S.oil.slice(-1)[0] || {}).oil_type || "", filter: (S.oil.slice(-1)[0] || {}).filter_type || C.FACTORY_FILTER, notes: "", customOil: false, customFilter: false, error: "", confirmDelete: false });
    const { mine, common } = oilChoices();
    const filters = [...new Set([C.FACTORY_FILTER, ...(S.settings.filterTypes || []), ...S.oil.map((o) => o.filter_type)].filter(Boolean))];
    const status = os.last ? `<section class="dark"><div class="head"><h2>Next oil change</h2><span class="chip ${os.level === "ok" ? "on" : os.level}">${os.level === "due" ? "Due now" : os.level === "soon" ? "Due soon" : "OK"}</span></div>
        <div class="grid2"><div class="stack"><span class="big" style="font:700 30px/1 var(--display)">${os.milesLeft >= 0 ? miles(os.milesLeft) + " mi" : miles(-os.milesLeft) + " mi over"}</span><span class="small soft">due at ${miles(os.dueMiles)}</span></div>
        <div class="stack"><span class="big" style="font:700 30px/1 var(--display)">${os.daysLeft >= 0 ? os.daysLeft + " days" : -os.daysLeft + " days over"}</span><span class="small soft">due ${fmtDate(os.dueDate)}</span></div></div>
        <p class="small soft">Every ${miles(S.settings.oilMiles)} miles or ${S.settings.oilMonths} months, whichever comes first.</p></section>`
      : `<section class="card"><h2>Next oil change</h2><p class="muted">Log your most recent oil change to start reminders.</p></section>`;
    const opt = (v, label = v) => `<option value="${esc(v)}" ${f.oil === v ? "selected" : ""}>${esc(label)}</option>`;
    return `<h1>Oil changes</h1>${status}
      <form class="card" data-form="saveOil" novalidate><h2>${f.id ? "Edit oil change" : "Log an oil change"}</h2>
        <div class="grid2"><label class="field" for="o-date">Date<input id="o-date" type="date" data-o="date" value="${esc(f.date)}"></label>
          <label class="field" for="o-odo">Odometer<input id="o-odo" type="number" inputmode="decimal" data-o="odometer" value="${esc(f.odometer)}"></label></div>
        <label class="field" for="o-oil">Oil<select id="o-oil" data-o="oil">
          <option value="" ${!f.oil ? "selected" : ""} disabled>Choose an oil</option>
          ${mine.length ? `<optgroup label="Your oils">${mine.map((o) => opt(o)).join("")}</optgroup>` : ""}
          <optgroup label="Most used by GR Corolla owners">${common.map((o) => opt(o, o + (o.startsWith("Toyota") ? " (factory fill)" : ""))).join("")}</optgroup>
          <option value="__custom" ${f.customOil ? "selected" : ""}>Add your own oil…</option></select></label>
        ${f.customOil ? `<label class="field" for="o-oil-own">Your oil<input id="o-oil-own" type="text" data-o="oilOwn" placeholder="Brand and viscosity" value="${esc(f.oilOwn || "")}"></label>` : ""}
        <p class="small muted">Toyota specifies 0W-20 (ILSAC GF-6A) for the G16E. Heavier oils show up mostly with track use.</p>
        <label class="field" for="o-filter">Filter<select id="o-filter" data-o="filter">${filters.map((x) => `<option value="${esc(x)}" ${f.filter === x ? "selected" : ""}>${esc(x)}${x === C.FACTORY_FILTER ? " (factory)" : ""}</option>`).join("")}<option value="__custom" ${f.customFilter ? "selected" : ""}>Add your own filter…</option></select></label>
        ${f.customFilter ? `<label class="field" for="o-filter-own">Your filter<input id="o-filter-own" type="text" data-o="filterOwn" placeholder="Brand and part number" value="${esc(f.filterOwn || "")}"></label>` : ""}
        <label class="field" for="o-notes">Notes<textarea id="o-notes" rows="2" data-o="notes">${esc(f.notes)}</textarea></label>
        ${f.error ? `<p class="note-err" role="alert">${esc(f.error)}</p>` : ""}
        <div class="row"><button class="btn primary grow" type="submit">Save oil change</button>${f.id ? `<button type="button" class="btn" data-act="cancelOil">Cancel</button>` : ""}</div>
        ${f.id ? (f.confirmDelete ? `<div class="confirm"><span class="grow">Delete this oil change?</span><button type="button" class="btn danger" data-act="deleteOil">Delete</button><button type="button" class="btn" data-act="keepOil">Keep it</button></div>` : `<button type="button" class="btn danger" data-act="askDeleteOil">Delete this oil change</button>`) : ""}
      </form>
      ${S.oil.length ? `<section class="card list">${[...S.oil].reverse().map((o) => `<button type="button" class="item" data-act="editOil" data-id="${esc(o.id)}"><span class="t">${fmtDate(o.date)}</span><span class="r muted">${miles(o.odometer)} mi</span><span class="d">${esc(o.oil_type || "Oil not recorded")}${o.filter_type ? " · " + esc(o.filter_type) : ""}</span><span></span></button>`).join("")}</section>` : ""}`;
  }
  async function saveOil() {
    const f = S.oilForm; f.error = "";
    const oil = f.customOil ? String(f.oilOwn || "").trim() : f.oil, filter = f.customFilter ? String(f.filterOwn || "").trim() : f.filter;
    if (!/^\d{4}-\d\d-\d\d$/.test(f.date)) { f.error = "Enter the date."; return render(); }
    const odo = num(f.odometer); if (odo === null || odo <= 0) { f.error = "Enter the odometer reading."; return render(); }
    if (!oil) { f.error = "Choose or add the oil."; return render(); }
    const row = { date: f.date, odometer: odo, oil_type: oil, filter_type: filter || null, notes: String(f.notes || "").trim() || null };
    const res = f.id ? await sb.from("oil_changes").update(row).eq("id", f.id) : await sb.from("oil_changes").insert(row);
    if (res.error) { f.error = "Couldn't save. Check your connection and try again."; return render(); }
    const s = { ...S.settings };
    if (f.customOil && !C.COMMON_OILS.includes(oil)) s.oilTypes = [...new Set([...(s.oilTypes || []), oil])];
    if (f.customFilter && filter) s.filterTypes = [...new Set([...(s.filterTypes || []), filter])];
    if (f.customOil || f.customFilter) await saveSettings(s);
    S.oilForm = null; S.flash = "Oil change saved."; await reloadFills(); render();
  }

  function vLearned() {
    const car = S.car, s = S.settings;
    const pos = (v) => ((Math.min(85, Math.max(50, v)) - 50) / 35 * 100).toFixed(1) + "%";
    const rows = S.myStations.map((m) => {
      const pm = Math.max(1, Math.round(Number(m.sd)));
      const isPrimary = C.stationKey(s.primaryE85) === m.station_key;
      return `<div class="stack" style="gap:6px"><div class="head"><span>${isPrimary ? "Primary · " : ""}${esc(m.display_name)}</span><span class="big" style="font:700 26px/1 var(--display)">E${Math.round(m.value)} ±${pm}</span></div>
        <div class="bar"><div class="rng" style="left:${pos(m.value - pm)};width:${(2 * pm / 35 * 100).toFixed(1)}%"></div><div class="tick" style="left:${pos(m.value)}"></div></div>
        <span class="small soft">${m.n_total} fill${m.n_total === 1 ? "" : "s"}: ${m.n_mine} yours${m.n_total > m.n_mine ? `, ${m.n_total - m.n_mine} from other owners` : ""}.${m.switch_date ? ` Blend switch spotted ${fmtShort(m.switch_date)}, from E${Math.round(m.switch_from)} to E${Math.round(m.switch_to)}.` : ""}${m.last_value !== null ? ` Last measured E${Math.round(m.last_value)} on ${fmtShort(m.last_date)}.` : ""}</span></div>`;
    }).join("");
    const regional = car && car.regional_value !== null ? `A station with no fills yet starts from the current average of measured stations, E${Math.round(car.regional_value)} ±${Math.round(car.regional_sd)}.` : `A station with no fills yet starts from the seasonal default: E85 April to September, E70 October to March.`;
    const sensor = !car ? `<p class="muted">Learns once you've logged fills with sensor readings.</p>` : car.bias_basis > 0
      ? `<p><b>Reads about ${Math.abs(car.bias) < 0.5 ? "right on" : `${Math.abs(Number(car.bias)).toFixed(1)} points ${car.bias > 0 ? "high" : "low"}`}</b> <span class="muted">(±${Number(car.bias_sd).toFixed(1)})</span></p><p class="small muted">Found by comparing your fills with other owners' fills at the same stations. Plans correct for it.</p>`
      : `<p class="muted">Not enough shared fills at your stations yet to tell your sensor apart from the fuel. This needs other owners who share filling at the same stations.</p>`;
    const months = car && Array.isArray(car.accuracy_by_month) ? car.accuracy_by_month.slice(-3) : [];
    const acc = car && car.accuracy_recent !== null ? `<div class="row" style="align-items:baseline"><b style="font:700 34px/1 var(--display);color:var(--good)">${Number(car.accuracy_recent).toFixed(1)} points</b><span class="muted">average miss, last ${car.accuracy_n} fills</span></div>
        ${months.length ? `<div class="grid3">${months.map((m) => `<div class="stat"><b style="font-size:20px">${Number(m.miss).toFixed(1)}</b><span>${new Date(m.month + "-02").toLocaleDateString("en-US", { month: "long" })}</span></div>`).join("")}</div>` : ""}
        <p class="small muted">Each fill is predicted before its sensor reading comes in, so this is the real miss, not a best fit after the fact.</p>`
      : `<p class="muted">Shows once you've logged a few fills with sensor readings before and after.</p>`;
    return `<div class="stack"><h1>What the app has learned</h1><p class="muted">Updated after every fill. Each number shows how sure the app is.</p></div>
      <section class="dark"><h2>Real E85 strength</h2>${rows || `<p class="soft">No measured fills yet. Log fills with your flex sensor reading before and after.</p>`}<p class="small dim">${regional}</p></section>
      <section class="card"><h2>Your flex sensor</h2>${sensor}</section>
      <section class="card"><h2>Fuel left at a given DTE</h2><b style="font:700 24px/1.1 var(--display)">${car ? `${Number(car.dte_a).toFixed(2)} + DTE ÷ ${Number(car.dte_b).toFixed(1)}` : "0.95 + DTE ÷ 20"} <span class="small muted" style="font-family:var(--body)">±${car ? Number(car.dte_sd).toFixed(1) : "0.4"} gal</span></b>
        <p class="small muted">${car && car.dte_n ? `From your last ${car.dte_n} full fills. ` : "Starting formula until your fills refine it. "}Tunes change this curve, so it's learned for your car only.</p></section>
      <section class="card"><h2>Accuracy</h2>${acc}</section>
      <section class="card"><h2>How it learns</h2><p class="small">Every fill is a measurement. The app weighs each one by how reliable it is, follows each station's E85 as it drifts through the seasons, and spots a blend switch within a fill or two. It separates your sensor's quirks from the fuel by comparing notes with other owners.</p></section>
      <section class="card"><h2>Reset learning</h2><p class="small muted">${S.profile.learn_since ? `Learning uses your fills from ${fmtDate(S.profile.learn_since)} on. ` : ""}Starts your car's learning over from today, for example after a new tune or a new flex sensor. Station numbers from the community stay.</p>
        ${S.confirmReset ? `<div class="confirm"><span class="grow">Start your car's learning over from today?</span><button class="btn danger" data-act="resetLearn">Reset</button><button class="btn" data-act="cancelReset">Cancel</button></div>` : `<button class="btn danger" data-act="askReset">Reset my car's learning</button>`}</section>`;
  }

  // ---------- your car ----------
  function vCar(first) {
    const f = S.carForm || (S.carForm = { ...S.settings, tuneLimit: S.settings.tuneLimitNotSure ? "50ns" : S.settings.tuneLimit, handle: S.profile.handle || "", error: "" });
    const seg = (key, opts, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" data-act="set" data-k="${key}" data-v="${v}" aria-pressed="${String(f[key]) === String(v)}">${l}</button>`).join("")}</div>`;
    const mx = C.maxTarget({ tuneLimit: Number(String(f.tuneLimit).replace("ns", "")) });
    return `<div class="stack"><h1>${first ? "Set up your car" : "Your car"}</h1><p class="muted">${first ? "A few answers so the pump plan fits your car. You can change any of it later." : "Change any of it here."}</p></div>
      <form class="gap" data-form="saveCar" novalidate>
        <section class="card"><h2>Blend</h2>
          <div class="head"><span class="stack"><b>Target blend</b><span class="small muted">E30 to E${mx}</span></span>
            <div class="stepper" role="group" aria-label="Target blend"><button type="button" data-act="carTarget" data-d="-1" aria-label="Lower target">−</button><span>E${f.target}</span><button type="button" data-act="carTarget" data-d="1" aria-label="Raise target">+</button></div></div>
          <div class="stack"><b>Your tune's ethanol limit</b>${seg("tuneLimit", [...C.TUNE_LIMITS.map((v) => [v, "E" + v]), ["50ns", "Not sure"]], "Tune limit")}
            <span class="small muted">The blend where your tune sets a code. Plans never land within 2 points of it. Not sure uses E50, the safest choice.</span></div>
        </section>
        <section class="card"><h2>Fuel</h2>
          <div class="stack"><b>Gas grade you mix with</b>${seg("gasGrade", C.GRADES.map((g) => [g, g]), "Gas grade")}</div>
          <label class="check" for="c-e0"><input id="c-e0" type="checkbox" data-c="ethanolFree" ${f.ethanolFree ? "checked" : ""}>Ethanol-free (E0)</label>
          <p class="small muted">The math uses your gas's own ethanol: E10 for most grades, E15 for Unleaded 88, none when ethanol-free.</p>
          <label class="field" for="c-e85">Primary E85 station<input id="c-e85" type="text" list="stationsAll" data-c="primaryE85" value="${esc(f.primaryE85)}" placeholder="For example MotoMart E Lloyd"></label>
          <label class="field" for="c-gas">Primary gas station<input id="c-gas" type="text" list="stationsAll" data-c="primaryGas" value="${esc(f.primaryGas)}"></label>
          <datalist id="stationsAll">${S.stations.map((s) => `<option value="${esc(s.display_name)}">`).join("")}</datalist>
        </section>
        <section class="card"><h2>Oil change reminder</h2><div class="grid2">
          <label class="field" for="c-om">Every (miles)<input id="c-om" type="number" inputmode="numeric" data-c="oilMiles" value="${esc(f.oilMiles)}"></label>
          <label class="field" for="c-mo">Or every (months)<input id="c-mo" type="number" inputmode="numeric" data-c="oilMonths" value="${esc(f.oilMonths)}"></label></div></section>
        <section class="card"><h2>Receipt photos</h2>
          ${[["phone_first", "Phone first, Claude if needed", "Free on your phone. Claude only when the phone misses a number."], ["claude", "Always Claude", "Most accurate. Up to " + (S.quota ? S.quota.daily_limit : 6) + " reads a day."], ["phone", "Phone only", "Nothing leaves your phone."], ["off", "Off", "Type the numbers in."]]
            .map(([v, t, d]) => `<label class="check" for="rm-${v}" style="align-items:flex-start"><input id="rm-${v}" type="radio" name="rm" data-c="receiptMode" value="${v}" ${f.receiptMode === v ? "checked" : ""}><span class="stack"><b>${t}</b><span class="small muted">${d}</span></span></label>`).join("")}
        </section>
        <section class="card"><h2>Community</h2>
          <label class="check" for="c-share"><input id="c-share" type="checkbox" data-c="share" ${f.share ? "checked" : ""}><b>Share my fills with the community</b></label>
          <p class="small muted">Shared: month, station, blend, E85 strength, mpg, cost per mile and pump prices. Never shared: dates, odometer, notes, receipts, addresses or your email.</p>
          <label class="field" for="c-handle">Handle (only the admin sees it)<input id="c-handle" type="text" maxlength="40" data-c="handle" value="${esc(f.handle)}"></label>
        </section>
        ${f.error ? `<p class="note-err" role="alert">${esc(f.error)}</p>` : ""}
        <button class="btn primary full" type="submit">${first ? "Save and start" : "Save"}</button>
      </form>`;
  }
  async function saveSettings(settings, handle) {
    const patch = { settings };
    if (handle !== undefined) patch.handle = handle || null;
    const { error } = await sb.from("profiles").update(patch).eq("id", S.user.id);
    if (!error) { S.settings = C.withDefaults(settings); S.profile = { ...S.profile, ...patch }; }
    return !error;
  }
  async function saveCar() {
    const f = S.carForm; f.error = "";
    const s = { ...S.settings };
    for (const k of ["target", "tuneLimit", "gasGrade", "oilMiles", "oilMonths"]) s[k] = Number(String(f[k]).replace("ns", ""));
    s.tuneLimitNotSure = String(f.tuneLimit) === "50ns";
    Object.assign(s, { ethanolFree: !!f.ethanolFree, primaryE85: String(f.primaryE85 || "").trim(), primaryGas: String(f.primaryGas || "").trim(), receiptMode: f.receiptMode, share: !!f.share });
    if (!s.primaryE85) { f.error = "Enter the station where you usually buy E85."; return render(); }
    if (!(s.oilMiles >= 500 && s.oilMiles <= 20000) || !(s.oilMonths >= 1 && s.oilMonths <= 24)) { f.error = "Check the oil change interval."; return render(); }
    s.target = Math.min(s.target, C.maxTarget(s));
    if (!(await saveSettings(s, String(f.handle || "").trim()))) { f.error = "Couldn't save. Check your connection and try again."; return render(); }
    S.carForm = null; S.setupDone = true; S.flash = "Settings saved."; refreshLearning(4000); go("pump");
  }

  // ---------- admin ----------
  async function loadAdmin() {
    const { data, error } = await sb.rpc("admin_overview");
    S.admin = error ? { error: true } : data;
    if (S.view === "admin") render();
  }
  function vAdmin() {
    const a = S.admin;
    if (!a) return `<h1>Admin</h1><p class="muted">Loading…</p>`;
    if (a.error) return `<h1>Admin</h1><p class="note-err">Couldn't load the admin page.</p>`;
    const c = a.config || {};
    const tone = { approved: ["on", "Approved"], held: ["soon", "Held"], approved_by_admin: ["on", "Approved by you"], rejected: ["none", "Rejected"] };
    const held = a.held.length ? a.held.map((h) => `<div class="stack" style="gap:8px"><b>${esc(h.email)}${h.handle ? ` · "${esc(h.handle)}"` : ""}</b><span class="small">Held ${fmtShort(h.created_at)}: ${esc(h.reason || "")}.</span>
        <div class="row"><button class="btn dark grow" data-act="decide" data-id="${esc(h.id)}" data-ok="1">Approve</button><button class="btn danger grow" data-act="decide" data-id="${esc(h.id)}" data-ok="0">Reject</button></div></div>`).join("")
      : `<p class="small">Nobody is waiting.</p>`;
    const flagged = a.flagged.length ? `<section class="card"><h2>Held out of the community view</h2>${a.flagged.map((x) => `<div class="row"><span class="grow">${esc(x.handle || x.email)}</span><button class="btn" data-act="unflag" data-id="${esc(x.id)}">Let back in</button></div>`).join("")}</section>` : "";
    const pct = c.claude_monthly_cap ? Math.min(100, a.month_reads / c.claude_monthly_cap * 100) : 0;
    return `<div class="stack"><h1>Admin</h1><p class="muted">Only you see this page. ${a.owners} owner${a.owners === 1 ? "" : "s"} · ${a.joined_month} joined this month</p></div>
      <section class="card" style="${a.held.length ? "background:var(--danger-bg);border-color:var(--danger)" : ""}"><h2>Waiting for you · ${a.held.length}</h2>${held}</section>
      ${flagged}
      <section class="card list"><h2 style="padding-top:10px">Sign-up record</h2>${a.log.length ? a.log.map((l) => `<div class="item" style="cursor:default"><span class="t">${esc(l.email)}</span><span class="r"><span class="chip ${tone[l.decision][0]}">${tone[l.decision][1]}</span></span><span class="d">${fmtShort(l.created_at)} · ${esc(l.reason)}</span><span></span></div>`).join("") : `<p class="small muted" style="padding-bottom:10px">No sign-ups yet.</p>`}</section>
      <section class="dark"><h2>Receipt budget · this month</h2><div class="head"><span class="big" style="font:700 30px/1 var(--display)">${a.month_reads} of ${miles(c.claude_monthly_cap || 0)}</span><span class="small soft">Claude reads · about $${(a.month_reads * 0.0005).toFixed(2)}</span></div>
        <div class="bar"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div><p class="small soft">Each owner gets ${c.claude_daily_per_user} Claude reads a day. At the monthly cap, everyone falls back to phone reading.</p></section>
      <form class="card" data-form="saveRules" novalidate><h2>Rules</h2>
        <div class="grid2"><label class="field" for="r-h">Hold after (sign-ups per hour)<input id="r-h" type="number" value="${c.pace_per_hour}"></label><label class="field" for="r-d">Hold after (per day)<input id="r-d" type="number" value="${c.pace_per_day}"></label>
          <label class="field" for="r-u">Claude reads per owner per day<input id="r-u" type="number" value="${c.claude_daily_per_user}"></label><label class="field" for="r-m">Claude reads per month, everyone<input id="r-m" type="number" value="${c.claude_monthly_cap}"></label></div>
        <label class="check" for="r-hold"><input id="r-hold" type="checkbox" ${c.hold_all ? "checked" : ""}>Hold every new sign-up for now</label>
        <button class="btn" type="submit">Save rules</button></form>
      <section class="card"><h2>Warnings</h2>${a.alerts.length ? a.alerts.map((x) => `<p class="small"><b>${fmtShort(x.created_at)}</b> · ${esc(x.message)} <span class="muted">${x.emailed_at ? "Emailed." : x.email_error ? "Not emailed: " + esc(x.email_error) : "Sending…"}</span></p>`).join("") : `<p class="small muted">No warnings.</p>`}
        <p class="small muted">Emailed to ${esc(c.admin_email)} from ${esc(c.mail_from)}.</p></section>`;
  }

  // ---------- events ----------
  const ACT = {
    target: async (el) => { const s = { ...S.settings }; s.target = Math.max(30, Math.min(C.maxTarget(s), s.target + Number(el.dataset.d))); S.settings = C.withDefaults(s); $("#tgt").textContent = "E" + s.target; renderReadout(); clearTimeout(ACT._t); ACT._t = setTimeout(() => saveSettings(S.settings), 800); },
    which: (el) => { S.pump.which = el.dataset.w; document.querySelectorAll('[data-act="which"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.w === S.pump.which))); renderReadout(); },
    logPlan: () => { S.form = newForm(true); go("log"); },
    addStop: () => { S.form.stops.push(blankStop("gas")); renderStops(); },
    removeStop: (el) => { S.form.stops.splice(Number(el.dataset.i), 1); renderStops(); },
    stopKind: (el) => { const st = S.form.stops[Number(el.dataset.i)]; st.kind = el.dataset.k; if (st.kind === "e85" && !st.station) st.station = S.settings.primaryE85; if (st.kind === "gas" && !st.station) st.station = S.settings.primaryGas; renderStops(); },
    scan: (el) => { const inp = $("#ph" + el.dataset.i); if (inp) inp.click(); },
    claudeRead: (el) => claudeRead(Number(el.dataset.i)),
    cancelFill: () => { S.form = null; go("history"); },
    askDeleteFill: () => { S.form.confirmDelete = true; render(); },
    keepFill: () => { S.form.confirmDelete = false; render(); },
    deleteFill: async () => { const { error } = await sb.from("fills").delete().eq("id", S.form.id); if (error) { S.form.error = "Couldn't delete. Try again."; return render(); } S.form = null; S.flash = "Fill deleted."; await reloadFills(); refreshLearning(); go("history"); },
    editFill: (el) => { const f = S.fills.find((x) => x.id === el.dataset.id); if (f) { S.form = editForm(f); go("log"); } },
    days: (el) => { S.communityDays = Number(el.dataset.d) || 0; S.community = null; render(); loadCommunity(); },
    editOil: (el) => { const o = S.oil.find((x) => x.id === el.dataset.id); if (!o) return; const common = [...C.COMMON_OILS, ...oilChoices().mine]; S.oilForm = { id: o.id, date: o.date, odometer: String(o.odometer), oil: common.includes(o.oil_type) ? o.oil_type : "__custom", customOil: !common.includes(o.oil_type), oilOwn: o.oil_type, filter: o.filter_type || C.FACTORY_FILTER, notes: o.notes || "", error: "", confirmDelete: false }; render(); window.scrollTo(0, 0); },
    cancelOil: () => { S.oilForm = null; render(); },
    askDeleteOil: () => { S.oilForm.confirmDelete = true; render(); },
    keepOil: () => { S.oilForm.confirmDelete = false; render(); },
    deleteOil: async () => { await sb.from("oil_changes").delete().eq("id", S.oilForm.id); S.oilForm = null; await reloadFills(); render(); },
    askReset: () => { S.confirmReset = true; render(); },
    cancelReset: () => { S.confirmReset = false; render(); },
    resetLearn: async () => { await sb.from("profiles").update({ learn_since: today() }).eq("id", S.user.id); S.profile.learn_since = today(); S.confirmReset = false; S.flash = "Your car's learning starts over from today."; refreshLearning(); render(); },
    set: (el) => { S.carForm[el.dataset.k] = el.dataset.v; if (el.dataset.k === "tuneLimit") S.carForm.target = Math.min(Number(S.carForm.target), C.maxTarget({ tuneLimit: Number(String(el.dataset.v).replace("ns", "")) })); render(); },
    carTarget: (el) => { const f = S.carForm; f.target = Math.max(30, Math.min(C.maxTarget({ tuneLimit: Number(String(f.tuneLimit).replace("ns", "")) }), Number(f.target) + Number(el.dataset.d))); render(); },
    decide: async (el) => { await sb.rpc("admin_decide", { p_user: el.dataset.id, p_approve: el.dataset.ok === "1" }); loadAdmin(); },
    unflag: async (el) => { await sb.rpc("admin_unflag", { p_user: el.dataset.id }); loadAdmin(); },
    recheck: async () => { const { data } = await sb.from("profiles").select("*").eq("id", S.user.id).single(); if (data) { S.profile = data; if (approved()) await loadAll(); } render(); },
    resend: () => { S.signin.step = "email"; render(); },
    otherEmail: () => { S.signin = { ...S.signin, step: "email", email: "", code: "", error: "" }; render(); },
    signOut: async () => { await sb.auth.signOut(); },
  };
  document.addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (!el) return; e.preventDefault(); const fn = ACT[el.dataset.act]; if (fn) fn(el, e); });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.pump) { S.pump[el.dataset.pump] = el.value; renderReadout(); return; }
    if (el.dataset.f && S.form) { S.form[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; return; }
    if (el.dataset.s && S.form) {
      const i = Number(el.dataset.i), st = S.form.stops[i], k = el.dataset.s;
      st[k] = el.value; if (st.hl[k]) { delete st.hl[k]; el.classList.remove("hl", "missing"); }
      if (k === "total") st.totalManual = el.value.trim() !== "";
      if ((k === "gallons" || k === "price") && !st.totalManual) { const g = num(st.gallons), p = num(st.price); st.total = g !== null && p !== null ? (Math.round(g * p * 100) / 100).toFixed(2) : ""; const t = $("#to" + i); if (t) t.value = st.total; }
      updateSummary(); return;
    }
    if (el.dataset.o && S.oilForm) { S.oilForm[el.dataset.o] = el.value; return; }
    if (el.dataset.c && S.carForm) { S.carForm[el.dataset.c] = el.type === "checkbox" ? el.checked : el.value; }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.photo !== undefined && el.files && el.files[0]) { const file = el.files[0]; el.value = ""; scanReceipt(Number(el.dataset.photo), file); return; }
    if (el.dataset.s === "grade" && S.form) { S.form.stops[Number(el.dataset.i)].grade = Number(el.value); renderStops(); return; }
    if (el.dataset.o === "oil" && S.oilForm) { S.oilForm.customOil = el.value === "__custom"; S.oilForm.oil = el.value; render(); return; }
    if (el.dataset.o === "filter" && S.oilForm) { S.oilForm.customFilter = el.value === "__custom"; S.oilForm.filter = el.value; render(); return; }
    if (el.type === "radio" && el.dataset.c && S.carForm) { S.carForm[el.dataset.c] = el.value; return; }
    if (el.type === "checkbox" && el.dataset.c && S.carForm) { S.carForm[el.dataset.c] = el.checked; return; }
    if (el.type === "checkbox" && el.dataset.f && S.form) S.form[el.dataset.f] = el.checked;
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-form]"); if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
    try {
      const k = form.dataset.form;
      if (k === "sendCode") await sendCode($("#email").value);
      else if (k === "verifyCode") await verifyCode($("#code").value);
      else if (k === "saveFill") await saveFill();
      else if (k === "saveOil") await saveOil();
      else if (k === "saveCar") await saveCar();
      else if (k === "saveRules") {
        const v = (id) => Number($(id).value);
        await sb.rpc("admin_update_config", { p_pace_hour: v("#r-h"), p_pace_day: v("#r-d"), p_hold_all: $("#r-hold").checked, p_daily: v("#r-u"), p_monthly: v("#r-m") });
        S.flash = "Rules saved."; await loadAdmin();
      }
    } finally { if (btn && btn.isConnected) btn.disabled = false; }
  });
  window.addEventListener("online", () => { S.offline = false; render(); });
  window.addEventListener("offline", () => { S.offline = true; render(); });

  // ---------- start ----------
  sb.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    const changed = (user && user.id) !== (S.user && S.user.id);
    S.user = user;
    if (!user) { Object.assign(S, { profile: null, fills: [], oil: [], car: null, myStations: [], stations: [], form: null, oilForm: null, carForm: null, admin: null, community: null }); S.ready = true; render(); return; }
    if (changed) {
      setTimeout(async () => {
        await loadAll();
        S.ready = true;
        sb.rpc("register_device", { p_device: deviceId, p_agent: navigator.userAgent.slice(0, 200) });
        route();
      }, 0);
    }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) { S.ready = true; render(); } });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
})();
