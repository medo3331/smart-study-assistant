import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — server-only, bypasses RLS.
 * Requires SUPABASE_SERVICE_ROLE_KEY in env (Vercel + .env.local).
 * Never import in Client Components.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
