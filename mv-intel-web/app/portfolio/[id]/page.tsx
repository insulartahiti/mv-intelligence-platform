
'use client';

import React, { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';

interface CompanyDetail {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  location_city?: string;
  location_country?: string;
  investment_amount?: number;
  fund?: string;
  status?: string;
}

interface NewsItem {
  title: string;
  date: string;
  source: string;
  summary: string;
}

export default function PortfolioCompanyPage({ params }: { params: { id: string } }) {
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  
  useEffect(() => {
    fetchCompanyDetails();
  }, [params.id]);

  useEffect(() => {
    if (company?.name) {
      fetchNews(company.name);
    }
  }, [company]);

  const fetchNews = async (name: string) => {
    setNewsLoading(true);
    try {
      const res = await fetch(`/api/portfolio/news?companyName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.news && Array.isArray(data.news)) {
        setNews(data.news);
      }
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setNewsLoading(false);
    }
  };

  const fetchCompanyDetails = async () => {
    try {
      // Re-use the existing fetch logic or create a dedicated endpoint
      const res = await fetch(`/api/portfolio/companies?q=&companyId=${params.id}`); 
      // Note: The list endpoint returns array, we might need a dedicated single fetch or filter client side for now if API not ready
      // For MVP, we'll fetch list and find. Ideally /api/portfolio/companies/[id]
      
      // Temporary: fetching list and filtering (inefficient but works with existing API)
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
        <Tabs.Root defaultValue="overview">
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
                    {company.description || "No description available."}
                  </p>
                </section>

                {/* Key Updates (Placeholder) */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-emerald-400" />
                    Key Updates
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-lg border-l-2 border-emerald-500">
                      <div className="text-sm text-white/40 mb-1">Oct 2024 • Board Meeting</div>
                      <p className="text-white/80">Strong Q3 performance with 15% QoQ growth. Launched new Enterprise tier.</p>
                    </div>
                    {/* Add more derived updates here */}
                  </div>
                </section>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* News Feed */}
                <section className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Newspaper size={20} className="text-blue-400" />
                    Latest News
                  </h3>
                  <div className="space-y-4">
                    {newsLoading ? (
                       <div className="text-sm text-white/40 italic flex items-center gap-2">
                         <Loader2 size={14} className="animate-spin" /> Loading updates...
                       </div>
                    ) : news.length > 0 ? (
                      news.map((item, idx) => (
                        <div key={idx} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                             <span className="text-sm font-medium text-emerald-400 line-clamp-2">{item.title}</span>
                             <span className="text-xs text-white/40 whitespace-nowrap ml-2">{item.date}</span>
                          </div>
                          <div className="text-xs text-white/50 mb-2">{item.source}</div>
                          <p className="text-xs text-white/70 line-clamp-3">{item.summary}</p>
                        </div>
                      ))
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
             <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
               <TrendingUp size={48} className="mx-auto text-white/20 mb-4" />
               <h3 className="text-xl font-medium text-white">Financial Dashboard</h3>
               <p className="text-white/50 mt-2">Charts and metrics table will be rendered here.</p>
               <Link href="/portfolio/financials" className="inline-block mt-6 text-emerald-400 hover:underline">
                 Go to Global Financials View →
               </Link>
             </div>
          </Tabs.Content>
          
           <Tabs.Content value="legal">
             <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
               <Shield size={48} className="mx-auto text-white/20 mb-4" />
               <h3 className="text-xl font-medium text-white">Legal Documents</h3>
               <p className="text-white/50 mt-2">Term sheets, SPAs, and risk analysis.</p>
               <Link href="/portfolio/legal" className="inline-block mt-6 text-blue-400 hover:underline">
                 Go to Legal Analysis →
               </Link>
             </div>
          </Tabs.Content>

          <Tabs.Content value="guide">
            <GuideEditor companyId={params.id} />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}

// Sub-component for Guide Editing
function GuideEditor({ companyId }: { companyId: string }) {
  const [guide, setGuide] = useState<any>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleUpdate = async () => {
    if (!instruction) return;
    setLoading(true);
    try {
      const res = await fetch('/api/portfolio/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, instruction, currentYaml: yamlContent })
      });
      const data = await res.json();
      if (data.guide) {
        setGuide(data.guide);
        setYamlContent(data.guide.content_yaml);
        setInstruction('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="bg-slate-900 rounded-xl p-4 border border-white/10 font-mono text-xs overflow-auto h-[600px] whitespace-pre">
          {yamlContent || "# No guide configured yet.\n# Use the chat on the right to generate one."}
        </div>
      </div>
      
      <div className="bg-white/5 rounded-xl p-6 border border-white/10 h-fit">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings size={20} className="text-emerald-400" />
          Configuration Assistant
        </h3>
        <p className="text-sm text-white/60 mb-6">
          Describe changes to the financial mapping guide in natural language. The AI will update the YAML configuration for you.
        </p>
        
        <textarea
          className="w-full bg-black/20 border border-white/10 rounded-lg p-4 text-white text-sm focus:outline-none focus:border-emerald-500/50 min-h-[120px]"
          placeholder="e.g. 'Add a new metric for Net Revenue Retention mapped to 'NRR' column' or 'Change the fiscal year end to March'"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        
        <button
          onClick={handleUpdate}
          disabled={loading || !instruction}
          className="mt-4 w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2"
        >
          {loading ? (
            <>Processing...</>
          ) : (
            <>
              Update Configuration
              <ArrowLeft size={16} className="rotate-180" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

