# PHASE 0 — ECONOMY TRUTH
## خطة تنفيذ دقيقة (بدون كود — للمراجعة والموافقة)

**التاريخ:** 2026-11-19
**الفرع المقترح:** `feat/phase-0-economy-truth`
**الحالة:** خطة فقط. لا Migration، لا تعديل بيانات، لا Push/Merge/Deploy قبل موافقة صريحة.
**يعتمد على:** `docs/MAGICLY_WORLD_MASTER_AUDIT.md` (C1, C2, C3, C9).
**تحديث 2026-11-19:** نتائج P0-A الفعلية في `docs/PHASE_0_PRODUCTION_RECONCILIATION.md` — الخطة أدناه مُعدّلة لتطابقها (خصوصًا D-6 وإضافة `revoke anon`).

---

## 1) هدف المرحلة ونطاقها

### الهدف الواحد
> جعل `coin_ledger` **مصدر حقيقة واحدًا** لا يمكن الكتابة فيه إلا عبر مسار مركزي واحد،
> وجعل `COIN_SOURCES` + `coin_source_rules` + `maxDailyCoins()` متطابقة.

### داخل النطاق
- توحيد كل مصادر الكوينز (الحالية والمكتوبة مباشرة) في سجل واحد.
- تعريف `award_coins` **مرة واحدة** كنسخة canonical.
- تحويل الكتابات المباشرة في `coin_ledger` إلى المسار المركزي.
- إصلاح تعارض `escape_room` (60/25).
- إصلاح `maxDailyCoins()` ليشمل كل المصادر ويستبعد one-time.
- حارس DB يمنع أي كتابة كسب خارج المسار المركزي.
- اختبارات تلقائية + حارس CI.
- (اختياري معلّق على قرار D-4) توحيد كتابة XP على `increment_xp`.

### خارج النطاق (ممنوع في هذه المرحلة)
- أي تعديل على الواجهات أو الألعاب أو المجتمع.
- أي إعادة تصميم للمتجر أو الأسعار.
- أي تعديل على منطق المهام/الإنجازات نفسه (فقط مسار صرف المكافأة).
- أي Backfill أو حذف لحركات قديمة في `coin_ledger`.
- تعديل XP rewards نفسها (القيم) — فقط توحيد المسار لو D-4 = نعم.

---

## 2) الحقائق المؤكدة من الفحص (سبب المطلوب)

| # | الحقيقة | الدليل | الأثر |
|---|---|---|---|
| F1 | `award_coins` معرّفة في **5 ملفات** بفروع مختلفة | `db/shop.sql:245`, `db/worship.sql:187`, `db/economy-phase-4-foundation.sql:33`, `db/43-retention-p0-streak.sql:169`, `db/44-retention-phase-2-tiers.sql:46` | النسخة الفعّالة تعتمد على **آخر ملف اتشغّل**، مش على الكود |
| F2 | `shop.sql` يعيد `daily_login` إلى **5** ويلغي فرع `signup_bonus` لو اشتغل بعد phase-4 | `db/shop.sql:1615` مقابل `lib/shop/economy.ts` (10) | إعادة تشغيل الـ seed تقلب الاقتصاد في صمت |
| F3 | 6 مصادر كسب بتكتب `coin_ledger` مباشرة | `break_game`, `break_riddle`, `daily_mission`, `escape_room`, `achievement`, `weekly_mission` | غير مسجّلة في `COIN_SOURCES`؛ خارج أي حساب للسقف/التسعير |
| F4 | مصدران داخليان متغيّرا المبلغ يكتبان مباشرة | `box_refund` (`db/shop.sql:1250`), `wheel` (`db/shop.sql:1586`) | `award_coins` لا يدعم مبلغًا متغيرًا |
| F5 | `escape_room` = **60** في TS و**25** في SQL | `lib/shop/economy.ts` مقابل `db/gamification.sql:188` | تعارض مبلغ مباشر |
| F6 | `maxDailyCoins()` يحسب 432 ويستبعد 6 مصادر، ويحسب `signup_bonus` اليومي | `lib/shop/economy.ts` | تسعير المتجر مبني على أساس ناقص |
| F7 | حدود اليوم مختلفة: UTC في `shop.sql`، القاهرة في 43/44 | مقارنة تعريفات `award_coins` | سقوف تتصفّر في أوقات مختلفة حسب آخر نسخة |
| F8 | XP يُكتب مباشرة `update profiles set xp` داخل break/escape/missions | `db/gamification.sql:76,108,188` | مسار XP ثانٍ بجانب `increment_xp` |
| F9 | لا يوجد test يمنع الكتابة المباشرة أو يتحقق من تطابق السجل | لا يوجد `lib/shop/__tests__` | أي تراجع مستقبلي هيعدّي صامتًا |

---

## 3) Pre-Flight — فحص إنتاجي Read-Only قبل أي قرار

> تُنفّذ هذه الاستعلامات على الإنتاج وتُحفظ نتائجها كـ Artifact (بدون أسرار)، وتُرفق في PR.
> **لا تعديل بيانات في هذه الخطوة.**

```sql
-- Q1: القواعد الفعلية الآن
select id, amount, daily_cap, is_live
from public.coin_source_rules order by id;

-- Q2: ماذا يوجد فعلاً في السجل؟ (مصدر × نوع × عدد × مدى المبلغ)
select source, source_type, count(*) as rows,
       min(amount) as min_amt, max(amount) as max_amt, sum(amount) as total
from public.coin_ledger
group by source, source_type
order by source, source_type;

-- Q3: مصادر كسب موجودة في السجل بلا قاعدة (يجب أن تكون فارغة بعد الإصلاح)
select l.source, count(*), min(l.amount), max(l.amount)
from public.coin_ledger l
left join public.coin_source_rules r on r.id = l.source
where l.source_type = 'earn' and r.id is null
group by l.source order by l.source;

-- Q4: تعارض مبالغ المصادر الثابتة
select l.source, r.amount as rule_amount, l.amount, count(*)
from public.coin_ledger l
join public.coin_source_rules r on r.id = l.source
where l.source_type = 'earn' and l.amount <> r.amount
group by 1,2,3 order by 1;

-- Q5: النسخة الفعّالة من الدالة (تُحفظ نصًا للـ Rollback)
select pg_get_functiondef('public.award_coins(text,text,jsonb)'::regprocedure);

-- Q6: صحة الـ idempotency (يجب أن تكون فارغة)
select user_id, source, ref_id, count(*)
from public.coin_ledger
where source_type = 'earn' and ref_id is not null
group by 1,2,3 having count(*) > 1;

-- Q7: escape_room تاريخيًا
select amount, count(*), min(created_at), max(created_at)
from public.coin_ledger where source = 'escape_room' and source_type='earn'
group by amount;

-- Q8: daily_login تاريخيًا (5 أم 10؟)
select amount, count(*), min(created_at), max(created_at)
from public.coin_ledger where source = 'daily_login' and source_type='earn'
group by amount order by amount;

-- Q9: هل توجد حركات كسب بمرجع null؟ (تكشف مسارات غير idempotent)
select source, count(*) from public.coin_ledger
where source_type='earn' and ref_id is null
group by source order by source;

-- Q10: إجمالي الرصيد الحالي لكل المستخدمين (لقياس الأثر لاحقًا)
select sum(amount) as total_coins, count(distinct user_id) as users
from public.coin_ledger;
```

### مخرجات Pre-Flight المطلوبة (تقرير قبل الكود)
1. قائمة المصادر الناقصة من `coin_source_rules`.
2. هل `daily_login` الفعلي 5 أم 10؟ وهل `signup_bonus` شغّال؟
3. هل `streak_tier_*` و`achievement`/`weekly_mission` مطبقة فعلاً؟
4. عدد الحركات المباشرة لكل مصدر (لتقدير أثر التحويل).
5. نسخة `award_coins` الحالية نصًا (Rollback baseline).

---

## 4) السجل المركزي المستهدف (Canonical Registry)

### 4.1 شكل السجل في TS

```ts
type CoinSourceKind = "earn" | "internal" | "oneTime";

type CoinSource = {
  id: string;
  label: string;
  amount: number | "variable"; // variable = server-chosen من جدول مرجعي
  dailyCap: number | null;
  live: boolean;
  kind: CoinSourceKind;
  refTable?: string;   // للتحقق: study_days / break_game_claims / ...
  xp?: number;        // مرآة للتوثيق فقط (المصدر الحقيقي SQL)
};
```

قواعد ثابتة (تُفرض بـ test):
- `kind === "earn"` ⇒ `dailyCap != null`.
- `kind === "internal"` ⇒ `refTable` موجود + غير قابل للنداء من الكلاينت.
- `kind === "oneTime"` ⇒ يُستبعد من `maxDailyCoins()`.
- كل `id` فريد، و`amount` موجب (أو `"variable"`).
- كل مصدر في `coin_source_rules` موجود في `COIN_SOURCES` والعكس (test على الـ seed المولّد).

### 4.2 الجدول الكامل المقترح

| id | Kind | Amount | Cap/يوم | Live | دليل التحقق |
|---|---|---|---|---|---|
| signup_bonus | oneTime | 20 | 1 | ✅ | صف profile + ref=user_id |
| daily_login | earn | 10 | 1 | ✅ | Cairo day + ref=day |
| day_done | earn | 25 | 3 | ✅ | `study_days.is_completed` |
| goal_done | earn | 10 | 5 | ✅ | `planner_goals.is_done` |
| streak_day | earn | 8 | 1 | ✅ | `profiles.last_study_day` + streak |
| badge | earn | 40 | 3 | ✅ | `badges` للفصل |
| perfect_week | earn | 120 | 1 | ✅ | 7 أيام مكتملة |
| streak_tier_3 | earn | 15 | 1 | ✅ | `profiles.streak = 3` |
| streak_tier_30 | earn | 250 | 1 | ✅ | `profiles.streak = 30` |
| worship_prayer | earn | 3 | 5 | ✅ | `worship_progress.prayers` |
| worship_quran | earn | 5 | 1 | ✅ | `worship_progress.quran_ayahs` |
| worship_adhkar | earn | 3 | 3 | ✅ | `worship_progress.adhkar` |
| weekly_mission | earn | 150 | 1 | ✅ | `weekly_mission_claims` |
| daily_mission | earn | 5 | 4 | ✅ | `daily_mission_claims` |
| break_game | earn | 5 | 2 | ✅ | `break_game_claims` |
| break_riddle_fast | earn | 20 | 1 | ✅ | `break_riddle_sessions` + مدة ≤ 5د |
| break_riddle | earn | 15 | 1 | ✅ | `break_riddle_sessions` |
| escape_room | earn | **25 (مؤقتًا — D-1)** | 1 | ✅ | `escape_sessions.solved_at` |
| achievement | oneTime | **variable** (30–300) | 1 | ✅ | `user_achievements` + `achievements_catalog.coins` |
| wheel | internal | variable (5–120) | 1 | ✅ | `shop_wheel_prizes` + `shop_daily` |
| box_refund | internal | variable (20–1000) | null | ✅ | `shop_refunds` + `open_box` transaction |
| referral_reward | earn | 50 | 10 | ❌ (يُغلق) | لا فرع تحقق؛ المستودع يقول false |
| league_promo | earn | 200 | 1 | ❌ | مستقبلي |
| community_quiz | — | XP فقط | — | — | ليس مصدر كوينز |

> **قرار D-6 المعتمد:** `achievement` **مصدر واحد** (لا 8 مصادر)، والمبلغ يُشتق من
> `achievements_catalog.coins` عبر `_award_coins_variable` مع التحقق من `ref`.
> هذا يطابق الواقع (المبلغ متغير) ويمنع فتح أسماء مصادر عشوائية.
>
> **signup_bonus:** يعمل حاليًا بمسارين — Trigger `handle_signup_bonus` (كتابة مباشرة)
> وRPC `claim_signup_bonus` (عبر `award_coins`). يبقى Trigger هو المسار الأساسي مع
> bypass داخلي، وRPC fallback idempotent.

### 4.3 أثر التوحيد على `maxDailyCoins()`

| السيناريو | قبل | بعد |
|---|---|---|
| المصادر المحسوبة | 10 | 18+ |
| مصدر `signup_bonus` | يُحسب يوميًا (خطأ) | مستبعد (oneTime) |
| `achievement`/`weekly`/`break`/`escape`/`daily_mission` | مستبعدة | محسوبة |
| السقف النظري اليومي | 432 | **~487** (steady-state، بدون one-time/weekly) |
| الكسب النموذجي اليومي | 63 | 63 + (~50 ترفيه) = **~103** |

> ⚠️ Phase 0 **لا يعيد تسعير المتجر**. الرقم الجديد يظهر فقط ليكون الأساس الصحيح لـ Phase 9.
> أي تعديل أسعار = مرحلة منفصلة بموافقة.

---

## 5) التصميم التقني

### 5.1 مسار واحد للكسب

```
Client RPC (authenticated)
   └── award_coins(p_source, p_ref, p_metadata)
         • يقرأ amount/cap/live من coin_source_rules
         • يتحقق من الحدث (case)
         • يقفل wallet
         • يفرض cap
         • INSERT ... مع app.coin_bypass='on'

دوال داخلية SECURITY DEFINER (غير ممنوحة للكلاينت)
   └── _award_coins_variable(p_source, p_ref, p_amount, p_metadata)
         • نفس الخطوات + التحقق أن p_amount يطابق الجدول المرجعي للمصدر
         • تُستخدم فقط لـ achievement / wheel / box_refund
         • REVOKE من anon/authenticated — لا يمكن للكلاينت نداؤها
```

### 5.2 حارس قاعدة البيانات (Defense in Depth)

```sql
-- BEFORE INSERT ON coin_ledger
-- WHEN (NEW.source_type = 'earn')
-- إذا current_setting('app.coin_bypass', true) <> 'on' ⇒ RAISE EXCEPTION
```

- `award_coins` و`_award_coins_variable` يضبطان `app.coin_bypass = 'on'` داخل المعاملة (بعد `set_config(..., true)`).
- أي `INSERT` مستقبلي خارج المسار يفشل فورًا — حتى لو حد نسي.
- لا يؤثر على `spend` (`purchase`, `box`, `store_purchase`, `premium_trial`).

### 5.3 حدود اليوم

توحيد الكل على **`public.cairo_day()`** (Africa/Cairo):
- يتوافق مع السلسلة والمهام والبريك المطبقة في 43/44.
- يغيّر تصفير السقف من 00:00 UTC إلى 00:00 القاهرة (عمليًا 02:00 القاهرة حاليًا).
- الأثر: نافذة سقف أطول/أقصر بساعتين في يوم واحد فقط — لا Backfill.

### 5.4 إصلاح C1/C2/C3

| البند | الإصلاح |
|---|---|
| C1 | حارس DB + تحويل كل الكتابات المباشرة إلى المسار المركزي |
| C2 | اعتماد مبلغ واحد (D-1) + حذف الازدواج من TS أو SQL |
| C3 | `maxDailyCoins()` يقرأ من السجل الكامل ويستبعد `oneTime`/`internal`/`streakTier` |
| C9 | `SOURCE_LABEL` في `/rewards` يغطي `achievement.*` و`weekly_mission` |

---

## 6) خطة العمل (WBS)

### P0-A — Pre-Flight Snapshot (Read-Only) — 0.5 يوم
- تنفيذ Q1–Q10 على الإنتاج.
- حفظ: `phase0-preflight.json` + `award_coins.before.sql` (خارج git أو في `docs/artifacts/` بعد مراجعة).
- **Gate:** لا كود قبل اكتمالSnapshot.

### P0-B — Registry موحّد — 1 يوم
- تعديل `lib/shop/economy.ts`:
  - إضافة `kind`, `refTable`, `xp` (اختياري).
  - إضافة المصادر الناقصة.
  - إصلاح `maxDailyCoins()`.
  - إضافة `ALL_SOURCES` و`assertRegistry()`.
- تشغيل `node scripts/shop-seed.mjs` لتوليد سييد `db/shop.sql` من TS.
- **ملف جديد:** `lib/shop/sources.ts` (اختياري) إذا كبر السجل.

### P0-C — Canonical `award_coins` — 1 يوم
- **ملف جديد:** `db/53-economy-truth.sql` (يُشغّل **آخرًا** دائمًا):
  - تعريف `award_coins` مرة واحدة بالنسخة الكاملة (كل الفروع).
  - تعريف `_award_coins_variable`.
  - حارس `coin_ledger`.
  - `coin_source_rules` seed النهائي (idempotent).
  - تعليق Deprecation في الملفات القديمة (بدون حذفها).
- **لا حذف** للملفات القديمة؛ فقط Header يوضح: "لا تشغّل هذا الملف بعد 53".

### P0-D — تحويل الكتابات المباشرة — 1–2 يوم
| الدالة | الملف | التحويل |
|---|---|---|
| `answer_break_riddle` | `db/break-zone.sql` + `db/43-*` | اختيار source حسب المدة ثم `award_coins` |
| `claim_break_game` | `db/break-zone.sql` + `db/gamification.sql` | `award_coins('break_game', game:day)` |
| `solve_escape_step` | `db/gamification.sql` + `db/43-*` | `award_coins('escape_room', escape:day)` |
| `claim_daily_mission` | `db/gamification.sql` + `db/43-*` | `award_coins('daily_mission', mission:day)` |
| `sync_achievements` | `db/45-*` | `_award_coins_variable('achievement', 'achievement:'||id, catalog.coins)` |
| `claim_weekly_mission` | `db/45-*` | `award_coins('weekly_mission', weekly:week)` |
| `open_box` (refund) | `db/shop.sql` | `_award_coins_variable('box_refund', ..., refund.coins)` |
| `spin_wheel` | `db/shop.sql` | `_award_coins_variable('wheel', prize, prize.coins)` |
| `handle_signup_bonus` (trigger) | `db/economy-phase-4-foundation.sql` | يبقى مباشرًا مع `app.coin_bypass='on'` (سياق trigger) |

> قاعدة: أي دالة كانت تتحقق من الحدث بنفسها **تحتفظ بالتحقق**؛ `award_coins` تعيد التحقق كطبقة ثانية.

### P0-G — صلاحيات — 0.5 يوم
- `revoke execute on function ... from anon` لكل دوال المكافآت (award_coins, claim_*, break, escape, mission, achievement, weekly, wheel, box, purchase, increment_xp).
- الإبقاء على `authenticated` + `service_role` فقط.
- اختبار: نداء anon ⇒ `permission denied` (وليس exception داخلي).

### P0-E — اختبارات وحراس — 1 يوم
- `lib/shop/__tests__/economy-registry.test.ts` (جديد).
- `scripts/check-coin-ledger-writes.mjs` (جديد) — يفشل إذا وُجد `insert into coin_ledger` خارج allowlist.
- `scripts/check-award-coins-single-source.mjs` (جديد) — يفشل إذا وُجد تعريف جديد لـ `award_coins`.
- `scripts/test-economy-rpcs.mjs` (جديد) — اختبار RPC على قاعدة staging (اختياري لكن موصى به).

### P0-F — توثيق وتسليم — 0.5 يوم
- تحديث `docs/MAGICLY_WORLD_MASTER_AUDIT.md` (حالة C1/C2/C3 → Fixed).
- `docs/PHASE_0_ECONOMY_TRUTH_REPORT.md` (نتائج Pre-Flight + الأثر + Rollback).
- تحديث `AGENTS.md`/`README` بقاعدة: "كل كسب كوينز يمر من award_coins".

**إجمالي تقديري:** 5–7 أيام عمل.

---

## 7) Tests — التفاصيل

### 7.1 Unit (Vitest)
```
✓ كل مصدر live عنده dailyCap (إلا oneTime/internal)
✓ لا يوجد id مكرر
✓ kind صحيح
✓ maxDailyCoins يستبعد oneTime/streakTier/internal
✓ maxDailyCoins = مجموع متوقع محسوب يدويًا (snapshot test)
✓ escape_room.amount = القيمة المعتمدة (D-1)
✓ كل مصدر في SQL seed له مقابل في TS (بمقارنة المولّد)
✓ لا يوجد مصدر في TS غير موجود في SQL
```

### 7.2 SQL Integration (staging)
```
✓ award_coins بمصدر غير مسجّل ⇒ exception
✓ award_coins بمصدر is_live=false ⇒ exception
✓ award_coins لزائر (anonymous) ⇒ exception
✓ نفس (source, ref) مرتين ⇒ awarded=0 في الثانية
✓ تجاوز dailyCap ⇒ capped=true و awarded=0
✓ INSERT مباشر في coin_ledger (earn) بدون bypass ⇒ exception
✓ INSERT مباشر في coin_ledger (spend) ⇒ يمر
✓ _award_coins_variable بمبلغ لا يطابق الجدول المرجعي ⇒ exception
✓ _award_coins_variable غير قابل للنداء من authenticated
✓ كل مصدر: السيناريو الصحيح يمنح المبلغ المتوقع
✓ كل مصدر: السيناريو الخاطئ (بدون دليل) يرفض
```

### 7.3 CI Guard
- `npm run test:all` + حارسا `scripts/check-*.mjs` في CI.
- فشل الحارس = فشل الـ PR.

---

## 8) Migration Order + Rollback

### الترتيب
```
1. Snapshot (Q1–Q10 + pg_get_functiondef)
2. db/shop.sql (regenerated seed فقط — لا تغيير هيكلي)
3. db/53-economy-truth.sql
4. تحويل الدوال (P0-D) — ملف واحد جديد db/54-economy-route-writers.sql
5. تفعيل الحارس (داخل 53 أو 54 بعد التحويل)
6. تشغيل الاختبارات
```

> الحارس لا يُفعّل قبل تحويل كل الكتابات، وإلا تتوقف المهام/البريك/الإنجازات.

### Rollback
- `award_coins.before.sql` = `pg_get_functiondef` قبل التغيير + `create or replace` للإرجاع.
- حارس `coin_ledger` يُزال بـ `drop trigger` (سطر واحد).
- لا حذف قواعد ولا Backfill، فالإرجاع لا يفقد بيانات.
- **اختبار Rollback إلزامي على قاعدة staging قبل الإنتاج.**

---

## 9) الأثر الاقتصادي المتوقع (قبل/بعد)

| البند | قبل | بعد | ملاحظة |
|---|---|---|---|
| `daily_login` | 5 أو 10 (حسب آخر ملف) | **10 ثابت** | +5/يوم كحد أقصى |
| `signup_bonus` | **شغّال فعليًا** (81 صفًا / 1,620) | **20 مرة/عمر** | لا تغيير |
| `streak_tier_3/30` | شغّال بلا حركات | **15 / 250** | محطات فقط |
| `escape_room` | rule 60/live=false + دالة 25 + **صفر حركات** | **25** | D-1، بلا أثر رجعي |
| مصادر الترفيه | غير محسوبة | محسوبة بسقوف | لا زيادة في الصرف نفسه |
| `maxDailyCoins` | 432 (ناقص) | ~487 | أساس تسعير صحيح |
| السقف الفعلي للترفيه | متفرق | موحّد (Phase 3) | هنا نسجّل فقط |

**لا Backfill:** الحركات القديمة تبقى كما هي. القواعد الجديدة تُطبق على الحركات الجديدة فقط.

---

## 10) الملفات المتأثرة

### جديدة
```
db/53-economy-truth.sql
db/54-economy-route-writers.sql
lib/shop/__tests__/economy-registry.test.ts
scripts/check-coin-ledger-writes.mjs
scripts/check-award-coins-single-source.mjs
docs/PHASE_0_ECONOMY_TRUTH_REPORT.md
```

### معدّلة
```
lib/shop/economy.ts                 (registry + maxDailyCoins)
db/shop.sql                         (seed مولّد فقط)
db/break-zone.sql                   (تحويل الكتابة)
db/gamification.sql                 (تحويل الكتابة)
db/43-retention-p0-streak.sql       (تحويل الكتابة)
db/45-retention-phase-3-achievements.sql (تحويل الكتابة)
app/rewards/page.tsx                (SOURCE_LABEL)
package.json                        (scripts جديدة)
```

### لا تُلمس
```
app/lesson/*, app/dashboard/*, app/community/*, components/*,
أي منطق ألعاب، أي أسعار كتالوج، أي XP rewards values.
```

### Deprecation Headers (بدون حذف)
```
db/shop.sql, db/worship.sql, db/economy-phase-4-foundation.sql,
db/43-*, db/44-*
→ "⚠️ تعريف award_coins هنا تاريخي. النسخة الفعّالة في db/53-economy-truth.sql.
   شغّل 53 آخرًا دائمًا."
```

---

## 11) خطة الفروع والـ Commits

```
Branch: feat/phase-0-economy-truth

1. test(economy): add registry invariants + ledger write guard
2. refactor(economy): single source registry and maxDailyCoins
3. feat(db): canonical award_coins + coin_ledger earn guard
4. refactor(db): route break/escape/missions/achievements through award_coins
5. fix(economy): reconcile escape_room and daily caps
6. docs(economy): phase-0 preflight, impact and rollback
```

قواعد:
- كل Commit مستقل وقابل للـ revert.
- لا Push للمراجعة إلا بعد موافقة.
- لا Merge/Deploy نهائيًا في هذه المرحلة.

---

## 12) Definition of Done (Gate)

- [ ] Pre-Flight snapshot مكتمل ومرفق.
- [ ] كل المصادر مسجّلة، ولا مصدر في السجل بلا قاعدة.
- [ ] تعريف `award_coins` واحد فقط فعّال، وموثّق.
- [ ] صفر `INSERT INTO coin_ledger` (earn) خارج المسار المركزي.
- [ ] الحارس يمنع الكتابة المباشرة (مُختبر).
- [ ] `maxDailyCoins()` مطابق للسجل الكامل وبـ snapshot test.
- [ ] `escape_room` قيمة واحدة في TS وSQL.
- [ ] `daily_login` و`signup_bonus` سلوك موحّد ومُختبر.
- [ ] `anon` لا يملك EXECUTE على أي دالة مكافأة.
- [ ] `referral_reward` مغلق (`is_live=false`).
- [ ] لا تغييرات خارج الملفات المذكورة.
- [ ] Rollback مُختبر على staging.
- [ ] `npm run test:all` + حراس CI خضراء.
- [ ] موافقة صريحة قبل الإنتاج.

---

## 13) القرارات المعتمدة قبل كتابة الكود

| # | القرار المعتمد | التفصيل بعد P0-A |
|---|---|---|
| D-1 | **escape_room = 25** | rule حاليًا 60/live=false؛ الدالة 25؛ **صفر حركات تاريخية** ⇒ آمن |
| D-2 | **Africa/Cairo** | `award_coins` والدوال المباشرة بالفعل Cairo ⇒ لا تغيير |
| D-3 | **مصدران للفزورة** | `break_riddle_fast=20` + `break_riddle=15` |
| D-4 | **XP خارج P0** | لا لمس `update profiles set xp` الآن؛ Audit مستقل لاحقًا |
| D-5 | **daily_login = 10** | القاعدة 10 والدالة دخول نقي بالفعل؛ 49 صفًا تاريخيًا بـ5 لا يُعاد حسابه |
| D-6 | **achievement مصدر واحد + ref** | دالة متغيرة + تحقق `achievements_catalog.coins`؛ **لا** 8 مصادر |
| D-7 | **دالة متغيرة داخلية** | `_award_coins_variable` لـ achievement/wheel/box_refund؛ REVOKE من الكلاينت |
| D-8 | **award_coins(source) + Allowlist** | الإبقاء على التوقيع؛ إضافة `kind`/`is_variable`؛ رفض anon |

**إضافات إلزامية من P0-A:**
- `revoke anon` من كل دوال المكافآت (P0-G).
- إغلاق `referral_reward` (`is_live=false`) لأنه live بلا فرع تحقق.
- `signup_bonus` Trigger يبقى بمسار bypass داخلي.

> **لا يبدأ التكويد قبل اعتماد هذه الخطة المعدّلة.**

---

## 14) المخاطر والتخفيف

| الخطر | الاحتمال | التخفيف |
|---|---|---|
| تعطّل المهام/البريك بسبب الحارس | متوسط | تحويل كل الكتابات أولًا + تفعيل الحارس آخرًا + staging |
| اختلاف `daily_login` يغيّر أرصدة مستقبلية | متوسط | Pre-Flight Q8 + قرار D-5 موثّق |
| إعادة تشغيل ملف قديم يلغي 53 | مرتفع | Deprecation headers + CI guard + تعليمات تشغيل |
| تعارض مع عملاء آخرين على `db/shop.sql` | منخفض | Branch معزول + عدم لمس الكتالوج |
| بطء في التطبيق بسبب زيادة الفحوص | منخفض | كل الفحوص استعلامات مفهرسة (user_id, source, created_at) |
| Rollback غير مكتمل | منخفض | حفظ `pg_get_functiondef` + اختبار Rollback |

---

## 15) خلاصة تنفيذية

Phase 0 ليست "إضافة ميزة" — هي **إغلاق مصدر الحقيقة** قبل بناء أي لعبة.
أصغر تغيير ممكن يحقق الهدف:
1. سجل واحد.
2. `award_coins` واحدة.
3. حارس واحد على `coin_ledger`.
4. اختبارات تمنع الرجوع.

بعد Phase 0، بناء **Magicly Focus** و**Magicly Run** يصبح آمنًا: أي مكافأة جديدة = سطر في السجل + فرع تحقق، لا كود صرف جديد.

---

**نهاية خطة Phase 0 — بانتظار القرارات D-1..D-8 والموافقة على بدء التنفيذ.**
