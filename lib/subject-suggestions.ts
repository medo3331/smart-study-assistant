import { getTracks, type FieldId, type Persona } from "@/lib/user-persona";

/**
 * اقتراحات المواد الذكية — بتتعدّل حسب بيانات الطالب:
 *   - طالب جامعة (حتى لو كتب جامعته بنفسه): الكلية + القسم يحددوا مواد التخصص.
 *   - طالب ثانوي: الشعبة (علمي علوم / علمي رياضة / أدبي) تحدد المواد،
 *     والمنهج الدولي يقدّم مواد IG/American بالإنجليزي.
 *   - غير الطالب: اقتراحات حسب المجال والشخصية (نفس منطق getTracks).
 * الاقتراحات دي fallback — لو في مواد من قاعدة البيانات بتاخد أولوية دايمًا.
 */

export interface SubjectSuggestionInput {
  persona?: Persona | null;
  field?: FieldId | null;
  isUniversity?: boolean;
  universityName?: string | null;
  facultyName?: string | null;
  departmentName?: string | null;
  educationSystem?: string | null;
  stageCode?: string | null;
  gradeOrder?: number | null;
  trackCode?: string | null;
}

const UNIVERSITY_SUBJECT_RULES: { match: RegExp; subjects: string[] }[] = [
  { match: /حاسبات|الحاسب|معلومات|ذكاء|برمج|computer|informatics/i, subjects: ["البرمجة", "هياكل البيانات", "قواعد البيانات", "الرياضيات المتقطعة", "شبكات الحاسب", "نظم التشغيل"] },
  { match: /أسنان|dentist/i, subjects: ["التشريح", "الفسيولوجي", "الكيمياء الحيوية", "مواد طب الأسنان", "جراحة الفم"] },
  { match: /صيدل|pharm/i, subjects: ["الكيمياء الصيدلية", "الصيدلانيات", "علم الأدوية", "التشريح", "الكيمياء العضوية"] },
  { match: /علاج طبيعي|physio/i, subjects: ["التشريح", "الفسيولوجي", "الكيمياء الحيوية", "العلاج الطبيعي", "الحركة العلاجية"] },
  { match: /طب|medic/i, subjects: ["التشريح", "الفسيولوجي", "الكيمياء الحيوية", "الباثولوجي", "علم الأدوية"] },
  { match: /رياضيات|math/i, subjects: ["التحليل الرياضي", "الجبر", "الهندسة الفراغية", "الإحصاء والاحتمالات"] },
  { match: /فيزياء|physics/i, subjects: ["الميكانيكا الكلاسيكية", "الكهرومغناطيسية", "الفيزياء الحديثة", "الرياضيات"] },
  { match: /كيمياء|chem/i, subjects: ["الكيمياء العضوية", "الكيمياء غير العضوية", "الكيمياء التحليلية", "الفيزياء"] },
  { match: /أحياء|bio/i, subjects: ["علم الحيوان", "علم النبات", "الكيمياء الحيوية", "علم الوراثة"] },
  { match: /هندسة|engineer/i, subjects: ["الرياضيات الهندسية", "الفيزياء", "الرسم الهندسي", "الميكانيكا", "البرمجة", "إدارة المشروعات"] },
  { match: /علوم|science/i, subjects: ["الرياضيات", "الفيزياء", "الكيمياء", "الأحياء"] },
  { match: /تجارة|أعمال|إدارة|business|commerce/i, subjects: ["المحاسبة", "إدارة الأعمال", "الاقتصاد الكلي", "الإحصاء", "القانون التجاري"] },
  { match: /حقوق|law/i, subjects: ["القانون المدني", "القانون الجنائي", "القانون الدستوري", "القانون التجاري", "المرافعات"] },
  { match: /اقتصاد|سياسية/i, subjects: ["الاقتصاد الجزئي", "الاقتصاد الكلي", "العلوم السياسية", "الإحصاء", "العلاقات الدولية"] },
  { match: /إعلام|صحافة|media/i, subjects: ["أساسيات الإعلام", "الصحافة", "الإذاعة والتلفزيون", "العلاقات العامة", "الإعلام الرقمي"] },
  { match: /تربية|edu/i, subjects: ["أساسيات التربية", "علم النفس التربوي", "مناهج وطرق التدريس", "إدارة الصف"] },
  { match: /زراعة|agri/i, subjects: ["أصول العلوم الزراعية", "التربة", "المحاصيل", "وقاية النبات"] },
  { match: /فنون/i, subjects: ["تاريخ الفن", "التصميم", "الرسم", "نظريات الجمال"] },
  { match: /آداب|إنسانية|اجتماعية|arts|human/i, subjects: ["اللغة العربية", "التاريخ", "الجغرافيا", "علم النفس", "علم الاجتماع"] },
];

const INTERNATIONAL_SUBJECTS = [
  "Mathematics", "Physics", "Chemistry", "Biology",
  "English", "Business", "Economics", "Computer Science",
];

export function getSuggestedSubjects(input: SubjectSuggestionInput): string[] {
  const {
    persona, field, isUniversity, universityName,
    facultyName, departmentName, educationSystem,
    stageCode, gradeOrder, trackCode,
  } = input;

  if (persona !== "student") return getTracks(field ?? null, persona ?? undefined);

  if (isUniversity || stageCode === "UNIVERSITY") {
    const haystack = `${universityName ?? ""} ${facultyName ?? ""} ${departmentName ?? ""}`.trim();
    if (haystack) {
      for (const rule of UNIVERSITY_SUBJECT_RULES) {
        if (rule.match.test(haystack)) return rule.subjects;
      }
    }
    return getTracks(field ?? null, "student");
  }

  if (educationSystem && /دولي|IG|American|international/i.test(educationSystem)) {
    return INTERNATIONAL_SUBJECTS;
  }

  if (trackCode === "SEC_SCI") {
    return ["اللغة العربية", "اللغة الإنجليزية", "الفيزياء", "الكيمياء", "الأحياء"];
  }
  if (trackCode === "SEC_MATH") {
    return ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "الفيزياء", "الكيمياء"];
  }
  if (trackCode === "SEC_LIT") {
    return ["اللغة العربية", "اللغة الإنجليزية", "التاريخ", "الجغرافيا", "الفلسفة", "علم النفس"];
  }
  if ((stageCode === "SECONDARY" || stageCode === "BACCALAUREATE") && (gradeOrder ?? 0) >= 2) {
    return ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "الفيزياء", "الكيمياء", "الأحياء", "التاريخ", "الجغرافيا"];
  }
  return ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية", "الحاسب الآلي"];
}
