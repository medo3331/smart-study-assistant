// ===========================================================================
// MAGICLY — Community C16: /api/admin/community/quiz-builder
// ---------------------------------------------------------------------------
// GET  — قائمة المسابقات المخصصة (admin_list_competitions)
// POST — create | set_status | generate (Magic AI يولّد أسئلة الكويز)
// صلاحية الوصول: community.moderate (owner/admin/support)
// ===========================================================================

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveActor, actorHasPermission } from "@/lib/policy";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GenQuestion = { q: string; options: string[]; correct: number };

function sanitizeQuestions(input: unknown): GenQuestion[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: GenQuestion[] = [];
  for (const raw of input) {
    const q = raw as { q?: unknown; options?: unknown; correct?: unknown };
    if (typeof q.q !== "string" || q.q.trim().length < 3) continue;
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) continue;
    const options = q.options.map((o) => String(o ?? "").trim()).filter(Boolean);
    if (options.length < 2) continue;
    const correct = Number(q.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) continue;
    out.push({ q: q.q.trim().slice(0, 500), options: options.map((o) => o.slice(0, 200)), correct });
  }
  return out.length > 0 ? out : null;
}

async function guard() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  const actor = await resolveActor(supabase, user.id, user.email ?? null);
  if (!actorHasPermission(actor, "community.moderate")) return null;
  return { userId: user.id, service: createServiceClient() };
}

export async function GET() {
  const g = await guard();
  if (!g) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

  const { data, error } = await g.service.rpc("admin_list_competitions");
  const payload = (data ?? {}) as { ok?: boolean; code?: string; competitions?: unknown[] };
  if (error || payload.ok !== true) {
    console.error("[quiz-builder] list error:", error ?? payload.code);
    return NextResponse.json({ success: false, error: "تعذّر تحميل المسابقات." }, { status: 500 });
  }
  return NextResponse.json({ success: true, competitions: payload.competitions ?? [] });
}

export async function POST(req: Request) {
  const g = await guard();
  if (!g) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (typeof action !== "string") {
    return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
  }

  switch (action) {
    case "create": {
      const questions = sanitizeQuestions(body.questions);
      if (typeof body.title !== "string" || body.title.trim().length < 3) {
        return NextResponse.json({ success: false, error: "العنوان مطلوب." }, { status: 400 });
      }
      if (!questions) {
        return NextResponse.json({ success: false, error: "لازم سؤال واحد صالح على الأقل (نص + اختيارين + إجابة صحيحة)." }, { status: 400 });
      }
      const { data, error } = await g.service.rpc("admin_create_competition", {
        p_title: body.title,
        p_questions: questions,
        p_description: typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null,
        p_emoji: typeof body.emoji === "string" && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : "🏆",
        p_subject: typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 80) : null,
        p_time_limit_seconds:
          Number.isInteger(body.timeLimitSeconds) && (body.timeLimitSeconds as number) >= 30 && (body.timeLimitSeconds as number) <= 3600
            ? body.timeLimitSeconds
            : null,
        p_days: Number.isInteger(body.days) && (body.days as number) >= 1 && (body.days as number) <= 90 ? body.days : 7,
      });
      const payload = (data ?? {}) as { ok?: boolean; code?: string; id?: string; questions?: number };
      if (error || payload.ok !== true) {
        console.error("[quiz-builder] create error:", error ?? payload.code);
        return NextResponse.json({ success: false, error: "تعذّر إنشاء المسابقة." }, { status: 500 });
      }
      return NextResponse.json({ success: true, id: payload.id, questionCount: payload.questions });
    }

    case "set_status": {
      if (typeof body.id !== "string" || !UUID_RE.test(body.id) ||
          (body.status !== "active" && body.status !== "ended")) {
        return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
      }
      const { data, error } = await g.service.rpc("admin_set_competition_status", { p_id: body.id, p_status: body.status });
      const payload = (data ?? {}) as { ok?: boolean; code?: string };
      if (error || payload.ok !== true) {
        return NextResponse.json({ success: false, error: "تعذّر تحديث الحالة." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    case "generate": {
      // 🤖 Magic AI: توليد أسئلة كويز من موضوع — اقتراح فقط، الأدمن يعدّل ويوافق
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      const count = Number.isInteger(body.count) && (body.count as number) >= 3 && (body.count as number) <= 15 ? body.count : 5;
      const level = typeof body.level === "string" ? body.level.trim() : "ثانوي";
      if (topic.length < 3) {
        return NextResponse.json({ success: false, error: "اكتب موضوع المسابقة أولًا." }, { status: 400 });
      }
      try {
        const { completeChatWithProviderFallback } = await import("@/lib/ai/routing");
        const aiResponse = await Promise.race([
          completeChatWithProviderFallback({
            messages: [
              {
                role: "system",
                content: [
                  `أنت مساعد مجتمع Magicly الطلابي. مهمتك توليد ${count} سؤال اختيار من متعدد بالعربية عن: ${topic}.`,
                  `المستوى: ${level}. الأسئلة أكاديمية دقيقة ومحايدة وبدون أي محتوى مخالف.`,
                  "أجب بـ JSON فقط بدون أي شرح، بالشكل ده بالظبط:",
                  '{"questions": [{"q": "نص السؤال", "options": ["اختيار 1", "اختيار 2", "اختيار 3", "اختيار 4"], "correct": 0}]}',
                  '"correct" هو فهرس الإجابة الصحيحة (يبدأ من 0). كل سؤال له 4 اختيارات.',
                ].join("\n"),
              },
              { role: "user", content: `ولّد ${count} أسئلة عن: ${topic}` },
            ],
            temperature: 0.4,
            maxTokens: 2000,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("generate_timeout")), 25_000),
          ),
        ]);
        const cleaned = (aiResponse.content ?? "").replace(/```(?:json)?/g, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start === -1 || end <= start) {
          return NextResponse.json({ success: false, error: "المساعد مش متاح حاليًا — جرّب تاني." }, { status: 502 });
        }
        let parsed: { questions?: unknown };
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1)) as { questions?: unknown };
        } catch {
          return NextResponse.json({ success: false, error: "المساعد رجّع صيغة مش مفهومة — جرّب تاني." }, { status: 502 });
        }
        const questions = sanitizeQuestions(parsed.questions);
        if (!questions) {
          return NextResponse.json({ success: false, error: "المساعد رجّع أسئلة غير صالحة — جرّب تاني." }, { status: 502 });
        }
        return NextResponse.json({ success: true, questions });
      } catch (e) {
        // مهلة أو فشل مزوّد — ردّ JSON واضح بدل كراش الفانكشن (502)
        console.error("[quiz-builder] generate failed:", e instanceof Error ? e.message : e);
        return NextResponse.json({ success: false, error: "المساعد أخد وقت طويل — جرّب تاني بعد شوية." }, { status: 503 });
      }
    }

    default:
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  }
}
