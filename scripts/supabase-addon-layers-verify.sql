-- Checks for supabase-addon-layers.sql. Synthetic users and add-ons only; every row is rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000e1','layer-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000e2','layer-b@example.invalid'),
 ('00000000-0000-4000-8000-0000000000e3','layer-c@example.invalid');
insert into public.community_pieces(id) values('__layer_test__');
insert into public.community_profiles(owner,display_name) values
 ('00000000-0000-4000-8000-0000000000e1','Layer Learner A'),
 ('00000000-0000-4000-8000-0000000000e2','Layer Learner B');

set local role authenticated;
-- A: the draft is private, saved whole, and checked.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}',true);
do $$ declare me jsonb;blocked boolean:=false;begin
 me:=public.addon_save_draft('__layer_test__','[{"b":0,"m":76,"h":"RH","f":"5"},{"b":0.25,"m":75,"h":"RH","f":"4 – 3"},{"b":0.5,"m":76,"h":"RH","f":"","c":""},{"b":2,"m":45,"h":"LH","c":"Pedal here"}]');
 if jsonb_array_length(me->'draft')<>3 then raise exception 'Empty notes should be dropped: %',me->'draft';end if;
 if me->'draft'->1->>'f'<>'4-3' then raise exception 'Substitution not tidied: %',me->'draft'->1;end if;
 if me->'published' is not null and me->'published'<>'null'::jsonb then raise exception 'A new draft should not be published';end if;
 if public.addon_list('__layer_test__')->>'total'<>'0' then raise exception 'Draft exposed publicly';end if;
 if me::text like '%example.invalid%' or me::text like '%00000000-0000-4000-8000-0000000000e1%' then raise exception 'Identity exposed';end if;
 begin perform public.addon_save_draft('__layer_test__','[{"b":0,"m":76,"f":"6"}]');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Finger 6 accepted';end if;
 blocked:=false;begin perform public.addon_save_draft('__layer_test__','[{"b":0,"m":120,"f":"1"}]');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Out-of-piano pitch accepted';end if;
 blocked:=false;begin perform public.addon_save_draft('__layer_test__','[{"b":0,"m":76,"f":"1"},{"b":0,"m":76,"f":"2"}]');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Duplicate note accepted';end if;
 blocked:=false;begin perform public.addon_save_draft('__no_such_piece__','[]');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Add-on saved for a piece outside the library';end if;
 blocked:=false;begin perform * from public.community_addons;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Raw add-on table exposed';end if;
 -- Publishing copies the whole draft.
 me:=public.addon_publish('__layer_test__');
 if me->'published'<>me->'draft' then raise exception 'Publish did not copy the whole draft';end if;
 if public.addon_list('__layer_test__')->>'total'<>'1' then raise exception 'Published add-on not listed';end if;
 -- Later changes stay in the draft until the next publish.
 perform public.addon_save_draft('__layer_test__','[{"b":0,"m":76,"h":"RH","f":"4"}]');
 if jsonb_array_length(public.addon_list('__layer_test__')->'addons'->0->'notes')<>3 then raise exception 'Unpublished change leaked';end if;
 me:=public.addon_discard('__layer_test__');
 if me->'draft'<>me->'published' then raise exception 'Discard did not restore the published copy';end if;
 -- A comment about the whole piece needs no note and is public once confirmed.
 perform public.community_write('__layer_test__','','Which edition do you use?','comment','','BH','',null,null,true,null,null,'public');
 if public.community_list('__layer_test__')->>'total'<>'1' then raise exception 'Piece comment not listed';end if;
 blocked:=false;begin perform public.community_write('__layer_test__','','Unconfirmed','comment','','BH','',null,null,false,null,null,'public');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Public comment without confirmation accepted';end if;
 blocked:=false;begin perform public.community_write('__layer_test__','','Fingering 3','fingering','Bar 1','RH','3',null,null,true,null,null,'public');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Fingering without a note accepted';end if;
 blocked:=false;begin perform public.community_write('__layer_test__','','Half anchor','comment','','BH','',null,null,true,1,null,'public');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Beat without pitch accepted';end if;
end $$;

-- B: sees only the published copy, votes once for the add-on, cannot touch A's.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}',true);
do $$ declare l jsonb;id uuid;blocked boolean:=false;begin
 if public.addon_mine('__layer_test__') is not null then raise exception 'Another learner read A''s draft';end if;
 l:=public.addon_list('__layer_test__');id:=(l->'addons'->0->>'id')::uuid;
 if l->'addons'->0->>'author'<>'Layer Learner A' or (l->'addons'->0->>'mine')::boolean then raise exception 'Author shown wrongly: %',l;end if;
 if l::text like '%draft%' then raise exception 'Draft field exposed in the list';end if;
 perform public.addon_vote(id,true);perform public.addon_vote(id,true);
 if public.addon_list('__layer_test__')->'addons'->0->>'votes'<>'1' then raise exception 'One person counted more than once';end if;
 perform public.addon_unpublish('__layer_test__');
 if public.addon_list('__layer_test__')->>'total'<>'1' then raise exception 'Another learner unpublished A''s add-on';end if;
 perform public.addon_report(id,'Test report');
end $$;

-- A cannot vote for their own add-on; unpublishing takes it down but keeps the draft.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}',true);
do $$ declare id uuid:=(public.addon_list('__layer_test__')->'addons'->0->>'id')::uuid;me jsonb;blocked boolean:=false;begin
 begin perform public.addon_vote(id,true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Self-vote allowed';end if;
 me:=public.addon_unpublish('__layer_test__');
 if public.addon_list('__layer_test__')->>'total'<>'0' or jsonb_array_length(me->'draft')<>3 then raise exception 'Unpublish wrong: %',me;end if;
end $$;

-- C has no profile name yet.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}',true);
do $$ declare blocked boolean:=false;begin
 begin perform public.addon_save_draft('__layer_test__','[{"b":0,"m":60,"f":"1"}]');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Saved without a profile name';end if;
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare blocked boolean:=false;begin
 perform public.addon_list('__layer_test__');
 begin perform public.addon_mine('__layer_test__');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous caller reached addon_mine';end if;
 blocked:=false;begin perform public.addon_save_draft('__layer_test__','[]');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous caller reached addon_save_draft';end if;
 blocked:=false;begin perform * from public.community_addon_votes;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Raw votes exposed';end if;
end $$;

reset role;
select 'add-on layer checks passed' as result;
rollback;
