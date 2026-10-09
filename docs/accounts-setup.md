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

Supabase's default email sender is for team-member testing only (currently two emails
per hour). Public visitors need a custom SMTP provider with a verified sender under
Authentication → Emails. Keep SMTP credentials in Supabase, never in this repository.

## What is private

- Songs: each file is stored at `songs/<your user id>/…` and listed in `songs` rows
  owned by you. Other visitors, signed in or not, cannot read, list or delete them.
- Practice progress (level/skill self-checks, sight-reading history and earned note-practice passes) sync to your `progress` row and merge
  with whatever was already saved in the browser.
- Nothing you add is ever committed to this repository or published with the site.

Only add music you're allowed to use for your own practice. Copyrighted songs stay in
your private account; they are never added to the public library.

Local progress is separated by account when switching users in one browser. Initial guest progress is carried into the first sign-in. Local song files are uploaded only when their owner explicitly chooses to move/save them to the account.

## Configured OpenPiano project

Project: `uhebiyxvwrlnjxzqytjn` (West US/Oregon, Free organization).
Site URL: `https://nhula01.github.io/openpiano/`.
Allowed redirects include the production root/index and the documented local previews.
The shipped key is a publishable key, not a secret or service-role key.
`scripts/supabase-verify.sql` exercises owner access, cross-account denial and anonymous
denial in a transaction that rolls back every test row.

## Google sign-in without a custom domain

Google OAuth can use GitHub Pages and the default Supabase hostname. Set up a Google
Cloud OAuth web application using only `openid`, email and profile scopes.
Authorized JavaScript origin: `https://nhula01.github.io`.
Authorized redirect URI: `https://uhebiyxvwrlnjxzqytjn.supabase.co/auth/v1/callback`.
Keep the Google client secret only in Supabase's Google provider settings. After the
provider is enabled and tested, add `googleEnabled: true` to the public cloud config.
Until a public provider is configured, the email form explicitly says team-only testing.
Guide: https://supabase.com/docs/guides/auth/social-login/auth-google

Google OAuth is configured in project `openpiano-511104`, with an External audience
in production and only OpenID, email and profile scopes. The Supabase provider and
its Google redirect/client/callback were verified before enabling the public button.
