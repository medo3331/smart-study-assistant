import { NextResponse } from "next/server";
import { checkRateLimit, clampText } from "@/lib/api-guard";
import { createClient } from "@/lib/supabase/server";

/* ==========================================================================
   استقبال رأي المستخدم في الميزات

   الرأي بيتبعت على إيميلك عن طريق Resend (اختيار المستخدم على جدول
   Supabase — قرار ٣ أغسطس ٢٠٢٦).

   ⚠️ مبدأ مهم: **الإيميل مش بديل عن اللوج.** كل رأي بيتسجّل في
   console.log الأول وبعدين بيحاول يتبعت. السبب: لو مفتاح Resend مش
   مظبوط أو الخدمة واقعة، الرأي مايضيعش — تلاقيه في Vercel → Logs.
   ودي مش حالة نظرية: الميزة دي هتشتغل قبل ما تظبّط المفتاح بالتأكيد.

   وكمان: فشل الإرسال **مايوصلش للمستخدم كخطأ**. هو عمل اللي عليه وضغط
   الزرار؛ إن الإيميل مامشيش دي مشكلتنا احنا. بيشوف «وصلت، شكراً» في
   كل الحالات إلا لو الطلب نفسه باظ.
   ========================================================================== */

const MAX_PAGE_CHARS = 60;
const MAX_COMMENT_CHARS = 1000;
const MAX_META_CHARS = 200;

/** الصفحات المسموحة — قايمة مقفولة عشان مايتحقنش أي نص في الإيميل. */
const KNOWN_PAGES = new Set([
  "landing",
  "login",
  "assessment",
  "dashboard",
  "lesson",
  "workspace",
  "courses",
  "planner",
  "calendar",
  "achievements",
  "career",
  "slides",
  "community",
  "exam-plan",
  "ai-chat",
  "agents",
  "shop",
  "inventory",
]);

export async function POST(req: Request) {
  try {
    /* ------------------------------------------------------------------
       ⚠️ الراوت ده **مش** بيستخدم requireUser — وده الراوت الوحيد كده.

       السبب: أغلى رأي في الموقع هو رأي الزائر اللي شاف اللاندينج
       وما كمّلش. لو طلبنا تسجيل دخول، الودجت على اللاندينج بتبقى
       زرار بيرمي خطأ — يعني بنقفل الباب في وش الناس اللي احنا عايزين
       نفهم ليه مشيوا.

       اللي بيحمي الراوت بدل تسجيل الدخول:
         • حد استخدام على الـ IP للزوار (أقل من المسجّلين)
         • قايمة صفحات مقفولة (KNOWN_PAGES)
         • قص كل النصوص بـ clampText
         • مفيش كتابة في الداتابيز خالص — لوج وإيميل بس
       ------------------------------------------------------------------ */
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // هوية للحد: المستخدم لو مسجّل، وإلا الـ IP.
    // ⚠️ x-forwarded-for ممكن يتزوّر، بس ده حد استخدام مش تحقّق هوية —
    // أسوأ حالة إن حد يتخطّى الحد، وأسوأ نتيجة لوج زيادة.
    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limitKey = user ? `feedback:${user.id}` : `feedback:ip:${ip}`;
    // الزائر ٤ في الدقيقة، المسجّل ١٠. الودجت نفسها بتمنع التكرار على
    // نفس الصفحة، فالحد ده للحماية من إساءة الاستخدام بس.
    const limited = checkRateLimit(limitKey, user ? 10 : 4, 60_000, "success");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "البيانات المبعوتة غير صالحة." },
        { status: 400 }
      );
    }

    const page = clampText(body.page, MAX_PAGE_CHARS).trim();
    const rating = body.rating;
    const comment = clampText(body.comment, MAX_COMMENT_CHARS).trim();
    const featureLabel = clampText(body.featureLabel, MAX_META_CHARS).trim();

    if (rating !== "up" && rating !== "down") {
      return NextResponse.json(
        { success: false, error: "قيمة التقييم غير صالحة." },
        { status: 400 }
      );
    }

    if (!KNOWN_PAGES.has(page)) {
      return NextResponse.json(
        { success: false, error: "الصفحة غير معروفة." },
        { status: 400 }
      );
    }

    // ١) اللوج الأول — ده اللي بيضمن إن الرأي مايضيعش
    const stamp = new Date().toISOString();
    // الزائر بيتسجّل كـ «زائر» مش كـ user id — ومفيش IP في اللوج عن قصد:
    // الـ IP داتا شخصية ومالهاش لازمة في قراءة رأي.
    const who = user ? `user: ${user.id}` : "زائر (مش مسجّل)";
    console.log(
      `[feedback] ${stamp} | ${rating === "up" ? "👍" : "👎"} | صفحة: ${page}` +
        `${featureLabel ? ` | ${featureLabel}` : ""} | ${who}` +
        `${comment ? `\n  التعليق: ${comment}` : ""}`
    );

    // ٢) بعدين الإيميل — لو مظبوط
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const to = process.env.FEEDBACK_EMAIL_TO?.trim();
    // Resend بيطلب دومين متحقّق. onboarding@resend.dev بيشتغل من غير
    // تحقّق بس بيبعت لإيميل حسابك بس — وده كفاية للبداية.
    const from = process.env.FEEDBACK_EMAIL_FROM?.trim() || "onboarding@resend.dev";

    if (!apiKey || !to) {
      // مش خطأ: الميزة شغالة واللوج ماشي. بس بنقول في اللوج مرة واحدة
      // كل ما حصل رأي عشان تعرف إن فيه حاجة ناقصة.
      console.warn(
        "[feedback] مفيش RESEND_API_KEY أو FEEDBACK_EMAIL_TO — الرأي اتسجّل في اللوج بس. شوف .env.example."
      );
      return NextResponse.json({ success: true, delivered: false });
    }

    const subject =
      rating === "down"
        ? `👎 مشكلة في ${featureLabel || page}`
        : `👍 إعجاب بـ ${featureLabel || page}`;

    // نص عادي مش HTML: مفيش أي داعي نحقن نص مستخدم في ماركب.
    // النص بيتعرض كـ text/plain فأي وسوم فيه بتبان كنص مش بتتنفّذ.
    const lines = [
      `التقييم: ${rating === "up" ? "👍 عجبته" : "👎 مش عجبته"}`,
      `الصفحة: ${page}`,
      featureLabel ? `الميزة: ${featureLabel}` : null,
      `المستخدم: ${user ? user.email ?? user.id : "زائر (مش مسجّل)"}`,
      `الوقت: ${stamp}`,
      "",
      comment ? `إيه المشكلة:\n${comment}` : "(مافيش تعليق مكتوب)",
    ].filter(Boolean);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `ماجيكلي <${from}>`,
          to: [to],
          subject,
          text: lines.join("\n"),
          // الردود تروح للمستخدم مباشرة لو عنده إيميل — كده تقدر ترد عليه.
          // الزائر مالوش إيميل، فالرد بيرجعلك إنت وخلاص.
          ...(user?.email ? { reply_to: user.email } : {}),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[feedback] Resend رفض:", res.status, detail.slice(0, 300));
        // ٣) الفشل مايوصلش للمستخدم — الرأي في اللوج خلاص
        return NextResponse.json({ success: true, delivered: false });
      }

      return NextResponse.json({ success: true, delivered: true });
    } catch (err) {
      console.error("[feedback] فشل الاتصال بـ Resend:", err);
      return NextResponse.json({ success: true, delivered: false });
    }
  } catch (error) {
    console.error("feedback route error:", error);
    return NextResponse.json(
      { success: false, error: "حصل خطأ غير متوقع. حاول تاني." },
      { status: 500 }
    );
  }
}
