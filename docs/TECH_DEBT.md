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


