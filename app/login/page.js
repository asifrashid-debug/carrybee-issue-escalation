'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import InstallApp from '../../components/InstallApp';

function safeNext(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const urlErr = params.get('error') === 'not-listed'
    ? 'This Google account is not on the CarryBee access list. Ask an admin to add you.'
    : params.get('error') === 'oauth' ? 'Google sign-in did not finish. Please try again.' : null;

  async function googleSignIn() {
    setErr(null); setNote(null); setBusy(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNext(params.get('next')))}`;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) { setErr(error.message); setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setNote(null); setBusy(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    try {
      if (mode === 'signup') {
        const r = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not create the account.');
        setNote('Account created. Signing you in…');
      }
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message);
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (e2) {
      setErr(String(e2.message || e2));
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="lg-card">
        <div className="lg-logo"><img src="/carrybee-logo.png" alt="CarryBee" /></div>
        <div className="kicker lg-kicker">Issue Escalation Tracker</div>
        <h1 className="lg-title">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        <p className="meta">{mode === 'signin' ? 'Use your CarryBee email and password.' : 'Only emails on the CarryBee access list can create an account.'}</p>

        <div className="seg lg-seg" role="tablist" aria-label="Sign in or create account">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setErr(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(null); }}>Create account</button>
        </div>

        {(err || urlErr) && <div className="box box-bad" role="alert">{err || urlErr}</div>}
        {note && <div className="box box-ok" role="status">{note}</div>}

        {mode === 'signin' && (
          <>
            <button type="button" className="btn lg-google" onClick={googleSignIn} disabled={busy} style={{ width: '100%', justifyContent: 'center', gap: 10, height: 46 }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36 26.7 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </button>
            <div className="meta" style={{ textAlign: 'center', margin: '14px 0' }}>or use your email</div>
          </>
        )}

        <form onSubmit={submit} className="stack lg-form">
          <label className="field">Email
            <input className="inp" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@carrybee.com" />
          </label>
          <label className="field">Password{mode === 'signup' ? ' (at least 8 characters)' : ''}
            <input className="inp" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary lg-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account and sign in'}</button>
        </form>
        <InstallApp />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="skeleton">Loading…</div>}><LoginForm /></Suspense>;
}
