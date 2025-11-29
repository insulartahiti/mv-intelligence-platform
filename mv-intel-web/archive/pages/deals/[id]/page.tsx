'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Button } from '../../components/ui/GlassComponents';
import { MemoEditor } from '../../components/MemoEditor';

interface Deal {
  id: string;
  name: string;
  company: string;
  domain?: string;
  industry?: string;
  company_type?: string;
  funding_stage?: string;
  description?: string;
  opportunity_id?: string;
  last_drafted_at?: string;
  created_at: string;
  updated_at: string;
  stage: string;
  memo?: string;
}

export default function DealDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadDeal();
    }
  }, [id]);

  async function loadDeal() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/deals/${id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load deal');
      }
      
      setDeal(data.data);
    } catch (err) {
      console.error('Error loading deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deal');
    } finally {
      setLoading(false);
    }
  }

  async function draftMemo() {
    try {
      setMemoLoading(true);
      setError(null);
      
      const response = await fetch('/api/deals/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: process.env.NEXT_PUBLIC_AFFINITY_ORG_ID || '7624528',
          dealId: id,
          companyId: deal?.id
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate memo');
      }
      
      // Reload deal to get updated memo
      await loadDeal();
    } catch (err) {
      console.error('Error generating memo:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate memo');
    } finally {
      setMemoLoading(false);
    }
  }

  async function saveMemo(content: string) {
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch(`/api/deals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: content })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save memo');
      }
      
      // Update local state
      setDeal(prev => prev ? { ...prev, memo: content, updated_at: data.updated_at } : null);
    } catch (err) {
      console.error('Error saving memo:', err);
      setError(err instanceof Error ? err.message : 'Failed to save memo');
      throw err; // Re-throw so MemoEditor can handle it
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen app-backdrop">
        <div className="max-w-7xl mx-auto p-6">
          <div className="glass-panel text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-onGlass-secondary">Loading deal...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="min-h-screen app-backdrop">
        <div className="max-w-7xl mx-auto p-6">
          <div className="glass-panel text-center py-12">
            <p className="text-red-400 mb-4">Error: {error || 'Deal not found'}</p>
            <div className="space-x-4">
              <Button onClick={loadDeal} variant="secondary">
                Try Again
              </Button>
              <Button onClick={() => router.push('/deals')} variant="primary">
                Back to Deals
              </Button>
            </div>
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
            <div className="flex items-center space-x-4 mb-2">
              <Button 
                onClick={() => router.push('/deals')} 
                variant="secondary" 
                size="sm"
              >
                ← Back
              </Button>
              <h1 className="text-3xl font-semibold text-onGlass">{deal.name}</h1>
            </div>
            <p className="text-onGlass-secondary">
              {deal.company} • {deal.stage}
            </p>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={draftMemo} 
              disabled={memoLoading}
              variant="primary"
            >
              {memoLoading ? 'Generating...' : 'Draft Memo'}
            </Button>
            {deal?.memo && (
              <Button 
                onClick={() => {
                  const blob = new Blob([deal.memo || ''], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${deal.name.replace(/\s+/g, '_')}_memo.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                variant="secondary"
              >
                Export MD
              </Button>
            )}
          </div>
        </div>

        {/* Deal Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-semibold text-onGlass">Deal Information</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-onGlass-secondary">Company</label>
                    <p className="text-onGlass font-medium">{deal.company}</p>
                  </div>
                  
                  {deal.industry && (
                    <div>
                      <label className="text-sm text-onGlass-secondary">Industry</label>
                      <p className="text-onGlass">{deal.industry}</p>
                    </div>
                  )}
                  
                  {deal.funding_stage && (
                    <div>
                      <label className="text-sm text-onGlass-secondary">Funding Stage</label>
                      <p className="text-onGlass">{deal.funding_stage}</p>
                    </div>
                  )}
                  
                  {deal.domain && (
                    <div>
                      <label className="text-sm text-onGlass-secondary">Website</label>
                      <a 
                        href={`https://${deal.domain}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-accent hover:underline block"
                      >
                        {deal.domain}
                      </a>
                    </div>
                  )}
                  
                  {deal.opportunity_id && (
                    <div>
                      <label className="text-sm text-onGlass-secondary">Affinity ID</label>
                      <p className="text-onGlass font-mono text-sm">{deal.opportunity_id}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="text-sm text-onGlass-secondary">Created</label>
                    <p className="text-onGlass text-sm">{formatDate(deal.created_at)}</p>
                  </div>
                  
                  {deal.last_drafted_at && (
                    <div>
                      <label className="text-sm text-onGlass-secondary">Last Updated</label>
                      <p className="text-onGlass text-sm">{formatDate(deal.last_drafted_at)}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Memo Content */}
          <div className="lg:col-span-2">
            <Card>
              <div className="p-6">
                {deal?.memo ? (
                  <MemoEditor
                    initialContent={deal.memo}
                    onSave={saveMemo}
                    onCancel={() => {}}
                    loading={saving}
                  />
                ) : (
                  <div className="text-center py-12">
                    <div className="text-onGlass-secondary mb-4">
                      <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h4 className="text-lg font-medium text-onGlass mb-2">No memo generated yet</h4>
                    <p className="text-onGlass-secondary mb-6">
                      Click "Draft Memo" to generate an AI-powered investment memo using GPT-5 and company data.
                    </p>
                    <Button onClick={draftMemo} disabled={memoLoading} variant="primary">
                      {memoLoading ? 'Generating with GPT-5...' : 'Generate Memo with GPT-5'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
