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

## النبرة (مصري / خليجي)

المنتج كله بالمصري — `lib/magicly-ai.ts`: «مساعد مذاكرة مصري خفيف وطبيعي»،
ورسائل الأخطاء في `lib/api-guard.ts` كمان. عشان كده النبرة الافتراضية مصرية.

الجمل اللي بتختلف بين اللهجتين متجمّعة في `DIALECT_PHRASES`، والتبديل سطر واحد:

```ts
// lib/ai/prompt-engine.ts
export const DIALECT: Dialect = "مصري";   // ← غيّر هنا بس
```

| المفتاح | مصري (الافتراضي) | خليجي (المواصفة الأصلية) |
|---|---|---|
| `voiceRule` | تتكلم بالمصرية الواضحة... | تتكلم بلغة الطالب (عامية خفيفة...) |
| `correction` | فكرة ممتازة! بس تعالى نراجع... | فكرة ممتازة! بس خلنا نراجع... |
| `challenge` | أتحداك تحل دي! 💪 | أتحداك تحل هذي! 💪 |
| `whySky` | تعرف ليه السما زرقاء؟ ده بسبب... | تعرف ليش السما زرقاء؟ هذا بسبب... |
| `quickCheck` | طيب، برأيك ليه...؟ | طيب، برأيك ليش...؟ |
| `testUnderstanding` | يلا نختبر فهمك بـ 3 أسئلة... | خلنا نختبر فهمك بـ 3 أسئلة... |
| `trySimilar` | تحب تحاول مسألة شبهها؟ 💪 | تبي تحاول مسألة مشابهة؟ 💪 |
| `brakeLaw` | ده القانون اللي بيخلي العربية تفرمل | هذا القانون هو اللي يخلي السيارة تفرمل |
| `batteryReaction` | ده التفاعل اللي بيحصل في بطارية عربيتك | هذا التفاعل هو اللي يحصل في بطارية سيارتك |
| `cellsNow` | ده بالظبط اللي بيحصل في خلاياك دلوقتي | هذا بالضبط اللي يحصل في خلاياك الحين |
| `priorKnowledge` | إيه اللي تعرفه عن ... قبل ما أشرح؟ | إيش تعرف عن ... قبل ما أشرح؟ |
| `givens` | إيه المعطيات اللي عندك؟ | إيش المعطيات اللي عندك؟ |
| `planRealistic` | الخطة دي واقعية بالنسبة لك؟ | هل هذي الخطة واقعية لك؟ |

باقي التعليمات فصحى في الحالتين لأنها موجهة للموديل مش للطالب.

⚠️ قاعدة صيانة: أي جملة جديدة الموديل بيقولها للطالب حرفيًا لازم تتحط في
`DIALECT_PHRASES` — مش جوه القالب مباشرة. الاختبار
`مفيش أي مفردة خليجية في أي تركيبة` بيمسح كل تركيبة مرحلة × أسلوب × مادة ×
نوع رسالة ويقع لو اتسربت مفردة.

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
- `systemInstruction` من العميل بيتقرا، بس **كتعليمات تنسيق مُلحقة بآخر
  البرومبت** مش system prompt منفصل — شوف القسم اللي تحت.
- رسائل `role: "system"` من الكلاينت بتترمي، والتاريخ بيتفلتر بـ `user_id`
  فوق الـ RLS.
- الطلبات اللي بتطلب مخرجات JSON بتتعامل `general` عشان ما تتحقنش عليها
  شخصية الكويز التفاعلية فتكسر `JSON.parse` في الواجهة.

## `systemInstruction` (تعليمات التنسيق من العميل)

٧ أماكن في الواجهة بتبعت الحقل ده وتستنّى JSON:

| المكان | الاستخدام |
|---|---|
| `app/assessment/page.tsx:307` | توليد خطة دروس (JSON) |
| `app/dashboard/workspace/page.tsx:227` | تلخيص مادة (نثر) |
| `app/lesson/[dayId]/page.tsx:173` | شرح الدرس (نثر) |
| `app/lesson/[dayId]/page.tsx:523` | توليد كويز (JSON) |
| `app/lesson/[dayId]/page.tsx:576` | مساعد تفاعلي (نثر) |
| `components/BossFight.tsx:136` | أسئلة BossFight (JSON) |
| `components/CommunityQuiz.tsx:71` | كويز المجتمع (JSON) |

كانت بتتبعت والراوت مش بيقرأها خالص، فالموديل ما كانش يعرف إن مطلوب JSON.
الحل: `appendSystemInstruction` بتلحقها في **آخر** الـ system prompt تحت لافتة
«تعليمات تنسيق الإخراج الإلزامية»، مع:

1. **سقف طول ١٢٠٠ حرف** (`MAX_CLIENT_INSTRUCTION_CHARS`) — مقاس مش مخمَّن:
   أطول تعليمات حقيقية `assessment:301` (~٥٦٧ حرف مصدر) + `buildPersonaContext`
   (أقصاه ٢٥٢، مقاس على كل تركيبات الشخصية × المستوى × المجال) ≈ ٨٥٠.
2. **قواعد الأمان والهوية بتفضل في الأول**، وفيه تنبيه صريح بعد نص العميل
   إنها لسه سارية.
3. **رسايل `role:"system"` من العميل بتترمي** (في `context-builder`).
4. **أي طلب JSON بيتعامل `general`** — عبر `isStructuredOutputRequest` اللي
   بتفحص الرسالة **والتعليمات**: في BossFight/CommunityQuiz طلب الـ JSON في
   `systemInstruction` مش في الرسالة («جهز أسئلة البوس فايت دلوقتي.»)، فلو
   فحصنا الرسالة بس كنا هنحقن شخصية الكويز («ابدأ بـ جاهز للتحدي؟ 🎯»)
   ونكسر `JSON.parse`.

⚠️ الحد الحقيقي: النص من العميل، فمهما لفّيناه هو قادر نظريًا يحاول يتجاوز
التعليمات. القيود الأربعة فوق بتقلّل المساحة مش بتلغيها — أي استخدام جديد
للحقل ده يحتاج مراجعة.

## البناء والخطوط (Google Fonts) — اتحلّت

`next/font/google` بينزّل ملفات الخطوط **وقت البناء**، فأي بيئة من غير اتصال
بـ `fonts.googleapis.com` (CI معزول، sandbox، بناء محلي بدون إنترنت) كان
`next build` بيفشل عندها بـ `next/font: Failed to fetch`.

⚠️ **`display: 'swap'` مش الحل** — وكان **موجود أصلًا** على كل الخطوط
والبناء لسه بيفشل، لأن `display` خاصية CSS (`font-display`) لوقت التشغيل بس.

### الحل المطبّق: `next/font/local` من حزم `@fontsource`

| الخط | الحزمة | السبب |
|---|---|---|
| Alexandria | `@fontsource-variable/alexandria` | variable |
| IBM Plex Sans Arabic | `@fontsource/ibm-plex-sans-arabic` | **مفيش نسخة variable على npm** — `@fontsource-variable/ibm-plex-sans-arabic` غير موجود، فبنستخدم الثابتة بالأوزان 400/500/600/700 نفسها |
| JetBrains Mono | `@fontsource-variable/jetbrains-mono` | variable |
| Playfair Display | `@fontsource-variable/playfair-display` | **كان في `components/landing/Capabilities.tsx:9` مش في layout** — من غيره البناء يفضل fails |

النقاط اللي ممنوع تتكسر:

1. **أسماء المتغيرات زي ما هي**: `--font-display-src` و`--font-body-src`
   و`--font-mono-src` و`--font-playfair-display-src`. `app/globals.css` بيبني
   عليهم `--font-display` / `--font-body` / `--font-mono` في ~٢٥ موضع، فأي
   تغيير اسم كان هيكسر التايبوجرافي في الموقع كله.
2. **الحزم في `dependencies` مش `devDependencies`** — البناء محتاجها.
3. **مفيش أصول binary في Git**: المسارات بتشير لـ `node_modules/`، فالخطوط
   بتيجي من npm بإصدارات مثبّتة. (الخطة البديلة بنسخها في `public/fonts/`
   مش مستخدمة: بتضيف ملفات للريبو **و** بتخليها متاحة كـ static كمان.)

### نتيجة البناء المتحقَّق منها

```
✓ Compiled successfully in 38.1s
  Finished TypeScript in 31.2s
  Generating static pages (91/91)
BUILD_EXIT=0
```

- ١٢ ملف `woff2` اتحزموا في `.next/static/media/` (٤١٢ ك على الديسك؛
  المتصفح بينزّل بس الأوزان والـ subsets اللي الصفحة محتاجاها).
- صفر أخطاء خطوط في اللوج.

⚠️ ملاحظتان على البيئة (مش من التغيير ده):
- خطوة TypeScript في `next build` بتحتاج `NODE_OPTIONS=--max-old-space-size=3072`
  على جهاز راماته ٤ جيجا — من غيره OOM.
- `next build` بيحتاج `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  وقت SSG، وإلا `/assessment` بيقع بـ `@supabase/ssr: Your project's URL and
  API key are required`. البناء المتحقَّق منه اشتغل بمفاتيح وهمية.

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
