// Primary Personal Assistant helpers — child-friendly extensions
// Reuses existing getPersonalAssistantBriefing; adds primary-specific role message
// and safe fallbacks.

import type { PersonalAssistantContext } from "./context";
import { getPersonalAssistantBriefing as baseBriefing, type BriefingResult } from "./briefing";

const PRIMARY_ROLE_MESSAGE = "وبعدها نبدأ درس النهارده ونخلص جزء صغير من مذاكرتك 📚";

export function getPrimaryBriefing(ctx: PersonalAssistantContext, now?: Date): BriefingResult {
  const base = baseBriefing({ ctx, now });
  // Override roleMessage for primary — always child-friendly, no professional tone
  return {
    ...base,
    roleMessage: PRIMARY_ROLE_MESSAGE,
  };
}

// Greeting helper that can be used directly in Primary UI without full context
export function getPrimaryGreeting(userName: string | null | undefined, now: Date = new Date()): { greeting: string; period: "morning" | "evening" } {
  const hour = now.getHours();
  const period = hour >= 5 && hour < 17 ? "morning" as const : "evening" as const;
  const name = userName?.trim();
  const namePart = name ? ` يا ${name}` : "";
  const prefix = period === "morning" ? "أسعد الله صباحك بكل خير" : "أسعد الله مساءك بكل خير";
  return { greeting: `${prefix}${namePart} 💙`, period };
}
