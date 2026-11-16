import './cw.css';
import './cw-live.css';
import AppHeader from '../components/AppHeader';
import InstallApp from '../components/InstallApp';
import { sprite } from '../components/cw/chartlib';

export const metadata = {
  title: 'CarryBee Issue Escalation Tracker',
  description: 'KAM/MX escalation tracker with zone hub sheets, dashboards and performance analytics',
  icons: { icon: '/carrybee-logo.png', apple: '/icons/icon-192.png' },
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
          <main className="sheet">{children}</main>
          <footer className="note" style={{ margin: '0 24px 24px' }}>
            <span>CarryBee · Issue ID is the sync key (CB-DD-MM-XXXX) · Times in Asia/Dhaka · Never hard-delete (use Not possible)</span>
            <InstallApp />
          </footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
