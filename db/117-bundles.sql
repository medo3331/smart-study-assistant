-- ============================================================================
-- 117 — BUNDLES & OFFERS (DEV-M4 · D-M-03/D-M-06/D-M-10/D-M-11)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- الحزم = منتجات عادية في shop_catalog بنوع useful جديد 'bundle':
--   شرا واحد بيمنح كل المكونات (عناصر مخزن + entitlements) في نفس
--   المعاملة — فشل أي مكون = rollback للكل. السعر المختلط بنفس
--   آلية credits_price (db/116).
-- ⚠️ مرآة الكتالوج في lib/shop/catalog.ts — الأرقام لازم تتطابق.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) purchase_item — نوع 'bundle' (مبني على نسخة db/116 بالحرف + الفرع ده)
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
  v_components   text[];
  v_ents         jsonb;
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

  -- idempotency / already-owned: للـ cosmetic والمفيد والهجين والحزمة
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
  elsif v_useful_type = 'bundle' then
    -- الحزمة: مكوناتها لازم تكون موجودة في الكتالوج وغير فاضية.
    -- العناصر اللي معاك من قبل بتتخطّى (on conflict do nothing) —
    -- مفيش استرداد فرق، الحزمة دايمًا أرخص من مجموع مكوناتها.
    select array_agg(btrim(value)) into v_components
      from jsonb_array_elements_text(v_useful -> 'items');
    v_ents := v_useful -> 'entitlements';
    if v_ents is not null and jsonb_typeof(v_ents) <> 'array' then
      raise exception 'purchase_item: entitlements لازم تكون ليستة: %', p_item_id;
    end if;
    -- الحزمة لازم يكون فيها حاجة: عناصر أو entitlements
    if (v_components is null or array_length(v_components, 1) = 0)
       and (v_ents is null or jsonb_array_length(v_ents) = 0) then
      raise exception 'purchase_item: حزمة فاضية: %', p_item_id;
    end if;
    if v_components is not null and exists (
      select 1
        from unnest(v_components) as c(id)
        left join public.shop_catalog sc on sc.id = c.id
       where sc.id is null
    ) then
      raise exception 'purchase_item: الحزمة فيها عنصر مش موجود: %', p_item_id;
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
    if not v_excl then
      raise exception 'purchase_item: العنصر ده بيتباع في المتجر اليومي بس';
    end if;
  elsif v_unlock is not null and not public.unlock_satisfied(v_uid, v_unlock) then
    raise exception 'purchase_item: العنصر لسه مقفول';
  end if;

  -- ⚠️ الخصم بيتحسب **هنا** من صف الجدول. الخصم بيتطبق على جزء الكوينز
  -- بس — جزء الكريدت ثابت (D-M-06).
  if v_disc > 0 then
    v_price := v_price - floor(v_price * v_disc / 100.0)::int;
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 القفل ده بيمنع الشرا المزدوج.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'purchase_item: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  -- ── الشراء المختلط (D-M-03): فحص الكريدت **قبل** أي خصم —
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
  elsif v_useful_type = 'bundle' then
    insert into public.shop_inventory (user_id, item_id)
    select v_uid, c from unnest(v_components) as t(c)
    on conflict (user_id, item_id) do nothing;
    -- entitlements الحزمة (لو فيه)
    if v_ents is not null then
      insert into public.entitlements (user_id, kind, value, metadata)
      select v_uid,
             btrim(e ->> 'kind'),
             btrim(e ->> 'value'),
             jsonb_build_object('source', 'store_purchase', 'item_id', p_item_id,
                                'purchase_ref', v_purchase_ref)
        from jsonb_array_elements(v_ents) as e
      on conflict (user_id, kind, value) where expires_at is null do nothing;
    end if;
  end if;

  insert into public.shop_inventory (user_id, item_id) values (v_uid, p_item_id);

  return query select v_price, (v_balance - v_price);
end;
$$;

revoke all on function public.purchase_item(text) from public, anon;
grant execute on function public.purchase_item(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٢) الحزم الثلاث من التصميم §8 — مرآتها في lib/shop/catalog.ts
--    السعر دايمًا أقل من مجموع مكوناته (دي فكرة الحزمة).
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  ('shop.bundle-starter', null, 600, null, null, 'rare',
   '{"useful": {"type": "bundle", "items": ["avatar.dolphin", "frame.corners", "title.regular"]}}'::jsonb),
  ('shop.bundle-collector', null, 1500, null, null, 'epic',
   '{"useful": {"type": "bundle", "items": ["companion.ghost", "companion.robot", "frame.glow"]}}'::jsonb),
  ('shop.bundle-study', null, 1200, 60, null, 'epic',
   '{"useful": {"type": "bundle", "items": [], "entitlements": [{"kind": "feature", "value": "ai-advanced-review"}, {"kind": "feature", "value": "ai-exam-experience"}]}}'::jsonb)
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot,
  unlock = excluded.unlock;

-- ============================================================================
-- نهاية 117 — الحزم: منحة مجمعة ذرّية بكل المكونات
-- ============================================================================
