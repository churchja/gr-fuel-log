// Shared helpers for the GR Fuel Log edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const ALLOWED_ORIGINS = ["https://fuel.shadyacres.my", "https://churchja.github.io", "http://localhost:8080"];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Calls from the database carry the vault secret in x-fn-secret.
export async function fromDatabase(req: Request, db: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get("x-fn-secret");
  if (!secret) return false;
  const { data, error } = await db.rpc("check_fn_secret", { p: secret });
  return !error && data === true;
}
