-- Synthetic accounts only. No mail, public sample comments or real profile edits.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a5','profile-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b6','profile-b@example.invalid');
insert into public.community_pieces(id) values('__profile_test__');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}',true);
do $$ declare p jsonb; id uuid; feed jsonb; begin
 p:=public.profile_save('Chosen name','Sight-reading','My original bio','Advanced',false);
 perform set_config('test.profile',p->>'id',true);
 if p->>'name'<>'Chosen name' or p->>'published'<>'false' then raise exception 'Own profile save failed';end if;
 if public.profile_public((p->>'id')::uuid) is not null then raise exception 'Private profile exposed';end if;
 id:=public.community_write('__profile_test__','Impersonated name','Original comment',p_publish=>true);
 perform set_config('test.profile_post',id::text,true);
 feed:=public.community_list('__profile_test__')->'posts'->0;
 if feed->>'alias'<>'Chosen name' or feed->>'profile' is not null then raise exception 'Name spoofing or private skills leak';end if;
 perform public.profile_save('Chosen name','Sight-reading','My original bio','Advanced',true);
 feed:=public.community_list('__profile_test__')->'posts'->0;
 if feed->'profile'->>'skills'<>'Sight-reading' then raise exception 'Public profile missing on comments';end if;
 if feed::text like '%example.invalid%' or feed::text like '%00000000-0000-4000-8000-0000000000a5%' then raise exception 'Private identity exposed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b6","role":"authenticated"}',true);
do $$ declare blocked boolean:=false; begin
 if public.profile_mine() is not null then raise exception 'Other owner profile leaked';end if;
 perform public.profile_save('Other learner','','','Beginner',false);
 if public.profile_mine()->>'name'<>'Other learner' then raise exception 'Owner profile isolation failed';end if;
 begin update public.community_profiles set display_name='Overwrite' where public_id=current_setting('test.profile')::uuid;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-owner profile write permitted';end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare blocked boolean:=false; p jsonb; begin
 p:=public.profile_public(current_setting('test.profile')::uuid);
 if p->>'name'<>'Chosen name' then raise exception 'Public profile unavailable';end if;
 if p::text like '%owner%' or p::text like '%example.invalid%' then raise exception 'Public identity leak';end if;
 begin perform public.profile_mine();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous own-profile read permitted';end if;
 blocked:=false;begin perform public.profile_save('Anon');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous profile write permitted';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}',true);
do $$ declare feed jsonb; begin
 perform public.profile_save('New private name','Private skills','Private bio','Learning',false);
 if public.profile_public(current_setting('test.profile')::uuid) is not null then raise exception 'Profile opt-out failed';end if;
 feed:=public.community_list('__profile_test__')->'posts'->0;
 if feed->>'profile' is not null or feed::text like '%Private skills%' or feed->>'alias'<>'Chosen name' then raise exception 'Private edit exposed through comments';end if;
end $$;
reset role;
select 'PASS: profile ownership, explicit public visibility, private field isolation, canonical comment names, anonymous denial and opt-out' as result;
rollback;
