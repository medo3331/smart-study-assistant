import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/components/dashboard/components/use-page-data";
import type { StudyDay } from "@/app/dashboard/components/types";
import { EmptyState, LoadingSheets } from "@/components/dashboard/components/PageShell";
import ProgressBar from "@/components/common/ProgressBar";

export default function LessonsPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();

  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [days, setDays] = useState<StudyDay[]>([]);
  const [configSubject, setConfigSubject] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.status !== "ready") return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("active_config_id")
        .eq("id", session.user.id)
        .maybeSingle();
      const active = (data as { active_config_id: string | null } | null)?.active_config_id ?? null;
      if (active) {
        const { data: rows } = await supabase
          .from("study_configs")
          .select("subject")
          .eq("id", active)
          .limit(1);
        setConfigSubject((rows as { subject: string }[])[0]?.subject ?? "");
      }
    })();
  }, [session, supabase]);

  useEffect(() => {
    if (session?.status === "loading" || session?.status === "anonymous") return;
    if (session?.status === "error") return;
    (async () => {
      const { data, error } = await supabase
        .from("study_days")
        .select("id, day, title, topic, is_completed")
        .eq("user_id", session.user.id)
        .order("day", { ascending: true });
      if (error) { setError(error.message); setState("error"); return; }
      const parsed = (data ?? []).map((r: any) => ({
        id: r.id,
        day: Number(r.day),
        title: r.title || `اليوم ${r.day}`,
        topic: r.topic || "درس",
        is_completed: Boolean(r.is_completed)
      })) as StudyDay[];
      setDays(parsed);
      setState(parsed.length ? "ready" : "empty");
    })();
  }, [session, supabase]);

  const done = days.filter(d => d.is_completed).length;
  const pct = days.length ? Math.round((done / days.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">الدروس</h1>
          <p className="text-sm text-ink-soft">خطوات الخطة مرتبة — اضغط اليوم لتبدأ</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="tag">
            <span className="mono">{done}/{days.length}</span> مكتمل
          </span>
          <ProgressBar pct={pct} barClass="meter-sm" />
        </div>
      </div>

      {configSubject && <div className="sheet-card p-4"><p className="tag">المادة: {configSubject}</p></div>}

      {state === "loading" && <LoadingSheets count={1} />}

      {state === "empty" && (
        <EmptyState
          icon="📖"
          title="ما في خطة دروس"
          body="ابدأ خطة من الداشبورد"
          action={<button className="btn btn-marker" onClick={() => router.push("/dashboard")}>ابدأ خطة</button>}
        />
      )}

      {state === "error" && <div className="sheet-card p-5 text-redpen">{error}</div>}

      {state === "ready" && days.length > 0 && (
        <div className="space-y-0">
          {days.map((day, i) => (
            <Link
              key={day.id}
              href={"/lesson/" + day.day}
              className={"sheet-card flex items-start gap-3 rounded p-4" + (day.is_completed ? " opacity-60" : "")}
            >
              <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display font-black text-sm " + (day.is_completed ? "bg-emerald/15 text-emerald" : "bg-white/5 text-ink-soft")}>
                <span className="mono text-[9px]">{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink truncate">{day.title}</h3>
                  {day.is_completed && <span className="tag">مكتمل</span>}
                </div>
                <p className="text-[11px] text-ink-soft mt-0.5">{day.topic}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
