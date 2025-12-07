'use client';

import React, { useState, useMemo } from 'react';
import { architectureData } from '@/lib/architecture/data';
import { ArchNode, ArchConnection, ArchitectureView } from '@/lib/architecture/types';
import * as Tabs from '@radix-ui/react-tabs';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import IntroOverlay from './IntroOverlay';

// Dynamically resolve icon components
const IconRenderer = ({ name, className, size = 24 }: { name: string, className?: string, size?: number }) => {
  // @ts-ignore
  const IconComponent = Icons[name] || Icons.HelpCircle;
  return <IconComponent size={size} className={className} />;
};

export default function ArchitecturePage() {
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);
  const data = architectureData;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black p-6 md:p-8">
      <IntroOverlay />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">System Architecture</h1>
            <p className="text-slate-400">
              Live interactive view (v{data.version}) • Last synced: {new Date(data.lastUpdated).toLocaleDateString()}
            </p>
          </div>

          <div className="flex gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-mono">
                <Icons.RefreshCw size={12} className="animate-spin-slow" />
                Auto-Synced
             </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 min-h-[800px] flex flex-col shadow-xl">
          <Tabs.Root defaultValue="overview" className="flex-1 flex flex-col">
            <Tabs.List className="flex space-x-2 border-b border-slate-800 pb-4 mb-6 overflow-x-auto">
              {Object.entries(data.views).map(([key, view]) => (
                <TabTrigger 
                  key={key} 
                  value={key} 
                  label={view.label} 
                  iconName={key === 'legal' ? 'ShieldCheck' : key === 'ingestion' ? 'FileSpreadsheet' : key === 'pipeline' ? 'Layers' : 'Globe'} 
                />
              ))}
            </Tabs.List>

            <div className="flex-1 relative">
              {Object.entries(data.views).map(([key, view]) => (
                <Tabs.Content key={key} value={key} className="h-full w-full outline-none animate-in fade-in duration-300">
                   <div className="mb-6 flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-800/50">
                      <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                        <Icons.Info size={18} />
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed pt-1">{view.description}</p>
                   </div>
                   <DiagramCanvas 
                     view={view}
                     onNodeSelect={setSelectedNode}
                     selectedNodeId={selectedNode?.id}
                   />
                </Tabs.Content>
              ))}
            </div>
          </Tabs.Root>
        </div>
      </div>

      {/* Details Panel Overlay */}
      <AnimatePresence>
        {selectedNode && (
          <>
            {/* Backdrop for mobile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNode(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            />
            
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 right-0 w-full sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl p-6 z-50 overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedNode(null)}
                className="absolute left-6 top-6 text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors z-20"
              >
                <Icons.X size={20} />
              </button>

              <div className="flex justify-end items-start mb-8 pl-12">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${getNodeColor(selectedNode.type)} border border-white/10`}>
                    <IconRenderer name={selectedNode.iconName} className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedNode.label}</h2>
                    <span className="text-xs text-slate-500 font-mono uppercase tracking-wider">{selectedNode.type}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-8 pt-4">
                {/* Notebook-style commentary section */}
                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="p-4 bg-blue-900/10 border-l-2 border-blue-500 rounded-r-lg mb-6">
                    <h3 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                      <Icons.BrainCircuit size={16} />
                      Architectural Context
                    </h3>
                    <p className="text-slate-300 italic">
                      This component is a critical part of the {selectedNode.type} layer. It facilitates data flow and ensures system modularity.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Icons.FileText size={12} /> Description
                    </h3>
                    <p className="text-slate-300 leading-relaxed text-sm">{selectedNode.description}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Icons.List size={12} /> Key Components
                  </h3>
                  <ul className="space-y-3">
                    {selectedNode.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 bg-slate-800/50 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 border-t border-slate-800">
                   <div className="flex items-center justify-between text-xs text-slate-600 font-mono">
                      <span>ID: {selectedNode.id}</span>
                      <span>X: {selectedNode.x}, Y: {selectedNode.y}</span>
                   </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Subcomponents ---

function TabTrigger({ value, iconName, label }: { value: string, iconName: string, label: string }) {
  return (
    <Tabs.Trigger 
      value={value}
      className="group flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all outline-none whitespace-nowrap border border-transparent data-[state=active]:border-blue-500/50 data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
    >
      <IconRenderer name={iconName} size={16} className="opacity-70 group-hover:opacity-100 group-data-[state=active]:opacity-100" />
      <span>{label}</span>
    </Tabs.Trigger>
  );
}

function DiagramCanvas({ view, onNodeSelect, selectedNodeId }: { 
  view: ArchitectureView,
  onNodeSelect: (node: ArchNode) => void,
  selectedNodeId?: string
}) {
  return (
    <div className="relative w-full h-[600px] bg-slate-950/50 rounded-2xl overflow-hidden border border-slate-800 shadow-inner group">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/5 via-transparent to-transparent opacity-50" />
      
      {/* Connections (SVG Layer) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#475569" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#475569" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {view.connections.map((conn, idx) => {
          const fromNode = view.nodes.find(n => n.id === conn.from);
          const toNode = view.nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          return (
            <g key={idx}>
              <motion.line 
                x1={`${fromNode.x}%`} 
                y1={`${fromNode.y}%`} 
                x2={`${toNode.x}%`} 
                y2={`${toNode.y}%`} 
                stroke="url(#line-gradient)" 
                strokeWidth="2"
                strokeDasharray="4,4"
                markerEnd="url(#arrowhead)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.2, ease: "easeInOut" }}
              />
              {conn.label && (
                <foreignObject
                  x={`${(fromNode.x + toNode.x) / 2 - 5}%`} 
                  y={`${(fromNode.y + toNode.y) / 2 - 2}%`}
                  width="10%"
                  height="30"
                >
                  <div className="flex justify-center items-center h-full">
                    <span className="bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-400 font-mono shadow-sm whitespace-nowrap">
                      {conn.label}
                    </span>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {view.nodes.map((node, idx) => (
        <motion.div
          key={node.id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: idx * 0.1 
          }}
          onClick={() => onNodeSelect(node)}
          className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 group/node`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          {/* Pulse effect for selected node */}
          {selectedNodeId === node.id && (
            <div className={`absolute inset-0 rounded-2xl animate-ping opacity-20 ${getNodeColor(node.type).split(' ')[0]}`} />
          )}

          <div className={`
            flex flex-col items-center gap-3 p-4 rounded-2xl backdrop-blur-md border 
            transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-2xl
            ${getNodeColor(node.type)} 
            min-w-[140px] shadow-lg
            ${selectedNodeId === node.id ? 'ring-2 ring-white scale-105 shadow-2xl z-20 bg-opacity-30' : 'bg-opacity-10'}
          `}>
            <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5 group-hover/node:border-white/20 transition-colors">
              <IconRenderer name={node.iconName} className="text-white" size={28} />
            </div>
            <span className="text-xs font-semibold text-white text-center whitespace-nowrap tracking-wide">
              {node.label}
            </span>
            
            {/* Type badge */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-full text-[10px] text-slate-400 font-mono uppercase tracking-wider opacity-0 group-hover/node:opacity-100 transition-opacity whitespace-nowrap shadow-sm">
              {node.type}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function getNodeColor(type: ArchNode['type']) {
  switch (type) {
    case 'frontend': return 'bg-blue-600 border-blue-500/30 hover:border-blue-400/50 shadow-blue-900/10';
    case 'backend': return 'bg-emerald-600 border-emerald-500/30 hover:border-emerald-400/50 shadow-emerald-900/10';
    case 'database': return 'bg-orange-600 border-orange-500/30 hover:border-orange-400/50 shadow-orange-900/10';
    case 'ai': return 'bg-purple-600 border-purple-500/30 hover:border-purple-400/50 shadow-purple-900/10';
    case 'external': return 'bg-slate-600 border-slate-500/30 hover:border-slate-400/50 shadow-slate-900/10';
    default: return 'bg-slate-600 border-slate-500/30';
  }
}
