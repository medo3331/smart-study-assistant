# Magicly Learning Studio — التصميم المعماري التفصيلي لصفحة الدرس

> **الحالة:** تصميم فقط — مفيش أي تعديل كود. المخرَج companion: `docs/LESSON_STUDIO_P1_CHECKLIST.md`.
> **الأساس:** `LESSON_PAGE_PHASE1_AUDIT.md` + قراءة الكود الفعلي على الفرع ده.
> ⚠️ **ملاحظة حرجة قبل أي حاجة:** التدقيق اتكتب قبل تنفيذ جزء من أطواره. الوضع الفعلي على الكود دلوقتي:
>
> | بند من التدقيق | الحالة الفعلية على الكود |
> |---|---|
> | Phase 1.1 (شكل + LessonChrome) | ✅ **منفّذ** — `app/lesson/[dayId]/components/` موجود بالكامل |
> | G4 (شات مش عارف الدرس) | ✅ **متصلّح** — `lib/magicly-ai.ts:54-76` `shortText()` بيقرا object الدرس |
> | G5 (شاتّين + prompt ميت) | ✅ **متصلّح** — شات «سؤال وجواب» الداخلي اتشال من الصفحة؛ شات واحد بس (`UnifiedChat`) |
> | Phase 1.2 (`lesson_content` + توليد مخزّن) | ✅ **منفّذ** — `db/46-lesson-content.sql` + `app/api/lesson-content/route.ts` (702 سطر: كاش → توليد → حفظ) |
> | Phase 1.3 خطوة 3 (ربط محاضرة T2 + Citations) | ✅ **منفّذ** — `db/47-lesson-content-citations.sql` + `lib/lesson/citations.ts` + `components/lesson/LessonCitations.tsx` + `LectureLinkModal.tsx` |
> | G7 (كاش الاختبار `lesson_quiz_cache` غير مستخدم) | ❌ **لسه مفتوح** — `app/api/lesson-quiz/route.ts` بيولّد كل مرة |
> | G8 (مفيش `enablejsapi` ⇒ مفيش seek/checkpoints موقوتة) | ❌ **لسه مفتوح** — `lib/lesson/video-server.ts:68` embed بدون JS API |
>
> يعني: **المطلوب مش «تنفيذ التدقيق» — المطلوب هو الطبقة اللي فوقه: تحويل الصفحة لـ Learning Studio.**

---

## 0. الرؤية المعتمدة (ملخّص الاتفاق)

صفحة الدرس تتحول من «١٢ قسم مبعثر في عمود واحد» لـ **Learning Studio** بتابات:

| التاب | دوره |
|---|---|
| **Learn** | الشرح الأساسي — مصدر الحقيقة (أوضاع الشرح + الشرح المبني على التفريغ بـ Citations) |
| **Video Center** | الفيديو — **مخفي افتراضيًا** من الشاشة الأساسية، بيتفتح هنا أو كـ Mini Player، مع محرك توصيات |
| **Smart Notes** | النوتة المرتبطة بالدرس (Notebook panel + إضافة محتوى من أي تاب) |
| **Practice Lab** | الاختبار (بوابة الإكمال) + Flashcards — لاحقًا التطبيق العملي |
| **AI Tutor** | الشات الكامل lesson-scoped (نفس UnifiedChat، من غير نسخة تانية) |

**٣ أدوات دائمة في كل التابات:**
1. **Magic AI Tutor** — واعي بالسياق الكامل: المادة، الدرس، القسم الحالي، الفيديو المفتوح وتوقيته، النوتة، مستوى الفهم.
2. **Notebook** — نوتة مرتبطة بالدرس بتفتح كـ panel فوق مساحة العمل، والـ AI يكتب جواها بـ Preview + Undo.
3. **Study Navigator** — أقسام الدرس + تقدّم الطالب + Smart Resume.

**مسار المحتوى:** مصدر الطالب (محاضرة مرفوعة / PDF) هو المرجع الأساسي — مسار T2 من التدقيق هو الأضمن (تفريغ متحقق منه).

**Roadmap:** P1 Unified Workspace → P2 AI Teaching Engine → P3 YouTube Intelligence → P4 Summaries & Notebook → P5 Practice & Assessment → P6 Subject Labs.

---

## 1. نظرة معمارية عامة

### 1.1 مناطق الشاشة (Desktop ≥ lg)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Studio Header: Breadcrumb · عنوان الدرس · CTA (ابدأ/تابع/راجع) · XP     │
│ شريط تقدّم الوحدة (LessonUnitProgress الموجود)                          │
├──────────┬─────────────────────────────────────────────┬───────────────┤
│          │  Studio Tabs: Learn | Video | Notes |       │  AI Panel     │
│ Study    │  Practice | Tutor                           │  (Magic AI    │
│ Navigator│─────────────────────────────────────────────│  Tutor)       │
│ (قابل    │                                             │  docked على   │
│ للفتح/   │   منطقة المحتوى — التاب النشط               │  xl+          │
│ للقفل)   │   (أكبر منطقة — هي «الأرض» مش الجانب)       │  Floating     │
│ ~240px   │                                             │  button على   │
│          │                                             │  الأصغر       │
├──────────┴─────────────────────────────────────────────┴───────────────┤
│ Notebook Panel (اختياري — بيتفتح فوق مساحة العمل، ارتفاع ~45%)          │
├────────────────────────────────────────────────────────────────────────┤
│ Floating Mini Player (اختياري — لو الطالب فتح فيديو وبقى بيتنقل         │
│ بين التابات) + Bottom Action Bar (الموبايل بس)                          │
└────────────────────────────────────────────────────────────────────────┘
```

قواعد التخطيط:

- **RTL:** التطبيق كله `dir="rtl"` — الـ Navigator أول عنصر في الـ DOM (يمين)، بعدُ منطقة المحتوى، وبعدها الـ AI Panel (شمال).
- **Desktop:** `grid-cols-[240px_1fr_320px]` لما الـ Navigator والـ AI Panel الاتنين مفتوحين؛ كل واحد منهما قابل للقفل والمنطقة الوسطى بتتمدد. الـ Navigator بيفتح افتراضيًا على `xl+` وبيقفل على `lg`.
- **الفيديو:** مش قالب ثابت — داخل تاب Video Center، أو Mini Player floating (نفس الـ iframe embed، بحجم مصغّر) لما الطالب يتنقل لتاب تاني وهو بيتفرج. **بدون `enablejsapi`** (شوف §7 قرار 1).
- **Notebook:** panel أفقي فوق منطقة المحتوى (زي نمط `NotesSplitPanel` الحالي بـ iframe same-origin) — مش صفحة منفصلة.

### 1.2 موبايل (< lg)

- **تابات علوية** (scrollable أفقيًا) تحت الـ Header.
- **Bottom Action Bar** ثابت: ٥ أيقونات = التابات الخمسة + زر AI عائم فوقه.
- أي أداة مساعدة (Citation Peek، معاينة «أضف للنوتة»، Video Recommendations) بتظهر كـ **bottom sheet** — نفس نمط الـ `CitationPeek` اللي بينزل bottom-sheet على الموبايل بـ `createPortal` (الموجود في `components/lectures/LectureIntensive.tsx:528` والـ CSS في `app/globals.css:1639-1810`).
- الـ Navigator بيفتح كـ drawer من اليمين.

### 1.3 Component Tree (أعلى مستويين)

الهيكل المقترح: مجلد `studio/` جوه مجلد الصفحة الحالي — مايلزمش نقل أي حاجة خارج `app/lesson/[dayId]/`.

```
app/lesson/[dayId]/
├── page.tsx                      ← يتقلّص: data-loading shell بس (درس + مادة + بروفايل + تقدم)
│                                    + يركّب <LessonStudioProvider> و <StudioShell>
├── layout.tsx                    ← زي ما هو
├── components/                   ← زي ما هي (LessonChrome / LessonHero / … — هتتقالاد)
└── studio/                       ← ★ جديد — كل الـ Studio هنا
    ├── LessonStudioProvider.tsx      ← Context الوحيد (§2)
    ├── StudioShell.tsx               ← التخطيط: Header + grid (Navigator|Tabs|AI) + panels
    ├── StudioTabs.tsx                ← شريط التابات (علوي Desktop / موبايل) + Bottom Action Bar
    ├── navigator/
    │   └── StudyNavigator.tsx        ← أقسام الدرس + التقدم + Smart Resume + نقاط الدخول
    ├── tabs/
    │   ├── LearnTab.tsx              ← يلفّ SmartContentViewer المنقول من page.tsx (§6 م1)
    │   ├── VideoCenterTab.tsx        ← VideoCenter + VideoRecommendations
    │   ├── NotesTab.tsx              ← بوابة النوتة المرتبطة بالدرس (يفتح الـ Panel)
    │   ├── PracticeLabTab.tsx        ← يلفّ قسم الاختبار الحالي (inline في page.tsx:1318-1462)
    │   └── TutorTab.tsx              ← UnifiedChat بحجم كامل
    ├── tools/
    │   ├── TutorPanel.tsx            ← UnifiedChat بحجم مصغّر (نفس المكوّن — prop size/compact)
    │   ├── NotebookPanel.tsx         ← panel الـ Notebook (iframe نفس الأوريجين زي NotesSplitPanel)
    │   └── AddToNotebookMenu.tsx     ← قائمة «حوّل لـ»: Note / Flashcard / MCQ (P4/P5 stubs في P1)
    ├── video/
    │   ├── VideoCenter.tsx           ← يستضيف LessonVideoPlayer الموجود + اختيار candidates
    │   ├── VideoRecommendations.tsx  ← طبقة التوصيات (Best Match / Quick / Deep / Practical)
    │   └── MiniVideoPlayer.tsx       ← نسخة floating مصغّرة (نفس embedUrl)
    └── practice/
        └── LessonQuiz.tsx            ← منطق الاختبار المنقول من page.tsx (سطر ~690-900) كما هو
```

### 1.4 إيه اللي يتعادة استخدام وإيه اللي يتبني

| المكوّن | الحالة | القرار |
|---|---|---|
| `LessonShell` / `GlassCard` / `Reveal` — `app/lesson/[dayId]/components/LessonChrome.tsx` | موجود | ✅ إعادة استخدام — هوية الصفحة البصرية |
| `LessonBreadcrumb` + `LessonUnitProgress` — `components/LessonBreadcrumb.tsx` | موجود | ✅ إعادة استخدام في الـ Studio Header |
| `LessonHero` | موجود | ✅ إعادة استخدام (يتلخّص: CTA يبدّل تاب بدل scroll) |
| `LessonProgressPanel` | موجود | ⚠️ يتدمج في `StudyNavigator` (الـ Navigator هو ورثته) |
| `SmartContentViewer` — inline في `page.tsx:118-565` | موجود (inline) | 🔄 **ينقل** كوحدة لـ `studio/tabs/LearnTab.tsx` من غير تغيير منطق — هو فعليًا قلب تاب Learn |
| `LessonCitations.tsx` (`LessonCitedExplanationView`) | موجود | ✅ إعادة استخدام جوه LearnTab |
| `LectureLinkModal` + `lib/lesson/citations.ts` | موجود | ✅ إعادة استخدام — عقود الربط جاهزة (§4.3) |
| `lecture-citation-context.tsx` (`LectureCitationProvider`) | موجود | ✅ إعادة استخدام — الـ Studio بيلفّه زي ما هو |
| CSS `.citation-*` — `app/globals.css:1639-1810` | موجود | ✅ زي ما هو |
| `LessonVideoPlayer` | موجود | ✅ إعادة استخدام جوه `VideoCenter` (بياخد candidates + recommended) |
| `lib/lesson/video-server.ts` (fallback chain من ٦ مستويات + كاش ٣٠ دقيقة) | موجود | ✅ إعادة استخدام — طبقة التوصيات بتشتغل **فوق** مخرجه (§4.2) |
| `UnifiedChat` (`components/unified-ai/UnifiedChat.tsx`, 1069 سطر) | موجود | ✅ إعادة استخدام في المكانين (تاب Tutor + Panel مصغّر) — بـ prop `compact` جديد بسيط |
| قسم الاختبار inline في `page.tsx` | موجود | 🔄 **ينقل** لـ `studio/practice/LessonQuiz.tsx` من غير تغيير منطق التصحيح (`lesson_quiz_attempts` + `/api/lesson-quiz/submit`) |
| `SpecializationTools` / `MedicalTools` | موجود | ✅ يتحطوا في تاب Learn أسفل الشرح (slot موجود) |
| `NotesSplitPanel` / `OpenNotesBeside` — `components/notes/` | موجود | ⚠️ إعادة استخدام النمط (iframe same-origin) — الـ Panel الجديد بيلف نفس `/notes` |
| `NotebookEditor` (2648 سطر — IndexedDB `magicly-notes`) | موجود | ✅ **مالناش لمسة** — النوتة بتتفتح عبر الـ iframe القائم (§4.4) |
| `StudyTutorWidget` | موجود | ❌ يتشال من الصفحة — وظيفته بتبقى للـ Tutor الموحد (كان عنصر مبعثر خامس) |
| `feedback` / celebration / resources | موجود | ✅ زي ما هي (Resources تروح لتاب Learn كقسم مطوي) |

---

## 2. نموذج الحالة والسياق (Context Model)

### 2.1 المبدأ

Provider واحد `LessonStudioProvider` بيمسك حالة الـ Studio كلها، وبيتغذى من data-loading بتاع `page.tsx`. أي تاب أو أداة بتقرا/تكتب عبر hooks — مفيش props drilling ومفيش state مكرر. ده نفس نمط `LectureCitationProvider` المجرّب في المحاضرات (`components/lectures/lecture-citation-context.tsx`) بس أوسع، والاتنين يعيشوا مع بعض (الـ Citation provider جوه LearnTab تحت الـ Studio provider).

### 2.2 شكل الـ Context

```ts
// studio/LessonStudioProvider.tsx

type StudioTab = "learn" | "video" | "notes" | "practice" | "tutor";

type LessonStudioContextValue = {
  // ── الدرس (static خلال الزيارة — من page.tsx) ──
  lesson: {
    dayId: string;
    topic: string;
    title: string;
    description: string;
    subject: string;
    category: string;
    learningStyle: "practical" | "visual" | "academic";
    xpReward: number;
    isCompleted: boolean;
    dayNumber: number;
  };
  // ── التنقل ──
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;
  navigatorOpen: boolean;
  toggleNavigator: () => void;
  // ── القسم الحالي (داخل الشرح — من headings الشرح المخزّن) ──
  currentSectionId: string | null;
  setCurrentSectionId: (id: string | null) => void;
  // ── الفيديو (مخفي افتراضيًا) ──
  video: {
    open: boolean;                       // ← الفيديو مقفول افتراضيًا
    active: VideoCandidate | null;       // الفيديو المختار من الـ candidates
    candidates: VideoCandidate[];
    loading: boolean;
    miniPlayerOn: boolean;               // لو الطالب ساب التاب وهو شغّال
    lastTimestamp: number | null;        // آخر توقيت معروف (من URL &t= — بدون enablejsapi)
  };
  openVideo: (candidate?: VideoCandidate) => void;
  closeVideo: () => void;
  // ── النوتة ──
  notebook: {
    open: boolean;
    pendingDraft: { title: string; body: string; source: string } | null;
    // pendingDraft = محتوى «جاهز للإضافة» — بيعدي على Preview + Undo قبل الكتابة
  };
  openNotebook: (draft?: NotebookDraft) => void;
  closeNotebook: () => void;
  queueNotebookDraft: (draft: NotebookDraft) => void;
  // ── مستوى الشرح ──
  explanationLevel: ExplanationLevel;    // simplified/standard/deep_dive/practical/exam_focus
  setExplanationLevel: (level: ExplanationLevel) => void;
  // ── التقدم والـ Resume ──
  progress: {
    lastTab: StudioTab | null;
    lastSectionId: string | null;
    lastVideoId: string | null;
    updatedAt: string | null;
  };
  saveResume: () => void;                // debounced — يكتب في lesson_content.resume
  // ── سياق الـ Tutor (اللي بيتبعت للشات) ──
  tutorContext: () => TutorContextPayload; // دالة مش قيمة — تُقرأ لحظة الإرسال
};
```

### 2.3 الـ hooks العامة

| Hook | بيترجّع | بيستخدمه |
|---|---|---|
| `useLessonStudio()` | الـ context كله | الشل والـ Navigator |
| `useStudioTab(tab)` | `{ isActive, open, close }` | أي تاب |
| `useTutorContext()` | `tutorContext()` | UnifiedChat (قبل الإرسال) |
| `useNotebook()` | `{ open, close, queueDraft, pendingDraft }` | أزرار «أضف للنوتة» في أي مكان |
| `useStudioVideo()` | حالة الفيديو + open/close | VideoCenter + MiniPlayer + LearnTab |
| `useStudioResume()` | `progress` + `saveResume` | Navigator + StudioShell |

### 2.4 بناء سياق الـ Tutor

`tutorContext()` بيجمع لحظة الإرسال:

```
{
  lesson: { title, subject, content: currentSectionText ?? description, description },
  // ↑ نفس شكل LessonContext الموجود في UnifiedChat.tsx:75-79 —
  //   يعني السيرفر (/api/unified-ai → lib/magicly-ai.ts) مايتغيرش في P1.
  extraContext: [
    "القسم الحالي: {currentSectionId/heading}",
    "مستوى الشرح المختار: {explanationLevel}",
    "الفيديو المفتوح: {video.active.title} عند التوقيت {lastTimestamp}" // لو مفتوح
    "النوتة: آخر {N} سطر من النوتة المرتبطة (لو مفتوحة وموافقة الطالب)"
  ].filter(Boolean).join("\n"),
}
```

- الإرسال من خلال الـ props الموجودة: `UnifiedChat` بياخد `initialContext` و`lesson` — هنعمل **prop جديد واحد** `studioContext?: string` يتبعت جوه `initialContext.preferences` أو كمرفق نصي قصير في أول رسالة — **بدون تعديل عقد السيرفر** في P1.
- ⚠️ مستوى الفهم: مفيش مصدر بيانات له لسه — في P1 بنبعت `learning_style` + `explanationLevel` كبديل صادق، ومستوى الفهم المحسوب ييجي مع P2 (AI Teaching Engine).

### 2.5 الكتابة في الحالة والاستمرارية

- الحالة كله in-memory React — **مفيش global store جديد** (مش هنضيف zustand/redux).
- الاستمرارية بتحصل في نقطتين بس: `saveResume()` (debounced 3 ثواني — يكتب `lesson_content.resume`) و`video.active` (يكتب `lesson_content.video` عند الاختيار — §3).

---

## 3. مصدر الحقيقة والبيانات

### 3.1 الوضع الحالي

`lesson_content` موجود فعلًا (`db/46` + `db/47`):

```
lesson_content (PK: user_id + day_id)
├─ explanation        jsonb  ← { simple, academic, visual, practical } (markdown لكل وضع)
├─ cited_explanation  jsonb  ← { sections: [{ heading, claims: [{ text, seg, start, quote }] }] }
├─ summary            text
├─ questions          jsonb
├─ transcript         jsonb  ← { segments: [{ index, text, start, end }] } (من المحاضرة المرتبطة)
├─ source_lecture_id  uuid   ← ربط المحاضرة (مسار T2)
├─ status / model / version / generated_at / updated_at
└─ RLS owner-only (select/insert/update/delete بـ auth.uid())
```

### 3.2 التطوير المقترح — `lesson_content` v2 (migration واحد جديد: `db/48-lesson-studio.sql`)

> **⚠️ محدَّث في P2 — طريقة الشرح الجديدة (قرار المستخدم):** بدل خطة المستويات الخمسة
> (`simplified / standard / deep_dive / practical / exam_focus`)، الشرح بقى بـ **٣ أوضاع معتمدة
> من المستخدم** — `general` (شرح عام) / `summary` (شرح تلخيصي) / `detailed` (شرح تفصيلي).
> الأوضاع دي مفاتيح نصية جوّه `explanation` jsonb **بدون أي migration**، وإعادة التوليد
> («أعد الشرح») بتحفظ **إصدارًا جديدًا** — القديم بيتنفد لقائمة تحت `<mode>__versions`
> (مش بيتمسح بدون تأكيد). العقود في `lib/lesson/explanations.ts`، والتوليد جوه
> `/api/lesson-content` نفسه (مفيش endpoint جديد).
>
> **الأوضاع الثلاثة فوق التفريغ (P2 — قرار المستخدم):** لما الدرس مربوط بمحاضرة عندها تفريغ،
> التفريغ (cited) بيبقى **المصدر الأساسي** والأوضاع الثلاثة بتشتغل **فوقه**:
>   • `summary` (تلخيصي) — **derivation نصي بدون AI** من الشرح الم citied (`deriveSummaryFromCited`
>     في `lib/lesson/cited-derive.ts`)، بيخزّن جوه `explanation.summary`.
>   • `general` / `detailed` — توليد AI محكم بالاقتباس فوق نفس التفريغ (`buildCitedMessages`
>     بـ `modeHint` من `CITED_MODE_HINTS` + نفس تحقّق `parseCitedExplanation`) — بيخزّنوا كائنات
>     cited تحت `explanation.<mode>__cited` وإصداراتهم تحت `<mode>__cited__versions`.
>   • الـ badge في تاب Learn يوضّح «من التفريغ المرتبط» — والمراجع (seg + quote) محفوظة في
>     كل الأوضاع فوق التفريغ.
>
> **مصادر الدرس (P2):** GET `/api/lesson-content` بيرجّع `workspaceFiles` — ملفات مساحة العمل
> (جدول `files`) اللي `subject` بتاعها يطابق مادة الدرس بعد التطبيع العربي (`subjectMatches`) —
> معروضة في قسم «مصادر الدرس» في تاب Learn جنب المحاضرة المرتبطة، والفتح عبر `POST /api/files`
> الموجود (رابط قراءة موقّع). ربط خفيف بدون migration وبدون تكرار UI مساحة العمل.
>
> الأوضاع القديمة الأربعة (`simple/academic/visual/practical`) لسه صالحة ومتخزّنة، والقراءة بتقبل الاتنين.

نضيف أعمدة على **نفس الجدول** (مش جدول جديد — التدقيق أسس ده صح):

```sql
-- db/48-lesson-studio.sql (اقتراح — ينفّذ في P2/P3 حسب الطور، مش في P1)
alter table public.lesson_content
  -- أقسام الدرس (outline) — مصدر الـ Study Navigator وربط topics بالفيديو
  add column if not exists outline jsonb,
  -- [{ id, title, level_key, video_t (ثوانٍ | null), summary }]
  -- نقاط دخول النيڤيجيشن + checkpoints تتعلى منها

  -- Checkpoints (أسئلة القسم — اختيارية مش بوابة)
  add column if not exists checkpoints jsonb,
  -- [{ section_id, question, options[], correct_index, hint, ref_seg }]

  -- الملخصات بأشكالها (P4)
  add column if not exists summaries jsonb,
  -- { quick, detailed, academic, exam_revision } — كل شكل يولّد ويخزّن مرة

  -- الفيديو المختار — عشان مايتبحثش كل مرة (الكاش الحالي in-memory بس!)
  add column if not exists video jsonb,
  -- { video_id, title, channel, kind: "best|quick|deep|practical", picked_at }

  -- Smart Resume
  add column if not exists resume jsonb;
  -- { last_tab, last_section_id, last_video_id, last_video_t, updated_at }
```

**مستويات الشرح الخمسة** (Simplified / Standard / Deep Dive / Practical / Exam Focus): بتتجوا جوه `explanation` كمفاتيح إضافية `{ simplified, standard, deep_dive, practical, exam_focus }` مع **مطابقة ترحيل** من المفاتيح الحالية (`simple→simplified`, `academic→standard`, `visual→standard`) — المفاتيح القديمة ما تتمسحش، والقراءة بتقبل الاتنين. التنفيذ الفعلي للمستويين الجداد (deep_dive/exam_focus) في **P2** — P1 بيشتغل بالموجود.

**ربط topics بتوقيت الفيديو:** بيعتمد على `transcript` (المحفوظ من المحاضرة المرتبطة — T2). المحاذاة بتحصل في P3 (YouTube Intelligence): مقارنة نص الـ topic بعناوين المقاطع بعد التطبيع العربي (`normalizeForMatch` الموجود في `lib/ai/lecture-intensive.ts`) ⇒ `video_t`. **قبل** فيه transcript، الـ Navigator بيعرض الأقسام من `explanation` headings بس بدون توقيت — مش بيعطل حاجة.

**ربط اختياري بـ lecture_id:** موجود فعلًا (`source_lecture_id`) — التدقيق اسمه T2 وهو **أضمن مصدر transcript** (٣٣ محاضرة عندها `transcript_data`). مسار الربط UI جاهز (`LectureLinkModal`).

### 3.3 سياسة التوليد والتخزين

| المبدأ | التفصيل |
|---|---|
| **ولّد مرة واحدة وخزّن** | نفس عقود `/api/lesson-content` الحالية (كاش → توليد → حفظ) بتتعمم على أي محتوى جديد (ملخصات/checkpoints). ممنوع أي مسار «توليد لحظي غير مخزّن» جديد. |
| **إعادة التوليد عند الطلب فقط** | زر «أعد التوليد» الموجود (`force=true`) — وزر واحد للدرس كله، مش لكل جزء. |
| **الفشل best-effort** | نفس فلسفة الراوت الحالي: فشل الحفظ ما يكسرش الشاشة (الكاش المحلي بيغطي الزيارة). |
| **RLS** | نفس النمط: owner-only على كل الأعمدة الجديدة (الأعمدة بتورّث RLS الجدول تلقائيًا — مفيش policies إضافية). |
| **`lesson_quiz_cache` (G7)** | الجدول موجود مع RLS وunique index (`db/lesson-quiz-cache.sql`) بس مش متنادى. الإصلاح: `/api/lesson-quiz` يحسب `content_hash` من `sha256(topic + subject + description + mode-content-length)`، يقرا الكاش الأول، ولّد بس لو مفيش صف — ويكتب بعد التوليد. (تفاصيل في §4.5). |

---

## 4. عقود الربط (Integration Contracts)

### 4.1 AI Tutor — شات واحد بس، lesson-scoped

| البند | العقد |
|---|---|
| **المكوّن** | `UnifiedChat` واحد — في مكانين بحجمين (تاب كامل + Panel جانبي مصغّر)، **نفس الحالة نفس المحادثة** (المحادثة بتعيش في الـ provider، مش في المكوّن — التفصيل في §6 م4). |
| **G4** | ✅ متصلّح (`lib/magicly-ai.ts:54-76` بيقرا object الدرس). إلزامي في P1: regression test يثبت إن `shortText({title, subject, content})` بيرجّع العنوان مش `""`. |
| **G5** | ✅ متصلّح (شات «سؤال وجواب» اتشال). إلزامي في P1: إن الصفحة ما تعملش أي استدعاء تاني لـ `/api/chat`. |
| **الإدخال** | نفس الـ props الحالية + `studioContext` (§2.4). السيرفر `/api/unified-ai` مايتغيرش في P1. |
| **الممنوع** | أي endpoint شات جديد. أي systemInstruction من الكلاينت (متروكل — السيرفر هو اللي بيبنى الـ prompt). |

### 4.2 YouTube — video-server الحالي + طبقة توصيات + توقيت

> **⚠️ محدَّث في P2 — مطلب «الفيديوهات المرتبطة فعلًا»:**
> 1. **بحث يدوي:** input في `VideoCenter` بيبعت كلمات الطالب كما هي لـ
>    `POST /api/lesson/video` بحقل `query` (نفس الراوت — مفيش endpoint جديد).
>    مسار البحث اليدوي بيتفلتر ضد الفوضى (ترفيه/مدة) بس — **من غير بوابة الصلة**،
>    لأن كلام الطالب هو المرجع.
> 2. **اقتراح AI واعي:** `buildYouTubeQuery` بتبني الاستعلام من **المادة + الموضوع
>    الاتنين** (كانت واحدة بدل التانية — مصدر الاقتراحات العامة) + سياق الـ profile
>    (stage/grade/track) الموجود فعلًا في الصفحة.
> 3. **بوابة الصلة (relevance gate):** قبل عرض أي ترشيح من اقتراحات الـ AI،
>    `filterRelevantVideos` (`lib/lesson/video-relevance.ts`) بتحسب الصلة بين
>    (العنوان + الوصف) و(موضوع الدرس + المادة) بعد التطبيع العربي
>    (`normalizeForMatch`). القاعدة: المفردة الأساسية للموضوع لازم تظهر **أو**
>    تداخل واضح (كلمتين من الموضوع **أو** كلمة موضوع + كلمة مادة). اللي فشل
>    **بيتشال من العرض تمامًا** — البوابة مطبّقة على السيرفر على كل مستويات
>    الـ fallback chain (بما فيها الـ hardcoded) وقبل الكاش. مفيش خط AI إضافي —
>    الـ heuristic النصّي كافي ومتاختبر في `lib/lesson/__tests__/video-relevance.test.ts`.
> 4. **شفافية:** كل ترشيح عليه «ليه اتيرشح» (نص `reason` المولّد من البوابة) +
>    زر «مش مناسب» بيشيل الترشيح من العرض في الجلسة الحالية.
>
> **⚠️ محدَّث في P3 — YouTube Intelligence:**
> 5. **حفظ الفيديو المختار:** أول تشغيل لأي فيديو ⇒ `POST /api/lesson-content`
>    بـ `action: "set_video"` يخزّنه في `lesson_content.video` (jsonb — migration
>    مجمّعة واحدة `db/50-lesson-studio.sql`، الرقم اتحرّك من 48 لأنه متاخد).
>    `ensureVideoLoaded` لو لقى فيديو محفوظ ⇒ **skip البحث تمامًا** — والطالب
>    يقدر يدوّر يدويًا في أي وقت (البحث اليدوي بيحفظ برضه عند التشغيل).
> 6. **محاذاة الأقسام بتوقيت الفيديو:** GET `/api/lesson-content` بيرجّع
>    `videoTByHeading` — كل عنوان قسم من الشرح بيتطابق مع مقاطع التفريغ
>    (`alignHeadingsToTranscript` في `lib/lesson/video-align.ts`، عتبة 0.5 بعد
>    التطبيع العربي). اللي مالوش تطابق كافي بيرجع `null` بصدق.
> 7. **تنقل قسم↔فيديو (بدون enablejsapi):** من الـ Navigator زر ⏱ بجانب القسم
>    المتحاذى بيفتح `watchUrl + &t=<seconds>` في تاب جديد؛ ومن مركز الفيديو
>    قفزة من الفيديو للقسم في تاب الشرح (scroll للـ anchor).

| البند | العقد |
|---|---|
| **المصدر** | `POST /api/lesson/video` → `getLessonVideoCandidates` (`lib/lesson/video-server.ts`) — مايتغيرش. |
| **الطبقة الجديدة** | `VideoRecommendations` بتقسّم الـ `candidates` الراجعة لـ ٤ أرفف حسب `duration` (الموجودة في الـ candidate) و`reason`: **Best Match** (أول candidate + reason «الأكثر ملاءمة») / **Quick** (مدة ≤ 10 دقايق تقريبًا) / **Deep** (≤ 30+ دقيقة) / **Practical** (ليه عنوان/وصف فيه كلمات تطبيق — heuristics بسيطة، بدون AI في P1). تصنيف رخيص client-side — مش نداء جديد. |
| **الاختيار يتحفظ** | أول ما الطالب يشغّل فيديو ⇒ `lesson_content.video = { video_id, kind, ... }` (عبر POST خفيف لـ `/api/lesson-content` بـ `action: "set_video"` — إضافة صغيرة للراوت الموجود). الفتح الجديد بيقرا الصف ده قبل ما يدور. |
| **التوقيت** | **بدون `enablejsapi`** (قرار §7-1): الـ checkpoints/روابط الأقسام بتفتح `watchUrl + &t=<seconds>` — `watchUrl` موجود فعلًا في كل candidate (`video-server.ts:71`). «آخر توقيت» في الـ context ييجي من الـ transcript مواقع الأقسام (P3)، وفي P1 يفضل `null` بصدق. |
| **المخفي افتراضيًا** | `video.open = false` عند التحميل. الفيديو بيتفتح بضغطة (من Navigator أو زر Video Center) — بيوفر استعلام البحث لحد ما الطالب يطلبه فعلًا. |

### 4.3 Notebook — إضافة محتوى بـ Preview + Undo

> **⚠️ محدَّث في P2 — مطلب «النوتة العائمة»:**
> - `NotebookPanel` بقى **نافذة عائمة** على الديسكتوب (lg+): قابلة للسحب من
>   الهيدر لأي مكان فوق مساحة العمل (pointer events + clamping داخل الشاشة)،
>   قابلة للتصغير (pill عائم بيرجّعها)، وقابلة للإخفاء (زر استعادة عائم دائم).
> - **الموبايل (< lg):** bottom sheet زي ما هي — السحب الحر مش مفيد للشاشات
>   الصغيرة، بنفس أزرار التصغير/الإخفاء/الاستعادة.
> - **الاستمرارية:** الموضع والحالة (`pos` / `minimized` / `hidden`) في
>   localStorage لكل درس: `lesson-notes-float:<dayId>`.
> - وظيفة الـ postMessage (append/undo) **زي ما هي بالظبط** — القرار المقفول
>   §7.1-2 ما اتلمسش.

| البند | العقد |
|---|---|
| **الآلية** | `NotebookPanel` بيلفّ `/notes` في iframe same-origin (نفس نمط `NotesSplitPanel` الموجود — التخزين IndexedDB والقفل والكوتة شغالين زي أي تبويب). |
| **الإضافة** | أي «أضف للنوتة» (من الشرح/الفيديو/الملخص) ⇒ `queueNotebookDraft({ title, body, source })` ⇒ الـ Panel بيعرض **Preview** (النص اللي هيضاف + المصدر) ⇒ موافقة ⇒ `postMessage` للـ iframe بإجراء `magicly:append-note` ⇒ **Undo** (زر بيرجّع آخر إضافة — بيتخزن آخر draft في الـ provider لحد إغلاق الـ panel). |
| **اللمسة المعتمدة في `NotebookEditor.tsx`** | ✅ قرار المستخدم (§7.1-2): listener واحد (~20 سطر) في `components/notes/NotebookEditor.tsx` — يسمع `magicly:append-note` **من نفس الأوريجين فقط** (فحص `event.origin === window.location.origin`) ويتجاهل أي رسالة تانية (حدث غير معروف / payload أكبر من الحد). دي **اللمسة الوحيدة المسموحة** في ملفات الـ notes في P1. |
| **النوتة المرتبطة بالدرس** | **P4 — في الداتابيز بدل localStorage:** آخر نوتة معتمدة بتتحفظ في `lesson_content.notes` jsonb (عمود من `db/50-lesson-studio.sql`) بـ `action: "save_note"` — استرجاع في boot (GET) وحفظ عند الموافقة، والـ undo بيمسح الربط المخزَّن. قرار موثّق: النوتة نفسها فا إلها جدول notes كامل (كان هيطلب migration تاني) — اللي اتنقل للداتابيز هو **ربط آخر إضافة بالدرس** (زي وظيفة localStorage بالظبط بس دائم وعبر الأجهزة)، ووثيقة النوتة نفسها فا عايشة في `/notes` (IndexedDB). |
| **حوّل لـ Flashcard/MCQ (P4)** | قائمة «أضف للنوتة» بقيت كاملة: Flashcard/MCQ بيتولّدوا بنداء AI اقتصادي (`action: "convert_note"` في `/api/lesson-content` — كاش in-memory «ولّد مرة» لكل نص) والناتج **نص منسق** بيدخل النوتة بنفس `magicly:append-note` الموجود — بدون أي تعديل في `NotebookEditor` (القرار المقفول). Mind Map فضلت «جاي قريبًا». |
| **الملخصات بأشكالها (P4)** | `action: "summaries"` — نداء AI **واحد مجمّع** بيطلّع الأشكال الأربعة (`quick/detailed/academic/exam_revision`) من الشرح المخزّن (cited الأول وإلا الأوضاع) وبيتخزنوا في `lesson_content.summaries` jsonb — «ولّد مرة وخزّن» + «أعد التوليد» بإصدار جديد. العرض في تاب Learn تحت الشرح مع «حوّل الملخص». |

### 4.4 Practice — الاختبار + الكاش + Flashcards

| البند | العقد |
|---|---|
| **الاختبار** | نفس المنطق الحالي: `POST /api/lesson-quiz` → `lesson_quiz_attempts` → `POST /api/lesson-quiz/submit` → `complete_study_day`. مكوّن `LessonQuiz` بينقل الكود كما هو. |
| **G7 — الكاش** | `/api/lesson-quiz` يبقى: hash(المعاملات) → قراية `lesson_quiz_cache` → hit ⇒ رجّع `questions` + `cached: true` (من غير احتياطي كريدت) → miss ⇒ ولّد ⇒ اكتب الكاش ⇒ كمّل مسار الـ attempts زي ما هو. **مايغيرش شكل الرد** — الكلاينت يفضل شغال بلو كود. |
| **Flashcards** | `study_days.flashcards` موجود فاضي (٠/٩٨٢). P1: مش بيتلمس. P5: التوليد من الشرح المخزّن ويخزّن في `lesson_content.questions`/flashcards. |
| **البوابة** | الاختبار يفضل بوابة الإكمال (يوم الوحيد الإجباري) — checkpoints اختيارية (قرار التدقيق §5-5). |

### 4.5 Progress — study_days + Smart Resume

| البند | العقد |
|---|---|
| **الإكمال** | زي ما هو تمامًا: `complete_study_day` RPC + `activity_log` + الاحتفال (مايلمسش). |
| **Smart Resume** | `lesson_content.resume` (§3.2): آخر تاب/قسم/فيديو بتتحدث debounced، والـ Navigator بيعرض «كمّل من حيث وقفت» + زر مباشر. لو مفيش resume ⇒ أول تاب = Learn. |
| **تقدّم الأقسام** | P1: عدّاد بسيط (الأقسام اللي عدّى عليها الطالب بـ scroll/interaction) في الـ Navigator. الحساب الذكي لمستوى الفهم = P2. |

---

## 5. AI Orchestration Layer

**المبدأ:** ما فيش orchestration runtime جديد — التصنيف موجود فعلًا في `lib/ai/routing.ts` (`routeCandidates(task)` سطر 378 + `TASK_MODEL_PREFERENCE` + `TASK_CAPABILITIES`) و`/api/unified-ai` بياخد `task` ويصنّف الـ intent بـ `classifyChatIntent`. اللي محتاجه الـ Studio هو **التزام**: كل مهمة تتبعت بالمهمة الصح للراوت الصح.

| # | المهمة (ال Studio task) | الراوت / المسار | الـ task الحالي | تصنيف الموديل | الحالة |
|---|---|---|---|---|---|
| O1 | شرح بمستوى (أوضاع/مستويات) | `POST /api/lesson-content` | `chat` | **قوي** (شرح طويل ماركداون) | موجود |
| O2 | شرح مبني على التفريغ + Citations | `POST /api/lesson-content` (linked) | `chat` | **قوي** (تحقق اقتباس صارم) | موجود |
| O3 | أسئلة الاختبار | `POST /api/lesson-quiz` | `chat` | **اقتصادي** (JSON قصير منظم) | موجود — إصلاح G7 يقلل نداءاته |
| O4 | شات الـ Tutor | `POST /api/unified-ai` | intent-based (quiz/summarize/review/explain) | حسب الـ intent — اقتصادي للمحادثة البسيطة | موجود |
| O5 | استعلام بحث الفيديو | `getYouTubeQuery` داخل `/api/lesson/video` | AI تحويل موضوع → query | **اقتصادي** | موجود — يتقل مع حفظ الفيديو المختار (§4.2) |
| O6 | ملخصات بأشكالها (P4) | `POST /api/lesson-content` (action جديد `summaries`) | `chat` | **اقتصادي** (تلخيص من نص موجود) | جديد — P4 |
| O7 | checkpoints لكل قسم (P2) | `POST /api/lesson-content` (action جديد) | `chat` | **اقتصادي** | جديد — P2 |
| O8 | تحويل جزء → Flashcard/MCQ/Mind Map (P5) | `/api/ai/generate` أو action في lesson-content | `chat` | **اقتصادي** | جديد — P5 |
| O9 | Teaching Engine واعي بالسياق (P2) | `/api/unified-ai` (مهمة `teach`) | task جديد اختياري | قوي | جديد — P2 |

قواعد صارمة للـ orchestration:

1. **ممنوع endpoint جديد** غير ما الطور يستدعيه — الأولوية دايمًا action جوه `/api/lesson-content` (الراوت ده أصلاً هو «بوابة محتوى الدرس»).
2. **كل نداء توليد لازم ياخد طريق «ولّد مرة وخزّن»** — مفيش مسار جديد بيتولّد لحظيًا وبيضيع.
3. **التصنيف الاقتصادي/القوي بيتطبق عبر `routeCandidates(task)`** — لو احتجنا تفضيل موديل اقتصادي لمهمة، بنضيفها في `TASK_MODEL_PREFERENCE` مش بـ model صريح من الكلاينت.
4. **الرصيد:** كل نداء بيعدّي على نفس الحراسة الحالية (`guardAiAccessAndReserve` / `recordAiOperation`) — مفيش استثناء للـ Studio.

---

## 6. خطة P1 التنفيذية (Unified Workspace)

> **نطاق P1:** الهيكل (Studio shell + التابات) + Navigator + Context + حفظ التقدم (Resume) + التأكد من إصلاح G4/G5 + الفيديو مخفي افتراضيًا.
> **متوافق مع أطوار التدقيق:** P1 = تطبيق Phase 1.1/1.2 الموجودين جوه شكل تابات — **مش** بيلمس التوليد ولا الـ citations ولا الـ CSP.
> **الترتيب:** كل مهمة قابلة للتسليم لوحدها، والصفحة تشتغل بعد كل واحدة.

### P1-1 — استخراج قسم الاختبار لمكوّن مستقل (تأسيس قبل القص)

- **الملفات:** جديد `app/lesson/[dayId]/studio/practice/LessonQuiz.tsx` · تعديل `app/lesson/[dayId]/page.tsx` (استيراد بدل الكود inline، سطر ~690-900 + قسم العرض 1318-1462).
- **الشغل:** انقل state وlogic الاختبار (توليد/إجابات/تسليم/إكمال/احتفال) كما هو حرفيًا — بدون أي تغيير سلوك. المكوّن يستقبل props: `dayId, topic, subject, description, xpReward, isCompleted, onComplete` ويرفع الأحداث.
- **معيار القبول:** الاختبار بيشتغل زي ما هو (توليد → إجابة → سلّم → تصحيح سيرفري → إكمال + XP + كوينز + احتفال). `npm run typecheck` نضيف.
- **المخاطر:** منخفضة — نقل محايد. خطورة وحيدة: فقدان حالة `quizAttemptId` — لازم تتنقل مع المكوّن.

### P1-2 — نقل SmartContentViewer لمكوّن LearnTab

- **الملفات:** جديد `studio/tabs/LearnTab.tsx` · تعديل `page.tsx` (حذف التعريف inline، سطر 118-565).
- **الشغل:** انقل `SmartContentViewer` + `LinkedCitedView` + `renderMarkdownLite` كما هي. كل الـ props (topic/subject/edu/dayId) تفضل نفسها. أضف wrapper بيقدّم `SpecializationTools` وقسم الموارد (resource_links + المقترحة) كأقسام تحت الشرح.
- **معيار القبول:** الشرح بالأوضاع الأربعة بيشتغل، الربط/الفصل/إعادة التوليد بيشتغلوا، Citations والـ `LectureAudioPlayer` بيشتغلوا، الموارد بتشتغل.
- **المخاطر:** منخفضة — نقل محايد لمكوّن كبير (450 سطر). راجع الـ imports (الصفحة فيها eslint-disable للـ any — يفضل داخل الملف المنقول).

### P1-3 — LessonStudioProvider + StudioShell + التابات الخمسة

- **الملفات:** جديد `studio/LessonStudioProvider.tsx` · `studio/StudioShell.tsx` · `studio/StudioTabs.tsx` · `studio/tabs/{VideoCenterTab,NotesTab,PracticeLabTab,TutorTab}.tsx` · تعديل `page.tsx` (يبقى shell بيحمّل الدرس ويركّب الـ provider + الشل).
- **الشغل:**
  - الـ Provider بالشكل في §2.2 — الحالة في React context، والـ data-loading الحالي بيفضل في `page.tsx` وبيمرّر النتيجة كـ props للـ provider.
  - `StudioShell`: header (Breadcrumb + UnitProgress + Hero مختصر) + grid `lg:grid-cols-[auto_1fr]` (Navigator | Tabs) + الـ AI Panel كـ `fixed`/داخل الـ grid على `xl+`.
  - التابات: Learn (P1-2) · Video (مخفي الفيديو، زر فتح — §4.2) · Notes (يفتح NotebookPanel) · Practice (LessonQuiz من P1-1) · Tutor (UnifiedChat كامل).
- **معيار القبول:** التابات الخمسة بتفتح وبتقفل من غير فقدان state (الشرح المحمّل بيفضل، المحادثة بتفضل، الفيديو المختار بيفضل). الموبايل: تابات علوية + bottom bar. مفيش استدعاء جديد لـ `/api/ai/generate` أو `/api/chat`.
- **المخاطر:** متوسطة — أكبر مهمة في P1. خطر شائع: re-mount التابات بيمسح state (الحل: الـ tabs بـ CSS `hidden` مش unmount — نفس نمط AnimatePresence الحالي). خطر: UnifiedChat مكتوب بحجم ثابت — لو ضغط الحجم صعب، ابدأ بالـ Tutor tab كامل والـ Panel المصغّر يتأجل لآخر P1.

### P1-4 — StudyNavigator + تقدّم الأقسام + Smart Resume

- **الملفات:** جديد `studio/navigator/StudyNavigator.tsx` · تعديل `LessonStudioProvider` (resume logic) · migration صغير أو تأجيل عمود `resume` (شوف المخاطر).
- **الشغل:** قائمة أقسام الدرس مستخرجة من الشرح المخزّن (headings الـ `cited_explanation` أو `##` headings من markdown الأوضاع) + حالتها (مقروء/الحالي/جاي) + نقاط الدرس (LessonProgressPanel data) + «كمّل من حيث وقفت». الـ resume يتحفظ في `localStorage` في P1 (key `lesson-resume:<dayId>`) — عمود `lesson_content.resume` في الداتابيز يتأجل لـ P2 عشان P1 يفضل من غير migration.
- **معيار القبول:** فتح الدرس بعد ما سابته ⇒ النيڤيجيتر بيعرض آخر تاب/قسم وزر «كمّل» بينقلك هناك. التقدم بيتحدث من غير أي نداء شبكة إضافي في P1.
- **المخاطر:** منخفضة (localStorage). الخطر المؤجل: المزامنة بين الأجهزة — مقصود تتأجل لـ P2 مع عمود `resume`.

### P1-5 — الفيديو المخفي افتراضيًا + Video Center + طبقة التوصيات

- **الملفات:** جديد `studio/video/{VideoCenter,VideoRecommendations,MiniVideoPlayer}.tsx` · تعديل `page.tsx` (البحث يبقى **lazy** — يتندى أول ما الطالب يفتح تاب الفيديو أو يضغط «شغّل فيديو»، مش على تحميل الصفحة).
- **الشغل:** تحميل الـ candidates عند أول فتح للتاب (تمرير نفس payload الموجود في `page.tsx` سطر ~490). `VideoRecommendations` تقسّمهم لـ ٤ أرفف (§4.2). `MiniVideoPlayer` floating يحفظ الفيديو لو الطالب بانى التاب. **بدون `enablejsapi`** — روابط التوقيت `&t=` بس.
- **معيار القبول:** الصفحة تفتح **بدون أي نداء** لـ `/api/lesson/video`. فتح الفيديو ⇒ شغّال جوه الصفحة. التنقل بين التابات والفيديو شغّال ⇒ Mini Player يظهر. قفل الفيديو ⇒ يختفي. مفيش أي CSP جديد.
- **المخاطر:** منخفضة. واضح: تأجيل البحث بيبطئ أول فتح للتاب (قابل للقبول — skeleton موجود في LessonVideoPlayer). MiniPlayer بـ iframe تاني ⇒ تحميل مزدوج لنفس الفيديو لو اتنين ظاهروا — الحل: واحد بس ظاهر في المرة (الشل يبدّل بينهم).

### P1-6 — Notebook Panel + الحقن بالـ postMessage (قرار مقفول §7.1-2)

- **الملفات:** جديد `studio/tools/{NotebookPanel,AddToNotebookMenu}.tsx` · **لمسة معتمدة:** `components/notes/NotebookEditor.tsx` (listener الـ postMessage — ~20 سطر).
- **الشغل:** panel iframe لـ `/notes` (نفس نمط NotesSplitPanel) + قائمة «حوّل لـ» فوق النص المحدد/الشرح: Note (شغّال في P1 — queueDraft + Preview + Undo) · Flashcard / MCQ / Mind Map (**disabled بالتسمية «جاي قريبًا»** — stubs لـ P4/P5).
- **الحقن:** بعد موافقة الـ Preview، الـ Panel يبعت `postMessage(iframe.contentWindow, { type: "magicly:append-note", payload }, same-origin)` — والـ listener في `NotebookEditor.tsx` بيفحص `event.origin` (نفس الأوريجين فقط) + نوع الحدث + حدود الـ payload، ويتجاهل أي حاجة تانية.
- **معيار القبول:** فتح النوتة جوه الصفحة، إضافة نص من الشرح بـ Preview ثم إضافة ⇒ النص بيظهر جوه النوتة فعلًا، Undo بيرجّع. رسالة postMessage من origin تاني أو نوع تاني ⇒ **متجاهلة** (بيتأكد منها بالتجربة اليدوية).
- **المخاطر:** منخفضة (بعد القفل) — اللمسة معزولة ومحدودة بفحص origin. ممنوع أي تعديل تاني في `NotebookEditor.tsx` غير الـ listener.

### P1-7 — Tutor Panel المصغّر + سياق القسم

- **الملفات:** تعديل بسيط `components/unified-ai/UnifiedChat.tsx` (prop `compact?: boolean` — يخفي الشريط الجانبي والرفوف، يضغط الحشوة) · `studio/tools/TutorPanel.tsx` · ربط `tutorContext()` في مكان بناء الرسالة.
- **الشغل:** نفس مكوّن الشات في الـ panel الجانبي — المحادثة المشتركة (المحادثة بتعيش في provider state أو يتأكد إن re-mount مايفقدش الرسائل: simplest = نفس instance منطقًا عبر الحفاظ على mount واحد وبدّل موضع بـ CSS). السياق الإضافي (القسم الحالي/مستوى الشرح/الفيديو) بيتبعت مع أول رسالة جديدة.
- **معيار القبول:** سؤال «إيه القسم اللي أنا فيه؟» من الشات بيرد على القسم الصح. G4 regression: محادثة الدرس بتذكر اسم الدرس (مش «درس غير محدد»). G5 regression: مفيش أي fetch لـ `/api/chat` في الصفحة كلها.
- **المخاطر:** متوسطة — مشاركة instance بين مكانين (panel + tab) بتحتاج الحالة تترفع. لو طلع صعب: المكانين يفتحوا نفس المحادثة من `chat_conversations` (الموجودة فعلًا) — fallback مقبول.

### P1-8 — إصلاح G7: تفعيل `lesson_quiz_cache` (فشل جاهز من التدقيق — رخيص ومستقل)

- **الملفات:** تعديل `app/api/lesson-quiz/route.ts` (قراية/كتابة الكاش حوالين منطق التوليد الموجود).
- **الشغل:** `content_hash = sha256(topic|subject|description|count|prompt_version)` → قراية → hit: رجّع `questions` + `cached:true` من غير حجز كريدت → miss: ولّد → اكتب الكاش (best-effort) → كمّل مسار `lesson_quiz_attempts` زي ما هو.
- **معيار القبول:** أول طلب يولّد ويكتب؛ الطلب التاني بنفس المعاملات بيرجع من الكاش بلا نداء AI (بيبان في `ai_operations` ما فيش صف جديد). تغيير `count` ⇒ مفتاح مختلف ⇒ توليد جديد.
- **المخاطر:** منخفضة — الجدول موجود بـ RLS وunique index جاهزين. تحفظ: الأسئلة المولّدة قديمة لو الدرس اتعدل — مقبول (الوصف شبه ثابت) و`force` بيتعالج بطلب بدون كاش لاحقًا لو احتجناه.

### P1-9 — تنظيف ما بعد النقل + حذف StudyTutorWidget (قرار مقفول §7.1-5)

- **الملفات:** `page.tsx` (يبقى <300 سطر) · **حذف `StudyTutorWidget` من الصفحة** (✅ قرار معتمد — وظيفته موجودة في Tutor الموحد؛ الملف نفسه يفضل موجود) · تأكيد عدم وجود dead imports.
- **معيار القبول:** `npm run typecheck` + `npm run lint` نضاف. الصفحة بتشتغل من الرابط المباشر والاحتفال والإكمال شغالين.
- **المخاطر:** منخفضة.

### ترتيب التنفيذ والاعتماديات

```
P1-1 (Quiz extraction) ─┐
P1-2 (LearnTab)        ─┼─→ P1-3 (Provider + Shell + Tabs) ─→ P1-4 (Navigator)
                        │                                 ─→ P1-5 (Video Center)
                        │                                 ─→ P1-6 (Notebook)
                        │                                 ─→ P1-7 (Tutor Panel)
P1-8 (Quiz cache) ──────┘ (مستقل — ينفع بالتوازي في أي وقت)
P1-9 (Cleanup) في الآخر
```

### Definition of Done لـ P1 (كيّل)

1. الصفحة بتفتح بأقل من نداء شبكة الأساسي (درس + config + بروفايل + أيام) — **صفر** نداء فيديو، **صفر** نداء `/api/chat`.
2. التابات الخمسة + الأدوات الثلاث شغالين، Desktop وMobile.
3. إعادة فتح نفس الدرس بيسترجع آخر موضع (resume) من غير استعلام AI.
4. محادثة الدرس بتذكر اسم الدرس و subject (G4) — اختبار regression.
5. الاختبار بياخد طريق الكاش في الطلب التاني (G7) — اختبار API.
6. مفيش أي تغيير في `next.config.ts`.
7. `NotebookEditor.tsx` ماسمهوش غير لمسة واحدة: listener الـ postMessage (نفس الأوريجين بس) — أي diff تاني في ملفات `components/notes/` يترفض.
8. `StudyTutorWidget` مش موجود في صفحة الدرس (قرار §7.1-5).

---

## 7. قرارات مفتوحة ومخاطر

### 7.1 قرارات المستخدم (مقفولة ✅)

| # | القرار | **القرار النهائي (معتمد من المستخدم)** |
|---|---|---|
| **1** | **CSP `script-src` + `enablejsapi=1`** لليوتيوب (شرط أي checkpoints تلقائية أو seek داخل الصفحة) | ✅ **مقبول — مرفوض التوسيع في P1 وP2.** الفيديو يفضل بدون JS API (`next.config.ts` مايتلمسش)، والـ checkpoints وروابط التوقيت بتشتغل عبر `&t=` + الـ transcript (مسار T2) بس. أي إعادة فتح للموضوع = قرار مستقل بعدين. |
| **2** | **آلية كتابة الـ AI في النوتة** | ✅ **مقبول — postMessage مباشر.** P1-6 بيشمل listener معزول في `NotebookEditor.tsx` (~20 سطر): يسمع حدث `magicly:append-note` **من نفس الأوريجين فقط** ويتجاهل أي رسالة تانية (origin/حرف حدث/حجم payload). بديل الـ clipboard اتشال من الخيارات نهائيًا. |
| **5** | **StudyTutorWidget يتنشال من صفحة الدرس** | ✅ **مقبول — حذف من الصفحة في P1-9** (الملف نفسه يفضل موجود — بيتستخدم في صفحات تانية لو وجدت). |

### 7.1-b قرارات مؤجلة لـ P2/P3 (لسه مفتوحة — محتاجة موافقة وقت أطوارها)

| # | القرار | **التوصية** |
|---|---|---|
| **3** | **مستويات الشرح الخمسة**: نضيف `deep_dive` و`exam_focus` كمفاتيح جديدة في `explanation` (P2) مع إبقاء القديمة؟ ولا نستبدل؟ | **إضافة مع مطابقة قراءة** — المفاتيح القديمة (`simple/academic/visual/practical`) تفضل صالحة وتتعرض، والجديدة تتولّد عند الطلب. |
| **4** | **الفيديو المختار يتحفظ في `lesson_content.video`** (عمود jsonb جديد، P2/P3) ولا يفضل بحث كل جلسة؟ | **حفظ** — عمود واحد، نفس عقود الراوت الموجودة (`action: "set_video"`). |

### 7.2 مخاطر معمارية (غير قرارات)

| الخطر | الأثر | التخفيف |
|---|---|---|
| `UnifiedChat` (1069 سطر) بيدير حالته داخليًا — مشاركته بين panel + tab ممكن تعقّد | متوسط | ابدأ بالـ tab كامل؛ الـ panel في آخر P1؛ fallback: نفس المحادثة من `chat_conversations` |
| صفحة `page.tsx` الحالية فيها eslint-disable `no-explicit-any` شامل — النقل ممكن ينشر ضعف التايب | منخفض | النقل محايد في P1؛ التايبينج الكامل لـ lesson_content بيجي مع P2 (و `lib/lesson/citations.ts` أصلًا typed نقي — نمط يُتّبع) |
| الـ Navigator محتاج headings موحّدة من مصدرين (cited_explanation vs markdown الأوضاع) | متوسط | دالة استخراج واحدة `extractOutline()` في `lib/lesson/` تشتغل على الشكلين — تُكتب مع P1-4 وتتاختبر |
| Mouting التابات بـ unmount بيمسح حالة التاب (الشرح المحمّل/المحادثة) | متوسط | تابات بـ `hidden` CSS (keep-mounted) — مقرر في P1-3 |
| توسيع أي CSP إضافي عن غير قصد أثناء التنفيذ | أمني | Definition of P1: ممنوع لمس `next.config.ts` — أي diff فيه يترفض في المراجعة |

---

## 8. الأطوار التالية (Next — سطر لكل واحد)

- **P2 — AI Teaching Engine (✅ منفَّذ — M1):** طريقة الشرح الجديدة — **الـ Tutor هو واجهة الشرح** بـ ٣ أوضاع (شرح عام / تلخيصي / تفصيلي) + أزرار سريعة في الـ Tutor وتاب Learn (نفس المحرك — مصدر واحد) + إعادة توليد بإصدارات محفوظة + badge شفافية المصدر على كل شرح. النوتة العائمة (سحب/تصغير/إخفاء/استعادة + localStorage). الفيديوهات: بحث يدوي + اقتراح واعي بالمادة والموضوع + بوابة صلة صارمة + «ليه اتيرشح» + «مش مناسب». المتبقي لـ P2+: checkpoints لكل قسم من `outline` + مستوى فهم محسوب + resume في الداتابيز (`lesson_content.resume` + `outline` migration `db/48`).
- **P3 — YouTube Intelligence:** حفظ الفيديو المختار + محاذاة topics بتوقيت الفيديو من `transcript` (T2) + navigation «من القسم للفيديو والعكس» (الفيدباك وروابط `&t=` — بدون enablejsapi حسب القرار المقفول §7.1-1).
- **P4 — Summaries & Notebook:** ملخصات بأشكالها (`summaries` jsonb) + ربط النوتة دائمًا بالدرس (جدول وليس localStorage) + «حوّل لـ Note» كامل.
- **P5 — Practice & Assessment:** flashcards من الشرح المخزّن + تحويل أي جزء لـ Flashcard/MCQ/Mind Map + تحليل نتايج الاختبار (`lesson_quiz_attempts`).
- **P6 — Subject Labs:** مسارات مخصصة لكل مرحلة تعليمية (طب/هندسة/…) فوق نفس بنية الـ Studio — extension points جاهزة (`SpecializationTools` slot).

---

## 9. ملحق — مراجع الملفات (المستخدمة في التصميم)

| الملف | الدور |
|---|---|
| `LESSON_PAGE_PHASE1_AUDIT.md` | التدقيق الأساسي — مصدر G1-G8 والأطوار |
| `app/lesson/[dayId]/page.tsx` (1519 سطر) | الصفحة الحالية — SmartContentViewer inline (118-565)، الاختبار inline، شات واحد |
| `app/lesson/[dayId]/components/LessonChrome.tsx` | هوية الصفحة (Shell/GlassCard/Reveal) |
| `app/lesson/[dayId]/components/Lesson{Hero,Breadcrumb,ProgressPanel,ModeTabs}.tsx` | مكوّنات الهيدر والتقدم |
| `components/lesson/LessonCitations.tsx` | عرض الشرح المبني على التفريغ |
| `components/lesson/LectureLinkModal.tsx` | UI ربط المحاضرة (T2) |
| `lib/lesson/citations.ts` | التحقق ٤ طبقات (اقتباس ≥ 0.6 + نسبة رفض 0.3) |
| `app/api/lesson-content/route.ts` (702 سطر) | بوابة محتوى الدرس: GET حالة/POST توليد-مخزّن/ربط |
| `db/46-lesson-content.sql` · `db/47-lesson-content-citations.sql` | الجدول الحالي + عمود citations |
| `db/lesson-quiz-cache.sql` | جدول الكاش الجاهز (غير مستخدم — G7) |
| `app/api/lesson-quiz/route.ts` + `submit/` | الاختبار الحالي (attempts سيرفري — db/118:50) |
| `components/unified-ai/UnifiedChat.tsx` (1069 سطر) | الشات — `LessonContext` سطر 75-79، بناء ctx.lesson سطر 401-420 |
| `lib/magicly-ai.ts:54-76` | إصلاح G4 (`shortText` بيقرا object) |
| `app/api/unified-ai/route.ts` | شات endpoint — task + intent classification |
| `lib/ai/routing.ts:378` + `lib/ai/model-access.ts` | routeCandidates + TASK_MODEL_PREFERENCE (أساس الـ orchestration) |
| `lib/lesson/video-server.ts:68,71` | embed بدون enablejsapi + watchUrl (أساس روابط `&t=`) |
| `components/lesson/LessonVideoPlayer.tsx` | المشغّل الحالي (candidates + alternatives) |
| `components/notes/{NotesSplitPanel,OpenNotesBeside}.tsx` | نمط iframe النوتة الجاهز |
| `components/notes/NotebookEditor.tsx` (2648 سطر) | النوتة نفسها — IndexedDB `magicly-notes` |
| `components/lectures/lecture-citation-context.tsx` | نمط الـ Provider المرجعي |
| `app/globals.css:1639-1810` | CSS الـ citations (جاهز) |
| `next.config.ts:45-66` | الـ CSP (ممنوع لمسه في P1) |
| `docs/ACADEMIC_WORKSPACE_DESIGN.md` | نمط العقود (subjects/lectures/materials) |
| `docs/smart-notes/PHASE0_TECHNICAL_REVIEW.md` | بنية النوتة (IndexedDB/locks/CAS) |
| `docs/MAGICLLY_DEVELOPMENT_MASTER_PLAN.md` | الأنماط العامة للإيكات والخطة |
