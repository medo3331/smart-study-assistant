// Secondary Personal Assistant — academic, premium, future-oriented
import type { PersonalAssistantContext } from "./context";
import { getPersonalAssistantBriefing as baseBriefing, type BriefingResult } from "./briefing";

const SECONDARY_ROLE_MESSAGE =
  "خلينا نركز النهارده وننجز أهم جزء من مذاكرتك — خطوة منظمة تقربك من هدفك الأكاديمي 🎯";

export function getSecondaryBriefing(ctx: PersonalAssistantContext, now?: Date): BriefingResult {
  const base = baseBriefing({ ctx, now });
  return {
    ...base,
    roleMessage: SECONDARY_ROLE_MESSAGE,
  };
}

export function getSecondaryGreeting(userName: string | null | undefined, now: Date = new Date()): { greeting: string; period: "morning" | "evening" } {
  const hour = now.getHours();
  const period = hour >= 5 && hour < 17 ? "morning" as const : "evening" as const;
  const name = userName?.trim();
  const namePart = name ? ` يا ${name}` : "";
  const prefix = period === "morning" ? "أسعد الله صباحك بكل خير" : "أسعد الله مساءك بكل خير";
  return { greeting: `${prefix}${namePart} 💙`, period };
}
