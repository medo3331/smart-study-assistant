"use client";

// ===========================================================================
// MAGICLY — جرس الإشعارات العائم (C12)
// ---------------------------------------------------------------------------
// القايمة بتنفتح لليمين (اتجاه الطبيعي في RTL لما الجرس على حد الشاشة)،
// بتعليم المقروء عند الفتح، وتحيل لصفحة /notifications لكل الإشعارات.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Heart, LifeBuoy, Megaphone, Info, ShieldAlert, Sparkles, ArrowLeft } from "lucide-react";

type Notif = { id: string; title: string; body: string; type: string; read_at: string | null; link_url: string | null; created_at: string };

const TYPE_META: Record<string, { icon: typeof Bell; cls: string }> = {
  social: { icon: Heart, cls: "bg-rose-500/15 text-rose-400" },
  support_reply: { icon: LifeBuoy, cls: "bg-sky-500/15 text-sky-400" },
  support_status: { icon: LifeBuoy, cls: "bg-sky-500/15 text-sky-400" },
  announcement: { icon: Megaphone, cls: "bg-amber-500/15 text-amber-400" },
  system: { icon: Info, cls: "bg-slate-500/15 text-slate-300" },
  info: { icon: Info, cls: "bg-slate-500/15 text-slate-300" },
  warning: { icon: ShieldAlert, cls: "bg-orange-500/15 text-orange-400" },
  feature: { icon: Sparkles, cls: "bg-violet-500/15 text-violet-400" },
};

function socialIcon(title: string): typeof Heart {
  if (title.includes("صداقة") || title.includes("مراسلة")) return Heart;
  if (title.includes("بلاغ") || title.includes("إشراف") || title.includes("محظور")) return ShieldAlert;
  return Heart;
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} سا`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setItems(
          (data.notifications ?? []).map((n: Record<string, unknown>) => ({
            id: n.id as string,
            title: n.title as string,
            body: (n.body ?? n.message ?? "") as string,
            type: n.type as string,
            read_at: (n.read_at ?? null) as string | null,
            link_url: (n.link_url ?? null) as string | null,
            created_at: n.created_at as string,
          })),
        );
      }
    } catch {
      // تجاهل — الجرس بيتحدث لما يتفتح
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // تحديث كل دقيقة + إغلاق بالضغط بره
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => { clearInterval(t); document.removeEventListener("mousedown", onClick); };
  }, [load]);

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
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const openItem = async (n: Notif) => {
    setOpen(false);
    await markRead(n.id);
    if (n.link_url) router.push(n.link_url);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) void load(); }}
        className="relative rounded-full p-2 hover:bg-slate-800"
        aria-label={`الإشعارات${unread ? ` — ${unread} غير مقروء` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          /* left-0: البانل بيمتد لليمين من الجرس — مش بيطلع بره الشاشة شمال */
          className="absolute left-0 z-50 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl text-right"
          role="dialog"
          aria-label="الإشعارات الأخيرة"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-amber-300">الإشعارات</p>
            {unread > 0 && (
              <button onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400">
                <CheckCheck className="h-3 w-3" /> تعليم الكل
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="py-4 text-xs text-slate-400">مفيش إشعارات لسه</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {items.slice(0, 8).map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.info;
                const Icon = n.type === "social" ? socialIcon(n.title) : meta.icon;
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => void openItem(n)}
                      className={`flex w-full items-start gap-2 rounded-lg p-2 text-right transition hover:bg-slate-800 ${isUnread ? "bg-slate-800/70" : ""}`}
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-slate-100">{n.title}</span>
                          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                        </span>
                        {n.body ? <span className="mt-0.5 line-clamp-1 block text-[11px] text-slate-400">{n.body}</span> : null}
                        <span className="mt-0.5 block text-[10px] text-slate-500">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            onClick={() => { setOpen(false); router.push("/notifications"); }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-amber-300 transition hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            كل الإشعارات
          </button>
        </div>
      )}
    </div>
  );
}
