# MAGICLY WORLD — MASTER AUDIT (Read-Only)

**التاريخ:** 2026-11-19
**النطاق:** مستودع `smart-study-assistant` — فحص كود فقط (بدون تنفيذ migrations وبدون كتابة في قاعدة البيانات).
**القاعدة:** التقرير ده لا يعدّل أي ملف تطبيق. المرجع الوحيد للتنفيذ لاحقًا.
**ما لم يتم التحقق منه:** الحالة الفعلية لقاعدة الإنتاج (هل كل ملفات `db/*.sql` مطبقة؟) — ده يحتاج فحص SQL مباشر بعد موافقتك.

---

## 0) الحكم التنفيذي

المشروع **أقوى بكتير** من نقطة البداية المتوقعة:

- عندك **اقتصاد كوينز حقيقي ومُحصّن** (ledger + RPC + RLS + idempotency + سقوف يومية).
- عندك **XP ومستويات ودوريات وإنجازات ومهام يومية/أسبوعية** شغّالة.
- عندك **متجر ٩ أقسام + صناديق + عجلة + مخزن + تجهيز عناصر**.
- عندك **جلسات مذاكرة** (`study_days` + `complete_study_day`) واختبارات درس (AI) وبنك امتحانات وتحليل نقاط ضعف.
- عندك **بذرة ترفيه**: Break Zone، Escape Room، Memory Match، Reaction، Quiz Rush، Boss Fight.
- عندك **إدارة**: أدمن RBAC، تذاكر دعم، إعلانات، صرف مكافآت، Audit Log.

**اللي مش موجود خالص:** عالم ترفيه مترابط. مفيش بوابة ترفيه، مفيش فتح ألعاب مربوط بالمذاكرة، مفيش ألعاب أصلية بهوية Magicly، مفيش مجتمع (Feed/Groups/Chat)، مفيش منافسات حقيقية (شطرنج/دوري ألعاب)، مفيش Magicly Focus Session.

**أخطر ما تم اكتشافه:** يوجد **مساري مكافآت متوازيين** (RPC `award_coins` مقابل كتابة مباشرة في `coin_ledger`)، وبعض المصادر الشغّالة غير مسجّلة في `COIN_SOURCES` / `coin_source_rules`، وفي تعارض مبلغ صريح بين TS وSQL. أي لعبة جديدة تُبنى قبل تسوية ده هتكرّر المشكلة وتضخّم الاقتصاد.

**التوصية:** المرحلة 1 = **تسوية الاقتصاد** (صغيرة، 1–2 يوم)، وبعدها **Magicly Focus**، وبعدها **Magicly Run** على أساس server-authoritative جاهز.

---

## 1) خريطة الموجود: الألعاب والترفيه

| العنصر | المسار / الملف | الحالة الحقيقية | ملاحظات |
|---|---|---|---|
| Break Zone | `app/break/page.tsx` | شغّال | Timer ٥ دقائق + Memory + Reaction + Quiz Rush + فزورة |
| Memory Match | `app/dashboard/components/games/MemoryGame.tsx` | شغّال | يطلب `/api/generate-game-questions` عند كل تحميل — **يستهلك AI Credit** |
| Reaction Test | داخل `app/break/page.tsx` | شغّال | مكافأة عبر `claim_break_game('reaction')` |
| Quiz Rush | داخل `app/break/page.tsx` + RPC | شغّال | سؤال مرتبط بخطة الطالب، إجابة في السيرفر |
| فزورة اليوم | `db/break-zone.sql` | شغّال | ۲۰/١٥ كوين حسب السرعة |
| Escape Room | `app/escape-room/page.tsx` + `db/gamification.sql` | شغّال | ٣ ألغاز مرتبطة بالمادة، ٦ محاولات، مكافأة يومية |
| Boss Fight | `components/BossFight.tsx` | شغّال | يمنح XP من الكلاينت + `award_coins('badge')` |
| Daily Micro Challenge | `components/DailyMicroChallenge.tsx` | شغّال | مرتبط بـ break-zone |
| Community Quiz | `components/CommunityQuiz.tsx` + `db/community.sql` | شغّال | مسابقة أسبوعية، XP فقط (مفيش كوينز) |
| Magic Wheel | `components/MagicWheelDashboard.tsx` + `db/shop.sql` | شغّال | عجلة مكافآت داخل المتجر |
| بوابة ترفيه / فتح ألعاب | — | **غير موجود** | لا يوجد أي ربط بين عدد الدروس وفتح قسم ألعاب |
| ألعاب أصلية (Magicly Run / Chess / Puzzle / Brain) | — | **غير موجود** | مفيش أي كود أو أصول أو engine |
| سقف ترفيه يومي موحّد | — | **غير موجود** | توجد سقوف متفرقة لكل لعبة، لكن مفيش "ميزانية ترفيه" واحدة |
| مكافآت ألعاب server-side | جزئيًا | **مختلط** | بعضها RPC متحقق، وبعضها كتابة مباشرة في الـ ledger |

**ملاحظة معمارية:** لا توجد أي مكتبة ألعاب في `package.json` (لا Phaser/Pixi/Three). أي لعبة جديدة = بناء من الصفر (Canvas/DOM) أو إضافة مكتبة بقرار واعٍ.

---

## 2) خريطة الموجود: المتجر والكوينز والـ Credits

### 2.1 البنية

- `db/shop.sql` (≈ 102KB): 11 جدول + RLS + دوال شراء/صرف/عجلة.
- الجداول: `coin_source_rules`, `coin_wallets`, `coin_ledger`, `shop_catalog`, `shop_inventory`, `shop_equipped`, `shop_daily`, `shop_boxes`, `shop_refunds`, `shop_wheel_prizes`, `shop_leagues`.
- الرصيد = `SUM(coin_ledger.amount)` عبر `coin_balance()` — **مش عمود قابل للتعديل**.
- الكسب عبر `award_coins(p_source, p_ref_id)` فقط: السعر يُقرأ من `coin_source_rules`، والهوية من `auth.uid()`، والتحقق من "الحدث حصل" داخل `case`.
- الشرا عبر `purchase_item` / `equip_item` / `spin_wheel` — كلها `security definer`.
- ممنوع شراء كوينز بفلوس حقيقية (قاعدة صريحة في التعليقات).
- `profiles.xp` محمي بـ trigger + RLS؛ التعديل عبر `increment_xp` / `award_xp`.

### 2.2 مصادر الكسب المسجّلة في TS (`lib/shop/economy.ts`)

| المصدر | المبلغ | السقف/يوم | Live |
|---|---|---|---|
| signup_bonus | 20 | 1 (مرة عمر) | ✅ |
| daily_login | 10 | 1 | ✅ |
| day_done | 25 | 3 | ✅ |
| goal_done | 10 | 5 | ✅ |
| streak_day | 8 | 1 | ✅ |
| badge | 40 | 3 | ✅ |
| perfect_week | 120 | 1 | ✅ |
| streak_tier_3 | 15 | 1 | ✅ |
| streak_tier_30 | 250 | 1 | ✅ |
| worship_prayer | 3 | 5 | ✅ |
| worship_quran | 5 | 1 | ✅ |
| worship_adhkar | 3 | 3 | ✅ |
| escape_room | **60** في TS / **25** في SQL | 1 | ❌ في TS |
| wheel | 30 | 1 | ❌ |
| league_promo | 200 | 1 | ❌ |

`maxDailyCoins()` (المستخدم في تسعير الكتالوج) يجمع المصادر `live` فقط **ويستبعد**:
`break_game`, `break_riddle`, `daily_mission`, `achievement`, `weekly_mission`, `community_quiz`
لأنها مش موجودة في `COIN_SOURCES` أصلًا.

### 2.3 المصادر التي تكتب في `coin_ledger` مباشرة (خارج `award_coins`)

| المصدر | الملف | المبلغ |
|---|---|---|
| `break_riddle` | `db/break-zone.sql` + `db/43-retention-p0-streak.sql` | 15–20 |
| `break_game` | `db/break-zone.sql` + `db/gamification.sql` | 5 (سقف لعبتين/يوم) |
| `daily_mission` | `db/gamification.sql` | 5 لكل مهمة |
| `escape_room` | `db/gamification.sql` | **25** |
| `achievement` | `db/45-retention-phase-3-achievements.sql` | حسب الكتالوج (30 لـ most) |
| `weekly_mission` | `db/45-retention-phase-3-achievements.sql` | 150 |

كل دول **غير موجودين في `COIN_SOURCES`** ولا في `award_coins` case. يعني:

- توزيع المكافأة بيشتغل (الدوال security definer).
- لكن **لوحة/تسعير/توثيق الاقتصاد مش شايفينهم**.
- وأي محاولة استخدام `awardCoins(sb, 'escape_room')` هترفض (مصدر غير معروف/غير live).

### 2.4 الـ AI Credits

- موجود جدول/منطق `ai_credit_ledger` و`entitlements` في `economy-phase-d`، لكن **غير موصولة بالمتجر أو الـ runtime**.
- `app/store/page.tsx` صفحة "حزم AI Credits" **Placeholder** ("قيد الإعداد").
- التسمية متعارضة: `/shop` = متجر كوينز تجميلي، `/store` = صفحة Credits وهمية. لازم توحيد المصطلحات.

---

## 3) خريطة الموجود: المستويات والمكافآت

| النظام | الملف | الحالة |
|---|---|---|
| Level | `levelFromXp` = `floor(xp/200)+1` | شغّال |
| League | 6 دوريات (خشب → أساطير) مشتقة من XP | شغّال |
| Achievements | `achievements_catalog` (8 إنجازات) + `user_achievements` + `sync_achievements` | شغّال |
| Daily Missions | 4 مهام (study/goal/riddle/game) → 5 coins + 10 XP | شغّال |
| Weekly Mission | 5 مراحل + 3 أيام → 150 coin + XP | شغّال |
| Streak tiers | 3 / 30 يوم بونص | شغّال |
| Rewards ledger UI | `app/rewards/page.tsx` | شغّال — لكن `SOURCE_LABEL` لا يعرف `achievement` / `weekly_mission` |
| Admin rewards | `db/rewards-issue-schema.sql` + `/admin/rewards` | موجود (بوابة إصدار) |

**ملاحظة:** `XP_PER_LEVEL` مكرر كرقم في SQL (`/ 200`) وفي TS — مرآة يدوية، مش مصدر واحد.

---

## 4) خريطة الموجود: المذاكرة والتقدم والاختبارات

| النظام | الملف/الجدول | الحالة |
|---|---|---|
| خطة المذاكرة | `study_configs` + `study_days` | شغّال |
| إكمال المرحلة | RPC `complete_study_day` (idempotent) | شغّال |
| XP المرحلة | `study_days.xp_reward` (أرضية 150) | شغّال |
| Early unlock | `study_day_unlocks` + `unlock_study_day` | شغّال |
| اختبار الدرس | `/api/lesson-quiz` (AI MCQ) | شغّال |
| تصحيح الاختبار | **client-side** (`correctIndex` في المتصفح) | ⚠️ |
| كاش الأسئلة | `db/lesson-quiz-cache.sql` مكتوب لكن **"PREPARED FOR MANUAL REVIEW ONLY"** | غير مطبّق |
| بنك الامتحانات | `exam_sessions` + `exam_session_items` + `/exams` | شغّال |
| نقاط الضعف | `user_weaknesses` + `lib/diagnostic-*` | شغّال |
| جلسة تركيز (Focus Session) | — | **غير موجود** |
| تقرير جلسة (وقت/دروس/نتيجة/تحسّن) | — | **غير موجود** |
| مقياس "النتيجة السابقة" للتحسّن | غير موجود ككيان | يوجد progress/weakness لكن مفيش session snapshot |

**ثغرة جوهرية للفكرة:** `complete_study_day` **لا يتحقق من نجاح الاختبار**. الصفحة تستدعيها بعد النجاح في الواجهة فقط، لكن RPC يمكن نداؤها مباشرة لأي `study_days` مملوك للمستخدم. يعني شرط "أكمل ٥ دروس + اجتز اختبار" غير قابل للفرض على السيرفر حاليًا بدون إضافة تحقق.

---

## 5) خريطة الموجود: المجتمع والإدارة

| العنصر | الحالة | ملاحظات |
|---|---|---|
| `/community` | شغّال لكن **محدود** | تبويبين فقط: Leaderboard (XP) + Weekly Quiz |
| Community Feed (منشورات) | **غير موجود** | لا جدول ولا API |
| Study Groups | **غير موجود** | — |
| Student Chat | **غير موجود** | `db/chat.sql` هو شات AI مع المساعد، مش شات طلاب |
| Admin Announcements | موجود | `admin_announcements` + `user_inbox` + `/inbox` + `/admin/announcements` |
| Ask Magicly Team / Support | موجود | `support_tickets` + `ticket_replies` + `/support` + `/admin/tickets` |
| Reports / Bans / Moderation | جزئي | `users-ban` للأدمن موجود؛ **مفيش** report/hide/block للـ UGC (لأن مفيش UGC) |
| Events / دوريات | غير موجود | مفيش جدول events ولا دوري ألعاب |
| Admin RBAC + Audit Log | موجود | `epic2-admin-rbac-audit-schema.sql`, `/admin/audit-log` |

**الخلاصة:** الإدارة جاهزة تقريبًا، المجتمع غير جاهز. أي إضافة Feed/Chat لازم معاها moderation من أول يوم (report + hide + ban + audit)، وإلا هتتحول لمشكلة أمنية.

---

## 6) البنية التقنية المطلوبة للألعاب الجديدة

| الاحتياج | الموجود | الفجوة |
|---|---|---|
| Web Games خفيفة للموبايل | React + Next 16 فقط | لا engine؛ Canvas/DOM يدوي أو مكتبة جديدة |
| Server-authoritative score | نمط RPC موجود (`submit_quiz_result`, `exam_sessions`) | مفيش جدول `game_sessions` ولا seed/anti-cheat |
| منع تكرار المكافأة | unique index + RLS + caps | يحتاج توحيد لكل لعبة |
| Realtime (شطرنج/غرف) | **غير مستخدم** (`channel` غير موجود) | يحتاج Supabase Realtime أو polling |
| أصول فنية/شخصيات | لا يوجد | يحتاج تصميم "ماجد" + أصول |
| Feature flag / بوابة ترفيه | لا يوجد | يحتاج جدول/إعداد + RPC |
| Rate limiting للألعاب | `lib/api-guard` موجود | يحتاج مفاتيح لكل لعبة |

---

## 7) مصفوفة الفجوات مقابل رؤية Magicly World

| النظام في الرؤية | الموجود | الناقص | التعارض |
|---|---|---|---|
| **Entertainment** | Break, Escape, Memory, Reaction, Quiz, Wheel, Boss | بوابة، ألعاب أصلية، سقف موحّد، فتح مرتبط بالمذاكرة | مكافآت مزدوجة المسار |
| **Economy** | Ledger محصّن + XP + Coins | توحيد المصادر + سعر Credits | `escape_room` 60/25، مصادر غير مسجلة، `maxDailyCoins` ناقص |
| **Learning** | خطط + دروس + اختبارات AI + امتحانات | ربط نتيجة الاختبار بالإكمال | `complete_study_day` لا يتحقق من الاختبار |
| **Focus** | Pomodoro بسيط + `focus_minutes` في activity | جلسة كاملة (هدف → تعلم → فهم → اختبار → تقرير) | مفيش كيان session |
| **Community** | Leaderboard + Quiz + Support + Announcements | Feed + Groups + Chat + Events + Moderation | لا يوجد UGC |
| **Competition** | XP League + Weekly Quiz | شطرنج، دوريات ألعاب، مواسم | الدوري مشتقة من XP فقط |
| **Store** | ٩ أقسام + صناديق + عجلة | Credits/Entitlements runtime | `/store` Placeholder |

---

## 8) سجل التعارضات (أولوية تنفيذ)

| # | التعارض | الشدة | الملفات | الأثر |
|---|---|---|---|---|
| C1 | مساران للمكافآت: `award_coins` مقابل `INSERT INTO coin_ledger` مباشر | **عالية** | `db/shop.sql`, `db/gamification.sql`, `db/break-zone.sql`, `db/45-*` | أي مصدر جديد يتوه؛ التتبع/التسعير/الأدمن مش موحّد |
| C2 | `escape_room` = 60 في TS و25 في SQL، و`live:false` في TS مع أنه شغّال | **عالية** | `lib/shop/economy.ts`, `db/gamification.sql` | تعارض توثيقي واقتصادي مباشر |
| C3 | `maxDailyCoins()` لا يحسب 6 مصادر شغّالة | **عالية** | `lib/shop/economy.ts` | تسعير الكتالوج مبني على أساس أقل من الحقيقة |
| C4 | `complete_study_day` لا يتحقق من الاختبار | **عالية** | `db/economy-phase-c.sql`, `app/lesson/[dayId]/page.tsx` | فتح الألعاب بناءً على "إنجاز دراسي" قابل للتلاعب |
| C5 | `BossFight` يمنح XP من الكلاينت (`increment_xp`) عند كل فوز | متوسطة | `components/BossFight.tsx` + `app/dashboard/page.tsx:2098` | XP قابل للتكرار من الواجهة (كل فوز جديد)، بينما الكوينز idempotent بالوسام |
| C6 | تصحيح اختبار الدرس في المتصفح + كاش غير مطبّق | متوسطة | `app/api/lesson-quiz/route.ts`, `db/lesson-quiz-cache.sql` | استهلاك AI متكرر + إمكانية تلاعب |
| C7 | Memory Match يستهلك AI Credit عند كل فتح | متوسطة | `MemoryGame.tsx`, `/api/generate-game-questions` | لعب = تكلفة؛ يهدد اقتصاد Credits |
| C8 | `/store` Placeholder باسم "متجر" | منخفضة | `app/store/page.tsx` | لخبطة UX مع `/shop` |
| C9 | أسماء المصادر في صفحة المكافآت ناقصة | منخفضة | `app/rewards/page.tsx` | يظهر `achievement`/`weekly_mission` كنص خام |
| C10 | fallback في الدرس يكتب `profiles.xp` مباشرة | منخفضة | `app/lesson/[dayId]/page.tsx:824` | هيفشل مع trigger Phase B (مسار خطأ فقط) |

---

## 9) المعمارية المقترحة (Before أي لعبة)

### 9.1 مبدأ واحد

> **الكلاينت يقول "إيه الحدث" — السيرفر يقرر "هل حصل" و"كام المكافأة".**
> الألعاب الجديدة لا تكتب في `coin_ledger` أبدًا. كلها تمر من RPC واحد.

### 9.2 جداول جديدة مقترحة (مش تنفيذ الآن)

```
game_sessions
  id, user_id, game_id, mode, seed,
  status (created|started|finished|abandoned|flagged),
  started_at, finished_at,
  client_score, server_score,
  metrics jsonb,            -- coins_collected, duration, obstacles, ...
  reward_granted bool, reward_ref text
  unique (user_id, game_id, client_session_id)

game_definitions
  id, title, status (draft|live|disabled),
  daily_reward_cap, min_level, min_completed_days,
  config jsonb

entertainment_gate            -- بوابة الترفيه
  user_id, day,
  lessons_completed, quiz_passed, unlocked_at,
  daily_budget_seconds, seconds_used

focus_sessions               -- Magicly Focus
  id, user_id, day, subject, config_id,
  goal_lessons int,
  started_at, ended_at,
  duration_seconds,
  lessons_completed int,
  pre_score int, post_score int,
  improvement int,
  report jsonb,
  status
```

### 9.3 مسار المكافأة الموحّد

```
Client → start_game_session(game_id)        → server seed + session_id
Client → finish_game_session(session_id, client_metrics)
Server → يتحقق من:
         • ملكية الجلسة + الحالة + المدة المعقولة
         • سقف اللعبة اليومي + سقف الترفيه الكلي
         • شرط البوابة (دروس/اختبار)
         • idempotency (session_id مرة واحدة)
       → يحسب score سيرفريًا (لألعاب ممكنة) أو يقيّد metrics
       → award_coins(source, ref=session_id)
       → يسجّل XP عبر increment_xp
```

### 9.4 بوابة الترفيه (المقترح)

- شرط: `completed_lessons_today >= 2` أو `study activity` موجود (نفس `break_studied_today`).
- شرط إضافي للفتح الكامل: `5 دروس + اختبار قصير` (مرة واحدة أو يوميًا — قرار).
- **ميزانية ترفيه يومية**: مثلًا 30 دقيقة أو 3 جولات/لعبة، تُحسب في `entertainment_gate`.
- الألعاب تفتح تدريجيًا: Run → Brain/Puzzle → Chess/Quiz.

### 9.5 توحيد المصادر (إصلاح C1/C2/C3)

1. أضف كل المصادر الشغّالة إلى `COIN_SOURCES` + `coin_source_rules`.
2. اجعل الدوال الحالية تنادي `award_coins` بدل الـ INSERT المباشر، **أو** وثّق استثناءً رسميًا ويسجّل المصدر في `coin_source_rules` (الأفضل: توحيد).
3. عدّل `maxDailyCoins()` ليقرأ من مصدر واحد (TS mirror) ويشمل الترفيه بسقفه.
4. أضف test يمنع أي `INSERT INTO coin_ledger` خارج `award_coins` (lint/regex test).

---

## 10) خطة التنفيذ المعدّلة

> الترتيب مقصود: **لا نبني لعبة قبل ما الاقتصاد يبقى مصدر حقيقة واحد.**

| المرحلة | المخرجات | لماذا قبلها | تقدير |
|---|---|---|---|
| **0 — Economy Truth** | توحيد المصادر، إصلاح C1/C2/C3/C9، test يمنع الـ ledger المباشر | أي لعبة بعده هتضاعف التعارض | 1–2 يوم |
| **1 — Study Proof** | `complete_study_day` يتحقق من نتيجة اختبار محفوظة سيرفريًا (جدول `lesson_quiz_attempts` أو كاش) + إصلاح C6 | بدونه "فتح الألعاب بالمذاكرة" غير قابل للفرض | 2–3 يوم |
| **2 — Magicly Focus** | جدول `focus_sessions` + RPC بدء/إنهاء + تقرير + مقارنة بالنتيجة السابقة | أهم نظام وأقل تكلفة تقنية؛ يبني بيانات التحسّن | 3–5 يوم |
| **3 — Entertainment Gate** | `entertainment_gate` + RPC حالة البوابة + سقف يومي + واجهة "عالم الترفيه" | يحوّل الألعاب الموجودة لعالم مترابط | 2–3 يوم |
| **4 — Magicly Run** | game_sessions + Canvas runner + ماجد + مكافأة سيرفرية | أول لعبة أصلية بهوية Magicly | 1–2 أسبوع |
| **5 — Brain / Puzzle / Quiz** | ألعاب خفيفة على نفس الـ framework | إعادة استخدام البنية | 1–2 أسبوع |
| **6 — Chess** | شطرنج + matchmaking + Realtime | أعلى تعقيد (مزامنة/غرف) | 2–3 أسبوع |
| **7 — Community** | Feed + Groups + Chat + Report/Moderation + Events | يحتاج moderation من أول يوم | 2–4 أسبوع |
| **8 — Competition** | مواسم + دوريات ألعاب + ترتيب | يعتمد على 4–7 | 2 أسبوع |
| **9 — Integration & Economy Test** | اختبار اقتصاد كامل + ضبط الأسعار | يغلق الحلقة | 1 أسبوع |

**ما لا يجب إعادة بناؤه:** المتجر، المحفظة، الـ ledger، XP، المستويات، الإنجازات، المهام، بنك الامتحانات، تحليل نقاط الضعف، تذاكر الدعم، الإعلانات، RBAC، Audit Log.

---

## 11) Magicly Run — مواصفة أول لعبة

### اللعبة
- Endless Runner جانبي، Canvas 2D، موبايل-first (لمس + كيبورد).
- شخصية **ماجد** + هوية Magicly (ألوان البراند، أيقونات، موسيقى خفيفة).
- عقبات + Coins + تسارع تدريجي + نهاية مرحلة بهدف.

### الاقتصاد
- Coins أثناء الجولة = **نقاط داخل اللعبة فقط** (تظهر في الـ HUD، لا تُصرف).
- عند إنهاء المرحلة: مكافأة ثابتة **10–15 Coin** من السيرفر.
- سقف يومي (مثلًا 3 مراحل = 45 Coin) + شرط بوابة الترفيه.
- `game_sessions` هي المرجع الوحيد؛ لا يُقبل `score` من المتصفح كأساس للمكافأة.

### التقنية
- `app/entertainment/run/page.tsx` (client) + `components/games/run/*`.
- `requestAnimationFrame` + delta time + object pooling.
- `start_game_session('magicly_run')` → `seed`، و`finish_game_session` يتحقق من المدة والمسافة.
- لا AI credits في اللعبة.
- أصول: SVG/Canvas مرسومة (بدون صور ثقيلة) لتبقى خفيفة.

---

## 12) قرارات مطلوبة منك قبل المرحلة 0

1. **مصدر الحقيقة للاقتصاد:** نوحّد كل المصادر على `award_coins`؟ (التوصية: نعم)
2. **شرط فتح الترفيه:** 2 دروس يوميًا؟ أم 5 دروس + اختبار مرة واحدة؟ أم الاثنان (فتح + سقف)؟
3. **ميزانية الترفيه:** دقائق أم عدد جولات؟ وكم؟
4. **الاختبار كشرط إكمال:** هل نمنع `complete_study_day` بدون نجاح اختبار؟ (يحتاج تعديل تدفق الدرس)
5. **الشطرنج Realtime:** Supabase Realtime أم polling؟ (قرار تقني/تكلفة)
6. **المجتمع:** Feed فقط في البداية أم Feed + مجموعات + شات مرة واحدة؟
7. **مصير `/store`:** إخفاء أم تحويله لصفحة Credits لاحقًا؟

---

## 13) مؤشرات نجاح المرحلة القادمة

- صفر `INSERT INTO coin_ledger` خارج `award_coins` (test آلي).
- `COIN_SOURCES` = `coin_source_rules` = كل ما يظهر في `/rewards`.
- فتح الترفيه يرفض الطالب اللي لم يُكمل الشرط (قابل للاختبار بـ RPC مباشر).
- `escape_room` رقم واحد في كل مكان.
- جلسة تركيز واحدة تنتج صفًا في `focus_sessions` + تقرير + تحسّن محفوظ.
- أي لعبة جديدة لا تضيف جدول مكافآت جديد — تعيد استخدام `game_sessions` + `award_coins`.

---

**نهاية التقرير — Read-only. لا تغييرات على كود التطبيق.**
