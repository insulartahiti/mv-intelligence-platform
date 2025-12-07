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
// MAIN PAGE
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

import * as Tabs from '@radix-ui/react-tabs';
import { LegalConfigEditor } from './components/LegalConfigEditor';

// =============================================================================
// MAIN PAGE
// =============================================================================

// ... (keep existing imports and types)

// Move existing page content into a sub-component
function LegalAnalysisUploadView({ 
  onHistoryClick 
}: { 
  onHistoryClick: () => void 
}) {
  const [dragActive, setDragActive] = useState(false);
  // ... (paste all existing state and logic from LegalAnalysisPage here)
  // ...
  // Replace the Link to history with a callback or keep as Link
  // ...
  // Return the JSX for upload/analysis view
  return (
    // ... existing JSX ...
  );
}

// But since extracting 1000 lines of code into a sub-component via search_replace is risky and hard,
// I will instead wrap the existing return statement.

export default function LegalAnalysisPage() {
  const [activeTab, setActiveTab] = useState('analysis');

  // ... (All existing state and logic remains here) ...
  // ... (dragActive, files, isAnalyzing, etc.) ...

  // Render content based on tab, but keep state alive for analysis
  
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
            {/* Existing Upload/Analysis UI */}
            {!result ? (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Upload Area */}
                <div
                  onDragEnter={handleDrag}
                  // ... rest of existing JSX ...
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
