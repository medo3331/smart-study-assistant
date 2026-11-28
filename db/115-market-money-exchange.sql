-- ============================================================================
-- 115 — MARKET MONEY + EXCHANGE (D-M-08 / D-M-09)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرارات: D-M-08 (تبديل يدوي Coins↔Credits) · D-M-09 (شراء كوينز بالفلوس
--           عبر مسار الدفع اليدوي الموجود) · يعتمد على db/113 + db/114
--
-- ── اللي الملف ده بيعمله ──
--  ١) coin_packs — باقات الكوينز بالفلوس (نفس نمط credit_packs).
--  ٢) purchase_requests: kind='coins' — نفس تدفق الدفع اليدوي
--     (طلب → دفع → إثبات → موافقة أدمن → add_coins_grant).
--  ٣) economy_exchange_settings — صف واحد: أسعار التبديل بالاتجاهين +
--     السقوف اليومية + مفاتيح التفعيل (تعديل إداري بدون كود — D-M-06).
--  ٤) RPCs التبديل الذري بالاتجاهين: الخصم والإضافة في معاملة واحدة،
--     مع سقف يومي وidempotency ref، ومحاسبة على الـ ledgerين.
--  ٥) تسجيل المصدر الجديد 'exchange' في coin_source_rules + توسيع
--     add_coins_grant ليقبله + تفعيل مصدر 'purchase' (مسار يدوي مُراجَع).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) coin_packs — باقات الكوينز بالفلوس (D-M-09)
-- ----------------------------------------------------------------------------
create table if not exists public.coin_packs (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  coins int not null check (coins > 0),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'EGP',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.coin_packs enable row level security;

drop policy if exists "coin_packs: active read" on public.coin_packs;
create policy "coin_packs: active read"
  on public.coin_packs for select
  using (is_active = true);

-- أسعار تجريبية من التصميم المعتمد (§6) — التعديل من الجدول بدون كود (D-M-06)
insert into public.coin_packs (title_ar, coins, price, currency, is_active, sort_order)
select * from (values
  ('باقة البداية',   100,   10.00, 'EGP', true, 1),
  ('الباقة الشهيرة', 550,   50.00, 'EGP', true, 2),
  ('الباقة الموفرة', 1200,  100.00, 'EGP', true, 3),
  ('الباقة الضخمة',  2700,  200.00, 'EGP', true, 4)
) as seed(title_ar, coins, price, currency, is_active, sort_order)
where not exists (select 1 from public.coin_packs);

-- ----------------------------------------------------------------------------
-- ٢) purchase_requests — دعم kind='coins'
-- ----------------------------------------------------------------------------
alter table public.purchase_requests drop constraint if exists purchase_requests_kind_check;
alter table public.purchase_requests
  add constraint purchase_requests_kind_check
  check (kind in ('credits', 'plan', 'coins'));

alter table public.purchase_requests add column if not exists coin_pack_id uuid references public.coin_packs(id) on delete set null;
alter table public.purchase_requests add column if not exists coins int;

-- القيد الأصلي اسمه purchase_requests_check (وليس kind_payload) — نستبدله
-- بقيد يغطي الأنواع الثلاثة
alter table public.purchase_requests drop constraint if exists purchase_requests_check;
alter table public.purchase_requests
  add constraint purchase_requests_check
  check (
       (kind = 'credits' and pack_id is not null and credits is not null)
    or (kind = 'plan'    and plan_key is not null)
    or (kind = 'coins'   and coin_pack_id is not null and coins is not null)
  );

create index if not exists idx_purchase_requests_coin_pack
  on public.purchase_requests (coin_pack_id);

-- ----------------------------------------------------------------------------
-- ٣) economy_exchange_settings — صف واحد (D-M-08)
--    rate_coins_per_credit: كام كوين = ١ كريدت (اتجاه coins → credits).
--    rate_coins_per_credit_out: كام كوين بياخدهم الطالب مقابل ١ كريدت
--    (اتجاه credits → coins) — أقل من سعر الشراء عشان الـ arbitrage.
-- ----------------------------------------------------------------------------
create table if not exists public.economy_exchange_settings (
  id int primary key default 1 check (id = 1),
  coins_to_credits_enabled boolean not null default true,
  credits_to_coins_enabled boolean not null default true,
  rate_coins_per_credit int not null default 10 check (rate_coins_per_credit >= 1),
  rate_coins_per_credit_out int not null default 8 check (rate_coins_per_credit_out >= 1),
  min_coins int not null default 50 check (min_coins >= 1),
  min_credits int not null default 10 check (min_credits >= 1),
  daily_cap_coins int not null default 3000 check (daily_cap_coins >= 0),
  daily_cap_credits int not null default 300 check (daily_cap_credits >= 0),
  updated_at timestamptz not null default now(),
  check (rate_coins_per_credit_out < rate_coins_per_credit)
);

alter table public.economy_exchange_settings enable row level security;

drop policy if exists "economy_exchange_settings: public read" on public.economy_exchange_settings;
create policy "economy_exchange_settings: public read"
  on public.economy_exchange_settings for select
  using (true);

insert into public.economy_exchange_settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- ٤) المصادر: 'exchange' جديد + تفعيل 'purchase' (مسار يدوي مُراجَع — D-M-09)
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values ('exchange', 8, 300, true)
on conflict (id) do update set
  amount = excluded.amount,
  daily_cap = excluded.daily_cap,
  is_live = excluded.is_live;

-- 'purchase' بيتفعّل لأن مسار الدفع اليدوي مُراجَع من أدمن — بدون سقف
-- يومي (كل طلب مدفوع ومراجَع، والسقف هيمنع شراء أكتر من باقة في اليوم).
update public.coin_source_rules
   set is_live = true, daily_cap = null
 where id = 'purchase';

-- ----------------------------------------------------------------------------
-- ٤ب) credit_grants.source — نتوسع بـ 'exchange' (D-M-08)
--     من غيرها منح التبديل هترفض عند الـ CHECK الموجود.
-- ----------------------------------------------------------------------------
alter table public.credit_grants drop constraint if exists credit_grants_source_check;
alter table public.credit_grants
  add constraint credit_grants_source_check
  check (source in ('monthly', 'manual', 'trial', 'bonus', 'refund', 'exchange'));

-- ----------------------------------------------------------------------------
-- ٥) add_coins_grant — يقبل تصنيف 'exchange'
-- ----------------------------------------------------------------------------
create or replace function public.add_coins_grant(
  p_user_id      uuid,
  p_source       text,
  p_source_class text,
  p_ref_id       text,
  p_amount       int,
  p_metadata     jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_cap     int;
  v_live    boolean;
  v_awarded int := 0;
begin
  /* current_user = postgres (definer) يعني نداء داخلي من دالة definer —
     مسموح. نداء مباشر من service_role كمان مسموح. مستخدم عادي ممنوع
     بالـ REVOKE تحت. */
  if current_user in ('authenticated', 'anon')
     and coalesce((auth.jwt() ->> 'role'), '') not in ('service_role', 'postgres')
  then
    raise exception 'add_coins_grant: مسار داخلي (service_role) بس';
  end if;
  if p_source_class not in ('purchase', 'ads', 'admin', 'exchange') then
    raise exception 'add_coins_grant: تصنيف غير مسموح: %', p_source_class;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'add_coins_grant: مبلغ غير صالح: %', p_amount;
  end if;

  select daily_cap, is_live into v_cap, v_live
    from public.coin_source_rules where id = p_source;
  if not found then
    raise exception 'add_coins_grant: مصدر مش معروف: %', p_source;
  end if;
  if not v_live then
    raise exception 'add_coins_grant: المصدر % مقفول', p_source;
  end if;

  if v_cap is not null then
    if (select count(*) from public.coin_ledger
         where user_id = p_user_id
           and source = p_source
           and source_type = 'earn'
           and created_at >= (public.cairo_day()::timestamp
                              at time zone 'Africa/Cairo')) >= v_cap then
      return 0;
    end if;
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (p_user_id, p_source, p_amount, 'earn', p_ref_id, coalesce(p_metadata, '{}'::jsonb), p_source_class)
  on conflict do nothing;

  if found then
    v_awarded := p_amount;
  end if;

  return v_awarded;
end;
$$;

revoke all on function public.add_coins_grant(uuid, text, text, text, int, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- ٦) exchange_coins_to_credits — تبديل ذري (D-M-08)
--    الكوينز بتخصم (spend) والكريدت بيتمنح (grant + ledger) في نفس المعاملة.
--    ref واحد مشترك بين الـ ledgerين يضمن idempotency عند إعادة المحاولة.
-- ----------------------------------------------------------------------------
create or replace function public.exchange_coins_to_credits(p_coins int)
returns table (credits_granted int, coin_balance int, credit_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid      uuid := auth.uid();
  v_settings public.economy_exchange_settings%rowtype;
  v_balance  int;
  v_credits  int;
  v_ref      text;
  v_today    int;
begin
  if v_uid is null then
    raise exception 'exchange_coins_to_credits: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'exchange_coins_to_credits: الزائر مايقدرش يبدّل';
  end if;
  if p_coins is null or p_coins <= 0 then
    raise exception 'exchange_coins_to_credits: مبلغ غير صالح';
  end if;

  select * into v_settings from public.economy_exchange_settings where id = 1;
  if not found or not v_settings.coins_to_credits_enabled then
    raise exception 'exchange_coins_to_credits: التبديل مقفول حاليًا';
  end if;
  if p_coins < v_settings.min_coins then
    raise exception 'exchange_coins_to_credits: أقل مبلغ للتبديل % كوين', v_settings.min_coins;
  end if;

  /* السقف اليومي: مجموع المبالغ المبدّلة فعليًا النهارده (بالقاهرة). */
  select coalesce(sum(amount), 0)::int into v_today
    from public.coin_ledger
   where user_id = v_uid
     and source = 'exchange'
     and source_type = 'spend'
     and created_at >= (public.cairo_day()::timestamp at time zone 'Africa/Cairo');
  if v_today + p_coins > v_settings.daily_cap_coins then
    raise exception 'exchange_coins_to_credits: وصلت سقف التبديل اليومي (% كوين)', v_settings.daily_cap_coins;
  end if;

  -- قفل المحفظة: نفس نمط open_box/purchase_item.
  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;
  if v_balance < p_coins then
    raise exception 'exchange_coins_to_credits: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, p_coins;
  end if;

  v_credits := floor(p_coins / v_settings.rate_coins_per_credit::numeric)::int;
  if v_credits < 1 then
    raise exception 'exchange_coins_to_credits: % كوين أقل من سعر كريدت واحد (%)', p_coins, v_settings.rate_coins_per_credit;
  end if;

  /* ref مشترك — الفهرس الفريد على (user, reason, ref) في الـ ledgerين
     يخلي إعادة المحاولة آمنة: الصف التاني بيتعمل عليه do nothing،
     والخصم بنفس الـ ref برضه بيتجاهل. */
  v_ref := 'xc:' || gen_random_uuid()::text;

  -- خصم الكوينز (spend)
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (v_uid, 'exchange', -p_coins, 'spend', v_ref,
          jsonb_build_object('direction', 'coins_to_credits', 'credits', v_credits,
                             'rate', v_settings.rate_coins_per_credit), 'exchange');

  if not found then
    raise exception 'exchange_coins_to_credits: فشل تسجيل الخصم — جرّب تاني';
  end if;

  -- منح الكريدت (نفس محاسبة grant_credits: صف grant + صف ledger +)
  insert into public.credit_grants
    (user_id, amount, source, grant_ref, expires_at, notes)
  values
    (v_uid, v_credits, 'exchange', 'exchange:' || v_ref,
     now() + interval '90 days', 'تبديل من كوينز — ' || p_coins || ' كوين')
    returning amount into v_credits;

  insert into public.ai_credit_ledger (user_id, reason, delta, ref_id, metadata)
  values (v_uid, 'exchange', v_credits, 'exchange:' || v_ref,
          jsonb_build_object('coins', p_coins, 'rate', v_settings.rate_coins_per_credit));

  return query
    select v_credits,
           (select coalesce(sum(amount), 0)::int from public.coin_ledger where user_id = v_uid),
           (select coalesce(sum(delta), 0)::int from public.ai_credit_ledger where user_id = v_uid);
end;
$$;

revoke all on function public.exchange_coins_to_credits(int) from public, anon;
grant execute on function public.exchange_coins_to_credits(int) to authenticated;

-- ----------------------------------------------------------------------------
-- ٧) exchange_credits_to_coins — الاتجاه العكسي (D-M-08)
--    الكريدت بتخصم من الـ ledger (نفس محاسبة reserve) والكوينز بتضاف
--    عبر المسار المركزي (source='exchange', source_class='exchange').
-- ----------------------------------------------------------------------------
create or replace function public.exchange_credits_to_coins(p_credits int)
returns table (coins_granted int, credit_balance int, coin_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid      uuid := auth.uid();
  v_settings public.economy_exchange_settings%rowtype;
  v_balance  int;
  v_coins    int;
  v_ref      text;
  v_today    int;
begin
  if v_uid is null then
    raise exception 'exchange_credits_to_coins: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'exchange_credits_to_coins: الزائر مايقدرش يبدّل';
  end if;
  if p_credits is null or p_credits <= 0 then
    raise exception 'exchange_credits_to_coins: مبلغ غير صالح';
  end if;

  select * into v_settings from public.economy_exchange_settings where id = 1;
  if not found or not v_settings.credits_to_coins_enabled then
    raise exception 'exchange_credits_to_coins: التبديل مقفول حاليًا';
  end if;
  if p_credits < v_settings.min_credits then
    raise exception 'exchange_credits_to_coins: أقل مبلغ للتبديل % كريدت', v_settings.min_credits;
  end if;

  select coalesce(sum(-delta), 0)::int into v_today
    from public.ai_credit_ledger
   where user_id = v_uid
     and reason = 'exchange'
     and delta < 0
     and created_at >= (public.cairo_day()::timestamp at time zone 'Africa/Cairo');
  if v_today + p_credits > v_settings.daily_cap_credits then
    raise exception 'exchange_credits_to_coins: وصلت سقف التبديل اليومي (% كريدت)', v_settings.daily_cap_credits;
  end if;

  -- قفل محفظة الكوينز قبل أي كتابة (نفس المعاملة هتكتب فيها).
  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(delta), 0)::int into v_balance
    from public.ai_credit_ledger where user_id = v_uid;
  if v_balance < p_credits then
    raise exception 'exchange_credits_to_coins: رصيد الكريدت مش كفاية (معاك % ومحتاج %)', v_balance, p_credits;
  end if;

  v_coins := p_credits * v_settings.rate_coins_per_credit_out;
  v_ref   := 'xc:' || gen_random_uuid()::text;

  -- خصم الكريدت من الـ ledger (نفس نمط reserve_ai_credit).
  insert into public.ai_credit_ledger (user_id, reason, delta, ref_id, metadata)
  values (v_uid, 'exchange', -p_credits, v_ref,
          jsonb_build_object('direction', 'credits_to_coins', 'coins', v_coins,
                             'rate', v_settings.rate_coins_per_credit_out));

  if not found then
    raise exception 'exchange_credits_to_coins: فشل تسجيل الخصم — جرّب تاني';
  end if;

  -- إضافة الكوينز عبر المسار المركزي (استدعاء داخلي — definer).
  v_coins := public.add_coins_grant(
    v_uid, 'exchange', 'exchange', v_ref, v_coins,
    jsonb_build_object('credits', p_credits, 'rate', v_settings.rate_coins_per_credit_out)
  );

  if v_coins <= 0 then
    /* السقف اليومي لمصدر exchange في coin_source_rules اتقفل —
       نرجّع خصم الكريدت بدل ما نسيبه مخصوم بلا مقابل. */
    insert into public.ai_credit_ledger (user_id, reason, delta, ref_id, metadata)
    values (v_uid, 'exchange_refund', p_credits, v_ref,
            jsonb_build_object('reason', 'exchange_daily_cap'));
    raise exception 'exchange_credits_to_coins: وصلت سقف التبديل اليومي — جرّب بكرة';
  end if;

  return query
    select v_coins,
           (select coalesce(sum(delta), 0)::int from public.ai_credit_ledger where user_id = v_uid),
           (select coalesce(sum(amount), 0)::int from public.coin_ledger where user_id = v_uid);
end;
$$;

revoke all on function public.exchange_credits_to_coins(int) from public, anon;
grant execute on function public.exchange_credits_to_coins(int) to authenticated;

-- ----------------------------------------------------------------------------
-- ٨) P0-G — anon ممنوع من الجديد
-- ----------------------------------------------------------------------------
revoke execute on function public.exchange_coins_to_credits(int)   from anon;
revoke execute on function public.exchange_credits_to_coins(int)   from anon;

-- ============================================================================
-- نهاية 115 — التدفق: طلب كوينز (يدوي) → موافقة أدمن → add_coins_grant
--             التبديل → RPCs ذرية بالاتجاهين مع سقوف ومحاسبة كاملة
-- ============================================================================
