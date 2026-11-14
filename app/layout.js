export const metadata = { title: 'CarryBee Issue Escalation Tracker', description: 'KAM/MX escalation tracker with zone hub sheets' };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', margin: 0, background: '#f6f7f9', color: '#111827' }}>
        <header style={{ background: '#0b2a4a', color: '#fff', padding: '12px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 18 }}>🐝 CarryBee Issue Escalation Tracker</strong>
          <nav style={{ display: 'flex', gap: 12, fontSize: 14 }}>
            <a href="/" style={{ color: '#fff' }}>Tracker</a>
            <a href="/kam/new" style={{ color: '#fff' }}>KAM Form</a>
            <a href="/mx/new" style={{ color: '#fff' }}>MX Form</a>
            <a href="/admin" style={{ color: '#fff' }}>Admin / Sync Health</a>
          </nav>
          <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>DB = source of truth • Times in Asia/Dhaka</span>
        </header>
        <main style={{ maxWidth: 1400, margin: '0 auto', padding: 20 }}>{children}</main>
        <footer style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', padding: 20 }}>CarryBee • Issue ID is sync key (ESC-YYYYMMDD-####) • Never hard-delete (use Dropped)</footer>
      </body>
    </html>
  );
}
