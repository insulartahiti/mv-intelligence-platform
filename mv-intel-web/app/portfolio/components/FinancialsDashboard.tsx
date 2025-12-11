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
  PiggyBank
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

// Canonical line item mappings (synonyms → canonical name)
// The first item in each array is the canonical name
const LINE_ITEM_SYNONYMS: string[][] = [
  // Revenue metrics
  ['arr', 'annual_recurring_revenue', 'annualized_recurring_revenue', 'total_arr'],
  ['mrr', 'monthly_recurring_revenue', 'total_mrr'],
  ['revenue', 'total_revenue', 'net_revenue', 'gross_revenue'],
  ['arpu', 'average_revenue_per_user', 'revenue_per_user', 'avg_revenue_per_customer'],
  ['nrr', 'net_revenue_retention', 'net_retention', 'ndr', 'net_dollar_retention'],
  ['grr', 'gross_revenue_retention', 'gross_retention'],
  
  // Customer metrics
  ['customers', 'total_customers', 'customer_count', 'active_customers', 'paying_customers'],
  ['users', 'total_users', 'active_users', 'registered_users'],
  ['churn', 'churn_rate', 'customer_churn', 'monthly_churn', 'logo_churn'],
  ['cac', 'customer_acquisition_cost', 'acquisition_cost'],
  ['ltv', 'lifetime_value', 'customer_lifetime_value', 'clv'],
  
  // Cash metrics
  ['cash_balance', 'cash', 'cash_position', 'bank_balance', 'available_cash'],
  ['runway', 'runway_months', 'cash_runway', 'months_runway'],
  ['burn', 'burn_rate', 'monthly_burn', 'net_burn', 'cash_burn'],
  
  // Cost metrics
  ['cogs', 'cost_of_goods_sold', 'cost_of_sales', 'cos', 'cost_of_revenue'],
  ['opex', 'operating_expenses', 'operational_expenses', 'total_opex'],
  
  // Profitability
  ['ebitda', 'adjusted_ebitda', 'ebitda_adjusted'],
  ['gross_margin', 'gross_profit_margin', 'gm', 'gpm'],
  ['gross_profit', 'gross_income'],
  ['net_income', 'net_profit', 'profit', 'bottom_line'],
];

// Build lookup map: any synonym → canonical name
const SYNONYM_TO_CANONICAL: Map<string, string> = new Map();
LINE_ITEM_SYNONYMS.forEach(group => {
  const canonical = group[0];
  group.forEach(synonym => {
    SYNONYM_TO_CANONICAL.set(synonym.toLowerCase(), canonical);
  });
});

// Normalize a line item ID to its canonical form
function normalizeLineItemId(id: string): string {
  const lower = id.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return SYNONYM_TO_CANONICAL.get(lower) || lower;
}

// Check if two line items are semantically similar
function areLineItemsSimilar(id1: string, id2: string): boolean {
  const norm1 = normalizeLineItemId(id1);
  const norm2 = normalizeLineItemId(id2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // One contains the other (e.g., "customers" vs "customers_finos")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    // But not for very short strings to avoid false positives
    if (norm1.length > 3 && norm2.length > 3) return true;
  }
  
  return false;
}

// Line item category definitions
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

// Categorize a line item
function categorizeLineItem(lineItemId: string): string {
  const lower = lineItemId.toLowerCase();
  for (const [category, config] of Object.entries(LINE_ITEM_CATEGORIES)) {
    if (config.items.some(keyword => lower.includes(keyword))) {
      return category;
    }
  }
  return 'other';
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
  const [showBudget, setShowBudget] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    revenue: true, customers: true, cash: true, costs: false, profitability: true, other: false
  });

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

  // Group and normalize actuals - take latest value per month/line_item
  // Sort oldest to newest (left to right)
  // Deduplicate semantically similar line items
  const { actualsPeriods, actualsGrouped, actualsLatest, actualsLineItems, actualsDedupeCount } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    
    const sorted = [...financials.actuals].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      // Normalize the line item ID to canonical form
      const canonicalId = normalizeLineItemId(f.line_item_id);
      const key = `${month}|${canonicalId}`;
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
    
    // Track deduplication: count unique original IDs vs canonical IDs
    const originalCount = new Set(financials.actuals.map(f => f.line_item_id)).size;
    const dedupeCount = originalCount - lineItems.size;
    
    return { 
      actualsPeriods: months, 
      actualsGrouped: grouped, 
      actualsLatest: latest,
      actualsLineItems: Array.from(lineItems).sort(),
      actualsDedupeCount: dedupeCount
    };
  }, [financials.actuals]);

  // Group and normalize budget/plan - oldest to newest
  // Deduplicate semantically similar line items
  const { budgetPeriods, budgetGrouped, budgetLineItems, budgetDedupeCount } = useMemo(() => {
    const byMonthItem: Record<string, Financial> = {};
    
    const sorted = [...financials.budget].sort((a, b) => b.date.localeCompare(a.date));
    
    sorted.forEach(f => {
      const month = normalizeToMonth(f.date);
      // Normalize the line item ID to canonical form
      const canonicalId = normalizeLineItemId(f.line_item_id);
      const key = `${month}|${canonicalId}`;
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
    
    // Track deduplication
    const originalCount = new Set(financials.budget.map(f => f.line_item_id)).size;
    const dedupeCount = originalCount - lineItems.size;
    
    return { budgetPeriods: months, budgetGrouped: grouped, budgetLineItems: Array.from(lineItems).sort(), budgetDedupeCount: dedupeCount };
  }, [financials.budget]);

  // Detect value-based duplicates: line items with identical values across all periods
  // These might be semantically different names but same underlying data
  const { deduplicatedLineItems, valueDuplicatesRemoved } = useMemo(() => {
    const allItems = [...new Set([...actualsLineItems, ...budgetLineItems])];
    
    // Build value signature for each line item: hash of all period values
    const getValueSignature = (lineItemId: string, grouped: Record<string, Record<string, Financial>>, periods: string[]): string => {
      return periods.map(p => {
        const val = grouped[p]?.[lineItemId]?.amount;
        return val !== undefined ? val.toFixed(2) : 'null';
      }).join('|');
    };
    
    // Track which items to keep vs remove (value duplicates)
    const signatureToCanonical: Map<string, string> = new Map();
    const itemsToRemove = new Set<string>();
    
    // Check actuals for value duplicates
    if (actualsPeriods.length > 0) {
      actualsLineItems.forEach(item => {
        const sig = getValueSignature(item, actualsGrouped, actualsPeriods);
        if (sig && !sig.startsWith('null')) {
          const existing = signatureToCanonical.get(sig);
          if (existing) {
            // Found a duplicate! Keep the shorter/simpler name
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
    
    // Check budget for value duplicates
    if (budgetPeriods.length > 0) {
      budgetLineItems.forEach(item => {
        if (itemsToRemove.has(item)) return; // Already marked for removal
        const sig = getValueSignature(item, budgetGrouped, budgetPeriods);
        if (sig && !sig.startsWith('null')) {
          const existing = signatureToCanonical.get(sig);
          if (existing && existing !== item) {
            // Found a duplicate! Keep the shorter/simpler name
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
    
    // Filter out value duplicates
    const dedupedItems = allItems.filter(item => !itemsToRemove.has(item));
    
    return {
      deduplicatedLineItems: dedupedItems,
      valueDuplicatesRemoved: itemsToRemove.size
    };
  }, [actualsLineItems, budgetLineItems, actualsGrouped, budgetGrouped, actualsPeriods, budgetPeriods]);

  // Group line items by category
  const categorizedLineItems = useMemo(() => {
    const categories: Record<string, string[]> = {};
    
    deduplicatedLineItems.forEach(item => {
      const cat = categorizeLineItem(item);
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });
    
    // Sort items within each category
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

  // Render a categorized table
  const renderCategorizedTable = (
    periods: string[],
    grouped: Record<string, Record<string, Financial>>,
    lineItems: Record<string, string[]>,
    latest: Record<string, Financial>,
    isActuals: boolean
  ) => {
    const categoryOrder = ['revenue', 'customers', 'cash', 'profitability', 'costs', 'other'];
    const colorMap: Record<string, string> = {
      revenue: 'emerald', customers: 'blue', cash: 'cyan', costs: 'red', profitability: 'purple', other: 'gray'
    };

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className={`text-xs uppercase sticky top-0 z-10 ${isActuals ? 'text-white/50 bg-black/30' : 'text-amber-400/70 bg-black/30'}`}>
            <tr>
              <th className={`px-4 py-3 sticky left-0 z-20 min-w-[220px] border-r ${isActuals ? 'bg-[#1a1a1a] border-white/10' : 'bg-[#1a1a1a] border-amber-500/20'}`}>
                Line Item
              </th>
              {periods.map(date => (
                <th key={date} className="px-3 py-3 whitespace-nowrap text-right min-w-[80px]">
                  {formatMonthLabel(date)}
                </th>
              ))}
              {isActuals && <th className="px-3 py-3 text-center min-w-[50px]">Src</th>}
            </tr>
          </thead>
          <tbody className={`divide-y ${isActuals ? 'divide-white/5' : 'divide-amber-500/10'}`}>
            {categoryOrder.map(cat => {
              const items = lineItems[cat];
              if (!items || items.length === 0) return null;
              
              const config = LINE_ITEM_CATEGORIES[cat] || { name: 'Other', icon: FileText, color: 'gray' };
              const Icon = config.icon;
              const isExpanded = expandedCategories[cat];
              const color = colorMap[cat];

              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <tr 
                    className={`bg-${color}-500/10 cursor-pointer hover:bg-${color}-500/15 transition-colors`}
                    onClick={() => toggleCategory(cat)}
                  >
                    <td 
                      colSpan={periods.length + (isActuals ? 2 : 1)} 
                      className={`px-4 py-2 sticky left-0 bg-${color}-500/10`}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Icon size={12} className={`text-${color}-400`} />
                        <span className={`text-${color}-400`}>{config.name}</span>
                        <span className="text-white/40 normal-case">({items.length})</span>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Line Items in Category */}
                  {isExpanded && items.map(lineItemId => (
                    <tr key={lineItemId} className={`hover:bg-white/5 transition-colors`}>
                      <td className={`px-4 py-2 pl-8 font-medium sticky left-0 border-r text-xs ${isActuals ? 'text-white/80 bg-[#1a1a1a] border-white/10' : 'text-amber-200/80 bg-[#1a1a1a] border-amber-500/20'}`}>
                        {formatLineItemName(lineItemId)}
                      </td>
                      {periods.map(date => {
                        const item = grouped[date]?.[lineItemId];
                        return (
                          <td key={date} className={`px-3 py-2 font-mono text-right whitespace-nowrap text-xs ${isActuals ? 'text-white/70' : 'text-amber-100/60'}`}>
                            {item ? formatValue(item.amount, undefined, item.currency) : '-'}
                          </td>
                        );
                      })}
                      {isActuals && (
                        <td className="px-3 py-2 text-center">
                          {latest[lineItemId]?.snippet_url && (
                            <a 
                              href={latest[lineItemId].snippet_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-400 hover:text-blue-300"
                              title="View source"
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

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
          
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
            {renderCategorizedTable(actualsPeriods, actualsGrouped, categorizedLineItems, actualsLatest, true)}
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
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              {renderCategorizedTable(budgetPeriods, budgetGrouped, categorizedLineItems, {}, false)}
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
