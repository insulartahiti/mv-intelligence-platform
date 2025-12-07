'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import CollapsibleMenu from '@/app/components/CollapsibleMenu';
import NodeDetailPanel from '@/app/components/NodeDetailPanel';
import { ChevronRight, ChevronDown, Search, Folder, Tag, Layers, Building2, Zap, FolderOpen, ArrowRight, LayoutGrid, List, AlertTriangle, X, Hash, Building } from 'lucide-react';

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

interface TaxonomySearchResult {
  type: 'taxonomy' | 'entity';
  code?: string;
  label?: string;
  description?: string;
  entity?: Company;
}

// Helper: Flatten taxonomy tree for search
function flattenTaxonomy(node: TaxonomyNode, path: string, results: { code: string; label: string; description?: string }[] = []) {
  results.push({ code: path, label: node.label, description: node.description });
  if (node.children) {
    Object.entries(node.children).forEach(([key, child]) => {
      flattenTaxonomy(child, `${path}.${key}`, results);
    });
  }
  return results;
}

const FLAT_TAXONOMY = flattenTaxonomy(TAXONOMY_TREE['IFT'], 'IFT');

export default function TaxonomyPage() {
  const [selectedPath, setSelectedPath] = useState<string>('IFT');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Entity state (lazy loaded)
  const [entities, setEntities] = useState<Company[]>([]);
  const [isEntitiesLoading, setIsEntitiesLoading] = useState(false);
  
  // Stats state
  const [stats, setStats] = useState<Record<string, number>>({});
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<TaxonomySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const BATCH_SIZE = 1000;

  // Initial Fetch - Load Stats Once
  useEffect(() => {
    const fetchStats = async () => {
        try {
            const res = await fetch('/api/taxonomy/stats');
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setStats(data.data);
                }
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setIsStatsLoading(false);
        }
    };
    fetchStats();
  }, []);

  // Fetch entities when path changes
  useEffect(() => {
    setEntities([]);
    setPage(0);
    setHasMore(true);
    fetchEntities(selectedPath, 0, true);
  }, [selectedPath]);

  const fetchEntities = async (path: string, pageNum: number, isInitial: boolean = false) => {
    if (isInitial) setIsEntitiesLoading(true);
    else setIsFetchingMore(true);

    try {
      // Fetch entities for specific path
      const res = await fetch(`/api/taxonomy/entities?code=${path}&page=${pageNum}&limit=${BATCH_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (isInitial) {
            setEntities(data.data);
          } else {
            setEntities(prev => [...prev, ...data.data]);
          }
          
          if (data.pagination) {
            setHasMore(data.pagination.hasMore);
          } else {
            setHasMore(data.data.length === BATCH_SIZE);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch taxonomy entities:', err);
    } finally {
      if (isInitial) setIsEntitiesLoading(false);
      else setIsFetchingMore(false);
    }
  };

  // Load More Handler
  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetchingMore || isEntitiesLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEntities(selectedPath, nextPage);
  }, [page, hasMore, isFetchingMore, isEntitiesLoading, selectedPath]);
  
  // Server-side Search Logic
  useEffect(() => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
          setSearchResults([]);
          return;
      }

      const timer = setTimeout(async () => {
          setIsSearching(true);
          try {
            const query = searchQuery.toLowerCase();
            const results: TaxonomySearchResult[] = [];

            // 1. Client-side Taxonomy Search (fast)
            FLAT_TAXONOMY.forEach(t => {
                const codeMatch = t.code.toLowerCase().includes(query);
                const labelMatch = t.label.toLowerCase().includes(query);
                const descMatch = t.description?.toLowerCase().includes(query);
                
                if (codeMatch || labelMatch || descMatch) {
                    results.push({
                    type: 'taxonomy',
                    code: t.code,
                    label: t.label,
                    description: t.description
                    });
                }
            });

            // 2. Server-side Entity Search
            const res = await fetch(`/api/taxonomy/entities?search=${encodeURIComponent(searchQuery)}&limit=20`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    data.data.forEach((e: Company) => {
                        results.push({
                            type: 'entity',
                            entity: e
                        });
                    });
                }
            }

            setSearchResults(results);
          } catch (error) {
              console.error('Search error:', error);
          } finally {
              setIsSearching(false);
          }
      }, 300); // Debounce

      return () => clearTimeout(timer);
  }, [searchQuery]);
  
  const handleSearchSelect = useCallback((result: TaxonomySearchResult) => {
    if (result.type === 'taxonomy' && result.code) {
      setSelectedPath(result.code);
    } else if (result.type === 'entity' && result.entity) {
      if (result.entity.taxonomy) {
        setSelectedPath(result.entity.taxonomy);
      }
      setSelectedNodeId(result.entity.id);
    }
    setSearchQuery('');
    setIsSearchFocused(false);
  }, []);

  // Robust Node Finder
  const getNodeByPath = (path: string) => {
      const parts = path.split('.');
      if (parts[0] !== 'IFT') return null; 

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
      <div className="w-[280px] border-r border-slate-800 bg-slate-900/30 flex flex-col pt-16">
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
          {isStatsLoading ? (
              <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      <p className="text-slate-400 text-sm">Loading Taxonomy Structure...</p>
                  </div>
              </div>
          ) : (
              <TaxonomyDashboard 
                 path={selectedPath} 
                 node={activeNode} 
                 entities={entities}
                 stats={stats}
                 onNavigate={setSelectedPath}
                 onCompanyClick={setSelectedNodeId}
                 searchQuery={searchQuery}
                 setSearchQuery={setSearchQuery}
                 isSearchFocused={isSearchFocused}
                 setIsSearchFocused={setIsSearchFocused}
                 searchResults={searchResults}
                 handleSearchSelect={handleSearchSelect}
                 hasMore={hasMore}
                 onLoadMore={handleLoadMore}
                 isFetchingMore={isFetchingMore}
                 isEntitiesLoading={isEntitiesLoading}
                 isSearching={isSearching}
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
    const [isExpanded, setIsExpanded] = useState(true); 
    
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

interface DashboardProps {
    path: string;
    node: any;
    entities: Company[];
    stats: Record<string, number>;
    onNavigate: (p: string) => void;
    onCompanyClick: (id: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    isSearchFocused: boolean;
    setIsSearchFocused: (f: boolean) => void;
    searchResults: TaxonomySearchResult[];
    handleSearchSelect: (r: TaxonomySearchResult) => void;
    hasMore: boolean;
    onLoadMore: () => void;
    isFetchingMore: boolean;
    isEntitiesLoading: boolean;
    isSearching: boolean;
}

function TaxonomyDashboard({ 
    path, node, entities, stats, onNavigate, onCompanyClick,
    searchQuery, setSearchQuery, isSearchFocused, setIsSearchFocused, searchResults, handleSearchSelect,
    hasMore, onLoadMore, isFetchingMore, isEntitiesLoading, isSearching
}: DashboardProps) {
    
    // Get stats directly from the stats map
    const totalBranchCount = stats[path] || 0;
    
    // Calculate subcategory stats from the stats map
    const subCategories = useMemo(() => {
        if (!node?.children) return {};
        const subs: Record<string, number> = {};
        Object.keys(node.children).forEach(key => {
            const subPath = `${path}.${key}`;
            subs[key] = stats[subPath] || 0;
        });
        return subs;
    }, [node, path, stats]);

    if (!node) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                <AlertTriangle size={48} className="text-amber-400 mb-4" />
                <h2 className="text-xl font-semibold text-slate-300 mb-2">Invalid Taxonomy Path</h2>
                <p className="text-slate-500 mb-4 max-w-md">
                    The path <code className="bg-slate-800 px-2 py-1 rounded text-amber-400">{path}</code> is not in the canonical taxonomy schema.
                </p>
                <button 
                    onClick={() => onNavigate('IFT')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
                >
                    Return to Root
                </button>
            </div>
        );
    }

    const parts = path.split('.');

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header Area */}
            <div className="p-8 pb-6 border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-20 bg-slate-950/80">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 font-mono">
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

                {/* Title Row with Stats */}
                <div className="flex items-start justify-between mb-2">
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        {node.label}
                        <span className="text-sm font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 font-mono">
                            {parts[parts.length - 1]}
                        </span>
                    </h1>
                    <div className="flex gap-3">
                        <div className="text-center bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 min-w-[90px]">
                            <div className="text-xl font-bold text-blue-400">{totalBranchCount.toLocaleString()}</div>
                            <div className="text-xs text-slate-500 uppercase">Entities</div>
                        </div>
                        <div className="text-center bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 min-w-[90px]">
                            <div className="text-xl font-bold text-emerald-400">{Object.keys(subCategories).length}</div>
                            <div className="text-xs text-slate-500 uppercase">Subcats</div>
                        </div>
                    </div>
                </div>

                {/* Subtitle / Description */}
                <p className="text-slate-400 mb-5">{node.description || 'No description available.'}</p>

                {/* Spotlight-style Search Bar */}
                <div className="relative">
                    <div className="relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search taxonomy categories or companies..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            className="w-full pl-11 pr-10 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-slate-900 transition-all"
                        />
                        {isSearching && (
                             <div className="absolute right-10 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin" />
                            </div>
                        )}
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X size={16} className="text-slate-400" />
                            </button>
                        )}
                    </div>
                    
                    {/* Search Results Dropdown */}
                    {isSearchFocused && searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-[400px] overflow-y-auto">
                            <div className="p-2">
                                {searchResults.map((result, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSearchSelect(result)}
                                        className="px-4 py-3 hover:bg-slate-800/80 cursor-pointer rounded-lg transition-colors"
                                    >
                                        {result.type === 'taxonomy' ? (
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-emerald-900/30 rounded-lg">
                                                    <Hash size={16} className="text-emerald-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium text-slate-200">{result.label}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{result.code}</div>
                                                </div>
                                                <ArrowRight size={14} className="text-slate-600" />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-900/30 rounded-lg">
                                                    <Building size={16} className="text-blue-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium text-slate-200">{result.entity?.name}</div>
                                                    <div className="text-xs text-slate-500 truncate">{result.entity?.brief_description || result.entity?.taxonomy || 'No description'}</div>
                                                </div>
                                                <ArrowRight size={14} className="text-slate-600" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* No Results */}
                    {isSearchFocused && searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-6 text-center">
                            <Search size={24} className="text-slate-600 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No results found for "{searchQuery}"</p>
                        </div>
                    )}
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
                                
                                // STRICT POLICY: Only show canonical subcategories
                                if (!childNode) return null;
                                
                                const label = childNode.label;
                                const desc = childNode.description || 'No description';

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

                {/* 2. Direct Companies Grid */}
                <section>
                    <h3 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                        <Building2 size={18} className="text-blue-400" />
                        Classified Companies
                        <span className="text-xs font-normal text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">
                            {/* We don't have exact direct count from stats easily unless we separate it, 
                               but we can use entities.length if loaded, or just show 'Displaying X' */}
                             {entities.length} loaded
                        </span>
                    </h3>
                    
                    {isEntitiesLoading && entities.length === 0 ? (
                        <div className="flex justify-center p-12">
                             <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : entities.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {entities.map(company => (
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
                
                {/* Load More Trigger */}
                {hasMore && entities.length > 0 && (
                    <div className="flex justify-center pt-8">
                        <button 
                            onClick={onLoadMore}
                            disabled={isFetchingMore}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isFetchingMore ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                                    Loading more...
                                </>
                            ) : (
                                'Load More Entities'
                            )}
                        </button>
                    </div>
                )}

                {/* Spacer for bottom scrolling */}
                <div className="h-20" />
            </div>
        </div>
    );
}
