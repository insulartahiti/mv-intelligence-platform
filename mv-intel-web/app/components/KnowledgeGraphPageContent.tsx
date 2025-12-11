'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Neo4jGraphViewer from '@/app/components/Neo4jGraphViewer';
import NodeDetailPanel from '@/app/components/NodeDetailPanel';
import ChatInterface, { Message } from '@/app/components/ChatInterface';
import SearchResultsList from '@/app/components/SearchResultsList';
import { Maximize2, Minimize2, Share2 } from 'lucide-react';

const LoadingResultsSkeleton = () => (
  <div className="h-full p-6 space-y-6 animate-pulse overflow-hidden">
    <div className="flex items-center gap-4 mb-8">
        <div className="h-8 bg-slate-800/50 rounded w-1/3"></div>
        <div className="h-8 bg-slate-800/30 rounded w-1/4 ml-auto"></div>
    </div>
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/20 space-y-3">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800/50"></div>
            <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-800/50 rounded w-1/3"></div>
                <div className="h-3 bg-slate-800/30 rounded w-1/4"></div>
            </div>
        </div>
        <div className="space-y-2 pt-2">
            <div className="h-3 bg-slate-800/30 rounded w-full"></div>
            <div className="h-3 bg-slate-800/30 rounded w-5/6"></div>
        </div>
      </div>
    ))}
  </div>
);

export default function KnowledgeGraphPageContent({ greeting, userEntity }: { greeting?: { text: string, name: string }, userEntity?: any }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]); 
  const [subgraphData, setSubgraphData] = useState<any>(null);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);
  
  // New State for Overhaul
  const [hasSearched, setHasSearched] = useState(false);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [chatWidth, setChatWidth] = useState(400); // Default width in px when expanded
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Lifted Chat State (Persist across layout changes)
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resizing Logic
  const isResizing = useRef(false);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
        setChatWidth(e.clientX);
    }
  }, []);

  // Callback when chat returns relevant nodes
  const handleGraphUpdate = useCallback((nodeIds: string[], subgraph?: any) => {
      console.log('Graph Update:', { count: nodeIds.length, hasSubgraph: !!subgraph });
      setHighlightedNodeIds(nodeIds);
      if (subgraph) {
          setSubgraphData(subgraph);
          // Auto-expand graph if we have results? 
          // User request: "agent takes up 2/3... collapsible results pane 1/3". 
          // So initially we stay in 'List Mode' (Graph Minimized).
          setIsGraphExpanded(false); 
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
          <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-40">
              <div className="w-full max-w-3xl transform -translate-y-12 transition-all duration-700 ease-out animate-fadeIn">
                  <div className="text-center mb-10">
                      {greeting ? (
                          <>
                            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4 tracking-tight pb-2">
                                {greeting.text}, {greeting.name}
                            </h1>
                            <p className="text-slate-400 text-xl font-light mt-2">Ready to explore the graph?</p>
                          </>
                      ) : (
                          <>
                            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4 tracking-tight pb-2">Motive Intelligence</h1>
                            <p className="text-slate-400 text-xl font-light mt-2">Explore pipeline data with AI-powered search</p>
                          </>
                      )}
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
                        userEntity={userEntity}
                      />
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden text-slate-100 font-sans z-0 flex">
      
      {/* COLUMN 1: Chat Interface */}
      <div 
        style={{ width: isGraphExpanded ? `${chatWidth}px` : '65%' }}
        className="flex-shrink-0 h-full relative z-30 transition-all duration-500 ease-in-out border-r border-slate-800"
      >
         <ChatInterface 
            onGraphUpdate={handleGraphUpdate} 
            onNodeSelect={handleNodeClick}
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            loading={loading}
            setLoading={setLoading}
            userEntity={userEntity}
         />
         
         {/* Resizer Handle (Only visible when graph is expanded) */}
         {isGraphExpanded && (
             <div 
                onMouseDown={startResizing}
                className="absolute right-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-500/50 cursor-col-resize z-50 transition-colors"
             />
         )}
      </div>

      {/* COLUMN 2: Right Panel (Results List OR Graph) */}
      <div className="flex-1 relative h-full flex flex-col min-w-0 bg-slate-950 overflow-hidden">
          
          {/* A. Results List (Visible when Graph Minimized) */}
          <div className={`absolute inset-0 transition-opacity duration-500 ${!isGraphExpanded ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
              
              {loading && !subgraphData ? (
                  <LoadingResultsSkeleton />
              ) : (
                  <SearchResultsList 
                        nodes={subgraphData?.nodes || []} 
                        onSelectNode={handleNodeClick}
                        onHoverNode={setHoveredNodeId}
                        onClose={() => {}}
                  />
              )}
              
              {/* Floating Action Buttons Container */}
              <div className="absolute bottom-24 right-4 z-50 flex flex-col gap-4 items-center">
                  
                  {/* Graph Toggle Button */}
                  <button
                    onClick={() => setIsGraphExpanded(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center justify-center group w-14 h-14"
                    title="Expand Graph Visualization"
                  >
                    <Share2 className="w-6 h-6" />
                  </button>
              </div>
          </div>

          {/* B. Graph Visualization (Always Mounted for Stability, but z-indexed) */}
          <div className={`absolute inset-0 transition-opacity duration-500 ${isGraphExpanded ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="flex-grow relative h-full">
                <Neo4jGraphViewer 
                    onNodeClick={handleNodeClick} 
                    highlightedNodeIds={highlightedNodeIds} 
                    subgraphData={subgraphData}
                    hoveredNodeId={hoveredNodeId}
                />
                
                {/* Minimize Graph Button (Stacked above Recenter) */}
                <button
                    onClick={() => setIsGraphExpanded(false)}
                    className="absolute bottom-36 right-6 z-50 bg-slate-800/80 backdrop-blur border border-slate-700 text-slate-300 p-2 rounded-lg hover:bg-slate-700 hover:text-white transition-colors shadow-lg"
                    title="Minimize Graph"
                >
                    <Minimize2 className="w-5 h-5" />
                </button>

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
    </div>
  );
}

