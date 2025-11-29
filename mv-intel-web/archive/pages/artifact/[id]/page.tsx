'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { makeBrowserClient } from '@/lib/supabaseClient';

type Slide = { id:number; slide_index:number; image_url:string; ocr_text:string|null };

export default function ArtifactDetail(){
  const params = useParams(); const id = params?.id as string;
  const supabase = useMemo(()=>makeBrowserClient(), []);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [cName,setCName]=useState(''); const [cDomain,setCDomain]=useState(''); const [sumLoading,setSumLoading]=useState(false); const [watchMsg,setWatchMsg]=useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load(){
    const { data, error } = await supabase.from('slides').select('id, slide_index, image_url, ocr_text').eq('artifact_id', id).order('slide_index');
    if (error) setMsg(error.message);
    setSlides(data || []);
  }
  async function save(){
    setSaving(true);
    try{
      // Push updates and re-embed server-side via API
      const payload = slides.map(s=>({ id:s.id, slide_index:s.slide_index, image_url:s.image_url, ocr_text:s.ocr_text||'' }));
      const rsp = await fetch(`/api/artifacts/${id}/slides`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ slides: payload }) });
      const j = await rsp.json();
      if (!rsp.ok) throw new Error(j?.error || rsp.statusText);
      setMsg(`Saved ${j.updated} slides; re-embedded ${j.embedded} chunks.`);
    }catch(e:any){ setMsg(e.message); }
    setSaving(false);
  }

  useEffect(()=>{ if(id) load(); }, [id]);

  async function rerunSummary(){
    setSumLoading(true);
    try{
      const rsp = await fetch(`/api/artifacts/${id}/summarize`, { method:'POST' });
      const j = await rsp.json();
      setMsg(j?.ok ? 'Summary refreshed' : (j?.error||'Summary error'));
    }catch(e:any){ setMsg(e.message); }
    setSumLoading(false);
  }

  async function watchFromArtifact(){
    setWatchMsg('Creating company...');
    try{
      const rsp = await fetch(`/api/artifacts/${id}/watch`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name:cName||'Untitled', domain:cDomain||null }) });
      const j = await rsp.json();
      setWatchMsg(j?.ok ? `Watched ${j.company?.name}` : (j?.error||'Error'));
    }catch(e:any){ setWatchMsg(e.message); }
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div><Link href="/inbox" className="text-subtle">&larr; Inbox</Link> <span className="text-subtle">/ {id?.slice(0,8)}</span></div>
        <button className="btn" onClick={save} disabled={saving}>{saving?'Saving...':'Save & Re-embed'}</button>
      </div>
      <div className="text-subtle">{msg}</div>
      <div className="card">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm mb-1">Company Name</label>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={cName} onChange={e=>setCName(e.target.value)} placeholder="ACME" />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Company Domain</label>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={cDomain} onChange={e=>setCDomain(e.target.value)} placeholder="acme.com" />
          </div>
          <button className="btn" onClick={watchFromArtifact}>Watch</button>
          <button className="btn" onClick={rerunSummary} disabled={sumLoading}>{sumLoading?'Summarizing...':'Re-run Summary'}</button>
        </div>
        <div className="text-subtle mt-2">{watchMsg}</div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {slides.map((s)=> (
          <div key={s.id} className="card">
            <div className="text-sm text-subtle mb-2">Slide {s.slide_index}</div>
            <img src={s.image_url} alt={`Slide ${s.slide_index}`} className="rounded-xl border border-neutral-800 w-full" />
            <textarea className="mt-3 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-sm h-40"
              value={s.ocr_text||''}
              onChange={e=>setSlides(prev=>prev.map(p=> p.id===s.id ? {...p, ocr_text:e.target.value}:p))}
              placeholder="OCR text..."/>
          </div>
        ))}
      </div>
    </main>
  );
}
