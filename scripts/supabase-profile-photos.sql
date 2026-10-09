-- Add one account profile picture, used by the account icon and published comments.
-- The bucket remains private; signed URLs are available only to the owner or while
-- the matching music profile is explicitly public.
begin;
alter table public.community_profiles add column if not exists avatar_path text;
alter table public.community_profiles drop constraint if exists community_profiles_avatar_owner;
alter table public.community_profiles add constraint community_profiles_avatar_owner
 check(avatar_path is null or avatar_path ~ ('^'||public_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'));

create or replace function public.profile_mine()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',public_id,'name',display_name,'skills',skills,'bio',bio,'experience',experience,'avatar_path',avatar_path,'published',published)
 from public.community_profiles where owner=auth.uid();
$$;
revoke all on function public.profile_mine() from public,anon,authenticated;
grant execute on function public.profile_mine() to authenticated;

create or replace function public.profile_public(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',public_id,'name',display_name,'skills',skills,'bio',bio,'experience',experience,'avatar_path',avatar_path)
 from public.community_profiles where public_id=p_id and published;
$$;
revoke all on function public.profile_public(uuid) from public,anon,authenticated;
grant execute on function public.profile_public(uuid) to anon,authenticated;

drop function if exists public.profile_save(text,text,text,text,boolean);
create or replace function public.profile_save(p_name text,p_skills text default '',p_bio text default '',p_experience text default 'Learning',p_published boolean default false,p_avatar_path text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to edit your profile';end if;
 if p_avatar_path is not null and not exists(select 1 from public.community_profiles where owner=auth.uid() and p_avatar_path ~ ('^'||public_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')) then raise exception 'Choose a profile picture from your own account';end if;
 update public.community_profiles set display_name=btrim(p_name),skills=btrim(p_skills),bio=btrim(p_bio),experience=p_experience,avatar_path=p_avatar_path,published=coalesce(p_published,false),updated_at=now() where owner=auth.uid();
 if not found then
  insert into public.community_profiles(owner,display_name,skills,bio,experience,avatar_path,published)
  values(auth.uid(),btrim(p_name),btrim(p_skills),btrim(p_bio),p_experience,p_avatar_path,coalesce(p_published,false));
 end if;
 return public.profile_mine();
end $$;
revoke all on function public.profile_save(text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.profile_save(text,text,text,text,boolean,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.profile_avatar_visible(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_profiles where (owner=auth.uid() and split_part(p_path,'/',1)=public_id::text) or (avatar_path=p_path and published));
$$;
revoke all on function public.profile_avatar_visible(text) from public,anon,authenticated;
grant execute on function public.profile_avatar_visible(text) to anon,authenticated;
create or replace function public.profile_avatar_owned(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_profiles where owner=auth.uid() and p_path ~ ('^'||public_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'));
$$;
revoke all on function public.profile_avatar_owned(text) from public,anon,authenticated;
grant execute on function public.profile_avatar_owned(text) to authenticated;
create or replace function public.profile_avatar_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.profile_avatar_owned(p_path) and (select count(*) from storage.objects where bucket_id='profile-avatars' and split_part(name,'/',1)=split_part(p_path,'/',1))<5;
$$;
revoke all on function public.profile_avatar_upload_allowed(text) from public,anon,authenticated;
grant execute on function public.profile_avatar_upload_allowed(text) to authenticated;
drop policy if exists "profile avatars: visible profile reads" on storage.objects;
drop policy if exists "profile avatars: owner adds" on storage.objects;
drop policy if exists "profile avatars: owner deletes" on storage.objects;
create policy "profile avatars: visible profile reads" on storage.objects for select to anon,authenticated
 using(bucket_id='profile-avatars' and public.profile_avatar_visible(name));
create policy "profile avatars: owner adds" on storage.objects for insert to authenticated
 with check(bucket_id='profile-avatars' and public.profile_avatar_upload_allowed(name));
create policy "profile avatars: owner deletes" on storage.objects for delete to authenticated
 using(bucket_id='profile-avatars' and public.profile_avatar_owned(name));

notify pgrst,'reload schema';
commit;
