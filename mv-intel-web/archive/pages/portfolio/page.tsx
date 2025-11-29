'use client';
import { useState } from 'react';
import { DashboardLayout, DataTable, FilterBar, EmptyState } from '../components/ui/DashboardLayout';
import { Button, SearchInput, StatusBadge } from '../components/ui/GlassComponents';
import AdaptivePortfolioDashboard from '../components/AdaptivePortfolioDashboard';

// Mock data for demonstration
const mockCompanies = [
  {
    id: 1,
    name: 'FintechFlow',
    stage: 'Series B',
    sector: 'Payments',
    arr: '$2.4M',
    growth: '+45%',
    status: 'active',
    lastContact: '2 days ago',
    actions: ''
  },
  {
    id: 2,
    name: 'DataVault',
    stage: 'Series A',
    sector: 'Data Analytics',
    arr: '$850K',
    growth: '+23%',
    status: 'active',
    lastContact: '1 week ago',
    actions: ''
  },
  {
    id: 3,
    name: 'CloudSecure',
    stage: 'Seed',
    sector: 'Cybersecurity',
    arr: '$320K',
    growth: '+67%',
    status: 'monitoring',
    lastContact: '3 weeks ago',
    actions: ''
  },
  {
    id: 4,
    name: 'AI Insights',
    stage: 'Series C',
    sector: 'AI/ML',
    arr: '$5.1M',
    growth: '+28%',
    status: 'active',
    lastContact: '5 days ago',
    actions: ''
  }
];

const mockMetrics = [
  { label: 'Total Portfolio', value: '47', delta: '+3 this month', trend: 'up' as const },
  { label: 'Active Companies', value: '32', delta: '+1 this week', trend: 'up' as const },
  { label: 'Avg ARR Growth', value: '34%', delta: '+2% vs last month', trend: 'up' as const },
  { label: 'Exit Pipeline', value: '5', delta: '2 in due diligence', trend: 'neutral' as const }
];

export default function PortfolioPage() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const handleCompanySelect = (companyId: string) => {
    setSelectedCompany(companyId);
    // Navigate to company detail page
    window.location.href = `/companies/${companyId}`;
  };

  // Removed unused variables and components since we're using AdaptivePortfolioDashboard

  return (
    <div className="min-h-screen app-backdrop">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-onGlass mb-2">Portfolio Dashboard</h1>
          <p className="text-xl text-onGlass-secondary">
            Monitor performance, track metrics, and manage your investment portfolio
          </p>
        </header>

        <AdaptivePortfolioDashboard onCompanySelect={handleCompanySelect} />
      </div>
    </div>
  );
}
