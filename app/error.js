'use client';

// Shown when a page fails to render. Keeps the app usable: retry the page or go back to the start.
export default function ErrorPage({ error, reset }) {
  if (typeof console !== 'undefined') console.error('Page error:', error);
  return (
    <main role="alert" style={{ maxWidth: 520, margin: '60px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong on this page</h1>
      <p className="muted small" style={{ margin: '0 0 16px' }}>Your data is safe. Try again, or go back to the tracker home page.</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
        <a className="btn" href="/">Go to home</a>
      </div>
    </main>
  );
}
