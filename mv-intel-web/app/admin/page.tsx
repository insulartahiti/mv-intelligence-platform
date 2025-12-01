
'use client';

import { useState, useEffect } from 'react';
import { makeBrowserClient } from '@/lib/supabaseClient';
import { Loader2, Plus, RefreshCw, Trash2, Check, Shield, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AllowedUser {
    id: string;
    email: string;
    name: string;
    created_at: string;
}

export default function AdminPage() {
    const [users, setUsers] = useState<AllowedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const router = useRouter();
    
    const supabase = makeBrowserClient();

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'harsh.govil@motivepartners.com') {
                router.push('/');
                return;
            }
            fetchUsers();
        };
        checkAuth();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('allowed_users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching users:', error);
            setMessage({ text: 'Failed to fetch users. Table might not exist.', type: 'error' });
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setMessage(null);

        try {
            const { error } = await supabase
                .from('allowed_users')
                .insert({ email: newEmail, name: newName });

            if (error) throw error;

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

    const handleResendMagicLink = async (email: string) => {
        const confirm = window.confirm(`Send magic link to ${email}?`);
        if (!confirm) return;

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });
            if (error) throw error;
            alert(`Magic link sent to ${email}`);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDeleteUser = async (id: string) => {
        const confirm = window.confirm('Are you sure you want to remove this user? They will lose access.');
        if (!confirm) return;

        const { error } = await supabase.from('allowed_users').delete().eq('id', id);
        if (error) {
            alert('Failed to delete user');
        } else {
            fetchUsers();
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen bg-slate-950 items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-24">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Shield className="text-yellow-400" />
                            Admin Console
                        </h1>
                        <p className="text-slate-400 mt-2">Manage authorized users and access control.</p>
                    </div>
                    <div className="bg-blue-900/20 text-blue-400 px-4 py-2 rounded-full border border-blue-500/30 text-sm font-mono">
                        {users.length} Authorized Users
                    </div>
                </div>

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
                                <th className="p-4 font-medium text-right">Actions</th>
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
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleResendMagicLink(user.email)}
                                                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                title="Resend Magic Link"
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Remove User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                                        No users found. Add the first one above.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

