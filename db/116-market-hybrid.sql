-- ============================================================================
-- 116 — MARKET HYBRID PRICING + LEARNING STORE (D-M-03 · D-M-10)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرارات: D-M-03 (الشراء المختلط ذرّي — Coins + Credits معًا أو لا شيء)
--           D-M-10 (لا جداول مكررة: سجل المشتريات = coin_ledger +
--           purchase_requests — مش coin_orders/coin_products جديدة)
-- يعتمد على: db/shop.sql · db/economy-phase-e.sql · db/115
--
-- ── اللي الملف ده بيعمله ──
--  ١) shop_catalog.credits_price — تسعير مختلط (null = كوينز بس).
--  ٢) ٤ منتجات Learning Store هجينة (تجارب AI — من التصميم §3).
--  ٣) purchase_item تُستبدل بنسخة موحّدة تجمع:
--       • معالجة المنتجات المفيدة (entitlement / ai_credit) من phase-e
--         — ⚠️ النسخة الحية في الإنتاج كانت القديمة (من غير معالجة
--         useful) — يعني شراء حزم AI بالكوينز كان بيخصم من غير منح.
--         الملف ده بصلّح دي.
--       • الشراء المختلط: خصم Credits من ai_credit_ledger بنفس المعاملة
--         — فشل أي جانب = rollback للكل (D-M-03).
--  ٤) سجل المشتريات: view `shop_purchase_history` فوق coin_ledger
--     (المشتريات بالكوينز) — طلبات الفلوس موجودة في purchase_requests.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) التسعير المختلط — عمود واحد جديد، additive
-- ----------------------------------------------------------------------------
alter table public.shop_catalog
  add column if not exists credits_price int;

do $$
begin
  alter table public.shop_catalog add constraint shop_catalog_credits_price_chk
    check (credits_price is null or credits_price > 0);
exception
  when duplicate_object then null;
end
$$;

-- ----------------------------------------------------------------------------
-- ٢) منتجات Learning Store — تجارب AI بالتسعير المختلط (التصميم §3)
--    الأسعار داخل نطاقات الندرة (BANDS في lib/shop/catalog.ts) — أرقام
--    التصميم التجريبية اتظبطت على النطاقات ومعايرتها من لوحة الإدارة بعدين.
--    الـ effect = entitlement (ميزة بتتفتح) — ربطها بتجارب AI فعلية في
--    DEV-M3 (نفس نمط useful.study-booster).
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  ('learning.ai-exam-experience', null, 500, 30, null, 'rare',
   '{"useful": {"type": "entitlement", "kind": "feature", "value": "ai-exam-experience"}}'::jsonb),
  ('learning.ai-advanced-review', null, 1000, 50, null, 'epic',
   '{"useful": {"type": "entitlement", "kind": "feature", "value": "ai-advanced-review"}}'::jsonb),
  ('learning.magic-persona-plus', null, 1200, 75, null, 'epic',
   '{"useful": {"type": "entitlement", "kind": "feature", "value": "magic-persona-plus"}}'::jsonb),
  ('learning.smart-review-pack', null, 2000, 100, null, 'legendary',
   '{"useful": {"type": "entitlement", "kind": "feature", "value": "smart-review-pack"}}'::jsonb)
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot,
  unlock = excluded.unlock;

-- ----------------------------------------------------------------------------
-- ٣) purchase_item — النسخة الموحّدة (cosmetic + useful + hybrid)
--    مبنية على النسخة الحية (docs/artifacts/purchase-item-live-def.sql)
--    + معالجة useful من phase-e + خصم Credits للهجين. نفس التوقيع
--    (spent, balance) — الكلاينت الحالي يشتغل من غير تغيير.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_item(p_item_id text)
returns table (spent int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid          uuid := auth.uid();
  v_price        int;
  v_credits_price int;
  v_unlock       jsonb;
  v_metadata     jsonb;
  v_balance      int;
  v_disc         int  := 0;
  v_excl         boolean := false;
  v_in_day       boolean := false;
  v_useful       jsonb;
  v_useful_type  text;
  v_ent_kind     text;
  v_ent_value    text;
  v_credit_amt   int;
  v_purchase_ref text;
  v_credit_balance int;
begin
  if v_uid is null then
    raise exception 'purchase_item: لازم تكون داخل بحسابك';
  end if;

  -- السعر من الجدول مش من الكلاينت. لو الكلاينت بعت السعر، أي حد يشتري
  -- أغلى عنصر بكوين واحد من الكونسول.
  select price, credits_price, unlock, metadata into v_price, v_credits_price, v_unlock, v_metadata
    from public.shop_catalog where id = p_item_id;

  if not found then
    raise exception 'purchase_item: عنصر مش موجود: %', p_item_id;
  end if;

  v_useful := coalesce(v_metadata, '{}'::jsonb) -> 'useful';
  v_useful_type := v_useful ->> 'type';

  -- idempotency / already-owned: للـ cosmetic والمفيد والهجين
  if exists (select 1 from public.shop_inventory
              where user_id = v_uid and item_id = p_item_id) then
    raise exception 'purchase_item: العنصر ده معاك بالفعل';
  end if;

  if v_useful_type = 'entitlement' then
    v_ent_kind := btrim(v_useful ->> 'kind');
    v_ent_value := btrim(v_useful ->> 'value');
    if v_ent_kind is null or v_ent_kind = '' or v_ent_value is null or v_ent_value = '' then
      raise exception 'purchase_item: entitlement effect غير مكتمل للمنتج %', p_item_id;
    end if;
    -- الدائم معاك؟ لا خصم حتى لو صف المخزن ضايع (سباق نادر)
    if exists (
      select 1 from public.entitlements
       where user_id = v_uid
         and kind = v_ent_kind
         and value = v_ent_value
         and (expires_at is null or expires_at > now())
    ) then
      raise exception 'purchase_item: العنصر ده معاك بالفعل';
    end if;
  elsif v_useful_type = 'ai_credit' then
    v_credit_amt := (v_useful ->> 'amount')::int;
    if v_credit_amt is null or v_credit_amt <= 0 then
      raise exception 'purchase_item: ai_credit amount غير صالح للمنتج %', p_item_id;
    end if;
  elsif v_useful is not null and v_useful_type is not null then
    raise exception 'purchase_item: نوع useful غير مدعوم: %', v_useful_type;
  end if;

  -- الشرط بيتحقق **في السيرفر** مش في الواجهة بس: إخفاء زرار مش حماية.
  perform public.ensure_daily_shop();

  select d.discount, d.exclusive into v_disc, v_excl
    from public.shop_daily d
   where d.day = (now() at time zone 'utc')::date
     and d.item_id = p_item_id;
  v_in_day := found;

  if not v_in_day then
    v_disc := 0;
    v_excl := false;
  end if;

  if v_unlock is not null and (v_unlock ->> 'kind') = 'daily' then
    /* العنصر الحصري. النوع 'daily' مش معروف لـ unlock_satisfied فبترجّع
       false دايماً — يعني العنصر ده **مقفول قفل دائم** والسطر ده هو
       الاستثناء الوحيد في المشروع كله. مكتوب صريح عشان لو اتشال، العنصر
       يقعد مقفول (فشل آمن) مش يتفتح للكل. */
    if not v_excl then
      raise exception 'purchase_item: العنصر ده بيتباع في المتجر اليومي بس';
    end if;
  elsif v_unlock is not null and not public.unlock_satisfied(v_uid, v_unlock) then
    raise exception 'purchase_item: العنصر لسه مقفول';
  end if;

  -- ⚠️ الخصم بيتحسب **هنا** من صف الجدول — مش بيتبعت من الواجهة. الخصم
  -- بيتطبق على جزء الكوينز بس — جزء الكريدت ثابت (D-M-06).
  if v_disc > 0 then
    v_price := v_price - floor(v_price * v_disc / 100.0)::int;
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 القفل ده بيمنع الشرا المزدوج: طلبين في نفس اللحظة كانوا هيقروا نفس
  -- الرصيد ويخصموا الاتنين (عنصرين بسعر واحد). القفل على صف المحفظة
  -- بيخلّي التاني يستنى الأول، فيقرا الرصيد بعد الخصم.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'purchase_item: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  -- ── الشراء المختلط (D-M-03): التحقق من الكريدت **قبل** أي خصم —
  --    فشل أي جانب بعد كده = rollback كامل (لا كوينز ولا كريدت).
  if v_credits_price is not null then
    select coalesce(sum(delta), 0)::int into v_credit_balance
      from public.ai_credit_ledger where user_id = v_uid;
    if v_credit_balance < v_credits_price then
      raise exception 'purchase_item: رصيد الكريدت مش كفاية (معاك % ومحتاج %)', v_credit_balance, v_credits_price;
    end if;
  end if;

  -- مرجع شراء فريد يربط خصم الكوينز والكريدت بالـ effect
  v_purchase_ref := p_item_id || ':' || gen_random_uuid()::text;

  -- المجاني بياخد صف مخزن من غير حركة في السجل.
  if v_price > 0 then
    if v_useful_type is not null then
      insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
      values (v_uid, 'store_purchase', -v_price, 'spend', v_purchase_ref,
              jsonb_build_object('item_id', p_item_id, 'useful_type', v_useful_type,
                                 'hybrid', v_credits_price is not null,
                                 'credits', coalesce(v_credits_price, 0)));
    else
      insert into public.coin_ledger (user_id, source, amount, source_type, ref_id)
      values (v_uid, 'purchase', -v_price, 'spend', p_item_id);
    end if;
  end if;

  -- خصم الكريدت للهجين — نفس المعاملة (فشله = rollback للكوينز كمان)
  if v_credits_price is not null then
    insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
    values (v_uid, -v_credits_price, 'hybrid_purchase', v_purchase_ref,
            jsonb_build_object('item_id', p_item_id, 'coins', v_price));
  end if;

  -- منح الـ effect — في نفس المعاملة (فشله = rollback للخصمين)
  if v_useful_type = 'entitlement' then
    insert into public.entitlements (user_id, kind, value, metadata)
    values (v_uid, v_ent_kind, v_ent_value,
            jsonb_build_object('source', 'store_purchase', 'item_id', p_item_id,
                               'purchase_ref', v_purchase_ref))
    on conflict (user_id, kind, value) where expires_at is null do nothing;
  elsif v_useful_type = 'ai_credit' then
    insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
    values (v_uid, v_credit_amt, 'store_purchase', v_purchase_ref,
            jsonb_build_object('item_id', p_item_id, 'amount', v_credit_amt));
  end if;

  insert into public.shop_inventory (user_id, item_id) values (v_uid, p_item_id);

  return query select v_price, (v_balance - v_price);
end;
$$;

revoke all on function public.purchase_item(text) from public, anon;
grant execute on function public.purchase_item(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٤) سجل المشتريات (D-M-10) — view فوق coin_ledger، مش جدول مكرر
--    security_invoker: الـ RLS بتاع coin_ledger (صاحبها بس) بيتطبق —
--    من غيره الـ view كان هورّي مشتريات كل الناس.
-- ----------------------------------------------------------------------------
create or replace view public.shop_purchase_history
with (security_invoker = true) as
select
  l.id,
  l.user_id,
  l.source,
  case l.source
    when 'purchase' then 'عنصر من المتجر'
    when 'store_purchase' then 'منتج مفيد'
    when 'exchange' then 'تبديل لكريدت'
    when 'box' then 'صندوق'
    else l.source
  end as label_ar,
  l.amount,
  l.ref_id,
  l.metadata,
  l.created_at
from public.coin_ledger l
where l.source_type = 'spend';

grant select on public.shop_purchase_history to authenticated;

-- ============================================================================
-- نهاية 116 — الشراء المختلط ذرّي في RPC واحدة · لا جداول مالية مكررة
-- ============================================================================
