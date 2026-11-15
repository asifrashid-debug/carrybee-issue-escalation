import './globals.css';
import './demo.css';
import AppHeader from '../components/AppHeader';
import InstallApp from '../components/InstallApp';

export const metadata = {
  title: 'CarryBee Issue Escalation Tracker',
  description: 'KAM/MX escalation tracker with zone hub sheets, dashboards and performance analytics',
  icons: { icon: '/carrybee-logo.png', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'CB Tracker', statusBarStyle: 'black-translucent' },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#F8C800' };

// Registers the service worker that lets Chrome install the tracker as an app.
const swScript = "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}";

// Applies the saved theme before first paint. Light is the default; a saved choice (cb-theme) overrides it.
const themeScript = "try{document.documentElement.dataset.theme=localStorage.getItem('cb-theme')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}";

// Supernova 3D: mouse parallax for the starfield and tilt for KPI and zone cards (dark and light).
const tiltScript = `(function(){
  var root=document.documentElement,raf=0,mx=0,my=0;
  function par(){root.style.setProperty('--px',mx.toFixed(3));root.style.setProperty('--py',my.toFixed(3));raf=0;}
  document.addEventListener('mousemove',function(e){
    mx=(e.clientX/innerWidth-.5)*2;my=(e.clientY/innerHeight-.5)*2;
    if(!raf)raf=requestAnimationFrame(par);
    var c=e.target.closest&&e.target.closest('.kpi,.zone-card');
    if(c){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      c.style.setProperty('--ry',((x-.5)*9).toFixed(2)+'deg');
      c.style.setProperty('--rx',((.5-y)*7).toFixed(2)+'deg');
      c.style.setProperty('--mx',(x*100).toFixed(1)+'%');
      c.style.setProperty('--my',(y*100).toFixed(1)+'%');
      c.style.setProperty('--gl',1);}
  });
  document.addEventListener('mouseout',function(e){
    var c=e.target.closest&&e.target.closest('.kpi,.zone-card');
    if(c&&(!e.relatedTarget||!c.contains(e.relatedTarget))){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg');c.style.setProperty('--gl',0);}
  });
})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="orb a" aria-hidden="true" />
        <div className="orb b" aria-hidden="true" />
        <div className="nebula" aria-hidden="true" />
        <div className="stars s1" aria-hidden="true" />
        <div className="stars s2" aria-hidden="true" />
        <div className="wrap">
          <AppHeader />
          <main>{children}</main>
          <footer className="foot">
            <span>CarryBee · Issue ID is the sync key (CB-DD-MM-XXXX) · Times in Asia/Dhaka · Never hard-delete (use Not possible)</span>
            <span>Auto-refresh every 60 seconds</span>
            <InstallApp />
          </footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: tiltScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
