-- ============================================================================
-- 34-expand-curriculum-function.sql
-- Curriculum Builder — إلحاق دروس جديدة بمنهج قائم في معاملة واحدة
--
-- ليه RPC؟
--   - الإلحاق + تحديث days_count لازم يكونوا ذريين.
--   - قفل صف المادة (FOR UPDATE) بيمنع توسيعين متزامنين من كتابة نفس
--     أرقام الأيام أو تجاوز حد الـ 50.
--   - التحقق من الملكية وحد المنهج على السيرفر، مش في الكلاينت.
--
-- idempotent: CREATE OR REPLACE + REVOKE/GRANT.
-- additive: دالة جديدة فقط.
--
-- ⚠️ شغّل الملف ده في Supabase → SQL Editor قبل استخدام زر «توسيع المنهج».
-- ============================================================================

begin;

create or replace function public.append_curriculum_days(
  p_config_id uuid,
  p_days jsonb,
  p_learning_style text
)
returns table (start_day int, days_count int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_start int;
  v_add int;
  v_total int;
  v_item jsonb;
  v_index int := 0;
  v_title text;
  v_topic text;
  v_description text;
  v_style text;
begin
  if v_uid is null then
    raise exception 'append_curriculum_days: not authenticated';
  end if;

  if p_config_id is null then
    raise exception 'append_curriculum_days: config_id required';
  end if;

  -- قفل المادة: يمنع توسيعين متزامنين من تجاوز الحد أو تكرار الأرقام.
  perform 1
  from public.study_configs
  where id = p_config_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'append_curriculum_days: config not found or not owned by user';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'append_curriculum_days: days must be an array';
  end if;

  v_add := jsonb_array_length(p_days);
  if v_add < 1 then
    raise exception 'append_curriculum_days: no days to add';
  end if;

  select count(*)::int, coalesce(max(day_number), 0)::int
  into v_existing, v_start
  from public.study_days
  where config_id = p_config_id and user_id = v_uid;

  v_total := v_existing + v_add;
  if v_total > 50 then
    raise exception 'append_curriculum_days: total lessons cannot exceed 50';
  end if;

  v_start := v_start + 1;
  v_style := case
    when p_learning_style in ('practical', 'visual', 'academic') then p_learning_style
    else 'practical'
  end;

  for v_item in select * from jsonb_array_elements(p_days) loop
    v_index := v_index + 1;

    v_title := nullif(trim(v_item ->> 'title'), '');
    v_topic := nullif(trim(v_item ->> 'topic'), '');
    v_description := nullif(trim(v_item ->> 'description'), '');

    if v_title is null or v_topic is null or v_description is null then
      raise exception 'append_curriculum_days: item % is missing title/topic/description', v_index;
    end if;

    insert into public.study_days (
      config_id,
      user_id,
      day_number,
      title,
      topic,
      description,
      is_completed,
      xp_reward,
      learning_style
    )
    values (
      p_config_id,
      v_uid,
      v_start + v_index - 1,
      left(v_title, 120),
      left(v_topic, 220),
      left(v_description, 500),
      false,
      100,
      v_style
    );
  end loop;

  update public.study_configs
  set days_count = v_total,
      generated_at = now()
  where id = p_config_id and user_id = v_uid;

  return query select v_start, v_total;
end;
$$;

revoke all on function public.append_curriculum_days(uuid, jsonb, text) from public;
grant execute on function public.append_curriculum_days(uuid, jsonb, text) to authenticated;

commit;

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
-- ============================================================================
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc
-- where proname = 'append_curriculum_days';
