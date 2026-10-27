-- ============================================================================
-- Phase 1 — Link user lectures to university subjects (nullable)
-- ============================================================================
-- Safe, additive-only migration. No data loss. No second lectures table.
-- Existing lectures remain valid with subject_id = NULL ("Uncategorized").
-- ============================================================================

-- ١) عمود اختياري subject_id
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lectures'
      and column_name = 'subject_id'
  ) then
    alter table public.lectures
      add column subject_id uuid references public.university_subjects(id) on delete set null;
  end if;
end $$;

-- ٢) فهرس للقائمة: محاضرات المستخدم حسب المادة وتاريخ الإنشاء
create index if not exists lectures_user_subject_created_idx
  on public.lectures (user_id, subject_id, created_at desc);

comment on column public.lectures.subject_id is
  'Optional link to public.university_subjects(id). NULL means Uncategorized/legacy lecture. Validated server-side before save.';