'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Download, Building2, DollarSign, Calendar, Tag, Target, Layers, ChevronRight } from 'lucide-react';

function GuideContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get('company');
  const [guide, setGuide] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company) {
      setLoading(true);
      fetch(`/api/portco-guide?company=${company}`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to load guide');
            return res.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            setGuide(data.guide);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [company]);

  if (!company) {
      return (
          <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
              <div className="text-center">
                  <div className="text-gray-400 mb-4">No company specified.</div>
                  <Link href="/import" className="text-blue-400 hover:text-blue-300">
                      ← Back to Import
                  </Link>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/import" className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 w-fit transition-colors">
          <ArrowLeft size={16} /> Back to Import
        </Link>
        
        <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-blue-500/30">
                    <Building2 className="text-blue-400" size={28} />
                </div>
                <div>
                    <div className="text-white">Portco Guide</div>
                    <div className="text-lg text-blue-400 font-normal">{company}</div>
                </div>
            </h1>
            
            {guide && (
                <button 
                    onClick={() => {
                        const blob = new Blob([JSON.stringify(guide, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${company}-guide.json`;
                        a.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-sm transition-colors border border-blue-500/30 text-blue-300"
                >
                    <Download size={16} /> Export JSON
                </button>
            )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="animate-pulse flex items-center gap-3">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  Loading configuration...
              </div>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <div className="font-semibold mb-2">Error Loading Guide</div>
              <div className="text-sm">{error}</div>
          </div>
        ) : guide ? (
          <div className="space-y-6">
              {/* Company Metadata Card */}
              <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                      <Building2 size={18} className="text-blue-400" />
                      <h2 className="font-semibold text-white">Company Metadata</h2>
                  </div>
                  <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <div className="space-y-1">
                              <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <Building2 size={12} /> Name
                              </div>
                              <div className="text-white font-medium text-lg">{guide.company_metadata?.name || '-'}</div>
                          </div>
                          <div className="space-y-1">
                              <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <DollarSign size={12} /> Currency
                              </div>
                              <div className="text-white font-mono text-lg">{guide.company_metadata?.currency || '-'}</div>
                          </div>
                          <div className="space-y-1">
                              <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <Calendar size={12} /> Fiscal Year End
                              </div>
                              <div className="text-white text-lg">{guide.company_metadata?.fiscal_year_end || '-'}</div>
                          </div>
                          <div className="space-y-1">
                              <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <Layers size={12} /> Business Models
                              </div>
                              <div className="flex flex-wrap gap-1">
                                  {(guide.company_metadata?.business_models || []).map((model: string, i: number) => (
                                      <span key={i} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                                          {model}
                                      </span>
                                  ))}
                                  {(!guide.company_metadata?.business_models?.length) && <span className="text-gray-500">-</span>}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Metrics Mapping */}
              {guide.metrics_mapping && Object.keys(guide.metrics_mapping).length > 0 && (
                  <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                              <Target size={18} className="text-green-400" />
                              <h2 className="font-semibold text-white">Metrics Mapping</h2>
                          </div>
                          <span className="text-xs text-gray-400 bg-white/10 px-2 py-1 rounded">
                              {Object.keys(guide.metrics_mapping).length} metrics configured
                          </span>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                              <thead className="bg-white/5">
                                  <tr className="border-b border-white/10">
                                      <th className="text-left px-6 py-3 text-gray-400 font-medium">Metric ID</th>
                                      <th className="text-left px-6 py-3 text-gray-400 font-medium">Labels (Search Terms)</th>
                                      <th className="text-left px-6 py-3 text-gray-400 font-medium">Type</th>
                                      <th className="text-left px-6 py-3 text-gray-400 font-medium">Priority</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {Object.entries(guide.metrics_mapping).map(([id, config]: [string, any]) => (
                                      <tr key={id} className="hover:bg-white/5 transition-colors">
                                          <td className="px-6 py-3">
                                              <code className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-mono text-xs">
                                                  {id}
                                              </code>
                                          </td>
                                          <td className="px-6 py-3">
                                              <div className="flex flex-wrap gap-1">
                                                  {(config.labels || []).map((label: string, i: number) => (
                                                      <span key={i} className="text-xs text-gray-300 bg-white/10 px-2 py-0.5 rounded">
                                                          {label}
                                                      </span>
                                                  ))}
                                              </div>
                                          </td>
                                          <td className="px-6 py-3 text-gray-400">
                                              {config.type || 'number'}
                                          </td>
                                          <td className="px-6 py-3">
                                              {config.priority && (
                                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                                      config.priority === 'high' ? 'bg-red-500/20 text-red-300' :
                                                      config.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                                                      'bg-gray-500/20 text-gray-300'
                                                  }`}>
                                                      {config.priority}
                                                  </span>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {/* File Patterns */}
              {guide.file_patterns && guide.file_patterns.length > 0 && (
                  <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                          <FileText size={18} className="text-amber-400" />
                          <h2 className="font-semibold text-white">File Patterns</h2>
                      </div>
                      <div className="p-6 space-y-4">
                          {guide.file_patterns.map((pattern: any, i: number) => (
                              <div key={i} className="p-4 bg-black/20 rounded-lg border border-white/5">
                                  <div className="flex items-center gap-3 mb-2">
                                      <code className="text-amber-400 font-mono text-sm">{pattern.pattern || pattern}</code>
                                      {pattern.type && (
                                          <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                                              {pattern.type}
                                          </span>
                                      )}
                                  </div>
                                  {pattern.description && (
                                      <div className="text-sm text-gray-400">{pattern.description}</div>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Extraction Rules */}
              {guide.extraction_rules && (
                  <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                          <Tag size={18} className="text-cyan-400" />
                          <h2 className="font-semibold text-white">Extraction Rules</h2>
                      </div>
                      <div className="p-6">
                          <pre className="font-mono text-xs text-gray-300 bg-black/30 p-4 rounded-lg overflow-x-auto">
                              {JSON.stringify(guide.extraction_rules, null, 2)}
                          </pre>
                      </div>
                  </div>
              )}

              {/* Raw JSON (Collapsed) */}
              <details className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden group">
                  <summary className="px-6 py-4 cursor-pointer bg-white/5 flex items-center gap-2 hover:bg-white/10 transition-colors">
                      <ChevronRight size={18} className="text-gray-400 group-open:rotate-90 transition-transform" />
                      <span className="font-semibold text-gray-300">Raw JSON Configuration</span>
                  </summary>
                  <div className="p-6 border-t border-white/10">
                      <pre className="font-mono text-xs text-gray-400 leading-relaxed overflow-x-auto">
                          {JSON.stringify(guide, null, 2)}
                      </pre>
                  </div>
              </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function GuideViewer() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <GuideContent />
    </Suspense>
  );
}