# Launch checklist

The maintainer's own steps before inviting people. Each needs your identity or an
account, so they are not automated.

1. **GitHub repository.** Create an empty repository named `openpiano` on GitHub (no
   README). In this folder run:
   `git remote add origin https://github.com/nhula01/openpiano.git && git push -u origin main`.
   Then Settings → Pages → Source: *GitHub Actions*. The site publishes at
   `https://nhula01.github.io/openpiano/`. (With GitHub Pro — free through GitHub
   Education for students — the repository can be private while the site stays public.)
2. **Contact details.** Fill `operator` (the name people see) and `contactEmail` in
   `site/piano-support.json`. They appear on the Terms, Privacy and Copyright pages.
   Use a dedicated address rather than a personal or university one.
3. **Accounts.** Follow `docs/accounts-setup.md` (Supabase, about 10 minutes), using the
   new site address for the redirect URL.
4. **Copyright agent.** Register a DMCA designated agent at
   https://dmca.copyright.gov ($6, renew every 3 years) and put the agent's name and
   address in `dmcaAgent` in `site/piano-support.json`.
5. **Donations.** Create a collective on Open Collective (Open Source Collective as the
   fiscal host, or another host you choose) and put its URL in `supportURL` in
   `site/piano-support.json`. The Support tab then shows the donate button and links
   to the public budget.
6. **Name.** Search the USPTO trademark database and domain availability for
   "OpenPiano" before promoting it; rename in `site/index.html` and these documents if
   needed.
7. **Review.** Have the Terms, Privacy and Copyright pages reviewed; they are written in
   plain language as a starting point, not legal advice. If you are in the US on a
   visa, check with your international student office before receiving donations, and
   check your university's intellectual-property policy.
8. **Code license.** Choose a license for OpenPiano's own code (for example AGPL-3.0 or
   MIT) and add it as `LICENSE`.
