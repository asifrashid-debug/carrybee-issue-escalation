import './cw.css';
import './cw-live.css';
import AppHeader from '../components/AppHeader';
import PageMotion from '../components/PageMotion';
import InstallApp from '../components/InstallApp';
import { sprite } from '../components/cw/chartlib';

export const metadata = {
  title: 'CarryBee Issue Escalation Tracker',
  description: 'KAM/MX escalation tracker with zone hub sheets, dashboards and performance analytics',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48 64x64' },
      { url: '/icons/tab-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/tab-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/tab-icon-180.png',
  },
  appleWebApp: { capable: true, title: 'CB Tracker', statusBarStyle: 'black-translucent' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FFCC00' };

// Registers the service worker that lets Chrome install the tracker as an app.
const swScript = "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}";

// Applies the saved theme before first paint. Light is the default; a saved choice (cb-theme) overrides it.
const themeScript = "try{document.documentElement.dataset.theme=localStorage.getItem('cb-theme')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}";

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: sprite() }} />
        <div className="shell">
          <AppHeader />
          <main className="sheet"><PageMotion>{children}</PageMotion></main>
          <footer className="note site-foot">
            <span>CarryBee · Issue ID is the sync key (CB-DD-MM-XXXX) · Times in Asia/Dhaka · Never hard-delete (use Not possible)</span>
            <InstallApp />
          </footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
