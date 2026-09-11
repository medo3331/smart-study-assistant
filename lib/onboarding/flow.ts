/**
 * 🧭 Onboarding Flow Engine — نقطة القرار الوحيدة لخطوات الـ Onboarding.
 *
 * دوال pure خالصة: نفس الـ ctx يعطي نفس الخطوة دائمًا، بلا قراءة state
 * ولا Supabase — لذلك فهي قابلة للاختبار الآلي بالكامل (__tests__/flow.test.ts).
 *
 * تحل محل التفرعات المشتتة سابقًا في:
 *   - auth guard effect (resume logic — كان مصدر Fix 5)
 *   - أزرار Continue
 *   - goBack()
 *
 * مرجع السلوك: Truth Table المجمّدة (rows 1–13 + 7b).
 * - D1: شعبة ثانوي (صف 2+) خطوة track — توحيدًا مع assessment (order >= 2).
 * - D2: غياب studentType = مسار المدرسة (إبقاء السلوك الحالي، بلا UI جديد).
 * - D3: أي stageCode غير معروف → إعادة اختيار المرحلة (شفاء ذاتي).
 * - D4: الـ track إلزامي عند التوفر (Personal Learning Orchestrator يحتاج الـ context).
 */

export type StepKey =
  | "role"
  | "stage"
  | "grade"
  | "track"
  | "university"
  | "faculty"
  | "department"
  | "academic-level"
  | "semester"
  | "done";

export interface UniPresence {
  hasUniversity: boolean;
  hasFaculty: boolean;
  hasDepartment: boolean;
  hasLevel: boolean;
  hasSemester: boolean;
}

export interface FlowContext {
  role: "student" | "graduate" | "freelancer" | null;
  studentType: "school" | "university" | null;
  /** كود المرحلة المحلول من الـ taxonomy — القرارات تقرأ الأكواد لا الـ IDs */
  stageCode: string | null;
  /**
   * ترتيب الصف (order_index من education_grades): 1 للصف الأول…
   * نفس قاعدة assessment: الشعبة لصف 2 فأكثر فقط.
   */
  gradeOrderIndex: number | null;
  hasGrade: boolean;
  hasTrack: boolean;
  uni: UniPresence;
}

/** مراحل المدرسة الصالحة — أي كود آخر (قديم/غير معروف) يُعاد اختياره (D3) */
const SCHOOL_STAGE_CODES: readonly string[] = [
  "PRIMARY",
  "PREPARATORY",
  "SECONDARY",
  "BACCALAUREATE",
];

/** هل يحتاج هذا السياق المدرسي خطوة مسار؟ (D1 + D4) */
function needsTrackForSchool(stageCode: string, gradeOrderIndex: number): boolean {
  if (stageCode === "BACCALAUREATE") return true;
  if (stageCode === "SECONDARY" && gradeOrderIndex >= 2) return true;
  return false;
}

export function getNextStep(ctx: FlowContext): StepKey {
  // Row 1 — لا دور بعد
  if (!ctx.role) return "role";

  // Rows 2–3 — خريج/فريلانسر: لا بيانات ناقصة → إكمال مباشر (Fix 4)
  if (ctx.role !== "student") return "done";

  // Rows 18–23 — مسار الجامعة: manifold خطي منفصل تمامًا
  // (D2: يُدخل فقط عند التصريح الصريح — الغائب يبقى على مسار المدرسة)
  if (ctx.studentType === "university") {
    if (!ctx.uni.hasUniversity) return "university";
    if (!ctx.uni.hasFaculty) return "faculty";
    if (!ctx.uni.hasDepartment) return "department";
    if (!ctx.uni.hasLevel) return "academic-level";
    if (!ctx.uni.hasSemester) return "semester";
    return "done";
  }

  // Rows 4–5 — مسار المدرسة: بلا مرحلة → خطوة المرحلة
  if (!ctx.stageCode) return "stage";

  // Row 13 — كود غير معروف (مثل صف UNIVERSITY القديم) → إعادة اختيار (D3)
  if (!SCHOOL_STAGE_CODES.includes(ctx.stageCode)) return "stage";

  // Rows 5, 8, 10 — بلا صف → خطوة الصف
  if (!ctx.hasGrade) return "grade";

  // Row 7b (مضافة): ترتيب الصف غير معروف لطالب ثانوي → إعادة تأكيد الصف،
  // بدل تخطي الشعبة بصمت (فجوة context) أو فرضها خطأً. نادر عمليًا
  // (المتصل يحل الترتيب قبل النداء)، لكن الافتراضي الآمن لا يكلف شيئًا.
  if (ctx.stageCode === "SECONDARY" && ctx.gradeOrderIndex === null) return "grade";

  // Rows 6–12 — منطق المسار (D1 + D4)
  // (null هنا مستحيل لثانوي — عولج أعلاه — وغير مؤثر لغيرها)
  const order = ctx.gradeOrderIndex ?? 0;
  if (needsTrackForSchool(ctx.stageCode, order) && !ctx.hasTrack) return "track";

  return "done";
}

export function getPrevStep(ctx: FlowContext, currentStep: StepKey): StepKey {
  switch (currentStep) {
    case "stage":
      return "role";
    case "grade":
      return "stage";
    case "track":
      return "grade";
    case "university":
      return "role";
    case "faculty":
      return "university";
    case "department":
      return "faculty";
    case "academic-level":
      return "department";
    case "semester":
      return "academic-level";
    case "done": {
      // الرجوع من شاشة النجاح (دفاعي — لا زر لها حاليًا): آخر خطوة بيانات
      // في المسار، لا "track" دائمًا (الأخيرة خطأ لغير مسارات الشعبة).
      if (ctx.role !== "student") return "role";
      if (ctx.studentType === "university") return "semester";
      const order = ctx.gradeOrderIndex ?? 0;
      if (
        ctx.stageCode &&
        SCHOOL_STAGE_CODES.includes(ctx.stageCode) &&
        ctx.hasGrade &&
        needsTrackForSchool(ctx.stageCode, order)
      ) {
        return "track";
      }
      if (ctx.stageCode) return "grade";
      return "stage";
    }
    default:
      return "role";
  }
}
