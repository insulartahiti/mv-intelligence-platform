'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Building2 } from 'lucide-react';
import { makeBrowserClient } from '@/lib/supabaseClient';
import { Button, SearchInput } from './ui/GlassComponents';

interface Company {
  id: string;
  name: string;
  affinity_org_id?: number;
}

interface CompanySelectorProps {
  selectedCompany: string;
  onCompanySelect: (companyId: string) => void;
  placeholder?: string;
}

export default function CompanySelector({ 
  selectedCompany, 
  onCompanySelect, 
  placeholder = "Select a company..." 
}: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const supabase = makeBrowserClient();

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, affinity_org_id')
        .order('name');
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCompanyData = companies.find(c => c.id === selectedCompany);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-onGlassDarkMuted mb-2">
        Company
      </label>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 glass rounded-md text-onGlassDark focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50"
        >
          <div className="flex items-center">
            <Building2 className="h-4 w-4 text-onGlassDarkMuted mr-2" />
            <span className={selectedCompany ? 'text-onGlassDark' : 'text-onGlassDarkMuted'}>
              {selectedCompanyData?.name || placeholder}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-onGlassDarkMuted" />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 glass border border-white/10 rounded-md shadow-elev3 max-h-60 overflow-auto">
            {/* Search Input */}
            <div className="p-2 border-b border-white/10">
              <SearchInput
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>

            {/* Company List */}
            <div className="py-1">
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-onGlassDarkMuted">Loading companies...</div>
              ) : filteredCompanies.length === 0 ? (
                <div className="px-3 py-2 text-sm text-onGlassDarkMuted">No companies found</div>
              ) : (
                filteredCompanies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => {
                      onCompanySelect(company.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 focus:bg-white/5 focus:outline-none text-onGlassDark"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{company.name}</span>
                      {company.affinity_org_id && (
                        <span className="text-xs text-onGlassDarkMuted bg-white/10 px-2 py-1 rounded">
                          ID: {company.affinity_org_id}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Company Info */}
      {selectedCompanyData && (
        <div className="mt-2 p-2 glass border border-accent/20 rounded-md">
          <div className="text-xs text-accent">
            <span className="font-medium">Selected:</span> {selectedCompanyData.name}
            {selectedCompanyData.affinity_org_id && (
              <span className="ml-2">(Affinity ID: {selectedCompanyData.affinity_org_id})</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
