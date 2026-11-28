# ACTIVE PHASE — المرحلة الجارية

> **واحدة فقط مفتوحة في أي وقت** (Phase Lock — `README.md` §4).

| | |
|---|---|
| **المرحلة** | `DEV-M2` — Magicly Market (متجر `/shop` الموحّد + الشراء المختلط الذري) |
| **الحالة** | 🔄 **جارية** — الجزء ١ (Market Money + Exchange) مكتمل ومطبّق على الإنتاج |
| **الفرع** | `feat/community-c1-discovery` |
| **آخر تحديث** | 2026-11-28 |
| **ملف المرحلة السابقة** | `phases/dev-m1-economy-foundation.md` (مكتملة — تقرير الإغلاق داخله) |

---

## 1. ما أُغلق قبلها — DEV-M1 Economy Foundation (✅ 2026-11-28)

- الاقتصاد موحّد على مسار مركزي: `award_coins` / `_award_coins_variable` / `_award_coins_core` / `add_coins_grant` (مقفول) — **مطبّق على الإنتاج ومُتحقق منه**.
- الحارس `trg_coin_ledger_earn_guard` يمنع كتابة الكلاينت على `coin_ledger` (مُثبت).
- قواعد 29 مصدر — مصادر DEV-M1 والفلوس `is_live=false`.
- التفاصيل: `phases/dev-m1-economy-foundation.md` · قرارات D-M-01..07 في `DECISIONS.md`.

## 1ب. ما أُغلق داخل DEV-M2 حتى الآن

- **الجزء ١ — Market Money + Exchange (✅ 2026-11-28):** `db/115` مطبّقة على الإنتاج — باقات الكوينز بالفلوس عبر مسار الدفع اليدوي (D-M-09) + التبديل الذري بالاتجاهين مع سقوف يومية (D-M-08) + واجهات `/shop` و`/store` والإدارة.
- **الجزء ٢ — Hybrid + دمج المتجر (✅ 2026-11-28):** `db/116` مطبّقة — التسعير المختلط الذري (D-M-03/D-M-11) + ٤ منتجات Learning Store + دمج `/store` في `/shop` (D-M-02) + سجل المشتريات (D-M-10) + تصفية دين `CURRENCY_META` (D-DEV-001). **إصلاح bug حي:** شراء حزم AI بالكوينز كان بيخصم من غير منح الكريدت.
- التفاصيل: `phases/dev-m2-market-money-exchange.md`.

## 2. نطاق DEV-M2 (من `docs/STORE_GAMES_REBUILD_PROPOSAL.md`)

1. دمج `/store` في `/shop` كقسم Magic Credits + redirect (D-M-02).
2. أقسام المتجر العشرة المعتمدة في التصميم.
3. التسعير الثلاثي: Coins / Credits / Hybrid — شراء مختلط **ذري** يخصم الاثنين أو لا شيء (D-M-03).
4. `coin_orders` + `coin_inventory` + صفحة سجل المشتريات.
5. إصلاح `CURRENCY_META` القديم (دين D-DEV-001).

## 3. قيود دائمة

- 🔒 **DEV-02 (الامتحانات) محمي — OUT OF SCOPE** (قرار المالك 2026-11-14): لا قراءة ولا تحليل ولا تعديل لأي ملف امتحانات.
- أي SQL على الإنتاج: بموافقة المالك الصريحة فقط (D-M-07).
- لا يُكرَّر نظام مالي جديد جنب الموجود — كل العملة تمر من `db/113`.

---

## سجل التحديثات

| التاريخ | الحدث |
|---|---|
| 2026-11-28 | إغلاق DEV-M1 (تطبيق 113/114 على الإنتاج + تحقق كامل + commit `286f952a`) — فتح DEV-M2 |
| 2026-11-28 | DEV-M2 جزء ١: Market Money + Exchange — db/115 على الإنتاج + smoke transactional + واجهات (D-M-08/D-M-09) |
| 2026-11-28 | DEV-M2 جزء ٢: Hybrid ذري + Learning Store + دمج /store في /shop — db/116 على الإنتاج (D-M-03/D-M-10/D-M-11) |
