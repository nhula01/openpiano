-- Synthetic users and add-ons only; every row is rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000c5','addon-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000d6','addon-b@example.invalid');
insert into public.community_pieces(id) values('__addon_test__');
insert into public.community_profiles(owner,display_name) values
 ('00000000-0000-4000-8000-0000000000c5','Addon Learner A'),
 ('00000000-0000-4000-8000-0000000000d6','Addon Learner B');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated"}',true);
do $$ declare id uuid;payload jsonb;blocked boolean:=false;begin
 id:=public.community_write('__addon_test__','','Private note','comment','Bar 1 · C4 · RH','RH','',null,null,false,0,60,'private');
 perform set_config('test.addon',id::text,true);
 if public.community_list('__addon_test__')->>'total'<>'0' then raise exception 'Private add-on exposed publicly';end if;
 payload:=public.community_mine('__addon_test__');
 if jsonb_array_length(payload->'posts')<>1 or payload->'posts'->0->>'visibility'<>'private' then raise exception 'Owner cannot read private add-on';end if;
 if payload::text like '%owner%' or payload::text like '%example.invalid%' then raise exception 'Private identity exposed';end if;
 if payload->'posts'->0->>'note_label'<>'C4' then raise exception 'Server note label missing';end if;
 begin perform public.community_write('__addon_test__','','Bad pitch','comment','bad','RH','',null,null,false,0,109,'private');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Out-of-piano pitch accepted';end if;
 blocked:=false;begin perform * from public.community_addon_saves;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Raw saved add-ons exposed';end if;
 perform public.community_reveal(id,true);
 if public.community_list('__addon_test__')->>'total'<>'1' then raise exception 'Reveal did not publish add-on';end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d6","role":"authenticated"}',true);
do $$ declare id uuid:=current_setting('test.addon')::uuid;payload jsonb;blocked boolean:=false;begin
 if jsonb_array_length(public.community_mine('__addon_test__')->'posts')<>0 then raise exception 'Another owner read private list';end if;
 perform public.community_save_addon(id,true);
 payload:=public.community_mine('__addon_test__');
 if jsonb_array_length(payload->'saved')<>1 or payload->'saved'->0->>'source_alias'<>'Addon Learner A' then raise exception 'Attributed copy missing';end if;
 begin perform public.community_reveal(id,false);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Cross-owner visibility change allowed';end if;
 perform public.community_vote(id,true);
 if public.community_list('__addon_test__')->'posts'->0->>'votes'<>'1' then raise exception 'Vote missing';end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated"}',true);
select public.community_reveal(current_setting('test.addon')::uuid,false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d6","role":"authenticated"}',true);
do $$ declare payload jsonb;blocked boolean:=false;begin
 if public.community_list('__addon_test__')->>'total'<>'0' then raise exception 'Private add-on remained public';end if;
 payload:=public.community_mine('__addon_test__');
 if jsonb_array_length(payload->'saved')<>1 or payload->'saved'->0->>'body'<>'Private note' then raise exception 'Saved snapshot disappeared with source visibility';end if;
 begin perform public.community_save_addon('d0000000-0000-4000-8000-000000000001',true);exception when others then blocked:=true;end;
 -- The live demo post may not exist on a clean verification database; either result is safe.
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare blocked boolean:=false;begin
 if public.community_list('__addon_test__')->>'total'<>'0' then raise exception 'Anonymous reader saw private add-on';end if;
 begin perform public.community_mine('__addon_test__');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous caller reached private add-on RPC';end if;
 blocked:=false;begin perform * from public.community_bots;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Raw bot table exposed';end if;
end $$;
reset role;
select 'PASS: private-by-default note anchors, explicit reveal, attributed private copies, owner isolation, validation and revoked tables' as result;
rollback;
