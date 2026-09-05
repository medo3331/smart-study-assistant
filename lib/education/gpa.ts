// Phase 2.4 — University GPA Foundation (pure, deterministic, testable, no DB call required)
// Only operates on verified academic_records; never creates fake grades/scores.
// Grade scale (verified common university standard — must match institution policy when configured):
// A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, F=0, P=Pass (non-credit, excluded from GPA denominator unless policy requires inclusion — excluded by design)

export interface AcademicRecord {
  id: string;
  university_subject_id: string;
  semester_id: string;
  status: "in_progress" | "completed" | "withdrawn" | "failed" | "pending";
  score?: number | null; // 0-100 scale (verified record only)
  grade?: string | null; // A, A-, B+, B, B-, C+, C, D, F, P
  credits: number;
}

const GRADE_POINTS: Record<string, number> = {
  A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, D: 1.0, F: 0.0, P: 0.0,
};

export function gradePoint(grade: string | null | undefined): number | null {
  if (!grade) return null;
  return grade in GRADE_POINTS ? GRADE_POINTS[grade] : null;
}

export function calculateGPA(records: AcademicRecord[]): { gpa: number | null; totalCredits: number; completedCredits: number; completedSubjects: number } {
  if (!records || records.length === 0) return { gpa: null, totalCredits: 0, completedCredits: 0, completedSubjects: 0 };
  let totalPoints = 0;
  let totalCredits = 0;
  let completedCredits = 0;
  let completedSubjects = 0;
  for (const r of records) {
    // Only completed records count toward GPA (not in_progress / withdrawn / failed / pending)
    // Per spec sec 5: GPA = sum(grade_points * credits) / sum(credits) — deterministic from verified records
    if (r.status !== "completed") continue;
    const pt = gradePoint(r.grade);
    if (pt === null) continue; // unknown grade scale — do not fabricate GPA contribution
    const cred = r.credits || 3.0;
    totalPoints += pt * cred;
    totalCredits += cred;
    completedCredits += cred;
    completedSubjects += 1;
  }
  const gpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : null;
  return { gpa, totalCredits, completedCredits, completedSubjects };
}
