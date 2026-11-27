// lib/magic/greeting.ts
//
// Magic Greeting — أول لقاء في اليوم (Phase 4: Magic في الداشبورد).
// منطق pure بدون أي نداء AI — الترحيب والاقتراحات من بيانات حقيقية، والكلفة صفر.
// الهدف من الوثيقة: «أول ما الطالب يدخل يظهرله رسالة ترحيب من Magic
// ويبدأ يقترح عليه نعمل ايه انهارده ويرشده».

export interface MagicSuggestion {
  id: string;
  icon: string;
  label: string;
  href: string;
  hint: string;
}

export interface MagicGreetingInput {
  displayName: string | null;
  /** ساعة اليوم 0–23 (توقيت المستخدم). */
  hour: number;
  /** الخطة النشطة — null لو مفيش. */
  activePlan: {
    subject: string;
    examDate: string;
    daysLeft: number;
    /** مهمة النهارده من الخطة — null لو اليوم خلص أو مفيش خطة. */
    todayTask: { title: string } | null;
  } | null;
  workspaceFiles: number;
}

export interface MagicGreeting {
  greeting: string;
  sub: string;
  suggestions: MagicSuggestion[];
}

function timeGreeting(hour: number): string {
  const h = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : 12;
  if (h >= 5 && h < 12) return "صباح الخير";
  if (h >= 12 && h < 17) return "نهارك سعيد";
  return "مساء الخير";
}

export function buildMagicGreeting(input: MagicGreetingInput): MagicGreeting {
  const name = (input.displayName || "").trim();
  const greeting = `${timeGreeting(input.hour)}${name ? ` يا ${name}` : ""}! ⚡`;

  const suggestions: MagicSuggestion[] = [];

  if (input.activePlan) {
    const plan = input.activePlan;
    if (plan.todayTask) {
      suggestions.push({
        id: "plan_today",
        icon: "🎯",
        label: `كمّل خطتك: ${plan.todayTask.title}`,
        href: "/dashboard/planner",
        hint: `امتحان ${plan.subject} — فاضل ${plan.daysLeft} يوم`,
      });
    } else {
      suggestions.push({
        id: "plan_review",
        icon: "✅",
        label: "مذاكرة النهارده خلصت — راجع أو اختبر نفسك",
        href: "/dashboard/planner",
        hint: `امتحان ${plan.subject} — فاضل ${plan.daysLeft} يوم`,
      });
    }
  }

  if (input.workspaceFiles === 0) {
    suggestions.push({
      id: "first_upload",
      icon: "📤",
      label: "ارفع أول محاضرة ليك",
      href: "/dashboard/workspace",
      hint: "هفهمها وألخصها وأعملك اختبار منها",
    });
  } else {
    suggestions.push({
      id: "ask_tutor",
      icon: "📚",
      label: "افتح درس واستفسر على أي جزء مش فاهمه",
      href: "/dashboard/workspace",
      hint: "المعلم Tutor هيسهّلك المفاهيم الصعبة",
    });
  }

  suggestions.push({
    id: "ask_magic",
    icon: "⚡",
    label: "اسألني أي حاجة عن المنصة أو مذاكرتك",
    href: "/dashboard/mentor",
    hint: "أنا معاك في كل الصفحات",
  });

  const sub = input.activePlan
    ? `عندك امتحان ${input.activePlan.subject} بعد ${input.activePlan.daysLeft} يوم — خطة جاهزة مستنياك.`
    : "أنا Magic، مرشدك الأكاديمي. شوف اقتراحاتي للنهارده أو اسألني أي حاجة.";

  return { greeting, sub, suggestions: suggestions.slice(0, 3) };
}

/** رسالة الترحيب داخل الشات الموحد — نفس الهوية بدون تكرار كلام مزعج. */
export function buildChatWelcomeGreeting(displayName: string | null, hour: number): string {
  const name = (displayName || "").trim();
  const who = name ? ` يا ${name}` : "";
  return `${timeGreeting(hour)}${who}! أنا Magic ⚡ — مرشدك الأكاديمي في Magicly.\n\nأقدر أشرحلك أي جزء في محاضراتك، أعملك خطة مذاكرة لو عندك امتحان، أو أساعدك في أي حاجة في المنصة. عايز نبدأ بإيه؟`;
}
