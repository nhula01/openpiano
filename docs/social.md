# Community (posts, Reels, friends)

> **Hidden for now.** `community: false` in `site/piano-cloud-config.js` hides the Community and
> Reels tabs, the community section of profiles, the piece-page strip, the Share buttons and the
> Support page's "What your support unlocks next", and sends old `#feed`, `#reels` and `#post`
> links home. Nothing is requested from the database while it is off. Set it to `true` (and run
> `scripts/supabase-social.sql` if not done yet) to show everything again.

The Community tab is a small social space for people learning piano. Members follow each other,
post progress, photos and links to their own performances on YouTube, keep a "working on" list,
like and comment. It connects to the existing library discussions: a Following feed also shows the
public note comments and published fingering add-ons of people you follow, and each library piece
page has a "From the community" strip with posts and performances about that piece.

| Where | What |
| --- | --- |
| `#feed`, `#feed/following`, `#feed/discover` | Composer, feeds, people to follow, activity bell |
| `#reels`, `#reels/<post>`, `#reels/piece/<id>`, `#reels/profile/<id>` | Full-screen vertical performances |
| `#post/<id>` | One post with its comments (share links point here) |
| `#profile/<id>` | Followers / following / friends, Working on, Posts, Performances, Follow, Report, Block |
| `#profile` | Join, privacy settings, working-on list, follow requests, blocked people, leave |
| Library piece page | "From the community", *I'm working on this*, *Share progress* |
| Practice run summary | *Share* posts the result (accuracy, BPM, hands) as a progress update |

Code: `site/piano-social.js` (feed, profiles, composer, comments), `site/piano-social-reels.js`,
`site/piano-social-video.js` (direct video uploads, currently off), `site/piano-social.css`.
Database: `scripts/supabase-social.sql`, checked by `scripts/supabase-social-verify.sql`.

## What it costs

Everything that is on today fits the free Supabase plan (500 MB database, 1 GB file storage,
5 GB bandwidth a month):

- Posts, comments, likes and follows are small database rows.
- Photos are shrunk to 1600 px JPEG in the browser (typically 150–400 KB) and stored in the private
  `social-media` bucket, which accepts only JPEG up to 5 MB. Caps: 800 MB for the bucket, 50 MB
  and 200 files per account, 20 uploads a day.
- Performances are YouTube links. YouTube hosts and streams the video, so they cost nothing.

**Direct video uploads** are built and tested but switched off, because a few hundred short clips
would exhaust the free storage and their playback would use up the monthly bandwidth quickly. The
composer shows "Clips · soon" and the side panel, Reels and the Support page say that direct clips
arrive as support grows. To switch them on later (Supabase Pro, about $25/month, includes 100 GB
storage and 250 GB bandwidth):

```sql
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['video/mp4','video/webm','video/quicktime','image/jpeg']
  where id = 'social-media';
update public.social_config set video_uploads = true, max_bucket_bytes = 50000000000,
  max_account_bytes = 524288000;
```

The browser then re-records phone videos at 720p and about 1.4 Mbit/s, trimmed to 60 seconds
(about 10 MB a minute), with a cover frame. Turning it off again only hides the option; existing
videos keep playing.

## Rules the database enforces

- Joining publishes the member's music profile. If the profile is made private again, nobody else
  sees that member's posts, photos or profile until they make it public.
- Follows are one-way; people who follow each other are **friends**. A member can require approval
  for new followers.
- Posts are Public, Friends or Only me. Adults default to Public, 13–17 to Friends.
- **Members who say they are 13–17:** every follower needs approval (cannot be switched off); any
  post with a photo, video or YouTube link reaches friends only, even if Public was chosen; only
  friends can comment; their bio, skills, picture and working-on list are shown only to friends;
  they are not suggested to adults, and adults cannot find them by searching (other 13–17 members
  and existing friends can). Nothing returned to other people reveals a member's age group: the
  "needs approval" flag is the member's approval setting, which adults can also turn on. Age is
  self-declared when joining.
- Follower, following and friends lists are visible only to the member and their friends (counts
  are public).
- No private messages.
- Blocking hides both people from each other everywhere and removes follows both ways.
- Rate limits: 10 posts an hour / 30 a day, 30 comments an hour / 150 a day, 100 follows a day
  (and at most two follows of the same person a day), 500 likes a day, 20 reports a day. Posts,
  follows, likes and uploads are counted in an append-only log (`social_events`), so deleting and
  re-doing does not reset a limit.
- A post that is reported or moderated cannot be destroyed by its author: deleting it (or leaving
  the community) hides it for everyone (`deleted_at`) but keeps the row and its files for review.
- Photos are served through one-hour signed links, only to people allowed to see the post.
- All tables have RLS enabled with no direct privileges; every read and write goes through a
  security-definer function with an empty `search_path` and `auth.uid()` checks. Feeds never return
  account IDs or emails.

## Deployment

1. In the Supabase SQL Editor, after the earlier migrations (`docs/community.md`), run
   `scripts/supabase-social.sql`.
2. Optionally run `scripts/supabase-social-verify.sql`; it uses synthetic users and rolls back.
3. Until step 1 is done, the Community and Reels tabs show "The community is not switched on yet".

`tests/sql/run.sh` runs every migration and verification script against a local PostgreSQL with a
small Supabase stand-in (`tests/sql/supabase-stub.sql`):
`PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres tests/sql/run.sh`.

## Moderation (maintainer)

Reports are in `social_reports` (Table Editor). Open reports:

```sql
select r.kind, r.target, r.reason, r.created_at, p.body, p.image_path, p.youtube_id
from social_reports r left join social_posts p on r.kind = 'post' and p.id = r.target
where r.reviewed_at is null order by r.created_at desc;
```

- Hide a post: set `social_posts.moderated_at = now()`. Hide a comment: set
  `social_comments.moderated_at = now()`. Clear the value to restore.
- A post with a photo, video or YouTube link reported by 3 members who joined more than a day ago is hidden
  automatically (`auto_hidden = true`) until you review it; set `reviewed_at` on its reports.
- A profile report's `target` is the profile's public ID (`community_profiles.public_id`).
- Posts with `deleted_at` set were deleted by their author while reported or moderated. Once
  reviewed, delete the row and its files (Storage → `social-media`).
- Anything suggesting a child is at risk: hide it, keep the records, and report it to NCMEC
  (CyberTipline) as the law requires. Do not download or forward the material.

Regular moderation is needed as participation grows; reports do not notify you by email.
