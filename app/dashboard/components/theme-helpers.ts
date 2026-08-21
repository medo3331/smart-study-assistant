import type { ThemeColor, ThemeStyles } from "./types";

// 🖍️ الأربع ثيمات بقت أربع ألوان أقلام فسفورية: أصفر، أخضر، بنفسجي، أزرق.
// الأسماء (amber/emerald/purple/cyan) متسيبة زي ما هي عشان القيمة المحفوظة
// في قاعدة البيانات لحسابات المستخدمين تفضل شغالة.
//
// قاعدة مهمة: الفسفوري لون خلفية مش لون نص. عشان كده accentBg بياخد درجة
// 500 (الحبر الصريح) و accentText بياخد درجة 400 — واللي اترسمت في
// globals.css على نسخة غامقة مقروءة فوق الورق الفاتح. لو حطينا نفس اللون
// في الاتنين كان النص الأصفر هيختفي على الورق الأبيض.
export const THEME_STYLES: Record<ThemeColor, ThemeStyles> = {
  amber: {
    accentBg: "bg-amber-500",
    accentText: "text-amber-400",
    border: "border-amber-500/70",
    ring: "ring-amber-500/50",
    gradient: "from-amber-500 to-amber-600",
    lightBg: "bg-amber-500/12",
  },
  emerald: {
    accentBg: "bg-emerald-500",
    accentText: "text-emerald-400",
    border: "border-emerald-500/70",
    ring: "ring-emerald-500/50",
    gradient: "from-emerald-500 to-emerald-600",
    lightBg: "bg-emerald-500/12",
  },
  purple: {
    accentBg: "bg-purple-500",
    accentText: "text-purple-400",
    border: "border-purple-500/70",
    ring: "ring-purple-500/50",
    gradient: "from-purple-500 to-purple-400",
    lightBg: "bg-purple-500/12",
  },
  cyan: {
    accentBg: "bg-cyan-500",
    accentText: "text-cyan-400",
    border: "border-cyan-500/70",
    ring: "ring-cyan-500/50",
    gradient: "from-cyan-500 to-cyan-400",
    lightBg: "bg-cyan-500/12",
  },
};

// 📝 نصوص الواجهة اتنقلت لـ lib/user-persona.ts عشان تبقى مصدر واحد
// للمجال والشخصية مع بعض. الاسمين متسيبين هنا كـ re-export عشان أي
// استيراد قديم من الملف ده يفضل شغال.
export { getStepPrefix, getUiText } from "@/lib/user-persona";

// 🖍️ خريطة النشاط: خمس درجات من كثافة ضربة القلم — يوم فاضي ورقة نضيفة،
// واليوم المزحوم ضربة فسفوري كاملة. الكثافة هنا بتحمل المعلومة نفسها.
// بتتبع لون الثيم بدل ما تفضل خضرا دايماً زي الأول.
// ملحوظة: الكلاسات مكتوبة كاملة عن قصد — Tailwind بيقرا الملفات كنص،
// فأي كلاس مبني ديناميكياً (`bg-${hue}-500`) مش بيتولّد أصلاً.
export const HEATMAP_COLORS: Record<ThemeColor, string[]> = {
  amber: [
    "bg-paper border-rule",
    "bg-amber-500/20 border-amber-500/30",
    "bg-amber-500/45 border-amber-500/55",
    "bg-amber-500/70 border-amber-500/80",
    "bg-amber-500 border-amber-600",
  ],
  emerald: [
    "bg-paper border-rule",
    "bg-emerald-500/20 border-emerald-500/30",
    "bg-emerald-500/45 border-emerald-500/55",
    "bg-emerald-500/70 border-emerald-500/80",
    "bg-emerald-500 border-emerald-600",
  ],
  purple: [
    "bg-paper border-rule",
    "bg-purple-500/20 border-purple-500/30",
    "bg-purple-500/45 border-purple-500/55",
    "bg-purple-500/70 border-purple-500/80",
    "bg-purple-500 border-purple-400",
  ],
  cyan: [
    "bg-paper border-rule",
    "bg-cyan-500/20 border-cyan-500/30",
    "bg-cyan-500/45 border-cyan-500/55",
    "bg-cyan-500/70 border-cyan-500/80",
    "bg-cyan-500 border-cyan-400",
  ],
};