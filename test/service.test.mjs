// Service schedule checks. Run: node test/service.test.mjs
import "../service.js";
const V = globalThis.Service;
let fails = 0;
const ok = (cond, name) => { if (!cond) { fails++; console.error("FAIL", name); } else console.log("ok  ", name); };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a)})`);

// Cars, years and transmissions
eq(V.checkedYears("grc"), [2023, 2024, 2025, 2026], "GR Corolla checked years");
eq(V.checkedYears("gr86"), [2022, 2023, 2024, 2025, 2026], "GR86 checked years");
eq(V.offeredYears("grc").slice(-1), [2027], "next year is offered");
eq(V.resolve("grc", 2024).transOptions, ["mt"], "2024 GR Corolla is manual only");
eq(V.resolve("grc", 2025).transOptions, ["mt", "at"], "2025 GR Corolla offers an automatic");
eq(V.resolve("grc", 2024).trans, "mt", "single transmission is picked for you");
eq(V.resolve("grc", 2026, "at").trans, "at", "chosen transmission kept");
const r27 = V.resolve("grc", 2027, "mt");
ok(!r27.checked && r27.usedYear === 2026 && /26GR-Corolla/.test(r27.guide), "unchecked year uses the newest checked guide");
ok(V.resolve("grc", 2023).checked && /23GRCorolla/.test(V.resolve("grc", 2023).guide), "2023 has its own guide");
ok(V.resolve("supra", 2024).car === null, "unknown car has no schedule");

// Items per car, year and transmission
const keys = (m, y, t) => V.items(m, y, t).map((i) => i.key);
ok(keys("grc", 2024, "mt").includes("mt_oil") && !keys("grc", 2024, "mt").includes("at_fluid"), "manual GR Corolla: manual transmission oil, no automatic item");
ok(keys("grc", 2026, "at").includes("at_fluid") && !keys("grc", 2026, "at").includes("mt_oil"), "automatic GR Corolla: fluid check, no manual item");
ok(!keys("gr86", 2024).includes("mt_oil") && !keys("gr86", 2024).includes("at_fluid"), "GR86 with no transmission chosen shows neither transmission item");
const by = (m, y, t, k) => V.items(m, y, t).find((i) => i.key === k);
eq([by("grc", 2024, "mt", "oil").miles, by("grc", 2024, "mt", "rear_diff").miles, by("grc", 2024, "mt", "transfer").miles, by("grc", 2024, "mt", "brake_fluid").miles, by("grc", 2024, "mt", "cabin_air").miles, by("grc", 2024, "mt", "spark_plugs").miles],
  [5000, 20000, 20000, 20000, 30000, 60000], "GR Corolla intervals");
eq([by("gr86", 2026, "at", "oil").miles, by("gr86", 2026, "at", "oil").months, by("gr86", 2026, "at", "cabin_air").miles, by("gr86", 2026, "at", "brake_fluid").miles, by("gr86", 2026, "at", "at_fluid").miles, by("gr86", 2026, "at", "fuel_filter").miles],
  [7500, 7.5, 15000, 30000, 60000, 75000], "GR86 intervals");
ok(by("grc", 2024, "mt", "mt_oil").practice && by("gr86", 2024, "mt", "mt_oil").practice && by("gr86", 2024, "mt", "rear_diff").practice && !by("grc", 2024, "mt", "rear_diff").practice, "owner-practice items are labeled");
ok(/humid/.test(by("gr86", 2023, "mt", "brake_fluid").note || "") && !by("gr86", 2025, "mt", "brake_fluid").note, "GR86 humid-area brake fluid note only through 2024");
eq(by("grc", 2024, "mt", "coolant").first, { miles: 100000, months: 120 }, "GR Corolla coolant first change");
eq(by("gr86", 2024, "mt", "coolant").first, { miles: 135000, months: 132 }, "GR86 coolant first change");

// Dates
eq(V.addMonths("2026-11-06", 6), "2027-05-06", "six months on");
eq(V.addMonths("2026-01-10", 7.5), "2026-08-25", "seven and a half months on");

// Status
const list = V.items("grc", 2024, "mt");
const st = (logs, odo, opts) => Object.fromEntries(V.status(list, logs, odo, "2026-11-25", opts).map((r) => [r.key, r]));
let s = st([], 48851, { start: 46886 });
eq([s.rear_diff.dueMiles, s.cabin_air.dueMiles, s.spark_plugs.dueMiles, s.coolant.dueMiles, s.oil.dueMiles], [60000, 60000, 60000, 100000, 50000], "never logged: next scheduled point after tracking started");
eq([s.rear_diff.level, s.rear_diff.milesLeft, s.rear_diff.dueDate], ["ok", 11149, null], "never logged: no date, miles only");
s = st([], 0, {});
eq([s.oil.dueMiles, s.oil.level], [null, "ok"], "no odometer yet: nothing due");
s = st([], 120500, { start: 120500 });
eq(s.coolant.dueMiles, 150000, "coolant after its first change runs every 50,000");
s = st([{ item: "oil", date: "2026-11-06", odometer: 48704 }, { date: "2026-05-01", odometer: 44000 }], 51500, { start: 46886 });
eq([s.oil.dueMiles, s.oil.dueDate, s.oil.level], [53704, "2027-05-06", "ok"], "logged oil change: miles and date from the latest one");
s = st([{ item: "oil", date: "2026-11-06", odometer: 48704 }], 53450, { start: 46886 });
eq(s.oil.level, "soon", "oil due soon within 300 miles");
s = st([{ item: "oil", date: "2026-11-06", odometer: 48704 }], 51500, { start: 46886, overrides: { oil: { miles: 3000, months: 6 } } });
eq([s.oil.dueMiles, s.oil.milesLeft, s.oil.level, s.oil.custom], [51704, 204, "soon", true], "owner's own oil interval wins");
s = st([{ item: "brake_fluid", date: "2024-10-01", odometer: 30000 }], 41000, { start: 20000 });
eq([s.brake_fluid.level, s.brake_fluid.daysLeft < 0], ["due", true], "due by date even with miles left");
s = st([], 60100, { start: 46886, overrides: { rear_diff: { off: true }, transfer: { later: "2026-12-09" } } });
eq([s.rear_diff.level, s.transfer.level], ["off", "due"], "an item can be switched off");
const nag = V.nagging(V.status(list, [], 60100, "2026-11-25", { start: 46886, overrides: { rear_diff: { off: true }, transfer: { later: "2026-12-09" } } }), "2026-11-25").map((r) => r.key);
ok(!nag.includes("rear_diff") && !nag.includes("transfer") && nag.includes("brake_fluid") && nag.includes("spark_plugs"), "pump note skips items that are off or put off until later");
eq(V.nagging(V.status(list, [], 60100, "2026-12-10", { start: 46886, overrides: { transfer: { later: "2026-12-09" } } }), "2026-12-10").some((r) => r.key === "transfer"), true, "a put-off item comes back after its date");

if (fails) { console.error(`${fails} failed`); process.exit(1); }
console.log("all service checks passed");
