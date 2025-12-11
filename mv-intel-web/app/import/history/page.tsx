import React from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { 
  ArrowLeft, 
  FileText, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Building2,
  Download
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// Helper to format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
};

async function getHistory() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) return [];
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // First get the source files
  const { data: sourceFiles, error } = await supabase
    .from('dim_source_files')
    .select('*')
    .order('ingested_at', { ascending: false })
    .limit(50);
    
  if (error) {
    console.error('Error fetching history:', error);
    return [];
  }
  
  if (!sourceFiles || sourceFiles.length === 0) return [];
  
  // Get unique company IDs
  const companyIds = [...new Set(sourceFiles.map(f => f.company_id).filter(Boolean))];
  
  // Fetch company names from graph.entities
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name')
    .in('id', companyIds);
  
  // Create a lookup map
  const entityMap = new Map(entities?.map(e => [e.id, e]) || []);
  
  // Attach company info to source files
  return sourceFiles.map(f => ({
    ...f,
    company: entityMap.get(f.company_id) || null
  }));
}

export default async function IngestionHistoryPage() {
  const history = await getHistory();

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link 
            href="/import" 
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Ingestion History</h1>
            <p className="text-slate-400">Log of all financial document uploads</p>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          {history.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/20">
                <Clock size={32} />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No History Found</h3>
              <p className="text-white/40">Uploaded files will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium text-white/60">Date</th>
                    <th className="px-6 py-4 font-medium text-white/60">Company</th>
                    <th className="px-6 py-4 font-medium text-white/60">File</th>
                    <th className="px-6 py-4 font-medium text-white/60">Status</th>
                    <th className="px-6 py-4 font-medium text-white/60 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-white/80 whitespace-nowrap">
                        {formatDate(item.ingested_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-blue-400" />
                          <span className="font-medium text-white">
                            {(item.company as any)?.name || 'Unknown Company'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-emerald-400" />
                          <span className="text-white/80 truncate max-w-[200px]" title={item.filename}>
                            {item.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          item.ingestion_status === 'success' 
                            ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                            : item.ingestion_status === 'failed'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {item.ingestion_status === 'success' ? <CheckCircle size={12} /> : 
                           item.ingestion_status === 'failed' ? <AlertCircle size={12} /> : 
                           <Clock size={12} />}
                          {item.ingestion_status?.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(item.company as any)?.id ? (
                          <Link 
                            href={`/portfolio/${(item.company as any).id}?tab=financials`}
                            className="text-blue-400 hover:text-blue-300 text-xs font-medium hover:underline cursor-pointer inline-block px-2 py-1"
                          >
                            View Dashboard
                          </Link>
                        ) : (
                          <span className="text-gray-500 text-xs">No Link</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
