// Fills the shared station list from OpenStreetMap for the area around a point.
// The map is cut into 0.1-degree tiles; each tile is fetched at most once a month, so most calls only touch our own database.
// Called by the app (signed-in, approved owners) or by the database with the shared function secret.
import { adminClient, corsHeaders, fromDatabase, json } from "./common.ts";

const TILE = 0.1;                       // degrees, about 11 km north-south
const FRESH_DAYS = 30;                  // refetch a tile after this long
const MAX_TILES_PER_HOUR = 60;          // be a good citizen on the free Overpass service
// Public Overpass servers, quickest to refuse first. The last one is slow but dependable, so it gets the time that's left.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const PER_SERVER_MS = 25000;
const BUDGET_MS = 135000;               // edge functions stop at 150 s
const AGENT = "GR-Fuel-Log/1.0 (https://fuel.shadyacres.my; fuel@shadyacres.my)";

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const tileOf = (lat: number, lon: number) => `${Math.floor(lat / TILE)}:${Math.floor(lon / TILE)}`;
function tilesAround(lat: number, lon: number, radiusM: number) {
  const dLat = radiusM / 111000, dLon = radiusM / (111000 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const out = new Set<string>();
  for (let a = Math.floor((lat - dLat) / TILE); a <= Math.floor((lat + dLat) / TILE); a++) {
    for (let b = Math.floor((lon - dLon) / TILE); b <= Math.floor((lon + dLon) / TILE); b++) out.add(`${a}:${b}`);
  }
  return [...out];
}
const bboxOf = (tile: string) => {
  const [a, b] = tile.split(":").map(Number);
  return [a * TILE, b * TILE, (a + 1) * TILE, (b + 1) * TILE].map((v) => v.toFixed(4)).join(",");
};

export function stationRow(el: El) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  // Skip pumps the public can't use (fleet yards, utilities) and closed stations.
  if (["private", "no"].includes(t.access ?? "") || t["disused:amenity"] || t["abandoned:amenity"]) return null;
  const fuel: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) if (k.startsWith("fuel:")) fuel[k] = v;
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;
  return {
    source: "osm", osm_type: el.type, osm_id: el.id,
    name: (t.name || t.brand || t.operator || "Gas station").slice(0, 120),
    osm_named: Boolean(t.name || t.brand || t.operator),
    brand: t.brand ?? null, street, city: t["addr:city"] ?? null, state: t["addr:state"] ?? null, postcode: t["addr:postcode"] ?? null,
    lat, lon, osm_fuel: fuel, updated_at: new Date().toISOString(),
  };
}

async function overpass(tiles: string[]): Promise<El[]> {
  const q = `[out:json][timeout:60];(${tiles.map((t) => `nwr["amenity"="fuel"](${bboxOf(t)});`).join("")});out center tags;`;
  let lastErr = "";
  const started = Date.now();
  for (const [n, url] of ENDPOINTS.entries()) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 5000) break;
    const wait = n === ENDPOINTS.length - 1 ? left : Math.min(PER_SERVER_MS, left);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Accept": "application/json", "User-Agent": AGENT, "Referer": "https://fuel.shadyacres.my/" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(wait) });
      if (!res.ok) { lastErr = `${url} ${res.status}`; console.warn("overpass", lastErr); continue; }
      const body = await res.json();
      return (body.elements ?? []) as El[];
    } catch (e) { lastErr = `${url} ${e instanceof Error ? e.message : e}`; console.warn("overpass", lastErr); }
  }
  throw new Error(lastErr || "overpass unavailable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const db = adminClient();

  if (!(await fromDatabase(req, db))) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) return json(req, { error: "sign_in_required" }, 401);
    const { data: profile } = await db.from("profiles").select("status").eq("id", auth.user.id).single();
    if (!profile || profile.status !== "approved") return json(req, { error: "not_approved" }, 403);
  }

  let body: { lat?: number; lon?: number; radius?: number };
  try { body = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const lat = Number(body.lat), lon = Number(body.lon), radius = Math.min(Math.max(Number(body.radius) || 3000, 500), 20000);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(req, { error: "bad_location" }, 400);
  // North America only: the app is for US and Canadian GR Corolla owners, and it keeps the cache small.
  if (lat < 15 || lat > 72 || lon < -170 || lon > -50) return json(req, { ok: true, synced: 0, outside: true });

  const wanted = tilesAround(lat, lon, radius);
  const since = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString();
  const { data: fresh } = await db.from("station_tiles").select("tile").in("tile", wanted).gte("synced_at", since);
  const have = new Set((fresh ?? []).map((r) => r.tile));
  const todo = wanted.filter((t) => !have.has(t));
  if (!todo.length) return json(req, { ok: true, synced: 0 });

  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count: recent } = await db.from("station_tiles").select("tile", { count: "exact", head: true }).gte("synced_at", hourAgo);
  if ((recent ?? 0) + todo.length > MAX_TILES_PER_HOUR) return json(req, { ok: true, synced: 0, throttled: true });

  let elements: El[];
  try { elements = await overpass(todo); }
  catch (e) {
    console.error("overpass failed", e instanceof Error ? e.message : e);
    return json(req, { error: "map_unavailable" }, 502);
  }
  const rows = elements.map(stationRow).filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("stations").upsert(rows.slice(i, i + 200), { onConflict: "osm_type,osm_id" });
    if (error) { console.error("upsert failed", error.message); return json(req, { error: "save_failed" }, 500); }
  }
  // Stations that left the map (closed, or now marked private) are dropped, unless an owner has logged a fill there.
  const keep = new Set(rows.map((r) => `${r.osm_type}/${r.osm_id}`));
  for (const t of todo) {
    const [s, w, n, e] = bboxOf(t).split(",").map(Number);
    const { data: old } = await db.from("stations").select("id, osm_type, osm_id").eq("source", "osm").gte("lat", s).lt("lat", n).gte("lon", w).lt("lon", e);
    for (const o of old ?? []) {
      if (keep.has(`${o.osm_type}/${o.osm_id}`)) continue;
      const { count } = await db.from("fills").select("id", { count: "exact", head: true }).contains("stops", [{ station_id: o.id }]);
      if (!count) await db.from("stations").delete().eq("id", o.id);
    }
  }
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(tileOf(r.lat, r.lon), (counts.get(tileOf(r.lat, r.lon)) ?? 0) + 1);
  await db.from("station_tiles").upsert(todo.map((t) => ({ tile: t, synced_at: new Date().toISOString(), n_stations: counts.get(t) ?? 0 })));
  return json(req, { ok: true, synced: todo.length, stations: rows.length });
});
