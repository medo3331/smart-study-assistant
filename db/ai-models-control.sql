-- ============================================================
-- EPIC-2 — AI Models Control (DB Schema)
-- Created 2026-09-19
-- ============================================================
-- Migration from MODEL_REGISTRY (lib/ai/models.ts) — 12 entries preserved with current enabled status
-- Source verified by reading file directly (lines 44-215): all 12 models confirmed.
-- No data loss: enabled status copied exactly (true/false as in source file).

create table if not exists public.ai_models (
  model_id text primary key,                -- same as MODEL_REGISTRY.id
  provider text not null,                   -- groq / nvidia / openrouter / gemini
  display_name text not null,
  capabilities text[] default '{}',         -- from MODEL_REGISTRY.capabilities
  context_window int,
  priority int default 1,
  tier text default 'unknown',              -- free / paid / unknown (from source)
  fallback_priority int default -1,
  free_endpoint boolean default false,      -- from source
  enabled boolean default true,             -- preserved from source exactly
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent migration: only insert models that don't already exist (preserves existing DB state)
insert into public.ai_models (model_id, provider, display_name, capabilities, context_window, priority, tier, fallback_priority, free_endpoint, enabled)
values
  ('openai/gpt-oss-120b', 'groq', 'GPT-OSS 120B', '{text,reasoning,coding,streaming}', 131072, 1, 'free', 1, true, true),
  ('openai/gpt-oss-20b', 'groq', 'GPT-OSS 20B', '{text,structured_output,streaming}', 131072, 2, 'free', 2, true, true),
  ('nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia', 'Nemotron 3.5 Lightning 30B A3B', '{text,reasoning,coding,structured_output,streaming}', NULL, 1, 'unknown', 1, true, true),
  ('nvidia/nemotron-3-super-120b-a12b', 'nvidia', 'Nemotron 3 Super 120B A12B', '{text,reasoning,coding,structured_output,streaming}', NULL, 2, 'unknown', 2, true, true),
  ('nvidia/nemotron-3-ultra-550b-a55b', 'nvidia', 'Nemotron 3 Ultra 550B A55B', '{text,reasoning,coding,structured_output}', NULL, 3, 'unknown', 3, true, true),
  ('deepseek-ai/deepseek-v4-flash-0731', 'nvidia', 'DeepSeek V4 Flash (عبر NVIDIA)', '{text,reasoning,coding,structured_output,streaming}', NULL, 2, 'unknown', 2, true, false),
  ('nvidia/nemotron-3-embed-1b', 'nvidia', 'Nemotron 3 Embed 1B', '{embeddings}', NULL, 1, 'unknown', -1, true, true),
  ('nvidia/nemotron-3.5-lightning:free', 'openrouter', 'Nemotron 3.5 Lightning (OpenRouter Free)', '{text,streaming}', NULL, 1, 'free', 2, true, true),
  ('dots-studio/dots-3-note-preview:free', 'openrouter', 'Dots 3 Note Preview (OpenRouter Free)', '{text,vision,streaming}', NULL, 2, 'free', 3, true, true),
  ('thinkingmachines/inkling-small:free', 'openrouter', 'Inkling Small (OpenRouter Free)', '{text,vision,streaming}', NULL, 3, 'free', 4, true, false),
  ('gemini-3.6-flash', 'gemini', 'Gemini 3.6 Flash', '{text,vision,file_analysis,structured_output,reasoning,streaming}', 1048576, 1, 'unknown', 1, true, true),
  ('gemini-3.1-flash-image', 'gemini', 'Gemini 3.1 Flash Image', '{image_generation}', 32768, 1, 'unknown', -1, true, true)
on conflict (model_id) do nothing;

alter table public.ai_models enable row level security;

-- Read: admin/owner can read; write: service_role (via admin API) only
create policy "ai_models: admin read" on public.ai_models for select using (exists(select 1 from public.site_admins where site_admins.user_id = auth.uid()));
drop policy if exists "ai_models: no client insert" on public.ai_models; create policy "ai_models: no client insert" on public.ai_models for insert with check (false);
drop policy if exists "ai_models: no client update" on public.ai_models; create policy "ai_models: no client update" on public.ai_models for update using (false);
drop policy if exists "ai_models: no client delete" on public.ai_models; create policy "ai_models: no client delete" on public.ai_models for delete using (false);
