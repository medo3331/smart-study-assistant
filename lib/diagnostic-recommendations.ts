
// ============================================================================
// Phase 1 — DEPRECATED SHIM
// ----------------------------------------------------------------------------
// المنطق كله انتقل لـ lib/diagnostic-mastery.ts. الملف ده بقي re-export بس.
//
// ❗ النسخة القديمة من `detectWeakTopics` هنا كانت **بتثق في `is_correct`
// اللي العميل بيبعته** — وده hole أمني: سياسة الـRLS
// `diag_answers: user insert` بتسمح للمستخدم يكتب العمود ده بنفسه.
// النسخة الجديدة بتقارن `selected_option_index` بـ`correct_option_index`
// من بنك الأسئلة بس.
// ============================================================================

export { detectWeakTopics, WEAK_THRESHOLD } from "./diagnostic-mastery";
export type { WeakTopic } from "./diagnostic-mastery";
// ---------------------------------------------------------------------------
// ⚠️ `getStudyRecommendations` و `Recommendation` اتشالوا.
//
// كان scaffold حقيقي: بيرجّع `content_available: false` و
// `content_refs: []` **دايمًا** (شوف الكومنت القديم: "design only — no live
// query required for scaffold")، وبيحسب `priority` بنسخة threshold تالتة
// (`< 0.4 ? high : < 0.6 ? medium : low`).
//
// Fasegen دي مؤجلة لـPhase 2، لما يبقى في حاجة حقيقية تسأل عليها:
//   materials / planner_goals / exam_plan_days بالـsubject + topic.

