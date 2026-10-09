-- Optional demo: three clearly labelled bot add-ons on Für Elise (opening bars), so the add-on
-- browser has something to compare. Run after supabase-note-addons.sql. Safe to re-run.
-- The bot fingerings are examples written for this demo, not taken from a printed edition;
-- remove them with the statement at the end of this file when real add-ons arrive.
begin;

insert into public.community_bots(id,display_name,skills) values
 ('fingering-demo','OpenPiano Fingering Bot','Demo fingering suggestions'),
 ('alt-fingering-demo','OpenPiano Alternate Fingering Bot','Demo alternative fingering'),
 ('phrasing-demo','OpenPiano Phrasing Bot','Demo phrasing and pedal comments')
on conflict(id) do update set display_name=excluded.display_name,skills=excluded.skills;

insert into public.community_posts(id,piece,owner,bot_id,alias,body,kind,bars,hand,fingers,visibility,note_beat,note_midi,note_label)
select v.id,'fur',null,v.bot_id,b.display_name,v.body,v.kind,
 'Bar '||(floor(v.beat/1.5)+1)::int||' · '||public.community_note_name(v.midi)||' · '||v.hand,
 v.hand,v.fingers,'public',v.beat,v.midi,public.community_note_name(v.midi)
from (values
 -- OpenPiano Fingering Bot: right hand
 ('d1000000-0000-4000-8000-000000000001'::uuid,'fingering-demo',0.00::numeric,76,'RH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000002'::uuid,'fingering-demo',0.25,75,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000003'::uuid,'fingering-demo',0.50,76,'RH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000004'::uuid,'fingering-demo',0.75,75,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000005'::uuid,'fingering-demo',1.00,76,'RH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000006'::uuid,'fingering-demo',1.25,71,'RH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000007'::uuid,'fingering-demo',1.50,74,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000008'::uuid,'fingering-demo',1.75,72,'RH','fingering','3','Fingering 3'),
 ('d1000000-0000-4000-8000-000000000009'::uuid,'fingering-demo',2.00,69,'RH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000010'::uuid,'fingering-demo',2.75,60,'RH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000011'::uuid,'fingering-demo',3.00,64,'RH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000012'::uuid,'fingering-demo',3.25,69,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000013'::uuid,'fingering-demo',3.50,71,'RH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000014'::uuid,'fingering-demo',4.25,64,'RH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000015'::uuid,'fingering-demo',4.50,68,'RH','fingering','3','Fingering 3'),
 ('d1000000-0000-4000-8000-000000000016'::uuid,'fingering-demo',4.75,71,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000017'::uuid,'fingering-demo',5.00,72,'RH','fingering','5','Fingering 5'),
 -- OpenPiano Fingering Bot: left hand
 ('d1000000-0000-4000-8000-000000000018'::uuid,'fingering-demo',2.00,45,'LH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000019'::uuid,'fingering-demo',2.25,52,'LH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000020'::uuid,'fingering-demo',2.50,57,'LH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000021'::uuid,'fingering-demo',3.50,40,'LH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000022'::uuid,'fingering-demo',3.75,52,'LH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000023'::uuid,'fingering-demo',4.00,56,'LH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000024'::uuid,'fingering-demo',5.00,45,'LH','fingering','5','Fingering 5'),
 ('d1000000-0000-4000-8000-000000000025'::uuid,'fingering-demo',5.25,52,'LH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000026'::uuid,'fingering-demo',5.50,57,'LH','fingering','1','Fingering 1'),
 -- OpenPiano Alternate Fingering Bot: the opening turn with 4–3
 ('d1000000-0000-4000-8000-000000000031'::uuid,'alt-fingering-demo',0.00,76,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000032'::uuid,'alt-fingering-demo',0.25,75,'RH','fingering','3','Fingering 3'),
 ('d1000000-0000-4000-8000-000000000033'::uuid,'alt-fingering-demo',0.50,76,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000034'::uuid,'alt-fingering-demo',0.75,75,'RH','fingering','3','Fingering 3'),
 ('d1000000-0000-4000-8000-000000000035'::uuid,'alt-fingering-demo',1.00,76,'RH','fingering','4','Fingering 4'),
 ('d1000000-0000-4000-8000-000000000036'::uuid,'alt-fingering-demo',1.25,71,'RH','fingering','1','Fingering 1'),
 ('d1000000-0000-4000-8000-000000000037'::uuid,'alt-fingering-demo',1.50,74,'RH','fingering','3','Fingering 3'),
 ('d1000000-0000-4000-8000-000000000038'::uuid,'alt-fingering-demo',1.75,72,'RH','fingering','2','Fingering 2'),
 ('d1000000-0000-4000-8000-000000000039'::uuid,'alt-fingering-demo',2.00,69,'RH','fingering','1','Fingering 1'),
 -- OpenPiano Phrasing Bot: comments
 ('d1000000-0000-4000-8000-000000000041'::uuid,'phrasing-demo',0.00,76,'RH','comment','','Keep the E–D♯ turn light and even, almost a whisper.'),
 ('d1000000-0000-4000-8000-000000000042'::uuid,'phrasing-demo',2.00,69,'RH','comment','','Land on this A softly and let it ring with the left-hand broken chord.'),
 ('d1000000-0000-4000-8000-000000000043'::uuid,'phrasing-demo',3.50,40,'LH','comment','','Change the pedal here, together with the bass note.'),
 ('d1000000-0000-4000-8000-000000000044'::uuid,'phrasing-demo',5.00,72,'RH','comment','','Ease off at the end of the phrase before the theme returns.')
) as v(id,bot_id,beat,midi,hand,kind,fingers,body)
join public.community_bots b on b.id=v.bot_id
where exists(select 1 from public.community_pieces where id='fur')
on conflict(id) do update set body=excluded.body,kind=excluded.kind,bars=excluded.bars,hand=excluded.hand,fingers=excluded.fingers,
 visibility='public',note_beat=excluded.note_beat,note_midi=excluded.note_midi,note_label=excluded.note_label,hidden_at=null,moderated_at=null;

notify pgrst,'reload schema';
commit;

-- To remove the demo later:
-- delete from public.community_posts where bot_id in ('fingering-demo','alt-fingering-demo','phrasing-demo');
