'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Loader2,
  FileText,
  ExternalLink,
  BarChart3,
  Target,
  ChevronDown,
  ChevronRight,
  Users,
  Wallet,
  TrendingDown,
  PiggyBank,
  X,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Scale
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

interface AuditModalData {
  lineItemId: string;
  period: string;
  actual?: Financial;
  budget?: Financial;
  allRecords: Financial[];
}

// Canonical line item mappings (synonyms → canonical name)
const LINE_ITEM_SYNONYMS: string[][] = [
  ['arr', 'annual_recurring_revenue', 'annualized_recurring_revenue', 'total_arr'],
  ['mrr', 'monthly_recurring_revenue', 'total_mrr'],
  ['revenue', 'total_revenue', 'net_revenue', 'gross_revenue'],
  ['arpu', 'average_revenue_per_user', 'revenue_per_user', 'avg_revenue_per_customer'],
  ['nrr', 'net_revenue_retention', 'net_retention', 'ndr', 'net_dollar_retention'],
  ['grr', 'gross_revenue_retention', 'gross_retention'],
  ['customers', 'total_customers', 'customer_count', 'active_customers', 'paying_customers'],
  ['users', 'total_users', 'active_users', 'registered_users'],
  ['churn', 'churn_rate', 'customer_churn', 'monthly_churn', 'logo_churn'],
  ['cac', 'customer_acquisition_cost', 'acquisition_cost'],
  ['ltv', 'lifetime_value', 'customer_lifetime_value', 'clv'],
  ['cash_balance', 'cash', 'cash_position', 'bank_balance', 'available_cash'],
  ['runway', 'runway_months', 'cash_runway', 'months_runway'],
  ['burn', 'burn_rate', 'monthly_burn', 'net_burn', 'cash_burn'],
  ['cogs', 'cost_of_goods_sold', 'cost_of_sales', 'cos', 'cost_of_revenue'],
  ['opex', 'operating_expenses', 'operational_expenses', 'total_opex'],
  ['ebitda', 'adjusted_ebitda', 'ebitda_adjusted'],
  ['gross_margin', 'gross_profit_margin', 'gm', 'gpm'],
  ['gross_profit', 'gross_income'],
  ['net_income', 'net_profit', 'profit', 'bottom_line'],
];

const SYNONYM_TO_CANONICAL: Map<string, string> = new Map();
LINE_ITEM_SYNONYMS.forEach(group => {
  const canonical = group[0];
  group.forEach(synonym => {
    SYNONYM_TO_CANONICAL.set(synonym.toLowerCase(), canonical);
  });
});

function normalizeLineItemId(id: string): string {
  const lower = id.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return SYNONYM_TO_CANONICAL.get(lower) || lower;
}

const LINE_ITEM_CATEGORIES: Record<string, { name: string; icon: any; color: string; items: string[] }> = {
  revenue: {
    name: 'Revenue & Growth',
    icon: TrendingUp,
    color: 'emerald',
    items: ['arr', 'mrr', 'revenue', 'parr', 'nrr', 'grr', 'arpu', 'acv', 'tcv', 'bookings', 'gmv', 'tpv']
  },
  customers: {
    name: 'Customers & Retention',
    icon: Users,
    color: 'blue',
    items: ['customers', 'users', 'accounts', 'merchants', 'churn', 'retention', 'ltv', 'cac', 'payback']
  },
  cash: {
    name: 'Cash & Liquidity',
    icon: Wallet,
    color: 'cyan',
    items: ['cash', 'runway', 'burn', 'liquidity', 'working_capital']
  },
  costs: {
    name: 'Costs & Expenses',
    icon: TrendingDown,
    color: 'red',
    items: ['cogs', 'opex', 'capex', 'cost', 'expense', 'salary', 'personnel', 'marketing', 'sales']
  },
  profitability: {
    name: 'Profitability',
    icon: PiggyBank,
    color: 'purple',
    items: ['ebitda', 'ebit', 'profit', 'margin', 'contribution', 'gross_profit', 'net_income']
  }
};

function categorizeLineItem(lineItemId: string): string {
  const lower = lineItemId.toLowerCase();
  for (const [category, config] of Object.entries(LINE_ITEM_CATEGORIES)) {
    if (config.items.some(keyword => lower.includes(keyword))) {
      return category;
    }
  }
  return 'other';
}

function normalizeToMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// Audit History Modal Component
function AuditModal({ data, onClose, formatValue }: { 
  data: AuditModalData; 
  onClose: () => void;
  formatValue: (val: number, unit?: string, currency?: string) => string;
}) {
  const variance = data.actual && data.budget 
    ? data.actual.amount - data.budget.amount 
    : null;
  const variancePct = variance !== null && data.budget?.amount 
    ? (variance / Math.abs(data.budget.amount)) * 100 
    : null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-[#1a1a1a] border border-white/20 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-medium flex items-center gap-2">
              <History size={16} className="text-blue-400" />
              Audit Trail
            </h3>
            <p className="text-white/50 text-sm mt-1">
              {data.lineItemId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} • {formatMonthLabel(data.period)}
            </p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 p-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">Actual</div>
            <div className="text-lg font-mono text-white">
              {data.actual ? formatValue(data.actual.amount, undefined, data.actual.currency) : '-'}
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <div className="text-xs text-amber-400 uppercase tracking-wider mb-1">Budget</div>
            <div className="text-lg font-mono text-white">
              {data.budget ? formatValue(data.budget.amount, undefined, data.budget.currency) : '-'}
            </div>
          </div>
          <div className={`${variance !== null && variance >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'} border rounded-lg p-3 text-center`}>
            <div className={`text-xs uppercase tracking-wider mb-1 ${variance !== null && variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Variance</div>
            <div className={`text-lg font-mono ${variance !== null && variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {variance !== null ? (
                <>
                  {variance >= 0 ? '+' : ''}{formatValue(variance, undefined, data.actual?.currency || data.budget?.currency)}
                  {variancePct !== null && (
                    <span className="text-xs ml-1">({variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%)</span>
                  )}
                </>
              ) : '-'}
            </div>
          </div>
        </div>

        {/* All Records */}
        <div className="p-4 border-t border-white/10">
          <h4 className="text-sm text-white/60 uppercase tracking-wider mb-3">All Source Records</h4>
          {data.allRecords.length > 0 ? (
            <div className="space-y-2">
              {data.allRecords.map((record, idx) => (
                <div key={record.id || idx} className="bg-white/5 rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        record.scenario?.toLowerCase() === 'actual' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {record.scenario || 'Unknown'}
                      </span>
                      <span className="text-white/50 text-xs ml-2">{record.line_item_id}</span>
                    </div>
                    <span className="font-mono text-white">{formatValue(record.amount, undefined, record.currency)}</span>
                  </div>
                  {record.snippet_url && (
                    <a 
                      href={record.snippet_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> View Source Document
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm">No source records found for this cell.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FinancialsDashboard({ companyId }: FinancialsDashboardProps) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [financials, setFinancials] = useState<{ actuals: Financial[]; budget: Financial[]; forecast: Financial[]; total: number }>({
    actuals: [], budget: [], forecast: [], total: 0
  });
  const [loading, setLoading] = useState(true);
  const [showBudget, setShowBudget] = useState(false);
  const [showActuals, setShowActuals] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    revenue: true, customers: true, cash: true, costs: false, profitability: true, other: false
  });
  const [auditModal, setAuditModal] = useState<AuditModalData | null>(null);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

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

  // Group and normalize actuals
  const { actualsPeriods, actualsGrouped, actualsLatest, actualsLineItems, actualsDedupeCount, actualsRaw } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    const rawByMonthItem: Record<string, Financial[]> = {};
    
    const sorted = [...financials.actuals].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      const canonicalId = normalizeLineItemId(f.line_item_id);
      const key = `${month}|${canonicalId}`;
      
      // Store raw records for audit
      if (!rawByMonthItem[key]) rawByMonthItem[key] = [];
      rawByMonthItem[key].push(f);
      
      if (!byMonthItem[key]) {
        byMonthItem[key] = { ...f, date: month, line_item_id: canonicalId };
      }
    });
    
    const normalized = Object.values(byMonthItem);
    const months = Array.from(new Set(normalized.map(f => f.date))).sort();
    
    const grouped: Record<string, Record<string, Financial>> = {};
    const latest: Record<string, Financial> = {};
    const lineItems = new Set<string>();
    
    normalized.forEach(f => {
      if (!grouped[f.date]) grouped[f.date] = {};
      grouped[f.date][f.line_item_id] = f;
      latest[f.line_item_id] = f;
      lineItems.add(f.line_item_id);
    });
    
    const originalCount = new Set(financials.actuals.map(f => f.line_item_id)).size;
    const dedupeCount = originalCount - lineItems.size;
    
    return { 
      actualsPeriods: months, 
      actualsGrouped: grouped, 
      actualsLatest: latest,
      actualsLineItems: Array.from(lineItems).sort(),
      actualsDedupeCount: dedupeCount,
      actualsRaw: rawByMonthItem
    };
  }, [financials.actuals]);

  // Group and normalize budget/plan
  const { budgetPeriods, budgetGrouped, budgetLineItems, budgetDedupeCount, budgetRaw } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    const rawByMonthItem: Record<string, Financial[]> = {};
    
    const sorted = [...financials.budget].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      const canonicalId = normalizeLineItemId(f.line_item_id);
      const key = `${month}|${canonicalId}`;
      
      if (!rawByMonthItem[key]) rawByMonthItem[key] = [];
      rawByMonthItem[key].push(f);
      
      if (!byMonthItem[key]) {
        byMonthItem[key] = { ...f, date: month, line_item_id: canonicalId };
      }
    });
    
    const normalized = Object.values(byMonthItem);
    const months = Array.from(new Set(normalized.map(f => f.date))).sort();
    
    const grouped: Record<string, Record<string, Financial>> = {};
    const lineItems = new Set<string>();
    
    normalized.forEach(f => {
      if (!grouped[f.date]) grouped[f.date] = {};
      grouped[f.date][f.line_item_id] = f;
      lineItems.add(f.line_item_id);
    });
    
    const originalCount = new Set(financials.budget.map(f => f.line_item_id)).size;
    const dedupeCount = originalCount - lineItems.size;
    
    return { budgetPeriods: months, budgetGrouped: grouped, budgetLineItems: Array.from(lineItems).sort(), budgetDedupeCount: dedupeCount, budgetRaw: rawByMonthItem };
  }, [financials.budget]);

  // Value-based deduplication
  const { deduplicatedLineItems, valueDuplicatesRemoved } = useMemo(() => {
    const allItems = [...new Set([...actualsLineItems, ...budgetLineItems])];
    
    const getValueSignature = (lineItemId: string, grouped: Record<string, Record<string, Financial>>, periods: string[]): string => {
      return periods.map(p => {
        const val = grouped[p]?.[lineItemId]?.amount;
        return val !== undefined ? val.toFixed(2) : 'null';
      }).join('|');
    };
    
    const signatureToCanonical: Map<string, string> = new Map();
    const itemsToRemove = new Set<string>();
    
    if (actualsPeriods.length > 0) {
      actualsLineItems.forEach(item => {
        const sig = getValueSignature(item, actualsGrouped, actualsPeriods);
        if (sig && !sig.startsWith('null')) {
          const existing = signatureToCanonical.get(sig);
          if (existing) {
            if (item.length > existing.length) {
              itemsToRemove.add(item);
            } else {
              itemsToRemove.add(existing);
              signatureToCanonical.set(sig, item);
            }
          } else {
            signatureToCanonical.set(sig, item);
          }
        }
      });
    }
    
    if (budgetPeriods.length > 0) {
      budgetLineItems.forEach(item => {
        if (itemsToRemove.has(item)) return;
        const sig = getValueSignature(item, budgetGrouped, budgetPeriods);
        if (sig && !sig.startsWith('null')) {
          const existing = signatureToCanonical.get(sig);
          if (existing && existing !== item) {
            if (item.length > existing.length) {
              itemsToRemove.add(item);
            } else {
              itemsToRemove.add(existing);
              signatureToCanonical.set(sig, item);
            }
          } else if (!existing) {
            signatureToCanonical.set(sig, item);
          }
        }
      });
    }
    
    const dedupedItems = allItems.filter(item => !itemsToRemove.has(item));
    
    return {
      deduplicatedLineItems: dedupedItems,
      valueDuplicatesRemoved: itemsToRemove.size
    };
  }, [actualsLineItems, budgetLineItems, actualsGrouped, budgetGrouped, actualsPeriods, budgetPeriods]);

  // Build summary data: periods where both budget and actual exist
  const { summaryPeriods, summaryLineItems } = useMemo(() => {
    const commonPeriods = actualsPeriods.filter(p => budgetPeriods.includes(p));
    const commonLineItems = deduplicatedLineItems.filter(item => 
      actualsLineItems.includes(item) || budgetLineItems.includes(item)
    );
    return { summaryPeriods: commonPeriods, summaryLineItems: commonLineItems };
  }, [actualsPeriods, budgetPeriods, deduplicatedLineItems, actualsLineItems, budgetLineItems]);

  // Categorize line items
  const categorizedLineItems = useMemo(() => {
    const categories: Record<string, string[]> = {};
    
    deduplicatedLineItems.forEach(item => {
      const cat = categorizeLineItem(item);
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });
    
    for (const cat in categories) {
      categories[cat].sort();
    }
    
    return categories;
  }, [deduplicatedLineItems]);

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

  const openAuditModal = (lineItemId: string, period: string) => {
    const key = `${period}|${lineItemId}`;
    const actualRecords = actualsRaw[key] || [];
    const budgetRecords = budgetRaw[key] || [];
    
    setAuditModal({
      lineItemId,
      period,
      actual: actualsGrouped[period]?.[lineItemId],
      budget: budgetGrouped[period]?.[lineItemId],
      allRecords: [...actualRecords, ...budgetRecords]
    });
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

  const kpis = [
    { id: 'arr', label: 'ARR', icon: TrendingUp },
    { id: 'rule_of_40', label: 'Rule of 40', icon: BarChart3 },
    { id: 'gross_margin', label: 'Gross Margin', icon: DollarSign },
    { id: 'runway_months', label: 'Runway', icon: Calendar }
  ];

  const keyMetrics: Record<string, Metric> = {};
  metrics.forEach(m => { keyMetrics[m.metric_id] = m; });

  const categoryOrder = ['revenue', 'customers', 'cash', 'profitability', 'costs', 'other'];

  // Use all periods from either actuals or budget for summary
  const allPeriods = Array.from(new Set([...actualsPeriods, ...budgetPeriods])).sort();

  return (
    <div className="space-y-8">
      {/* Audit Modal */}
      {auditModal && (
        <AuditModal data={auditModal} onClose={() => setAuditModal(null)} formatValue={formatValue} />
      )}

      {/* Section 1: Computed KPIs */}
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

      {/* Section 2: SUMMARY TABLE - Budget vs Actual vs Variance */}
      {(financials.actuals.length > 0 || financials.budget.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Scale size={14} className="text-violet-400" />
            Budget vs Actual Summary
            <span className="text-xs text-white/40 normal-case">
              ({deduplicatedLineItems.length} metrics, {allPeriods.length} periods)
            </span>
          </h3>
          
          <div className="bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase sticky top-0 z-10 text-white/50 bg-black/50">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 z-20 min-w-[180px] border-r bg-[#1a1a1a] border-white/10">
                      Line Item
                    </th>
                    {allPeriods.map(date => (
                      <th key={date} colSpan={3} className="px-1 py-2 text-center border-r border-white/10">
                        <div className="text-white/70">{formatMonthLabel(date)}</div>
                        <div className="flex text-[10px] text-white/40 mt-1">
                          <span className="flex-1 text-blue-400">Act</span>
                          <span className="flex-1 text-amber-400">Bud</span>
                          <span className="flex-1 text-violet-400">Var</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {categoryOrder.map(cat => {
                    const items = categorizedLineItems[cat];
                    if (!items || items.length === 0) return null;
                    
                    const config = LINE_ITEM_CATEGORIES[cat] || { name: 'Other', icon: FileText, color: 'gray' };
                    const Icon = config.icon;
                    const isExpanded = expandedCategories[cat];

                    return (
                      <React.Fragment key={cat}>
                        <tr 
                          className="bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                          onClick={() => toggleCategory(cat)}
                        >
                          <td 
                            colSpan={allPeriods.length * 3 + 1}
                            className="px-4 py-2 sticky left-0 bg-white/5"
                          >
                            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/60">
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <Icon size={12} />
                              {config.name}
                              <span className="text-white/40 normal-case">({items.length})</span>
                            </div>
                          </td>
                        </tr>
                        
                        {isExpanded && items.map(lineItemId => (
                          <tr key={lineItemId} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2 pl-8 font-medium sticky left-0 border-r text-xs text-white/80 bg-[#1a1a1a] border-white/10">
                              {formatLineItemName(lineItemId)}
                            </td>
                            {allPeriods.map(date => {
                              const actual = actualsGrouped[date]?.[lineItemId];
                              const budget = budgetGrouped[date]?.[lineItemId];
                              const variance = actual && budget ? actual.amount - budget.amount : null;
                              const variancePct = variance !== null && budget?.amount ? (variance / Math.abs(budget.amount)) * 100 : null;
                              
                              return (
                                <React.Fragment key={date}>
                                  <td 
                                    className="px-1 py-2 font-mono text-right whitespace-nowrap text-xs text-blue-300 cursor-pointer hover:bg-blue-500/10"
                                    onClick={() => openAuditModal(lineItemId, date)}
                                    title="Click for audit trail"
                                  >
                                    {actual ? formatValue(actual.amount, undefined, actual.currency) : '-'}
                                  </td>
                                  <td className="px-1 py-2 font-mono text-right whitespace-nowrap text-xs text-amber-300/70">
                                    {budget ? formatValue(budget.amount, undefined, budget.currency) : '-'}
                                  </td>
                                  <td className={`px-1 py-2 font-mono text-right whitespace-nowrap text-xs border-r border-white/10 ${
                                    variance === null ? 'text-white/30' : variance >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {variance !== null ? (
                                      <span className="flex items-center justify-end gap-0.5">
                                        {variance > 0 ? <ArrowUpRight size={10} /> : variance < 0 ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                                        {variancePct !== null ? `${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(0)}%` : '-'}
                                      </span>
                                    ) : '-'}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Actuals Detail (Collapsible) */}
      {financials.actuals.length > 0 && (
        <div>
          <button 
            onClick={() => setShowActuals(!showActuals)}
            className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 hover:text-white/80 transition-colors"
          >
            {showActuals ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <FileText size={14} className="text-blue-400" />
            Actuals Detail
            <span className="text-xs text-white/40 normal-case">
              ({financials.actuals.length} records, {actualsPeriods.length} periods)
            </span>
          </button>
          
          {showActuals && (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase sticky top-0 z-10 text-white/50 bg-black/30">
                    <tr>
                      <th className="px-4 py-3 sticky left-0 z-20 min-w-[200px] border-r bg-[#1a1a1a] border-white/10">Line Item</th>
                      {actualsPeriods.map(date => (
                        <th key={date} className="px-3 py-3 whitespace-nowrap text-right min-w-[80px]">{formatMonthLabel(date)}</th>
                      ))}
                      <th className="px-3 py-3 text-center min-w-[50px]">Src</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {actualsLineItems.map(lineItemId => (
                      <tr key={lineItemId} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 font-medium sticky left-0 border-r text-xs text-white/80 bg-[#1a1a1a] border-white/10">
                          {formatLineItemName(lineItemId)}
                        </td>
                        {actualsPeriods.map(date => {
                          const item = actualsGrouped[date]?.[lineItemId];
                          return (
                            <td 
                              key={date} 
                              className="px-3 py-2 font-mono text-right whitespace-nowrap text-xs text-white/70 cursor-pointer hover:bg-blue-500/10"
                              onClick={() => openAuditModal(lineItemId, date)}
                            >
                              {item ? formatValue(item.amount, undefined, item.currency) : '-'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          {actualsLatest[lineItemId]?.snippet_url && (
                            <a href={actualsLatest[lineItemId].snippet_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 4: Budget/Plan Detail (Collapsible) */}
      {financials.budget.length > 0 && (
        <div>
          <button 
            onClick={() => setShowBudget(!showBudget)}
            className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 hover:text-white/80 transition-colors"
          >
            {showBudget ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Target size={14} className="text-amber-400" />
            Budget / Plan Detail
            <span className="text-xs text-white/40 normal-case">
              ({financials.budget.length} records, {budgetPeriods.length} periods)
            </span>
          </button>
          
          {showBudget && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase sticky top-0 z-10 text-amber-400/70 bg-black/30">
                    <tr>
                      <th className="px-4 py-3 sticky left-0 z-20 min-w-[200px] border-r bg-[#1a1a1a] border-amber-500/20">Line Item</th>
                      {budgetPeriods.map(date => (
                        <th key={date} className="px-3 py-3 whitespace-nowrap text-right min-w-[80px]">{formatMonthLabel(date)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-500/10">
                    {budgetLineItems.map(lineItemId => (
                      <tr key={lineItemId} className="hover:bg-amber-500/5 transition-colors">
                        <td className="px-4 py-2 font-medium sticky left-0 border-r text-xs text-amber-200/80 bg-[#1a1a1a] border-amber-500/20">
                          {formatLineItemName(lineItemId)}
                        </td>
                        {budgetPeriods.map(date => {
                          const item = budgetGrouped[date]?.[lineItemId];
                          return (
                            <td key={date} className="px-3 py-2 font-mono text-right whitespace-nowrap text-xs text-amber-100/60">
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
      <div className="grid grid-cols-5 gap-3 text-center text-xs">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
          <div className="text-blue-400 font-medium">{actualsPeriods.length}</div>
          <div className="text-white/40">Periods (Actuals)</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-amber-400 font-medium">{budgetPeriods.length}</div>
          <div className="text-white/40">Periods (Budget)</div>
        </div>
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
          <div className="text-cyan-400 font-medium">{deduplicatedLineItems.length}</div>
          <div className="text-white/40">Unique Metrics</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-emerald-400 font-medium">{metrics.length}</div>
          <div className="text-white/40">Computed KPIs</div>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
          <div className="text-purple-400 font-medium">{actualsDedupeCount + budgetDedupeCount + valueDuplicatesRemoved}</div>
          <div className="text-white/40">Duplicates Merged</div>
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
