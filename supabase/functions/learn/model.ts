// GR Fuel Log learning model. Pure functions, no I/O, so it can be tested on its own.
//
// Each fill gives one noisy measurement of the E85 strength at the station where it was pumped:
//   E_raw = (T*m - R*Cb - sum(gas gallons * gas ethanol)) / X  =  E_station + bias * P / X + noise
// where m is the settled blend reading, Cb the reading before the fill, R the fuel left before the fill,
// P the gallons pumped, X the E85 gallons and T = R + P the tank after the fill. "bias" is how far the
// owner's flex sensor reads high or low. Each station's strength is tracked over time with a Kalman
// filter (it drifts slowly and can jump at a blend switch); each owner's sensor bias is estimated from
// how their readings sit against other owners' readings at the same stations.

export const TANK = 13.2;
const Q_PER_DAY = 0.03;        // drift of a station's E85 strength, variance per day
const JUMP_VAR = 49;           // variance added when a blend switch is confirmed
const MODEL_VAR = 0.25;        // floor for model error
const BIAS_PRIOR_VAR = 4;      // sensor bias prior: N(0, 2^2)
const BIAS_LIMIT = 5;

export type Stop = { station?: string; station_id?: string; kind?: string; fuel?: string; ethanol?: number | null; gallons?: number | null };
export type Fill = {
  id: string; user_id: string; date: string; odometer: number; dte: number | null;
  sensor_before: number | null; sensor_after: number | null; full: boolean; stops: Stop[];
};
export type Owner = { id: string; share: boolean; gasEthanol: number; learnSince: string | null };
export type Obs = {
  owner: string; station: string; name: string; day: number; date: string; eraw: number; k: number; v: number;
  cb: number; r: number; t: number; x: number; ge: number; m: number;
};

export const stationKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Stations picked from the shared list carry an id, so every owner's fills there land on the same track.
export const keyFor = (id: string | undefined, name: string) => (id ? "id:" + id : stationKey(name));
const dayOf = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const kindOf = (s: Stop) => (s.kind ?? (s.fuel === "E85" ? "e85" : s.fuel === "93" || s.fuel === "gas" ? "gas" : "other")).toLowerCase();

export function seasonalDefault(day: number): number {
  const m = new Date(day * 86400000).getUTCMonth() + 1;
  return m >= 4 && m <= 9 ? 85 : 70;
}

export function tankParts(f: Fill, gasEthanol: number) {
  let x = 0, p = 0, ge = 0, big = 0, station = "", stationId = "";
  for (const s of f.stops ?? []) {
    const g = num(s.gallons) ?? 0;
    if (g <= 0) continue;
    p += g;
    const k = kindOf(s);
    if (k === "e85") { x += g; if (g > big) { big = g; station = s.station ?? ""; stationId = s.station_id ?? ""; } }
    else ge += g * (num(s.ethanol) ?? (k === "gas" ? gasEthanol : 10));
  }
  return { x, p, ge, station, stationId };
}

// One owner's fills, sorted, turned into measurements of station strength.
export function observations(owner: Owner, fills: Fill[]): Obs[] {
  const out: Obs[] = [];
  const fs = fills.filter((f) => !owner.learnSince || f.date >= owner.learnSince);
  fs.forEach((f, i) => {
    const next = fs[i + 1];
    const cb = num(f.sensor_before);
    if (!f.full || cb === null) return;
    const { x, p, ge, station, stationId } = tankParts(f, owner.gasEthanol);
    if (x < 1 || (!station.trim() && !stationId)) return;
    if (TANK - p < -0.5) return;
    let m: number | null = null, settled = false;
    const gap = next ? Number(next.odometer) - Number(f.odometer) : Infinity;
    if (next && num(next.sensor_before) !== null && gap > 0 && gap <= 450) { m = num(next.sensor_before); settled = true; }
    else if (num(f.sensor_after) !== null) m = num(f.sensor_after);
    if (m === null) return;
    const r = Math.max(0, TANK - p), t = r + p;
    const eraw = (t * m - r * cb - ge) / x;
    if (!(eraw >= 35 && eraw <= 100)) return;
    const sm = settled ? 1.0 : 2.0, sb = 1.0;
    out.push({
      owner: owner.id, station: keyFor(stationId, station), name: station.trim() || "E85 station", day: dayOf(f.date), date: f.date,
      eraw, k: p / x, v: (t * t * sm * sm + r * r * sb * sb) / (x * x) + MODEL_VAR, cb, r, t, x, ge, m,
    });
  });
  return out;
}

type Track = {
  x: number; p: number; day: number; n: number; owners: Set<string>; names: Map<string, number>; last: number;
  pending: { day: number; y: number; v: number; from: number; sign: number; i: number } | null;
  sw: { day: number; from: number; to: number } | null;
};
export type Pred = { x: number; p: number };

// Runs every station's filter over the observations in time order, with the given sensor biases.
// Returns, per observation: the prediction before it was used (honest accuracy), a smoothed station
// level that also uses later fills (for fitting sensor biases), and whether it sat at a blend switch.
export function runFilters(obs: Obs[], bias: Map<string, number>) {
  const tracks = new Map<string, Track>();
  const preds: Pred[] = [];
  const flags: ("normal" | "pending" | "switch")[] = [];
  const steps = new Map<string, { i: number; xp: number; pp: number; xf: number; pf: number }[]>();
  const update = (s: Track, y: number, v: number) => { const k = s.p / (s.p + v); s.x += k * (y - s.x); s.p *= 1 - k; };
  obs.forEach((o, i) => {
    let s = tracks.get(o.station);
    if (!s) {
      const recent = [...tracks.values()].filter((t) => o.day - t.last <= 90);
      const prior = recent.length ? recent.reduce((a, t) => a + t.x, 0) / recent.length : seasonalDefault(o.day);
      s = { x: prior, p: recent.length ? 36 : 64, day: o.day, n: 0, owners: new Set(), names: new Map(), last: o.day, pending: null, sw: null };
      tracks.set(o.station, s);
    }
    s.p += Q_PER_DAY * Math.max(0, o.day - s.day);
    s.day = o.day;
    preds.push({ x: s.x, p: s.p });
    const y = o.eraw - (bias.get(o.owner) ?? 0) * o.k;
    const nu = y - s.x, S = s.p + o.v, big = nu * nu > 9 * S;
    let xp = s.x, pp = s.p;
    if (big && s.pending && Math.sign(nu) === s.pending.sign) {
      // Second reading in a row far off in the same direction: the station switched blends.
      const from = s.pending.from;
      s.p += JUMP_VAR; pp = s.p;
      update(s, s.pending.y, s.pending.v);
      update(s, y, o.v);
      s.sw = { day: s.pending.day, from, to: s.x };
      flags[s.pending.i] = "switch";
      flags.push("switch");
      s.pending = null;
    } else if (big) {
      // First far-off reading: could be a bad reading or a switch. Count it lightly until the next one.
      s.pending = { day: o.day, y, v: o.v, from: s.x, sign: Math.sign(nu), i };
      update(s, y, o.v * 10);
      flags.push("pending");
    } else {
      s.pending = null;
      update(s, y, o.v);
      flags.push("normal");
    }
    (steps.get(o.station) ?? steps.set(o.station, []).get(o.station)!).push({ i, xp, pp, xf: s.x, pf: s.p });
    s.n++; s.owners.add(o.owner); s.last = o.day;
    s.names.set(o.name, (s.names.get(o.name) ?? 0) + 1);
  });
  // Rauch-Tung-Striebel smoother, per station (a confirmed switch adds variance, so no smoothing across it).
  const smooth: number[] = new Array(obs.length).fill(0);
  for (const st of steps.values()) {
    let xs = st[st.length - 1].xf;
    smooth[st[st.length - 1].i] = xs;
    for (let j = st.length - 2; j >= 0; j--) {
      const c = st[j].pf / st[j + 1].pp;
      xs = st[j].xf + c * (xs - st[j + 1].xp);
      smooth[st[j].i] = xs;
    }
  }
  return { tracks, preds, smooth, flags };
}

// Sensor bias for each owner in `fit`, holding the others' biases as given. Uses the smoothed station
// level, skips readings at a blend switch and clips outliers, so a switch is not mistaken for a sensor offset.
export function fitBiases(obs: Obs[], fit: Set<string>, start: Map<string, number>, iterations = 8) {
  const bias = new Map(start);
  const sd = new Map<string, number>();
  for (let it = 0; it < iterations; it++) {
    const { smooth, flags } = runFilters(obs, bias);
    const acc = new Map<string, { n: number; d: number }>();
    obs.forEach((o, i) => {
      if (!fit.has(o.owner) || flags[i] !== "normal") return;
      const resid = o.eraw - smooth[i];
      if (Math.abs(resid) > 4 * Math.sqrt(o.v) + BIAS_LIMIT * o.k) return;
      const w = 1 / o.v;
      const a = acc.get(o.owner) ?? { n: 0, d: 0 };
      a.n += w * o.k * resid;
      a.d += w * o.k * o.k;
      acc.set(o.owner, a);
    });
    for (const id of fit) {
      const a = acc.get(id) ?? { n: 0, d: 0 };
      const den = a.d + 1 / BIAS_PRIOR_VAR;
      bias.set(id, Math.max(-BIAS_LIMIT, Math.min(BIAS_LIMIT, a.n / den)));
      sd.set(id, Math.sqrt(1 / den));
    }
  }
  return { bias, sd };
}

// How many other owners' readings back up an owner's sensor offset (0 = can't tell sensor from fuel).
export function biasBasis(obs: Obs[], owner: string): number {
  const mine = new Set(obs.filter((o) => o.owner === owner).map((o) => o.station));
  return obs.filter((o) => o.owner !== owner && mine.has(o.station)).length;
}

// Fuel left = a + DTE * m, fitted per car with a prior centered on the original formula (0.95 + DTE / 20).
export function fitDte(points: { dte: number; r: number }[]) {
  const pts = points.slice(-15);
  const s2 = 0.35 * 0.35;
  // prior precision (diagonal) and mean
  let l00 = 1 / 0.25, l01 = 0, l11 = 1 / 0.0001;
  let b0 = 0.95 * l00, b1 = 0.05 * l11;
  for (const q of pts) { l00 += 1 / s2; l01 += q.dte / s2; l11 += (q.dte * q.dte) / s2; b0 += q.r / s2; b1 += (q.dte * q.r) / s2; }
  const det = l00 * l11 - l01 * l01;
  let a = (l11 * b0 - l01 * b1) / det, m = (l00 * b1 - l01 * b0) / det;
  m = Math.min(1 / 10, Math.max(1 / 40, m)); a = Math.min(3, Math.max(0, a));
  const v35 = (l11 - 2 * 35 * l01 + 35 * 35 * l00) / det; // predictive variance of the mean at DTE 35
  return { a, b: 1 / m, sd: Math.sqrt(s2 + Math.max(0, v35)), n: pts.length };
}

export const predictedBlend = (o: Obs, stationX: number, bias: number) => bias * (1 - o.r / o.t) + (o.r * o.cb + o.x * stationX + o.ge) / o.t;

export function summarizeTrack(key: string, t: Track) {
  const name = [...t.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
  const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
  return {
    station_key: key, display_name: name, value: t.x, sd: Math.sqrt(t.p), n_fills: t.n, n_owners: t.owners.size,
    last_obs: iso(t.last), switch_date: t.sw ? iso(t.sw.day) : null, switch_from: t.sw?.from ?? null, switch_to: t.sw?.to ?? null,
  };
}
