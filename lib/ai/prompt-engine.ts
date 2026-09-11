const OUTPUT_FORMAT_MARKER = "تعليمات تنسيق الإخراج الإلزامية";
export const SYSTEM_INSTRUCTION_MAX_CHARS = 1200;

/**
 * يلحق تعليمات تنسيق بالنظام مع قصّ صريح عند الحد حتى ما ننفجر في السياق.
 */
export function appendSystemInstruction(basePrompt: string, instruction: string): string {
  const clipped = instruction.slice(0, SYSTEM_INSTRUCTION_MAX_CHARS);
  return `${basePrompt}\n\n${OUTPUT_FORMAT_MARKER}:\n${clipped}`;
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)) + "…";
}
