'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  MapPin, 
  DollarSign, 
  ArrowLeft,
  FileText,
  TrendingUp,
  Settings,
  Globe,
  Newspaper,
  Calendar,
  Shield, 
  Briefcase,
  Loader2,
  Upload,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Download,
  Search,
  Tag,
  FileText as FileIcon,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { FinancialsDashboard } from '@/app/portfolio/components/FinancialsDashboard';

interface AnalysisSummary {
  id: string;
  document_name: string;
  document_type: string;
  jurisdiction: string;
  executive_summary: { point: string; flag: string; category: string }[];
  flags: {
    economics_downside?: { flag: string };
    control_governance?: { flag: string };
    legal_gc_risk?: { flag: string };
  };
  created_at: string;
}

const flagColors: Record<string, string> = {
  GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AMBER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  RED: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const flagIcons: Record<string, React.ReactNode> = {
  GREEN: <CheckCircle size={14} />,
  AMBER: <AlertTriangle size={14} />,
  RED: <AlertCircle size={14} />
};

// Helper to parse filename into structured metadata
function parseMetadata(name: string) {
  // Remove extension
  const cleanName = name.replace(/\.(docx|pdf|doc)$/i, '');
  
  // Try to split by " - " which is the standard separator
  const parts = cleanName.split(' - ').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Assumption: Company - Deal/Round - Document Name
    // e.g. "Zocks Inc - Series A - SPA"
    return {
      company: parts[0],
      deal: parts[1],
      docName: parts.slice(2).join(' - ')
    };
  } else if (parts.length === 2) {
    // Assumption: Company - Document Name
    return {
      company: parts[0],
      deal: 'General',
      docName: parts[1]
    };
  }
  
  return {
    company: 'Uncategorized',
    deal: 'General',
    docName: cleanName
  };
}

function AnalysisCard({ analysis, displayName }: { analysis: AnalysisSummary; displayName: string }) {
  return (
    <Link
      key={analysis.id}
      href={`/portfolio/legal/analysis?id=${analysis.id}`}
      className="block bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/30 rounded-lg p-5 transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <FileIcon size={18} className="text-emerald-400 shrink-0" />
            <h4 className="text-base font-medium text-white group-hover:text-emerald-400 transition-colors truncate" title={displayName}>
              {displayName}
            </h4>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs border border-blue-500/20">
              {analysis.jurisdiction}
            </span>
            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded text-xs border border-purple-500/20">
              {analysis.document_type.replace(/_/g, ' ')}
            </span>
            <span className="flex items-center gap-1 text-white/40 text-xs ml-auto">
              <Calendar size={10} />
              {new Date(analysis.created_at).toLocaleDateString()}
            </span>
          </div>
          
          {analysis.flags && (
            <div className="flex flex-wrap items-center gap-2">
              {analysis.flags.economics_downside?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.economics_downside.flag]}`}>
                  {flagIcons[analysis.flags.economics_downside.flag]}
                  Econ
                </span>
              )}
              {analysis.flags.control_governance?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.control_governance.flag]}`}>
                  {flagIcons[analysis.flags.control_governance.flag]}
                  Gov
                </span>
              )}
              {analysis.flags.legal_gc_risk?.flag && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${flagColors[analysis.flags.legal_gc_risk.flag]}`}>
                  {flagIcons[analysis.flags.legal_gc_risk.flag]}
                  Legal
                </span>
              )}
            </div>
          )}
        </div>
        <ArrowLeft size={18} className="text-white/20 group-hover:text-emerald-400 transition-colors shrink-0 mt-1 rotate-180" />
      </div>
    </Link>
  );
}

function CompanyLegalList({ companyId }: { companyId: string }) {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalyses = async () => {
      try {
        const res = await fetch(`/api/portfolio/legal-analysis?companyId=${companyId}&limit=50`);
        const data = await res.json();
        if (data.success) {
          setAnalyses(data.analyses || []);
        }
      } catch (err) {
        console.error('Error fetching legal analyses:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalyses();
  }, [companyId]);

  // Group by Deal/Round
  const groupedAnalyses = useMemo(() => {
    const groups: Record<string, AnalysisSummary[]> = {};
    
    analyses.forEach(analysis => {
      const { deal } = parseMetadata(analysis.document_name);
      if (!groups[deal]) {
        groups[deal] = [];
      }
      groups[deal].push(analysis);
    });
    
    return groups;
  }, [analyses]);

  if (loading) return <div className="p-8 text-center text-white/50"><Loader2 className="animate-spin mx-auto mb-2" />Loading documents...</div>;

  if (analyses.length === 0) {
    return (
      <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
        <Shield size={48} className="mx-auto text-white/20 mb-4" />
        <h3 className="text-xl font-medium text-white">No Legal Documents</h3>
        <p className="text-white/50 mt-2">Upload term sheets or agreements to see analysis here.</p>
        <Link href="/portfolio/legal" className="inline-block mt-6 text-emerald-400 hover:underline">
          Upload New Document →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Legal Analysis ({analyses.length})</h3>
        <Link href="/portfolio/legal" className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
          <Upload size={14} /> Upload New
        </Link>
      </div>
      
      {Object.entries(groupedAnalyses).sort().map(([deal, docs]) => (
        <div key={deal} className="space-y-3">
          {deal !== 'General' && (
            <div className="flex items-center gap-2 text-white/60 border-b border-white/5 pb-2">
              <FolderOpen size={16} className="text-emerald-500/60" />
              <h4 className="text-sm font-semibold uppercase tracking-wider">{deal}</h4>
              <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-white/40">{docs.length} docs</span>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {docs.map((analysis) => {
              const { docName } = parseMetadata(analysis.document_name);
              return <AnalysisCard key={analysis.id} analysis={analysis} displayName={docName} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface CompanyDetail {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  brief_description?: string;
  description?: string;
  location_city?: string;
  location_country?: string;
  investment_amount?: number;
  fund?: string;
  status?: string;
  taxonomy?: string;
  latest_summary?: string;
  summary_updated_at?: string;
}

interface NewsItem {
  title: string;
  date: string;
  source: string;
  summary: string;
}

export default function PortfolioCompanyPage({ params, searchParams }: { params: { id: string }, searchParams: { tab?: string } }) {
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [customNewsQuery, setCustomQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  
  // Tab state controlled by URL or internal state
  const [activeTab, setActiveTab] = useState(searchParams?.tab || 'overview');

  useEffect(() => {
    if (searchParams?.tab) {
      setActiveTab(searchParams.tab);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchCompanyDetails();
  }, [params.id]);

  useEffect(() => {
    if (company?.name) {
      fetchNews(company);
    }
  }, [company]);

  const fetchNews = async (comp: CompanyDetail, queryOverride?: string, forceRefresh = false) => {
    setNewsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        companyName: comp.name,
        companyId: comp.id,
      });
      if (comp.domain) queryParams.append('domain', comp.domain);
      if (comp.industry) queryParams.append('industry', comp.industry);
      if (queryOverride) queryParams.append('query', queryOverride);
      if (forceRefresh) queryParams.append('forceRefresh', 'true');

      const res = await fetch(`/api/portfolio/news?${queryParams.toString()}`);
      const data = await res.json();
      if (data.news && Array.isArray(data.news)) {
        setNews(data.news);
        if (data.lastRefreshed) setLastRefreshed(data.lastRefreshed);
      }
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setNewsLoading(false);
    }
  };

  const handleNewsSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    fetchNews(company, customNewsQuery, true); // Search implies fresh results
  };

  const handleRefreshNews = () => {
    if (!company) return;
    fetchNews(company, customNewsQuery, true);
  };

  const fetchCompanyDetails = async () => {
    try {
      const res = await fetch(`/api/portfolio/companies?q=&companyId=${params.id}`); 
      const data = await res.json();
      const found = data.companies.find((c: any) => c.id === params.id);
      if (found) setCompany(found);
    } catch (error) {
      console.error('Error fetching company:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading...</div>;
  if (!company) return <div className="p-8 text-white">Company not found</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link 
            href="/portfolio"
            className="inline-flex items-center text-sm text-white/50 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft size={16} className="mr-1" />
            Back to Dashboard
          </Link>
          
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl font-bold text-emerald-400">
                {company.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  {company.name}
                  {company.status && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">
                      {company.status}
                    </span>
                  )}
                </h1>
                <div className="flex items-center gap-4 text-sm text-white/50 mt-1">
                  {company.domain && (
                    <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 flex items-center gap-1">
                      <Globe size={14} /> {company.domain}
                    </a>
                  )}
                  {company.location_city && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} /> {company.location_city}, {company.location_country}
                    </span>
                  )}
                  {company.fund && (
                    <span className="flex items-center gap-1">
                      <Briefcase size={14} /> {company.fund}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-white/40 mb-1">Total Investment</div>
              <div className="text-xl font-mono text-emerald-400">
                {company.investment_amount ? `$${(company.investment_amount / 1000000).toFixed(1)}M` : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="flex border-b border-white/10 mb-8">
            <Tabs.Trigger 
              value="overview"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors"
            >
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="financials"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors"
            >
              Financials
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="legal"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors"
            >
              Legal
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="guide"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors"
            >
              Config Guide
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Column */}
              <div className="lg:col-span-2 space-y-8">
                {/* About */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4">About</h3>
                  <p className="text-white/70 leading-relaxed">
                    {company.brief_description || company.description || "No description available."}
                  </p>
                </section>

                {/* Classification / Taxonomy */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Tag size={20} className="text-purple-400" />
                    Classification
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-white/40 mb-1">Taxonomy Code</div>
                      {company.taxonomy ? (
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-mono">
                          {company.taxonomy}
                        </div>
                      ) : (
                        <div className="text-white/30 italic text-sm">Not classified</div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-white/40 mb-1">Industry</div>
                      <div className="text-white/80">{company.industry || 'Unknown'}</div>
                    </div>
                  </div>
                </section>

                {/* Key Updates */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-emerald-400" />
                    Key Updates
                  </h3>
                  <div className="space-y-4">
                    {company.latest_summary ? (
                      <div className="p-4 bg-white/5 rounded-lg border-l-2 border-emerald-500">
                        <div className="text-sm text-white/40 mb-1">
                          {company.summary_updated_at 
                            ? new Date(company.summary_updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' }) + ' • AI Summary'
                            : 'Recent Update'}
                        </div>
                        <p className="text-white/80 whitespace-pre-wrap">{company.latest_summary}</p>
                      </div>
                    ) : (
                      <div className="text-white/40 italic text-sm">No recent key updates found.</div>
                    )}
                  </div>
                </section>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* News Feed */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Newspaper size={20} className="text-blue-400" />
                      Latest News
                    </h3>
                    <div className="flex items-center gap-2">
                      {lastRefreshed && (
                        <span className="text-[10px] text-white/30">
                          Updated {new Date(lastRefreshed).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      )}
                      <button 
                        onClick={handleRefreshNews} 
                        disabled={newsLoading}
                        className="text-white/40 hover:text-white transition-colors"
                        title="Force Refresh"
                      >
                        <RefreshCw size={14} className={newsLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                  
                  <form onSubmit={handleNewsSearch} className="mb-4 relative">
                    <input
                      type="text"
                      placeholder="Search news..."
                      value={customNewsQuery}
                      onChange={(e) => setCustomQuery(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
                    />
                    <button type="submit" className="absolute right-2 top-2 text-white/40 hover:text-white">
                      <Search size={12} />
                    </button>
                  </form>

                  <div className="space-y-4">
                    {newsLoading ? (
                       <div className="text-sm text-white/40 italic flex items-center gap-2">
                         <Loader2 size={14} className="animate-spin" /> Loading updates...
                       </div>
                    ) : news.length > 0 ? (
                      news.map((item, idx) => {
                        const hasUrl = (item as any).url;
                        const Content = (
                          <>
                             <div className="flex justify-between items-start mb-1">
                                <span className={`text-sm font-medium text-emerald-400 line-clamp-2 ${hasUrl ? 'group-hover:underline' : ''}`}>{item.title}</span>
                                <span className="text-xs text-white/40 whitespace-nowrap ml-2">{item.date}</span>
                             </div>
                             <div className="text-xs text-white/50 mb-2">{item.source}</div>
                             <p className="text-xs text-white/70 line-clamp-3">{item.summary}</p>
                             {hasUrl && (
                               <div className="mt-2 text-[10px] text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  Read full article <ExternalLink size={10} />
                               </div>
                             )}
                          </>
                        );

                        return hasUrl ? (
                          <a 
                             key={idx} 
                             href={(item as any).url} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="block p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors group cursor-pointer"
                          >
                             {Content}
                          </a>
                        ) : (
                          <div key={idx} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors group">
                             {Content}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-white/40 italic">
                        No recent news found.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
                     <div className="text-[10px] text-white/30 uppercase tracking-widest flex items-center gap-1">
                       Powered by Perplexity
                     </div>
                  </div>
                </section>
              </div>
            </div>
          </Tabs.Content>
          
          <Tabs.Content value="financials">
             <FinancialsDashboard companyId={params.id} />
          </Tabs.Content>
          
           <Tabs.Content value="legal">
             <CompanyLegalList companyId={params.id} />
          </Tabs.Content>

          <Tabs.Content value="guide">
            <GuideEditor companyId={params.id} companyName={company.name} />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}

// Sub-component for Guide Editing
function GuideEditor({ companyId, companyName }: { companyId: string, companyName: string }) {
  const [guide, setGuide] = useState<any>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  
  // File Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchGuide();
  }, [companyId]);

  const fetchGuide = async () => {
    const res = await fetch(`/api/portfolio/guide?companyId=${companyId}`);
    const data = await res.json();
    if (data.guide) {
      setGuide(data.guide);
      setYamlContent(data.guide.content_yaml);
    }
  };

  const handleUpdate = async (manualSave = false) => {
    // We allow update if manual save OR (instruction/files present)
    if (!manualSave && !instruction && files.length === 0) return;
    
    setLoading(true);
    try {
      // If files are present, upload them first
      let filePaths: string[] = [];
      if (files.length > 0) {
        for (const file of files) {
          const urlRes = await fetch(
            `/api/upload?filename=${encodeURIComponent(file.name)}&companySlug=${encodeURIComponent(companyName)}`
          );
          const urlData = await urlRes.json();
          if (urlData.status !== 'success') throw new Error(urlData.error);
          
          const uploadRes = await fetch(urlData.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
          });
          if (!uploadRes.ok) throw new Error('Upload failed');
          filePaths.push(urlData.path);
        }
      }

      const res = await fetch('/api/portfolio/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyId, 
          instruction, 
          currentYaml: yamlContent,
          filePaths, // Pass uploaded file paths to backend
          manualSave // Flag for direct saving without AI
        })
      });
      
      const data = await res.json();
      if (data.guide) {
        setGuide(data.guide);
        setYamlContent(data.guide.content_yaml);
        if (!manualSave) {
            setInstruction('');
            setFiles([]); // Clear files only after AI generation
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update guide');
    } finally {
      setLoading(false);
    }
  };

  // File Handling
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const handleTestRun = async () => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setTestResults([]);

    try {
      const uploadedPaths: string[] = [];
      
      // 1. Upload files
      for (const file of files) {
        const urlRes = await fetch(
          `/api/upload?filename=${encodeURIComponent(file.name)}&companySlug=${encodeURIComponent(companyName)}`
        );
        const urlData = await urlRes.json();
        if (urlData.status !== 'success') throw new Error(urlData.error);
        
        const uploadRes = await fetch(urlData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        uploadedPaths.push(urlData.path);
      }

      // 2. Trigger Dry Run
      const res = await fetch('/api/ingest', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlug: companyName, // Ingest API does fuzzy matching
          forceCompanyId: companyId, // Force specific ID
          filePaths: uploadedPaths,
          dryRun: true
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.results) {
        setTestResults(data.results);
      } else {
        throw new Error(data.error || 'Test run failed');
      }
    } catch (err: any) {
      console.error('Dry run error:', err);
      alert(`Test failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        {/* YAML Editor - Improved UI */}
        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden flex flex-col h-[500px]">
           <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <span className="text-xs font-mono text-white/50">guide.yaml</span>
              <button 
                onClick={() => handleUpdate(true)}
                disabled={loading}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
           </div>
           <textarea
             value={yamlContent}
             onChange={(e) => setYamlContent(e.target.value)}
             className="flex-1 p-4 font-mono text-xs text-blue-100 bg-transparent outline-none resize-none leading-relaxed"
             spellCheck={false}
             placeholder={`# No guide configured yet.\n# Use the assistant to generate one or paste YAML here.`}
           />
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
           <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4 max-h-[300px] overflow-y-auto">
             <h4 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Extraction Results</h4>
             {testResults.map((res, idx) => (
               <div key={idx} className="text-xs space-y-2">
                 <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="font-medium text-white">{res.file}</span>
                    <span className={`px-2 py-0.5 rounded ${res.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {res.status}
                    </span>
                 </div>
                 {res.metrics_sample && (
                   <div className="space-y-1 pl-2">
                     <div className="text-white/50">Metrics Found: {res.metrics_computed}</div>
                     {res.metrics_sample.map((m: any, i: number) => (
                       <div key={i} className="flex justify-between text-white/70">
                         <span>{m.metric_id}</span>
                         <span>{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</span>
                       </div>
                     ))}
                     {res.metrics_computed > 3 && <div className="text-white/30 italic">...and {res.metrics_computed - 3} more</div>}
                   </div>
                 )}
                 {res.error && <div className="text-red-400">{res.error}</div>}
               </div>
             ))}
           </div>
        )}
      </div>
      
      <div 
        className={`
          bg-white/5 rounded-xl p-6 border transition-all duration-200 h-fit relative
          ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings size={20} className="text-emerald-400" />
          Configuration Assistant
        </h3>
        <p className="text-sm text-white/60 mb-6">
          Upload board decks or financial reports to automatically generate the extraction guide.
        </p>
        
        <textarea
          className="w-full bg-black/20 border border-white/10 rounded-lg p-4 text-white text-sm focus:outline-none focus:border-emerald-500/50 min-h-[80px] mb-4"
          placeholder="Optional: Add specific instructions (e.g. 'Use EBITDA from the summary page')"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        
        {/* Integrated File Upload State */}
        {files.length > 0 ? (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-white/80">
               <span className="flex items-center gap-2"><Upload size={14} className="text-blue-400"/> {files.length} Reference Files</span>
               <button onClick={() => setFiles([])} className="text-xs text-white/40 hover:text-white">Clear All</button>
            </div>
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-black/20 p-2 rounded border border-white/5">
                  <span className="truncate text-white/70 flex-1">{file.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setFiles(f => f.filter((_, i) => i !== idx)); }} className="text-white/40 hover:text-white ml-2 p-1">×</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4 border-2 border-dashed border-white/10 rounded-lg p-6 text-center hover:border-white/20 hover:bg-white/5 transition-colors cursor-pointer relative">
             <p className="text-xs text-white/30 flex items-center justify-center gap-2 pointer-events-none">
               <Upload size={12} />
               Drag & drop reference files here
             </p>
             <input
                type="file"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
                title="Drop files to test configuration"
              />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleUpdate(false)}
            disabled={loading || (!instruction && files.length === 0)}
            className="py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2 text-sm"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {files.length > 0 ? 'Analyze & Generate Guide' : 'Update Guide'}
              </>
            )}
          </button>

          <button
            onClick={handleTestRun}
            disabled={isUploading || files.length === 0}
            className="py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 font-medium rounded-lg disabled:opacity-50 transition-colors flex justify-center items-center gap-2 text-sm"
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : 'Validate Extraction (Dry Run)'}
          </button>
        </div>
      </div>
    </div>
  );
}
