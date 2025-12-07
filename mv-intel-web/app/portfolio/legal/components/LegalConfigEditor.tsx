
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  RefreshCcw, 
  Check, 
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

type ConfigKey = 
  | 'legal_analysis_system_prompt'
  | 'semantic_normalization'
  | 'economics_prompt'
  | 'governance_prompt'
  | 'legal_gc_prompt'
  | 'standalone_prompt';

const CONFIG_OPTIONS: { key: ConfigKey; label: string; description: string }[] = [
  { 
    key: 'legal_analysis_system_prompt', 
    label: 'Main System Prompt', 
    description: 'The core instructions for the legal analysis agent, including jurisdiction detection and output schema.' 
  },
  { 
    key: 'semantic_normalization', 
    label: 'Semantic Normalization', 
    description: 'Rules for mapping diverse legal terms (e.g. "Veto rights") to standard keys (e.g. "protective_provisions").' 
  },
  { 
    key: 'economics_prompt', 
    label: 'Economics Prompt', 
    description: 'Instructions for extracting detailed economics terms (Liquidation Pref, Anti-Dilution, etc.) during Phase 2.' 
  },
  { 
    key: 'governance_prompt', 
    label: 'Governance Prompt', 
    description: 'Instructions for extracting governance terms (Board, Voting, Protective Provisions) during Phase 2.' 
  },
  { 
    key: 'legal_gc_prompt', 
    label: 'Legal/GC Prompt', 
    description: 'Instructions for extracting legal risks (Reps, Indemnities, Governing Law) during Phase 2.' 
  },
  { 
    key: 'standalone_prompt', 
    label: 'Standalone Doc Prompt', 
    description: 'Instructions for analyzing documents that do not fit into the main categories.' 
  }
];

// Add these defaults at the top of the file
const DEFAULT_CONFIGS: Record<ConfigKey, string> = {
  legal_analysis_system_prompt: `You are an expert legal analyst specializing in venture capital documentation. 
Your task is to analyze legal documents to extract key terms, rights, and obligations.
Identify the jurisdiction, document type, and key parties involved.`,
  
  semantic_normalization: `// Semantic Normalization Rules
// Map variations of terms to standard keys.
{
  "liquidation_preference": ["liq pref", "liquidation preference", "preference amount"],
  "voting_rights": ["voting", "voting power", "votes"],
  "drag_along": ["drag-along", "drag along rights", "forced sale"],
  "tag_along": ["tag-along", "co-sale", "right of co-sale"],
  "information_rights": ["info rights", "information rights", "financial statements"],
  "pro_rata": ["pro rata", "preemptive rights", "right of first offer"]
}`,

  economics_prompt: `Extract detailed economic terms including:
- Liquidation preference (multiple, participation, cap)
- Anti-dilution provisions (weighted average, full ratchet)
- Dividend rights (cumulative, non-cumulative, rate)
- Redemption rights
- Conversion rights`,

  governance_prompt: `Extract governance terms including:
- Board composition and designation rights
- Protective provisions (veto rights)
- Voting thresholds for key decisions
- Observer rights`,

  legal_gc_prompt: `Extract legal risk factors including:
- Representations and warranties (survival period, caps, baskets)
- Indemnification obligations
- Governing law and dispute resolution
- Exclusivity and no-shop provisions`,

  standalone_prompt: `Analyze this standalone document. 
Identify its purpose, key obligations, termination clauses, and any unusual terms.`
};

export function LegalConfigEditor() {
  const [selectedKey, setSelectedKey] = useState<ConfigKey>('legal_analysis_system_prompt');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchConfig(selectedKey);
  }, [selectedKey]);

  const fetchConfig = async (key: ConfigKey) => {
    setLoading(true);
    setStatus('idle');
    setContent(''); 
    
    try {
      const res = await fetch(`/api/portfolio/legal-config?key=${key}`);
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
      } else {
        // Content is empty/null - Load DEFAULT
        setContent(DEFAULT_CONFIGS[key] || ''); 
      }
    } catch (err) {
// ... rest of function
      console.error('Failed to fetch config:', err);
      setStatus('error');
      setErrorMessage('Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/portfolio/legal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selectedKey,
          content: content,
          description: CONFIG_OPTIONS.find(o => o.key === selectedKey)?.description
        })
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
      setStatus('error');
      setErrorMessage('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
      {/* Sidebar */}
      <div className="lg:col-span-1 bg-white/5 rounded-xl border border-white/10 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-white/10 bg-white/5">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Settings size={18} className="text-emerald-400" />
            Configuration Areas
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {CONFIG_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => setSelectedKey(option.key)}
              className={`
                w-full text-left px-4 py-3 rounded-lg text-sm transition-colors
                ${selectedKey === option.key 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                }
              `}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs opacity-60 mt-1 line-clamp-2">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="lg:col-span-3 bg-slate-900 rounded-xl border border-white/10 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
          <div>
            <h2 className="text-white font-medium">
              {CONFIG_OPTIONS.find(o => o.key === selectedKey)?.label}
            </h2>
            <p className="text-xs text-white/40 font-mono mt-1">{selectedKey}</p>
          </div>
          
          <div className="flex items-center gap-3">
            {status === 'success' && (
              <span className="text-emerald-400 text-sm flex items-center gap-1 animate-fade-in">
                <Check size={16} /> Saved
              </span>
            )}
            {status === 'error' && (
              <span className="text-red-400 text-sm flex items-center gap-1 animate-fade-in">
                <AlertCircle size={16} /> {errorMessage}
              </span>
            )}
            
            <button 
              onClick={() => fetchConfig(selectedKey)}
              disabled={loading || saving}
              className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              title="Refresh"
            >
              <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
                ${saving 
                  ? 'bg-emerald-500/50 text-white/50 cursor-wait' 
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }
              `}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10">
              <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full bg-slate-950 p-6 text-sm font-mono text-white/80 focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
              placeholder={loading ? "// Loading..." : "// Enter configuration here..."}
            />
          )}
        </div>
        
        {/* Footer Hint */}
        <div className="p-3 bg-black/40 border-t border-white/10 text-xs text-white/40 flex items-center gap-2">
          <FileText size={14} />
          Changes affect all future analyses immediately. Use with caution.
        </div>
      </div>
    </div>
  );
}

