'use client';
import { useState } from 'react';
import { makeBrowserClient } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function signIn() {
    const supabase = makeBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : `Signed in as ${data.user?.email}`);
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-4">
      <Link href="/" className="text-subtle">&larr; Home</Link>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <label className="label">Email</label>
      <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/>
      <label className="label">Password</label>
      <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
      <button className="btn" onClick={signIn}>Sign in</button>
      <div className="text-subtle">{msg}</div>
    </main>
  );
}
