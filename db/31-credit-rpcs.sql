-- ═════════════════════════════════════════════════════════════
-- 31-credit-rpcs.sql — Phase B2.2
-- دوال الكريدت: منح + استهلاك FEFO + انتهاء + رصيد
-- ═════════════════════════════════════════════════════════════
-- يعتمد على: db/30-credit-grants.sql (جدول credit_grants)
--
-- ⚠️ ثلاث تصحيحات مقصودة عن المسودة:
--  ١) **فحص الدور**: المسودة كانت ترفض أي نداء ليس JWT بدوره service_role.
--     لكن عميل السيرفر عندنا يستخدم **مفتاح سرّي** (sb_secret_…) لا JWT،
--     فـ `auth.jwt()` تصبح NULL ⇒ كل منح إداري كان سيفشل.
--     الصح هو نمط `reserve_ai_credit` نفسه: امنع فقط عندما يكون هناك
--     مستخدم مُصادَق (auth.uid() ليس NULL) ودوره ليس service_role.
--  ٢) تحقّق صريح من `p_source` برسالة واضحة بدل الاعتماد على CHECK الجدول.
--  ٣) فحص `p_user_id` قبل أي كتابة.
--
-- ⚠️ **قيد محاسبي مهم:** المنح يُسجَّل +amount في `ai_credit_ledger`
-- (reason='admin_grant') حتى يبقى الرصيد في الـ ledger متسقًا مع
-- `credit_grants`. لذلك **الاستهلاك من المنح يجب أن يُسجّل -amount في
-- الـ ledger أيضًا**، وانتهاء المنح يجب أن يُسجّل صفًا سالبًا ('expire')
-- وإلا بقيت الكريدت المنتهية قابلة للاستهلاك عبر مسار الـ ledger.
-- ═════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) grant_credits — منح كريدت (سيرفر-سايد فقط)
-- ─────────────────────────────────────────────────────────────
create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount int,
  p_expires_at timestamptz default (now() + interval '90 days'),
  p_source text default 'manual',
  p_notes text default null
)
returns table (grant_id uuid, amount int, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_grant_id uuid;
  v_grant_ref text;
  v_expires timestamptz := coalesce(p_expires_at, now() + interval '90 days');
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
begin
  -- التحقق من النداء: مستخدم عادي مُصادَق ممنوع. نداء السيرفر
  -- (auth.uid() = NULL عبر المفتاح السرّي) مسموح كما في reserve_ai_credit.
  if auth.uid() is not null
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'grant_credits: forbidden — server-side only';
  end if;

  if p_user_id is null then
    raise exception 'grant_credits: p_user_id required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant_credits: p_amount must be > 0';
  end if;
  if v_expires <= now() then
    raise exception 'grant_credits: p_expires_at must be in the future';
  end if;
  if v_source not in ('monthly', 'manual', 'trial', 'bonus', 'refund') then
    raise exception 'grant_credits: invalid p_source %', v_source;
  end if;

  v_grant_ref := v_source || ':' || gen_random_uuid()::text;

  insert into public.credit_grants
    (user_id, amount, source, grant_ref, expires_at, notes)
  values
    (p_user_id, p_amount, v_source, v_grant_ref, v_expires, p_notes)
  returning id into v_grant_id;

  -- سجل الحركة (+amount) — يبقي رصيد الـ ledger متسقًا مع المنح.
  insert into public.ai_credit_ledger
    (user_id, reason, delta, ref_id, metadata)
  values
    (p_user_id, 'admin_grant', p_amount, v_grant_ref,
     jsonb_build_object('grant_id', v_grant_id, 'source', v_source, 'notes', p_notes, 'expires_at', v_expires));

  return query select v_grant_id, p_amount, v_expires;
end;
$$;

revoke all on function public.grant_credits(uuid, int, timestamptz, text, text) from public;
revoke all on function public.grant_credits(uuid, int, timestamptz, text, text) from anon;
revoke all on function public.grant_credits(uuid, int, timestamptz, text, text) from authenticated;
grant execute on function public.grant_credits(uuid, int, timestamptz, text, text) to service_role;

comment on function public.grant_credits(uuid, int, timestamptz, text, text) is
  'Phase B2 — يمنح كريدت بانتهاء ويُسجّل +amount في ai_credit_ledger. سيرفر-سايد فقط.';

commit;

-- ═════════════════════════════════════════════════════════════
-- تحقق بعد التطبيق:
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='grant_credits';
--   select has_function_privilege('anon', 'public.grant_credits(uuid,int,timestamptz,text,text)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.grant_credits(uuid,int,timestamptz,text,text)', 'EXECUTE');
-- المتوقع: false و false.
-- ═════════════════════════════════════════════════════════════
