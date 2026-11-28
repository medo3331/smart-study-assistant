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

## 3. متبقي في DEV-M2 (ليس في هذا الجزء)

1. دمج `/store` كامل في `/shop` + redirect (D-M-02) — اللي اتعمل cross-links مؤقتة.
2. التسعير المختلط للمنتجات نفسها (Hybrid products) + `coin_orders`/`coin_inventory` الموحدة (D-M-03).
3. أقسام المتجر العشرة + سجل المشتريات.
4. إصلاح `CURRENCY_META` (دين D-DEV-001).
