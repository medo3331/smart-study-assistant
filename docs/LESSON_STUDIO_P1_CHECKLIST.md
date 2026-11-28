# Lesson Studio — P1 Execution Checklist (Unified Workspace)

> **المرجع:** التصميم الكامل في `docs/LESSON_STUDIO_ARCHITECTURE.md` (أرقام الأقسام هنا بترجع له).
> **المستهدف:** أي Agent تنفيذ يشتغل من الملف ده مباشرة من غير أسئلة إضافية.
>
> **حالة التنفيذ:** P1 منفّذ بالكامل، وP2–P6 (AI Teaching Engine) منفّذين كمان على برانش `feat/lesson-studio-p2` — الأوضاع الثلاثة فوق التفريغ · ربط مساحة العمل · P3 (فيديو + محاذاة) · P4 (ملخصات + نوتة في الداتابيز) · P5 (Flashcards + نقاط التحسين) · P6 (مختبر حل المشكلات). الـ migration المجمّعة الوحيدة: `db/119-lesson-studio.sql` (تفاصيلها في §3.2 من التصميم). التفاصيل الكاملة في التقرير النهائي على برانش P2.
> **قواعد صارمة:**
> 1. **ممنوع لمس `next.config.ts`** في P1 (أي diff فيه يترفض — §7.2 من التصميم).
> 2. **ممنوع endpoint جديد** — أولوية الأكشنز جوه `/api/lesson-content`.
> 3. كل نقل كود يكون **محايد** (نفس السلوك) — التطوير بس في المهام المحددة له.
> 4. بعد كل مهمة: `npm run typecheck` + فتح الصفحة فعليًا والتأكد من معيار القبول.
> 5. **G4/G5 متصلّحين فعلًا** (`lib/magicly-ai.ts:54-76` + الشات الداخلي اتشال) — المطلوب اختبار regression بس، مش إعادة إصلاح.

---

## الوضع الابتدائي (verified على الكود الحالي)

- [x] Phase 1.1: `app/lesson/[dayId]/components/` (LessonChrome/Hero/Breadcrumb/ProgressPanel/ModeTabs) موجودة.
- [x] Phase 1.2: `db/46-lesson-content.sql` + `app/api/lesson-content/route.ts` (كاش → توليد → حفظ).
- [x] Phase 1.3 خطوة 3: `db/47-lesson-content-citations.sql` + `lib/lesson/citations.ts` + `LessonCitations.tsx` + `LectureLinkModal.tsx`.
- [x] G4: `shortText()` بيقرا object الدرس.
- [x] G5: شات واحد (`UnifiedChat`) — شات «سؤال وجواب» الداخلي غير موجود في الصفحة.
- [ ] G7: `lesson_quiz_cache` غير مستخدم (`app/api/lesson-quiz/route.ts` بيولّد كل مرة) → **مهمة P1-8**.
- [ ] G8: embed بدون `enablejsapi` → **مقصود يفضل كده — قرار مستخدم مقفول** (§7.1-1).

---

## قرارات المستخدم المقفولة (ملزمة — مش قابلة للإعادة فتح في P1)

| # | القرار | الحكم |
|---|---|---|
| 1 | CSP `script-src` + `enablejsapi` | ✅ **مقبول — مرفوض التوسيع في P1 وP2**: الفيديو بدون JS API، التوقيت عبر `&t=` + transcript فقط. |
| 2 | كتابة الـ AI في النوتة | ✅ **postMessage مباشر**: P1-6 يشمل listener معزول (~20 سطر) في `NotebookEditor.tsx` — نفس الأوريجين فقط. بديل clipboard اتشال نهائيًا. |
| 5 | `StudyTutorWidget` | ✅ **حذف من صفحة الدرس في P1-9.** |

---

## P1-1 — استخراج قسم الاختبار لمكوّن `LessonQuiz`

- **جديد:** `app/lesson/[dayId]/studio/practice/LessonQuiz.tsx`
- **تعديل:** `app/lesson/[dayId]/page.tsx` (يستبدل الكود inline للـ quiz)
- **الشغل:** نقل حرفي — state (quizQuestions/quizLoading/quizStarted/selectedAnswers/quizSubmitted/quizScore/quizAttemptId/completing/justCompleted/showCelebration/coinsWon) + الدوال (handleStartQuiz/handleSelectAnswer/handleSubmitQuiz/handleCompleteLesson) + JSX (سطر ~690-900 من الصفحة) + مودال الاحتفال.
- **Props:** `{ dayId, topic, subject, description, xpReward, isCompleted, onComplete }` — `onComplete` بعد الإكمال عشان الصفحة تحدّث التقدم.
- **للمراجعة:**
  - [ ] `quizAttemptId` بيتنقل مع المكوّن (مش بيفقد).
  - [ ] `POST /api/lesson-quiz` → `/api/lesson-quiz/submit` → `complete_study_day` بنفس الترتيب.
  - [ ] مكافأة الكوينز best-effort (فشلها ما يكسرش الإكمال).
  - [ ] الاحتفال بيرجّع «الدرس اللي بعده» بـ `nextDayId` (ييجي كـ prop).

## P1-2 — نقل `SmartContentViewer` لمكوّن `LearnTab`

- **جديد:** `app/lesson/[dayId]/studio/tabs/LearnTab.tsx`
- **تعديل:** `page.tsx` (حذف التعريف inline سطر 118-565)
- **الشغل:** نقل `SmartContentViewer` + `LinkedCitedView` + `renderMarkdownLite` كما هي + wrapper بيضيف تحته: `SpecializationTools` + قسم الموارد (resource_links + المقترحة + إضافة/حذف رابط).
- **للمراجعة:**
  - [ ] الأوضاع الأربعة (شرح/عملي/مرئي/أكاديمي) بتشتغل وتتخزن.
  - [ ] ربط/فصل/إعادة توليد المحاضرة شغال (`LectureLinkModal`).
  - [ ] الشرح المبني على التفريغ + Citations + `LectureAudioPlayer` شغالين.
  - [ ] ReadAloud + «اعمل عرض من الشرح» شغالين.
  - [ ] إضافة/حذف resource_link بيحدّث `study_days`.

## P1-3 — `LessonStudioProvider` + `StudioShell` + التابات الخمسة

- **جديد:** `studio/LessonStudioProvider.tsx` · `studio/StudioShell.tsx` · `studio/StudioTabs.tsx` · `studio/tabs/{VideoCenterTab,NotesTab,PracticeLabTab,TutorTab}.tsx`
- **تعديل:** `page.tsx` — يبقى data-loading shell + `<LessonStudioProvider>` + `<StudioShell>`.
- **عقد الـ Context:** §2.2 من التصميم — الحقول والـ hooks بالأسماء دي بالظبط.
- **قواعد تخطيط:**
  - Desktop `lg+`: grid — Navigator (يمين، قابل للقفل) | منطقة المحتوى | AI Panel (شمال، docked على `xl+`).
  - Mobile: تابات علوية + Bottom Action Bar + bottom sheets للأدوات.
  - **التابات keep-mounted** (CSS `hidden`) — مش unmount — عشان state مايتمسش.
- **للمراجعة:**
  - [ ] التنقل بين التابات مايفقدش: الشرح المحمّل / المحادثة / الفيديو المختار / الاختبار الجاري.
  - [ ] صفر استدعاء لـ `/api/ai/generate` أو `/api/chat` في الصفحة كلها.
  - [ ] CTA الـ Hero («ابدأ الدرس») بيبدّل لتاب Learn بدل scroll.
  - [ ] locked/not-found/loading states القديمة شغالين (من page.tsx زي ما هي).

## P1-4 — `StudyNavigator` + Smart Resume

- **جديد:** `studio/navigator/StudyNavigator.tsx`
- **تعديل:** `LessonStudioProvider.tsx` (resume + currentSection tracking)
- **الشغل:**
  - استخراج الأقسام: دالة جديدة `extractOutline()` (أنشأها في `lib/lesson/` — تقرا `cited_explanation.sections[].heading` أو `##` headings من markdown الأوضاع، وتتاختبر على الشكلين).
  - تقدّم الأقسام: currentSection من الـ scroll/interaction جوه LearnTab.
  - Smart Resume: **localStorage** key `lesson-resume:<dayId>` = `{ lastTab, lastSectionId, updatedAt }` (debounced 3s). عمود `lesson_content.resume` يتأجل لـ P2.
  - بطاقة «كمّل من حيث وقفت» + نقاط الدرس (بيانات `LessonProgressPanel` الموجودة).
- **للمراجعة:**
  - [ ] إعادة فتح الدرس ⇒ النيڤيجيتر بيرجّع لآخر موضع بزر واحد.
  - [ ] `extractOutline` شغالة على الشرح المربوط (cited) وغير المربوط (markdown).
  - [ ] صفر نداء شبكة إضافي لتتبع التقدم.

## P1-5 — الفيديو مخفي افتراضيًا + `VideoCenter` + التوصيات + Mini Player

- **جديد:** `studio/video/{VideoCenter,VideoRecommendations,MiniVideoPlayer}.tsx`
- **تعديل:** `page.tsx` — بحث الفيديو يبقى **lazy** (يتندى أول فتح لتاب الفيديو أو زر فتح الفيديو، مش على تحميل الصفحة).
- **الشغل:**
  - نفس payload البحث الموجود (subject/lesson/topic/stage/grade/track/faculty/curriculum) — نفس `POST /api/lesson/video`.
  - `VideoRecommendations`: تقسيم client-side للـ `candidates` لـ ٤ أرفف (Best Match / Quick ≤10 دقايق / Deep ≥30 / Practical heuristics) — بدون AI.
  - الفيديو داخل `VideoCenter` بنفس `LessonVideoPlayer` الموجود (candidates + recommended).
  - `MiniVideoPlayer` floating: يظهر لما الطالب يسيب تاب الفيديو والفيديو `open` — **iframe واحد ظاهر في المرة**.
  - روابط التوقيت `&t=` فقط — **بدون enablejsapi**.
- **للمراجعة:**
  - [ ] فتح الصفحة ⇒ **صفر** نداء `/api/lesson/video`.
  - [ ] فتح تاب الفيديو ⇒ skeleton ثم الشغلانة.
  - [ ] Mini Player يظهر ويختفي صح — مفيش صوت مزدوج.
  - [ ] مفيش أي تغيير في `next.config.ts`.

## P1-6 — Notebook Panel + الحقن بالـ postMessage (قرار مقفول #2)

- **جديد:** `studio/tools/{NotebookPanel,AddToNotebookMenu}.tsx`
- **لمسة معتمدة وحيدة:** `components/notes/NotebookEditor.tsx` — listener الـ postMessage (~20 سطر).
- **الشغل:**
  - Panel iframe لـ `/notes` (نفس نمط `NotesSplitPanel` — نفس الأوريجين).
  - `AddToNotebookMenu`: Note (شغّال) / Flashcard / MCQ / Mind Map (**disabled — «جاي قريبًا»**).
  - مسار الإضافة: `queueNotebookDraft({ title, body, source })` ⇒ Preview ⇒ موافقة ⇒ `postMessage(iframe.contentWindow, { type: "magicly:append-note", payload }, same-origin)`.
  - الـ listener في `NotebookEditor.tsx`: يسمع `magicly:append-note` **من نفس الأوريجين فقط** (فحص `event.origin === window.location.origin`) + نوع الحدث + حدود الـ payload — ويتجاهل أي رسالة تانية.
  - Undo: زر بيرجّع آخر إضافة (آخر draft محفوظ في الـ provider لحد إغلاق الـ panel).
  - آخر نوتة للدرس: localStorage `lesson-notes:<dayId>`.
- **للمراجعة:**
  - [ ] فتح/قفل الـ panel مايأثرش على التابات.
  - [ ] Preview بيعرض النص والمصدر قبل الكتابة.
  - [ ] النص بيظهر جوه النوتة فعلًا بعد الموافقة (الحقن شغال).
  - [ ] Undo شغال.
  - [ ] رسالة postMessage من origin تاني أو نوع غير معروف ⇒ **متجاهلة** (تجربة يدوية).
  - [ ] مفيش أي تعديل تاني في `NotebookEditor.tsx` غير الـ listener.

## P1-7 — Tutor Panel المصغّر + سياق القسم

- **تعديل:** `components/unified-ai/UnifiedChat.tsx` (prop `compact?: boolean` جديد) · جديد `studio/tools/TutorPanel.tsx`
- **الشغل:**
  - `compact` يخفي الشريط الجانبي/الرفوف ويضغط الحشوة — بدون تغيير منطق الشات.
  - المحادثة واحدة بين الـ Panel والتاب Tutor (رفع حالة الرسائل للـ provider، أو fallback: نفس المحادثة من `chat_conversations`).
  - `tutorContext()` (§2.4): القسم الحالي + مستوى الشرح + الفيديو المفتوح — تتبعت مع الرسالة الجديدة جوه الـ props الموجودة (`initialContext`) — **بدون تعديل السيرفر**.
- **للمراجعة:**
  - [ ] سؤال «إيه القسم اللي أنا فيه؟» بيرد صح (السياق واصل).
  - [ ] **G4 regression:** المحادثة بتذكر اسم الدرس — مش «درس غير محدد».
  - [ ] **G5 regression:** مفيش أي fetch لـ `/api/chat` في الصفحة (grep).
  - [ ] الرصيد بيظهر من `metadata.balance` زي ما هو.

## P1-8 — إصلاح G7: تفعيل `lesson_quiz_cache` (مستقل — ينفع بالتوازي)

- **تعديل:** `app/api/lesson-quiz/route.ts` فقط.
- **الشغل:**
  1. `content_hash = sha256(topic|subject|description|count|prompt_version="v1")`.
  2. قراية `lesson_quiz_cache` بالـ unique key الموجود (`user_id, day_id, content_hash, prompt_version, language, question_count`) — الجدول جاهز بـ RLS في `db/lesson-quiz-cache.sql`.
  3. hit ⇒ رجّع `{ questions, cached: true }` **من غير حجز كريدت** — (ملاحظة: `attemptId` يفضل `null` في الرد المخزّن أو ننشئ attempt جديد خفيف — الأبسط: الرد المخزّن بيرجع بدون attempt والتصحيح المحلي، وبيتمسك بالـ attempt الحالي لو الطالب ساب الاختبار ونصّه. **القرار الآمن:** أنشئ attempt جديد دايمًا لما الطالب يبدأ اختبار — الكاش بيوفر التوليد بس، مش التسجيل).
  4. miss ⇒ التوليد زي ما هو ⇒ اكتب الكاش best-effort ⇒ كمّل مسار `lesson_quiz_attempts`.
- **للمراجعة:**
  - [ ] طلبان متطابقان ⇒ التاني `cached: true` + مفيش صف جديد في `ai_operations`.
  - [ ] تغيير `count` ⇒ توليد جديد.
  - [ ] فشل كتابة الكاش ما يكسر الرد.

## P1-9 — تنظيف + حذف StudyTutorWidget (قرار مقفول #5) + تحقق نهائي

- **تعديل:** `page.tsx` (يقل < 300 سطر) · **حذف `StudyTutorWidget` من الصفحة** (✅ قرار معتمد — الملف نفسه يفضل موجود).
- **للمراجعة:**
  - [ ] `npm run typecheck` + `npm run lint` نضاف.
  - [ ] grep نهائي: مفيش `enablejsapi` · مفيش `/api/chat` في صفحة الدرس · مفيش تغيير في `next.config.ts` · `StudyTutorWidget` مش مستورد في صفحة الدرس.
  - [ ] الدرس الكامل end-to-end: فتح → Learn → شات → فيديو → نوتة (حقن postMessage) → اختبار → إكمال + XP + كوينز + احتفال → الدرس التالي.
  - [ ] موبايل: تابات علوية + Bottom Action Bar + bottom sheets.

---

## Definition of Done — P1

1. مفيش نداء فيديو عند تحميل الصفحة، ومفيش `/api/chat` خالص.
2. التابات الخمسة + Tutor + Notebook + Navigator شغالين على Desktop وMobile.
3. Resume بيسترجع آخر موضع من غير استعلام AI.
4. G4 + G5 + G7 متحقق منهم باختباراتهم المذكورة فوق.
5. صفر تغييرات في: `next.config.ts` · `/api/unified-ai` · `lib/ai/*`.
6. `NotebookEditor.tsx` ماسمهوش غير لمسة واحدة: listener الـ postMessage (نفس الأوريجين بس) — أي diff تاني في `components/notes/` يترفض.
7. `StudyTutorWidget` مش موجود في صفحة الدرس (قرار مقفول #5).
8. مفيش migration في P1 (عمود `resume`/`outline`/`video`/`summaries`/`checkpoints` كلهم P2+).

## قرارات مقفولة من المستخدم (ملزمة)

1. **CSP/enablejsapi — مرفوض التوسيع في P1 وP2**: الفيديو بدون JS API، التوقيت عبر `&t=` + transcript فقط.
2. **كتابة AI في النوتة — postMessage مباشر**: listener معزول في `NotebookEditor.tsx` (نفس الأوريجين فقط) — ضمن P1-6. بديل clipboard اتشال.
3. (P2+) مستويات الشرح الخمسة كإضافة مع مطابقة قراءة — التوصية القائمة، القرار النهائي وقت P2.
4. (P2/P3+) حفظ الفيديو المختار في `lesson_content.video` — التوصية القائمة، القرار النهائي وقت الطور.
5. **حذف `StudyTutorWidget` من صفحة الدرس — مقبول**: ضمن P1-9.
