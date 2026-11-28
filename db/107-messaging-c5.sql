-- ===========================================================================
-- MAGICLY — C5: إصلاح وتفعيل الرسايل الخاصة بين الطلبة
-- ---------------------------------------------------------------------------
-- الوضع قبل الملف: كود الـAPIs بيستهدف جداول/دوال ماكانتش متطبقة على القاعدة
-- (message_requests غير موجودة، conversations RLS مفعّل بلا سياسات ⇒ مفيش
-- قراءة/كتابة خالص). ده الملف الموحد اللي بيفعّل الطبقة كلها بشكل آمن:
--   1) conversations: أعمدة user_a_id/user_b_id + فهرس منع التكرار + سياسات RLS
--   2) message_requests: الجدول + سياسات RLS (بدون قيد check بـsubquery —
--      ده غير صالح في Postgres؛ منع الحظر متحقق في الـRPCs)
--   3) RPCs (security definer): public_can_message / send_message_request /
--      accept_message_request — بفرض الحظر والخصوصية والسقوف + إنشاء المحادثة
--      فورًا للأصدقاء
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) conversations — أعمدة المحادثة الفردية + سياسات
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists user_a_id uuid references auth.users(id) on delete set null,
  add column if not exists user_b_id uuid references auth.users(id) on delete set null;

-- منع تكرار محادثة نشطة بين نفس الزوج (مرتّبة لاكتساب الاتجاه)
create unique index if not exists uq_conversations_pair_active
  on public.conversations (least(user_a_id, user_b_id), greatest(user_a_id, user_b_id))
  where status = 'active' and user_a_id is not null and user_b_id is not null;

-- ⚠️ أمان: كانت الجدول مقفول RLS بلا أي سياسة ⇒ مفيش مستخدم يقدر يقرأ محادثاته.
drop policy if exists "conversations: participants read" on public.conversations;
create policy "conversations: participants read"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.participant_id = auth.uid()
    )
    or user_a_id = auth.uid()
    or user_b_id = auth.uid()
  );

drop policy if exists "conversations: participants update" on public.conversations;
create policy "conversations: participants update"
  on public.conversations for update
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.participant_id = auth.uid()
    )
    or user_a_id = auth.uid()
    or user_b_id = auth.uid()
  )
  with check (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.participant_id = auth.uid()
    )
    or user_a_id = auth.uid()
    or user_b_id = auth.uid()
  );

-- إنشاء محادثة فردية: الطرفان فقط، والعنوان الافتراضي
drop policy if exists "conversations: create own pair" on public.conversations;
create policy "conversations: create own pair"
  on public.conversations for insert
  with check (
    (auth.uid() = user_a_id or auth.uid() = user_b_id)
    and user_a_id is not null and user_b_id is not null
  );

-- ---------------------------------------------------------------------------
-- 2) message_requests — طلبات المراسلة
-- ---------------------------------------------------------------------------
create table if not exists public.message_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references auth.users(id) on delete cascade,
  receiver_id     uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'canceled', 'expired', 'blocked')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  responded_by    uuid references auth.users(id) on delete set null,
  note            text,
  expires_at      timestamptz,
  check (sender_id <> receiver_id)
);

create index if not exists idx_message_requests_sender
  on public.message_requests (sender_id, created_at desc);
create index if not exists idx_message_requests_receiver
  on public.message_requests (receiver_id, created_at desc);
create index if not exists idx_message_requests_receiver_pending
  on public.message_requests (receiver_id, status, created_at desc)
  where status = 'pending';
-- منع التكرار في نفس الاتجاه
create unique index if not exists uq_message_requests_pair
  on public.message_requests (sender_id, receiver_id)
  where status in ('pending', 'accepted');

alter table public.message_requests enable row level security;

drop policy if exists "message_requests: read own" on public.message_requests;
create policy "message_requests: read own"
  on public.message_requests for select
  using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "message_requests: insert own" on public.message_requests;
create policy "message_requests: insert own"
  on public.message_requests for insert
  with check (sender_id = auth.uid() and receiver_id <> auth.uid());

-- الرد على الطلب للمستقبِل، والإلغاء للمُرسِل — عبر policy واحدة للتحديث
drop policy if exists "message_requests: respond" on public.message_requests;
create policy "message_requests: respond"
  on public.message_requests for update
  using (auth.uid() in (sender_id, receiver_id))
  with check (auth.uid() in (sender_id, receiver_id));

drop policy if exists "message_requests: cancel own" on public.message_requests;
create policy "message_requests: cancel own"
  on public.message_requests for delete
  using (sender_id = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------------------
-- 3) RPCs — كل القواعد (حظر/خصوصية/سقوف) هنا على مستوى القاعدة
-- ---------------------------------------------------------------------------

-- هل يسمح a بمراسلة b؟ (بلا حظر بين الطرفين + المستقبِل مقبول المراسلة)
create or replace function public.public_can_message(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    user_a <> user_b
    and exists (select 1 from public.profiles p where p.id = user_b)
    and not exists (
      select 1 from public.user_blocks ub
      where (ub.blocker_id = user_a and ub.blocked_id = user_b)
         or (ub.blocker_id = user_b and ub.blocked_id = user_a)
    )
    and coalesce((
      select sp.allow_messages
      from public.social_profiles sp
      where sp.user_id = user_b
    ), true)
    and not coalesce((select p.is_banned from public.profiles p where p.id = user_a), false);
$$;

revoke all on function public.public_can_message(uuid, uuid) from public, anon;
grant execute on function public.public_can_message(uuid, uuid) to authenticated;

-- إنشاء/جلب المحادثة الفردية بين مستخدمين (security definer — تُستدعى داخليًا)
create or replace function public.get_or_create_pair_conversation(user_a uuid, user_b uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lo uuid := least(user_a, user_b);
  v_hi uuid := greatest(user_a, user_b);
  v_id uuid;
begin
  select id into v_id from public.conversations
  where status = 'active'
    and least(user_a_id, user_b_id) = v_lo
    and greatest(user_a_id, user_b_id) = v_hi
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (title, status, user_a_id, user_b_id)
  values ('محادثة', 'active', v_lo, v_hi)
  returning id into v_id;

  insert into public.conversation_participants (conversation_id, participant_id, role)
  values (v_id, v_lo, 'member'), (v_id, v_hi, 'member')
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.get_or_create_pair_conversation(uuid, uuid) from public, anon;

-- إرسال طلب مراسلة — أو فتح المحادثة فورًا لو أصحاب
create or replace function public.send_message_request(
  p_receiver uuid,
  p_note     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_existing public.message_requests;
  v_conv     uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_receiver is null or p_receiver = v_me then
    return jsonb_build_object('ok', false, 'code', 'invalid_receiver');
  end if;
  if not exists (select 1 from public.profiles where id = p_receiver) then
    return jsonb_build_object('ok', false, 'code', 'receiver_not_found');
  end if;
  if p_note is not null and length(btrim(p_note)) > 300 then
    return jsonb_build_object('ok', false, 'code', 'invalid_note');
  end if;

  if not public.public_can_message(v_me, p_receiver) then
    return jsonb_build_object('ok', false, 'code', 'cannot_message');
  end if;

  -- الأصدقاء: محادثة فورًا بدون طلب
  if exists (
    select 1 from public.friendships f
    where f.user_id = v_me and f.friend_id = p_receiver
  ) then
    v_conv := public.get_or_create_pair_conversation(v_me, p_receiver);
    return jsonb_build_object('ok', true, 'status', 'conversation', 'conversation_id', v_conv);
  end if;

  -- طلب قائم مني له؟ (idempotent)
  select * into v_existing from public.message_requests
  where sender_id = v_me and receiver_id = p_receiver and status = 'pending'
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_existing.id);
  end if;

  -- طلب قائم من هو إليّ ما زال معلقًا؟ → نفس الطلب يكمّل
  select * into v_existing from public.message_requests
  where sender_id = p_receiver and receiver_id = v_me and status = 'pending'
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'status', 'incoming_pending', 'request_id', v_existing.id);
  end if;

  -- سقف: 10 طلبات مراسلة صادرة في 24 ساعة
  if (select count(*) from public.message_requests
      where sender_id = v_me and created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  insert into public.message_requests (sender_id, receiver_id, note, expires_at)
  values (v_me, p_receiver, nullif(btrim(coalesce(p_note, '')), ''), now() + interval '7 days')
  returning id into v_existing;

  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_existing.id);
end;
$$;

revoke all on function public.send_message_request(uuid, text) from public, anon;
grant execute on function public.send_message_request(uuid, text) to authenticated;

-- قبول طلب المراسلة — ذرّي وidempotent، وينشئ المحادثة ومشاركيها
create or replace function public.accept_message_request(
  p_request_id uuid,
  p_user_id    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_req   public.message_requests;
  v_conv  uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;

  select * into v_req from public.message_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- idempotent: مقبول قبل كده → هات المحادثة القائمة
  if v_req.status = 'accepted' then
    v_conv := public.get_or_create_pair_conversation(v_req.sender_id, v_req.receiver_id);
    return jsonb_build_object('ok', true, 'status', 'accepted', 'conversation_id', v_conv);
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'not_pending');
  end if;
  if v_req.receiver_id <> p_user_id then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  if v_req.expires_at is not null and v_req.expires_at < now() then
    update public.message_requests set status = 'expired' where id = v_req.id;
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  update public.message_requests
  set status = 'accepted', responded_at = now(), responded_by = p_user_id
  where id = v_req.id and status = 'pending';

  v_conv := public.get_or_create_pair_conversation(v_req.sender_id, v_req.receiver_id);

  return jsonb_build_object('ok', true, 'status', 'accepted', 'conversation_id', v_conv);
end;
$$;

revoke all on function public.accept_message_request(uuid, uuid) from public, anon;
grant execute on function public.accept_message_request(uuid, uuid) to authenticated;
