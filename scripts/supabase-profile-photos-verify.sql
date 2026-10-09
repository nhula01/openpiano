-- Run after supabase-profile-photos.sql. Synthetic users and rows are rolled back.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','31000000-0000-4000-8000-000000000001','authenticated','authenticated','photo-a@example.test','',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','31000000-0000-4000-8000-000000000002','authenticated','authenticated','photo-b@example.test','',now(),now(),now());
insert into public.community_profiles(owner,public_id,display_name)
values
 ('31000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Photo A'),
 ('31000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','Photo B');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.profile_save('Photo A','Piano','','Beginner',false,'41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg');
do $$declare p jsonb;blocked boolean:=false;begin
 p:=public.profile_mine();
 if p->>'avatar_path'<>'41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg' then raise exception 'Owner picture was not saved';end if;
 if not public.profile_avatar_visible(p->>'avatar_path') then raise exception 'Owner cannot read a private picture';end if;
 if not public.profile_avatar_owned(p->>'avatar_path') or not public.profile_avatar_upload_allowed(p->>'avatar_path') then raise exception 'Owner cannot manage a valid picture path';end if;
 if public.profile_avatar_owned('41000000-0000-4000-8000-000000000002/51000000-0000-4000-8000-000000000002.png') then raise exception 'Another profile folder was accepted';end if;
 begin perform public.profile_save('Photo A','','','Learning',false,'41000000-0000-4000-8000-000000000002/51000000-0000-4000-8000-000000000002.png');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Another owner path was accepted';end if;
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$declare path text:='41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg';begin
 if public.profile_avatar_visible(path) then raise exception 'Private profile picture is publicly readable';end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.profile_save('Photo A','Piano','','Beginner',true,'41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$declare p jsonb;path text:='41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg';begin
 p:=public.profile_public('41000000-0000-4000-8000-000000000001');
 if p->>'avatar_path'<>path or not public.profile_avatar_visible(path) then raise exception 'Published profile picture is not publicly available';end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.profile_save('Photo A','Piano','','Beginner',false,null);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 if public.profile_avatar_visible('41000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001.jpg') then raise exception 'Removed picture remained public';end if;
end $$;
reset role;
select 'PASS: owner-only upload paths, private pictures, explicit publication and removal' as result;
rollback;
