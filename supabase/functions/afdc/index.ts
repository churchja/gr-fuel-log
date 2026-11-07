// Loads the U.S. DOE Alternative Fuels Data Center list of public E85 stations (through the USDOT open data
// service, no key needed) into the shared station list. Runs weekly from the database; stations get a standard
// Brand · Street name from the government address. Members' fills still decide what a station really sells.
import { adminClient, fromDatabase } from "./common.ts";
import { rowOf } from "./parse.ts";

type Attr = Record<string, unknown>;

const SERVICE = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/Alternative_Fueling_Stations/FeatureServer/0/query";
const PAGE = 2000;
async function page(offset: number): Promise<Attr[]> {
  const q = new URLSearchParams({
    where: "fuel_type_code='E85' AND status_code IN ('E','T') AND access_code='public'",
    outFields: "id,station_name,street_address,city,state,zip,latitude,longitude,status_code,e85_blender_pump,e85_other_ethanol_blends,access_days_time,groups_with_access_code,date_last_confirmed",
    returnGeometry: "false", orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(PAGE), f: "json",
  });
  const res = await fetch(`${SERVICE}?${q}`, { headers: { "User-Agent": "GR-Fuel-Log/1.0 (https://fuel.shadyacres.my)" }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`USDOT service ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`USDOT service: ${body.error.message ?? "error"}`);
  return (body.features ?? []).map((f: { attributes: Attr }) => f.attributes);
}

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });
  const started = new Date().toISOString();
  const rows: NonNullable<ReturnType<typeof rowOf>>[] = [];
  const seen = new Set<number>();
  try {
    for (let offset = 0; offset < 20000; offset += PAGE) {
      const attrs = await page(offset);
      for (const a of attrs) { const r = rowOf(a); if (r && !seen.has(r.afdc_id)) { seen.add(r.afdc_id); rows.push(r); } }
      if (attrs.length < PAGE) break;
    }
  } catch (e) {
    console.error("afdc fetch failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "source_unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  // A partial download would wrongly remove stations, so stop if the list looks far too short.
  if (rows.length < 1000) return new Response(JSON.stringify({ error: "too_few_rows", rows: rows.length }), { status: 502, headers: { "Content-Type": "application/json" } });
  let saved = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await db.rpc("import_afdc", { p_rows: rows.slice(i, i + 1000) });
    if (error) { console.error("import failed", error.message); return new Response(JSON.stringify({ error: "save_failed" }), { status: 500 }); }
    saved += Number(data) || 0;
  }
  const { data: finish, error } = await db.rpc("finish_afdc", { p_started: started });
  if (error) console.error("finish failed", error.message);
  return new Response(JSON.stringify({ ok: true, listed: rows.length, saved, ...(finish ?? {}) }), { headers: { "Content-Type": "application/json" } });
});
