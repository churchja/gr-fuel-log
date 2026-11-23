// Loads the GeoNames list of U.S. ZIP codes (CC BY 4.0, https://www.geonames.org) into zip_places, so station
// search can turn a ZIP code or town into a spot on the map. Only the database can call it; run it again to refresh.
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import { adminClient, fromDatabase } from "./common.ts";

const SOURCE = "https://download.geonames.org/export/zip/US.zip";
const key = (s: string) => s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });
  const res = await fetch(SOURCE, { headers: { "User-Agent": "GR-Fuel-Log/1.0 (https://fuel.shadyacres.my)" }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) return new Response(JSON.stringify({ error: `geonames ${res.status}` }), { status: 502 });
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const text = strFromU8(files["US.txt"]);
  const rows = [];
  for (const line of text.split("\n")) {
    const f = line.split("\t");
    const [zip, city, st, lat, lon] = [f[1], f[2], f[4], Number(f[9]), Number(f[10])];
    if (!/^\d{5}$/.test(zip ?? "") || !city || !/^[A-Z]{2}$/.test(st ?? "") || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    rows.push({ zip, city, state: st, lat, lon, city_key: key(city) });
  }
  // A short file would mean a bad download; keep what's there.
  if (rows.length < 30000) return new Response(JSON.stringify({ error: "too_few", rows: rows.length }), { status: 502 });
  let saved = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await db.from("zip_places").upsert(rows.slice(i, i + 2000), { onConflict: "zip" });
    if (error) return new Response(JSON.stringify({ error: error.message, saved }), { status: 500 });
    saved += Math.min(2000, rows.length - i);
  }
  return new Response(JSON.stringify({ ok: true, saved }), { headers: { "Content-Type": "application/json" } });
});
