'use client';
import { useState } from 'react';

function EvidenceDrawer({ open, onClose, contact, orgId }:{ open:boolean; onClose:()=>void; contact:any; orgId:string; }){
  const [data,setData]=useState<any|null>(null);
  const [loading,setLoading]=useState(false);
  async function load(){ if(!contact||!orgId) return; setLoading(true); try{ const r=await fetch(`/api/network/contact/${contact.id}/evidence?orgId=${orgId}`); const j=await r.json(); setData(j); }catch{} setLoading(false); }
  return (
    <div className={`fixed inset-0 ${open?'':'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/50 ${open?'opacity-100':'opacity-0'} transition-opacity`} onClick={onClose}></div>
      <div className={`absolute right-0 top-0 h-full w-[600px] bg-neutral-950 border-l border-neutral-800 p-4 overflow-auto transition-transform ${open?'translate-x-0':'translate-x-full'}`}>
        <div className='flex justify-between items-center mb-3'>
          <div className='font-semibold'>Evidence — {contact?.name}</div>
          <button className='btn' onClick={onClose}>Close</button>
        </div>
        <button className='btn mb-3' onClick={load} disabled={loading}>{loading?'Loading...':'Load evidence'}</button>
        {!data? null : (
          <div className='space-y-4'>
            <div>
              <div className='font-semibold mb-1'>Embeddings Chunks</div>
              <ul className='text-sm space-y-2'>{(data.chunks||[]).map((c:any,i:number)=>(<li key={i} className='p-2 bg-neutral-900 rounded border border-neutral-800'>{c.content}</li>))}</ul>
            </div>
            <div>
              <div className='font-semibold mb-1'>Recent Activities</div>
              <ul className='text-sm space-y-2'>{(data.activities||[]).map((a:any,i:number)=>(<li key={i} className='p-2 bg-neutral-900 rounded border border-neutral-800'>{a.verb}: <span className='text-subtle'>{JSON.stringify(a.meta)}</span></li>))}</ul>
            </div>
            <div>
              <div className='font-semibold mb-1'>Events</div>
              <ul className='text-sm space-y-2'>{(data.events||[]).map((e:any,i:number)=>(<li key={i} className='p-2 bg-neutral-900 rounded border border-neutral-800'>{e.title} <span className='text-subtle'>({new Date(e.starts_at).toLocaleString()})</span></li>))}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export default function Network(){
  const [drawer,setDrawer]=useState(false); const [selected,setSelected]=useState<any|null>(null);
  const [orgId,setOrgId]=useState('REPLACE_WITH_ORG_UUID');
  const [q,setQ]=useState('who has good RIA connectivity?');
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');

  async function run(){
    setLoading(true); setMsg('');
    try{
      const r = await fetch('/api/network/query', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orgId, q, limit: 20 }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setRows(j.results||[]);
      setMsg(`Found ${j.results?.length||0} candidates.`);
    }catch(e:any){ setMsg(e.message); }
    setLoading(false);
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Network Insight</h1>
          <p className="text-subtle text-sm">Ask natural language questions about people and relationships. Results rank semantic relevance and relationship strength.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-sm mb-1">Org ID</label>
            <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={orgId} onChange={e=>setOrgId(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Query</label>
            <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-96" value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <button className="btn" onClick={run}>{loading?'Running...':'Search'}</button>
        </div>
      </header>

      <div className="text-subtle">{msg}</div>

      <div className="grid gap-3">
        {rows.map((r:any)=>(
          <div key={r.id} className="card">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-subtle text-sm">{r.title||''}{r.company?` • ${r.company}`:''}</div>
                <div className="text-subtle text-xs mt-1">Tags: {(r.tags||[]).join(', ')||'—'}</div>
              </div>
              <div className="text-right text-sm">
                <div>Score: {r.score}</div>
                <div className="text-subtle">Similarity: {r.similarity} • Relationship: {r.relationship_strength}</div>
              </div>
            </div>
            <div className='mt-3'><button className='btn' onClick={()=>{ setSelected(r); setDrawer(true); }}>Show evidence</button></div>
            <div className="text-subtle text-xs mt-2">Last interaction: {r.last_interaction_at ? new Date(r.last_interaction_at).toLocaleString() : '—'}</div>
          </div>
        ))}
      </div>

      <EvidenceDrawer open={drawer} onClose={()=>setDrawer(false)} contact={selected} orgId={orgId} />
    </main>
  );
}
