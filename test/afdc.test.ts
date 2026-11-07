import { brandOf, rowOf } from "../supabase/functions/afdc/parse.ts";
const t = (name: string, ok: boolean, got: unknown) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(got)}`); if (!ok) process.exitCode = 1; };
for (const [n, want] of [["Thorntons #83", "Thorntons"], ["Casey's", "Casey's"], ["Meijer Express Gas Station #287", "Meijer"], ["KWIK TRIP #1234", "Kwik Trip"],
  ["BP - Main St", "BP"], ["Joe's Fuel Stop 12", "Joe's Fuel Stop"], ["Bobs Mart Store 7", "Bobs Mart"], ["Sheetz", "Sheetz"]] as const) t(`brand of ${n}`, brandOf(n) === want, brandOf(n));
const r = rowOf({ id: 446137, station_name: "Thorntons #83", street_address: "701 S Green River Rd", city: "Evansville", state: "IN", zip: "47715",
  latitude: 37.9676, longitude: -87.49317, status_code: "E", e85_blender_pump: 1, e85_other_ethanol_blends: '["E15"]', access_days_time: "24 hours daily", date_last_confirmed: 1791849600000 });
t("row", !!r && r.brand === "Thorntons" && r.street === "701 S Green River Rd" && r.afdc.blender && r.afdc.blends[0] === "E15" && r.afdc.confirmed === "2026-10", r);
t("row without location", rowOf({ id: 1, station_name: "X", latitude: null, longitude: null }) === null, null);
