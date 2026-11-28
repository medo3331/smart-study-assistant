/* ==========================================================================
   Onboarding — جولة التعريف بالمنصة مع Magic.
   منطق pure بلا AI ⇒ بدون خصم Credits. الحالة محفوظة لكل مستخدم
   في جدول onboarding_progress (resumable — مبتكررش بعد الإكمال).
   ========================================================================== */

export interface OnboardingStep {
  id: string;
  icon: string;
  title: string;
  body: string;
  cta: { label: string; href: string } | null;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    icon: "⚡",
    title: "أنا Magic — صاحبك ومرشدك هنا",
    body: "هسيبك مش لوحدك: هفهمك المنصة، أنظم مذاكرتك، وأساعدك في أي حاجة. تعال نعمل جولة سريعة.",
    cta: null,
  },
  {
    id: "discover",
    icon: "🧭",
    title: "نتعرّف على Magicly",
    body: "في الداشبورد هتلاقي خطتك وتقدمك، وفي مساحة العمل بترفع محاضراتك، ومن الشات تسألني في أي وقت.",
    cta: { label: "دورّ على الأقسام", href: "/dashboard" },
  },
  {
    id: "setup",
    icon: "🎒",
    title: "ظبّط ملفك الأكاديمي",
    body: "حدد مرحلتك وتخصصك وموادك — عشان الشرح والاختبارات تبقى على مقاسك بالظبط.",
    cta: { label: "افتح الإعدادات", href: "/dashboard/settings" },
  },
  {
    id: "characters",
    icon: "🎭",
    title: "اتعرف على الفريق",
    body: "أنا بخطّط وأوجهك، Tutor بيشرح المحتوى العلمي في صفحة الدرس، وPlay لما تحب تلعب وتنفّس شوية.",
    cta: null,
  },
  {
    id: "first_task",
    icon: "🚀",
    title: "أول مهمة — يلا نبدأ",
    body: "ارفع أول محاضرة ليك وأنا هألخصهالك وأعمل منك اختبار. أول خطوة بتفضّل كل حاجة.",
    cta: { label: "ارفع أول محاضرة", href: "/dashboard/workspace" },
  },
];

export type OnboardingStepId = string;

export const ONBOARDING_STEP_IDS: OnboardingStepId[] = ONBOARDING_STEPS.map((s) => s.id);
export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

export function isValidOnboardingStep(id: unknown): id is OnboardingStepId {
  return typeof id === "string" && (ONBOARDING_STEP_IDS as string[]).includes(id);
}

export function nextOnboardingStep(id: OnboardingStepId): OnboardingStepId | null {
  const i = ONBOARDING_STEP_IDS.indexOf(id);
  if (i === -1 || i === ONBOARDING_STEP_IDS.length - 1) return null;
  return ONBOARDING_STEP_IDS[i + 1];
}

export interface OnboardingState {
  started: boolean;
  currentStep: OnboardingStepId | null;
  completedSteps: OnboardingStepId[];
  completed: boolean;
  skipped: boolean;
}

export function initialOnboardingState(): OnboardingState {
  return { started: false, currentStep: null, completedSteps: [], completed: false, skipped: false };
}

export type OnboardingAction = "start" | "next" | "complete" | "skip" | "reset";

export function isValidOnboardingAction(a: unknown): a is OnboardingAction {
  return a === "start" || a === "next" || a === "complete" || a === "skip" || a === "reset";
}

/** آلة حالة الجولة — الوحيدة اللي بتقرر إزاي الحالة بتتحرك. */
export function advanceOnboarding(state: OnboardingState, action: OnboardingAction): OnboardingState {
  if (action === "reset") {
    return { started: true, currentStep: ONBOARDING_STEP_IDS[0], completedSteps: [], completed: false, skipped: false };
  }
  if (state.completed || state.skipped) {
    // الجولة خلصت أو اتشالت — مبتترجعش غير بـ reset صريح.
    return state;
  }
  switch (action) {
    case "start":
      if (state.started) return state;
      return { ...state, started: true, currentStep: state.currentStep ?? ONBOARDING_STEP_IDS[0] };
    case "next": {
      if (!state.started || !state.currentStep) return state;
      const completedSteps = [...new Set([...state.completedSteps, state.currentStep])];
      const next = nextOnboardingStep(state.currentStep);
      if (!next) return { ...state, currentStep: null, completedSteps, completed: true };
      return { ...state, currentStep: next, completedSteps };
    }
    case "complete":
      return {
        ...state,
        started: true,
        currentStep: null,
        completedSteps: [...ONBOARDING_STEP_IDS],
        completed: true,
      };
    case "skip":
      return { ...state, started: true, currentStep: null, skipped: true };
    default:
      return state;
  }
}

/** توحيد شكل الحالة من صف DB — أي قيمة غريبة ترجّع للحالة الآمنة. */
export function normalizeOnboardingRow(row: {
  current_step: unknown;
  completed_steps: unknown;
  completed_at: unknown;
  skipped_at: unknown;
}): OnboardingState {
  const completed = Boolean(row.completed_at);
  const skipped = !completed && Boolean(row.skipped_at);
  const completedSteps = Array.isArray(row.completed_steps)
    ? row.completed_steps.filter(isValidOnboardingStep)
    : [];
  const currentStep = isValidOnboardingStep(row.current_step) && !completed && !skipped ? row.current_step : null;
  return {
    started: completed || skipped || currentStep !== null,
    currentStep,
    completedSteps,
    completed,
    skipped,
  };
}
