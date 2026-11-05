"use client";
/* eslint-disable react-hooks/set-state-in-effect -- resolving the active course from Supabase and syncing the entry state is intentional */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DataNotice,
  EmptyState,
  LoadingSheets,
  PageShell,
} from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import { fetchActiveCourseId } from "@/lib/pages-data";

/* ==========================================================================
   مدخل «الدروس» من السايدبار

   الصفحة دي بتوجّه المستخدم لدروس المادة النشطة (/lessons/[configId]).
   لو مفيش مادة نشطة، بتعرض اختيار مادة بدل قايمة دروس فاضية.
   ========================================================================== */

type EntryState = "loading" | "no-course" | "error";

export default function LessonsEntryPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const [state, setState] = useState<EntryState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      setState("no-course");
      return;
    }
    if (session.status === "error") {
      setError(session.message);
      setState("error");
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await fetchActiveCourseId(supabase, session.user.id);
      if (cancelled) return;

      if (result.error) {
        setError(result.error.message);
        setState("error");
        return;
      }
      if (!result.data) {
        setState("no-course");
        return;
      }

      router.replace(`/lessons/${result.data}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, supabase, router]);

  if (state === "error") {
    return (
      <PageShell eyebrow="الدروس" title="الدروس">
        <DataNotice message={error ?? "حصل خطأ غير متوقع."} />
      </PageShell>
    );
  }

  if (state === "no-course") {
    return (
      <PageShell eyebrow="الدروس" title="الدروس">
        <EmptyState
          icon="📚"
          title="مفيش مادة مفتوحة"
          body="اختار مادة من قايمة المواد، أو ابدأ مادة جديدة عشان تشوف دروسها."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/courses")}
                className="btn btn-quiet text-sm"
              >
                كل المواد
              </button>
              <button
                type="button"
                onClick={() => router.push("/assessment")}
                className="btn btn-marker text-sm"
              >
                مادة جديدة
              </button>
            </div>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="الدروس" title="الدروس" lede="بنفتح دروس مادتك الحالية…">
      <LoadingSheets count={2} />
    </PageShell>
  );
}
