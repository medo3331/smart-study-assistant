import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** عميل Supabase لراوتات السيرفر وServer Components — يدعم Authorization Bearer للاختبار الآلي. */
export async function createClient() {
  let cookieStore: { getAll: () => Array<{ name: string; value: string; options?: unknown }>; set?: (name: string, value: string, options?: unknown) => void } = { getAll: () => [], set: () => {} };
  let authHeader: string | null = null;
  try {
    // next/headers متاح فقط في App Router Server Components / Route Handlers
    const { cookies: c, headers: h } = await import("next/headers");
    cookieStore = await c();
    try {
      const headerVal = await h();
      authHeader = headerVal.get("authorization") || headerVal.get("Authorization") || null;
    } catch {}
  } catch {
    // Pages Router أو سياق لا يدعم next/headers — نواصل بدون cookies
  }
  // إذا وُجد Bearer token، استخدمه مباشرة (للاختبار عبر curl) — يفوق الكوكيز
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      // نستخدم supabase-js مباشرة مع Authorization لضمان getUser يعمل
      return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      ) as unknown as ReturnType<typeof createServerClient>;
    }
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components لا تستطيع دائمًا كتابة الكوكيز؛ middleware يتولى refresh.
          }
        },
      },
    },
  );
}
