'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  Table as TableIcon,
  FileText,
  ExternalLink,
  BarChart3
} from 'lucide-react';

interface Metric {
  id: string;
  metric_id: string;
  value: number;
  period: string;
  unit?: string;
  snippet_url?: string;
  inputs?: Record<string, number>;
}

interface Financial {
  id: string;
  line_item_id: string;
  amount: number;
  date: string;
  scenario: string;
  currency?: string;
  source_location?: any;
  snippet_url?: string;
}

interface FinancialsDashboardProps {
  companyId: string;
}

export function FinancialsDashboard({ companyId }: FinancialsDashboardProps) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [financials, setFinancials] = useState<{ actuals: Financial[]; budget: Financial[]; forecast: Financial[]; total: number }>({
    actuals: [], budget: [], forecast: [], total: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/portfolio/metrics?companyId=${companyId}`);
        const data = await res.json();
        if (data.metrics) setMetrics(data.metrics);
        if (data.financials) setFinancials(data.financials);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [companyId]);

  // Group metrics by Period and ID
  const { periods: metricPeriods, groupedMetrics, keyMetrics } = useMemo(() => {
    const dates = Array.from(new Set(metrics.map(m => m.period))).sort();
    const grouped: Record<string, Record<string, Metric>> = {};
    const latestValues: Record<string, Metric> = {};

    metrics.forEach(m => {
      if (!grouped[m.period]) grouped[m.period] = {};
      grouped[m.period][m.metric_id] = m;
      latestValues[m.metric_id] = m;
    });

    return { 
      periods: dates, 
      groupedMetrics: grouped,
      keyMetrics: latestValues
    };
  }, [metrics]);

  // Group financials by date and line item
  const { financialPeriods, groupedFinancials, latestFinancials } = useMemo(() => {
    const dates = Array.from(new Set(financials.actuals.map(f => f.date))).sort().reverse();
    const grouped: Record<string, Record<string, Financial>> = {};
    const latest: Record<string, Financial> = {};

    financials.actuals.forEach(f => {
      if (!grouped[f.date]) grouped[f.date] = {};
      grouped[f.date][f.line_item_id] = f;
      if (!latest[f.line_item_id]) latest[f.line_item_id] = f;
    });

    return { 
      financialPeriods: dates, 
      groupedFinancials: grouped,
      latestFinancials: latest
    };
  }, [financials]);

  const formatValue = (val: number, unit?: string, currency?: string) => {
    if (unit === 'percentage' || unit === 'percent') {
      return `${(val * 100).toFixed(1)}%`;
    }
    if (unit === 'months') return `${val.toFixed(1)} mo`;
    
    const prefix = currency === 'EUR' ? '€' : '$';
    if (Math.abs(val) >= 1000000) return `${prefix}${(val / 1000000).toFixed(1)}M`;
    if (Math.abs(val) >= 1000) return `${prefix}${(val / 1000).toFixed(0)}k`;
    return `${prefix}${val.toLocaleString()}`;
  };

  const formatLineItemName = (id: string) => {
    return id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-white/50">
        <Loader2 className="animate-spin mr-2" /> Loading financials...
      </div>
    );
  }

  const hasData = metrics.length > 0 || financials.total > 0;

  if (!hasData) {
    return (
      <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
        <TrendingUp size={48} className="mx-auto text-white/20 mb-4" />
        <h3 className="text-xl font-medium text-white">No Financial Data</h3>
        <p className="text-white/50 mt-2">Upload financial documents to see metrics.</p>
        <Link href="/import" className="inline-block mt-6 text-emerald-400 hover:underline">
          Go to Import Tool →
        </Link>
      </div>
    );
  }

  // Key KPIs from fact_metrics
  const kpis = [
    { id: 'arr', label: 'ARR', icon: TrendingUp },
    { id: 'rule_of_40', label: 'Rule of 40', icon: BarChart3 },
    { id: 'gross_margin', label: 'Gross Margin', icon: DollarSign },
    { id: 'runway_months', label: 'Runway', icon: Calendar }
  ];

  return (
    <div className="space-y-8">
      {/* Section 1: Computed KPIs from fact_metrics */}
      {metrics.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-emerald-400" />
            Computed KPIs
            <span className="text-xs text-white/40 normal-case">({metrics.length} metrics)</span>
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map(kpi => {
              const metric = keyMetrics[kpi.id];
              const Icon = kpi.icon;
              
              return (
                <div key={kpi.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-wider mb-1">
                    <Icon size={12} />
                    {kpi.label}
                  </div>
                  <div className="text-2xl font-mono text-white font-medium">
                    {metric ? formatValue(metric.value, metric.unit) : '-'}
                  </div>
                  {metric?.period && (
                    <div className="text-xs text-white/40 mt-1">
                      {new Date(metric.period).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* All Metrics Table */}
          {Object.keys(keyMetrics).length > 4 && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-white/10 bg-white/5 text-xs text-white/60 uppercase tracking-wider">
                All Computed Metrics
              </div>
              <div className="divide-y divide-white/5">
                {Object.entries(keyMetrics).map(([id, m]) => (
                  <div key={id} className="flex justify-between items-center px-4 py-2 hover:bg-white/5">
                    <span className="text-white/80 text-sm">{formatLineItemName(id)}</span>
                    <span className="font-mono text-white">{formatValue(m.value, m.unit)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Raw Financial Line Items from fact_financials */}
      {financials.total > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText size={14} className="text-blue-400" />
            Financial Line Items
            <span className="text-xs text-white/40 normal-case">({financials.actuals.length} actuals, {financials.budget.length} budget)</span>
          </h3>
          
          {/* Key Financial Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {['revenue_total_group', 'parr_group', 'adj_ebitda', 'ebitda'].map(key => {
              const item = latestFinancials[key];
              if (!item) return null;
              
              return (
                <div key={key} className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <div className="text-blue-400/70 text-xs uppercase tracking-wider mb-1">
                    {formatLineItemName(key)}
                  </div>
                  <div className="text-xl font-mono text-white font-medium">
                    {formatValue(item.amount, undefined, item.currency)}
                  </div>
                  <div className="text-xs text-white/40 mt-1 flex items-center gap-1">
                    {new Date(item.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    {item.snippet_url && (
                      <a href={item.snippet_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>
          
          {/* Full Line Items Table */}
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
              <h4 className="font-medium text-white flex items-center gap-2">
                <Calendar size={16} className="text-blue-400" />
                Historical Data (Actuals)
              </h4>
              <span className="text-xs text-white/40">{financialPeriods.length} periods</span>
            </div>
            
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white/50 uppercase bg-black/20 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-[#1a1a1a] z-20 min-w-[180px]">Line Item</th>
                    {financialPeriods.slice(0, 12).map(date => (
                      <th key={date} className="px-4 py-3 whitespace-nowrap text-right">
                        {new Date(date).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {Object.keys(latestFinancials).sort().map(lineItemId => (
                    <tr key={lineItemId} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-2 font-medium text-white/80 sticky left-0 bg-[#1a1a1a] border-r border-white/10 text-xs">
                        {formatLineItemName(lineItemId)}
                      </td>
                      {financialPeriods.slice(0, 12).map(date => {
                        const item = groupedFinancials[date]?.[lineItemId];
                        return (
                          <td key={date} className="px-4 py-2 text-white/70 font-mono text-right whitespace-nowrap text-xs">
                            {item ? formatValue(item.amount, undefined, item.currency) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Import Link */}
      <div className="text-center pt-4 border-t border-white/10">
        <Link href="/import" className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
          <FileText size={14} /> Upload More Documents
        </Link>
      </div>
    </div>
  );
}
