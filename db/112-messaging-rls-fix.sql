-- ===========================================================================
-- MAGICLY — Messaging Rebuild C13: إصلاح RLS المكسورة
-- ---------------------------------------------------------------------------
-- سياسة قراءة المشاركين كانت فيها مقارنة العمود بنفسه (دايمًا true)
-- فأي مشارك كان يقدر يقرا عضويات كل محادثات المنصة.
-- الإصلاح: participant نفسه، أو مشارك في نفس المحادثة (بالارتباط الصحيح).
-- Idempotent: safe to run more than once.
-- ===========================================================================

drop policy if exists "conversation_participants: read own conversation membership"
  on public.conversation_participants;

create policy "conversation_participants: read own conversation membership"
  on public.conversation_participants
  for select
  to authenticated
  using (
    participant_id = auth.uid()
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_participants.conversation_id
        and cp.participant_id = auth.uid()
    )
  );
