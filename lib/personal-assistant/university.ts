// University Personal Assistant — professional, concise, future-oriented
import type { PersonalAssistantContext } from "./context";
import { getPersonalAssistantBriefing as baseBriefing, type BriefingResult } from "./briefing";

const UNIVERSITY_ROLE_MESSAGE =
  "خلينا نركز على مواد تخصصك ونبني خطة تقربك من أهدافك الأكاديمية والمهنية 🎓";

export function getUniversityBriefing(ctx: PersonalAssistantContext, now?: Date): BriefingResult {
  const base = baseBriefing({ ctx, now });
  return { ...base, roleMessage: UNIVERSITY_ROLE_MESSAGE };
}
