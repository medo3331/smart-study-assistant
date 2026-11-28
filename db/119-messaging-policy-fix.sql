-- ============================================================================
-- MAGICLY — db/119: إصلاح استجامة لانهائية في سياسة المشاركين (42P17)
-- ----------------------------------------------------------------------------
-- المشكلة: سياسة SELECT على conversation_participants بتستعلم من نفس الجدول
-- داخل USING → Postgres بيكتشف الاستجامة اللانهائية ويرمي 42P17
-- → كل نداء /api/conversations بيطلع 500 → الرسايل مش بتفتح خالص.
-- الحل: دالة SECURITY DEFINER بتتحقق من العضوية من غير ما تمر على RLS،
-- والسياسة بتستخدمها.
-- ============================================================================

-- ١) دالة فحص العضوية — security definer عشان تتجاوز RLS (بدون استجامة)
create or replace function public.is_conversation_member(
  p_conversation_id uuid,
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.participant_id  = p_user
  );
$$;

revoke execute on function public.is_conversation_member(uuid, uuid) from anon, public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

-- ٢) استبدال السياسة العنود بالسياسة السليمة
drop policy if exists "conversation_participants: read own conversation membership"
  on public.conversation_participants;

create policy "conversation_participants: read own conversation membership"
  on public.conversation_participants
  for select
  using (
    participant_id = auth.uid()
    or public.is_conversation_member(conversation_id, auth.uid())
  );
