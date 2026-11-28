CREATE OR REPLACE FUNCTION public._award_coins_variable(p_source text, p_ref_id text, p_amount integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(awarded integer, balance integer, capped boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_expected int;
  v_max      int;
  v_ach      text;
  v_rarity   text;
  v_ref      text := p_ref_id;
begin
  /* الحماية الفعلية هي REVOKE EXECUTE من anon/authenticated/service_role
     (أسفل الملف). لا نستخدم current_user هنا: داخل SECURITY DEFINER
     يساوي مالك الدالة، فلا يميّز نداء الكلاينت عن النداء الداخلي. */
  if v_uid is null then
    raise exception '_award_coins_variable: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception '_award_coins_variable: الزائر مايكسبش';
  end if;
  if p_source not in ('achievement', 'wheel', 'box_refund') then
    raise exception '_award_coins_variable: مصدر غير مسموح: %', p_source;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '_award_coins_variable: مبلغ غير صالح';
  end if;

  -- الحد الأعلى الموثّق في السجل المركزي (وليس مبلغًا يختاره العميل).
  select r.amount into v_max from public.coin_source_rules r where r.id = p_source;
  if v_max is null then
    raise exception '_award_coins_variable: مصدر غير مسجّل: %', p_source;
  end if;
  if p_amount > v_max then
    raise exception '_award_coins_variable: المبلغ % يتجاوز الحد الأعلى % للمصدر %', p_amount, v_max, p_source;
  end if;

  if p_source = 'achievement' then
    v_ach := coalesce(p_ref_id, '');
    if v_ach like 'achievement:%' then
      v_ach := split_part(v_ach, ':', 2);
    end if;
    if v_ach = '' then
      raise exception '_award_coins_variable: achievement محتاج معرّف الإنجاز';
    end if;

    select coins into v_expected
      from public.achievements_catalog
     where id = v_ach;

    if v_expected is null then
      raise exception '_award_coins_variable: إنجاز غير معروف: %', v_ach;
    end if;
    if p_amount <> v_expected then
      raise exception '_award_coins_variable: مبلغ الإنجاز % غير مطابق (%)', v_ach, v_expected;
    end if;
    if not exists (
      select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = v_ach
    ) then
      raise exception '_award_coins_variable: الإنجاز مش مسجّل على حسابك';
    end if;

    v_ref := 'achievement:' || v_ach;

  elsif p_source = 'wheel' then
    select coins into v_expected
      from public.shop_wheel_prizes
     where id = p_ref_id;

    if v_expected is null or p_amount <> v_expected then
      raise exception '_award_coins_variable: جائزة العجلة غير مطابقة';
    end if;
    -- الفهرس الفريد على (user, 'wheel', cairo_day) يمنع أكثر من لفة/يوم.
    v_ref := public.cairo_day()::text;

  else -- box_refund
    v_rarity := p_metadata ->> 'rarity';
    select coins into v_expected
      from public.shop_refunds
     where rarity = v_rarity;

    if v_expected is null or p_amount <> v_expected then
      raise exception '_award_coins_variable: تعويض الصندوق غير مطابق';
    end if;
    -- ref يفضل null عن قصد: تعويضات متعددة مشروعة خلال اليوم، ومحدودة
    -- بعملية فتح صندوق فعلية (خصم حقيقي في نفس المعاملة).
    v_ref := null;
  end if;

  return query
    select * from public._award_coins_core(v_uid, p_source, v_ref, p_amount, p_metadata);
end;
$function$

