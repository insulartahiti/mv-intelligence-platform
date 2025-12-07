'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Scale, 
  FileText, 
  Loader2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  DollarSign,
  Users,
  Shield,
  Gavel,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

// Reuse types and components from the main page
interface AnalysisResult {
  id: string;
  document_name: string;
  jurisdiction: string;
  document_type: string;
  analysis: any;
  executive_summary: any[];
  flags: any;
  created_at: string;
  term_sources?: any[];
}

const flagColors: Record<string, string> = {
  GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AMBER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  RED: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const flagIcons: Record<string, React.ReactNode> = {
  GREEN: <CheckCircle size={16} />,
  AMBER: <AlertTriangle size={16} />,
  RED: <AlertCircle size={16} />
};

function FlagBadge({ flag, size = 'md' }: { flag: string; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full border ${flagColors[flag] || flagColors.AMBER}`}>
      {flagIcons[flag]}
      {flag}
    </span>
  );
}

function SnippetBadge({ url, page }: { url: string; page: number }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs ml-2 transition-colors group"
      onClick={(e) => e.stopPropagation()}
    >
      <FileText size={12} />
      <span>Page {page}</span>
      <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function CollapsibleSection({ 
  title, 
  icon, 
  children, 
  defaultOpen = false,
  badge
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-emerald-400">{icon}</div>
          <span className="font-semibold text-white">{title}</span>
          {badge}
        </div>
        {isOpen ? <ChevronDown size={20} className="text-white/50" /> : <ChevronRight size={20} className="text-white/50" />}
      </button>
      {isOpen && (
        <div className="px-6 pb-6 border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  );
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const analysisId = searchParams.get('id');
  
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId) {
      setError('No analysis ID provided');
      setLoading(false);
      return;
    }
    
    async function fetchAnalysis() {
      try {
        const response = await fetch(`/api/portfolio/legal-analysis?id=${analysisId}`);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch analysis');
        }
        
        setData(result.analysis);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchAnalysis();
  }, [analysisId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <Loader2 size={24} className="animate-spin" />
          Loading analysis...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
        <div className="font-semibold mb-2">Error</div>
        <div className="text-sm">{error || 'Analysis not found'}</div>
        <Link 
          href="/portfolio/legal/history"
          className="inline-flex items-center gap-2 mt-4 text-sm hover:text-red-300 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to History
        </Link>
      </div>
    );
  }

  const analysis = data.analysis || data;

  // Helper to find snippet for a specific term (using DB sources)
  // Section name matches the table column 'section' (e.g., 'liquidation_preference')
  const getSnippets = (section: string, termKey?: string) => {
    if (!data.term_sources) return [];
    return data.term_sources.filter(s => {
      // Direct section match
      if (s.section !== section) return false;
      // Optional term match if provided
      if (termKey && s.term_key !== termKey) return false;
      return true;
    });
  };

  // Helper to render snippets for a section (renders the first one found if multiple, or list)
  const renderSnippet = (section: string, termKey?: string) => {
    const snippets = getSnippets(section, termKey);
    if (snippets.length === 0) return null;
    // Just show the first one inline for compactness
    return <SnippetBadge url={snippets[0].snippet_url} page={snippets[0].page_number} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link 
            href="/portfolio/legal/history"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to History
          </Link>
          <h2 className="text-2xl font-bold text-white">{data.document_name}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm border border-blue-500/30">
              {data.jurisdiction}
            </span>
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-sm border border-purple-500/30">
              {data.document_type.replace(/_/g, ' ')}
            </span>
            <span className="text-white/40 text-sm">
              {new Date(data.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <Link
          href="/portfolio/legal"
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors"
        >
          Analyze New Document
        </Link>
      </div>

      {/* Executive Summary */}
      {data.executive_summary && data.executive_summary.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle className="text-emerald-400" />
            Executive Summary
          </h3>
          <div className="space-y-3">
            {data.executive_summary.map((point: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3">
                <FlagBadge flag={point.flag} size="sm" />
                <span className="text-white/80">{point.point}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flag Summary */}
      {data.flags && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(data.flags).map(([key, value]: [string, any]) => {
            if (!value || typeof value !== 'object' || !('flag' in value)) return null;
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return (
              <div key={key} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-white/50 mb-2">{label}</div>
                <FlagBadge flag={value.flag} />
              </div>
            );
          })}
        </div>
      )}

      {/* Analysis Sections */}
      {analysis.transaction_snapshot && (
        <CollapsibleSection 
          title="Transaction Snapshot" 
          icon={<DollarSign size={20} />}
          defaultOpen={true}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {analysis.transaction_snapshot.round_type && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-xs text-white/50 mb-1">Round Type</div>
                <div className="text-white font-medium">
                  {analysis.transaction_snapshot.round_type}
                  {renderSnippet('transaction_snapshot', 'round_type')}
                </div>
              </div>
            )}
            {analysis.transaction_snapshot.pre_money_valuation && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-xs text-white/50 mb-1">Pre-Money</div>
                <div className="text-white font-medium">
                  {analysis.transaction_snapshot.pre_money_valuation_currency || '$'}
                  {(analysis.transaction_snapshot.pre_money_valuation / 1000000).toFixed(1)}M
                  {renderSnippet('transaction_snapshot', 'pre_money_valuation')}
                </div>
              </div>
            )}
            {analysis.transaction_snapshot.round_size_total && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-xs text-white/50 mb-1">Round Size</div>
                <div className="text-white font-medium">
                  ${(analysis.transaction_snapshot.round_size_total / 1000000).toFixed(1)}M
                  {renderSnippet('transaction_snapshot', 'round_size_total')}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {analysis.economics && (
        <CollapsibleSection 
          title="Economics & Downside Protection" 
          icon={<Shield size={20} />}
          badge={data.flags?.economics_downside?.flag && (
            <FlagBadge flag={data.flags.economics_downside.flag} size="sm" />
          )}
        >
          <div className="mt-4 space-y-4">
            {analysis.economics.liquidation_preference && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm font-medium text-white mb-2 flex items-center justify-between">
                  <span>Liquidation Preference</span>
                  {renderSnippet('liquidation_preference')}
                </div>
                <div className="text-white/70 text-sm">
                  <p><strong>Multiple:</strong> {analysis.economics.liquidation_preference.multiple}x</p>
                  <p><strong>Type:</strong> {analysis.economics.liquidation_preference.type}</p>
                  {analysis.economics.liquidation_preference.seniority && (
                    <p><strong>Seniority:</strong> {analysis.economics.liquidation_preference.seniority}</p>
                  )}
                </div>
              </div>
            )}
            {analysis.economics.assessment && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm font-medium text-white mb-2">Assessment</div>
                <ul className="text-white/70 text-sm list-disc list-inside space-y-1">
                  {analysis.economics.assessment.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {analysis.control && (
        <CollapsibleSection 
          title="Control & Governance" 
          icon={<Users size={20} />}
          badge={data.flags?.control_governance?.flag && (
            <FlagBadge flag={data.flags.control_governance.flag} size="sm" />
          )}
        >
          <div className="mt-4 space-y-4">
            {analysis.control.board && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm font-medium text-white mb-2 flex items-center justify-between">
                  <span>Board Composition</span>
                  {renderSnippet('board_composition')}
                </div>
                <div className="text-white/70 text-sm grid grid-cols-2 gap-2">
                  {analysis.control.board.board_size && (
                    <p><strong>Size:</strong> {analysis.control.board.board_size}</p>
                  )}
                  {analysis.control.board.investor_seats && (
                    <p><strong>Investor Seats:</strong> {analysis.control.board.investor_seats}</p>
                  )}
                </div>
              </div>
            )}
            {analysis.control.assessment && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm font-medium text-white mb-2">Assessment</div>
                <ul className="text-white/70 text-sm list-disc list-inside space-y-1">
                  {analysis.control.assessment.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {analysis.legal && (
        <CollapsibleSection 
          title="GC Focus Points" 
          icon={<Gavel size={20} />}
          badge={data.flags?.legal_gc_risk?.flag && (
            <FlagBadge flag={data.flags.legal_gc_risk.flag} size="sm" />
          )}
        >
          <div className="mt-4 space-y-4">
            {analysis.legal.gc_focus_points && analysis.legal.gc_focus_points.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2"><AlertTriangle size={16} /> Key GC Focus Points</span>
                  {renderSnippet('gc_focus_points')}
                </div>
                <ul className="text-white/70 text-sm list-disc list-inside space-y-1">
                  {analysis.legal.gc_focus_points.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.legal.comfort_points && analysis.legal.comfort_points.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                <div className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2"><CheckCircle size={16} /> Comfort Points</span>
                  {renderSnippet('comfort_points')}
                </div>
                <ul className="text-white/70 text-sm list-disc list-inside space-y-1">
                  {analysis.legal.comfort_points.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Raw JSON - simplified */}
      <details className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
        <summary className="px-6 py-4 cursor-pointer text-white/50 hover:text-white transition-colors">
          View Raw Analysis JSON
        </summary>
        <div className="px-6 pb-6 border-t border-white/10">
          <pre className="mt-4 p-4 bg-black/30 rounded-lg overflow-x-auto text-xs text-white/60 max-h-96">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-6xl mx-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-white/50">
              <Loader2 size={24} className="animate-spin" />
              Loading...
            </div>
          </div>
        }>
          <AnalysisContent />
        </Suspense>
      </div>
    </div>
  );
}
