-- ============================================================================
-- Phase E — Useful Store Products (متجر مفيد)
-- التاريخ: ١ سبتمبر ٢٠٢٦
--
-- الهدف:
--   إضافة 3 منتجات مفيدة (Useful) مع شراء ذري يخصم Coins ويمنح Effect
--   من الـ catalog الموثوق فقط — لا تلاعب بالسعر/الـ effect من الكلاينت
--
-- Scope: additive فقط — لا تغيير XP/Coin formulas، لا AiRouter، لا Subscription
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- يتطلب Phase D مطبق (entitlements + ai_credit_ledger)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) توسيع shop_catalog لتمثيل Useful Products
-- ----------------------------------------------------------------------------
-- الـ catalog الحالي: id, slot, price, unlock, rarity
-- نحتاج metadata للـ effect — لا نعيد تسمية/حذف أعمدة موجودة
alter table public.shop_catalog add column if not exists metadata jsonb not null default '{}'::jsonb;

-- فهرس اختياري للبحث عن المنتجات المفيدة (ليس للأمان)
create index if not exists shop_catalog_useful_idx
  on public.shop_catalog ((metadata->'useful'->>'type'))
  where (metadata ? 'useful');

-- ----------------------------------------------------------------------------
-- 2) المنتجات المفيدة — 3 فقط (لا marketplace)
-- ----------------------------------------------------------------------------
-- التسعير مقيس على BANDS في lib/shop/catalog.ts و maxDailyCoins ≈ 300-400:
--   Study Booster (entitlement دائم) → 2200 (legendary 1800-2600, t~0.57)
--     مبرر: ميزة دائمة = 5-6 أيام max أو ~30 يوم عادي — غالية لكن قابلة للتحقيق
--   AI Starter Pack (100 credits) → 650 (rare 450-700, t~0.8) = 6.5 coin/credit
--   AI Power Pack (500 credits) → 2400 (legendary 1800-2600, t~0.75) = 4.8 coin/credit
--     bulk discount ~26% — 5x credits مقابل 3.7x سعر Starter
-- كلها unlock=null (متاحة من أول يوم)، slot=null (لا تُلبس)، is_active ضمني بالوجود

insert into public.shop_catalog (id, slot, price, unlock, rarity, metadata) values
  ('useful.study-booster', null, 2200, null, 'legendary',
   '{"useful": {"type": "entitlement", "kind": "feature", "value": "advanced-study"}}'::jsonb),
  ('useful.ai-starter-pack', null, 650, null, 'rare',
   '{"useful": {"type": "ai_credit", "amount": 100}}'::jsonb),
  ('useful.ai-power-pack', null, 2400, null, 'legendary',
   '{"useful": {"type": "ai_credit", "amount": 500}}'::jsonb)
on conflict (id) do update set
  price = excluded.price,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot,
  unlock = excluded.unlock;

-- لا نغير أسعار/خصائص الـ 90 عنصر cosmetic — فقط الـ 3 الجدد

-- ----------------------------------------------------------------------------
-- 3) توسيع purchase_item ليدعم Useful Products (يحافظ على Cosmetics)
-- ----------------------------------------------------------------------------
-- المسار الموحد:
--   Client → purchase_item(item_id)
--     → validate catalog (server price + effect)
--     → validate unlock (server)
--     → lock coin_wallets (يمنع Race)
--     → validate balance (server sum)
--     → debit coin_ledger (source='purchase' للـ cosmetic, 'store_purchase' للمفيد)
--     → grant effect (entitlements / ai_credit_ledger) — في نفس المعاملة
--     → insert shop_inventory — في نفس المعاملة
--     → commit
-- إذا فشل grant → rollback كامل (لا خصم بدون Effect)

create or replace function public.purchase_item(p_item_id text)
returns table (spent int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid        uuid := auth.uid();
  v_price      int;
  v_unlock     jsonb;
  v_metadata   jsonb;
  v_slot       text;
  v_rarity     text;
  v_balance    int;
  v_disc       int  := 0;
  v_excl       boolean := false;
  v_in_day     boolean := false;
  v_useful     jsonb;
  v_useful_type text;
  v_ent_kind   text;
  v_ent_value  text;
  v_credit_amt int;
  v_purchase_ref text;
begin
  if v_uid is null then
    raise exception 'purchase_item: لازم تكون داخل بحسابك';
  end if;

  -- السعر والـ effect من الجدول فقط — أي رقم من الكلاينت مرفوض
  select price, unlock, metadata, slot, rarity
    into v_price, v_unlock, v_metadata, v_slot, v_rarity
    from public.shop_catalog where id = p_item_id;

  if not found then
    raise exception 'purchase_item: عنصر مش موجود: %', p_item_id;
  end if;

  v_useful := coalesce(v_metadata, '{}'::jsonb) -> 'useful';
  v_useful_type := v_useful ->> 'type';

  -- idempotency / already-owned: للـ cosmetic والمفيد (Phase E: المفيد أيضاً مرة واحدة)
  -- للـ entitlement نتحقق من entitlements مباشرةً أيضاً (حتى لو inventory لم يُكتب لسبب ما)
  if exists (select 1 from public.shop_inventory where user_id = v_uid and item_id = p_item_id) then
    raise exception 'purchase_item: العنصر ده معاك بالفعل';
  end if;

  if v_useful_type = 'entitlement' then
    v_ent_kind := btrim(v_useful ->> 'kind');
    v_ent_value := btrim(v_useful ->> 'value');
    if v_ent_kind is null or v_ent_kind = '' or v_ent_value is null or v_ent_value = '' then
      raise exception 'purchase_item: entitlement effect غير مكتمل للمنتج %', p_item_id;
    end if;
    -- إذا كان entitlement موجوداً بالفعل (دائم) — لا خصم
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
    -- Phase E: AI packs أيضاً مرة واحدة (idempotency عبر inventory)
    -- تكرار الشراء بعد الاستهلاك سيُفتح في Phase F بمفتاح idempotency صريح
  elsif v_useful is not null and v_useful_type is not null then
    raise exception 'purchase_item: نوع useful غير مدعوم: %', v_useful_type;
  end if;

  -- شرط الفتح يتحقق في السيرفر (نفس cosmetic)
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

  if v_disc > 0 then
    v_price := v_price - floor(v_price * v_disc / 100.0)::int;
  end if;

  -- مرجع شراء فريد يربط coin debit بـ effect (للتتبع والـ idempotency في ai_credit_ledger)
  v_purchase_ref := p_item_id || ':' || gen_random_uuid()::text;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 يمنع Race: طلبان متزامنان لنفس المستخدم — الثاني ينتظر الأول
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'purchase_item: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  -- خصم Coins — مصدر منفصل للمفيد لتمييزه في السجل
  if v_price > 0 then
    if v_useful_type is not null then
      insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
      values (v_uid, 'store_purchase', -v_price, 'spend', v_purchase_ref, jsonb_build_object('item_id', p_item_id, 'useful_type', v_useful_type));
    else
      insert into public.coin_ledger (user_id, source, amount, source_type, ref_id)
      values (v_uid, 'purchase', -v_price, 'spend', p_item_id);
    end if;
  end if;

  -- منح الـ effect — في نفس المعاملة (فشل الـ grant = rollback للخصم)
  if v_useful_type = 'entitlement' then
    insert into public.entitlements (user_id, kind, value, metadata)
    values (v_uid, v_ent_kind, v_ent_value, jsonb_build_object('source', 'store_purchase', 'item_id', p_item_id, 'purchase_ref', v_purchase_ref))
    on conflict (user_id, kind, value) where expires_at is null do nothing;
    -- إذا كان insert لم يحدث بسبب conflict (سباق نادر) — نعتبره already-owned لكن الخصم تم
    -- لذلك نتحقق قبل الخصم أعلاه، والـ conflict هنا احتياط فقط
  elsif v_useful_type = 'ai_credit' then
    -- ai_credit_ledger له partial unique (user, reason, ref_id) — ref_id هنا هو purchase_ref الفريد
    insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
    values (v_uid, v_credit_amt, 'store_purchase', v_purchase_ref, jsonb_build_object('item_id', p_item_id, 'amount', v_credit_amt));
  end if;

  -- تسجيل الملكية — للمفيد أيضاً (سجل شراء + idempotency)
  insert into public.shop_inventory (user_id, item_id) values (v_uid, p_item_id);

  return query select v_price, (v_balance - v_price);
end;
$$;

revoke all on function public.purchase_item(text) from public;
grant execute on function public.purchase_item(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Helper للـ UI — قراءة useful effect من catalog (اختياري)
-- ----------------------------------------------------------------------------
-- لا حاجة لـ RPC إضافي — الـ UI يقرأ metadata من shop_catalog مباشرةً عبر RLS
-- لكن نضيف دالة has_entitlement/ai_credit_balance للـ UI لو احتاجت عرض الرصيد
-- (موجودة من Phase D، لا نعيدها)

-- تأكيد أن الجداول الجديدة تقرأ فقط للمالك (Phase D بالفعل)
-- لا سياسات جديدة مطلوبة

-- ----------------------------------------------------------------------------
-- تحقق سريع بعد التشغيل:
--   select id, price, rarity, metadata from shop_catalog where id like 'useful.%';
--   select purchase_item('useful.study-booster'); -- يجب أن يخصم ويمنح entitlement
--   select * from entitlements where kind='feature' and value='advanced-study';
--   select coalesce(sum(delta),0) from ai_credit_ledger where reason='store_purchase';
-- ----------------------------------------------------------------------------
