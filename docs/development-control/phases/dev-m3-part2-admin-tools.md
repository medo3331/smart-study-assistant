# DEV-M3 — جزء ٢: أدوات الإدارة المالية (Admin Tools)

**التاريخ:** 2026-11-28 · **الفرع:** `feat/community-c1-discovery` · **الترحيل:** `db/119-admin-grant.sql`

## المطلوب (من المالك)

1. أي تعديل في صفحة الـ admin على الـ credit أو الـ coins ما بيتحفظش.
2. طلبات حزم credit/coin بتظهر لكن مش قادر يقبلها أو يرفضها — عايزها زي الاشتراكات.
3. إمكانية إضافة credit من الـ admin.
4. إضافة عناصر جديدة في المتجر من خلال الـ admin — هو اللي يحددها.

## ما تم تنفيذه

### ١) إصلاح حفظ Economy Balancing
- **السبب الأول:** `updateCoinSourceRule` كان بيرفض معرّفات فيها أرقام (`streak_tier_3`) — الـ regex بقى `^[a-z0-9_]{2,40}$`.
- **السبب الثاني:** مفيش `revalidatePath("/admin/economy")` بعد الحفظ — الصفحة كانت بتعرض بيانات قديمة. اتضاف للأجراءات الثلاثة.
- SQL نفسها كانت سليمة (UPDATE على `coin_source_rules` / `economy_exchange_settings` / `coin_packs` / `credit_packs` بيشتغل).

### ٢) طلبات الشراء — قبول/رفض زي الاشتراكات
- `app/admin/actions/purchase-requests.ts`: `ACTIVE_STATUSES = ["payment_submitted", "awaiting_payment"]` — القبول/الرفض مسموح على أي طلب نشط، بالتحديث الذرّي بشرط الحالة.
- `PurchaseRequestsTable.tsx`: طلب من غير إثبات دفع بيظهر تنبيه «المستخدم لسه مؤكدش الدفع» + زر «مراجعة يدوية» بيفتح نموذج القبول/الرفض.

### ٣) إضافة رصيد (Coins وCredits) من اللوحة
- `db/119-admin-grant.sql` (على الإنتاج): تفعيل قاعدة `admin_grant` في `coin_source_rules` (amount=100، daily_cap=5، is_live=true).
- `grantUserBalance` في `economy-balancing.ts`:
  - Coins → `add_coins_grant` (المسار المركزي، `source_class='admin'`) — نفس الـ ledger والحمايات.
  - Credits → `grant_credits` (`p_source='bonus'`).
  - Owner فقط (`rewards.manage`) + Audit Log + `revalidatePath`.
- نموذج «إضافة رصيد لمستخدم» في `/admin/economy` (UUID + نوع + مبلغ + ملاحظة).
- صفحة `/admin/grants` موجودة أصلًا لمنح الكريدت بالتفصيل — اتسابت كما هي.

### ٤) عناصر متجر مخصصة من الأدمن — `/admin/store-items`
- **الإضافة:** `createStoreItem` — الأقسام المسموحة: **صور رمزية (avatar) / ألقاب (title) / رفقاء (companion)** فقط (قيمها إيموجي/نص فبتشتغل من غير CSS أو باكات جاهزة). الندرة الست، سعر كوينز (0–100,000) وكريدت اختياري (هجين).
- **التخزين:** صف في `shop_catalog` مع `metadata = {custom:true, name, desc, value}` — الشراء بيمر من `purchase_item` الحالية (السعر من الجدول) بدون أي تغيير SQL.
- **الحذف:** `deleteStoreItem` — مرفوض لو العنصر مملوك لأي مستخدم (توثيق تاريخ الشرا).
- **العرض:** `fetchShopState` بتجيب العناصر المخصصة في `state.customItems`، وصفحتا `/shop` و`/inventory` بيدمجوها مع الكتالوج الثابت. `equippedItem` بيراعيها فالتلبيس بيشتغل.
- الصفحة مسجلة في `lib/admin/nav.ts` باسم «عناصر المتجر».

## حدود معروفة
- رفيق مخصص بيظهر في المتجر والمخزن، لكن لوحة الرفيق على الداشبورد بتعرض الرفيق الافتراضي لو ملبوس عنصر مخصص (المراحل بتتقرا من الكتالوج الثابت هناك).
- الإطارات والثيمات والأصوات والاحتفالات مش متاحة للإضافة من اللوحة عمدًا (محتاجة CSS/باكات).

## التحقق
- `npx tsc --noEmit` ✅
- `npx vitest run` — 2,415 passing (منها `tests/market-admin-tools.test.ts` — 15 اختبار عقد).
- `db/119` اتطبقت على الإنتاج واتأكد من الصف.
