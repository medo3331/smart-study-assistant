# BLOCKERS — المعطّلات والقرارات المعلّقة

> **القاعدة:** أي عنصر هنا محتاج قرار المالك أو إجراء يدوي. مفيش صداقة — لو خلصت، أضف دليلاً وانقله لـ`STATUS.md`.
> آخر تحديث: 2026-11-14 17:25

---

## القسم 1 — النقاط الأربع المفتوحة (لم تُحسم بقرارات الـ11)

### B-01 — اعتماد هيكل Development Control System: `AREA` مقابل `DEV`
**الحالة:** ⏳ بانتظار قرار المالك
**ما تم بناءً عليه:** الهيكل مُهيّأ في `docs/development-control/` — بما فيه `ROADMAP.md` (Part 1: AREA-01..10 · Part 2: DEV-01..NN).
**التوصية المعتمدة سابقًا:** الاعتماد، لأنه يمنع الخلط بين النطاقات الكبيرة والمراحل التنفيذية.
**المخاطر لو لم يُعتمد:** رجوع الخلط القديم (Phase = نطاق ضخم) والـPhase Lock مش يشتغل.

### B-02 — المرحلة النشطة حاليًا
**الحالة:** ⏳ بانتظار تصديق المالك
**التحديد من واقع git (2026-11-14 17:25):** `DEV-01` (صفحة الدرس) هي الجارية — 8 commits على `feat/lesson-content`.
**السبب:** `DEV-02` (الامتحانات) عندها تدقيق ومقترح، لكنها **صفر كود** ولم تُعتمد.
**المطلوب منك:** تصديق `DEV-01` كمرحلة نشطة، أو الأمر خلاف ذلك. **ملاحظة مهمة:** الـ"صفحة الدرس خلصت" غير صحيح بعد — انظر `ACTIVE_PHASE.md` §2 و`TASKS.md`.

### B-03 — نقل تقارير التدقيق
**الحالة:** ⏳ بانتظار السماح
**الملفات المعنية:** `LESSON_PAGE_PHASE1_AUDIT.md` (366 سطر) · `EXAMS_PHASE1_AUDIT.md` (296 سطر) · `EXAMS_PHASE2_PROPOSAL.md` (untracked)
**التوصية:** النقل بـ`git mv` (لا حذف) بعد الاعتماد — بدل نسخها، للحفاظ على الـhistory.
**المؤقت:** الملفات في مكانها، والـphases/*.md بيشاوروا عليها بالمسار (لا نسخ).

### B-04 — تنظيف المستودع
**الحالة:** ⏳ بانتظار مراجعة مستقلة — **لا تفعل الآن**
**البند 1:** 158 ملف `.md` في الجذر، منهم 136 قديمة (أبريل–سبتمبر 2026) — أرشفة مقترحة ولم تُعتمد.
**البند 2:** `.worktrees/ui-quick-wins` متسجّل كـ**gitlink** (submodule) وبفيه 21 ملف معدّل — ي-pollute `git status` في كل session.
**الملاحظة:** 190 فرع محلي + ~110 remote + 64 worktree. **لا حذف.** القرار التشغيلي (فرع نشط واحد) لا يعني حذف أي منها.

---

## القسم 2 — معطّلات Stage E/D (تحتاج إجراءات المالك)

### B-05 — تنفيذ `db/46` ثم `db/47` على الإنتاج
**الحالة:** ⏳ إجراء يدوي مطلوب
**الملفات:**
- `db/46-lesson-content.sql` (82 سطر) — جدول `lesson_content` + RLS + RPC `upsert_lesson_content`
- `db/47-lesson-content-citations.sql` (35 سطر) — `lesson_content.cited_explanation jsonb` + comment. **يعمل بعد db/46.**
**الخطوات:** Supabase SQL Editor → شغل بالترتيب → استفسار إثباتي:
```sql
select attname, atttypid::regtype as data_type
from pg_attribute
where attrelid = 'public.lesson_content'::regclass
  and attnum > 0
  and not attisdropped;
```
**التصنيف:** `NOT RUN` حتى المالك يؤكده.

### B-12 — كود DEV-02 **يتنفذ في نفس الفرع بدون اعتماد** (Phase Lock مكسور)
**الحالة:** ✅ **مُحسوم تشغيليًا — قرار المالك 2026-11-14 18:15**
**قرار المالك:**
1. **لا `git stash`** — الكود تابع للجلسة الأخرى وأي نقل/استرجاع ممكن يتعارض مع شغلها.
2. **لا تعديل/حذف/نقل** لأي ملف امتحانات.
3. **لا مراجعة كود ولا اقتراح إصلاحات** على DEV-02 حاليًا.
4. **DEV-02 = EXTERNALLY OWNED — PROTECTED — TEMPORARILY OUT OF SCOPE** لحين إبلاغ المالك بانتهاء الجلسة الأخرى.
5. **DEV-01 تظل المرحلة النشطة** في نظام التطوير — **لكن لا تُنفّذ خطواتها الحساسة تلقائيًا** (لا SQL ولا migrations دون موافقة صريحة).

**الملفات المحمية (ممنوع قراءتها/تحليل/مراجعة/تعديل/حذف/نقل):**
`lib/ai/exam-review.ts` · `lib/ai/__tests__/exam-review.test.ts` · `app/api/exam-sessions/**` · `db/48-exam-generator.sql` · `EXAMS_PHASE1_AUDIT.md` · `EXAMS_PHASE2_PROPOSAL.md` · أي ملفات أخرى مرتبطة.

**⚠️ UNKNOWN:** هل عدّلت الجلسة الموازية `lib/ai/__tests__/exam-review.test.ts` بأي commit حتى الآن؟ لا نراجع ذلك حاليًا (ممنوع تحليل ملفات DEV-02) — نتابع ذلك عند إبلاغ بانتهاء الجلسة. لا تُعتبر مكتملة أو معتمدة.

**مرجع:** `D-DEV-023`

---

## القسم 3 — UNKNOWNs في بيئات الإنتاج (لا تُفترض)

| # | السؤال | الأثر |
|---|---|---|
| U1 | `db/41-ai-operations-insert-policy.sql` منفَّذ؟ (الدليل: `db/41` + `docs/TECH_DEBT.md` N-021) | لو لا ⇒ `ai_operations` ميتة (0 صفوف) ⇒ `ai_models.daily_limit` **لا يُطبَّق أصلاً** |
| U2 | أي تعريف من الـ5 المتنافسة لـ`reserve_ai_credit` هو الحيّ؟ | `economy-phase-f` · `bc-rate-limits` · `h-rate-limit` · `h2-window-limits` · `credit-pricing-reserve` |
| U3 | `latency_ms` / `fallback_attempts` موجودة في `ai_operations`؟ (مفيش migration في `db/`) | لو لا ⇒ كل insert يقع على baseRow للقيم دي |
| U4 | عدد صفوف `ai_usage_events` / `ai_credit_ledger` | يعتمد عليه `DEV-05` |
| U5 | `community_questions` / `community_answers` موجودة؟ | مفيش `CREATE TABLE` في `db/` — feature الـQ&A ميتة |
| U6 | الـ `.env.local` values (رخيصة بالنسبة للإنتاج) | غير مقروءة من هذه الجلسة |

---

## القسم 4 — مشاكل تقنية معروفة لم تُحل

| ID | المشكلة | الموقع | القرار/المسار |
|---|---|---|---|
| T1 | `subscription_plans.trial_days` لـpro = **30** مقابل trial = **7 أيام** | `db/epic2-admin-rbac-audit-schema.sql:159` | توحيد لـ7 (قرار D-DEV-002) |
| T2 | `CURRENCY_META` بيسمّي AI_CREDITS وENTITLEMENT "NOT IMPLEMENTED" | `lib/shop/economy.ts:271-277` | تصحيح (قرار D-DEV-001) — في `DEV-06` |
| T3 | `ai_models.daily_limit` مربوط بـ`ai_operations` (ربما فاضي) وليس `ai_usage_events` | `lib/ai/model-state.ts:68-81` · `lib/ai/routing.ts:304` | تحويل العدّاد (قرار D-DEV-022) |
| T4 | مفيش `lint` script في `package.json` | `package.json` | إضافة `eslint` (قرار تقني) |
| T5 | CI لا يشغّل على push إلى main | `.github/workflows/ci.yml` — `on: push: branches: [fix/env-reproducibility]` + `pull_request` | إضافة `main` |
| T6 | OpenRouter رصيده = 0 ⇒ الصور واقع على Pollinations المحدود | `docs/TECH_DEBT.md` N-020 | D-DEV-007 — توثيق محدّثي + شحن رصيد يدوي |
| T7 | `/store` stub | `app/store/page.tsx` (17 سطر) | D-DEV-008 — فحص قبل القرار (في `DEV-08`) |
| T8 | 3 اختبارات متخطّاة موثّقة (TD-001..003) | `docs/TECH_DEBT.md` | TD-002 أولوية عالية — بوابة صلاحية غير محمية |
| T9 | BossFight + CommunityQuiz بيبعتوا `systemInstruction` بيتجاهَل | `components/BossFight.tsx:136` · `components/CommunityQuiz.tsx:71` vs `app/api/chat/route.ts` (0 مطابقات) | **bug مؤكد** — مرشح `DEV-02` |
| T10 | `MagicAssistantChat.tsx` dead code | `components/MagicAssistantChat.tsx` | ملف يُزال أو يُعاد ربطه (قرار لاحقاً) |
| T11 | `.worktrees/ui-quick-wins` gitlink | `git ls-files -s` = `160000` | B-04 — لا تنظيف بدون مراجعة |

---

## القسم 5 — قاعدة التصعيد

```
اكتشاف خارج النطاق أثناء شغل DEV:
  → انضاف هنا كـ"جديد" مع المصدر → المالك يقرر
# استثناء: لو مانع حقيقي لاستكمال المرحلة → يتحط
# هنا كـ BLOCKING لفوري ويُبلَّغ المالك فوراً.
```

**عند الاكتمال:** انقل العنصر إلى "محلول" مع دليل، و`BLOCKERS.md` يبقى قائمة المفتوح فقط.
