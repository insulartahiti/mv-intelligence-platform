'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { makeBrowserClient } from '@/lib/supabaseClient';

type Company = { id:string; name:string; domain:string|null; description:string|null };

export default function Companies(){
  const supabase = useMemo(()=>makeBrowserClient(), []);
  const [rows,setRows]=useState<Company[]>([]);
  const [name,setName]=useState(''); const [domain,setDomain]=useState('');
  const [msg,setMsg]=useState('');

  async function load(){
    const { data, error } = await supabase.from('companies').select('id,name,domain,description').order('name');
    if (error) setMsg(error.message); setRows(data||[]);
  }
  async function add(){
    const { data, error } = await supabase.from('companies').insert({ name, domain }).select('id').single();
    if (error){ setMsg(error.message); return; } setName(''); setDomain(''); load();
  }
  async function watch(id:string){
    const { error } = await supabase.from('company_watchlist').insert({ company_id:id });
    if (error) setMsg(error.message); else setMsg('Added to watchlist');
  }

  useEffect(()=>{ load(); }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div><Link className="text-subtle" href="/">&larr; Home</Link> <span className="text-subtle">/ Companies</span></div>
        <div className="flex gap-2">
          <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" placeholder="Domain" value={domain} onChange={e=>setDomain(e.target.value)} />
          <button className="btn" onClick={add}>Add</button>
        </div>
      </header>
      <div className="text-subtle">{msg}</div>
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((c)=>(
          <div key={c.id} className="card">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-subtle text-sm">{c.domain||''}</div>
              </div>
              <button className="btn" onClick={()=>watch(c.id)}>Watch</button>
            </div>
            <div className="mt-3 text-sm whitespace-pre-wrap">{c.description||'—'}</div>
            <a className="underline text-sm mt-2 inline-block" href={`/companies/${c.id}`}>Open profile</a>
          </div>
        ))}
      </div>
    </main>
  );
}
