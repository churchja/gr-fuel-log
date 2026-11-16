import { brandOf, decode, extractMarkers, fixCoords, inWindow, priceDate, rowOf } from "../supabase/functions/e85prices/parse.ts";
const t = (name: string, ok: boolean, got: unknown) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(got)}`); if (!ok) process.exitCode = 1; };

// The map page keeps every station in one script variable. Strings can hold brackets and escaped quotes.
const html = `<script>var enabledBlenders = [1,2];
var dbMarkers = [{"id":"8147","name":"Casey&#39;s General Store","active":"1","address":"2031 N Cross Pointe Blvd","city_name":"Evansville","state_name":"Indiana","lng":"-87.4666143","lat":"37.9951793","price_data":{"price_e85":2.9700000000000002,"username":"someone","timestamp":"02.24.2022"}},
{"id":"10380","name":"Thorntons [E Morgan] \\"new\\"","active":"1","address":"2401 E Morgan Ave","city_name":"Evansville","state_name":"Indiana","lng":"-87.51896","lat":"37.99134","price_data":null},
{"id":"5","name":"Old Station","active":"0","address":"1 Main St","city_name":"X","state_name":"Ohio","lng":"-80","lat":"40","price_data":null},
{"id":"6","name":"Nowhere","active":"1","address":"","city_name":"","state_name":"South-Dakota","lng":"","lat":"","price_data":null},
{"id":"7","name":"Cenex","active":"1","address":"200 Hwy 7 W","city_name":"Clara City","state_name":"North-Dakota","lng":"-95.36","lat":"44.95","price_data":{"price_e85":"2.19","username":"x","timestamp":"11.02.2026"}}];
var other = 1;</script>`;
const ms = extractMarkers(html);
t("extract: all markers", ms.length === 5 && ms[1].name === 'Thorntons [E Morgan] "new"', ms.length);
const rows = ms.map(rowOf);
const c = rows[0];
t("row: entities decoded, brand, state code, price and date", !!c && c.name === "Casey's General Store" && c.brand === "Casey's" && c.state === "IN" && c.price === 2.97 && c.price_date === "2022-02-24" && c.e85p_id === 8147, c);
t("row: no price", !!rows[1] && rows[1].price === null && rows[1].price_date === null && rows[1].brand === "Thorntons", rows[1]);
t("row: inactive skipped", rows[2] === null, rows[2]);
t("row: no location skipped", rows[3] === null, rows[3]);
t("row: hyphenated state, price as text", !!rows[4] && rows[4].state === "ND" && rows[4].price === 2.19 && rows[4].price_date === "2026-11-02", rows[4]);
t("row: usernames never kept", rows.every((r) => !r || !("username" in r)), rows[0]);
t("decode", decode("Kum &amp; Go  #12") === "Kum & Go #12" && decode("Huck&#x27;s") === "Huck's", decode("Kum &amp; Go  #12"));
t("price date", priceDate("07.07.2025") === "2025-07-07" && priceDate("13.01.2025") === null && priceDate("") === null, priceDate("07.07.2025"));
t("brand", brandOf("Caseys General Store") === "Casey's" && brandOf("CountryMark") === "CountryMark" && brandOf("Freedom Valu Center") === "Freedom Valu Center", brandOf("Caseys General Store"));
t("extract: missing list throws", (() => { try { extractMarkers("<html></html>"); return false; } catch { return true; } })(), null);

// RFA's window: Sunday 11 PM to Monday 4 AM Central, through daylight saving time.
const w = (iso: string) => inWindow(new Date(iso));
t("window: Sun 11:30 PM CST in", w("2026-11-23T05:30:00Z"), null);
t("window: Sun 10:30 PM CST out", !w("2026-11-23T04:30:00Z"), null);
t("window: Mon 3:59 AM CST in, 4:00 AM out", w("2026-11-23T09:59:00Z") && !w("2026-11-23T10:00:00Z"), null);
t("window: Sun 11:30 PM CDT in", w("2026-06-01T04:30:00Z"), null);
t("window: Saturday night out", !w("2026-11-22T05:30:00Z"), null);

// Listings with swapped coordinates or a missing minus sign are put right; unusable ones are skipped.
const fc = (a: number, b: number) => JSON.stringify(fixCoords(a, b));
t("coords: swapped (Louisville)", fc(-85.5768670141697, 38.2857420777273) === JSON.stringify([38.2857420777273, -85.5768670141697]), fc(-85.5768670141697, 38.2857420777273));
t("coords: missing minus (Fayetteville AR)", fc(36.05349, 94.13428) === JSON.stringify([36.05349, -94.13428]), fc(36.05349, 94.13428));
t("coords: both the same skipped", fixCoords(41.865565, 41.865565) === null && fixCoords(-86.624148, -86.624148) === null, null);
t("coords: garbled longitude skipped (Mesa AZ -11.86)", fixCoords(33.37969, -11.85907) === null, fc(33.37969, -11.85907));
t("coords: normal, Hawaii and Alaska kept", fc(37.99, -87.51) === "[37.99,-87.51]" && fixCoords(21.3, -157.8) !== null && fixCoords(61.2, -149.9) !== null, null);
t("row: swapped coordinates fixed", (rowOf({ id: "4171", name: "Thorntons", active: "1", address: "9400 Westport Rd", city_name: "Louisville", state_name: "Kentucky", lat: "-85.5768670141697", lng: "38.2857420777273", price_data: null }) || { lat: 0 }).lat === 38.2857420777273, null);
