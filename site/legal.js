'use strict';
// Fills operator and contact details on the information pages from piano-support.json.
fetch('piano-support.json', { cache: 'no-store' }).then(r => r.json()).then(info => {
  for (const el of document.querySelectorAll('[data-info]')) {
    const value = info[el.dataset.info];
    if (!value) continue;
    if (el.dataset.info === 'contactEmail') { const a = document.createElement('a'); a.href = 'mailto:' + value; a.textContent = value; el.replaceChildren(a); }
    else if (/URL$/.test(el.dataset.info)) { const a = document.createElement('a'); a.href = value; a.textContent = value; el.replaceChildren(a); }
    else el.textContent = value;
  }
}).catch(() => {});
