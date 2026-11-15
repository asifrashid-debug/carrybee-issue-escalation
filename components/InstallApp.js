'use client';
import { useEffect, useState } from 'react';

// "Install app" for phones and desktop. Chrome/Edge offer the install prompt through the
// beforeinstallprompt event; we keep that event and show a button for it. Browsers that do not
// offer the prompt (iPhone Safari, Samsung Internet before it is ready) get the manual steps.
// Hidden once the app is already running as an installed app.
export default function InstallApp() {
  const [evt, setEvt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) { setInstalled(true); return; }
    const onPrompt = (e) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!evt) return;
    evt.prompt();
    try {
      const choice = await evt.userChoice;
      if (choice && choice.outcome === 'accepted') setInstalled(true);
    } catch (_) { /* prompt dismissed */ }
    setEvt(null);
    setNote('');
  }

  return (
    <div className="install-box" role="region" aria-label="Install the app">
      {evt ? (
        <button type="button" className="btn y" onClick={install}>Install app</button>
      ) : (
        <button type="button" className="btn" onClick={() => setNote('Chrome: tap the ⋮ menu, then "Install app" or "Add to Home screen". iPhone: tap Share, then "Add to Home Screen".')}>Install app</button>
      )}
      <p className="install-help">{note || 'Adds the tracker to your home screen and opens it full screen, like an app.'}</p>
    </div>
  );
}
