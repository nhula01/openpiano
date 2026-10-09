-- Synthetic rows exist only inside this transaction; no email is sent and no real data is changed.
begin;
insert into auth.users (id,email) values
 ('00000000-0000-4000-8000-0000000000a1','openpiano-test-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b2','openpiano-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
insert into public.progress(owner,data) values(auth.uid(),'{"test":true}');
insert into public.songs(owner,title,format,path) values(auth.uid(),'Temporary isolation check','musicxml',auth.uid()::text||'/test.musicxml');
do $$ begin
 if (select count(*) from public.progress)<>1 then raise exception 'Owner cannot read own progress';end if;
 update public.progress set data='{"test":true,"updated":true}' where owner=auth.uid();
 if not exists(select 1 from public.progress where data->>'updated'='true') then raise exception 'Owner update failed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.progress)<>0 or (select count(*) from public.songs)<>0 then raise exception 'Cross-account read leak';end if;
 update public.progress set data='{"leak":true}' where owner='00000000-0000-4000-8000-0000000000a1';
 if found then raise exception 'Cross-account update leak';end if;
 delete from public.songs where owner='00000000-0000-4000-8000-0000000000a1';
 if found then raise exception 'Cross-account delete leak';end if;
 begin
  insert into public.progress(owner,data) values('00000000-0000-4000-8000-0000000000a1','{}');
  raise exception 'Cross-account insert leak';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.songs(owner,title,format,path) values(auth.uid(),'Wrong folder','musicxml','00000000-0000-4000-8000-0000000000a1/leak.musicxml');
  raise exception 'Cross-account file path accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
do $$ begin
 delete from public.songs where owner=auth.uid();if not found then raise exception 'Owner cannot delete own songs';end if;
 delete from public.progress where owner=auth.uid();if not found then raise exception 'Owner cannot delete own progress';end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.progress;raise exception 'Anonymous progress access allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.songs;raise exception 'Anonymous song access allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: owner CRUD, cross-account isolation, private file paths, anonymous denial' as result;
rollback;
