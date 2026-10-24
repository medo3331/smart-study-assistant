-- lesson-quiz-cache.sql
-- PREPARED FOR MANUAL REVIEW ONLY. Do NOT apply automatically.
-- Purpose: persistent cache for generated lesson quiz questions.

create table if not exists lesson_quiz_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_id uuid not null,
  content_hash text not null,
  prompt_version text not null default 'v1',
  language text not null default 'ar',
  question_count int not null default 4,
  questions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_id, content_hash, prompt_version, language, question_count)
);

-- RLS: users can only read/write their own cached quizzes.
alter table lesson_quiz_cache enable row level security;

drop policy if exists lesson_quiz_cache_select_own on lesson_quiz_cache;
create policy lesson_quiz_cache_select_own on lesson_quiz_cache
  for select using (auth.uid() = user_id);

drop policy if exists lesson_quiz_cache_insert_own on lesson_quiz_cache;
create policy lesson_quiz_cache_insert_own on lesson_quiz_cache
  for insert with check (auth.uid() = user_id);

drop policy if exists lesson_quiz_cache_update_own on lesson_quiz_cache;
create policy lesson_quiz_cache_update_own on lesson_quiz_cache
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists lesson_quiz_cache_delete_own on lesson_quiz_cache;
create policy lesson_quiz_cache_delete_own on lesson_quiz_cache
  for delete using (auth.uid() = user_id);

-- Index for fast lookup
create index if not exists idx_lesson_quiz_cache_lookup
  on lesson_quiz_cache (user_id, day_id, content_hash, prompt_version);
