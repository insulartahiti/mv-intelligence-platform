'use client';

import { FileText, ArrowRight, Building2, User, Globe } from 'lucide-react';

interface SearchResultsListProps {
  nodes: any[];
  onSelectNode: (nodeId: string) => void;
}

export default function SearchResultsList({ nodes, onSelectNode }: SearchResultsListProps) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur border-t border-slate-800 p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5 text-blue-400" />
        Relevant Entities ({nodes.length})
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {nodes.map(node => {
          const props = node.properties || node;
          const isOrg = props.type === 'organization';
          
          // Determine description priority (same logic as chat)
          let description = props.business_analysis?.core_business || props.ai_summary || props.description;
          if (typeof description === 'object') description = "Detailed analysis available"; 
          
          return (
            <div 
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className="bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 rounded-lg p-4 cursor-pointer transition-all group relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${isOrg ? 'bg-purple-900/30 text-purple-400' : 'bg-blue-900/30 text-blue-400'}`}>
                    {isOrg ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-medium text-slate-200 group-hover:text-blue-400 transition-colors truncate">
                      {props.name || 'Unknown Entity'}
                    </h4>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mt-0.5 truncate">
                      {props.industry || props.type || 'Entity'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mb-3 flex-wrap">
                {props.is_portfolio && (
                  <span className="px-2 py-0.5 bg-green-900/30 text-green-400 text-[10px] font-medium uppercase tracking-wider rounded border border-green-900/50">
                    Portfolio
                  </span>
                )}
                {props.location_country && (
                    <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-[10px] rounded flex items-center gap-1">
                        <Globe className="w-3 h-3" /> {props.location_country}
                    </span>
                )}
              </div>
              
              <div className="text-sm text-slate-400 line-clamp-2 min-h-[2.5em]">
                {description || "No description available."}
              </div>
              
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <ArrowRight className="w-4 h-4 text-blue-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

