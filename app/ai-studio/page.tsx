import type { Metadata } from "next";
import { AiStudioTabs } from "@/components/ai/AiStudioTabs";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "استوديو ماجيكلي — صور ومخططات وملفات بالذكاء الاصطناعي",
  description:
    "ولّد صورًا تعليمية وخرائط ذهنية ومخططات انسيابية، وحمّل ملخصاتك وكويزاتك وخطط مذاكرتك كملفات PDF وWord وExcel وPowerPoint — كل ده من مكان واحد في ماجيكلي.",
  path: "/ai-studio",
  keywords: [
    "توليد صور تعليمية",
    "خريطة ذهنية",
    "مخطط انسيابي",
    "ملخص PDF",
    "توليد ملفات بالذكاء الاصطناعي",
    "AI study content",
  ],
});

export default function AiStudioPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[var(--app-bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-8">
        {/* الترويسة */}
        <header className="text-center space-y-3">
          <p className="text-xs font-bold tracking-wide text-[var(--accent)]">
            ✨ استوديو ماجيكلي
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold leading-snug">
            منصة إنتاج المحتوى التعليمي
          </h1>
          <p className="text-sm text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
            صور توضيحية لدروسك، خرائط ذهنية لمفاهيمك، وملفات جاهزة للتحميل —
            كل أدوات الإنتاج في مكان واحد.
          </p>
        </header>

        {/* الأدوات */}
        <AiStudioTabs />

        {/* مصفوفة الباقات */}
        <section className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5">
          <h2 className="text-sm font-bold mb-3">حدود الباقات</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-[var(--muted)]">
                  <th className="text-right py-2 font-semibold">الخدمة</th>
                  <th className="text-center py-2 font-semibold">Free</th>
                  <th className="text-center py-2 font-semibold">Pro</th>
                  <th className="text-center py-2 font-semibold">Ultra</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-[var(--rule)]">
                <tr>
                  <td className="py-2">🖼️ الصور</td>
                  <td className="py-2 text-center">❌</td>
                  <td className="py-2 text-center">5 صور/يوم</td>
                  <td className="py-2 text-center">غير محدود</td>
                </tr>
                <tr>
                  <td className="py-2">📊 المخططات</td>
                  <td className="py-2 text-center">3/يوم</td>
                  <td className="py-2 text-center">20/يوم</td>
                  <td className="py-2 text-center">غير محدود</td>
                </tr>
                <tr>
                  <td className="py-2">📁 PDF</td>
                  <td className="py-2 text-center">✅</td>
                  <td className="py-2 text-center">✅</td>
                  <td className="py-2 text-center">✅</td>
                </tr>
                <tr>
                  <td className="py-2">📄 Word</td>
                  <td className="py-2 text-center">❌</td>
                  <td className="py-2 text-center">✅</td>
                  <td className="py-2 text-center">✅</td>
                </tr>
                <tr>
                  <td className="py-2">📈 Excel</td>
                  <td className="py-2 text-center">❌</td>
                  <td className="py-2 text-center">✅</td>
                  <td className="py-2 text-center">✅</td>
                </tr>
                <tr>
                  <td className="py-2">🎞️ PowerPoint</td>
                  <td className="py-2 text-center">❌</td>
                  <td className="py-2 text-center">✅</td>
                  <td className="py-2 text-center">✅</td>
                </tr>
                <tr>
                  <td className="py-2">موديل الصور</td>
                  <td className="py-2 text-center">—</td>
                  <td className="py-2 text-center">SDXL</td>
                  <td className="py-2 text-center">DALL-E 3 + Flux</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
