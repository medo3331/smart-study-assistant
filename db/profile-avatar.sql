-- Profile avatar persistence
-- Adds avatar_url to profiles and a public avatars storage bucket with owner policies.

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  drop policy if exists "avatars: public read" on storage.objects;
  drop policy if exists "avatars: owner insert" on storage.objects;
  drop policy if exists "avatars: owner update" on storage.objects;
  drop policy if exists "avatars: owner delete" on storage.objects;
end $$;

create policy "avatars: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );