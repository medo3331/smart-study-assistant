-- ============================================================================
-- 33-create-curriculum-function.sql
-- Curriculum Builder — حفظ المادة ودروسها في معاملة واحدة
--
-- المشكلة اللي بيحلها:
--   الحفظ القديم كان insert للمادة، ثم insert للأيام، ثم تحديث البروفايل.
--   لو أي خطوة بعد الأولى فشلت، كانت تفضل مادة بدون دروس (أو أيام بدون
--   مادة نشطة). الدالة دي بتعمل كل ده جوه transaction واحد: أي فشل
--   بيرجّع كل حاجة، فمفيش "مادة فارغة" أبداً.
--
-- idempotent: CREATE OR REPLACE + REVOKE/GRANT.
-- additive: دالة جديدة فقط — لا تعدّل أي جدول أو دالة قائمة.
--
-- ⚠️ شغّل الملف ده في Supabase → SQL Editor بعد db/32-curriculum-builder.sql.
-- ============================================================================

begin;

create or replace function public.create_curriculum(
  p_subject text,
  p_category text,
  p_level text,
  p_focus_topics jsonb,
  p_learning_style text,
  p_days jsonb
)
returns table (config_id uuid, days_count int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_config_id uuid;
  v_count int;
  v_item jsonb;
  v_index int := 0;
  v_title text;
  v_topic text;
  v_description text;
  v_style text;
begin
  if v_uid is null then
    raise exception 'create_curriculum: not authenticated';
  end if;

  -- الحساب الزائر مسموح يبني منهج (زي المسار القديم)، لكنه ما يقدرش
  -- يكسب XP/Coins لاحقاً لأن complete_study_day بيرفض الزوار.

  if p_subject is null or length(trim(p_subject)) = 0 then
    raise exception 'create_curriculum: subject required';
  end if;

  if length(trim(p_subject)) > 120 then
    raise exception 'create_curriculum: subject is too long';
  end if;

  if p_level is null or p_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'create_curriculum: invalid curriculum level';
  end if;

  if p_focus_topics is null then
    p_focus_topics := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_focus_topics) <> 'array' then
    raise exception 'create_curriculum: focus_topics must be an array';
  end if;

  if jsonb_array_length(p_focus_topics) > 10 then
    raise exception 'create_curriculum: focus_topics exceeds 10 items';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'create_curriculum: days must be an array';
  end if;

  v_count := jsonb_array_length(p_days);
  if v_count < 3 or v_count > 50 then
    raise exception 'create_curriculum: days count must be between 3 and 50';
  end if;

  v_style := case
    when p_learning_style in ('practical', 'visual', 'academic') then p_learning_style
    else 'practical'
  end;

  insert into public.study_configs (
    user_id,
    subject,
    category,
    days_count,
    curriculum_level,
    focus_topics,
    curriculum_version,
    generated_at
  )
  values (
    v_uid,
    trim(p_subject),
    p_category,
    v_count,
    p_level,
    p_focus_topics,
    1,
    now()
  )
  returning id into v_config_id;

  for v_item in select * from jsonb_array_elements(p_days) loop
    v_index := v_index + 1;

    v_title := nullif(trim(v_item ->> 'title'), '');
    v_topic := nullif(trim(v_item ->> 'topic'), '');
    v_description := nullif(trim(v_item ->> 'description'), '');

    if v_title is null or v_topic is null or v_description is null then
      raise exception 'create_curriculum: day % is missing title/topic/description', v_index;
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
      v_config_id,
      v_uid,
      v_index,
      left(v_title, 120),
      left(v_topic, 220),
      left(v_description, 500),
      false,
      100,
      v_style
    );
  end loop;

  -- المادة الجديدة هي النشطة — نفس سلوك المسار القديم.
  update public.profiles
  set active_config_id = v_config_id
  where id = v_uid;

  return query select v_config_id, v_index;
end;
$$;

revoke all on function public.create_curriculum(text, text, text, jsonb, text, jsonb) from public;
grant execute on function public.create_curriculum(text, text, text, jsonb, text, jsonb) to authenticated;

commit;

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
-- ============================================================================
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc
-- where proname = 'create_curriculum';
