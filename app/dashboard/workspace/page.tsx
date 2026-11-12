"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external systems (Supabase/URL) is intentional */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  MessageCircle,
  MessageSquare,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../components/PageShell";
import { useAuthUser, formatArabicDate, formatFileSize } from "../components/use-page-data";
import { setAiSeed, railAccountFromUser } from "../components/nav-config";
import { FeatureGuide } from "@/components/FeatureGuide";
import { guides } from "@/lib/guides";
import {
  fetchMaterials,
  insertMaterial,
  updateMaterial,
  deleteMaterial,
  type Material,
} from "@/lib/pages-data";
import { prepareFileForUpload, isImageFile } from "@/lib/image-compress";
import { DeckPanel } from "@/components/workspace/DeckPanel";
import { Presentation } from "lucide-react";

/* ==========================================================================
   مساحة العمل — مركز القيادة

   تلات تابات: المحادثات، المحاضرات، الملفات.
   - الملفات هي materials (النص المستخرج) — عارض المادة القديم محفوظ بالكامل.
   - المحاضرات من lectures.
   - المحادثات من chat_conversations + آخر رسالة من chat_messages.
   - مفيش تغييرات في قاعدة البيانات ولا في APIs المحادثات.
   ========================================================================== */

type WorkspaceTab = "chats" | "lectures" | "files";

interface LectureItem {
  id: string;
  title: string;
  originalFilename: string | null;
  status: string;
  sourceType: string;
  createdAt: string;
  durationSeconds: number | null;
  subjectId: string | null;
}

interface ChatItem {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage: string;
  messageCount: number;
}

const TEXT_FILE_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const TAB_META: {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { id: "chats", label: "المحادثات", icon: MessageSquare },
  { id: "lectures", label: "المحاضرات", icon: Mic },
  { id: "files", label: "الملفات", icon: FileText },
];

const STATUS_LABEL: Record<string, string> = {
  processing: "جاري",
  completed: "جاهزة",
  failed: "فشلت",
};

const SOURCE_LABEL: Record<string, string> = {
  upload: "ملف مرفوع",
  live_recording: "تسجيل مباشر",
};

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return value === "chats" || value === "lectures" || value === "files";
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "الآن";
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffHours < 48) return "إمبارح";
  return formatArabicDate(iso);
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fileIcon(type: string | null, title: string): string {
  const name = title.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "📕";
  if (type?.startsWith("image/")) return "🖼️";
  if (/\.(docx?|odt)$/.test(name)) return "📘";
  if (/\.(csv|xlsx?)$/.test(name)) return "📊";
  if (/\.(js|ts|tsx|jsx|py|java|c|cpp|cs|go|rb|php|html|css|json)$/.test(name)) return "💻";
  return "📄";
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * ⚠️ **الملفات اللي ليها صفحات** (= اللي ينفع منها عرض تقديمي).
 *
 * PDF ⇒ صفحات · PPTX ⇒ شرائح · DOCX ⇒ فقرات.
 * النص العادي والصور مالهمش وحدات ⇒ الزرار مش بيظهر ليهم.
 */
function isDeckCapable(fileType: string | null): boolean {
  if (!fileType) return false;
  return (
    fileType === "application/pdf" ||
    fileType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.(pdf|pptx|docx)$/i.test(fileType)
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();

  const [tab, setTab] = useState<WorkspaceTab>("files");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [lectures, setLectures] = useState<LectureItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [lectureCount, setLectureCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // المادة المفتوحة. null = عارض القايمة.
  const [openId, setOpenId] = useState<string | null>(null);

  // الرفع
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 🎬 لوحة العرض التقديمي (من مستند). null = مقفولة.
  const [deckMaterialId, setDeckMaterialId] = useState<string | null>(null);

  // مسوّدة الملاحظة للمادة المفتوحة، وحالة الحفظ
  const [noteDraft, setNoteDraft] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");

  // التلخيص بالمساعد
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState("");
  const [fileQuestion, setFileQuestion] = useState("");
  const [fileAction, setFileAction] = useState<"summarize" | "extract" | "analyze" | "question">("analyze");
  const [isGeminiAnalyzing, setIsGeminiAnalyzing] = useState(false);

  const openMaterial = materials.find((material) => material.id === openId) ?? null;
  const account = session.status === "ready" ? railAccountFromUser(session.user) : null;
  const displayName = account?.displayName ?? "بطل";
  const totalFiles = materials.length;

  /* ---- تحميل مساحة العمل كلها ---- */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      const [materialsResult, lecturesResult, chatsResult] = await Promise.all([
        fetchMaterials(supabase, userId),
        supabase
          .from("lectures")
          .select(
            "id, title, original_filename, status, source_type, created_at, duration_seconds, subject_id",
            { count: "exact" }
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("chat_conversations")
          .select("id, title, updated_at", { count: "exact" })
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      const errors: string[] = [];

      if (materialsResult.error) {
        errors.push(materialsResult.error.message);
      } else {
        setMaterials(materialsResult.data);
      }

      if (lecturesResult.error) {
        errors.push("تعذّر تحميل المحاضرات.");
      } else {
        const rows = (lecturesResult.data ?? []) as Array<{
          id: string;
          title: string | null;
          original_filename: string | null;
          status: string | null;
          source_type: string | null;
          created_at: string;
          duration_seconds: number | null;
          subject_id: string | null;
        }>;
        setLectures(
          rows.map((lecture) => ({
            id: lecture.id,
            title: (lecture.title ?? lecture.original_filename ?? "محاضرة").trim() || "محاضرة",
            originalFilename: lecture.original_filename,
            status: lecture.status ?? "completed",
            sourceType: lecture.source_type ?? "upload",
            createdAt: lecture.created_at,
            durationSeconds: lecture.duration_seconds,
            subjectId: lecture.subject_id,
          }))
        );
        setLectureCount(lecturesResult.count ?? rows.length);
      }

      if (chatsResult.error) {
        errors.push("تعذّر تحميل المحادثات.");
      } else {
        const conversations = (chatsResult.data ?? []) as Array<{
          id: string;
          title: string | null;
          updated_at: string;
        }>;

        const chatItems = await Promise.all(
          conversations.map(async (conversation) => {
            // استعلام واحد لكل محادثة: آخر رسالة + العدد الإجمالي.
            const { data: lastRows, count } = await supabase
              .from("chat_messages")
              .select("content, created_at", { count: "exact" })
              .eq("conversation_id", conversation.id)
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(1);

            const last = lastRows?.[0] as { content?: string | null } | undefined;

            return {
              id: conversation.id,
              title: (conversation.title ?? "محادثة").trim() || "محادثة",
              updatedAt: conversation.updated_at,
              lastMessage: truncate(last?.content ?? "", 120),
              messageCount: count ?? 0,
            } satisfies ChatItem;
          })
        );

        if (!cancelled) {
          setChats(chatItems);
          setChatCount(chatsResult.count ?? conversations.length);
        }
      }

      if (cancelled) return;

      if (errors.length > 0) setNotice(errors[0]);

      // Deep links: ?file=<id> ثم ?tab=<tab>
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const fileId = params.get("file");
        const tabParam = params.get("tab");

        if (fileId && !materialsResult.error && materialsResult.data.some((m) => m.id === fileId)) {
          setOpenId(fileId);
          setTab("files");
        } else if (isWorkspaceTab(tabParam)) {
          setTab(tabParam);
        }
      }

      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, supabase, router]);

  /* ---- مزامنة التاب/الملف مع الرابط بدون reload ---- */
  function syncUrl(nextTab: WorkspaceTab, fileId: string | null) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    if (fileId) url.searchParams.set("file", fileId);
    else url.searchParams.delete("file");
    window.history.replaceState(null, "", url.toString());
  }

  function changeTab(nextTab: WorkspaceTab) {
    setTab(nextTab);
    if (nextTab !== "files") setOpenId(null);
    syncUrl(nextTab, nextTab === "files" ? openId : null);
  }

  function openFile(id: string) {
    setOpenId(id);
    setTab("files");
    syncUrl("files", id);
  }

  function closeFile() {
    setOpenId(null);
    syncUrl("files", null);
  }

  /* ---- لما تفتح مادة، املا المسوّدة بملاحظتها ---- */
  useEffect(() => {
    setNoteDraft(openMaterial?.note ?? "");
    setNoteState("idle");
  }, [openId, openMaterial?.note]);

  /* ---- رفع ملف ---- */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || session.status !== "ready") return;

    const isImage = isImageFile(file);
    if (file.size > (isImage ? 20 * 1024 * 1024 : MAX_UPLOAD_BYTES)) {
      setNotice(
        isImage
          ? "الصورة كبيرة جداً. خد سكرين شوت للجزء اللي فيه الكلام بس."
          : "الملف كبير جداً. أقصى حجم ٨ ميجا."
      );
      return;
    }
    if (file.size === 0) {
      setNotice("الملف فاضي.");
      return;
    }

    setNotice(null);
    setIsUploading(true);

    try {
      const isTextType = TEXT_FILE_TYPES.includes(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);
      let text = "";

      if (isTextType) {
        setUploadStep("بيقرا الملف…");
        text = await file.text();
      } else {
        setUploadStep(isImage ? "بيجهّز الصورة…" : "بيستخرج النص…");

        const prepared = await prepareFileForUpload(file);
        if (prepared.error) {
          setNotice(prepared.error);
          return;
        }

        // ⚠️ **الرفع بيتمّ عن طريق `/api/documents`** (مش `/api/analyze-file`):
        //    السيرفر بيستخرج الملف **و** بيحفظه مرتين — مادة (نص مدمج)
        //    + مستند (صفحات) — فـ«العرض التقديمي» يقدر يبني عليه.
        //   -pages الـ PPTX مافيش له ingestion في المتصفح أصلاً.
        setUploadStep("بيستخرج النص…");
        const formData = new FormData();
        formData.append("file", prepared.file);
        const res = await fetch("/api/documents", { method: "POST", body: formData });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) {
          setNotice(data?.error?.message || "ما قدرناش نستخرج نص الملف ده. جرّب ملف تاني.");
          return;
        }
        text = data?.material?.content || "";
        const created = data?.material;
        if (created) {
          setMaterials((prev) => [created as Material, ...prev]);
          openFile(created.id);
          // ⚠️ لو في صفحات متقراش (PDF مصوّر) ⇒ نصرّح للطالب.
          const unread = (data?.unread ?? []) as number[];
          if (unread.length > 0) {
            setNotice(
              `${unread.length} صفحة في الملف ده مش متقراية (PDF مصوّر). العرض هيغطي الصفحات المقروءة بس.`,
            );
          }
        }
        return;
      }

      if (!text.trim()) {
        setNotice("الملف ده مفيهوش نص نقدر نقراه. لو صورة، تأكد إن الكلام فيها واضح.");
        return;
      }

      setUploadStep("بيحفظ");
      const { data: created, error } = await insertMaterial(supabase, session.user.id, {
        title: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        content: text,
      });

      if (error) {
        setNotice(error.message);
        return;
      }

      setMaterials((prev) => [created, ...prev]);
      openFile(created.id);
    } catch (err) {
      console.error("upload failed:", err);
      setNotice("حصل خطأ أثناء رفع الملف. حاول تاني.");
    } finally {
      setIsUploading(false);
      setUploadStep("");
    }
  };

  /* ---- حفظ الملاحظة ---- */
  const handleSaveNote = async () => {
    if (!openMaterial) return;
    setNoteState("saving");
    const { error } = await updateMaterial(supabase, openMaterial.id, { note: noteDraft });
    if (error) {
      setNotice(error.message);
      setNoteState("idle");
      return;
    }
    setMaterials((prev) => prev.map((m) => (m.id === openMaterial.id ? { ...m, note: noteDraft } : m)));
    setNoteState("saved");
  };

  /* ---- حذف مادة ---- */
  const handleDelete = async (material: Material) => {
    if (!confirm(`متأكد إنك عايز تشيل «${material.title}» من مكتبتك؟ الخطوة دي لا يمكن التراجع عنها.`)) return;

    const { error } = await deleteMaterial(supabase, material.id);
    if (error) {
      setNotice(error.message);
      return;
    }
    setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    if (openId === material.id) {
      setOpenId(null);
      syncUrl("files", null);
    }
  };

  /* ---- تلخيص بالمساعد ---- */
  const handleSummarize = async () => {
    if (!openMaterial || isSummarizing) return;
    setIsSummarizing(true);
    setNotice(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction:
            "أنت معلم خبير. لخّص المادة المبعوتة في نقاط عربية واضحة ومرتّبة: الفكرة الأساسية الأول، بعدها أهم النقاط، وفي الآخر إيه اللي المفروض المتعلّم يعرفه بعد ما يقراها. من غير حشو ومن غير مقدمات.",
          messages: [
            {
              role: "user",
              content: `المادة: ${openMaterial.title}\n\n--- المحتوى ---\n${openMaterial.content.slice(0, 6000)}\n--- نهاية المحتوى ---`,
            },
          ],
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (data?.reasonAr as string | undefined) ||
          (data?.message as string | undefined) ||
          (data?.error?.message as string | undefined) ||
          (res.status === 429
            ? "وصلت للحد الأقصى للرسائل المسموح بها في خطتك الحالية. يرجى الانتظار أو ترقية خطتك."
            : "ما قدرناش نلخّص المادة دي دلوقتي. حاول تاني.");
        setNotice(msg);
        return;
      }

      const summary: string = data?.choices?.[0]?.message?.content || "";
      if (!summary.trim()) {
        setNotice("رجع ملخص فاضي. حاول تاني.");
        return;
      }

      const { error } = await updateMaterial(supabase, openMaterial.id, { summary });
      if (error) {
        setNotice(error.message);
        return;
      }
      setMaterials((prev) => prev.map((m) => (m.id === openMaterial.id ? { ...m, summary } : m)));
    } catch (err) {
      console.error("summarize failed:", err);
      setNotice("حصل خطأ أثناء التلخيص. حاول تاني.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGeminiAnalysis = async () => {
    if (!openMaterial || isGeminiAnalyzing || (fileAction === "question" && fileQuestion.trim().length < 3)) return;
    setIsGeminiAnalyzing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/file-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: openMaterial.id,
          action: fileAction,
          question: fileQuestion,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّر تحليل الملف.");
      setFileAnalysis(data?.result || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذّر تحليل الملف.");
    } finally {
      setIsGeminiAnalyzing(false);
    }
  };

  /* ---- افتح المحادثة والمادة مرفوعة معاها ---- */
  const handleAskAssistant = (material: Material) => {
    setAiSeed(material.title, material.content);
    const params = new URLSearchParams();
    params.set("subject", material.title);
    params.set("content", material.content.slice(0, 4000));
    router.push(`/chat?${params.toString()}`);
  };

  const uploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.pdf,.docx,image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || session.status !== "ready"}
        className="btn btn-marker text-sm inline-flex items-center gap-1.5"
      >
        <Plus size={15} aria-hidden />
        {isUploading ? uploadStep || "بيرفع…" : "ارفع ملف"}
      </button>
    </>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {uploadButton}
      <Link href="/lecture-transcription" className="btn btn-quiet text-sm inline-flex items-center gap-1.5">
        <Mic size={15} aria-hidden />
        محاضرة جديدة
      </Link>
      <Link href="/chat" className="btn btn-quiet text-sm inline-flex items-center gap-1.5">
        <MessageCircle size={15} aria-hidden />
        محادثة جديدة
      </Link>
    </div>
  );

  const latestLecture = lectures[0];
  const latestMaterial = materials[0];
  const latestIsLecture =
    latestLecture &&
    (!latestMaterial || new Date(latestLecture.createdAt).getTime() > new Date(latestMaterial.createdAt).getTime());
  const insight = latestIsLecture
    ? {
        text: `لاحظت إنك رفعت محاضرة «${truncate(latestLecture!.title, 60)}». تحب تراجعها؟`,
        tab: "lectures" as const,
      }
    : latestMaterial
    ? {
        text: `آخر ملف في مكتبتك: «${truncate(latestMaterial.title, 60)}». تحب تكمّل منه؟`,
        tab: "files" as const,
      }
    : null;

  if (isLoading) {
    return (
      <PageShell
        eyebrow="Workspace"
        title="مركز القيادة"
        lede="بنحمّل ملفاتك ومحاضراتك ومحادثاتك…"
        action={headerActions}
      >
        {/* الدليل بيظهر في حالة التحميل كمان — عشان يظهر فورًا أول ما
            المستخدم يفتح الصفحة، مش بعد ما البيانات تخلص. */}
        <FeatureGuide {...guides.workspace} storageKey="guide:workspace" />
        <LoadingSheets count={4} />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Workspace"
      title="مركز القيادة"
      lede={`أهلاً يا ${displayName} — ملفاتك ومحاضراتك ومحادثاتك في مكان واحد.`}
      action={headerActions}
      feedbackPage="workspace"
      feedbackLabel="مساحة العمل"
    >
      <FeatureGuide {...guides.workspace} storageKey="guide:workspace" />

      {notice && <DataNotice message={notice} />}

      {/* ملخص سريع */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="ملخص مساحة العمل">
        {TAB_META.map(({ id, label, icon: Icon }) => {
          const count = id === "chats" ? chatCount : id === "lectures" ? lectureCount : totalFiles;
          return (
            <button
              key={id}
              type="button"
              onClick={() => changeTab(id)}
              aria-pressed={tab === id}
              className={`sheet-card p-4 text-right transition hover:bg-paper-3 ${
                tab === id ? "sheet-card-live" : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-soft">
                  <Icon size={17} aria-hidden />
                  <span className="text-xs font-bold">{label}</span>
                </span>
                <span className="font-display font-extrabold text-2xl text-ink ltr-num">
                  {count.toLocaleString("ar-EG")}
                </span>
              </span>
            </button>
          );
        })}
      </section>

      {/* لمحة سريعة بدون أي استدعاء AI */}
      {insight && (
        <section className="sheet-card p-4 flex flex-wrap items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-full bg-paper-3 border border-rule flex items-center justify-center text-ink-soft">
            <Sparkles size={16} aria-hidden />
          </span>
          <p className="text-sm text-ink flex-1 min-w-0 m-0">{insight.text}</p>
          <button type="button" onClick={() => changeTab(insight.tab)} className="btn btn-quiet text-xs">
            افتح
          </button>
        </section>
      )}

      {/* التابات */}
      <div
        role="tablist"
        aria-label="أقسام مساحة العمل"
        className="flex flex-wrap items-center gap-1 bg-paper border border-rule p-1 rounded-[var(--r-sm)]"
      >
        {TAB_META.map(({ id, label, icon: Icon }) => {
          const count = id === "chats" ? chatCount : id === "lectures" ? lectureCount : totalFiles;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`workspace-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={tab === id ? `workspace-panel-${id}` : undefined}
              onClick={() => changeTab(id)}
              className={`flex-1 min-w-[7rem] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-[6px] text-sm font-semibold transition ${
                tab === id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink hover:bg-paper-3"
              }`}
            >
              <Icon size={15} aria-hidden />
              <span>{label}</span>
              <span className={`mono text-[10px] ${tab === id ? "text-paper-2/70" : "text-ink-soft/70"}`}>
                {count.toLocaleString("ar-EG")}
              </span>
            </button>
          );
        })}
      </div>

      {/* ================= المحادثات ================= */}
      {tab === "chats" && (
        <section
          id="workspace-panel-chats"
          role="tabpanel"
          aria-labelledby="workspace-tab-chats"
          className="space-y-3"
        >
          {chats.length === 0 ? (
            <EmptyState
              icon="💬"
              title="مفيش محادثات لسه"
              body="ابدأ محادثة مع المعلم الذكي، وهتلاقي كل محادثاتك محفوظة هنا."
              action={
                <Link href="/chat" className="btn btn-marker text-sm">
                  محادثة جديدة
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3">
              {chats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat?conversation=${chat.id}`}
                  className="sheet-card p-4 block text-right transition hover:bg-paper-3 card-interactive"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-paper-3 border border-rule flex items-center justify-center text-ink-soft">
                      <MessageCircle size={16} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-ink truncate m-0">{chat.title}</h3>
                        <span className="text-[11px] text-ink-soft shrink-0 inline-flex items-center gap-1">
                          <Clock size={11} aria-hidden />
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed mt-1 mb-0 line-clamp-2">
                        {chat.lastMessage || "محادثة جديدة"}
                      </p>
                      <span className="tag tag-quiet mt-2 inline-flex">
                        {chat.messageCount.toLocaleString("ar-EG")} رسالة
                      </span>
                    </div>
                    <ChevronLeft size={16} className="text-ink-soft shrink-0 mt-1" aria-hidden />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================= المحاضرات ================= */}
      {tab === "lectures" && (
        <section
          id="workspace-panel-lectures"
          role="tabpanel"
          aria-labelledby="workspace-tab-lectures"
          className="space-y-3"
        >
          {lectures.length === 0 ? (
            <EmptyState
              icon="🎙️"
              title="مفيش محاضرات لسه"
              body="ارفع تسجيل محاضرة أو ملف صوتي، وهتلاقي التفريغ وكل محاضراتك هنا."
              action={
                <Link href="/lecture-transcription" className="btn btn-marker text-sm">
                  محاضرة جديدة
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lectures.map((lecture) => (
                <Link
                  key={lecture.id}
                  href={lecture.subjectId ? `/lectures?subject=${lecture.subjectId}` : "/lectures"}
                  className="sheet-card p-4 block text-right transition hover:bg-paper-3 card-interactive"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 shrink-0 rounded-[var(--r-sm)] bg-paper-3 border border-rule flex items-center justify-center text-ink-soft">
                      <Mic size={17} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink break-words m-0">{lecture.title}</h3>
                        <span className="tag tag-quiet shrink-0">
                          {STATUS_LABEL[lecture.status] ?? lecture.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-soft mt-1 mb-0 flex flex-wrap items-center gap-2">
                        <span>{formatArabicDate(lecture.createdAt)}</span>
                        <span>·</span>
                        <span>{SOURCE_LABEL[lecture.sourceType] ?? lecture.sourceType}</span>
                        {lecture.durationSeconds ? (
                          <>
                            <span>·</span>
                            <span className="ltr-num">{formatDuration(lecture.durationSeconds)}</span>
                          </>
                        ) : null}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft mt-2">
                        <CheckCircle2 size={12} aria-hidden />
                        افتح المحاضرة
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================= الملفات ================= */}
      {tab === "files" && (
        <section
          id="workspace-panel-files"
          role="tabpanel"
          aria-labelledby="workspace-tab-files"
          className="space-y-3"
        >
          {openMaterial ? (
            /* ===== عارض مادة واحدة — نفس الوظائف القديمة ===== */
            <div className="space-y-4">
              <button onClick={closeFile} className="mono text-ink-soft hover:text-ink transition">
                → كل الملفات
              </button>

              <div className="sheet-card sheet-card-live p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl leading-none shrink-0" aria-hidden>
                      {fileIcon(openMaterial.fileType, openMaterial.title)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display font-extrabold text-base text-ink leading-tight break-words">
                        {openMaterial.title}
                      </h2>
                      <p className="tag mt-1">
                        <span>{formatArabicDate(openMaterial.createdAt)}</span>
                        {formatFileSize(openMaterial.fileSize) && (
                          <span className="ltr-num">{formatFileSize(openMaterial.fileSize)}</span>
                        )}
                        <span className="ltr-num">
                          {openMaterial.content.length.toLocaleString("en")} حرف
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleAskAssistant(openMaterial)} className="btn btn-quiet text-sm">
                      اسأل المساعد
                    </button>
                    <button
                      onClick={() => handleDelete(openMaterial)}
                      className="mono text-ink-soft hover:text-redpen px-2 py-1.5 rounded-[6px] transition"
                    >
                      شيلها
                    </button>
                  </div>
                </div>
              </div>

              {/* ---- الملخص ---- */}
              <div className="sheet-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow eyebrow-flush">الملخص</p>
                  {!openMaterial.summary && (
                    <button onClick={handleSummarize} disabled={isSummarizing} className="btn btn-quiet text-sm">
                      {isSummarizing ? "بيلخّص…" : "لخّصها بالمساعد"}
                    </button>
                  )}
                </div>

                {openMaterial.summary ? (
                  <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{openMaterial.summary}</p>
                ) : (
                  <p className="text-xs text-ink-soft leading-relaxed">
                    لسه مفيش ملخص. لما تعمله بيتحفظ مع المادة، فمش هتستنى تاني ولا هتاخد نسخة مختلفة كل مرة.
                  </p>
                )}
              </div>

              <div className="sheet-card p-5 space-y-3">
                <div>
                  <p className="eyebrow eyebrow-flush">Gemini analysis</p>
                  <p className="text-xs text-ink-soft mt-1">
                    تحليل النص المستخرج من الملف. في الصور، النتيجة مبنية على OCR الحالي وليست رؤية للصورة الأصلية.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["summarize", "تلخيص"],
                    ["extract", "استخراج"],
                    ["analyze", "تحليل"],
                    ["question", "اسأل"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setFileAction(id)}
                      className={`btn text-xs ${fileAction === id ? "btn-marker" : "btn-quiet"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {fileAction === "question" && (
                  <input
                    value={fileQuestion}
                    onChange={(e) => setFileQuestion(e.target.value)}
                    placeholder="اكتب سؤالك عن الملف"
                    className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-2.5 text-sm outline-none"
                  />
                )}
                <button
                  onClick={() => void handleGeminiAnalysis()}
                  disabled={isGeminiAnalyzing || (fileAction === "question" && fileQuestion.trim().length < 3)}
                  className="btn btn-quiet text-sm disabled:opacity-40"
                >
                  {isGeminiAnalyzing ? "بيحلّل…" : "حلّل بـ Gemini"}
                </button>
                {fileAnalysis && (
                  <p className="whitespace-pre-wrap text-sm leading-7 border-t border-rule pt-3">{fileAnalysis}</p>
                )}
              </div>

              {/* ---- ملاحظاتك ---- */}
              <div className="sheet-card p-5 space-y-3">
                <p className="eyebrow eyebrow-flush">ملاحظاتك</p>
                <textarea
                  value={noteDraft}
                  onChange={(e) => {
                    setNoteDraft(e.target.value);
                    setNoteState("idle");
                  }}
                  rows={5}
                  placeholder="اكتب اللي فهمته، أو الأسئلة اللي لسه محتاج ترجع لها…"
                  className="field text-sm"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveNote}
                    disabled={noteState === "saving" || noteDraft === openMaterial.note}
                    className="btn btn-marker text-sm"
                  >
                    {noteState === "saving" ? "بيحفظ" : "احفظ الملاحظة"}
                  </button>
                  {noteState === "saved" && <span className="tag">اتحفظت</span>}
                </div>
              </div>

              {/* ---- النص المستخرج ---- */}
              <details className="sheet-card p-5">
                <summary className="eyebrow eyebrow-flush cursor-pointer">النص المستخرج</summary>
                <p className="text-[11px] text-ink-soft leading-relaxed whitespace-pre-wrap mt-3 max-h-96 overflow-y-auto">
                  {openMaterial.content}
                </p>
              </details>
            </div>
          ) : materials.length === 0 ? (
            <EmptyState
              icon="🗂️"
              title="المكتبة لسه فاضية"
              body="ارفع أول مادة — محاضرة PDF، ملف Word، أو صورة صفحة من كتاب. النص بيتستخرج مرة واحدة ويفضل معاك."
              action={uploadButton}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <p className="tag sm:col-span-2">
                <span className="ltr-num">{materials.length}</span> ملف في مكتبتك
              </p>

              {materials.map((material) => (
                <div key={material.id} className="sheet-card p-4 space-y-3">
                  <button
                    onClick={() => openFile(material.id)}
                    className="w-full flex items-start gap-3 min-w-0 text-right"
                  >
                    <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden>
                      {fileIcon(material.fileType, material.title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink truncate">{material.title}</span>
                      <span className="tag mt-1">
                        <span>{formatArabicDate(material.createdAt)}</span>
                        {material.summary && <span>ملخّصة</span>}
                        {material.note.trim() && <span>عليها ملاحظات</span>}
                      </span>
                    </span>
                  </button>

                  {/* 🎬 لوحة العرض التقديمي — بتنفتح تحت الكارت */}
                  {deckMaterialId === material.id && (
                    <DeckPanel
                      materialId={material.id}
                      onClose={() => setDeckMaterialId(null)}
                    />
                  )}

                  <div className="flex items-center justify-end gap-2 border-t border-rule pt-2">
                    <button
                      onClick={() => openFile(material.id)}
                      className="btn btn-quiet text-xs px-3 py-1.5"
                    >
                      افتح
                    </button>
                    <button
                      onClick={() => handleAskAssistant(material)}
                      className="mono text-ink-soft hover:text-ink px-2 py-1.5 rounded-[6px] transition text-xs"
                    >
                      اسأل
                    </button>
                    {/* ⚠️ العرض متاح للملفات اللي ليها صفحات (PDF/PPTX/DOCX).
                        النص العادي والصور مالهمش صفحات ⇒ الزرار مش بيظهر. */}
                    {isDeckCapable(material.fileType) && (
                      <button
                        onClick={() =>
                          setDeckMaterialId(
                            deckMaterialId === material.id ? null : material.id,
                          )
                        }
                        aria-expanded={deckMaterialId === material.id}
                        className="mono text-ink-soft hover:text-ink px-2 py-1.5 rounded-[6px] transition text-xs inline-flex items-center gap-1"
                      >
                        <Presentation size={13} aria-hidden />
                        <span>عرض</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}
