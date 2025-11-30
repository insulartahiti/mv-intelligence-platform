'use client';

import { useState, useCallback } from 'react';
import Neo4jGraphViewer from '@/app/components/Neo4jGraphViewer';
import NodeDetailPanel from '@/app/components/NodeDetailPanel';
import ChatInterface from '@/app/components/ChatInterface';
import SearchResultsList from '@/app/components/SearchResultsList';
import { MessageSquare } from 'lucide-react';

export default function KnowledgeGraphPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]); 
  const [subgraphData, setSubgraphData] = useState<any>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);

  // Callback when chat returns relevant nodes
  const handleGraphUpdate = useCallback((nodeIds: string[], subgraph?: any) => {
      console.log('Graph Update:', { count: nodeIds.length, hasSubgraph: !!subgraph });
      setHighlightedNodeIds(nodeIds);
      if (subgraph) {
          setSubgraphData(subgraph);
      } else if (nodeIds.length === 0) {
          setSubgraphData(null); // Clear subgraph if no results
      }
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => {
        if (prev && prev !== nodeId) {
            setNodeHistory((history) => [...history, prev]);
        }
        return nodeId;
    });
  }, []);

  const handleBack = useCallback(() => {
      setNodeHistory((prev) => {
          const newHistory = [...prev];
          const lastNode = newHistory.pop();
          if (lastNode) {
              setSelectedNodeId(lastNode);
          } else {
              setSelectedNodeId(null);
          }
          return newHistory;
      });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
    setNodeHistory([]); // Clear history on close
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-100 font-sans">
      
      {/* LEFT PANEL: Chat Interface */}
      <div className={`${isChatOpen ? 'w-full lg:w-[400px] xl:w-[450px]' : 'w-0'} transition-all duration-300 flex-shrink-0 h-full border-r border-slate-800 relative z-20 flex flex-col`}>
         
         {/* Chat */}
         <div className="flex-1 overflow-hidden">
            <ChatInterface 
                onGraphUpdate={handleGraphUpdate} 
                onNodeSelect={handleNodeClick}
            />
         </div>
         
         <button 
            onClick={() => setIsChatOpen(false)}
            className="absolute top-4 right-4 text-slate-500 hover:text-white lg:hidden z-50"
         >
             ✕
         </button>
      </div>

      {/* RIGHT PANEL: Graph Visualization + Results List */}
      <div className="flex-1 relative h-full flex flex-col min-w-0">
        
        {/* Toggle Chat Button (if closed) */}
        {!isChatOpen && (
            <button 
                onClick={() => setIsChatOpen(true)}
                className="absolute top-4 left-4 z-10 p-3 bg-slate-800 rounded-full shadow-lg text-blue-400 hover:bg-slate-700 transition-colors border border-slate-700"
            >
                <MessageSquare className="w-5 h-5" />
            </button>
        )}

        {/* Top Section: Graph (Flexible Height) */}
        <div className="flex-grow relative min-h-[400px]">
            <Neo4jGraphViewer 
                onNodeClick={handleNodeClick} 
                highlightedNodeIds={highlightedNodeIds} 
                subgraphData={subgraphData} 
            />
            
            {/* Node Details Overlay */}
            {selectedNodeId && (
                <NodeDetailPanel
                  nodeId={selectedNodeId}
                  onClose={handleClosePanel}
                  onSelectNode={handleNodeClick}
                  onBack={nodeHistory.length > 0 ? handleBack : undefined}
                />
            )}
        </div>

        {/* Bottom Section: Search Results List (Conditional) */}
        {subgraphData?.nodes && subgraphData.nodes.length > 0 && (
            <div className="flex-shrink-0 h-[35vh] overflow-y-auto border-t border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
                <SearchResultsList 
                    nodes={subgraphData.nodes} 
                    onSelectNode={handleNodeClick} 
                />
            </div>
        )}

      </div>
    </div>
  );
}
