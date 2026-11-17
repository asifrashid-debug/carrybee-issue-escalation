// Web app manifest: makes the tracker installable from Chrome (Install app / home screen).
export default function manifest() {
  return {
    id: '/',
    name: 'CarryBee Issue Escalation Tracker',
    short_name: 'CB Tracker',
    description: 'KAM and MX escalation tracker with hub responses, SLA and performance views.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F1F0EC',
    theme_color: '#F8C800',
    icons: [
      { src: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/app-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
