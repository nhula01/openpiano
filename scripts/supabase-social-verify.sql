-- Run after supabase-social.sql. Checks the community rules with synthetic users inside one
-- transaction and rolls everything back.
-- A, B, R1, R2 are adult members; T is a 13-17 member; N has a profile but has not joined.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id::uuid,'authenticated','authenticated',email,'',now(),now()-interval '3 days',now()
from (values
 ('71000000-0000-4000-8000-00000000000a','social-a@example.test'),
 ('71000000-0000-4000-8000-00000000000b','social-b@example.test'),
 ('71000000-0000-4000-8000-00000000000c','social-r1@example.test'),
 ('71000000-0000-4000-8000-00000000000d','social-r2@example.test'),
 ('71000000-0000-4000-8000-00000000000e','social-t@example.test'),
 ('71000000-0000-4000-8000-00000000000f','social-n@example.test')) u(id,email);
insert into public.community_profiles(owner,public_id,display_name,published) values
 ('71000000-0000-4000-8000-00000000000a','81000000-0000-4000-8000-00000000000a','Ada Social',false),
 ('71000000-0000-4000-8000-00000000000b','81000000-0000-4000-8000-00000000000b','Ben Social',false),
 ('71000000-0000-4000-8000-00000000000c','81000000-0000-4000-8000-00000000000c','Rae One',false),
 ('71000000-0000-4000-8000-00000000000d','81000000-0000-4000-8000-00000000000d','Rae Two',false),
 ('71000000-0000-4000-8000-00000000000e','81000000-0000-4000-8000-00000000000e','Tess Teen',false),
 ('71000000-0000-4000-8000-00000000000f','81000000-0000-4000-8000-00000000000f','Nia Private',false);
insert into public.community_pieces(id) values('social-verify-piece') on conflict do nothing;

create temporary table ids(k text primary key,v uuid);
grant all on ids to anon,authenticated;
create or replace function pg_temp.as_user(k text) returns void language plpgsql as $$
begin
 if k is null then
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
 else
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub','71000000-0000-4000-8000-00000000000'||k,'role','authenticated')::text,true);
 end if;
end $$;
create or replace function pg_temp.fails(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

-- Not a member yet: no posting, no following.
select pg_temp.as_user('a');
do $$begin
 if not pg_temp.fails($q$select public.social_post_save(null,'post','Hello')$q$) then raise exception 'Non-member could post';end if;
 if not pg_temp.fails($q$select public.social_join('child')$q$) then raise exception 'Invalid age group accepted';end if;
end $$;
-- Joining publishes the profile and sets age-appropriate defaults.
do $$declare me jsonb;begin
 me:=public.social_join('adult');
 if not (me->>'active')::boolean or me->'member'->>'default_visibility'<>'public' or (me->'member'->>'approve_follows')::boolean then raise exception 'Adult defaults wrong: %',me;end if;
end $$;
select pg_temp.as_user('b');select public.social_join('adult');
select pg_temp.as_user('c');select public.social_join('adult');
select pg_temp.as_user('d');select public.social_join('adult');
select pg_temp.as_user('e');
do $$declare me jsonb;begin
 me:=public.social_join('teen');
 if me->'member'->>'default_visibility'<>'friends' or not (me->'member'->>'approve_follows')::boolean then raise exception 'Teen defaults wrong: %',me;end if;
 if not pg_temp.fails($q$select public.social_settings_save('teen',false,'friends')$q$) and
    not (public.social_me()->'member'->>'approve_follows')::boolean then raise exception 'Teen turned off follow approval';end if;
end $$;

-- Posts and visibility.
select pg_temp.as_user('a');
do $$declare p jsonb;begin
 p:=public.social_post_save(null,'post','Public hello','social-verify-piece','Verify piece');
 insert into ids values('a_public',(p->>'id')::uuid);
 if p->>'visibility'<>'public' then raise exception 'Default visibility not applied';end if;
 p:=public.social_post_save(null,'post','Friends only','social-verify-piece','',  'friends');insert into ids values('a_friends',(p->>'id')::uuid);
 p:=public.social_post_save(null,'post','Just me',null,'My own song','private');insert into ids values('a_private',(p->>'id')::uuid);
 p:=public.social_post_save(null,'progress','',null,'',null,null,null,null,'{"accuracy":97.4,"bpm":96,"hands":"BH","evil":"x","correct":-5}');
 if p->'stats'<>'{"accuracy":97,"bpm":96,"hands":"BH"}'::jsonb then raise exception 'Stats not cleaned: %',p->'stats';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'post','   ')$q$) then raise exception 'Empty post accepted';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'post','x','not-a-library-piece')$q$) then raise exception 'Unknown piece accepted';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'video','No file',null,'',null,'81000000-0000-4000-8000-00000000000a/91000000-0000-4000-8000-000000000001.mp4',null,10)$q$) then raise exception 'Video without upload accepted';end if;
end $$;

select pg_temp.as_user(null);
do $$declare f jsonb;begin
 f:=public.social_feed('discover');
 if not f @> jsonb_build_array(jsonb_build_object('id',(select v from ids where k='a_public'))) then raise exception 'Public post missing for visitors';end if;
 if f @> jsonb_build_array(jsonb_build_object('id',(select v from ids where k='a_friends'))) or
    f @> jsonb_build_array(jsonb_build_object('id',(select v from ids where k='a_private'))) then raise exception 'Visitor saw a non-public post';end if;
 if public.social_post((select v from ids where k='a_friends')) is not null then raise exception 'Visitor opened a friends post';end if;
 if f::text like '%71000000-%' or f::text like '%example.test%' then raise exception 'Feed leaked account ids or emails';end if;
 if not pg_temp.fails($q$select public.social_like((select v from ids where k='a_public'),true)$q$) then raise exception 'Visitor could like';end if;
end $$;

-- B follows A (one way): still not friends, so the friends post stays hidden.
select pg_temp.as_user('b');
do $$declare r jsonb;begin
 r:=public.social_follow('81000000-0000-4000-8000-00000000000a',true);
 if r->>'following'<>'active' or (r->>'friends')::boolean then raise exception 'Follow state wrong: %',r;end if;
 if public.social_post((select v from ids where k='a_friends')) is not null then raise exception 'One-way follower saw friends post';end if;
 if not public.social_feed('following') @> jsonb_build_array(jsonb_build_object('id',(select v from ids where k='a_public'))) then raise exception 'Following feed missing post';end if;
end $$;
-- A follows back: friends.
select pg_temp.as_user('a');select public.social_follow('81000000-0000-4000-8000-00000000000b',true);
select pg_temp.as_user('b');
do $$begin
 if public.social_post((select v from ids where k='a_friends')) is null then raise exception 'Friend cannot see friends post';end if;
 if public.social_post((select v from ids where k='a_private')) is not null then raise exception 'Friend saw an only-me post';end if;
 if not (public.social_profile('81000000-0000-4000-8000-00000000000a')->'relation'->>'friends')::boolean then raise exception 'Profile does not show friendship';end if;
 perform public.social_like((select v from ids where k='a_public'),true);
 perform public.social_comment((select v from ids where k='a_public'),'Lovely phrasing!');
end $$;
-- Everything in this transaction shares one now(); start A's "last seen" a minute earlier.
reset role;update public.social_members set activity_seen_at=now()-interval '1 minute';
select pg_temp.as_user('a');
do $$declare act jsonb;begin
 act:=public.social_activity();
 if (act->>'unread')::int<3 then raise exception 'Activity should show follow, like and comment: %',act;end if;
 perform public.social_activity_seen();
 if (public.social_activity()->>'unread')::int<>0 then raise exception 'Activity not marked seen';end if;
 if (public.social_post((select v from ids where k='a_public'))->>'likes')::int<>1 then raise exception 'Like not counted';end if;
end $$;

-- Teen protections.
select pg_temp.as_user('b');
do $$declare r jsonb;begin
 r:=public.social_follow('81000000-0000-4000-8000-00000000000e',true);
 if r->>'following'<>'pending' then raise exception 'Follow of a teen did not need approval: %',r;end if;
end $$;
select pg_temp.as_user('e');
do $$declare p jsonb;begin
 p:=public.social_post_save(null,'post','Teen public text',null,'','public');insert into ids values('t_public',(p->>'id')::uuid);
 if jsonb_array_length(public.social_people('81000000-0000-4000-8000-00000000000e','requests'))<>1 then raise exception 'Teen cannot see request';end if;
end $$;
select pg_temp.as_user('b');
do $$declare p jsonb;begin
 p:=public.social_post((select v from ids where k='t_public'));
 if p is null then raise exception 'Public teen text post hidden';end if;
 if (p->>'can_comment')::boolean then raise exception 'Non-friend may comment on a teen post';end if;
 if not pg_temp.fails($q$select public.social_comment((select v from ids where k='t_public'),'hi')$q$) then raise exception 'Non-friend commented on a teen post';end if;
 if not pg_temp.fails($q$select public.social_people('81000000-0000-4000-8000-00000000000e','followers')$q$) then raise exception 'Stranger saw a teen follower list';end if;
end $$;
select pg_temp.as_user('a');
do $$begin
 if public.social_suggest()::text like '%Tess Teen%' then raise exception 'Teen suggested to an adult stranger';end if;
end $$;

-- Photos and YouTube-linked performances (the free tier). Video uploads are off by default.
select pg_temp.as_user('a');
do $$declare p jsonb;begin
 if not pg_temp.fails($q$insert into storage.objects(bucket_id,name,owner) values('social-media','81000000-0000-4000-8000-00000000000a/94000000-0000-4000-8000-000000000001.mp4','71000000-0000-4000-8000-00000000000a')$q$) then raise exception 'Video upload allowed while video uploads are off';end if;
 insert into storage.objects(bucket_id,name,owner,metadata) values('social-media','81000000-0000-4000-8000-00000000000a/95000000-0000-4000-8000-000000000001.jpg','71000000-0000-4000-8000-00000000000a','{"size":2000}');
 p:=public.social_post_save(null,'post','',null,'',null,null,null,null,null,'81000000-0000-4000-8000-00000000000a/95000000-0000-4000-8000-000000000001.jpg');
 insert into ids values('a_photo',(p->>'id')::uuid);
 if p->>'image_path' is null then raise exception 'Photo not saved: %',p;end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'post','again',null,'',null,null,null,null,null,'81000000-0000-4000-8000-00000000000a/95000000-0000-4000-8000-000000000001.jpg')$q$) then raise exception 'Photo reused';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'post','x',null,'',null,null,null,null,null,'81000000-0000-4000-8000-00000000000b/95000000-0000-4000-8000-000000000002.jpg')$q$) then raise exception 'Another member''s photo accepted';end if;
 p:=public.social_post_save(null,'post','My recital','social-verify-piece','',null,null,null,null,null,null,'dQw4w9WgXcQ',42);
 insert into ids values('a_yt',(p->>'id')::uuid);
 if p->>'youtube_id'<>'dQw4w9WgXcQ' or (p->>'youtube_start')::int<>42 then raise exception 'YouTube link not saved: %',p;end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'post','bad',null,'',null,null,null,null,null,null,'not a video id')$q$) then raise exception 'Bad YouTube id accepted';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'video','v',null,'',null,'81000000-0000-4000-8000-00000000000a/96000000-0000-4000-8000-000000000001.mp4',null,10)$q$) then raise exception 'Video post allowed while video uploads are off';end if;
end $$;
select pg_temp.as_user(null);
do $$begin
 if not public.social_media_visible('81000000-0000-4000-8000-00000000000a/95000000-0000-4000-8000-000000000001.jpg') then raise exception 'Public photo not readable';end if;
 if not public.social_feed('reels')::text like '%dQw4w9WgXcQ%' then raise exception 'YouTube performance missing from reels';end if;
end $$;
select pg_temp.as_user('e');
do $$declare p jsonb;begin
 p:=public.social_post_save(null,'post','My first performance!',null,'','public',null,null,null,null,null,'abcdefghijk');
 if p->>'visibility'<>'friends' then raise exception 'Teen YouTube link not capped to friends';end if;
end $$;
select pg_temp.as_user(null);
do $$begin if public.social_feed('reels')::text like '%abcdefghijk%' then raise exception 'Teen performance in public reels';end if;end $$;

-- Videos (when switched on): storage paths, teen cap, visibility of files.
reset role;update public.social_config set video_uploads=true;
select pg_temp.as_user('e');
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('social-media','81000000-0000-4000-8000-00000000000e/91000000-0000-4000-8000-00000000000e.mp4','71000000-0000-4000-8000-00000000000e','{"size":1000}'),
 ('social-media','81000000-0000-4000-8000-00000000000e/92000000-0000-4000-8000-00000000000e.jpg','71000000-0000-4000-8000-00000000000e','{"size":100}');
do $$declare p jsonb;begin
 if not pg_temp.fails($q$insert into storage.objects(bucket_id,name,owner) values('social-media','81000000-0000-4000-8000-00000000000a/93000000-0000-4000-8000-000000000001.mp4','71000000-0000-4000-8000-00000000000e')$q$) then raise exception 'Uploaded into another member''s folder';end if;
 p:=public.social_post_save(null,'video','My first reel',null,'','public','81000000-0000-4000-8000-00000000000e/91000000-0000-4000-8000-00000000000e.mp4','81000000-0000-4000-8000-00000000000e/92000000-0000-4000-8000-00000000000e.jpg',30);
 insert into ids values('t_video',(p->>'id')::uuid);
 if p->>'visibility'<>'friends' then raise exception 'Teen video was not capped to friends: %',p->>'visibility';end if;
 if not pg_temp.fails($q$select public.social_post_save(null,'video','again',null,'','public','81000000-0000-4000-8000-00000000000e/91000000-0000-4000-8000-00000000000e.mp4',null,30)$q$) then raise exception 'Same video posted twice';end if;
end $$;
select pg_temp.as_user(null);
do $$begin
 if public.social_media_visible('81000000-0000-4000-8000-00000000000e/91000000-0000-4000-8000-00000000000e.mp4') then raise exception 'Visitor can read a teen video';end if;
 if public.social_feed('reels')::text like '%My first reel%' then raise exception 'Teen video in public reels';end if;
 if (select count(*) from storage.objects where bucket_id='social-media' and name like '81000000-0000-4000-8000-00000000000e/%')<>0 then raise exception 'Storage policy let a visitor list teen files';end if;
end $$;

select pg_temp.as_user('a');
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('social-media','81000000-0000-4000-8000-00000000000a/91000000-0000-4000-8000-00000000000a.mp4','71000000-0000-4000-8000-00000000000a','{"size":1000}');
do $$declare p jsonb;begin
 p:=public.social_post_save(null,'video','Adult reel','social-verify-piece','','public','81000000-0000-4000-8000-00000000000a/91000000-0000-4000-8000-00000000000a.mp4',null,12.34);
 insert into ids values('a_video',(p->>'id')::uuid);
 if p->>'visibility'<>'public' or (p->>'video_seconds')::numeric<>12.3 then raise exception 'Adult video saved wrong: %',p;end if;
end $$;
select pg_temp.as_user(null);
do $$begin
 if not public.social_media_visible('81000000-0000-4000-8000-00000000000a/91000000-0000-4000-8000-00000000000a.mp4') then raise exception 'Public video file not readable';end if;
 if not public.social_feed('reels')::text like '%Adult reel%' then raise exception 'Public video missing from reels';end if;
 if not public.social_feed('piece',null,'social-verify-piece')::text like '%Adult reel%' then raise exception 'Piece feed missing video';end if;
end $$;

-- Reports: three established accounts hide a video until review.
reset role;update public.social_members set joined_at=now()-interval '3 days';
select pg_temp.as_user('b');select public.social_report('post',(select v from ids where k='a_video'),'Not a piano video');
select pg_temp.as_user('c');select public.social_report('post',(select v from ids where k='a_video'),'Spam');
select pg_temp.as_user(null);
do $$begin if public.social_post((select v from ids where k='a_video')) is null then raise exception 'Video hidden too early';end if;end $$;
select pg_temp.as_user('d');select public.social_report('post',(select v from ids where k='a_video'),'Spam');
select pg_temp.as_user(null);
do $$begin
 if public.social_post((select v from ids where k='a_video')) is not null then raise exception 'Reported video still public';end if;
 if public.social_media_visible('81000000-0000-4000-8000-00000000000a/91000000-0000-4000-8000-00000000000a.mp4') then raise exception 'Hidden video file still readable';end if;
end $$;

-- Blocking hides both ways and removes follows.
select pg_temp.as_user('a');
do $$begin
 perform public.social_block('81000000-0000-4000-8000-00000000000b',true);
 if public.social_profile('81000000-0000-4000-8000-00000000000b') is not null then raise exception 'Blocker still sees profile';end if;
end $$;
select pg_temp.as_user('b');
do $$begin
 if public.social_post((select v from ids where k='a_public')) is not null then raise exception 'Blocked person sees post';end if;
 if public.social_feed('following')::text like '%Public hello%' then raise exception 'Blocked person still follows';end if;
 if not pg_temp.fails($q$select public.social_follow('81000000-0000-4000-8000-00000000000a',true)$q$) then raise exception 'Blocked person could follow';end if;
end $$;

-- Unpublishing a profile hides that member's posts from everyone else.
select pg_temp.as_user('c');
do $$begin if public.social_post((select v from ids where k='a_public')) is null then raise exception 'Setup: post should be visible';end if;end $$;
reset role;
update public.community_profiles set published=false where owner='71000000-0000-4000-8000-00000000000a';
select pg_temp.as_user('c');
do $$begin if public.social_post((select v from ids where k='a_public')) is not null then raise exception 'Private profile post still visible';end if;end $$;

-- Working on: library ids validated, max 12, no duplicates.
select pg_temp.as_user('c');
do $$declare w jsonb;begin
 w:=public.social_working_on_save('[{"piece":"social-verify-piece","title":"Verify piece","status":"polishing"},{"piece":"social-verify-piece","title":"dup"},{"piece":"nope","title":"My own song"}]');
 if jsonb_array_length(w)<>2 or w->1->>'piece' is not null then raise exception 'Working-on list wrong: %',w;end if;
 if not pg_temp.fails($q$select public.social_working_on_save((select jsonb_agg(jsonb_build_object('title','x'||g)) from generate_series(1,13) g))$q$) then raise exception '13 pieces accepted';end if;
 if not pg_temp.fails($q$select public.social_working_on_save('[{"title":"x","status":"bored"}]')$q$) then raise exception 'Bad status accepted';end if;
end $$;

-- Leaving removes everything and returns the media to delete.
select pg_temp.as_user('e');
do $$declare r jsonb;begin
 r:=public.social_leave();
 if jsonb_array_length(r->'media')<>2 then raise exception 'Leave did not return media: %',r;end if;
 if public.social_me()->'member' <> 'null'::jsonb then raise exception 'Membership not removed';end if;
end $$;


-- Review fixes: age group never revealed, teens not searchable by adults, details friends-only,
-- limits survive deleting, reported posts kept for review.
reset role;update public.social_config set video_uploads=false;
select pg_temp.as_user('e');select public.social_join('teen');
reset role;update public.community_profiles set bio='Private teen bio' where owner='71000000-0000-4000-8000-00000000000e';
select pg_temp.as_user(null);
do $$declare r jsonb;begin
 r:=public.social_profile('81000000-0000-4000-8000-00000000000e');
 if r is null or ((r->'relation'->>'approval')::boolean is distinct from true or r->>'bio'<>'' or r->>'avatar_path' is not null or jsonb_array_length(r->'working_on')<>0 or (r->>'lists_visible')::boolean) then raise exception 'Teen profile details visible to a visitor: %',r;end if;
 if public.social_search('Tess')::text like '%Tess%' then raise exception 'Visitor found a teen in search';end if;
 if (public.social_profile('81000000-0000-4000-8000-00000000000c')->>'lists_visible')::boolean then raise exception 'Visitor sees follower lists';end if;
end $$;
select pg_temp.as_user('c');
do $$begin
 if public.social_search('Tess')::text like '%Tess%' then raise exception 'Adult stranger found a teen in search';end if;
 if not pg_temp.fails($q$select public.social_people('81000000-0000-4000-8000-00000000000d','followers')$q$) then raise exception 'Non-friend saw an adult follower list';end if;
end $$;
-- follow cooldown survives unfollowing
select pg_temp.as_user('c');
do $$begin
 perform public.social_follow('81000000-0000-4000-8000-00000000000d',true);
 perform public.social_follow('81000000-0000-4000-8000-00000000000d',false);
 perform public.social_follow('81000000-0000-4000-8000-00000000000d',true);
 perform public.social_follow('81000000-0000-4000-8000-00000000000d',false);
 if not pg_temp.fails($q$select public.social_follow('81000000-0000-4000-8000-00000000000d',true)$q$) then raise exception 'Follow/unfollow cycling not limited';end if;
end $$;
-- a reported post deleted by its author is kept (hidden) with its file
select pg_temp.as_user('d');
insert into storage.objects(bucket_id,name,owner,metadata) values('social-media','81000000-0000-4000-8000-00000000000d/97000000-0000-4000-8000-000000000001.jpg','71000000-0000-4000-8000-00000000000d','{"size":100}');
do $$declare p jsonb;begin
 p:=public.social_post_save(null,'post','Reported photo',null,'','public',null,null,null,null,'81000000-0000-4000-8000-00000000000d/97000000-0000-4000-8000-000000000001.jpg');
 insert into ids values('d_photo',(p->>'id')::uuid);
end $$;
select pg_temp.as_user('c');select public.social_report('post',(select v from ids where k='d_photo'),'Not OK');
select pg_temp.as_user('d');
do $$declare r jsonb;begin
 r:=public.social_post_delete((select v from ids where k='d_photo'));
 if jsonb_array_length(r->'media')<>0 then raise exception 'Reported post media handed out for deletion';end if;
 if public.social_post((select v from ids where k='d_photo')) is not null then raise exception 'Deleted post still visible';end if;
 delete from storage.objects where bucket_id='social-media' and name='81000000-0000-4000-8000-00000000000d/97000000-0000-4000-8000-000000000001.jpg';
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.social_posts where id=(select v from ids where k='d_photo') and deleted_at is not null) then raise exception 'Reported post not kept for review';end if;
 if not exists(select 1 from storage.objects where name='81000000-0000-4000-8000-00000000000d/97000000-0000-4000-8000-000000000001.jpg') then raise exception 'Reported post photo deleted';end if;
 if (select count(*) from public.social_events where kind='upload')<1 then raise exception 'Uploads not logged';end if;
end $$;

-- No direct table access.
select pg_temp.as_user('c');
do $$begin
 if not pg_temp.fails('select * from public.social_posts') or not pg_temp.fails('select * from public.social_follows')
  or not pg_temp.fails('select * from public.social_reports') then raise exception 'Direct table access allowed';end if;
end $$;
reset role;
rollback;
