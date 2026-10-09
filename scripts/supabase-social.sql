-- OpenPiano community: follows and friends, posts, progress updates, photos, YouTube-linked
-- performances (shown as Reels), likes, comments, "working on" pieces, blocks, reports and activity.
-- Direct video uploads are built but OFF (social_config.video_uploads); they cost storage and
-- bandwidth, so they switch on when support covers a paid plan. See docs/social.md.
-- Run after supabase-community.sql, supabase-community-catalog.sql, supabase-profiles.sql,
-- supabase-profile-photos.sql, supabase-note-addons.sql and supabase-addon-layers.sql.
--
-- Rules this file enforces (see docs/social.md):
--  * Joining the community publishes the member's music profile. Nobody else sees a member's
--    posts, profile or videos while that profile is private.
--  * Follows are one-way; two people who follow each other are friends.
--  * Posts are Public, Friends or Only me. A member's default is chosen when they join.
--  * Members who say they are 13-17: new followers need approval (always), new posts default to
--    Friends, posts with a photo, video or YouTube link never reach anyone but friends, and only
--    friends can comment.
--  * Blocking hides both people from each other and removes follows in both directions.
--  * Photos (and, when enabled, videos and their cover frames) live in the private `social-media`
--    bucket. A signed URL is issued only to the uploader or to someone allowed to see the post that
--    uses the file. While video uploads are off, only JPEG photos up to 5 MB can be uploaded.
--  * A post with a photo, video or YouTube link reported by three accounts is hidden until the
--    maintainer reviews it.
-- Every table has RLS enabled and no direct privileges; all access goes through the functions
-- below, which use an empty search_path and auth.uid() ownership checks.
begin;

-- ---------------------------------------------------------------- tables
create table if not exists public.social_config (
 id boolean primary key default true check(id),
 max_bucket_bytes bigint not null default 838860800,      -- 800 MB of the free plan's 1 GB
 max_files_per_account integer not null default 200,       -- photos, videos and cover frames
 uploads_per_day integer not null default 20,              -- files (a video and its cover = 2)
 videos_per_day integer not null default 5,
 report_hide_threshold integer not null default 3,
 video_uploads boolean not null default false              -- switch on with a paid storage plan
);
alter table public.social_config add column if not exists video_uploads boolean not null default false;
alter table public.social_config add column if not exists max_account_bytes bigint not null default 52428800; -- 50 MB each
insert into public.social_config(id) values(true) on conflict(id) do nothing;

create table if not exists public.social_members (
 owner uuid primary key references auth.users(id) on delete cascade,
 age_band text not null check(age_band in ('teen','adult')),
 approve_follows boolean not null default false,
 default_visibility text not null default 'public' check(default_visibility in ('public','friends','private')),
 activity_seen_at timestamptz not null default now(),
 joined_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(age_band='adult' or approve_follows)
);

create table if not exists public.social_follows (
 follower uuid not null references auth.users(id) on delete cascade,
 followee uuid not null references auth.users(id) on delete cascade,
 status text not null default 'active' check(status in ('active','pending')),
 created_at timestamptz not null default now(),
 primary key(follower,followee),
 check(follower<>followee)
);
create index if not exists social_follows_followee on public.social_follows(followee,status,created_at desc);

create table if not exists public.social_blocks (
 blocker uuid not null references auth.users(id) on delete cascade,
 blocked uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker,blocked),
 check(blocker<>blocked)
);
create index if not exists social_blocks_blocked on public.social_blocks(blocked);

create table if not exists public.social_working_on (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 piece text references public.community_pieces(id) on delete set null,
 title text not null check(char_length(title) between 1 and 120),
 status text not null default 'learning' check(status in ('starting','learning','polishing','performing')),
 note text not null default '' check(char_length(note)<=200),
 position smallint not null default 0,
 updated_at timestamptz not null default now()
);
create index if not exists social_working_on_owner on public.social_working_on(owner,position);
create index if not exists social_working_on_piece on public.social_working_on(piece) where piece is not null;

create table if not exists public.social_posts (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('post','progress','video')),
 body text not null default '' check(char_length(body)<=2000),
 piece text references public.community_pieces(id) on delete set null,
 piece_title text not null default '' check(char_length(piece_title)<=120),
 visibility text not null check(visibility in ('public','friends','private')),
 video_path text unique,
 poster_path text unique,
 image_path text unique,
 youtube_id text check(youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
 youtube_start integer check(youtube_start is null or youtube_start between 0 and 86400),
 video_seconds numeric(5,1) check(video_seconds is null or video_seconds between 0.5 and 90),
 stats jsonb check(stats is null or jsonb_typeof(stats)='object'),
 created_at timestamptz not null default now(),
 edited_at timestamptz,
 moderated_at timestamptz,
 auto_hidden boolean not null default false,
 deleted_at timestamptz,          -- deleted by its author while reported or moderated: kept for review
 check((kind='video')=(video_path is not null)),
 check(kind<>'progress' or stats is not null),
 check(poster_path is null or kind='video'),
 check(kind<>'video' or (image_path is null and youtube_id is null)),
 check(image_path is null or youtube_id is null)
);
create index if not exists social_posts_owner_date on public.social_posts(owner,created_at desc);
create index if not exists social_posts_date on public.social_posts(created_at desc) where moderated_at is null;
create index if not exists social_posts_piece_date on public.social_posts(piece,created_at desc) where piece is not null and moderated_at is null;
create index if not exists social_posts_video_date on public.social_posts(created_at desc) where (kind='video' or youtube_id is not null) and moderated_at is null;

create table if not exists public.social_likes (
 post uuid not null references public.social_posts(id) on delete cascade,
 owner uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post,owner)
);
create index if not exists social_likes_owner on public.social_likes(owner,created_at desc);

create table if not exists public.social_comments (
 id uuid primary key default gen_random_uuid(),
 post uuid not null references public.social_posts(id) on delete cascade,
 owner uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 1000),
 created_at timestamptz not null default now(),
 hidden_at timestamptz,
 moderated_at timestamptz
);
create index if not exists social_comments_post on public.social_comments(post,created_at);
create index if not exists social_comments_owner on public.social_comments(owner,created_at desc);

-- Append-only log used for rate limits, so deleting and re-doing something does not reset a limit.
create table if not exists public.social_events (
 owner uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('post','follow','like','upload')),
 target text,
 bytes bigint,
 created_at timestamptz not null default now()
);
create index if not exists social_events_owner on public.social_events(owner,kind,created_at desc);

create table if not exists public.social_reports (
 kind text not null check(kind in ('post','comment','profile')),
 target uuid not null,
 owner uuid not null references auth.users(id) on delete cascade,
 reason text not null check(char_length(reason) between 1 and 500),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 primary key(kind,target,owner)
);
create index if not exists social_reports_open on public.social_reports(created_at desc) where reviewed_at is null;

alter table public.social_config enable row level security;
alter table public.social_members enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_blocks enable row level security;
alter table public.social_working_on enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_reports enable row level security;
alter table public.social_events enable row level security;
revoke all on public.social_config,public.social_members,public.social_follows,public.social_blocks,
 public.social_working_on,public.social_posts,public.social_likes,public.social_comments,public.social_reports,public.social_events
 from public,anon,authenticated;

-- ---------------------------------------------------------------- internal helpers (no EXECUTE for visitors)
create or replace function public.social_active(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.social_members m join public.community_profiles c on c.owner=m.owner
  where m.owner=p_user and c.published);
$$;
create or replace function public.social_teen(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.social_members where owner=p_user and age_band='teen');
$$;
create or replace function public.social_blocked(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_a is not null and p_b is not null and exists(select 1 from public.social_blocks
  where (blocker=p_a and blocked=p_b) or (blocker=p_b and blocked=p_a));
$$;
create or replace function public.social_following(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_a is not null and exists(select 1 from public.social_follows where follower=p_a and followee=p_b and status='active');
$$;
create or replace function public.social_friends(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.social_following(p_a,p_b) and public.social_following(p_b,p_a);
$$;
-- May this viewer see personal details (bio, picture, lists, working-on) of a 13-17 member?
create or replace function public.social_teen_visible(p_user uuid,p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not public.social_teen(p_user) or p_user=p_viewer or public.social_friends(p_viewer,p_user);
$$;
create or replace function public.social_user_of(p_public_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select owner from public.community_profiles where public_id=p_public_id;
$$;
-- A 13-17 member's photos, videos and YouTube links never reach beyond friends, whatever was chosen.
create or replace function public.social_has_media(p public.social_posts)
returns boolean language sql immutable set search_path='' as $$
 select p.kind='video' or p.image_path is not null or p.youtube_id is not null;
$$;
create or replace function public.social_effective_visibility(p public.social_posts)
returns text language sql stable security definer set search_path='' as $$
 select case when p.visibility='public' and public.social_has_media(p) and public.social_teen(p.owner) then 'friends' else p.visibility end;
$$;
create or replace function public.social_visible(p public.social_posts,p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p.moderated_at is null and p.deleted_at is null and (
  (p_viewer is not null and p.owner=p_viewer) or (
   public.social_active(p.owner) and not public.social_blocked(p_viewer,p.owner) and (
    public.social_effective_visibility(p)='public' or
    (public.social_effective_visibility(p)='friends' and public.social_friends(p_viewer,p.owner)))));
$$;
create or replace function public.social_can_comment(p public.social_posts,p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_viewer is not null and public.social_active(p_viewer) and public.social_visible(p,p_viewer)
  and (p.owner=p_viewer or not public.social_teen(p.owner) or public.social_friends(p_viewer,p.owner));
$$;
create or replace function public.social_author(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',public_id,'name',display_name,
  'avatar_path',case when public.social_teen_visible(p_user,auth.uid()) then avatar_path end,'experience',experience)
 from public.community_profiles where owner=p_user;
$$;
create or replace function public.social_relation(p_viewer uuid,p_other uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'mine',coalesce(p_viewer=p_other,false),
  'following',(select status from public.social_follows where follower=p_viewer and followee=p_other),
  'follows_me',(select status from public.social_follows where follower=p_other and followee=p_viewer),
  'friends',public.social_friends(p_viewer,p_other),
  -- Whether new followers need approval. Members aged 13-17 always have this on, so it cannot be
  -- used to tell them apart from adults who chose approval.
  'approval',coalesce((select approve_follows from public.social_members where owner=p_other),false));
$$;
create or replace function public.social_clean_stats(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb:='{}'::jsonb;k text;lo numeric;hi numeric;
begin
 if p is null or jsonb_typeof(p)<>'object' then return null;end if;
 foreach k in array array['accuracy','correct','wrong','missed','bpm','minutes'] loop
  lo:=case k when 'bpm' then 20 else 0 end;
  hi:=case k when 'accuracy' then 100 when 'bpm' then 400 when 'minutes' then 1440 else 100000 end;
  if jsonb_typeof(p->k)='number' and (p->>k)::numeric between lo and hi then r:=r||jsonb_build_object(k,round((p->>k)::numeric));end if;
 end loop;
 if p->>'hands' in ('RH','LH','BH') then r:=r||jsonb_build_object('hands',p->>'hands');end if;
 if p->>'mode' in ('wait','play','listen') then r:=r||jsonb_build_object('mode',p->>'mode');end if;
 if jsonb_typeof(p->'bars')='string' and char_length(p->>'bars') between 1 and 40 then r:=r||jsonb_build_object('bars',btrim(p->>'bars'));end if;
 return nullif(r,'{}'::jsonb);
end $$;
create or replace function public.social_post_json(p public.social_posts,p_viewer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('type','post','id',p.id,'kind',p.kind,'body',p.body,'piece',p.piece,'piece_title',p.piece_title,
  'visibility',public.social_effective_visibility(p),'chosen_visibility',case when p.owner=p_viewer then p.visibility end,
  'video_path',p.video_path,'poster_path',p.poster_path,'video_seconds',p.video_seconds,'stats',p.stats,
  'image_path',p.image_path,'youtube_id',p.youtube_id,'youtube_start',p.youtube_start,
  'created_at',p.created_at,'edited_at',p.edited_at,'author',public.social_author(p.owner),
  'mine',coalesce(p.owner=p_viewer,false),'following',public.social_following(p_viewer,p.owner),
  'relation',public.social_relation(p_viewer,p.owner),
  'likes',(select count(*) from public.social_likes l where l.post=p.id),
  'liked',coalesce(exists(select 1 from public.social_likes l where l.post=p.id and l.owner=p_viewer),false),
  'comments',(select count(*) from public.social_comments c where c.post=p.id and c.hidden_at is null and c.moderated_at is null
   and not public.social_blocked(p_viewer,c.owner) and public.social_active(c.owner)),
  'can_comment',public.social_can_comment(p,p_viewer));
$$;
create or replace function public.social_require_member()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in to join the community';end if;
 if not public.social_active(u) then raise exception 'Join the community from your profile first';end if;
 return u;
end $$;
revoke all on function public.social_active(uuid),public.social_teen(uuid),public.social_blocked(uuid,uuid),
 public.social_following(uuid,uuid),public.social_friends(uuid,uuid),public.social_user_of(uuid),public.social_teen_visible(uuid,uuid),
 public.social_has_media(public.social_posts),public.social_effective_visibility(public.social_posts),public.social_visible(public.social_posts,uuid),
 public.social_can_comment(public.social_posts,uuid),public.social_author(uuid),public.social_relation(uuid,uuid),
 public.social_clean_stats(jsonb),public.social_post_json(public.social_posts,uuid),public.social_require_member()
 from public,anon,authenticated;

-- The music profile of a 13-17 member (bio, skills, picture) is shown only to friends. Their chosen
-- name still appears with what they post, as before.
create or replace function public.profile_public(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.social_teen_visible(owner,auth.uid())
  then jsonb_build_object('id',public_id,'name',display_name,'skills',skills,'bio',bio,'experience',experience,'avatar_path',avatar_path)
  else jsonb_build_object('id',public_id,'name',display_name,'skills','','bio','','experience',experience,'avatar_path',null) end
 from public.community_profiles where public_id=p_id and published;
$$;
revoke all on function public.profile_public(uuid) from public,anon,authenticated;
grant execute on function public.profile_public(uuid) to anon,authenticated;
create or replace function public.profile_avatar_visible(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_profiles where (owner=auth.uid() and split_part(p_path,'/',1)=public_id::text)
  or (avatar_path=p_path and published and public.social_teen_visible(owner,auth.uid())));
$$;
revoke all on function public.profile_avatar_visible(text) from public,anon,authenticated;
grant execute on function public.profile_avatar_visible(text) to anon,authenticated;

-- ---------------------------------------------------------------- membership and settings
create or replace function public.social_me()
returns jsonb language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then null else jsonb_build_object(
  'profile',public.profile_mine(),
  'member',(select jsonb_build_object('age_band',age_band,'approve_follows',approve_follows,'default_visibility',default_visibility,'joined_at',joined_at)
   from public.social_members where owner=auth.uid()),
  'active',public.social_active(auth.uid()),
  'video_uploads',(select video_uploads from public.social_config where id),
  'followers',(select count(*) from public.social_follows where followee=auth.uid() and status='active'),
  'following',(select count(*) from public.social_follows where follower=auth.uid() and status='active'),
  'requests',(select count(*) from public.social_follows f where f.followee=auth.uid() and f.status='pending'
   and not public.social_blocked(auth.uid(),f.follower) and public.social_active(f.follower)),
  'working_on',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'piece',w.piece,'title',w.title,'status',w.status,'note',w.note) order by w.position,w.updated_at)
   from public.social_working_on w where w.owner=auth.uid()),'[]'::jsonb)) end;
$$;
revoke all on function public.social_me() from public,anon,authenticated;
grant execute on function public.social_me() to authenticated;

-- Joining publishes the music profile (name, picture, experience, skills, bio).
create or replace function public.social_join(p_age_band text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in to join the community';end if;
 if p_age_band not in ('teen','adult') then raise exception 'Choose your age group';end if;
 if not exists(select 1 from public.community_profiles where owner=u) then raise exception 'Save your music profile name first';end if;
 update public.community_profiles set published=true,updated_at=now() where owner=u;
 insert into public.social_members(owner,age_band,approve_follows,default_visibility)
 values(u,p_age_band,p_age_band='teen',case when p_age_band='teen' then 'friends' else 'public' end)
 on conflict(owner) do nothing;
 return public.social_me();
end $$;
revoke all on function public.social_join(text) from public,anon,authenticated;
grant execute on function public.social_join(text) to authenticated;

create or replace function public.social_settings_save(p_age_band text,p_approve_follows boolean,p_default_visibility text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();approve boolean;was public.social_members;
begin
 select * into was from public.social_members where owner=u;
 if u is null or was.owner is null then raise exception 'Join the community first';end if;
 if p_age_band not in ('teen','adult') then raise exception 'Choose your age group';end if;
 if p_default_visibility not in ('public','friends','private') then raise exception 'Choose who sees new posts';end if;
 approve:=p_age_band='teen' or coalesce(p_approve_follows,false);
 -- Moving from 13-17 to 18+ keeps approvals on for now; they can be turned off in a later save.
 if was.age_band='teen' and p_age_band='adult' then approve:=true;end if;
 update public.social_members set age_band=p_age_band,approve_follows=approve,default_visibility=p_default_visibility,updated_at=now() where owner=u;
 -- Turning approvals off accepts everyone already waiting.
 if not approve then update public.social_follows set status='active' where followee=u and status='pending';end if;
 return public.social_me();
end $$;
revoke all on function public.social_settings_save(text,boolean,text) from public,anon,authenticated;
grant execute on function public.social_settings_save(text,boolean,text) to authenticated;

-- Leaving deletes the member's posts, comments, likes, follows and working-on list. The client
-- deletes the returned media files (the storage policy lets owners delete their own folder).
create or replace function public.social_leave()
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();media jsonb;
begin
 if u is null then raise exception 'Sign in first';end if;
 -- Posts that are reported or moderated are kept (hidden) for review; everything else is deleted.
 update public.social_posts p set deleted_at=now() where p.owner=u and p.deleted_at is null and (p.moderated_at is not null or
  exists(select 1 from public.social_reports r where r.kind='post' and r.target=p.id and r.reviewed_at is null));
 delete from public.social_posts where owner=u and deleted_at is null;
 select coalesce(jsonb_agg(o.name),'[]'::jsonb) into media from storage.objects o join public.community_profiles c on c.owner=u
  where o.bucket_id='social-media' and split_part(o.name,'/',1)=c.public_id::text
   and not exists(select 1 from public.social_posts p where o.name in (p.video_path,p.poster_path,p.image_path));
 delete from public.social_comments where owner=u;
 delete from public.social_likes where owner=u;
 delete from public.social_follows where follower=u or followee=u;
 delete from public.social_working_on where owner=u;
 delete from public.social_members where owner=u;   -- blocks are kept, so rejoining does not unblock anyone
 return jsonb_build_object('media',media);
end $$;
revoke all on function public.social_leave() from public,anon,authenticated;
grant execute on function public.social_leave() to authenticated;

-- ---------------------------------------------------------------- working on
create or replace function public.social_working_on_save(p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();item jsonb;i integer:=0;piece_id text;
begin
 if u is null then raise exception 'Sign in to keep a working-on list';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Working-on pieces must be a list';end if;
 if jsonb_array_length(p_items)>12 then raise exception 'List up to 12 pieces you are working on';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-working:'||u::text,0));
 delete from public.social_working_on where owner=u;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' then raise exception 'Each piece needs a title';end if;
  piece_id:=nullif(item->>'piece','');
  if piece_id is not null and not exists(select 1 from public.community_pieces where id=piece_id) then piece_id:=null;end if;
  if piece_id is not null and exists(select 1 from public.social_working_on where owner=u and piece=piece_id) then continue;end if;
  insert into public.social_working_on(owner,piece,title,status,note,position)
  values(u,piece_id,btrim(coalesce(item->>'title','')),coalesce(nullif(item->>'status',''),'learning'),btrim(coalesce(item->>'note','')),i);
  i:=i+1;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'piece',w.piece,'title',w.title,'status',w.status,'note',w.note) order by w.position)
  from public.social_working_on w where w.owner=u),'[]'::jsonb);
end $$;
revoke all on function public.social_working_on_save(jsonb) from public,anon,authenticated;
grant execute on function public.social_working_on_save(jsonb) to authenticated;

-- ---------------------------------------------------------------- profiles, people, search
create or replace function public.social_profile(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=auth.uid();target uuid:=public.social_user_of(p_id);lists boolean;
begin
 if target is null or public.social_blocked(v,target) then return null;end if;
 if not exists(select 1 from public.community_profiles where owner=target and published) and target is distinct from v then return null;end if;
 -- Follower lists and counts are for the member and their friends only (the same rule for everyone,
 -- so the rule itself does not reveal anyone's age group). Details of 13-17 members: friends only.
 lists:=coalesce(target=v,false) or public.social_friends(v,target);
 return public.profile_public(p_id)||jsonb_build_object(
  'member',public.social_active(target),
  'relation',public.social_relation(v,target),
  'followers',(select count(*) from public.social_follows where followee=target and status='active'),
  'following',(select count(*) from public.social_follows where follower=target and status='active'),
  'friends',(select count(*) from public.social_follows a join public.social_follows b on b.follower=a.followee and b.followee=a.follower
   where a.follower=target and a.status='active' and b.status='active'),
  'posts',(select count(*) from (select p.* from public.social_posts p where p.owner=target and p.deleted_at is null order by p.created_at desc limit 1000) p where public.social_visible(p,v)),
  'lists_visible',lists,
  'working_on',case when public.social_teen_visible(target,v) then coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'piece',w.piece,'title',w.title,'status',w.status,'note',w.note) order by w.position)
   from public.social_working_on w where w.owner=target),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.social_profile(uuid) from public,anon,authenticated;
grant execute on function public.social_profile(uuid) to anon,authenticated;

create or replace function public.social_people(p_id uuid,p_which text default 'followers',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=auth.uid();target uuid:=public.social_user_of(p_id);
begin
 if target is null or public.social_blocked(v,target) or not public.social_active(target) and target is distinct from v then return '[]'::jsonb;end if;
 if p_which not in ('followers','following','friends','requests') then raise exception 'Unknown list';end if;
 if p_which='requests' and target is distinct from v then raise exception 'Only you can see your follow requests';end if;
 if target is distinct from v and not public.social_friends(v,target) then raise exception 'Only friends can see this list';end if;
 return coalesce((select jsonb_agg(public.social_author(person)||jsonb_build_object('relation',public.social_relation(v,person)) order by at desc)
  from (
   select f.follower person,f.created_at at from public.social_follows f where p_which='followers' and f.followee=target and f.status='active'
   union all select f.followee,f.created_at from public.social_follows f where p_which='following' and f.follower=target and f.status='active'
   union all select f.followee,f.created_at from public.social_follows f where p_which='friends' and f.follower=target and f.status='active'
    and public.social_following(f.followee,target)
   union all select f.follower,f.created_at from public.social_follows f where p_which='requests' and f.followee=target and f.status='pending'
   order by at desc limit 50 offset greatest(0,least(coalesce(p_offset,0),5000))
  ) people where public.social_active(person) and not public.social_blocked(v,person)
    and (p_which='requests' or public.social_teen_visible(person,v))),'[]'::jsonb);
end $$;
revoke all on function public.social_people(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.social_people(uuid,text,integer) to anon,authenticated;

create or replace function public.social_search(p_query text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(public.social_author(c.owner)||jsonb_build_object('relation',public.social_relation(auth.uid(),c.owner)) order by c.display_name),'[]'::jsonb)
 from (select c.* from public.community_profiles c join public.social_members m on m.owner=c.owner
  where c.published and char_length(btrim(coalesce(p_query,'')))>=2
   and c.display_name ilike '%'||replace(replace(replace(btrim(p_query),'\','\\'),'%','\%'),'_','\_')||'%'
   and not public.social_blocked(auth.uid(),c.owner)
   -- 13-17 members are found only by other 13-17 members and by their friends.
   and (m.age_band='adult' or public.social_teen(auth.uid()) or public.social_friends(auth.uid(),c.owner))
  order by c.display_name limit 20) c;
$$;
revoke all on function public.social_search(text) from public,anon,authenticated;
grant execute on function public.social_search(text) to anon,authenticated;

-- People to follow: shared pieces and friends of friends first. Members who said they are
-- 13-17 are suggested only to other 13-17 members or to people already connected to them.
create or replace function public.social_suggest()
returns jsonb language sql stable security definer set search_path='' as $$
 with v as (select auth.uid() u),
 candidates as (
  select m.owner,
   (select count(*) from public.social_working_on a join public.social_working_on b on a.piece=b.piece
     where a.owner=m.owner and b.owner=(select u from v) and a.piece is not null)*3
   + (select count(*) from public.social_follows f1 join public.social_follows f2 on f2.follower=f1.followee
     where f1.follower=(select u from v) and f1.status='active' and f2.followee=m.owner and f2.status='active')
   + case when exists(select 1 from public.social_posts p where p.owner=m.owner and p.created_at>now()-interval '14 days') then 1 else 0 end score
  from (select * from public.social_members order by updated_at desc limit 400) m
  join public.community_profiles c on c.owner=m.owner and c.published
  where m.owner is distinct from (select u from v)
   and not public.social_blocked((select u from v),m.owner)
   and not exists(select 1 from public.social_follows f where f.follower=(select u from v) and f.followee=m.owner)
   and (m.age_band='adult' or public.social_teen((select u from v)))
 )
 select coalesce(jsonb_agg(public.social_author(owner)||jsonb_build_object('relation',public.social_relation((select u from v),owner)) order by score desc,owner),'[]'::jsonb)
 from (select * from candidates order by score desc,owner limit 8) c;
$$;
revoke all on function public.social_suggest() from public,anon,authenticated;
grant execute on function public.social_suggest() to anon,authenticated;

-- ---------------------------------------------------------------- follows and blocks
create or replace function public.social_follow(p_id uuid,p_on boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.social_require_member();who uuid:=public.social_user_of(p_id);needs boolean;
begin
 if who is null or who=u then raise exception 'Choose another musician';end if;
 if not coalesce(p_on,false) then
  delete from public.social_follows where follower=u and followee=who;
  return public.social_relation(u,who);
 end if;
 if not public.social_active(who) or public.social_blocked(u,who) then raise exception 'This musician is not available';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-follow:'||u::text,0));
 if exists(select 1 from public.social_follows where follower=u and followee=who) then return public.social_relation(u,who);end if;
 if (select count(*) from public.social_events where owner=u and kind='follow' and created_at>now()-interval '1 day')>=100 then
  raise exception 'Please wait before following more people (100 per day)';end if;
 if (select count(*) from public.social_events where owner=u and kind='follow' and target=who::text and created_at>now()-interval '1 day')>=2 then
  raise exception 'Please wait a day before following this musician again';end if;
 insert into public.social_events(owner,kind,target) values(u,'follow',who::text);
 needs:=public.social_teen(who) or coalesce((select approve_follows from public.social_members where owner=who),false);
 insert into public.social_follows(follower,followee,status) values(u,who,case when needs then 'pending' else 'active' end);
 return public.social_relation(u,who);
end $$;
revoke all on function public.social_follow(uuid,boolean) from public,anon,authenticated;
grant execute on function public.social_follow(uuid,boolean) to authenticated;

-- Accept or decline a follow request, or remove an existing follower.
create or replace function public.social_follower_set(p_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();person uuid:=public.social_user_of(p_id);
begin
 if u is null then raise exception 'Sign in first';end if;
 if person is null then raise exception 'Unknown musician';end if;
 if coalesce(p_accept,false) then
  update public.social_follows set status='active' where follower=person and followee=u and status='pending';
  if not found then raise exception 'There is no request to accept';end if;
 else
  delete from public.social_follows where follower=person and followee=u;
 end if;
 return public.social_relation(u,person);
end $$;
revoke all on function public.social_follower_set(uuid,boolean) from public,anon,authenticated;
grant execute on function public.social_follower_set(uuid,boolean) to authenticated;

create or replace function public.social_block(p_id uuid,p_on boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();target uuid:=public.social_user_of(p_id);
begin
 if u is null then raise exception 'Sign in first';end if;
 if target is null or target=u then raise exception 'Choose another musician';end if;
 if coalesce(p_on,false) then
  insert into public.social_blocks(blocker,blocked) values(u,target) on conflict do nothing;
  delete from public.social_follows where (follower=u and followee=target) or (follower=target and followee=u);
 else
  delete from public.social_blocks where blocker=u and blocked=target;
 end if;
 return coalesce(p_on,false);
end $$;
revoke all on function public.social_block(uuid,boolean) from public,anon,authenticated;
grant execute on function public.social_block(uuid,boolean) to authenticated;

create or replace function public.social_blocked_list()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.public_id,'name',c.display_name) order by b.created_at desc),'[]'::jsonb)
 from public.social_blocks b join public.community_profiles c on c.owner=b.blocked where b.blocker=auth.uid();
$$;
revoke all on function public.social_blocked_list() from public,anon,authenticated;
grant execute on function public.social_blocked_list() to authenticated;

-- ---------------------------------------------------------------- posts
create or replace function public.social_post_save(
 p_id uuid default null,p_kind text default 'post',p_body text default '',p_piece text default null,p_piece_title text default '',
 p_visibility text default null,p_video_path text default null,p_poster_path text default null,p_video_seconds numeric default null,p_stats jsonb default null,
 p_image_path text default null,p_youtube_id text default null,p_youtube_start integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.social_require_member();me public.social_members;folder text;row_ public.social_posts;cfg public.social_config;
 body_ text:=btrim(coalesce(p_body,''));piece_ text:=nullif(btrim(coalesce(p_piece,'')),'');title_ text:=btrim(coalesce(p_piece_title,''));
 vis text;stats_ jsonb;
begin
 select * into me from public.social_members where owner=u;
 select * into cfg from public.social_config where id;
 select public_id::text into folder from public.community_profiles where owner=u;
 vis:=coalesce(nullif(p_visibility,''),me.default_visibility);
 if vis not in ('public','friends','private') then raise exception 'Choose who can see this post';end if;
 if char_length(body_)>2000 then raise exception 'Posts can be up to 2000 characters';end if;
 if char_length(title_)>120 then title_:=left(title_,120);end if;
 if piece_ is not null and not exists(select 1 from public.community_pieces where id=piece_) then raise exception 'Choose a library piece, or type the title of your own song';end if;

 if p_id is not null then
  update public.social_posts set body=body_,piece=piece_,piece_title=title_,visibility=vis,edited_at=now()
  where id=p_id and owner=u and moderated_at is null
   and (kind<>'post' or char_length(body_)>0 or image_path is not null or youtube_id is not null)
  returning * into row_;
  if row_.id is null then raise exception 'Only the author can edit an available post';end if;
  return public.social_post_json(row_,u);
 end if;

 if p_kind not in ('post','progress','video') then raise exception 'Unknown kind of post';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-post:'||u::text,0));
 if (select count(*) from public.social_events where owner=u and kind='post' and created_at>now()-interval '1 hour')>=10 or
    (select count(*) from public.social_events where owner=u and kind='post' and created_at>now()-interval '1 day')>=30 then
  raise exception 'Please wait before posting again (10 per hour, 30 per day)';end if;

 if p_kind='post' and char_length(body_)=0 and p_image_path is null and p_youtube_id is null then raise exception 'Write something to post';end if;
 if p_image_path is not null and p_youtube_id is not null then raise exception 'Add a photo or a YouTube link, not both';end if;
 if p_kind='video' and (p_image_path is not null or p_youtube_id is not null) then raise exception 'A video post cannot also have a photo or link';end if;
 if p_youtube_id is not null and p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'That YouTube link is not valid';end if;
 if p_image_path is not null and (p_image_path !~ ('^'||folder||'/[0-9a-f-]{36}\.jpg$')
    or not exists(select 1 from storage.objects where bucket_id='social-media' and name=p_image_path)
    or exists(select 1 from public.social_posts where image_path=p_image_path or poster_path=p_image_path)) then
  raise exception 'Upload the photo before posting it';end if;
 if p_kind='progress' then
  stats_:=public.social_clean_stats(p_stats);
  if stats_ is null then raise exception 'A progress update needs practice results';end if;
 end if;
 if p_kind='video' then
  if not cfg.video_uploads then raise exception 'Video uploads are coming as OpenPiano''s support grows. Share a YouTube link for now';end if;
  if (select count(*) from public.social_events where owner=u and kind='post' and target='video' and created_at>now()-interval '1 day')>=cfg.videos_per_day then
   raise exception 'You can share up to % videos a day',cfg.videos_per_day;end if;
  if p_video_path is null or p_video_path !~ ('^'||folder||'/[0-9a-f-]{36}\.(mp4|webm|mov)$')
     or not exists(select 1 from storage.objects where bucket_id='social-media' and name=p_video_path) then
   raise exception 'Upload the video before posting it';end if;
  if p_poster_path is not null and (p_poster_path !~ ('^'||folder||'/[0-9a-f-]{36}\.jpg$')
     or not exists(select 1 from storage.objects where bucket_id='social-media' and name=p_poster_path)) then
   raise exception 'The cover picture is missing';end if;
  if exists(select 1 from public.social_posts where video_path=p_video_path or poster_path=p_poster_path or video_path=p_poster_path or poster_path=p_video_path) then
   raise exception 'That video is already posted';end if;
  if p_video_seconds is null or p_video_seconds<0.5 or p_video_seconds>90 then raise exception 'Videos can be up to 90 seconds';end if;
  stats_:=public.social_clean_stats(p_stats);
 end if;
 insert into public.social_posts(owner,kind,body,piece,piece_title,visibility,video_path,poster_path,video_seconds,stats,image_path,youtube_id,youtube_start)
 values(u,p_kind,body_,piece_,title_,vis,case when p_kind='video' then p_video_path end,case when p_kind='video' then p_poster_path end,
  case when p_kind='video' then round(p_video_seconds,1) end,stats_,
  case when p_kind<>'video' then p_image_path end,case when p_kind<>'video' then p_youtube_id end,
  case when p_kind<>'video' and p_youtube_id is not null then greatest(0,least(coalesce(p_youtube_start,0),86400)) end)
 returning * into row_;
 insert into public.social_events(owner,kind,target) values(u,'post',p_kind);
 return public.social_post_json(row_,u);
end $$;
revoke all on function public.social_post_save(uuid,text,text,text,text,text,text,text,numeric,jsonb,text,text,integer) from public,anon,authenticated;
grant execute on function public.social_post_save(uuid,text,text,text,text,text,text,text,numeric,jsonb,text,text,integer) to authenticated;

create or replace function public.social_post_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();row_ public.social_posts;
begin
 if u is null then raise exception 'Sign in first';end if;
 select * into row_ from public.social_posts where id=p_id and owner=u and deleted_at is null;
 if row_.id is null then raise exception 'Only the author can delete this post';end if;
 -- Reported or moderated posts disappear for everyone, but are kept (with their files) for review.
 if row_.moderated_at is not null or exists(select 1 from public.social_reports r where r.kind='post' and r.target=p_id and r.reviewed_at is null) then
  update public.social_posts set deleted_at=now() where id=p_id;
  return jsonb_build_object('media','[]'::jsonb);
 end if;
 delete from public.social_posts where id=p_id;
 return jsonb_build_object('media',(select coalesce(jsonb_agg(x),'[]'::jsonb) from unnest(array[row_.video_path,row_.poster_path,row_.image_path]) x where x is not null));
end $$;
revoke all on function public.social_post_delete(uuid) from public,anon,authenticated;
grant execute on function public.social_post_delete(uuid) to authenticated;

create or replace function public.social_post(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.social_post_json(p,auth.uid()) from public.social_posts p where p.id=p_id and public.social_visible(p,auth.uid());
$$;
revoke all on function public.social_post(uuid) from public,anon,authenticated;
grant execute on function public.social_post(uuid) to anon,authenticated;

-- Feeds. Scopes:
--  following : your posts, posts of people you follow, and their public piece notes and published
--              add-ons from the library discussions (newest first, p_before cursor)
--  discover  : every public post (newest first, p_before cursor)
--  piece     : posts about one library piece (p_piece; newest first)
--  profile   : one member's posts you are allowed to see (p_profile; newest first)
--  reels     : performances (YouTube links, and uploaded videos when enabled) ranked by recent likes,
--              follows and freshness (p_offset; optional p_piece/p_profile)
create or replace function public.social_feed(p_scope text default 'following',p_before timestamptz default null,
 p_piece text default null,p_profile uuid default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=auth.uid();before timestamptz:=coalesce(p_before,now()+interval '1 minute');target uuid;result jsonb;off integer:=greatest(0,least(coalesce(p_offset,0),1000));
begin
 if p_profile is not null then
  target:=public.social_user_of(p_profile);
  if target is null then return '[]'::jsonb;end if;
 end if;
 if p_scope='following' then
  if v is null then return '[]'::jsonb;end if;
  select coalesce(jsonb_agg(item order by at desc),'[]'::jsonb) into result from (
   select * from (
    (select p.created_at at,public.social_post_json(p,v) item from public.social_posts p
     where p.created_at<before and p.deleted_at is null and p.moderated_at is null
      and (p.owner=v or p.owner in (select f.followee from public.social_follows f where f.follower=v and f.status='active'))
      and public.social_visible(p,v)
     order by p.created_at desc limit 20)
    union all
    (select c.created_at,jsonb_build_object('type','note','id',c.id,'piece',c.piece,'body',left(c.body,280),'kind',c.kind,
      'note_label',c.note_label,'reply',c.parent is not null,'created_at',c.created_at,'author',public.social_author(c.owner))
     from public.community_posts c
     where c.created_at<before and c.created_at>now()-interval '60 days' and c.owner is not null and c.owner<>v
      and c.visibility='public' and c.hidden_at is null and c.moderated_at is null
      and c.owner in (select f.followee from public.social_follows f where f.follower=v and f.status='active') and public.social_active(c.owner) and not public.social_blocked(v,c.owner)
     order by c.created_at desc limit 20)
    union all
    (select a.published_at,jsonb_build_object('type','addon','id',a.id,'piece',a.piece,'notes',jsonb_array_length(a.published),
      'created_at',a.published_at,'author',public.social_author(a.owner))
     from public.community_addons a
     where a.published is not null and a.published_at<before and a.published_at>now()-interval '60 days' and a.owner is not null and a.owner<>v
      and a.hidden_at is null and a.moderated_at is null
      and a.owner in (select f.followee from public.social_follows f where f.follower=v and f.status='active') and public.social_active(a.owner) and not public.social_blocked(v,a.owner)
     order by a.published_at desc limit 20)
   ) merged order by at desc limit 20) x;
 elsif p_scope='discover' then
  select coalesce(jsonb_agg(item order by at desc),'[]'::jsonb) into result from (
   select p.created_at at,public.social_post_json(p,v) item from public.social_posts p
   where p.created_at<before and p.moderated_at is null and p.visibility='public' and public.social_visible(p,v)
    and public.social_effective_visibility(p)='public'
   order by p.created_at desc limit 20) x;
 elsif p_scope='piece' then
  select coalesce(jsonb_agg(item order by at desc),'[]'::jsonb) into result from (
   select p.created_at at,public.social_post_json(p,v) item from public.social_posts p
   where p.piece=p_piece and p.created_at<before and public.social_visible(p,v)
   order by p.created_at desc limit 20) x;
 elsif p_scope='profile' then
  if target is null or public.social_blocked(v,target) then return '[]'::jsonb;end if;
  select coalesce(jsonb_agg(item order by at desc),'[]'::jsonb) into result from (
   select p.created_at at,public.social_post_json(p,v) item from public.social_posts p
   where p.owner=target and p.created_at<before and public.social_visible(p,v)
   order by p.created_at desc limit 20) x;
 elsif p_scope='reels' then
  select coalesce(jsonb_agg(item order by rank desc,at desc),'[]'::jsonb) into result from (
   select p.created_at at,public.social_post_json(p,v) item,
    ((select count(*) from public.social_likes l where l.post=p.id and l.created_at>now()-interval '7 days')+1
     + case when public.social_following(v,p.owner) then 3 else 0 end + case when p.owner=v then 1 else 0 end)
    / power(extract(epoch from (now()-p.created_at))/3600+2,1.2) rank
   -- Rank the 500 newest performances only, so the cost does not grow with the whole history.
   from (select * from public.social_posts q where (q.kind='video' or q.youtube_id is not null) and q.moderated_at is null and q.deleted_at is null
    and (p_piece is null or q.piece=p_piece) and (target is null or q.owner=target) order by q.created_at desc limit 500) p
   where public.social_visible(p,v)
    and (p_piece is null or p.piece=p_piece) and (target is null or p.owner=target)
   order by rank desc,p.created_at desc,p.id offset off limit 10) x;
 else
  raise exception 'Unknown feed';
 end if;
 return result;
end $$;
revoke all on function public.social_feed(text,timestamptz,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.social_feed(text,timestamptz,text,uuid,integer) to anon,authenticated;

-- ---------------------------------------------------------------- likes and comments
create or replace function public.social_like(p_post uuid,p_on boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.social_require_member();row_ public.social_posts;
begin
 select * into row_ from public.social_posts where id=p_post;
 if row_.id is null or not public.social_visible(row_,u) then raise exception 'This post is not available';end if;
 if coalesce(p_on,false) then
  if (select count(*) from public.social_events where owner=u and kind='like' and created_at>now()-interval '1 day')>=500
     or (select count(*) from public.social_events where owner=u and kind='like' and target=p_post::text and created_at>now()-interval '1 day')>=3 then
   raise exception 'Please wait before liking again';end if;
  insert into public.social_likes(post,owner) values(p_post,u) on conflict do nothing;
  insert into public.social_events(owner,kind,target) values(u,'like',p_post::text);
 else delete from public.social_likes where post=p_post and owner=u;end if;
 return jsonb_build_object('liked',coalesce(p_on,false),'likes',(select count(*) from public.social_likes where post=p_post));
end $$;
revoke all on function public.social_like(uuid,boolean) from public,anon,authenticated;
grant execute on function public.social_like(uuid,boolean) to authenticated;

create or replace function public.social_comments_list(p_post uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=auth.uid();row_ public.social_posts;
begin
 select * into row_ from public.social_posts where id=p_post;
 if row_.id is null or not public.social_visible(row_,v) then raise exception 'This post is not available';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,'author',public.social_author(c.owner),
   'mine',c.owner=v,'can_delete',c.owner=v or row_.owner=v) order by c.created_at,c.id)
  from (select * from public.social_comments c where c.post=p_post and c.hidden_at is null and c.moderated_at is null
   and not public.social_blocked(v,c.owner) and public.social_active(c.owner)
   order by c.created_at,c.id limit 100 offset greatest(0,least(coalesce(p_offset,0),5000))) c),'[]'::jsonb);
end $$;
revoke all on function public.social_comments_list(uuid,integer) from public,anon,authenticated;
grant execute on function public.social_comments_list(uuid,integer) to anon,authenticated;

create or replace function public.social_comment(p_post uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.social_require_member();row_ public.social_posts;result uuid;body_ text:=btrim(coalesce(p_body,''));
begin
 select * into row_ from public.social_posts where id=p_post;
 if row_.id is null or not public.social_can_comment(row_,u) then raise exception 'You cannot comment on this post';end if;
 if char_length(body_) not between 1 and 1000 then raise exception 'Comments are 1 to 1000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-comment:'||u::text,0));
 if (select count(*) from public.social_comments where owner=u and created_at>now()-interval '1 hour')>=30 or
    (select count(*) from public.social_comments where owner=u and created_at>now()-interval '1 day')>=150 then
  raise exception 'Please wait before commenting again (30 per hour)';end if;
 insert into public.social_comments(post,owner,body) values(p_post,u,body_) returning id into result;
 return result;
end $$;
revoke all on function public.social_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.social_comment(uuid,text) to authenticated;

create or replace function public.social_comment_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in first';end if;
 update public.social_comments c set hidden_at=now() where c.id=p_id and c.hidden_at is null
  and (c.owner=u or exists(select 1 from public.social_posts p where p.id=c.post and p.owner=u));
 if not found then raise exception 'Only the comment author or the post author can remove this comment';end if;
 return true;
end $$;
revoke all on function public.social_comment_delete(uuid) from public,anon,authenticated;
grant execute on function public.social_comment_delete(uuid) to authenticated;

-- ---------------------------------------------------------------- reports
create or replace function public.social_report(p_kind text,p_target uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();row_ public.social_posts;cfg public.social_config;reason_ text:=btrim(coalesce(p_reason,''));
begin
 if u is null then raise exception 'Sign in to report';end if;
 if char_length(reason_) not between 1 and 500 then raise exception 'Say briefly what is wrong (up to 500 characters)';end if;
 if p_kind='post' then
  select * into row_ from public.social_posts where id=p_target;
  if row_.id is null or not public.social_visible(row_,u) or row_.owner=u then raise exception 'This post is not available';end if;
 elsif p_kind='comment' then
  if not exists(select 1 from public.social_comments c join public.social_posts p on p.id=c.post
   where c.id=p_target and c.owner<>u and public.social_visible(p,u)) then raise exception 'This comment is not available';end if;
 elsif p_kind='profile' then
  if public.social_user_of(p_target) is null or public.social_user_of(p_target)=u then raise exception 'This profile is not available';end if;
 else raise exception 'Unknown report';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-report:'||u::text,0));
 if (select count(*) from public.social_reports where owner=u and created_at>now()-interval '1 day')>=20 then
  raise exception 'Please wait before sending more reports (20 per day)';end if;
 insert into public.social_reports(kind,target,owner,reason) values(p_kind,p_target,u,reason_) on conflict do nothing;
 -- Posts with a photo, video or link reported by enough established accounts are hidden until reviewed.
 select * into cfg from public.social_config where id;
 if p_kind='post' and public.social_has_media(row_) and row_.moderated_at is null and
    (select count(*) from public.social_reports r join public.social_members m on m.owner=r.owner
     where r.kind='post' and r.target=p_target and r.reviewed_at is null and m.joined_at<now()-interval '1 day'
      and public.social_active(r.owner))>=cfg.report_hide_threshold then
  update public.social_posts set moderated_at=now(),auto_hidden=true where id=p_target;
 end if;
 return true;
end $$;
revoke all on function public.social_report(text,uuid,text) from public,anon,authenticated;
grant execute on function public.social_report(text,uuid,text) to authenticated;

-- ---------------------------------------------------------------- activity (notifications)
create or replace function public.social_activity()
returns jsonb language sql stable security definer set search_path='' as $$
 with me as (select owner,activity_seen_at from public.social_members where owner=auth.uid()),
 events as (
  select f.created_at at,'follow' as type,f.follower person,null::uuid post,f.status detail
   from public.social_follows f,me where f.followee=me.owner
  union all
  select l.created_at,'like',l.owner,l.post,p.kind from public.social_likes l join public.social_posts p on p.id=l.post,me
   where p.owner=me.owner and l.owner<>me.owner
  union all
  select c.created_at,'comment',c.owner,c.post,left(c.body,140) from public.social_comments c join public.social_posts p on p.id=c.post,me
   where p.owner=me.owner and c.owner<>me.owner and c.hidden_at is null and c.moderated_at is null
 ),
 visible as (
  select e.* from events e where e.at>now()-interval '60 days' and public.social_active(e.person) and not public.social_blocked(auth.uid(),e.person)
  order by e.at desc limit 40
 )
 select case when not exists(select 1 from me) then jsonb_build_object('unread',0,'items','[]'::jsonb) else jsonb_build_object(
  'unread',(select count(*) from visible,me where visible.at>me.activity_seen_at),
  'items',coalesce((select jsonb_agg(jsonb_build_object('type',type,'at',at,'post',post,'detail',detail,
    'person',public.social_author(person)||jsonb_build_object('relation',public.social_relation(auth.uid(),person))) order by at desc) from visible),'[]'::jsonb)) end;
$$;
revoke all on function public.social_activity() from public,anon,authenticated;
grant execute on function public.social_activity() to authenticated;

create or replace function public.social_activity_seen()
returns boolean language sql security definer set search_path='' as $$
 update public.social_members set activity_seen_at=now() where owner=auth.uid() returning true;
$$;
revoke all on function public.social_activity_seen() from public,anon,authenticated;
grant execute on function public.social_activity_seen() to authenticated;

-- ---------------------------------------------------------------- video storage
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
-- 5 MB while only photos are allowed. When switching video uploads on, raise this to 26214400 (25 MB).
-- Only JPEG photos while video uploads are off. docs/social.md lists the statements that switch
-- videos on (bucket size limit, MIME types and social_config.video_uploads together).
values('social-media','social-media',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false;

create or replace function public.social_media_owned(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm|mov|jpg)$'
  and exists(select 1 from public.community_profiles where owner=auth.uid() and split_part(p_path,'/',1)=public_id::text);
$$;
create or replace function public.social_media_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.social_media_owned(p_path) and public.social_active(auth.uid())
  and (p_path ~ '\.jpg$' or (select video_uploads from public.social_config where id))
  and (select count(*) from storage.objects where bucket_id='social-media' and split_part(name,'/',1)=split_part(p_path,'/',1))
      <(select max_files_per_account from public.social_config where id)
  and (select count(*) from public.social_events where owner=auth.uid() and kind='upload' and created_at>now()-interval '1 day')
      <(select uploads_per_day from public.social_config where id)
  and (select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) from storage.objects where bucket_id='social-media'
       and split_part(name,'/',1)=split_part(p_path,'/',1))<(select max_account_bytes from public.social_config where id)
  and (select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) from storage.objects where bucket_id='social-media')
      <(select max_bucket_bytes from public.social_config where id);
$$;
create or replace function public.social_media_visible(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.social_media_owned(p_path) or exists(select 1 from public.social_posts p
  where (p.video_path=p_path or p.poster_path=p_path or p.image_path=p_path) and public.social_visible(p,auth.uid()));
$$;
-- How much video space is left, so the composer can say so before an upload fails.
create or replace function public.social_media_space()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'video_uploads',(select video_uploads from public.social_config where id),
  'full',(select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) from storage.objects where bucket_id='social-media')
   >=(select max_bucket_bytes from public.social_config where id),
  'today',(select count(*) from public.social_events where owner=auth.uid() and kind='upload' and created_at>now()-interval '1 day'),
  'uploads_per_day',(select uploads_per_day from public.social_config where id),
  'files',(select count(*) from storage.objects o join public.community_profiles c on split_part(o.name,'/',1)=c.public_id::text
   where o.bucket_id='social-media' and c.owner=auth.uid()),
  'max_files',(select max_files_per_account from public.social_config where id));
$$;
revoke all on function public.social_media_owned(text),public.social_media_upload_allowed(text),public.social_media_visible(text),public.social_media_space()
 from public,anon,authenticated;
grant execute on function public.social_media_visible(text) to anon,authenticated;
grant execute on function public.social_media_owned(text),public.social_media_upload_allowed(text),public.social_media_space() to authenticated;

-- Count every upload in the log (deleting a file does not give the upload back), and keep files
-- that belong to a post (including posts kept for review) from being deleted.
create or replace function public.social_media_logged()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='social-media' and auth.uid() is not null then
  insert into public.social_events(owner,kind,target,bytes) values(auth.uid(),'upload',new.name,coalesce((new.metadata->>'size')::bigint,0));
 end if;
 return new;
end $$;
revoke all on function public.social_media_logged() from public,anon,authenticated;
drop trigger if exists social_media_logged on storage.objects;
create trigger social_media_logged after insert on storage.objects for each row execute function public.social_media_logged();
create or replace function public.social_media_deletable(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.social_media_owned(p_path) and not exists(select 1 from public.social_posts p where p_path in (p.video_path,p.poster_path,p.image_path));
$$;
revoke all on function public.social_media_deletable(text) from public,anon,authenticated;
grant execute on function public.social_media_deletable(text) to authenticated;

drop policy if exists "social media: visible reads" on storage.objects;
drop policy if exists "social media: member adds" on storage.objects;
drop policy if exists "social media: owner deletes" on storage.objects;
create policy "social media: visible reads" on storage.objects for select to anon,authenticated
 using(bucket_id='social-media' and public.social_media_visible(name));
create policy "social media: member adds" on storage.objects for insert to authenticated
 with check(bucket_id='social-media' and public.social_media_upload_allowed(name));
create policy "social media: owner deletes" on storage.objects for delete to authenticated
 using(bucket_id='social-media' and public.social_media_deletable(name));

notify pgrst,'reload schema';
commit;
