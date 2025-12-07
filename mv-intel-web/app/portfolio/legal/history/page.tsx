'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Scale, 
  FileText, 
  Calendar, 
  Building2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Briefcase,
  FolderOpen
} from 'lucide-react';

interface AnalysisSummary {
  id: string;
  document_name: string;
  document_type: string;
  jurisdiction: string;
  executive_summary: { point: string; flag: string; category: string }[];
  flags: {
    economics_downside?: { flag: string };
    control_governance?: { flag: string };
    legal_gc_risk?: { flag: string };
  };
  created_at: string;
  company_id?: string;
}

const flagColors: Record<string, string> = {
  GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AMBER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  RED: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const flagIcons: Record<string, React.ReactNode> = {
  GREEN: <CheckCircle size={14} />,
  AMBER: <AlertTriangle size={14} />,
  RED: <AlertCircle size={14} />
};

// Helper to parse filename into structured metadata
function parseMetadata(name: string) {
  // Remove extension
  const cleanName = name.replace(/\.(docx|pdf|doc)$/i, '');
  
  // Try to split by " - " which is the standard separator
  const parts = cleanName.split(' - ').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Assumption: Company - Deal/Round - Document Name
    // e.g. "Zocks Inc - Series A - SPA"
    return {
      company: parts[0],
      deal: parts[1],
      docName: parts.slice(2).join(' - ')
    };
  } else if (parts.length === 2) {
    // Assumption: Company - Document Name
    return {
      company: parts[0],
      deal: 'General',
      docName: parts[1]
    };
  }
  
  return {
    company: 'Uncategorized',
    deal: 'General',
    docName: cleanName
  };
}

interface GroupedAnalyses {
  [company: string]: {
    [deal: string]: AnalysisSummary[];
  };
}

function AnalysisCard({ analysis, displayName }: { analysis: AnalysisSummary; displayName: string }) {
  return (
    <Link
      href={`/portfolio/legal/analysis?id=${analysis.id}`}
      className="block bg-white/5 hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/30 rounded-lg p-4 transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Document Info */}
          <div className="flex items-center gap-2 mb-2">
            <FileText size={18} className="text-emerald-400 shrink-0" />
            <h4 className="text-base font-medium text-white group-hover:text-emerald-400 transition-colors truncate" title={displayName}>
              {displayName}
            </h4>
          </div>
          
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs border border-blue-500/20">
              {analysis.jurisdiction}
            </span>
            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded text-xs border border-purple-500/20">
              {analysis.document_type.replace(/_/g, ' ')}
            </span>
            <span className="flex items-center gap-1 text-white/40 text-xs ml-auto">
              <Calendar size={10} />
              {new Date(analysis.created_at).toLocaleDateString()}
            </span>
          </div>
          
          {/* Flag Summary */}
          {analysis.flags && (
            <div className="flex flex-wrap items-center gap-2">
              {analysis.flags.economics_downside?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.economics_downside.flag]}`}>
                  {flagIcons[analysis.flags.economics_downside.flag]}
                  Economics
                </span>
              )}
              {analysis.flags.control_governance?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.control_governance.flag]}`}>
                  {flagIcons[analysis.flags.control_governance.flag]}
                  Control
                </span>
              )}
              {analysis.flags.legal_gc_risk?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.legal_gc_risk.flag]}`}>
                  {flagIcons[analysis.flags.legal_gc_risk.flag]}
                  Legal
                </span>
              )}
            </div>
          )}
        </div>
        
        <ChevronRight size={18} className="text-white/20 group-hover:text-emerald-400 transition-colors shrink-0 mt-1" />
      </div>
    </Link>
  );
}

function CompanySection({ company, deals }: { company: string; deals: { [key: string]: AnalysisSummary[] } }) {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="mb-6 bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Building2 className="text-white/70" size={20} />
          <h2 className="text-lg font-bold text-white">{company}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
            {Object.values(deals).reduce((acc, curr) => acc + curr.length, 0)} docs
          </span>
        </div>
        {isOpen ? <ChevronDown size={20} className="text-white/50" /> : <ChevronRight size={20} className="text-white/50" />}
      </button>
      
      {isOpen && (
        <div className="p-4 space-y-6">
          {Object.entries(deals).map(([deal, docs]) => (
            <div key={deal}>
              {deal !== 'General' && (
                <div className="flex items-center gap-2 mb-3 text-white/60">
                  <FolderOpen size={16} className="text-emerald-500/60" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">{deal}</h3>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {docs.map(doc => {
                  const { docName } = parseMetadata(doc.document_name);
                  return <AnalysisCard key={doc.id} analysis={doc} displayName={docName} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LegalHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalyses() {
      try {
        const response = await fetch('/api/portfolio/legal-analysis?limit=100');
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch analyses');
        }
        
        setAnalyses(data.analyses || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchAnalyses();
  }, []);

  const groupedAnalyses = useMemo(() => {
    const groups: GroupedAnalyses = {};
    
    analyses.forEach(analysis => {
      const { company, deal } = parseMetadata(analysis.document_name);
      
      if (!groups[company]) {
        groups[company] = {};
      }
      if (!groups[company][deal]) {
        groups[company][deal] = [];
      }
      
      groups[company][deal].push(analysis);
    });
    
    return groups;
  }, [analyses]);

  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/portfolio/legal"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Analysis
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Scale className="text-emerald-400" />
                Analysis History
              </h1>
              <p className="text-white/60 mt-2">
                Unified view of all analyzed legal documents grouped by company and deal.
              </p>
            </div>
            <Link
              href="/portfolio/legal"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <FileText size={18} />
              New Analysis
            </Link>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-white/50">
              <Loader2 size={24} className="animate-spin" />
              Loading analyses...
            </div>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            <div className="font-semibold mb-2">Error Loading History</div>
            <div className="text-sm">{error}</div>
          </div>
        ) : Object.keys(groupedAnalyses).length === 0 ? (
          <div className="p-12 bg-white/5 border border-white/10 rounded-2xl text-center">
            <Scale size={48} className="mx-auto text-white/20 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Analyses Yet</h3>
            <p className="text-white/50 mb-6">
              Upload your first legal document to get started
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAnalyses).sort().map(([company, deals]) => (
              <CompanySection key={company} company={company} deals={deals} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
