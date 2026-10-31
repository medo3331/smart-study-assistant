"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience?: string;
  publish_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        setAnnouncements([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (!res.ok || !data?.success) {
        setAnnouncements([]);
        setError(data?.error || "تعذر تحميل الإعلانات.");
        setLoading(false);
        return;
      }

      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
      setError(null);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: reads } = await supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("user_id", user.id);

        setReadIds(new Set((reads ?? []).map((row: any) => row.announcement_id)));
      }
    } catch {
      setAnnouncements([]);
      setError("تعذر تحميل الإعلانات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/announcements/${id}/read`, { method: "POST" });
      setReadIds((prev) => new Set(prev).add(id));
    } catch {
      // Keep the announcement hidden locally even if the receipt fails.
    }
  };

  const visible = announcements.filter(
    (announcement) =>
      !readIds.has(announcement.id) && !dismissedIds.has(announcement.id),
  );

  if (loading || visible.length === 0) return null;

  return (
    <section
      aria-label="الإعلانات"
      dir="rtl"
      className="mb-6 space-y-3"
    >
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {visible.map((announcement) => {
        const date = formatDate(announcement.publish_at || announcement.created_at);

        return (
          <article
            key={announcement.id}
            className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 text-blue-950 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-50"
          >
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900/70 dark:text-blue-100">
                    إعلان
                  </span>
                  {date && (
                    <time className="text-xs text-blue-700/80 dark:text-blue-200/80">
                      {date}
                    </time>
                  )}
                </div>

                <h2 className="break-words text-base font-bold leading-7 text-blue-950 dark:text-blue-50 sm:text-lg">
                  {announcement.title}
                </h2>

                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-blue-900 dark:text-blue-100 sm:text-base">
                  {announcement.body}
                </p>
              </div>

              <button
                type="button"
                onClick={() => dismiss(announcement.id)}
                className="shrink-0 rounded-xl border border-blue-300 bg-white/70 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-white dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-100 dark:hover:bg-blue-900"
                aria-label="إغلاق الإعلان"
              >
                إغلاق
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}