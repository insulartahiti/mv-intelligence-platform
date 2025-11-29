'use client'

import React, { useState, useEffect } from 'react'
import { Search, Filter, X, Users, Building2, Zap, Target } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface SearchFilters {
  countries?: string[]
  industries?: string[]
  types?: string[]
  taxonomy?: string[]
  seniority?: string[]
  dateRange?: {
    start?: string
    end?: string
  }
  // Legacy Neo4j filters (kept for compatibility)
  entity_type?: 'person' | 'organization'
  pipeline_stage?: string
  fund?: string
  internal_owner?: boolean
  linkedin_first_degree?: boolean
}

interface SearchResult {
  id: string
  name: string
  type: string
  similarity: number
  domain?: string
  industry?: string
  description?: string
  ai_summary?: string
  taxonomy?: string
  location_country?: string
  location_city?: string
  pipeline_stage?: string
  fund?: string
  updated_at?: string
  importance?: number
  // Legacy metadata structure
  metadata?: {
    domain?: string
    industry?: string
    pipeline_stage?: string
    fund?: string
    taxonomy?: string
    internal_owner?: boolean
    linkedin_first_degree?: boolean
  }
  intro_paths?: Array<{
    path: string[]
    strength: number
    description: string
  }>
  // NEW: Connected edges
  related_edges?: Array<{
    targetId: string
    targetName: string
    relationship: string
    confidence: number
  }>
}

interface GraphSearchPanelProps {
  onSearch: (query: string, filters: SearchFilters) => void
  onClear: () => void
  onResultClick?: (result: SearchResult) => void
  searchResults: SearchResult[]
  isLoading: boolean
  aiInsight?: string | null
}

// Custom Markdown Link Component to make entities clickable
const EntityLink = ({ children, onNavigate }: { children: React.ReactNode, onNavigate: (name: string) => void }) => {
  return (
    <span 
      onClick={() => onNavigate(String(children))}
      className="text-blue-400 hover:text-blue-300 cursor-pointer font-medium underline decoration-blue-400/30 hover:decoration-blue-300 transition-colors"
    >
      {children}
    </span>
  )
}

const PIPELINE_STAGES = [
  'Qualified',
  'Due Diligence',
  'Portfolio MVF1',
  'Portfolio MVF2',
  'Rejected',
  'On Hold'
]

const FUNDS = ['MVF1', 'MVF2', 'MVF3']

const INDUSTRIES = [
  'Fintech',
  'SaaS',
  'AI/ML',
  'Healthcare',
  'E-commerce',
  'Cybersecurity',
  'Blockchain',
  'EdTech',
  'PropTech',
  'ClimateTech'
]

const TAXONOMIES = [
  'B2B',
  'B2C',
  'Enterprise',
  'SMB',
  'Consumer',
  'Developer Tools',
  'Infrastructure',
  'Platform'
]

const SENIORITY_LEVELS = [
  'Executive',
  'Senior',
  'Mid-Level',
  'Junior'
]

export default function GraphSearchPanel(props: GraphSearchPanelProps) {
  const {
    onSearch,
    onClear,
    onResultClick,
    searchResults,
    isLoading
  } = props

  const [query, setQuery] = useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [filters, setFilters] = useState<SearchFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [activeFilterCount, setActiveFilterCount] = useState(0)
  const [countryInput, setCountryInput] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [insight, setInsight] = useState<string | null>(null)
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false)

  // Sync internal insight state with prop
  useEffect(() => {
    if (props.aiInsight) {
      setInsight(props.aiInsight)
    }
  }, [props.aiInsight])

  // Count active filters
  useEffect(() => {
    const count = Object.values(filters).filter(value =>
      value !== undefined && value !== '' && value !== false
    ).length
    setActiveFilterCount(count)
  }, [filters])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Get query from state or ref as fallback
    const effectiveQuery = inputRef.current?.value || query;

    if (effectiveQuery.trim()) {
      // Construct the new filters format
      const searchFilters: any = {}

      // Add country filter
      if (countryInput.trim()) {
        searchFilters.countries = countryInput.split(',').map(s => s.trim())
      }

      // Add industry filter (convert to array)
      if (filters.industries && filters.industries.length > 0) {
        searchFilters.industries = filters.industries
      }

      // Add type filter
      if (filters.types && filters.types.length > 0) {
        searchFilters.types = filters.types
      }

      // Add taxonomy filter
      if (filters.taxonomy && filters.taxonomy.length > 0) {
        searchFilters.taxonomy = filters.taxonomy
      }

      // Add seniority filter
      if (filters.seniority && filters.seniority.length > 0) {
        searchFilters.seniority = filters.seniority
      }

      // Add date range filter
      if (dateStart || dateEnd) {
        searchFilters.dateRange = {
          start: dateStart || undefined,
          end: dateEnd || undefined
        }
      }

      // Call the parent onSearch handler directly
      // The parent component (page.tsx) handles the actual API call
      onSearch(effectiveQuery.trim(), searchFilters)
    }
  }

  const handleClear = () => {
    setQuery('')
    setFilters({})
    setCountryInput('')
    setDateStart('')
    setDateEnd('')
    setInsight(null)
    onClear()
  }

  const [history, setHistory] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])

  const handleGenerateInsight = async () => {
    if (!query.trim()) return
    
    setIsGeneratingInsight(true)
    setInsight(null)
    
    // Add user query to history immediately
    const newHistory = [...history, { role: 'user' as const, content: query }]
    setHistory(newHistory)

    try {
      const res = await fetch('/api/universal-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // We now hit universal-search which routes to RAG if intent is MARKET_INSIGHT
        // But here we force it by calling the insight button.
        // Wait, the Insight button is a direct "Force RAG" action.
        // It should probably call the universal search with a flag or we should keep using the direct endpoint if we want to force it?
        // Actually, let's use universal-search but we need to ensure it triggers RAG. 
        // Or better: The current architecture routes based on intent. 
        // If the user clicks "AI Insight", they EXPECT RAG.
        // So we can just call /api/graph-rag directly BUT we need to update it to accept history.
        // OR we update this button to just act as "Submit Query" but visually distinct?
        // Let's stick to calling the new universal search but maybe prepend "Analyze:" or rely on intent?
        // Actually, let's update /api/graph-rag to be the dedicated "Chat" endpoint for this mode.
        // The previous step updated /api/universal-search to handle history. Let's use that.
        body: JSON.stringify({ 
            query: query.trim(),
            history: history.map(h => ({ role: h.role, content: h.content })) // Send history
        })
      })
      
      const data = await res.json()
      
      if (data.success) {
        if (data.searchType === 'market-insight') {
             setInsight(data.data.answer)
             setHistory(prev => [...prev, { role: 'assistant', content: data.data.answer }])
        } else {
             // Fallback if universal search decided it wasn't an insight (unlikely if we clicked the button, but possible)
             // We might want to force intent if we clicked the button.
             setInsight("I performed a standard search based on your query.")
        }
      } else {
        setInsight('Failed to generate insight.')
      }
    } catch (error) {
      console.error('Insight error:', error)
      setInsight('Error generating insight.')
    } finally {
      setIsGeneratingInsight(false)
    }
  }

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === '' ? undefined : value
    }))
  }

  const clearFilter = (key: keyof SearchFilters) => {
    setFilters(prev => {
      const newFilters = { ...prev }
      delete newFilters[key]
      return newFilters
    })
  }

  const getEntityTypeIcon = (type: string) => {
    return type === 'person' ? <Users className="w-4 h-4" /> : <Building2 className="w-4 h-4" />
  }

  const getPipelineStageColor = (stage?: string) => {
    switch (stage) {
      case 'Portfolio MVF1':
      case 'Portfolio MVF2':
        return 'bg-green-900/30 text-green-300 border border-green-800'
      case 'Due Diligence':
        return 'bg-yellow-900/30 text-yellow-300 border border-yellow-800'
      case 'Qualified':
        return 'bg-blue-900/30 text-blue-300 border border-blue-800'
      case 'Rejected':
        return 'bg-red-900/30 text-red-300 border border-red-800'
      case 'On Hold':
        return 'bg-slate-800 text-slate-300 border border-slate-700'
      default:
        return 'bg-slate-800 text-slate-400 border border-slate-700'
    }
  }

  const handleEntityClick = (name: string) => {
    // Find the result in the current list that matches the name
    const match = searchResults.find(r => r.name.toLowerCase() === name.toLowerCase())
    if (match && onResultClick) {
      onResultClick(match)
    } else {
      // If not in visible results, trigger a dedicated search for this entity
      // This effectively acts as a "jump to" action
      setQuery(name)
      // We need to trigger the search. Since handleSearch uses the state/ref, 
      // we can just call onSearch directly.
      onSearch(name, {})
    }
  }

  return (
    <div className="bg-transparent mb-0 relative">
      {/* Search Input */}
      <form onSubmit={handleSearch} className="mb-4 relative z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(e as unknown as React.FormEvent);
              }
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for people, companies, or ask questions like 'fintech companies in due diligence'..."
            className="w-full pl-10 pr-32 py-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors shadow-sm"
          />
          <button type="submit" className="hidden" aria-hidden="true" />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2 z-20">
            {query && !isLoading && (
              <button
                type="button"
                onClick={handleGenerateInsight}
                disabled={isGeneratingInsight}
                className="p-2 rounded-md bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 flex items-center gap-1 text-xs font-medium border border-purple-800/50 transition-colors"
                title="Generate AI Market Insight"
              >
                <Zap className={`w-3 h-3 ${isGeneratingInsight ? 'animate-pulse' : ''}`} />
                {isGeneratingInsight ? 'Thinking...' : 'AI Insight'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-md transition-colors ${showFilters || activeFilterCount > 0
                ? 'bg-blue-900/30 text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="p-2 text-slate-400 hover:text-slate-200 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-t border-slate-800 pt-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Country
              </label>
              <input
                type="text"
                value={countryInput}
                onChange={(e) => setCountryInput(e.target.value)}
                placeholder="e.g. Germany, UK"
                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Industry */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Industry
              </label>
              <select
                value={filters.industries?.[0] || ''}
                onChange={(e) => updateFilter('industries', e.target.value ? [e.target.value] : undefined)}
                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Industries</option>
                {INDUSTRIES.map(industry => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Type
              </label>
              <select
                value={filters.types?.[0] || ''}
                onChange={(e) => updateFilter('types', e.target.value ? [e.target.value] : undefined)}
                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="person">People</option>
                <option value="organization">Organizations</option>
              </select>
            </div>

            {/* Seniority (Only show if Type is Person or All) */}
            {(!filters.types || filters.types.includes('person')) && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Seniority
                </label>
                <select
                  value={filters.seniority?.[0] || ''}
                  onChange={(e) => updateFilter('seniority', e.target.value ? [e.target.value] : undefined)}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Any Level</option>
                  {SENIORITY_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Taxonomy (Only show if Type is Organization or All) */}
            {(!filters.types || filters.types.includes('organization')) && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Taxonomy
                </label>
                <select
                  value={filters.taxonomy?.[0] || ''}
                  onChange={(e) => updateFilter('taxonomy', e.target.value ? [e.target.value] : undefined)}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {TAXONOMIES.map(tax => (
                    <option key={tax} value={tax}>{tax}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Updated After */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Updated After
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <button
                onClick={() => setFilters({})}
                className="text-sm text-slate-400 hover:text-slate-200 flex items-center"
              >
                <X className="w-4 h-4 mr-1" />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Insight Result & Chat History */}
      {(insight || history.length > 0) && (
        <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-4 mb-4 relative z-40 max-h-[400px] overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
             <div className="flex items-center gap-2 text-purple-300">
                <Zap className="w-5 h-5" />
                <span className="font-semibold">AI Market Analyst</span>
             </div>
             <button 
              onClick={() => {
                  setInsight(null)
                  setHistory([])
              }}
              className="text-purple-400 hover:text-purple-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                        msg.role === 'user' 
                        ? 'bg-purple-800/40 text-purple-100' 
                        : 'bg-slate-900/50 text-purple-200 border border-purple-800/30'
                    }`}>
                        <ReactMarkdown
                          components={{
                            strong: ({node, ...props}) => <EntityLink onNavigate={handleEntityClick}>{props.children}</EntityLink>
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                    </div>
                </div>
            ))}
            
            {/* Current loading state */}
            {isGeneratingInsight && (
                <div className="flex justify-start">
                    <div className="bg-slate-900/50 text-purple-300 rounded-lg p-3 text-sm border border-purple-800/30 animate-pulse">
                        Thinking...
                    </div>
                </div>
            )}
            
            {/* Latest insight if not yet in history (legacy handling or fresh single turn) */}
            {insight && !history.find(h => h.content === insight) && (
                 <div className="flex justify-start">
                    <div className="bg-slate-900/50 text-purple-200 rounded-lg p-3 text-sm border border-purple-800/30 w-full">
                        <ReactMarkdown
                          components={{
                            strong: ({node, ...props}) => <EntityLink onNavigate={handleEntityClick}>{props.children}</EntityLink>
                          }}
                        >
                          {insight}
                        </ReactMarkdown>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border-t border-slate-800 pt-4 bg-slate-900/95 absolute left-0 right-0 top-full mt-2 shadow-xl rounded-b-lg z-[100] max-h-[70vh] overflow-hidden flex flex-col ring-1 ring-slate-700">
          <div className="flex items-center justify-between mb-3 px-4 pt-2">
            <h3 className="text-lg font-semibold text-slate-100">
              Search Results ({searchResults.length})
            </h3>
            {isLoading && (
              <div className="flex items-center text-sm text-slate-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                Searching...
              </div>
            )}
            <button onClick={() => {
              // Close results by clearing query or similar action if needed, 
              // but mostly just let user click away or use the clear button
               onClear();
            }} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto p-4 flex-1">
            {searchResults.map((result, index) => (
              <div
                key={result.id}
                onClick={() => onResultClick?.(result)}
                className={`p-4 border border-slate-800 rounded-lg bg-slate-900 hover:bg-slate-800 transition-colors ${onResultClick ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1 text-slate-400">
                      {getEntityTypeIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-slate-100 truncate">
                        {result.name}
                      </h4>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(result.pipeline_stage || result.metadata?.pipeline_stage) && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPipelineStageColor(result.pipeline_stage || result.metadata?.pipeline_stage)}`}>
                            {result.pipeline_stage || result.metadata?.pipeline_stage}
                          </span>
                        )}
                        {(result.industry || result.metadata?.industry) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-800">
                            {result.industry || result.metadata?.industry}
                          </span>
                        )}
                        {(result.fund || result.metadata?.fund) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-900/30 text-purple-300 border border-purple-800">
                            {result.fund || result.metadata?.fund}
                          </span>
                        )}
                        {result.metadata?.internal_owner && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-800">
                            Internal
                          </span>
                        )}
                        {result.metadata?.linkedin_first_degree && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-900/30 text-orange-300 border border-orange-800">
                            LinkedIn 1st
                          </span>
                        )}
                      </div>
                      {(result.domain || result.metadata?.domain) && (
                        <p className="mt-1 text-xs text-slate-500">
                          {result.domain || result.metadata?.domain}
                        </p>
                      )}
                      
                      {/* Connected Edges Display */}
                      {result.related_edges && result.related_edges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.related_edges.map((edge, i) => (
                            <span 
                              key={i} 
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${
                                edge.relationship === 'competitor' ? 'bg-red-900/20 text-red-400 border-red-800' :
                                edge.relationship === 'partner' ? 'bg-blue-900/20 text-blue-400 border-blue-800' :
                                'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              <span className="font-medium mr-1 uppercase">{edge.relationship}</span>
                              {edge.targetName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500">
                      {Math.round(result.similarity * 100)}% match
                    </span>
                    {result.intro_paths && result.intro_paths.length > 0 && (
                      <div className="flex items-center text-xs text-blue-400">
                        <Target className="w-3 h-3 mr-1" />
                        {result.intro_paths.length} intro path{result.intro_paths.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {query && searchResults.length === 0 && !isLoading && (
        <div className="border-t border-slate-800 pt-4 text-center py-8 absolute left-0 right-0 top-full bg-slate-900/95 shadow-xl rounded-b-lg z-50 mx-6">
          <Search className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No results found</h3>
          <p className="text-slate-500">
            Try adjusting your search terms or filters to find what you're looking for.
          </p>
        </div>
      )}
    </div>
  )
}
