'use client';

import React, { useEffect, useState } from 'react';
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
  ChevronRight
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

export default function LegalHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalyses() {
      try {
        const response = await fetch('/api/portfolio/legal-analysis?limit=50');
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

  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/portfolio/legal"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Analysis
          </Link>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Scale className="text-emerald-400" />
            Analysis History
          </h1>
          <p className="text-white/60 mt-2">
            View and review past legal document analyses
          </p>
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
        ) : analyses.length === 0 ? (
          <div className="p-12 bg-white/5 border border-white/10 rounded-2xl text-center">
            <Scale size={48} className="mx-auto text-white/20 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Analyses Yet</h3>
            <p className="text-white/50 mb-6">
              Upload your first legal document to get started
            </p>
            <Link
              href="/portfolio/legal"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors"
            >
              <FileText size={20} />
              Analyze Document
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {analyses.map((analysis) => (
              <Link
                key={analysis.id}
                href={`/portfolio/legal/analysis?id=${analysis.id}`}
                className="block bg-white/5 hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/30 rounded-xl p-6 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Document Info */}
                    <div className="flex items-center gap-3 mb-2">
                      <FileText size={20} className="text-emerald-400" />
                      <h3 className="text-lg font-medium text-white group-hover:text-emerald-400 transition-colors">
                        {analysis.document_name}
                      </h3>
                    </div>
                    
                    {/* Badges */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs border border-blue-500/30">
                        {analysis.jurisdiction}
                      </span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs border border-purple-500/30">
                        {analysis.document_type.replace(/_/g, ' ')}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-1 bg-white/10 text-white/50 rounded text-xs">
                        <Calendar size={12} />
                        {new Date(analysis.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {/* Flag Summary */}
                    {analysis.flags && (
                      <div className="flex items-center gap-2">
                        {analysis.flags.economics_downside?.flag && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${flagColors[analysis.flags.economics_downside.flag]}`}>
                            {flagIcons[analysis.flags.economics_downside.flag]}
                            Economics
                          </span>
                        )}
                        {analysis.flags.control_governance?.flag && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${flagColors[analysis.flags.control_governance.flag]}`}>
                            {flagIcons[analysis.flags.control_governance.flag]}
                            Control
                          </span>
                        )}
                        {analysis.flags.legal_gc_risk?.flag && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${flagColors[analysis.flags.legal_gc_risk.flag]}`}>
                            {flagIcons[analysis.flags.legal_gc_risk.flag]}
                            Legal
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Top Executive Summary Point */}
                    {analysis.executive_summary?.[0] && (
                      <p className="text-white/50 text-sm mt-3 line-clamp-2">
                        {analysis.executive_summary[0].point}
                      </p>
                    )}
                  </div>
                  
                  <ChevronRight size={20} className="text-white/30 group-hover:text-emerald-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


