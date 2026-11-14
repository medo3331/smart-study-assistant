# Phase 1 Audit — صفحة الدرس (`/lesson/[dayId]`)

> **الحالة:** Hotfix الفيديو ✅ منفّذ ومتحقق منه · التطوير ⏸️ بانتظار موافقة
> **التاريخ:** 2026-11-13 · **الفرع:** `feat/ui-polish-citations` · **الـ commit:** `db584902`
> **النطاق:** تدقيق الحالة الحالية + مقترح تطوير. **مفيش كود تطوير اتكتب.**

---

## 0. ملخص تنفيذي (TL;DR)

| # | النتيجة |
|---|---|
| 1 | **الفيديو اتصلح** — كان الـ CSP مانع أي `frame` خارجي. اتعدّل في `next.config.ts` واتحقّقنا من الهيدر فعليًا على السيرفر. |
| 2 | **الشرح مش موجود في الداتابيز.** الـ `study_days` فيها ٩٨٢ صف، والمحتوى الوحيد المخزَّن هو `description` (نص عادي ≤٥٠٠ حرف). كل الشرح اللي الطالب بيقرأه **بيتولّد من الـ AI لحظيًا كل مرة وبيتضيع** — مفيش ذاكرة ولا مصدر ثابت. |
| 3 | **مفيش Transcript للفيديو.** الفيديو embed من يوتيوب (مش ملف مرفوع عندنا)، والـ search API بترجّع `snippet` بس (عنوان/قناة/صورة) — **ولا كلمة ولا سطر بتوقيت**. |
| 4 | **نظام الـ Citations موجود وشغّال في المحاضرات** (`/lectures`) — مقتبس حرفي + رقم المقطع + شارة «متحقَّق منه» + رابط «اذهب للمصدر». **لكن مفيش أي رابط بين `study_days` و`lectures`**، فالدرس ما يقدرش ينقله. |
| 5 | **بَج في الـ Chat مكسور فعليًا:** `UnifiedChat` بيبعت `lesson` كـ object، والسيرفر بيقراه بـ `shortText()` اللي بيقبل strings بس ⇒ كل محادثة الدرس بتقول **«درس غير محدد»**. |
| 6 | **في شاتّين متنافسين** بالصفحة: `UnifiedChat` (كامل) + شات «سؤال وجواب» داخلي (مبني بإيده). + الشات الداخلي بيبعت `systemInstruction` بيتجاهل entirely. |
| 7 | **مفيش RAG حقيقي:** الـ `match_knowledge` موجود في الداتابيز بس **مش متنادى من أي مكان**، والـ ١٢٥ صف في `knowledge_base` كلها بيانات seed (`source_type='sample'`) مش مربوطة بأي درس. |

**الاستنتاج المحوري:** المشكلة الحقيقية مش في الشكل — المشكلة إن **الدرس مالوش «مصدر حقيقة» واحد ثابت**. الـ Citations والـ Checkpoints مفيش ي anchoring لازم، والـ Chat مش عارف هو في أي درس. الحل مش تصريف — الحل **مصدر مرجعي واحد للدرس** كل حاجة تتبني عليه.

---

## 1. الـ Hotfix — منفّذ ✅

### التشخيص
```
Refused to frame 'https://www.youtube-nocookie.com/' because it violates
the following Content Security Policy directive: "frame-src 'self'"
```

- الـ CSP معرّف في **`next.config.ts`** (`headers()` → `source: '/:path*'`). مفيش `middleware.ts` في المشروع؛ الملف الوحيد الشبيه بيه `proxy.ts` وده **مش** فيه CSP.
- مفيش `<meta http-equiv="Content-Security-Policy">` في `app/` — فالمصدر الوحيد هو `next.config.ts`.
- الـ iframe مصدره: `lib/lesson/video-server.ts:68` →
  `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1&playsinline=1`
- **متلومش على الـ iframe** — هو صحيح. المتصفح هو اللي رفض لأنه `frame-src 'self'` بس.

### التعديل (`next.config.ts`)
```diff
-  "img-src 'self' data: blob: https:",
+  "img-src 'self' data: blob: https: https://i.ytimg.com https://img.youtube.com",
-  "frame-src 'self'",
+  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
```

### التحقق (فعلي، مش نظري)
```
$ curl -s -I http://localhost:3000/lesson/abc
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https: https://i.ytimg.com https://img.youtube.com;
  ...
  frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;
  object-src 'none'; ... frame-ancestors 'self'; ...
```
✅ `npm run typecheck` نجح. ✅ الهيدر على `/lesson/*` صح.

### ملاحظات
- **`object-src 'none'` و `frame-ancestors 'self'` مابيتكسروا** — اتأكدنا إن الـ relaxation محدود في `frame-src` بس.
- **أثر جانبي:** `components/landing/HowItWorksVideo.tsx` كان كمان مكسور بنفس العطل (نفس `youtube-nocookie`) — اتصلح معاه.
- **الـ commit:** `db584902` — ملف واحد (`next.config.ts`).

### ⚠️ تحفّظ لازم نعرفه (مهم للـ Phase 1.3)
لو حابب **نتحكّم في الفيديو** (نعرف الوقت الحالي / نعمل seek / نوقف عند نقطة) — الـ iframe الحالي **مالوش `enablejsapi`**، فمفيش أي قناة اتصال. ده بيحتاج:
```
script-src 'self' 'unsafe-inline' https://www.youtube-nocookie.com   ← widening جديد
```
وده **قرار أمني** محتاج موافقة، مش هتعمله من غير ما نتفق.

---

## 2. تدقيق الوضع الحالي — الصفحة الحالية

### 2.1 خريطة الصفحة (بالترتيب الفعلي في الـ DOM)

`app/lesson/[dayId]/page.tsx` — ١٣٢٥ سطر، **`"use client"`** بالكامل.

| # | القسم | السطر | المكوّن | مصدر البيانات |
|---|---|---|---|---|
| 0 | Breadcrumb (مادة + عنوان) | 836 | `LessonBreadcrumb` | `study_configs.subject`, `study_days.topic` |
| 0b | شريط نقاط أيام الوحدة | 841 | `LessonUnitProgress` | `study_days` (كل أيام الـ config) |
| 1 | Hero (عنوان/وصف/XP/CTA/حفظ/مشاركة) | 848 | `LessonHero` | `study_days` |
| 2 | Study Tutor Widget | 865 | `StudyTutorWidget` | props فقط |
| 3 | **UnifiedChat** (شات كامل) | 878 | `components/unified-ai/UnifiedChat.tsx` | `POST /api/unified-ai` |
| 4 | **LessonVideoPlayer** | 893 | `components/lesson/LessonVideoPlayer.tsx` | `POST /api/lesson/video` |
| 5 | Specialization Tools (مدي) | 902 | `SpecializationTools` | `ctx` |
| 6 | تابات النمط (أكاديمي/بصري/تطبيقي) | 924 | `LessonModeTabs` | `study_days.learning_style` (بتتكتب!) |
| 7 | **الشرح** (SmartContentViewer) + لوحة التقدّم | 938–967 | inline + `LessonProgressPanel` | `POST /api/ai/generate` |
| 8 | **سؤال وجواب** (شات تاني) | 970–1032 | inline | `POST /api/chat` |
| 9 | موارد الدرس (روابط) | 1035–1120 | inline | `study_days.resource_links` |
| 10 | الاختبار القصير | 1123–1244 | inline | `POST /api/lesson-quiz` |
| 11 | مودال الاحتفال | 1248 | inline | `complete_study_day` RPC |
| 12 | FeedbackWidget | 1321 | — | — |

**الشكل العام:** عمود واحد `max-w-3xl`، ١٢ قسم فوق بعض. الاستثناء الوحيد: شبكة من عمودين (`lg:grid-cols-[1fr_280px]`) فيها الشرح + لوحة التقدّم.

### 2.2 مصادر البيانات (من فين بتيجي كل حاجة)

**الاستعلامات — كلها client-side** (السطر 374–485):
| جدول | الأعمدة المستخدمة | ملاحظة |
|---|---|---|
| `study_days` | `select("*")` eq `id` + `user_id` | ★ `*` = ٢١ عمود، منها ١٧ مش مستخدم بالصفحة |
| `study_configs` | `subject, category` | |
| `profiles` | `xp` + سياق التعليم (stage/grade/track/faculty/edu_year/field) | |
| `education_stages` / `_grades` / `_tracks` | `code` / `name` | لعرض أسماء |
| `study_days` (تاني) | `id, day_number, is_completed` | للتقدّم والدرس التالي/السابق |
| `study_day_unlocks` | عبر `fetchUnlockedDayIds()` | الفتح المبكر |

**جدول `study_days` الحقيقي (من الداتابيز الحيّة — ٩٨٢ صف):**

| العمود | النوع | التغطية الفعلية | مستخدم بالصفحة؟ |
|---|---|---|---|
| `description` | text | **٩٨٢/٩٨٢** (نص عادي ≤٥٠٠ حرف) | ✅ |
| `topic`, `title` | text | ٩٨٢/٩٨٢ | ✅ |
| `learning_style` | text | ٩٨٢/٩٨٢ | ✅ |
| `xp_reward`, `day_number`, `is_completed` | — | ٩٨٢/٩٨٢ | ✅ |
| `resource_links` | jsonb | ٩٨٢/٩٨٢ … بس **كلهم `[]`** | ✅ (فاضي) |
| `stages` | jsonb | ٩٨٢/٩٨٢ … بس **كلهم `[]`** | ❌ |
| `flashcards` | jsonb | ٩٨٢/٩٨٢ … بس **كلهم `[]`** | ❌ |
| `summary` | text | **٠/٩٨٢** | ❌ |
| `notes` | text | **٠/٩٨٢** | ❌ |
| `mindmap` | jsonb | **٠/٩٨٢** | ❌ |
| `playground_code` | text | **٠/٩٨٢** | ❌ |

> **الإجابة على سؤال «هل في شرح مكتوب (Markdown) جوه الداتابيز؟»**
> **لا.** الـ `description` نص عادي (مش Markdown، ومحدود بـ ٥٠٠ حرف). أعمدة `summary`/`notes`/`flashcards` موجودة في الجدول لكن **فاضية في كل الـ ٩٨٢ صف**. يعني: **مفيش شرح مكتوب ولا مخزَّن — كل الشرح متولّد لحظيًا.**

### 2.3 مسار الـ AI (وإيه اللي بيتولّد وبيضيع)

| القسم | الـ endpoint | بيخزّن؟ | ملاحظة |
|---|---|---|---|
| الشرح (٤ أنماط) | `POST /api/ai/generate` | ❌ **لا** | بيتولّد من جديد كل مرة تختار فيه نمط |
| شات سؤال وجواب | `POST /api/chat` | ❌ لا | في `chatMessages` بالذاكرة بس |
| UnifiedChat | `POST /api/unified-ai` | ⚠️ في `chat_conversations` | |
| الاختبار | `POST /api/lesson-quiz` | ⚠️ `lesson_quiz_cache` موجودة | الـ route **مش بيقراها** — يولّد كل مرة |

**نتيجة:** الطالب كل مرة بيفتح الدرس بيستهلك رصيد AI جديد وياخد إجابة مختلفة قليلاً. مفيش «الدرس» اللي بيرجع له.

### 2.4 الفيديو — ليه مفيش Transcript

**سلسلة الفيديو:**
```
page.tsx:327  POST /api/lesson/video
  → app/api/lesson/video/route.ts:21  getLessonVideoCandidates(ctx)
    → lib/lesson/video-server.ts:99   سلسلة fallback من ٦ مستويات
      → lib/lesson/youtube-search.ts   YouTube Data API v3 — search.list
```
**اللي بترجعه الـ API:** `snippet` بس — `title`, `channelTitle`, `thumbnails`, `duration`, `publishedAt`. **مفيش `contentDetails`، مفيش `captions`.**

**ليه مفيش Transcript:**
1. **مفيش ملف فيديو عندنا.** الفيديو embed خارجي من يوتيوب. `lectures` هو الجدول الوحيد اللي بيخزّن ملفات، وهو **مش متوصّل** بالدرس.
2. **الـ YouTube Data API مش بيدّي نص الفيديو.** حتى `captions.list` بيرجع `forbidden` على فيديوهات مش مملوكة للمستخدم.
3. **الـ IFrame API** (`getCaptionTracks()`) ممكن يقرا الترجمات — بس **بيحتاج `enablejsapi=1`** (شوف التحفّظ في §1).

**الخلاصة:** Checkpoints مربوطة بالوقت **مش ممكنة من غير ما نضيف مصدر نصّي للدرس** (سواء ترجمة يوتيوب، أو ربط الدرس بمحاضرة المستخدم المرفوعة).

### 2.5 نظام الـ Citations الموجود في المحاضرات ← النموذج اللي هنسخه

اللي اتعمل في `/lectures` **شغّال فعلاً** ومتحقق منه في الداتابيز:

```
lectures.intensive_explanation (jsonb)          ← db/37-lecture-intensive-explanation.sql:66
  └─ parts[] → sections[] → claims[] { text, seg, start }
                                          ↑ seg = فهرس المقطع في transcript_data.segments[]
```

**خطوط الإنتاج (٤):**
1. **استخراج المقاطع** — `lib/ai/lecture-intensive.ts:183` `extractSegments()` → `TimedSegment { index, start, end, text }` من `lectures.transcript_data.segments[]`. مقطع بلا `start` = **غير قابل للاستشهاد** وبنتخطّاه.
2. **التحقق (٤ طبقات)** — `lib/ai/lecture-intensive.ts:446` `validateIntensiveOutput()`:
   - الشكل (schema)
   - `seg` موجود فعلاً في الجزء ده
   - **الاقتباس الحرفي**: `quoteOverlap(quote, segment.text) >= 0.6` بعد تطبيع عربي (`normalizeForMatch`)
   - التوقيت داخل المدة
   - >30% مراجع مرفوضة ⇒ **الجزء كله يفشل** (`PART_INVALID`)
3. **الحفظ** — `lectures.intensive_explanation` بس (مش بيلمس `summary`/`explanation`/`transcript_*`).
4. **العرض** — `components/lectures/LectureIntensive.tsx`:
   - `CitationMark` (سطر 493) — علامة رقم superscript
   - `CitationPeek` (سطر 528) — «Source sheet»: التوقيت + رقم المقطع + شارة **«متحقَّق منه»** + الاقتباس الحرفي + زرّ **«اذهب للمصدر»** + **«نسخ الاقتباس»**
   - `components/lectures/lecture-citation-context.tsx` — `LectureCitationProvider` (activeSeg / hoverSeg / focusSegment) بيربط «الشرح المكثف» بـ«التفريغ» اللي في قسم تاني
   - CSS جاهز: `app/globals.css:1639-1810` (`.citation-mark` / `.citation-peek` / `.citation-quote` / `.citation-verified` / `.citation-sheet*`)
   - **الديسباين**: على الموبايل الـ peek بينزل bottom-sheet بـ `createPortal` (لأن `position:fixed` جوه transform بيتبعتر)

**حالة الداتابيز الحيّة:** ٣٣ محاضرة · ٣٣/٣٣ عندها `transcript_data` · ٢٢/٣٣ عندها `explanation` · **٦/٣٣ عندها `intensive_explanation`** (يعني الميزة شغّالة بس لسه مش منتشرة).

**النمط الجوهري (مش الـ UI):** الموديل **مش بيطلّع توقيت** — بيطلّع `seg` (رقم المقطع) + `quote` (اقتباس حرفي)، والسيرفر **بيثبّت** إن الاقتباس موجود فعلاً في المقطع ده قبل ما يسجّله. ⇒ **الـ citation مش مجرد رقم، ده رقم متحقَّق منه.**

### 2.6 الفجوات اللي بتمنع نقل الـ Citations للدرس

| # | الفجوة | التفصيل |
|---|---|---|
| **G1** | **مفيش رابط بين الدرس والمحاضرة** | `study_days` مالها `lecture_id` (ولا `subject_id`). و`lectures.subject_id` = **NULL** في كل الـ ٣٣ محاضرة ⇒ حتى الربط بالمادة مش شغّال. |
| **G2** | **مفيش Transcript للدرس** | زي §2.4. بلا نص موقوت ⇒ بلا `seg` ⇒ بلا citation على الفيديو. |
| **G3** | **الصفحة client-side بالكامل** | صفحة المحاضرات **Server Component** بتقصّ `transcript_data` على السيرفر (`app/lectures/page.tsx:172`) وبتبعت `segments` بس (مش `words[]` اللي فيها آلاف). الدرس محتاج نفس الحاجة. |
| **G4** | **الـ Chat مش عارف الدرس** 🐞 | `UnifiedChat` بيبعت `lesson: {title, subject, content, description}` (object). السيرفر: `lib/magicly-ai.ts:81` → `shortText(input.lesson)` و`shortText` **بيقبل strings بس** ⇒ `""` ⇒ `FALLBACK_LESSON = "درس غير محدد"`. ⇒ **كل محادثة الدرس بتفتكر إنها في «درس غير محدد».** |
| **G5** | **شاتّين + prompt ميت** | `UnifiedChat` + شات «سؤال وجواب». والشات التاني بيبعت `systemInstruction` — و`/api/chat` **مش بيقراه** (مثبت في تعليق الكود نفسه، سطر 176 و601). |
| **G6** | **مفيش RAG حقيقي** | `match_knowledge` موجود في الداتابيز (125 صف، **كلهم** بـ embeddings) بس **مش متنادى من أي مكان** في `app/`/`lib/`/`components/`، وكل الـ ١٢٥ صف `source_type='sample'` (ويكيبيديا + ملف عيّنة) مش مربوطة بأي درس. |
| **G7** | **الاختبار مش بيخزّن** | `lesson_quiz_cache` موجودة في الداتابيز (مع RLS) بس `app/api/lesson-quiz/route.ts` **مش بيقراها ولا يكتب فيها** — بيتولّد من جديد كل مرة. |
| **G8** | **الـ checkpoints والـ seek** | الـ embed URL مفيهوش `enablejsapi=1` ⇒ مفيش `getCurrentTime()` ولا `seekTo()` ⇒ مفيش «سؤال يظهر أثناء الفيديو» بشكل تلقائي. |

---

## 3. المقترح — تطوير صفحة الدرس

### 3.1 المبدأ: مصدر حقيقة واحد للدرس

NotebookLM قوتة في حاجة واحدة: **إجابة واحدة، من مصدر واحد، مع مرجع تقدر تتحقق منه.**
الدرس عندنا بيفرّق: ٤ أنماط شرح + شاتّين + اختبار + فيديو = **٥ مصادر مختلفة**، ومفيش واحد فيهم متحقَّق منه.

> **المقترح الأساسي:** نخلي لكل درس **«ملف محتوى» واحد** — مصدر مرجعي مُثبت، الشرح بيتولّد منه، والـ citations بتشير ليه، والـ checkpoints بتتوقّع عليه.

```
lesson_content (new, per user_id + day_id)
├─ transcript   jsonb   ← { segments: [{ text, start, end }] }   (اختياري — لو اتوفّر)
├─ explanation  jsonb   ← { sections: [{ heading, claims: [{ text, ref, start, quote }] }] }
├─ checkpoints  jsonb   ← [{ t, question, options[], correctIndex, hint, ref }]
└─ status / generated_at / model / source_video_id
```
> نفس shape الـ `intensive_explanation` → نقدر **ننسخ كود التحقق حرفياً** (`lib/ai/lecture-intensive.ts`) ونعمل generalize بسيط.

### 3.2 الشاشة المقسومة (Split Screen)

**المستهدف:**
```
┌───────────────────────────────────────────────────────────────────┐
│  Hero: العنوان · التقدّم · CTA "ابدأ الدرس"                        │
├──────────────────────────────┬────────────────────────────────────┤
│  الفيديو (يمين، sticky)       │  ★ North Star: الشرح + المراجع     │
│  ┌────────────────────────┐  │  ┌──────────────────────────────┐  │
│  │  16:9 iframe           │  │  │ [اشرح] [مراجع] [نقاط الفحص]  │  │
│  │                        │  │  │                              │  │
│  └────────────────────────┘  │  │ جملة ¹   جملة ²   جملة ³      │  │
│  ⏱ ٠٤:١٢ ▸ نقطة فحص ✦        │  │  └ اقتباس حرفي + ⏱ ٠٤:١٢      │  │
│  ────────────────────────     │  │                              │  │
│  Transcript (بالتوقيت)        │  │  ▸ اسأل عن هذه النقطة          │  │
│  ٠٠:٠٠  ...                   │  └──────────────────────────────┘  │
├──────────────────────────────┴────────────────────────────────────┤
│  شات الدرس (مرتبط بالمصدر + بيرجّع مراجع)                          │
├───────────────────────────────────────────────────────────────────┤
│  الاختبار النهائي (بوابة الإكمال)                                  │
└───────────────────────────────────────────────────────────────────┘
```
- **RTL:** التطبيق كله `dir="rtl"` ⇒ «يمين» = أول عنصر في الـ DOM. فـ الفيديو **يتبقى أول** في الكود.
- **الشاشات الكبيرة (`lg+`):** عمودان `grid-cols-[1fr_minmax(0,420px)]` — الفيديو sticky (`top-*`) والشرح بيتمرّر جنبه.
- **الموبايل:** ركد عادي (فيديو فوق، شرح تحت) — زي الوضع الحالي.
- **توحيد الأقسام:** الـ Hero و breadcrumbs فوق؛ والتقدّم والاختبار تحت. الـ ١٢ قسم المبعثرة بتتجمّع في **٣ أعمدة** واضحة: (١) المصدر — الفيديو + Transcript، (٢) الفهم — الشرح + المراجع، (٣) التقويم — نقاط الفحص + الاختبار.

**اللي بيتغيّر في الـ DOM:** الشكل بس — **مش محتاج أي جدول جديد**، فيمكن نعمله كـ *Pure UI* لو حبينا نجرّب الشكل الأول.

### 3.3 الـ Citations على الدرس

**نفس نظام المحاضرات بالظبط**، مع تعميم التسمية:

| pièce | المحاضرات (موجود) | الدرس (مقترح) |
|---|---|---|
| Provider | `lecture-citation-context.tsx` | نفس الملف، **معمَّم**: `activeRef` / `hoverRef` / `focusRef` |
| العلامة | `CitationMark` | نفس + prop `label` («دقيقة ١٢:٣٠» / «مصدر ٣» / «وصف الدرس») |
| اللوحة | `CitationPeek` | نفس — CSS موجود خلاص في `app/globals.css:1639-1810` |
| التحقق | `validateIntensiveOutput` | نفس الكود — **نقل حرفي** |
| الهدف | `transcript_data.segments[]` | `lesson_content.transcript.segments[]` **أو** `study_days.description` **أو** `resource_links` |

**Reference types المدعومة (Priority):**
1. **`description`** — متاح ٩٨٢/٩٨٢. ⇒ **ممكن نبدأ citations حقيقية من أول يوم** بدون أي بنية تحتية جديدة.
2. **`resource_links`** — فاضي حالياً (٠ صف فيها روابط) ⇒ لازم نبدأ نملاه من المحتوى الحقيقي (PDF/قناة/كتاب).
3. **`transcript`** — محتاج مصدر نصّي (§3.5).

> **أهم نقطة:** كل citation لازم يمرّ بنفس **اقتباس حرفي + تحقق ٠٫٦**. من غير كده هنعمل «أرقام مراجع» زي كتير من المنتجات ——which is exactly the thing the lectures system was built to avoid.

### 3.4 الـ Checkpoints (أسئلة تفاعلية أثناء الفيديو)

**الشكل:**
```
┌─ الفيديو ───────────────────────────────┐
│                                          │
│   ┌────────────────────────────────┐     │
│   │  ✦ نقطة فحص — ٠٤:١٢             │     │  ← overlay فوق الفيديو
│   │  ما الفرق بين الكينيتك الثابت  │     │
│   │  والمتغيّر؟                     │     │
│   │  [أ] ...  [ب] ...               │     │
│   │  ▸ ارجع للمقطع ٠٣:٥٨            │     │
│   └────────────────────────────────┘     │
└──────────────────────────────────────────┘
```

**العقبة الجوهرية:** عشان السؤال يظهر **وقت** ما يوصله الفيديو، لازم نعرف الوقت الحالي ⇒ `enablejsapi=1` + `postMessage`.
- ده بيحتاج **`script-src` widened** بـ `https://www.youtube-nocookie.com` — **ده قرار أمني** (§1، التحفّظ).
- **البديل بدون أي تغيير أمني:** الـ checkpoints تُقاد من **الـ Transcript** (قائمة توقيتات) — الطالب يضغط «٠٤:١٢» فينتقل لـ `watch?v=ID&t=252` في تبويب/صفحة يوتيوب. أقل «سحر»، بس **صفر سطح هجوم جديد**.

**⇒ ده قرار محتاج إجابتك (شوف §5 سؤال ١).**

### 3.5 Transcript — من فين؟ (٣ خيارات)

| # | الخيار | الجودة | الكلفة | ملاحظات |
|---|---|---|---|---|
| **T1** | **ترجمات يوتيوب** عبر `https://www.youtube.com/api/timedtext?type=list&v=ID` (server-side، من غير CSP change) | متوسطة (٥٠-٧٠٪ دقة على المحتوى التقني) | ⚠️ YouTube بيصعّب الـ endpoint ده (محتاج `pot` token أحياناً) ⇒ **محتاج spike** | ✅ مفيش تغيير CSP |
| **T2** | **ربط الدرس بمحاضرة المستخدم المرفوعة** (`lectures.transcript_data`) | **عالية ١٠٠٪** (نفس نظام المحاضرات) | تحتاج `study_days.lecture_id` + UI للاختيار | ✅ **٣٣ محاضرة عندنا تفريغ جاهز** |
| **T3** | **توليد transcript من الوصف** | ضعيفة | رخيص | ❌ citation وهمية — **مش بنصح بيه** |

> **التوصية:** **T2 كمسار أساسي** (مضمون ومتوافق مع نظام الـ Citations الموجود)، و**T1 كتحسين تدريجي** بعد spike.

### 3.6 خطة التنفيذ المقترحة

| Phase | الحجم | المحتوى | اعتماد على بنية تحتية جديدة؟ |
|---|---|---|---|
| **1.1 — الشكل** 🟢 | صغير | Split Screen · الفيديو sticky · ترتيب الأقسام · **إصلاح bug الـ `lesson` context (G4)** · **قرار الشات الواحد (G5)** · تنظيف `systemInstruction` الميت | ❌ لا |
| **1.2 — المصدر + Citations** 🟡 | متوسط | جدول `lesson_content` · توليد وحفظ الشرح · **citations مربوطة بـ `description`** (تعمل من أول يوم) ·Citations UI معمَّم | ✅ نعم |
| **1.3 — Transcript + Checkpoints** 🔴 | كبير | T2 (ربط محاضرة) أو T1 (ترجمات يوتيوب) · `enablejsapi` + **قرار `script-src`** · overlay الـ checkpoints · seek | ✅ نعم + قرار أمني |

**تسلسل مقترح:** 1.1 (شكل + إصلاح الـ bug) → 1.2 (مصدر + citations) → 1.3 (transcript + checkpoints).

### 3.7 المخاطر

| الخطر | الاحتمال | الأثر | التخفيف |
|---|---|---|---|
| توسيع `script-src` لـ YouTube | مؤكد في 1.3 | ⚠️ أمني | القرار لك (§5) · T2 بيغنينا عن T1 جزئيًا |
| توليد الـ checkpoints consumes رصيد | عالي | UX | نولّدها **مرة واحدة** ونخزّنها (مش كل مرة) |
| `_content` جدول جديد على `study_days` | مؤكد | متوسط | `lesson_content` بـ `(user_id, day_id)` unique — **مش** عمود على `study_days` (أقلMIgration) |
| الكلفة على `ai_credit_ledger` | متوسط | متوسط | نولّد الـ explanation **مرة واحدة ونخزّنها** (دلوقتي بيتولّد كل مرة!) |
| خطة صفحات طويلة | عالي | متوسط | Phase 1.2 بيخزّن ويقلّل التوليد المتكرر |
| رجوع `/api/chat` في القفل | مؤكد | متوسط | `lesson_content` + RLS + `service_role` للكتابة |

---

## 4. إيه اللي **مش** مقترح (لحد موافقتك)

- ❌ **مش** هنعمل RAG جديد أو نوصّل `match_knowledge` — الـ ١٢٥ صف seed مش أساس نبني عليه.
- ❌ **مش** هنعمل auto-seek / إيقاف تلقائي للفيديو من غير موافقة على `script-src`.
- ❌ **مش** هنغيّر الـ CSP تاني غير في القرار اللي بتوافق عليه.
- ❌ **مش** هنمسح أي قسم من الدرس في 1.1 — الشكل فقط.

---

## 5. أسئلة محتاجة إجابتك قبل ما نبدأ

| # | السؤال | ليه مهم | توصية |
|---|---|---|---|
| **1** | **نسمح بـ `script-src` لـ `https://www.youtube-nocookie.com`؟** | ده شرط الـ checkpoints التلقائية (نسأل عن `getCurrentTime`/`seekTo`) | **لا** في Phase 1 — نعمل الـ checkpoints بالـ transcript + رابط `&t=` (صفر تغيير أمني)، ونراجع بعدين |
| **2** | **شات واحد ولا اتنين؟** | `UnifiedChat` (كامل: مرفقات/سياق/محادثات) + شات «سؤال وجواب» داخلي — اتنين بيتنافسوا | **واحد**: نحتفظ بـ `UnifiedChat` (أقوى) ونخليها lesson-scoped + citations |
| **3** | **نربط الدرس بمحاضرة المستخدم؟** (T2) | ده أضمن مصدر transcript موجود عندنا فعلاً (٣٣ محاضرة) | **نعم** — `study_days.lecture_id` + اختيار من الواجهة |
| **4** | **نخزّن الـ AI output؟** | دلوقتي بيتولّد كل مرة = رصيد + عدم ثبات | **نعم** — `lesson_content` بـ version، ونعيد التوليد بس لو الطالب طلب أو غيّر `learning_style` |
| **5** | **الـ checkpoints بوابة (لازم يجاوب) ولا اختيارية؟** | بتحدد UX والـ completion logic | **اختيارية** للـ checkpoints (متعلّمة)، وبوابة للاختبار النهائي بس |
| **6** | **نبدأ من 1.1 (شكل + إصلاح bug) ولا 1.2 (مصدر + citations)؟** | 1.1 بيختبر الشكل بتكلفة قليلة؛ 1.2 هو الحقيقي | **1.1 الأول** — تشوف الشكل وتعتمد، وبعدين 1.2 |

---

## 6. ملحق — مراجع الملفات

| الملف | الدور |
|---|---|
| `next.config.ts:45-65` | **الـ CSP** (مكان الـ hotfix) |
| `app/lesson/[dayId]/page.tsx` | صفحة الدرس (١٣٢٥ سطر) |
| `components/lesson/LessonVideoPlayer.tsx` | مشغّل الفيديو |
| `lib/lesson/video-server.ts` | بحث يوتيوب + سلسلة fallback |
| `components/lectures/LectureIntensive.tsx` | **نموذج الـ Citations** (CitationMark + CitationPeek) |
| `components/lectures/lecture-citation-context.tsx` | الـ Provider (نفسه هيتعمَّم) |
| `lib/ai/lecture-intensive.ts` | **منطق التحقق** (هيتنقل حرفي) |
| `lib/ai/lecture-intensive-prompts.ts` | برومبتات الـ parts |
| `app/globals.css:1639-1810` | CSS الـ `.citation-*` (جاهز) |
| `lib/magicly-ai.ts:40-42, 81` | 🐞 `shortText` — سبب «درس غير محدد» |
| `db/37-lecture-intensive-explanation.sql` | مخطط الـ `intensive_explanation` |
| `db/lesson-quiz-cache.sql` | كاش الاختبار (غير مستخدم) |
| `docs/TECH_DEBT.md` | N-008 / N-009 / N-011 (انحرافات معروفة) |

---

**⏸️ بانتظار المراجعة والموافقة قبل أي كود تطوير.**
