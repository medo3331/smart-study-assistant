// ===========================================================================
// MAGICLY — Community C4: فحص المحتوى بالذكاء الاصطناعي قبل النشر
// ---------------------------------------------------------------------------
// scanCommunityText — يصنّف نص المنشور/التعليق: سليم أم مخالف بقواعد المجتمع.
//fail-open: أي خطأ/مهلة ⇒ يُسمح بالنشر ويُسجَّل أن الفحص لم يكتمل (مراجعة لاحقة).
// ===========================================================================

import "server-only";
import { completeChatWithProviderFallback } from "@/lib/ai/routing";

export type ScanVerdict = {
  /** هل اكتمل الفحص فعليًا (خطأ في المزوّد ⇒ false) */
  scanned: boolean;
  violation: boolean;
  category?: string;
  snippet?: string;
};

const SYSTEM_PROMPT = [
  "أنت نظام إشراف لمجتمع طلابي تعليمي اسمه Magicly Community.",
  "مهمتك: تصنيف نص المنشور هل يخالف قواعد المجتمع أم لا.",
  "المخالفات: التنمر والإهانة، التحرش والمضايقات، خطاب الكراهية،",
  "نشر بيانات شخصية (أرقام/عناوين)، انتحال الشخصية، السبام والإعلانات،",
  "التهديد والعنف، المحتوى غير القانوني أو الإباحي.",
  "المنشورات الدراسية والأسئلة والسخرية الخفيفة والآراء العادية مسموحة.",
  "أجب بـ JSON فقط بدون أي شرح:",
  '{"violation": true|false, "category": "harassment|hate|bullying|spam|doxxing|impersonation|threat|illegal|other|null"}',
].join("\n");

const SCAN_TIMEOUT_MS = 8_000;

function parseVerdict(content: string): ScanVerdict {
  // نتخلص من أسوار الكود لو الموديل رجّعها
  const cleaned = content.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return { scanned: false, violation: false };
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    violation?: unknown;
    category?: unknown;
  };
  const violation = parsed.violation === true;
  const category = typeof parsed.category === "string" ? parsed.category : undefined;
  return { scanned: true, violation, category };
}

export async function scanCommunityText(text: string): Promise<ScanVerdict> {
  const trimmed = text.trim();
  if (trimmed.length < 3) return { scanned: false, violation: false };
  try {
    const response = await Promise.race([
      completeChatWithProviderFallback({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed.slice(0, 2000) },
        ],
        temperature: 0,
        maxTokens: 100,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("scan_timeout")), SCAN_TIMEOUT_MS),
      ),
    ]);
    return parseVerdict(response.content);
  } catch (e) {
    // fail-open: لا نحجب المحتوى بسبب عطل فحص — نسجّل أن الفحص لم يكتمل
    console.error("[community/moderation] scan failed (fail-open):", e instanceof Error ? e.message : e);
    return { scanned: false, violation: false };
  }
}

/** تسجيل محتوى حجبه الفحص الآلي في سجل التدقيق (للمراجعة البشرية). */
export async function logBlockedContent(
  userId: string,
  kind: "post" | "comment",
  text: string,
  category?: string,
): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const service = createServiceClient();
    await service.from("moderation_audit_log").insert({
      actor_id: userId,
      action: "ai_content_blocked",
      target_type: kind,
      details: { category: category ?? null, snippet: text.slice(0, 200) },
    });
  } catch (e) {
    console.error("[community/moderation] audit log failed:", e instanceof Error ? e.message : e);
  }
}
