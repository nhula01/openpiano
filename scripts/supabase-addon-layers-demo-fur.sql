-- Optional demo: three clearly labelled bot add-ons on Für Elise (opening bars), so the add-on
-- browser has something to compare. Run after supabase-addon-layers.sql. Safe to re-run.
-- The bot fingerings are examples written for this demo, not taken from a printed edition;
-- remove them with the statement at the end of this file when real add-ons arrive.
begin;

insert into public.community_bots(id,display_name,skills) values
 ('fingering-demo','OpenPiano Fingering Bot','Demo fingering suggestions'),
 ('alt-fingering-demo','OpenPiano Alternate Fingering Bot','Demo alternative fingering'),
 ('phrasing-demo','OpenPiano Phrasing Bot','Demo phrasing and pedal comments')
on conflict(id) do update set display_name=excluded.display_name,skills=excluded.skills;

insert into public.community_addons(id,piece,bot_id,draft,published,published_at)
select v.id,'fur',v.bot_id,public.community_addon_clean(v.notes),public.community_addon_clean(v.notes),v.at
from (values
 ('d2000000-0000-4000-8000-000000000001'::uuid,'fingering-demo',$$[{"b":0,"m":76,"h":"RH","f":"5"},{"b":0.25,"m":75,"h":"RH","f":"4"},{"b":0.5,"m":76,"h":"RH","f":"5"},{"b":0.75,"m":75,"h":"RH","f":"4"},{"b":1,"m":76,"h":"RH","f":"5"},{"b":1.25,"m":71,"h":"RH","f":"2"},{"b":1.5,"m":74,"h":"RH","f":"4"},{"b":1.75,"m":72,"h":"RH","f":"3"},{"b":2,"m":69,"h":"RH","f":"1"},{"b":2.75,"m":60,"h":"RH","f":"1"},{"b":3,"m":64,"h":"RH","f":"2"},{"b":3.25,"m":69,"h":"RH","f":"4"},{"b":3.5,"m":71,"h":"RH","f":"5"},{"b":4.25,"m":64,"h":"RH","f":"1"},{"b":4.5,"m":68,"h":"RH","f":"3"},{"b":4.75,"m":71,"h":"RH","f":"4"},{"b":5,"m":72,"h":"RH","f":"5"},{"b":2,"m":45,"h":"LH","f":"5"},{"b":2.25,"m":52,"h":"LH","f":"2"},{"b":2.5,"m":57,"h":"LH","f":"1"},{"b":3.5,"m":40,"h":"LH","f":"5"},{"b":3.75,"m":52,"h":"LH","f":"2"},{"b":4,"m":56,"h":"LH","f":"1"},{"b":5,"m":45,"h":"LH","f":"5"},{"b":5.25,"m":52,"h":"LH","f":"2"},{"b":5.5,"m":57,"h":"LH","f":"1"}]$$::jsonb,timestamptz '2026-10-09 15:00:00+00'),
 ('d2000000-0000-4000-8000-000000000002'::uuid,'alt-fingering-demo',$$[{"b":0,"m":76,"h":"RH","f":"4"},{"b":0.25,"m":75,"h":"RH","f":"3"},{"b":0.5,"m":76,"h":"RH","f":"4"},{"b":0.75,"m":75,"h":"RH","f":"3"},{"b":1,"m":76,"h":"RH","f":"4"},{"b":1.25,"m":71,"h":"RH","f":"1"},{"b":1.5,"m":74,"h":"RH","f":"3"},{"b":1.75,"m":72,"h":"RH","f":"2"},{"b":2,"m":69,"h":"RH","f":"1"}]$$::jsonb,timestamptz '2026-10-09 15:01:00+00'),
 ('d2000000-0000-4000-8000-000000000003'::uuid,'phrasing-demo',$$[{"b":0,"m":76,"h":"RH","c":"Keep the E–D♯ turn light and even, almost a whisper."},{"b":2,"m":69,"h":"RH","c":"Land on this A softly and let it ring with the left-hand broken chord."},{"b":3.5,"m":40,"h":"LH","c":"Change the pedal here, together with the bass note."},{"b":5,"m":72,"h":"RH","c":"Ease off at the end of the phrase before the theme returns."}]$$::jsonb,timestamptz '2026-10-09 15:02:00+00')
) as v(id,bot_id,notes,at)
on conflict(id) do update set draft=excluded.draft,published=excluded.published,published_at=excluded.published_at;

commit;

-- To remove the demo add-ons later:
-- delete from public.community_addons where id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000003');
