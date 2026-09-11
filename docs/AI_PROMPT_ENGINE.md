# محرك البرومبت الديناميكي (Prompt Engine + Context Builder)

طبقة التخصيص اللي بتبني `system prompt` مختلف لكل طالب: المرحلة الدراسية،
أسلوب التعلّم، المادة، الموضوع الحالي، نقاط الضعف، ونوع الطلب.

```
lib/ai/prompt-engine.ts    ← النصوص والقواعد (نصّي بحت، من غير أي I/O)
lib/ai/context-builder.ts  ← قراءة الداتا وتجميع الرسائل
lib/ai/models.ts           ← تفضيل الموديل لكل نوع رسالة
app/api/chat/route.ts      ← الربط: حماية + سياق + راوتر + حفظ
```

## الترتيب

1. `route.ts` يتحقق من المستخدم ويحدّ الاستخدام وينضّف الرسايل.
2. `getStudentContext` / `getStudyToolFacts` (lib/magicly-ai.ts) تقرا الدرس والتقدم.
3. `buildFullContext` تقرا البروفايل والذاكرة، تكوّن `StudentProfile`،
   تكشف نوع الرسالة، وتبني الـ system prompt.
4. فلتر الصلاحيات (`filterAccessibleModels`) ثم حجز الائتمان.
5. `aiRouter.completeChat("chat", { messages, temperature, preferredModel })`.
6. الحفظ في `chat_conversations` / `chat_messages` بعد التحقق من ملكية المحادثة.

## أنواع الرسائل

`detectMessageType` بيكشف من النص، و`resolveMessageType` بيخلي الوضع الصريح
من الواجهة (زر اختبار مثلًا) يسبق الكشف:

| النوع | مثال | الموديل المفضّل | temperature |
|---|---|---|---|
| `explain` | «اشرح لي قانون نيوتن» | `openai/gpt-oss-120b` (وجامعي: `nvidia/nemotron-3-super-120b-a12b`) | حسب المرحلة |
| `solve` | «حل: 2x + 5 = 15» | `openai/gpt-oss-120b` (reasoning) | حسب المرحلة |
| `quiz` | «اختبرني في الأحياء» | `openai/gpt-oss-20b` (الأسرع) | حسب المرحلة |
| `plan` | «أبي خطة مذاكرة» | `nvidia/nemotron-3-super-120b-a12b` | حسب المرحلة |
| `general` | أي حاجة تانية | مفيش تفضيل — الراوتر يختار | 0.7 |

الـ temperature من المرحلة: ابتدائي `0.8` · متوسط `0.7` · ثانوي `0.5` · جامعي `0.4`.

`preferredModel` **تفضيل مش تصريح**: الراوتر بيجرّبه الأول لو عدّى نفس بوابة
الأهلية (مسجّل + `enabled` + مجاني/مسموح + القدرات المطلوبة + صحة المزوّد +
الـ entitlement)، ولو لأ بيكمل بترشيحه العادي. شوف `routeCandidates` في
`lib/ai/routing.ts`.

## أسماء الجداول والأعمدة الحقيقية

الوصف الأصلي للميزة كان مفترض مخطط مختلف عن الموجود فعليًا. ده اللي اتنفّذ:

| المتوقَّع | الموجود فعليًا | المصدر |
|---|---|---|
| `weak_topics(subject, topic, error_count)` | `ai_memories` بـ `kind in ('weak_topic','common_mistake')` | `db/ai-learning.sql` |
| `chat_messages.session_id`, `model_used` | `conversation_id` + `user_id`، ومفيش `model_used` | `db/chat.sql` |
| `profiles.full_name` | `display_name` | `app/community/page.tsx` |
| `profiles.stage` / `grade` | `education_stage_id` / `education_grade_id` ← أسماء من `education_stages` / `education_grades`، والاحتياطي `student_level` | `db/onboarding-education-roles.sql` |
| `profiles.subjects` | `subject` + `field` + سياق المحادثة | `db/profile-persona.sql` |
| `profiles.goal` | **غير موجود** → `null` | — |
| `profiles.daily_study_hours` | **غير موجود** → `null` | — |
| `AI_PROXY_URL` / `AI_PROXY_KEY` | **غير موجودة** — المشروع عنده `aiRouter` بمزوّدات مسجّلة في `MODEL_REGISTRY` | `lib/ai/router.ts` |

`error_count` دايمًا `0` لأن `ai_memories` جدول مفاتيح `(user_id, kind, value)`
من غير عدّاد. البرومبت بيكتبها كملاحظة من غير رقم بدل رقم مضلِّل.

ولو اتضافت أعمدة `goal` أو `daily_study_hours` يومًا ما، مكان قراءتها
`loadStudentProfile` في `context-builder.ts` — البرومبت نفسه ما يتغيروش.

## توحيد الأسماء (normalizers)

الداتا فيها أسماء إنجليزية والعربية مش موحّدة، فمن غير التوحيد ده كل
التخصيص كان هيبقى كود ميت:

- **المرحلة**: `Primary/Preparatory/Secondary/Baccalaureate/University`
  (مقيّدة بـ CHECK في `db/education-taxonomy-1.2c.5.sql`) + `prep/high/uni/masters`
  + الأسماء العربية بالمصرى والخليجي → `ابتدائي/متوسط/ثانوي/جامعي/أخرى`.
- **الأسلوب**: `practical/visual/academic` → `مبسّط/خرائط ذهنية/تفصيلي`.
- **المادة**: matching بالكلمات المفتاحية، لأن `subjects.name` عربية
  («الرياضيات») و`profiles.subject` نص حر من المستخدم («Computer Science»).

## الأمان

- `SAFETY_RULES` بتتحقن في أول الـ system prompt دايمًا.
- حقل `systemInstruction` اللي بعض الصفحات بتبعته **مش بيتقرا** عن قصد —
  السماح للعميل بحقن system prompt كان هيبقى باب تجاوز للقواعد دي.
- رسائل `role: "system"` من الكلاينت بتترمي، والتاريخ بيتفلتر بـ `user_id`
  فوق الـ RLS.
- الطلبات اللي بتطلب مخرجات JSON بتتعامل `general` عشان ما تتحقنش عليها
  شخصية الكويز التفاعلية فتكسر `JSON.parse` في الواجهة.

## الاختبار

```bash
npm test                 # كل اختبارات vitest
npm run test:ai:router   # الراوتر (بيتأكد إن التفضيلات مسجّلة)
npm run test:ai:core     # نواة الـ AI (57 اختبار)
```

الملفات الجديدة:
- `lib/ai/__tests__/prompt-engine.test.ts` — النص المحقون فعلًا لكل مرحلة/أسلوب/مادة/نوع.
- `lib/ai/__tests__/context-builder.test.ts` — بيثبّت أسماء الجداول والأعمدة الحقيقية.
- `lib/ai/__tests__/routing-preferred-model.test.ts` — التفضيل بيتجرّب الأول ومن غير تجاوز للبوابة.
- `app/api/chat/__tests__/route.test.ts` — تكامل: الراوت الحقيقي بيوصل البرومبت والـ temperature والموديل للمزوّد.

## معلومة ناقصة معروفة

`profiles.goal` و`profiles.daily_study_hours` مش موجودين في المخطط، فالبرومبت
بيتجاهلهم. لو مطلوب تفعيلهم فعليًا: إضافة عمودين في `db/profile-persona.sql`
وقراءتهم في `loadStudentProfile`.
