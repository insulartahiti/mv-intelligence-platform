'use client';
import { useState, useEffect, useMemo } from 'react';
import { Card, Button, MetricTile, SearchInput } from './ui/GlassComponents';
import DynamicKPIDashboard from './DynamicKPIDashboard';

interface Company {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  affinity_org_id: string | null;
  industry: string | null;
  funding_stage: string | null;
  employees: number | null;
  created_at: string;
}

interface CompanyMetrics {
  totalCompanies: number;
  activeCompanies: number;
  avgGrowthRate: number;
  exitPipeline: number;
  totalARR: number;
  avgARR: number;
}

interface AdaptivePortfolioDashboardProps {
  onCompanySelect?: (companyId: string) => void;
}

export default function AdaptivePortfolioDashboard({ 
  onCompanySelect 
}: AdaptivePortfolioDashboardProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load companies
      const companiesResponse = await fetch('/api/companies');
      const companiesResult = await companiesResponse.json();
      
      if (companiesResponse.ok) {
        setCompanies(companiesResult.companies || []);
      } else {
        setError(companiesResult.error || 'Failed to load companies');
        return;
      }

      // Calculate portfolio metrics
      const portfolioMetrics = await calculatePortfolioMetrics(companiesResult.companies || []);
      setMetrics(portfolioMetrics);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculatePortfolioMetrics = async (companies: Company[]): Promise<CompanyMetrics> => {
    const totalCompanies = companies.length;
    const activeCompanies = companies.filter(c => c.affinity_org_id).length;
    
    // Calculate growth rates and ARR from metrics
    let totalARR = 0;
    let arrCount = 0;
    let growthRates: number[] = [];

    for (const company of companies) {
      try {
        const metricsResponse = await fetch(`/api/companies/${company.id}/kpis`);
        const metricsResult = await metricsResponse.json();
        
        if (metricsResponse.ok && metricsResult.metrics) {
          // Find ARR metrics
          const arrMetrics = metricsResult.metrics.filter((m: any) => 
            m.name.toLowerCase().includes('arr') || m.name.toLowerCase().includes('revenue')
          );
          
          if (arrMetrics.length > 0) {
            const latestARR = parseFloat(arrMetrics[0].value) || 0;
            totalARR += latestARR;
            arrCount++;
          }

          // Calculate growth rates
          const growthMetrics = metricsResult.metrics.filter((m: any) => 
            m.name.toLowerCase().includes('growth') || m.name.toLowerCase().includes('change')
          );
          
          if (growthMetrics.length > 0) {
            const growthRate = parseFloat(growthMetrics[0].value) || 0;
            growthRates.push(growthRate);
          }
        }
      } catch (error) {
        console.warn(`Failed to load metrics for company ${company.id}:`, error);
      }
    }

    const avgARR = arrCount > 0 ? totalARR / arrCount : 0;
    const avgGrowthRate = growthRates.length > 0 
      ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length 
      : 0;

    // Estimate exit pipeline (companies with high ARR or growth)
    const exitPipeline = companies.filter(company => {
      // This would be more sophisticated in a real implementation
      return company.funding_stage === 'Series C' || company.funding_stage === 'Series D';
    }).length;

    return {
      totalCompanies,
      activeCompanies,
      avgGrowthRate,
      exitPipeline,
      totalARR,
      avgARR
    };
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter(company => {
      const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           company.domain?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStage = selectedStage === 'all' || company.funding_stage === selectedStage;
      const matchesIndustry = selectedIndustry === 'all' || company.industry === selectedIndustry;
      
      return matchesSearch && matchesStage && matchesIndustry;
    });
  }, [companies, searchTerm, selectedStage, selectedIndustry]);

  const uniqueStages = useMemo(() => {
    const stages = companies
      .map(c => c.funding_stage)
      .filter((stage): stage is string => stage !== null && stage !== '');
    return ['all', ...Array.from(new Set(stages))];
  }, [companies]);

  const uniqueIndustries = useMemo(() => {
    const industries = companies
      .map(c => c.industry)
      .filter((industry): industry is string => industry !== null && industry !== '');
    return ['all', ...Array.from(new Set(industries))];
  }, [companies]);

  const getCompanyStatus = (company: Company): 'active' | 'monitoring' | 'inactive' => {
    if (company.affinity_org_id) return 'active';
    if (company.created_at && new Date(company.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
      return 'monitoring';
    }
    return 'inactive';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'monitoring': return 'text-yellow-400';
      case 'inactive': return 'text-red-400';
      default: return 'text-onGlass-secondary';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-center text-onGlass-secondary">
            Loading portfolio data...
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-center text-red-400">
            Error: {error}
          </div>
          <Button 
            variant="primary" 
            onClick={loadData}
            className="mt-4"
          >
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile 
            title="Total Portfolio" 
            value={metrics.totalCompanies.toString()} 
            subtitle={`${metrics.activeCompanies} active`}
          />
          <MetricTile 
            title="Avg Growth Rate" 
            value={`${metrics.avgGrowthRate.toFixed(1)}%`} 
            subtitle="across portfolio"
          />
          <MetricTile 
            title="Total ARR" 
            value={`$${(metrics.totalARR / 1000000).toFixed(1)}M`} 
            subtitle={`$${(metrics.avgARR / 1000).toFixed(0)}K avg`}
          />
          <MetricTile 
            title="Exit Pipeline" 
            value={metrics.exitPipeline.toString()} 
            subtitle="companies ready"
          />
        </div>
      )}

      {/* Search and Filters */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <SearchInput
              placeholder="Search companies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex gap-4">
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface-850 border border-border text-onGlass"
            >
              {uniqueStages.map(stage => (
                <option key={stage} value={stage}>
                  {stage === 'all' ? 'All Stages' : stage}
                </option>
              ))}
            </select>
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface-850 border border-border text-onGlass"
            >
              {uniqueIndustries.map(industry => (
                <option key={industry} value={industry}>
                  {industry === 'all' ? 'All Industries' : industry}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-sm text-onGlass-secondary mt-2">
          {filteredCompanies.length} of {companies.length} companies
        </div>
      </Card>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCompanies.map((company) => {
          const status = getCompanyStatus(company);
          return (
            <Card 
              key={company.id} 
              className="p-6 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => onCompanySelect?.(company.id)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-onGlass">{company.name}</h3>
                  <p className="text-sm text-onGlass-secondary">{company.domain}</p>
                </div>
                <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                  {status}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                {company.industry && (
                  <div className="flex justify-between">
                    <span className="text-onGlass-muted">Industry:</span>
                    <span className="text-onGlass">{company.industry}</span>
                  </div>
                )}
                {company.funding_stage && (
                  <div className="flex justify-between">
                    <span className="text-onGlass-muted">Stage:</span>
                    <span className="text-onGlass">{company.funding_stage}</span>
                  </div>
                )}
                {company.employees && (
                  <div className="flex justify-between">
                    <span className="text-onGlass-muted">Employees:</span>
                    <span className="text-onGlass">{company.employees.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {company.description && (
                <p className="text-sm text-onGlass-secondary mt-4 line-clamp-3">
                  {company.description}
                </p>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCompanySelect?.(company.id);
                  }}
                >
                  View Details →
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* No Companies State */}
      {filteredCompanies.length === 0 && (
        <Card className="p-12 text-center">
          <div className="text-4xl mb-4">🏢</div>
          <h3 className="text-lg font-semibold text-onGlass mb-2">No Companies Found</h3>
          <p className="text-onGlass-secondary mb-4">
            {searchTerm || selectedStage !== 'all' || selectedIndustry !== 'all'
              ? 'Try adjusting your search terms or filters.'
              : 'Add companies to start building your portfolio dashboard.'
            }
          </p>
          <Button variant="primary">
            Add Company
          </Button>
        </Card>
      )}
    </div>
  );
}






