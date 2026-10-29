"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Announcement = {
  id: string;
  title: string;
  body: string;
  publish_at?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AnnouncementToast() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const readIdsRef = useRef<Set<string>>(new Set());
  const shownIdsRef = useRef<Set<string>>(new Set());

  const loadReads = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: reads } = await supabase.from("announcement_reads").select("announcement_id").eq("user_id", user.id);
    readIdsRef.current = new Set((reads ?? []).map((row: any) => row.announcement_id));
  }, []);

  const loadAnnouncements = useCallback(async () => {
    if (!hasUser) return;
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.status === 401 || !res.ok || !data?.success) return;
      await loadReads();
      const incoming: Announcement[] = Array.isArray(data.announcements) ? data.announcements : [];
      const unread = incoming.filter((a) => !readIdsRef.current.has(a.id) && !shownIdsRef.current.has(a.id));
      if (unread.length > 0) {
        shownIdsRef.current = new Set([...shownIdsRef.current, ...unread.map((a) => a.id)]);
        setQueue((prev) => [...prev, ...unread]);
      }
    } catch {}
  }, [hasUser, loadReads]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const sync = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setHasUser(Boolean(data.user));
      } catch {
        if (mounted) setHasUser(false);
      } finally {
        if (mounted) setAuthReady(true);
      }
    };
    sync();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setHasUser(Boolean(session?.user));
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authReady || !hasUser) return;
    loadAnnouncements();
    const interval = window.setInterval(loadAnnouncements, 30000);
    return () => window.clearInterval(interval);
  }, [authReady, hasUser, loadAnnouncements]);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue((prev) => prev.slice(1));
      setExpanded(false);
    }
  }, [current, queue]);

  const close = async () => {
    if (!current) return;
    readIdsRef.current.add(current.id);
    try { await fetch(`/api/announcements/${current.id}/read`, { method: "POST" }); } catch {}
    setCurrent(null);
    setExpanded(false);
  };

  if (!authReady || !hasUser || !current) return null;
  const date = formatDate(current.publish_at || current.created_at);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="إعلان جديد" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-blue-200 bg-blue-50 text-blue-950 shadow-2xl dark:border-blue-900/60 dark:bg-blue-950/90 dark:text-blue-50">
        <div className="flex items-start justify-between gap-4 border-b border-blue-200/70 p-5 dark:border-blue-800/70">
          <div className="min-w-0 space-y-2">
            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900/70 dark:text-blue-100">إعلان جديد</span>
            {date && <time className="block text-xs text-blue-700/80 dark:text-blue-200/80">{date}</time>}
            <h2 className="break-words text-xl font-bold leading-8">{current.title}</h2>
          </div>
          <button type="button" onClick={close} className="shrink-0 rounded-xl border border-blue-300 bg-white/70 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-white dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-100 dark:hover:bg-blue-900" aria-label="إغلاق الإعلان">إغلاق</button>
        </div>
        <div className="space-y-4 p-5">
          <p className={`whitespace-pre-wrap break-words text-sm leading-8 sm:text-base ${expanded ? "" : "line-clamp-6"}`}>{current.body}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded-xl border border-blue-300 bg-white/70 px-4 py-2 text-sm font-medium text-blue-800 transition hover:bg-white dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-100 dark:hover:bg-blue-900">{expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}</button>
            <button type="button" onClick={close} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500">تم</button>
          </div>
        </div>
      </div>
    </div>
  );
}