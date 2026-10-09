# Repertoire community

Built-in library pieces have note-specific add-ons in their lesson page and beneath
the practice score. Click an engraved note to attach a private comment or personal
fingering. The owner can later reveal that add-on; public add-ons can be read without
an account, while saving, replying, voting and reporting require sign-in. Each
contribution uses the name saved in the author’s music profile, never the account email or
Google profile. The server derives the name from the signed-in account; clients cannot
choose a different author name for each comment. Display names and claimed qualifications are not verified.

New root add-ons are private by default. Reveal is a separate owner-only action.
The note beat, MIDI pitch, server-calculated note name and hand locate the advice in
the built-in score. Learners enter any fingering numbers themselves; the site never
generates them. Add-ons do not replace printed source fingering or claim teacher verification.
Most helpful sorts by unique upvotes, then newest. Authors cannot vote for themselves.
Newest is also available. Threads support 50 replies; the feed paginates 20 roots.

Add to mine stores an attributed snapshot in the signed-in account. It remains
available if the source author later makes the add-on private; removing the copy
does not change the source. Authors may edit, remove, reveal or make their root
add-ons private again. Replies are public because they belong to a public thread.
A moderator's hide cannot be undone by an author. Withdrawn/hidden content stays
in the database for moderation.

## Deployment

Run `scripts/supabase-community.sql`, `scripts/supabase-community-catalog.sql`,
`scripts/supabase-profiles.sql`, the profile-photo migration,
`scripts/supabase-note-addons.sql` and finally `scripts/supabase-addon-layers.sql` (whole-piece
add-ons for Stage) in the project SQL Editor. The catalog contains
only built-in repertoire IDs, never private uploaded songs. Repeat its seed when
new public pieces are added.

Every table has RLS enabled and no direct anon/authenticated table privileges.
Narrow security-definer RPCs use an empty search_path, auth.uid() ownership checks,
explicit execute grants and bounded output. The public feed excludes owner IDs,
emails, reporter identities and individual voter identities. Writes cannot choose
an owner, target private scores, overwrite other authors or attach cross-piece or
nested replies. Posts are limited to 10/hour and 30/day, reports to 20/day; these
limits use an account-level transaction lock. Reports do not automatically hide
content (to avoid coordinated flagging attacks).

`scripts/supabase-community-verify.sql` checks the original discussion controls;
`scripts/supabase-note-addons-verify.sql` checks private roots, reveal, copying and
note validation; `scripts/supabase-addon-layers-verify.sql` checks private drafts, whole-draft
publishing, discard/unpublish, note validation, one vote per person and anonymous denial. All use
synthetic users inside a transaction and roll back.

Three public Entertainer examples are seeded as clearly labeled OpenPiano demo bots.
They contain general practice prompts, not generated fingering. The optional
`scripts/supabase-addon-layers-demo-fur.sql` adds three bot add-ons on Für Elise (two fingering
add-ons that differ, and one of phrasing comments) so the add-on browser has something to
compare. Their fingerings are examples written for the demo, not from a printed edition, and
the file ends with the statement that removes them.

## Moderation (project owner)

Reports are private and are reviewed manually in Supabase Table Editor:
`community_reports`. Find the referenced ID in `community_posts`, review the
content and set `moderated_at` to the current timestamp to hide it. Clear that
timestamp to restore a mistaken hide. Do not expose these tables to visitors or
change the private `songs` bucket. There are no automated moderation emails.

The maintainer can review ownership as administrator, but no owner ID/email is
returned by the public feed. Report handling is manual; regular moderation is
needed as participation grows. Rate limits reduce spam but do not establish one
account per human or prevent coordinated voting. Votes are preference, not proof
of pedagogical quality. Public uploads of PDFs, recordings and scores are not
part of this feature; fingering contributions are original text only.

## Music profiles and piece posts

Run `scripts/supabase-profiles.sql` after the community migrations. Profiles have a
name, self-described experience, music skills and bio. Profiles start private; users
choose whether to publish their details. A private profile can still comment: its
chosen name is published with that comment, but its skills/bio are not exposed.
Published profiles use a separate random public ID rather than an auth user ID.
`profile_mine`/`profile_save` only access auth.uid()’s row; `profile_public` returns
only explicitly published fields. No raw table access is granted to visitors.

Legacy comments keep their original aliases when no public profile is available.
Publishing a profile links current public details on the author's comments; making
it private removes that link/details while retaining already-published comment names.
No real users' profiles or past comments are populated or rewritten by this migration.

The account icon and comments use the same optional profile picture. Run
`scripts/supabase-profile-photos.sql` on an existing installation. Pictures are JPG,
PNG or WebP files up to 3 MB in the private `profile-avatars` bucket. Storage policies
let an owner read or delete their own picture; anonymous readers can request a
short-lived signed URL only while the matching music profile is public. The storage
path starts with the separate random public profile ID, never the authentication ID,
and is never accepted from another account. Making a profile private prevents new
public URLs; a URL already issued can remain valid for up to one hour.

Each piece is a single post card, with its learning guide collapsed and the comment
composer/list beneath it. Comments have initials, author links, skills when public,
reply bubbles and helpful votes. This is confined to piece pages and the existing
practice discussion area; the library/home/practice navigation retains its design.

`supabase-profiles-verify.sql` verifies ownership, optional publication, canonical
comment names and opt-out, with all synthetic rows rolled back. Run the updated
community verification after the profile migration as well.
`supabase-profile-photos-verify.sql` separately checks owner-only photo paths,
private/public signed-URL eligibility and removal; its synthetic rows also roll back.

## Add-ons on the score (Stage)

An **add-on** is one person's fingering and comments for a whole piece: one per person per piece.
In Practice:

- **Click a note** and a small **+** appears beside it (not while the piece is playing; a note under
  the playhead can be clicked too). The + opens a small editor: type or tap 1–5 (or `3-1` for a
  substitution) and press **Enter**, and/or add a comment. With the editor open, clicking another
  note moves it there.
- Everything goes into your **draft**, the working copy of your add-on that only you see. It is
  saved as you go (the whole draft each time). A draft bar at the top right of the sheet shows how
  many notes (or unpublished changes) it has, with **Publish** and **Discard**.
- **Publish** copies the whole draft to the published add-on in one step. You can keep editing:
  changes, including removed notes, stay in the draft (drawn dashed/italic) until you publish
  again; **Discard** returns the draft to the published copy; **Unpublish** takes the add-on down
  and keeps the draft.
- Signed out, the draft stays on this device (`openpiano-addons-device-v1`; entries written by the
  first per-note version are converted) and can be moved into the account.
- Fingering appears as small numbers just above the notes (right hand) or below (left hand); in a
  chord they stack beyond the outer note, read top to bottom. Comments are small bubbles; tapping a
  mark shows it. Your add-on is amber, an applied community add-on is indigo, printed fingering
  keeps its own colour.
- **Add-ons** (layers icon, next to ⚙) shows your add-on (show/hide, publish, discard changes,
  unpublish) and the published community add-ons, most voted first. Each is voted for and applied
  as a whole. **Apply** shows one on your score; the choice is stored per piece in this browser
  (`openpiano-addons-applied-v2`).

Storage is `scripts/supabase-addon-layers.sql`: `community_addons` holds one row per author and
piece with `draft` and `published` note lists (`{b, m, h, f, c}`: beat, MIDI pitch, hand,
fingers, comment), checked by `community_addon_clean` (finger numbers 1–5 only, comments up to
500 characters, each note once, at most 3000 notes). RPCs: `addon_list` (public, 20 per page),
`addon_mine`, `addon_save_draft`, `addon_publish`, `addon_discard`, `addon_unpublish`,
`addon_vote`, `addon_report`. The per-note comments panel (`piano-community.js`) remains on the
library piece pages as "Notes and discussion" and is not shown on Practice.
`site/piano-addons-demo.js` is an in-browser stand-in used by previews and tests; the live site
never loads it.
