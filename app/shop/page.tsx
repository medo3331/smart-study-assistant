"use client";

/* ==========================================================================
   المتجر

   ٩٠ عنصر في ٨ أقسام. المشكلة التصميمية الوحيدة الحقيقية هنا: إزاي المستخدم
   يلاقي حاجة في كومة زي دي. الحل تلات طبقات — قسم، وبحث، وترتيب — وكلهم
   بيشتغلوا مع بعض على نفس القايمة.

   ⚠️ **قسم الصناديق مالوش عناصر في الكتالوج.** الصندوق عملية مش عنصر
   (بيتفتح ويختفي، ومالوش خانة ولا ملكية)، فتاب «الصناديق» بيبدّل الشبكة
   بـ `BoxPanel` بدل ما يدوّر في `CATALOG` ويلاقيها فاضية.

   ⚠️ متجر النهارده والعجلة بيبانوا في «الكل» وبدون بحث بس. في نتيجة
   مفلترة الاتنين بيبقوا ضوضاء بين المستخدم واللي بيدوّر عليه.

   ⚠️ الكوينز بتتكسب بالمذاكرة **بس**. مفيش شرا بفلوس حقيقية في أي مكان.

   ⚠️ الصفحة تحت `/shop` مش `/dashboard/shop` عشان النقل من الداشبورد
   والمخزن يبقى `push` واحد، ونفس سابقة `/community`.

   ⚠️ محتاج جداول db/shop.sql — لو مش متعمولة الصفحة تقول كده صريح بدل
   ما تفضل بتحمّل.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../dashboard/components/PageShell";
import { useAuthUser } from "../dashboard/components/use-page-data";
import { CATALOG, slotOf } from "@/lib/shop/catalog";
import { CATEGORY, CATEGORIES, type Category, type ShopItem } from "@/lib/shop/types";
import { RARITIES, RARITY } from "@/lib/shop/rarity";
import { equippedValue, unlockStatus, type ShopState } from "@/lib/shop/shop-data";
import { BOXES, type BoxTier } from "@/lib/shop/boxes";
import { useShop } from "@/lib/shop/use-shop";
import { BoxPanel } from "@/components/shop/BoxPanel";
import { BoxSheet } from "@/components/shop/BoxSheet";
import { DailyStrip } from "@/components/shop/DailyStrip";
import { ItemCard } from "@/components/shop/ItemCard";
import { ItemSheet } from "@/components/shop/ItemSheet";
import { ShopBar } from "@/components/shop/ShopBar";
import { Toast, type ToastMsg } from "@/components/shop/Toast";
import { WheelPanel } from "@/components/shop/WheelPanel";
import { InterestOnboarding } from "@/components/shop/InterestOnboarding";
import {
  EMPTY_PERSONALIZATION,
  isInterestId,
  personalizedCategories,
  recommendationsFor,
  type InterestId,
  type Personalization,
  type StylePreference,
} from "@/lib/shop/personalization";

type Sort = "featured" | "cheap" | "pricey" | "rare";

const SORTS: { id: Sort; label: string }[] = [
  { id: "featured", label: "المميزة" },
  { id: "cheap", label: "الأرخص" },
  { id: "pricey", label: "الأغلى" },
  { id: "rare", label: "الأندر" },
];

/** ترتيب الندرة تنازلي — الأندر الأول. */
const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));

/** ملبوس؟ الصناديق مالهاش خانة (`slot === null`) فعمرها ما تبقى ملبوسة. */
function isEquipped(state: ShopState, item: ShopItem): boolean {
  const slot = slotOf(item);
  return slot !== null && state.equipped[slot] === item.id;
}

export default function ShopPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const userId = session.status === "ready" ? session.user.id : null;
  const shop = useShop(supabase, userId);

  const [cat, setCat] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const [hideLocked, setHideLocked] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [boxId, setBoxId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);
  const [personalization, setPersonalization] = useState<Personalization | null>(null);
  const [savingPersonalization, setSavingPersonalization] = useState(false);

  // الزائر يرجع للداشبورد — هي اللي بتعمل جلسة الزائر، مش إحنا
  useEffect(() => {
    if (session.status === "anonymous") router.push("/dashboard");
  }, [session.status, router]);

  // التفضيلات تُقرأ من نفس profile الخاص بالحساب، مش من localStorage، عشان
  // الاقتراحات تمشي مع المستخدم على كل أجهزته. لو migration لم يُشغّل بعد،
  // يظل المتجر المعتاد شغّال بدلاً من أن نحبس المستخدم في onboarding معطّل.
  useEffect(() => {
    if (!supabase || session.status !== "ready") return;
    let alive = true;
    void supabase
      .from("profiles")
      .select("interests, store_style, personalization_completed_at")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setPersonalization({ ...EMPTY_PERSONALIZATION, completed: true });
          return;
        }
        const interests = Array.isArray(data?.interests)
          ? data.interests.filter((value): value is InterestId => typeof value === "string" && isInterestId(value))
          : [];
        const style: StylePreference = data?.store_style === "calm" || data?.store_style === "bold" || data?.store_style === "minimal"
          ? data.store_style
          : null;
        setPersonalization({ interests, style, completed: Boolean(data?.personalization_completed_at) });
      });
    return () => { alive = false; };
  }, [supabase, session]);

  const say = (text: string, ok: boolean) =>
    setToast({ id: Date.now(), text, ok });

  const state = shop.state;

  const savePersonalization = async (interests: InterestId[], style: StylePreference) => {
    if (!supabase || session.status !== "ready") return;
    setSavingPersonalization(true);
    const payload = {
      interests,
      store_style: style,
      personalization_completed_at: new Date().toISOString(),
    };
    // `update` لا يعتبر عدم وجود صف خطأ في PostgREST. نطلب الصف الراجع
    // صراحةً كي لا نقول للمستخدم إن الحفظ نجح وهو لم يكتب شيئاً.
    const update = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", session.user.id)
      .select("id")
      .maybeSingle();
    let error = update.error;

    // الحساب قد يصل إلى المتجر قبل أن يزور الداشبورد، حيث يُنشأ profile
    // عادةً. ننشئ الصف هنا في هذه الحالة بدلاً من فشل اختيار الاهتمامات.
    if (!error && !update.data) {
      const insert = await supabase
        .from("profiles")
        .insert({ id: session.user.id, xp: 0, streak: 1, theme: "amber", ...payload });
      error = insert.error;
    }
    setSavingPersonalization(false);
    if (error) {
      const missingMigration = error.code === "42703" || /interests|store_style|personalization_completed_at/i.test(error.message);
      say(
        missingMigration
          ? "ميزة التخصيص محتاجة تشغيل db/personalization.sql في Supabase مرة واحدة"
          : `مش قادرين نحفظ اختياراتك: ${error.message.split("\n")[0]}`,
        false,
      );
      return;
    }
    setPersonalization({ interests, style, completed: true });
    say(interests.length ? "المتجر اتظبط على ذوقك" : "تمام، هنسيب الاختيارات عامة دلوقتي", true);
  };

  /* القايمة المعروضة: قسم ← بحث ← ترتيب. الحساب مرة واحدة لكل تغيير
     مش لكل كارت — ٨٤ عنصر × إعادة رسم بيبان. */
  const shown = useMemo(() => {
    let list = CATALOG.filter((i) => (cat === "all" ? true : i.category === cat));

    const q = query.trim();
    if (q) {
      // البحث في الاسم والوصف: المستخدم بيدوّر بـ «أزرق» مش بـ «ocean-blue»
      list = list.filter(
        (i) => i.name.includes(q) || i.desc.includes(q) || RARITY[i.rarity].name.includes(q),
      );
    }

    if (hideLocked && state) {
      list = list.filter(
        (i) =>
          state.ownedIds.has(i.id) ||
          unlockStatus(i, state).satisfied,
      );
    }

    const out = [...list];
    switch (sort) {
      case "cheap":
        out.sort((a, b) => a.price - b.price);
        break;
      case "pricey":
        out.sort((a, b) => b.price - a.price);
        break;
      case "rare":
        out.sort(
          (a, b) =>
            (RARITY_RANK.get(b.rarity) ?? 0) - (RARITY_RANK.get(a.rarity) ?? 0) ||
            a.price - b.price,
        );
        break;
      case "featured":
        // المميزة الأول وبعدين الأرخص — الافتراضي لازم يوري حاجة حلوة فوراً
        out.sort(
          (a, b) => Number(!!b.featured) - Number(!!a.featured) || a.price - b.price,
        );
        break;
    }
    return out;
  }, [cat, query, sort, hideLocked, state]);

  const ownedItems = useMemo(
    () => (state ? CATALOG.filter((item) => state.ownedIds.has(item.id)) : []),
    [state],
  );
  const recommended = useMemo(
    () => state && personalization?.completed
      ? recommendationsFor(CATALOG, personalization.interests, ownedItems, state.ownedIds)
      : [],
    [state, personalization, ownedItems],
  );
  const personalizedCats = useMemo(
    () => personalization?.completed ? personalizedCategories(personalization.interests, ownedItems) : [],
    [personalization, ownedItems],
  );

  const open = openId ? CATALOG.find((i) => i.id === openId) : undefined;
  const box: BoxTier | undefined = boxId ? BOXES.find((b) => b.id === boxId) : undefined;

  /* عرض النهارده على العنصر المفتوح — بيدّي الورقة السعر المخفّض ويفتح
     الحصري. `null` معناها إنه مش في عروض اليوم. */
  const openOffer = openId ? (shop.daily.find((o) => o.itemId === openId) ?? null) : null;

  /* قسم الصناديق بيبدّل الشبكة، ومتجر النهارده والعجلة بيبانوا في «الكل»
     من غير بحث بس — فوق نتيجة مفلترة بيبقوا حاجة بين المستخدم وهدفه. */
  const showBoxes = cat === "box";
  const showExtras = cat === "all" && query.trim() === "";

  if (session.status === "loading" || shop.phase === "loading") {
    return (
      <PageShell eyebrow="المتجر" title="اصرف كوينزك" feedbackPage="shop">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  if (shop.phase === "error" || !state) {
    return (
      <PageShell eyebrow="المتجر" title="اصرف كوينزك" feedbackPage="shop">
        <DataNotice message={shop.error?.message ?? "مش قادرين نجيب المتجر."} />
      </PageShell>
    );
  }

  const avatarEmoji = equippedValue(state, "avatar");

  return (
    <PageShell
      eyebrow="المتجر"
      title="اصرف كوينزك"
      lede="الكوينز بتتكسب بالمذاكرة بس — مفيش شرا بفلوس هنا ولا هيبقى."
      feedbackPage="shop"
      feedbackLabel="المتجر"
      action={
        <button onClick={() => router.push("/inventory")} className="btn btn-quiet text-sm">
          مخزني
        </button>
      }
    >
      <ShopBar state={state} />

      {personalization?.completed && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPersonalization((current) => current ? { ...current, completed: false } : current)}
            className="text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            عدّل اهتمامات المتجر
          </button>
        </div>
      )}

      {personalization && !personalization.completed && (
        <InterestOnboarding
          busy={savingPersonalization}
          onSave={savePersonalization}
          onSkip={() => savePersonalization([], null)}
        />
      )}

      {recommended.length > 0 && showExtras && (
        <section className="space-y-3" aria-labelledby="for-you-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow eyebrow-flush mb-1">مقترحات شخصية</p>
              <h2 id="for-you-title" className="h3">لك</h2>
            </div>
            <span className="mono text-[11px] text-ink-soft">حسب اهتماماتك ومخزنك</span>
          </div>
          <div className="shop-grid">
            {recommended.slice(0, 4).map((item) => {
              const st = unlockStatus(item, state);
              return <ItemCard key={item.id} item={item} avatarEmoji={avatarEmoji} onOpen={() => setOpenId(item.id)} state={{ owned: false, equipped: false, favorite: false, lockedNeed: st.satisfied ? null : st.need, affordable: state.balance >= item.price }} />;
            })}
          </div>
        </section>
      )}

      {/* البحث */}
      <div className="relative">
        <Search
          className="w-4 h-4 text-ink-soft absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="دوّر على حاجة..."
          aria-label="ابحث في المتجر"
          className="w-full bg-paper-2 border border-rule rounded-[var(--r-sm)] py-2.5 ps-9 pe-9 text-[13px] text-ink placeholder:text-ink-soft focus:outline-none focus:border-rule-strong"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="امسح البحث"
            className="absolute top-1/2 -translate-y-1/2 end-2 text-ink-soft hover:text-ink p-1"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* الأقسام — شريط بيتمرّر أفقياً على الموبايل */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {(["all", ...[...personalizedCats, ...CATEGORIES.filter((c) => !personalizedCats.includes(c))]] as const).map((c) => {
          const on = cat === c;
          const label = c === "all" ? "الكل" : CATEGORY[c].name;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={on}
              className={`mono text-[11px] whitespace-nowrap px-3 py-2 rounded-[6px] border transition ${
                on
                  ? "bg-ink text-paper-2 border-ink"
                  : "bg-paper-2 text-ink-soft border-rule hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* متجر النهارده والعجلة — تحت خانة البحث عن قصد. لو كانوا فوقيها،
          أول حرف يتكتب كان هيخفّيهم فتتحرّك الخانة تحت مؤشّر المستخدم
          وهو بيكتب. */}
      {showExtras && (
        <>
          <DailyStrip
            offers={shop.daily}
            balance={state.balance}
            avatarEmoji={avatarEmoji}
            onPick={(offer) => setOpenId(offer.itemId)}
          />
          {/* `null` معناها إن دوال العجلة لسه مش في الداتابيز — بنسكت
              بدل ما نوري قسم مكسور */}
          {shop.wheel && (
            <WheelPanel
              status={shop.wheel}
              onSpin={async () => {
                const res = await shop.spin();
                say(res.message, res.ok);
                return res;
              }}
            />
          )}
        </>
      )}

      {showBoxes ? (
        <BoxPanel balance={state.balance} onPick={(b) => setBoxId(b.id)} />
      ) : (
        <>
          {/* الترتيب وفلتر المقفول */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  aria-pressed={sort === s.id}
                  className={`text-[11px] px-2.5 py-1.5 rounded-full border transition ${
                    sort === s.id
                      ? "border-rule-strong text-ink"
                      : "border-rule text-ink-soft hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[11px] text-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={hideLocked}
                onChange={(e) => setHideLocked(e.target.checked)}
                className="accent-ink"
              />
              خبّي المقفول
            </label>
          </div>

          <p className="text-[11px] text-ink-soft tnum ltr-num">
            {shown.length} من {CATALOG.length} عنصر
          </p>

          {shown.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="مفيش حاجة بالمواصفات دي"
              body="جرّب كلمة تانية أو شيل الفلاتر."
              action={
                <button
                  onClick={() => {
                    setQuery("");
                    setCat("all");
                    setHideLocked(false);
                  }}
                  className="btn btn-quiet text-sm"
                >
                  شيل الفلاتر
                </button>
              }
            />
          ) : (
            <div className="shop-grid">
              {shown.map((item) => {
                const owned = state.ownedIds.has(item.id);
                const st = unlockStatus(item, state);
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    avatarEmoji={avatarEmoji}
                    justBought={justBought === item.id}
                    onOpen={() => setOpenId(item.id)}
                    state={{
                      owned,
                      equipped: isEquipped(state, item),
                      // النجمة في المخزن مش في المتجر — المتجر عن الشرا
                      favorite: false,
                      lockedNeed: st.satisfied ? null : st.need,
                      affordable: state.balance >= item.price,
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {open && (
          <ItemSheet
            key={open.id}
            item={open}
            owned={state.ownedIds.has(open.id)}
            equipped={isEquipped(state, open)}
            lockedNeed={(() => {
              /* ⚠️ العنصر الحصري شرطه `{kind:"daily"}` و`unlockStatus`
                 بترفضه دايماً (fail-closed). العرض في جدول اليوم هو
                 الاستثناء الوحيد — ونفس الاستثناء بالظبط موجود في
                 `purchase_item`، فالواجهة والداتابيز بيقولوا نفس الحاجة. */
              if (openOffer) return null;
              const st = unlockStatus(open, state);
              return st.satisfied ? null : st.need;
            })()}
            balance={state.balance}
            busy={shop.busy === open.id}
            avatarEmoji={avatarEmoji}
            offer={openOffer}
            onClose={() => setOpenId(null)}
            onBuy={async () => {
              const res = await shop.buy(open.id);
              say(res.message, res.ok);
              if (res.ok) {
                setJustBought(open.id);
                setOpenId(null);
                setTimeout(() => setJustBought(null), 700);
              }
            }}
            onEquip={async () => {
              const res = await shop.equip(open.id);
              say(res.message, res.ok);
              if (res.ok) setOpenId(null);
            }}
          />
        )}

        {box && (
          <BoxSheet
            key={box.id}
            box={box}
            balance={state.balance}
            avatarEmoji={avatarEmoji}
            onClose={() => setBoxId(null)}
            /* النتيجة بترجع للورقة عشان تعرضها — الصفحة بتاخد التوست بس */
            onOpen={async () => {
              const res = await shop.open(box.id);
              if (!res.ok) say(res.message, false);
              return res;
            }}
          />
        )}
      </AnimatePresence>

      <Toast msg={toast} onDone={() => setToast(null)} />
    </PageShell>
  );
}
