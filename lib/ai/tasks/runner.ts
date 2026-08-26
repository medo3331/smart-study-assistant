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

  const response = await AIService.generate(task.id, { messages, temperature });

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
