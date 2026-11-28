-- ============================================================================
-- MAGICLY — db/120: ترقية الرسايل (C17) — وسائط + صوت + تعديل
-- ----------------------------------------------------------------------------
-- يعتمد على: db/107 (messages/conversation_participants/message_requests)
-- المحتوى:
--   ١) messages: message_type (text/image/audio/file) + media_url + edited_at
--   ٢) سياسة UPDATE للمرسل فقط (تعديل الرسالة)
--   ٣) طلبات المراسلة: السياسات موجودة في db/107 (قراءة للطرفين + إلغاء
--      للمرسل) — مفيش تغيير، بس بنضيف فهرس لطلبات المرسل المعلقة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) أعمدة الرسايل الجديدة
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_url text,
  add column if not exists edited_at timestamptz;

do $$ begin
  alter table public.messages
    add constraint messages_message_type_check
    check (message_type in ('text','image','audio','file'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_messages_conversation_type
  on public.messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- ٢) سياسة التعديل — المرسل فقط، ورسالة مش متحذفة
-- ----------------------------------------------------------------------------
drop policy if exists "messages: edit own" on public.messages;
create policy "messages: edit own"
  on public.messages
  for update
  using (sender_id = auth.uid() and is_deleted = false)
  with check (sender_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ٣) طلبات المراسلة — فهرس لطلبات المرسل المعلقة (للعرض السريع)
-- ----------------------------------------------------------------------------
create index if not exists idx_message_requests_sender_pending
  on public.message_requests (sender_id, created_at desc)
  where status = 'pending';
