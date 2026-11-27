// lib/magic/persona-session.ts
//
// سياق الشخصية داخل المحادثة (Persona Session) — Phase 2: Character Intelligence.
// الهدف: «نحافظ على الشخصية المناسبة أثناء متابعة نفس الموضوع» — لو المحادثة
// بدأت مع Tutor مثلًا ووصلت رسالة محايدة («تمام، كمّل»)، نفس الشخصية تكمّل.
//
// ✍️ كتابة best-effort غير حاجبة (non-blocking) — أي فشل لا يعطّل الرد.
// 🔒 الجدول مفروض عليه RLS بملكية المستخدم؛ الكتابة من السيرفر فقط.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidPersona, type AiPersonaId } from "./personas";

export interface PersonaSessionRecord {
  persona: AiPersonaId;
  routingReason: string | null;
}

export async function loadPersonaSession(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<PersonaSessionRecord | null> {
  const { data, error } = await supabase
    .from("ai_persona_sessions")
    .select("persona_id, routing_reason")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error || !data) return null;
  if (!isValidPersona(data.persona_id)) return null;
  return {
    persona: data.persona_id,
    routingReason: typeof data.routing_reason === "string" ? data.routing_reason : null,
  };
}

export async function savePersonaSession(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  persona: AiPersonaId,
  routingReason: string
): Promise<void> {
  const { error } = await supabase.from("ai_persona_sessions").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      persona_id: persona,
      routing_reason: routingReason,
    },
    { onConflict: "conversation_id" }
  );
  if (error) throw error;
}
