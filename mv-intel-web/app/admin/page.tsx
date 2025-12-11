'use client';

import { useState, useEffect } from 'react';
import { makeBrowserClient } from '@/lib/supabaseClient';
import { Loader2, Plus, RefreshCw, Trash2, Check, Shield, AlertTriangle, Bug, Image, ExternalLink, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { getIssues, updateIssueStatus } from '@/app/actions/issues';

interface AllowedUser {
    id: string;
    email: string;
    name: string;
    created_at: string;
}

export default function AdminPage() {
    const [users, setUsers] = useState<AllowedUser[]>([]);
    const [issues, setIssues] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [selectedIssue, setSelectedIssue] = useState<any>(null);

    const router = useRouter();
    const supabase = makeBrowserClient();

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'harsh.govil@motivepartners.com') {
                router.push('/');
                return;
            }
            // Fetch initial data
            fetchUsers();
            fetchIssues();
        };
        checkAuth();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        try {
            const res = await fetch('/api/auth/allowed-users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data || []);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const fetchIssues = async () => {
        try {
            const data = await getIssues();
            setIssues(data || []);
        } catch (e) {
            console.error('Failed to fetch issues', e);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setMessage(null);
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        try {
            const res = await fetch('/api/auth/allowed-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email: newEmail, name: newName })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add user');

            setMessage({ text: `User ${newEmail} added successfully.`, type: 'success' });
            setNewEmail('');
            setNewName('');
            fetchUsers();
        } catch (err: any) {
            setMessage({ text: err.message, type: 'error' });
        } finally {
            setAdding(false);
        }
    };

    const handleResendMagicLink = async (email: string) => { /* ... existing ... */ };
    const handleDeleteUser = async (id: string) => { /* ... existing ... */ };

    const handleStatusUpdate = async (issueId: string, newStatus: string) => {
        try {
            // Find current issue to keep priority
            const issue = issues.find(i => i.id === issueId);
            if (!issue) return;

            await updateIssueStatus(issueId, newStatus, issue.priority);
            
            // Optimistic update
            setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: newStatus } : i));
            if (selectedIssue?.id === issueId) {
                setSelectedIssue({ ...selectedIssue, status: newStatus });
            }
        } catch (e) {
            alert('Failed to update status');
        }
    };

    const handlePriorityUpdate = async (issueId: string, newPriority: string) => {
        try {
            const issue = issues.find(i => i.id === issueId);
            if (!issue) return;

            await updateIssueStatus(issueId, issue.status, newPriority);
            setIssues(prev => prev.map(i => i.id === issueId ? { ...i, priority: newPriority } : i));
        } catch (e) {
            alert('Failed to update priority');
        }
    };

    if (loading && users.length === 0) {
        return (
            <div className="flex h-screen bg-slate-950 items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-24 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Shield className="text-yellow-400" />
                            Admin Console
                        </h1>
                        <p className="text-slate-400 mt-2">Manage authorized users and system issues.</p>
                    </div>
                </div>

                <Tabs defaultValue="users" className="space-y-6">
                    <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-lg">
                        <TabsTrigger value="users" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white px-4 py-2 rounded-md transition-all">
                            User Management
                        </TabsTrigger>
                        <TabsTrigger value="issues" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white px-4 py-2 rounded-md transition-all flex items-center gap-2">
                            Issue Queue
                            {issues.filter(i => i.status === 'open').length > 0 && (
                                <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">
                                    {issues.filter(i => i.status === 'open').length}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="users">
                        {/* Add User Form */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-8">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Plus size={20} className="text-blue-400" />
                                Add New User
                            </h2>
                            <form onSubmit={handleAddUser} className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Email Address</label>
                                    <input 
                                        type="email" 
                                        required
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none text-slate-200"
                                        placeholder="colleague@motivepartners.com"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none text-slate-200"
                                        placeholder="Full Name"
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={adding}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {adding ? <Loader2 size={18} className="animate-spin" /> : 'Add User'}
                                </button>
                            </form>
                            {message && (
                                <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
                                    {message.text}
                                </div>
                            )}
                        </div>

                        {/* Users List */}
                        <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase text-slate-500">
                                        <th className="p-4 font-medium">Name</th>
                                        <th className="p-4 font-medium">Email</th>
                                        <th className="p-4 font-medium">Added Date</th>
                                        {/* <th className="p-4 font-medium text-right">Actions</th> */}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {users.map(user => (
                                        <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="p-4 font-medium text-slate-200">{user.name}</td>
                                            <td className="p-4 text-slate-400 font-mono text-sm">{user.email}</td>
                                            <td className="p-4 text-slate-500 text-sm">
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="issues">
                        <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
                             <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase text-slate-500">
                                        <th className="p-4 font-medium">Status</th>
                                        <th className="p-4 font-medium">Priority</th>
                                        <th className="p-4 font-medium">Description</th>
                                        <th className="p-4 font-medium">Reporter</th>
                                        <th className="p-4 font-medium">Date</th>
                                        <th className="p-4 font-medium text-right">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {issues.map(issue => (
                                        <tr key={issue.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="p-4">
                                                <select 
                                                    value={issue.status}
                                                    onChange={(e) => handleStatusUpdate(issue.id, e.target.value)}
                                                    className={`bg-transparent border-none text-xs font-bold uppercase rounded px-2 py-1 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none ${
                                                        issue.status === 'open' ? 'text-red-400 bg-red-900/20' :
                                                        issue.status === 'in_progress' ? 'text-yellow-400 bg-yellow-900/20' :
                                                        issue.status === 'resolved' ? 'text-emerald-400 bg-emerald-900/20' :
                                                        'text-slate-400 bg-slate-800'
                                                    }`}
                                                >
                                                    <option value="open">Open</option>
                                                    <option value="in_progress">In Progress</option>
                                                    <option value="resolved">Resolved</option>
                                                    <option value="wont_fix">Won't Fix</option>
                                                </select>
                                            </td>
                                            <td className="p-4">
                                                <span className={`text-xs px-2 py-1 rounded border ${
                                                    issue.priority === 'critical' ? 'border-red-500 text-red-400' :
                                                    issue.priority === 'high' ? 'border-orange-500 text-orange-400' :
                                                    issue.priority === 'medium' ? 'border-blue-500 text-blue-400' :
                                                    'border-slate-600 text-slate-400'
                                                }`}>
                                                    {issue.priority}
                                                </span>
                                            </td>
                                            <td className="p-4 max-w-xs truncate text-slate-300" title={issue.description}>
                                                {issue.description}
                                            </td>
                                            <td className="p-4 text-sm text-slate-400">
                                                {issue.profiles?.email || 'Unknown'}
                                            </td>
                                            <td className="p-4 text-sm text-slate-500">
                                                {new Date(issue.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => setSelectedIssue(issue)}
                                                    className="text-blue-400 hover:text-white text-sm font-medium"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {issues.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                                                No issues reported yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Issue Detail Modal */}
            {selectedIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Bug size={20} className="text-red-400" />
                                    Issue Details
                                </h2>
                                <p className="text-slate-400 text-sm mt-1">Reported by {selectedIssue.profiles?.email} on {new Date(selectedIssue.created_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedIssue(null)} className="text-slate-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                    <label className="text-xs uppercase text-slate-500 font-bold block mb-2">Status</label>
                                    <select 
                                        value={selectedIssue.status}
                                        onChange={(e) => handleStatusUpdate(selectedIssue.id, e.target.value)}
                                        className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 w-full"
                                    >
                                        <option value="open">Open</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="wont_fix">Won't Fix</option>
                                    </select>
                                </div>
                                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                                    <label className="text-xs uppercase text-slate-500 font-bold block mb-2">Priority</label>
                                    <select 
                                        value={selectedIssue.priority}
                                        onChange={(e) => handlePriorityUpdate(selectedIssue.id, e.target.value)}
                                        className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 w-full"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-slate-200 mb-2">User Description</h3>
                                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-slate-300 whitespace-pre-wrap">
                                    {selectedIssue.description}
                                </div>
                                <div className="mt-2 text-xs text-slate-500 font-mono">
                                    Path: {selectedIssue.path}
                                </div>
                            </div>

                            {selectedIssue.ai_summary && (
                                <div>
                                    <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
                                        <Shield size={16} className="text-blue-400" />
                                        AI Analysis
                                    </h3>
                                    <div className="bg-blue-900/10 p-4 rounded-lg border border-blue-500/20 text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                        {selectedIssue.ai_summary}
                                    </div>
                                </div>
                            )}

                            {selectedIssue.screenshot_url && (
                                <div>
                                    <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
                                        <Image size={16} />
                                        Screenshot
                                    </h3>
                                    <div className="rounded-lg overflow-hidden border border-slate-700">
                                        <a href={selectedIssue.screenshot_url} target="_blank" rel="noreferrer" className="block relative group">
                                            <img src={selectedIssue.screenshot_url} alt="Bug screenshot" className="w-full h-auto" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <span className="text-white flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full">
                                                    <ExternalLink size={16} /> Open Full Size
                                                </span>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
