// Loads the E85prices.com station list (Renewable Fuels Association) into the shared station list once a week, with
// RFA's permission: Sundays between 11 PM and 4 AM Central. Outside that window, or if it already ran in this window,
// it does nothing. One page holds every station. Prices are kept with their dates; site usernames are never kept.
import { adminClient, fromDatabase } from "./common.ts";
import { extractMarkers, inWindow, rowOf } from "./parse.ts";

const PAGE = "https://e85prices.com/e85map";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });
  if (!inWindow()) return reply({ ok: true, skipped: "outside_window" });
  const { data: cfg } = await db.from("app_config").select("e85p_run_at").eq("id", 1).single();
  if (cfg?.e85p_run_at && Date.now() - Date.parse(cfg.e85p_run_at) < 20 * 3600 * 1000) return reply({ ok: true, skipped: "already_ran", at: cfg.e85p_run_at });

  const started = new Date().toISOString();
  let rows: NonNullable<ReturnType<typeof rowOf>>[];
  try {
    const res = await fetch(PAGE, { headers: { "User-Agent": "GR-Fuel-Log/1.0 (https://fuel.shadyacres.my)" }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`E85prices.com ${res.status}`);
    rows = extractMarkers(await res.text()).map(rowOf).filter((r): r is NonNullable<typeof r> => r !== null);
  } catch (e) {
    console.error("e85prices fetch failed", e instanceof Error ? e.message : e);
    return reply({ error: "source_unavailable" }, 502);
  }
  // A partial page would wrongly drop stations, so stop if the list looks far too short.
  if (rows.length < 3000) return reply({ error: "too_few_rows", rows: rows.length }, 502);
  await db.from("app_config").update({ e85p_run_at: started }).eq("id", 1);
  let saved = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await db.rpc("import_e85p", { p_rows: rows.slice(i, i + 1000) });
    if (error) { console.error("import failed", error.message); return reply({ error: "save_failed" }, 500); }
    saved += Number(data) || 0;
  }
  const { data: linked, error } = await db.rpc("link_e85p", { p_started: started });
  if (error) console.error("link failed", error.message);
  return reply({ ok: true, listed: rows.length, saved, linked: linked ?? null, link_error: error?.message ?? null });
});
