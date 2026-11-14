# 🔍 Phase 1 Audit — مولّد الامتحانات بالذكاء الاصطناعي (AI Exam Generator)

> **نطاق التقرير:** فحص فقط — **صفر كود**. الهدف نصمّم مع بعض قبل أي تنفيذ.
> فرع العمل: `feat/lesson-content` (تم إغلاق صفحة الدرس بنجاح ✅).
> المراجَع: صاحب المشروع — قبل البدء في Phase 2.

---

## الملخص التنفيذي

اللي اكتشفناه أهم من أي حاجة: **محرّك الامتحانات موجود بالفعل وشغّال على السيرفر، لكنه «عمى» — مفيش أي واجهة بتستخدمه.**

| الطبقة | الحالة |
|---|---|
| محرّك توليد امتحان من تفريغ محاضرة (credit + leases + budget) | ✅ مبني ومُطبَّق (2026-11-04) — **بدون أي UI** |
| بنك الامتحانات الرسمية (`past_exams`) | 🟡 صفحة قراءة، شبه فاضية، الفلاتر **زينة** |
| واجهة `app/exams` الحالية | ❌ لا توليد، لا إجابة، لا تسجيل، لا عودة للامتحان |
| ربط المساعد الشخصي بالامتحانات | ❌ اقتراحات نصية فقط — **مفيش أي CTA أو link** |
| تخزين إجابات الطالب للامتحان المولَّد | ❌ غير موجود — لا جدول ولا مسار |

---

## 1️⃣ صفحة `/exams` الحالية — إيه الموجود وإيه الناقص؟

### الموجود

**`app/exams/page.tsx`** (Server Component، ~170 سطر — «بذرة بنك الامتحانات — صفحة قراءة فقط»):

- تعليق صريح أعلى الملف: **«لا تخزين، لا إصدار، لا أسئلة، لا إجابات، لا AI»**.
- يجلب من قاعدة البيانات: `countries`، `curricula`، `subjects`، `academic_years`، `past_exams` (المنشورة فقط — الباقي مخفي بـ RLS).
- Breadcrumbs تسلسلي (دولة ← منهج ← مادة ← سنة ← امتحان).
- **4 مربعات اختيار (SelectBox)** للمادة/المنهج/etc.
- شبكة `ExamCard` للامتحانات المنشورة + `EmptyState` لو مفيش.
- تنسيق ألوان **مُتَعَمَّد يدويًا** (`#0D1029` / `#13182E`) — **مش من نظام التصميم** (`sheet-card` / `--r-sm` / `text-ink`) اللي باقي التطبيق بيستخدمه.

**`app/exams/[examId]/page.tsx`** (~79 سطر):

- تفاصيل امتحان رسمي منشور: العنوان، التاريخ، المدة، الدرجة، المصدر.
- تحميل ورقة الامتحان + نموذج الإجابة (لو موجودين في التخزين).
- عرض أسئلة `past_exam_questions` (رقم، نص، درجة) — **قراءة فقط، بدون إجابة أو تقييم**.
- قسم «الإجابات الرسمية» نص ثابت: «لم يتم إضافة… بعد».

**التنقل:** `nav-config.ts:126` → `{ id: "exams", label: "بنك الامتحانات", latin: "Past Exams", href: "/exams" }`.

### الناقص (والموجود لكنه معطّل)

1. **❌ مفيش أي توليد AI** في الصفحة — لا اختيار مادة/محاضرات ولا زرار «ولّد امتحان».
2. **❌ مربعات الاختيار زينة**: `SelectBox` بيعرض خيارات **من غير `onChange` ولا state ولا فلترة** — أي ضغطة مالهاش أي أثر (زرار ميّت).
3. **❌ مفيش قائمة «امتحاناتي»** ولا استئناف لأي جلسة توليد (المحرّك السيرفري عنده مسار استئناف — مفيش صاحب).
4. **❌ مفيش إجابة/تصحيح/درجة** لأي امتحان (رسمي أو مولَّد).
5. **❌ مفيش ربط بالمواد بتاعة الطالب** — الفلاتر بتعرض كل الـcatalog العام، مش مواد الطالب.
6. **🟡 الـengine عمى**: راجع القسم التالي.

---

## 2️⃣ جدول `exam_sessions` و`exam_bank_questions` — إزاي بنخزن الامتحانات؟

> ⚠️ **تصحيح مهم:** جدول اسمه **`exam_bank_questions` مش موجود** في القاعدة. البنوك الفعلية اتنين:
>
> | الجدول | الدور |
> |---|---|
> | `past_exams` + `past_exam_questions` | بنك **الامتحانات الرسمية** (مصادر وزارة/ماضية) — read-only للعميل، `verification_status` (pending/verified/rejected)، `topic_id` → `diagnostic_topics`، `options_json` + `correct_option_index` للتصحيح الآلي |
> | `diagnostic_question_bank` | بنك أسئلة **التشخيص** (foundation) |
> | **`exam_session_items.result_json`** | **الامتحان المولَّد بالـAI** — ده بنك «الذكاء الاصطناعي» الفعلي |
>
> + `past_exam_answers` = إجابات الامتحانات الرسمية (مش للمولَّد).

### أ) `exam_sessions` — محرّك «المراجعة اللحظية» (`db/26-exam-sessions.sql`، مُطبَّق على الإنتاج 2026-11-04)

**`exam_sessions`** (جلسة = امتحان مولَّد):

```sql
id, user_id
mode            text CHECK (mode = 'last_minute_review')   -- وضع واحد بس حاليًا
status          'created' | 'generating' | 'ready' | 'completed' | 'failed' | 'abandoned'
total_lectures  1..3        -- حجم الامتحان: محاضرات
total_chars     ≤ 60,000    -- سقف حروف التفريغ
total_chunks    ≤ 9         -- سقف قطع المعالجة
estimated_tokens
logical_calls_used      (سقف 15)  -- نداءات AI منطقية
provider_attempts_used  (سقف 45)  -- محاولات المزوّد الفعلية
credit_reserved_at / credit_refunded_at   -- حجز كريدت ذري (1 كريدت/جلسة)
started_at, completed_at, created_at, updated_at
```

**`exam_session_items`** (بند لكل محاضرة — لحد3):

```sql
session_id + lecture_id (unique) + ordinal (1..3)
status       'queued' | 'processing' | 'ready' | 'failed' | 'canceled'
claim_token + claimed_at + lease_expires_at + attempt_count (≤2)   -- استحواذ عامل ذري
transcript_chars, chunk_count
result_json  jsonb   ← ⭐ هنا الاسئلة المولَّدة: {summary, key_points, questions:[...]}
error_code, error_message
```

**7 دوال RPC (ذِرية):**

| RPC | الوظيفة |
|---|---|
| `create_exam_session_with_reserve` | يتحقق الملكية + الميزانية **من القاعدة** (مش من العميل)، ينشئ الجلسة + البنود، ويحجز **كريدت واحد** ذريًا |
| `claim_exam_session_item` / `renew_exam_session_lease` | استحواذ البند بـ lease4 دقائق + تجديد بعد كل نداء |
| `save_exam_session_result` / `fail_exam_session_item` | حفظ/fail مشروط بالـ token |
| `increment_exam_session_usage` | عدّاد15 منطقي /45 محاولة ذري |
| `get_exam_session_item_state` | تفريق423 عن200 (busy/ready/exhausted) |

**RLS:** المالك **يقرأ فقط** — الكتابة عبر الـRPC/service-role.

**الأنابيب المبنيّة فوقه:**

- `lib/ai/exam-sessions.ts` (282 سطر) — عبّاءة الـ7 RPC بعقد `Result<T>`.
- `POST /api/exam-sessions` — إنشاء (يستورد `createExamSession`).
- `GET /api/exam-sessions/[id]` — «مسار الاستئناف بعد إغلاق الصفحة»: حالة الجلسة وبنودها (بدون AI).
- `POST /api/exam-sessions/[id]/items/[itemId]/process` (321 سطر, `maxDuration=300`) — claim → تحقق ميزانية → توليد → تجديد lease بعد كل نداء → حفظ → تحديث حالة الجلسة.
- `lib/ai/exam-review.ts` (340 سطر) — خط الأنابيب: تقطيع التفريغ (12,000 حرف/قطعة) → ملخص لكل قطعة → دمج → **MCQ لكل قطعة** مع قواعد GROUNDING (ممنوع تخريف) + تحقق Structured + إزالة التكرار.
  - **الشكل المحفوظ:** `{ summary, key_points, questions: [{ question, options[4], correctAnswer, explanation }] }`
  - **أنواع الأسئلة: MCQ بس** — لا essay ولا true/false حاليًا.
  - ميزانية القطعة: `summary = chunks (+merge)` + `mcq = chunks` → `attempts = logical × 3`.

### ب) ❗الاكتشاف الأهم: المحرّك «عمى»

`grep` على كل `app/` و`components/`:
**مفيش أي صفحة ولا مكوّن بيستورد `lib/ai/exam-sessions.ts` أو بينادي `/api/exam-sessions`** — الاستيراد موجود في الراوتس السيرفري بس.

يعني: **محرّك كامل (كريدت + leases + budget + استئناف) مبني ومُختبَر (`lib/ai/__tests__/exam-sessions.test.ts`) ومحدش بيستخدمه.**

---

## 3️⃣ الـ Personal Assistant — فين وكيف يقترح المهام؟

### المكوّنات

| ملف | الدور |
|---|---|
| `app/dashboard/components/PersonalAssistant.tsx` (338) | الكارت العام: أفاتار + تحيّة + بريفينج + مؤشرات |
| `components/dashboard/{primary,secondary,preparatory,baccalaureate,university}/*AssistantCard.tsx` | نسخ لكل مرحلة (نفس الفكرة، لغة بصرية أخف) |
| `lib/personal-assistant/briefing.ts` (199) | **توليد نصوص فقط** — «مفيش هنا أي قاعدة بيانات ولا AI» |
| `lib/personal-assistant/context.ts` (239) | بناء `PersonalAssistantContext` من الخطة/الأهداف/النشاط |
| `lib/personal-assistant/{primary,secondary,...}.ts` | أغلفة رقيقة لكل مرحلة |

### السياق المتاح (`PersonalAssistantContext`)

```ts
{ userName, role, studentLevel, subject,           // ← subject موجود كنص!
  streak, xp,
  studyProgress: { currentDay, totalDays, progressPct },
  goals: { pendingCount, pendingTitles[3], urgentCount },
  recentActivity: { focusMinutesToday, focusMinutesWeek, activeDaysCount } }
```

### ⚠️ كيف «يقترح» المهام حاليًا؟

**نص بس — بدون أي link أو زرار.** كل الاقتراحات جمل من `briefing.ts`:

- `launchMessage` ← «خلينا نكمّل {subject} النهارده ونقرّب من هدفك 🚀»
- `roleMessage` ← «…نبدأ درس النهارده…»
- `progressMessage` / `goalsMessage` / `streakMessage` / `xpMessage` / `activityMessage`

والتذييل مكتوب فيه صراحة: **«Phase 4: duplicate CTA removed, briefing only»** — أي إن أي زرار اقتراح **اتشال عن قصد**. حتى `MagicAssistantChat` مفيهوش href/suggest links.

### 🔗 أنماط الربط الموجودة بالفعل (نقدر نبني عليها)

```ts
// components/dashboard/baccalaureate/BaccalaureateGoalInput.tsx:75
{ capability: "exam",  label: "امتحان شامل", href: "/exams", reason: "محاكاة" }
// preparatory/primary GoalInput:74-75
{ capability: "quiz",  label: "حل أسئلة",    href: "/exams", reason: "اختبر فهمك" }
// primary/PrimaryQuickActions.tsx:7
{ id: "quiz", label: "حل أسئلة", sub: "سؤالين بسرعة", href: "/exams" }
// TodayMissionsCard → Link href="/missions"   (نفس فكرة الكارت)
// بطاقات الـWorkspace → /lectures?subject=<id> (سابقة فلترة بـ query param ✅)
```

**الخلاصة:** نمط الـcapability chips جاهز — ناقصه بس **query params** + استقبالها في `/exams`.

---

## 4️⃣ اقتراح تصميم الربط: من اقتراح المساعد ← امتحان محدَّد المادة والمحاضرة

### المبدأ

**`/exams` يقرأ نيّة الطالب من الـURL** — نفس نمط `/lectures?subject=` و`?tab=` و`?dayId=` اللي شغّالين في التطبيق:

```
/exams?gen=1                    ← افتح مولّد الامتحانات مباشرة
&subject=<اسم_المادة>           ← المادة محدَّدة مسبقًا (اسم — لأن ربط الدرس بالمنهج «اسم» عندنا)
&subjectId=<id>                 ← اختياري: معرف مسار المادة (workspace_subjects/university_subjects)
&lecture=<id>                   ← محاضرة محدَّدة (يتكرر أكثر من مرة لعدة محاضرات)
&dayId=<id>                     ← من صفحة الدرس: الراوت يقرأ source_lecture_id تلقائيًا
```

### نقاط الإغلاق الأربعة (كلها «نيّة» تُقرأ عند فتح الصفحة)

1. **صفحة الدرس** (أغنى مصدر): زرار **«🧪 اعمل امتحان من الدرس»** في شريط الحالة/التقدّم →
   `/exams?gen=1&dayId=<dayId>&subject=<subject>` — الدرس **مربوط أصلًا بمحاضرة** (`lesson_content.source_lecture_id`) يعني المحاضرة تجيء **تلقائية100%**.
2. **المساعد الشخصي**: إضافة حقل منظّم جديد `actions` للـbriefing (مش نص):
   ```ts
   actions?: { kind: "exam"; label: "اعمل امتحان"; href: "/exams?gen=1&subject=…" }[]
   ```
   الكارت يعرضه `Link` صغير — **البريفينج يفضل نصيًا نظيف** (محدش لامس قرار «CTA-free»: الإجراءات تبقى بيانات منفصلة يقدر كل كارت يعرضها أو يتجاهلها).
   شرط الظهور: **صدق البيانات فقط** (نفس فلسفة `NO FABRICATION` في briefing.ts) — مفيش subject حقيقية → مفيش اقتراح.
3. **Chips القدرات** في GoalInput/QuickActions: إضافة اختيارية `query` على الـobject → `href: "/exams?gen=1&subject=…"` (بيانات onboarding موجودة وقتها).
4. **محادثة المساعد** (`MagicAssistantChat`) — مؤجل لمراحل لاحقة (محتاج tool-calls).

### سلوك `/exams` عند الوصول بـ params

- الصفحة تبقى Server Component + **جزر Client** (مش إعادة بناء كاملة):
  - `?gen=1` → يفتح المولّد (client island) بدل البنك.
  - `subject`/`subjectId` → **مُعبّأين مسبقًا** في مُختار المادة (ولو الاسم مش موجود في كتالوج الطالب → يُضاف كـ«مادة الدرس» مؤقتة).
  - `lecture=` → المحاضرة محدَّدة ومقفلة في قائمة المصادر (أو مفعّلة بعلامة ✓).
  - **التحقق على السيرفر**: أي id يمرّ عبر فحص ملكية (`user_id`) قبل التوليد — الـparams نيّة فقط مش ثقة.

---

## 5️⃣ اقتراح شكل التوليد والحفظ

### الخطوة A — تمديد المحرّك الموجود (بدل بناء جديد) ✅ مُوصى به

المحرّك عنده بالفعل: حجز كريدت، leases، budget caps، استئناف، اختبارات — **نمدّده مش نبدّله**:

1. **النطاق (scope)**
   - الطالب يختار **مادة** (+ محاضراتها اختياريًا).
   - `subject_id`/`day_id`/عنوان يتسجّلوا في `exam_sessions` — النهارده الجلسة **مش بتعرف** إنها لمادة إيه (metadata ناقصة). ← عمود `metadata jsonb` أو أعمدة صريحة.
   - سقف `1..3` محاضرات و`60k` حروف **يفضل كما هو في البداية** (محترم للتكلفة) — لو الطالب اختار مادة كاملة بيختار أبرز محاضراتها.

2. **أنواع الأسئلة (MCQ ✅ موجود — يُضاف)**
   - `true_false` — سهل: نفس الـvalidator مع حقل `correctAnswer: boolean`.
   - `essay` — بدون `correctAnswer` (نفس منطق `past_exam_questions`: الأعمدة اللي بعض الأنواع مالهاش تبقى nullable + validation عند التوليد).
   - الشكل الموحّد المقترح داخل `result_json`:
     ```jsonc
     { "summary": "…", "key_points": ["…"],
       "questions": [
         { "id": "q1", "type": "mcq",  "text": "…", "options": ["…","…","…","…"], "correctIndex": 0, "explanation": "…" },
         { "id": "q2", "type": "tf",   "text": "…", "correct": true,  "explanation": "…" },
         { "id": "q3", "type": "essay","text": "…", "modelAnswer": "…", "rubric": "…" }
       ] }
     ```
   - التوليد: امتداد لـ`exam-review.ts` (نفس GROUNDING + structured validation لكل نوع + budget formula تتزاد عليه نداءات الـTF/Essay بس).

3. **الحفظ — «الطالب يرجعله»**
   - **الأسئلة**: موجودة ✅ في `exam_session_items.result_json` (بند لكل محاضرة) + `GET /api/exam-sessions/[id]` للعودة.
   - **مفقود: جدول جديد `exam_session_answers`** (الأسئلة المولَّدة مالهاش مكان لإجابة الطالب):
     ```sql
     exam_session_answers (
       id, session_id → exam_sessions, user_id,
       item_id → exam_session_items,   -- مصدر السؤال
       question_key text,              -- مفتاح ثابت داخل result_json (id السؤال)
       answer jsonb,                   -- {choice} | {boolean} | {text}
       is_correct boolean null,        -- mcq/tf تلقائي؛ essay = null لحد التصحيح
       answered_at, created_at
       unique (session_id, question_key)
     )
     ```
   - الدرجة: sum(is_correct)/count للأنواع الآلية —Essay يُصحَّح ذاتيًا أو بالـAI في مرحلة تالية.
   - القائمة «امتحاناتي»: استعلام واحد `exam_sessions where user_id … order by created_at` (الـindex `idx_exam_sessions_user_status` جاهز) → كارت بحالة + مادة + تقدّم.

4. **مسار التوليد الكامل (مقترح)**
   ```
   اختيار (مادة + محاضرات + أنواع + عدد أسئلة)
     → POST /api/exam-sessions  (RPC: ownership + budget + حجز كريدت)
     → لكل بنود: POST …/process  (claim → توليد → حفظ — موجود حاليًا)
     → GET  /api/exam-sessions/[id]  → جاهز → واجهة الامتحان
     → الإجابة → upsert exam_session_answers → score → status 'completed'
   ```

### الخطوة B — تحسينات لاحقة (خارج Phase 2)

- تصحيح Essay بالـAI ( Rubric ) + معاودة المحاولة.
- بنك أسئلة **معاد استخدامه** (نفس سؤال المادة في امتحانات تالية — `verification_status` نمط جاهز من البنك الرسمي).
- ربط `user_weaknesses` → توليد أسئلة على الضعف (البنك الرسمي بيدي الـtopic link جاهز).
- اختبارات `/exams` الرسمية تفضل مسارًا منفصلًا (read-only) — **مش بنخلطها مع المولَّد**.

---

## 6️⃣ مشكلة مؤجَّلة تابعة لموضوع الامتحانات (CONFIRMED)

**`components/BossFight.tsx:136` و`components/CommunityQuiz.tsx:71`** بيبعتوا `systemInstruction` في جسم طلب `/api/chat` —

**و`app/api/chat/route.ts` مفيهوش `systemInstruction` خالص (0 مطابقات)** → الحقل **متجاهَل بصمت**: أسئلة البوس فايت والكويز المجتمعي بتتولّد **بدون أي system prompt** (رسالة المستخدم وحدها: «جهز أسئلة البوس فايت دلوقتي»).

الإصلاح المقترح ضمن مرحلة الامتحانات: تمرير الـprompt كرسالة system حقيقية عبر `runAiTask` (نفس مسار `exam-review`) — أو توحيد المسار مع المولّد الجديد.

---

## 7️⃣ قرارات مفتوحة — نحتاج رأيك قبل التنفيذ

1. **نطاق الامتحان**: مولّد «محاضرة-محاضرة» (المحرّك الحالي) أم «ورقة مادة» (نجمع أسئلة المحاضرات في ورقة واحدة)؟ — **التوصية**: الجلسة = ورقة واحدة، المحاضرات = مصادرها (بنود) — أي ما فوق.
2. **سقف الكريدت**: نحافظ على **كريدت1/جلسة** (الحالي) مع تسعير الأنواع الجديدة داخل نفس الحجز؟
3. **Essay**: تصحيح ذاتي (طالب يشوف الإجابة النموذجية) في البداية، ولا نستنى تصحيح AI؟ — **التوصية**: ذاتي أولًا (أرخص وأسرع).
4. **قائمة «امتحاناتي»** تظهر فين؟ — تبويب جديد في `/exams` (`?tab=my`) أم كارت في الداشبورد؟
5. **إعادة استخدام الأسئلة**: نسمح بتوليد جديد في كل مرة (الحالي) أم نخزّن ونعيد استخدام؟ (مؤجل — بس بيأثر على تصميم الجدول).
6. **`/exams` الحالي بثيم يدوي مخالف للنظام** — نوحّده مع `sheet-card` أثناء البناء، ولا نسيبه مؤقتًا ونركّز على المولّد؟

---

*التقرير فحص فقط — لا يغيّر أي ملف تشغيلي. الخطوة التالية: مراجعة هذا الملف + مناقشة القرارات7 ثم اعتماد تصميم Phase 2.*
