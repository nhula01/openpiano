-- My Journey piano studio: private song libraries and synced practice checks.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Row-level security means every signed-in person can only see and change their own rows and files.

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  composer text not null default '' check (char_length(composer) <= 200),
  format text not null check (format in ('musicxml', 'midi')),
  path text not null,
  created_at timestamptz not null default now()
);
alter table public.songs enable row level security;
drop policy if exists "songs: owner reads" on public.songs;
drop policy if exists "songs: owner adds" on public.songs;
drop policy if exists "songs: owner deletes" on public.songs;
create policy "songs: owner reads" on public.songs for select using (auth.uid() = owner);
create policy "songs: owner adds" on public.songs for insert with check (auth.uid() = owner and path like auth.uid()::text || '/%');
create policy "songs: owner deletes" on public.songs for delete using (auth.uid() = owner);

create table if not exists public.progress (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;
drop policy if exists "progress: owner reads" on public.progress;
drop policy if exists "progress: owner writes" on public.progress;
drop policy if exists "progress: owner updates" on public.progress;
create policy "progress: owner reads" on public.progress for select using (auth.uid() = owner);
create policy "progress: owner writes" on public.progress for insert with check (auth.uid() = owner);
create policy "progress: owner updates" on public.progress for update using (auth.uid() = owner) with check (auth.uid() = owner);

-- Private file bucket: 8 MB per file, files live under a folder named after the owner's id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('songs', 'songs', false, 8388608)
on conflict (id) do update set public = false, file_size_limit = 8388608;
drop policy if exists "song files: owner reads" on storage.objects;
drop policy if exists "song files: owner adds" on storage.objects;
drop policy if exists "song files: owner deletes" on storage.objects;
create policy "song files: owner reads" on storage.objects for select
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "song files: owner adds" on storage.objects for insert
  with check (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "song files: owner deletes" on storage.objects for delete
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
