'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
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
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [shake, setShake] = useState(0);
  const pwRef = useRef(null);
  const cardRef = useRef(null);
  const urlErr = params.get('error') === 'not-listed'
    ? 'This Google account is not on the CarryBee access list. Ask an admin to add you.'
    : params.get('error') === 'oauth' ? 'Google sign-in did not finish. Please try again.' : null;
  const shownErr = err || urlErr;

  // Every new error: restart the shake on the card (motion-safe only, see CSS) and move focus to the password field.
  useEffect(() => {
    if (!shake) return;
    const card = cardRef.current;
    if (card) { card.classList.remove('lg-shake'); void card.offsetWidth; card.classList.add('lg-shake'); }
    pwRef.current?.focus();
  }, [shake]);

  function fail(message) {
    setErr(message);
    setBusy(false);
    setShake((n) => n + 1);
  }

  function switchMode(next) {
    setMode(next);
    setErr(null);
    setNote(null);
  }

  async function googleSignIn() {
    setErr(null); setNote(null); setBusy(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNext(params.get('next')))}`;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) fail(error.message);
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
      fail(String(e2.message || e2));
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="login-wrap">
      <div className="lg-card" ref={cardRef}>
        <div className="lg-hero">
          <img className="lg-bee" src="/icons/login-bee.png" alt="" width="64" height="58" />
          <div className="lg-brand">CarryBee</div>
          <h1 className="lg-title">{isSignup ? 'Create your account' : 'Sign in'}</h1>
          <p className="lg-sub">{isSignup ? 'Only emails on the CarryBee access list can create an account.' : 'Use your CarryBee email and password.'}</p>
        </div>

        <div className="lg-tabs" data-mode={mode} role="tablist" aria-label="Sign in or create account">
          <span className="lg-pill" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={!isSignup} onClick={() => switchMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={isSignup} onClick={() => switchMode('signup')}>Create account</button>
        </div>

        {shownErr && <div className="lg-alert lg-alert-bad" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg><span>{shownErr}</span></div>}
        {note && <div className="lg-alert lg-alert-ok" role="status"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg><span>{note}</span></div>}

        {!isSignup && (
          <>
            <button type="button" className="lg-google" onClick={googleSignIn} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
              Continue with Google
            </button>
            <div className="lg-sep">or use your email</div>
          </>
        )}

        <form onSubmit={submit} className="lg-form">
          <label className="lg-field">
            <span className="lg-lbl">Email</span>
            <input className="lg-inp" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@carrybee.com" />
          </label>
          <label className="lg-field">
            <span className="lg-lbl">Password{isSignup ? ' (at least 8 characters)' : ''}</span>
            <span className="lg-inp-wrap">
              <input
                ref={pwRef}
                className={`lg-inp lg-pw${shownErr ? ' lg-inp-bad' : ''}`}
                type={showPw ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={isSignup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                aria-invalid={shownErr ? 'true' : undefined}
              />
              <button type="button" className="lg-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                {showPw
                  ? <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.7C3.7 8.5 2 12 2 12s3.5 6 10 6a9.8 9.8 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
              </button>
            </span>
          </label>
          <button type="submit" className="lg-submit" disabled={busy}>
            {busy
              ? <span className="lg-loading"><svg className="lg-bee-fly" viewBox="0 0 60 40" aria-hidden="true"><ellipse className="lg-wing" cx="26" cy="11" rx="8" ry="6" fill="currentColor" opacity=".85" /><ellipse className="lg-wing lg-wing-b" cx="36" cy="10" rx="8" ry="6" fill="currentColor" opacity=".6" /><path d="M14 22c6-1 12 0 18 2 9 3 14 0 16 4-1 6-12 10-22 8-6-1-10-6-12-14z" fill="currentColor" /><path d="M22 22v9M30 23v8M38 24v6" stroke="var(--bee)" strokeWidth="2.4" strokeLinecap="round" /></svg>{note ? 'Signing you in…' : isSignup ? 'Creating your account…' : 'Signing you in…'}</span>
              : isSignup ? 'Create account and sign in' : 'Sign in'}
          </button>
        </form>
        <InstallApp />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="skeleton">Loading…</div>}><LoginForm /></Suspense>;
}
