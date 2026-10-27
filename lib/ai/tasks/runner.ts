import { AIService } from "../service";
import type { AiChatMessage } from "../types";
import type { AiTaskInput, AiTaskResult } from "./types";
import { getAiTask } from "./chat";

/**
 * تنفيذ مهمة نصية عبر الراوتر المركزي.
 *
 * دي نقطة الدخول الوحيدة للتدفقات الجديدة — التطبيق مايلمسش مزوّدين
 * ولا موديلات من هنا وتحيا: الراوتر هو اللي بيختار وبيعمل fallback.
 */
export async function runAiTask(taskId: "chat" | "explain" | "tutor", input: AiTaskInput): Promise<AiTaskResult> {
  const task = getAiTask(taskId);

  const messages: AiChatMessage[] = [...input.messages];
  // رسالة نظام المتصل بتكسب؛ بنبني رسالة النظام الخاصة بالمهمة فقط لو ناقصة.
  if (!messages.some((message) => message.role === "system") && task.buildSystemPrompt) {
    const system = task.buildSystemPrompt(input);
    if (system) messages.unshift({ role: "system", content: system });
  }

  // درجة الحرارة اختيارية ومقصوصة على مدى صالح — القيمة الغلط من الكلاينت
  // ماينفعش تبقى سبب 400 من المزوّد.
  const rawTemperature = Number(input.options?.temperature);
  const temperature =
    input.options?.temperature !== undefined && Number.isFinite(rawTemperature)
      ? Math.min(Math.max(rawTemperature, 0), 2)
      : task.temperature;

  // \ud83e\udde1 \u0627\u0644\u0633\u064a\u0627\u0642 \u0628\u064a\u0639\u062f\u0627 \u0643\u0645\u0627 \u0647\u0648\u0629 \u2014 \u0645\u0646 \u0627\u0644\u0631\u0648\u0627\u062a.
  // \ud83d\udeab \u0645\u0627\u0641\u064a\u0634 \u062c\u064a\u0644 \u0647\u0646\u0627 \u0623\u0635\u0644\u0627\u064b: \u062a\u0645\u0631\u064a\u0631\u0647 \u0639\u0646\u062f \u0627\u0644\u0631\u0627\u0648\u062a \u0641\u064a `AiChatRequest.usage`.
  const response = await AIService.generate(task.id, { messages, temperature, usage: input.usage });

  let content = response.content;
  if (task.parseOutput) content = task.parseOutput(content);

  return {
    task: taskId,
    content,
    provider: response.provider,
    model: response.model,
    usage: response.usage,
    fallback: response.fallback,
  };
}
