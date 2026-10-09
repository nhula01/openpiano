-- Minimal stand-in for the parts of Supabase that OpenPiano's migrations use, so the
-- migrations and their *-verify.sql scripts can run against a plain local PostgreSQL.
-- Used only by tests/sql/run.sh; never run this against the real project.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users(
 instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
 email_confirmed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
 raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
 select current_setting('request.jwt.claims',true)::jsonb->>'role';
$$;
create table if not exists storage.buckets(
 id text primary key, name text not null, public boolean default false,
 file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects(
 id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
 name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
 metadata jsonb default '{}'::jsonb, unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on function auth.uid(), auth.role() to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1];
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
 select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)];
$$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
 select reverse(split_part(reverse(storage.filename(name)),'.',1));
$$;
grant execute on all functions in schema storage to anon, authenticated;
-- Supabase gives these roles broad default privileges on new public objects; the
-- migrations must revoke them, so the stub reproduces the defaults.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
