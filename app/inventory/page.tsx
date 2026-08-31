"use client";

/* ==========================================================================
   المخزن

   اللي عندك بس. الفرق الجوهري عن المتجر مش الفلترة — الفرق إن هنا فيه
   **قلع**: خانة الصورة والثيم والبرواز مالهاش «فاضي» (فيه افتراضي مجاني)،
   لكن اللقب والرفيق والصوت والاحتفال ممكن تشيلهم خالص.

   والنجمة هنا بتشتغل: المفضلة معناها «الحاجات اللي بلبسها وأقلعها كتير»،
   وده مالوش لازمة في المتجر.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Search, X, Star } from "lucide-react";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../dashboard/components/PageShell";
import { useAuthUser } from "../dashboard/components/use-page-data";
import { CATALOG, slotOf } from "@/lib/shop/catalog";
import { CATEGORY, CATEGORIES, type Category, type ShopItem } from "@/lib/shop/types";
import { RARITIES, RARITY } from "@/lib/shop/rarity";
import { equippedValue, type ShopState } from "@/lib/shop/shop-data";
import { useShop } from "@/lib/shop/use-shop";
import { ItemCard } from "@/components/shop/ItemCard";
import { ItemSheet } from "@/components/shop/ItemSheet";
import { ShopBar } from "@/components/shop/ShopBar";
import { Toast, type ToastMsg } from "@/components/shop/Toast";

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));

/* الأقسام اللي «فاضي» فيها حالة معقولة. الصورة والثيم والبرواز مش هنا:
   ليهم عنصر مجاني افتراضي، فالقلع فيهم بيرجّع الافتراضي مش بيفضّي —
   وزرار مكتوب عليه «اقلعه» وبيرجّع حاجة تانية بيكدب على المستخدم. */
const UNEQUIPPABLE = new Set<Category>(["title", "companion", "sound", "effect"]);

function isEquipped(state: ShopState, item: ShopItem): boolean {
  const slot = slotOf(item);
  return slot !== null && state.equipped[slot] === item.id;
}

export default function InventoryPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const userId = session.status === "ready" ? session.user.id : null;
  const shop = useShop(supabase, userId);

  const [cat, setCat] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  useEffect(() => {
    if (session.status === "anonymous") router.push("/dashboard");
  }, [session.status, router]);

  const say = useCallback((text: string, ok: boolean) =>
    setToast({ id: Date.now(), text, ok }), []);

  const state = shop.state;

  /* المفضلة جاية من `owned` مش من Set جاهز — الحالة بتخزّن العلم جوه
     كل عنصر مملوك، فبنبني الـ Set هنا مرة واحدة للبحث السريع. */
  const favIds = useMemo(
    () => new Set((state?.owned ?? []).filter((o) => o.favorite).map((o) => o.itemId)),
    [state],
  );

  /* المملوك مرتّب: الملبوس الأول، وبعدين المفضّل، وبعدين الأندر.
     المنطق: اللي بتلبسه دلوقتي هو أول حاجة بتدوّر عليها لما تفتح المخزن. */
  const shown = useMemo(() => {
    if (!state) return [];
    let list = CATALOG.filter((i) => state.ownedIds.has(i.id));

    if (cat !== "all") list = list.filter((i) => i.category === cat);
    if (favOnly) list = list.filter((i) => favIds.has(i.id));

    const q = query.trim();
    if (q) {
      list = list.filter(
        (i) => i.name.includes(q) || i.desc.includes(q) || RARITY[i.rarity].name.includes(q),
      );
    }

    return [...list].sort(
      (a, b) =>
        Number(isEquipped(state, b)) - Number(isEquipped(state, a)) ||
        Number(favIds.has(b.id)) - Number(favIds.has(a.id)) ||
        (RARITY_RANK.get(b.rarity) ?? 0) - (RARITY_RANK.get(a.rarity) ?? 0),
    );
  }, [state, cat, query, favOnly, favIds]);

  const open = openId ? CATALOG.find((i) => i.id === openId) : undefined;

  if (session.status === "loading" || shop.phase === "loading") {
    return (
      <PageShell eyebrow="المخزن" title="حاجاتك" feedbackPage="inventory">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  if (shop.phase === "error" || !state) {
    return (
      <PageShell eyebrow="المخزن" title="حاجاتك" feedbackPage="inventory">
        <DataNotice message={shop.error?.message ?? "مش قادرين نجيب المخزن."} />
      </PageShell>
    );
  }

  const avatarEmoji = equippedValue(state, "avatar");
  const ownedCount = CATALOG.filter((i) => state.ownedIds.has(i.id)).length;

  // الأقسام اللي فيها حاجة فعلاً — مالوش لازمة نوري تبويب فاضي
  const liveCats = CATEGORIES.filter((c) =>
    CATALOG.some((i) => i.category === c && state.ownedIds.has(i.id)),
  );

  return (
    <PageShell
      eyebrow="المخزن"
      title="حاجاتك"
      lede="البس، اقلع، وحدّد المفضّل. اللي بتلبسه بيبان في الموقع كله."
      feedbackPage="inventory"
      feedbackLabel="المخزن"
      action={
        <button onClick={() => router.push("/shop")} className="btn btn-marker text-sm">
          للمتجر
        </button>
      }
    >
      <ShopBar state={state} />

      <div className="relative">
        <Search
          className="w-4 h-4 text-ink-soft absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="دوّر في حاجاتك..."
          aria-label="ابحث في المخزن"
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

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {(["all", ...liveCats] as const).map((c) => {
          const on = cat === c;
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
              {c === "all" ? "الكل" : CATEGORY[c].name}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setFavOnly((v) => !v)}
          aria-pressed={favOnly}
          className={`text-[11px] px-2.5 py-1.5 rounded-full border transition flex items-center gap-1.5 ${
            favOnly ? "border-rule-strong text-ink" : "border-rule text-ink-soft hover:text-ink"
          }`}
        >
          <Star className={`w-3 h-3 ${favOnly ? "fill-current" : ""}`} aria-hidden />
          المفضّلة بس
        </button>

        <p className="text-[11px] text-ink-soft tnum ltr-num">
          {ownedCount} من {CATALOG.length} عنصر
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={favOnly ? "⭐" : "🎒"}
          title={favOnly ? "مفيش حاجة في المفضّلة" : "المخزن لسه فاضي"}
          body={
            favOnly
              ? "دوس على النجمة في أي حاجة عندك عشان تلاقيها هنا بسرعة."
              : "ذاكر، اكسب كوينز، واشتري أول حاجة من المتجر."
          }
          action={
            favOnly ? (
              <button onClick={() => setFavOnly(false)} className="btn btn-quiet text-sm">
                وريني الكل
              </button>
            ) : (
              <button onClick={() => router.push("/shop")} className="btn btn-marker text-sm">
                للمتجر
              </button>
            )
          }
        />
      ) : (
        <div className="shop-grid">
          {shown.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              avatarEmoji={avatarEmoji}
              onOpen={() => setOpenId(item.id)}
              onToggleFavorite={() => void shop.favorite(item.id, !favIds.has(item.id))}
              state={{
                owned: true,
                equipped: isEquipped(state, item),
                favorite: favIds.has(item.id),
                lockedNeed: null,
                affordable: true,
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <ItemSheet
            key={open.id}
            item={open}
            owned
            equipped={isEquipped(state, open)}
            lockedNeed={null}
            balance={state.balance}
            busy={shop.busy === open.id}
            avatarEmoji={avatarEmoji}
            onClose={() => setOpenId(null)}
            onBuy={() => {}}
            onEquip={async () => {
              const res = await shop.equip(open.id);
              say(res.message, res.ok);
              if (res.ok) setOpenId(null);
            }}
            /* القلع للخانات اللي ليها معنى فاضي بس. الصورة والثيم والبرواز
               ليهم افتراضي مجاني، فـ«اقلع» فيهم = رجّع الافتراضي — وده
               اللي `unequipSlot` بتعمله، بس الزرار مضلّل فمش بنوريه. */
            onUnequip={
              UNEQUIPPABLE.has(open.category)
                ? async () => {
                    const slot = slotOf(open);
                    if (!slot) return;
                    const res = await shop.unequip(slot);
                    say(res.message, res.ok);
                    if (res.ok) setOpenId(null);
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <Toast msg={toast} onDone={() => setToast(null)} />
    </PageShell>
  );
}
