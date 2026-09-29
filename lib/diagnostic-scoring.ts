
// ============================================================================
// Phase 1 — DEPRECATED SHIM
// ----------------------------------------------------------------------------
// كل المنطق انتقل لـ lib/diagnostic-mastery.ts (مصدر الحقيقة الوحيد).
//
// ❗ سبب النقل: كان في **نسختين** من `detectWeakTopics` في المشروع،
// والتانية (في diagnostic-recommendations.ts) كانت بتتقاكم من `is_correct`
// اللي **العميل بيبعته**. سياسة الـRLS `diag_answers: user insert` بتسمح
// للمستخدم يكتب العمود ده بنفسه — فلو اتحسب عليه، حد يقدر يبعت score
// كامل لنفسه. دلوقتي `scoreDiagnosticSession` بتقارن
// `selected_option_index` بـ `correct_option_index` من بنك الأسئلة بس.
// ============================================================================

export {
  scoreDiagnosticSession,
  detectWeakTopics,
  classifyTopics,
  updateMastery,
  updateTopicMastery,
  isCorrectQuestion,
  WEAK_THRESHOLD,
  MIN_QUESTIONS_FOR_JUDGEMENT,
  MIN_ATTEMPTS_FOR_EVIDENCE,
  UNTAGGED_TOPIC,
} from "./diagnostic-mastery";

export type {
  BankQuestion,
  DiagnosticAnswerInput,
  QuestionResult,
  TopicStat,
  WeakTopic,
  DiagnosticResult,
  MasteryState,
  MasteryMap,
  MasteryDelta,
} from "./diagnostic-mastery";

// ⚠️ `DiagnosticAnswerInput` و `DiagnosticResult` اتشالوا من هنا وبقوا
// exported من الملف الجديد بنفس الاسم ونفس الشكل — أي import قديم بيفضل
// شغال. الفرق الوحيد: `DiagnosticAnswerInput` بقى فيه `selected_option_index`
// بس (من غير `session_id`، لأن الـsession id بييجي من الـroute مش من العميل)،
// و `DiagnosticResult` بقى فيه `per_question` و `topic_performance` كـarrays
// مش Record.
// ---------------------------------------------------------------------------
// ملاحظة: كان في نسخة تالتة من detectWeakTopics هنا (بتاخد Record وبتستخدم
// شرط `stats.total === 1 && stats.correct <= 1` اللي كان بيصنّف حتى
// الإجابة الصح كـ insufficient). اتشالت — النسخة في diagnostic-mastery.ts
// هي الوحيدة، وده اللي بتعمله الاختبارات في
// lib/__tests__/diagnostic-loop.test.ts (اختبار "threshold uniqueness").
// ---------------------------------------------------------------------------

