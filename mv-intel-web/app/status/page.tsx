'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Share2, 
  RefreshCw, 
  FileText, 
  MessageSquare, 
  Users, 
  CheckCircle,
  AlertTriangle,
  Clock,
  Play
} from 'lucide-react';

export default function StatusPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/graph/system-status');
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError('Failed to connect to status API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerPipeline = async () => {
      if (triggering) return;
      if (!confirm('Are you sure you want to trigger a full pipeline run? This may take several minutes.')) return;

      setTriggering(true);
      try {
          const res = await fetch('/api/pipeline/trigger', { method: 'POST' });
          if (res.ok) {
              alert('Pipeline triggered successfully. Monitor status below.');
              fetchStatus();
          } else {
              alert('Failed to trigger pipeline.');
          }
      } catch (err) {
          console.error(err);
          alert('Error connecting to server.');
      } finally {
          setTriggering(false);
      }
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              System Status
            </h1>
            <p className="text-slate-400 mt-2">Real-time pipeline monitoring and data health</p>
          </div>
          <div className="flex gap-3">
            <button 
                onClick={handleTriggerPipeline}
                disabled={triggering}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <Play className="w-4 h-4" />
                {triggering ? 'Starting...' : 'Run Pipeline'}
            </button>
            <button 
                onClick={fetchStatus}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg mb-8 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Sync Status Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 lg:col-span-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className={`p-3 rounded-full ${status?.syncStatus === 'running' ? 'bg-blue-900/20 text-blue-400 animate-pulse' : 'bg-green-900/20 text-green-400'}`}>
                 <RefreshCw className="w-6 h-6" />
               </div>
               <div>
                 <h3 className="text-lg font-semibold text-slate-200">Pipeline Status</h3>
                 <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                   <span className={`inline-block w-2 h-2 rounded-full ${status?.syncStatus === 'running' ? 'bg-blue-500' : 'bg-green-500'}`}></span>
                   <span className="capitalize">{status?.syncStatus || 'Idle'}</span>
                   <span className="mx-2">•</span>
                   <Clock className="w-4 h-4" />
                   Last synced: {status?.lastSyncTimestamp ? new Date(status.lastSyncTimestamp).toLocaleString() : 'Never'}
                 </div>
               </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-2xl font-bold text-slate-100">{status?.lastSyncEntitiesSynced || 0}</div>
              <div className="text-sm text-slate-500 uppercase tracking-wide font-medium">Entities Synced Last Run</div>
            </div>
          </div>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard 
            icon={<Database className="w-5 h-5 text-indigo-400" />}
            title="Total Entities"
            value={status?.totalEntities}
            subtitle={`${status?.embeddingCoverage}% Vectorized`}
          />
          <MetricCard 
            icon={<Share2 className="w-5 h-5 text-pink-400" />}
            title="Graph Edges"
            value={status?.totalEdges}
            subtitle="Relationships"
          />
          <MetricCard 
            icon={<MessageSquare className="w-5 h-5 text-yellow-400" />}
            title="Interactions"
            value={status?.totalInteractions}
            subtitle={`${status?.interactionCoverage}% AI Summarized`}
          />
          <MetricCard 
            icon={<FileText className="w-5 h-5 text-cyan-400" />}
            title="Affinity Files"
            value={status?.totalFiles}
            subtitle="Indexed Documents"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Detailed Health */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Data Health & Coverage
                </h3>
                <div className="space-y-6">
                    <ProgressBar label="AI Enhancement (Taxonomy/Summary)" percentage={status?.enhancementCoverage || 0} color="bg-blue-500" />
                    <ProgressBar label="Vector Embeddings" percentage={status?.embeddingCoverage || 0} color="bg-purple-500" />
                    <ProgressBar label="Interaction Summarization" percentage={status?.interactionCoverage || 0} color="bg-yellow-500" />
                </div>
            </div>

            {/* Recent Logs */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-400" />
                    Recent Activity
                </h3>
                <div className="space-y-4">
                    {status?.recentHistory?.length > 0 ? (
                        status.recentHistory.map((log: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 text-sm pb-4 border-b border-slate-800/50 last:border-0">
                                <div className="mt-1">
                                    <CheckCircle className="w-4 h-4 text-green-500/50" />
                                </div>
                                <div>
                                    <p className="text-slate-300">
                                        <span className="font-semibold text-indigo-400">{log.field_name}</span> changed for entity {log.entity_id.substring(0,8)}...
                                    </p>
                                    <p className="text-slate-500 text-xs mt-1">
                                        {new Date(log.changed_at).toLocaleString()} • via {log.source}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-slate-500 italic">No recent activity logs found.</p>
                    )}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, subtitle }: any) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
          {icon}
        </div>
        <div className="text-right">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</div>
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-100 mb-1">{value?.toLocaleString()}</div>
      <div className="text-sm text-slate-400">{subtitle}</div>
    </div>
  );
}

function ProgressBar({ label, percentage, color }: any) {
    return (
        <div>
            <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-300 font-medium">{label}</span>
                <span className="text-slate-400">{percentage}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ${color}`} 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
}

