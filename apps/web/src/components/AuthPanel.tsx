'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function AuthPanel({ title, subtitle, signupRole }: {
  title: string; subtitle: string; signupRole?: 'rider' | 'driver';
}) {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = signup && signupRole
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name, role: signupRole } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (res.error) setMsg(res.error.message);
    else if (signup && !res.data.session) setMsg('Check your email to confirm your account, then log in.');
    setBusy(false);
  }

  return (
    <div className="nt-center">
      <form className="nt-card nt-auth" onSubmit={submit}>
        <Link href="/" className="nt-brand">Negotiate <span>Taxi</span></Link>
        <h1 className="nt-h3">{title}</h1>
        <p className="nt-muted">{subtitle}</p>
        {signup && <input className="nt-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className="nt-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="nt-input" type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} />
        {signup && signupRole === 'driver' && <p className="nt-muted">New drivers are approved by an admin before they can take rides.</p>}
        {msg && <p className="nt-muted" style={{ color: '#fca5a5' }}>{msg}</p>}
        <button className="nt-btn nt-primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</button>
        {signupRole && (
          <button type="button" className="nt-btn" onClick={() => setSignup(!signup)}>
            {signup ? 'I already have an account' : `New ${signupRole}? Create an account`}
          </button>
        )}
      </form>
    </div>
  );
}