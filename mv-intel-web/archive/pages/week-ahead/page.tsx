'use client';
import { useState } from 'react';

function parseActions(brief:string){
  // naive: take lines under 'Action items' section
  const m = /Action items[\s\S]*?\n([\s\S]*)/i.exec(brief);
  const lines = (m?m[1]:brief).split(/\n/).map(s=>s.replace(/^[-•]\s*/,'').trim()).filter(s=>s.length>0).slice(0,6);
  return lines;
}

function CreateActions({ title, brief, orgId }:{ title:string; brief:string; orgId:string; }){
  const [saving,setSaving]=useState(false); 
  const [msg,setMsg]=useState('');
  
  async function create(){ 
    setSaving(true); 
    setMsg(''); 
    try{
      const items = parseActions(brief);
      const r = await fetch('/api/actions', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orgId, items: items.map((t:string)=>({ title: t })) }) });
      const j = await r.json(); 
      if(!r.ok) throw new Error(j?.error||r.statusText); 
      setMsg(`Created ${j.count} actions`);
    }catch(e:any){ 
      setMsg(e.message); 
    } 
    setSaving(false); 
  }
  
  return (
    <div className='text-sm'>
      <button className='btn-secondary' onClick={create} disabled={saving}>
        {saving?'Creating...':'Create actions'}
      </button>
      <span className='text-text-secondary ml-2'>{msg}</span>
    </div>
  );
}

export default function WeekAhead(){
  const [myEmail,setMyEmail]=useState<string>('');
  const [from,setFrom]=useState<string>('');
  const [to,setTo]=useState<string>('');
  const [orgId,setOrgId]=useState<string>('REPLACE_WITH_ORG_UUID');
  const [sendSlack,setSendSlack]=useState<boolean>(false);
  const [channel,setChannel]=useState<string>('');
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');
  const [email,setEmail]=useState('');

  async function emailMe(brief:string, title:string){ 
    try{ 
      await fetch('/api/week-ahead/email', { 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify({ to: myEmail, subject: `Brief: ${title}`, brief }) 
      }); 
    }catch{} 
  }

  async function sendEmail(){
    try{
      const r = await fetch('/api/week-ahead/email',{ 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify({ to: email, briefs: rows })
      });
      const j = await r.json(); 
      setMsg(j?.id? 'Sent email' : (j?.error||'Email failed'));
    }catch(e:any){ 
      setMsg(e.message); 
    }
  }

  async function run(){
    setRows([]);
    setLoading(true); 
    setMsg('');
    try{
      const r = await fetch('/api/week-ahead', { 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify({ orgId, from: from||undefined, to: to||undefined, sendSlack, channel: channel||undefined }) 
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setRows(j.briefs||[]);
      setMsg(`Prepared ${j.count} briefs${sendSlack?' and posted to Slack':''}.`);
    }catch(e:any){ 
      setMsg(e.message); 
    }
    setLoading(false);
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Week Ahead</h1>
          <p className="text-text-secondary text-sm">Create meeting briefs from calendar events, company context, news, and recent activity.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="label">Org ID</label>
            <input className="input w-32" value={orgId} onChange={e=>setOrgId(e.target.value)} />
          </div>
          <div>
            <label className="label">From</label>
            <input type="datetime-local" className="input w-40" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="datetime-local" className="input w-40" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input id="sl" type="checkbox" checked={sendSlack} onChange={e=>setSendSlack(e.target.checked)} />
            <label htmlFor="sl" className="text-sm text-text-secondary">Send to Slack</label>
          </div>
          <div>
            <label className="label">Channel</label>
            <input className="input w-32" placeholder="#mv-intel" value={channel} onChange={e=>setChannel(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input w-40" placeholder="you@company.com" value={myEmail} onChange={e=>setMyEmail(e.target.value)} />
          </div>
          <button className="btn" onClick={run}>{loading?'Running...':'Run'}</button>
        </div>
      </header>
      
      <div className='flex gap-2 items-center'>
        <input 
          className='input w-64' 
          placeholder='your@email.com' 
          value={email} 
          onChange={e=>setEmail(e.target.value)} 
        />
        <button className='btn' onClick={sendEmail}>Email me</button>
      </div>

      <div className="text-text-secondary">{msg}</div>

      <div className="space-y-4">
        {rows.map((r:any)=>(
          <div key={r.event.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-text-primary">{r.event.title}</div>
                <div className="text-text-secondary text-sm">
                  {new Date(r.event.starts_at).toLocaleString()} {r.event.location?('• '+r.event.location):''}
                </div>
                <div className="text-text-secondary text-sm">
                  Attendees: {(r.event.attendees||[]).map((a:any)=>a.name || a.email).join(', ')}
                </div>
              </div>
            </div>
            <pre className="whitespace-pre-wrap text-sm mt-3 text-text-primary">{r.brief}</pre>
            <div className="mt-3 flex gap-2">
              <button 
                className="btn-secondary" 
                onClick={()=>emailMe(r.brief, r.event.title)} 
                disabled={!myEmail}
              >
                Email me this brief
              </button>
              <CreateActions title={r.event.title} brief={r.brief} orgId={orgId} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
