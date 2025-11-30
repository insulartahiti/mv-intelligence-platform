'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Building2,
  Users,
  ExternalLink,
  FileText,
  MessageSquare,
  Calendar,
  Target,
  Linkedin,
  Globe,
  DollarSign,
  Tag,
  Briefcase,
  Clock,
  Zap,
  Layout,
  List,
  Share2,
  RefreshCw,
  ArrowLeft
} from 'lucide-react'

interface Entity {
  id: string
  name: string
  type: 'person' | 'organization'
  domain?: string
  industry?: string
  pipeline_stage?: string
  fund?: string
  taxonomy?: string
  valuation?: string
  last_activity_date?: string
  created_date?: string
  updated_date?: string
  notes?: string
  reminders?: string
  internal_owner?: boolean
  linkedin_first_degree?: boolean
  linkedin_url?: string
  enrichment_data?: any
  employment_history?: any[]
  areas_of_expertise?: string[]
  publications?: any[]
  business_analysis?: any
  interactions?: Interaction[]
  files?: AffinityFile[]
}

interface Interaction {
  id: string
  interaction_type: string
  subject?: string
  content_preview?: string
  started_at: string
  source?: string
}

interface AffinityFile {
  id: string
  name: string
  url: string
  size_bytes: number
  ai_summary?: string
  created_at: string
}

interface IntroPath {
  pathLength: number
  nodes: any[]
  relationships: any[]
  targetNode: any
  strength: number
  description: string
  targets?: string[]
}

interface NodeDetailPanelProps {
  nodeId: string | null
  onClose: () => void
  onSelectNode?: (id: string) => void
  onBack?: () => void
}
// ... (skip TabType) ...
const RecursiveJson = ({ data }: { data: any }) => {
  if (!data) return <span className="text-slate-500 italic">Empty</span>;
  
  if (typeof data === 'object' && data !== null) {
    return (
      <div className="pl-4 border-l-2 border-slate-800 space-y-2 my-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="text-sm">
            <span className="font-semibold text-blue-400 mr-2">{key.replace(/_/g, ' ').toUpperCase()}:</span>
            <RecursiveJson data={value} />
          </div>
        ))}
      </div>
    );
  }
  
  // Handle stringified JSON
  if (typeof data === 'string') {
    try {
        const parsed = JSON.parse(data);
        if (typeof parsed === 'object') {
            return <RecursiveJson data={parsed} />;
        }
    } catch (e) {
        // Not JSON, render as string
    }
    // Handle URLs
    if (data.startsWith('http')) {
        return <a href={data} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{data}</a>;
    }
    return <span className="text-slate-300">{data}</span>;
  }

  return <span className="text-slate-300">{String(data)}</span>;
};

const RenderAnalysisContent = ({ data }: { data: any }) => {
  if (!data) return null;
  if (typeof data === 'string') return <p className="text-slate-300 leading-relaxed text-sm">{data}</p>;
  
  // Handle AI object response with "summary" key
  if (data.summary && typeof data.summary === 'string') {
      return (
          <div className="space-y-2">
              <p className="text-slate-300 leading-relaxed text-sm">{data.summary}</p>
              {/* If there are details, maybe show them in a collapsed view or just RecursiveJson */}
              {data.detail && <div className="mt-2"><RecursiveJson data={data.detail} /></div>}
          </div>
      );
  }

  // Default to RecursiveJson for complex objects
  return <div className="text-sm text-slate-300"><RecursiveJson data={data} /></div>;
};

export default function NodeDetailPanel({
  nodeId,
  onClose,
  onSelectNode,
  onBack
}: NodeDetailPanelProps) {
  const [entity, setEntity] = useState<Entity | null>(null)
  const [files, setFiles] = useState<AffinityFile[]>([])
  const [introPaths, setIntroPaths] = useState<IntroPath[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  useEffect(() => {
    if (nodeId) {
      loadEntityData()
      setActiveTab('overview')
    }
  }, [nodeId])

  const loadEntityData = async () => {
    if (!nodeId) return

    console.log('NodeDetailPanel: Loading data for nodeId:', nodeId);
    setLoading(true)
    try {
      // Load entity details from Neo4j
      console.log('NodeDetailPanel: Fetching entity details for nodeId:', nodeId);
      const entityResponse = await fetch(`/api/neo4j/node-details?id=${encodeURIComponent(nodeId)}`)
      if (entityResponse.ok) {
        const responseData = await entityResponse.json()
        console.log('NodeDetailPanel: Entity response:', responseData);
        if (responseData.success && responseData.data) {
          // Normalize the entity object: Unwrap properties if they exist
          const rawNode = responseData.data.node;
          let entityData = rawNode.properties ? { ...rawNode.properties, id: rawNode.id || rawNode.properties.id } : rawNode;
          
          // Parse enrichment_data if it is a string
          if (entityData.enrichment_data && typeof entityData.enrichment_data === 'string') {
            try {
              const parsed = JSON.parse(entityData.enrichment_data);
              entityData.enrichment_data = parsed;
              
              // If business_analysis is missing but present in parsed enrichment_data (sometimes happens), hoist it
              if (!entityData.business_analysis && parsed.business_analysis) {
                 entityData.business_analysis = parsed.business_analysis;
              }
            } catch (e) {
              console.warn('Failed to parse enrichment_data:', e);
            }
          }

          // Ensure type is lowercase for comparisons and fix "Person" case issue
          if (entityData.type) {
             entityData.type = entityData.type.toLowerCase();
          }

          setEntity(entityData)
          
          if (entityData.files) {
             setFiles(entityData.files);
          }
          
          // Set connections from the response - with deduplication logic on frontend too just in case
          if (responseData.data.connections) {
            const uniqueConnections = new Map();
            
            responseData.data.connections.forEach((conn: any) => {
               // Use a unique key based on target ID to prevent duplicates
               const targetId = conn.id;
               
               // If duplicate, only keep if the new one has higher strength
               if (!uniqueConnections.has(targetId) || (conn.relationship.strength || 0) > (uniqueConnections.get(targetId).relationship.strength || 0)) {
                  uniqueConnections.set(targetId, {
                    pathLength: 1,
                    nodes: [responseData.data.node, conn],
                    relationships: [conn.relationship],
                    targetNode: conn,
                    strength: conn.relationship.strength || 0,
                    description: `${responseData.data.node.label} → ${conn.label} (${conn.relationship.kind})`
                  });
               }
            });
            
            // If intro paths are also returned (usually from /api/neo4j/intro-paths), group them
            // But first, handle the pathsResponse logic below which overwrites this.
            // Actually, introPaths state is used for the Connections tab. 
            // We should merge or let the intro-paths API take precedence if it returns more paths.
            // The current logic overwrites setIntroPaths later if pathsResponse is ok.
            // So this block sets initial 1st degree connections, then the next block overwrites it with 2nd/3rd degree paths.
            // We should probably MERGE them or handle grouping in the intro-paths block.
            // Let's check the intro-paths block.
          }
        }
      }

      // Load intro paths from Neo4j
      const pathsResponse = await fetch(`/api/neo4j/intro-paths?entityId=${nodeId}`)
      if (pathsResponse.ok) {
        const pathsData = await pathsResponse.json()
        if (pathsData.success && pathsData.data) {
          // Transform the API response to match the expected format
          const rawPaths = pathsData.data.introPaths || [];
          
          // Group paths by the first intermediate node (index 1) if path length > 1
          const groupedPaths = new Map();
          
          rawPaths.forEach((path: any) => {
             // If direct connection (length 1), key is target node ID
             // If indirect (length > 1), key is the first intermediate node ID
             // path.nodes[0] is Source (Andrew)
             // path.nodes[1] is Target (if len 1) or Intermediate (if len > 1)
             
             if (path.nodes.length < 2) return; // Should not happen for a path
             
             const firstHopNode = path.nodes[1];
             const key = firstHopNode.identity ? firstHopNode.identity.toString() : firstHopNode.id; // Handle different ID formats
             
             if (!groupedPaths.has(key)) {
                groupedPaths.set(key, {
                   node: firstHopNode,
                   paths: []
                });
             }
             groupedPaths.get(key).paths.push(path);
          });

          const transformedPaths = Array.from(groupedPaths.values()).map((group: any) => {
             const { node, paths } = group;
             
             // Calculate average strength
             const totalStrength = paths.reduce((sum: number, p: any) => {
                return sum + (p.relationships.reduce((s: number, r: any) => s + r.strength, 0) / p.relationships.length);
             }, 0);
             const avgStrength = totalStrength / paths.length;

             // Create description
             let description = `${node.properties?.name || node.label || 'Unknown'}`;
             
             // If there are multiple paths going through this node, list the targets
             const targets = new Set();
             paths.forEach((p: any) => {
                const target = p.nodes[p.nodes.length - 1];
                if (target.id !== node.id && target.identity?.toString() !== node.identity?.toString()) {
                   let name = target.properties?.name || target.label || 'Unknown';
                   if (typeof name === 'object') {
                      name = JSON.stringify(name); // Defensive: handle weird objects
                   }
                   targets.add(String(name)); // Ensure string
                }
             });
             
             if (targets.size > 0) {
                const targetArray = Array.from(targets);
                // Store targets in the object for rendering
                (group as any).targets = targetArray;
                
                const targetList = targetArray.slice(0, 3).join(', ');
                const remaining = targetArray.length > 3 ? ` +${targetArray.length - 3} more` : '';
                description += ` → Connected to: ${targetList}${remaining}`;
             } else {
                // Direct connection only
                const rel = paths[0].relationships[0];
                description += ` (${rel.type || 'CONNECTED'})`;
             }

             return {
               pathLength: paths[0].nodes.length - 1, // Approximate
               nodes: paths[0].nodes, // Just use first path for visualization if needed
               relationships: paths[0].relationships,
               targetNode: node, // The grouping node
               strength: avgStrength,
               description: description,
               targets: (group as any).targets || [] // Pass targets to the render
             };
          });

          setIntroPaths(transformedPaths)
        }
      }

      // Files are not available in Neo4j, so we'll skip this for now (handled via Postgres in API now)
      if (!entity?.files) {
      setFiles([])
      }
    } catch (error) {
      console.error('Error loading entity data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (!nodeId || refreshing) return;
    
    setRefreshing(true);
    try {
        const res = await fetch('/api/pipeline/refresh-entity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityId: nodeId })
        });
        
        if (res.ok) {
            // Poll for completion or just wait a bit and reload
            // Ideally we'd use a websocket or polling, but for MVP just wait 5s and reload
            setTimeout(() => {
                loadEntityData();
                setRefreshing(false);
            }, 5000);
        } else {
            console.error('Failed to trigger refresh');
            setRefreshing(false);
        }
    } catch (err) {
        console.error('Error triggering refresh:', err);
        setRefreshing(false);
    }
  };

  const getPipelineStageColor = (stage?: string) => {
    switch (stage) {
      case 'Portfolio MVF1':
      case 'Portfolio MVF2':
        return 'bg-green-900/30 text-green-300 border-green-800'
      case 'Due Diligence':
        return 'bg-yellow-900/30 text-yellow-300 border-yellow-800'
      case 'Qualified':
        return 'bg-blue-900/30 text-blue-300 border-blue-800'
      case 'Rejected':
        return 'bg-red-900/30 text-red-300 border-red-800'
      case 'On Hold':
        return 'bg-slate-800 text-slate-300 border-slate-700'
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700'
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Show loading state if nodeId exists but entity is still loading
  if (nodeId && !entity) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800 rounded-full animate-pulse"></div>
              <div>
                <div className="h-6 w-48 bg-slate-800 rounded animate-pulse mb-2"></div>
                <div className="h-4 w-24 bg-slate-800 rounded animate-pulse"></div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-slate-400 font-medium">Loading intelligence data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no nodeId
  if (!nodeId) {
    return null;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Layout },
    { id: 'details', label: 'Details', icon: List },
    { id: 'connections', label: 'Connections', icon: Share2 },
    { id: 'interactions', label: 'Interactions', icon: MessageSquare },
    { id: 'files', label: 'Files', icon: FileText },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all duration-300">
      <div className="bg-slate-900 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${entity?.type === 'person' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'}`}>
              {entity?.type === 'person' ? (
                <Users className="w-6 h-6" />
              ) : (
                <Building2 className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-100 leading-tight">{entity?.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium text-slate-400 capitalize">{entity?.type}</span>
                {entity?.pipeline_stage && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getPipelineStageColor(entity.pipeline_stage)}`}>
                      {entity.pipeline_stage}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
              {onBack && (
                  <button
                    onClick={onBack}
                    className="p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-colors mr-1"
                    title="Go Back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh Intelligence Data"
                className={`p-2 text-slate-500 hover:text-blue-400 rounded-full hover:bg-slate-800 transition-colors ${refreshing ? 'animate-spin text-blue-500' : ''}`}
              >
                <RefreshCw className="w-5 h-5" />
              </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/50">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === 'files' && files.length > 0 && (
                  <span className="ml-1 bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">
                    {files.length}
                  </span>
                )}
                {tab.id === 'connections' && introPaths.length > 0 && (
                  <span className="ml-1 bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">
                    {introPaths.length}
                  </span>
                )}
                {tab.id === 'interactions' && entity?.interactions && entity.interactions.length > 0 && (
                  <span className="ml-1 bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">
                    {entity.interactions.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-950">
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Key Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entity?.domain && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <Globe className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Website</span>
                      </div>
                      <a href={`https://${entity.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block font-medium">
                        {entity.domain}
                      </a>
                    </div>
                  )}
                  {entity?.industry && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <Briefcase className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Industry</span>
                      </div>
                      <div className="font-medium text-slate-200">{entity.industry}</div>
                    </div>
                  )}
                  {entity?.valuation && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <DollarSign className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Valuation</span>
                      </div>
                      <div className="font-medium text-slate-200">{entity.valuation}</div>
                    </div>
                  )}
                  {entity?.linkedin_url && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <Linkedin className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">LinkedIn</span>
                      </div>
                      {(() => {
                        let url = entity.linkedin_url;
                        // Extract first URL if multiple or text present
                        const urlMatch = url.match(/(https?:\/\/[^\s]+)/);
                        if (urlMatch) {
                            url = urlMatch[0];
                        } else if (url.startsWith('linkedin.com')) {
                            url = 'https://' + url;
                        }
                        
                        // Remove trailing punctuation often found in scraped data
                        url = url.replace(/[);]+$/, '');

                        return (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block font-medium">
                            View Profile
                          </a>
                        );
                      })()}
                    </div>
                  )}
                  {entity?.last_activity_date && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Last Activity</span>
                      </div>
                      <div className="font-medium text-slate-200">{formatDate(entity.last_activity_date)}</div>
                    </div>
                  )}
                  {entity?.fund && (
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                      <div className="flex items-center space-x-2 text-slate-500 mb-1">
                        <Tag className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Fund</span>
                      </div>
                      <div className="font-medium text-slate-200">{entity.fund}</div>
                    </div>
                  )}
                </div>

                {/* AI Analysis Section */}
                {entity?.business_analysis && (
                  <div className="space-y-6">
                    {/* Person Analysis */}
                    {entity?.type === 'person' && (
                      <div className="bg-slate-900 rounded-xl border border-blue-900/30 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-blue-900/30 bg-blue-900/10 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                            <Zap className="w-5 h-5 text-blue-400" />
                            AI Expertise Profile
                          </h3>
                          {entity.business_analysis.seniority_level && (
                            <span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs font-semibold rounded-full uppercase tracking-wide border border-blue-800">
                              {entity.business_analysis.seniority_level}
                            </span>
                          )}
                        </div>
                        <div className="p-6 space-y-5">
                          {entity.business_analysis.key_achievements && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Professional Summary</h4>
                              <div className="text-slate-300 leading-relaxed text-sm bg-slate-950 p-3 rounded-lg border border-slate-800">
                                <RenderAnalysisContent data={entity.business_analysis.key_achievements} />
                              </div>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {entity.business_analysis.functional_expertise && entity.business_analysis.functional_expertise.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Functional Expertise</h4>
                                <div className="flex flex-wrap gap-2">
                                  {entity.business_analysis.functional_expertise.map((skill: string, i: number) => (
                                    <span key={i} className="px-2.5 py-1 bg-slate-800 text-slate-300 text-xs font-medium rounded-md border border-slate-700">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {entity.business_analysis.domain_expertise && entity.business_analysis.domain_expertise.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Domain Expertise</h4>
                                <div className="flex flex-wrap gap-2">
                                  {entity.business_analysis.domain_expertise.map((skill: string, i: number) => (
                                    <span key={i} className="px-2.5 py-1 bg-indigo-900/30 text-indigo-300 text-xs font-medium rounded-md border border-indigo-800">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Organization Analysis */}
                    {entity?.type === 'organization' && (
                      <div className="bg-slate-900 rounded-xl border border-green-900/30 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-green-900/30 bg-green-900/10 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-green-400" />
                            AI Business Analysis
                          </h3>
                        </div>
                        <div className="p-6 space-y-5">
                          {entity.business_analysis.core_business && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Core Business</h4>
                              <RenderAnalysisContent data={entity.business_analysis.core_business} />
                            </div>
                          )}
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {entity.business_analysis.products && (
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Products & Services</h4>
                                <RenderAnalysisContent data={entity.business_analysis.products} />
                              </div>
                            )}
                            {entity.business_analysis.target_market && (
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Target Market</h4>
                                <RenderAnalysisContent data={entity.business_analysis.target_market} />
                              </div>
                            )}
                          </div>

                          {entity.taxonomy && (
                            <div className="pt-4 border-t border-slate-800">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Taxonomy Classification</h4>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-slate-950 text-slate-300 px-2 py-1 rounded border border-slate-800">
                                  {entity.taxonomy}
                                </span>
                                {entity.business_analysis.industry_position && (
                                  <span className="text-sm text-slate-500 italic">
                                    — {typeof entity.business_analysis.industry_position === 'string' 
                                        ? entity.business_analysis.industry_position 
                                        : (entity.business_analysis.industry_position.segment || entity.business_analysis.industry_position.summary || 'View Details')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes & Reminders */}
                {(entity?.notes || entity?.reminders) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {entity.notes && (
                      <div className="bg-yellow-900/20 border border-yellow-900/40 rounded-xl p-5">
                        <div className="flex items-start space-x-3">
                          <MessageSquare className="w-5 h-5 text-yellow-500 mt-0.5" />
                          <div>
                            <h4 className="text-sm font-bold text-yellow-300 mb-2">Notes</h4>
                            <p className="text-sm text-yellow-200/80 leading-relaxed">{entity.notes}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {entity.reminders && (
                      <div className="bg-blue-900/20 border border-blue-900/40 rounded-xl p-5">
                        <div className="flex items-start space-x-3">
                          <Calendar className="w-5 h-5 text-blue-500 mt-0.5" />
                          <div>
                            <h4 className="text-sm font-bold text-blue-300 mb-2">Reminders</h4>
                            <p className="text-sm text-blue-200/80 leading-relaxed">{entity.reminders}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-6">
                {/* Enrichment Data */}
                {entity?.enrichment_data ? (
                  <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                      <h3 className="font-semibold text-slate-100">Enrichment Data</h3>
                    </div>
                    <div className="p-6 bg-slate-950 overflow-x-auto">
                      <RecursiveJson data={entity.enrichment_data} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
                    <Zap className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-200">No Enrichment Data</h3>
                    <p className="text-slate-500">There is no additional enrichment data available for this entity.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'connections' && (
              <div className="space-y-4">
                {introPaths.length > 0 ? (
                  introPaths.map((path: any, index) => (
                    <div 
                        key={index} 
                        className={`bg-slate-900 border border-slate-800 rounded-xl p-5 transition-colors ${onSelectNode ? 'hover:border-blue-500/50 cursor-pointer group' : ''}`}
                        onClick={() => {
                            // If it's a grouped path, clicking might open the intermediate node
                            // Or we could just open the targetNode
                            if (onSelectNode && path.targetNode) {
                                const id = path.targetNode.identity ? path.targetNode.identity.toString() : path.targetNode.id;
                                onSelectNode(id);
                            }
                        }}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-green-900/20 rounded-lg group-hover:bg-green-900/30 transition-colors">
                          <Target className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-200 font-medium mb-3">
                            {path.description.split(' → Connected to:')[0]}
                            {path.targets && path.targets.length > 0 && (
                                <span className="block mt-1 text-sm text-slate-400 font-normal">
                                    <span className="text-slate-500">Connected to: </span>
                                    {path.targets.map((t: string, i: number) => (
                                        <span key={i}>
                                            {i > 0 && ", "}
                                            <span className="text-slate-300">{t}</span>
                                        </span>
                                    ))}
                                </span>
                            )}
                            {!path.targets && path.description.includes('(') && (
                                <span className="text-slate-500 text-sm ml-2">{path.description.match(/\(.*\)/)?.[0]}</span>
                            )}
                          </p>
                          <div className="flex items-center space-x-3">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Connection Strength</span>
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                                style={{ width: `${path.strength * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-bold text-slate-300">
                              {Math.round(path.strength * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
                    <Share2 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-200">No Connections Found</h3>
                    <p className="text-slate-500">There are no known connections or introduction paths for this entity.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'interactions' && (
              <div className="space-y-4">
                {entity?.interactions && entity.interactions.length > 0 ? (
                  entity.interactions.map((interaction, index) => (
                    <div key={interaction.id || index} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                         <div className="flex items-center gap-2">
                             <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                                 interaction.interaction_type === 'email' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                                 interaction.interaction_type === 'meeting' ? 'bg-purple-900/30 text-purple-400 border border-purple-800' :
                                 'bg-slate-800 text-slate-400 border border-slate-700'
                             }`}>
                                 {interaction.interaction_type}
                             </span>
                             <span className="text-slate-500 text-sm">{formatDate(interaction.started_at)}</span>
                         </div>
                         {interaction.source && (
                             <span className="text-xs text-slate-600 uppercase tracking-wide">{interaction.source}</span>
                         )}
                      </div>
                      
                      {interaction.subject && (
                          <h4 className="text-slate-200 font-medium mb-2">{interaction.subject}</h4>
                      )}
                      
                      {interaction.content_preview && (
                          <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">
                              {interaction.content_preview}
                          </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
                    <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-200">No Interactions Found</h3>
                    <p className="text-slate-500">There are no tracked interactions (emails, meetings) for this entity.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-4">
                {files.length > 0 ? (
                  files.map((file) => (
                    <div key={file.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="p-3 bg-blue-900/20 rounded-lg text-blue-400 group-hover:bg-blue-900/30 transition-colors">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base font-semibold text-slate-200 truncate mb-1">
                              {file.name}
                            </h4>
                            <div className="flex items-center space-x-2 text-xs text-slate-500 mb-2">
                              <span>{formatFileSize(file.size_bytes)}</span>
                              <span>•</span>
                              <span>{formatDate(file.created_at)}</span>
                            </div>
                            {file.ai_summary && (
                              <p className="text-sm text-slate-400 line-clamp-2 bg-slate-950 p-2 rounded border border-slate-800">
                                {file.ai_summary}
                              </p>
                            )}
                          </div>
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center px-3 py-1.5 text-sm font-medium text-blue-400 bg-blue-900/20 rounded-lg hover:bg-blue-900/30 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 mr-1.5" />
                          Open
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
                    <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-200">No Files Available</h3>
                    <p className="text-slate-500">There are no files associated with this entity.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
