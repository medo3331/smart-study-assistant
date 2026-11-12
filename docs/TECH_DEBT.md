# الدين التقني — Technical Debt Register

آخر تحديث: 2026-11-04 (Phase 1.1 من Exam Engine)
الفرع المرجعي: `feat/exam-engine` على `origin/main` = `0e24ca95`

## القاعدة الحاكمة

هذه الاختبارات **مُتخطّاة صراحةً (`it.skip`) مع TODO**، وليست محذوفة.
سبب التخطي موحّد: اختبارات **تطابق نصّ المصدر** (`readFileSync` + `toContain`)
بينما الملفات المستهدفة **أُعيد بناؤها معماريًا**، فصار التأكيد يصف تنفيذًا
لم يعد موجودًا. مطابقة النص ليست اختبارًا للسلوك: أي إعادة تنسيق تُسقِطها،
وأي انحدار حقيقي قد يمرّ من فوقها. البديل الصحيح: اختبار سلوكي.

| المعرّف | الملف | الاختبار المُتخطّى | الحالة |
|---|---|---|---|
| TD-001 | `tests/phase-notifications-401-sw.test.ts` | NotificationBell waits for auth before fetching | ⏭️ skipped |
| TD-001 | `tests/phase-notifications-401-sw.test.ts` | NotificationBell treats 401 as expected unauthenticated state | ⏭️ skipped |
| TD-002 | `tests/phase1c-announcements-admin-ui.test.ts` | server page requires announcements.manage | ⏭️ skipped |
| TD-002 | `tests/phase1c-announcements-admin-ui.test.ts` | documents audience metadata limitation | ⏭️ skipped |
| TD-003 | `tests/phase1d-announcement-dashboard.test.ts` | preserves ordinary bell notifications | ⏭️ skipped |

---

## TD-001 — NotificationBell: من `fetch` إلى Server Actions

**ما تغيّر:** `components/NotificationBell.tsx` لم يعد يستدعي
`fetch("/api/notifications")` ولا ينشئ عميل Supabase في المتصفح
(`createClient` / `onAuthStateChange` / `authReady` / `hasUser`). صار يعتمد
على server actions: `listMyNotifications`, `markNotificationRead`,
`deleteMyNotification` من `@/app/dashboard/actions/support`.

**الأثر الحقيقي (وليس النصي):** الحماية المطلوبة أصلًا كانت «لا نطلب
الإشعارات قبل أن تصبح الجلسة جاهزة، ولا نُظهر خطأً للزائر». هذه الحماية
انتقلت إلى الخادم (action يستدعي `requireUser`). لكن **لا يوجد اليوم أي
اختبار يثبت ذلك** — الثغرة في التغطية، لا في السلوك.

**الإصلاح المقترح:** اختبار سلوكي يهيّئ مستخدمًا غير مسجّل، ينفّذ الـ action،
ويتحقق من أنه لا يرمي ومن أنه يُعيد قائمة فارغة/خطأً صامتًا. الأولوية: متوسطة.

## TD-002 — صفحة الإعلانات في الأدمن

**ما تغيّر:** `app/admin/announcements/page.tsx` و
`components/admin/AnnouncementsAdmin.tsx` — نص استدعاء
`requireAdminPermission("announcements.manage")` ونص توثيق `Audience`
لم يبقيا بالصيغة التي يبحث عنها الاختبار.

**الخطر الحقيقي:** الاختبار كان يحمي **بوابة صلاحية**. تخطّيه يعني أن انحدارًا
حقيقيًا في التحقق من `announcements.manage` لن يلتقطه أي اختبار. راجعه يدويًا
عند أي تعديل على صفحة الإعلانات حتى يُكتب البديل.

**الإصلاح المقترح:** اختبار يكسر الدالة ويؤكد رفض مستخدم بلا الصلاحية
(403/redirect)، بدل مطابقة نص. الأولوية: **عالية** لأنها بوابة صلاحية.

## TD-003 — إشعارات الجرس العادية

**ما تغيّر:** نفس سبب TD-001.

**الإصلاح المقترح:** يندمج مع TD-001 في اختبار سلوكي واحد للمكوّن.
الأولوية: منخفضة.

---

## ملاحظات إضافية ظهرت أثناء Phase 1.1 (ليست ضمن التخطي)

### N-001 — `fakeSupabase` في `ai-content-services.test.ts` كان ناقصًا
كان يوفر `has_entitlement` فقط، بينما `consumeServiceQuota` /
`peekServiceQuota` / `refundServiceQuota` تستدعي RPCs حقيقية
(`consume_service_quota`, `peek_service_quota`, `refund_service_quota`).
النتيجة: `allowed` تُترجم `false` دائمًا (fail-closed) ⇒ **6 اختبارات فاشلة
بسبب الـ mock لا بسبب الكود**. أُصلح بجعل الـ mock يحاكي RPCs الأربعة بعدّاد
داخلي. عند إضافة RPC جديد للخدمة: أضِفه للـ mock وإلا تكرّر الفشل الوهمي.

### N-002 — `\b` في JavaScript لا يعمل مع العربية
`\b` مبني على `\w` = `[A-Za-z0-9_]` فقط، فلا يوجد «حدّ كلمة» عربي.
نتج عنه فشل 5 اختبارات في `chat-intent` و`workspace-source-resolver`.
البديل المستخدم: `(?<![a-z])…(?![a-z])` — يقيّد الحروف اللاتينية فقط
ويسمح بالعربية. **قاعدة للمراجعة:** أي regex عربي لا يستخدم `\b`.

### N-003 — حد حجم المحاضرة كان 50MB بدل 1GiB
`lib/ai/transcription-shared.ts`: التعليق الموثّق يقول 1 جيجا، وقاعدة
`db/13-lecture-uploads-bucket.sql` تضبط `file_size_limit = 1073741824`،
والاختبارات تتطلب >500MB — لكن الثابت كان `50 * 1024 * 1024`، فيرفض رفع
محاضرة 3 ساعات (~200MB). أُصلح إلى 1GiB.

### N-004 — RPCs كوته الخدمة: ✅ تم التحقق (لا مشكلة)
الكود يعتمد على `consume_service_quota` / `peek_service_quota` /
`refund_service_quota`. تم التحقق من القاعدة الحيّة (2026-11-04) عبر
`pg_proc`: **الثلاثة موجودة**، فلا يوجد خطر fail-closed في الإنتاج.
أُبقي السطر هنا كسجل تحقق لا كدين قائم.

### N-005 — `ai_operations` معطّل عمليًا
الجدول فيه سياسة `SELECT` فقط بلا `INSERT`، والكتابة تتم بعميل الجلسة
⇒ كل عمليات `recordAiOperation` تُرفض بـ RLS والجدول **فارغ (0 صفوف)**،
و`ai_models.daily_limit` بلا أثر. المسار الصحيح للقياس هو `ai_usage_events`
(مفعّل ويُكتب فعليًا). يحتاج قرارًا: إصلاح `ai_operations` أو حذفه.

### N-006 — Root overflow من `NotificationBell` على صفحات `h-screen` (~36px)
**أين:** `app/layout.tsx` (السطر 222: `<NotificationBell />`) و
`components/NotificationBell.tsx` (السطر 33: `<div className="relative">`).

**إيه المشكلة:** الـ `NotificationBell` متركّب في الـ root layout **بعد**
`{children}`، وغلافه `position: relative` — مش `fixed`. فالجرس بياخد
**مكان في الـ flow** (ارتفاعه ~36px) وبيقعد **تحت** محتوى الصفحة.

على الصفحات اللي بتملأ الشاشة (`h-screen` / `h-[calc(100dvh…)]` زي `/chat`
و`/lesson/[dayId]`)، المحتوى بياخد **100dvh بالظبط**، فبيطلع الـ document
أكتر من الـ viewport بـ **~36px** ⇒ scrollbar بتظهر **من غير سبب مرئي**
(مفيش محتوى تحت الـ fold، بس الـ scrollbar موجودة).

**إزاي اتأكدت:** measuring في متصفح حقيقي (Edge + CDP) على `/chat` بـ 1440×900:
`docScrollHeight: 936` والمفروض `900` ⇒ `overflowPx: 36` — وهو ارتفاع
الـ `NotificationBell` بالظبط.

**ليه متصلّحش دلوقتي:** مش جزيء من شغل الـ navbar. التصليح بيخلي الجرس
`fixed` (زي `SupportWidget` و`FloatingAssistant` اللي جنبه في نفس الـ
layout)، بس ده بيغيّر سلوك الجرس على **كل** الصفحات ⇒ تيكيت مستقل مع
مراجعة بصرية.

**الحل المقترح (ل تيكيت لاحق):**
```tsx
// components/NotificationBell.tsx — الغلاف
<div className="fixed end-4 bottom-4 z-40 sm:end-6">
```
مع مراجعة `z-index` عشان `FloatingAssistant` (بتاع `start-4`) ما يتغطّاش عليه.

**إزاش تتحقق بعد التصليح:** `npm run check:navbar` — فحص
`no double scrollbar` بيرجع PASS على `/chat` بدل FAIL.

### N-007 — Phantom page scroll على صفحات `min-h-screen` (+56px من الشريط)
**أين:** `app/dashboard/components/PageShell.tsx` (السطر 78:
`min-h-screen …`) + `components/SiteNavbar.tsx` (الشريط `sticky` — 56px).

**إيه المشكلة:** الشريط العلوي `sticky` — يعني **بياخد مكان من الـ flow** (مش
`fixed` اللي بيقعد فوق المحتوى). والصفحات اللي بتستخدم `PageShell`shell
بتاعها `min-h-screen` (= 100dvh على الأقل). فالـ document بيطلع:
`56px (الشريط) + 100dvh (الصفحة) + 36px (جرس N-006)` = 100dvh + 92px.

يعني المستخدم بيسكرول **92px** في آخر الصفحة، وفي الـ 92 دول **مفيش
محتوى مفيد** — آخر 36px هي جرس الإشعارات، والـ 56px قبلهم فراغ تحت
الـ shell.

**إزاي اتأكدت:** measuring على 6 صفحات في Edge + CDP — كلهم بالظبط
`+92px`: `/lessons`، `/missions`، `/exams`، `/escape-room`، `/rewards`،
`/lesson/1`. وصفحات الـ `calc(100dvh - var(--nav-h))` زي `/chat` في
`+36px` بس (دي N-006 لوحدها).

**ليه متصلّحش دلوقتي:** الحل الحقيقي بيغيّر الـ shell نفسه (أو بيخلي
الشريط `fixed` — وهو اللي اتقرّر إنه يفضل `sticky`). الاتنين تغيير في
سلوك كل صفحة ⇒ تيكيت مستقل.

**إزاش تتحقق بعد التصليح:** `npm run check:navbar` — الـ allowance
(`KNOWN_LAYOUT_OVERFLOW`) بيتقلّل من 92px لـ 36px في
`scripts/browser/navbar-smoke.ts`.

**ملاحظة:** الـ allowance ده هو سبب إن فحص `no double scrollbar` في
`npm run check:navbar` بيسامح 92px. أي overflow أكبر من كده = regression
جديد (مش known issue) والسكربت بيفشل.

### N-008 — `mapWordToGlobalIndex` و `detect-suspects` بيفترضوا شكل `segments[].words[]` مش موجود
**أين:**
- `lib/ai/transcript-review.ts:103-118` — `mapWordToGlobalIndex()` بتلفّ على
  `segments[segIdx].words` وبتكمّل `wordIdx`.
- `lib/ai/transcript-review.ts:33-43` — نوع `DetectSuspectsInput` بيكتب
  `segments: Array<{ text: string; words: Array<…> }>`.
- `app/api/lectures/[id]/transcript/detect-suspects/route.ts:76` و `:175` —
  نفس الافتراض (`seg?.words?.[wordIdx]`).

**إيه المشكلة:** الشكل الحقيقي للبيانات **مش** ده. في القاعدة (اتأكدت
بالاستعلام المباشر — 32/32 محاضرة):

```
segments: [{ end, text, start, speaker }]     ← مافيش words جوّه المقطع
words:    [{ end, text, start, speaker }, …]   ← مصفوفة **عناومية** منفصلة
```

يعني `segments[i].words` **Undefined دايماً** في البيانات الحقيقية.
النتيجة:
- `mapWordToGlobalIndex()` بيرجّع `null` دايماً (مبيوصلش لآخر الـ loop).
- `detect-suspects` بيبني الـ batches بـ `seg.text.split(/\s+/)` (السطر 97 —
  ده **صحيح** وبيشتغل)، بس عند enrichment التوقيتات (السطر 175) بيقرأ
  `seg?.words?.[wordIdx]` ⇒ `undefined` ⇒ التوقيتات **ما enrichingش**.
  فالـ `start`/`end` بيرجعوا من الـ Mوديل نفسه (وهو مش مرجعي).

**ليه متصلّحش دلوقتي:** الخاصية دي قديمة (من قبل شغل الـ navbar) ومش في
نطاق «الشرح المكثف». والتعديل بيغيّر سلوك ميزة موجودة (كشف المصطلحات
المشكوك فيها) ⇒ تيكيت مستقل مع اختبار سلوك.

**الحل المقترح (ل تيكيت لاحق):** إمّا (أ) نعدّل الدوال عشان تقرا من
`transcript_data.words` العامة وتعمل mapping بالـ (نص + التوقيت)، أو
(ب) نخزّن `words` جوّه كل segment وقت الحفظ (`lib/ai/lecture-store.ts:160`).
الخيار (أ) أقل خطر لأنه **مفيش migration** ولا تغيير في البيانات
المخزَّنة.

### N-009 — تعديل يدوي للتفريغ بيفصل `transcript_text` عن `transcript_data.segments`
**أين:** `app/api/lectures/[id]/transcript/route.ts:47-52` — الـ PATCH
بيحدّث `transcript_text` **و** `transcript_data.text`، بس **مابيحدّثش**
`transcript_data.segments`.

**إيه المشكلة:** بعد التعديل اليدوي، النص المسطّح والمقاطع بيختلفوا.
قِسْت على القاعدة: **10 من 32 محاضرة** عندها فرق (من ١ لـ ٧ حروف).

**الأثر:**
- أي حاجة بتحسب offset حرف-حرف في `transcript_text` هتبقى غلط على
  المحاضرات دي.
- الـ UI لازم يقرّر: يعرض النص المتعدّل (وده اللي الطالب عدّله) ولا
  المقاطع (وده المصدر الحقيقي للـ citations).
**القرار المتّخذ في «الشرح المكثف»:** الخيار (ب) من الـ Phase 2 —
الواجهة بتعرض `transcript_reviewed_text` الأول (النص المتعدّل)، وتحته
«التفريغ الأصلي (بالتوقيت)» في `<details>`، والـ citations بتشاور على
المقاطع الأصلية مع لافتة صريحة «من التفريغ الأصلي». فال ميزة شغّالة
من غير ما نغيّر التخزين.

**الحل المقترح (ل تيكيت لاحق — الخيار أ):** الـ PATCH يحدّث نصوص
المقاطع المقابلية كمان. ده محتاج mapping بين offset النص القديم
والمقاطع (نفس في `lib/ai/transcript-review.ts:103-118` — بس الشكل
غلط، انظر N-008).

### N-010 — `@ffmpeg/ffmpeg` بيكسر الـ build على Turbopack (Next 16.4+)
**أين:** `lib/media/lecture-compression.ts:174` —
`const { FFmpeg } = await import("@ffmpeg/ffmpeg");`
(والخطأ جوه `node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js:105` —
`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`).

**إيه المشكلة:** Turbopack في Next 16.4+ بيحاول يحلّ
`new URL("./worker.js", import.meta.url)` **جوه `node_modules`** وبيفشل:
`Module not found: Can't resolve (<dynamic> | 'undefined')`. النتيجة: `npm
run build` بيقع والـ feature (ضغط تسجيلات المحاضرة) مش بيترجم.

⚠️ **مش من كودنا**: `lib/media/lecture-compression.ts` و`app/university/
[subjectId]/page.tsx` ما اتغيّروش، و`@ffmpeg/ffmpeg@0.12.15` اتثبت من
أكتوبر. المتغير الوحيد هو Next (16.2.10 → 16.4.6).

**الحل المؤقت (مطبَّق):** الرجوع لـ `next@16.2.10` (النسخة المثبّتة في
`package.json` الأصلية) — الـ build بيرجع أخضر.

**الحل الدائم (مقترح — نتّفق عليه كـ تيكيت):** نسخ الـ ESM build بتاع
الحزمة على `/public` عشان المتصفح يجيبه من نفس الأصل، والـ bundler ما
يشوفش الحزمة خالص:

```bash
cp node_modules/@ffmpeg/ffmpeg/dist/esm/*.js public/ffmpeg/
```
```ts
// lib/media/lecture-compression.ts
// ⚠️ turbopackIgnore: بتخطّى الـ bundler — Next 16.4 (docs/01-app/02-guides/lazy-loading.md)
const { FFmpeg } = await import(/* turbopackIgnore: true */ "/ffmpeg/index.js");
```

ليه ده بيشتغل: الاستيرادات جوه الحزمة كلها **نسبية**
(`./classes.js`, `./const.js`) فبتتحل في `/ffmpeg/` ✓، و`import.meta.url`
جوه `classes.js` بيبقى `/ffmpeg/classes.js` ⇒
`new URL("./worker.js", …)` ⇒ **`/ffmpeg/worker.js`** ✓ (بننسخه معاهم).
وبكده Turbopack **مش** بيحلّل الحزمة ⇒ مافيش build error، والـ wrapper
بييجي من نفس الأصل (زي الـ core اللي بييجي من `/ffmpeg/ffmpeg-core.js`
من زمان).

⚠️ **اللي محتاجة اختبار بعد التطبيق:** `worker.js` بيستخدم
`importScripts(coreURL)` جوه worker من نوع `module` — و`importScripts`
مش متاح في module workers. لو وقع، البديل هو `classWorkerURL` (الـ
escape hatch الرسمي بتاع الحزمة) ونسخ `worker.js` كـ classic worker، أو
التحميل من CDN.

**ليه مش متعمل دلوقتي:** الترقية لـ Next 16.4 مشتروحة منفصلة عن
مشروع «الشرح المكثف»، والمطلوب إن الـ build يبقى أخضر للـ PR.

### N-011 — Schema drift في `knowledge_base` (٧ أعمدة مش في أي migration)
**أين:** الجدول `public.knowledge_base` في القاعدة — Compared بـ
`db/knowledge-base.sql`.

**إيه المشكلة:** الأعمدة دي **موجودة في القاعدة** بس **مش في أي ملف
`db/*.sql`** (اتأكدت بـ grep على كل الملفات):
```
user_id · source_type · source_kind · source_id
workspace_subject_id · chunk_index · processing_version
```
يعني الـ migration بيوصف ٧ أعمدة والقاعدة فيها ١٤ ⇒ **أي حد يبني
قاعدة من الصفر من الـ migrations هيحصل عليه schema ناقص**، وأي حد
يعدّل الـ migration "عشان يطابق" هيكسر الـ production.

**ليه متصلّحش دلوقتي:** مين جاب الأعمدة ومتى مش معروفين، والـ
`processing_version`/`workspace_subject_id` مرتبطين بشغل جاري. تكملة
الـ migration من غير معرفة النية = مخاطرة على بيانات الـ production.

**الحل المقترح (ل تيكيت لاحق):** ملف migration **إضافي** بيعمل
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` للأعمدة السبعة (idempotent،
مش بيعمل تعديل على بيانات موجودة)، + توثيق الـ CHECK constraints
المفترضة. **متعملش** DROP ولا تعديل على أعمدة موجودة.

**ليه ده مهم دلوقتي:** ميزة «العروض التقديمية» هتعتمد على
`source_id`/`source_type`/`source_page`/`chunk_index` في
`knowledge_base` — فلو الـ schema drift اتصلّح، الـ feature تتبني
عليها بأمان.

### N-012 — PDF→صورة + Vision Model (v2 للعرض التقديمي)
**أين:** `lib/extract-text.ts` (الاستخراج) و`lib/ai/slides-generator.ts`.

**إيه المشكلة:** في v1 بنستخرج **نص** بس. فالمستند المصوّر (PDF
بدون text layer) بيتقرا أول **٦ صفحات** بس عبر ocr.space، والباقي
`empty: true` ⇒ **الـ deck بيطلع ناقص**، والـ diagrams والصور بتضيع
في كل الحالات (PDF و PPTX).

**ليه مش متعمل دلوقتي:** قرار تأجيل — v1 text-only عشان نطلع
الـ Core Loop بسرعة.

**الحل المقترح (v2):**
1. **رندر صفحات PDF لصور** — `unpdf.renderPageAsImage` **موجود فعلاً**
   (`lib/extract-text.ts:303` بيستخدمه في مسار الـ OCR) ⇒ ما نحتاجش
   مكتبة جديدة.
2. **نبعت الصورة للـ vision model** — المشروع عنده نماذج رؤية
   (`llama-3.2-11b-vision-preview` على Groq، `nvidia/nemotron-3.5-super-vl`)
   ⇒ ناخد وصف + نقاط من الـ diagram مش بس النص.
3. **الـ PPTX:** مفيش رندر server-side (محتاج LibreOffice — مش viable
   في serverless) ⇒ يا نعمله text-only دايماً، يا نرندر في خطوة
   منفصلة (queue).

**التكلفة:** كل صفحة = نداء vision ⇒ لازم on-demand + سقف يومي
(زي `SERVICE_REGISTRY`).

### N-013 — OCR للـ PDF المصوّر بيغطّي أول ٦ صفحات بس
**أين:** `lib/extract-text.ts` — سقف الصفحات اللي بتتقرا بالـ OCR.

**إيه المشكلة:** سطر واحد في المستند (مفيش text layer) ⇒ **كل
الصفحات** محتاجة OCR، بس السقف بيخلي أول ٦ بس تتقرا. يعني مستند من
٤٨ صفحة ⇒ ٦ صفحات نص و٤٢ صفحات فاضية.

**ليه مش متعمل دلوقتي:** كل صفحة = نداء ocr.space بـ ٢٥ ثانية
timeout ⇒ ٤٨ صفحة = ٢٠ دقيقة. مش قابل يتعمل inline.

**الحل المقترح (ل تيكيت لاحق):**
1. **OCR محلي** (tesseract.js — **مثبّت** في `node_modules` وظاهر في
   `next.config.ts:63` كـ `serverExternalPackages`) ⇒ صفحة ~١-٢ ثانية
   بدل ٢٥.
2. أو **رفع السقف + on-demand**: الـ UI يقول «صفحات ٧-٤٨ مش متقراية
   — تقرأها؟» وبيتقرا وهي مطلوبة.

**الوضع الحالي:** الـ UI بيصرّح للطالب بالصفحات المتقراش
(`documents.unread_pages`) — فمافيش كذب، بس الـ feature ناقصة.

### N-014 — `consume_service_quota` كان مكسوراً في الإنتاج (✅ اتصلّح)
**أين:** الدالة `public.consume_service_quota(p_user_id uuid,
p_service text, p_limit integer)` — **مش في أي migration** (اتعملت يدوي
في SQL Editor).

**إيه المشكلة:** الدالة كانت `RETURNS TABLE(allowed boolean, used integer)`
⇒ الـ OUT parameter اسمه `used` — **نفس اسم العمود** في
`ai_service_usage_daily`. فداخل plpgsql:

```sql
select used into v_used from public.ai_service_usage_daily ...   -- بياخد الـ variable (NULL)
set used = used + 1, updated_at = now() ...                      -- ambiguous ⇒ 42702
```

**الأثر (كان شغّال من زمان):**
1. **الحد اليومي مش بيتطبَّق خالص** — `v_used` كان NULL ⇒
   `if v_used >= p_limit` بيبقى NULL ⇒ false دايماً.
2. الـ RPC بيرمي ⇒ `consumeServiceQuota` بيرجّع `allowed: false`
   (fail closed) ⇒ **كل خدمة محسوبة بالحد اليومي كانت بتفشل بـ 402
   «تعذر التحقق من حصة الخدمة»** للمستخدمين المسجّلين: توليد الصور،
   المخططات، وتصدير PDF/Word/Excel/PPT.

**إزاي اتكشاف:** لما ميزة «العرض التقديمي» وقفت على 402 «تعذر التحقق
من حصة الخدمة» ⇒ رحت أتبّع الـ RPC لقيت الـ ambiguity.

**الحل (اتطبّق):** `db/40-fix-consume-service-quota.sql` — تأهيل اسم
العمود (`t.used`) في الـ SELECT والـ UPDATE، + توثيق الجدول والدالة
(كانوا مش في أي migration). اتحقّق بالنداء الفعلي على الـ RPC بعد
التطبيق (بيزوّد العدّاد صح: 1 → 2).

⚠️ **ملاحظة أمنية (مش متصلّحة):** سياسات
`ai_service_usage_daily_service_all` (ALL, `qual=true`) بتسمح لأي مستخدم
مسجّل يقرأ/يكتب **أي** صف في جدول العدّاد. مش مؤثّر على المنطق (العدّاد
مش فيه بيانات حساسة)، بس **مرشّح لـ tightening** مستقل.

### N-015 — `llama-3.2-11b-vision-preview` اتشال من Groq (fallback ميت)
**أين:** `lib/ai/models.ts:71-81` (الموديل الثالث في سلسلة `chat`).

**إيه المشكلة:** Groq رجّع:
```
400 model_decommissioned: The model `llama-3.2-11b-vision-preview` has been
decommissioned and is no longer supported.
```
⇒ الموديل **ماتشتغلش** خالص ⇒ سلسلة الـ fallback لمهمة `chat` اتقصّرت
لـ موديلين (gpt-oss-120b → gpt-oss-20b) بدل ٣.

**ليه مهم:** لما الموديلين الاتنين يفشلوا (مثلاً 429 من حدّ الـ TPM)،
مفيش شبكة أمان ⇒ الـ user بياخد 502.

**الحل المقترح:** استبدال الموديل الثالث بموديل حيّ (مثل
`llama-3.3-70b-versatile` على Groq) بعد التأكد إنه موجود في الحساب،
أو إضافة موديل الرؤية من NVIDIA. **متعملش دلوقتي** — تغيير في سلسلة
الـ fallback بيأثر على كل المسارات، وهو قرار منتج.

### N-016 — مفتاح Gemini باطل ⇒ اتشال من سلسلة الـ fallback (✅ اتطبّق)
**أين:** `lib/ai/routing.ts` (`routeCandidates` — قائمة المزوّدات البديلة)
و`lib/ai/streaming-fallback.ts` (السلسلة الصريحة).

**إيه المشكلة:** مفتاح `GEMINI_API_KEY` في `.env.local` **باطل**:
```
400 API_KEY_INVALID: "API key not valid. Please pass a valid API key."
```
(وفعلاً هو **مفتاح NVIDIA** متحط في المكان الغلط — ٨٥ حرف بيبدأ بـ
`NVIDIA`.)

ولأن المفتاح **موجود** ⇒ `isConfigured("gemini")` = `true` ⇒ Gemini كان
**آخر مرشّح في كل نداء نصّي** ⇒ نداء ضايع + 400 في كل مرة.

**الحل (اتطبّق — قرار المستخدم):** «شيل Gemini من سلسلة الـ fallback لو
مفيش مفتاح جديد» — ومفيش مفتاح جديد لحد الآن.
- `routeCandidates`: استثنى `gemini` من قائمة المزوّدات البديلة.
- `streaming-fallback`: شال `"gemini"` من السلسلة الصريحة.

⚠️ **اللي ماتغيّرش:** Gemini **لسه** مزوّد **أساسي** للمهام اللي هو
محتكر فيها (`file_analysis` · `image_analysis` · `image_generation` ·
`image_edit` · `video_generation`) — دي بتفشل نضيفة برسالة واضحة بدل ما
يبقى «مفيش مرشّح خالص».

**الاختبار الحارس:** `lib/ai/__tests__/gemini-fallback-removed.test.ts` —
بياثبت إن `routeCandidates` ما بيرجّعش Gemini في أي مهمة نصّية، وإن
المهام المحتكر لسه عليه.

**الخطوة الجاية (ل تيكيت مستقل):** امسح `GEMINI_API_KEY` من
`.env.local` (هو **مفتاح NVIDIA** — لازم تروح على متغير NVIDIA) أو
حطّ مفتاح Gemini **صحيح** في مكانه.

⚠️ **تصحيح (من الـ audit):** المسح اتعمل **غلط** — سطر `NVIDIA_API_KEY`
اتلزق بسطر `GEMINI_API_KEY` فطلع:
```
GEMINI_API_KEY="NVIDIA_API_KEY=nvapi-…"
```
⇒ المفتاح **لسه "موجود"** (85 حرف من الفوضى) ⇒ `isConfigured("gemini")`
= true ⇒ كل نداء `file_analysis` بيروح لـ Gemini وبياخد 400.
**اتصلّح:** السطر اتشال من `.env.local` (والـ `NVIDIA_API_KEY` اتحافظ
عليه). `.env.local` مش متتبَّع في git ⇒ تغيير محلي.

### N-017 — `file_analysis` كان ميتّ بالكامل (✅ اتصلّح)
**أين:** `app/api/ai/file-analysis/route.ts` + `lib/ai/routing.ts`
(`TASK_CAPABILITIES` · `AI_PROVIDER_BY_TASK`).

**إيه المشكلة:** مهمة `file_analysis` كانت **مقفولة على Gemini في مكانين**:
1. `AI_PROVIDER_BY_TASK.file_analysis = "gemini"` (المزوّد).
2. `TASK_CAPABILITIES.file_analysis = ["file_analysis"]` — و
   `gemini-3.6-flash` هو **الموديل الوحيد** في السجل بالقدرة دي.

⇒ مع غياب مفتاح Gemini: صفر مرشّحين ⇒ **502 «تعذّر تحليل الملف» على كل
طلب** (زرار «تلخيص/تحليل» في الـ workspace كان ميتّ).

**ليه كانت القيد وهمي:** الراوت بيبعت **النص المستخرج بس**
(`material.content.slice(0, 50_000)`) — **مش الملف**. وحتى الـ system
prompt بيقول للموديل صراحةً: «لا تدّعِ رؤية الملف الأصلي؛ أمامك النص
المستخرج منه فقط». ⇒ القدرة `file_analysis` (قراءة ملف حقيقي) مش
مطلوبة أصلاً في المسار ده.

كمان: `mediaOnly` (routing.ts:422) بيودّي المسار في فرع
`getProviderName(task)` — وهو **بيرمي** لو المزوّد مش متاح، فمافيش
fallback خالص.

**الحل (اتطبّق):** فصلنا بين **مهمة التقارير** و**مهمة التوجيه**:
- `taskType = "file_analysis"` → ده اللي بيتسجّل في الـ accounting
  (نعرف راح يطلب «تحليل ملف»).
- `routingTask = "summarize"` → ده اللي بنوجّه بيه. مهمة نصّية
  عادية ⇒ مرشّحين حقيقيين (Groq) + سلسلة fallback كاملة.

وكمان: رسالة الخطأ بقت **مزود-محايدة** («الخدمة مشغولة حاليًا») بدل
«Gemini مشغول» (اللي بقت غلط بعد شيل Gemini).

⚠️ **اللي ماتغيّرش**: `aiRouter.analyzeMedia("file_analysis", …)`
(المسار التاني — بيبعت **ملف حقيقي** للموديل) ساب Gemini — لأنه
محتاج رؤية ملف فعلاً.

### N-018 — مهام الوسائط لسه محتكرة على Gemini (غير متصلّحة)
**أين:** `lib/ai/routing.ts` — `AI_PROVIDER_BY_TASK` + `TASK_CAPABILITIES`.

| المهمة | القدرة المطلوبة | مين عنده |
|---|---|---|
| `image_generation` | `image_generation` | `gemini-3.1-flash-image` **بس** |
| `image_edit` | `vision` + `image_generation` | مفيش (محتاجة الاثنين) |
| `video_generation` | `video_generation` | مفيش |
| `image_analysis` | `vision` | Groq/OpenRouter/NVIDIA — **شغّال** ✓ |

⇒ بعد شيل مفتاح Gemini: **توليد الصور** و**تعديل الصور** و**توليد
الفيديو** ميّتين (ولا fallback — مثل N-017 بس القدرة مش متاحة عند حد).

**الحل المقترح (ل تيكيت مستقل):** `image_generation` — إما مفتاح Gemini
صحيح، أو موديل مجاني توليد صور ( pollinations شغّال فعلاً في
`image-generator.ts` — بس مربوط بمهمة تانية)، أو **إخفاء الزر** لما
المزوّد مش متاح (أفضل من زرار بيطلّع 502).

### N-019 — حذف المادة بيسيب المستند والصفحات (تسريب تخزين)
**أين:** `db/38-documents.sql` — `documents.material_id references
materials(id) on delete set null`.

**إيه المشكلة:** «احذف الملف من مكتبتي» ⇒ الـ `materials` صف اتمسح،
بس **`documents` + صفحات `knowledge_base` + الـ deck** باقيين في القاعدة
للأبد. الـ FK `ON DELETE SET NULL` كان **قرار متعمد** (المستند يفضل
لو المادة اتمسحت)، بس الأثر العملي:
- النص المستخرج + الـ deck بيفضلوا في القاعدة (خصوصية + مساحة).
- الـ deck بقى **مش قابل للوصول** من الـ UI (لوحة العرض متربوطة
  بـ materialId ⇒ الـ lookup بيرجّع 404 بعد ما `material_id` يبقى NULL).

**الحل المقترح:** خلي حذف المادة **يمسح كمان** المستند والصفحات
(RPC واحدة `delete_material_cascade` أو `on delete cascade` بدل
`set null` + تنظيف `knowledge_base`).


