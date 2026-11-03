// Centralized AI credit pricing (cost per operation).
// Server is the only authority for cost; client must never send cost.

export const CREDIT_COSTS = {
  chat: 1,
  explain: 1,
  tutor: 1,
  summarize: 1,
  quiz: 1,
  flashcards: 1,
  "generate-plan": 5,
  "generate-slides": 5,
  "generate-day": 2,
  "add-day": 2,
  diagram: 2,
  mindmap: 2,
  "image-gen": 1,
  "image-gen-sd": 3,
  "image-gen-premium": 5,
  "file-generate": 2,
  "file-analysis": 2,
  "image-analysis": 2,
  "exam-plan": 3,
  "generate-game-questions": 2,
  "agents-generate": 3,
  "unified-ai": 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export function getCreditCost(action: string): number {
  const cost = (CREDIT_COSTS as Record<string, number>)[action];
  return typeof cost === "number" && cost > 0 ? cost : 1;
}
