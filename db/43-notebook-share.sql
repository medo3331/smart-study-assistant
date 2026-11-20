-- db/43-notebook-share.sql
--
-- 📤 مشاركة الدفاتر للقراءة فقط.
--
-- الطالب بيولّد لينك مشاركة من المحرر؛ الحمولة (الصفحات كـ JSON) بتتخزن
-- هنا واللينك بيحتوي الـ id العشوائي (غير قابل للتخمين). القراءة عبر
-- الـ API فقط (service role) — RLS مقفول على الجميع، والإضافة للمالك عبر
-- الـ API نفسه بسجل صاحبه.

create table if not exists public.shared_notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null default 'دفتر',
  page_count int not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_notebooks enable row level security;

-- القراءة والكتابة عبر service-role API فقط (الكود بيتعامل مع الحماية).
-- مفيش أي policies — anon/authenticated مش شايفين حاجة من الكلينت مباشرة.

comment on table public.shared_notebooks is
  'Snapshots of notebooks shared read-only via unguessable links.';

-- نبه PostgREST إن الجدول الجديد اتضاف.
notify pgrst, 'reload schema';
