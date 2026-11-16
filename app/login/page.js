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

        {err && <div className="box box-bad" role="alert">{err}</div>}
        {note && <div className="box box-ok" role="status">{note}</div>}

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
