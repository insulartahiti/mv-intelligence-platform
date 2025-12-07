'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
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
  X
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
  const location = typeof data === 'object' ? data.source_location : null;
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

// Progress component for pipeline stages
function PipelineProgressDisplay({ progress, currentPhase }: { progress: PipelineProgress; currentPhase: string }) {
  const phases = [
    { id: 'phase1', name: 'Document Extraction', icon: <FileText size={18} /> },
    { id: 'phase2', name: 'Category Analysis', icon: <Layers size={18} /> },
    { id: 'phase3', name: 'Deal Synthesis', icon: <GitMerge size={18} /> },
    { id: 'snippets', name: 'Visual Snippets', icon: <ImageIcon size={18} /> }
  ];
  
  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl border border-blue-500/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="text-blue-400" size={20} />
        <h3 className="text-lg font-semibold text-white">Pipeline Progress</h3>
      </div>
      
      <div className="space-y-4">
        {phases.map((phase, idx) => {
          const isActive = currentPhase === phase.id;
          const isComplete = 
            (phase.id === 'phase1' && progress.phase1.completed === progress.phase1.total && progress.phase1.total > 0) ||
            (phase.id === 'phase2' && progress.phase2.completed === 4) ||
            (phase.id === 'phase3' && progress.phase3.completed) ||
            (phase.id === 'snippets' && progress.snippets.started && progress.snippets.count === progress.snippets.total && progress.snippets.total > 0);
            
          return (
            <div key={phase.id} className="flex items-center gap-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${isComplete ? 'bg-emerald-500/20 text-emerald-400' : 
                  isActive ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 
                  'bg-white/5 text-white/30'}
              `}>
                {isComplete ? <CheckCircle size={20} /> : phase.icon}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${isActive ? 'text-blue-400' : isComplete ? 'text-emerald-400' : 'text-white/50'}`}>
                    {phase.name}
                  </span>
                  <span className="text-sm text-white/50">
                    {phase.id === 'phase1' && `${progress.phase1.completed}/${progress.phase1.total}`}
                    {phase.id === 'phase2' && `${progress.phase2.completed}/4 categories`}
                    {phase.id === 'phase3' && (progress.phase3.completed ? 'Complete' : progress.phase3.started ? 'Running' : 'Pending')}
                    {phase.id === 'snippets' && progress.snippets.started && `${progress.snippets.count} generated`}
                  </span>
                </div>
                
                {phase.id === 'phase1' && isActive && progress.phase1.current && (
                  <p className="text-xs text-white/40 mt-1 truncate">
                    Processing: {progress.phase1.current}
                  </p>
                )}
                {phase.id === 'phase2' && isActive && progress.phase2.currentCategory && (
                  <p className="text-xs text-white/40 mt-1">
                    Analyzing: {progress.phase2.currentCategory}
                  </p>
                )}
                
                {(phase.id === 'phase1' || phase.id === 'snippets') && (
                  <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ 
                        width: phase.id === 'phase1' 
                          ? `${progress.phase1.total > 0 ? (progress.phase1.completed / progress.phase1.total) * 100 : 0}%`
                          : `${progress.snippets.total > 0 ? (progress.snippets.count / progress.snippets.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc'];

function isFileSupported(file: File): boolean {
  const ext = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(e => ext.endsWith(e));
}

// Helper to convert ArrayBuffer to base64 (browser-compatible)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function LegalAnalysisPage() {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [dryRun, setDryRun] = useState(false);
  
  // Pipeline progress state
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [progress, setProgress] = useState<PipelineProgress>({
    phase1: { completed: 0, total: 0 },
    phase2: { completed: 0 },
    phase3: { started: false, completed: false },
    snippets: { count: 0, total: 0, started: false }
  });
  const [phase1Results, setPhase1Results] = useState<Phase1DocResult[]>([]);
  const [phase2Results, setPhase2Results] = useState<Phase2CategoryResult[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  
  // Ref to hold event source
  const eventSourceRef = React.useRef<EventSource | null>(null);
  
  // Drag and drop handlers
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
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(isFileSupported);
    
    if (validFiles.length === 0) {
      setError('Please upload PDF or Word documents (.pdf, .docx)');
      return;
    }
    
    setFiles(prev => [...prev, ...validFiles]);
    setError(null);
    setResult(null);
  }, []);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(isFileSupported);
    
    if (validFiles.length === 0) {
      setError('Please upload PDF or Word documents (.pdf, .docx)');
      return;
    }
    
    setFiles(prev => [...prev, ...validFiles]);
    setError(null);
    setResult(null);
  };
  
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  // State for company selection
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const [companySuggestions, setCompanySuggestions] = useState<{ id: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Company search handler
  useEffect(() => {
    const searchCompanies = async () => {
      if (companySearch.length < 2) {
        setCompanySuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(companySearch)}`);
        const data = await res.json();
        if (data.companies) {
          setCompanySuggestions(data.companies);
        }
      } catch (err) {
        console.error('Failed to search companies:', err);
      }
    };

    const timeoutId = setTimeout(searchCompanies, 300);
    return () => clearTimeout(timeoutId);
  }, [companySearch]);

  // Analysis handler using new pipeline API with SSE Streaming
  const handleAnalyze = async () => {
    if (files.length === 0) return;
    
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setPhase1Results([]);
    setPhase2Results([]);
    setProgress({
      phase1: { completed: 0, total: files.length },
      phase2: { completed: 0 },
      phase3: { started: false, completed: false },
      snippets: { count: 0, total: 0, started: false }
    });
    setCurrentPhase('phase1');
    
    try {
      // Prepare files
      const filesPayload = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          return {
            filename: file.name,
            fileBase64: arrayBufferToBase64(buffer)
          };
        })
      );
      
      // Use standard fetch but handle SSE manually
      const response = await fetch('/api/portfolio/legal-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesPayload,
          companyId: selectedCompany?.id,
          companyName: selectedCompany?.name,
          dryRun,
          stream: true // Request streaming
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start analysis');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk
        
        for (const line of lines) {
          if (!line.startsWith('event: ')) continue;
          
          const [eventLine, dataLine] = line.split('\n');
          const event = eventLine.replace('event: ', '');
          const data = JSON.parse(dataLine.replace('data: ', ''));

          switch (event) {
            case 'progress':
              // General progress update (optional)
              break;
            case 'phase1':
              setProgress(prev => ({
                ...prev,
                phase1: { 
                  completed: data.completed, 
                  total: data.total, 
                  current: data.current 
                }
              }));
              if (data.completed === data.total) setCurrentPhase('phase2');
              break;
            case 'phase2':
              setProgress(prev => ({
                ...prev,
                phase2: { 
                  completed: data.status === 'complete' ? prev.phase2.completed + 1 : prev.phase2.completed,
                  currentCategory: data.category
                }
              }));
              if (data.completed === 4) setCurrentPhase('phase3');
              break;
            case 'phase3':
              setProgress(prev => ({
                ...prev,
                phase3: { 
                  started: true, 
                  completed: data.status === 'complete' 
                }
              }));
              if (data.status === 'complete') setCurrentPhase('snippets');
              break;
            case 'snippets_start':
              setProgress(prev => ({
                ...prev,
                snippets: { count: 0, total: 100, started: true } // Total unknown initially
              }));
              break;
            case 'snippets_progress':
              setProgress(prev => ({
                ...prev,
                snippets: { 
                  count: data.count, 
                  total: data.total, 
                  started: true 
                }
              }));
              break;
            case 'complete':
              setResult({
                executiveSummary: data.result.executiveSummary || [],
                transactionSnapshot: data.result.transactionSnapshot,
                crossDocumentIssues: data.result.crossDocumentIssues,
                flagSummary: data.result.flagSummary || {},
                jurisdiction: data.result.jurisdiction || 'Unknown',
                instrumentType: data.result.instrumentType || 'OTHER'
              });
              
              // Only save final results from complete payload
              if (data.summary?.documentsAnalyzed) {
                // We'll refetch to get the full object with snippets if available
                if (data.analysisId) {
                  setAnalysisId(data.analysisId);
                  // Quick fetch to get everything clean
                  fetchAnalysis(data.analysisId);
                }
              }
              setCurrentPhase('complete');
              setIsAnalyzing(false);
              break;
            case 'error':
              setError(data.error);
              setIsAnalyzing(false);
              break;
          }
        }
      }

    } catch (err: any) {
      console.error('Pipeline error:', err);
      setError(err.message || 'Failed to analyze documents');
      setCurrentPhase('');
      setIsAnalyzing(false);
    }
  };
  
  // Helper to fetch full analysis including snippets
  const fetchAnalysis = async (id: string) => {
    try {
      const res = await fetch(`/api/portfolio/legal-pipeline?id=${id}`);
      const data = await res.json();
      if (data.success) {
        setPhase1Results(data.analysis.analysis.phase1 || []);
        setPhase2Results(data.analysis.analysis.phase2 || []);
      }
    } catch (e) {
      console.error('Failed to fetch analysis details', e);
    }
  };
  
  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setPhase1Results([]);
    setPhase2Results([]);
    setError(null);
    setCurrentPhase('');
    setProgress({
      phase1: { completed: 0, total: 0 },
      phase2: { completed: 0 },
      phase3: { started: false, completed: false },
      snippets: { count: 0, total: 0, started: false }
    });
  };
  
  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Scale className="text-emerald-400" />
            Legal Document Analysis
          </h1>
          <p className="text-white/60">
            Upload term sheets, SPAs, SHAs, SAFEs, CLAs, or other investor documentation for structured analysis.
          </p>
          <p className="text-emerald-400/70 text-sm mt-1">
            ✨ New 3-phase pipeline with visual snippet generation
          </p>
        </div>
        
        {/* Main Content */}
        {!result ? (
          <div className="space-y-6">
            {/* Upload Area */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-2xl p-12 text-center transition-all
                ${dragActive 
                  ? 'border-emerald-400 bg-emerald-500/10' 
                  : files.length > 0 
                    ? 'border-emerald-500/50 bg-emerald-500/5' 
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }
              `}
            >
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isAnalyzing}
              />
              
              {files.length > 0 ? (
                <div className="space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                    <FileText size={32} className="text-emerald-400" />
                  </div>
                  
                  <div className="space-y-2 max-w-md mx-auto max-h-48 overflow-y-auto">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText size={16} className={file.name.endsWith('.pdf') ? 'text-red-400' : 'text-blue-400'} />
                          <div className="text-left">
                            <p className="text-white text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                            <p className="text-white/40 text-xs">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        {!isAnalyzing && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                            className="text-white/30 hover:text-red-400 transition-colors p-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <p className="text-emerald-400 text-sm">
                    {files.length} document{files.length > 1 ? 's' : ''} ready for analysis
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-white/10 border border-white/20">
                    <Upload size={32} className="text-white/50" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-lg">Drop your documents here</p>
                    <p className="text-white/50 text-sm">or click to browse (PDF, DOCX)</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Pipeline Progress (when analyzing) */}
            {isAnalyzing && (
              <PipelineProgressDisplay progress={progress} currentPhase={currentPhase} />
            )}
            
            {/* Options & Button */}
            <div className="space-y-4">
              {/* Company Selection */}
              <div className="relative">
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Link to Portfolio Company (Optional)
                </label>
                {selectedCompany ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-emerald-400" />
                      <span className="text-white font-medium">{selectedCompany.name}</span>
                    </div>
                    <button 
                      onClick={() => { setSelectedCompany(null); setCompanySearch(''); }}
                      className="text-white/40 hover:text-white p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={(e) => { setCompanySearch(e.target.value); setShowSuggestions(true); }}
                      className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      disabled={isAnalyzing}
                    />
                    {showSuggestions && companySuggestions.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {companySuggestions.map(company => (
                          <button
                            key={company.id}
                            onClick={() => {
                              setSelectedCompany(company);
                              setShowSuggestions(false);
                              setCompanySearch('');
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-white/5 text-white text-sm transition-colors"
                          >
                            {company.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-white/60 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="rounded border-white/20 bg-white/5"
                    disabled={isAnalyzing}
                  />
                  Dry run (don't save to database)
                </label>
                
                <button
                  onClick={handleAnalyze}
                  disabled={files.length === 0 || isAnalyzing}
                  className={`
                    flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all
                    ${files.length > 0 && !isAnalyzing
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }
                  `}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Analyzing ({progress.phase1.completed}/{progress.phase1.total})...
                    </>
                  ) : (
                    <>
                      <Scale size={20} />
                      Analyze Documents
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-2">
                <AlertCircle size={20} />
                {error}
              </div>
            )}
            
            {/* Past Analyses Link */}
            <div className="text-center pt-4">
              <Link
                href="/portfolio/legal/history"
                className="text-white/50 hover:text-white text-sm inline-flex items-center gap-2 transition-colors"
              >
                <History size={16} />
                View past analyses
              </Link>
            </div>
          </div>
        ) : (
          /* Results Display */
          <div className="space-y-6">
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
      </div>
    </div>
  );
}
