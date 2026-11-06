// Reads one gas receipt photo with Claude Haiku 5.5, within each owner's daily allowance and the monthly cap.
import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { adminClient, corsHeaders, json } from "./common.ts";

const PROMPT = `This photo is a receipt from a US gas station pump or register. Read the fuel purchase on it.
Rules:
- station: the business name, plus the street if it is printed. Null if not printed.
- date: the purchase date as YYYY-MM-DD. Null if unreadable.
- fuel: "E85" for E85, Flex Fuel or FFV; "gas" for regular, plus, premium, super, unleaded or a numbered octane grade; "other" for anything else (race fuel, E15 sold as a separate blend, diesel). Null if unclear.
- octane: the octane number for gas when printed or clearly implied (87, 88, 89, 91, 92, 93). Null otherwise.
- ethanol_percent: only when the receipt states it (for example "E15" or "ethanol free" = 0). Null otherwise.
- gallons, price_per_gallon, total: as printed, in gallons and US dollars. Null for anything you cannot read clearly.
Never guess a number.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["station", "date", "fuel", "octane", "ethanol_percent", "gallons", "price_per_gallon", "total"],
  properties: {
    station: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    fuel: { type: ["string", "null"] },
    octane: { type: ["integer", "null"] },
    ethanol_percent: { type: ["number", "null"] },
    gallons: { type: ["number", "null"] },
    price_per_gallon: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
  },
};

const MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const db = adminClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json(req, { error: "sign_in_required" }, 401);

  const { data: profile } = await db.from("profiles").select("status, handle").eq("id", user.id).single();
  if (!profile || profile.status !== "approved") return json(req, { error: "not_approved" }, 403);

  const { data: cfg } = await db.from("app_config").select("claude_daily_per_user, claude_monthly_cap").eq("id", 1).single();
  const daily = cfg?.claude_daily_per_user ?? 6, monthly = cfg?.claude_monthly_cap ?? 1000;
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));
  const { count: usedToday } = await db.from("receipt_reads").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", dayStart.toISOString());
  const { count: usedMonth } = await db.from("receipt_reads").select("id", { count: "exact", head: true })
    .gte("created_at", monthStart.toISOString());
  if ((usedMonth ?? 0) >= monthly) return json(req, { error: "month_cap" }, 429);
  if ((usedToday ?? 0) >= daily) return json(req, { error: "daily_limit", daily }, 429);

  let body: { image?: string; media_type?: string };
  try { body = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const image = body.image ?? "", mediaType = body.media_type ?? "image/jpeg";
  if (!MEDIA.has(mediaType) || image.length < 100 || image.length > 3_000_000) return json(req, { error: "bad_image" }, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(req, { error: "not_configured" }, 503);

  const { data: row } = await db.from("receipt_reads").insert({ user_id: user.id, ok: false }).select("id").single();

  let result: Record<string, unknown> | null = null;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    });
    if (msg.stop_reason === "refusal") return json(req, { error: "unreadable" }, 422);
    const text = msg.content.find((b) => b.type === "text");
    if (text && text.type === "text") result = JSON.parse(text.text);
  } catch (e) {
    console.error("claude call failed", e instanceof Error ? e.message : e);
    return json(req, { error: "upstream" }, 502);
  }
  if (!result) return json(req, { error: "unreadable" }, 422);
  if (row) await db.from("receipt_reads").update({ ok: true }).eq("id", row.id);

  // Warnings for the admin: 80% of the monthly cap, and an owner at the daily limit 3 days running.
  const monthNow = (usedMonth ?? 0) + 1;
  if (monthNow === Math.floor(monthly * 0.8)) {
    await db.from("alerts").insert({ kind: "budget_80", message: `Receipt reading has used ${monthNow} of this month's ${monthly} Claude reads.` });
  }
  if ((usedToday ?? 0) + 1 === daily) {
    let streak = true;
    for (let d = 1; d <= 2 && streak; d++) {
      const from = new Date(dayStart.getTime() - d * 86400000), to = new Date(dayStart.getTime() - (d - 1) * 86400000);
      const { count } = await db.from("receipt_reads").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", from.toISOString()).lt("created_at", to.toISOString());
      streak = (count ?? 0) >= daily;
    }
    if (streak) {
      await db.from("alerts").insert({ kind: "daily_limit_streak",
        message: `Owner ${profile.handle ?? user.email} has hit the daily receipt-reading limit 3 days running.` });
    }
  }
  return json(req, { ok: true, receipt: result, used_today: (usedToday ?? 0) + 1, daily });
});
