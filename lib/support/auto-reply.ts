// ===========================================================================
// MAGICLY — مساعد الدعم الفني: رد تلقائي على تذاكر الدعم
// ---------------------------------------------------------------------------
// لما الطالب يفتح تذكرة أو يرد عليها، المساعد بيرد ردًا تلقائيًا مفيدًا.
// القواعد:
//  - الرد التلقائي بيتعلم بـ"🤖" في أول السطر — ومفيش ردين تلقائيين ورا بعض:
//    آخر رسالة "admin" لو بدأت بـ"🤖" يعني لسه مفيش رد بشري ⇒ نسيب المكان للبشر.
//  - فشل المساعد ⇒ رد احتياطي بشري اللمسة (مفيش تذكرة من غير رد).
//  - مهلة 12 ثانية — أي تجاوز ⇒ الرد الاحتياطي.
// ===========================================================================

import "server-only";
import { completeChatWithProviderFallback } from "@/lib/ai/routing";
import { createServiceClient } from "@/lib/supabase/admin";

const AUTO_MARKER = "🤖";

const SYSTEM_PROMPT = [
  "أنت مساعد الدعم الفني لمنصة Magicly (منصة مساعدة دراسية للطلاب المصرية).",
  "وظيفتك: أول رد تلقائي على تذكرة الدعم — طمّن الطالب، لخّص فهمك للمشكلة في سطر،",
  "وقدم حلولًا عملية سريعة (خطوات واضحة) لتظهر المشاكل الشائعة: تسجيل الدخول، الحساب،",
  "الدفع والاشتراكات، الملفات والمحاضرات، الأداء، وأخطاء التطبيق.",
  "اكتب بالعامية المصرية البسيطة والودّية، 3 إلى 6 أسطر كحد أقصى.",
  "لو المشكلة معقدة أو تحتاج قرار بشري (استرداد أموال، مشكلة حساب حساسة)،",
  "قل له إن فريق الدعم البشري هيراجع التذكرة ويرد عليه قريبًا.",
  "لا تخترع سياسات أو وعودًا بإرجاع أموال — اكتفِ بتوجيهه للفريق البشري.",
].join(" ");

const AI_TIMEOUT_MS = 12_000;

const FALLBACK_REPLY =
  "وصلتنا رسالتك وسجّلنا التذكرة ✅ — فريق الدعم هيراجعها ويرد عليك من هنا في أقرب وقت. " +
  "لو عندك تفاصيل إضافية (screenshots أو رسالة الخطأ) ابعتهم في نفس المحادثة دي.";

/** هل آخر رد من فريق الدعم تلقائي؟ (يعني لسه مفيش تدخل بشري بعد آخر رسالة طالب) */
async function lastAdminReplyIsAuto(ticketId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("support_messages")
    .select("author_role, body")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as { author_role: string; body: string }[];
  // أول رسالة admin من الآخر — لو تلقائية ⇒ ما نضيفش تلقائي تاني
  for (const row of rows) {
    if (row.author_role === "admin") return row.body.startsWith(AUTO_MARKER);
  }
  return false;
}

export async function insertSupportAutoReply(
  ticketId: string,
  userId: string,
  userMessage: string,
): Promise<void> {
  try {
    if (await lastAdminReplyIsAuto(ticketId)) return;

    let body: string;
    try {
      const response = await Promise.race([
        completeChatWithProviderFallback({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage.slice(0, 3000) },
          ],
          temperature: 0.5,
          maxTokens: 400,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("auto_reply_timeout")), AI_TIMEOUT_MS),
        ),
      ]);
      const content = (response.content ?? "").trim();
      body = content ? `${AUTO_MARKER} رد تلقائي من مساعد Magicly\n\n${content}` : FALLBACK_REPLY;
    } catch {
      body = FALLBACK_REPLY;
    }

    const service = createServiceClient();
    await service.from("support_messages").insert({
      ticket_id: ticketId,
      author_id: userId,
      author_role: "admin",
      body,
    });
  } catch (e) {
    // الرد التلقائي ليس حرجًا — لا نعطل إنشاء التذكرة بسبب فشله
    console.error("[support/auto-reply]", e instanceof Error ? e.message : e);
  }
}
