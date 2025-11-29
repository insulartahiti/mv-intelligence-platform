'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { makeBrowserClient } from '@/lib/supabaseClient';

export default function News() {
  const [recap, setRecap] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const supabase = useMemo(() => makeBrowserClient(), []);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }
  async function runRecap() {
    setMsg('Recapping...');
    const token = await getToken();
    const rsp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/news-recap`, { method:'POST', headers:{ 'Authorization': `Bearer ${token}` } });
    const json = await rsp.json();
    setRecap(json.recap || ''); setMsg(`Items: ${json.count}`);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <header className="flex justify-between items-center"><div><Link className="text-subtle" href="/">&larr; Home</Link><span className="text-subtle"> / Fintech News</span></div><button className="btn" onClick={runRecap}>Run recap</button></header>
      <div className="card"><h2 className="font-semibold mb-2">Recap</h2><pre className="whitespace-pre-wrap text-sm">{recap}</pre><div className="text-subtle mt-2">{msg}</div></div>
    </main>
  );
}
