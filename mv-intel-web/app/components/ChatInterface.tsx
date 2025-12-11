'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Sparkles, Network, Building2, Users, Mail, MessageSquare, MessageCircle, ChevronDown, ChevronUp, BrainCircuit, Globe, Plus, History, Copy, Download, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getUserConversations, getConversationHistory } from '@/app/actions/chat';

const PLACEHOLDERS = [
    "Search companies, people, or ask anything...",
    "Which companies help banks modernize their core systems?",
    "List companies with similar business models to Triver",
    "Show my portfolio companies",
    "Draft a WhatsApp intro connecting Mark Gilbert with Neel Ganu",
];

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    relevant_node_ids?: string[];
    results?: any[]; 
    messageDraft?: { // Legacy support
        channel: 'email' | 'sms' | 'whatsapp';
        recipient_name: string;
        recipient_contact?: string;
        subject?: string;
        body: string;
    };
    messageDrafts?: { // New array support
        channel: 'email' | 'sms' | 'whatsapp';
        recipient_name: string;
        recipient_contact?: string;
        subject?: string;
        body: string;
    }[];
    thoughts?: string[]; // Log of reasoning steps
    isThinking?: boolean;
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
    userEntity?: any;
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
    variant = 'default',
    userEntity
}: ChatInterfaceProps) {
    const [internalConvId, setInternalConvId] = useState<string | null>(null);
    const [internalMessages, setInternalMessages] = useState<Message[]>([]);
    const [internalLoading, setInternalLoading] = useState(false);
    const [input, setInput] = useState('');
    const [enableExternalSearch, setEnableExternalSearch] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    const [placeholderIndex, setPlaceholderIndex] = useState(0);

    const conversationId = propConvId !== undefined ? propConvId : internalConvId;
    const setConversationId = propSetConvId || setInternalConvId;
    
    const messages = propMessages !== undefined ? propMessages : internalMessages;
    const setMessages = propSetMessages || setInternalMessages;

    const loading = propLoading !== undefined ? propLoading : internalLoading;
    const setLoading = propSetLoading || setInternalLoading;

    // Load conversations on mount or when history opens
    useEffect(() => {
        if (showHistory && userEntity?.id) {
            loadConversations();
        }
    }, [showHistory, userEntity]);

    const loadConversations = async () => {
        if (!userEntity?.id) return;
        try {
            const convs = await getUserConversations(userEntity.id);
            setConversations(convs || []);
        } catch (e) {
            console.error("Failed to load conversations", e);
        }
    };

    const handleNewChat = () => {
        setConversationId(null);
        setMessages([]);
        setShowHistory(false);
        if (onSearchStart) onSearchStart(); // Reset view if needed
    };

    const handleSelectConversation = async (id: string) => {
        setLoading(true);
        try {
            const history = await getConversationHistory(id);
            setConversationId(id);
            setMessages(history.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                relevant_node_ids: m.relevant_node_ids
            })));
            setShowHistory(false);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleDownload = (content: string, id: string) => {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-response-${id.slice(0, 8)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Cycle placeholders for spotlight variant
    useEffect(() => {
        if (variant !== 'spotlight') return;
        const interval = setInterval(() => {
            setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDERS.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [variant]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]); // Added loading to dependency to scroll when thoughts update

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

        // 1. Add User Message
        setMessages(prev => [...prev, userMsg]);
        
        // 2. Create Placeholder Assistant Message with Thinking State
        const assistantMsgId = crypto.randomUUID();
        const assistantMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '', // Empty initially
            thoughts: [],
            isThinking: true
        };
        setMessages(prev => [...prev, assistantMsg]);

        const currentInput = input;
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    message: currentInput,
                    enableExternalSearch,
                    userEntity: userEntity ? {
                        id: userEntity.id,
                        name: userEntity.name,
                        type: userEntity.type,
                        business_analysis: userEntity.business_analysis,
                        enrichment_data: userEntity.enrichment_data
                    } : undefined
                })
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let buffer = '';

            // Stream Processing Loop
            while (!done) {
                const { value, done: streamDone } = await reader.read();
                done = streamDone;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    
                    // Combine buffer with new chunk
                    const text = buffer + chunk;
                    const lines = text.split('\n');
                    
                    // The last line might be partial, save it back to buffer
                    // If chunk ends with \n, last line is empty string, which is fine
                    buffer = lines.pop() || ''; 
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        try {
                            const event = JSON.parse(line);
                            
                            setMessages(prev => prev.map(msg => {
                                if (msg.id !== assistantMsgId) return msg;

                                if (event.type === 'thought') {
                                    return { ...msg, thoughts: [...(msg.thoughts || []), event.content] };
                                }
                                if (event.type === 'tool_start') {
                                    // Optionally log tool usage
                                    // return { ...msg, thoughts: [...(msg.thoughts || []), `Using tool: ${event.name}`] };
                                    return msg;
                                }
                                if (event.type === 'init') {
                                    if (event.conversationId && !conversationId) {
                                        setConversationId(event.conversationId);
                                    }
                                    return msg;
                                }
                                if (event.type === 'final') {
                                    // Global Graph Update
                                    if (onGraphUpdate) {
                                        onGraphUpdate(event.relevantNodeIds || [], event.subgraph);
                                    }
                                    
                                    // Normalize drafts (handle single vs array from server)
                                    let drafts = event.messageDrafts || [];
                                    if (!drafts.length && event.messageDraft) {
                                        drafts = [event.messageDraft];
                                    }

                                    return {
                                        ...msg,
                                        content: event.reply || "I found some results but couldn't generate a summary.",
                                        relevant_node_ids: event.relevantNodeIds,
                                        results: event.subgraph?.nodes,
                                        messageDrafts: drafts,
                                        isThinking: false
                                    };
                                }
                                if (event.type === 'error') {
                                    return { ...msg, content: `Error: ${event.message}`, isThinking: false };
                                }
                                return msg;
                            }));

                        } catch (e) {
                            console.error('Error parsing stream chunk:', e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => prev.map(msg => 
                msg.id === assistantMsgId 
                ? { ...msg, content: 'Sorry, I encountered an error processing your request.', isThinking: false }
                : msg
            ));
        } finally {
            setLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend();
    };

    // --- Render Component for Thoughts ---
    const ThoughtProcess = ({ thoughts, isThinking }: { thoughts?: string[], isThinking?: boolean }) => {
        const [isExpanded, setIsExpanded] = useState(false); // Closed by default

        if (!thoughts || thoughts.length === 0) return null;

        return (
            <div className="mb-3">
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-800"
                >
                    <BrainCircuit className={`w-3.5 h-3.5 ${isThinking ? 'animate-pulse text-blue-400' : ''}`} />
                    {isThinking ? 'Reasoning...' : 'Thought Process'}
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                
                {isExpanded && (
                    <div className="mt-2 pl-2 border-l-2 border-slate-800 space-y-2">
                        {thoughts.map((thought, i) => (
                            <div key={i} className="text-xs text-slate-400 animate-fadeIn flex items-start gap-2">
                                <span className="mt-1 w-1 h-1 rounded-full bg-slate-600 flex-shrink-0" />
                                <span>{thought}</span>
                            </div>
                        ))}
                        {isThinking && (
                            <div className="flex gap-1 pl-3 pt-1">
                                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce"></span>
                                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce delay-75"></span>
                                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce delay-150"></span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ... Spotlight variant logic ... (Simplified for brevity, keeping existing logic if needed)
    if (variant === 'spotlight') {
        // (Keeping the exact same spotlight render as before for safety, just updated with handleFormSubmit)
        return (
            <div className="w-full max-w-2xl mx-auto">
                <form onSubmit={handleFormSubmit} className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Sparkles className="h-6 w-6 text-blue-400 group-focus-within:text-blue-300 transition-colors" />
                    </div>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={PLACEHOLDERS[placeholderIndex]}
                        autoFocus
                        className="block w-full pl-12 pr-16 py-5 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl text-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 shadow-2xl transition-all"
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
        <div className="flex flex-col h-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center relative z-20">
                <div className="flex items-center gap-3">
                    {userEntity && (
                        <button 
                            onClick={() => setShowHistory(!showHistory)}
                            className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-400'}`}
                            title="History"
                        >
                            <History className="w-4 h-4" />
                        </button>
                    )}
                    <button 
                        onClick={handleNewChat}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-400 transition-colors"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <h2 className="font-semibold text-slate-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        Motive Intelligence
                    </h2>
                </div>
                
                <button
                    onClick={() => setEnableExternalSearch(!enableExternalSearch)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        enableExternalSearch 
                            ? 'bg-amber-900/20 text-amber-400 border-amber-500/50' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                >
                    <Globe className="w-3 h-3" />
                    {enableExternalSearch ? 'Web Search ON' : 'Web Search OFF'}
                </button>
            </div>

            {/* Main Content Area with Mini Sidebar */}
            <div className="flex flex-1 min-h-0 overflow-hidden relative">
                
                {/* Mini Sidebar (Persistent Session History) */}
                <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-4 z-20 flex-shrink-0">
                    <button 
                        onClick={handleNewChat}
                        className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg transition-all hover:scale-105"
                        title="New Chat"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                    
                    <div className="w-8 h-[1px] bg-slate-800" />
                    
                    <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-3 scrollbar-none">
                        {conversations.slice(0, 5).map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleSelectConversation(c.id)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                    c.id === conversationId 
                                        ? 'bg-slate-800 text-blue-400 border border-blue-500/30 ring-2 ring-blue-500/20' 
                                        : 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-300 border border-slate-800'
                                }`}
                                title={c.title || 'Conversation'}
                            >
                                <MessageSquare className="w-4 h-4" />
                            </button>
                        ))}
                        {conversations.length > 5 && (
                            <button 
                                onClick={() => setShowHistory(true)}
                                className="w-8 h-8 rounded-full bg-slate-900 text-slate-600 flex items-center justify-center hover:text-slate-400 text-xs font-medium"
                            >
                                +{conversations.length - 5}
                            </button>
                        )}
                    </div>

                    <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className={`p-3 rounded-xl transition-colors ${showHistory ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'}`}
                        title="Full History"
                    >
                        <History className="w-5 h-5" />
                    </button>
                </div>

                {/* History Sidebar (Slide-out) */}
                <div className={`absolute top-0 left-16 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-r border-slate-800 z-30 transform transition-transform duration-300 ${showHistory ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <span className="font-medium text-slate-300">History</span>
                        <button onClick={() => setShowHistory(false)}><X className="w-4 h-4 text-slate-500" /></button>
                    </div>
                    <div className="overflow-y-auto h-full p-2 space-y-1">
                        {conversations.map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleSelectConversation(c.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${c.id === conversationId ? 'bg-blue-900/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
                            >
                                {c.title || 'New Conversation'}
                            </button>
                        ))}
                        {conversations.length === 0 && <div className="p-4 text-xs text-slate-600 text-center">No history found</div>}
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-900">
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
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
                            {/* Thought Process (Only for Assistant) */}
                            {msg.role === 'assistant' && (
                                <ThoughtProcess thoughts={msg.thoughts} isThinking={msg.isThinking} />
                            )}

                            {/* Text Bubble (Only show if content exists or not thinking) */}
                            {(msg.content || !msg.isThinking) && (
                                <div className={`relative group/bubble rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                                    
                                    {/* Copy/Download Actions for Assistant */}
                                    {msg.role === 'assistant' && !msg.isThinking && (
                                        <div className="absolute -bottom-6 right-0 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1">
                                            <button 
                                                onClick={() => handleCopy(msg.content)}
                                                className="p-1 text-slate-500 hover:text-slate-300 rounded bg-slate-900/50 border border-slate-800"
                                                title="Copy to Clipboard"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button 
                                                onClick={() => handleDownload(msg.content, msg.id)}
                                                className="p-1 text-slate-500 hover:text-slate-300 rounded bg-slate-900/50 border border-slate-800"
                                                title="Download as Markdown"
                                            >
                                                <Download className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Message Draft Buttons (Multiple) */}
                            {msg.role === 'assistant' && msg.messageDrafts && msg.messageDrafts.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2 animate-fadeIn">
                                    {msg.messageDrafts.map((draft, index) => (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                const { channel, recipient_contact, subject, body } = draft;
                                                const contact = recipient_contact || '';
                                                
                                                let link = '';
                                                if (channel === 'email') {
                                                    link = `mailto:${contact}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body)}`;
                                                } else if (channel === 'sms') {
                                                    const sep = navigator.userAgent.match(/iPhone|iPad|iPod/i) ? '&' : '?';
                                                    link = `sms:${contact}${sep}body=${encodeURIComponent(body)}`;
                                                } else if (channel === 'whatsapp') {
                                                    const cleanPhone = contact.replace(/\D/g, '');
                                                    link = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`;
                                                }
                                                
                                                if (link) window.open(link, '_blank');
                                            }}
                                            title={`Draft ${draft.channel} to ${draft.recipient_name}`}
                                            className={`p-3 rounded-full transition-all shadow-lg hover:scale-105 flex items-center gap-2 text-xs font-medium px-4 ${
                                                draft.channel === 'whatsapp' ? 'bg-[#25D366] hover:bg-[#128C7E] text-white' :
                                                draft.channel === 'sms' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' :
                                                'bg-blue-600 hover:bg-blue-500 text-white'
                                            }`}
                                        >
                                            {draft.channel === 'email' && <Mail className="w-4 h-4" />}
                                            {draft.channel === 'sms' && <MessageSquare className="w-4 h-4" />}
                                            {draft.channel === 'whatsapp' && <MessageCircle className="w-4 h-4" />}
                                            <span>
                                                {draft.channel === 'whatsapp' ? 'WhatsApp' : draft.channel === 'sms' ? 'Text' : 'Email'} {draft.recipient_name.split(' ')[0]}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            
                            {/* Legacy Single Draft Fallback (if drafts array is empty but single draft exists) */}
                            {msg.role === 'assistant' && !msg.messageDrafts && msg.messageDraft && (
                                <div className="mt-2 flex items-center gap-2 animate-fadeIn">
                                    <button
                                        onClick={() => {
                                            const { channel, recipient_contact, subject, body } = msg.messageDraft!;
                                            const contact = recipient_contact || '';
                                            let link = '';
                                            if (channel === 'email') link = `mailto:${contact}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body)}`;
                                            else if (channel === 'sms') link = `sms:${contact}?body=${encodeURIComponent(body)}`;
                                            else if (channel === 'whatsapp') link = `https://wa.me/${contact.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`;
                                            if (link) window.open(link, '_blank');
                                        }}
                                        title={`Draft ${msg.messageDraft.channel}`}
                                        className="p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg"
                                    >
                                        {msg.messageDraft.channel === 'email' && <Mail className="w-5 h-5" />}
                                        {msg.messageDraft.channel === 'sms' && <MessageSquare className="w-5 h-5" />}
                                        {msg.messageDraft.channel === 'whatsapp' && <MessageCircle className="w-5 h-5" />}
                                    </button>
                                </div>
                            )}

                            {/* Inline Results Grid (Only for Assistant) */}
                            {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                                <div className="grid grid-cols-1 gap-2 mt-1 w-full animate-fadeIn">
                                    {msg.results.slice(0, 3).map((node: any) => {
                                        const isExternal = node.group === 'external';
                                        return (
                                            <div 
                                                key={node.id}
                                                onClick={() => {
                                                    if (isExternal && node.properties?.url) {
                                                        window.open(node.properties.url, '_blank');
                                                    } else {
                                                        onNodeSelect?.(node.id);
                                                    }
                                                }}
                                                className={`border rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 group ${
                                                    isExternal 
                                                        ? 'bg-amber-900/10 hover:bg-amber-900/20 border-amber-500/30 hover:border-amber-500' 
                                                        : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/50 hover:border-blue-500/50'
                                                }`}
                                            >
                                                <div className={`p-2 rounded-md flex-shrink-0 ${
                                                    isExternal 
                                                        ? 'bg-amber-900/20 text-amber-500' 
                                                        : (node.group === 'organization' ? 'bg-purple-900/20 text-purple-400' : 'bg-blue-900/20 text-blue-400')
                                                }`}>
                                                    {isExternal ? <Globe className="w-4 h-4" /> : 
                                                     (node.group === 'organization' ? <Building2 className="w-4 h-4" /> : <Users className="w-4 h-4" />)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <h4 className={`font-medium truncate transition-colors ${
                                                            isExternal ? 'text-amber-200 group-hover:text-amber-100' : 'text-slate-200 group-hover:text-blue-400'
                                                        }`}>
                                                            {node.label}
                                                        </h4>
                                                        {node.properties?.is_portfolio && (
                                                            <span className="text-[10px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded border border-green-900/50">PORTFOLIO</span>
                                                        )}
                                                        {isExternal && (
                                                            <span className="text-[10px] bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded border border-amber-900/60 ml-auto">
                                                                WEB SOURCE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 line-clamp-2">
                                                        {node.properties?.ai_summary || node.properties?.description || node.properties?.business_analysis?.core_business || 'No description available'}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {msg.results.length > 3 && (
                                        <button 
                                            className="text-xs text-slate-500 hover:text-slate-300 text-left px-1"
                                            onClick={() => {
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

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 p-2 bg-slate-900 border-t border-slate-800">
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
      </div>
    </div>
    );
}
