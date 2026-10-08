'use strict';
// Support page: the donation link and the public budget come from piano-support.json.
// Open Collective publishes every donation and expense, so the budget link is its transactions page.
(() => {
const host = document.querySelector('#community-support'); if (!host) return;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
fetch('piano-support.json', { cache: 'no-store' }).then(r => r.json()).then(info => {
  host.replaceChildren(); host.className = 'support-card';
  let url = null; try { const u = new URL(info.supportURL); if (u.protocol === 'https:') url = u; } catch {}
  if (url) {
    const give = el('a', 'Donate to OpenPiano', 'button'); give.href = url.href; give.target = '_blank'; give.rel = 'noopener';
    const ledger = el('a', 'See every donation and expense', 'secondary');
    ledger.href = /opencollective\.com$/.test(url.hostname) ? url.href.replace(/\/$/, '') + '/transactions' : url.href; ledger.target = '_blank'; ledger.rel = 'noopener';
    const row = el('div', undefined, 'actions'); row.append(give, ledger);
    host.append(el('h2', 'Keep OpenPiano free'), el('p', 'Donations pay for hosting, storage and the domain. They never unlock features: everything stays free for everyone.'), row,
      el('p', /opencollective\.com$/.test(url.hostname) ? 'Donations are handled by Open Collective, which publishes the full budget.' : 'Donations are handled by our fiscal host, which publishes the full budget.', 'muted'));
  } else {
    host.append(el('h2', 'Donations open soon'), el('p', 'OpenPiano will accept voluntary donations through Open Collective, which publishes every donation and expense. Everything stays free either way.', 'muted'));
  }
}).catch(() => {});
})();
