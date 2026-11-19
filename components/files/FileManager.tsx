"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ==========================================================================
   📁 FileManager — مكتبة ملفات الطالب
   ══════════════════════════════════════════════════════════════════════════

   رفع مباشر: تذكرة من السيرفر → PUT لـ Supabase Storage من المتصفح →
   إقرار (complete). الملف عمره ما بيمر بـ Vercel Function، فمفيش حد 4.5 ميجا.
   الفتح: PDF/صور/نص بالمعاينة جوا الصفحة، Word بيتحوّل لـ HTML في المتصفح،
   والباقي تحميل. وفيه دايمًا زر «استورد للنوته» للـ PDF.
   ========================================================================== */

export interface StudentFile {
  id: string;
  file_name: string;
  original_name: string;
  file_size: number;
  file_type: string; // pdf | word | text | image | video | audio
  storage_path: string;
  created_at: string;
}

interface UploadTicket {
  fileId: string;
  path: string;
  signedUrl: string;
  token: string;
}

interface UploadQuota {
  used: number;
  limit: number;
  resetAt: string | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  pdf: "📕",
  word: "📄",
  text: "📝",
  image: "🖼️",
  video: "🎬",
  audio: "🎧",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجا`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${bytes} بايت`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** امتداد الملف الأصلي — للعرض ومنطق المعاينة. */
function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function FileManager() {
  const [files, setFiles] = useState<StudentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<StudentFile | null>(null);
  // 📊 رصيد الرفع اليومي — من GET /api/files (limit -1 = مشترَك/بلا حد).
  const [quota, setQuota] = useState<UploadQuota | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/files");
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setFiles(data.files as StudentFile[]);
        if (data.quota && typeof data.quota.limit === "number" && data.quota.limit >= 0) {
          setQuota(data.quota as UploadQuota);
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // التحميل الأولي — بندخل النتايج كـ callback بعد الـ fetch، مش setState
    // متزامن في جسم الـ effect.
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok && !cancelled) setFiles(data.files as StudentFile[]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- الرفع: تذكرة → PUT مباشر → إقرار ---- */
  const uploadOne = useCallback(
    async (file: File) => {
      setUploadName(file.name);
      setNotice("");
      try {
        const ticketRes = await fetch("/api/files/upload-ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size }),
        });
        const ticketData = await ticketRes.json().catch(() => null);
        if (!ticketRes.ok || !ticketData?.ok) {
          setNotice(ticketData?.error?.message || "فشل تجهيز الرفع. حاول تاني.");
          return false;
        }
        const ticket = ticketData as UploadTicket;

        // ⚠️ الرفع المباشر — الملف مبيعدّيش في أي سيرفر.
        const put = await fetch(ticket.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        });
        if (!put.ok) {
          setNotice("فشل رفع الملف للتخزين. جرّب تاني أو ملف أصغر.");
          return false;
        }

        const completeRes = await fetch("/api/files/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileId: ticket.fileId }),
        });
        const completeData = await completeRes.json().catch(() => null);
        if (!completeRes.ok || !completeData?.ok) {
          setNotice(completeData?.error?.message || "الملف اترفع بس التأكيد فشل — هيظهر بعد شوية.");
          await refresh();
          return false;
        }

        await refresh();
        return true;
      } catch (error) {
        console.error("upload:", error);
        setNotice("حصل خطأ أثناء الرفع. حاول تاني.");
        return false;
      }
    },
    [refresh],
  );

  const handleFiles = useCallback(
    async (picked: FileList | null) => {
      if (!picked?.length) return;
      setUploading(true);
      let okCount = 0;
      for (const file of Array.from(picked)) {
        const ok = await uploadOne(file);
        if (ok) okCount += 1;
      }
      setUploading(false);
      setUploadName("");
      if (okCount > 0) setNotice("");
      if (okCount === 0 && picked.length === 1) {
        // الرسالة already موجودة من uploadOne.
      } else if (okCount < picked.length) {
        setNotice(`${picked.length - okCount} ملف ما اترفعوش.`);
      }
    },
    [uploadOne],
  );

  const handleDelete = useCallback(
    async (file: StudentFile) => {
      if (!window.confirm(`هتحذف «${file.file_name}» نهائيًا. متأكد؟`)) return;
      const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      if (res.ok) {
        setFiles((prev) => prev.filter((entry) => entry.id !== file.id));
      } else {
        setNotice("فشل الحذف. حاول تاني.");
      }
    },
    [],
  );

  return (
    <div className="fm-root" dir="rtl">
      <header className="fm-header">
        <div>
          <h1 className="fm-title">📁 ملفاتي</h1>
          <p className="fm-subtitle">
            ارفع كتبك ومحاضراتك وتلخصياتك — وافتحها من أي مكان وذاكر منها.
          </p>
        </div>
        <Link href="/notes" className="fm-nav-notes">
          ✏️ دفتر الملاحظات
        </Link>
      </header>

      <div
        className={`fm-dropzone${dragOver ? " fm-dropzone--over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.webm,.mp3,.m4a,.wav,.ogg"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {uploading ? (
          <span>⏳ بيرفع «{uploadName}»…</span>
        ) : (
          <>
            <strong>اسحب الملفات هنا</strong>
            <span className="fm-dropzone-hint">
              أو اضغط تختار — PDF · Word · نصوص · صور · فيديو · صوت
            </span>
          </>
        )}
      </div>

      {notice && <p className="fm-notice">{notice}</p>}

      {quota ? (
        <div className="fm-quota" title="رصيد الرفع اليومي — بيتجدد كل 24 ساعة">
          <div className="fm-quota-bar" aria-hidden="true">
            <span
              style={{ width: `${Math.min(100, Math.round((quota.used / quota.limit) * 100))}%` }}
              data-full={quota.used >= quota.limit ? "true" : undefined}
            />
          </div>
          <span className="fm-quota-text" data-full={quota.used >= quota.limit ? "true" : undefined}>
            {quota.used >= quota.limit
              ? `خلصت رصيد النهارده (${quota.limit}/${quota.limit}) — بيتجدد كل 24 ساعة`
              : `باقي لك ${quota.limit - quota.used} ملفات النهارده (${quota.used}/${quota.limit})`}
          </span>
        </div>
      ) : null}

      {loading ? (
        <p className="fm-loading">بيجيب ملفاتك…</p>
      ) : files.length === 0 ? (
        <p className="fm-empty">
          لسه مفيش ملفات. ارفع أول ملف وهيبقى قدامك دايمًا 📚
        </p>
      ) : (
        <ul className="fm-grid">
          {files.map((file) => (
            <li key={file.id} className="fm-card">
              <button
                type="button"
                className="fm-card-main"
                onClick={() => setPreview(file)}
                title="افتح الملف"
              >
                <span className="fm-card-icon">{CATEGORY_ICONS[file.file_type] ?? "📁"}</span>
                <span className="fm-card-name">{file.file_name}</span>
                <span className="fm-card-meta">
                  {formatSize(file.file_size)} · {formatDate(file.created_at)}
                </span>
              </button>
              <div className="fm-card-actions">
                <button type="button" onClick={() => setPreview(file)}>
                  فتح
                </button>
                {file.file_type === "pdf" && (
                  <Link href={`/notes?importFile=${encodeURIComponent(file.id)}`} className="fm-card-notes">
                    للنوته
                  </Link>
                )}
                <button type="button" className="fm-card-danger" onClick={() => void handleDelete(file)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && <FileViewer file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ==========================================================================
   👁️ FileViewer — معاينة الملف جوا نافذة
   ========================================================================== */

function FileViewer({ file, onClose }: { file: StudentFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ext = fileExt(file.file_name);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (res.ok && data?.ok) {
        setUrl(data.url as string);
      } else {
        setError(data?.error?.message || "مقدرناش نفتح الملف.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  return (
    <div className="fm-viewer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fm-viewer" onClick={(event) => event.stopPropagation()} dir="rtl">
        <header className="fm-viewer-head">
          <h2 className="fm-viewer-title">{file.file_name}</h2>
          <div className="fm-viewer-actions">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="fm-viewer-download">
                ⬇️ تحميل
              </a>
            )}
            <button type="button" onClick={onClose} className="fm-viewer-close">
              ✕
            </button>
          </div>
        </header>
        <div className="fm-viewer-body">
          {error && <p className="fm-notice">{error}</p>}
          {!url && !error && <p className="fm-loading">بيجهّز الملف…</p>}
          {url && <FilePreviewBody file={file} url={url} ext={ext} />}
        </div>
      </div>
    </div>
  );
}

function FilePreviewBody({
  file,
  url,
  ext,
}: {
  file: StudentFile;
  url: string;
  ext: string;
}) {
  if (file.file_type === "pdf") {
    return <PdfPreview url={url} />;
  }
  if (file.file_type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.file_name} className="fm-preview-image" />;
  }
  if (file.file_type === "text" || ["txt", "md", "csv"].includes(ext)) {
    return <TextPreview url={url} />;
  }
  if (file.file_type === "word" || ext === "docx") {
    return <WordPreview url={url} />;
  }
  return (
    <div className="fm-preview-unsupported">
      <p>النوع ده ملهوش معاينة هنا — بس تقدر تحمّله وتشغّله على جهازك.</p>
      <a href={url} target="_blank" rel="noreferrer" className="fm-viewer-download">
        ⬇️ تحميل الملف
      </a>
    </div>
  );
}

/* ---- معاينة PDF — pdf.js بصفحات مرقّمة (نفس الـ worker بتاع النوته) ---- */

function PdfPreview({ url }: { url: string }) {
  const [pageCount, setPageCount] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [doc, setDoc] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const loaded = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setPageCount(loaded.numPages);
      } catch (error) {
        console.error("pdf preview:", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!doc || failed) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdf = doc as { getPage: (n: number) => Promise<PdfPage> };
        const page = await pdf.getPage(pageNo);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const viewport = page.getViewport({ scale: 1.4 });
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvasContext: context,
          viewport,
        } as Parameters<typeof page.render>[0]).promise;
      } catch (error) {
        console.error("pdf render:", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNo, failed]);

  if (failed) {
    return (
      <p className="fm-notice">
        مقدرناش نعرض الـ PDF هنا — بس تحميله شغّال عادي.
      </p>
    );
  }
  if (!doc) return <p className="fm-loading">بيفتح الـ PDF…</p>;

  return (
    <div className="fm-pdf">
      <div className="fm-pdf-nav">
        <button type="button" disabled={pageNo <= 1} onClick={() => setPageNo((n) => n - 1)}>
          › السابقة
        </button>
        <span>
          صفحة {pageNo} من {pageCount}
        </span>
        <button
          type="button"
          disabled={pageNo >= pageCount}
          onClick={() => setPageNo((n) => n + 1)}
        >
          التالية ‹
        </button>
      </div>
      <canvas ref={canvasRef} className="fm-pdf-canvas" />
    </div>
  );
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}

/* ---- نص plain ---- */

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const content = await (await fetch(url)).text();
        if (!cancelled) setText(content.slice(0, 200_000));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) return <p className="fm-notice">مقدرناش نقرا الملف.</p>;
  if (text === null) return <p className="fm-loading">بيقرا الملف…</p>;
  return <pre className="fm-preview-text">{text}</pre>;
}

/* ---- Word (docx) — تحويل لـ HTML في المتصفح ---- */

function WordPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mammoth = await import("mammoth/mammoth.browser");
        const buffer = await (await fetch(url)).arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (!cancelled) setHtml(result.value);
      } catch (error) {
        console.error("docx preview:", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return <p className="fm-notice">مقدرناش نعرض الـ Word هنا — تحميله شغّال عادي.</p>;
  }
  if (html === null) return <p className="fm-loading">بيحول الملف للعرض…</p>;
  return (
    <div
      className="fm-preview-word"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
