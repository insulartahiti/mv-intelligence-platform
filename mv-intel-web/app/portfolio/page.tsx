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
  ChevronDown
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

// Helper to normalize fund names into canonical categories
const normalizeFund = (rawFund: string | undefined): string => {
  if (!rawFund) return 'Uncategorized';
  const f = rawFund.toLowerCase().trim();
  
  // Explicit mappings based on common variations
  if (f.includes('mvf1') || f.includes('mvf i') || (f.includes('fund 1') && !f.includes('10'))) return 'MVF1';
  if (f.includes('mvf2') || f.includes('mvf ii') || f.includes('fund 2')) return 'MVF2';
  if (f.includes('aav') || f.includes('early stage')) return 'Motive AAV';
  if (f.includes('create') || f.includes('incubation')) return 'Motive Create';
  if (f.includes('growth')) return 'Growth';
  
  // Default formatting: Capitalize words
  return rawFund.replace(/\b\w/g, l => l.toUpperCase());
};

const FundSection = ({ 
  fund, 
  companies, 
  formatCurrency 
}: { 
  fund: string, 
  companies: PortfolioCompany[], 
  formatCurrency: (amount?: number) => string 
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20 mb-6">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-800/50 transition-colors group"
      >
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">
            {fund}
          </h2>
          <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
            {companies.length} {companies.length === 1 ? 'Company' : 'Companies'}
          </span>
        </div>
        <div className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
           <ChevronDown className="text-slate-500 group-hover:text-slate-300" />
        </div>
      </button>
      
      {isOpen && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border-t border-slate-800/50">
          {companies.map((company) => (
            <Link 
              href={`/portfolio/${company.id}`}
              key={company.id}
              className="group/card bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 hover:border-emerald-500/30 rounded-xl p-6 transition-all duration-300 flex flex-col h-full cursor-pointer hover:-translate-y-1 shadow-sm hover:shadow-xl hover:shadow-emerald-900/10"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-lg overflow-hidden group-hover/card:border-emerald-500/30 group-hover/card:text-emerald-400 transition-colors shadow-inner">
                     {/* Fallback logo logic */}
                     {company.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold truncate max-w-[180px] group-hover/card:text-emerald-400 transition-colors" title={company.name}>
                      {company.name}
                    </h3>
                    {company.domain && (
                      <a 
                        href={`https://${company.domain}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-emerald-400 flex items-center gap-1 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {company.domain}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
                {company.status && (
                   <span className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-800 text-slate-400 capitalize border border-slate-700">
                     {company.status}
                   </span>
                )}
              </div>
              
              {company.brief_description && (
                <p className="text-sm text-slate-400 mb-5 line-clamp-2 flex-grow leading-relaxed">
                  {company.brief_description}
                </p>
              )}
              
              <div className="grid grid-cols-2 gap-y-3 text-xs text-slate-500 mt-auto pt-4 border-t border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Briefcase size={12} className="text-slate-600" />
                  <span className="truncate" title={company.industry || 'N/A'}>
                    {company.industry || 'Unknown Industry'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={12} className="text-slate-600" />
                  <span className="truncate">
                    {company.location_city ? `${company.location_city}, ` : ''}{company.location_country || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                   <DollarSign size={12} className="text-slate-600" />
                   <span>
                     Total Inv: <span className="text-slate-300 font-medium">{formatCurrency(company.investment_amount)}</span>
                   </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

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
      (company.fund && company.fund.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const grouped = filtered.reduce((acc, company) => {
      const fundName = normalizeFund(company.fund);
      if (!acc[fundName]) {
        acc[fundName] = [];
      }
      acc[fundName].push(company);
      return acc;
    }, {} as GroupedCompanies);

    // Sort funds: MVF1, MVF2, Motive AAV, then others alphabetical
    const priority = ['MVF1', 'MVF2', 'Motive AAV', 'Motive Create'];
    
    const sortedGrouped: GroupedCompanies = {};
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      
      return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
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
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header & Tools */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Portfolio Companies</h1>
            <p className="text-slate-400">Overview of all investments categorized by fund.</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl leading-5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 sm:text-sm transition-all"
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
          <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
            <Building2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-1">No companies found</h3>
            <p className="text-slate-500">Try adjusting your search query.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedCompanies).map(([fund, fundCompanies]) => (
              <FundSection 
                key={fund} 
                fund={fund} 
                companies={fundCompanies} 
                formatCurrency={formatCurrency} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
