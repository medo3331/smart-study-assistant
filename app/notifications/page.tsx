'use client';

// ===========================================================================
// MAGICLY — صفحة الإشعارات الموحدة /notifications (C12)
// ---------------------------------------------------------------------------
// كل إشعارات المنصة في مكان واحد ومصنّفة: التفاعلات · الدعم · الإعلانات والنظام.
// الطالب يقدر يفتح الإشعار (بينقله لمكانه في المنصة)، يعليمه كمقروء، يحذفه،
// أو يعليم الكل / يحذف المقروء — من غير أي إجراء إجباري.
// ===========================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Heart, LifeBuoy, Megaphone, Info, Trash2, CheckCheck,
  Loader2, MessageCircle, UserPlus, ShieldAlert, Sparkles,
} from "lucide-react";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

type Cat = "all" | "social" | "support" | "system";

const TYPE_META: Record<string, { label: string; icon: typeof Bell; cls: string }> = {
  social: { label: "تفاعل", icon: Heart, cls: "bg-rose-50 text-rose-600" },
  support_reply: { label: "الدعم", icon: LifeBuoy, cls: "bg-sky-50 text-sky-600" },
  support_status: { label: "الدعم", icon: LifeBuoy, cls: "bg-sky-50 text-sky-600" },
  announcement: { label: "إعلان", icon: Megaphone, cls: "bg-amber-50 text-amber-600" },
  system: { label: "النظام", icon: Info, cls: "bg-slate-100 text-slate-600" },
  info: { label: "النظام", icon: Info, cls: "bg-slate-100 text-slate-600" },
  warning: { label: "تنبيه", icon: ShieldAlert, cls: "bg-orange-50 text-orange-600" },
  feature: { label: "جديد", icon: Sparkles, cls: "bg-violet-50 text-violet-600" },
};

// أيقونة أدق حسب عنوان الإشعار الاجتماعي (صداقة/رسايل/إشراف)
function socialIcon(title: string): typeof Heart {
  if (title.includes("صداقة")) return UserPlus;
  if (title.includes("مراسلة") || title.includes("رسالة")) return MessageCircle;
  if (title.includes("محظور") || title.includes("تقييد") || title.includes("إشراف") || title.includes("تحذير")) return ShieldAlert;
  if (title.includes("بلاغ") || title.includes("إبلاغ")) return ShieldAlert;
  return Heart;
}

function catOf(n: Notif): Exclude<Cat, "all"> {
  if (n.type === "social") return "social";
  if (n.type === "support_reply" || n.type === "support_status") return "support";
  return "system";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

const TABS: { id: Cat; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "social", label: "التفاعلات والرسايل" },
  { id: "support", label: "الدعم" },
  { id: "system", label: "الإعلانات والنظام" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Cat>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setItems(data.notifications ?? []);
      else setError(data.error || "تعذّر تحميل الإشعارات.");
    } catch {
      setError("مشكلة شبكة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const markAllRead = async () => {
    setBusy("all-read");
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    setBusy(null);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const deleteRead = async () => {
    setBusy("del-read");
    setItems((prev) => prev.filter((n) => !n.read_at));
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allRead: true }),
    }).catch(() => {});
    setBusy(null);
  };

  const open = async (n: Notif) => {
    await markRead(n.id);
    if (n.link_url) router.push(n.link_url);
  };

  const filtered = useMemo(
    () => (cat === "all" ? items : items.filter((n) => catOf(n) === cat)),
    [items, cat],
  );

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8" dir="rtl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <Bell className="h-6 w-6 text-marker" />
            الإشعارات
            {unread > 0 && (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">{unread}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">كل حاجة حصلت في المنصة — تفاعلات، رسايل، دعم، وإعلانات.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void markAllRead()}
            disabled={busy !== null || unread === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper-2 disabled:opacity-40"
          >
            {busy === "all-read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            تعليم الكل كمقروء
          </button>
          <button
            onClick={() => void deleteRead()}
            disabled={busy !== null || items.length === unread}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
          >
            {busy === "del-read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            حذف المقروء
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setCat(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              cat === t.id ? "bg-marker text-white" : "bg-paper-2 text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-paper-2" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-rule bg-paper-2 p-10 text-center">
          <Bell className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="font-semibold text-ink">مفيش إشعارات هنا</p>
          <p className="mt-1 text-sm text-ink-soft">أول ما حاجة تحصل في المنصة هتلاقيها في الصفحة دي.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.info;
            const Icon = n.type === "social" ? socialIcon(n.title) : meta.icon;
            const isUnread = !n.read_at;
            return (
              <li
                key={n.id}
                className={`group rounded-xl border p-3.5 transition ${
                  isUnread ? "border-marker/30 bg-marker/5" : "border-rule bg-paper-2/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <button onClick={() => void open(n)} className="min-w-0 flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{n.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-rose-600" />}
                    </div>
                    {n.body ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link_url && (
                      <button
                        onClick={() => void open(n)}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-marker hover:bg-marker/10"
                      >
                        فتح
                      </button>
                    )}
                    {isUnread && (
                      <button
                        onClick={() => void markRead(n.id)}
                        disabled={busy !== null}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        title="تعليم كمقروء"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      onClick={() => void remove(n.id)}
                      disabled={busy !== null}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      title="حذف"
                      aria-label={`حذف إشعار: ${n.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
