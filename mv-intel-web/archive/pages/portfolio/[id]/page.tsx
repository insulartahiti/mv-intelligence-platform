'use client';
import { useEffect,useState } from 'react';
import { useParams } from 'next/navigation';

export default function CompanyDetail(){
  const params = useParams(); const id=params?.id as string;
  const [data,setData]=useState<any>(null);
  const [msg,setMsg]=useState('');
  useEffect(()=>{ load(); },[id]);
  async function load(){
    try{ const r=await fetch(`/api/companies/${id}`); const j=await r.json(); setData(j.data);}catch(e:any){setMsg(e.message);}
  }
  if(!data) return <div>{msg||'Loading...'}</div>;
  return (<main className="max-w-4xl mx-auto p-6 space-y-4">
    <h1 className="text-xl font-semibold">{data.name}</h1>
    <p className="text-subtle">{data.domain||''}</p>
    <p>{data.description||''}</p>
    <h2 className="font-semibold mt-4">KPIs</h2>
    <ul>{(data.metrics||[]).map((m:any,i:number)=>(<li key={i}>{m.name}: {m.value}{m.unit||''}</li>))}</ul>
    <h2 className="font-semibold mt-4">Recent News</h2>
    <ul>{(data.news||[]).map((n:any)=>(<li key={n.id}><a href={n.url}>{n.title}</a></li>))}</ul>
  </main>);
}
