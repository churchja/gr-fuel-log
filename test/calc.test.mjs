import "../calc.js";
const C = globalThis.Calc;
const t = (name, ok, got) => console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(got)}`);
// Skill anchors (no car model, default DTE formula, no bias)
const p1 = C.plan({ dte: 35, sensor: 38, target: 40, tuneLimit: 50, e85: 85, e85Sd: 0, gasEth: 10, car: null });
t("anchor 35mi@38 summer -> 4.3", p1.e85gal === 4.3, p1);
const p2 = C.plan({ dte: 20, sensor: 10, target: 40, tuneLimit: 50, e85: 85, e85Sd: 0, gasEth: 10, car: null });
t("anchor 20mi@10 summer -> 5.3", p2.e85gal === 5.3, p2);
const p3 = C.plan({ dte: 34, sensor: 40, target: 40, tuneLimit: 50, e85: 70, e85Sd: 0, gasEth: 10, car: null });
t("anchor 34mi@40 winter -> 5.3", p3.e85gal === 5.3, p3);
// Bias: a sensor reading 2 high, target is the reading; plan lands at the target reading
const car = { dte_a: 0.95, dte_b: 20, bias: 2, bias_basis: 10 };
const p4 = C.plan({ dte: 35, sensor: 40, target: 40, tuneLimit: 50, e85: 70, e85Sd: 2, gasEth: 10, car });
t("bias-aware plan lands on target reading", Math.abs(p4.predicted - 40) < 0.3, p4);
// E70 target unreachable with E66 pump fuel
const p5 = C.plan({ dte: 35, sensor: 40, target: 70, tuneLimit: 85, e85: 66, e85Sd: 2, gasEth: 10, car: null });
t("E70 with E66 fuel clamps to all E85", p5.clamped === "full" && p5.predicted < 66, p5);
// Rich tank: gas only, and refuse when even all gas is over the cap
const p6 = C.plan({ dte: 300, sensor: 58, target: 40, tuneLimit: 50, e85: 70, e85Sd: 2, gasEth: 10, car: null });
t("rich tank near limit -> zero E85 and over cap", p6.clamped === "zero" && p6.overCap, p6);
// Ethanol-free and E15 gas
t("ethanol-free gas = 0", C.gasEthanol({ ethanolFree: true }, 93) === 0, null);
t("88 octane = E15", C.gasEthanol({}, 88) === 15, null);
// Bands
t("E43 at E40 target is on target", C.bandOf(43, 40, 50) === "on", null);
t("E44 is high", C.bandOf(44, 40, 50) === "high", null);
t("E36 is low", C.bandOf(36, 40, 50) === "low", null);
t("E48 with E50 tune is danger", C.bandOf(48, 40, 50) === "danger", null);
// Receipt text parsing
const r = C.parseReceiptText(`MOTOMART #1234\n6328 E LLOYD EXPY\nEVANSVILLE IN\n11/05/26 5:41 PM\nPUMP 04 E85 FLEX FUEL\nGALLONS 5.312\nPRICE/GAL $2.379\nFUEL SALE $12.64\nVISA ****1234`);
t("receipt: gallons/price/total/fuel/date/station", r.gallons === 5.312 && r.price === 2.379 && r.total === 12.64 && r.fuel === "e85" && r.date === "2026-11-05" && /MOTOMART/.test(r.station) && r.confident, r);
const r2 = C.parseReceiptText(`COSTCO WHOLESALE\nCROSS POINTE\nPUMP 7 PREMIUM\n5.100 G @ 3.299\nTOTAL 16.82`);
t("receipt: premium -> gas 93 and @ price", r2.fuel === "gas" && r2.octane === 93 && r2.gallons === 5.1 && r2.price === 3.299 && r2.total === 16.82, r2);
// Oil status
const os = C.oilStatus([{ date: "2026-05-18", odometer: 43580 }], [{ odometer: 46340 }], { oilMiles: 3000, oilMonths: 6 }, "2026-11-06");
t("oil due soon: 240 mi / 12 days", os.milesLeft === 240 && os.daysLeft === 12 && os.level === "soon", os);
// E85 assumption sources
const a1 = C.e85Assumption({ which: "primary", settings: { primaryE85: "MotoMart E Lloyd" }, myStations: [{ station_key: "motomart e lloyd", value: 66.4, sd: 1.8, n_total: 40, n_mine: 9, last_value: 64, last_date: "2026-10-30" }], today: "2026-11-06" });
t("assumption from my station", a1.source === "learned" && /by you and other owners/.test(a1.why), a1);
const a2 = C.e85Assumption({ which: "other", settings: {}, today: "2026-11-06" });
t("assumption default winter", a2.value === 70 && a2.source === "default", a2);
// Stations from the shared list are matched by id, so a renamed station keeps its learning.
const ID = "8a1f0c2e-0000-4000-8000-000000000001";
t("station key by id", C.keyFor(ID, "Anything") === "id:" + ID && C.keyFor("", "MotoMart E Lloyd") === "motomart e lloyd", C.keyFor(ID, "x"));
const a3 = C.e85Assumption({ which: "primary", settings: { primaryE85: "MotoMart · E Lloyd Expy", primaryE85Id: ID }, myStations: [{ station_key: "id:" + ID, value: 67, sd: 2, n_total: 5, n_mine: 5 }], today: "2026-11-06" });
t("primary station learned by id", a3.source === "learned" && a3.value === 67, a3);
const a4 = C.e85Assumption({ which: "other", other: { id: ID, name: "Speedway" }, settings: {}, stations: [{ station_key: "id:" + ID, value: 72, sd: 3, n_fills: 14 }], today: "2026-11-06" });
t("other station uses community estimate", a4.source === "community" && a4.value === 72, a4);
const a5 = C.e85Assumption({ which: "other", other: { id: ID, name: "Speedway" }, settings: {}, car: { regional_value: 68, regional_sd: 4 }, today: "2026-11-06" });
t("other station with no data falls back to regional", a5.source === "regional" && a5.value === 68, a5);
