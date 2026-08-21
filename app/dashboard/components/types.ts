// --- كل الـ Types و Interfaces المشتركة بين كل الكومبوننتس ---
// ملحوظة: أي كومبوننت محتاج أي نوع من دول، يعمل import ليه من هنا
// عشان منكررش نفس التعريف في أكتر من ملف (لو كررته، TypeScript هيديك error
// إن في نوعين مختلفين بنفس الاسم).

export type CategoryType = "عمل ومشاريع" | "تعلم مهارة" | "دراسة أكاديمية" | "تطوير شخصي";
export type ThemeColor = "amber" | "emerald" | "purple" | "cyan";

// 👤 الشخصية: ليه المستخدم بيتعلم. بتتخزن في profiles.persona.
// المحور التاني (التراك: أي لغة/فريم-وورك) بيتخزن في profiles.subject.
// الاتنين محورين مختلفين — الشخصية بتحدد النبرة والموارد والنصوص،
// والتراك بيحدد المحتوى نفسه.
export type Persona = "student" | "grad" | "freelancer";

// مستوى الطالب — بيظهر للـ persona = "student" بس.
export type StudentLevel = "prep" | "high" | "uni" | "masters";
export type LearningStyle = "practical" | "visual" | "academic";

export interface StudyConfig {
  subject: string;
  category?: CategoryType;
  subCategory?: string;
  daysCount: number;
}

export interface StudyDay {
  id?: string;
  day: number;
  title: string;
  topic: string;
  description: string;
  isCompleted: boolean;
  xpReward: number;
  learningStyle: LearningStyle;
}

export interface Flashcard {
  id: string;
  text: string;
  status: "new" | "known" | "review";
}

export interface ActivityEntry {
  focusMinutes: number;
  tasksCompleted: number;
}
export type ActivityLog = Record<string, ActivityEntry>; // key: "YYYY-MM-DD"

export interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  streak: number;
  isYou?: boolean;
}

// نوع الـ "ثيم" اللي كل الكومبوننتس بتاخده كـ prop عشان الألوان تبقى متوحدة
export interface ThemeStyles {
  accentBg: string;
  accentText: string;
  border: string;
  ring: string;
  gradient: string;
  lightBg: string;
}

// نوع النصوص الديناميكية اللي بترجع من getUiText()
export interface UiText {
  sectionTitle: string;
  stepPrefix: string;
  emergencyBtn: string;
  xpTitle: string;
  aiDiscussBtn: string;
  taskDescPrefix: string;
}

// 🎧 المكتبة الصوتية عايشة في audio-library.ts — النوع SoundTrack وقايمة
// الموسيقى والقرّاء كلهم هناك. كانت هنا ليستة SOUND_TRACKS ثابتة (مطر/
// بحر/غابة/ضوضاء بيضاء) واتشالت في ٨ أغسطس.
export type { SoundTrack } from "./audio-library";