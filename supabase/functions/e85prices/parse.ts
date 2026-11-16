// Turns the E85prices.com station map (Renewable Fuels Association) into rows for the shared station list.
// Pure functions, tested on their own. Usernames on the site are never kept.
export const BRANDS = [
  "7-Eleven", "ARCO", "BP", "Break Time", "Bucky's", "Buc-ee's", "Casey's", "Cenex", "Chevron", "Circle K", "Citgo", "Clark", "Conoco",
  "Costco", "CountryMark", "Exxon", "Family Express", "Fareway", "Fas Mart", "Flying J", "Gas America", "GetGo", "Gulf", "Holiday", "Huck's",
  "Hy-Vee", "Kroger", "Kum & Go", "Kwik Fill", "Kwik Shop", "Kwik Star", "Kwik Trip", "Love's", "Marathon", "Maverik", "Meijer", "Mobil",
  "MotoMart", "Murphy USA", "Phillips 66", "Pilot", "QuikTrip", "RaceTrac", "Ricker's", "Road Ranger", "Sam's Club", "Sheetz", "Shell",
  "Sinclair", "Speedway", "Spinx", "Sunoco", "Thorntons", "Tom Thumb", "Valero", "Walmart", "Wawa",
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RE = BRANDS.map((b) => [b, new RegExp(`(^|[^a-z])${esc(b.toLowerCase()).replace(/'/g, "'?")}([^a-z]|$)`)] as const);
export function brandOf(name: string): string {
  const lower = name.toLowerCase();
  const hit = BRAND_RE.find(([, re]) => re.test(lower));
  if (hit) return hit[0];
  return name.replace(/\s*(#|no\.?|store)\s*\d+.*$/i, "").replace(/\s+\d+$/, "").trim().slice(0, 60) || name.slice(0, 60);
}

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decode = (s: unknown) => String(s ?? "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
  .replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

// The page carries every station in one script variable: var dbMarkers = [ ... ];
export function extractMarkers(html: string): Record<string, unknown>[] {
  const start = html.indexOf("var dbMarkers");
  if (start < 0) throw new Error("station list not found on the page");
  const open = html.indexOf("[", start);
  let depth = 0, inStr = false, escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(open, i + 1)); }
  }
  throw new Error("station list is cut off");
}

// "07.07.2025" -> "2025-07-07"
export function priceDate(ts: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(ts ?? "").trim());
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

// A few listings have latitude and longitude swapped, or the minus sign missing from the longitude. Those are put
// right; anything else outside the U.S. (lat 17 to 72, lon -180 to -64), or with both numbers the same, is skipped.
export function fixCoords(lat: number, lon: number): [number, number] | null {
  if (lat === lon) return null;
  if (lat < 0 && lon >= 17 && lon <= 72) [lat, lon] = [lon, lat];
  if (lat >= 17 && lat <= 72 && lon >= 64 && lon <= 180) lon = -lon;
  return lat >= 17 && lat <= 72 && lon >= -180 && lon <= -64 ? [lat, lon] : null;
}

type Marker = Record<string, unknown> & { price_data?: { price_e85?: unknown; timestamp?: unknown } | null };
export function rowOf(m: Marker) {
  if (String(m.active ?? "1") !== "1") return null;
  const id = Number(m.id), lat = Number(m.lat), lon = Number(m.lng);
  const name = decode(m.name), street = decode(m.address);
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  if (m.lat === null || m.lat === undefined || m.lat === "" || m.lng === null || m.lng === undefined || m.lng === "") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const at = fixCoords(lat, lon);
  if (!at) return null;
  const p = m.price_data || null, price = p ? Number(p.price_e85) : NaN;
  const ok = Number.isFinite(price) && price > 0.5 && price < 10;
  return {
    e85p_id: id, name: name.slice(0, 120), brand: brandOf(name), street: street.slice(0, 80) || null,
    city: decode(m.city_name).slice(0, 60) || null, state: STATES[decode(m.state_name).toLowerCase().replace(/-/g, " ")] ?? null, lat: at[0], lon: at[1],
    price: ok ? Math.round(price * 1000) / 1000 : null, price_date: ok ? priceDate(p!.timestamp) : null,
  };
}

// RFA allows the download on Sundays between 11 PM and 4 AM Central (Sunday night into Monday).
export function inWindow(now = new Date()): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hourCycle: "h23" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const h = Number(parts.hour) % 24;
  return (parts.weekday === "Sun" && h >= 23) || (parts.weekday === "Mon" && h < 4);
}
