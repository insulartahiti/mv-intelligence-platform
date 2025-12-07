'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, 
  Building2, 
  MapPin, 
  DollarSign, 
  Briefcase,
  ExternalLink,
  Loader2,
  TrendingUp,
  Scale
} from 'lucide-react';

interface PortfolioCompany {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  fund?: string;
  location_city?: string;
  location_country?: string;
  investment_amount?: number;
  brief_description?: string;
  logo_url?: string;
  status?: string;
}

interface GroupedCompanies {
  [fund: string]: PortfolioCompany[];
}

export default function PortfolioDashboard() {
  const [companies, setCompanies] = useState<PortfolioCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupedCompanies, setGroupedCompanies] = useState<GroupedCompanies>({});

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    // Filter and group companies whenever companies or searchQuery changes
    const filtered = companies.filter(company => 
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.fund?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const grouped = filtered.reduce((acc, company) => {
      const fundName = company.fund || 'Uncategorized';
      if (!acc[fundName]) {
        acc[fundName] = [];
      }
      acc[fundName].push(company);
      return acc;
    }, {} as GroupedCompanies);

    // Sort funds (optional, maybe specific order if needed)
    const sortedGrouped: GroupedCompanies = {};
    Object.keys(grouped).sort().forEach(key => {
      sortedGrouped[key] = grouped[key];
    });

    setGroupedCompanies(sortedGrouped);
  }, [companies, searchQuery]);

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/portfolio/companies');
      const data = await res.json();
      if (data.companies) {
        setCompanies(data.companies);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  return (
    <div className="min-h-[calc(100vh-80px)] p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header & Tools */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Portfolio Companies</h1>
            <p className="text-white/60">Overview of all investments categorized by fund.</p>
          </div>

          <div className="flex gap-3">
             <Link 
              href="/portfolio/financials"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors text-sm font-medium"
            >
              <TrendingUp size={16} />
              Ingest Financials
            </Link>
            <Link 
              href="/portfolio/legal"
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-colors text-sm font-medium"
            >
              <Scale size={16} />
              Legal Analysis
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-white/40" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl leading-5 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 sm:text-sm transition-all"
            placeholder="Search companies, industries, or funds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
          </div>
        ) : Object.keys(groupedCompanies).length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <Building2 className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-1">No companies found</h3>
            <p className="text-white/40">Try adjusting your search query.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedCompanies).map(([fund, fundCompanies]) => (
              <div key={fund}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-white/10"></div>
                  <h2 className="text-xl font-semibold text-emerald-400 uppercase tracking-wider text-sm px-2 border border-emerald-500/20 rounded-full bg-emerald-950/30 py-1">
                    {fund}
                  </h2>
                  <div className="h-px flex-1 bg-white/10"></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fundCompanies.map((company) => (
                    <div 
                      key={company.id}
                      className="group bg-white/5 hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/30 rounded-xl p-5 transition-all duration-300 flex flex-col h-full"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                             {/* Fallback logo logic */}
                             {company.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-white font-semibold truncate max-w-[180px]" title={company.name}>
                              {company.name}
                            </h3>
                            {company.domain && (
                              <a 
                                href={`https://${company.domain}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {company.domain}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                        {company.status && (
                           <span className="px-2 py-1 rounded text-xs font-medium bg-white/10 text-white/60 capitalize">
                             {company.status}
                           </span>
                        )}
                      </div>
                      
                      {company.brief_description && (
                        <p className="text-sm text-white/50 mb-4 line-clamp-2 flex-grow">
                          {company.brief_description}
                        </p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-y-2 text-xs text-white/60 mt-auto pt-4 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          <Briefcase size={12} className="text-emerald-500/70" />
                          <span className="truncate" title={company.industry || 'N/A'}>
                            {company.industry || 'Unknown Industry'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-emerald-500/70" />
                          <span className="truncate">
                            {company.location_city ? `${company.location_city}, ` : ''}{company.location_country || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                           <DollarSign size={12} className="text-emerald-500/70" />
                           <span>
                             Inv: <span className="text-white">{formatCurrency(company.investment_amount)}</span>
                           </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
