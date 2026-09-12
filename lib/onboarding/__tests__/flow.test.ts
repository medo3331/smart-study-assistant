/**
 * 🧪 Onboarding Flow Engine — تغطية كاملة للـ Truth Table المجمّدة + الذيل.
 *
 * كل صف في الجدول (rows 1–13 + 7b) له قضية هنا، plus سلسلة الذيل
 * (subjects → goals → preferences → done) plus كل حالات getPrevStep.
 * أي تغيير مستقبلي في منطق التفرع يجب أن يُحدَّث هنا أولًا (test-first).
 */
import { describe, it, expect } from "vitest";
import {
  getNextStep,
  getPrevStep,
  isSchoolStageCode,
  needsTrackForSchool,
  type FlowContext,
  type UniPresence,
} from "../flow";

function ctx(
  over: Omit<Partial<FlowContext>, "uni"> & { uni?: Partial<UniPresence> } = {},
): FlowContext {
  const { uni, ...rest } = over;
  return {
    role: null,
    studentType: null,
    stageCode: null,
    gradeOrderIndex: null,
    hasGrade: false,
    hasTrack: false,
    hasSubjects: false,
    hasGoals: false,
    hasPreferences: false,
    uni: {
      hasUniversity: false,
      hasFaculty: false,
      hasDepartment: false,
      hasLevel: false,
      hasSemester: false,
      ...uni,
    },
    ...rest,
  };
}

/** ذيل مكتمل — يُضاف لسياقات "البيانات كاملة" التي تتوقع done */
const FULL_TAIL = { hasSubjects: true, hasGoals: true, hasPreferences: true };

const FULL_UNI = {
  hasUniversity: true,
  hasFaculty: true,
  hasDepartment: true,
  hasLevel: true,
  hasSemester: true,
};

describe("getNextStep — Truth Table rows", () => {
  it("row 1: no role → role", () => {
    expect(getNextStep(ctx({ role: null }))).toBe("role");
  });

  it("row 2: graduate → done (skips the tail)", () => {
    expect(getNextStep(ctx({ role: "graduate" }))).toBe("done");
  });

  it("row 2b: freelancer → done (skips the tail)", () => {
    expect(getNextStep(ctx({ role: "freelancer" }))).toBe("done");
  });

  it("row 2c: role dominates any other data", () => {
    expect(
      getNextStep(
        ctx({
          role: "graduate",
          stageCode: "PRIMARY",
          hasGrade: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("done");
  });

  it("row 3: university manifold is strictly linear, then the tail", () => {
    const base = { role: "student", studentType: "university" } as const;
    expect(getNextStep(ctx(base))).toBe("university");
    expect(getNextStep(ctx({ ...base, uni: { hasUniversity: true } }))).toBe(
      "faculty",
    );
    expect(
      getNextStep(
        ctx({ ...base, uni: { hasUniversity: true, hasFaculty: true } }),
      ),
    ).toBe("department");
    expect(
      getNextStep(
        ctx({
          ...base,
          uni: { hasUniversity: true, hasFaculty: true, hasDepartment: true },
        }),
      ),
    ).toBe("academic-level");
    expect(
      getNextStep(
        ctx({
          ...base,
          uni: {
            hasUniversity: true,
            hasFaculty: true,
            hasDepartment: true,
            hasLevel: true,
          },
        }),
      ),
    ).toBe("semester");
    // manifold complete, tail missing → subjects (Phase 3)
    expect(getNextStep(ctx({ ...base, uni: { ...FULL_UNI } }))).toBe(
      "subjects",
    );
    expect(
      getNextStep(ctx({ ...base, uni: { ...FULL_UNI }, ...FULL_TAIL })),
    ).toBe("done");
  });

  it("row 3b: university ignores school data entirely (separate manifold)", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "university",
          stageCode: "SECONDARY",
          hasGrade: true,
          hasTrack: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("university");
  });

  it("row 4: student, no studentType, no stage → stage (D2 default = school)", () => {
    expect(getNextStep(ctx({ role: "student" }))).toBe("stage");
  });

  it("row 4b: missing studentType with full data still completes (D2)", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          stageCode: "PRIMARY",
          hasGrade: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("done");
  });

  it("rows 5–6: PRIMARY grade → subjects (tail), no track", () => {
    expect(
      getNextStep(
        ctx({ role: "student", studentType: "school", stageCode: "PRIMARY" }),
      ),
    ).toBe("grade");
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PRIMARY",
          gradeOrderIndex: 3,
          hasGrade: true,
        }),
      ),
    ).toBe("subjects");
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PRIMARY",
          gradeOrderIndex: 3,
          hasGrade: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("done");
  });

  it("rows 5–6b: PREPARATORY grade → subjects, no track", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PREPARATORY",
        }),
      ),
    ).toBe("grade");
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PREPARATORY",
          gradeOrderIndex: 3,
          hasGrade: true,
        }),
      ),
    ).toBe("subjects");
  });

  it("row 7: SECONDARY grade 1 → subjects, no track", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "SECONDARY",
          gradeOrderIndex: 1,
          hasGrade: true,
        }),
      ),
    ).toBe("subjects");
  });

  it("row 7b (added): SECONDARY unknown order → grade (re-confirm, no silent gap)", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "SECONDARY",
          gradeOrderIndex: null,
          hasGrade: true,
        }),
      ),
    ).toBe("grade");
  });

  it("rows 8–9: SECONDARY grade 2+ requires track, then the tail (D1 + D4)", () => {
    const base = {
      role: "student",
      studentType: "school",
      stageCode: "SECONDARY",
      hasGrade: true,
    } as const;
    expect(getNextStep(ctx({ ...base, gradeOrderIndex: 2 }))).toBe("track");
    expect(
      getNextStep(ctx({ ...base, gradeOrderIndex: 2, hasTrack: true })),
    ).toBe("subjects");
    expect(getNextStep(ctx({ ...base, gradeOrderIndex: 3 }))).toBe("track");
    expect(
      getNextStep(
        ctx({ ...base, gradeOrderIndex: 3, hasTrack: true, ...FULL_TAIL }),
      ),
    ).toBe("done");
  });

  it("row 10: BACCALAUREATE without grade → grade", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "BACCALAUREATE",
        }),
      ),
    ).toBe("grade");
  });

  it("rows 11–12: BACCALAUREATE always requires track, then the tail (D4)", () => {
    const base = {
      role: "student",
      studentType: "school",
      stageCode: "BACCALAUREATE",
      hasGrade: true,
    } as const;
    expect(getNextStep(ctx({ ...base, gradeOrderIndex: 1 }))).toBe("track");
    expect(
      getNextStep(ctx({ ...base, gradeOrderIndex: 1, hasTrack: true })),
    ).toBe("subjects");
    expect(getNextStep(ctx({ ...base, gradeOrderIndex: 3 }))).toBe("track");
    expect(
      getNextStep(
        ctx({ ...base, gradeOrderIndex: 3, hasTrack: true, ...FULL_TAIL }),
      ),
    ).toBe("done");
  });

  it("row 13: UNIVERSITY legacy code → stage (D3 self-heal)", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "UNIVERSITY",
          hasGrade: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("stage");
  });

  it("row 13b: any unknown code → stage (D3 self-heal)", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "SOME_FUTURE_CODE",
          hasGrade: true,
          hasTrack: true,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("stage");
  });

  it("tail order: subjects → goals → preferences → done", () => {
    const base = {
      role: "student",
      studentType: "school",
      stageCode: "PRIMARY",
      gradeOrderIndex: 4,
      hasGrade: true,
    } as const;
    expect(getNextStep(ctx(base))).toBe("subjects");
    expect(getNextStep(ctx({ ...base, hasSubjects: true }))).toBe("goals");
    expect(
      getNextStep(ctx({ ...base, hasSubjects: true, hasGoals: true })),
    ).toBe("preferences");
    expect(getNextStep(ctx({ ...base, ...FULL_TAIL }))).toBe("done");
  });

  it("manifold beats tail: missing grade outranks a full tail", () => {
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PRIMARY",
          hasGrade: false,
          ...FULL_TAIL,
        }),
      ),
    ).toBe("grade");
    expect(
      getNextStep(
        ctx({
          role: "student",
          studentType: "university",
          uni: { hasUniversity: true },
          ...FULL_TAIL,
        }),
      ),
    ).toBe("faculty");
  });
});

describe("getPrevStep — back navigation", () => {
  const school = {
    role: "student",
    studentType: "school",
    stageCode: "SECONDARY",
    gradeOrderIndex: 2,
    hasGrade: true,
  } as const;

  it("school chain: track → grade → stage → role", () => {
    const c = ctx(school);
    expect(getPrevStep(c, "track")).toBe("grade");
    expect(getPrevStep(c, "grade")).toBe("stage");
    expect(getPrevStep(c, "stage")).toBe("role");
    expect(getPrevStep(c, "role")).toBe("role");
  });

  it("university chain back to role", () => {
    const c = ctx({ role: "student", studentType: "university" });
    expect(getPrevStep(c, "semester")).toBe("academic-level");
    expect(getPrevStep(c, "academic-level")).toBe("department");
    expect(getPrevStep(c, "department")).toBe("faculty");
    expect(getPrevStep(c, "faculty")).toBe("university");
    expect(getPrevStep(c, "university")).toBe("role");
  });

  it("back from subjects: last manifold step (mirror of forward rule)", () => {
    // جامعة → آخر خطوة جامعية
    expect(
      getPrevStep(
        ctx({ role: "student", studentType: "university" }),
        "subjects",
      ),
    ).toBe("semester");
    // بكالوريا + صف → المسار
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "BACCALAUREATE",
          gradeOrderIndex: 3,
          hasGrade: true,
        }),
        "subjects",
      ),
    ).toBe("track");
    // ثانوي صف ثانٍ + صف → الشعبة
    expect(getPrevStep(ctx(school), "subjects")).toBe("track");
    // ثانوي صف أول → الصف (لا شعبة)
    expect(
      getPrevStep(
        ctx({ ...school, gradeOrderIndex: 1 }),
        "subjects",
      ),
    ).toBe("grade");
    // ابتدائي → الصف
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PRIMARY",
          gradeOrderIndex: 4,
          hasGrade: true,
        }),
        "subjects",
      ),
    ).toBe("grade");
    // بلا مرحلة → المرحلة
    expect(
      getPrevStep(ctx({ role: "student" }), "subjects"),
    ).toBe("stage");
    // مرحلة بلا صف → الصف
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "PRIMARY",
        }),
        "subjects",
      ),
    ).toBe("grade");
    // ثانوي بترتيب مجهول → الصف (مرآة 7b)
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "SECONDARY",
          gradeOrderIndex: null,
          hasGrade: true,
        }),
        "subjects",
      ),
    ).toBe("grade");
  });

  it("tail chain: preferences → goals → subjects", () => {
    const c = ctx({ role: "student", ...FULL_TAIL });
    expect(getPrevStep(c, "preferences")).toBe("goals");
    expect(getPrevStep(c, "goals")).toBe("subjects");
  });

  it("back from done: preferences for students, role otherwise", () => {
    expect(getPrevStep(ctx({ role: "graduate" }), "done")).toBe("role");
    expect(getPrevStep(ctx({ role: "freelancer" }), "done")).toBe("role");
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "school",
          stageCode: "BACCALAUREATE",
          gradeOrderIndex: 3,
          hasGrade: true,
          hasTrack: true,
          ...FULL_TAIL,
        }),
        "done",
      ),
    ).toBe("preferences");
    expect(
      getPrevStep(
        ctx({
          role: "student",
          studentType: "university",
          uni: { ...FULL_UNI },
          ...FULL_TAIL,
        }),
        "done",
      ),
    ).toBe("preferences");
    // دفاعي: طالب بسياق ناقص → أول الذيل أيضًا
    expect(getPrevStep(ctx({ role: "student" }), "done")).toBe("preferences");
  });
});

describe("helpers — direct pinning", () => {
  it("needsTrackForSchool", () => {
    expect(needsTrackForSchool("BACCALAUREATE", 1)).toBe(true);
    expect(needsTrackForSchool("BACCALAUREATE", 3)).toBe(true);
    expect(needsTrackForSchool("SECONDARY", 1)).toBe(false);
    expect(needsTrackForSchool("SECONDARY", 2)).toBe(true);
    expect(needsTrackForSchool("SECONDARY", 3)).toBe(true);
    expect(needsTrackForSchool("PRIMARY", 6)).toBe(false);
    expect(needsTrackForSchool("PREPARATORY", 3)).toBe(false);
  });

  it("isSchoolStageCode", () => {
    expect(isSchoolStageCode("PRIMARY")).toBe(true);
    expect(isSchoolStageCode("PREPARATORY")).toBe(true);
    expect(isSchoolStageCode("SECONDARY")).toBe(true);
    expect(isSchoolStageCode("BACCALAUREATE")).toBe(true);
    expect(isSchoolStageCode("UNIVERSITY")).toBe(false);
    expect(isSchoolStageCode("WHATEVER")).toBe(false);
    expect(isSchoolStageCode(null)).toBe(false);
    expect(isSchoolStageCode(undefined)).toBe(false);
  });
});
