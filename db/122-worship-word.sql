-- ============================================================================
-- db/122 — ورد القرآن اليومي بوحدات القياس + العلامات المرجعية السحابية
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرار: ميزات القارئ (صفحة /worship/quran) —
--   ١) ورد يومي بوحدة يختارها المستخدم: آيات | صفحات | أرباع | أحزاب | أجزاء
--      + كمية (جزء أو جزئين أو حِزب...) — خزّنة في profiles.worship_settings
--      (jsonb) بتوسعة save_worship_settings الموجودة بشكل متوافق.
--   ٢) جدول quran_bookmarks — العلامات المرجعية (آية محددة للمتابعة/التفسير)
--      تُرفع سحابياً بنفس نمط quran_reading_positions (db/66) — RLS owner-only.
--
-- ── إيه اللي الملف ده **مش** بيلمسوده ──
--  • عدّاد ورد اليوم بالآيات (worship_progress.quran_ayahs) ومكافأة
--    worship_quran في award_coins (db/worship.sql + db/121) زي ما هما —
--    الوحدات الجديدة طبقة عرض/تخطيط فوق العدّاد، مابتحسبش مكافآت.
--  • جدول quran_reading_positions (db/66) — موضع القراءة موجود بالفعل.
--  • ملف db/123 (بنك أسئلة العبادات — شغل متوازٍ) ولا award_coins.
--
-- idempotent بالكامل (if not exists / drop-if-exists / create or replace /
-- on conflict) — BEGIN/COMMIT واحد. مابيتطبقش تلقائياً — التطبيق يدوي.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ١) جدول العلامات المرجعية — آية واحدة (سورة + رقمها داخل السورة) لكل صف.
--    المصدر الحقيقي للمرجع: آية key "{surah_id}:{ayah_id}" زي ما القارئ
--    بيستخدمه. unique على الثلاثي يمنع التكرار ويخلي upsert سلوك محدد.
-- ----------------------------------------------------------------------------
create table if not exists public.quran_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  surah_id smallint not null check (surah_id between 1 and 114),
  ayah_id smallint not null check (ayah_id between 1 and 286),
  created_at timestamptz not null default now(),
  unique (user_id, surah_id, ayah_id)
);

alter table public.quran_bookmarks enable row level security;

drop policy if exists "quran_bookmarks: owner select" on public.quran_bookmarks;
drop policy if exists "quran_bookmarks: owner insert" on public.quran_bookmarks;
drop policy if exists "quran_bookmarks: owner delete" on public.quran_bookmarks;

create policy "quran_bookmarks: owner select"
  on public.quran_bookmarks for select
  using (user_id = auth.uid());

create policy "quran_bookmarks: owner insert"
  on public.quran_bookmarks for insert
  with check (user_id = auth.uid());

create policy "quran_bookmarks: owner delete"
  on public.quran_bookmarks for delete
  using (user_id = auth.uid());

revoke all on public.quran_bookmarks from anon;
grant select, insert, delete on public.quran_bookmarks to authenticated;

create index if not exists quran_bookmarks_user_created_idx
  on public.quran_bookmarks (user_id, created_at);

-- ----------------------------------------------------------------------------
-- ٢) توسعة save_worship_settings — نفس الجسم السابق بالحرف (db/worship.sql)
--    + مفتاحين جديدان في الـ jsonb:
--      • quran_word_unit   : واحد من (ayat|pages|quarters|ahzab|ajzaa) —
--                            أي قيمة تانية = null (والكلاينت يرجع لافتراضيه).
--      • quran_word_amount : كمية الورد ١..٢٤٠ (سقف ٢٤٠ = كل أرباع المصحف).
--    التوافق: get_worship_settings() زي ما هو — بيرجّع الـ jsonb كله،
--    والكلاينت القديم بيتجاهل المفاتيح الجديدة، والعميل الجديد بيحط
--    افتراضيات متوافقة (ayat/10) لو المفاتيح null.
--    ⚠️ مفيش تغيير في التوقيع ولا في quran_daily_target — العدّاد بالآيات
--       ومكافأة worship_quran بتفضل شغالة زي ما هي.
-- ----------------------------------------------------------------------------
create or replace function public.save_worship_settings(p_settings jsonb)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_clean jsonb;
  v_timezone text;
begin
  if v_uid is null then
    raise exception 'save_worship_settings: لازم تكون داخل بحسابك';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'save_worship_settings: الإعدادات لازم تكون كائن JSON';
  end if;

  v_timezone := p_settings->>'timezone';
  if v_timezone is not null and v_timezone <> '' and not exists (
    select 1 from pg_catalog.pg_timezone_names t where t.name = v_timezone
  ) then
    raise exception 'save_worship_settings: منطقة زمنية غير صالحة';
  end if;

  v_clean := jsonb_build_object(
    'city',
      case when length(coalesce(p_settings->>'city','')) between 1 and 80
           then left(p_settings->>'city', 80) end,
    'country',
      case when length(coalesce(p_settings->>'country','')) between 1 and 80
           then left(p_settings->>'country', 80) end,
    'latitude',
      case when (p_settings->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (p_settings->>'latitude')::numeric between -90 and 90
           then (p_settings->>'latitude')::numeric end,
    'longitude',
      case when (p_settings->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (p_settings->>'longitude')::numeric between -180 and 180
           then (p_settings->>'longitude')::numeric end,
    'timezone',
      case when length(coalesce(v_timezone,'')) between 1 and 64
           then left(v_timezone, 64) end,
    'calculation_method',
      case when length(coalesce(p_settings->>'calculation_method','')) between 1 and 40
           then left(p_settings->>'calculation_method', 40) end,
    'madhab',
      case when p_settings->>'madhab' in ('shafi','hanafi')
           then p_settings->>'madhab' end,
    'quran_daily_target',
      case when coalesce((p_settings->>'quran_daily_target')::int, 0) between 1 and 100
           then (p_settings->>'quran_daily_target')::int end,
    'quran_word_unit',
      case when p_settings->>'quran_word_unit'
                in ('ayat','pages','quarters','ahzab','ajzaa')
           then p_settings->>'quran_word_unit' end,
    'quran_word_amount',
      case when coalesce((p_settings->>'quran_word_amount')::int, 0) between 1 and 240
           then (p_settings->>'quran_word_amount')::int end
  );

  update public.profiles
     set worship_settings = v_clean
   where id = v_uid;

  return found;
end;
$$;

revoke all on function public.save_worship_settings(jsonb) from public;
grant execute on function public.save_worship_settings(jsonb) to authenticated;

-- get_worship_settings() نفس التعريف (create or replace — تأكيد التوافق فقط،
-- مفيش أي تغيير في الجسم: الاستعلام بيرجّع worship_settings من البروفايل).
create or replace function public.get_worship_settings()
returns table (islamic_settings jsonb)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select p.worship_settings from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.get_worship_settings() from public;
grant execute on function public.get_worship_settings() to authenticated;

commit;
