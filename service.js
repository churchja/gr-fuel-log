// Cars and service schedules. Pure functions shared by the app and the tests.
// Every interval below was read from Toyota's U.S. Warranty & Maintenance Guide for that model year (linked per
// year). Items marked `practice` are not required by Toyota (its guide says inspect only); owners commonly do them.
// To add a model year: check its guide, add the year and link under `years`, and note any item that changed.
(function (root) {
  "use strict";
  const CHECKED = "2026-11-25";
  const SIA = "https://assets.sia.toyota.com/publications/en/omms-s/";
  const guide = (code) => `${SIA}T-MMS-${code}/pdf/T-MMS-${code}.pdf`;

  const GRC_ITEMS = [
    { key: "oil", name: "Engine oil and filter", miles: 5000, months: 6 },
    { key: "tires", name: "Tire rotation", miles: 5000, months: 6 },
    { key: "rear_diff", name: "Rear differential oil", miles: 20000, months: 24 },
    { key: "transfer", name: "Transfer case oil", miles: 20000, months: 24 },
    { key: "brake_fluid", name: "Brake fluid", miles: 20000, months: 24 },
    { key: "engine_air", name: "Engine air filter", miles: 20000, months: 24 },
    { key: "mt_oil", name: "Manual transmission oil", miles: 20000, months: 24, trans: "mt", practice: true, note: "Toyota says inspect only, unless the car carries heavy loads." },
    { key: "at_fluid", name: "Automatic transmission fluid check", miles: 20000, months: 24, trans: "at", note: "Toyota says inspect. Replace every 40,000 miles only if the car carries heavy loads." },
    { key: "cabin_air", name: "Cabin air filter", miles: 30000, months: 36 },
    { key: "spark_plugs", name: "Spark plugs", miles: 60000, months: 72 },
    { key: "drive_belt", name: "Drive belt", miles: 60000, months: 72 },
    { key: "coolant", name: "Engine coolant", first: { miles: 100000, months: 120 }, miles: 50000, months: 60 },
  ];
  const humid = "Toyota's guide for this year says every 15,000 miles in humid or mountainous areas.";
  const gr86Items = (year) => [
    { key: "oil", name: "Engine oil and filter", miles: 7500, months: 7.5 },
    { key: "tires", name: "Tire rotation", miles: 7500, months: 7.5 },
    { key: "cabin_air", name: "Cabin air filter", miles: 15000, months: 15 },
    { key: "brake_fluid", name: "Brake fluid", miles: 30000, months: 30, ...(year <= 2024 ? { note: humid } : {}) },
    { key: "engine_air", name: "Engine air filter", miles: 30000, months: 30 },
    { key: "mt_oil", name: "Manual transmission oil", miles: 30000, months: 30, trans: "mt", practice: true, note: "Toyota says inspect only." },
    { key: "rear_diff", name: "Rear differential oil", miles: 30000, months: 30, practice: true, note: "Toyota says inspect only." },
    { key: "spark_plugs", name: "Spark plugs", miles: 60000, months: 60 },
    { key: "at_fluid", name: "Automatic transmission fluid", miles: 60000, months: 60, trans: "at" },
    { key: "fuel_filter", name: "Fuel filter", miles: 75000, months: 75 },
    { key: "coolant", name: "Engine coolant", first: { miles: 135000, months: 132 }, miles: 75000, months: 72 },
  ];

  const CARS = {
    grc: {
      name: "GR Corolla", tank: 13.2,
      years: { 2023: guide("23GRCorolla"), 2024: "https://www.toyota.com/content/dam/toyota/brochures/pdf/2024/T-MMS-24GRCorolla.pdf", 2025: guide("25GRCorolla"), 2026: guide("26GR-Corolla") },
      trans: (year) => (year >= 2025 ? ["mt", "at"] : ["mt"]),
      items: () => GRC_ITEMS,
    },
    gr86: {
      name: "GR86", tank: 13.2,
      years: { 2022: guide("2286"), 2023: "https://www.toyota.com/content/dam/toyota/brochures/pdf/2023/T-MMS-23_86.pdf", 2024: guide("24_86"), 2025: guide("25_86"), 2026: guide("26_86") },
      trans: () => ["mt", "at"],
      items: gr86Items,
    },
  };
  const TRANS = { mt: "Manual", at: "Automatic" };

  const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const checkedYears = (model) => (CARS[model] ? Object.keys(CARS[model].years).map(Number).sort((a, b) => a - b) : []);
  // Years to offer at setup: every checked year, plus the next one (its guide gets checked when someone picks it).
  const offeredYears = (model) => { const ys = checkedYears(model); return ys.length ? [...ys, ys[ys.length - 1] + 1] : []; };
  const tank = (model) => (CARS[model] ? CARS[model].tank : 13.2);

  // The car as the schedule sees it. A year with no checked guide uses the newest checked year, and says so.
  function resolve(model, year, trans) {
    const car = CARS[model];
    if (!car) return { model, car: null };
    const ys = checkedYears(model), y = num(year);
    if (y === null) return { model, car, name: car.name, year: null, trans: null, checked: false };
    const used = car.years[y] ? y : ys.filter((v) => v <= y).pop() ?? ys[0];
    const opts = car.trans(y);
    return { model, car, name: car.name, year: y, usedYear: used, checked: !!car.years[y], guide: car.years[used], checkedOn: CHECKED,
      transOptions: opts, trans: opts.includes(trans) ? trans : opts.length === 1 ? opts[0] : null };
  }
  function items(model, year, trans) {
    const r = resolve(model, year, trans);
    if (!r.car || r.year === null) return [];
    return r.car.items(r.usedYear).filter((it) => !it.trans || (r.trans ? it.trans === r.trans : false));
  }
  // Just the oil item, for a car whose year isn't known yet.
  const oilItem = (model) => ((CARS[model] || CARS.grc).items(2024).find((it) => it.key === "oil"));

  function addMonths(dateStr, months) {
    const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
    const whole = Math.trunc(months), half = months - whole >= 0.5 ? 15 : 0;
    return new Date(Date.UTC(y, m - 1 + whole, d + half)).toISOString().slice(0, 10);
  }
  const byDateOdo = (a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.odometer) - Number(b.odometer);

  // Where each service stands. `logs` are rows with { item, date, odometer }. A service that was never logged is
  // assumed done on schedule up to `start` (the odometer when the app began tracking this car), so the first
  // reminder is the next scheduled one, not everything since new.
  function status(list, logs, odoNow, today, { start = null, overrides = {} } = {}) {
    return list.map((it) => {
      const o = overrides[it.key] || {};
      const milesEvery = num(o.miles) ?? it.miles, monthsEvery = num(o.months) ?? it.months;
      const mine = (logs || []).filter((l) => (l.item || "oil") === it.key).sort(byDateOdo);
      const last = mine[mine.length - 1] || null;
      let dueMiles = null, dueDate = null;
      if (last) { dueMiles = Number(last.odometer) + milesEvery; dueDate = addMonths(last.date, monthsEvery); }
      else if (num(start) !== null) {
        const s = Number(start), firstAt = it.first && num(o.miles) === null ? it.first.miles : milesEvery;
        dueMiles = s <= firstAt ? firstAt : firstAt + Math.ceil((s - firstAt) / milesEvery) * milesEvery;
      }
      const milesLeft = dueMiles === null || !odoNow ? null : dueMiles - odoNow;
      const daysLeft = dueDate === null ? null : Math.round((Date.parse(dueDate) - Date.parse(today)) / 86400000);
      const soonMiles = it.key === "oil" ? 300 : 500, soonDays = it.key === "oil" ? 14 : 30;
      const level = o.off ? "off" : (milesLeft !== null && milesLeft <= 0) || (daysLeft !== null && daysLeft <= 0) ? "due"
        : (milesLeft !== null && milesLeft <= soonMiles) || (daysLeft !== null && daysLeft <= soonDays) ? "soon" : "ok";
      return { ...it, miles: milesEvery, months: monthsEvery, custom: num(o.miles) !== null || num(o.months) !== null, last, dueMiles, dueDate, milesLeft, daysLeft, level, later: o.later || null };
    });
  }
  // Most pressing first: due, then due soon, then whatever comes up next by miles.
  const rank = { due: 0, soon: 1, ok: 2, off: 3 };
  const sortRows = (rows) => [...rows].sort((a, b) => rank[a.level] - rank[b.level] || (a.milesLeft ?? 1e9) - (b.milesLeft ?? 1e9));
  // Rows worth a note on the pump screen today: due or due soon, switched on, and not put off until later.
  const nagging = (rows, today) => sortRows(rows).filter((r) => (r.level === "due" || r.level === "soon") && !(r.later && r.later > today));

  root.Service = { CARS, TRANS, CHECKED, checkedYears, offeredYears, tank, resolve, items, oilItem, addMonths, status, sortRows, nagging };
})(typeof window !== "undefined" ? window : globalThis);
