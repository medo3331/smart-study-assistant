-- ============================================================================
-- 122 — SHOWCASE 🏆 + ARCADE: لعبة الجول (DEV-M3 جزء ٥)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
--
-- ١) get_showcase_by_code — عرض مقتنيات الطالب على بروفايله العام (/u/[code]):
--    الملبوس (أفاتار/لقب/إطار) + أحدث/مفضّل المقتنيات المشتراة (٦ عناصر).
--    security definer عشان RLS بتمنع قراءة مخزن غيرك — والصفحة هي اللي
--    بتحسب الخصوصية (p_allow=false → null فورًا).
-- ٢) claim_break_game: إضافة لعبة 'penalty' (جول ولا لا؟) لنفس مسار
--    مكافآت الألعاب — نفس السقف (٢/يوم) ونفس شرط المذاكرة.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) Showcase RPC — بيرجع الملبوس + ٦ مقتنيات (مفضّل الأول) مع ميتاداتا
--    العناصر المخصصة (الاسم/القيمة/الصورة). العناصر الثابتة الـ client
--    بيقراها من الكتالوج المحلي (itemById).
-- ----------------------------------------------------------------------------
create or replace function public.get_showcase_by_code(p_code text, p_allow boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid;
begin
  if not p_allow then return null; end if;

  select id into v_uid
    from public.profiles
   where public_user_code = upper(p_code);
  if v_uid is null then return null; end if;

  return jsonb_build_object(
    'equipped', coalesce((
      select jsonb_object_agg(e.slot, e.item_id)
        from public.shop_equipped e
       where e.user_id = v_uid
    ), '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'item_id', s.item_id,
                 'favorite', s.favorite,
                 'slot', c.slot,
                 'price', c.price,
                 'metadata', c.metadata
               )
               order by s.favorite desc, s.purchased_at desc
             )
        from (
          select i.item_id, i.favorite, i.purchased_at
            from public.shop_inventory i
            join public.shop_catalog c on c.id = i.item_id and c.price > 0
           where i.user_id = v_uid
           order by i.favorite desc, i.purchased_at desc
           limit 6
        ) s
        join public.shop_catalog c on c.id = s.item_id
    ), '[]'::jsonb)
  );
end; $$;

revoke all on function public.get_showcase_by_code(text, boolean) from public, anon;
grant execute on function public.get_showcase_by_code(text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- ٢) claim_break_game — نفس الجسم الحي (db/114) + لعبة 'penalty'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_break_game(p_game text)
 RETURNS TABLE(coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz','penalty') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if p_game='quiz' and not exists(select 1 from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day and q.solved_at is not null) then return query select 0,0,'أجب عن سؤال Quiz Rush المرتبط بمادتك أولًا'; return; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  select awarded into coins from public.award_coins('break_game', p_game || ':' || v_day);
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select coins,10, case when coins > 0 then 'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده' else 'حد مكافآت الألعاب اتستنفد النهارده' end;
end; $$;
revoke all on function public.claim_break_game(text) from public, anon;
grant execute on function public.claim_break_game(text) to authenticated, service_role;

COMMIT;
