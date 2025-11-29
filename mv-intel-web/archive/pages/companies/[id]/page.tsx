'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { makeBrowserClient } from '@/lib/supabaseClient';
import PortfolioEmailForwarder from '../../components/PortfolioEmailForwarder';
import PortfolioFileUploader from '../../components/PortfolioFileUploader';
import PortfolioFilesList from '../../components/PortfolioFilesList';
import PortfolioEmailsList from '../../components/PortfolioEmailsList';
import DynamicKPIDashboard from '../../components/DynamicKPIDashboard';

export default function CompanyProfile(){
  const params = useParams(); const id = params?.id as string;
  const supabase = useMemo(()=>makeBrowserClient(), []);
  const [header,setHeader]=useState<any>(null);
  const [metrics,setMetrics]=useState<any[]>([]);
  const [news,setNews]=useState<any[]>([]);
  const [opps,setOpps]=useState<any[]>([]);
  const [attachMsg,setAttachMsg]=useState('');
  const [context,setContext]=useState<string>('');

  async function load(){
    // Header
    const { data: comp } = await supabase.from('companies').select('id,name,domain,description,affinity_org_id').eq('id', id).single();
    setHeader(comp);

    // Metrics
    const { data: mets } = await supabase.from('metrics').select('name,value,unit,period,created_at,company_id').eq('company_id', id).order('created_at', { ascending: false }).limit(50);
    setMetrics(mets||[]);

      // News with linked flag
    const rNews = await fetch(`/api/companies/${id}/news`, { cache: 'no-store' });
    const jNews = await rNews.json();
    setNews(jNews?.items || []);


    // Opportunities from Affinity (server route uses server-side secret)
    let opps:any[] = [];
    if (comp?.affinity_org_id){
      try{
        const r = await fetch(`/api/companies/${id}/opportunities`, { cache: 'no-store' });
        const j = await r.json();
        opps = j?.opportunities || [];
      }catch{}
    }
    setOpps(opps);
    

    // Context from embeddings (top few chunks mentioning name)
    const { data: emb } = await supabase.from('embeddings').select('content,metadata').limit(20);
    const chunks = (emb||[]).filter((e:any)=> (e.content||'').toLowerCase().includes((comp?.name||'').toLowerCase()));
    setContext(chunks.map((c:any)=>c.content).slice(0,5).join('\n\n'));
  }

  
  async function attachNews(nid:string){
    setAttachMsg('Attaching...');
    try{
      const rsp = await fetch(`/api/companies/${id}/attach-news`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ newsId:nid }) });
      const j = await rsp.json();
      setAttachMsg(j?.ok ? 'Attached!' : (j?.error||'Error'));
    }catch(e:any){ setAttachMsg(e.message); }
  }

  useEffect(()=>{ if(id) load(); }, [id]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div><Link className="text-subtle" href="/companies">&larr; Companies</Link></div>
      </header>

      <div className="card">
        <div className="text-2xl font-semibold">{header?.name||'Company'}</div>
        <div className="text-subtle">{header?.domain||''}</div>
        <div className="mt-3 whitespace-pre-wrap text-sm">{header?.description||'—'}</div>
      </div>

      {/* Dynamic KPI Dashboard */}
      <DynamicKPIDashboard 
        companyId={id}
        onKPIUpdate={(kpiId) => {
          console.log('KPI updated:', kpiId);
          // Optionally refresh data
        }}
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Context</h3>
          <pre className="whitespace-pre-wrap text-sm">{context||'—'}</pre>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Quick Metrics</h3>
          <ul className="text-sm list-disc pl-6">
            {metrics.slice(0, 5).map((m,i)=>(<li key={i}><span className="font-medium">{m.name}</span>: {m.value}{m.unit?` ${m.unit}`:''} <span className="text-subtle">({m.period||''})</span></li>))}
          </ul>
        </div>
      </div>

      <div className="card"><h3 className="font-semibold mb-2">Affinity Opportunities</h3><ul className="text-sm list-disc pl-6">{opps.length?opps.map((o:any,i:number)=>(<li key={i}>{o.name} <span className='text-subtle'>({o.stage || '—'})</span></li>)):<li className='text-subtle'>—</li>}</ul></div>

      <div className="card">
        <h3 className="font-semibold mb-2">Recent News</h3>
        <ul className="text-sm list-disc pl-6">
          {news.map((n:any)=>(<li key={n.id} className='mb-2'><a className="underline" href={n.url} target="_blank">{n.title||n.url}</a> <span className="text-subtle">({n.source||''})</span></li>))}
        </ul>
      </div>

      {/* Portfolio Management Section */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <PortfolioEmailForwarder 
            companyId={id}
            onEmailForwarded={(emailId) => {
              console.log('Email forwarded:', emailId);
              // Optionally refresh emails list
            }}
          />
          <PortfolioFileUploader 
            companyId={id}
            onFileUploaded={(fileId) => {
              console.log('File uploaded:', fileId);
              // Optionally refresh files list
            }}
          />
        </div>
        
        <div className="space-y-4">
          <PortfolioFilesList companyId={id} />
          <PortfolioEmailsList companyId={id} />
        </div>
      </div>
    </main>
  );
}
