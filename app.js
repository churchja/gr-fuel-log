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
    pump: { dte: "", sensor: "", which: "primary", other: null },
    known: [], picker: null, loc: null, geoPerm: "unknown", stationId: null, stationDetail: null, pumpSuggest: null,
    form: null, oilForm: null, carForm: null,
    signin: { step: "email", email: store.get("last-email") || "", code: "", error: "", busy: false, captcha: "" },
  };
  const isAdmin = () => !!(S.profile && S.profile.is_admin);
  const approved = () => !!(S.profile && S.profile.status === "approved");
  const needsSetup = () => approved() && !S.settings.setupDone && !S.settings.primaryE85 && S.fills.length === 0 && !S.setupDone;

  // ---------- data ----------
  async function loadAll() {
    const uid = S.user.id;
    const [p, f, o, c, ms, st, q, kn] = await Promise.all([
      sb.from("profiles").select("*").eq("id", uid).single(),
      sb.from("fills").select("*").order("date").order("odometer"),
      sb.from("oil_changes").select("*").order("date"),
      sb.from("car_model").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("my_stations").select("*"),
      sb.from("station_estimates").select("*"),
      sb.rpc("receipt_quota"),
      sb.rpc("stations_known", { p_lat: null, p_lon: null }),
    ]);
    S.profile = p.data || null;
    S.settings = C.withDefaults(S.profile && S.profile.settings);
    S.fills = f.data || []; S.oil = o.data || []; S.car = c.data || null; S.myStations = ms.data || []; S.stations = st.data || []; S.quota = q.data || null; S.known = kn.data || [];
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
  const VIEWS = ["pump", "log", "history", "community", "more", "oil", "learned", "car", "admin", "station"];
  function go(view) { if (location.hash !== "#" + view) location.hash = view; else { S.view = view; render(); } }
  function route() {
    let v = location.hash.replace("#", "") || "pump";
    if (!VIEWS.includes(v)) v = "pump";
    if (v === "admin" && !isAdmin()) v = "more";
    if (v === "station" && !S.stationId) v = "community";
    S.view = v; S.picker = null;
    if (v === "log" && !S.form) S.form = newForm();
    if (v === "community" && !S.community) loadCommunity();
    if (v === "admin") loadAdmin();
    if (v === "car") S.carForm = null;
    if (v === "station" && !S.stationDetail) loadStation();
    if (v === "pump" && approved()) maybeSuggest();
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
    else if (S.picker) html = vPicker();
    else if (needsSetup()) html = vCar(true);
    else html = banners() + ({ pump: vPump, log: vLog, history: vHistory, community: vCommunity, more: vMore, oil: vOil, learned: vLearned, car: () => vCar(false), admin: vAdmin, station: vStation }[S.view])();
    document.body.classList.toggle("signin", !S.user || (S.profile && S.profile.status !== "approved"));
    app.innerHTML = html;
    $("#tabs").hidden = !(S.user && approved() && !needsSetup() && !S.picker);
    if (!$("#tabs").hidden) renderTabs();
    if (!S.user) mountTurnstile();
    if (S.view === "pump" && approved() && !S.picker) renderReadout();
  }
  function renderTabs() {
    const tab = { pump: "pump", log: "log", history: "history", community: "community", station: "community" }[S.view] || "more";
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
    if (!$("#bot-check") || !CFG.turnstileSiteKey) return;
    const ready = () => window.turnstile && typeof window.turnstile.render === "function";
    // Draw into whichever box is on screen when the script is ready; the page may have redrawn while it loaded.
    const draw = () => {
      const el = $("#bot-check");
      if (!el || !ready() || el.dataset.drawn) return;
      el.dataset.drawn = "1";
      window.turnstile.render(el, { sitekey: CFG.turnstileSiteKey, theme: "auto", callback: (t) => { S.signin.captcha = t; }, "expired-callback": () => { S.signin.captcha = ""; } });
    };
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
            <button type="button" data-act="which" data-w="primary" aria-pressed="${S.pump.which === "primary"}">${s.primaryE85 ? esc(s.primaryE85) : "Choose primary station"}</button>
            <button type="button" data-act="which" data-w="other" aria-pressed="${S.pump.which === "other"}">${S.pump.other ? esc(S.pump.other.name) : "Other station"}</button>
          </div>
          ${S.pumpConfirm ? (() => { const n = S.pumpConfirm === "primary" ? s.primaryE85 : S.pump.other ? S.pump.other.name : ""; return `<div class="confirm" role="alert"><span class="grow">Remove ${esc(n)} ${S.pumpConfirm === "primary" ? "as your primary E85 station" : "from this plan"}? You'll choose a station again.</span><button type="button" class="btn danger" data-act="pumpRemove">Remove</button><button type="button" class="btn" data-act="pumpKeep">Keep</button></div>`; })()
            : s.primaryE85 || S.pump.other ? `<p class="small muted">Double-tap a station to remove it.</p>` : ""}
          ${S.pump.which === "other" ? `<button type="button" class="link" data-act="pickOther" style="justify-self:start">${S.pump.other ? "Change station" : "Choose the station"}</button>` : ""}
          ${s.primaryE85 && !s.primaryE85Id ? `<p class="small muted">Your primary station isn't matched to the shared station list yet. <a class="link" href="#car">Match it</a> so members' data lines up.</p>` : ""}</div>
        <p class="small muted">Gas: ${esc(s.primaryGas || "your gas station")} · ${s.ethanolFree ? "ethanol-free " : ""}${s.gasGrade} octane (E${C.gasEthanol(s)})</p>
      </section>
      <div id="pumpSuggest">${suggestHtml()}</div>
      <section class="dark readout" id="readout" aria-live="polite"></section>
      <div id="planWarn" class="gap"></div>
      <button class="btn primary full" id="logPlan" data-act="logPlan" disabled>Log this fill</button>`;
  }
  function currentPlan() {
    const s = S.settings, dte = num(S.pump.dte), sensor = num(S.pump.sensor);
    const as = C.e85Assumption({ which: S.pump.which, other: S.pump.other, settings: s, myStations: S.myStations, stations: S.stations, car: S.car, today: today() });
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
    return { kind, station: kind === "e85" ? s.primaryE85 : kind === "gas" ? s.primaryGas : "", station_id: kind === "e85" ? s.primaryE85Id : kind === "gas" ? s.primaryGasId : "", grade: s.gasGrade, ethanol: kind === "gas" ? null : "", fuelName: "",
      gallons: "", price: "", total: "", totalManual: false, note: "", noteKind: "", hl: {}, image: null, offerClaude: false, busy: false };
  }
  function newForm(fromPlan) {
    const s = S.settings;
    const f = { id: null, date: today(), odometer: "", dte: "", sensor_before: "", sensor_after: "", full: true, notes: "", target: s.target, plan: null, stops: [blankStop("e85"), blankStop("gas")], confirmDelete: false, error: "" };
    if (fromPlan) {
      const { as, p, dte, sensor } = currentPlan();
      if (p) { f.dte = String(dte); f.sensor_before = String(sensor); f.plan = { e85: p.e85gal, predicted: C.r1(p.predicted), e85Assumed: Math.round(as.value) }; f.stops[0].note = `Plan: ${p.e85gal.toFixed(1)} gal of E85, then fill to full with gas.`; }
      if (S.pump.which === "other") { f.stops[0].station = S.pump.other ? S.pump.other.name : ""; f.stops[0].station_id = S.pump.other ? S.pump.other.id : ""; }
    }
    return f;
  }
  function editForm(fill) {
    return { id: fill.id, date: fill.date, odometer: String(fill.odometer ?? ""), dte: fill.dte ?? "", sensor_before: fill.sensor_before ?? "", sensor_after: fill.sensor_after ?? "",
      full: fill.full !== false, notes: fill.notes || "", target: fill.target ?? S.settings.target, plan: fill.plan || null, confirmDelete: false, error: "",
      stops: (fill.stops || []).map((st) => ({ ...blankStop(st.kind || "e85"), ...st, gallons: st.gallons ?? "", price: st.price ?? "", total: st.total ?? "", ethanol: st.ethanol ?? (st.kind === "gas" ? null : ""), totalManual: st.total !== null && st.total !== undefined, note: "", noteKind: "", hl: {}, image: null })) };
  }
  // The most recent fill, so a new fill can show the last odometer reading.
  function lastFill() {
    return [...S.fills].filter((x) => num(x.odometer) !== null).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.odometer) - Number(b.odometer)).pop() || null;
  }
  function odoHint() {
    const f = S.form, last = lastFill();
    if (!f || f.id || !last) return { text: "", warn: false };
    const at = `${miles(last.odometer)} mi on ${fmtShort(last.date)}`, odo = num(f.odometer);
    if (odo === null) return { text: `Last fill: ${at}.`, warn: false };
    if (odo <= Number(last.odometer)) return { text: `That's not more than your last fill (${at}). Check the reading.`, warn: true };
    return { text: `${miles(odo - Number(last.odometer))} mi since your last fill (${at}).`, warn: false };
  }
  function updateOdoHint() { const el = $("#f-odo-hint"); if (!el) return; const h = odoHint(); el.textContent = h.text; el.className = h.warn ? "small note-warn" : "small muted"; }
  function vLog() {
    const f = S.form;
    return `<header class="head"><h1>${f.id ? "Edit fill" : "Log a fill"}</h1><span class="chip target">Target E${esc(f.target)}</span></header>
      <form class="gap" data-form="saveFill" novalidate>
        <section class="card">
          <div class="grid2">
            <label class="field" for="f-date">Date<input id="f-date" type="date" data-f="date" value="${esc(f.date)}" required></label>
            <label class="field" for="f-odo">Odometer<input id="f-odo" type="number" inputmode="decimal" data-f="odometer" value="${esc(f.odometer)}"${!f.id && lastFill() ? ` placeholder="Last: ${miles(lastFill().odometer)}"` : ""} aria-describedby="f-odo-hint"></label>
          </div>
          ${(() => { const h = odoHint(); return h.text ? `<p id="f-odo-hint" class="small ${h.warn ? "note-warn" : "muted"}" aria-live="polite">${esc(h.text)}</p>` : `<p id="f-odo-hint" class="small muted" aria-live="polite"></p>`; })()}
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
      <div class="field"><span id="stl${i}">Station</span><button type="button" id="st${i}" class="pickbtn ${hl("station")}" data-act="pickStation" data-i="${i}" aria-labelledby="stl${i} st${i}"><span class="stack" style="gap:2px;min-width:0">${st.station ? esc(st.station) : `<span class="muted">Choose station</span>`}${st.station && !st.station_id ? `<span class="small muted">Not matched to the shared list. Tap to match it.</span>` : ""}</span>${icon("chevron", 18)}</button></div>
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
      if (st.station_id) out.station_id = st.station_id;
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
    if (r.station) {
      if (!st.station_id) { const m = matchKnown(r.station); if (m) { st.station = m.name; st.station_id = m.id; } else st.station = matchStation(r.station); }
      st.hl.station = 1; filled.push("station");
    }
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
      <p class="small muted">Tap a fill to edit or delete it.</p>
      <section class="card list">${[...rows].reverse().map((r) => `<button type="button" class="item" data-act="editFill" data-id="${esc(r.f.id)}">
          <span class="t">${fmtDate(r.f.date)}</span><span class="r"><span class="chip ${r.band}">${r.blend === null ? "no reading" : `E${C.r1(r.blend)} · ${label[r.band]}`}</span></span>
          <span class="d num">${miles(r.f.odometer)} mi · ${r.t.e85 ? r.t.e85.toFixed(2) + " E85" : ""}${r.t.gas ? " + " + r.t.gas.toFixed(2) + " gas" : ""}${r.t.other ? " + " + r.t.other.toFixed(2) + " other" : ""}</span>
          <span class="d r num">${money(r.t.cost)}${r.cpm ? " · $" + r.cpm.toFixed(3) + "/mi" : ""}</span></button>`).join("")}</section>`;
  }

  // ---------- community ----------
  async function loadCommunity() {
    const [{ data }] = await Promise.all([sb.rpc("community_stats", { p_days: S.communityDays || null }), loadKnown()]);
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
      : `<p class="soft">No station has a measured E85 strength yet. It's worked out from fills with flex sensor readings before and after.</p>`;
    const blends = c.blends.length ? `<table><thead><tr><th>Blend</th><th class="n">$/mile</th><th class="n">MPG</th><th class="n">Fills</th></tr></thead><tbody>${c.blends.map((b) => `<tr><td>${esc(b.label)}</td><td class="n">$${Number(b.cpm).toFixed(3)}</td><td class="n">${b.mpg ?? "—"}</td><td class="n">${b.n}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">Shows once a blend range has fills from 2 or more owners.</p>`;
    const grades = c.grades.length ? `<div class="grid3">${c.grades.map((g) => `<div class="stat"><b style="font-size:22px">$${Number(g.cpm).toFixed(3)}</b><span>${esc(g.grade)} octane</span></div>`).join("")}</div>` : `<p class="muted small">Shows once a grade has fills from 2 or more owners.</p>`;
    const known = S.known || [];
    const shown = S.allStations ? known : known.slice(0, 8);
    const stationList = `<section class="card list"><h2 style="padding-top:10px">Stations members use</h2>${known.length ? shown.map((k) => stationRow(k, "openStation")).join("") : `<p class="small muted" style="padding-bottom:10px">Stations show up here once a member logs a fill there.</p>`}
      ${known.length > shown.length ? `<button type="button" class="link" data-act="allStations" style="padding-bottom:12px">Show all ${known.length}</button>` : ""}</section>`;
    return head + stationList + `<section class="dark"><h2>Real E85 strength by station</h2>${stations}<p class="small dim">Bar runs from E50 to E85. Grey tick: the reading before the last blend switch.</p></section>
      <section class="card"><h2>Cost per mile by blend</h2>${blends}</section>
      <section class="card"><h2>Cost per mile by gas grade</h2>${grades}${c.on_target !== null && c.on_target !== undefined ? `<p><b>${c.on_target}%</b> of shared fills landed within 3 points of their owner's target.</p>` : ""}</section>
      <section class="card" style="background:var(--sunken)"><p class="small"><b>${S.settings.share ? "Your fills are shared." : "Your fills are private."}</b> Only the month, station, blend, E85 strength, mpg, cost per mile and pump prices leave a log. Stations show their name and address, but never who fills there.</p><a href="#car" class="link">Change sharing</a></section>`;
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
      const isPrimary = C.keyFor(s.primaryE85Id, s.primaryE85) === m.station_key;
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
    const pickField = (label, key, kind, id) => `<div class="field"><span id="${id}-l">${label}</span><button type="button" id="${id}" class="pickbtn" data-act="pickPrimary" data-p="${kind}" aria-labelledby="${id}-l ${id}"><span class="stack" style="gap:2px;min-width:0">${f[key] ? esc(f[key]) : `<span class="muted">Choose station</span>`}${f[key] && !f[key + "Id"] ? `<span class="small muted">Not matched to the shared list yet. Tap to match it.</span>` : ""}</span>${icon("chevron", 18)}</button>${f[key] && !first ? `<button type="button" class="link" data-act="clearPrimary" data-k="${key}" style="justify-self:start">Remove</button>` : ""}</div>`;
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
          ${pickField("Primary E85 station", "primaryE85", "e85", "c-e85")}
          ${pickField("Primary gas station", "primaryGas", "gas", "c-gas")}
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
        ${first ? "" : `<section class="card"><h2>Your data</h2><p class="small muted">To delete one fill, open it from History. To delete one oil change, open it from Oil changes. Or remove everything you've logged:</p>
          ${S.confirmWipe ? `<div class="confirm"><span class="grow">Delete all ${S.fills.length} fill${S.fills.length === 1 ? "" : "s"} and ${S.oil.length} oil change${S.oil.length === 1 ? "" : "s"} for good? This can't be undone.</span><button type="button" class="btn danger" data-act="wipeLogs">Delete all</button><button type="button" class="btn" data-act="keepLogs">Keep them</button></div>`
            : `<button type="button" class="btn danger" data-act="askWipe" ${S.fills.length + S.oil.length ? "" : "disabled"}>Delete all my fills and oil changes</button>`}</section>`}
        ${f.error ? `<p class="note-err" role="alert">${esc(f.error)}</p>` : ""}
        <button class="btn primary full" type="submit">${first ? "Save and start" : "Save"}</button>
      </form>`;
  }
  async function saveSettings(settings, handle) {
    // Once past first-time setup, mark it done, so clearing a primary later never sends you back to it.
    const patch = { settings: needsSetup() ? { ...settings } : { ...settings, setupDone: true } };
    if (handle !== undefined) patch.handle = handle || null;
    const { error } = await sb.from("profiles").update(patch).eq("id", S.user.id);
    if (!error) { S.settings = C.withDefaults(patch.settings); S.profile = { ...S.profile, ...patch }; }
    return !error;
  }
  async function saveCar() {
    const f = S.carForm; f.error = "";
    const s = { ...S.settings };
    for (const k of ["target", "tuneLimit", "gasGrade", "oilMiles", "oilMonths"]) s[k] = Number(String(f[k]).replace("ns", ""));
    s.tuneLimitNotSure = String(f.tuneLimit) === "50ns";
    Object.assign(s, { ethanolFree: !!f.ethanolFree, primaryE85: String(f.primaryE85 || "").trim(), primaryGas: String(f.primaryGas || "").trim(), receiptMode: f.receiptMode, share: !!f.share });
    s.primaryE85Id = s.primaryE85 ? String(f.primaryE85Id || "") : ""; s.primaryGasId = s.primaryGas ? String(f.primaryGasId || "") : "";
    if (!s.primaryE85 && needsSetup()) { f.error = "Choose the station where you usually buy E85."; return render(); }
    s.setupDone = true;
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

  // ---------- undo bar ----------
  function toast(text, actLabel, fn) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    clearTimeout(toast.t); toast.fn = fn || null;
    el.innerHTML = `<span>${esc(text)}</span>${actLabel ? `<button type="button" class="link" data-act="toastAct">${esc(actLabel)}</button>` : ""}`;
    el.hidden = false;
    toast.t = setTimeout(() => { el.hidden = true; toast.fn = null; }, 10000);
  }

  // ---------- stations ----------
  // One shared record per station, named Brand · Street. A station shows up for every member once a member who
  // shares has logged a fill there. The phone's location only sorts stations and spots duplicates; fills never store it.
  const BRANDS = ["7-Eleven", "BP", "Buc-ee's", "Casey's", "Chevron", "Circle K", "Citgo", "Costco", "Exxon", "Flying J", "GetGo", "Holiday", "Huck's", "Hy-Vee", "Kroger", "Kum & Go", "Kwik Trip", "Love's", "Marathon", "Maverik", "Meijer", "Mobil", "MotoMart", "Murphy USA", "Phillips 66", "Pilot", "QuikTrip", "RaceTrac", "Sam's Club", "Sheetz", "Shell", "Speedway", "Sunoco", "Thorntons", "Valero", "Walmart", "Wawa"];
  const distTxt = (m) => (m === null || m === undefined ? "" : m < 160 ? `${Math.max(10, Math.round((m * 3.281) / 10) * 10)} ft` : `${(m / 1609.34).toFixed(m < 16000 ? 1 : 0)} mi`);
  const monthTxt = (ym) => { if (!ym) return ""; const [y, m] = String(ym).split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
  const previewName = (f) => [String(f.brand || "").trim() || "Brand", String(f.street || "").trim()].filter(Boolean).join(" · ");
  function watchGeoPermission() {
    try { navigator.permissions.query({ name: "geolocation" }).then((p) => { S.geoPerm = p.state; p.onchange = () => { S.geoPerm = p.state; }; }, () => {}); } catch { /* not supported */ }
  }
  function locate() {
    return new Promise((resolve, reject) => {
      if (S.loc && Date.now() - S.loc.at < 120000) return resolve(S.loc);
      if (!navigator.geolocation) return reject({ code: 0 });
      navigator.geolocation.getCurrentPosition((p) => { S.loc = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() }; resolve(S.loc); }, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }
  async function loadKnown() {
    const { data, error } = await sb.rpc("stations_known", { p_lat: S.loc ? S.loc.lat : null, p_lon: S.loc ? S.loc.lon : null });
    if (!error) S.known = data || [];
    return !error;
  }
  function fuelChips(c, max = 3) {
    return (c.fuels || []).slice(0, max).map((f) => `<span class="chip ${f.fuel === "E85" ? "on" : "none"}">${esc(f.fuel.replace(" octane", ""))}${f.price ? ` · $${Number(f.price).toFixed(2)}` : ""}</span>`).join("");
  }
  function stationRow(c, act) {
    const sub = [[c.city, c.state].filter(Boolean).join(", "), c.members ? `${c.members} member${c.members === 1 ? "" : "s"}` : "", c.mine ? "you've used it" : ""].filter(Boolean).join(" · ");
    const listed = c.listed && c.listed.e85 && !(c.fuels || []).some((f) => f.fuel === "E85") ? `<span class="chip none">E85 listed</span>` : "";
    const e85 = c.e85 ? `<span class="chip target">E${Math.round(c.e85.value)}</span>` : listed;
    return `<button type="button" class="srow" data-act="${act}" data-id="${esc(c.id)}"><span class="stack" style="gap:4px;min-width:0"><b>${esc(c.name)}</b>${sub ? `<span class="small muted">${esc(sub)}</span>` : ""}${e85 || (c.fuels || []).length ? `<span class="badges">${e85}${fuelChips(c)}</span>` : ""}</span><span class="dist">${distTxt(c.distance_m)}</span></button>`;
  }
  function candRow(x) {
    const where = [[x.city, x.state].filter(Boolean).join(", "), x.known ? "members use it" : x.e85_listed ? "on the U.S. DOE E85 list" : "on the map", x.standardized ? "" : "you'll confirm the name"].filter(Boolean).join(" · ");
    return `<button type="button" class="srow" data-act="pickerChoose" data-id="${esc(x.id)}"><span class="stack" style="gap:4px;min-width:0"><b>${esc(x.name)}</b><span class="small muted">${esc(where)}</span></span><span class="dist">${distTxt(x.distance_m)}</span></button>`;
  }
  async function lookup(p) {
    const q = String(p.lq || "").trim();
    if (q.length < 3) { p.lookup = null; return renderPicker(); }
    p.lookBusy = true; renderPicker();
    const { data } = await sb.rpc("stations_lookup", { p_q: q, p_lat: S.loc ? S.loc.lat : null, p_lon: S.loc ? S.loc.lon : null });
    if (S.picker !== p || String(p.lq || "").trim() !== q) return;
    p.lookBusy = false; p.lookup = data || []; renderPicker();
  }
  function matchKnown(text) {
    const words = C.stationKey(text).split(" ").filter((w) => w.length > 2);
    const hits = (S.known || []).filter((c) => words.some((w) => C.stationKey(`${c.brand || ""} ${c.name}`).split(" ").includes(w)));
    return hits.sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9) || b.members - a.members)[0] || null;
  }

  // The picker: choose a station members use, or add one in the standard Brand · Street form.
  function openPicker(target, kind) {
    S.picker = { target, kind, q: "", step: "list", busy: false, error: "", locState: S.loc && Date.now() - S.loc.at < 120000 ? "ok" : "idle", cands: null, mapNote: "", form: null, scrollY: window.scrollY };
    try { history.pushState({ picker: true }, ""); } catch { /* ignore */ }
    render(); window.scrollTo(0, 0);
    refreshKnown(S.picker, S.geoPerm === "granted" && S.picker.locState !== "ok");
  }
  async function refreshKnown(p, withLocation) {
    p.busy = true; renderPicker();
    if (withLocation) { try { await locate(); p.locState = "ok"; } catch (e) { p.locState = e && e.code === 1 ? "denied" : "error"; } }
    const ok = await loadKnown();
    if (S.picker !== p) return;
    p.busy = false; if (!ok) p.error = "Couldn't load stations. Check your connection and try again.";
    renderPicker();
  }
  function closePicker() {
    const p = S.picker; S.picker = null; render();
    if (p) window.scrollTo(0, p.scrollY || 0);
    try { if (history.state && history.state.picker) history.back(); } catch { /* ignore */ }
  }
  window.addEventListener("popstate", () => { if (S.picker) { const y = S.picker.scrollY; S.picker = null; render(); window.scrollTo(0, y || 0); } });
  function applyStation(label, id, created) {
    const t = S.picker.target;
    let restore = null;
    if (t.type === "stop" && S.form && S.form.stops[t.i]) {
      const form = S.form, st = form.stops[t.i], prev = { station: st.station, station_id: st.station_id };
      st.station = label; st.station_id = id; if (st.hl) delete st.hl.station;
      restore = () => { if (S.form === form && form.stops[t.i]) Object.assign(form.stops[t.i], prev); };
    } else if (t.type === "pumpOther") {
      const prev = { other: S.pump.other, which: S.pump.which };
      S.pump.other = { id, name: label }; S.pump.which = "other";
      restore = () => { S.pump.other = prev.other; S.pump.which = prev.which; };
    } else if ((t.type === "primaryE85" || t.type === "primaryGas") && S.carForm) {
      const cf = S.carForm, k = t.type, prev = { name: cf[k], id: cf[k + "Id"] };
      cf[k] = label; cf[k + "Id"] = id;
      restore = () => { if (S.carForm === cf) { cf[k] = prev.name; cf[k + "Id"] = prev.id; } };
    } else if (t.type === "primaryNow") {
      const prev = { name: S.settings.primaryE85, id: S.settings.primaryE85Id };
      saveSettings({ ...S.settings, primaryE85: label, primaryE85Id: id }); S.pump.which = "primary";
      restore = () => saveSettings({ ...S.settings, primaryE85: prev.name, primaryE85Id: prev.id }).then(render);
    }
    closePicker();
    toast(`Station set to ${label}.`, "Undo", async () => {
      if (restore) await restore();
      if (created) { const { error } = await sb.rpc("delete_station", { p_id: id }); if (!error) S.known = (S.known || []).filter((k) => k.id !== id); }
      render();
    });
  }
  function pickerChoose(id) {
    const p = S.picker;
    const c = [...(p.step === "list" ? S.known || [] : []), ...(p.lookup || []), ...(p.cands || []), ...(S.known || [])].find((x) => x.id === id);
    if (!c) return;
    if (!c.standardized) { p.from = p.step; p.step = "confirm"; p.error = ""; p.form = { id: c.id, brand: c.brand || "", street: c.street || "" }; render(); return; }
    applyStation(c.name, c.id);
  }
  function vPicker() {
    const p = S.picker;
    const what = p.kind === "e85" ? "E85 station" : p.kind === "gas" ? "Gas station" : "Station";
    return `<header class="head"><div class="stack"><span class="eyebrow">${p.step === "list" ? "Choose a station" : p.step === "confirm" ? "Confirm the name" : "Add a station"}</span><h1>${what}</h1></div><button type="button" class="btn" data-act="pickerClose">Close</button></header>
      ${p.step === "list" ? `<label class="field" for="pickQ">Search stations<input id="pickQ" type="search" autocomplete="off" value="${esc(p.q)}" placeholder="Brand, street or city"></label>` : ""}
      ${p.step === "add" ? `<label class="field" for="pickLookup">Search the E85 station list and map<input id="pickLookup" type="search" autocomplete="off" value="${esc(p.lq || "")}" placeholder="Brand, street, city or ZIP"></label>` : ""}
      <div id="pickBody" class="gap">${pickerBody()}</div>
      <p class="small muted">Your location only sorts stations and spots duplicates. It's never saved with a fill. E85 station list: U.S. DOE Alternative Fuels Data Center. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.</p>`;
  }
  function renderPicker() { if (!S.picker) return; const el = $("#pickBody"); if (el) el.innerHTML = pickerBody(); else render(); }
  function pickerBody() {
    const p = S.picker;
    if (p.step === "add") return addBody(p);
    if (p.step === "confirm") return `<p>This station doesn't have a standard name yet. Check the brand and street. Every member will see them.</p>${nameForm(p, "Confirm the name")}`;
    const q = C.stationKey(p.q);
    const hidden = S.settings.hiddenStations || [];
    const matches = (S.known || []).filter((c) => !q || C.stationKey([c.name, c.brand, c.street, c.city, c.state].join(" ")).includes(q));
    const list = matches.filter((c) => p.showHidden || !hidden.includes(c.id));
    const nHidden = matches.length - list.length;
    const loc = p.locState === "ok" ? "" : p.locState === "denied" ? `<p class="small muted">Location is off for this site, so stations are sorted by how many members use them.</p>`
      : `<button type="button" class="btn full" data-act="pickerLocate">Sort by distance from me</button>`;
    const head = list.length ? `<div class="head"><h2>${p.editing ? "Delete or hide stations" : "Stations"}</h2><button type="button" class="link" data-act="pickerEdit">${p.editing ? "Done" : "Edit"}</button></div>` : "";
    const foot = nHidden ? `<button type="button" class="link" data-act="pickerShowHidden">Show ${nHidden} hidden station${nHidden === 1 ? "" : "s"}</button>`
      : p.showHidden && hidden.length ? `<button type="button" class="link" data-act="pickerShowHidden">Hide them again</button>` : "";
    const tip = p.editing ? `<p class="small muted">Delete removes a station you added that no other member has used. Hide takes a station out of your app but other members still see it. Either way it comes off your pump plan and the fill you're logging, so you'll choose a station again. Tip: you can also swipe a station left.</p>` : "";
    const rows = list.length ? `${head}${tip}<div class="card list">${list.map((c) => pickRow(c, p, hidden)).join("")}</div>${foot}`
      : p.busy ? `<p class="small muted"><span class="spinner"></span> Loading stations…</p>`
      : `<p class="muted">${q ? "No station matches. Add it below." : "No stations yet. Add the one you're using."}</p>${foot}`;
    return `${p.error ? `<p class="note-err" role="alert">${esc(p.error)}</p>` : ""}${loc}${rows}<button type="button" class="btn dark full" data-act="pickerAdd">Add a station that isn't listed</button>`;
  }
  // One station in the picker. In Edit mode, or after a swipe left, it shows Delete (a station you added that
  // nobody else has used), Hide (any other station) or Unhide.
  function pickRow(c, p, hidden) {
    const isHidden = hidden.includes(c.id), open = p.editing || p.swiped === c.id;
    const act = isHidden ? ["pickerUnhide", "Unhide", ""] : c.can_delete ? ["pickerDelete", "Delete", "danger"] : ["pickerHide", "Hide", ""];
    const btn = open ? `<button type="button" class="btn ${act[2]} srow-act" data-act="${act[0]}" data-id="${esc(c.id)}" aria-label="${act[1]} ${esc(c.name)}">${act[1]}</button>` : "";
    return `<div class="srow-wrap${open ? " open" : ""}${isHidden ? " is-hidden" : ""}" data-swipe="${esc(c.id)}">${stationRow(c, "pickerChoose")}${btn}</div>`;
  }
  // Deleting waits for the Undo bar to time out, so Undo can bring the station back.
  const pendingDeletes = new Map();
  async function finishDelete(id) {
    const job = pendingDeletes.get(id); if (!job) return;
    pendingDeletes.delete(id); clearTimeout(job.timer);
    const { data, error } = await sb.rpc("delete_station", { p_id: id });
    if (error) { S.known = [...(S.known || [])]; S.known.splice(Math.min(job.index, S.known.length), 0, job.card); renderPicker(); toast(`Couldn't delete ${job.card.name}. Another member may have used it.`); return; }
    await afterStationDeleted(id);
    return data;
  }
  // Removing a station from your app also takes it off the pump plan (primary or other), the fill you're
  // logging and your primary settings, so you choose or add a station again. Saved fills keep the name.
  function detachStation(id) {
    const before = { other: S.pump.other, which: S.pump.which, stops: [], car: null };
    if (S.pump.other && S.pump.other.id === id) { S.pump.other = null; if (S.pump.which === "other") S.pump.which = "primary"; }
    if (S.form) S.form.stops.forEach((st, i) => { if (st.station_id === id) { before.stops.push([S.form, i, st.station, st.station_id]); st.station = ""; st.station_id = ""; } });
    if (S.carForm) {
      before.car = [S.carForm, { primaryE85: S.carForm.primaryE85, primaryE85Id: S.carForm.primaryE85Id, primaryGas: S.carForm.primaryGas, primaryGasId: S.carForm.primaryGasId }];
      for (const k of ["primaryE85", "primaryGas"]) if (S.carForm[k + "Id"] === id) { S.carForm[k] = ""; S.carForm[k + "Id"] = ""; }
    }
    const patch = {}, undoPatch = {};
    for (const k of ["primaryE85", "primaryGas"]) if (S.settings[k + "Id"] === id) { patch[k] = ""; patch[k + "Id"] = ""; undoPatch[k] = S.settings[k]; undoPatch[k + "Id"] = id; }
    return {
      patch, undoPatch,
      restore() {
        S.pump.other = before.other; S.pump.which = before.which;
        for (const [form, i, name, sid] of before.stops) if (form.stops[i]) { form.stops[i].station = name; form.stops[i].station_id = sid; }
        if (before.car && S.carForm === before.car[0]) Object.assign(S.carForm, before.car[1]);
      },
    };
  }
  async function afterStationDeleted(id) {
    detachStation(id);
    const { data: prof } = await sb.from("profiles").select("*").eq("id", S.user.id).single();
    if (prof) { S.profile = prof; S.settings = C.withDefaults(prof.settings); }
    await reloadFills(); refreshLearning(3000);
  }
  const flushDeletes = () => { for (const id of [...pendingDeletes.keys()]) finishDelete(id); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushDeletes(); });
  window.addEventListener("pagehide", flushDeletes);
  async function setHidden(id, hide) {
    const cur = new Set(S.settings.hiddenStations || []);
    if (hide) cur.add(id); else cur.delete(id);
    await saveSettings({ ...S.settings, hiddenStations: [...cur] });
  }
  // Swipe a station left to reveal its button; swipe right to close it.
  let swipe = null;
  document.addEventListener("touchstart", (e) => { const w = e.target.closest("[data-swipe]"); swipe = w && S.picker ? { id: w.dataset.swipe, x: e.touches[0].clientX, y: e.touches[0].clientY, done: false } : null; }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!swipe || swipe.done || !S.picker) return;
    const dx = e.touches[0].clientX - swipe.x, dy = e.touches[0].clientY - swipe.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipe.done = true; S.swipedAt = Date.now();
    S.picker.swiped = dx < 0 ? swipe.id : null; renderPicker();
  }, { passive: true });
  async function findCandidates(p) {
    p.locBusy = true; p.error = ""; renderPicker();
    try { await locate(); p.locState = "ok"; } catch (e) { p.locState = e && e.code === 1 ? "denied" : "error"; p.locBusy = false; return renderPicker(); }
    const near = async () => { const { data } = await sb.rpc("stations_at", { p_lat: S.loc.lat, p_lon: S.loc.lon, p_radius_m: 200 }); return data || []; };
    p.cands = await near(); p.locBusy = false; p.mapBusy = true; renderPicker();
    const r = await sb.functions.invoke("stations", { body: { lat: S.loc.lat, lon: S.loc.lon, radius: 1000 } });
    if (S.picker !== p) return;
    p.mapBusy = false;
    if (r.error || (r.data && r.data.error)) p.mapNote = "The map service didn't answer, so this list may be incomplete. You can still add the station below.";
    if (r.data && r.data.synced > 0) p.cands = await near();
    if (S.picker === p) renderPicker();
  }
  function addBody(p) {
    let top;
    if (String(p.lq || "").trim().length >= 3) {
      const l = p.lookup || [];
      top = p.lookBusy && !p.lookup ? `<p class="small muted"><span class="spinner"></span> Searching…</p>`
        : l.length ? `<h2>Matches</h2><div class="card list">${l.map(candRow).join("")}</div>` : `<p class="muted">Nothing matches. Add it below.</p>`;
    } else if (p.locState !== "ok") {
      top = p.locBusy ? `<p class="small muted"><span class="spinner"></span> Finding your location…</p>`
        : `<p>Search above, or if you're at the station, use your location to see what's on file right here.</p><button type="button" class="btn dark full" data-act="pickerHere">I'm at the station · use my location</button>${p.locState === "denied" ? `<p class="small muted">Location is off for this site. You can still add the station without it.</p>` : p.locState === "error" ? `<p class="small muted">Couldn't get your location. You can still add the station without it.</p>` : ""}`;
    } else {
      const c = p.cands || [];
      top = `${p.locBusy ? `<p class="small muted"><span class="spinner"></span> Looking nearby…</p>` : ""}
        ${c.length ? `<h2>Is it one of these?</h2><div class="card list">${c.map(candRow).join("")}</div>` : p.locBusy ? "" : `<p class="muted">No stations on file within 200 m of you.</p>`}
        ${p.mapBusy ? `<p class="small muted"><span class="spinner"></span> Checking the map around you…</p>` : ""}${p.mapNote ? `<p class="small muted">${esc(p.mapNote)}</p>` : ""}`;
    }
    if (!p.form || p.form.id) p.form = { id: null, brand: p.q || "", street: "" };
    return top + nameForm(p, p.locState === "ok" && (p.cands || []).length ? "Not listed? Add it" : "Add it");
  }
  function nameForm(p, title) {
    const f = p.form;
    const brands = [...new Set([...BRANDS, ...(S.known || []).map((c) => c.brand).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const where = f.id ? "" : p.locState === "ok" ? " at your current location" : ", without a location";
    return `<form class="card" data-form="pickSave" novalidate><h2>${esc(title)}</h2>
      <label class="field" for="pickBrand">Brand or station name<input id="pickBrand" type="text" list="brandList" maxlength="60" autocomplete="off" data-pk="brand" value="${esc(f.brand)}" placeholder="MotoMart, Casey's, Costco…"></label>
      <datalist id="brandList">${brands.map((b) => `<option value="${esc(b)}">`).join("")}</datalist>
      <label class="field" for="pickStreet">Street or road<input id="pickStreet" type="text" maxlength="80" autocomplete="off" data-pk="street" value="${esc(f.street)}" placeholder="E Lloyd Expy"></label>
      <p class="small muted">Saved as <b id="pickPreview">${esc(previewName(f))}</b>${where}. Every member sees this name once you log a fill there.</p>
      ${p.error ? `<p class="note-err" role="alert">${esc(p.error)}</p>` : ""}
      <div class="row"><button class="btn primary grow" type="submit">${f.id ? "Confirm and use" : "Add and use"}</button><button type="button" class="btn" data-act="pickerBack">Back</button></div></form>`;
  }
  async function pickerSave() {
    const p = S.picker, f = p.form; p.error = "";
    const brand = String(f.brand || "").trim(), street = String(f.street || "").trim();
    if (brand.length < 2) { p.error = "Enter the brand or station name."; return renderPicker(); }
    const at = p.locState === "ok" && S.loc;
    const res = f.id ? await sb.rpc("standardize_station", { p_id: f.id, p_brand: brand, p_street: street })
      : await sb.rpc("add_station", { p_brand: brand, p_street: street, p_lat: at ? S.loc.lat : null, p_lon: at ? S.loc.lon : null });
    if (S.picker !== p) return;
    if (res.error) { p.error = /too many/.test(res.error.message || "") ? "You've added 10 stations today. Try again tomorrow." : "Couldn't save the station. Check your connection and try again."; return renderPicker(); }
    const c = res.data, created = !f.id && c.source === "custom" && !(S.known || []).some((x) => x.id === c.id);
    S.known = [c, ...(S.known || []).filter((x) => x.id !== c.id)];
    applyStation(c.name, c.id, created);
  }

  // Station page: what members know about one station.
  function openStation(id) { S.stationId = id; S.stationDetail = null; S.stEdit = null; S.stConfirmDelete = false; go("station"); }
  async function saveStationName() {
    const se = S.stEdit, brand = String(se.brand || "").trim(), street = String(se.street || "").trim();
    if (brand.length < 2) { se.error = "Enter the brand or station name."; return render(); }
    const { data, error } = await sb.rpc("standardize_station", { p_id: S.stationId, p_brand: brand, p_street: street });
    if (error || !data) { se.error = "Couldn't save the name. Check your connection and try again."; return render(); }
    S.stEdit = null; S.known = (S.known || []).map((k) => (k.id === data.id ? { ...k, ...data, distance_m: k.distance_m } : k));
    const { data: prof } = await sb.from("profiles").select("*").eq("id", S.user.id).single();
    if (prof) { S.profile = prof; S.settings = C.withDefaults(prof.settings); }
    if (S.pump.other && S.pump.other.id === data.id) S.pump.other.name = data.name;
    await reloadFills(); S.flash = `Renamed to ${data.name}.`; S.stationDetail = null; await loadStation(); if (S.view !== "station") render();
  }
  async function loadStation() {
    const id = S.stationId; if (!id) return;
    const { data } = await sb.rpc("station_detail", { p_id: id, p_lat: S.loc ? S.loc.lat : null, p_lon: S.loc ? S.loc.lon : null });
    if (S.stationId !== id) return;
    S.stationDetail = data || { missing: true }; if (S.view === "station") render();
  }
  function priceSpark(rows) {
    if (rows.length < 2) return "";
    const v = rows.map((r) => Number(r.price)), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 0.1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * 296 + 2, 36 - ((y - lo) / span) * 30]);
    return `<svg class="spark" viewBox="0 0 300 40" preserveAspectRatio="none" role="img" aria-label="Price trend"><polyline points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>${pts.map((q) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.5" fill="currentColor"></circle>`).join("")}</svg>`;
  }
  function vStation() {
    const d = S.stationDetail;
    if (!d) return `<a class="link" href="#community">← Community</a><p class="muted">Loading station…</p>`;
    if (d.missing || !d.card) return `<a class="link" href="#community">← Community</a><p class="muted">This station isn't available.</p>`;
    const c = d.card;
    const addr = [c.street, [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    const fuels = c.fuels.length ? `<table><thead><tr><th>Fuel</th><th class="n">Latest price</th><th class="n">Last seen</th></tr></thead><tbody>${c.fuels.map((f) => `<tr><td>${esc(f.fuel)}</td><td class="n">${f.price ? `$${Number(f.price).toFixed(2)}<br><span class="small muted">${monthTxt(f.price_month)}</span>` : "—"}</td><td class="n">${monthTxt(f.last_month)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No fills logged here yet.</p>`;
    const e = c.e85;
    const e85 = e ? `<section class="dark"><h2>Real E85 strength</h2><span class="big" style="font:700 40px/1 var(--display)">E${Math.round(e.value)} <span style="font-size:22px">±${Math.max(1, Math.round(e.sd))}</span></span><p class="small soft">Measured from ${e.n} fill${e.n === 1 ? "" : "s"}${e.last_month ? `, latest ${monthTxt(e.last_month)}` : ""}.${e.switch_month ? ` Blend switch spotted ${monthTxt(e.switch_month)}, from E${e.switch_from} to E${e.switch_to}.` : ""}</p></section>`
      : c.fuels.some((f) => f.fuel === "E85") || (c.listed && c.listed.e85) ? `<section class="dark"><h2>Real E85 strength</h2><p class="small soft">Not measured yet. It's worked out from fills with flex sensor readings before and after filling.</p></section>` : "";
    const L = c.listed;
    const doe = L ? `<section class="card"><h2>U.S. DOE E85 list</h2>${L.e85 ? `<p>${L.status === "T" ? "<b>Listed as temporarily unavailable.</b> " : ""}Listed as selling E85${L.blender ? " from a blender pump" : ""}${(L.blends || []).length ? `, also ${esc(L.blends.join(", "))}` : ""}.</p>${L.hours ? `<p class="small muted">Hours: ${esc(L.hours)}</p>` : ""}${L.confirmed ? `<p class="small muted">Last confirmed by DOE ${monthTxt(L.confirmed)}.</p>` : ""}` : `<p>No longer on the DOE list.</p>`}
      <p class="small muted">Members' fills count for more than the list. Spot a mistake? Report it on the <a href="https://afdc.energy.gov/stations" target="_blank" rel="noopener">DOE station locator</a>.</p></section>` : "";
    const byFuel = new Map();
    for (const r of d.prices) { if (!byFuel.has(r.fuel)) byFuel.set(r.fuel, []); byFuel.get(r.fuel).push(r); }
    const hist = byFuel.size ? [...byFuel.entries()].map(([fuel, rows]) => `<div class="stack" style="gap:6px"><b>${esc(fuel)}</b>${priceSpark(rows)}<span class="small muted">${rows.slice(-4).map((r) => `${monthTxt(r.month)}: $${Number(r.price).toFixed(2)}`).join(" · ")}</span></div>`).join("")
      : `<p class="muted small">Prices show up as members log fills here.</p>`;
    const se = S.stEdit;
    const manage = c.can_rename || c.can_delete ? `<section class="card"><h2>${c.added_by_you ? "You added this station" : "Fix this station"}</h2>
      ${se ? `<form class="gap" data-form="stSave" novalidate>
          <label class="field" for="st-brand">Brand or station name<input id="st-brand" type="text" maxlength="60" data-se="brand" value="${esc(se.brand)}"></label>
          <label class="field" for="st-street">Street or road<input id="st-street" type="text" maxlength="80" data-se="street" value="${esc(se.street)}"></label>
          ${se.error ? `<p class="note-err" role="alert">${esc(se.error)}</p>` : ""}
          <div class="row"><button class="btn primary grow" type="submit">Save name</button><button type="button" class="btn" data-act="stCancel">Cancel</button></div></form>`
        : S.stConfirmDelete ? `<div class="confirm"><span class="grow">Delete this station for good? Your fills there keep the name.</span><button type="button" class="btn danger" data-act="stDelete">Delete</button><button type="button" class="btn" data-act="stCancel">Keep it</button></div>`
        : `<div class="row">${c.can_rename ? `<button type="button" class="btn" data-act="stRename">Fix the name</button>` : ""}${c.can_delete ? `<button type="button" class="btn danger" data-act="stAskDelete">Delete this station</button>` : ""}</div>`}
      <p class="small muted">${c.can_delete ? "You can change or delete it until another member logs a fill there." : "You can fix the name until another member uses this station."}</p></section>` : "";
    return `<a class="link" href="#community">← Community</a>
      <div class="stack"><h1>${esc(c.name)}</h1><p class="muted">${esc(addr || "No address on file")}${c.distance_m !== null && c.distance_m !== undefined ? ` · ${distTxt(c.distance_m)} away` : ""}</p>
        <p class="small muted">${c.members} member${c.members === 1 ? "" : "s"} fill here${c.mine ? ` · you've logged ${c.mine} stop${c.mine === 1 ? "" : "s"} here` : ""}</p></div>
      ${e85}
      <section class="card"><h2>Fuels sold here</h2>${fuels}</section>
      ${doe}
      <section class="card"><h2>Price history</h2>${hist}</section>
      ${manage}
      <p class="small muted">From fills logged by members who share. Other members' prices are shown by month, and who filled where is never shown.</p>`;
  }

  // Pump plan: notice when you're standing at a known E85 station that isn't your primary.
  const suggestHtml = () => (S.pumpSuggest ? `<div class="banner info"><span>At ${esc(S.pumpSuggest.name)}?</span><button type="button" class="link" data-act="useSuggest">Use it for this plan</button></div>` : "");
  async function maybeSuggest() {
    if (S.geoPerm !== "granted" || (S.suggestAt && Date.now() - S.suggestAt < 120000)) return;
    S.suggestAt = Date.now();
    try { await locate(); } catch { return; }
    if (!(await loadKnown())) return;
    const c = (S.known || [])[0];
    const sellsE85 = c && (c.e85 || (c.fuels || []).some((f) => f.fuel === "E85"));
    S.pumpSuggest = c && c.distance_m !== null && c.distance_m <= 150 && sellsE85 && c.id !== S.settings.primaryE85Id && (!S.pump.other || S.pump.other.id !== c.id) ? c : null;
    const el = $("#pumpSuggest"); if (el && S.view === "pump") el.innerHTML = suggestHtml();
  }

  // ---------- events ----------
  const ACT = {
    target: async (el) => { const s = { ...S.settings }; s.target = Math.max(30, Math.min(C.maxTarget(s), s.target + Number(el.dataset.d))); S.settings = C.withDefaults(s); $("#tgt").textContent = "E" + s.target; renderReadout(); clearTimeout(ACT._t); ACT._t = setTimeout(() => saveSettings(S.settings), 800); },
    which: (el) => {
      // Two taps on the same station within 400 ms: ask to remove it.
      const w = el.dataset.w, now = Date.now(), dbl = S.lastTap && S.lastTap.w === w && now - S.lastTap.t < 400;
      S.lastTap = dbl ? null : { w, t: now };
      if (dbl && ((w === "primary" && S.settings.primaryE85) || (w === "other" && S.pump.other))) { S.pumpConfirm = w; return render(); }
      if (el.dataset.w === "other" && !S.pump.other) return openPicker({ type: "pumpOther" }, "e85");
      if (el.dataset.w === "primary" && !S.settings.primaryE85) return openPicker({ type: "primaryNow" }, "e85");
      S.pump.which = el.dataset.w; render();
    },
    pumpKeep: () => { S.pumpConfirm = null; render(); },
    pumpRemove: async () => {
      const w = S.pumpConfirm; S.pumpConfirm = null;
      if (w === "other" && S.pump.other) {
        const prev = { other: S.pump.other, which: S.pump.which };
        S.pump.other = null; S.pump.which = "primary"; render();
        toast(`${prev.other.name} removed from the plan.`, "Undo", () => { S.pump.other = prev.other; S.pump.which = prev.which; render(); });
      } else if (w === "primary" && S.settings.primaryE85) {
        const prev = { primaryE85: S.settings.primaryE85, primaryE85Id: S.settings.primaryE85Id };
        await saveSettings({ ...S.settings, primaryE85: "", primaryE85Id: "" }); render();
        toast(`${prev.primaryE85} removed as your primary E85 station.`, "Undo", async () => { await saveSettings({ ...S.settings, ...prev }); render(); });
      } else render();
    },
    toastAct: () => { const fn = toast.fn; toast.fn = null; const el = $("#toast"); if (el) el.hidden = true; if (fn) fn(); },
    clearPrimary: (el) => {
      const cf = S.carForm, k = el.dataset.k, prev = { name: cf[k], id: cf[k + "Id"] };
      cf[k] = ""; cf[k + "Id"] = ""; render();
      toast(k === "primaryE85" ? "Primary E85 station removed. Save to keep it that way." : "Primary gas station removed. Save to keep it that way.", "Undo", () => { if (S.carForm === cf) { cf[k] = prev.name; cf[k + "Id"] = prev.id; render(); } });
    },
    stRename: () => { const c = S.stationDetail.card; S.stEdit = { brand: c.brand || "", street: c.street || "", error: "" }; S.stConfirmDelete = false; render(); },
    stCancel: () => { S.stEdit = null; S.stConfirmDelete = false; render(); },
    stAskDelete: () => { S.stConfirmDelete = true; S.stEdit = null; render(); },
    stDelete: async () => {
      const id = S.stationId;
      const { data, error } = await sb.rpc("delete_station", { p_id: id });
      if (error) { S.flash = "Couldn't delete the station. Another member may have logged a fill there."; S.stConfirmDelete = false; return render(); }
      S.known = (S.known || []).filter((k) => k.id !== id);
      await afterStationDeleted(id);
      S.stConfirmDelete = false; S.stationDetail = null;
      S.flash = data && data.fills_unlinked ? `Station deleted. Your ${data.fills_unlinked} fill${data.fills_unlinked === 1 ? "" : "s"} there kept the station name.` : "Station deleted.";
      go("community");
    },
    pickerEdit: () => { const p = S.picker; p.editing = !p.editing; p.swiped = null; renderPicker(); },
    pickerShowHidden: () => { const p = S.picker; p.showHidden = !p.showHidden; renderPicker(); },
    pickerHide: async (el) => {
      const id = el.dataset.id, c = (S.known || []).find((k) => k.id === id); if (!c) return;
      const d = detachStation(id), hidden = new Set(S.settings.hiddenStations || []); hidden.add(id);
      S.picker.swiped = null;
      await saveSettings({ ...S.settings, ...d.patch, hiddenStations: [...hidden] }); renderPicker();
      toast(`${c.name} removed from your app.`, "Undo", async () => {
        const h = new Set(S.settings.hiddenStations || []); h.delete(id);
        await saveSettings({ ...S.settings, ...d.undoPatch, hiddenStations: [...h] }); d.restore(); S.picker ? renderPicker() : render();
      });
    },
    pickerUnhide: async (el) => { await setHidden(el.dataset.id, false); S.picker.swiped = null; renderPicker(); },
    pickerDelete: (el) => {
      const id = el.dataset.id, index = (S.known || []).findIndex((k) => k.id === id); if (index < 0) return;
      const card = S.known[index];
      S.known = S.known.filter((k) => k.id !== id); S.picker.swiped = null;
      const d = detachStation(id);
      if (Object.keys(d.patch).length) saveSettings({ ...S.settings, ...d.patch });
      renderPicker();
      pendingDeletes.set(id, { card, index, timer: setTimeout(() => finishDelete(id), 10000) });
      toast(`${card.name} deleted.`, "Undo", async () => {
        const job = pendingDeletes.get(id); if (!job) return;
        clearTimeout(job.timer); pendingDeletes.delete(id);
        S.known = [...(S.known || [])]; S.known.splice(Math.min(job.index, S.known.length), 0, job.card);
        if (Object.keys(d.undoPatch).length) await saveSettings({ ...S.settings, ...d.undoPatch });
        d.restore(); S.picker ? renderPicker() : render();
      });
    },
    askWipe: () => { S.confirmWipe = true; render(); },
    keepLogs: () => { S.confirmWipe = false; render(); },
    wipeLogs: async () => {
      const [a, b] = await Promise.all([sb.from("fills").delete().eq("user_id", S.user.id), sb.from("oil_changes").delete().eq("user_id", S.user.id)]);
      S.confirmWipe = false;
      if (a.error || b.error) { S.carForm.error = "Couldn't delete everything. Check your connection and try again."; return render(); }
      await reloadFills(); refreshLearning(3000); S.flash = "All your fills and oil changes were deleted."; render(); window.scrollTo(0, 0);
    },
    pickOther: () => openPicker({ type: "pumpOther" }, "e85"),
    pickStation: (el) => { const i = Number(el.dataset.i); openPicker({ type: "stop", i }, S.form.stops[i].kind); },
    pickPrimary: (el) => openPicker({ type: el.dataset.p === "gas" ? "primaryGas" : "primaryE85" }, el.dataset.p),
    pickerClose: () => closePicker(),
    pickerLocate: () => refreshKnown(S.picker, true),
    pickerChoose: (el) => pickerChoose(el.dataset.id),
    pickerAdd: () => { const p = S.picker; p.step = "add"; p.error = ""; p.mapNote = ""; p.form = null; render(); if (p.locState === "ok" || S.geoPerm === "granted") findCandidates(p); },
    pickerHere: () => findCandidates(S.picker),
    pickerBack: () => { const p = S.picker; p.step = p.step === "confirm" && p.from === "add" ? "add" : "list"; p.form = null; p.error = ""; render(); },
    openStation: (el) => openStation(el.dataset.id),
    allStations: () => { S.allStations = true; render(); },
    useSuggest: () => { const c = S.pumpSuggest; if (!c) return; S.pump.other = { id: c.id, name: c.name }; S.pump.which = "other"; S.pumpSuggest = null; render(); },
    logPlan: () => { S.form = newForm(true); go("log"); },
    addStop: () => { S.form.stops.push(blankStop("gas")); renderStops(); },
    removeStop: (el) => { S.form.stops.splice(Number(el.dataset.i), 1); renderStops(); },
    stopKind: (el) => { const st = S.form.stops[Number(el.dataset.i)]; st.kind = el.dataset.k; if (st.kind === "e85" && !st.station) { st.station = S.settings.primaryE85; st.station_id = S.settings.primaryE85Id; } if (st.kind === "gas" && !st.station) { st.station = S.settings.primaryGas; st.station_id = S.settings.primaryGasId; } renderStops(); },
    scan: (el) => { const inp = $("#ph" + el.dataset.i); if (inp) inp.click(); },
    claudeRead: (el) => claudeRead(Number(el.dataset.i)),
    cancelFill: () => { S.form = null; go("history"); },
    askDeleteFill: () => { S.form.confirmDelete = true; render(); },
    keepFill: () => { S.form.confirmDelete = false; render(); },
    deleteFill: async () => {
      const gone = S.fills.find((x) => x.id === S.form.id);
      const { error } = await sb.from("fills").delete().eq("id", S.form.id); if (error) { S.form.error = "Couldn't delete. Try again."; return render(); }
      S.form = null; await reloadFills(); refreshLearning(); go("history");
      if (gone) toast("Fill deleted.", "Undo", async () => { const { error: e2 } = await sb.from("fills").insert({ ...gone }); if (!e2) { await reloadFills(); refreshLearning(); render(); toast("Fill restored."); } else toast("Couldn't restore the fill."); });
    },
    editFill: (el) => { const f = S.fills.find((x) => x.id === el.dataset.id); if (f) { S.form = editForm(f); go("log"); } },
    days: (el) => { S.communityDays = Number(el.dataset.d) || 0; S.community = null; render(); loadCommunity(); },
    editOil: (el) => { const o = S.oil.find((x) => x.id === el.dataset.id); if (!o) return; const common = [...C.COMMON_OILS, ...oilChoices().mine]; S.oilForm = { id: o.id, date: o.date, odometer: String(o.odometer), oil: common.includes(o.oil_type) ? o.oil_type : "__custom", customOil: !common.includes(o.oil_type), oilOwn: o.oil_type, filter: o.filter_type || C.FACTORY_FILTER, notes: o.notes || "", error: "", confirmDelete: false }; render(); window.scrollTo(0, 0); },
    cancelOil: () => { S.oilForm = null; render(); },
    askDeleteOil: () => { S.oilForm.confirmDelete = true; render(); },
    keepOil: () => { S.oilForm.confirmDelete = false; render(); },
    deleteOil: async () => {
      const gone = S.oil.find((x) => x.id === S.oilForm.id);
      await sb.from("oil_changes").delete().eq("id", S.oilForm.id); S.oilForm = null; await reloadFills(); render();
      if (gone) toast("Oil change deleted.", "Undo", async () => { const { error } = await sb.from("oil_changes").insert({ ...gone }); if (!error) { await reloadFills(); render(); toast("Oil change restored."); } else toast("Couldn't restore the oil change."); });
    },
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
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return; e.preventDefault();
    if (el.dataset.act === "pickerChoose" && S.swipedAt && Date.now() - S.swipedAt < 400) return;
    if (el.dataset.act === "pickerChoose" && S.picker && S.picker.swiped) { S.picker.swiped = null; return renderPicker(); }
    const fn = ACT[el.dataset.act]; if (fn) fn(el, e);
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.pump) { S.pump[el.dataset.pump] = el.value; renderReadout(); return; }
    if (el.id === "pickQ" && S.picker) { S.picker.q = el.value; renderPicker(); return; }
    if (el.dataset.se && S.stEdit) { S.stEdit[el.dataset.se] = el.value; return; }
    if (el.id === "pickLookup" && S.picker) { const p = S.picker; p.lq = el.value; clearTimeout(p.lt); p.lt = setTimeout(() => lookup(p), 300); return; }
    if (el.dataset.pk && S.picker && S.picker.form) { S.picker.form[el.dataset.pk] = el.value; const pv = $("#pickPreview"); if (pv) pv.textContent = previewName(S.picker.form); return; }
    if (el.dataset.f && S.form) { S.form[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; if (el.dataset.f === "odometer") updateOdoHint(); return; }
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
      else if (k === "pickSave") await pickerSave();
      else if (k === "stSave") await saveStationName();
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
        sb.rpc("register_device", { p_device: deviceId, p_agent: navigator.userAgent.slice(0, 200) }).then(() => {}, () => {}); // rpc() only sends once awaited
        route();
      }, 0);
    }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) { S.ready = true; render(); } });
  watchGeoPermission();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
})();
