'use client';

import React, { useState } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import { 
  Database, 
  Server, 
  Layout, 
  Brain, 
  FileText, 
  Globe, 
  ArrowRight, 
  Layers,
  Search,
  Share2,
  FileSpreadsheet,
  Cpu,
  ShieldCheck,
  Zap,
  Box
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';

// Types for our architecture nodes
interface ArchNode {
  id: string;
  label: string;
  type: 'frontend' | 'backend' | 'database' | 'ai' | 'external';
  icon: React.ElementType;
  description: string;
  details: string[];
  x: number;
  y: number;
}

interface ArchConnection {
  from: string;
  to: string;
  label?: string;
}

export default function ArchitecturePage() {
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);

  // --- High Level Architecture Data ---
  const systemNodes: ArchNode[] = [
    {
      id: 'frontend',
      label: 'Frontend App',
      type: 'frontend',
      icon: Layout,
      description: 'Next.js 14 App Router application with Tailwind CSS and React.',
      details: [
        'App Router Architecture',
        'Tailwind CSS Styling',
        'Radix UI Primitives',
        'Vis.js & React Sigma Graph Viz',
        'Vercel Hosting'
      ],
      x: 10,
      y: 50
    },
    {
      id: 'api',
      label: 'API Layer',
      type: 'backend',
      icon: Server,
      description: 'Next.js API Routes and Supabase Edge Functions.',
      details: [
        '/api/chat - AI Agent',
        '/api/ingest - File Processing',
        '/api/universal-search - Hybrid Search',
        'Edge Functions for Long-running Tasks'
      ],
      x: 35,
      y: 50
    },
    {
      id: 'supabase',
      label: 'Supabase (Postgres)',
      type: 'database',
      icon: Database,
      description: 'Primary relational database and vector store.',
      details: [
        'Structured Entity Data',
        'pgvector Embeddings',
        'Interaction Logs',
        'Row Level Security (RLS)',
        'Financial Data Facts'
      ],
      x: 60,
      y: 30
    },
    {
      id: 'neo4j',
      label: 'Neo4j (Graph)',
      type: 'database',
      icon: Share2,
      description: 'Graph database for relationship traversal and visualization.',
      details: [
        'Entity Nodes & Edges',
        'Graph Algorithms',
        'Network Visualization Source',
        'Synced from Postgres'
      ],
      x: 60,
      y: 70
    },
    {
      id: 'ai_services',
      label: 'AI Services',
      type: 'ai',
      icon: Brain,
      description: 'External AI models for reasoning and enrichment.',
      details: [
        'OpenAI GPT-5.1 (Reasoning)',
        'Perplexity Sonar Pro (Enrichment)',
        'Embedding Models (text-embedding-3)',
        'Vision API (PDF/Image Analysis)'
      ],
      x: 85,
      y: 50
    }
  ];

  const systemConnections: ArchConnection[] = [
    { from: 'frontend', to: 'api', label: 'HTTP/REST' },
    { from: 'api', to: 'supabase', label: 'Read/Write' },
    { from: 'api', to: 'neo4j', label: 'Cypher Queries' },
    { from: 'api', to: 'ai_services', label: 'Inference' },
    { from: 'supabase', to: 'neo4j', label: 'Sync Pipeline' }
  ];

  // --- Data Pipeline Data ---
  const pipelineNodes: ArchNode[] = [
    {
      id: 'affinity',
      label: 'Affinity CRM',
      type: 'external',
      icon: UsersIcon,
      description: 'Source of truth for relationship data.',
      details: [
        'People & Organizations',
        'Interaction History',
        'Notes & Files',
        'API v1 Sync'
      ],
      x: 10,
      y: 50
    },
    {
      id: 'sync',
      label: 'Ingestion Script',
      type: 'backend',
      icon: Zap,
      description: 'Raw data fetching and normalization.',
      details: [
        'run_affinity_sync.ts',
        'Incremental Fetching',
        'Raw Data Storage',
        'No AI Processing (Speed)'
      ],
      x: 30,
      y: 50
    },
    {
      id: 'enrichment',
      label: 'Parallel Enrichment',
      type: 'ai',
      icon: Cpu,
      description: 'Concurrent AI processing block.',
      details: [
        'Embed Interactions (Vector)',
        'Summarize History (GPT-4o)',
        'Enrich Entities (Perplexity)',
        'Taxonomy Classification'
      ],
      x: 55,
      y: 50
    },
    {
      id: 'graph_sync',
      label: 'Graph Sync',
      type: 'database',
      icon: Share2,
      description: 'Migration to Graph Database.',
      details: [
        'migrate-to-neo4j.ts',
        'Deduplication',
        'Edge Creation',
        'Relationship Inference'
      ],
      x: 80,
      y: 50
    }
  ];

  const pipelineConnections: ArchConnection[] = [
    { from: 'affinity', to: 'sync', label: 'API Sync' },
    { from: 'sync', to: 'enrichment', label: 'Raw Data' },
    { from: 'enrichment', to: 'graph_sync', label: 'Enriched Data' }
  ];

  // Helper to render icon
  function UsersIcon(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }

  return (
    <DashboardLayout
      title="System Architecture"
      subtitle="Live interactive view of the Motive Intelligence Platform architecture"
    >
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 min-h-[800px]">
        <Tabs.Root defaultValue="overview" className="w-full h-full flex flex-col">
          <Tabs.List className="flex space-x-2 border-b border-white/10 pb-4 mb-6">
            <TabTrigger value="overview" icon={<Globe size={16} />} label="System Overview" />
            <TabTrigger value="pipeline" icon={<Layers size={16} />} label="Data Pipeline" />
            <TabTrigger value="ingestion" icon={<FileSpreadsheet size={16} />} label="Financial Ingestion" />
            <TabTrigger value="legal" icon={<ShieldCheck size={16} />} label="Legal Analysis" />
          </Tabs.List>

          <div className="flex-1 relative">
            <Tabs.Content value="overview" className="h-full w-full outline-none animate-in fade-in duration-300">
               <DiagramCanvas 
                 nodes={systemNodes} 
                 connections={systemConnections} 
                 onNodeSelect={setSelectedNode}
                 selectedNodeId={selectedNode?.id}
               />
            </Tabs.Content>

            <Tabs.Content value="pipeline" className="h-full w-full outline-none animate-in fade-in duration-300">
               <DiagramCanvas 
                 nodes={pipelineNodes} 
                 connections={pipelineConnections} 
                 onNodeSelect={setSelectedNode}
                 selectedNodeId={selectedNode?.id}
               />
            </Tabs.Content>

            <Tabs.Content value="ingestion" className="h-full w-full outline-none animate-in fade-in duration-300">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-white">Financial Data Ingestion (Unified Extractor)</h3>
                  <div className="prose prose-invert max-w-none text-sm text-slate-300">
                    <p>
                      The financial ingestion system uses a <strong>Unified Extraction Pipeline</strong> capable of processing both PDF and Excel files through a multi-model architecture.
                    </p>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-white/5 space-y-2">
                       <h4 className="font-medium text-blue-400">Key Components</h4>
                       <ul className="list-disc list-inside space-y-1">
                         <li><strong>GPT-5.1</strong>: Primary model for vision and structured reasoning.</li>
                         <li><strong>XLSX Parser</strong>: Deterministic extraction for Excel files.</li>
                         <li><strong>Reconciliation Engine</strong>: Merges outputs and resolves conflicts.</li>
                         <li><strong>Perplexity Sonar</strong>: Adds market benchmarks and context.</li>
                       </ul>
                    </div>
                  </div>
                  
                  <div className="relative bg-slate-800/80 rounded-lg p-6 border border-blue-500/30">
                     <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.02] pointer-events-none" />
                     <div className="flex flex-col items-center space-y-4">
                        <div className="flex gap-4">
                           <NodeCard icon={FileText} label="PDF / Excel" type="external" />
                        </div>
                        <ArrowDown />
                        <NodeCard icon={Brain} label="Unified Extractor" type="ai" />
                        <div className="flex gap-12 w-full justify-center">
                            <div className="text-center">
                              <ArrowDown />
                              <NodeCard icon={Box} label="Fact Financials" type="database" />
                            </div>
                            <div className="text-center">
                              <ArrowDown />
                              <NodeCard icon={Box} label="Fact Metrics" type="database" />
                            </div>
                        </div>
                     </div>
                  </div>
                </div>
                
                {/* Right side explanation */}
                <div className="bg-slate-800/30 p-6 rounded-lg border border-white/5">
                   <h4 className="text-lg font-medium text-white mb-4">Coordinate-First Extraction Strategy</h4>
                   <div className="space-y-4 text-sm text-slate-300">
                      <Step number={1} title="Column Structure (LLM)" description="Identifies date columns and actual/budget splits using GPT-5.1." />
                      <Step number={2} title="Row Label Index (Deterministic)" description="Scans all rows to build a complete index of potential metrics." />
                      <Step number={3} title="Label Matching (LLM)" description="Matches guide metrics to row labels using fuzzy logic." />
                      <Step number={4} title="Single Parse" description="Reads values from specific coordinates (Sheet, Row, Col) - Zero Hallucination." />
                   </div>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="legal" className="h-full w-full outline-none animate-in fade-in duration-300">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-white">Legal Document Analysis</h3>
                  <div className="prose prose-invert max-w-none text-sm text-slate-300">
                    <p>
                      The legal analysis system employs a <strong>3-Phase Extraction Pipeline</strong> to process complex investor documentation bundles.
                    </p>
                  </div>
                  
                  <div className="relative bg-slate-800/80 rounded-lg p-6 border border-purple-500/30">
                     <div className="flex flex-col items-center space-y-4">
                        <NodeCard icon={FileText} label="Legal Docs" type="external" />
                        <ArrowDown />
                        <div className="grid grid-cols-3 gap-4 w-full">
                           <div className="text-center p-2 bg-slate-700/50 rounded border border-white/5 text-xs">Phase 1<br/>Individual Extraction</div>
                           <div className="text-center p-2 bg-slate-700/50 rounded border border-white/5 text-xs">Phase 2<br/>Category Analysis</div>
                           <div className="text-center p-2 bg-slate-700/50 rounded border border-white/5 text-xs">Phase 3<br/>Deal Synthesis</div>
                        </div>
                        <ArrowDown />
                        <NodeCard icon={ShieldCheck} label="Legal Analysis" type="database" />
                     </div>
                  </div>
                </div>

                <div className="bg-slate-800/30 p-6 rounded-lg border border-white/5">
                   <h4 className="text-lg font-medium text-white mb-4">Visual Audit Trail</h4>
                   <p className="text-sm text-slate-300 mb-4">
                     Every extracted term is linked back to the source document with pixel-perfect highlighting.
                   </p>
                   <ul className="space-y-3 text-sm text-slate-300">
                      <li className="flex items-start gap-2">
                        <span className="bg-green-500/20 text-green-400 p-1 rounded text-xs">PDF</span>
                        <span>Uses <code>pdf-to-img</code> to render high-res PNGs of pages.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="bg-blue-500/20 text-blue-400 p-1 rounded text-xs">Vision</span>
                        <span>GPT-5.1 returns bounding box coordinates for relevant clauses.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="bg-purple-500/20 text-purple-400 p-1 rounded text-xs">Overlay</span>
                        <span>Yellow highlights are drawn on the image to spotlight the exact source text.</span>
                      </li>
                   </ul>
                </div>
               </div>
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>

      {/* Details Panel Overlay */}
      {selectedNode && (
        <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-white/10 shadow-2xl p-6 transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${getNodeColor(selectedNode.type)}`}>
                <selectedNode.icon size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">{selectedNode.label}</h2>
            </div>
            <button 
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <p className="text-slate-300 mb-6">{selectedNode.description}</p>
          
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Key Features</h3>
          <ul className="space-y-2">
            {selectedNode.details.map((detail, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-200">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardLayout>
  );
}

// --- Subcomponents ---

function TabTrigger({ value, icon, label }: { value: string, icon: React.ReactNode, label: string }) {
  return (
    <Tabs.Trigger 
      value={value}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all outline-none"
    >
      {icon}
      <span>{label}</span>
    </Tabs.Trigger>
  );
}

function DiagramCanvas({ nodes, connections, onNodeSelect, selectedNodeId }: { 
  nodes: ArchNode[], 
  connections: ArchConnection[],
  onNodeSelect: (node: ArchNode) => void,
  selectedNodeId?: string
}) {
  return (
    <div className="relative w-full h-[600px] bg-slate-900/50 rounded-lg overflow-hidden border border-white/5">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-grid-white/[0.02]" />
      
      {/* Connections (SVG Layer) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
        </defs>
        {connections.map((conn, idx) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          // Simple coordinate calculation (percentages to pixels approx)
          // Note: In a real app we'd use ref tracking for exact pixels, here we assume standard container
          // We'll use style based positioning for nodes, so we need consistent coords
          return (
            <g key={idx}>
              <line 
                x1={`${fromNode.x}%`} 
                y1={`${fromNode.y}%`} 
                x2={`${toNode.x}%`} 
                y2={`${toNode.y}%`} 
                stroke="#475569" 
                strokeWidth="2"
                strokeDasharray="5,5"
                markerEnd="url(#arrowhead)"
                className="animate-pulse-slow"
              />
              {conn.label && (
                <text 
                  x={`${(fromNode.x + toNode.x) / 2}%`} 
                  y={`${(fromNode.y + toNode.y) / 2 - 2}%`} 
                  fill="#94a3b8" 
                  fontSize="12" 
                  textAnchor="middle"
                  className="bg-slate-900"
                >
                  {conn.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => (
        <div
          key={node.id}
          onClick={() => onNodeSelect(node)}
          className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 hover:scale-110 ${
            selectedNodeId === node.id ? 'scale-110 ring-2 ring-white shadow-xl' : ''
          }`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <div className={`flex flex-col items-center gap-2 p-4 rounded-xl backdrop-blur-md border ${getNodeColor(node.type)} min-w-[120px]`}>
            <node.icon size={32} className="text-white mb-1" />
            <span className="text-sm font-semibold text-white text-center whitespace-nowrap">{node.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function getNodeColor(type: ArchNode['type']) {
  switch (type) {
    case 'frontend': return 'bg-blue-600/20 border-blue-500/50 hover:bg-blue-600/40';
    case 'backend': return 'bg-green-600/20 border-green-500/50 hover:bg-green-600/40';
    case 'database': return 'bg-orange-600/20 border-orange-500/50 hover:bg-orange-600/40';
    case 'ai': return 'bg-purple-600/20 border-purple-500/50 hover:bg-purple-600/40';
    case 'external': return 'bg-slate-600/20 border-slate-500/50 hover:bg-slate-600/40';
    default: return 'bg-slate-600/20 border-slate-500/50';
  }
}

function NodeCard({ icon: Icon, label, type }: { icon: any, label: string, type: string }) {
   // Map simple type string to ArchNode['type'] for color function
   const nodeType = type as ArchNode['type'];
   return (
      <div className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${getNodeColor(nodeType)} min-w-[100px]`}>
         <Icon size={24} className="text-white" />
         <span className="text-xs font-medium text-white">{label}</span>
      </div>
   )
}

function ArrowDown() {
   return <ArrowRight className="transform rotate-90 text-slate-500 my-2" size={20} />
}

function Step({ number, title, description }: { number: number, title: string, description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold text-sm">
        {number}
      </div>
      <div>
        <h5 className="text-white font-medium text-sm">{title}</h5>
        <p className="text-slate-400 text-xs mt-1">{description}</p>
      </div>
    </div>
  );
}
