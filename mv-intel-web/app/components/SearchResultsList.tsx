'use client';

import { FileText, ArrowRight, Building2, User, Globe, X } from 'lucide-react';

interface SearchResultsListProps {
  nodes: any[];
  onSelectNode: (nodeId: string) => void;
  onHoverNode?: (nodeId: string | null) => void;
  onClose?: () => void;
}

export default function SearchResultsList({ nodes, onSelectNode, onHoverNode, onClose }: SearchResultsListProps) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <div className="h-full bg-slate-900 border-r border-slate-800 flex flex-col w-full">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 backdrop-blur z-10 sticky top-0">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          Results ({nodes.length})
        </h3>
        {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
            </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
        {nodes.map(node => {
          const props = node.properties || node;
          const isOrg = props.type === 'organization';
          
          // Determine description priority
          let description = props.business_analysis?.core_business || props.ai_summary || props.description;
          if (typeof description === 'object') description = "Detailed analysis available"; 
          
          return (
            <div 
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              onMouseEnter={() => onHoverNode?.(node.id)}
              onMouseLeave={() => onHoverNode?.(null)}
              className="bg-slate-800/40 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800 rounded-lg p-3 cursor-pointer transition-all group relative"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className={`p-2 rounded-md flex-shrink-0 ${isOrg ? 'bg-purple-900/20 text-purple-400' : 'bg-blue-900/20 text-blue-400'}`}>
                  {isOrg ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm text-slate-200 group-hover:text-blue-400 transition-colors truncate pr-2">
                        {props.name || 'Unknown Entity'}
                      </h4>
                      {props.is_portfolio && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Portfolio"></span>
                      )}
                  </div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5 truncate">
                    {props.industry || props.type || 'Entity'}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                {props.is_portfolio && (
                  <span className="px-1.5 py-0.5 bg-green-900/20 text-green-400 text-[10px] font-medium uppercase tracking-wider rounded border border-green-900/30">
                    Portfolio
                  </span>
                )}
                {props.industry && (
                    <span className="px-1.5 py-0.5 bg-slate-700/30 text-slate-400 text-[10px] rounded border border-slate-700/50 truncate max-w-[120px]">
                        {props.industry}
                    </span>
                )}
                {props.location_country && (
                    <span className="px-1.5 py-0.5 bg-slate-700/30 text-slate-400 text-[10px] rounded flex items-center gap-1 border border-slate-700/50">
                        <Globe className="w-3 h-3" />
                        {props.location_country}
                    </span>
                )}
                 {props.pipeline_stage && (
                    <span className="px-1.5 py-0.5 bg-blue-900/20 text-blue-300 text-[10px] rounded border border-blue-900/30">
                        {props.pipeline_stage}
                    </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

