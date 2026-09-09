// Baccalaureate Personal Assistant — university-prep, focused, ambitious
import type { PersonalAssistantContext } from "./context";
import { getPersonalAssistantBriefing as baseBriefing, type BriefingResult } from "./briefing";

const BACCALAUREATE_ROLE_MESSAGE =
  "هذه مرحلة حاسمة — خلينا نركز على المواد الأساسية لمسارك ونبني خطة تقربك من الجامعة 🎓";

export function getBaccalaureateBriefing(ctx: PersonalAssistantContext, now?: Date): BriefingResult {
  const base = baseBriefing({ ctx, now });
  return { ...base, roleMessage: BACCALAUREATE_ROLE_MESSAGE };
}
