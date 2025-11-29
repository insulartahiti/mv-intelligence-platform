'use client';
import { useEffect, useState } from 'react';

function degreeLabel(d:number){ return d===1?'1st':'2nd/3rd'; }

function IntroButton({ orgId, teammateId, targetContactId, companyId }:{ orgId:string; teammateId:string; targetContactId?:string|null; companyId:string; }){
  const [open,setOpen]=useState(false); const [text,setText]=useState(''); const [loading,setLoading]=useState(false);
  async function draft(){ setLoading(true); try{ const r=await fetch('/api/intro/draft', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orgId, teammateId, targetContactId, companyId }) }); const j=await r.json(); setText(j.text||''); setOpen(true); }catch{} setLoading(false); }
  return (<div>
    <button className='btn' onClick={draft} disabled={loading}>{loading?'Drafting...':'Draft intro request'}</button>
    {open? <div className='mt-2 p-2 bg-neutral-900 border border-neutral-800 rounded text-sm whitespace-pre-wrap'>{text}</div> : null}
  </div>);
}

export default function CompanyNetwork({ params }:{ params: { id: string } }){
  const id = params.id;
  const [orgId,setOrgId]=useState('REPLACE_WITH_ORG_UUID');
  const [rows,setRows]=useState<any[]>([]);
  const [msg,setMsg]=useState('');
  const [paths,setPaths]=useState<any[]>([]);
  async function loadPaths(){ try{ const r = await fetch(`/api/companies/${id}/warm-paths`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orgId }) }); const j = await r.json(); setPaths(j.paths||[]); }catch{} }
  const [loading,setLoading]=useState(false);

  async function load(){
    setLoading(true); setMsg('');
    try{
      const r = await fetch(`/api/companies/${id}/network?orgId=${orgId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setRows(j.results||[]);
      setMsg(`Found ${j.results?.length||0} strong contacts.`);
    }catch(e:any){ setMsg(e.message); }
    setLoading(false);
  }

  useEffect(()=>{ load(); }, [id]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Company Network</h1>
          <p className="text-subtle text-sm">Warm paths and strongest relationships into this company.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-sm mb-1">Org ID</label>
            <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={orgId} onChange={e=>setOrgId(e.target.value)} />
          </div>
          <button className="btn" onClick={load}>{loading?'Loading...':'Refresh'}</button>
        </div>
      </header>

      <div className="text-subtle">{msg}</div>

      <table className="w-full text-sm border-separate border-spacing-y-2">
        <thead className="text-subtle">
          <tr><th className="text-left">Contact</th><th className="text-left">Title</th><th className="text-left">Email</th><th>Strength</th><th>Recency</th><th>Freq</th><th>LinkedIn</th></tr>
        </thead>
        <tbody>
          {rows.map((r:any)=>(
            <tr key={r.contact_id}>
              <td className="font-medium">{r.contact_name}</td>
              <td>{r.contact_title||''}</td>
              <td className="text-subtle">{r.contact_email||''}</td>
              <td className="text-center">{r.strength?.toFixed?.(3)}</td>
              <td className="text-center text-subtle">{r.recency_score?.toFixed?.(2)}</td>
              <td className="text-center text-subtle">{r.frequency_score?.toFixed?.(2)}</td>
              <td>{r.linkedin_url? <a className="underline" href={r.linkedin_url} target="_blank">Profile</a> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">Best Team Paths</h3>
          <button className="btn" onClick={loadPaths}>Refresh Paths</button>
        </div>
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead className="text-subtle">
            <tr><th className="text-left">Teammate</th><th className="text-left">Via</th><th>Rel. Strength</th><th>LI Degree</th><th>Score</th><th></th></tr>
          </thead>
          <tbody>
            {paths.map((p:any,i:number)=>(
              <tr key={i}>
                <td>{p.teammate?.name}</td>
                <td>{p.external? `${p.external.name} (${p.external.title||''})` : <span className="text-subtle">— direct —</span>}</td>
                <td className="text-center">{p.relationship?.strength?.toFixed?.(3) || '—'}</td>
                <td className="text-center">{p.external? degreeLabel(p.degree||3) : '—'}</td>
                <td className="text-center font-medium">{p.score?.toFixed?.(3)}</td>
                <td className="text-right"><IntroButton orgId={orgId} teammateId={p.teammate?.id} targetContactId={p.external?.id||null} companyId={id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </main>
  );
}
