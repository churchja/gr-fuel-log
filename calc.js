// GR Fuel Log calculations. Pure functions shared by the app and the tests.
(function (root) {
  "use strict";
  const TANK = 13.2;
  const BAND = 3;
  const GRADES = [87, 88, 89, 91, 92, 93];
  const TUNE_LIMITS = [50, 60, 70, 85];
  const COMMON_OILS = ["Toyota Genuine 0W-20", "Mobil 1 0W-20", "Pennzoil Ultra Platinum 0W-20", "Motul 8100 Eco-Lite 0W-20", "Amsoil Signature Series 0W-20"];
  const FACTORY_FILTER = "Toyota 90915-YZZN1";
  const DEFAULT_SETTINGS = {
    target: 40, tuneLimit: 50, gasGrade: 93, ethanolFree: false, primaryE85: "", primaryGas: "",
    oilMiles: 3000, oilMonths: 6, receiptMode: "phone_first", share: true, oilTypes: [], filterTypes: [],
  };

  const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const stationKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });
  const maxTarget = (settings) => Math.min(70, withDefaults(settings).tuneLimit - 3);

  function gasEthanol(settings, grade, override) {
    if (num(override) !== null) return num(override);
    const s = withDefaults(settings);
    if (s.ethanolFree) return 0;
    return Number(grade ?? s.gasGrade) === 88 ? 15 : 10;
  }
  function seasonalDefault(dateStr) {
    const m = Number(String(dateStr).slice(5, 7));
    return m >= 4 && m <= 9 ? 85 : 70;
  }

  function stopTotals(fill, settings) {
    let e85 = 0, gas = 0, other = 0, ethGal = 0, cost = 0, big = 0, e85Station = "";
    for (const s of fill.stops || []) {
      const g = num(s.gallons) ?? 0;
      const t = num(s.total) ?? (num(s.price) !== null ? g * num(s.price) : 0);
      cost += t;
      if (s.kind === "e85") { e85 += g; if (g > big) { big = g; e85Station = s.station || ""; } }
      else if (s.kind === "gas") { gas += g; ethGal += g * gasEthanol(settings, s.grade, s.ethanol); }
      else { other += g; ethGal += g * (num(s.ethanol) ?? 10); }
    }
    return { e85, gas, other, gallons: e85 + gas + other, ethGal, cost: Math.round(cost * 100) / 100, e85Station };
  }

  // What E85 strength to assume at the pump, from the learned model.
  function e85Assumption({ which, settings, myStations = [], stations = [], car = null, today }) {
    const s = withDefaults(settings);
    if (which === "primary" && s.primaryE85) {
      const key = stationKey(s.primaryE85);
      const mine = myStations.find((m) => m.station_key === key);
      if (mine) {
        const others = mine.n_total > mine.n_mine;
        return {
          value: Number(mine.value), sd: Number(mine.sd), source: "learned",
          why: `learned from ${mine.n_total} fill${mine.n_total === 1 ? "" : "s"}${others ? " by you and other owners" : ""}`,
          last: mine.last_value !== null && mine.last_value !== undefined ? { value: Number(mine.last_value), date: mine.last_date } : null,
          switch: mine.switch_date ? { date: mine.switch_date, from: Number(mine.switch_from), to: Number(mine.switch_to) } : null,
        };
      }
      const com = stations.find((m) => m.station_key === key);
      if (com) return { value: Number(com.value), sd: Number(com.sd), source: "community", why: `learned from ${com.n_fills} fills by other owners`, last: null, switch: null };
    }
    if (car && car.regional_value !== null && car.regional_value !== undefined) {
      return { value: Number(car.regional_value), sd: Number(car.regional_sd) || 6, source: "regional", why: "average of recently measured stations", last: null, switch: null };
    }
    const d = seasonalDefault(today);
    return { value: d, sd: 8, source: "default", why: `${d === 85 ? "summer" : "winter"} default until fills are measured`, last: null, switch: null };
  }

  // The pump plan, in flex-sensor reading terms (the number the tune and the gauge use).
  function plan({ dte, sensor, target, tuneLimit, e85, e85Sd, gasEth, car }) {
    const a = car ? Number(car.dte_a) : 0.95, b = car ? Number(car.dte_b) : 20;
    const bias = car && car.bias_basis > 0 ? Number(car.bias) : 0;
    const R = clamp(a + dte / b, 0, TANK), space = TANK - R;
    let x = (TANK * target - bias * space - R * sensor - space * gasEth) / (e85 - gasEth);
    let clamped = null;
    if (!(x > 0)) { x = 0; clamped = "zero"; } else if (x >= space) { x = space; clamped = "full"; }
    x = Math.min(Math.round(x * 10) / 10, Math.floor(space * 10) / 10);
    const gas = Math.max(0, space - x);
    const predicted = bias * space / TANK + (R * sensor + x * e85 + gas * gasEth) / TANK;
    const sd = Math.sqrt(((x / TANK) * (e85Sd || 0)) ** 2 + 0.6 ** 2);
    const spread = Math.max(1, Math.round(1.28 * sd));
    const cap = tuneLimit - 2;
    return { R, space, e85gal: x, gas, predicted, lo: predicted - spread, hi: predicted + spread, clamped, cap, overCap: predicted >= cap, bias };
  }

  function bandOf(blend, target, tuneLimit) {
    if (blend === null || blend === undefined) return "none";
    const v = r1(blend);
    if (v >= (tuneLimit ?? 50) - 2) return "danger";
    if (Math.abs(v - target) <= BAND) return "on";
    return v < target ? "low" : "high";
  }

  function deriveRows(fills, settings) {
    const s = withDefaults(settings);
    const sorted = [...fills].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.odometer) - Number(b.odometer));
    return sorted.map((f, i) => {
      const prev = sorted[i - 1], next = sorted[i + 1];
      const t = stopTotals(f, s);
      const odo = Number(f.odometer), miles = prev && odo > Number(prev.odometer) ? odo - Number(prev.odometer) : null;
      const gap = next ? Number(next.odometer) - odo : Infinity;
      const after = num(f.sensor_after), nextBefore = next && gap > 0 && gap <= 450 ? num(next.sensor_before) : null;
      const blend = after ?? nextBefore;
      const target = num(f.target) ?? s.target;
      return {
        f, t, miles, cpm: miles ? t.cost / miles : null, mpg: miles && f.full !== false && t.gallons > 0 ? miles / t.gallons : null,
        blend, blendSrc: after !== null ? "after" : nextBefore !== null ? "next" : null, target, band: bandOf(blend, target, s.tuneLimit),
      };
    });
  }

  function summarize(rows) {
    const withMiles = rows.filter((r) => r.miles);
    const miles = withMiles.reduce((a, r) => a + r.miles, 0), cost = withMiles.reduce((a, r) => a + r.t.cost, 0);
    const mpgRows = rows.filter((r) => r.mpg);
    const mm = mpgRows.reduce((a, r) => a + r.miles, 0), mg = mpgRows.reduce((a, r) => a + r.t.gallons, 0);
    const banded = rows.filter((r) => r.band !== "none");
    return {
      cpm: miles ? cost / miles : null, mpg: mg ? mm / mg : null,
      avgBlend: banded.length ? banded.reduce((a, r) => a + r.blend, 0) / banded.length : null,
      onTarget: banded.length ? banded.filter((r) => r.band === "on").length / banded.length : null,
      spent: rows.reduce((a, r) => a + r.t.cost, 0), count: rows.length,
    };
  }

  function addMonths(dateStr, months) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
  }
  function oilStatus(oil, fills, settings, today) {
    const s = withDefaults(settings);
    const sorted = [...oil].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.odometer) - Number(b.odometer));
    const last = sorted[sorted.length - 1];
    const odoNow = Math.max(0, ...fills.map((f) => Number(f.odometer) || 0), ...oil.map((o) => Number(o.odometer) || 0));
    if (!last) return { last: null, odoNow };
    const dueDate = addMonths(last.date, Number(s.oilMonths) || 6);
    const dueMiles = Number(last.odometer) + (Number(s.oilMiles) || 3000);
    const milesLeft = dueMiles - odoNow;
    const daysLeft = Math.round((Date.parse(dueDate) - Date.parse(today)) / 86400000);
    const level = milesLeft <= 0 || daysLeft <= 0 ? "due" : milesLeft <= 300 || daysLeft <= 14 ? "soon" : "ok";
    return { last, odoNow, dueDate, dueMiles, milesLeft, daysLeft, level };
  }

  // Reads the useful numbers out of a receipt's text (from the phone's own text recognition).
  const BRANDS = ["motomart", "thorntons", "costco", "casey", "speedway", "shell", "marathon", "circle k", "kroger", "sam's", "sams club", "walmart",
    "murphy", "phillips 66", "mobil", "exxon", "sunoco", "valero", "chevron", "quiktrip", "wawa", "sheetz", "love's", "pilot", "huck", "bp", "citgo", "meijer", "gulf", "kwik"];
  function parseReceiptText(raw) {
    const text = String(raw || "").replace(/\r/g, "");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const toNum = (s) => Number(String(s).replace(",", "."));
    const find = (patterns) => {
      for (const re of patterns) for (const l of lines) { const m = l.match(re); if (m) return toNum(m[1]); }
      return null;
    };
    let gallons = find([/(?:gallons?|gals?|volume|vol|qty|quantity)\b[^0-9]{0,8}(\d{1,2}[.,]\d{2,3})/i, /(\d{1,2}[.,]\d{3})\s*(?:gal|g)\b/i]);
    let price = find([/(?:price|ppg|per\s*gal(?:lon)?|\$\s*\/\s*g(?:al)?|unit)\b[^0-9]{0,8}(\d[.,]\d{2,3})/i, /@\s*\$?\s*(\d[.,]\d{3})/, /(\d[.,]\d{3})\s*\/\s*g/i]);
    let total = find([/(?:total|fuel\s*sale|sale|amount|amt|purchase)\b[^0-9]{0,10}(\d{1,3}[.,]\d{2})\b/i]);
    if (gallons !== null && (gallons <= 0 || gallons > 30)) gallons = null;
    if (price !== null && (price < 0.5 || price > 15)) price = null;
    if (total !== null && (total <= 0 || total > 400)) total = null;
    if (total === null && gallons !== null && price !== null) total = Math.round(gallons * price * 100) / 100;
    if (gallons === null && total !== null && price !== null) gallons = Math.round((total / price) * 1000) / 1000;
    if (price === null && total !== null && gallons !== null) price = Math.round((total / gallons) * 1000) / 1000;
    const all = lines.join(" ");
    let fuel = null, octane = null, ethanol = null;
    if (/\bE\s*-?\s*85\b|flex\s*fuel/i.test(all)) fuel = "e85";
    else {
      const oc = all.match(/\b(87|88|89|91|92|93)\b(?:\s*oct)?/);
      if (/premium|super|supreme|plus|regular|unl|unleaded|octane/i.test(all) || oc) { fuel = "gas"; octane = oc ? Number(oc[1]) : /premium|super|supreme/i.test(all) ? 93 : null; }
      if (/ethanol\s*free|\bE\s*-?\s*0\b|rec(?:reational)?\s*fuel/i.test(all)) { fuel = fuel || "gas"; ethanol = 0; }
      else if (/\bE\s*-?\s*15\b/i.test(all)) ethanol = 15;
    }
    let station = null;
    for (const l of lines.slice(0, 8)) { if (BRANDS.some((b) => l.toLowerCase().includes(b))) { station = l.replace(/\s+/g, " ").slice(0, 60); break; } }
    if (!station) station = lines.find((l) => /[a-z]{3,}/i.test(l))?.slice(0, 60) ?? null;
    let date = null;
    const dm = all.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (dm) { const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]); const mo = Number(dm[1]), d = Number(dm[2]); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
    const consistent = gallons !== null && price !== null && total !== null && Math.abs(gallons * price - total) <= 0.1;
    return { station, date, fuel, octane, ethanol, gallons, price, total, confident: consistent };
  }

  root.Calc = { TANK, BAND, GRADES, TUNE_LIMITS, COMMON_OILS, FACTORY_FILTER, DEFAULT_SETTINGS, num, clamp, r1, stationKey, withDefaults, maxTarget,
    gasEthanol, seasonalDefault, stopTotals, e85Assumption, plan, bandOf, deriveRows, summarize, addMonths, oilStatus, parseReceiptText };
})(typeof window !== "undefined" ? window : globalThis);
