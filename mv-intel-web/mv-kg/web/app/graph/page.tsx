'use client';
import React, { useEffect, useState } from 'react';

type SearchResult = {
  chunk_id?: string;
  text?: string;
  artifact_id?: string;
  title?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  vec_score?: number;
  txt_sim?: number;
};

type Contact = { id?: string; full_name?: string; primary_email?: string; title?: string; linkedin_url?: string; };

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  const pre = text.slice(0, idx);
  const mid = text.slice(idx, idx + query.length);
  const post = text.slice(idx + query.length);
  return (
    <>
      {pre}
      <mark className="bg-yellow-200 text-black rounded">{mid}</mark>
      {post}
    </>
  );
}

export default function GraphSearchPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [view, setView] = useState<'search' | 'entities' | 'paths'>('search');

  const [srcId, setSrcId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [paths, setPaths] = useState<any[]>([]);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [pathsErr, setPathsErr] = useState<string | null>(null);

  async function runSearch(query: string) {
    setLoading(true); setErr(null);
    try {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-hybrid`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: query })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Search failed');
      setResults(j.results || []);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runWarmPaths() {
    setPathsLoading(true); setPathsErr(null);
    try{
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/warm-paths`;
      const r = await fetch(url, {
        method:'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ sourceContactId: srcId, targetCompanyId: companyId, k: 5 })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Warm paths failed');
      setPaths(j.paths || []);
    }catch(e:any){
      setPathsErr(e.message || String(e));
    }finally{
      setPathsLoading(false);
    }
  }

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const id = setTimeout(() => runSearch(q), 400);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph — Search & Paths</h1>
          <p className="text-sm text-neutral-400">Hybrid semantic search with citations + warm-paths intros.</p>
        </header>

        <div className="flex items-center gap-2 mb-6">
          <div className={classNames('px-3 py-1 rounded-full border cursor-pointer', view==='search'?'bg-neutral-800 border-neutral-700':'border-neutral-800')} onClick={()=>setView('search')}>Search</div>
          <div className={classNames('px-3 py-1 rounded-full border cursor-pointer', view==='entities'?'bg-neutral-800 border-neutral-700':'border-neutral-800')} onClick={()=>setView('entities')}>Entities</div>
          <div className={classNames('px-3 py-1 rounded-full border cursor-pointer', view==='paths'?'bg-neutral-800 border-neutral-700':'border-neutral-800')} onClick={()=>setView('paths')}>Warm Paths</div>
        </div>

        {view === 'search' && (
          <section>
            <div className="mb-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search companies, people, topics…"
                className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 outline-none focus:border-neutral-600"
              />
            </div>
            {loading && <div className="text-sm text-neutral-400">Searching…</div>}
            {err && <div className="text-sm text-red-400">Error: {err}</div>}
            <ul className="space-y-3">
              {results.map((r, idx) => (
                <li key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-neutral-400">{r.source_type || 'source'}{r.source_url ? ' · ' : ''}
                      {r.source_url && (
                        <a className="underline hover:text-neutral-200" href={r.source_url as string} target="_blank" rel="noreferrer">{new URL(r.source_url as string).hostname}</a>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {(r.vec_score !== undefined) && <span>sem:{(r.vec_score as number)?.toFixed(2)} </span>}
                      {(r.txt_sim !== undefined) && <span>kw:{(r.txt_sim as number)?.toFixed(2)}</span>}
                    </div>
                  </div>
                  <h3 className="mt-1 text-base font-medium">{r.title || 'Untitled Artifact'}</h3>
                  <p className="mt-2 text-sm text-neutral-200 leading-relaxed line-clamp-6">
                    <Highlight text={(r.text as string) || ''} query={q} />
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-700 hover:border-neutral-600"
                      onClick={()=>navigator.clipboard.writeText((r.text as string) || '')}
                    >Copy snippet</button>
                    {r.source_url && (
                      <a className="text-xs px-2 py-1 rounded-lg border border-neutral-700 hover:border-neutral-600" href={r.source_url as string} target="_blank" rel="noreferrer">Open source</a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!loading && q && results.length === 0 && (
              <div className="text-sm text-neutral-400">No results yet. Try another query or ingest more sources.</div>
            )}
          </section>
        )}

        {view === 'entities' && (
          <section className="text-sm text-neutral-400">
            <p>Entity explorer: hook to <code>entities</code>, <code>relations</code>, and <code>mentions</code> for rollups and citations.</p>
          </section>
        )}

        {view === 'paths' && (
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={srcId}
                onChange={(e)=>setSrcId(e.target.value)}
                placeholder="Your contact id (source)"
                className="rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 outline-none focus:border-neutral-600"
              />
              <input
                value={companyId}
                onChange={(e)=>setCompanyId(e.target.value)}
                placeholder="Target company id"
                className="rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 outline-none focus:border-neutral-600"
              />
              <button
                onClick={runWarmPaths}
                className="rounded-xl border border-neutral-700 bg-neutral-900 hover:border-neutral-600 px-4 py-3 text-sm"
              >Compute Warm Paths</button>
            </div>
            {pathsLoading && <div className="mt-3 text-sm text-neutral-400">Computing…</div>}
            {pathsErr && <div className="mt-3 text-sm text-red-400">Error: {pathsErr}</div>}
            <ul className="mt-4 space-y-3">
              {paths.map((p, i) => (
                <li key={i} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-neutral-400">Score {p.score?.toFixed(3)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {p.hops.map((h:Contact, idx:number)=>(
                      <div key={idx} className="flex items-center gap-2">
                        <span className="rounded-lg bg-neutral-800 px-3 py-1 text-xs">
                          {h.full_name || h.primary_email || h.id?.slice(0,8) || 'Contact'}
                          {h.title ? ` · ${h.title}` : ''}
                        </span>
                        {idx < p.hops.length-1 && <span className="text-neutral-600">→</span>}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {!pathsLoading && paths.length===0 && (
              <div className="mt-3 text-sm text-neutral-400">Enter your contact id and a target company id to compute intros.</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
