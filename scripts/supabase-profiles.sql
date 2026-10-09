-- Editable account profiles. Google names and emails are never published.
begin;
create table if not exists public.community_profiles (
 owner uuid primary key references auth.users(id) on delete cascade,
 public_id uuid not null unique default gen_random_uuid(),
 display_name text not null check(char_length(display_name) between 2 and 40),
 skills text not null default '' check(char_length(skills)<=240),
 bio text not null default '' check(char_length(bio)<=800),
 experience text not null default 'Learning' check(experience in ('Learning','Beginner','Intermediate','Advanced','Professional')),
 avatar_path text,
 published boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint community_profiles_avatar_owner check(avatar_path is null or avatar_path ~ ('^'||public_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public,anon,authenticated;

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

-- Profile photos live in a private bucket. Owners can always read their own photo;
-- anonymous visitors receive a short-lived URL only while the matching profile is public.
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

-- Public profile identity on comments is optional. A private profile's skills and
-- bio stay private; the chosen name is published only when its owner posts.
create or replace function public.community_post_json(p public.community_posts)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'piece',p.piece,
 'alias',coalesce((select display_name from public.community_profiles where owner=p.owner and published),p.alias),
 'profile',(select public.profile_public(public_id) from public.community_profiles where owner=p.owner and published),
 'body',p.body,'kind',p.kind,'bars',p.bars,'hand',p.hand,'fingers',p.fingers,'parent',p.parent,
 'created_at',p.created_at,'edited_at',p.edited_at,'mine',p.owner=auth.uid(),
 'votes',(select count(*) from public.community_votes v where v.post=p.id),
 'voted',exists(select 1 from public.community_votes v where v.post=p.id and v.owner=auth.uid()));
$$;
revoke all on function public.community_post_json(public.community_posts) from public,anon,authenticated;

create or replace function public.community_write(p_piece text, p_alias text, p_body text, p_kind text default 'comment', p_bars text default '', p_hand text default 'BH', p_fingers text default '', p_parent uuid default null, p_id uuid default null, p_publish boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result uuid; parent_row public.community_posts; profile_name text;
begin
 if u is null then raise exception 'Sign in to contribute'; end if;
 select display_name into profile_name from public.community_profiles where owner=u;
 if profile_name is null then raise exception 'Set up your profile name before commenting';end if;
 if p_publish is distinct from true then raise exception 'Confirm that this contribution will be public'; end if;
 if not exists(select 1 from public.community_pieces where id=p_piece) then raise exception 'Discussion is only available for library pieces'; end if;
 if p_parent is not null then
  select * into parent_row from public.community_posts where id=p_parent;
  if not found or parent_row.piece<>p_piece or parent_row.parent is not null or parent_row.hidden_at is not null or parent_row.moderated_at is not null then raise exception 'Reply to an available discussion in this piece'; end if;
  if p_kind<>'comment' then raise exception 'Replies must be comments'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('community:'||u::text,0));
 if p_id is null then
  if (select count(*) from public.community_posts where owner=u and created_at>now()-interval '1 hour')>=10 or
     (select count(*) from public.community_posts where owner=u and created_at>now()-interval '1 day')>=30 then raise exception 'Please wait before posting again (10 per hour, 30 per day)'; end if;
  if p_parent is not null and (select count(*) from public.community_posts where parent=p_parent)>=50 then raise exception 'This thread has reached 50 replies. Start another discussion'; end if;
  insert into public.community_posts(piece,owner,alias,body,kind,bars,hand,fingers,parent)
  values(p_piece,u,profile_name,btrim(p_body),p_kind,btrim(p_bars),p_hand,btrim(p_fingers),p_parent) returning id into result;
 else
  update public.community_posts set alias=profile_name,body=btrim(p_body),bars=btrim(p_bars),hand=p_hand,fingers=btrim(p_fingers),edited_at=now()
  where id=p_id and owner=u and piece=p_piece and kind=p_kind and parent is not distinct from p_parent and hidden_at is null and moderated_at is null returning id into result;
  if result is null then raise exception 'Only the author can edit an available contribution'; end if;
 end if;
 return result;
end $$;
revoke all on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean) to authenticated;


notify pgrst,'reload schema';
commit;
