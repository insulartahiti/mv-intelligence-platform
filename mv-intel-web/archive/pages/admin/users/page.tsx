'use client';
import { useEffect, useState } from 'react';

export default function Users(){
  const [orgId,setOrgId]=useState('REPLACE_WITH_ORG_UUID');
  const [rows,setRows]=useState<any[]>([]);
  const [msg,setMsg]=useState('');

  async function load(){
    const r = await fetch(`/api/admin/users/list?orgId=${orgId}`);
    const j = await r.json();
    if (!r.ok) setMsg(j.error||'Load failed'); else setRows(j.users||[]);
  }
  async function setRole(profileId:string, role:string){
    const r = await fetch('/api/admin/users/set-role', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ profileId, role }) });
    const j = await r.json();
    if (!r.ok) setMsg(j.error||'Update failed'); else { setMsg('Updated'); load(); }
  }
  useEffect(()=>{ load(); }, [orgId]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">User Management</h1>
          <p className="text-subtle text-sm">Set roles: admin, member, viewer.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-sm mb-1">Org ID</label>
            <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={orgId} onChange={e=>setOrgId(e.target.value)} />
          </div>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </header>

      <div className="text-subtle">{msg}</div>

      <table className="w-full text-sm border-separate border-spacing-y-2">
        <thead className="text-subtle">
          <tr><th className="text-left">Name</th><th>Email</th><th>Role</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((u:any)=>(
            <tr key={u.id}>
              <td className="font-medium">{u.full_name||'—'}</td>
              <td className="text-subtle">{u.email||'—'}</td>
              <td>{u.role}</td>
              <td className="text-right space-x-2">
                <button className="btn" onClick={()=>setRole(u.id,'viewer')}>Viewer</button>
                <button className="btn" onClick={()=>setRole(u.id,'member')}>Member</button>
                <button className="btn" onClick={()=>setRole(u.id,'admin')}>Admin</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
