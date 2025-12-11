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
  FileText,
  ExternalLink,
  BarChart3,
  Target,
  ChevronDown,
  ChevronRight
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

// Normalize date to first of month (YYYY-MM-01)
function normalizeToMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// Format month label
function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function FinancialsDashboard({ companyId }: FinancialsDashboardProps) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [financials, setFinancials] = useState<{ actuals: Financial[]; budget: Financial[]; forecast: Financial[]; total: number }>({
    actuals: [], budget: [], forecast: [], total: 0
  });
  const [loading, setLoading] = useState(true);
  const [showBudget, setShowBudget] = useState(false);

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

  // Group and normalize actuals - take latest value per month/line_item
  const { actualsPeriods, actualsGrouped, actualsLatest } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    
    // Sort by date descending so latest within a month wins
    const sorted = [...financials.actuals].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      const key = `${month}|${f.line_item_id}`;
      if (!byMonthItem[key]) {
        byMonthItem[key] = { ...f, date: month };
      }
    });
    
    const normalized = Object.values(byMonthItem);
    const months = Array.from(new Set(normalized.map(f => f.date))).sort().reverse();
    
    const grouped: Record<string, Record<string, Financial>> = {};
    const latest: Record<string, Financial> = {};
    
    normalized.forEach(f => {
      if (!grouped[f.date]) grouped[f.date] = {};
      grouped[f.date][f.line_item_id] = f;
      if (!latest[f.line_item_id]) latest[f.line_item_id] = f;
    });
    
    return { actualsPeriods: months, actualsGrouped: grouped, actualsLatest: latest };
  }, [financials.actuals]);

  // Group and normalize budget/plan
  const { budgetPeriods, budgetGrouped } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    
    const sorted = [...financials.budget].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      const key = `${month}|${f.line_item_id}`;
      if (!byMonthItem[key]) {
        byMonthItem[key] = { ...f, date: month };
      }
    });
    
    const normalized = Object.values(byMonthItem);
    const months = Array.from(new Set(normalized.map(f => f.date))).sort().reverse();
    
    const grouped: Record<string, Record<string, Financial>> = {};
    normalized.forEach(f => {
      if (!grouped[f.date]) grouped[f.date] = {};
      grouped[f.date][f.line_item_id] = f;
    });
    
    return { budgetPeriods: months, budgetGrouped: grouped };
  }, [financials.budget]);

  // Get all line items across actuals for consistent display
  const allLineItems = useMemo(() => {
    return Object.keys(actualsLatest).sort();
  }, [actualsLatest]);

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

  const keyMetrics: Record<string, Metric> = {};
  metrics.forEach(m => { keyMetrics[m.metric_id] = m; });

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
                      {formatMonthLabel(metric.period)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 2: Actuals Table */}
      {financials.actuals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText size={14} className="text-blue-400" />
            Actuals
            <span className="text-xs text-white/40 normal-case">
              ({financials.actuals.length} records, {actualsPeriods.length} periods)
            </span>
          </h3>
          
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white/50 uppercase bg-black/30 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-[#1a1a1a] z-20 min-w-[200px] border-r border-white/10">
                      Line Item
                    </th>
                    {actualsPeriods.slice(0, 12).map(date => (
                      <th key={date} className="px-3 py-3 whitespace-nowrap text-right min-w-[80px]">
                        {formatMonthLabel(date)}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center min-w-[60px]">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {allLineItems.map(lineItemId => (
                    <tr key={lineItemId} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-2 font-medium text-white/80 sticky left-0 bg-[#1a1a1a] border-r border-white/10 text-xs">
                        {formatLineItemName(lineItemId)}
                      </td>
                      {actualsPeriods.slice(0, 12).map(date => {
                        const item = actualsGrouped[date]?.[lineItemId];
                        return (
                          <td key={date} className="px-3 py-2 text-white/70 font-mono text-right whitespace-nowrap text-xs">
                            {item ? formatValue(item.amount, undefined, item.currency) : '-'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        {actualsLatest[lineItemId]?.snippet_url && (
                          <a 
                            href={actualsLatest[lineItemId].snippet_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-400 hover:text-blue-300"
                            title="View source"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Budget/Plan Table (Collapsible) */}
      {financials.budget.length > 0 && (
        <div>
          <button 
            onClick={() => setShowBudget(!showBudget)}
            className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 hover:text-white/80 transition-colors"
          >
            {showBudget ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Target size={14} className="text-amber-400" />
            Budget / Plan
            <span className="text-xs text-white/40 normal-case">
              ({financials.budget.length} records, {budgetPeriods.length} periods)
            </span>
          </button>
          
          {showBudget && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-amber-400/70 uppercase bg-black/30 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 sticky left-0 bg-[#1a1a1a] z-20 min-w-[200px] border-r border-amber-500/20">
                        Line Item
                      </th>
                      {budgetPeriods.slice(0, 12).map(date => (
                        <th key={date} className="px-3 py-3 whitespace-nowrap text-right min-w-[80px]">
                          {formatMonthLabel(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-500/10">
                    {Object.keys(budgetGrouped[budgetPeriods[0]] || {}).sort().map(lineItemId => (
                      <tr key={lineItemId} className="hover:bg-amber-500/5 transition-colors">
                        <td className="px-4 py-2 font-medium text-amber-200/80 sticky left-0 bg-[#1a1a1a] border-r border-amber-500/20 text-xs">
                          {formatLineItemName(lineItemId)}
                        </td>
                        {budgetPeriods.slice(0, 12).map(date => {
                          const item = budgetGrouped[date]?.[lineItemId];
                          return (
                            <td key={date} className="px-3 py-2 text-amber-100/60 font-mono text-right whitespace-nowrap text-xs">
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
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 text-center text-xs">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
          <div className="text-blue-400 font-medium">{financials.actuals.length}</div>
          <div className="text-white/40">Actual Records</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-amber-400 font-medium">{financials.budget.length}</div>
          <div className="text-white/40">Budget Records</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-emerald-400 font-medium">{metrics.length}</div>
          <div className="text-white/40">Computed KPIs</div>
        </div>
      </div>

      {/* Import Link */}
      <div className="text-center pt-4 border-t border-white/10">
        <Link href="/import" className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
          <FileText size={14} /> Upload More Documents
        </Link>
      </div>
    </div>
  );
}
