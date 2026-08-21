import { createBrowserClient } from "@supabase/ssr";

/** عميل Supabase للمتصفح؛ يعيش تحت lib حتى يصل إلى كل بيئات النشر. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
