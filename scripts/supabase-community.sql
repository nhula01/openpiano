-- Public discussion ONLY for the built-in repertoire. Private songs remain private.
-- All access goes through bounded RPCs. Emails, owner IDs, votes and reports are
-- never exposed by the public feed. Run the catalog seed after this migration.
begin;
create table if not exists public.community_pieces (id text primary key);
create table if not exists public.community_posts (
 id uuid primary key default gen_random_uuid(),
 piece text not null references public.community_pieces(id),
 owner uuid not null references auth.users(id) on delete cascade,
 alias text not null check(char_length(alias) between 2 and 40),
 body text not null check(char_length(body) between 1 and 4000),
 kind text not null check(kind in ('comment','fingering')),
 bars text not null default '' check(char_length(bars)<=80),
 hand text not null default 'BH' check(hand in ('LH','RH','BH')),
 fingers text not null default '' check(char_length(fingers)<=1000),
 parent uuid references public.community_posts(id),
 created_at timestamptz not null default now(), edited_at timestamptz,
 hidden_at timestamptz, moderated_at timestamptz,
 check(kind='comment' or (char_length(bars)>0 and char_length(fingers)>0))
);
create table if not exists public.community_votes (
 post uuid references public.community_posts(id) on delete cascade,
 owner uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(post,owner)
);
create table if not exists public.community_reports (
 post uuid references public.community_posts(id) on delete cascade,
 owner uuid references auth.users(id) on delete cascade,
 reason text not null check(char_length(reason) between 1 and 500),
 created_at timestamptz not null default now(), primary key(post,owner)
);
alter table public.community_pieces enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_votes enable row level security;
alter table public.community_reports enable row level security;
revoke all on public.community_pieces, public.community_posts, public.community_votes, public.community_reports from public, anon, authenticated;
create index if not exists community_piece_date on public.community_posts(piece,created_at desc) where hidden_at is null and moderated_at is null;
create index if not exists community_owner_date on public.community_posts(owner,created_at desc);
create index if not exists community_parent on public.community_posts(parent);

-- Internal formatter has no public EXECUTE privilege.
create or replace function public.community_post_json(p public.community_posts)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'piece',p.piece,'alias',p.alias,'body',p.body,
 'kind',p.kind,'bars',p.bars,'hand',p.hand,'fingers',p.fingers,'parent',p.parent,
 'created_at',p.created_at,'edited_at',p.edited_at,'mine',p.owner=auth.uid(),
 'votes',(select count(*) from public.community_votes v where v.post=p.id),
 'voted',exists(select 1 from public.community_votes v where v.post=p.id and v.owner=auth.uid()));
$$;
revoke all on function public.community_post_json(public.community_posts) from public, anon, authenticated;

create or replace function public.community_list(p_piece text, p_sort text default 'best', p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with roots as (
 select p.*, (select count(*) from public.community_votes v where v.post=p.id) as votes
 from public.community_posts p where p.piece=p_piece and p.parent is null
 and p.hidden_at is null and p.moderated_at is null
 order by case when p_sort='best' then (select count(*) from public.community_votes v where v.post=p.id) else 0 end desc,
 p.created_at desc, p.id limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))
 ), entries as (
 select public.community_post_json(rp) || jsonb_build_object('replies',coalesce((
 select jsonb_agg(public.community_post_json(reply) order by reply.created_at,reply.id)
 from (select p.* from public.community_posts p where p.parent=r.id and p.hidden_at is null and p.moderated_at is null order by p.created_at,p.id limit 50) reply
 ),'[]'::jsonb)) as item, r.votes, r.created_at, r.id
 from roots r join public.community_posts rp on rp.id=r.id
 )
 select jsonb_build_object('posts',coalesce((select jsonb_agg(item order by case when p_sort='best' then votes else 0 end desc,created_at desc,id) from entries),'[]'::jsonb),
 'total',(select count(*) from public.community_posts p where p.piece=p_piece and p.parent is null and p.hidden_at is null and p.moderated_at is null));
$$;
revoke all on function public.community_list(text,text,integer) from public,anon,authenticated;
grant execute on function public.community_list(text,text,integer) to anon,authenticated;

create or replace function public.community_write(p_piece text, p_alias text, p_body text, p_kind text default 'comment', p_bars text default '', p_hand text default 'BH', p_fingers text default '', p_parent uuid default null, p_id uuid default null, p_publish boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result uuid; parent_row public.community_posts;
begin
 if u is null then raise exception 'Sign in to contribute'; end if;
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
  values(p_piece,u,btrim(p_alias),btrim(p_body),p_kind,btrim(p_bars),p_hand,btrim(p_fingers),p_parent) returning id into result;
 else
  update public.community_posts set alias=btrim(p_alias),body=btrim(p_body),bars=btrim(p_bars),hand=p_hand,fingers=btrim(p_fingers),edited_at=now()
  where id=p_id and owner=u and piece=p_piece and kind=p_kind and parent is not distinct from p_parent and hidden_at is null and moderated_at is null returning id into result;
  if result is null then raise exception 'Only the author can edit an available contribution'; end if;
 end if;
 return result;
end $$;
revoke all on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_write(text,text,text,text,text,text,text,uuid,uuid,boolean) to authenticated;

create or replace function public.community_vote(p_post uuid, p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to vote'; end if;
 if not exists(select 1 from public.community_posts where id=p_post and owner<>auth.uid() and hidden_at is null and moderated_at is null) then raise exception 'Vote on another learner’s available contribution'; end if;
 if p_on then insert into public.community_votes(post,owner) values(p_post,auth.uid()) on conflict do nothing;
 else delete from public.community_votes where post=p_post and owner=auth.uid(); end if;
end $$;
revoke all on function public.community_vote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_vote(uuid,boolean) to authenticated;

create or replace function public.community_hide(p_post uuid,p_hide boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 update public.community_posts set hidden_at=case when p_hide then now() else null end where id=p_post and owner=auth.uid() and moderated_at is null;
 if not found then raise exception 'Only the author can withdraw or restore this contribution'; end if;
end $$;
revoke all on function public.community_hide(uuid,boolean) from public,anon,authenticated;
grant execute on function public.community_hide(uuid,boolean) to authenticated;

create or replace function public.community_report(p_post uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report'; end if;
 perform pg_advisory_xact_lock(hashtextextended('community-report:'||auth.uid()::text,0));
 if (select count(*) from public.community_reports where owner=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Report limit reached; contact the maintainer'; end if;
 if not exists(select 1 from public.community_posts where id=p_post and hidden_at is null and moderated_at is null) then raise exception 'Contribution is unavailable'; end if;
 insert into public.community_reports(post,owner,reason) values(p_post,auth.uid(),btrim(p_reason)) on conflict(post,owner) do update set reason=excluded.reason;
end $$;
revoke all on function public.community_report(uuid,text) from public,anon,authenticated;
grant execute on function public.community_report(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
