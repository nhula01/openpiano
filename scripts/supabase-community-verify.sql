-- Synthetic users/posts only; every row is rolled back, no emails or public posts.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a3','community-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b4','community-b@example.invalid');
insert into public.community_pieces(id) values('__community_test__');
insert into public.community_profiles(owner,display_name) values
 ('00000000-0000-4000-8000-0000000000a3','Learner A'),
 ('00000000-0000-4000-8000-0000000000b4','Learner B');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}',true);
do $$ declare id uuid; blocked boolean:=false; begin
 id:=public.community_write('__community_test__','Learner A','My original advice','fingering','bars 1–2','RH','C4(1), D4(2)',null,null,true);
 perform set_config('test.post',id::text,true);
 if public.community_list('__community_test__')->'posts'->0->>'mine'<>'true' then raise exception 'Own post flag missing';end if;
 begin perform public.community_vote(id,true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Self-vote accepted';end if;
 blocked:=false;begin perform public.community_write('private-score-id','Alias','Private score leak',p_publish=>true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Private score discussion accepted';end if;
 blocked:=false;begin perform public.community_write('__community_test__','Alias','No publication consent');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Publication consent not required';end if;
 blocked:=false;begin perform * from public.community_posts;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Raw ownership data exposed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}',true);
do $$ declare id uuid:=current_setting('test.post')::uuid; blocked boolean:=false; r uuid; payload jsonb; begin
 perform public.community_vote(id,true);perform public.community_vote(id,true);
 payload:=public.community_list('__community_test__');
 if payload->'posts'->0->>'votes'<>'1' or payload->'posts'->0->>'voted'<>'true' then raise exception 'Duplicate vote or own vote flag wrong';end if;
 if payload::text like '%owner%' or payload::text like '%example.invalid%' then raise exception 'Private identity exposed';end if;
 begin perform public.community_write('__community_test__','Imposter','Changed','fingering','1','RH','1',null,id,true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Cross-author edit allowed';end if;
 blocked:=false;begin perform public.community_hide(id,true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Cross-author withdrawal allowed';end if;
 r:=public.community_write('__community_test__','Learner B','Helpful reply',p_parent=>id,p_publish=>true);
 blocked:=false;begin perform public.community_write('__community_test__','Learner B','Nested reply',p_parent=>r,p_publish=>true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Nested parent accepted';end if;
 perform public.community_report(id,'Private report test');
 if jsonb_array_length(public.community_list('__community_test__')->'posts'->0->'replies')<>1 then raise exception 'Reply missing';end if;
 perform public.community_vote(id,false);
 if public.community_list('__community_test__')->'posts'->0->>'votes'<>'0' then raise exception 'Vote undo failed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}',true);
do $$ declare id uuid:=current_setting('test.post')::uuid; blocked boolean:=false; begin
 perform public.community_write('__community_test__','Learner A','Edited explanation','fingering','1–2','RH','C4(1)',null,id,true);
 if public.community_list('__community_test__')->'posts'->0->>'edited_at' is null then raise exception 'Edit timestamp missing';end if;
 perform public.community_hide(id,true);
 if public.community_list('__community_test__')->>'total'<>'0' then raise exception 'Withdrawn post exposed';end if;
 perform public.community_hide(id,false);
 if public.community_list('__community_test__')->>'total'<>'1' then raise exception 'Restore failed';end if;
 for i in 1..9 loop perform public.community_write('__community_test__','Learner A','Temporary rate limit check',p_publish=>true);end loop;
 begin perform public.community_write('__community_test__','Learner A','Over quota',p_publish=>true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Rate limit not enforced';end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare blocked boolean:=false; begin
 if public.community_list('__community_test__')->>'total'<>'10' then raise exception 'Public reading failed';end if;
 begin perform public.community_write('__community_test__','Anon','Should fail',p_publish=>true);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous posting allowed';end if;
 blocked:=false;begin perform * from public.community_reports;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Private reports exposed';end if;
 blocked:=false;begin perform * from public.songs;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Private songs exposed';end if;
end $$;
reset role;
select 'PASS: public read, private identities/reports, author-only edits, consent, vote uniqueness/undo, replies, withdrawal/restore, rate limits, private-song isolation' as result;
rollback;
