# PHASE 0 — PRODUCTION RECONCILIATION REPORT (P0-A)

**التاريخ:** 2026-11-19
**النوع:** Read-Only Production Snapshot + مقارنة بالمستودع
**الحالة:** P0-A مكتمل. **لا كود، لا Migration، لا تعديل بيانات.**
**قرار:** لا انتقال تلقائي إلى P0-B. هذا التقرير للمراجعة أولًا.

---

## 0) إثبات أن التنفيذ كان Read-Only

| الضمان | التنفيذ |
|---|---|
| اتصال | `options=-c default_transaction_read_only=on` |
| معاملة | `BEGIN TRANSACTION READ ONLY` … `ROLLBACK` |
| حارس SQL | يرفض أي شيء لا يبدأ بـ `SELECT/WITH` ويرفض `INSERT/UPDATE/DELETE/DDL` |
| Statement timeout | 30 ثانية |
| كتابة | **صفر** — لا INSERT/UPDATE/DELETE/DDL/Backfill |
| Git | لا Commit / Push / Deploy |

**Snapshot 1 (الأساسي):** `docs/artifacts/phase0-preflight-2026-11-19T14-09-25-809Z.json`
**Snapshot 2 (استكمال):** `docs/artifacts/phase0-preflight-extras-2026-11-19T14-12-31-423Z.json`
**وقت التنفيذ:** 2026-11-19T14:09:25Z → 14:12:31Z
**قاعدة البيانات:** PostgreSQL 17.6 — user: `postgres` — Read-only.

> ملاحظة: الـ Snapshot يحتوي تعريفات الدوال فقط، ولا يحتوي أي أسرار أو بيانات شخصية.
> الملفان محليان (untracked) وغير مدفوعين.

---

## 1) الحكم التنفيذي

**الإنتاج في حالة أفضل من المتوقع، لكنه يخالف المستودع في نقاط محددة.**

- `award_coins` الفعّالة هي **النسخة الكاملة** (signup + daily_login + streak_tier + worship + Cairo day).
- `complete_study_day` تستخدم `award_coins` فعلاً.
- `signup_bonus` يعمل عبر **Trigger + RPC** معًا (idempotent).
- **لا توجد أي حركات `escape_room` تاريخيًا** ⇒ تغيير 60→25 **بدون أثر على الأرصدة**.
- **لا توجد أي حركات `streak_tier_*` أو `referral_reward`** ⇒ مسارات جديدة لم تُستخدم بعد.
- المشكلة الحقيقية: **المصادر المباشرة** (`break_*`, `daily_mission`, `achievement`, `weekly_mission`, `box_refund`, `wheel`, `signup trigger`) لا تمر من `award_coins`، و`is_live` لا يعني شيئًا لها.
- `award_coins` **ممنوحة لـ anon** (وكل دوال المكافآت) — الدوال ترفض الزائر داخليًا، لكنها مخالفة لسياسة الصلاحيات.
- **قرار D-6 يحتاج تعديلًا**: الإنتاج يستخدم مبلغًا متغيرًا للإنجازات، فلا يمكن تحويله إلى `award_coins` الثابتة دون دالة متغيرة.

**التوصية:** GO لـ P0-B مع تعديل خطة D-6 وD-7 وإضافة بند صلاحيات (revoke anon).

---

## 2) `award_coins` الفعّالة — ما هي بالضبط؟

**النسخة الفعّالة = النسخة الكاملة** (تطابق منطق `db/44-retention-phase-2-tiers.sql` مع تعديلات Cairo):

| الخاصية | الحالة الفعلية |
|---|---|
| `SECURITY DEFINER` | ✅ |
| `search_path` | `public, pg_catalog` |
| حد اليوم | **`public.cairo_day()`** (Africa/Cairo) ✅ |
| `signup_bonus` | ✅ فرع موجود |
| `daily_login` | ✅ **دخول نقي** (بلا شرط مذاكرة) + ref = Cairo day |
| `day_done` / `goal_done` / `badge` | ✅ |
| `perfect_week` | ✅ (٦ أيام في آخر ٧) |
| `streak_day` | ✅ |
| `streak_tier_3` / `streak_tier_30` | ✅ |
| `worship_*` (3 مصادر) | ✅ |
| `else` | ✅ يرفض أي مصدر شغّال بلا تحقق حدث |
| السقف اليومي | ✅ محسوب بـ Cairo day |
| idempotency | ✅ `on conflict do nothing` + unique index |
| المبلغ | ✅ من `coin_source_rules` |
| صلاحية anon | ⚠️ `anon` يملك EXECUTE (يرفضه الكود داخليًا) |

**استنتاج:** لا حاجة لإعادة بناء `award_coins` من الصفر. المطلوب فقط:
1) إضافة فروع المصادر المباشرة (أو تحويلها).
2) دالة متغيرة داخلية.
3) حارس `coin_ledger`.
4) سحب EXECUTE من `anon`.

---

## 3) القواعد الفعلية في الإنتاج (18 مصدرًا)

| id | amount | cap | is_live | ملاحظة |
|---|---|---|---|---|
| achievement | 30 | 5 | ✅ | **مضلّل**: المبلغ الفعلي متغير 30–300 |
| badge | 40 | 3 | ✅ | |
| daily_login | 10 | 1 | ✅ | ✅ متوافق مع D-5 |
| day_done | 25 | 3 | ✅ | |
| escape_room | **60** | 1 | ❌ | **مضلّل**: الدالة تمنح 25 مباشرة |
| goal_done | 10 | 5 | ✅ | |
| league_promo | 200 | 1 | ❌ | مستقبلي |
| perfect_week | 120 | 1 | ✅ | |
| referral_reward | 50 | 10 | **✅** | ⚠️ المستودع يقول `is_live=false`؛ لا يوجد فرع في `award_coins` ⇒ خامل لكن يجب إغلاقه |
| signup_bonus | 20 | 1 | ✅ | Trigger + RPC |
| streak_day | 8 | 1 | ✅ | |
| streak_tier_3 | 15 | 1 | ✅ | لا حركات بعد |
| streak_tier_30 | 250 | 1 | ✅ | لا حركات بعد |
| weekly_mission | 150 | 1 | ✅ | لا حركات بعد |
| wheel | 30 | 1 | ❌ | **مضلّل**: الدالة تمنح 5–120 مباشرة |
| worship_adhkar | 3 | 3 | ✅ | |
| worship_prayer | 3 | 5 | ✅ | |
| worship_quran | 5 | 1 | ✅ | |

**مصادر كسب تعمل فعليًا بلا صف قاعدة:**
`break_game` (5)، `break_riddle` (15/20)، `daily_mission` (5)، `box_refund` (20–1000).
→ `award_coins` لا يعرفها، و`maxDailyCoins()` لا يراها.

---

## 4) السجل الفعلي — 85 مستخدمًا / 5,172 Coin

### 4.1 الكسب (Earn) — 6,572 Coin إجمالًا

| source | rows | min | max | total |
|---|---:|---:|---:|---:|
| daily_login | 247 | 5 | 10 | 2,225 |
| signup_bonus | 81 | 20 | 20 | 1,620 |
| day_done | 54 | 25 | 25 | 1,350 |
| streak_day | 118 | 8 | 8 | 944 |
| wheel | 10 | 5 | 40 | 230 |
| badge | 2 | 40 | 40 | 80 |
| break_riddle | 2 | 15 | 20 | 35 |
| break_game | 4 | 5 | 5 | 20 |
| goal_done | 2 | 10 | 10 | 20 |
| daily_mission | 3 | 5 | 5 | 15 |
| worship_prayer | 7 | 3 | 3 | 21 |
| worship_adhkar | 4 | 3 | 3 | 12 |
| **الإجمالي** | | | | **6,572** |

### 4.2 الصرف (Spend) — 1,400

| source | rows | total |
|---|---:|---:|
| premium_trial | 2 | -1,000 |
| purchase | 3 | -400 |

**الرصيد الصافي = 6,572 − 1,400 = 5,172 Coin.**

### 4.3 مصادر بصفر حركات (لا أثر تاريخي لتغييرها)

`escape_room` · `streak_tier_3` · `streak_tier_30` · `achievement` · `weekly_mission` · `box_refund` · `referral_reward`.

> **هذه أهم نتيجة:** تغيير `escape_room` إلى 25 ليس له أي أثر رجعي.

---

## 5) الفجوات: الإنتاج مقابل المستودع

| # | البند | الإنتاج | المستودع / القرار | التصنيف |
|---|---|---|---|---|
| G1 | `escape_room` | rule 60 + live=false؛ function 25 | TS 60 + live=false | **تعارض ثلاثي** |
| G2 | `referral_reward` | live=true | `db/referral_system.sql`: live=false | **انحراف** |
| G3 | `break_game`/`break_riddle`/`daily_mission` | لا صفوف قواعد | غير مسجّلة في `COIN_SOURCES` | **ناقص** |
| G4 | `box_refund` | لا صف قاعدة | كتابة مباشرة | **ناقص** |
| G5 | `achievement` | مبلغ ثابت 30 في القاعدة، متغير فعليًا 30–300 | `sync_achievements` مباشر | **تعارض بنيوي** |
| G6 | `wheel` | live=false لكن يعمل | كتابة مباشرة | **تضليل** |
| G7 | `signup_bonus` | Trigger مباشر + RPC `award_coins` | نفس الشيء | **مساران** |
| G8 | `award_coins`/كل دوال المكافآت | `anon` يملك EXECUTE | المستودع يمنح `authenticated` فقط | **صلاحيات** |
| G9 | `daily_login` التاريخي | 49 صف بـ5 (حتى 2026-09-15) + 198 بـ10 | TS/Phase-4 = 10 | **تاريخي فقط** |
| G10 | `maxDailyCoins()` | يحسب 432 ويستبعد مصادر | لا يعرف المصادر المباشرة | **تعارض** |
| G11 | `profiles` RLS | سياسة `ALL` باسم "Users manage own profile" + حماية xp trigger | الحماية الفعلية trigger فقط | **مخاطر متبقية** |
| G12 | تتبع Migrations | 16 migration فقط من 2026-10-19+ | معظم `db/*.sql` طُبّقت يدويًا | **فجوة توثيق** |
| G13 | `complete_study_day` | لا يتحقق من الاختبار | Phase 1 | **خارج P0** |
| G14 | XP من break/escape/missions | `update profiles set xp` مباشر | D-4: خارج P0 | **دين مؤجل** |
| G15 | `coin_ledger` | لا Trigger حارس | مطلوب في P0 | **ناقص** |
| G16 | سياسات SELECT مكررة | `coin_ledger: owner reads` + `ledger: owner reads` | تكرار غير ضار | **تنظيف اختياري** |

---

## 6) توافق قراراتك D-1..D-8 مع الواقع

| القرار | متوافق؟ | ما يجب فعله بالضبط |
|---|---|---|
| **D-1** escape=25 | ✅ | تحديث rule: `amount=25, is_live=true`؛ تحديث TS إلى 25؛ الدالة الحالية 25 بالفعل؛ **لا Backfill** (صفر حركات) |
| **D-2** Cairo | ✅ | `award_coins` بالفعل Cairo؛ كل الدوال المباشرة تستخدم `cairo_day()`؛ لا تغيير |
| **D-3** riddle مصدران | ✅ | إضافة `break_riddle_fast=20` و`break_riddle=15`؛ اختيار المصدر داخل الدالة حسب `first_seen_at` |
| **D-4** XP خارج P0 | ✅ | لا لمس XP؛ تسجيل الدين في Phase 1 |
| **D-5** daily_login=10 | ✅ | القاعدة 10 والدالة دخول نقي بالفعل؛ الـ5 تاريخية فقط |
| **D-6** achievement مصدر مركزي + ref | ⚠️ **يحتاج تعديل** | لا يمكن تحويله إلى `award_coins` الثابتة. الحل: `_award_coins_variable('achievement', ref, amount)` مع تحقق `amount = achievements_catalog.coins`؛ **مصدر واحد** لا 8 مصادر |
| **D-7** دالة متغيرة داخلية | ✅ | `_award_coins_variable` لـ `achievement` + `wheel` + `box_refund`؛ `REVOKE` من anon/authenticated |
| **D-8** award_coins + Allowlist | ✅ | إبقاء التوقيع؛ إضافة `kind`/`is_variable` في السجل؛ رفض `anon`؛ حارس DB |

---

## 7) مخاطر الأرصدة والمكافآت القديمة

| الخطر | التقييم | التفصيل |
|---|---|---|
| تغيير `escape_room` | **صفر** | لا توجد حركات `escape_room` إطلاقًا |
| تغيير `daily_login` | **صفر للمستقبل** | القاعدة 10 بالفعل؛ 49 صفًا تاريخيًا بـ5 لن يُعاد حسابه |
| تفعيل `referral_reward` | **صفر** | لا حركات ولا فرع؛ سنغلقه `is_live=false` |
| تحويل المصادر المباشرة | **منخفض** | 9 صفوف فقط (break/game/mission)؛ المبالغ ستظل كما هي |
| تفعيل الحارس | **متوسط** | يجب ترتيب التحويل قبل التفعيل وإلا تتعطل المهام/البريك |
| `signup_bonus` Trigger | **متوسط** | يجب أن يظل يعمل أثناء الحارس (bypass داخلي) |
| إعادة تشغيل `db/shop.sql` | **مرتفع** | قد يرجّع `daily_login=5` و`escape_room=60`؛ الحل: Deprecation + مولّد جديد |
| XP debt | **متوسط** | خارج P0، لكنه يمنع فرض "الإتقان" لاحقًا |

---

## 8) ترتيب تطبيق Migration وإدارة Rollback

### التسلسل المقترح (بعد الموافقة)
```
1. db/53-economy-truth.sql
   - add column coin_source_rules.is_variable (default false)
   - upsert rules النهائية (بما فيها break_* و box_refund و escape=25)
   - set referral_reward is_live=false
   - canonical award_coins (نسخة الإنتاج + فروع جديدة)
   - _award_coins_variable
   - revoke anon من كل دوال المكافآت
2. db/54-economy-route-writers.sql
   - تحويل break/escape/mission/weekly/achievement/box/wheel
   - إبقاء signup trigger مع bypass داخلي
3. db/55-economy-ledger-guard.sql
   - تفعيل BEFORE INSERT guard على coin_ledger (earn)
4. اختبارات + حراس CI
```

> لا تُفعّل 55 قبل نجاح 54 على staging.
> الحارس يعتمد على `app.coin_bypass='on'`، وكل دوال المسار المركزي تضبطه.

### Rollback
- لدينا **تعريف كل دالة** في Snapshot JSON (14 دالة + 4 إضافية).
- `award_coins` Rollback = `create or replace` من `pg_get_functiondef` المحفوظ.
- الحارس = `drop trigger`.
- القواعد = إعادة upsert للقيم القديمة (محفوظة في q01).
- **لا فقد بيانات** لأننا لا نلمس `coin_ledger`.

---

## 9) ما يجب تعديله في خطة Phase 0 قبل P0-B

1. **D-6:** استبدال "مصدر لكل إنجاز" بـ **مصدر `achievement` واحد + دالة متغيرة**.
2. **إضافة `signup_bonus` Trigger** إلى قائمة الكتابات المباشرة (bypass داخلي).
3. **إضافة `box_refund`/`wheel`** إلى `_award_coins_variable`.
4. **إضافة `revoke anon`** كبند صلاحيات في P0-B.
5. **إغلاق `referral_reward`** (`is_live=false`).
6. **توثيق أن `supabase_migrations` لا يغطي إلا 16 migration** ⇒ ملفات `db/*.sql` هي السجل الرسمي.
7. **إضافة `is_variable`** إلى `coin_source_rules` (additive).
8. **قبول أن `escape_room` و`achievement` و`weekly_mission` بصفر حركات** ⇒ لا Backfill.

---

## 10) Go / No-Go

| البند | النتيجة |
|---|---|
| P0-A مكتمل | ✅ |
| Read-Only مؤكد | ✅ |
| تعريف `award_coins` محفوظ | ✅ |
| المخاطر مفهومة | ✅ |
| تعارض حرج يمنع P0-B | ❌ لا يوجد |
| قرارات D-1..D-8 | ✅ مع تعديل D-6/D-7 |
| جاهز لبدء P0-B | **بانتظار موافقتك الصريحة** |

**التوصية:** الموافقة على بدء **P0-B** بعد اعتماد تعديل D-6 (مصدر achievement واحد + دالة متغيرة) وإضافة `revoke anon`.

---

## 11) المرفقات

- `docs/artifacts/phase0-preflight-2026-11-19T14-09-25-809Z.json` — 19 استعلامًا + 14 تعريف دالة.
- `docs/artifacts/phase0-preflight-2026-11-19T14-09-25-809Z.md` — نسخة مقروءة.
- `docs/artifacts/phase0-preflight-extras-2026-11-19T14-12-31-423Z.json` — history/صلاحيات/كتالوج/جوائز.
- `scripts/phase0-preflight-readonly.mjs` — أداة الفحص (Read-Only).
- `scripts/phase0-preflight-extras.mjs` — أداة الاستكمال (Read-Only).

---

**نهاية التقرير — لا تغييرات على قاعدة البيانات أو Git.**
