-- ============================================================================
-- purchase-requests.sql — متجر الكريدت + طلبات الشراء والاشتراك (دفع يدوي)
-- ============================================================================
-- التدفق المطلوب (بدل الواتساب):
--   1) المستخدم يطلب حزمة كريدت من /store أو باقة من /checkout/[plan]
--      ⇒ صف purchase_requests بحالة awaiting_payment + إشعار للأدمن/المالك.
--   2) المستخدم يدفع (Visa / Vodafone Cash / InstaPay — يدوي) ثم يؤكد الدفع
--      بمنهق + رقم مرجعي ⇒ الحالة payment_submitted + إشعار ثانٍ للأدمن.
--   3) الأدمن يراجع من /admin/purchase-requests: موافقة (منح كريدت عبر
--      grant_credits أو تفعيل باقة عبر admin_activate_subscription) أو رفض.
--   4) المستخدم يوصله إشعار بالنتيجة.
--
-- ⚠️ تعليمات بيانات الدفع (أرقام التحويل): تُقرأ من app_settings بمفتاح
--    billing_payment_instructions (نص حر). لضبطها:
--      insert into app_settings (key, value) values
--        ('billing_payment_instructions', 'فودافون كاش: 01xxxxxxxxx — باسم xxx')
--      on conflict (key) do update set value = excluded.value;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) حزم الكريدت — عناصر المتجر
-- ----------------------------------------------------------------------------
create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  credits int not null check (credits > 0),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'EGP',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.credit_packs enable row level security;

drop policy if exists "credit_packs: active read" on public.credit_packs;
create policy "credit_packs: active read"
  on public.credit_packs for select
  using (is_active = true);

-- بيانات أولية — عدّل الأسعار من هنا أو من SQL Editor (الأدمن يعدلها لاحقًا من اللوحة)
insert into public.credit_packs (title_ar, credits, price, currency, is_active, sort_order)
select * from (values
  ('حزمة بداية', 20, 30.00, 'EGP', true, 1),
  ('حزمة مجتهد', 50, 60.00, 'EGP', true, 2),
  ('حزمة عائلة', 120, 120.00, 'EGP', true, 3)
) as seed(title_ar, credits, price, currency, is_active, sort_order)
where not exists (select 1 from public.credit_packs);

-- ----------------------------------------------------------------------------
-- 2) طلبات الشراء — الكريدت والباقات
-- ----------------------------------------------------------------------------
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('credits', 'plan')),
  -- للحزم:
  pack_id uuid references public.credit_packs(id) on delete set null,
  credits int,
  -- للباقات:
  plan_key text,
  plan_duration_days int default 30,
  -- السعر وقت الطلب (snapshot — لا يتأثر بتعديل الأسعار لاحقًا)
  amount numeric(12,2),
  currency text not null default 'EGP',
  -- awaiting_payment → payment_submitted → approved | rejected
  -- cancel يبدّل إلى cancelled من awaiting_payment فقط.
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','payment_submitted','approved','rejected','cancelled')),
  payment_method text,
  payment_reference text,
  user_note text,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  -- الطلبات المُرسلة عبر رسايل الدعم: تذكرة المحادثة المرتبطة
  ticket_id uuid references public.support_tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- طلب كريدت لازم يحجز الحزمة، وطلب باقة لازم يحجز المفتاح
  check ((kind = 'credits' and pack_id is not null and credits is not null)
      or (kind = 'plan' and plan_key is not null))
);

create index if not exists idx_purchase_requests_user
  on public.purchase_requests (user_id, created_at desc);
create index if not exists idx_purchase_requests_status
  on public.purchase_requests (status, created_at desc);
create index if not exists idx_purchase_requests_ticket
  on public.purchase_requests (ticket_id);

alter table public.purchase_requests enable row level security;

-- المستخدم يقرأ طلباته فقط
drop policy if exists "purchase_requests: own read" on public.purchase_requests;
create policy "purchase_requests: own read"
  on public.purchase_requests for select
  using (auth.uid() = user_id);

-- المستخدم ينشئ طلبًا لنفسه بحالة انتظار دفع فقط (الحالة والحقل الإداري مقفولان)
drop policy if exists "purchase_requests: own insert" on public.purchase_requests;
create policy "purchase_requests: own insert"
  on public.purchase_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'awaiting_payment'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
  );

-- ⚠️ لا تحديث مباشر من الكلاينت إطلاقًا — تأكيد الدفع/الإلغاء عبر RPCs أدناه
-- (تمنع العبث بـ credits/amount/kind وقت التحديث).
drop policy if exists "purchase_requests: no client update" on public.purchase_requests;
create policy "purchase_requests: no client update"
  on public.purchase_requests for update
  using (false)
  with check (false);

-- ----------------------------------------------------------------------------
-- 3) RPCs — تأكيد الدفع والإلغاء (من المالك فقط، بحقول محدودة)
-- ----------------------------------------------------------------------------

-- تأكيد الدفع: من awaiting_payment إلى payment_submitted — يلمس حقول الدفع فقط
create or replace function public.request_purchase_confirm_payment(
  p_request_id uuid,
  p_method text,
  p_reference text default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'request_purchase_confirm_payment: not authenticated';
  end if;
  if p_request_id is null then
    raise exception 'request_purchase_confirm_payment: p_request_id required';
  end if;
  if p_method is null or btrim(p_method) = '' then
    raise exception 'request_purchase_confirm_payment: p_method required';
  end if;

  update public.purchase_requests
     set status = 'payment_submitted',
         payment_method = left(btrim(p_method), 60),
         payment_reference = case when p_reference is null then null else left(btrim(p_reference), 120) end,
         user_note = case when p_note is null then null else left(btrim(p_note), 500) end,
         updated_at = now()
   where id = p_request_id
     and user_id = v_uid
     and status = 'awaiting_payment';

  if not found then
    raise exception 'request_purchase_confirm_payment: request not found or not awaiting payment';
  end if;
  return true;
end;
$$;

-- إلغاء الطلب: من awaiting_payment إلى cancelled
create or replace function public.request_purchase_cancel(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'request_purchase_cancel: not authenticated';
  end if;
  if p_request_id is null then
    raise exception 'request_purchase_cancel: p_request_id required';
  end if;

  update public.purchase_requests
     set status = 'cancelled', updated_at = now()
   where id = p_request_id
     and user_id = v_uid
     and status = 'awaiting_payment';

  if not found then
    raise exception 'request_purchase_cancel: request not found or not cancellable';
  end if;
  return true;
end;
$$;

revoke all on function public.request_purchase_confirm_payment(uuid, text, text, text) from public, anon;
grant execute on function public.request_purchase_confirm_payment(uuid, text, text, text) to authenticated;
revoke all on function public.request_purchase_cancel(uuid) from public, anon;
grant execute on function public.request_purchase_cancel(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- ملاحظات للتحقق بعد التطبيق:
--   select * from credit_packs order by sort_order;
--   select count(*) from purchase_requests; -- 0
-- ----------------------------------------------------------------------------
