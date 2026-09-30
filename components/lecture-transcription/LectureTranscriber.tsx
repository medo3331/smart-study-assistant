"use client";

/* ==========================================================================
   🎙️ LectureTranscriber — واجهة تفريغ المحاضرات
   ═══════════════════════════════════════════════════════════════════════

   الشاشة كلها: اختيار ملف ← تحويل ← عرض النص.

   ⚠️ ليه النصوص هنا عربي hardcoded ومش في `lib/i18n/dictionaries`:
   الصفحة دي عربية بالكامل حسب طلب المنتج (الجمهور طلاب عرب)، وده نفس
   اللي بيتعمل في `app/ai-studio` و`components/ai/*`. لو حبيت الترجمة
   لاحقًا، الكود كله في كومبوننت واحد والنصوص فيه سهلة الإخراج للقاموس.

   ⚠️ العقد مع السيرفر (3 نقاط):
     - POST /api/lecture-transcription/upload-url بـ JSON { filename,
       contentType, size } ← بيرجّع { signedUrl, token, path, expiresIn }.
       تذكرة مؤقتة على **مسار واحد**؛ مفيش أي صلاحية عامة على الباكيت.
     - PUT المتصفح على signedUrl مباشرة (مش في الفانكشن) — وده اللي
       بيشيل حد الـ 4.5 ميجا.
     - POST /api/lecture-transcription/transcribe بـ JSON { path, filename,
       size } ← بيرجّع `{ transcript: LectureTranscript }` (نفس المرحلة 1).
     كلهم بيرجّعوا `{ error: { code, message } }` عند الفشل.
     **كل** الكلام عن ElevenLabs والأسعار معزول جوه
     `lib/ai/transcription.ts` — الكلاينت مش شايف ولا سطر منه.

   ⚠️ الاستيراد: `lib/ai/transcription-shared` بس (مفيهوش `process.env`
   ولا `fetch`). استيراد `lib/ai/transcription` هنا كان هيعني كود المزوّد
   في الـ client bundle.

   ═══ التصميم ═══
   توكنات الثيم من `app/globals.css` (--app-bg / --card-primary / --rule /
   --accent / --text / --muted) زي `app/ai-studio` بالظبط — فبيشتغل على
   الثيمات الأربعة من غير أي CSS جديد. صفر كلاسات في globals.css.

   ═══ RTL والخطوط المختلطة ═══
   مربع النص `dir="rtl"` + `unicode-bidi: plaintext`: العربي بيتظبط RTL
   تلقائياً، والكلمة الإنجليزية جواه («JavaScript»، «API») بتتقري LTR
   من غير إن علامات الترقيم تنطّ. مع `white-space: pre-wrap` عشان الفقرات
   الطويلة والأسطر الجديدة في رد المزوّد ماتنطمسش، و`overflow-wrap:
   anywhere` عشان كلمة طويلة ما تكسّرش التخطيط.
   ═══════════════════════════════════════════════════════════════════════ */

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileAudio,
  LoaderCircle,
  Mic,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import {
  assertLectureFile,
  formatFileSize,
  LECTURE_FILE_ACCEPT,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_LECTURE_FILE_BYTES,
  TranscriptionError,
  type LectureTranscript,
  type UploadTicket,
} from "@/lib/ai/transcription-shared";

/* ───────────────────────── نصوص الواجهة ───────────────────────── */

/** رسالة عامة لو الراوت رجّع 5xx من غير رسالة (بروكسي/بلا نت). */
const ERR_GENERIC = "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.";
const ERR_NETWORK = "فيها مشكلة في الاتصال. اتأكد من الإنترنت وحاول تاني.";
const ERR_NO_FILE = "اختر ملف المحاضرة الأول.";
const ERR_UPLOAD = "فشل رفع المحاضرة. حاول مرة أخرى.";
const ERR_UPLOAD_RETRY = "مقدرناش نجهّز رفع المحاضرة. حاول تاني بعد شوية.";

/** الحدّ بالأرقام العربية-الهندية زي باقي الواجهة. */
const MAX_SIZE_LABEL = formatFileSize(MAX_LECTURE_FILE_BYTES);

/** الصيغ المدعومة في سطر واحد تحت منطقة الرفع. */
const FORMATS_LABEL = "MP3 · WAV · M4A · MP4 · AAC · FLAC · OGG · WEBM";

type Phase = "idle" | "working" | "done" | "error";

/** مرحلة الشغل الجارية — بتتحول لرسالة مختلفة لكل خطوة.
 *  ⚠️ مفيش نسبة مئوية عن قصد: ElevenLabs بيرجّع النص مرة واحدة في
 *  الآخر من غير تقدّم، والرقم الوهمي كذب صريح. الوحيد اللي بيعرض
 *  نسبة هو **الرفع** — ودي حقيقية 100% (بايتم على المتصفح). */
type Stage = "uploading" | "transcribing" | "finalizing";

/**
 * رفع الملف **مباشرة** للتخزين عن طريق الـ signed URL بتاع الراوت.
 *
 * ⚠️ ليه `XMLHttpRequest` مش `fetch`: عشان نعرف نسبة الرفع الحقيقية.
 * `fetch` ماعندهاش progress events في المتصفح، و`XMLHttpRequest.upload.onprogress`
 * بيبعت البايتات المرفوعة فعلاً. النسبة دي **مش مزيّفة** — دي الحقيقية.
 * (نسبة التحويل نفسها مش بتتعرض — ElevenLabs مش بيبعت تقدّم.)
 *
 * ⚠️ التوكن لازم يتبعت في هيدر `x-upsert-token` حسب API Supabase.
 * ممنوع أي مفتاح خدمة يوصل المتصفح — اللي بيتبعت ده تذكرة مؤقتة
 * لمسار واحد بس.
 */
function uploadDirect(
  signedUrl: string,
  token: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert-token", token);
    // ⚠️ لازم: من غير content-type صحيح Supabase بيرفض الطلب.
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      // Supabase بيرجّع 200 أو 201 على نجاح الرفع.
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.ontimeout = () => reject(new Error("upload_timeout"));
    // مهلة 4 ساعات: محاضرة 3 ساعات على نت بطيء ممكن تاخد وقت، واللي
    // مانعدّيش ساعتين دي مش upload ticket TTL (ساعتين) — ده توصيل.
    xhr.timeout = 4 * 60 * 60 * 1000;

    xhr.send(file);
  });
}

/** استخراج رسالة عربية آمنة من رد الراوت.
 *  الراوت بيرجّع `{ error: { code, message } }` — والرسالة مكتوبة بالعربي
 *  ومفهومة للطالب على طول. لو الرد مش بالشكل ده (بروكسي/5xx/HTML) بنرجع
 *  للرسالة العامة بدل ما نعرض `undefined` أو JSON خام. */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

/** اسم ملف التنزيل: اسم المحاضرة الأصلي + .txt
 *  بننضّف المحارف اللي مش آمنة في أسماء الملفات على ويندوز. */
function downloadFilename(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, " ").trim();
  const safe = (base || "محاضرة").slice(0, 60);
  return `${safe}.txt`;
}

/** المدة بالثواني → "12:34" أو "1:05:20" */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** المكوّن الرئيسي — كل حالة الشاشة في متغيرات واحدة واضحة. */
export function LectureTranscriber() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LectureTranscript | null>(null);
  const [copied, setCopied] = useState(false);
  /** المرحلة الجارية من الشغل — بتتحكم في نص التحميل. */
  const [stage, setStage] = useState<Stage>("uploading");
  /** نسبة رفع **حقيقية** (0..100). مش بتتحرك أثناء التحويل خالص —
   *  ElevenLabs مش بيبعت تقدّم، وإيهام الطالب بنسبة هنا كذب. */
  const [uploadPercent, setUploadPercent] = useState(0);
  /** مسار الملف **بعد** ما اترفع فعلاً.
   *  ⚠️ ده اللي بيخلّي إعادة المحاولة ممكنة من غير رفع تاني: لو فشل
   *  التفريغ، الخادم سيب الملف في مكانه (بيحذفه بعد النجاح بس)،
   *  فالطالب يقدر يدوس «حاول تاني» ويكمّل من نفس الملف. */
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const working = phase === "working";

  /** يفتح منتقي الملفات من زرار الـ dropzone. */
  const openPicker = useCallback(() => {
    if (!working) inputRef.current?.click();
  }, [working]);

  /** يختار ملف (من سحب/إفلات أو من المنتقي) ويفحصه فوراً.
   *  الفحص هنا مش بديل عن فحص الراوت — ده بس عشان الطالب يشوف الرسالة
   *  قبل ما نرفع أي حاجة. */
  const selectFile = useCallback(
    (next: File | null | undefined) => {
      if (!next) {
        setError(ERR_NO_FILE);
        setPhase("error");
        return;
      }

      try {
        assertLectureFile(next);
      } catch (validationError) {
        setError(
          validationError instanceof TranscriptionError
            ? validationError.message
            : ERR_GENERIC,
        );
        setPhase("error");
        return;
      }

      setFile(next);
      setError(null);
      setTranscript(null);
      setCopied(false);
      setPhase("idle");
      // ملف جديد = تذكرة جديدة، وننسى أي مسار قديم.
      setUploadedPath(null);
      setUploadPercent(0);
    },
    [],
  );

  /** يمسح الاختيار ويرجّع الشاشة لحالتها الأولى. */
  const reset = useCallback(() => {
    setFile(null);
    setTranscript(null);
    setError(null);
    setCopied(false);
    setPhase("idle");
    setUploadedPath(null);
    setUploadPercent(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /** مسار المرحلة 1 القديم: الملف في جسم طلب الفانكشن.
   *  بيشتغل للملفات الصغيرة بس (أو لما Supabase Storage مش مهيّأ).
   *  محفوظ زي ما هو — المرحلة 1 مش مفقودة. */
  const runDirect = useCallback(async () => {
    if (!file) return;

    setPhase("working");
    setStage("transcribing");
    setError(null);
    setTranscript(null);
    setCopied(false);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/lecture-transcription", {
        method: "POST",
        body,
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(extractErrorMessage(payload, ERR_GENERIC));
        setPhase("error");
        return;
      }

      const result = (payload as { transcript?: LectureTranscript } | null)?.transcript;
      if (!result || typeof result.text !== "string" || result.text.trim() === "") {
        setError(ERR_GENERIC);
        setPhase("error");
        return;
      }

      setTranscript(result);
      setPhase("done");
    } catch {
      setError(ERR_NETWORK);
      setPhase("error");
    }
  }, [file]);

  /**
   * الخطوة ٣/٤: تفريغ ملف **متروفع بالفعل** + عرض النتيجة.
   *
   * منفصلة عن `run` عشان إعادة المحاولة بعد فشل تفريغ ترجع ل هنا
   * على طول — من غير ما نطلب تذكرة جديدة ولا نرفع 200 ميجا تاني.
   */
  const transcribeUploaded = useCallback(
    async (path: string) => {
      setStage("transcribing");
      setUploadPercent(100);

      const response = await fetch("/api/lecture-transcription/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, filename: file?.name ?? "محاضرة", size: file?.size ?? 0 }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        /* ⚠️ الملف لسه مرفوع (الخادم بيحذفه بعد النجاح بس) — فبنسيب
           `uploadedPath` متسجّل، والزر بيرجع لـ «حاول تاني» ويكمّل من
           نفس الملف. ده أهم فرق عن المرحلة 1. */
        setError(extractErrorMessage(payload, ERR_GENERIC));
        setPhase("error");
        return false;
      }

      setStage("finalizing");
      const result = (payload as { transcript?: LectureTranscript } | null)?.transcript;
      if (!result || typeof result.text !== "string" || result.text.trim() === "") {
        setError(ERR_GENERIC);
        setPhase("error");
        return false;
      }

      // نجح — الملف اتمسح في السيرفر، فبننسى المسار عندنا كمان.
      setUploadedPath(null);
      setTranscript(result);
      setPhase("done");
      return true;
    },
    [file],
  );

  /**
   * المسار الجديد (المرحلة 2): تذكرة ← رفع مباشر ← تفريغ.
   *
   * ⚠️ الملف **مش** بيمرّ في أي جسم طلب للفانكشن: بينزل من المتصفح
   * للتخزين على signed URL، وElevenLabs بيسحبه من هناك.
   */
  const run = useCallback(async () => {
    if (!file || working) return;

    setPhase("working");
    setError(null);
    setTranscript(null);
    setCopied(false);
    setUploadPercent(0);

    try {
      /* ⚠️ الملف ده مرفوع خلاص من محاولة سابقة (فشل التفريغ مثلاً):
         نكمّل من عند التفريغ — رفع 200 ميجا تاني معناه دقائق ضايعة
         على الطالب ونصيب من الفاتورة. */
      if (uploadedPath) {
        await transcribeUploaded(uploadedPath);
        return;
      }

      // ── الخطوة ١: تذكرة الرفع (JSON صغير) ──
      const ticketResponse = await fetch("/api/lecture-transcription/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const ticketPayload: unknown = await ticketResponse.json().catch(() => null);

      /* التخزين مش مهيّأ في البيئة دي (سطر الأوامر الأول بيكشف ده) —
         نرجع للمسار القديم بدل ما نقفل الطالب برسالة. الملف
         الملف الصغير لسه هيشتغل. */
      const code = (ticketPayload as { error?: { code?: string } } | null)?.error?.code;
      if (ticketResponse.status === 503 && code === "STORAGE_NOT_CONFIGURED") {
        /* ⚠️ المسار القديم بيمرّ بجسم طلب الفانكشن (حد ~4.5 ميجا على
           Vercel). فلو الملف كبير والرفع المباشر مش مفعّل، محاولة الرفع
           هتفشل عند المنصّة برسالة غامضة — بنرفضها هنا برسالة
           مفهومة. الملف الصغير لسه هيشتغل عادي. */
        if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
          setError(
            `حجم الملف كبير أوي والرفع المباشر مش متاح حالياً. الحد في الوضع ده ${formatFileSize(
              MAX_DIRECT_UPLOAD_BYTES,
            )}. جرّب تاني بعد شوية.`,
          );
          setPhase("error");
          return;
        }
        await runDirect();
        return;
      }

      if (!ticketResponse.ok) {
        setError(extractErrorMessage(ticketPayload, ERR_UPLOAD_RETRY));
        setPhase("error");
        return;
      }

      const ticket = ticketPayload as UploadTicket | null;
      if (!ticket?.signedUrl || !ticket.token || !ticket.path) {
        setError(ERR_UPLOAD_RETRY);
        setPhase("error");
        return;
      }

      // ── الخطوة ٢: الرفع المباشر للتخزين (بنسبة حقيقية) ──
      setStage("uploading");
      try {
        await uploadDirect(ticket.signedUrl, ticket.token, file, setUploadPercent);
      } catch {
        setError(ERR_UPLOAD);
        setPhase("error");
        return;
      }

      // الملف بقى في مكانه — لو التفريغ فشل، إعادة المحاولة هتكمل منه.
      setUploadedPath(ticket.path);

      // ── الخطوات ٣ و ٤: تفريغ + عرض ──
      await transcribeUploaded(ticket.path);
    } catch {
      // فشل fetch نفسه = نت فاصل أو الصفحة اتقفلت
      setError(ERR_NETWORK);
      setPhase("error");
    }
  }, [file, working, runDirect, uploadedPath, transcribeUploaded]);

  /** نسخ النص للحافظة — مع تنظيف المؤقّت عشان مايتسرّبش بين Copies. */
  const copyText = useCallback(async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("مقدرناش ننسخ النص. حدّد النص واعمله نسخ يدوي.");
    }
  }, [transcript]);

  /** تحميل النص كملف .txt. */
  const downloadText = useCallback(() => {
    if (!transcript || !file) return;
    // BOM في الأول عشان نوتباد يفتح العربي صح على ويندوز
    const blob = new Blob(["\uFEFF", transcript.text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFilename(file.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [transcript, file]);

  return (
    <div className="space-y-5">
      {/* ───────── منطقة الرفع ───────── */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!working) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (working) return;
          selectFile(event.dataTransfer.files?.[0]);
        }}
        className={[
          "rounded-2xl border-2 border-dashed p-8 text-center transition-colors md:p-12",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--rule)] bg-[var(--card-primary)]",
          working ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileAudio size={26} aria-hidden />
        </div>

        <p className="text-base font-bold text-[var(--text)]">
          اسحب ملف المحاضرة هنا أو اضغط لاختيار ملف
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {FORMATS_LABEL} — الحد الأقصى {MAX_SIZE_LABEL}
        </p>

        <button
          type="button"
          onClick={openPicker}
          disabled={working}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={18} aria-hidden />
          <span>اختر ملف</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={LECTURE_FILE_ACCEPT}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
      </div>

      {/* ───────── الملف المختار ───────── */}
      {file && !transcript && (
        <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <FileAudio size={20} aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]" title={file.name}>
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatFileSize(file.size)}
                {file.type ? ` · ${file.type}` : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={reset}
              disabled={working}
              className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--card-secondary)] hover:text-[var(--text)] disabled:opacity-40"
              aria-label="إزالة الملف"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* أثناء الشغل: دوّارة + شريط نابض — الشاشة ماتموديش بتفتّر
              والشريط بيوضح إن في شغل شغّال فعلاً. */}
          {working ? (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
                <span>
                  {stage === "uploading"
                    ? "جاري رفع المحاضرة..."
                    : stage === "finalizing"
                      ? "جاري تجهيز النص..."
                      : "تم رفع المحاضرة، جاري تحويلها إلى نص..."}
                </span>
              </div>

              {/* ⚠️ الشريط بيتحرك بنسبتين مختلفة حسب المرحلة:
                  - أثناء الرفع: عرض حقيقي من البايتات المرفوعة (integers).
                  - أثناء التحويل: نبضة غير محددة، **من غير أي رقم** — لأن
                    ElevenLabs مش بيبعت تقدّم وعرض «60%» هنا كذب.
                  التحويل الطويل بيحصل بس في المرحلة دي لأن الملف غالباً
                  بيكون أكبر من 4.5 ميجا. */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--card-secondary)]">
                {stage === "uploading" ? (
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${Math.min(100, Math.max(2, uploadPercent))}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
                )}
              </div>

              <p className="mt-2 text-center text-xs text-[var(--muted)]">
                {stage === "uploading"
                  ? `الرفع مباشر للتخزين — ${uploadPercent}%`
                  : "المحاضرات الطويلة ممكن تاخد دقائق — سيب الصفحة مفتوحة."}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={run}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              <Mic size={18} aria-hidden />
              {/* الملف لسه مرفوع؟ يعني دوسنا الأول رفع من غير ما يوصل،
                  فالتسميات لازم توضّح إننا مش بنرفع تاني. */}
              <span>{uploadedPath ? "حاول تحويلها تاني" : "تحويل إلى نص"}</span>
            </button>
          )}
        </div>
      )}

      {/* ───────── الخطأ ───────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" aria-hidden />
          <p className="text-sm leading-relaxed text-[var(--text)]">{error}</p>
        </div>
      )}

      {/* ───────── النص الناتج ───────── */}
      {transcript && (
        <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <Check size={18} aria-hidden />
              <span>تم تحويل المحاضرة بنجاح ✓</span>
            </p>

            {transcript.duration !== null && (
              <p className="text-xs text-[var(--muted)]">
                مدة التسجيل: {formatDuration(transcript.duration)}
              </p>
            )}
          </div>

          {/* أزرار النسخ والتحميل */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyText}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
            >
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              <span>{copied ? "تم النسخ ✓" : "نسخ النص"}</span>
            </button>

            <button
              type="button"
              onClick={downloadText}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
            >
              <Download size={16} aria-hidden />
              <span>تحميل TXT</span>
            </button>

            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--card-secondary)] hover:text-[var(--text)]"
            >
              <RotateCcw size={16} aria-hidden />
              <span>محاضرة جديدة</span>
            </button>
          </div>

          {/* مربع النص.
              dir="rtl" + unicode-bidi:plaintext = العربي بيتظبط RTL، والكلمة
              الإنجليزية («JavaScript») بتتقري LTR وعلامات الترقيم ما بتنطّش.
              pre-wrap عشان فقرات الرد تفضل زي ما هي، وoverflow-wrap:anywhere
              عشان كلمة طويلة ما تكسّرش التخطيط. */}
          <div
            dir="rtl"
            className="mt-4 max-h-[32rem] overflow-y-auto rounded-xl border border-[var(--rule)] bg-[var(--app-bg)] p-4 text-[15px] leading-[2] text-[var(--text)]"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              unicodeBidi: "plaintext",
            }}
          >
            {transcript.text}
          </div>
        </div>
      )}

      {/* إشعار صغير بحدود الاستخدام — شفاف بدون ما يخوّف */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--muted)]">
        <Sparkles size={13} aria-hidden />
        <span>النص بيطلع زي ما هو — راجعه قبل ما تعتمد عليه في مذاكرتك.</span>
      </p>
    </div>
  );
}
