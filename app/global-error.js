'use client';

// Last-resort screen when the root layout itself fails. It must render its own <html> and <body>.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Arial, sans-serif', margin: 0, background: '#fff', color: '#111' }}>
        <main role="alert" style={{ maxWidth: 520, margin: '60px auto', padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>The tracker could not start</h1>
          <p style={{ margin: '0 0 16px' }}>Try again. If it keeps happening, refresh the page or contact the admin team.</p>
          <button type="button" onClick={() => reset()} style={{ padding: '8px 14px', cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
