"use client";

/* ==========================================================================
   ExamGenerator — شاشة توليد الامتحان (كل الاختيارات قرار الطالب)
   ============================================================================

   1️⃣ المادة: input + datalist من مساراتك (workspace) + كتالوج الجامعة +
      مادة الدرس اللي جاية من `?subject=` — **فلترة المحاضرات** بتتم بعدّلها.
   2️⃣ المحاضرات: من **نفس المادة** بس (نفس مطابقة ربط الدرس)، اللي مالهاش
      تفريغ معطّلة، من1 لـ3 (سقف المحرك)، والمحاضرة الجاية من `?lecture=`
      محددة تلقائيًا حتى لو كانت برة الفلتر (بتظهر بعلامة «من الدرس»).
   3️⃣ شكل الامتحان: الأنواع (checkbox — نوع واحد أو التلاتة) + الصعوبة
      (radio) + العدد (slider5..20) — **مفيش أي نسبة مفروضة**.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, RotateCcw, Sparkles, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subjectMatches } from "@/lib/academics/subject-match";
import {
  EXAM_DIFFICULTIES,
  EXAM_MAX_COUNT,
  EXAM_MIN_COUNT,
  EXAM_QUESTION_TYPES,
  type ExamDifficulty,
  type ExamQuestionType,
} from "@/lib/ai/exam-review";

export type ExamGeneratorInitial = {
  subject: string;
  subjectId: string;
  lecture: string;
  dayId: string;
  /** عدد الأسئلة (من المساعد عبر الـURL) — بيتقرا في السلايدر. */
  count?: number;
  /** أنواع الأسئلة (من المساعد) — فاضية = الافتراضي. */
  types?: ExamQuestionType[];
  /** مستوى الصعوبة (من المساعد) — null = الافتراضي. */
  difficulty?: ExamDifficulty | null;
  /**
   * 🌍 موضوع عام (من المساعد عبر الـURL) — مصدر بديل: امتحان من معلومات
   *    الـAI العامة في الموضوع (من غير أي ملف).
   */
  topic?: string;
  /** 📄 مستند جاهز (من رفع في الشات) — بيتحدّد كمصدر أوتوماتيك. */
  document?: string;
};

type LectureRow = {
  id: string;
  title: string;
  subject: string | null;
  subject_id: string | null;
  created_at: string;
  duration_seconds: number | null;
  hasTranscript: boolean;
};

/** 📄 مستند مرفوع (PDF/PPTX/DOCX) — مصدر تاني للامتحان. */
type DocumentRow = {
  id: string;
  title: string | null;
  file_type: string | null;
  page_count: number | null;
  status: string | null;
  created_at: string;
};

/** تبويب المصدر: تسجيل صوتي (بنص تفريغ) ولا مستند (ملف) ولا موضوع عام. */
type SourceTab = "recordings" | "documents" | "topic";

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  pptx: "PowerPoint",
  docx: "Word",
  text: "نص",
  image: "صورة",
};

const TYPE_LABELS: Record<ExamQuestionType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "مقالي",
};

const DIFFICULTY_LABELS: Record<ExamDifficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

const DIFFICULTY_HINTS: Record<ExamDifficulty, string> = {
  easy: "تذكّر وتعريف مباشر من التفريغ",
  medium: "تطبيق وربط بين الأفكار",
  hard: "تحليل وتقدير وسيناريوهات",
};

const MAX_LECTURES = 3;

function shortDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.round(seconds / 60)} دقيقة`;
}

/** رسالة موحّدة لخطأ الإنشاء + هل هو مؤقت (يستاهل إعادة المحاولة)؟ */
function mapCreateError(
  data: { error?: string; detail?: string } | null,
  status: number
): { message: string; transient: boolean } {
  // 503 = الخدمة (المزوّد/السيرفر) مشغولة — مؤقت، والطالب يقدر يعيد.
  if (status === 503) {
    return { message: "السيرفر مشغول جداً حالياً — جرب تاني بعد شوية.", transient: true };
  }
  // 429: يا إما سقف الامتحان (مش مؤقت) يا إما كوتة مؤقتة.
  if (status === 429 && data?.error !== "BUDGET") {
    return { message: "الخدمة اتزحمت دلوقتي — جرب تاني بعد شوية.", transient: true };
  }

  switch (data?.error) {
    case "INSUFFICIENT_CREDITS":
      return { message: "رصيدك مش كافٍ لإنشاء الامتحان — جدّد خطتك وجرّب تاني.", transient: false };
    case "BUDGET":
      return {
        message: data.detail || "حجم المحاضرات المختارة أكبر من سقف الامتحان.",
        transient: false,
      };
    case "NOT_FOUND":
      return {
        message: "واحدة أو أكتر من المحاضرات مش موجودة — حدّث القائمة وجرّب تاني.",
        transient: false,
      };
    case "VALIDATION":
      return {
        message: data.detail || "الاختيارات مش صالحة — راجع النوع والصعوبة والعدد.",
        transient: false,
      };
    case "VALIDATION_SPEC":
      return { message: "اختيار شكل الامتحان (أنواع/صعوبة/عدد) غير صالح.", transient: false };
    case "SOURCE_WITHOUT_TEXT":
      // ⚠️ مصدر بلا نص (PDF صور/مشفّر، أو محاضرة من غير تفريغ) — بنقول
      //    للطالب بالظبط إيه الغلط (مش «حصل خطأ» غامض).
      return {
        message: `في مصدر مفيهوش نص قابل للقراءة${data?.detail ? ` (${data.detail})` : ""} — جرّب مصدر تاني.`,
        transient: false,
      };
    case "SOURCES_UNAVAILABLE":
      // ⚠️ الـmigration 49 لسه متطبّقةش على القاعدة ⇒ المستندات مش متاحة.
      return {
        message: "المستندات لسه مفعّلةش على السيرفر — جرّب المحاضرات الصوتية.",
        transient: false,
      };
    default:
      return {
        message: data?.error || "حصل خطأ أثناء إنشاء الامتحان — جرّب تاني.",
        transient: false,
      };
  }
}

export function ExamGenerator({
  initial,
  presetSubject,
  onCreated,
  onCancel,
}: {
  initial: ExamGeneratorInitial;
  presetSubject?: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** ⚠️ الخطأ مؤقت (503/كوتة) ⇒ الرسالة بتعرض زرار «إعادة المحاولة». */
  const [errorTransient, setErrorTransient] = useState(false);
  const [busy, setBusy] = useState(false);

  const [subjectName, setSubjectName] = useState(presetSubject ?? initial.subject ?? "");
  const [subjectOptions, setSubjectOptions] = useState<{ id: string | null; name: string }[]>([]);
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** المستندات المختارة (المصادر التانية من نفس المولّد). */
  // 📄 مستند جاي من الـURL (رفع في الشات) ⇒ محدَّد من الأول.
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(
    new Set(initial.document ? [initial.document] : []),
  );
  /** التبويب المعروض: التسجيلات الصوتية ولا المستندات ولا الموضوع العام. */
  const [sourceTab, setSourceTab] = useState<SourceTab>(
    initial.topic ? "topic" : initial.document ? "documents" : "recordings",
  );
  /**
   * 🌍 الموضوع العام — نص الطالب (امتحان من معلومات الـAI العامة).
   * مالهوش علاقة بالملفات: مصدر لوحده.
   */
  const [topic, setTopic] = useState<string>(initial.topic ?? "");
  /**
   * 📄 ملف مرفوع **من صفحة الامتحانات** مباشرة (من غير مساحة العمل).
   * بيتحفظ في مساحة العمل زي أي ملف، وبيبقى مصدر الامتحان.
   */
  const [uploadedDoc, setUploadedDoc] = useState<DocumentRow | null>(null);
  const [uploading, setUploading] = useState(false);
  /** المحاضرة الجاية من الدرس (?lecture= أو محسوبة من ?dayId=). */
  const [preselectId, setPreselectId] = useState<string>(initial.lecture);
  const [notice, setNotice] = useState<string | null>(null);

  // شكل الامتحان — تحكم كامل للطالب (بدون نسب مفروضة).
  // ⚠️ القيم الابتدائية بتيجي من الـURL (المساعد قدر الطالب قبلها) —
  //    الطالب لسه قادر يعدّلها قبل ما يولّد.
  const [types, setTypes] = useState<ExamQuestionType[]>(
    initial.types && initial.types.length > 0 ? initial.types : ["mcq", "true_false"]
  );
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? "medium");
  const [count, setCount] = useState(
    typeof initial.count === "number" &&
      initial.count >= EXAM_MIN_COUNT &&
      initial.count <= EXAM_MAX_COUNT
      ? initial.count
      : 10
  );

  // ── تحميل المحاضرات + كتالوج المواد ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      try {
        const [lecturesRes, documentsRes, transcriptRes, wsRes, uniRes] = await Promise.all([
          supabase
            .from("lectures")
            .select("id, title, subject, subject_id, created_at, duration_seconds")
            .order("created_at", { ascending: false })
            .limit(100),
          // 📄 المستندات (PDF/PPTX/DOCX) في مساحة العمل — مصدر تاني
          //    للامتحان (المستخرج وقت الرفع).
          supabase
            .from("documents")
            .select("id, title, file_type, page_count, status, created_at")
            .order("created_at", { ascending: false })
            .limit(100),
          // ⚠️ **التنبيه**: بنقرأ `transcript_text` (مش `transcript_data`) لأن
          //    الراوت بيشترط نص تفريغ غير فاضي (`lectures.transcript_text`).
          //    الفحص القديم على `transcript_data` كان بيقول «بدون تفريغ»
          //    لمحاضرة سليمة (TEXT فيها وJSONB فاضي) ⇒ الطالب مشايف محاضرته.
          supabase.from("lectures").select("id, transcript_text").not("transcript_text", "is", null),
          supabase.from("workspace_subjects").select("id, name").limit(200),
          supabase.from("university_subjects").select("id, name").limit(1000),
        ]);
        if (cancelled) return;
        if (lecturesRes.error) throw new Error(lecturesRes.error.message);

        const transcriptIds = new Set(
          ((transcriptRes.data ?? []) as Array<{ id: string; transcript_text?: string | null }>)
            .filter((row) => typeof row.transcript_text === "string" && row.transcript_text.trim().length > 0)
            .map((row) => row.id)
        );
        const rows = ((lecturesRes.data ?? []) as Array<Omit<LectureRow, "hasTranscript">>).map(
          (row) => ({ ...row, hasTranscript: transcriptIds.has(row.id) })
        );
        setLectures(rows);

        // 📄 المستندات — المتاح منها اللي اتقرا (status = ready/partial).
        const docRows = ((documentsRes.data ?? []) as DocumentRow[]).filter((row) =>
          row.status === "ready" || row.status === "partial"
        );
        setDocuments(docRows);

        const options: { id: string | null; name: string }[] = [];
        const seen = new Set<string>();
        for (const source of [wsRes.data ?? [], uniRes.data ?? []] as Array<
          Array<{ id: string; name: string }>
        >) {
          for (const row of source) {
            if (!row.name || seen.has(row.name)) continue;
            seen.add(row.name);
            options.push({ id: row.id, name: row.name });
          }
        }
        setSubjectOptions(options);

        // مادة الدرس (?subject=) ممكن م تكونش في القوائم — نضيفها كخيار.
        const initialSubject = presetSubject ?? initial.subject;
        if (initialSubject && !seen.has(initialSubject)) {
          setSubjectOptions((prev) => [...prev, { id: initial.subjectId || null, name: initialSubject }]);
        }

        // محددة تلقائيًا: المحاضرة المرتبطة بالدرس — من ?lecture= مباشرة،
        // أو بنحلها من lesson_content.source_lecture_id لو جايين بس ?dayId=.
        let preselect = initial.lecture;
        if (!preselect && initial.dayId) {
          const { data: lessonContent } = await supabase
            .from("lesson_content")
            .select("source_lecture_id")
            .eq("day_id", initial.dayId)
            .maybeSingle();
          const linked = (lessonContent as { source_lecture_id?: string | null } | null)
            ?.source_lecture_id;
          if (linked) preselect = linked;
        }
        if (preselect) {
          setPreselectId(preselect);
          setSelected(new Set([preselect]));
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "مقدرناش نحمّل المحاضرات.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل مرة واحدة (الـinitial ثابت للشاشة)
  }, []);

  // ── فلترة المادة (نفس مطابقة ربط الدرس) ──
  const matchingSubjectIds = useMemo(() => {
    const ids = new Set<string>();
    if (!subjectName.trim()) return ids;
    for (const option of subjectOptions) {
      if (option.id && option.name && subjectMatches(option.name, subjectName)) ids.add(option.id);
    }
    return ids;
  }, [subjectName, subjectOptions]);

  /** المحاضرة بتنتسب للمادة المختارة؟ (المحاضرات غير المصنّفة = دايمًا) */
  const matchesSubject = useMemo(() => {
    const name = subjectName.trim();
    return (row: LectureRow) => {
      if (!name) return true;
      // ⚠️ **المحاضرة غير المصنّفة بتظهر دايمًا** — الطالب رافع ملف ومحاضراته
      //    مش متصنّفة تحت مادة ⇒ الفلتر كان بيخفيها بالكامل وبيقول له
      //    «مفيش محاضرات مسجّلة في المادة دي». دلوقتي بتظهر مع علامة
      //    «بدون تصنيف» (والطالب يقدر يستخدمها أو يسيب الفلتر).
      const hasSubject = Boolean(row.subject_id) || Boolean(row.subject?.trim());
      if (!hasSubject) return true;
      if (row.subject_id && matchingSubjectIds.has(row.subject_id)) return true;
      return Boolean(row.subject) && subjectMatches(row.subject ?? "", name);
    };
  }, [subjectName, matchingSubjectIds]);

  const visibleLectures = useMemo(() => {
    const filtered = lectures.filter(matchesSubject);
    // المحاضرة الجاية من الدرس تفضل ظاهرة حتى لو الفلتر شالها (حالة نادر).
    if (preselectId) {
      const fromLesson = lectures.find((row) => row.id === preselectId);
      if (fromLesson && !filtered.some((row) => row.id === fromLesson.id)) {
        return [fromLesson, ...filtered];
      }
    }
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial ثابت للشاشة
  }, [lectures, matchesSubject, preselectId]);

  const selectedRows = lectures.filter((row) => selected.has(row.id));
  const selectedDocRows = documents.filter((row) => selectedDocs.has(row.id));
  /** 📦 إجمالي المصادر المختارة (تسجيلات + مستندات) — السقف 3. */
  const selectedCount = selectedRows.length + selectedDocRows.length;
  /** 🌍 الموضوع العام مكتوب؟ (3 أحرف على الأقل). */
  const topicReady = topic.trim().length >= 3;
  /**
   * ⚠️ **مصدر واحد بس**: الموضوع العام لوحده، أو ملفات (تسجيلات/مستندات).
   *    (الـRPC بيبني جلسة بمصدر واحد — الخلط مرفوض من السيرفر.)
   */
  const canCreate =
    types.length > 0 &&
    !busy &&
    !uploading &&
    (topicReady || (selectedCount > 0 && selectedCount <= MAX_LECTURES));
  /** محاضرات إخاها فلتر المادة (في مواد تانية) — عشان نقول للطالب صراحةً. */
  const hiddenBySubject = subjectName.trim()
    ? lectures.filter((row) => !matchesSubject(row)).length
    : 0;

  function toggleLecture(id: string) {
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // ⚠️ السقف 3 **مصادر** (تسجيلات + مستندات) — مش 3 محاضرات بس.
      if (selectedCount >= MAX_LECTURES) {
        setNotice(`الحد الأقصى ${MAX_LECTURES} مصادر في الامتحان الواحد.`);
        return prev;
      }
      next.add(id);
      return next;
    });
  }

  function toggleDocument(id: string) {
    setNotice(null);
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (selectedCount >= MAX_LECTURES) {
        setNotice(`الحد الأقصى ${MAX_LECTURES} مصادر في الامتحان الواحد.`);
        return prev;
      }
      next.add(id);
      return next;
    });
  }

  function toggleType(type: ExamQuestionType) {
    setTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) {
          setNotice("لازم تختار نوع سؤال واحد على الأقل.");
          return prev;
        }
        return prev.filter((value) => value !== type);
      }
      return [...prev, type];
    });
  }

  /**
   * 📄 رفع ملف **من صفحة الامتحانات** مباشرة.
   *
   * ⚠️ **ليه**: الطالب كان لازم يروح مساحة العمل الأول — دلوقتي بيرفع
   *    من هنا والملف بيتحفظ في مساحة العمل (نفس `/api/documents`) وبيبقى
   *    مصدر امتحان على طول.
   */
  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setErrorTransient(false);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.document?.id) {
        const message =
          (data?.error as { message?: string } | null)?.message ??
          "مقدرناش نرفع الملف. جرّب تاني.";
        setError(message);
        setErrorTransient(response.status === 429 || response.status >= 500);
        return;
      }
      const doc = data.document as { id: string; title?: string | null; file_type?: string | null; page_count?: number | null; status?: string | null };
      const row: DocumentRow = {
        id: doc.id,
        title: doc.title ?? file.name,
        file_type: doc.file_type ?? file.type,
        page_count: doc.page_count ?? null,
        status: doc.status ?? "ready",
        created_at: new Date().toISOString(),
      };
      // ⚠️ الملف المرفوع **يحلّ محل** أي موضوع عام (مصدر واحد بس).
      setTopic("");
      setUploadedDoc(row);
      setSelected(new Set());
      setSelectedDocs(new Set([doc.id]));
      setSourceTab("documents");
      setNotice(`تم رفع «${row.title}» — هيتستخدم ك مصدر الامتحان.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "مقدرناش نرفع الملف. جرّب تاني.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    setErrorTransient(false);
    try {
      const name = subjectName.trim();
      const matchedId =
        subjectOptions.find((option) => option.id && option.name && subjectMatches(option.name, name))
          ?.id ?? null;

      const response = await fetch("/api/exam-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "last_minute_review",
          // ⚠️ **مصدر واحد بس**: يا ملفات (محاضرات/مستندات) يا موضوع عام.
          //    الموضوع بيتبعت مكان المصادر لما يكون هو المصدر.
          lectureIds: topic.trim() ? [] : [...selected],
          documentIds: topic.trim() ? [] : [...selectedDocs],
          ...(topic.trim() ? { topic: topic.trim() } : {}),
          spec: { types, difficulty, count },
          subject: name ? { id: matchedId ?? undefined, name } : undefined,
          title: name ? `امتحان ${name}` : undefined,
          dayId: initial.dayId || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.sessionId) {
        const { message, transient } = mapCreateError(data, response.status);
        // ⚠️ بنميّز الخطأ المؤقت — عشان نعرض زرار «إعادة المحاولة» بدل
        //    رسالة ميتة. الخطأ مش مؤقت (رصيد/سقف) بيوضّح للطالب الخطوة.
        throw Object.assign(new Error(message), { transient });
      }
      onCreated(String(data.sessionId));
    } catch (err) {
      const transient = (err as { transient?: unknown }).transient === true;
      setErrorTransient(transient);
      setError(err instanceof Error ? err.message : "حصل خطأ — جرّب تاني.");
    } finally {
      // ⚠️ الـbusy دايماً بينتهي — الشاشة ماتفضلش معلقة مهما كان الخطأ.
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#2A3050] border-t-amber-300 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">بنحمّل محاضراتك…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition">
          <ArrowRight size={15} aria-hidden />
          رجوع لقائمتي
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-full">
          <Sparkles size={13} aria-hidden />
          كريدت واحد لكل امتحان
        </span>
      </div>

      <h2 className="text-2xl font-extrabold">ولّد امتحانك</h2>

      {/*1️⃣ المادة */}
      <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 space-y-3" aria-label="اختيار المادة">
        <h3 className="text-sm font-extrabold text-amber-300">1️⃣ المادة</h3>
        <input
          list="exam-subjects"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="اكتب أو اختار المادة… (مثلاً: فيزياء)"
          className="w-full bg-[#0D1029] border border-[#2A3050] rounded-xl px-4 py-2.5 text-sm text-[#F0E6D2] placeholder:text-slate-500 focus:outline-none focus:border-amber-300"
          aria-label="اسم المادة"
        />
        <datalist id="exam-subjects">
          {subjectOptions.map((option) => (
            <option key={`${option.id ?? "free"}-${option.name}`} value={option.name} />
          ))}
        </datalist>
        <p className="text-[11px] text-slate-500">
          {subjectName.trim()
            ? "المحاضرات تحت بتتفلتر حسب المادة دي."
            : "اختار المادة عشان نعرض محاضراتها بس (أو سيبها فاضية لعرض كل محاضراتك)."}
        </p>
      </section>

      {/*2️⃣ المصدر — تسجيل صوتي ولا مستند ولا موضوع عام */}
      <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 space-y-3" aria-label="اختيار مصدر الامتحان">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-amber-300">2️⃣ مصدر الامتحان</h3>
          <span className="text-[11px] text-slate-400 ltr-num">
            {topicReady ? "موضوع عام" : `${selectedCount}/${MAX_LECTURES} محددة`}
          </span>
        </div>

        {/* 🔀 التبويبات — عشان الطالب يعرف بوضوح: الصوتيات في مكان،
            والمستندات (PDF/PPTX) في مكان تاني. */}
        <div className="flex gap-2" role="tablist" aria-label="نوع مصدر الامتحان">
          {(
            [
              { key: "recordings" as const, label: "المحاضرات الصوتية", count: visibleLectures.length },
              { key: "documents" as const, label: "المستندات", count: documents.length },
              { key: "topic" as const, label: "موضوع عام", count: null },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sourceTab === tab.key}
              onClick={() => setSourceTab(tab.key)}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                sourceTab === tab.key
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : "border-[#2A3050] text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="mr-1.5 text-[10px] text-slate-500 ltr-num">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {sourceTab === "topic" ? (
          // 🌍 الموضوع العام (من غير ملفات) — ورفع ملف
          //    من صفحة الامتحانات مباشرة (بيتحفظ في مساحة العمل).
          <div className="space-y-4">
            <div className="rounded-xl border border-[#2A3050] bg-[#0D1029] p-4 space-y-3">
              <label htmlFor="exam-topic" className="block text-xs font-bold text-slate-300">
                🌍 اكتب الموضوع اللي عايز تتحن عليه
              </label>
              <input
                id="exam-topic"
                type="text"
                value={topic}
                maxLength={300}
                onChange={(event) => {
                  setTopic(event.target.value);
                  setNotice(null);
                }}
                placeholder="مثال: البناء الضوئي — أو: الخلقة والأنسجة"
                className="w-full rounded-xl border border-[#2A3050] bg-[#0D1029] px-4 py-3 text-sm text-[#F0E6D2] placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                الامتحان هيتبني على <span className="text-amber-300">معلومات عامة</span> في الموضوع —
                مش على ملف. لو عايز امتحان مخصص لملفك، ارفعه من تحت أو اختار من محاضراتك.
              </p>
            </div>

            {/* 📄 رفع ملف من صفحة الامتحانات (من غير ما تروح مساحة العمل). */}
            <div className="rounded-xl border border-dashed border-[#2A3050] p-4 space-y-3">
              <p className="text-xs font-bold text-slate-300">📄 أو ارفع ملف هنا (PDF / PowerPoint / Word)</p>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-4 py-2 text-sm font-bold transition-colors">
                <Upload size={14} aria-hidden />
                {uploading ? "بيرفع…" : "اختار ملف"}
                <input
                  type="file"
                  accept=".pdf,.pptx,.ppt,.docx,.doc,.txt"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleUpload(file);
                  }}
                />
              </label>
              {uploadedDoc && (
                <p className="text-[11px] text-emerald-300">
                  تم رفع «{uploadedDoc.title}» — هيتبني عليه الامتحان.
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                الملف بيتحفظ في مساحة العمل وبيبقى متاح لبقية المميزات بعد كده.
              </p>
            </div>
          </div>
        ) : sourceTab === "recordings" ? (
          visibleLectures.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2A3050] p-6 text-center space-y-3">
              <p className="text-sm text-slate-300 leading-relaxed">
                {subjectName.trim()
                  ? "مفيش محاضرات صوتية مسجّلة في المادة دي، ارفع تسجيل الأول."
                  : "مفيش محاضرات صوتية مسجّلة عندك لسه."}
              </p>
              <Link
                href="/lecture-transcription"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-4 py-2 text-sm font-bold transition-colors"
              >
                <Upload size={14} aria-hidden />
                ارفع تسجيل صوتي
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleLectures.map((lecture) => {
                const isSelected = selected.has(lecture.id);
                const isFromLesson = Boolean(preselectId) && lecture.id === preselectId;
                const isUnclassified = !lecture.subject_id && !lecture.subject?.trim();
                const duration = formatDuration(lecture.duration_seconds);
                return (
                  <li key={lecture.id}>
                    <button
                      type="button"
                      onClick={() => toggleLecture(lecture.id)}
                      disabled={!lecture.hasTranscript}
                      aria-pressed={isSelected}
                      className={`w-full text-right rounded-xl border px-4 py-3 flex items-start gap-3 transition ${
                        isSelected
                          ? "border-amber-400 bg-amber-400/10"
                          : "border-[#2A3050] bg-[#0D1029] hover:border-slate-500"
                      } ${!lecture.hasTranscript ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border shrink-0 grid place-items-center ${
                          isSelected ? "bg-amber-400 border-amber-400" : "border-slate-600"
                        }`}
                        aria-hidden
                      >
                        {isSelected && <Check size={11} className="text-[#0D1029]" strokeWidth={4} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[#F0E6D2] truncate">{lecture.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          {lecture.created_at && <span>{shortDate(lecture.created_at)}</span>}
                          {duration && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} aria-hidden />
                              {duration}
                            </span>
                          )}
                          {!lecture.hasTranscript && <span className="text-red-400">· بدون تفريغ</span>}
                          {isUnclassified && <span className="text-slate-400">· بدون تصنيف</span>}
                          {isFromLesson && <span className="text-amber-300">· من الدرس</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2A3050] p-6 text-center space-y-3">
              <p className="text-sm text-slate-300 leading-relaxed">
                مفيش مستندات جاهزة. ارفع PDF أو PowerPoint أو Word من مساحة العمل.
              </p>
              <Link
                href="/dashboard/workspace?tab=files"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-4 py-2 text-sm font-bold transition-colors"
              >
                <Upload size={14} aria-hidden />
                ارفع مستند
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => {
                const isSelected = selectedDocs.has(doc.id);
                const typeLabel = doc.file_type ? FILE_TYPE_LABEL[doc.file_type] ?? doc.file_type : "ملف";
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => toggleDocument(doc.id)}
                      aria-pressed={isSelected}
                      className={`w-full text-right rounded-xl border px-4 py-3 flex items-start gap-3 transition ${
                        isSelected
                          ? "border-amber-400 bg-amber-400/10"
                          : "border-[#2A3050] bg-[#0D1029] hover:border-slate-500"
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border shrink-0 grid place-items-center ${
                          isSelected ? "bg-amber-400 border-amber-400" : "border-slate-600"
                        }`}
                        aria-hidden
                      >
                        {isSelected && <Check size={11} className="text-[#0D1029]" strokeWidth={4} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[#F0E6D2] truncate">
                          {doc.title ?? "مستند"}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>{typeLabel}</span>
                          {doc.created_at && <span>· {shortDate(doc.created_at)}</span>}
                          {doc.page_count ? (
                            <span className="ltr-num">· {doc.page_count} صفحة</span>
                          ) : null}
                          {doc.status === "partial" && (
                            <span className="text-amber-300">· في صفحات ما اتقرتش</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
        {notice && <p className="text-[11px] text-amber-300">{notice}</p>}
        {sourceTab === "recordings" && hiddenBySubject > 0 && (
          <p className="text-[11px] text-slate-500">
            {hiddenBySubject} محاضرة في مواد تانية مخفية بالفلتر — امسح اسم المادة عشان تشوفها.
          </p>
        )}
      </section>

      {/*3️⃣ شكل الامتحان */}
      <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 space-y-5" aria-label="شكل الامتحان">
        <h3 className="text-sm font-extrabold text-amber-300">3️⃣ شكل الامتحان — كله قرارك</h3>

        {/* الأنواع */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">أنواع الأسئلة</p>
          <div className="flex flex-wrap gap-2">
            {EXAM_QUESTION_TYPES.map((type) => {
              const active = types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => toggleType(type)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    active
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-[#2A3050] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border grid place-items-center ${active ? "bg-amber-400 border-amber-400" : "border-slate-600"}`} aria-hidden>
                    {active && <Check size={9} className="text-[#0D1029]" strokeWidth={5} />}
                  </span>
                  {TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">اختار نوع واحد بس أو التلاتة مع بعض.</p>
        </div>

        {/* الصعوبة */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">مستوى الصعوبة</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="مستوى الصعوبة">
            {EXAM_DIFFICULTIES.map((level) => {
              const active = difficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDifficulty(level)}
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                    active
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-[#2A3050] text-slate-400 hover:text-slate-200"
                  }`}
                  title={DIFFICULTY_HINTS[level]}
                >
                  {DIFFICULTY_LABELS[level]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">{DIFFICULTY_HINTS[difficulty]}</p>
        </div>

        {/* العدد */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-300">عدد الأسئلة</p>
            <span className="text-sm font-extrabold text-amber-300 ltr-num">{count}</span>
          </div>
          <input
            type="range"
            min={EXAM_MIN_COUNT}
            max={EXAM_MAX_COUNT}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-amber-400"
            aria-label={`عدد الأسئلة: ${count}`}
          />
          <div className="flex justify-between text-[10px] text-slate-500 ltr-num">
            <span>{EXAM_MIN_COUNT}</span>
            <span>{EXAM_MAX_COUNT}</span>
          </div>
        </div>
      </section>

      {/* الأخطاء + الإنشاء */}
      {error && (
        <div
          className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 space-y-3"
          role="alert"
        >
          <p className="text-sm text-red-300 leading-relaxed">{error}</p>
          {errorTransient && (
            // ⚠️ خطأ مؤقت (السيرفر مشغول/الكوتة) — ما نوقفش عنده: بنعرض
            //    زرار إعادة المحاولة جنب الرسالة.
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy || !canCreate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 px-4 py-2 text-xs font-extrabold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={13} aria-hidden />
              {busy ? "بنعيد المحاولة…" : "إعادة المحاولة"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void handleCreate()}
          disabled={!canCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-[#0D1029] px-6 py-3 text-sm font-extrabold transition-colors"
        >
          <Sparkles size={16} aria-hidden />
          {busy ? "بنجهّز الامتحان…" : "⚡ ولّد الامتحان — كريدت واحد"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-[#2A3050] px-5 py-3 text-sm font-bold text-slate-300 hover:border-slate-500 transition disabled:opacity-40"
        >
          إلغاء
        </button>
        {selectedCount === 0 && (
          <span className="text-[11px] text-slate-500">
            اختار مصدر واحد على الأقل (محاضرة صوتية أو مستند).
          </span>
        )}
      </div>
    </div>
  );
}
