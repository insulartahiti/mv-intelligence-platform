'use client';
import { useState } from 'react';

export default function Search(){
  const [q,setQ]=useState('');
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const orgId = 'REPLACE_WITH_ORG_UUID';
  async function run(){ setLoading(true); const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&orgId=${orgId}`); const j=await r.json(); setRows(j.results||[]); setLoading(false); }
  return (<main className="max-w-4xl mx-auto p-6 space-y-4">
    <h1 className="text-xl font-semibold">Semantic Search</h1>
    <div className="flex gap-2"><input className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search decks, notes, emails..." /><button className="btn" onClick={run}>{loading?'...':'Search'}</button></div>
    <div className="space-y-3">{rows.map(r=>(<div key={r.id} className="p-3 rounded-xl border border-neutral-800"><div className="text-xs text-neutral-400">sim {(r.similarity*100).toFixed(1)}%</div><pre className="whitespace-pre-wrap text-sm">{r.content}</pre></div>))}</div>
  </main>);
}