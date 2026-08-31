"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

/* ==========================================================================
   هوك المتجر — حالة واحدة لصفحتين

   `/shop` و`/inventory` بيشوفوا **نفس** الحاجة: نفس الرصيد، نفس المخزن،
   نفس الملبوس. لو كل صفحة عملت حالتها، الشرا في المتجر مش هيبان في المخزن
   إلا بعد تحديث الصفحة — والاتنين هيكتبوا نفس منطق التلبيس مرتين.

   القاعدة هنا: **الحالة بتتحدّث من رد الداتابيز مش بالتخمين.** دالة الشرا
   بترجّع الرصيد الجديد، فالرصيد بيتحدّث بالرقم اللي السيرفر قاله — مش
   `balance - price` المحسوب محلياً. الفرق بيبان لما حاجة تفشل: بالطريقة
   التانية الشاشة تقول اتخصم والداتابيز تقول لأ.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataError } from "@/lib/pages-data";
import {
  applyThemePack,
  equipItem,
  equippedValue,
  fetchDailyShop,
  fetchShopState,
  fetchWheelStatus,
  mutationMessage,
  openBox,
  purchaseItem,
  spinWheel,
  toggleFavorite,
  unequipSlot,
  type BoxOutcome,
  type DailyOffer,
  type ShopState,
  type SpinOutcome,
  type WheelStatus,
} from "./shop-data";
import type { Slot } from "./types";

export type ShopPhase = "loading" | "ready" | "error";

/** ردّ إجراء — الصفحة بتوريه توست وبس. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** ردّ إجراء بنتيجة — الفتح واللفة محتاجين النتيجة عشان الأنيميشن. */
export type ActionResultOf<T> =
  | { ok: true; message: string; data: T }
  | { ok: false; message: string; data: null };

export interface UseShop {
  phase: ShopPhase;
  state: ShopState | null;
  error: DataError | null;
  /** فيه إجراء بيتنفّذ دلوقتي؟ معرّف العنصر أو الخانة */
  busy: string | null;
  /**
   * عروض النهارده. ليستة فاضية معناها «مفيش عروض» — مش «فشل التحميل».
   * الفرق مقصود: الصفحة مالهاش تنكسر لو الجداول الجديدة لسه ما اتعملتش.
   */
  daily: readonly DailyOffer[];
  /** حالة العجلة، أو `null` لو الدالة مش موجودة في الداتابيز */
  wheel: WheelStatus | null;
  buy: (itemId: string) => Promise<ActionResult>;
  equip: (itemId: string) => Promise<ActionResult>;
  unequip: (slot: Slot) => Promise<ActionResult>;
  favorite: (itemId: string, next: boolean) => Promise<ActionResult>;
  open: (boxId: string) => Promise<ActionResultOf<BoxOutcome>>;
  spin: () => Promise<ActionResultOf<SpinOutcome>>;
  reload: () => void;
}

export function useShop(
  supabase: SupabaseClient | null,
  userId: string | null,
): UseShop {
  const [phase, setPhase] = useState<ShopPhase>("loading");
  const [state, setState] = useState<ShopState | null>(null);
  const [error, setError] = useState<DataError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [daily, setDaily] = useState<readonly DailyOffer[]>([]);
  const [wheel, setWheel] = useState<WheelStatus | null>(null);

  // الحماية من التحديث بعد ما الكمبوننت يتفكّ — التنقل وسط نداء بيرمي
  // تحذير React، والحالة اللي بتتكتب بعد الفكّ ضايعة أصلاً.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;

    /* التلاتة مع بعض عشان الصفحة تفتح مرة واحدة مش تلاتة.
       ⚠️ الاتنين الجداد **مش** بيوقّفوا الصفحة لو فشلوا: المتجر اليومي
       والعجلة إضافات فوق المتجر، ولو حد نسي يشغّل نص db/shop.sql الجديد
       المفروض المتجر يفضل شغّال من غيرهم مش يوري صفحة خطأ. */
    const [res, day, spin] = await Promise.all([
      fetchShopState(supabase, userId),
      fetchDailyShop(supabase),
      fetchWheelStatus(supabase),
    ]);
    if (!aliveRef.current) return;

    if (res.error) {
      setError(res.error);
      setPhase("error");
      return;
    }
    setState(res.data);
    setDaily(day.error ? [] : day.data);
    setWheel(spin.error ? null : spin.data);
    setError(null);
    setPhase("ready");
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  /**
   * الثيم بيتلبس على `<html>` كل مرة الملبوس يتغيّر.
   *
   * ⚠️ التنضيف عند الفكّ **مقصود إنه مش موجود**: الثيم بتاع الحساب مش بتاع
   * الصفحة، فلو شيلناه وإحنا سايبين `/shop` المستخدم هيلاقي ثيمه اختفى
   * أول ما يرجع للداشبورد.
   */
  useEffect(() => {
    if (!state) return;
    applyThemePack(equippedValue(state, "theme"));
  }, [state]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const buy = useCallback(
    async (itemId: string): Promise<ActionResult> => {
      if (!supabase) return { ok: false, message: "مفيش اتصال" };
      setBusy(itemId);
      const res = await purchaseItem(supabase, itemId);
      if (!aliveRef.current) return { ok: false, message: "" };
      setBusy(null);

      if (res.error) return { ok: false, message: mutationMessage(res) };

      // الرصيد من رد الدالة، والمخزن بيتزوّد محلياً — أرخص من إعادة تحميل
      // كل حاجة، وبنفس الدقة: الصف اللي اتعمل معروف بالظبط.
      setState((prev) =>
        prev
          ? {
              ...prev,
              balance: res.data.balance,
              owned: [
                {
                  itemId,
                  favorite: false,
                  purchasedAt: new Date().toISOString(),
                  lastEquippedAt: null,
                },
                ...prev.owned,
              ],
              ownedIds: new Set([...prev.ownedIds, itemId]),
            }
          : prev,
      );
      // العرض اليومي بيقول «عندك» بعد الشرا — العنصر نفسه بيتباع في
      // الاتنين، فلو ما اتحدّثش الكارت في الشريط يفضل يقول «اشتري».
      setDaily((prev) =>
        prev.some((o) => o.itemId === itemId)
          ? prev.map((o) => (o.itemId === itemId ? { ...o, owned: true } : o))
          : prev,
      );
      return { ok: true, message: "تم الشرا" };
    },
    [supabase],
  );

  const equip = useCallback(
    async (itemId: string): Promise<ActionResult> => {
      if (!supabase) return { ok: false, message: "مفيش اتصال" };
      setBusy(itemId);
      const res = await equipItem(supabase, itemId);
      if (!aliveRef.current) return { ok: false, message: "" };
      setBusy(null);

      if (res.error) return { ok: false, message: mutationMessage(res) };

      setState((prev) =>
        prev ? { ...prev, equipped: { ...prev.equipped, [res.data]: itemId } } : prev,
      );
      return { ok: true, message: "اتلبس" };
    },
    [supabase],
  );

  const unequip = useCallback(
    async (slot: Slot): Promise<ActionResult> => {
      if (!supabase) return { ok: false, message: "مفيش اتصال" };
      setBusy(slot);
      const res = await unequipSlot(supabase, slot);
      if (!aliveRef.current) return { ok: false, message: "" };
      setBusy(null);

      if (res.error) return { ok: false, message: mutationMessage(res) };

      // الدالة بترجّع الافتراضي اللي حلّ مكانه — الخانة مبتفضلش فاضية.
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev.equipped };
        if (res.data) next[slot] = res.data;
        else delete next[slot];
        return { ...prev, equipped: next };
      });
      return { ok: true, message: "رجع للافتراضي" };
    },
    [supabase],
  );

  const favorite = useCallback(
    async (itemId: string, nextValue: boolean): Promise<ActionResult> => {
      if (!supabase || !userId) return { ok: false, message: "مفيش اتصال" };

      // النجمة بتتقلب فوراً وبترجع لو فشلت: الانتظار على ذهاب وعودة
      // لحاجة قد كده بيحسّها المستخدم بطء، والرجوع أرخص من انتظار.
      setState((prev) =>
        prev
          ? {
              ...prev,
              owned: prev.owned.map((o) =>
                o.itemId === itemId ? { ...o, favorite: nextValue } : o,
              ),
            }
          : prev,
      );

      const res = await toggleFavorite(supabase, userId, itemId, nextValue);
      if (!aliveRef.current) return { ok: false, message: "" };

      if (res.error) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                owned: prev.owned.map((o) =>
                  o.itemId === itemId ? { ...o, favorite: !nextValue } : o,
                ),
              }
            : prev,
        );
        return { ok: false, message: mutationMessage(res) };
      }
      return { ok: true, message: nextValue ? "اتضاف للمفضلة" : "اتشال من المفضلة" };
    },
    [supabase, userId],
  );

  /**
   * فتح صندوق.
   *
   * ⚠️ النتيجة **بترجع للصفحة** عشان الأنيميشن يعرضها — والحالة بتتحدّث
   * هنا من نفس الرد. الرصيد من `outcome.balance` (السيرفر)، والعنصر
   * بيتضاف للمخزن بس لو **مش** مكرر: المكرر رجع كوينز فالمخزن ما اتغيّرش.
   */
  const open = useCallback(
    async (boxId: string): Promise<ActionResultOf<BoxOutcome>> => {
      if (!supabase) return { ok: false, message: "مفيش اتصال", data: null };
      setBusy(boxId);
      const res = await openBox(supabase, boxId);
      if (!aliveRef.current) return { ok: false, message: "", data: null };
      setBusy(null);

      if (res.error) return { ok: false, message: mutationMessage(res), data: null };

      const out = res.data;
      setState((prev) => {
        if (!prev) return prev;
        if (out.duplicate) return { ...prev, balance: out.balance };
        return {
          ...prev,
          balance: out.balance,
          owned: [
            {
              itemId: out.itemId,
              favorite: false,
              purchasedAt: new Date().toISOString(),
              lastEquippedAt: null,
            },
            ...prev.owned,
          ],
          ownedIds: new Set([...prev.ownedIds, out.itemId]),
        };
      });
      return { ok: true, message: out.duplicate ? "مكرر — رجعت كوينز" : "مبروك", data: out };
    },
    [supabase],
  );

  /**
   * لفة العجلة.
   *
   * الحالة بتتقفل محلياً بعد اللفة (`spun: true`) عشان الزرار يقفل فوراً،
   * بس ده **مش** هو اللي بيمنع اللفة التانية — الفهرس الفريد في السجل هو
   * اللي بيمنعها. لو حد لف من تابين، التانية بترجع خطأ من الداتابيز.
   */
  const spin = useCallback(async (): Promise<ActionResultOf<SpinOutcome>> => {
    if (!supabase) return { ok: false, message: "مفيش اتصال", data: null };
    setBusy("wheel");
    const res = await spinWheel(supabase);
    if (!aliveRef.current) return { ok: false, message: "", data: null };
    setBusy(null);

    if (res.error) return { ok: false, message: mutationMessage(res), data: null };

    const out = res.data;
    setState((prev) => (prev ? { ...prev, balance: out.balance } : prev));
    setWheel((prev) =>
      prev ? { ...prev, canSpin: false, spun: true, coins: out.coins } : prev,
    );
    return { ok: true, message: `كسبت ${out.coins} كوين`, data: out };
  }, [supabase]);

  return {
    phase,
    state,
    error,
    busy,
    daily,
    wheel,
    buy,
    equip,
    unequip,
    favorite,
    open,
    spin,
    reload,
  };
}