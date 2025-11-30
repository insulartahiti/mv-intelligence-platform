'use client';

import { useState, useCallback } from 'react';
import Neo4jGraphViewer from '@/app/components/Neo4jGraphViewer';
import NodeDetailPanel from '@/app/components/NodeDetailPanel';
import ChatInterface, { Message } from '@/app/components/ChatInterface';
import SearchResultsList from '@/app/components/SearchResultsList';

export default function KnowledgeGraphPageContent() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]); 
  const [subgraphData, setSubgraphData] = useState<any>(null);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);
  
  // New State for Overhaul
  const [hasSearched, setHasSearched] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Lifted Chat State (Persist across layout changes)
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Callback when chat returns relevant nodes
  const handleGraphUpdate = useCallback((nodeIds: string[], subgraph?: any) => {
      console.log('Graph Update:', { count: nodeIds.length, hasSubgraph: !!subgraph });
      setHighlightedNodeIds(nodeIds);
      if (subgraph) {
          setSubgraphData(subgraph);
          setIsResultsOpen(true); // Auto-expand results on new search
      }
  }, []);

  const handleSearchStart = useCallback(() => {
      setHasSearched(true);
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

  // Initial State: Centered Search
  if (!hasSearched) {
      return (
          <div className="flex h-screen bg-slate-950 items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black relative">
              <div className="w-full max-w-3xl transform -translate-y-12 transition-all duration-700 ease-out animate-fadeIn">
                  <div className="text-center mb-10">
                      <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4 tracking-tight">Market Intelligence</h1>
                      <p className="text-slate-400 text-xl font-light">Explore the Knowledge Graph with AI-powered search.</p>
                  </div>
                  <div className="relative z-10">
                      <ChatInterface 
                        onGraphUpdate={handleGraphUpdate} 
                        onNodeSelect={handleNodeClick}
                        onSearchStart={handleSearchStart}
                        messages={messages}
                        setMessages={setMessages}
                        conversationId={conversationId}
                        setConversationId={setConversationId}
                        loading={loading}
                        setLoading={setLoading}
                        variant="spotlight"
                      />
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-100 font-sans relative">
      
      {/* COLUMN 1: Chat Interface (Left 1/3 ~ 30-33%) */}
      <div className="w-[30%] lg:w-[350px] xl:w-[400px] flex-shrink-0 h-full border-r border-slate-800 relative z-30 flex flex-col transition-all duration-300">
         <ChatInterface 
            onGraphUpdate={handleGraphUpdate} 
            onNodeSelect={handleNodeClick}
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            loading={loading}
            setLoading={setLoading}
         />
         
         {/* Toggle Results Button (Centered on Right Edge) */}
         {subgraphData?.nodes?.length > 0 && (
             <button
                onClick={() => setIsResultsOpen(!isResultsOpen)}
                className="absolute top-1/2 -right-3 transform -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 text-blue-400 rounded-full p-1 shadow-lg hover:bg-slate-700 transition-colors"
                title={isResultsOpen ? "Collapse Results" : "Expand Results"}
             >
                 {isResultsOpen ? (
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                 ) : (
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                 )}
             </button>
         )}
      </div>

      {/* COLUMN 2: Search Results List (Collapsible Middle Column) */}
      <div className={`${isResultsOpen && subgraphData?.nodes?.length > 0 ? 'w-[25%] min-w-[250px] max-w-[400px]' : 'w-0 opacity-0'} transition-all duration-300 flex-shrink-0 h-full border-r border-slate-800 relative z-20 flex flex-col overflow-hidden`}>
          <SearchResultsList 
                nodes={subgraphData?.nodes || []} 
                onSelectNode={handleNodeClick}
                onHoverNode={setHoveredNodeId}
                onClose={() => setIsResultsOpen(false)}
          />
      </div>

      {/* COLUMN 3: Graph Visualization (Fluid Right) */}
      <div className="flex-1 relative h-full flex flex-col min-w-0 bg-slate-950">
        <div className="flex-grow relative h-full">
            <Neo4jGraphViewer 
                onNodeClick={handleNodeClick} 
                highlightedNodeIds={highlightedNodeIds} 
                subgraphData={subgraphData}
                hoveredNodeId={hoveredNodeId} // Pass hover state
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
      </div>
    </div>
  );
}

