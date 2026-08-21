"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/* ==========================================================================
   جلسة المستخدم للصفحات الفرعية

   الداشبورد بتعمل حاجات كتير في تحميلها (بتولّد أيام، بتحدّث الستريك،
   بتنشئ بروفايل لو مش موجود). الصفحات الفرعية مش محتاجة أي حاجة من ده —
   محتاجة تعرف مين المستخدم وخلاص.

   ⚠️ مافيش signInAnonymously هنا عن قصد: الداشبورد هي اللي بتعمل جلسة
   الزائر. لو حد نزل على /dashboard/workspace من غير جلسة، بنوجّهه للداشبورد
   بدل ما نعمل حساب زائر تاني من مكانين مختلفين.
   ========================================================================== */

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "anonymous" }
  | { status: "error"; message: string };

export function useAuthUser(): { supabase: SupabaseClient; session: SessionState } {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setSession({ status: "ready", user });
          return;
        }

        const {
          data: { session: existing },
        } = await supabase.auth.getSession();

        if (existing?.user) {
          setSession({ status: "ready", user: existing.user });
        } else {
          setSession({ status: "anonymous" });
        }
      } catch (err) {
        console.error("useAuthUser failed:", err);
        setSession({ status: "error", message: "ما قدرناش نتأكد من جلستك. حدّث الصفحة." });
      }
    })();
  }, [supabase]);

  return { supabase, session };
}

/* --------------------------------------------------------------------------
   التراك المفتوح حالياً

   عايش في `profiles.active_config_id` — شوف `setActiveCourse` و
   `fetchActiveCourseId` في `lib/pages-data.ts`.

   ⚠️ كان محفوظاً في localStorage قبل كده. اتغيّر عن قصد: الاختيار صفة في
   الحساب مش على الجهاز، عشان تختار تراك من اللابتوب وتلاقيه مفتوح على
   الموبايل. متردّش الدوال المحلية تاني.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   صيغ عربية متكررة
   -------------------------------------------------------------------------- */

/** "٣١ يوليو ٢٠٢٦" من ISO. */
export function formatArabicDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

/** مفتاح اليوم المحلي "YYYY-MM-DD". بيتجنّب toISOString لأنها بتحوّل لـ UTC
    فبتقفز يوم لورا في التوقيتات اللي قبل جرينتش. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "٢٤ ك.ب" / "١٫٢ م.ب" — أو فاضي لو الحجم مش معروف. */
export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}
