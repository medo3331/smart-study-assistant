// ===========================================================================
// MAGICLY — Community C7: مساعد Magic AI لكتابة المنشورات
// ---------------------------------------------------------------------------
// POST /api/community/ai-assist
// Body: { mode: "improve" | "expand" | "hashtags", text }
//  - improve:  يحسّن صياغة المنشور بنفس المعنى (عربي بسيط)
//  - expand:   يحوّل فكرة قصيرة إلى منشور جاهز
//  - hashtags: يقترح 3–5 هاشتاجات مناسبة
// fail-closed مع رسالة ودية، rate limit 20 طلب/ساعة لكل مستخدم.
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";
import { completeChatWithProviderFallback } from "@/lib/ai/routing";

export const dynamic = "force-dynamic";

const AI_TIMEOUT_MS = 12_000;
const MAX_TEXT = 2000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const MODES = {
  improve: [
    "أنت مساعد Magic AI في مجتمع Magicly الطلابي.",
    "حسّن صياغة المنشور التالي بنفس المعنى واللهجة، اجعله أوضح وأجمل وأقصر ما يمكن،",
    "بدون تغيير المعنى وبدون إضافة معلومات من عندك. أرجع النص المحسّن فقط بدون أي شرح أو أسوار كود.",
  ].join(" "),
  expand: [
    "أنت مساعد Magic AI في مجتمع Magicly الطلابي.",
    "المستخدم كتب فكرة قصيرة أو نقط عن منشور يريد نشره في مجتمع طلابي تعليمي.",
    "اكتب له منه منشورًا جاهزًا بالعامية المصرية البسيطة (سطرين إلى أربعة أسطر)،",
    "ودّي ومحترم ومناسب لمجتمع طلابي. أرجع المنشور فقط بدون أي شرح أو أسوار كود.",
  ].join(" "),
  hashtags: [
    "أنت مساعد Magic AI في مجتمع Magicly الطلابي.",
    "اقترح من 3 إلى 5 هاشتاجات مناسبة للمنشور التالي (كلمات عربية بسيطة بدون مسافات،",
    "كل واحدة تبدأ بـ#). أرجع الهاشتاجات في سطر واحد مفصولة بمسافات فقط، بدون أي شرح.",
  ].join(" "),
} as const;

type Mode = keyof typeof MODES;

function rateLimit(userId: string): boolean {
  const store =
    ((globalThis as unknown as { communityAiRate?: Record<string, { count: number; ts: number }> })
      .communityAiRate) ?? {};
  const now = Date.now();
  const entry = store[userId];
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    store[userId] = { count: 1, ts: now };
  } else {
    entry.count += 1;
    if (entry.count > RATE_LIMIT) return false;
  }
  (globalThis as unknown as { communityAiRate?: Record<string, { count: number; ts: number }> }).communityAiRate = store;
  return true;
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    if (!rateLimit(auth.user.id)) {
      return NextResponse.json({ success: false, error: "استخدمت المساعد كتير — حاول بعد شوية." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const mode = body?.mode as Mode;
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!mode || !(mode in MODES)) {
      return NextResponse.json({ success: false, error: "Invalid mode." }, { status: 400 });
    }
    if (!text || text.length > MAX_TEXT) {
      return NextResponse.json({ success: false, error: "اكتب فكرتك أولًا (حتى 2000 حرف)." }, { status: 400 });
    }

    const response = await Promise.race([
      completeChatWithProviderFallback({
        messages: [
          { role: "system", content: MODES[mode] },
          { role: "user", content: text },
        ],
        temperature: mode === "hashtags" ? 0.3 : 0.7,
        maxTokens: 600,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ai_assist_timeout")), AI_TIMEOUT_MS),
      ),
    ]);

    let result = (response.content ?? "").replace(/```(?:text|markdown)?/g, "").trim();
    if (!result) {
      return NextResponse.json({ success: false, error: "المساعد مارجعش نتيجة — حاول تاني." }, { status: 502 });
    }
    if (mode === "hashtags") {
      // تنظيف: هاشتاجات في سطر واحد، بلا ترقيم
      result = result.split(/\s+/).filter((w) => w.startsWith("#")).slice(0, 5).join(" ");
      if (!result) {
        return NextResponse.json({ success: false, error: "المساعد ماقدرش يقترح هاشتاجات — حاول تاني." }, { status: 502 });
      }
      // نضيفها للنص بدل استبداله
      const current = text.trim();
      result = current.includes(result) ? current : `${current}\n\n${result}`;
    }
    if (result.length > MAX_TEXT) result = result.slice(0, MAX_TEXT);

    return NextResponse.json({ success: true, text: result });
  } catch (e) {
    const msg = e instanceof Error && e.message === "ai_assist_timeout"
      ? "المساعد بطّأ — حاول تاني."
      : "المساعد مش متاح حاليًا — جرب تاني بعد شوية.";
    console.error("[community/ai-assist]", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
