-- Private-by-default note add-ons for built-in repertoire.
-- Run after supabase-community.sql and supabase-profiles.sql.
begin;

create table if not exists public.community_bots (
 id text primary key check(id ~ '^[a-z0-9-]{2,40}$'),
 display_name text not null check(char_length(display_name) between 2 and 40),
 skills text not null default '' check(char_length(skills)<=240)
);

alter table public.community_posts add column if not exists visibility text not null default 'public';
alter table public.community_posts add column if not exists note_beat numeric(12,4);
alter table public.community_posts add column if not exists note_midi smallint;
alter table public.community_posts add column if not exists note_label text;
alter table public.community_posts add column if not exists bot_id text references public.community_bots(id);
alter table public.community_posts alter column owner drop not null;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='community_posts_visibility') then
  alter table public.community_posts add constraint community_posts_visibility check(visibility in ('private','public'));
 end if;
 if not exists(select 1 from pg_constraint where conname='community_posts_author') then
  alter table public.community_posts add constraint community_posts_author check((owner is not null) <> (bot_id is not null));
 end if;
 if not exists(select 1 from pg_constraint where conname='community_posts_note_anchor') then
  alter table public.community_posts add constraint community_posts_note_anchor check(
   (note_beat is null and note_midi is null and note_label is null) or
   (note_beat>=0 and note_midi between 21 and 108 and char_length(note_label) between 2 and 16));
 end if;
end $$;

create table if not exists public.community_addon_saves (
 owner uuid not null references auth.users(id) on delete cascade,
 source_post uuid not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner,source_post),
 check(jsonb_typeof(snapshot)='object')
);

alter table public.community_bots enable row level security;
alter table public.community_addon_saves enable row level security;
revoke all on public.community_bots,public.community_addon_saves from public,anon,authenticated;
create index if not exists community_public_piece_date on public.community_posts(piece,created_at desc)
 where visibility='public' and hidden_at is null and moderated_at is null;
create index if not exists community_addon_owner_date on public.community_addon_saves(owner,created_at desc);

create or replace function public.community_note_name(p_midi integer)
returns text language sql immutable security definer set search_path='' as $$
 select (array['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'])[(p_midi%12)+1] || ((p_midi/12)-1)::text;
$$;
revoke all on function public.community_note_name(integer) from public,anon,authenticated;

create or replace function public.community_post_json(p public.community_posts)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'piece',p.piece,
 'alias',case when p.bot_id is not null then b.display_name else coalesce((select display_name from public.community_profiles where owner=p.owner and published),p.alias) end,
 'profile',case when p.bot_id is not null then jsonb_build_object('name',b.display_name,'skills',b.skills,'bot',true)
  else (select public.profile_public(public_id) from public.community_profiles where owner=p.owner and published) end,
 'bot',p.bot_id is not null,'body',p.body,'kind',p.kind,'bars',p.bars,'hand',p.hand,'fingers',p.fingers,'parent',p.parent,
 'visibility',p.visibility,'note_beat',p.note_beat,'note_midi',p.note_midi,'note_label',p.note_label,
 'created_at',p.created_at,'edited_at',p.edited_at,'mine',coalesce(p.owner=auth.uid(),false),
 'saved',exists(select 1 from public.community_addon_saves s where s.source_post=p.id and s.owner=auth.uid()),
 'votes',(select count(*) from public.community_votes v where v.post=p.id),
 'voted',exists(select 1 from public.community_votes v where v.post=p.id and v.owner=auth.uid()))
 from public.community_bots b where b.id=p.bot_id
 union all
 select jsonb_build_object('id',p.id,'piece',p.piece,
 'alias',coalesce((select display_name from public.community_profiles where owner=p.owner and published),p.alias),
 'profile',(select public.profile_public(public_id) from public.community_profiles where owner=p.owner and published),
 'bot',false,'body',p.body,'kind',p.kind,'bars',p.bars,'hand',p.hand,'fingers',p.fingers,'parent',p.parent,
 'visibility',p.visibility,'note_beat',p.note_beat,'note_midi',p.note_midi,'note_label',p.note_label,
 'created_at',p.created_at,'edited_at',p.edited_at,'mine',coalesce(p.owner=auth.uid(),false),
 'saved',exists(select 1 from public.community_addon_saves s where s.source_post=p.id and s.owner=auth.uid()),
 'votes',(select count(*) from public.community_votes v where v.post=p.id),
 'voted',exists(select 1 from public.community_votes v where v.post=p.id and v.owner=auth.uid()))
 where p.bot_id is null limit 1;
$$;
revoke all on function public.community_post_json(public.community_posts) from public,anon,authenticated;

create or replace function public.community_list(p_piece text,p_sort text default 'best',p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with roots as (
  select p.*,(select count(*) from public.community_votes v where v.post=p.id) votes
  from public.community_posts p where p.piece=p_piece and p.parent is null and p.visibility='public'
  and p.hidden_at is null and p.moderated_at is null
  order by case when p_sort='best' then (select count(*) from public.community_votes v where v.post=p.id) else 0 end desc,p.created_at desc,p.id
  limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))
 ), entries as (
  select public.community_post_json(rp) || jsonb_build_object('replies',coalesce((
   select jsonb_agg(public.community_post_json(reply) order by reply.created_at,reply.id)
   from (select p.* from public.community_posts p where p.parent=r.id and p.visibility='public' and p.hidden_at is null and p.moderated_at is null order by p.created_at,p.id limit 50) reply
  ),'[]'::jsonb)) item,r.votes,r.created_at,r.id
  from roots r join public.community_posts rp on rp.id=r.id
 )
 select jsonb_build_object('posts',coalesce((select jsonb_agg(item order by case when p_sort='best' then votes else 0 end desc,created_at desc,id) from entries),'[]'::jsonb),
 'total',(select count(*) from public.community_posts p where p.piece=p_piece and p.parent is null and p.visibility='public' and p.hidden_at is null and p.moderated_at is null));
$$;
revoke all on function public.community_list(text,text,integer) from public,anon,authenticated;
grant execute on function public.community_list(text,text,integer) to anon,authenticated;

create or replace function public.community_mine(p_piece text)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then jsonb_build_object('posts','[]'::jsonb,'saved','[]'::jsonb) else jsonb_build_object(
  'posts',coalesce((select jsonb_agg(public.community_post_json(p) order by p.created_at desc) from public.community_posts p
   where p.owner=auth.uid() and p.piece=p_piece and p.parent is null and p.hidden_at is null and p.moderated_at is null),'[]'::jsonb),
  'saved',coalesce((select jsonb_agg(s.snapshot || jsonb_build_object('saved',true,'saved_at',s.created_at) order by s.created_at desc)
   from public.community_addon_saves s where s.owner=auth.uid() and s.snapshot->>'piece'=p_piece),'[]'::jsonb)) end;
$$;
revoke all on function public.community_mine(text) from public,anon,authenticated;
grant execute on function public.community_mine(text) to authenticated;

drop function if exists public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean);
create or replace function public.community_write(
 p_piece text,p_alias text default '',p_body text default '',p_kind text default 'comment',p_bars text default '',p_hand text default 'BH',p_fingers text default '',
 p_parent uuid default null,p_id uuid default null,p_publish boolean default false,p_note_beat numeric default null,p_note_midi integer default null,p_visibility text default 'private')
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();result uuid;parent_row public.community_posts;profile_name text;chosen_visibility text:=coalesce(p_visibility,'private');
begin
 if u is null then raise exception 'Sign in to add a note';end if;
 select display_name into profile_name from public.community_profiles where owner=u;
 if profile_name is null then raise exception 'Set up your profile name before adding a note';end if;
 if not exists(select 1 from public.community_pieces where id=p_piece) then raise exception 'Add-ons are only available for library pieces';end if;
 if p_parent is not null then
  select * into parent_row from public.community_posts where id=p_parent;
  if not found or parent_row.piece<>p_piece or parent_row.parent is not null or parent_row.visibility<>'public' or parent_row.hidden_at is not null or parent_row.moderated_at is not null then raise exception 'Reply to an available public add-on in this piece';end if;
  if p_kind<>'comment' or p_publish is distinct from true then raise exception 'Replies are public comments';end if;
  chosen_visibility:='public';p_note_beat:=null;p_note_midi:=null;
 elsif p_note_beat is null or p_note_midi is null then raise exception 'Choose a note in the score first';
 elsif chosen_visibility='public' and p_publish is distinct from true then raise exception 'Confirm before revealing this add-on';
 end if;
 if chosen_visibility not in ('private','public') then raise exception 'Choose private or public visibility';end if;
 perform pg_advisory_xact_lock(hashtextextended('community:'||u::text,0));
 if p_id is null then
  if (select count(*) from public.community_posts where owner=u and created_at>now()-interval '1 hour')>=10 or
     (select count(*) from public.community_posts where owner=u and created_at>now()-interval '1 day')>=30 then raise exception 'Please wait before adding more (10 per hour, 30 per day)';end if;
  if p_parent is not null and (select count(*) from public.community_posts where parent=p_parent)>=50 then raise exception 'This thread has reached 50 replies';end if;
  insert into public.community_posts(piece,owner,alias,body,kind,bars,hand,fingers,parent,visibility,note_beat,note_midi,note_label)
  values(p_piece,u,profile_name,btrim(p_body),p_kind,btrim(p_bars),p_hand,btrim(p_fingers),p_parent,chosen_visibility,p_note_beat,p_note_midi,
   case when p_note_midi is null then null else public.community_note_name(p_note_midi) end) returning id into result;
 else
  update public.community_posts set alias=profile_name,body=btrim(p_body),bars=btrim(p_bars),hand=p_hand,fingers=btrim(p_fingers),edited_at=now()
  where id=p_id and owner=u and piece=p_piece and kind=p_kind and parent is not distinct from p_parent and hidden_at is null and moderated_at is null returning id into result;
  if result is null then raise exception 'Only the author can edit an available add-on';end if;
 end if;
 return result;
end $$;
revoke all on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean,numeric,integer,text) from public,anon,authenticated;
grant execute on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean,numeric,integer,text) to authenticated;

create or replace function public.community_reveal(p_post uuid,p_public boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 update public.community_posts set visibility=case when p_public then 'public' else 'private' end,edited_at=now()
 where id=p_post and owner=auth.uid() and parent is null and hidden_at is null and moderated_at is null;
 if not found then raise exception 'Only the author can change this add-on';end if;
end $$;
revoke all on function public.community_reveal(uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_reveal(uuid,boolean) to authenticated;

create or replace function public.community_save_addon(p_post uuid,p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
declare source public.community_posts;payload jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to add this to your repertoire';end if;
 if not p_on then delete from public.community_addon_saves where owner=auth.uid() and source_post=p_post;return;end if;
 select * into source from public.community_posts where id=p_post and parent is null and visibility='public' and hidden_at is null and moderated_at is null;
 if not found or source.owner=auth.uid() then raise exception 'Choose another learner’s available public add-on';end if;
 if (select count(*) from public.community_addon_saves where owner=auth.uid())>=2000 then raise exception 'Your add-on library is full';end if;
 payload:=public.community_post_json(source)-'mine'-'voted'-'saved'-'votes'-'replies' || jsonb_build_object('source_post',source.id,'source_alias',public.community_post_json(source)->>'alias');
 insert into public.community_addon_saves(owner,source_post,snapshot) values(auth.uid(),p_post,payload)
 on conflict(owner,source_post) do update set snapshot=excluded.snapshot,created_at=now();
end $$;
revoke all on function public.community_save_addon(uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_save_addon(uuid,boolean) to authenticated;

create or replace function public.community_vote(p_post uuid,p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to vote';end if;
 if not exists(select 1 from public.community_posts where id=p_post and visibility='public' and (owner is null or owner<>auth.uid()) and hidden_at is null and moderated_at is null) then raise exception 'Vote on another learner’s available public add-on';end if;
 if p_on then insert into public.community_votes(post,owner) values(p_post,auth.uid()) on conflict do nothing;
 else delete from public.community_votes where post=p_post and owner=auth.uid();end if;
end $$;
revoke all on function public.community_vote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_vote(uuid,boolean) to authenticated;

create or replace function public.community_report(p_post uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-report:'||auth.uid()::text,0));
 if (select count(*) from public.community_reports where owner=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Report limit reached; contact the maintainer';end if;
 if not exists(select 1 from public.community_posts where id=p_post and visibility='public' and hidden_at is null and moderated_at is null) then raise exception 'Add-on is unavailable';end if;
 insert into public.community_reports(post,owner,reason) values(p_post,auth.uid(),btrim(p_reason)) on conflict(post,owner) do update set reason=excluded.reason;
end $$;
revoke all on function public.community_report(uuid,text) from public,anon,authenticated;
grant execute on function public.community_report(uuid,text) to authenticated;

insert into public.community_bots(id,display_name,skills) values
 ('practice-demo','OpenPiano Practice Bot','Demo note comments'),
 ('rhythm-demo','OpenPiano Rhythm Bot','Demo rhythm prompts'),
 ('listening-demo','OpenPiano Listening Bot','Demo listening prompts')
on conflict(id) do update set display_name=excluded.display_name,skills=excluded.skills;

insert into public.community_posts(id,piece,owner,bot_id,alias,body,kind,bars,hand,fingers,visibility,note_beat,note_midi,note_label)
select v.id,'entertainer',null,v.bot_id,v.alias,v.body,'comment',v.bars,v.hand,'','public',v.beat,v.midi,public.community_note_name(v.midi)
from (values
 ('d0000000-0000-4000-8000-000000000001'::uuid,'practice-demo','OpenPiano Practice Bot','Demo add-on: start a slow loop from this pickup note, then raise the tempo only after it feels even.','Pickup','RH',0.25::numeric,76),
 ('d0000000-0000-4000-8000-000000000002'::uuid,'rhythm-demo','OpenPiano Rhythm Bot','Demo add-on: count the short pickup notes aloud before joining the first full bar.','Pickup rhythm','RH',0.50::numeric,72),
 ('d0000000-0000-4000-8000-000000000003'::uuid,'listening-demo','OpenPiano Listening Bot','Demo add-on: listen once from here and notice how the pickup leads into the phrase.','Pickup','RH',0.75::numeric,69)
) as v(id,bot_id,alias,body,bars,hand,beat,midi)
where exists(select 1 from public.community_pieces where id='entertainer')
on conflict(id) do update set body=excluded.body,bars=excluded.bars,hand=excluded.hand,visibility='public',note_beat=excluded.note_beat,note_midi=excluded.note_midi,note_label=excluded.note_label,hidden_at=null,moderated_at=null;

notify pgrst,'reload schema';
commit;
