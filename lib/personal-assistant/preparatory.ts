// Preparatory Personal Assistant — more mature and organized than Primary
// Reuses base briefing but overrides roleMessage for preparatory stage

import type { PersonalAssistantContext } from "./context";
import { getPersonalAssistantBriefing as baseBriefing, type BriefingResult } from "./briefing";

const PREPARATORY_ROLE_MESSAGE =
  "خلينا نرتب يومك ونبدأ بأهم حاجة عندك. ممكن نبدأ بمراجعة درس النهارده أو نحل شوية أسئلة قبل ما ننتقل للمادة اللي بعدها 📚";

export function getPreparatoryBriefing(ctx: PersonalAssistantContext, now?: Date): BriefingResult {
  const base = baseBriefing({ ctx, now });
  return {
    ...base,
    roleMessage: PREPARATORY_ROLE_MESSAGE,
  };
}

export function getPreparatoryGreeting(userName: string | null | undefined, now: Date = new Date()): { greeting: string; period: "morning" | "evening" } {
  const hour = now.getHours();
  const period = hour >= 5 && hour < 17 ? "morning" as const : "evening" as const;
  const name = userName?.trim();
  const namePart = name ? ` يا ${name}` : "";
  const prefix = period === "morning" ? "أسعد الله صباحك بكل خير" : "أسعد الله مساءك بكل خير";
  return { greeting: `${prefix}${namePart} 💙`, period };
}
