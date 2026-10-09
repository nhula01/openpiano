-- Add-ons as whole layers: one add-on per person per built-in piece.
-- Each add-on holds a working draft (only its author sees it) and, once published, a published copy
-- that others can browse, vote for and apply. Publishing copies the whole draft; the draft stays
-- editable and nobody else sees changes until the next publish.
-- Notes are a JSON list of {"b": beat, "m": midi, "h": "RH"|"LH"|"BH", "f": "3" | "3-1" | "1 2 3", "c": comment}.
-- Run after supabase-community.sql, supabase-community-catalog.sql, supabase-profiles.sql and
-- supabase-note-addons.sql (it reuses community_pieces, community_profiles and community_bots).
-- All access goes through the functions below; the tables are not readable directly.
-- It also lets a public comment be about the piece as a whole (no note), for the Comments section.
begin;

create table if not exists public.community_addons (
 id uuid primary key default gen_random_uuid(),
 piece text not null references public.community_pieces(id),
 owner uuid references auth.users(id) on delete cascade,
 bot_id text references public.community_bots(id),
 alias text not null default '' check(char_length(alias)<=40),
 draft jsonb not null default '[]'::jsonb,
 published jsonb,
 draft_updated_at timestamptz not null default now(),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 hidden_at timestamptz,
 moderated_at timestamptz,
 constraint community_addons_author check((owner is not null) <> (bot_id is not null)),
 constraint community_addons_lists check(jsonb_typeof(draft)='array' and (published is null or jsonb_typeof(published)='array')),
 constraint community_addons_size check(octet_length(draft::text)<=300000 and (published is null or octet_length(published::text)<=300000))
);
create unique index if not exists community_addons_owner_piece on public.community_addons(owner,piece) where owner is not null;
create unique index if not exists community_addons_bot_piece on public.community_addons(bot_id,piece) where bot_id is not null;
create index if not exists community_addons_live on public.community_addons(piece,published_at desc)
 where published is not null and hidden_at is null and moderated_at is null;

create table if not exists public.community_addon_votes (
 addon uuid not null references public.community_addons(id) on delete cascade,
 owner uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(addon,owner)
);
create table if not exists public.community_addon_reports (
 addon uuid not null references public.community_addons(id) on delete cascade,
 owner uuid not null references auth.users(id) on delete cascade,
 reason text not null check(char_length(reason) between 1 and 500),
 created_at timestamptz not null default now(),
 primary key(addon,owner)
);
alter table public.community_addons enable row level security;
alter table public.community_addon_votes enable row level security;
alter table public.community_addon_reports enable row level security;
revoke all on public.community_addons,public.community_addon_votes,public.community_addon_reports from public,anon,authenticated;

-- Check and tidy a list of notes. Finger numbers must be clear (1–5, a substitution such as 3-1, or a
-- short sequence); comments stay short; each note appears once; empty notes are dropped.
create or replace function public.community_addon_clean(p_notes jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare n jsonb;result jsonb:='[]'::jsonb;b numeric;m numeric;h text;f text;c text;
begin
 if p_notes is null then return '[]'::jsonb;end if;
 if jsonb_typeof(p_notes)<>'array' then raise exception 'Add-on notes must be a list';end if;
 if jsonb_array_length(p_notes)>3000 then raise exception 'An add-on can hold up to 3000 notes';end if;
 for n in select value from jsonb_array_elements(p_notes) loop
  if jsonb_typeof(n)<>'object' or jsonb_typeof(n->'b') is distinct from 'number' or jsonb_typeof(n->'m') is distinct from 'number' then raise exception 'Each add-on note needs a beat and a pitch';end if;
  b:=trim_scale(round((n->>'b')::numeric,4));m:=(n->>'m')::numeric;h:=coalesce(n->>'h','BH');
  f:=btrim(regexp_replace(coalesce(n->>'f',''),'\s*[–-]\s*','-','g'));c:=btrim(coalesce(n->>'c',''));
  if b<0 or b>100000 or m<21 or m>108 or m<>trunc(m) then raise exception 'Add-on note is outside the piece';end if;
  if h not in ('RH','LH','BH') then raise exception 'Choose RH, LH or BH';end if;
  if f<>'' and f !~ '^[1-5](-[1-5]| [1-5]){0,7}$' then raise exception 'Use finger numbers 1 to 5, for example 3 or 3-1';end if;
  if char_length(c)>500 then raise exception 'Keep each comment to 500 characters';end if;
  if f='' and c='' then continue;end if;
  result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('b',b,'m',m::integer,'h',h,'f',nullif(f,''),'c',nullif(c,''))));
 end loop;
 if (select count(*) from jsonb_array_elements(result))<>(select count(distinct (e->>'b')::numeric::text||':'||(e->>'m')) from jsonb_array_elements(result) e) then
  raise exception 'Each note can appear once in an add-on';end if;
 return result;
end $$;
revoke all on function public.community_addon_clean(jsonb) from public,anon,authenticated;

-- What others see of a published add-on: the author's public name (or the bot's), the published notes
-- and votes. Never the owner id, email or draft.
create or replace function public.community_addon_json(a public.community_addons)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'piece',a.piece,
  'author',case when a.bot_id is not null then (select display_name from public.community_bots where id=a.bot_id)
   else coalesce((select display_name from public.community_profiles where owner=a.owner),nullif(a.alias,''),'Learner') end,
  'profile',case when a.bot_id is not null then (select jsonb_build_object('name',display_name,'skills',skills,'bot',true) from public.community_bots where id=a.bot_id)
   else (select public.profile_public(public_id) from public.community_profiles where owner=a.owner and published) end,
  'bot',a.bot_id is not null,'notes',coalesce(a.published,'[]'::jsonb),'published_at',a.published_at,
  'mine',coalesce(a.owner=auth.uid(),false),
  'votes',(select count(*) from public.community_addon_votes v where v.addon=a.id),
  'voted',exists(select 1 from public.community_addon_votes v where v.addon=a.id and v.owner=auth.uid()));
$$;
revoke all on function public.community_addon_json(public.community_addons) from public,anon,authenticated;

-- Published add-ons for a piece, most voted first, 20 at a time.
create or replace function public.addon_list(p_piece text,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with live as (
  select a.id,a.published_at,(select count(*) from public.community_addon_votes v where v.addon=a.id) votes
  from public.community_addons a
  where a.piece=p_piece and a.published is not null and jsonb_array_length(a.published)>0 and a.hidden_at is null and a.moderated_at is null),
 page as (select * from live order by votes desc,published_at desc,id offset greatest(0,coalesce(p_offset,0)) limit 20)
 select jsonb_build_object('total',(select count(*) from live),
  'addons',coalesce((select jsonb_agg(public.community_addon_json(a) order by p.votes desc,p.published_at desc,p.id)
   from page p join public.community_addons a on a.id=p.id),'[]'::jsonb));
$$;
revoke all on function public.addon_list(text,integer) from public,anon,authenticated;
grant execute on function public.addon_list(text,integer) to anon,authenticated;

-- Your add-on for a piece: the draft and the published copy (null when you have none).
create or replace function public.addon_mine(p_piece text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'draft',a.draft,'published',a.published,'published_at',a.published_at,
  'draft_updated_at',a.draft_updated_at,'under_review',a.moderated_at is not null,
  'votes',(select count(*) from public.community_addon_votes v where v.addon=a.id))
 from public.community_addons a where a.owner=auth.uid() and a.piece=p_piece and a.hidden_at is null;
$$;
revoke all on function public.addon_mine(text) from public,anon,authenticated;
grant execute on function public.addon_mine(text) to authenticated;

-- Save the whole draft (it replaces the previous draft). Nobody else sees it.
create or replace function public.addon_save_draft(p_piece text,p_notes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();clean jsonb;
begin
 if u is null then raise exception 'Sign in to save your add-on';end if;
 if not exists(select 1 from public.community_profiles where owner=u) then raise exception 'Set up your profile name before saving an add-on';end if;
 if not exists(select 1 from public.community_pieces where id=p_piece) then raise exception 'Add-ons are only available for library pieces';end if;
 clean:=public.community_addon_clean(p_notes);
 insert into public.community_addons(piece,owner,draft,draft_updated_at) values(p_piece,u,clean,now())
 on conflict(owner,piece) where owner is not null do update set draft=excluded.draft,draft_updated_at=now(),hidden_at=null;
 return public.addon_mine(p_piece);
end $$;
revoke all on function public.addon_save_draft(text,jsonb) from public,anon,authenticated;
grant execute on function public.addon_save_draft(text,jsonb) to authenticated;

-- Publish the whole draft. Earlier votes stay with the add-on.
create or replace function public.addon_publish(p_piece text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();a public.community_addons;name text;
begin
 if u is null then raise exception 'Sign in to publish your add-on';end if;
 select display_name into name from public.community_profiles where owner=u;
 if name is null then raise exception 'Set up your profile name before publishing';end if;
 select * into a from public.community_addons where owner=u and piece=p_piece and hidden_at is null for update;
 if not found or jsonb_array_length(a.draft)=0 then raise exception 'Add fingering or comments to your draft first';end if;
 if a.moderated_at is not null then raise exception 'This add-on is being reviewed by the maintainer';end if;
 update public.community_addons set published=a.draft,published_at=now(),alias=name where id=a.id;
 return public.addon_mine(p_piece);
end $$;
revoke all on function public.addon_publish(text) from public,anon,authenticated;
grant execute on function public.addon_publish(text) to authenticated;

-- Throw away unpublished changes: the draft goes back to the published copy (or empty).
create or replace function public.addon_discard(p_piece text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 update public.community_addons set draft=coalesce(published,'[]'::jsonb),draft_updated_at=now() where owner=auth.uid() and piece=p_piece;
 return public.addon_mine(p_piece);
end $$;
revoke all on function public.addon_discard(text) from public,anon,authenticated;
grant execute on function public.addon_discard(text) to authenticated;

-- Take the add-on down; the draft stays yours. Unpublished changes are kept.
create or replace function public.addon_unpublish(p_piece text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 update public.community_addons set published=null,published_at=null where owner=auth.uid() and piece=p_piece;
 return public.addon_mine(p_piece);
end $$;
revoke all on function public.addon_unpublish(text) from public,anon,authenticated;
grant execute on function public.addon_unpublish(text) to authenticated;

-- One vote per person per add-on; not for your own.
create or replace function public.addon_vote(p_addon uuid,p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to vote';end if;
 if not exists(select 1 from public.community_addons where id=p_addon and published is not null and hidden_at is null and moderated_at is null
  and (owner is null or owner<>auth.uid())) then raise exception 'Vote for another learner’s published add-on';end if;
 if p_on then insert into public.community_addon_votes(addon,owner) values(p_addon,auth.uid()) on conflict do nothing;
 else delete from public.community_addon_votes where addon=p_addon and owner=auth.uid();end if;
end $$;
revoke all on function public.addon_vote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.addon_vote(uuid,boolean) to authenticated;

create or replace function public.addon_report(p_addon uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report';end if;
 perform pg_advisory_xact_lock(hashtextextended('addon-report:'||auth.uid()::text,0));
 if (select count(*) from public.community_addon_reports where owner=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Report limit reached; contact the maintainer';end if;
 if not exists(select 1 from public.community_addons where id=p_addon and published is not null and hidden_at is null and moderated_at is null) then raise exception 'Add-on is unavailable';end if;
 insert into public.community_addon_reports(addon,owner,reason) values(p_addon,auth.uid(),btrim(p_reason)) on conflict(addon,owner) do update set reason=excluded.reason;
end $$;
revoke all on function public.addon_report(uuid,text) from public,anon,authenticated;
grant execute on function public.addon_report(uuid,text) to authenticated;

-- Comments about a piece as a whole: a root comment may now have no note. It is public only when the
-- author confirms (p_publish); everything else about community_write is unchanged.
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
 elsif (p_note_beat is null) <> (p_note_midi is null) then raise exception 'Choose a note in the score first';
 -- A comment about the piece as a whole needs no note; fingering always belongs to a note.
 elsif p_note_beat is null and p_kind<>'comment' then raise exception 'Fingering needs a note in the score';
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

commit;
