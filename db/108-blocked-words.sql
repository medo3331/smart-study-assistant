-- ===========================================================================
-- MAGICLY — Community C6: قائمة الكلمات الممنوعة (فلترة حتمية قبل فحص AI)
-- الأدمن يضيف كلمات/عبارات مسيئة؛ المنشورات والتعليقات التي تحتويها تُرفض
-- فورًا برمز content_blocked قبل فحص مساعد الإشراف الذكي.
-- ===========================================================================

create table if not exists public.moderation_blocked_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.moderation_blocked_words enable row level security;

-- القراءة للمصادَقين (للفحص من طبقة الـAPI عبر service client أيًّا كان) —
-- لا تسرّب حساس: قائمة كلمات مشرفة معروفة الطبيعة.
create policy "blocked words: read to authenticated"
  on public.moderation_blocked_words for select
  to authenticated
  using (true);

-- الكتابة فقط لمخولي الإشراف — عبر service client من طبقة الأدمن،
-- فلا نحتاج سياسة INSERT/DELETE للمستخدم العادي (RLS يمنعها).

create index if not exists idx_blocked_words_word on public.moderation_blocked_words (word);

-- RPC: فحص نص ضد قائمة الكلمات الممنوعة (security definer — الجدول محمي RLS
-- والقراءة المباشرة بالمستخدم العادي لا تكفي لتشغيل الفحص من الـRPC الآمنة).
create or replace function public.community_text_has_blocked_word(p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w text;
begin
  if p_text is null or btrim(p_text) = '' then
    return false;
  end if;
  -- مطابقة غير حساسة لحالة الأحرف كعبارة كاملة داخل النص
  for v_w in select word from public.moderation_blocked_words loop
    if v_w is not null and btrim(v_w) <> '' then
      if position(lower(btrim(v_w)) in lower(p_text)) > 0 then
        return true;
      end if;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.community_text_has_blocked_word(text) from public, anon;
grant execute on function public.community_text_has_blocked_word(text) to authenticated;
