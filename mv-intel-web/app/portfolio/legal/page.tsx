'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { LegalConfigEditor } from './components/LegalConfigEditor';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  Loader2, 
  Scale, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Building2,
  DollarSign,
  Users,
  Shield,
  Gavel,
  History,
  Zap,
  Layers,
  GitMerge,
  Image as ImageIcon,
  X,
  Settings
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SourcedValue {
  value: any;
  source_quote?: string;
  source_location?: string;
  page_number?: number;
  snippet_url?: string;
}

interface ExecutiveSummaryPoint {
  point: string;
  flag: 'GREEN' | 'AMBER' | 'RED';
  category: string;
}

interface FlagSummary {
  economics?: { flag: string; justification: string };
  governance?: { flag: string; justification: string };
  dilution?: { flag: string; justification: string };
  investorRights?: { flag: string; justification: string };
  legalRisk?: { flag: string; justification: string };
}

interface PipelineProgress {
  phase1: { completed: number; total: number; current?: string };
  phase2: { completed: number; currentCategory?: string };
  phase3: { started: boolean; completed: boolean };
  snippets: { count: 0, total: 0, started: false };
}

interface Phase1DocResult {
  filename: string;
  status: string;
  documentType?: string;
  category?: string;
  jurisdiction?: string;
  keyTerms?: {
    round_type?: SourcedValue;
    valuation_cap?: SourcedValue;
    discount?: SourcedValue;
    liquidation_preference?: SourcedValue;
    anti_dilution?: SourcedValue;
    board_seats?: SourcedValue;
    protective_provisions?: any[];
    [key: string]: any;
  };
  quickFlags?: {
    hasUnusualTerms: boolean;
    flaggedItems: any[];
  };
}

interface Phase2CategoryResult {
  category: string;
  status: string;
  summary?: string[];
  flag?: string;
  analysis?: any;
  documents?: string[];
}

interface PipelineResult {
  executiveSummary: ExecutiveSummaryPoint[];
  transactionSnapshot?: any;
  crossDocumentIssues?: any;
  flagSummary: FlagSummary;
  jurisdiction: string;
  instrumentType: string;
}

// =============================================================================
// COMPONENTS
// =============================================================================

const flagColors = {
  GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AMBER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  RED: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const flagIcons = {
  GREEN: <CheckCircle size={16} />,
  AMBER: <AlertTriangle size={16} />,
  RED: <AlertCircle size={16} />
};

function FlagBadge({ flag, size = 'md' }: { flag: 'GREEN' | 'AMBER' | 'RED'; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full border ${flagColors[flag]}`}>
      {flagIcons[flag]}
      {flag}
    </span>
  );
}

// Image/PDF Modal for Snippets
function SnippetModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const isPdf = src.toLowerCase().includes('.pdf');
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl w-full h-[80vh] bg-gray-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 shrink-0">
          <h3 className="text-white font-medium flex items-center gap-2">
            <FileText size={18} className="text-emerald-400" />
            Source Snippet {isPdf ? '(PDF)' : ''}
          </h3>
          <div className="flex items-center gap-2">
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors" title="Open in new tab">
              <ExternalLink size={20} />
            </a>
            <button onClick={onClose} className="text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-900/50 overflow-hidden relative">
          {isPdf ? (
            <iframe 
              src={`${src}#toolbar=0&view=FitH`} 
              className="w-full h-full border-0" 
              title={alt}
            />
          ) : (
            <div className="w-full h-full overflow-auto flex justify-center p-4">
              <img src={src} alt={alt} className="max-w-full object-contain rounded shadow-lg" />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/10 bg-black/40 text-sm text-white/60 shrink-0">
          Viewing source for: <span className="text-emerald-400">{alt}</span>
        </div>
      </div>
    </div>
  );
}

// Component to display a value with its source quote
function SourcedValueDisplay({ label, data }: { label: string; data: SourcedValue | string | null }) {
  const [showModal, setShowModal] = useState(false);
  
  if (!data) return null;
  
  const value = typeof data === 'object' ? data.value : data;
  const quote = typeof data === 'object' ? data.source_quote : null;
  const pageNum = typeof data === 'object' ? data.page_number : null;
  const snippetUrl = typeof data === 'object' ? data.snippet_url : null;
  
  if (!value) return null;
  
  return (
    <>
      <div className="bg-black/20 rounded-lg p-3 hover:bg-black/30 transition-colors group relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-white/50">{label}</span>
          <div className="flex items-center gap-2">
            {pageNum && (
              <span className="text-xs text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">p.{pageNum}</span>
            )}
            {snippetUrl && (
              <button 
                onClick={() => setShowModal(true)}
                className="text-emerald-400 hover:text-emerald-300 transition-colors p-1"
                title="View Source Snippet"
              >
                <ImageIcon size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="text-white font-medium text-sm break-words">{String(value)}</div>
        {quote && (
          <div className="mt-2 p-2 bg-black/30 rounded border-l-2 border-emerald-500/50">
            <p className="text-xs text-white/60 italic leading-relaxed">"{quote}"</p>
          </div>
        )}
      </div>
      
      {showModal && snippetUrl && (
        <SnippetModal 
          src={snippetUrl} 
          alt={`${label}: ${value}`} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  );
}

// Component to display flagged items with sources
function FlaggedItemDisplay({ item }: { item: any }) {
  const text = typeof item === 'string' ? item : item.item || item.text;
  const quote = typeof item === 'object' ? item.source_quote : null;
  const severity = typeof item === 'object' ? item.severity : 'MEDIUM';
  const pageNum = typeof item === 'object' ? item.page_number : null;
  
  const severityColors = {
    HIGH: 'border-red-500/50 bg-red-500/10',
    MEDIUM: 'border-amber-500/50 bg-amber-500/10',
    LOW: 'border-blue-500/50 bg-blue-500/10'
  };
  
  return (
    <div className={`p-3 rounded-lg border-l-2 ${severityColors[severity as keyof typeof severityColors] || severityColors.MEDIUM}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className={severity === 'HIGH' ? 'text-red-400' : 'text-amber-400'} />
          <span className="text-sm text-white/80">{text}</span>
        </div>
        {pageNum && <span className="text-xs text-white/30 whitespace-nowrap">p.{pageNum}</span>}
      </div>
      {quote && (
        <p className="text-xs text-white/50 mt-2 italic">Source: "{quote}"</p>
      )}
    </div>
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

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function LegalAnalysisPage() {
  const [activeTab, setActiveTab] = useState('analysis');
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [phase1Results, setPhase1Results] = useState<Phase1DocResult[]>([]);
  const [phase2Results, setPhase2Results] = useState<Phase2CategoryResult[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>({
    phase1: { completed: 0, total: 0 },
    phase2: { completed: 0 },
    phase3: { started: false, completed: false },
    snippets: { count: 0, total: 0, started: false }
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setPhase1Results([]);
    setPhase2Results([]);
    setIsAnalyzing(false);
  };

  const analyzeDocs = async () => {
    if (files.length === 0) return;
    
    setIsAnalyzing(true);
    setPipelineProgress(prev => ({ ...prev, phase1: { completed: 0, total: files.length, current: 'Starting analysis...' } }));
    
    try {
      // Convert files to base64
      const filePayloads = await Promise.all(files.map(async (file) => {
        return new Promise<{ filename: string; fileBase64: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            // Handle both with and without prefix
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve({ filename: file.name, fileBase64: base64 });
          };
          reader.onerror = reject;
        });
      }));

      // Call API
      const response = await fetch('/api/portfolio/legal-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filePayloads })
      });

      const data = await response.json();
      
      if (!data.success) throw new Error(data.error || 'Analysis failed');

      // Use the first successful analysis for the UI (simplification)
      const analysis = data.analyses?.[0]?.analysis || data.analysis;
      
      if (analysis) {
          setResult({
              executiveSummary: analysis.executive_summary || [],
              transactionSnapshot: analysis.transaction_snapshot,
              crossDocumentIssues: analysis.cross_document_issues,
              flagSummary: analysis.flags || {},
              jurisdiction: analysis.jurisdiction || 'Unknown',
              instrumentType: analysis.document_type || 'Unknown'
          });

          // Populate Phase 1 results
          setPhase1Results(files.map(f => ({
              filename: f.name,
              status: 'complete',
              documentType: analysis.document_type,
              category: 'Legal',
              jurisdiction: analysis.jurisdiction,
              keyTerms: analysis.transaction_snapshot || {}, 
              quickFlags: { hasUnusualTerms: false, flaggedItems: [] }
          })));

          // Populate Phase 2 results
          setPhase2Results([
             { category: 'economics', status: 'complete', analysis, flag: analysis.flags?.economics_downside?.flag },
             { category: 'governance', status: 'complete', analysis, flag: analysis.flags?.control_governance?.flag },
             { category: 'legal_gc', status: 'complete', analysis, flag: analysis.flags?.legal_gc_risk?.flag }
          ]);
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Check console for details.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Scale className="text-emerald-400" />
              Legal Intelligence
            </h1>
            <p className="text-white/60">
              AI-powered analysis of investor documentation and legal risk.
            </p>
          </div>
        </div>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <Tabs.List className="flex border-b border-white/10 mb-8">
            <Tabs.Trigger 
              value="analysis"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <FileText size={16} />
              New Analysis
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="history"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <History size={16} />
              History
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="config"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <Settings size={16} />
              Configuration
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="analysis" className="focus:outline-none">
            {!result ? (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Upload Area */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`
                    border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
                    ${dragActive 
                      ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                      : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/5'}
                  `}
                >
                  <input
                    type="file"
                    multiple
                    onChange={handleChange}
                    className="hidden"
                    id="file-upload"
                    accept=".pdf,.docx,.doc"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer block h-full w-full">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
                      <Upload size={32} />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">
                      Upload Investment Documents
                    </h3>
                    <p className="text-white/50 mb-6 max-w-md mx-auto">
                      Drag and drop term sheets, SPAs, SHAs, or convertible notes.
                      <br />
                      <span className="text-xs opacity-70">Supports PDF and Word documents</span>
                    </p>
                    <span className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-medium transition-colors">
                      Select Files
                    </span>
                  </label>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                      <h4 className="font-medium text-white flex items-center gap-2">
                        <FileText size={16} className="text-emerald-400" />
                        Selected Documents ({files.length})
                      </h4>
                      <button 
                        onClick={() => setFiles([])}
                        className="text-xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="divide-y divide-white/10">
                      {files.map((file, idx) => (
                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                              {file.name.split('.').pop()?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{file.name}</p>
                              <p className="text-xs text-white/40">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleRemoveFile(idx)}
                            className="p-2 text-white/20 hover:text-red-400 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-black/20 border-t border-white/10 flex justify-end">
                      <button
                        onClick={analyzeDocs}
                        disabled={isAnalyzing}
                        className={`
                          flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all
                          ${isAnalyzing 
                            ? 'bg-emerald-500/50 cursor-wait' 
                            : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'}
                        `}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Analyzing Deal...
                          </>
                        ) : (
                          <>
                            <Zap size={18} />
                            Start Analysis
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Progress Overlay */}
                {isAnalyzing && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Loader2 size={24} className="animate-spin" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">Analyzing Deal Structure</h3>
                            <p className="text-white/60 text-sm">Processing documents with AI...</p>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          {/* Phase 1 */}
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                              pipelineProgress.phase1.completed > 0 ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/40'
                            }`}>1</div>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-white/80">Extracting Key Terms</span>
                                <span className="text-white/40">{pipelineProgress.phase1.completed}/{pipelineProgress.phase1.total}</span>
                              </div>
                              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${(pipelineProgress.phase1.completed / Math.max(pipelineProgress.phase1.total, 1)) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Phase 2 */}
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                              pipelineProgress.phase2.completed > 0 ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/40'
                            }`}>2</div>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-white/80">Deep Category Analysis</span>
                                <span className="text-white/40">{pipelineProgress.phase2.currentCategory || 'Pending...'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {/* Result Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Deal Analysis Complete</h2>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm border border-blue-500/30">
                        {result.jurisdiction}
                      </span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-sm border border-purple-500/30">
                        {result.instrumentType.replace(/_/g, ' ')}
                      </span>
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm border border-emerald-500/30">
                        {files.length} documents analyzed
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  >
                    Analyze Another Deal
                  </button>
                </div>
                
                {/* Executive Summary */}
                <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <CheckCircle className="text-emerald-400" />
                    Executive Summary
                  </h3>
                  <div className="space-y-3">
                    {result.executiveSummary?.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <FlagBadge flag={point.flag} size="sm" />
                        <span className="text-white/80">{point.point}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Flag Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {result.flagSummary && Object.entries(result.flagSummary).map(([key, value]) => {
                    if (!value || typeof value !== 'object') return null;
                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    return (
                      <div key={key} className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="text-xs text-white/50 mb-2">{label}</div>
                        <FlagBadge flag={(value.flag || 'AMBER') as 'GREEN' | 'AMBER' | 'RED'} />
                      </div>
                    );
                  })}
                </div>
                
                {/* Transaction Snapshot */}
                {result.transactionSnapshot && (
                  <CollapsibleSection 
                    title="Transaction Snapshot" 
                    icon={<DollarSign size={20} />}
                    defaultOpen={true}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      {result.transactionSnapshot.roundType && (
                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-xs text-white/50 mb-1">Round Type</div>
                          <div className="text-white font-medium">{result.transactionSnapshot.roundType}</div>
                        </div>
                      )}
                      {result.transactionSnapshot.preMoneyValuation && (
                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-xs text-white/50 mb-1">Pre-Money</div>
                          <div className="text-white font-medium">
                            ${(result.transactionSnapshot.preMoneyValuation / 1000000).toFixed(1)}M
                          </div>
                        </div>
                      )}
                      {result.transactionSnapshot.roundSize && (
                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-xs text-white/50 mb-1">Round Size</div>
                          <div className="text-white font-medium">
                            ${(result.transactionSnapshot.roundSize / 1000000).toFixed(1)}M
                          </div>
                        </div>
                      )}
                      {result.transactionSnapshot.optionPool && (
                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-xs text-white/50 mb-1">Option Pool</div>
                          <div className="text-white font-medium">
                            {(result.transactionSnapshot.optionPool.size * 100).toFixed(0)}%
                            {result.transactionSnapshot.optionPool.preMoney ? ' (pre)' : ' (post)'}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                )}
                
                {/* Cross-Document Issues */}
                {result.crossDocumentIssues && (result.crossDocumentIssues.conflicts?.length > 0 || result.crossDocumentIssues.inconsistencies?.length > 0) && (
                  <CollapsibleSection 
                    title="Cross-Document Issues" 
                    icon={<AlertTriangle size={20} />}
                    badge={<FlagBadge flag="AMBER" size="sm" />}
                  >
                    <div className="mt-4 space-y-4">
                      {result.crossDocumentIssues.conflicts?.map((conflict: any, idx: number) => (
                        <div key={idx} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                            <AlertTriangle size={16} />
                            {conflict.severity} Issue
                          </div>
                          <p className="text-white/80 text-sm">{conflict.issue}</p>
                          <p className="text-white/40 text-xs mt-1">Documents: {conflict.documents?.join(', ')}</p>
                        </div>
                      ))}
                      {result.crossDocumentIssues.missingDocuments?.length > 0 && (
                        <div className="bg-white/5 rounded-lg p-4">
                          <div className="text-white/50 text-sm font-medium mb-2">Missing Documents</div>
                          <ul className="text-white/70 text-sm list-disc list-inside">
                            {result.crossDocumentIssues.missingDocuments.map((doc: string, idx: number) => (
                              <li key={idx}>{doc}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                )}
                
                {/* Phase 2 Results - Detailed Category Analysis */}
                {phase2Results.length > 0 && phase2Results.some(r => r.analysis) && (
                  <>
                    {/* Economics Analysis */}
                    {phase2Results.find(r => r.category === 'economics')?.analysis?.economics && (
                      <CollapsibleSection 
                        title="Economics & Downside Protection (Detailed)" 
                        icon={<DollarSign size={20} />}
                        badge={<FlagBadge flag={(phase2Results.find(r => r.category === 'economics')?.flag || 'AMBER') as any} size="sm" />}
                      >
                        <div className="mt-4 space-y-4">
                          {(() => {
                            const econ = phase2Results.find(r => r.category === 'economics')?.analysis?.economics;
                            if (!econ) return null;
                            return (
                              <>
                                {econ.liquidationPreference && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Liquidation Preference</span>
                                      <FlagBadge flag={econ.liquidationPreference.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-sm">
                                      <div><span className="text-white/50">Multiple:</span> <span className="text-white">{econ.liquidationPreference.multiple}x</span></div>
                                      <div><span className="text-white/50">Type:</span> <span className="text-white">{econ.liquidationPreference.type?.replace(/_/g, ' ')}</span></div>
                                      <div><span className="text-white/50">Seniority:</span> <span className="text-white">{econ.liquidationPreference.seniority}</span></div>
                                    </div>
                                    {econ.liquidationPreference.rationale && (
                                      <p className="mt-2 text-xs text-white/60 italic">{econ.liquidationPreference.rationale}</p>
                                    )}
                                  </div>
                                )}
                                {econ.antiDilution && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Anti-Dilution</span>
                                      <FlagBadge flag={econ.antiDilution.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-white/50">Type:</span> <span className="text-white">{econ.antiDilution.type?.replace(/_/g, ' ')}</span>
                                    </div>
                                    {econ.antiDilution.exclusions?.length > 0 && (
                                      <div className="mt-2 text-xs text-white/60">
                                        Exclusions: {econ.antiDilution.exclusions.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {econ.dividends && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Dividends</span>
                                      <FlagBadge flag={econ.dividends.flag || 'GREEN'} size="sm" />
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-white/50">Rate:</span> <span className="text-white">{econ.dividends.rate || 'None'}</span>
                                      {econ.dividends.cumulative && <span className="text-amber-400 ml-2">(Cumulative)</span>}
                                    </div>
                                  </div>
                                )}
                                {econ.redemption && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Redemption</span>
                                      <FlagBadge flag={econ.redemption.flag || 'GREEN'} size="sm" />
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-white/50">Available:</span> <span className="text-white">{econ.redemption.available ? 'Yes' : 'No'}</span>
                                      {econ.redemption.terms && <p className="text-white/60 mt-1">{econ.redemption.terms}</p>}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </CollapsibleSection>
                    )}
                    
                    {/* Governance Analysis */}
                    {phase2Results.find(r => r.category === 'governance')?.analysis?.governance && (
                      <CollapsibleSection 
                        title="Control & Governance (Detailed)" 
                        icon={<Users size={20} />}
                        badge={<FlagBadge flag={(phase2Results.find(r => r.category === 'governance')?.flag || 'AMBER') as any} size="sm" />}
                      >
                        <div className="mt-4 space-y-4">
                          {(() => {
                            const gov = phase2Results.find(r => r.category === 'governance')?.analysis?.governance;
                            if (!gov) return null;
                            return (
                              <>
                                {gov.board && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Board Composition</span>
                                      <FlagBadge flag={gov.board.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                      <div><span className="text-white/50">Size:</span> <span className="text-white">{gov.board.size}</span></div>
                                      <div><span className="text-white/50">Investor:</span> <span className="text-white">{gov.board.investorSeats}</span></div>
                                      <div><span className="text-white/50">Founder:</span> <span className="text-white">{gov.board.founderSeats}</span></div>
                                      <div><span className="text-white/50">Independent:</span> <span className="text-white">{gov.board.independentSeats}</span></div>
                                    </div>
                                    <div className="mt-2 text-sm">
                                      <span className={gov.board.ourSeat ? 'text-emerald-400' : 'text-amber-400'}>
                                        {gov.board.ourSeat ? '✓ We have a board seat' : '✗ No board seat'}
                                      </span>
                                      {gov.board.observerRights && <span className="text-blue-400 ml-3">+ Observer rights</span>}
                                    </div>
                                  </div>
                                )}
                                {gov.protectiveProvisions && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Protective Provisions</span>
                                      <FlagBadge flag={gov.protectiveProvisions.flag || 'AMBER'} size="sm" />
                                    </div>
                                    {gov.protectiveProvisions.matters?.length > 0 && (
                                      <ul className="text-sm text-white/70 list-disc list-inside space-y-1">
                                        {gov.protectiveProvisions.matters.slice(0, 6).map((m: string, i: number) => (
                                          <li key={i}>{m}</li>
                                        ))}
                                        {gov.protectiveProvisions.matters.length > 6 && (
                                          <li className="text-white/50">... and {gov.protectiveProvisions.matters.length - 6} more</li>
                                        )}
                                      </ul>
                                    )}
                                  </div>
                                )}
                                {gov.dragAlong && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Drag-Along</span>
                                      <FlagBadge flag={gov.dragAlong.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="text-sm text-white/70">
                                      <p><span className="text-white/50">Threshold:</span> {gov.dragAlong.thresholds}</p>
                                      {gov.dragAlong.minimumPrice && <p><span className="text-white/50">Min Price:</span> {gov.dragAlong.minimumPrice}</p>}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </CollapsibleSection>
                    )}
                    
                    {/* Legal/GC Analysis */}
                    {phase2Results.find(r => r.category === 'legal_gc')?.analysis?.legalGC && (
                      <CollapsibleSection 
                        title="Legal / GC Focus (Detailed)" 
                        icon={<Gavel size={20} />}
                        badge={<FlagBadge flag={(phase2Results.find(r => r.category === 'legal_gc')?.flag || 'AMBER') as any} size="sm" />}
                      >
                        <div className="mt-4 space-y-4">
                          {(() => {
                            const legal = phase2Results.find(r => r.category === 'legal_gc')?.analysis?.legalGC;
                            if (!legal) return null;
                            return (
                              <>
                                {legal.repsWarranties && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Reps & Warranties</span>
                                      <FlagBadge flag={legal.repsWarranties.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-sm">
                                      <div><span className="text-white/50">Scope:</span> <span className="text-white">{legal.repsWarranties.scope}</span></div>
                                      <div><span className="text-white/50">Caps:</span> <span className="text-white">{legal.repsWarranties.caps || 'N/A'}</span></div>
                                      <div><span className="text-white/50">Survival:</span> <span className="text-white">{legal.repsWarranties.survivalPeriod || 'N/A'}</span></div>
                                    </div>
                                  </div>
                                )}
                                {legal.indemnification && (
                                  <div className="bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-white">Indemnification</span>
                                      <FlagBadge flag={legal.indemnification.flag || 'AMBER'} size="sm" />
                                    </div>
                                    <div className="text-sm">
                                      <p><span className="text-white/50">Scope:</span> <span className="text-white">{legal.indemnification.scope}</span></p>
                                      {legal.indemnification.carveouts?.length > 0 && (
                                        <p className="text-white/60 mt-1">Carveouts: {legal.indemnification.carveouts.join(', ')}</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className="bg-black/20 rounded-lg p-4">
                                  <span className="text-sm font-medium text-white">Governing Law & Disputes</span>
                                  <div className="mt-2 text-sm">
                                    <p><span className="text-white/50">Law:</span> <span className="text-white">{legal.governingLaw || 'Not specified'}</span></p>
                                    <p><span className="text-white/50">Disputes:</span> <span className="text-white">{legal.disputeResolution || 'Not specified'}</span></p>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </CollapsibleSection>
                    )}
                  </>
                )}
                
                {/* Phase 1 Results - Document Classification with Key Terms */}
                {phase1Results.length > 0 && (
                  <CollapsibleSection 
                    title="Document Details & Source Quotes" 
                    icon={<FileText size={20} />}
                  >
                    <div className="mt-4 space-y-4">
                      {phase1Results.map((doc: Phase1DocResult, idx) => (
                        <div key={idx} className="bg-black/20 rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-8 h-8 rounded flex items-center justify-center ${
                              doc.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {doc.status === 'complete' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            </div>
                            <div className="flex-1">
                              <p className="text-white font-medium">{doc.filename}</p>
                              <p className="text-white/40 text-xs">
                                {doc.documentType?.replace(/_/g, ' ')} • {doc.category} • {doc.jurisdiction}
                              </p>
                            </div>
                          </div>
                          
                          {/* Key Terms with Sources */}
                          {doc.keyTerms && Object.keys(doc.keyTerms).length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                              {doc.keyTerms.round_type && (
                                <SourcedValueDisplay label="Round Type" data={doc.keyTerms.round_type} />
                              )}
                              {doc.keyTerms.liquidation_preference && (
                                <SourcedValueDisplay label="Liquidation Preference" data={doc.keyTerms.liquidation_preference} />
                              )}
                              {doc.keyTerms.anti_dilution && (
                                <SourcedValueDisplay label="Anti-Dilution" data={doc.keyTerms.anti_dilution} />
                              )}
                              {doc.keyTerms.board_seats && (
                                <SourcedValueDisplay label="Board Seats" data={doc.keyTerms.board_seats} />
                              )}
                            </div>
                          )}
                          
                          {/* Flagged Items */}
                          {doc.quickFlags?.flaggedItems && doc.quickFlags.flaggedItems.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs text-white/50 font-medium">Flagged Items:</p>
                              {doc.quickFlags.flaggedItems.map((item, i) => (
                                <FlaggedItemDisplay key={i} item={item} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                
                {/* Footer */}
                <div className="text-center text-white/40 text-xs pt-4">
                  <p>Analysis performed using 3-phase pipeline architecture</p>
                  <p className="mt-1">This analysis is for informational purposes only and is not legal advice.</p>
                </div>
              </div>
            )}
          </Tabs.Content>

          <Tabs.Content value="config" className="focus:outline-none">
            <LegalConfigEditor />
          </Tabs.Content>

          <Tabs.Content value="history" className="focus:outline-none">
             <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-xl border border-white/10">
               <History size={48} className="text-white/20 mb-4" />
               <h3 className="text-xl font-medium text-white mb-2">Analysis History</h3>
               <p className="text-white/50 mb-6">View and manage past legal document analyses.</p>
               <Link href="/portfolio/legal/history" className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors">
                 Go to History Page
               </Link>
             </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
