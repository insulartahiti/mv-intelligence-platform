'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Sparkles, Network, Building2, Users } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    relevant_node_ids?: string[];
    results?: any[]; // Array of nodes for inline display
}

interface ChatInterfaceProps {
    conversationId?: string | null;
    setConversationId?: (id: string | null) => void;
    messages?: Message[];
    setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
    loading?: boolean;
    setLoading?: (loading: boolean) => void;
    onGraphUpdate?: (nodeIds: string[], subgraph?: any) => void;
    onNodeSelect?: (nodeId: string) => void;
    onSearchStart?: () => void;
    variant?: 'default' | 'spotlight';
}

export default function ChatInterface({ 
    conversationId: propConvId, 
    setConversationId: propSetConvId,
    messages: propMessages,
    setMessages: propSetMessages,
    loading: propLoading,
    setLoading: propSetLoading,
    onGraphUpdate, 
    onNodeSelect, 
    onSearchStart,
    variant = 'default'
}: ChatInterfaceProps) {
    const [internalConvId, setInternalConvId] = useState<string | null>(null);
    const [internalMessages, setInternalMessages] = useState<Message[]>([]);
    const [internalLoading, setInternalLoading] = useState(false);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const conversationId = propConvId !== undefined ? propConvId : internalConvId;
    const setConversationId = propSetConvId || setInternalConvId;
    
    const messages = propMessages !== undefined ? propMessages : internalMessages;
    const setMessages = propSetMessages || setInternalMessages;

    const loading = propLoading !== undefined ? propLoading : internalLoading;
    const setLoading = propSetLoading || setInternalLoading;

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        if (messages.length === 0 && onSearchStart) {
            onSearchStart();
        }

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input
        };

        setMessages(prev => [...prev, userMsg]);
        const currentInput = input; // Capture input for logic
        setInput('');
        setLoading(true);

        try {
            // Call Chat API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    message: userMsg.content
                })
            });

            const data = await response.json();
            
            if (data.conversationId && !conversationId) {
                setConversationId(data.conversationId);
            }

            const assistantMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.reply,
                relevant_node_ids: data.relevantNodeIds,
                results: data.subgraph?.nodes // Store full node objects for rendering
            };

            setMessages(prev => [...prev, assistantMsg]);
            
            // Trigger Graph Update if nodes were found
            if (onGraphUpdate) {
                // Pass both IDs and the full subgraph structure
                onGraphUpdate(data.relevantNodeIds || [], data.subgraph);
            }

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { 
                id: crypto.randomUUID(), 
                role: 'assistant', 
                content: 'Sorry, I encountered an error processing your request.' 
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend();
    };

    if (variant === 'spotlight') {
        return (
            <div className="w-full max-w-2xl mx-auto">
                <form onSubmit={handleFormSubmit} className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                        <Sparkles className="h-6 w-6 text-blue-400 group-focus-within:text-blue-300 transition-colors" />
                    </div>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Search companies, people, or ask anything..."
                        autoFocus
                        className="block w-full pl-16 pr-16 py-5 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl text-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 shadow-2xl transition-all"
                    />
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className={`p-2 rounded-xl transition-all duration-200 ${
                                input.trim() && !loading 
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg' 
                                : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </form>
                {loading && (
                    <div className="mt-6 flex justify-center">
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/50 backdrop-blur rounded-full border border-slate-800/50 text-slate-400 text-sm animate-fadeIn">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-75"></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                            </div>
                            <span>Analyzing Knowledge Graph...</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
                <h2 className="font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    AI Assistant
                </h2>
                <p className="text-xs text-slate-500">Powered by Knowledge Graph & GPT-5.1</p>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
                {messages.length === 0 && (
                    <div className="text-center text-slate-500 mt-12 px-6">
                        <Network className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Ask about companies, people, or relationships in your network.</p>
                        <p className="text-xs mt-2 opacity-60">"Who are the investors in Company X?"</p>
                    </div>
                )}
                
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-blue-400" />
                            </div>
                        )}
                        
                        <div className={`flex flex-col max-w-[90%] gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            {/* Text Bubble */}
                            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                            }`}>
                                 <ReactMarkdown 
                                    className="prose prose-invert prose-sm max-w-none"
                                    components={{
                                        a: ({ node, href, children, ...props }) => {
                                            const handleClick = (e: React.MouseEvent) => {
                                                if (href?.includes('nodeId=')) {
                                                    e.preventDefault();
                                                    const id = href.split('nodeId=')[1];
                                                    if (id && onNodeSelect) {
                                                        onNodeSelect(id);
                                                    }
                                                }
                                            };
                                            return (
                                                <a 
                                                    href={href} 
                                                    onClick={handleClick} 
                                                    className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                                                    {...props}
                                                >
                                                    {children}
                                                </a>
                                            );
                                        }
                                    }}
                                 >
                                    {msg.content}
                                 </ReactMarkdown>
                            </div>

                            {/* Inline Results Grid (Only for Assistant) */}
                            {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                                <div className="grid grid-cols-1 gap-2 mt-1 w-full">
                                    {msg.results.slice(0, 3).map((node: any) => (
                                        <div 
                                            key={node.id}
                                            onClick={() => onNodeSelect?.(node.id)}
                                            className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/50 rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 group"
                                        >
                                            <div className={`p-2 rounded-md flex-shrink-0 ${
                                                node.group === 'organization' ? 'bg-purple-900/20 text-purple-400' : 'bg-blue-900/20 text-blue-400'
                                            }`}>
                                                {node.group === 'organization' ? <Building2 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <h4 className="font-medium text-slate-200 truncate group-hover:text-blue-400 transition-colors">{node.label}</h4>
                                                    {node.properties?.is_portfolio && (
                                                        <span className="text-[10px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded border border-green-900/50">PORTFOLIO</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-2">
                                                    {node.properties?.ai_summary || node.properties?.description || node.properties?.business_analysis?.core_business || 'No description available'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {msg.results.length > 3 && (
                                        <button 
                                            className="text-xs text-slate-500 hover:text-slate-300 text-left px-1"
                                            onClick={() => {
                                                // Trigger global update to ensure the bottom list is visible
                                                if (onGraphUpdate) {
                                                    onGraphUpdate(msg.relevant_node_ids || [], { nodes: msg.results || [], edges: [] });
                                                }
                                            }}
                                        >
                                            + {msg.results.length - 3} more results (view below graph)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {msg.role === 'user' && (
                             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                                <User className="w-4 h-4 text-slate-300" />
                            </div>
                        )}
                    </div>
                ))}

                {loading && (
                     <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 border border-slate-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-900 border-t border-slate-800">
                <form onSubmit={handleFormSubmit} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-4 pr-12 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
