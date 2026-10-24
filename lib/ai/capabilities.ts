export type TaskType = "text_chat" | "complex_reasoning" | "image_understanding" | "document_extraction" | "quiz_generation";
export type ProviderName = "groq" | "gemini" | "ocr-space";
export interface ModelCapability { modelId: string; provider: ProviderName; envVar: string; textInput: boolean; imageInput: boolean; freeTierStatus: "free" | "paid" | "unknown"; verifiedAccess: "verified" | "unverified"; rateLimit: string; failureBehavior: string; fallbackModelId?: string; notes: string; }
export const MODEL_CAPABILITIES: ModelCapability[] = [
  { modelId: "openai/gpt-oss-20b", provider: "groq", envVar: "GROQ_API_KEY", textInput: true, imageInput: false, freeTierStatus: "free", verifiedAccess: "verified", rateLimit: "Provider-enforced", failureBehavior: "Return controlled error", notes: "Default text model." },
  { modelId: "gemini-3.6-flash", provider: "gemini", envVar: "GEMINI_API_KEY", textInput: true, imageInput: true, freeTierStatus: "unknown", verifiedAccess: "unverified", rateLimit: "Unknown", failureBehavior: "Fall back to OCR + Groq", fallbackModelId: "openai/gpt-oss-20b", notes: "Vision only when key exists." },
];
export function getModelCapability(modelId: string) { return MODEL_CAPABILITIES.find((m) => m.modelId === modelId); }
export function modelSupports(modelId: string, capability: "text" | "image") { const c = getModelCapability(modelId); if (!c) return false; return capability === "text" ? c.textInput : c.imageInput; }
export function selectModelForTask(task: TaskType, env: Record<string, string | undefined>) { const hasGroq = !!env.GROQ_API_KEY?.trim(); const hasGemini = !!env.GEMINI_API_KEY?.trim(); if (task === "image_understanding") return hasGemini ? "gemini-3.6-flash" : null; return hasGroq ? "openai/gpt-oss-20b" : null; }
export function taskRequiresImage(task: TaskType) { return task === "image_understanding" || task === "document_extraction"; }