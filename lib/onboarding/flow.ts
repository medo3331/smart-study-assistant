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
 * مرجع السلوك: Truth Table المجمّدة (rows 1–13 + 7b) + tail المواد/الأهداف/التفضيلات.
 * - D1: شعبة ثانوي (صف 2+) خطوة track — توحيدًا مع assessment (order >= 2).
 * - D2: غياب studentType = مسار المدرسة (إبقاء السلوك الحالي، بلا UI جديد).
 * - D3: أي stageCode غير معروف → إعادة اختيار المرحلة (شفاء ذاتي).
 * - D4: الـ track إلزامي عند التوفر (Orchestrator يحتاج الـ context).
 * - Phase 3: بعد اكتمال المرحلة/الجامعة يمر الطالب (مدرسة وجامعة) بذيل
 *   واحد: subjects → goals → preferences → done. غير الطالب يتخطى الذيل.
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
  | "subjects"
  | "goals"
  | "preferences"
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
  /** Learning-profile tail (both student manifolds — Phase 3) */
  hasSubjects: boolean;
  hasGoals: boolean;
  hasPreferences: boolean;
  uni: UniPresence;
}

/** مراحل المدرسة الصالحة — أي كود آخر (قديم/غير معروف) يُعاد اختياره (D3) */
const SCHOOL_STAGE_CODES: readonly string[] = [
  "PRIMARY",
  "PREPARATORY",
  "SECONDARY",
  "BACCALAUREATE",
];

/**
 * هل هذا كود مرحلة مدرسية صالحة؟ (D3 — أي كود آخر يُعاد اختياره)
 * المصدر الوحيد لهذه القاعدة: المحرك + فلتر قائمة المراحل في الـ UI.
 */
export function isSchoolStageCode(code: string | null | undefined): code is string {
  return !!code && SCHOOL_STAGE_CODES.includes(code);
}

/** هل يحتاج هذا السياق المدرسي خطوة مسار؟ (D1 + D4) */
export function needsTrackForSchool(stageCode: string, gradeOrderIndex: number): boolean {
  if (stageCode === "BACCALAUREATE") return true;
  if (stageCode === "SECONDARY" && gradeOrderIndex >= 2) return true;
  return false;
}

export function getNextStep(ctx: FlowContext): StepKey {
  // Row 1 — لا دور بعد
  if (!ctx.role) return "role";

  // Rows 2–3 — خريج/فريلانسر: لا بيانات ناقصة → إكمال مباشر (يتخطى الذيل)
  if (ctx.role !== "student") return "done";

  if (ctx.studentType === "university") {
    // Rows 18–23 — مسار الجامعة: manifold خطي منفصل تمامًا
    // (D2: يُدخل فقط عند التصريح الصريح — الغائب يبقى على مسار المدرسة)
    if (!ctx.uni.hasUniversity) return "university";
    if (!ctx.uni.hasFaculty) return "faculty";
    if (!ctx.uni.hasDepartment) return "department";
    if (!ctx.uni.hasLevel) return "academic-level";
    if (!ctx.uni.hasSemester) return "semester";
  } else {
    // Rows 4–12 — مسار المدرسة (الافتراضي عند غياب studentType)
    if (!ctx.stageCode) return "stage";
    if (!isSchoolStageCode(ctx.stageCode)) return "stage";
    if (!ctx.hasGrade) return "grade";
    // Row 7b: ترتيب مجهول لثانوي → إعادة تأكيد الصف (لا تخطي صامت)
    if (ctx.stageCode === "SECONDARY" && ctx.gradeOrderIndex === null) return "grade";
    // (null هنا مستحيل لثانوي — عولج أعلاه — وغير مؤثر لغيرها)
    const order = ctx.gradeOrderIndex ?? 0;
    if (needsTrackForSchool(ctx.stageCode, order) && !ctx.hasTrack) return "track";
  }

  // Phase 3 — ذيل موحد بعد اكتمال المرحلة/الجامعة (مدرسة وجامعة)
  if (!ctx.hasSubjects) return "subjects";
  if (!ctx.hasGoals) return "goals";
  if (!ctx.hasPreferences) return "preferences";

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
    case "subjects": {
      // الرجوع لآخر خطوة في المسار (مرآة لقاعدة التقدم)
      if (ctx.studentType === "university") return "semester";
      if (!isSchoolStageCode(ctx.stageCode)) return "stage";
      if (!ctx.hasGrade) return "grade";
      if (ctx.stageCode === "SECONDARY" && ctx.gradeOrderIndex === null) return "grade";
      return needsTrackForSchool(ctx.stageCode, ctx.gradeOrderIndex ?? 0) ? "track" : "grade";
    }
    case "goals":
      return "subjects";
    case "preferences":
      return "goals";
    case "done": {
      // الطالب يخرج دائمًا عبر الذيل؛ غير الطالب بلا خطوات أصلًا.
      if (ctx.role !== "student") return "role";
      return "preferences";
    }
    default:
      return "role";
  }
}
