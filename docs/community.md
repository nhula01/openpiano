# Repertoire community

Built-in library pieces have public discussion in their lesson page and beneath
the practice score. Read without an account; sign in to contribute, reply, vote or
report. Each contribution uses the name saved in the author’s music profile, never the account email or
Google profile. The server derives the name from the signed-in account; clients cannot
choose a different author name for each comment. Display names and claimed qualifications are not verified.

Contributors can publish original comments or fingering plans describing the bars,
edition, hand, note pitches and fingers. A public-publication checkbox is required.
Plans do not replace printed source fingering or claim teacher verification.
Most helpful sorts by unique upvotes, then newest. Authors cannot vote for themselves.
Newest is also available. Threads support 50 replies; the feed paginates 20 roots.

Use in practice saves an attributed snapshot beside the score, privately synced
with progress. Adapt pre-fills a new plan with attribution so a learner can explain
their changes and publish a separate version. Removing a saved plan writes a dated
tombstone so an older cloud copy cannot restore it. Authors may edit or withdraw
their contributions; Undo restores a withdrawal. A moderator's hide cannot be
undone by an author. Withdrawn/hidden content stays in the database for moderation.

## Deployment

Run `scripts/supabase-community.sql`, then `scripts/supabase-community-catalog.sql`
in the project SQL Editor. The catalog contains only built-in repertoire IDs, never
private uploaded songs. Repeat when new public pieces are added. New installations
need both the existing private-account migration and this migration.

Every table has RLS enabled and no direct anon/authenticated table privileges.
Narrow security-definer RPCs use an empty search_path, auth.uid() ownership checks,
explicit execute grants and bounded output. The public feed excludes owner IDs,
emails, reporter identities and individual voter identities. Writes cannot choose
an owner, target private scores, overwrite other authors or attach cross-piece or
nested replies. Posts are limited to 10/hour and 30/day, reports to 20/day; these
limits use an account-level transaction lock. Reports do not automatically hide
content (to avoid coordinated flagging attacks).

`scripts/supabase-community-verify.sql` checks these controls with synthetic users
and contributions inside a transaction and rolls everything back. Never create
demonstration posts in the live public feed or copy real private music into it.

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
