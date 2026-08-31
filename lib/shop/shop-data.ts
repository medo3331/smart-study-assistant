/* ==========================================================================
   طبقة بيانات المتجر

   كل كلام مع Supabase بخصوص الكوينز والمخزن والتلبيس بيمر من هنا. نفس
   أسلوب `lib/pages-data.ts` بالظبط — `Result<T>` يا بيانات يا خطأ، مش
   الاتنين — عشان الصفحات تتعامل مع الاتنين بنفس الشكل اللي هي متعوّدة عليه.

   ⚠️ محتاج `db/shop.sql` يتشغّل في Supabase الأول.

   ⚠️⚠️ **مفيش دالة هنا بتكتب في الرصيد.** الكسب والشرا بيمروا على دوال
   `SECURITY DEFINER` في الداتابيز (`award_coins` / `purchase_item`)، والكلاينت
   بيقول **إيه اللي حصل** بس — مش قد إيه ياخد. لو لقيت نفسك محتاج تكتب في
   `coin_ledger` من هنا، فالحل غلط: زوّد قاعدة في `coin_source_rules`.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MISSING_TABLE, toDataError, type DataError, type Result } from "@/lib/pages-data";
import { SLOTS, type Slot, type ShopItem } from "./types";
import type { Rarity } from "./rarity";
import { DEFAULT_ITEMS, itemById, slotOf } from "./catalog";
import { leagueFromXp, levelFromXp, hasLeague, type League, type EconomyContext } from "./economy";

/* --------------------------------------------------------------------------
   الأخطاء
   -------------------------------------------------------------------------- */

/**
 * دوال الداتابيز بترمي `raise exception` برسالة عربية جاهزة للعرض، بس
 * مبدوءة باسم الدالة للّوجز (`purchase_item: الرصيد مش كفاية`). المستخدم
 * مش مهتم بإسم الدالة، فبنشيل البادئة ونسيب الرسالة.
 *
 * Postgres بيلفّها كمان في `P0001`، وPostgREST بيحطّها في `message`.
 */
function rpcMessage(raw: string): string {
  return raw.replace(/^[a-z_]+:\s*/i, "").trim();
}

function shopError(error: unknown): DataError {
  const base = toDataError(error);

  // نفس الأربع أكواد، بس الرسالة بتشاور على ملف المتجر مش ملف الصفحات.
  if (base.kind === MISSING_TABLE) {
    return {
      kind: MISSING_TABLE,
      message:
        "جداول المتجر لسه مش موجودة. افتح Supabase → SQL Editor وشغّل ملف db/shop.sql، وبعدها حدّث الصفحة. تشغيله أكتر من مرة مش بيضرّ.",
    };
  }

  const err = (error ?? {}) as { code?: string; message?: string };

  // خطأ من جوّه دالة plpgsql: الرسالة نفسها هي اللي المفروض تتعرض.
  if (err.code === "P0001" && err.message) {
    return { kind: "GENERIC", message: rpcMessage(err.message) };
  }

  return base;
}

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function fail<T>(error: unknown): Result<T> {
  console.error("shop-data:", error);
  return { data: null, error: shopError(error) };
}

/* --------------------------------------------------------------------------
   الأنواع
   -------------------------------------------------------------------------- */

export interface OwnedItem {
  itemId: string;
  favorite: boolean;
  purchasedAt: string;
  lastEquippedAt: string | null;
}

export interface CoinEntry {
  id: string;
  source: string;
  /** موجب كسب، سالب شرا */
  amount: number;
  sourceType: "earn" | "spend";
  /** معرّف السبب: item_id للشرا، معرّف اليوم أو الوسام للكسب */
  refId: string | null;
  createdAt: string;
}

/** الملبوس في كل خانة. الخانة الناقصة معناها «لسه ما اتمنحش الافتراضي». */
export type EquippedMap = Partial<Record<Slot, string>>;

/**
 * كل اللي المتجر والمخزن محتاجينه في نداء واحد.
 *
 * الـ XP والسلسلة جوّه هنا مش في هوك تاني: شروط الفتح محتاجاهم، فلو
 * جِوا من مكان تاني كان ممكن الكارت يقول «مفتوح» والرصيد لسه بيتحمّل.
 *
 * Store Boundary (Phase A): المتجر يستهلك Coins فقط عبر coin_ledger/coin_balance()
 * (شراء/صناديق/عجلة) — لا XP ولا AI Credits/Tokens. الـ XP/Level/League للعرض
 * وشرط الفتح فقط (unlock_satisfied في DB). لا coupling مع AI Router بعد.
 * ShopState ≈ EconomyContext + inventory — الـ context الخفيف في economy.ts هو التمثيل الموحّد.
 */
export interface ShopState {
  balance: number;
  xp: number;
  streak: number;
  /** أيام مخلّصة في study_days — شرط `sessions` بيتقاس بيها */
  sessions: number;
  level: number;
  league: League;
  owned: readonly OwnedItem[];
  ownedIds: ReadonlySet<string>;
  equipped: EquippedMap;
  /**
   * عدد أوسمة تحدي الفصل — شرط `badges` بيتقاس بيه.
   *
   * ⚠️ عدد مش قائمة معرّفات: `badges.id` نوعه uuid عشوائي لكل صف
   * (db/pages.sql سطر ١٣٧)، فمفيش معرّف ينفع يتكتب في الكتالوج. نفس
   * السبب المكتوب على `{ kind: "badges" }` في types.ts.
   */
  badgeCount: number;
}

/** Alias موثّق: نفس بيانات EconomyContext لكن مع المخزن — للتوافق مع spec §7 */
export type ShopEconomyContext = EconomyContext;

interface InventoryRow {
  item_id: string;
  favorite: boolean;
  purchased_at: string;
  last_equipped_at: string | null;
}

interface EquippedRow {
  slot: string;
  item_id: string;
}

interface LedgerRow {
  id: string;
  source: string;
  amount: number;
  source_type: string;
  ref_id: string | null;
  created_at: string;
}

function toOwned(row: InventoryRow): OwnedItem {
  return {
    itemId: row.item_id,
    favorite: row.favorite,
    purchasedAt: row.purchased_at,
    lastEquippedAt: row.last_equipped_at,
  };
}

function isSlot(v: string): v is Slot {
  return (SLOTS as readonly string[]).includes(v);
}

/* --------------------------------------------------------------------------
   الحالة الجاهزة: الرصيد + المخزن + الملبوس + أساسيات شروط الفتح
   -------------------------------------------------------------------------- */

/**
 * نداء واحد بيجيب كل حاجة، والتحديث بيجيب كمان.
 *
 * `grant_default_items` أول حاجة: الحساب الجديد من غيره يفتح المتجر
 * ويلاقي «الملزمة الأصلية» نفسها مش مملوكة — وكل خاناته فاضية. والمفروض
 * إنها idempotent فتشغيلها في كل تحميل رخيص.
 *
 * الحساب الجديد ممكن **مايكونش ليه صف بروفايل بعد** (الداشبورد هي اللي
 * بتعمله)، فلازم `maybeSingle` مش `single`، والأرقام تبدأ بصفر.
 */
export async function fetchShopState(
  supabase: SupabaseClient,
  userId: string,
): Promise<Result<ShopState>> {
  // ⚠️ المنح **قبل** القراءة مش معاها. لو الاتنين اتوازوا، الحساب الجديد
  // ممكن يقرا مخزن فاضي قبل ما المنح يخلّص — وده بالظبط اللي المنح موجود
  // يمنعه. التكلفة ذهاب وعودة زيادة في أول تحميل بس.
  const grantRes = await supabase.rpc("grant_default_items");
  if (grantRes.error) return fail(grantRes.error);

  const [balanceRes, profileRes, invRes, eqRes, sessionRes, badgeRes] = await Promise.all([
    supabase.rpc("coin_balance"),
    supabase
      .from("profiles")
      .select("xp, streak")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("shop_inventory")
      .select("item_id, favorite, purchased_at, last_equipped_at")
      .eq("user_id", userId)
      .order("purchased_at", { ascending: false }),
    supabase.from("shop_equipped").select("slot, item_id").eq("user_id", userId),
    supabase
      .from("study_days")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_completed", true),
    // العدد بس — `head: true` معناها مفيش صفوف بترجع على السلك. الشرط
    // محتاج رقم، وجلب كل الأوسمة عشان نعدّها تبادل غلط.
    supabase
      .from("badges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (balanceRes.error) return fail(balanceRes.error);
  if (profileRes.error) return fail(profileRes.error);
  if (invRes.error) return fail(invRes.error);
  if (eqRes.error) return fail(eqRes.error);
  if (sessionRes.error) return fail(sessionRes.error);
  // ⚠️ الأوسمة **مش** بتفشّل التحميل. الجدول موجود من مرحلة قديمة وممكن
  // يبقى مش متشغّل في نسخة، ووقتها المفروض المتجر يفتح بشرط وسام مقفول
  // — مش يبقى صفحة خطأ. باقي الاستعلامات فوق أساسية فبتفشّل عادي.
  const badgeCount = badgeRes.count ?? 0;

  const xp = ((profileRes.data as { xp?: number } | null)?.xp ?? 0);
  const streak = ((profileRes.data as { streak?: number } | null)?.streak ?? 0);

  const owned: OwnedItem[] = ((invRes.data ?? []) as InventoryRow[]).map(toOwned);
  const ownedIds = new Set(owned.map((o) => o.itemId));

  const equipped: EquippedMap = {};
  for (const row of (eqRes.data ?? []) as EquippedRow[]) {
    if (isSlot(row.slot)) equipped[row.slot] = row.item_id;
  }

  return ok({
    balance: (balanceRes.data as number) ?? 0,
    xp,
    streak,
    sessions: sessionRes.count ?? 0,
    level: levelFromXp(xp),
    league: leagueFromXp(xp),
    owned,
    ownedIds,
    equipped,
    badgeCount,
  });
}

/**
 * الرصيد لوحده — بيشتغل في أماكن خفيفة (الشريط العلوي لما يكون المتجر
 * مش مفتوح). الجدول بتاعه قراءة-بس من الكلاينت، فمينفعش نجيب «آخر حركة
 * ونجمع منها» — بنادي الدالة اللي بتجمّع في السيرفر.
 */
export async function fetchBalance(supabase: SupabaseClient): Promise<Result<number>> {
  const { data, error } = await supabase.rpc("coin_balance");
  if (error) return fail(error);
  return ok((data as number) ?? 0);
}

/** تاريخ الحركات للصفحة «الكوينز» — لو اتعملت بعدين. من غيرها مفيش فايدة. */
export async function fetchLedger(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<Result<CoinEntry[]>> {
  const { data, error } = await supabase
    .from("coin_ledger")
    .select("id, source, amount, source_type, ref_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return fail(error);
  return ok(
    ((data ?? []) as LedgerRow[]).map((row) => ({
      id: row.id,
      source: row.source,
      amount: row.amount,
      sourceType: row.source_type === "spend" ? "spend" : "earn",
      refId: row.ref_id,
      createdAt: row.created_at,
    })),
  );
}

/* --------------------------------------------------------------------------
   شروط الفتح — تعرّف «قفل» أم لا، وعرض «فاضلك X»
   -------------------------------------------------------------------------- */

export type UnlockStatus =
  | { satisfied: true }
  | { satisfied: false; need: string };

/**
 * هل المستخدم حقّق شرط فتح العنصر؟ مع تعبير عربي صغير يوصف الفاضل.
 *
 * ⚠️ ده **للعرض** بس — زر الشرا بيتعطّل، والكارت بيقول «فاضلك ٤ أيام».
 * الحماية الفعلية في `unlock_satisfied` جوه `purchase_item` في الداتابيز.
 * لو التعبير هنا خالف الدالة (مثلاً) المستخدم يشوف زرار شغّال والدالة
 * ترفضه — مش العكس أبداً.
 */
export function unlockStatus(
  item: Pick<ShopItem, "unlock">,
  state: Pick<
    ShopState,
    "xp" | "streak" | "level" | "league" | "sessions" | "badgeCount"
  >,
): UnlockStatus {
  const u = item.unlock;
  if (!u) return { satisfied: true };

  switch (u.kind) {
    case "streak":
      return state.streak >= u.days
        ? { satisfied: true }
        : { satisfied: false, need: `سلسلة ${u.days} يوم (معاك ${state.streak})` };
    case "sessions":
      return state.sessions >= u.count
        ? { satisfied: true }
        : { satisfied: false, need: `${u.count} جلسة مخلّصة (خلصت ${state.sessions})` };
    case "level":
      return state.level >= u.level
        ? { satisfied: true }
        : { satisfied: false, need: `المستوى ${u.level} (عندك ${state.level})` };
    case "league":
      return hasLeague(state.xp, u.league)
        ? { satisfied: true }
        : { satisfied: false, need: `دوري «${u.league}» (دورك: ${state.league.name})` };
    case "badges":
      // ⚠️ نفس `count(*) from badges` في `unlock_satisfied`. الاتنين
      // بيعدّوا صفوف نفس الجدول لنفس المستخدم، فمفيش مجال يختلفوا.
      return state.badgeCount >= u.count
        ? { satisfied: true }
        : {
            satisfied: false,
            need: `${u.count} وسام تحدي فصل (معاك ${state.badgeCount})`,
          };
    case "daily":
      /* الحصري مقفول من هنا **دايماً**. مش بنسأل «هو في متجر النهارده؟»
         لأن السؤال ده جوابه في السيرفر: `purchase_item` بتقرا
         `shop_daily` بنفسها. الواجهة بتعرض الحصري من `shop_daily_today`
         اللي راجعة من السيرفر أصلاً، فالكارت اللي بيستخدم الدالة دي
         (كارت المتجر العادي) المفروض يوريه مقفول.

         القاعدة: الواجهة مسموح تبقى **أصرم** من الدالة، ممنوع تبقى
         أرخى. */
      return { satisfied: false, need: "حصري المتجر اليومي" };
  }
}

/* --------------------------------------------------------------------------
   الإجراءات
   -------------------------------------------------------------------------- */

export interface PurchaseOutcome {
  spent: number;
  balance: number;
}

/**
 * الشراء الكامل: الخصم والتمليك في معاملة واحدة جوه `purchase_item`.
 * بيرجّع الرصيد الجديد مباشرة — فالصفحة بتحدّثه من هنا مش من نداء تاني.
 */
export async function purchaseItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<Result<PurchaseOutcome>> {
  const { data, error } = await supabase.rpc("purchase_item", { p_item_id: itemId });
  if (error) return fail(error);
  // `returns table` بيرجّع صفوف — PostgREST بيسلّمها ليستة حتى لو صف واحد.
  const row = (Array.isArray(data) ? data[0] : data) as PurchaseOutcome | null;
  return ok({ spent: row?.spent ?? 0, balance: row?.balance ?? 0 });
}

export interface BoxOutcome {
  itemId: string;
  rarity: Rarity;
  duplicate: boolean;
  refunded: number;
  spent: number;
  balance: number;
}

/**
 * فتح صندوق. **كل حاجة في السيرفر**: الخصم، السحب، التمليك أو التعويض.
 *
 * ⚠️ مفيش أي عشوائية هنا. الدالة دي بتبعت معرّف الصندوق وبتستلم النتيجة —
 * والأنيميشن في الواجهة بيعرض نتيجة جاهزة، مش بيسحب وبعدين يبلّغ. لو
 * السحب كان هنا، أي حد يفتح الكونسول ويقول «طلّعلي خرافي».
 */
export async function openBox(
  supabase: SupabaseClient,
  boxId: string,
): Promise<Result<BoxOutcome>> {
  const { data, error } = await supabase.rpc("open_box", { p_box_id: boxId });
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    item_id: string;
    rarity: Rarity;
    duplicate: boolean;
    refunded: number;
    spent: number;
    balance: number;
  } | null;
  if (!row) return fail({ message: "الصندوق مافتحش — جرّب تاني" });
  return ok({
    itemId: row.item_id,
    rarity: row.rarity,
    duplicate: row.duplicate,
    refunded: row.refunded ?? 0,
    spent: row.spent ?? 0,
    balance: row.balance ?? 0,
  });
}

export interface DailyOffer {
  itemId: string;
  /** السعر الأصلي — بيتشطب في الكارت */
  price: number;
  /** السعر بعد الخصم. **جاي من السيرفر** — الواجهة مش بتحسبه */
  final: number;
  discount: number;
  exclusive: boolean;
  owned: boolean;
}

/**
 * عروض النهارده. الدالة في السيرفر بتولّدها لو لسه، فأول زيارة في اليوم
 * مش بتلاقي متجر فاضي.
 *
 * ⚠️ `final` بيتقرا من الرد مش بيتحسب هنا. لو حسبناه في الواجهة، الكارت
 * والدالة يقدروا يختلفوا — والمستخدم يشوف سعر ويتخصم منه سعر تاني.
 */
export async function fetchDailyShop(
  supabase: SupabaseClient,
): Promise<Result<readonly DailyOffer[]>> {
  const { data, error } = await supabase.rpc("shop_daily_today");
  if (error) return fail(error);
  const rows = (data ?? []) as {
    item_id: string;
    price: number;
    final: number;
    discount: number;
    exclusive: boolean;
    owned: boolean;
  }[];
  return ok(
    rows.map((r) => ({
      itemId: r.item_id,
      price: r.price,
      final: r.final,
      discount: r.discount,
      exclusive: r.exclusive,
      owned: r.owned,
    })),
  );
}

export interface WheelStatus {
  canSpin: boolean;
  spun: boolean;
  /** ذاكر النهارده؟ اللفة مكافأة مذاكرة مش مكافأة دخول */
  studied: boolean;
  /** لو لف خلاص: كسب كام */
  coins: number;
}

export async function fetchWheelStatus(
  supabase: SupabaseClient,
): Promise<Result<WheelStatus>> {
  const { data, error } = await supabase.rpc("wheel_status");
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    can_spin: boolean;
    spun: boolean;
    studied: boolean;
    coins: number;
  } | null;
  return ok({
    canSpin: row?.can_spin ?? false,
    spun: row?.spun ?? false,
    studied: row?.studied ?? false,
    coins: row?.coins ?? 0,
  });
}

export interface SpinOutcome {
  prizeId: string;
  label: string;
  coins: number;
  balance: number;
}

/**
 * لفة العجلة. الجايزة بتتسحب في السيرفر، والحد اليومي على **فهرس فريد**
 * في السجل مش على شرط في الكود.
 */
export async function spinWheel(
  supabase: SupabaseClient,
): Promise<Result<SpinOutcome>> {
  const { data, error } = await supabase.rpc("spin_wheel");
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    prize_id: string;
    label: string;
    coins: number;
    balance: number;
  } | null;
  if (!row) return fail({ message: "العجلة مالفّتش — جرّب تاني" });
  return ok({
    prizeId: row.prize_id,
    label: row.label,
    coins: row.coins ?? 0,
    balance: row.balance ?? 0,
  });
}

export interface AwardOutcome {
  awarded: number;
  balance: number;
  capped: boolean;
}

/**
 * كسب كوينز من مصدر مذاكرة. `source` لازم يكون id موجود في COIN_SOURCES
 * وشغّال (`live`). لو اليوم خلص سقفه بترجّع `capped: true` مش خطأ —
 * «خلصت سقف النهاردة» حالة متوقعة، مش عطل يستاهل رسالة حمرا.
 */
export async function awardCoins(
  supabase: SupabaseClient,
  source: string,
  refId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<Result<AwardOutcome>> {
  const { data, error } = await supabase.rpc("award_coins", {
    p_source: source,
    p_ref_id: refId ?? null,
    p_metadata: metadata ?? {},
  });
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as AwardOutcome | null;
  return ok({
    awarded: row?.awarded ?? 0,
    balance: row?.balance ?? 0,
    capped: row?.capped ?? false,
  });
}

/** تلبيس عنصر — الخانة بتتقرا من `shop_catalog` في السيرفر مش من هنا. */
export async function equipItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<Result<Slot>> {
  const { data, error } = await supabase.rpc("equip_item", { p_item_id: itemId });
  if (error) return fail(error);
  const slot = data as string | null;
  if (!slot || !isSlot(slot)) {
    return fail({ message: "equip_item رجّع خانة مش معروفة" });
  }
  return ok(slot);
}

/**
 * الخلع في السيرفر كمان، لسببين: (١) الخانة ترجع للافتراضي المجاني في
 * نفس معاملة الحذف فمفيش لحظة «خانة فاضية»، و(٢) الـ RLS مبتسمحش
 * بالكتابة في `shop_equipped` من المتصفح إلا لو العنصر مملوك — والدالة
 * بتضمن ده بدل ما الواجهة تحاول وتتصدّم بخطأ قيد.
 */
export async function unequipSlot(
  supabase: SupabaseClient,
  slot: Slot,
): Promise<Result<string | null>> {
  const { data, error } = await supabase.rpc("unequip_slot", { p_slot: slot });
  if (error) return fail(error);
  return ok((data as string | null) ?? null);
}

/**
 * النجمة (تفضيل) — الحاجة الوحيدة اللي الكلاينت بيكتبها في جدول المتجر
 * مباشرة. مسموح لأنها مالهاش أي علاقة بالرصيد ولا بالتلبيس، والـ RLS
 * بتحصرها على صفوف صاحبها.
 */
export async function toggleFavorite(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  favorite: boolean,
): Promise<Result<true>> {
  const { error } = await supabase
    .from("shop_inventory")
    .update({ favorite })
    .eq("user_id", userId)
    .eq("item_id", itemId);
  if (error) return fail(error);
  return ok(true);
}

/* --------------------------------------------------------------------------
   تطبيق الملبوس على الصفحة
   -------------------------------------------------------------------------- */

/** الافتراضي المجاني في كل خانة — نفس اللي `unequip_slot` بترجع له. */
const DEFAULT_BY_SLOT: Partial<Record<Slot, ShopItem>> = (() => {
  const out: Partial<Record<Slot, ShopItem>> = {};
  for (const it of DEFAULT_ITEMS) {
    const slot = slotOf(it);
    if (slot && !out[slot]) out[slot] = it;
  }
  return out;
})();

/** العنصر الملبوس في خانة — والافتراضي المجاني لو مفيش. */
export function equippedItem(
  state: Pick<ShopState, "equipped">,
  slot: Slot,
): ShopItem | undefined {
  const id = state.equipped[slot];
  return (id ? itemById(id) : undefined) ?? DEFAULT_BY_SLOT[slot];
}

/**
 * محتوى الملبوس: معرّف الباليت للثيم، إيموجي للصورة، اسم الكلاس للإطار،
 * نص اللقب، مراحل الرفيق، مفتاح التراك، معرّف الاحتفال. الواجهة بتفسّره
 * على حسب الخانة — نفس منطق `value` في `types.ts`.
 */
export function equippedValue(
  state: Pick<ShopState, "equipped">,
  slot: Slot,
): string {
  return equippedItem(state, slot)?.value ?? "";
}

/**
 * مفتاح الباليتة الملبوسة على الجهاز.
 *
 * ⚠️ **مش** مصدر الحقيقة — `shop_equipped` هو. ده كاش عشان الباليتة تبان
 * من أول رسمة في أي صفحة من غير ما نستنى Supabase. من غيره المستخدم يفتح
 * الداشبورد ويلاقي الورق الأصلي، وبعد نص ثانية يقلب لثيمه — ومضة كل تحميل.
 *
 * ⚠️⚠️ اسم مختلف تماماً عن `PEN_THEME_KEY` (لون القلم) وعن `theme`
 * (فاتح/غامق). التلاتة أنظمة مستقلة وبتشتغل مع بعض.
 */
export const PACK_KEY = "shop_pack";

/**
 * بيلبّس باليتة الثيم على الصفحة كلها.
 *
 * الباليتات متعرّفة في `globals.css` كـ `:root[data-pack="..."]`، فالتلبيس
 * = خاصية واحدة على `<html>`. و«الملزمة الأصلية» قيمتها `""` ومعناها
 * **شيل الخاصية** — يعني رجّع الورق الأصلي بـ `data-theme` بس.
 *
 * ⚠️ مش بيلمس `data-theme` (فاتح/غامق) ولا `PEN_THEME_KEY`. الاتنين
 * دول نظام تاني موجود وشغّال، والباليتة بتشتغل جوّاهم مش مكانهم.
 */
export function applyThemePack(packId: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (packId) root.setAttribute("data-pack", packId);
  else root.removeAttribute("data-pack");

  try {
    window.localStorage.setItem(PACK_KEY, packId);
  } catch {
    // الستوريج مقفول — الباليتة هتشتغل، بس هتومض في التحميل الجديد
  }
}

/** الباليتة المكاشة — للصفحات اللي مش بتحمّل حالة المتجر. */
export function cachedThemePack(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PACK_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * الخطأ من دالة المتجر بيترجم لجملة قصيرة للتوست. أغلبها سطر واحد جاهز
 * من الداتابيز نفسها، فبنسيب الرسالة دي زي ما هي — بس بنقصر الجمل اللي
 * بتبوظ الشكل (مثل إشارات `%` البارامترات لو حصل فيها حاجة).
 */
export function mutationMessage(res: { error: DataError | null }): string {
  if (!res.error) return "";
  if (res.error.kind === MISSING_TABLE) return res.error.message;
  const m = res.error.message.split("\n")[0].trim();
  return m || "العملية متكملتش — جرب تاني";
}



