// Turns USDOT / AFDC station records into rows for the shared station list. Pure functions, tested on their own.
export const BRANDS = [
  "7-Eleven", "BP", "Break Time", "Bucky's", "Buc-ee's", "Casey's", "Cenex", "Chevron", "Circle K", "Citgo", "Costco", "Exxon",
  "Family Express", "Fareway", "Fas Mart", "Flying J", "Gas America", "GetGo", "Holiday", "Huck's", "Hy-Vee", "Kroger", "Kum & Go",
  "Kwik Fill", "Kwik Shop", "Kwik Star", "Kwik Trip", "Love's", "Marathon", "Maverik", "Meijer", "Mobil", "MotoMart", "Murphy USA",
  "Phillips 66", "Pilot", "QuikTrip", "RaceTrac", "Ricker's", "Sam's Club", "Sheetz", "Shell", "Sinclair", "Speedway", "Sunoco",
  "Thorntons", "Tom Thumb", "Valero", "Walmart", "Wawa",
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RE = BRANDS.map((b) => [b, new RegExp(`(^|[^a-z])${esc(b.toLowerCase())}([^a-z]|$)`)] as const);

export function brandOf(name: string): string {
  const lower = name.toLowerCase();
  const hit = BRAND_RE.find(([, re]) => re.test(lower));
  if (hit) return hit[0];
  return name.replace(/\s*(#|no\.?|store)\s*\d+.*$/i, "").replace(/\s+\d+$/, "").trim().slice(0, 60) || name.slice(0, 60);
}

type Attr = Record<string, unknown>;
export function rowOf(a: Attr) {
  const name = String(a.station_name ?? "").trim();
  if (a.latitude === null || a.latitude === undefined || a.longitude === null || a.longitude === undefined) return null;
  const lat = Number(a.latitude), lon = Number(a.longitude);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  let blends: string[] = [];
  try { blends = JSON.parse(String(a.e85_other_ethanol_blends ?? "[]")); } catch { blends = []; }
  const confirmed = typeof a.date_last_confirmed === "number" ? new Date(a.date_last_confirmed).toISOString().slice(0, 7) : null;
  return {
    afdc_id: Number(a.id), name: name.slice(0, 120), brand: brandOf(name), street: String(a.street_address ?? "").trim().slice(0, 80) || null,
    city: a.city ?? null, state: a.state ?? null, zip: a.zip ?? null, lat, lon,
    afdc: { listed: true, status: a.status_code, blender: a.e85_blender_pump === 1 || a.e85_blender_pump === true, blends,
            hours: a.access_days_time ?? null, access: a.groups_with_access_code ?? null, confirmed },
  };
}

