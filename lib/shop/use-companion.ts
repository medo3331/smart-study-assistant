"use client";

/* ==========================================================================
   الرفيق الملبوس — للداشبورد بس

   Why هوك لوحده مش `useShop`: `useShop` بيجيب الرصيد والمخزن والملبوس
   والعروض واللفة — ستة استعلامات وRPC منح. الداشبورد محتاج **حاجة
   واحدة**: إيه الرفيق الملبوس. تحميل المتجر كله في أثقل صفحة في المشروع
   عشان إيموجي هو تبادل غلط.

   ⚠️ الهوك ده **عمره ما يفشّل الداشبورد**. جداول المتجر ممكن تكون لسه
   ما اتعملتش (db/shop.sql ما اتشغّلش)، والداشبورد شغّالة من قبل المتجر
   بشهور. أي خطأ = الرفيق الأصلي، والصفحة تكمّل عادي.
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companionStages, DEFAULT_STAGES } from "./catalog";
import { equippedItem } from "./shop-data";

/** مفتاح الإخفاء على الجهاز — الرفيق حاجة شخصية، والقرار مايتنقلش للسيرفر */
export const PET_HIDDEN_KEY = "dash_pet_hidden";

export interface EquippedCompanion {
  /** أربع مراحل بالظبط — مضمون من `companionStages` */
  stages: readonly string[];
  name: string;
  /** المستخدم خبّاه؟ */
  hidden: boolean;
  hide: () => void;
  show: () => void;
}

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PET_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function useEquippedCompanion(
  supabase: SupabaseClient | null,
  userId: string | null,
): EquippedCompanion {
  const [stages, setStages] = useState<readonly string[]>(DEFAULT_STAGES);
  const [name, setName] = useState("رفيقك");
  const [hidden, setHidden] = useState(false);

  /* الإخفاء بيتقرا في إيفكت مش في `useState` الأولاني: القراءة الأولانية
     بتحصل على السيرفر كمان في SSR، و`localStorage` مش موجود هناك — واللي
     بيحصل إن الرسمة الأولى تختلف عن التانية (hydration mismatch). */
  useEffect(() => {
    setHidden(readHidden());
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("shop_equipped")
        .select("item_id")
        .eq("user_id", userId)
        .eq("slot", "companion")
        .maybeSingle();

      // مش بنفرّق بين «الجدول مش موجود» و«مفيش رفيق ملبوس»: النتيجة
      // واحدة — الرفيق الأصلي.
      if (!alive || error) return;

      const id = (data as { item_id?: string } | null)?.item_id;
      const item = equippedItem({ equipped: { companion: id } }, "companion");
      if (!item) return;

      setStages(companionStages(item.value));
      setName(item.name);
    })();

    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  const write = useCallback((next: boolean) => {
    setHidden(next);
    try {
      window.localStorage.setItem(PET_HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // الستوريج مقفول — الإخفاء هيشتغل للجلسة دي بس
    }
  }, []);

  const hide = useCallback(() => write(true), [write]);
  const show = useCallback(() => write(false), [write]);

  return { stages, name, hidden, hide, show };
}
