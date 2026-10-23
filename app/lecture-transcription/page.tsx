import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { SubPageShell } from "@/components/SubPageShell";
import { LectureTranscriber } from "@/components/lecture-transcription/LectureTranscriber";
import { breadcrumbLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = pageMeta({
  title: "حوّل محاضرتك إلى نص",
  description:
    "ارفع تسجيل محاضرتك صوت أو فيديو وحوّله إلى نص عربي تقدر تراجعه وتنسخه وتحمله — من غير تكتب كلمة واحدة.",
  path: "/lecture-transcription",
  keywords: [
    "تفريغ محاضرات",
    "تحويل صوت إلى نص",
    "تفريغ تسجيل محاضرة",
    "نص محاضرة",
    "transcribe lecture",
    "speech to text arabic",
  ],
});

/* ⚠️ الصفحة مستقلة تماماً: مفيش تعديل على أي صفحة تانية، ومفيش ربط
   بالمساعد الذكي دلوقتي. عقد النتيجة (LectureTranscript) متظبّط أصلاً في
   lib/ai/transcription-shared.ts عشان الربط بعدين يبقى إضافة زرار واحد
   مش إعادة بناء. */
export default function LectureTranscriptionPage() {
  return (
    <SubPageShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "الرئيسية", path: "/" },
          { name: "حوّل محاضرتك إلى نص", path: "/lecture-transcription" },
        ])}
      />

      {/* ⚠️ مفيش `<div className="page">` هنا: SubPageShell أصلاً بيرسم
         الـ page (max-width + gutter) وبيلفّ المحتوى بـ main. لو ضفت
         تاني، الـ padding كان هيتضاعف والعمود هيضيق. */}
      <header className="band-top">
        <h1 className="text-2xl font-extrabold leading-snug md:text-3xl">
          حوّل محاضرتك إلى نص 🎙️
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-[var(--muted)]">
          ارفع تسجيل المحاضرة وسيتم تحويل الكلام إلى نص يمكنك مراجعته ونسخه.
        </p>

        {/* 📚 رابط للقائمة المحفوظة.
         *
         * ⚠️ ليه مهم: الصفحة دي نقطة **البداية**. بعد ما الطالب يخلّص تفريغ
         * هنا، محاضرته بتتحفظ — فلازم يكون عنده طريق يوصلها من غير ما
         * يعرف الرابط بالغلط. من غير السطر ده، الرحلة بتخلص وما فيش
         * خطوة تالية واضحة.
         */}
        <Link
          href="/lectures"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-4"
        >
          <BookOpen size={15} aria-hidden />
          <span>محاضراتي المحفوظة</span>
        </Link>
      </header>

      <section className="band">
        <div className="mx-auto max-w-2xl">
          <LectureTranscriber />
        </div>
      </section>
    </SubPageShell>
  );
}
