"use client";

// ===========================================================================
// MAGICLY — لوحة إشراف مجتمع Magicly (C4)
// تقارير المحتوى · العقوبات · الاعتراضات · سجل التدقيق
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Gavel, MessageSquareWarning, ScrollText, Ban, Plus, X, Users, UserPlus, Trash2, Sparkles, Inbox } from "lucide-react";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

type Report = {
  id: string; reporter_id: string; reporter_name: string | null;
  target_type: "post" | "comment" | "user"; target_id: string;
  reason: string; details: string | null; status: string;
  review_notes: string | null; created_at: string;
  target_preview: string | null; target_author_id: string | null;
  target_author_name: string | null; pending_count: number;
};
type Action = {
  id: string; user_id: string; user_name: string | null; user_code: string | null;
  action_type: string; reason: string; expires_at: string | null; active: boolean;
  created_at: string; is_banned: boolean; restriction_until: string | null; warning_count: number;
};
type Appeal = {
  id: string; user_id: string; user_name: string | null; user_code: string | null;
  action_id: string; action_type: string; action_reason: string;
  message: string; status: string; review_notes: string | null; created_at: string;
};
type AuditEntry = {
  id: number; actor_id: string | null; actor_name: string | null;
  action: string; target_type: string | null; target_id: string | null;
  details: unknown; created_at: string;
};
type BannedProfile = {
  id: string; display_name: string | null; email: string | null;
  public_user_code: string | null; is_banned: boolean;
  banned_at: string | null; ban_reason: string | null;
  restriction_until: string | null; warning_count: number;
};
type PendingPost = {
  post_id: string; author_id: string; author_name: string | null;
  author_code: string | null; kind: string; body: string;
  image_url: string | null; visibility: string; created_at: string;
};
type AiSuggestion = {
  recommended_action: "dismiss" | "warning" | "restrict" | "suspend";
  explanation_ar: string;
};

const REASON_AR: Record<string, string> = {
  harassment: "تحرّش", hate: "كراهية", bullying: "تنمّر", spam: "سبام",
  doxxing: "بيانات شخصية", impersonation: "انتحال شخصية", threat: "تهديد",
  illegal: "غير قانوني", other: "أخرى",
};
const ACTION_TYPE_AR: Record<string, string> = {
  warning: "تحذير", restrict: "تقييد مؤقت", suspend: "إيقاف", lift: "رفع إجراء",
};
const AI_ACTION_AR: Record<string, string> = {
  dismiss: "بدون مخالفة", warning: "تحذير", restrict: "تقييد مؤقت", suspend: "إيقاف",
};

function dt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ar-EG");
}

export default function AdminModerationClient() {
  const [tab, setTab] = useState<"queue" | "reports" | "actions" | "appeals" | "audit" | "words" | "team" | "bans">("queue");
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [blockedWords, setBlockedWords] = useState<{ id: string; word: string; created_at: string }[]>([]);
  const [newWord, setNewWord] = useState("");
  const [moderators, setModerators] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([]);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [moderatorInput, setModeratorInput] = useState("");
  const [bannedProfiles, setBannedProfiles] = useState<BannedProfile[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, AiSuggestion | "loading" | "error">>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // نافذة إصدار عقوبة من تقرير
  const [penaltyFor, setPenaltyFor] = useState<Report | null>(null);
  const [penaltyType, setPenaltyType] = useState<"warning" | "restrict" | "suspend">("warning");
  const [penaltyDays, setPenaltyDays] = useState("3");
  const [penaltyReason, setPenaltyReason] = useState("");
  const [reportNotes, setReportNotes] = useState("");

  // ملاحظات الاعتراض
  const [appealNotes, setAppealNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/moderation?status=pending", { cache: "no-store" });
      const d = await res.json();
      if (d.success) {
        setReports(d.reports ?? []);
        setPendingPosts(d.pendingPosts ?? []);
        setActions(d.actions ?? []);
        setAppeals(d.appeals ?? []);
        setAudit(d.audit ?? []);
        setBlockedWords(d.blockedWords ?? []);
        setModerators(d.moderators ?? []);
        setBannedProfiles(d.bannedProfiles ?? []);
        setCanManageTeam(d.canManageTeam === true);
      } else {
        setError(d.error || "فشل تحميل البيانات.");
      }
    } catch {
      setError("مشكلة شبكة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = async (payload: Record<string, unknown>, busyId: string) => {
    setBusy(busyId);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.success) setError(d.error || "الإجراء فشل.");
      return d.success === true;
    } catch {
      setError("مشكلة شبكة.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const issuePenalty = async (report: Report | null, targetUserId: string) => {
    const days = penaltyType === "warning" ? null : Number(penaltyDays) || null;
    const ok = await post({
      action: "issue_action",
      userId: targetUserId,
      actionType: penaltyType,
      reason: penaltyReason,
      days,
      reportId: report?.id ?? null,
    }, "issue");
    if (ok) {
      setPenaltyFor(null);
      setPenaltyReason("");
      if (report) {
        await post({ action: "resolve_report", reportId: report.id, status: "reviewed", notes: reportNotes || null }, "resolve");
      }
      void load();
    }
  };

  const resolveReport = async (reportId: string, status: "reviewed" | "dismissed") => {
    const ok = await post({ action: "resolve_report", reportId, status, notes: reportNotes || null }, `resolve-${reportId}`);
    if (ok) { setReportNotes(""); void load(); }
  };

  const resolveAppeal = async (appealId: string, approve: boolean) => {
    const ok = await post({ action: "resolve_appeal", appealId, approve, notes: appealNotes[appealId] || null }, `appeal-${appealId}`);
    if (ok) void load();
  };

  const tabs = [
    { id: "queue" as const, label: `بانتظار الموافقة (${pendingPosts.length})`, icon: Inbox },
    { id: "reports" as const, label: `التقارير (${reports.length})`, icon: MessageSquareWarning },
    { id: "appeals" as const, label: `الاعتراضات (${appeals.length})`, icon: Gavel },
    { id: "actions" as const, label: "العقوبات", icon: ShieldAlert },
    { id: "bans" as const, label: `سجلات الحظر (${bannedProfiles.length})`, icon: Ban },
    { id: "words" as const, label: `الكلمات الممنوعة (${blockedWords.length})`, icon: Ban },
    { id: "team" as const, label: `فريق الإشراف (${moderators.length})`, icon: Users },
    { id: "audit" as const, label: "سجل التدقيق", icon: ScrollText },
  ];

  // 🤖 Magic AI: اقتراح قرار على تقرير
  const runAiReview = async (reportId: string) => {
    setAiSuggestion((prev) => ({ ...prev, [reportId]: "loading" }));
    try {
      const res = await fetch("/api/admin/community/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ai_review", reportId }),
      });
      const d = await res.json();
      if (res.ok && d.success && d.suggestion) {
        setAiSuggestion((prev) => ({ ...prev, [reportId]: d.suggestion as AiSuggestion }));
      } else {
        setAiSuggestion((prev) => ({ ...prev, [reportId]: "error" }));
      }
    } catch {
      setAiSuggestion((prev) => ({ ...prev, [reportId]: "error" }));
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="إشراف المجتمع"
        subtitle="تقارير المحتوى والعقوبات والاعتراضات — كل إجراء بيتسجل في سجل التدقيق"
        badge="community"
        permissionKey="community.moderate"
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-violet-500 bg-gradient-to-l from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-200"
                : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
        <button onClick={() => void load()} className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث"}
        </button>
        <a
          href="/community/moderation/competitions"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-sm font-bold text-amber-700 hover:bg-amber-100"
        >
          🏆 بانى المسابقات
        </a>
      </div>

      {error ? <AdminNotice tone="rose">{error}</AdminNotice> : null}

      {/* ------------------------------------------------- طابور موافقة المنشورات */}
      {tab === "queue" && (
        <AdminCard title="منشورات بانتظار موافقة الإشراف" tone="default">
          <p className="mb-3 text-xs text-slate-500">
            كل منشور جديد بينزل بعد موافقة المشرف. الموافقة بينشره في المجتمع فورًا، والرفض بيبلّغ صاحبه بإشعار.
          </p>
          {pendingPosts.length === 0 && !loading ? (
            <p className="text-sm text-slate-500">مفيش منشورات مستنية — كل المنشورات اتنشرت.</p>
          ) : (
            <ul className="space-y-3">
              {pendingPosts.map((p) => (
                <li key={p.post_id} className="rounded-lg border border-slate-200 p-3.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate-800">{p.author_name || "بدون اسم"}</span>
                    {p.author_code ? <span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.author_code}</span> : null}
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                      {p.kind === "text" ? "نصي" : p.kind === "achievement" ? "إنجاز" : p.kind === "question" ? "سؤال" : p.kind === "tip" ? "معلومة" : p.kind === "summary" ? "ملخص" : p.kind}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {p.visibility === "public" ? "عام" : p.visibility === "friends" ? "الأصدقاء" : "خاص"}
                    </span>
                    <span className="text-xs text-slate-500">{dt(p.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{p.body}</p>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="مرفق المنشور" className="mt-2 max-h-48 rounded-lg border border-slate-200 object-cover" />
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void post({ action: "review_post", postId: p.post_id, approve: true }, `rev-${p.post_id}`).then((ok) => { if (ok) void load(); })}
                      disabled={busy !== null}
                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === `rev-${p.post_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "موافقة ونشر"}
                    </button>
                    <button
                      onClick={() => void post({ action: "review_post", postId: p.post_id, approve: false }, `rev-${p.post_id}`).then((ok) => { if (ok) void load(); })}
                      disabled={busy !== null}
                      className="rounded bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      )}

      {/* ------------------------------------------------- الكلمات الممنوعة */}
      {tab === "words" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-slate-800">الكلمات والعبارات الممنوعة</h2>
          <p className="mb-3 text-xs text-slate-500">
            أي منشور أو تعليق يحتوي كلمة من القائمة دي بيترفض فورًا قبل فحص مساعد الإشراف الذكي — فلترة حتمية أسرع وأثبت.
          </p>
          <div className="mb-4 flex gap-2">
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="اكتب الكلمة أو العبارة الممنوعة…"
              className="w-full max-w-sm rounded border border-slate-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => {
                const w = newWord.trim().toLowerCase();
                if (!w) return;
                void post({ action: "add_blocked_word", word: w }, "add-word").then((ok) => {
                  if (ok) { setNewWord(""); void load(); }
                });
              }}
              disabled={busy !== null || !newWord.trim()}
              className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> إضافة
            </button>
          </div>
          {blockedWords.length === 0 && !loading ? (
            <p className="text-sm text-slate-500">مفيش كلمات ممنوعة لسه.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {blockedWords.map((w) => (
                <li key={w.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  <span className="font-medium">{w.word}</span>
                  <button
                    onClick={() => void post({ action: "remove_blocked_word", wordId: w.id }, `rm-${w.id}`).then((ok) => { if (ok) void load(); })}
                    disabled={busy !== null}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                    aria-label={`حذف ${w.word}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------- فريق الإشراف */}
      {tab === "team" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-slate-800">فريق إشراف المجتمع</h2>
          <p className="mb-3 text-xs text-slate-500">
            المشرف بيدخل لوحة الإشراف دي مباشرة بصلاحية community.moderate — من غير ما يفتح حساب أي طالب من صفحات الأدمن.
          </p>
          {moderators.length === 0 && !loading ? (
            <p className="text-sm text-slate-500">مفيش مشرفين معيّنين — ضيف أول مشرف من تحت.</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100">
              {moderators.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{m.display_name || "بدون اسم"}</p>
                    {m.email ? <p className="text-[11px] text-slate-500" dir="ltr">{m.email}</p> : null}
                  </div>
                  {canManageTeam ? (
                    <button
                      onClick={() => void post({ action: "remove_moderator", userId: m.user_id }, `rm-mod-${m.user_id}`).then((ok) => { if (ok) void load(); })}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> إزالة
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManageTeam ? (
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <input
                value={moderatorInput}
                onChange={(e) => setModeratorInput(e.target.value)}
                placeholder="إيميل الطالب أو كود MAG أو الـUUID…"
                className="w-full max-w-sm rounded border border-slate-200 px-3 py-1.5 text-sm"
                dir="ltr"
              />
              <button
                onClick={() => {
                  const idf = moderatorInput.trim();
                  if (!idf) return;
                  void post({ action: "add_moderator", identifier: idf }, "add-mod").then((ok) => {
                    if (ok) { setModeratorInput(""); void load(); }
                  });
                }}
                disabled={busy !== null || !moderatorInput.trim()}
                className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" /> تعيين مشرف
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">إدارة الفريق متاحة للمالك والأدمن فقط.</p>
          )}
        </section>
      )}

      {/* ------------------------------------------------- سجلات الحظر */}
      {tab === "bans" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-slate-800">سجلات الحظر والتقييد</h2>
          <p className="mb-3 text-xs text-slate-500">
            كل حساب محظور أو مقيّد حاليًا — يشمل الحظر اليدوي والحظر الصادر من تقارير المجتمع. الحساب مش بيختفي من هنا.
          </p>
          {bannedProfiles.length === 0 && !loading ? (
            <p className="text-sm text-slate-500">مفيش حسابات محظورة أو مقيّدة حاليًا.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bannedProfiles.map((p) => {
                const restricted = !p.is_banned && p.restriction_until && new Date(p.restriction_until).getTime() > Date.now();
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        {p.display_name || "بدون اسم"}
                        {p.public_user_code ? <span className="mr-1.5 font-mono text-[10px] text-slate-400" dir="ltr">{p.public_user_code}</span> : null}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        <span className={p.is_banned ? "font-bold text-red-600" : "font-bold text-amber-600"}>
                          {p.is_banned ? "محظور" : `مقيّد حتى ${dt(p.restriction_until)}`}
                        </span>
                        {p.ban_reason ? ` — السبب: ${p.ban_reason}` : ""}
                        {p.warning_count ? ` — تحذيرات: ${p.warning_count}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => void post({ action: "lift_direct_ban", userId: p.id }, `lift-ban-${p.id}`).then((ok) => { if (ok) void load(); })}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      رفع الإجراء
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ تقارير */}
      {tab === "reports" && (
        <AdminCard title="طابور تقارير المحتوى" tone="default">
          <AdminTableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr><th>النوع</th><th>السبب</th><th>المحتوى</th><th>صاحبه</th><th>المُبلِّغ</th><th>التاريخ</th><th>إجراءات</th></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.target_type === "post" ? "منشور" : r.target_type === "comment" ? "تعليق" : "حساب"}</td>
                    <td>
                      {REASON_AR[r.reason] ?? r.reason}
                      {r.pending_count > 1 ? (
                        <span className="mr-1 rounded-full bg-red-100 px-1.5 text-xs text-red-700">×{r.pending_count}</span>
                      ) : null}
                    </td>
                    <td className="max-w-64 truncate" title={r.target_preview ?? r.details ?? ""}>
                      {r.target_preview || r.details || "-"}
                    </td>
                    <td>{r.target_author_name || r.target_author_id?.slice(0, 8) || "-"}</td>
                    <td>{r.reporter_name || "-"}</td>
                    <td>{dt(r.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setPenaltyFor(r); setPenaltyReason(""); setReportNotes(""); }}
                          disabled={busy !== null}
                          className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          إجراء ضد المخالف
                        </button>
                        <button
                          onClick={() => void resolveReport(r.id, "dismissed")}
                          disabled={busy !== null}
                          className="rounded bg-slate-200 px-2 py-1 text-xs hover:bg-slate-300 disabled:opacity-50"
                        >
                          {busy === `resolve-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "بدون مخالفة"}
                        </button>
                        <button
                          onClick={() => void runAiReview(r.id)}
                          disabled={busy !== null || aiSuggestion[r.id] === "loading"}
                          className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                          title="Magic AI يحلّل التقرير ويقترح القرار"
                        >
                          {aiSuggestion[r.id] === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Magic
                        </button>
                      </div>
                      {aiSuggestion[r.id] && aiSuggestion[r.id] !== "loading" ? (
                        <div className={`mt-1.5 max-w-80 rounded-lg border p-2 text-xs ${aiSuggestion[r.id] === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-violet-200 bg-violet-50 text-slate-700"}`}>
                          {aiSuggestion[r.id] === "error" ? (
                            "المساعد مش متاح حاليًا — قرّر بنفسك."
                          ) : (
                            <>
                              <p className="font-bold text-violet-700">
                                اقتراح Magic: {AI_ACTION_AR[(aiSuggestion[r.id] as AiSuggestion).recommended_action]}
                              </p>
                              <p className="mt-0.5">{(aiSuggestion[r.id] as AiSuggestion).explanation_ar}</p>
                            </>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
          {reports.length === 0 && !loading ? <p className="mt-2 text-sm text-slate-500">مفيش تقارير مفتوحة — المجتمع نضيف.</p> : null}
        </AdminCard>
      )}

      {/* --------------------------------------------------------- اعتراضات */}
      {tab === "appeals" && (
        <AdminCard title="طابور الاعتراضات" tone="default">
          <div className="space-y-4">
            {appeals.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{a.user_name || a.user_code || a.user_id.slice(0, 8)}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    يعترض على: {ACTION_TYPE_AR[a.action_type] ?? a.action_type}
                  </span>
                  <span className="text-xs text-slate-500">{dt(a.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">سبب العقوبة الأصلية: {a.action_reason}</p>
                <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{a.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={appealNotes[a.id] ?? ""}
                    onChange={(e) => setAppealNotes((s) => ({ ...s, [a.id]: e.target.value }))}
                    placeholder="ملاحظات المراجعة (اختياري)"
                    className="flex-1 rounded border border-slate-200 px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => void resolveAppeal(a.id, true)}
                    disabled={busy !== null}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    قبول ورفع العقوبة
                  </button>
                  <button
                    onClick={() => void resolveAppeal(a.id, false)}
                    disabled={busy !== null}
                    className="rounded bg-slate-200 px-3 py-1.5 text-xs hover:bg-slate-300 disabled:opacity-50"
                  >
                    {busy === `appeal-${a.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "رفض الاعتراض"}
                  </button>
                </div>
              </div>
            ))}
            {appeals.length === 0 && !loading ? <p className="text-sm text-slate-500">مفيش اعتراضات معلّقة.</p> : null}
          </div>
        </AdminCard>
      )}

      {/* ---------------------------------------------------------- عقوبات */}
      {tab === "actions" && (
        <AdminCard title="العقوبات الصادرة" tone="default">
          <AdminTableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr><th>الطالب</th><th>النوع</th><th>السبب</th><th>ينتهي</th><th>الحالة</th><th>تاريخ الصدور</th><th></th></tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.user_name || a.user_code || a.user_id.slice(0, 8)}</td>
                    <td>{ACTION_TYPE_AR[a.action_type] ?? a.action_type}</td>
                    <td className="max-w-56 truncate" title={a.reason}>{a.reason}</td>
                    <td>{dt(a.expires_at)}</td>
                    <td>
                      {a.active
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">ساري</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">مرفوع</span>}
                    </td>
                    <td>{dt(a.created_at)}</td>
                    <td>
                      {a.active ? (
                        <button
                          onClick={() => void post({ action: "lift_action", actionId: a.id }, `lift-${a.id}`).then((ok) => { if (ok) void load(); })}
                          disabled={busy !== null}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          رفع
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
          {actions.length === 0 && !loading ? <p className="mt-2 text-sm text-slate-500">مفيش عقوبات.</p> : null}
        </AdminCard>
      )}

      {/* ------------------------------------------------------------ سجل */}
      {tab === "audit" && (
        <AdminCard title="سجل تدقيق الإشراف" tone="default">
          <AdminTableWrap>
            <table className="w-full text-sm">
              <thead><tr><th>الفعل</th><th>الفاعل</th><th>الهدف</th><th>تفاصيل</th><th>التاريخ</th></tr></thead>
              <tbody>
                {audit.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.action}</td>
                    <td>{l.actor_name || l.actor_id?.slice(0, 8) || "النظام"}</td>
                    <td>{l.target_type} {l.target_id?.slice(0, 8)}</td>
                    <td className="max-w-56 truncate">{l.details ? JSON.stringify(l.details) : "-"}</td>
                    <td>{dt(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
          {audit.length === 0 && !loading ? <p className="mt-2 text-sm text-slate-500">السجل فاضي.</p> : null}
        </AdminCard>
      )}

      {/* --------------------------------------------- نافذة إصدار عقوبة */}
      {penaltyFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">إجراء ضد المخالفة</h3>
            <p className="mt-1 text-sm text-slate-500">
              الهدف: {penaltyFor.target_author_name || penaltyFor.target_author_id?.slice(0, 8)} — السبب: {REASON_AR[penaltyFor.reason] ?? penaltyFor.reason}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex gap-2">
                {(["warning", "restrict", "suspend"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPenaltyType(t)}
                    className={`flex-1 rounded-lg border px-2 py-2 ${penaltyType === t ? "border-red-500 bg-red-50 font-semibold" : "border-slate-200"}`}
                  >
                    {ACTION_TYPE_AR[t]}
                  </button>
                ))}
              </div>
              {penaltyType !== "warning" ? (
                <label className="block">
                  المدة (بالأيام — اتركها فاضية للإيقاف الدائم):
                  <input
                    type="number" min={1} max={365} value={penaltyDays}
                    onChange={(e) => setPenaltyDays(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-1.5"
                  />
                </label>
              ) : null}
              <label className="block">
                سبب الإجراء (يظهر للطالب):
                <textarea
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-1.5"
                />
              </label>
              <label className="block">
                ملاحظات مراجعة التقرير (داخلية):
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-1.5"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPenaltyFor(null)} className="rounded px-4 py-2 text-sm hover:bg-slate-100">إلغاء</button>
              <button
                onClick={() => penaltyFor.target_author_id && void issuePenalty(penaltyFor, penaltyFor.target_author_id)}
                disabled={busy !== null || !penaltyReason.trim() || !penaltyFor.target_author_id}
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy === "issue" ? <Loader2 className="h-4 w-4 animate-spin" /> : "تنفيذ"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
