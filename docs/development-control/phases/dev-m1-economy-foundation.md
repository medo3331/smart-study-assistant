# DEV-M1 — Economy Foundation (المرحلة 25أ) — تقرير الإغلاق

> القرارات: D-M-01..D-M-07 · المقترح: `docs/STORE_GAMES_REBUILD_PROPOSAL.md`
> الفرع: `feat/community-c1-discovery` · الإغلاق: 2026-11-28

## 1. النطاق المنفذ

| البند | الدليل |
|---|---|
| `award_coins` canonical (يوم القاهرة + تحقق حدث لكل مصدر + قفل + سقف + source_class) | `db/113-economy-truth.sql` §٣ — مطبّق على الإنتاج |
| `_award_coins_core` — نواة المنح الداخلية (تحقق قاعدة + قفل محفظة + daily_cap + فهرس فريد) | `db/113` §٤أ — معتمدة من الإنتاج كنسخة كانون |
| `_award_coins_variable` (achievement/wheel/box_refund) — تحقق مرجعي صارم مقابل الكاتالوج/الجوايز/التعويضات | `db/113` §٤ب |
| `add_coins_grant` — المسار الوحيد لـ purchase/ads/admin (**مقفول حتى DEV-M4** بقرار D-M-01/D-M-05) | `db/113` §٥ — service_role فقط |
| قواعد 29 مصدر في `coin_source_rules` (incl. break_riddle_fast=20، escape_room=25 (D-1)، missions) | مطبّقة — مصادر DEV-M1 والفلوس `is_live=false` |
| تحويل الكُتّاب: claim_break_game / claim_daily_mission / claim_weekly_mission / sync_achievements / open_box / spin_wheel / handle_signup_bonus | `db/114` — كل الكسب عبر المسار المركزي |
| الحارس: `trg_coin_ledger_earn_guard` — رفض أي كتابة من أدوار الكلاينت على `coin_ledger` | `db/114` §٨ — مُثبت فعليًا على الإنتاج |
| `source_class` + view `coin_ledger_classified` للتقارير المالية (D-M-06) | `db/113` §١ |
| P0-G: revoke anon من كل دوال المكافآت | `db/113` §٦ |

## 2. قرار تقني مهم أثناء التنفيذ

الإنتاج كان **أمام ملفات المستودع**: فيه `_award_coins_core` و`_award_coins_variable` (بتحقق مرجعي أقوى من المسودة) و`claim_*` محوّلة أصلًا. القرار: **اعتماد الأجسام الحيّة كنسخة كانون** في `db/113`/`db/114` بدل إعادة تعريفها (النسخ الحيّة فيها إصلاح باج القرعة المتحيزة في `open_box`/`spin_wheel`). التحويل الفعلي المطبّق: `handle_signup_bonus` (كان بينسخ مباشرة → `_award_coins_core`) + توثيق الحارس + الصلاحيات.

تصحيحات ضرورية اكتُشفت بالفحص:
- قيم المصادر المتغيرة في القواعد = **القصوى المرجعية الحقيقية** (achievement 300 لأن `first-course=300`، wheel 120، box_refund 1000) — `_award_coins_variable` بتعامل `rule.amount` كحد أقصى صارم.
- سقف achievement رُجّع للقيمة الأصلية من الإنتاج (5/يوم — `db/45`) بعد ما upsert مؤقت كتبه 1.
- `handle_signup_bonus` بيمر على `_award_coins_core` (مصدر الحقيقة) — التريجر يفضل هو المسار الأساسي للتسجيل.

## 3. التحقق (على الإنتاج الفعلي)

- `run-economy-truth.mjs` → `docs/artifacts/economy-truth-apply-2026-11-28T03-31-00-455Z.json`: 113 ✅ 114 ✅ — 29 قاعدة، فروع award_coins كاملة، دالة واحدة لكل اسم، view شغال، الحارس موجود.
- كتابة كلاينت مباشرة على `coin_ledger` (role=authenticated) → **مرفوضة فعليًا** بالحارس.
- ACL: `_award_coins_core`/`_award_coins_variable` = postgres فقط؛ `add_coins_grant` = postgres+service_role.
- السويت: **2347 passed / 36 skipped** · `tsc --noEmit` نظيف · عقد migration (15 اختبار) أخضر.
- لقطات الحقيقة قبل التغيير: `docs/artifacts/award-coins-before.sql` + `live-economy-functions.sql`.

## 4. ما لم يُنفذ (مقصود)

- مصادر DEV-M1 (`lesson_quiz_passed`/`review_done`/`exam_passed`) — بانتظار إثبات سيرفري للحدث (G0 proof).
- `ad_reward`/`purchase`/`admin_grant` — التفعيل مع DEV-M4 (D-M-01/D-M-05).
- قاعدة "سقف 3 إعلانات" مكتوبة في القواعد (cap=3) لكن المسار مقفول لحين SSV.

## 5. الخطوة الجاية

**DEV-M2 — Magicly Market**: دمج `/store` في `/shop` (D-M-02)، أقسام المتجر العشرة، التسعير الثلاثي (coins/credits/hybrid) مع RPC شراء مختلط ذري (D-M-03)، `coin_orders`، صفحة سجل المشتريات.
