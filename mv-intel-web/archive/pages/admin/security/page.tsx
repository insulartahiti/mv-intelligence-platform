'use client';
import { useEffect, useState } from 'react';

export default function SecurityAudit(){
  const [audit,setAudit]=useState<any|null>(null);
  const [msg,setMsg]=useState('');

  async function run(){
    const r = await fetch('/api/admin/security/audit');
    const j = await r.json();
    if (!r.ok) setMsg(j.error||'Audit failed'); else setAudit(j.audit||null);
  }
  useEffect(()=>{ run(); }, []);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Security Audit</h1>
          <p className="text-subtle text-sm">Checks RLS status and notes potential issues.</p>
        </div>
        <button className="btn" onClick={run}>Re-run</button>
      </header>

      <div className="text-subtle">{msg}</div>

      {!audit? <div className="text-subtle text-sm">Running…</div> : (
        <div className="card">
          <div className="font-semibold mb-2">RLS Off</div>
          {(audit.rls_off||[]).length===0? <div className="text-sm text-subtle">All public tables have RLS enabled.</div> :
            <ul className="text-sm">{audit.rls_off.map((t:any,i:number)=>(<li key={i}>{t.schema}.{t.table}</li>))}</ul>}
          <div className="text-subtle text-xs mt-3">{audit.note||''}</div>
        </div>
      )}
    </main>
  );
}
