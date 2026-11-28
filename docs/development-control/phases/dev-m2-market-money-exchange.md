# DEV-M2 (جزء ١) — Market Money + Exchange — تقرير تنفيذ

> **التاريخ:** 2026-11-28 · **القرارات:** D-M-08 (التبديل اليدوي) · D-M-09 (شراء الكوينز بالفلوس) · **الهجرة:** `db/115-market-money-exchange.sql` — **مطبّقة على الإنتاج**

---

## 1. ما تم تنفيذه

### ١) شحن الكوينز بالفلوس الحقيقية (D-M-09)
- جدول `coin_packs` (نفس نمط `credit_packs`) + RLS قراءة للمفعّل فقط + ٤ باقات معتمدة من التصميم §6:
  | الباقة | Coins | السعر |
  |---|---|---|
  | باقة البداية | 100 | 10 EGP |
  | الباقة الشهيرة | 550 | 50 EGP |
  | الباقة الموفرة | 1,200 | 100 EGP |
  | الباقة الضخمة | 2,700 | 200 EGP |
  (الأسعار من الجدول — تعديل إداري بدون كود، D-M-06.)
- `purchase_requests` بيدعم `kind='coins'` (قيد الـ payload الثلاثي + `coin_pack_id`/`coins`).
- نفس تدفق الدفع اليدوي الموجود: طلب → إثبات دفع → موافقة أدمن → `add_coins_grant` (المسار المركزي، `source='purchase'` `source_class='purchase'` — **اتفعّل بدون سقف يومي** لأن كل طلب مدفوع ومراجَع).
- الأسعار من snapshot القاعدة — الكلاينت ما بيبعتش أي مبلغ.

### ٢) التبديل اليدوي بالاتجاهين (D-M-08)
- جدول `economy_exchange_settings` (صف واحد): تفعيل كل اتجاه + الأسعار + الحدود الدنيا + السقوف اليومية — **كلها editable من الجدول**.
  - `10 كوين = 1 كريدت` (شراء) · `1 كريدت = 8 كوين` (بيع) — القيد `rate_out < rate_in` يمنع الـ arbitrage الدائري.
  - سقوف افتراضية: 3,000 كوين/يوم · 300 كريدت/يوم.
- `exchange_coins_to_credits(int)` و`exchange_credits_to_coins(int)`: SECURITY DEFINER، مصادقة إجبارية (anon ممنوع)، خصم وإضافة **في نفس المعاملة**، سقف يومي بتوقيت القاهرة، `ref` مشترك يضمن idempotency، وفشل المنح → استرداد الكريدت (`exchange_refund`) — لا خصم بلا مقابل.
- `credit_grants.source_check` اتوسع بـ `'exchange'` + `add_coins_grant` بيقبل `source_class='exchange'` + قاعدة مصدر جديدة `exchange` (live، سقف 300 منحة/يوم).

### ٣) الواجهات
- `/shop`: قسم «شحن كوينز بالفلوس» (باقات + إنشاء طلب + تأكيد دفع inline + قائمة طلبات الكوينز) + «محوّل الكوينز والكريدت» (معاينة بنفس معادلات السيرفر + أرصدة حية). بيتخفوا لو جداول db/115 مش متطبقة.
- `/store`: cross-link للمتجر + عرض طلبات الكوينز في «طلباتي».
- `/admin/purchase-requests`: فرع موافقة `kind='coins'` → `add_coins_grant` + audit + إشعارات + labels.

### ٤) الكود
| ملف | التغيير |
|---|---|
| `db/115-market-money-exchange.sql` | الهجرة (٨ أقسام) |
| `lib/shop/exchange.ts` | دوال حساب التبديل النقية (مشتركة UI/اختبارات) |
| `lib/store/purchase-client.ts` · `lib/store/purchase-requests.ts` · `lib/admin/purchase-requests.ts` | `kind='coins'` + حقول `coin_pack_id`/`coins` |
| `app/api/store/purchase-requests/route.ts` | فرع POST `kind='coins'` (سعر من القاعدة + منع التكرار) |
| `app/admin/actions/purchase-requests.ts` | فرع موافقة الكوينز |
| `app/admin/purchase-requests/PurchaseRequestsTable.tsx` | label كوينز |
| `components/shop/CoinPacksPanel.tsx` · `components/shop/ExchangeWidget.tsx` | جديد |
| `app/shop/page.tsx` · `app/store/page.tsx` | الأقسام + cross-links |
| `tests/market-money-migration.test.ts` | عقد static (19 اختبار) |

---

## 2. التحقق (إنتاج)

- **تطبيق db/115:** `BEGIN…COMMIT` واحد — نظيف. artifact: `docs/artifacts/market-money-apply-*.json`.
- **تحقق بعدي:** الباقات الأربعة موجودة · صف الإعدادات (10/8 + السقوف) · القواعد `exchange`/`purchase` live · `anon` عنده صفر grants على RPCs التبديل · قيد `credit_grants_source_check` متوسع.
- **Smoke transactional (BEGIN…ROLLBACK):**
  - `exchange_coins_to_credits(100)` → `credits_granted=10` ✅
  - `exchange_credits_to_coins(10)` → `coins_granted=80` ✅
  - أقل من الحد الأدنى (5 كريدت) → مرفوض ✅ · بدون جلسة → مرفوض ✅
  - بعد ROLLBACK: صفر صفوف في الـ ledgerين ✅ (ما وصلش أي أثر للإنتاج)
- **الاختبارات:** 2,366 passed (منها 19 جديدة) · **typecheck:** نظيف.

---

## 3. الجزء ٢ — Hybrid + دمج المتجر (✅ 2026-11-28 — db/116)

### ما تم تنفيذه
1. **التسعير المختلط الذرّي (D-M-03/D-M-11):** `shop_catalog.credits_price` (null = كوينز بس) + `purchase_item` بنسخة موحّدة بتتحقق من الرصيدين **قبل** أي خصم وبتخصم الاتنين في نفس المعاملة (فشل أي جانب = rollback للكل). الخصم اليومي على جزء الكوينز بس. التوقيع `(spent, balance)` زي ما هو — الكلاينت الحالي اشتغل من غير تغيير.
2. **إصلاح bug حي:** النسخة الحية من `purchase_item` في الإنتاج كانت القديمة (من `db/shop.sql`) — يعني شراء حزم AI بالكوينز (`useful.ai-*`) كان بيخصم كوينز **من غير منح الكريدت** (معالجة useful من phase-e عمرها ما اتصحّت). db/116 جمعتها.
3. **٤ منتجات Learning Store هجينة** (التصميم §3، متظبطة على نطاقات الندرة): تجربة الامتحان 500+30 · مراجعة متقدمة 1000+50 · تجربة شخصية 1200+75 · حزمة مراجعة موسّعة 2000+100 — الـ effect = entitlement (بيتفتح مع تجارب AI في DEV-M3).
4. **دمج /store في /shop (D-M-02):** قسم Magic Credits (`CreditPacksPanel` — حزم + تعليمات دفع من `app_settings` + طلبات وتأكيد inline) + قسم باقات الكوينز + المحوّل + سجل المشتريات في `/shop`. `/store` → redirect دائم لـ `/shop#credits` (الروابط القديمة في UnifiedChat/rate-limit شغالة). `StoreClient` اتحذف (كان استخدامه /store بس) — `CheckoutRequestClient` و`PaymentConfirmForm` زي ما هما.
5. **سجل المشتريات (D-M-10):** view `shop_purchase_history` فوق `coin_ledger` بـ security_invoker (الـ RLS بتاع الجدول بيتطبق) — **مفيش جداول مالية مكررة** (لا coin_orders ولا coin_products ولا coin_inventory).
6. **دين D-DEV-001 اتصفّى:** `CURRENCY_META` بقت تقول الحقيقة — AI_CREDITS/ENTITLEMENT/SUBSCRIPTION كلها LIVE بمخازنها الفعلية.

### التحقق (إنتاج)
- db/116 مطبّقة نظيفة — artifact `docs/artifacts/market-hybrid-apply-*.json`.
- **Smoke transactional (BEGIN…ROLLBACK):** شراء هجين 500+30 → خصم الكوينز والكريدت + entitlement + صف مخزن في نفس المعاملة ✅ · الشرا التاني مرفوض ✅ · بعد ROLLBACK صفر صفوف ✅.
- ترتيب الفحوص في الدالة الحية: فحص الكريدت **قبل** خصم الكوينز (متحقق آلياً من الـ def المطبّق).
- الاختبارات: 2,376 passed (منها 10 جديدة لعقد 116) · typecheck نظيف. (تشغيلة أولى فيها 3 فشل شبكة من اختبارات Image-Gen — أُعيدت وشُحنت كاملة.)

---

## 3.م — الجزء ٣ — Bundles & Offers (✅ 2026-11-28 — db/117)

### ما تم تنفيذه
1. **الحزم = منتجات عادية في `shop_catalog`** بنوع `useful` جديد `'bundle'` (D-M-10: مفيش جداول منتجات مكررة) — شرا واحد بيمنح كل المكونات (عناصر مخزن + entitlements) **في نفس المعاملة** (D-M-03): فشل أي مكون = rollback للكل.
2. **حماية الدالة:** الحزمة الفاضية ممنوعة · كل عنصر لازم يكون موجود في `shop_catalog` · عناصر اللي معاك من قبل بتتخطى (`on conflict do nothing` — الحزمة دايمًا أرخص من مجموع مكوناتها) · التسعير المختلط بنفس آلية `credits_price` (db/116).
3. **الحزم الثلاث من التصميم §8:** حزمة البداية 600 (أفاتار+برواز+لقب) · حزمة هواة الجمع 1500 (رفيقين+برواز) · حزمة المذاكرة 1200+60 هجينة (entitlements مراجعة متقدمة + تجربة امتحان).
4. **قسم Bundles & Offers** في `/shop` (الأقسام العشرة اكتملت) + `FreeRewardsPanel` (قسم Free Rewards: زر مشاهدة إعلان **معطّل — «قريبًا»** — قاعدة `ad_reward` بتفضل `is_live=false` لحد دمج شبكة إعلانات + SSV، D-M-05).
5. **Economy Balancing (D-M-06):** صفحة `/admin/economy` (Owner فقط — `rewards.manage`) — إصدار الكوينز حسب التصنيف والمصدر + متوسط وأعلى الأرصدة (مراقبة التضخم، التصميم §10) + تعديل مباشر لقواعد المكافآت وإعدادات المحوّل وأسعار الباقات — كل تغيير بـ Audit Log.

### التحقق (إنتاج)
- db/117 مطبّقة نظيفة (`BEGIN…COMMIT`) — الحزم الثلاث موجودة والدالة الحية فيها فرع `'bundle'`.
- **Smoke transactional (BEGIN…ROLLBACK):** شراء حزمة البداية → 600 كوين + 3 مكونات + صف الحزمة في نفس المعاملة ✅ · الشرا التاني مرفوض ✅ · حزمة المذاكرة الهجينة → 1200 كوين + 60 كريدت + entitlementين ✅ · بعد ROLLBACK صفر صفوف والأرصدة زي ما كانت ✅.
- الاختبارات: 2,398 passed (منها 11 جديدة لعقد 117) · typecheck نظيف.

---

## 4. متبقي في DEV-M2 / مؤجل بقرار

1. ~~عروض وحزم مجمعة (Bundles)~~ — **اتنفّذت (جزء ٣، db/117).** Seasonal (coin_store_events) لسه.
2. ~~Economy Balancing dashboard~~ — **اتنفّذت (جزء ٣، `/admin/economy`).**
3. **مكافآت الدراسة (D-M-04):** قواعد `lesson_quiz_passed`/`review_done`/`exam_passed` موجودة `is_live=false` — محتاجة إثبات إتمام من السيرفر قبل التفعيل. الامتحانات (DEV-02) محمية OUT OF SCOPE.
4. **جوائز المتصدرين الأسبوعية:** cron الترتيب والمنح — مؤجل.
5. **Rewarded Ads:** قاعدة `ad_reward` (5 كوينز، سقف 3) موجودة ومعطّلة — التفعيل بعد اختيار شبكة إعلانات + Server-side verification (D-M-05). الواجهة جاهزة (`FreeRewardsPanel`) والزر معطّل عمدًا.
