'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, MetricTile } from '../components/ui/GlassComponents';

interface Deal {
  id: string;
  name: string;
  company: string;
  domain?: string;
  industry?: string;
  company_type?: string;
  funding_stage?: string;
  opportunity_id?: string;
  last_drafted_at?: string;
  created_at: string;
  updated_at: string;
  stage: string;
}

export default function Deals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeals();
  }, []);

  async function loadDeals() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/deals');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load deals');
      }
      
      setDeals(data.data || []);
    } catch (err) {
      console.error('Error loading deals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deals');
    } finally {
      setLoading(false);
    }
  }

  const getStageColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'active':
        return 'text-green-400';
      case 'draft':
        return 'text-yellow-400';
      case 'closed':
        return 'text-blue-400';
      default:
        return 'text-onGlass-secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen app-backdrop">
        <div className="max-w-7xl mx-auto p-6">
          <div className="glass-panel text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-onGlass-secondary">Loading deals...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen app-backdrop">
        <div className="max-w-7xl mx-auto p-6">
          <div className="glass-panel text-center py-12">
            <p className="text-red-400 mb-4">Error: {error}</p>
            <Button onClick={loadDeals} variant="secondary">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-backdrop">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-semibold text-onGlass">Deals</h1>
            <p className="text-onGlass-secondary mt-2">
              Manage investment opportunities and generate AI-powered deal memos with GPT-5
            </p>
          </div>
          <Button variant="primary" onClick={() => {/* TODO: Add create deal modal */}}>
            New Deal
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricTile 
            title="Total Deals" 
            value={deals.length.toString()} 
            subtitle="All opportunities"
          />
          <MetricTile 
            title="Active Deals" 
            value={deals.filter(d => d.stage === 'Active').length.toString()} 
            subtitle="In progress"
          />
          <MetricTile 
            title="Draft Memos" 
            value={deals.filter(d => d.stage === 'Draft').length.toString()} 
            subtitle="Needs attention"
          />
          <MetricTile 
            title="This Month" 
            value={deals.filter(d => {
              const created = new Date(d.created_at);
              const now = new Date();
              return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
            }).length.toString()} 
            subtitle="New deals"
          />
        </div>

        {/* Deals Grid */}
        {deals.length === 0 ? (
          <div className="glass-panel text-center py-12">
            <h3 className="text-xl font-semibold text-onGlass mb-2">No deals yet</h3>
            <p className="text-onGlass-secondary mb-6">
              Create your first deal to get started with memo generation
            </p>
            <Button variant="primary" onClick={() => {/* TODO: Add create deal modal */}}>
              Create First Deal
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deals.map((deal) => (
              <Link key={deal.id} href={`/deals/${deal.id}`} className="block">
                <Card className="hover:glass-card transition-all duration-200 h-full">
                  <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-onGlass mb-1">
                          {deal.name}
                        </h3>
                        <p className="text-onGlass-secondary text-sm">
                          {deal.company}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStageColor(deal.stage)} bg-glass-light`}>
                        {deal.stage}
                      </span>
                    </div>

                    {/* Company Info */}
                    <div className="space-y-2">
                      {deal.industry && (
                        <div className="flex items-center text-sm text-onGlass-secondary">
                          <span className="w-16">Industry:</span>
                          <span className="text-onGlass">{deal.industry}</span>
                        </div>
                      )}
                      {deal.funding_stage && (
                        <div className="flex items-center text-sm text-onGlass-secondary">
                          <span className="w-16">Stage:</span>
                          <span className="text-onGlass">{deal.funding_stage}</span>
                        </div>
                      )}
                      {deal.domain && (
                        <div className="flex items-center text-sm text-onGlass-secondary">
                          <span className="w-16">Website:</span>
                          <a 
                            href={`https://${deal.domain}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {deal.domain}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="pt-4 border-t border-glass-border">
                      <div className="flex justify-between items-center text-xs text-onGlass-secondary">
                        <span>
                          {deal.last_drafted_at 
                            ? `Updated ${formatDate(deal.last_drafted_at)}`
                            : `Created ${formatDate(deal.created_at)}`
                          }
                        </span>
                        {deal.opportunity_id && (
                          <span className="text-accent">Affinity #{deal.opportunity_id}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
