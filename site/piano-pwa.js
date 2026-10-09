'use strict';

(() => {
  const card = document.getElementById('install-card');
  const install = document.getElementById('install-app');
  const dialog = document.getElementById('install-help');
  const instructions = document.getElementById('install-instructions');
  let installPrompt = null;

  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const agent = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(agent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(agent);

  function showInstall() {
    if (!standalone() && card && install) card.hidden = false;
  }

  function showInstructions() {
    if (instructions) {
      instructions.textContent = ios
        ? 'In Safari, tap Share, then choose Add to Home Screen.'
        : 'In Safari, choose File, then Add to Dock. You can also use the install icon in Chrome or Edge.';
    }
    if (dialog?.showModal) dialog.showModal();
    else window.alert(instructions?.textContent || 'Use your browser menu to install OpenPiano.');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    showInstall();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (card) card.hidden = true;
  });

  install?.addEventListener('click', async () => {
    if (!installPrompt) {
      showInstructions();
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === 'accepted' && card) card.hidden = true;
  });

  dialog?.querySelector('[data-close-install]')?.addEventListener('click', () => dialog.close());
  if ((ios || safari) && !standalone()) showInstall();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
    });
  }
})();
