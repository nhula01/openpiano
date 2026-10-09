-- Editable account profiles. No Google names, emails or private uploads are published.
begin;
create table if not exists public.community_profiles (
 owner uuid primary key references auth.users(id) on delete cascade,
 public_id uuid not null unique default gen_random_uuid(),
 display_name text not null check(char_length(display_name) between 2 and 40),
 skills text not null default '' check(char_length(skills)<=240),
 bio text not null default '' check(char_length(bio)<=800),
 experience text not null default 'Learning' check(experience in ('Learning','Beginner','Intermediate','Advanced','Professional')),
 published boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public,anon,authenticated;

create or replace function public.profile_mine()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',public_id,'name',display_name,'skills',skills,'bio',bio,'experience',experience,'published',published)
 from public.community_profiles where owner=auth.uid();
$$;
revoke all on function public.profile_mine() from public,anon,authenticated;
grant execute on function public.profile_mine() to authenticated;

create or replace function public.profile_public(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',public_id,'name',display_name,'skills',skills,'bio',bio,'experience',experience)
 from public.community_profiles where public_id=p_id and published;
$$;
revoke all on function public.profile_public(uuid) from public,anon,authenticated;
grant execute on function public.profile_public(uuid) to anon,authenticated;

create or replace function public.profile_save(p_name text,p_skills text default '',p_bio text default '',p_experience text default 'Learning',p_published boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to edit your profile';end if;
 insert into public.community_profiles(owner,display_name,skills,bio,experience,published)
 values(auth.uid(),btrim(p_name),btrim(p_skills),btrim(p_bio),p_experience,coalesce(p_published,false))
 on conflict(owner) do update set display_name=excluded.display_name,skills=excluded.skills,bio=excluded.bio,experience=excluded.experience,published=excluded.published,updated_at=now();
 return public.profile_mine();
end $$;
revoke all on function public.profile_save(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.profile_save(text,text,text,text,boolean) to authenticated;

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
