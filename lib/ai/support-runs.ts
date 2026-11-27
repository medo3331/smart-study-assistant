// ============================================================================
// MAGICLY — AI Run Tracking (Phase 1)
// ============================================================================
// سجل استدعاءات نموذج الذكاء الاصطناعي ونتائجها، لكل حالة دعم.
// يُسجّل: المدخلات (ملخص)، المخرجات (مخلص)، الفشل، الاستثناء.
// لا يحتوي معلومات حساسة أو سرية؛ تُسجّل وصلتها كلها كـ "ملخص" فقط.
// ============================================================================

import type { SupportAiRun, SupportAiRunType, SupportAiRunStatus } from "./types";

// تجزئة بسيطة لـ "ذاكرة" (بديل لـ DB)
const _runs = new Map<string, SupportAiRun>();

/**
 * أنشاء تسجيل لاستدعاء نموذج.
 */
export function createAiRun(
  input: {
    caseId: string;
    runType: SupportAiRunType;
    modelName: string;
    provider?: string;
    inputSnippet?: string;
    outputSnippet?: string;
    classificationJsonb?: Record<string, unknown>;
    responseText?: string;
    confidenceScore?: number;
    isLowConfidence?: boolean;
    status?: SupportAiRunStatus;
  } & Partial<Pick<SupportAiRun, "errorMessage" | "started_at" | "finished_at">>
): SupportAiRun {
  const now = new Date().toISOString();
  const id = `ai_run_${input.caseId}_${input.runType}_${Date.now().toString(36)}`;

  const record: SupportAiRun = {
    id,
    caseId: input.caseId,
    runType: input.runType,
    modelName: input.modelName,
    provider: input.provider ?? null,
    promptLengthTokens: null,
    responseLengthTokens: null,
    inputSnippet: input.inputSnippet ?? null,
    outputSnippet: input.outputSnippet ?? null,
    classificationJsonb: input.classificationJsonb ?? null,
    responseText: input.responseText ?? null,
    confidenceScore: input.confidenceScore ?? null,
    isLowConfidence: input.isLowConfidence ?? false,
    status: input.status ?? "processing",
    errorMessage: input.errorMessage ?? null,
    started_at: input.started_at ?? now,
    finished_at: input.finished_at ?? null,
  };

  _runs.set(id, record);
  return record;
}

/**
 * تحديث تسجيل الاستدعاء.
 */
export function updateAiRun(
  id: string,
  patch: Partial<Pick<SupportAiRun, "status" | "errorMessage" | "outputSnippet" | "responseText" | "finished_at" | "responseLengthTokens" | "promptLengthTokens" | "confidenceScore">>
): SupportAiRun | null {
  const r = _runs.get(id);
  if (!r) return null;

  const updated: SupportAiRun = {
    ...r,
    ...patch,
  };

  // إذا اكتمل، نحدّث وقت الانتهاء
  if (patch.status === "completed" || patch.status === "failed") {
    updated.finished_at = new Date().toISOString();
  }

  _runs.set(id, updated);
  return updated;
}

/**
 * تسجيل إجراء تم تنفيذه أو محاولة، مرتبط بحالة دعم.
 */
export function recordAiAction(
  input: {
    caseId: string;
    actionKey: string;
    actionDescription: string;
  } & Partial<Pick<SupportAiRun, "status">>
): SupportAiRun | null {
  // نقوم بتسجيل هذا الإجراء كـ run من نوع 'action_attempt'
  return createAiRun({
    caseId: input.caseId,
    runType: "action_attempt",
    modelName: input.actionKey,
    inputSnippet: JSON.stringify({ actionKey: input.actionKey, actionDescription: input.actionDescription }),
    status: input.status ?? "processing",
  });
}

/**
 * التحقق من نتيجة إجراء، وتحديث record graduation الحالة.
 */
export function verifyAiAction(
  runId: string,
  result: Record<string, unknown>
): SupportAiRun | null {
  const r = _runs.get(runId);
  if (!r) return null;

  return updateAiRun(runId, {
    status: "completed",
    responseText: JSON.stringify(result, null, 2),
    outputSnippet: JSON.stringify(result),
  });
}

/**
 * قائمة أسباب التصعيد (مثالاً للبحث عنها في واجهة الإدارة).
 */
export function listEscalationReasons(runId: string): string[] {
  // في Phase 1 لا توجد حصص — نعيد قائمة افتراضية
  return [
    "confidence_below_threshold",
    "invalid_action",
    "sensitive_action",
    "unknown_error",
    "safety_violation",
  ];
}
