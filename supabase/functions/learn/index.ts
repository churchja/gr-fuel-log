// Recomputes everything the app has learned. Called by the database after fills or settings change.
import { adminClient, fromDatabase } from "./common.ts";
import { biasBasis, fitBiases, fitDte, observations, predictedBlend, runFilters, summarizeTrack, TANK, tankParts, type Fill, type Obs, type Owner } from "./model.ts";

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });

  const profiles = await all<{ id: string; status: string; flagged: boolean; settings: Record<string, unknown>; learn_since: string | null }>(
    (a, b) => db.from("profiles").select("id, status, flagged, settings, learn_since").eq("status", "approved").range(a, b));
  const fills = await all<Fill>((a, b) => db.from("fills")
    .select("id, user_id, date, odometer, dte, sensor_before, sensor_after, full, stops").order("date").order("odometer", { nullsFirst: true }).range(a, b));

  const owners = new Map<string, Owner & { flagged: boolean }>();
  for (const p of profiles) {
    const s = p.settings ?? {};
    const gasEthanol = s.ethanolFree ? 0 : Number(s.gasGrade) === 88 ? 15 : 10;
    owners.set(p.id, { id: p.id, share: Boolean(s.share), gasEthanol, learnSince: p.learn_since, flagged: p.flagged });
  }
  const byOwner = new Map<string, Fill[]>();
  for (const f of fills) if (owners.has(f.user_id)) (byOwner.get(f.user_id) ?? byOwner.set(f.user_id, []).get(f.user_id)!).push(f);

  const obsOf = new Map<string, Obs[]>();
  for (const [id, fs] of byOwner) obsOf.set(id, observations(owners.get(id)!, fs));
  const byDay = (a: Obs, b: Obs) => a.day - b.day;

  // Community: owners who share and are not flagged.
  const sharers = new Set([...owners.values()].filter((o) => o.share && !o.flagged).map((o) => o.id));
  const shared = [...sharers].flatMap((id) => obsOf.get(id) ?? []).sort(byDay);
  const fit = fitBiases(shared, sharers, new Map());
  const communityRun = runFilters(shared, fit.bias);
  const community = communityRun.tracks;
  const now = Math.floor(Date.now() / 86400000);
  const recent = [...community.values()].filter((t) => now - t.last <= 90);
  const regional = recent.length ? recent.reduce((a, t) => a + t.x, 0) / recent.length : null;
  const regionalSd = recent.length > 1 ? Math.sqrt(recent.reduce((a, t) => a + (t.x - regional!) ** 2, 0) / (recent.length - 1)) + 3 : 6;

  const stationRows = [...community.entries()].map(([k, t]) => ({ ...summarizeTrack(k, t), updated_at: new Date().toISOString() }));
  const myRows: Record<string, unknown>[] = [];
  const carRows: Record<string, unknown>[] = [];

  for (const [id, owner] of owners) {
    const mine = obsOf.get(id) ?? [];
    // Owners who don't share learn privately: community data plus their own fills, their own bias fitted.
    let bias = fit.bias.get(id) ?? 0, biasSd = fit.sd.get(id) ?? 2;
    let pool = shared;
    if (!sharers.has(id)) {
      pool = [...shared, ...mine].sort(byDay);
      const f2 = fitBiases(pool, new Set([id]), fit.bias);
      bias = f2.bias.get(id) ?? 0; biasSd = f2.sd.get(id) ?? 2;
    }
    const biases = new Map(fit.bias); biases.set(id, bias);
    const run = sharers.has(id) ? communityRun : runFilters(pool, biases);

    // Honest accuracy: each fill predicted with what the model knew just before that fill's reading.
    const errs: { date: string; predicted: number; measured: number }[] = [];
    pool.forEach((o, i) => { if (o.owner === id) errs.push({ date: o.date, predicted: predictedBlend(o, run.preds[i].x, bias), measured: o.m }); });
    const recentErr = errs.slice(-10);
    const byMonth = new Map<string, number[]>();
    for (const e of errs) (byMonth.get(e.date.slice(0, 7)) ?? byMonth.set(e.date.slice(0, 7), []).get(e.date.slice(0, 7))!).push(Math.abs(e.measured - e.predicted));

    const stationsUsed = new Map<string, Obs[]>();
    for (const o of mine) (stationsUsed.get(o.station) ?? stationsUsed.set(o.station, []).get(o.station)!).push(o);
    for (const [key, list] of stationsUsed) {
      const t = run.tracks.get(key);
      if (!t) continue;
      const s = summarizeTrack(key, t);
      const last = list[list.length - 1];
      myRows.push({ user_id: id, station_key: key, display_name: s.display_name, value: s.value, sd: s.sd, n_mine: list.length, n_total: s.n_fills,
        last_value: last.eraw - bias * last.k, last_date: last.date, switch_date: s.switch_date, switch_from: s.switch_from, switch_to: s.switch_to,
        updated_at: new Date().toISOString() });
    }

    const fs = (byOwner.get(id) ?? []).filter((f) => !owner.learnSince || f.date >= owner.learnSince);
    const dtePts = fs.filter((f) => f.full && f.dte !== null).map((f) => ({ dte: Number(f.dte), r: Math.max(0, TANK - tankParts(f, owner.gasEthanol).p) }))
      .filter((q) => q.r >= 0 && q.dte >= 0);
    const dte = fitDte(dtePts);
    carRows.push({
      user_id: id, bias, bias_sd: biasSd, bias_basis: biasBasis(pool, id), dte_a: dte.a, dte_b: dte.b, dte_sd: dte.sd, dte_n: dte.n,
      regional_value: regional, regional_sd: regionalSd,
      accuracy_recent: recentErr.length ? recentErr.reduce((a, e) => a + Math.abs(e.measured - e.predicted), 0) / recentErr.length : null,
      accuracy_n: recentErr.length,
      accuracy_by_month: [...byMonth.entries()].slice(-6).map(([month, v]) => ({ month, miss: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })),
      recent: errs.slice(-6).reverse(),
      updated_at: new Date().toISOString(),
    });
  }

  const del1 = await db.from("station_estimates").delete().neq("station_key", "");
  const del2 = await db.from("my_stations").delete().neq("station_key", "");
  if (del1.error || del2.error) return new Response("write failed", { status: 500 });
  if (stationRows.length) await db.from("station_estimates").insert(stationRows);
  if (myRows.length) await db.from("my_stations").insert(myRows);
  if (carRows.length) await db.from("car_model").upsert(carRows);
  return new Response(JSON.stringify({ owners: owners.size, observations: shared.length, stations: stationRows.length }), { headers: { "Content-Type": "application/json" } });
});
