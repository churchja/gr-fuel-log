// Weekly backup. Collects members' data, and if anything changed since the last backup, emails the admin a
// gzipped JSON file through Fastmail. Called by the database (pg_cron) with the shared function secret.
// Send {"force": true} to email a backup even when nothing changed.
import nodemailer from "npm:nodemailer@10.2.1";
import { Buffer } from "node:buffer";
import { adminClient, fromDatabase } from "./common.ts";

type Row = Record<string, unknown>;

async function all(db: ReturnType<typeof adminClient>, table: string, columns = "*", filter?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });
  let force = false;
  try { force = Boolean((await req.json()).force); } catch { /* no body */ }

  try {
    // Accounts (email and sign-up date) so members can be matched up again after a restore.
    const users: Row[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`users: ${error.message}`);
      users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })));
      if (data.users.length < 1000) break;
    }
    const tables: Record<string, Row[]> = {
      users,
      profiles: await all(db, "profiles"),
      fills: await all(db, "fills", "*", (q) => q.order("user_id").order("date").order("odometer")),
      oil_changes: await all(db, "oil_changes", "*", (q) => q.order("user_id").order("date")),
      // Stations members added, plus the names members confirmed on map and DOE stations (the rest can be reloaded).
      member_stations: await all(db, "stations",
        "id, source, osm_type, osm_id, afdc_id, name, brand, street, city, state, postcode, lat, lon, std_brand, std_street, std_by, std_at, created_by, created_at",
        (q) => q.or("source.eq.custom,std_by.not.is.null").order("id")),
      app_config: await all(db, "app_config", "id, admin_email, pace_per_hour, pace_per_day, hold_all, claude_daily_per_user, claude_monthly_cap, smtp_user, mail_from"),
      signup_log: await all(db, "signup_log", "*", (q) => q.order("id")),
      alerts: await all(db, "alerts", "id, kind, message, created_at, emailed_at", (q) => q.order("id")),
      devices: await all(db, "devices", "*", (q) => q.order("user_id")),
    };
    const body = JSON.stringify(tables);
    const hash = await sha256(body);
    const { data: cfg } = await db.from("app_config").select("admin_email, smtp_user, mail_from, backup_hash").eq("id", 1).single();
    if (!cfg) throw new Error("app_config missing");
    if (!force && cfg.backup_hash === hash) return Response.json({ ok: true, sent: false, reason: "no changes" });

    const pass = Deno.env.get("FASTMAIL_APP_PASSWORD");
    if (!pass) throw new Error("Fastmail app password is not set");
    const day = new Date().toISOString().slice(0, 10);
    const file = await gzip(JSON.stringify({ app: "GR Fuel Log", format: 1, created_at: new Date().toISOString(), tables }, null, 1));
    const counts = Object.entries(tables).map(([k, v]) => `${k}: ${v.length}`).join("\n");
    const transport = nodemailer.createTransport({ host: "smtp.fastmail.com", port: 465, secure: true, auth: { user: cfg.smtp_user, pass } });
    await transport.sendMail({
      from: cfg.mail_from,
      to: cfg.admin_email,
      subject: `GR Fuel Log backup ${day}`,
      text: `Weekly backup of GR Fuel Log, sent because members' data changed since the last one.\n\n${counts}\n\n`
        + `Attached: gr-fuel-log-backup-${day}.json.gz (gzipped JSON, one list per table). Keep this email. `
        + `The README in the gr-fuel-log repository explains how to restore from it.\n\nIt contains members' email addresses and fill history, so don't forward it.`,
      attachments: [{ filename: `gr-fuel-log-backup-${day}.json.gz`, content: Buffer.from(file), contentType: "application/gzip" }],
    });
    await db.from("app_config").update({ backup_hash: hash, backup_at: new Date().toISOString() }).eq("id", 1);
    return Response.json({ ok: true, sent: true, bytes: file.length, rows: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("backup failed", msg);
    await db.from("alerts").insert({ kind: "backup_failed", message: `The weekly backup failed: ${msg.slice(0, 200)}` });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
