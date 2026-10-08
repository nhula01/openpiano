# Accounts and private songs

The **My songs** page lets each visitor keep a private library of
scores they add themselves (MusicXML from MuseScore, or MIDI), plus their practice
checks. GitHub Pages only serves static files, so accounts use a free
[Supabase](https://supabase.com) project for sign-in, a database and file storage.

Until it is set up, My songs still works but keeps songs in that browser only.

## One-time setup (about 10 minutes)

1. Create a free account at supabase.com and a new project (any name and region;
   save the database password somewhere safe — the site never needs it).
2. **SQL Editor → New query**: paste `scripts/supabase-setup.sql` and run it.
   This creates the `songs` and `progress` tables, the private `songs` file bucket,
   and the row-level security rules that keep every person's data private. The script is
   safe to run again after updates; it only adds what is missing.
3. **Authentication → URL Configuration**: set *Site URL* to
   `https://nhula01.github.io/openpiano/` and add the same address
   (and `http://localhost:8000/` if you test locally) under *Redirect URLs*.
4. **Project Settings → API**: copy the *Project URL* and the *anon public* key into
   `site/piano-cloud-config.js`. The anon key is designed to be public; the security
   rules are what protect the data. Never put the *service_role* key in the site.
5. Commit and push. Open the site, go to My songs, enter your email and
   open the sign-in link from that email in the same browser.

Supabase's built-in email sender allows only a few sign-in emails per hour, which is
fine for a few people; add your own SMTP provider under Authentication → Emails if
more people join.

## What is private

- Songs: each file is stored at `songs/<your user id>/…` and listed in `songs` rows
  owned by you. Other visitors, signed in or not, cannot read, list or delete them.
- Practice checks (level and skill self-checks) sync to your `progress` row and merge
  with whatever was already saved in the browser.
- Nothing you add is ever committed to this repository or published with the site.

Only add music you're allowed to use for your own practice. Copyrighted songs stay in
your private account; they are never added to the public library.
