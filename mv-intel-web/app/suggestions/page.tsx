'use client';

import { useState, useEffect } from 'react';
import { getSuggestions, createSuggestion, toggleVote } from '@/app/actions/suggestions';
import { makeBrowserClient } from '@/lib/supabaseClient';
import { Loader2, ThumbsUp, Plus, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const supabase = makeBrowserClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    setLoading(true);
    const data = await getSuggestions();
    
    // We need to check liked status client side based on current user
    const { data: { user } } = await supabase.auth.getUser();
    
    const processed = data.map((s: any) => ({
      ...s,
      liked_by_me: user ? s.votes.some((v: any) => v.user_id === user.id) : false
    }));
    
    setSuggestions(processed);
    setLoading(false);
  };

  const handleVote = async (id: string) => {
    if (!user) return;
    
    // Optimistic update
    setSuggestions(prev => prev.map(s => {
      if (s.id === id) {
        return {
          ...s,
          vote_count: s.liked_by_me ? s.vote_count - 1 : s.vote_count + 1,
          liked_by_me: !s.liked_by_me
        };
      }
      return s;
    }));

    await toggleVote(id, user.id);
    // Reload to ensure consistency? Or just trust optimistic.
    // Ideally we verify, but let's stick to optimistic for speed.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
      const result = await createSuggestion(newTitle, newDesc, user.id);
      if (result.status === 'merged') {
        alert('We found a similar suggestion and merged your input into it!');
      } else {
        // Created
      }
      setModalOpen(false);
      setNewTitle('');
      setNewDesc('');
      loadSuggestions();
    } catch (err: any) {
      alert('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-24 font-sans">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Community Suggestions
        </h1>
        
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Help shape the platform. Vote on features you want to see prioritized or suggest new ideas.
        </p>

        <div className="flex justify-center mt-8">
            {user && (
                <button
                onClick={() => setModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 hover:scale-105 font-medium"
                >
                <Plus size={20} />
                New Suggestion
                </button>
            )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : (
          <div className="grid gap-6 mt-12 text-left">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-6 rounded-2xl flex gap-6 hover:border-slate-700 transition-colors shadow-lg">
                <button
                  onClick={() => handleVote(suggestion.id)}
                  disabled={!user}
                  className={`flex flex-col items-center justify-center h-16 w-16 rounded-xl border transition-all ${
                    suggestion.liked_by_me 
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  <ThumbsUp size={20} className={suggestion.liked_by_me ? 'fill-current' : ''} />
                  <span className="text-sm font-bold mt-1">{suggestion.vote_count}</span>
                </button>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-semibold text-slate-200">{suggestion.title}</h3>
                    <StatusBadge status={suggestion.status} />
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg">{suggestion.description}</p>
                  
                  {suggestion.ai_summary && (
                    <div className="mt-4 text-xs text-slate-500 italic border-l-2 border-slate-800 pl-3">
                      AI Note: {suggestion.ai_summary}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {suggestions.length === 0 && (
              <div className="text-center py-16 text-slate-500 italic bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                No suggestions yet. Be the first to add one!
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold">New Suggestion</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  placeholder="e.g. Add Dark Mode"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  required
                  rows={5}
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none"
                  placeholder="Describe the feature..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2"
                >
                  {submitting && <Loader2 className="animate-spin" size={16} />}
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    pending: 'bg-slate-800 text-slate-400',
    approved: 'bg-blue-900/30 text-blue-400 border-blue-500/30',
    rejected: 'bg-red-900/30 text-red-400 border-red-500/30',
    implemented: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30',
  };
  
  const labels = {
    pending: 'In Review',
    approved: 'Planned',
    rejected: 'Declined',
    implemented: 'Shipped',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border border-transparent ${styles[status as keyof typeof styles] || styles.pending}`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}
