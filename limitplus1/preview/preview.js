// LIMIT+1 Flex Fuel preview: the real app running on sample data, for videos and for LIMIT+1 to look around.
// This file stands in for the database client (supabase-js), so nothing is sent anywhere. What you enter stays in
// this browser tab (sessionStorage): it lasts through a reload and is gone when the tab closes, or at Start over.
// The stations are a snapshot of the U.S. DOE's public E85 list; the owners, fills and prices are made up.
(function () {
  "use strict";
  const P = window.PARTNER;
  // A demo for another company (demo/<id>/, built by demos/build.js) keeps its own data and its logo beside its page.
  const KEY = P.demo ? `${P.id}-demo-v1` : "lp1-preview-v1";
  const UID = "preview-owner";
  const HOME = { lat: 42.2308, lon: -88.3324 }; // Crystal Lake, IL 60014, near LIMIT+1's shop
  const DAY = 86400000;

  // ---------- what the shared app reads ----------
  window.APP_CONFIG = { supabaseUrl: "https://preview.invalid", supabaseKey: "preview" }; // no database, no bot check
  Object.assign(P, {
    storageKey: P.demo ? `${P.id}-demo` : "lp1-preview",
    logo: P.demo ? P.logo : { ...P.logo, light: "../" + P.logo.light, dark: "../" + P.logo.dark },
    preview: {
      welcome: "This preview runs the real app on sample data: an owner near Crystal Lake, IL with about ten weeks of fills. Set up a car, then look around.",
      note: "No sign-in. Nothing you type leaves this phone, and it's gone when you close the tab. Real customers sign in with a code we email them, and each new account is approved by hand.",
    },
  });

  // ---------- stations: the U.S. DOE's public E85 list near Crystal Lake, IL (Nov 23, 2026) ----------
  // [DOE id, brand, street, town, ZIP, lat, lon, hours, blender pump, last confirmed]
  const DOE = [
    [200334, "Casey's", "639 E Terra Cotta Ave", "Crystal Lake", "60014", 42.247972, -88.297074, "24 hours daily", true, "2026-04"],
    [219825, "Thorntons", "911 Tek Dr", "Crystal Lake", "60014", 42.21507, -88.28757, "24 hours daily", true, "2026-09"],
    [187188, "Murphy USA", "985 Central Park Dr", "Crystal Lake", "60014", 42.21062, -88.28486, "24 hours daily", true, "2026-09"],
    [98624, "Thorntons", "2265 W Algonquin Rd", "Lake in the Hills", "60156", 42.17506, -88.33012, "24 hours daily", true, "2024-10"],
    [51628, "Thorntons", "800 NW Hwy", "Cary", "60013", 42.218188, -88.258297, "24 hours daily", true, "2024-10"],
    [73153, "Shell", "4231 W Algonquin Rd", "Lake in the Hills", "60156", 42.169315, -88.29762, "24 hours daily", false, "2026-09"],
    [92077, "76", "2700 Algonquin Rd", "Lake in the Hills", "60156", 42.186636, -88.252547, "24 hours daily", false, "2024-10"],
    [446049, "Thorntons", "104 S NW Hwy", "Cary", "60013", 42.20684, -88.23222, "24 hours daily", true, "2026-02"],
    [73889, "Thorntons", "2095 E Algonquin Rd", "Algonquin", "60102", 42.155144, -88.265034, "24 hours daily", true, "2026-08"],
    [92036, "Murphy USA", "1265 Lake Ave", "Woodstock", "60098", 42.29784, -88.42531, "5:30am-11:30pm daily", true, "2026-09"],
    [152083, "Casey's", "2040 S Eastwood Dr", "Woodstock", "60098", 42.292921, -88.433404, "24 hours daily", true, "2026-04"],
    [219643, "Thorntons", "11975 IL-47", "Huntley", "60142", 42.1545743, -88.4329532, "24 hours daily", true, "2026-09"],
    [92079, "Speedway", "22055 N Kelsey Rd", "Lake Barrington", "60010", 42.18387, -88.189492, "24 hours daily", false, "2026-10"],
    [51632, "Thorntons", "27905 W Highway 176", "Island Lake", "60042", 42.2638455, -88.1782694, "24 hours daily", true, "2024-10"],
    [219714, "Shell", "395 Higgins Rd", "Gilberts", "60136", 42.10295, -88.36034, "24 hours daily", false, "2026-09"],
    [446053, "Thorntons", "2108 W Rte 120", "McHenry", "60051", 42.34265, -88.23981, "24 hours daily", true, "2026-09"],
    [81661, "Thorntons", "100 E Dundee Ave", "East Dundee", "60118", 42.104059, -88.257034, "24 hours daily", true, "2026-09"],
    [40343, "Thorntons", "28937 W Illinois Route 120", "Lakemoor", "60051", 42.32785, -88.1976, "24 hours daily", true, "2026-08"],
    [53830, "The Grove Mart", "2320 N Randall", "Elgin", "60124", 42.09116, -88.33593, "24 hours daily", false, "2026-09"],
    [152080, "Casey's", "700 S 8th St", "West Dundee", "60118", 42.09048, -88.289508, "24 hours daily", true, "2026-04"],
    [88745, "Thorntons", "2171 S 8th St", "West Dundee", "60118", 42.087053, -88.28957, "24 hours daily", true, "2026-08"],
    [204577, "Woodman's Food Market", "27555 IL Route 120", "Lakemoor", "60051", 42.32218, -88.16814, "24 hours daily", false, "2026-09"],
    [85724, "Speedway", "110 Arrowhead Dr", "Hampshire", "60140", 42.147899, -88.509072, "24 hours daily", false, "2026-10"],
    [38068, "BP", "205 S US Highway 12", "Volo", "60073", 42.324636, -88.164053, "24 hours daily", false, "2026-09"],
    [33777, "Shell", "1097 E Main St", "East Dundee", "60118", 42.088071, -88.244838, "4am-1:30am daily", false, "2026-09"],
    [186427, "BP", "3191 US-20", "Elgin", "60124", 42.03922, -88.36457, "24 hours daily", false, "2026-09"],
    [187185, "Murphy Express", "1035 S Rand Rd", "Lake Zurich", "60047", 42.1803296, -88.0801525, "24 hours daily", true, "2025-09"],
    [73149, "Thorntons", "11 N Route 12", "Fox Lake", "60020", 42.3973945, -88.1832098, "24 hours daily", true, "2026-08"],
    [200337, "Casey's", "820 Warner St", "Hampshire", "60140", 42.088944, -88.525577, "4am-11pm daily", true, "2026-04"],
    [332533, "Casey's", "200 E Grant Hwy", "Marengo", "60152", 42.24833, -88.6066, "24 hours daily", true, "2026-04"],
  ];
  const STATIONS = DOE.map(([n, brand, street, city, postcode, lat, lon, hours, blender, confirmed]) => ({
    id: "doe-" + n, source: "afdc", brand, street, name: `${brand} · ${street}`, city, state: "IL", postcode, lat, lon,
    listed: { e85: true, status: "E", blender, blends: blender ? ["E15"] : [], hours, confirmed },
  }));
  // The About page's station counts, from the app's weekly DOE and E85prices.com updates.
  const SUMMARY = { total: 7055, doe: { ran_at: "2026-11-23T09:17:06Z", listed: 4816, added: 0, removed: 1, total: 4816 },
    e85prices: { ran_at: "2026-11-23T05:30:03Z", listed: 6316, added: 9, removed: 0, total: 2239, recent_prices: 31 } };

  // ---------- a sample community: other owners' fills at four of those stations ----------
  // e85 is the measured strength now; was is the strength before the fall blend switch, switchAgo days ago.
  const COMMUNITY = {
    "doe-219825": { members: 7, n: 31, e85: 67, sd: 1.8, was: 79, switchAgo: 41, e85Price: 2.39, gasPrice: 3.89 },
    "doe-51628": { members: 5, n: 18, e85: 70, sd: 2.2, was: 81, switchAgo: 37, e85Price: 2.45, gasPrice: 3.95 },
    "doe-187188": { members: 3, n: 9, e85: 72, sd: 2.9, e85Price: 2.29, gasPrice: 3.79 },
    "doe-200334": { members: 2, n: 6, e85: 74, sd: 3.4, e85Price: 2.49, gasPrice: 3.99 },
  };

  // ---------- this tab's copy of the data ----------
  const blank = () => ({ session: null, seeded: false, next: 1, custom: [], fills: [], oil_changes: [], car_model: null, my_stations: [],
    profile: { id: UID, handle: null, status: "approved", is_admin: false, flagged: false, settings: {}, learn_since: null } });
  let D = blank();
  try { const saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && saved.profile) D = saved; } catch (e) { /* start fresh */ }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* private mode: lasts until a reload */ } };
  const startOver = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } location.replace(location.pathname); };
  window.__preview = { data: () => D, startOver };

  // ---------- helpers ----------
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const dateAgo = (d) => new Date(Date.now() - d * DAY).toLocaleDateString("en-CA");
  const monthAgo = (k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return d.toLocaleDateString("en-CA").slice(0, 7); };
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function meters(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return Math.round(12742000 * Math.asin(Math.sqrt(h)));
  }
  const all = () => [...STATIONS, ...D.custom];
  const byId = (id) => all().find((s) => s.id === id) || null;
  const where = (lat, lon) => (lat !== null && lat !== undefined && lon !== null && lon !== undefined ? { lat, lon } : HOME);
  // The same numbers each time, so a video can be shot twice.
  function rng(seed) {
    return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // How many of this owner's fills used a station, for each fuel.
  function mine(id) {
    let e85 = 0, gas = 0, fills = 0;
    for (const f of D.fills) {
      const stops = (f.stops || []).filter((s) => s.station_id === id);
      if (stops.length) fills++;
      if (stops.some((s) => s.kind === "e85")) e85++;
      if (stops.some((s) => s.kind !== "e85")) gas++;
    }
    return { e85, gas, fills };
  }

  // A station as the app's lists show it: community numbers plus this owner's own fills.
  function card(s, from) {
    const c = COMMUNITY[s.id], m = mine(s.id), month = monthAgo(0);
    const own = D.my_stations.find((x) => x.station_key === "id:" + s.id);
    const fuels = [];
    if (c || m.e85) fuels.push({ fuel: "E85", last_month: month, n: (c ? c.n : 0) + m.e85, price: c ? c.e85Price : 2.39, price_month: month });
    if (c || m.gas) fuels.push({ fuel: "93 octane", last_month: month, n: (c ? Math.round(c.n * 0.7) : 0) + m.gas, price: c ? c.gasPrice : 3.89, price_month: month });
    const value = own ? own.value : c ? c.e85 : null;
    const sw = own && own.switch_date ? { switch_month: own.switch_date.slice(0, 7), switch_from: own.switch_from, switch_to: own.switch_to }
      : c && c.was ? { switch_month: dateAgo(c.switchAgo).slice(0, 7), switch_from: c.was, switch_to: c.e85 } : {};
    return {
      id: s.id, source: s.source, name: s.name, brand: s.brand, street: s.street, city: s.city, state: s.state, postcode: s.postcode, standardized: true,
      distance_m: meters(from, s), members: (c ? c.members : 0) + (m.fills ? 1 : 0), mine: m.fills, fuels,
      e85: value === null ? null : { value, sd: own ? own.sd : c.sd, n: (c ? c.n : 0) + m.e85, last_month: month, ...sw },
      ...(s.listed ? { listed: s.listed } : {}),
      ...(s.source === "custom" ? { added_by_you: true, can_rename: true, can_delete: !m.fills } : {}),
    };
  }
  const known = (from) => all().filter((s) => COMMUNITY[s.id] || mine(s.id).fills || s.source === "custom").map((s) => card(s, from))
    .sort((a, b) => a.distance_m - b.distance_m);
  const isKnown = (id) => !!(COMMUNITY[id] || mine(id).fills || D.custom.some((s) => s.id === id));
  const listRow = (s, from) => ({ id: s.id, source: s.source, name: s.name, city: s.city, state: s.state, distance_m: meters(from, s), standardized: true,
    known: isKnown(s.id), e85_listed: s.source === "afdc", listed_by: s.source === "afdc" ? "afdc" : null });

  // Search like the real one, over this snapshot: a ZIP or town finds stations near it; anything else matches names.
  function search(q, from) {
    const text = norm(q), words = text.split(" ").filter(Boolean);
    if (text === "il" || text === "illinois") {
      return { place: { kind: "state", label: "Illinois" }, others: [], name_first: false, near: [], matches: all().map((s) => listRow(s, from)).sort((a, b) => a.distance_m - b.distance_m) };
    }
    const zip = words.find((w) => /^\d{5}$/.test(w));
    const town = [...new Set(STATIONS.map((s) => s.city))].sort((a, b) => b.length - a.length).find((t) => ` ${text} `.includes(` ${norm(t)} `));
    const inPlace = zip ? STATIONS.filter((s) => s.postcode === zip) : town ? STATIONS.filter((s) => s.city === town) : [];
    if (inPlace.length) {
      const c = { lat: avg(inPlace.map((s) => s.lat)), lon: avg(inPlace.map((s) => s.lon)) };
      const placeWords = new Set([zip, ...norm(town || "").split(" "), "il", "illinois"]);
      const rest = words.filter((w) => !placeWords.has(w));
      let near = all().map((s) => ({ ...listRow(s, from), place_m: meters(c, s) })).sort((a, b) => a.place_m - b.place_m);
      const named = rest.length ? near.filter((r) => rest.every((w) => norm(r.name).includes(w))) : [];
      near = (named.length ? named : near).slice(0, 12);
      const label = zip ? `${zip} · ${inPlace[0].city}, IL` : `${town}, IL`;
      return { place: { kind: zip ? "zip" : "town", label, lat: c.lat, lon: c.lon }, others: [], name_first: false, near, matches: [] };
    }
    const matches = all().filter((s) => { const hay = norm(`${s.name} ${s.city} ${s.state} ${s.postcode}`); return words.every((w) => hay.includes(w)); })
      .map((s) => listRow(s, from)).sort((a, b) => a.distance_m - b.distance_m).slice(0, 20);
    return { place: null, others: [], name_first: true, near: [], matches };
  }

  function community(days) {
    const k = days ? 1 : 2.6, share = D.profile.settings.share !== false && D.fills.length ? 1 : 0;
    const stations = Object.keys(COMMUNITY).map((id) => {
      const c = COMMUNITY[id], s = byId(id), m = mine(id).e85;
      return { name: s.name, value: c.e85, sd: Math.round(c.sd), n: Math.round(c.n * k) + (share ? m : 0), owners: c.members + (share && m ? 1 : 0),
        ...(c.was ? { switch_date: dateAgo(c.switchAgo), switch_from: c.was, switch_to: c.e85 } : {}) };
    });
    const n = (x) => Math.round(x * k);
    return { owners: (days ? 23 : 41) + share, stations,
      blends: [{ label: "E30 to E34", cpm: 0.152, mpg: 24.8, n: n(14) }, { label: "E35 to E44", cpm: 0.148, mpg: 23.9, n: n(87) }, { label: "E45 to E49", cpm: 0.151, mpg: 23.2, n: n(11) }],
      grades: [{ grade: "93", cpm: 0.161, n: n(64) }, { grade: "91", cpm: 0.157, n: n(9) }], on_target: 82 };
  }
  function stationDetail(id, from) {
    const s = byId(id); if (!s) return null;
    const c = COMMUNITY[id], m = mine(id);
    const prices = [];
    if (c || m.fills) {
      const e = c ? c.e85Price : 2.39, g = c ? c.gasPrice : 3.89;
      [[2, 0.2, 0.18], [1, 0.06, 0.08], [0, 0, 0]].forEach(([ago, de, dg]) => {
        prices.push({ fuel: "E85", month: monthAgo(ago), price: +(e + de).toFixed(2), n: 4 + ago });
        prices.push({ fuel: "93 octane", month: monthAgo(ago), price: +(g + dg).toFixed(2), n: 3 + ago });
      });
    }
    return { card: card(s, from), prices };
  }

  // ---------- the sample owner's log, made up when a car is set up ----------
  // About ten weeks of fills at the chosen E85 station, aimed at the owner's target. The station switched to its
  // winter blend partway through: the first fill after that lands low, then the app plans with the new strength.
  function seed(settings) {
    const C = window.Calc, V = window.Service;
    const model = V.CARS[settings.model] ? settings.model : "grc";
    const tank = V.tank(model), mpg = model === "gr86" ? 27 : 23.5;
    const target = Number(settings.target) || 40, tuneLimit = Number(settings.tuneLimit) || 50;
    const grade = Number(settings.gasGrade) || 93, gasEth = C.gasEthanol(settings, grade);
    const e85St = { id: settings.primaryE85Id || "", name: settings.primaryE85 || STATIONS[1].name };
    const gasSt = settings.primaryGas ? { id: settings.primaryGasId || "", name: settings.primaryGas } : e85St;
    const com = COMMUNITY[e85St.id] || null;
    const now85 = com ? com.e85 : 68, was85 = com && com.was ? com.was : now85 + 11, switchAgo = com && com.switchAgo ? com.switchAgo : 41;
    const e85Price = com ? com.e85Price : 2.39, gasPrice = com ? com.gasPrice : 3.89;
    const rand = rng(85), jit = (a) => (rand() * 2 - 1) * a;
    const gaps = [6, 7, 5, 8, 6, 7, 6, 5, 7, 6, 8], dtes = [34, 28, 41, 25, 37, 31, 22, 44, 30, 27, 36, 33];
    const span = gaps.reduce((a, b) => a + b, 0);
    let ago = 2 + span, odo = model === "gr86" ? 15240 : 15610, sensor = 40, assumed = was85, switchSeen = null;
    const fills = [], misses = [];
    const stop = (kind, st, gallons, price, extra) => ({ kind, station: st.name, ...(st.id ? { station_id: st.id } : {}), gallons, price, total: Math.round(gallons * price * 100) / 100, ...extra });
    for (let i = 0; i < dtes.length; i++) {
      const dte = dtes[i], R = 0.95 + dte / 20.4 + jit(0.15), winter = ago < switchAgo;
      const p = C.plan({ dte, sensor, target, tuneLimit, e85: assumed, e85Sd: 2, gasEth, car: { dte_a: 0.95, dte_b: 20.4, bias: 0, bias_basis: 0 }, tank });
      const e85gal = Math.max(0, +(p.e85gal + jit(0.05)).toFixed(3)), gasgal = +Math.max(0, tank - R - e85gal).toFixed(3);
      const pump = (winter ? now85 : was85) + jit(0.8);
      const blend = (R * sensor + e85gal * pump + gasgal * gasEth) / tank;
      const after = i === 3 || i === 8 ? null : Math.round(blend + jit(0.5)); // two fills without a reading after
      fills.push({ id: "pf" + i, user_id: UID, date: dateAgo(ago), odometer: Math.round(odo), dte, sensor_before: Math.round(sensor), sensor_after: after, full: true, target,
        stops: [stop("e85", e85St, e85gal, +((winter ? e85Price : e85Price + 0.2) + jit(0.03)).toFixed(2), {}), stop("gas", gasSt, gasgal, +((winter ? gasPrice : gasPrice + 0.2) + jit(0.03)).toFixed(2), { grade })],
        plan: { e85: p.e85gal, predicted: Math.round(p.predicted * 10) / 10, e85Assumed: Math.round(assumed) }, notes: null });
      misses.push({ month: dateAgo(ago).slice(0, 7), miss: Math.abs(p.predicted - blend) });
      if (winter && !switchSeen) { switchSeen = dateAgo(ago); assumed = now85 + 1.5; } else if (switchSeen) assumed = now85;
      sensor = blend + jit(0.4);
      if (i < dtes.length - 1) { odo += (tank - (0.95 + dtes[i + 1] / 20.4)) * (mpg + jit(0.7)); ago -= gaps[i]; }
    }
    const first = fills[0], last = fills[fills.length - 1], pace = (last.odometer - first.odometer) / span;
    const byMonth = {};
    misses.forEach((m) => (byMonth[m.month] = byMonth[m.month] || []).push(m.miss));
    const recent = misses.slice(-10).map((m) => m.miss);
    D.fills = fills;
    D.car_model = { user_id: UID, bias: 0.2, bias_sd: 0.6, bias_basis: 14, dte_a: 0.95, dte_b: 20.4, dte_sd: 0.3, dte_n: fills.length - 1, regional_value: 69, regional_sd: 4,
      accuracy_recent: +avg(recent).toFixed(1), accuracy_n: recent.length, recent: [],
      accuracy_by_month: Object.keys(byMonth).sort().slice(-3).map((m) => ({ month: m, miss: +avg(byMonth[m]).toFixed(1), n: byMonth[m].length })) };
    D.my_stations = [{ user_id: UID, station_key: C.keyFor(e85St.id, e85St.name), display_name: e85St.name, value: now85 + 0.3, sd: 1.6, n_mine: fills.length,
      n_total: fills.length + (com ? com.n : 0), last_value: Math.round(now85 + jit(1)), last_date: last.date, switch_date: switchSeen, switch_from: was85, switch_to: now85 }];
    // The last oil change and tire rotation were done together and are coming due, so the pump screen shows a reminder.
    const items = V.items(model, settings.year || 2024, settings.trans || "mt");
    const service = (key, extra) => {
      const it = items.find((x) => x.key === key); if (!it) return null;
      const at = last.odometer - it.miles + 260;
      return { id: "ps-" + key, user_id: UID, item: key, date: dateAgo(Math.round(2 + (last.odometer - at) / pace)), odometer: at, oil_type: null, filter_type: null, notes: null, ...extra };
    };
    D.oil_changes = [service("oil", { oil_type: "Mobil 1 0W-20", filter_type: model === "grc" ? C.FACTORY_FILTER : null }), service("tires")].filter(Boolean);
    D.profile.settings = { ...D.profile.settings, serviceStart: first.odometer };
    D.seeded = true;
  }

  // ---------- the database client ----------
  const TABLES = {
    profiles: () => [D.profile], fills: () => D.fills, oil_changes: () => D.oil_changes, my_stations: () => D.my_stations,
    car_model: () => (D.car_model ? [D.car_model] : []),
    station_estimates: () => Object.keys(COMMUNITY).map((id) => ({ station_key: "id:" + id, display_name: byId(id).name, value: COMMUNITY[id].e85, sd: COMMUNITY[id].sd, n_fills: COMMUNITY[id].n, n_owners: COMMUNITY[id].members })),
  };
  const later = (v) => new Promise((ok) => setTimeout(() => ok(v), 60)); // a moment, like a real request
  function from(table) {
    const st = { op: "select", payload: null, filters: [], one: false, sort: [] };
    const api = {
      select() { return api; }, order(c) { st.sort.push(c); return api; }, limit() { return api; }, neq() { return api; },
      eq(c, v) { st.filters.push([c, v]); return api; },
      single() { st.one = true; return api; }, maybeSingle() { st.one = true; return api; },
      insert(row) { st.op = "insert"; st.payload = row; return api; }, update(p) { st.op = "update"; st.payload = p; return api; }, delete() { st.op = "delete"; return api; },
      then(ok, bad) { return later(run()).then(ok, bad); },
    };
    const match = (r) => st.filters.every(([c, v]) => r[c] === v);
    // Sorted like the database does it: ascending, empty values last.
    const cmp = (x, y) => (x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1
      : typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
    const sorted = (out) => (st.sort.length ? out.sort((a, b) => { for (const c of st.sort) { const d = cmp(a[c], b[c]); if (d) return d; } return 0; }) : out);
    function run() {
      if (!D.session) return { data: null, error: { message: "Not signed in" } };
      const rows = TABLES[table] ? TABLES[table]() : [];
      if (st.op === "select") { const out = sorted(clone(rows.filter(match))); return { data: st.one ? out[0] || null : out, error: null }; }
      if (st.op === "insert") {
        const r = { ...clone(st.payload), id: st.payload.id || "p" + D.next++, user_id: UID };
        if (table === "fills" || table === "oil_changes") D[table].push(r);
        save(); return { data: null, error: null };
      }
      if (st.op === "update") {
        rows.filter(match).forEach((r) => Object.assign(r, clone(st.payload)));
        // The first time a car is set up, the sample owner's log appears.
        if (table === "profiles" && st.payload.settings && st.payload.settings.setupDone && !D.seeded) seed(D.profile.settings);
        save(); return { data: null, error: null };
      }
      if (st.op === "delete") {
        if (table === "fills" || table === "oil_changes") D[table] = D[table].filter((r) => !match(r));
        save(); return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    return api;
  }
  function rpcRun(name, a) {
    a = a || {};
    const at = where(a.p_lat, a.p_lon);
    switch (name) {
      case "partner_request": return { data: "approved" };
      case "receipt_quota": return { data: { used_today: 0, daily_limit: 6, month_used: 2, month_cap: 1000 } };
      case "stations_known": return { data: known(at) };
      case "stations_near": return { data: all().map((s) => listRow(s, at)).sort((x, y) => x.distance_m - y.distance_m).slice(0, a.p_limit || 25) };
      case "stations_at": return { data: all().filter((s) => meters(at, s) <= (a.p_radius_m || 200)).map((s) => ({ ...listRow(s, at), brand: s.brand, street: s.street })) };
      case "stations_search": return { data: search(a.p_q, at) };
      case "station_detail": return { data: stationDetail(a.p_id, at) };
      case "station_summary": return { data: SUMMARY };
      case "community_stats": return { data: community(a.p_days) };
      case "add_station": case "standardize_station": {
        const name = [a.p_brand, a.p_street].filter(Boolean).join(" · ");
        let s = a.p_id ? D.custom.find((x) => x.id === a.p_id) : null;
        if (a.p_id && !s) { const base = byId(a.p_id); return { data: base ? card(base, HOME) : null }; }
        if (!s) { s = { id: "custom-" + D.next++, source: "custom", lat: a.p_lat ?? HOME.lat, lon: a.p_lon ?? HOME.lon }; D.custom.push(s); }
        Object.assign(s, { brand: a.p_brand, street: a.p_street, name, city: a.p_city || "Crystal Lake", state: a.p_state || "IL", postcode: a.p_postcode || null });
        save(); return { data: card(s, HOME) };
      }
      case "delete_station": {
        const used = mine(a.p_id).fills;
        D.custom = D.custom.filter((s) => s.id !== a.p_id); save();
        return { data: { deleted: true, fills_unlinked: used } };
      }
      default: return { data: null, error: null }; // register_device, report_unchecked_year and the like
    }
  }
  let listener = null;
  const tell = (event) => setTimeout(() => listener && listener(event, D.session), 0);
  const client = {
    auth: {
      getSession: async () => ({ data: { session: D.session } }),
      onAuthStateChange: (fn) => { listener = fn; tell("INITIAL_SESSION"); return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
      signInAnonymously: async () => { D.session = { user: { id: UID, email: "Preview owner", is_anonymous: true } }; save(); tell("SIGNED_IN"); return { data: { session: D.session }, error: null }; },
      signInWithOtp: async () => ({ error: { message: "The preview has no sign-in." } }),
      verifyOtp: async () => ({ error: { message: "The preview has no sign-in." } }),
      // Signing out of the preview starts it over.
      signOut: async () => { D = blank(); save(); tell("SIGNED_OUT"); return { error: null }; },
    },
    from,
    // Like the real client, rpc() does nothing until something awaits it.
    rpc: (name, args) => ({ then: (ok, bad) => later(rpcRun(name, args)).then(ok, bad) }),
    functions: {
      invoke: async (name) => {
        if (name !== "read-receipt") return { data: null, error: { message: "Not in the preview" } };
        const st = byId(D.profile.settings.primaryE85Id) || STATIONS[1];
        return later({ data: { ok: true, receipt: { station: st.brand.toUpperCase(), fuel: "e85", octane: null, gallons: 4.62, price_per_gallon: 2.39, total: 11.04, date: dateAgo(0) } }, error: null });
      },
    },
  };
  window.supabase = { createClient: () => client };

  // ---------- the phone's location ----------
  // The preview pretends the phone is in Crystal Lake, so it never asks for the real location.
  const here = () => ({ coords: { latitude: HOME.lat, longitude: HOME.lon, accuracy: 25 }, timestamp: Date.now() });
  try {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (ok) => setTimeout(() => ok(here()), 120),
      watchPosition: (ok) => { setTimeout(() => ok(here()), 120); return 1; }, clearWatch() {},
    } });
    if (navigator.permissions && navigator.permissions.query) {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d) => (d && d.name === "geolocation" ? Promise.resolve({ state: "granted", onchange: null }) : query(d));
    }
  } catch (e) { /* the app falls back to search */ }

  // ---------- the Start over link in the preview ribbon ----------
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-preview-reset]")) { e.preventDefault(); startOver(); } });
})();
