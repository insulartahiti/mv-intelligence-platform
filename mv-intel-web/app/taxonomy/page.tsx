'use client';

import { useState, useMemo, useEffect } from 'react';
import CollapsibleMenu from '@/app/components/CollapsibleMenu';
import NodeDetailPanel from '@/app/components/NodeDetailPanel';
import { ChevronRight, ChevronDown, Search, Folder, Tag, Layers, Building2, Zap, FolderOpen, ArrowRight, LayoutGrid, List, AlertTriangle } from 'lucide-react';

// Import centralized taxonomy schema (single source of truth)
import { TAXONOMY_TREE, VALID_TAXONOMY_CODES, hasInvalidSegment, type TaxonomyNode } from '@/lib/taxonomy/schema';

// Re-export TAXONOMY_DATA for backwards compatibility
const TAXONOMY_DATA = TAXONOMY_TREE;

interface Company {
  id: string;
  name: string;
  taxonomy: string;
  brief_description?: string;
  domain?: string;
}

export default function TaxonomyPage() {
  const [selectedPath, setSelectedPath] = useState<string>('IFT');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Global entity state
  const [allEntities, setAllEntities] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial Fetch - Load Everything
  useEffect(() => {
    const fetchAllEntities = async () => {
      setIsLoading(true);
      try {
        // Fetch all entities under IFT root
        const res = await fetch('/api/taxonomy/entities?code=IFT');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setAllEntities(data.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch taxonomy entities:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllEntities();
  }, []);
  const currentNodeData = useMemo(() => {
    const parts = selectedPath.split('.');
    let current: any = TAXONOMY_DATA;
    let label = '';
    let description = '';

    // Handle root IFT specially or traverse
    for (const part of parts) {
        if (current[part]) {
            label = current[part].label;
            description = current[part].description;
            current = current[part].children || {};
        } else {
            // Traverse children if we are past root
            // This traversal is a bit simplistic, assumes TAXONOMY_DATA structure matches path exactly
            // For IFT.PAY.COM -> IFT -> children.PAY -> children.COM
            // Let's rewrite robustly
            return { label, description, children: current };
        }
    }
    return { label, description, children: current };
  }, [selectedPath]);

  // Robust Node Finder
  const getNodeByPath = (path: string) => {
      const parts = path.split('.');
      if (parts[0] !== 'IFT') return null; // Root must be IFT

      let current: any = TAXONOMY_DATA['IFT'];
      if (path === 'IFT') return { ...current, key: 'IFT' };

      for (let i = 1; i < parts.length; i++) {
          if (current.children && current.children[parts[i]]) {
              current = current.children[parts[i]];
          } else {
              return null;
          }
      }
      return { ...current, key: parts[parts.length - 1] };
  };

  const activeNode = getNodeByPath(selectedPath);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      <CollapsibleMenu />
      
      {/* LEFT SIDEBAR: Tree Navigation */}
      <div className="w-[300px] border-r border-slate-800 bg-slate-900/30 flex flex-col pt-16">
          <div className="p-4 border-b border-slate-800/50">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Taxonomy Tree</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <TaxonomySidebarTree 
                  data={TAXONOMY_DATA['IFT']} 
                  path="IFT" 
                  selectedPath={selectedPath} 
                  onSelect={setSelectedPath} 
              />
          </div>
      </div>

      {/* RIGHT MAIN AREA: Dashboard */}
      <div className="flex-1 flex flex-col pt-16 h-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
          {isLoading ? (
              <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      <p className="text-slate-400 text-sm">Loading Taxonomy Data...</p>
                  </div>
              </div>
          ) : (
              <TaxonomyDashboard 
                 path={selectedPath} 
                 node={activeNode} 
                 allEntities={allEntities}
                 onNavigate={setSelectedPath}
                 onCompanyClick={setSelectedNodeId}
              />
          )}
      </div>

      {selectedNodeId && (
          <NodeDetailPanel 
             nodeId={selectedNodeId} 
             onClose={() => setSelectedNodeId(null)}
             onSelectNode={setSelectedNodeId}
          />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SIDEBAR COMPONENTS
// ----------------------------------------------------------------------------

function TaxonomySidebarTree({ data, path, selectedPath, onSelect }: { data: any, path: string, selectedPath: string, onSelect: (p: string) => void }) {
    const [isExpanded, setIsExpanded] = useState(true); // Default expand root
    
    // Auto-expand if child is selected
    useEffect(() => {
        if (selectedPath.startsWith(path) && selectedPath !== path) {
            setIsExpanded(true);
        }
    }, [selectedPath, path]);

    const hasChildren = data.children && Object.keys(data.children).length > 0;
    const isSelected = selectedPath === path;

    return (
        <div className="select-none">
            <div 
                className={`
                    flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors mb-0.5
                    ${isSelected ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
                `}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(path);
                }}
            >
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        if (hasChildren) setIsExpanded(!isExpanded);
                    }}
                    className={`p-0.5 rounded hover:bg-slate-700/50 ${hasChildren ? 'visible' : 'invisible'}`}
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                
                <span className={`text-sm truncate ${isSelected ? 'font-medium' : ''}`}>
                    {data.label}
                </span>
            </div>

            {hasChildren && isExpanded && (
                <div className="ml-4 pl-2 border-l border-slate-800">
                    {Object.entries(data.children).map(([key, child]) => (
                        <TaxonomySidebarTree 
                            key={key} 
                            data={child} 
                            path={`${path}.${key}`} 
                            selectedPath={selectedPath} 
                            onSelect={onSelect} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------------
// DASHBOARD COMPONENTS
// ----------------------------------------------------------------------------

function TaxonomyDashboard({ path, node, allEntities, onNavigate, onCompanyClick }: { path: string, node: any, allEntities: Company[], onNavigate: (p: string) => void, onCompanyClick: (id: string) => void }) {
    // Use local filtered state derived from global 'allEntities'
    
    // Separate into Direct Matches vs Subcategories
    const { directMatches, subCategories, totalBranchCount } = useMemo(() => {
        if (!allEntities) return { directMatches: [], subCategories: {}, totalBranchCount: 0 };

        const direct: Company[] = [];
        const subs: Record<string, number> = {}; // key -> count
        let total = 0;

        // Initialize known subcategories with 0
        if (node?.children) {
            Object.keys(node.children).forEach(key => subs[key] = 0);
        }

        allEntities.forEach(c => {
            if (c.taxonomy === path) {
                direct.push(c);
                total++;
            } else if (c.taxonomy?.startsWith(path + '.')) {
                total++;
                // Determine which subcategory bucket
                const suffix = c.taxonomy.substring(path.length + 1);
                const nextSegment = suffix.split('.')[0];
                
                // Use centralized blocklist for invalid taxonomy segments
                if (nextSegment && !hasInvalidSegment(nextSegment)) {
                    subs[nextSegment] = (subs[nextSegment] || 0) + 1;
                }
            }
        });

        return { directMatches: direct, subCategories: subs, totalBranchCount: total };
    }, [allEntities, path, node]);

    if (!node) return <div className="p-10 text-slate-500">Select a category</div>;

    const parts = path.split('.');

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header Area */}
            <div className="p-8 pb-4 border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-10 bg-slate-950/80">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 font-mono">
                    {parts.map((part, i) => (
                        <div key={i} className="flex items-center gap-2">
                            {i > 0 && <ChevronRight size={12} />}
                            <span 
                                className={`cursor-pointer hover:text-blue-400 ${i === parts.length - 1 ? 'text-slate-300 font-bold' : ''}`}
                                onClick={() => onNavigate(parts.slice(0, i + 1).join('.'))}
                            >
                                {part}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                            {node.label}
                            <span className="text-sm font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 font-mono">
                                {parts[parts.length - 1]}
                            </span>
                        </h1>
                        <p className="text-slate-400 max-w-2xl">{node.description || 'No description available.'}</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-center bg-slate-900/50 p-3 rounded-lg border border-slate-800 min-w-[100px]">
                            <div className="text-2xl font-bold text-blue-400">{totalBranchCount.toLocaleString()}</div>
                            <div className="text-xs text-slate-500 uppercase">Entities</div>
                        </div>
                        <div className="text-center bg-slate-900/50 p-3 rounded-lg border border-slate-800 min-w-[100px]">
                            <div className="text-2xl font-bold text-emerald-400">{Object.keys(subCategories).length}</div>
                            <div className="text-xs text-slate-500 uppercase">Subcats</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
                
                {/* 1. Subcategories Grid */}
                {Object.keys(subCategories).length > 0 && (
                    <section>
                        <h3 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                            <Layers size={18} className="text-emerald-400" />
                            Subcategories
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {Object.entries(subCategories).map(([key, count]) => {
                                const childNode = node.children?.[key];
                                const label = childNode?.label || key.replace(/_/g, ' '); // Fallback for discovered cats
                                const desc = childNode?.description || 'Discovered Category';

                                // Hide very small discovered categories (likely noise)
                                if (!childNode && count < 3) return null;

                                return (
                                    <div 
                                        key={key}
                                        onClick={() => onNavigate(`${path}.${key}`)}
                                        className="group p-5 bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 hover:border-emerald-500/30 rounded-xl cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-2 bg-emerald-900/20 text-emerald-400 rounded-lg group-hover:bg-emerald-900/30">
                                                <Folder size={20} />
                                            </div>
                                            <span className="text-xs font-mono text-slate-500">{key}</span>
                                        </div>
                                        <h4 className="font-semibold text-slate-200 mb-1 group-hover:text-white">{label}</h4>
                                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{desc}</p>
                                        <div className="flex items-center text-xs text-slate-400 font-medium">
                                            {count.toLocaleString()} Entities
                                            <ArrowRight size={12} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* 2. Direct Companies Grid (Only if NOT at root 'IFT' - reduces noise) */}
                {path !== 'IFT' && (
                    <section>
                        <h3 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                            <Building2 size={18} className="text-blue-400" />
                            Classified Companies
                            <span className="text-xs font-normal text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">
                                {directMatches.length}
                            </span>
                        </h3>
                        
                        {directMatches.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {directMatches.map(company => (
                                    <div 
                                        key={company.id}
                                        onClick={() => onCompanyClick(company.id)}
                                        className="group relative p-5 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/50 rounded-xl cursor-pointer transition-all hover:-translate-y-1 shadow-sm hover:shadow-xl hover:shadow-blue-900/10"
                                    >
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Zap size={16} className="text-yellow-400 fill-yellow-400/20" />
                                        </div>

                                        <div className="w-10 h-10 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center text-slate-400 font-bold text-lg mb-4 border border-slate-700 group-hover:border-blue-500/30 group-hover:text-blue-400 transition-colors">
                                            {company.name.charAt(0)}
                                        </div>
                                        
                                        <h4 className="font-bold text-slate-200 mb-2 truncate pr-6">{company.name}</h4>
                                        
                                        <p className="text-sm text-slate-500 line-clamp-2 min-h-[40px] mb-4">
                                            {company.brief_description || 'No description available'}
                                        </p>

                                        <div className="flex items-center justify-between pt-4 border-t border-slate-800/50 group-hover:border-slate-700">
                                            {company.domain ? (
                                                <span className="text-xs text-slate-500 font-mono truncate max-w-[120px]">
                                                    {company.domain}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-600">No Domain</span>
                                            )}
                                            <span className="text-xs text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                View <ArrowRight size={10} />
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center">
                                <p className="text-slate-500">No companies directly classified in this category.</p>
                                <p className="text-xs text-slate-600 mt-1">Check subcategories above.</p>
                             </div>
                        )}
                    </section>
                )}
                
                {/* Spacer for bottom scrolling */}
                <div className="h-20" />
            </div>
        </div>
    );
}
