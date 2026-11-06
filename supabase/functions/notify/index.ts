// Emails one warning to the admin through Fastmail. Called by the database when an alert is inserted.
import nodemailer from "npm:nodemailer@10.2.1";
import { adminClient, fromDatabase } from "./common.ts";

const SUBJECTS: Record<string, string> = {
  signup_held: "Sign-up held",
  signup_burst: "Burst of sign-ups",
  admin_new_device: "New device on your admin account",
  budget_80: "Receipt budget at 80%",
  daily_limit_streak: "Owner at the receipt limit 3 days running",
  junk_data: "Implausible fills held out of the community view",
};

Deno.serve(async (req) => {
  const db = adminClient();
  if (!(await fromDatabase(req, db))) return new Response("forbidden", { status: 403 });
  let alertId: number | undefined;
  try { alertId = (await req.json()).alert_id; } catch { /* ignore */ }
  if (!alertId) return new Response("bad request", { status: 400 });

  const { data: alert } = await db.from("alerts").select("*").eq("id", alertId).single();
  if (!alert || alert.emailed_at) return new Response("nothing to do");
  const { data: cfg } = await db.from("app_config").select("admin_email, smtp_user, mail_from").eq("id", 1).single();
  const pass = Deno.env.get("FASTMAIL_APP_PASSWORD");
  if (!pass || !cfg) {
    await db.from("alerts").update({ email_error: "Fastmail app password is not set yet" }).eq("id", alertId);
    return new Response("not configured", { status: 503 });
  }
  try {
    const transport = nodemailer.createTransport({ host: "smtp.fastmail.com", port: 465, secure: true, auth: { user: cfg.smtp_user, pass } });
    await transport.sendMail({
      from: cfg.mail_from,
      to: cfg.admin_email,
      subject: `GR Fuel Log: ${SUBJECTS[alert.kind] ?? "Warning"}`,
      text: `${alert.message}\n\nOpen Admin: https://fuel.shadyacres.my/#admin\n\nSent ${new Date(alert.created_at).toUTCString()} by GR Fuel Log.`,
    });
    await db.from("alerts").update({ emailed_at: new Date().toISOString(), email_error: null }).eq("id", alertId);
    return new Response("sent");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("alerts").update({ email_error: msg.slice(0, 300) }).eq("id", alertId);
    return new Response("send failed", { status: 502 });
  }
});
