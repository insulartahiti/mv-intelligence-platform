import { MetricDefinition } from './types';

/**
 * Embedded Common Metrics Dictionary
 * 
 * This is embedded directly in code because Vercel serverless doesn't bundle JSON files.
 * Based on MV Benchmarks and SaaS best practices.
 */
const COMMON_METRICS: MetricDefinition[] = [
  // === GROWTH METRICS ===
  {
    id: 'arr',
    name: 'Annual Recurring Revenue',
    business_models: ['saas'],
    category: 'Growth',
    description: 'Annualized value of recurring subscription revenue.',
    formula: 'mrr * 12',
    inputs: ['mrr'],
    unit: 'currency',
    display_format: '$0,0',
    benchmark_bands: { poor: '< 1M', good: '1M - 10M', great: '> 10M' }
  },
  {
    id: 'mrr',
    name: 'Monthly Recurring Revenue',
    business_models: ['saas'],
    category: 'Growth',
    description: 'Monthly value of recurring subscription revenue.',
    formula: 'sum(subscription_revenue)',
    inputs: ['subscription_revenue'],
    unit: 'currency',
    display_format: '$0,0'
  },
  {
    id: 'arr_growth_yoy',
    name: 'ARR Growth YoY',
    business_models: ['saas', 'marketplace'],
    category: 'Growth',
    description: 'Year-over-year growth rate of Annual Recurring Revenue.',
    formula: '(arr_current - arr_last_year) / arr_last_year',
    inputs: ['arr_current', 'arr_last_year'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '< 20%', good: '20% - 50%', great: '> 50%' }
  },
  {
    id: 'revenue_growth_mom',
    name: 'Revenue Growth MoM',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Growth',
    description: 'Month-over-month revenue growth rate.',
    formula: '(revenue_current - revenue_last_month) / revenue_last_month',
    inputs: ['revenue_current', 'revenue_last_month'],
    unit: 'percentage',
    display_format: '0.0%'
  },
  
  // === RETENTION METRICS ===
  {
    id: 'nrr',
    name: 'Net Revenue Retention',
    business_models: ['saas'],
    category: 'Retention',
    description: 'Revenue retained from existing customers including expansion, net of churn.',
    formula: '(arr_start + expansion - contraction - churn) / arr_start',
    inputs: ['arr_start', 'expansion', 'contraction', 'churn'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '< 100%', good: '100% - 120%', great: '> 120%' }
  },
  {
    id: 'grr',
    name: 'Gross Revenue Retention',
    business_models: ['saas'],
    category: 'Retention',
    description: 'Revenue retained from existing customers excluding expansion.',
    formula: '(arr_start - contraction - churn) / arr_start',
    inputs: ['arr_start', 'contraction', 'churn'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '< 85%', good: '85% - 95%', great: '> 95%' }
  },
  {
    id: 'logo_churn',
    name: 'Logo Churn Rate',
    business_models: ['saas'],
    category: 'Retention',
    description: 'Percentage of customers lost in a period.',
    formula: 'customers_churned / customers_start',
    inputs: ['customers_churned', 'customers_start'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '> 5%', good: '2% - 5%', great: '< 2%' }
  },
  
  // === MARGIN METRICS ===
  {
    id: 'gross_margin',
    name: 'Gross Margin',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Margin',
    description: 'Revenue minus cost of goods sold, as percentage of revenue.',
    formula: '(revenue - cogs) / revenue',
    inputs: ['revenue', 'cogs'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '< 60%', good: '60% - 75%', great: '> 75%' }
  },
  {
    id: 'operating_margin',
    name: 'Operating Margin',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Margin',
    description: 'Operating income as percentage of revenue.',
    formula: 'operating_income / revenue',
    inputs: ['operating_income', 'revenue'],
    unit: 'percentage',
    display_format: '0.0%'
  },
  {
    id: 'ebitda_margin',
    name: 'EBITDA Margin',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Margin',
    description: 'EBITDA as percentage of revenue.',
    formula: 'ebitda / revenue',
    inputs: ['ebitda', 'revenue'],
    unit: 'percentage',
    display_format: '0.0%'
  },
  
  // === EFFICIENCY METRICS ===
  {
    id: 'burn_multiple',
    name: 'Burn Multiple',
    business_models: ['saas', 'fintech'],
    category: 'Efficiency',
    description: 'Net burn divided by net new ARR. Lower is better.',
    formula: 'net_burn / net_new_arr',
    inputs: ['net_burn', 'net_new_arr'],
    unit: 'multiple',
    display_format: '0.0x',
    benchmark_bands: { poor: '> 2x', good: '1x - 2x', great: '< 1x' }
  },
  {
    id: 'rule_of_40',
    name: 'Rule of 40',
    business_models: ['saas'],
    category: 'Efficiency',
    description: 'Revenue growth rate plus profit margin should exceed 40%.',
    formula: 'revenue_growth_yoy + ebitda_margin',
    inputs: ['revenue_growth_yoy', 'ebitda_margin'],
    unit: 'percentage',
    display_format: '0.0%',
    benchmark_bands: { poor: '< 20%', good: '20% - 40%', great: '> 40%' }
  },
  {
    id: 'magic_number',
    name: 'Magic Number',
    business_models: ['saas'],
    category: 'Efficiency',
    description: 'Net new ARR divided by sales & marketing spend.',
    formula: 'net_new_arr / sales_marketing_spend',
    inputs: ['net_new_arr', 'sales_marketing_spend'],
    unit: 'multiple',
    display_format: '0.0x',
    benchmark_bands: { poor: '< 0.5x', good: '0.5x - 1x', great: '> 1x' }
  },
  
  // === UNIT ECONOMICS ===
  {
    id: 'cac',
    name: 'Customer Acquisition Cost',
    business_models: ['saas', 'marketplace'],
    category: 'Unit Economics',
    description: 'Total cost to acquire a new customer.',
    formula: 'sales_marketing_spend / new_customers',
    inputs: ['sales_marketing_spend', 'new_customers'],
    unit: 'currency',
    display_format: '$0,0'
  },
  {
    id: 'ltv',
    name: 'Customer Lifetime Value',
    business_models: ['saas', 'marketplace'],
    category: 'Unit Economics',
    description: 'Expected total revenue from a customer over their lifetime.',
    formula: 'arpu / churn_rate',
    inputs: ['arpu', 'churn_rate'],
    unit: 'currency',
    display_format: '$0,0'
  },
  {
    id: 'ltv_cac_ratio',
    name: 'LTV/CAC Ratio',
    business_models: ['saas', 'marketplace'],
    category: 'Unit Economics',
    description: 'Lifetime value divided by customer acquisition cost.',
    formula: 'ltv / cac',
    inputs: ['ltv', 'cac'],
    unit: 'multiple',
    display_format: '0.0x',
    benchmark_bands: { poor: '< 3x', good: '3x - 5x', great: '> 5x' }
  },
  {
    id: 'cac_payback',
    name: 'CAC Payback Period',
    business_models: ['saas'],
    category: 'Unit Economics',
    description: 'Months to recover customer acquisition cost.',
    formula: 'cac / (arpu * gross_margin)',
    inputs: ['cac', 'arpu', 'gross_margin'],
    unit: 'months',
    display_format: '0 months',
    benchmark_bands: { poor: '> 24', good: '12 - 24', great: '< 12' }
  },
  {
    id: 'arpu',
    name: 'Average Revenue Per User',
    business_models: ['saas', 'marketplace'],
    category: 'Unit Economics',
    description: 'Average monthly revenue per customer.',
    formula: 'mrr / active_customers',
    inputs: ['mrr', 'active_customers'],
    unit: 'currency',
    display_format: '$0,0'
  },
  
  // === CASH & RUNWAY ===
  {
    id: 'monthly_burn',
    name: 'Monthly Net Burn',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Cash',
    description: 'Net cash outflow per month.',
    formula: 'cash_out - cash_in',
    inputs: ['cash_out', 'cash_in'],
    unit: 'currency',
    display_format: '$0,0'
  },
  {
    id: 'runway_months',
    name: 'Runway',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Cash',
    description: 'Months of operation remaining at current burn rate.',
    formula: 'cash_balance / monthly_burn',
    inputs: ['cash_balance', 'monthly_burn'],
    unit: 'months',
    display_format: '0 months',
    benchmark_bands: { poor: '< 12', good: '12 - 18', great: '> 18' }
  },
  {
    id: 'cash_balance',
    name: 'Cash Balance',
    business_models: ['saas', 'marketplace', 'fintech'],
    category: 'Cash',
    description: 'Total cash and cash equivalents.',
    formula: 'cash + cash_equivalents',
    inputs: ['cash', 'cash_equivalents'],
    unit: 'currency',
    display_format: '$0,0'
  },
  
  // === CUSTOMER METRICS ===
  {
    id: 'total_customers',
    name: 'Total Customers',
    business_models: ['saas', 'marketplace'],
    category: 'Customers',
    description: 'Total number of active paying customers.',
    formula: 'count(active_customers)',
    inputs: ['active_customers'],
    unit: 'count',
    display_format: '0,0'
  },
  {
    id: 'new_customers',
    name: 'New Customers',
    business_models: ['saas', 'marketplace'],
    category: 'Customers',
    description: 'Number of new customers acquired in the period.',
    formula: 'count(new_signups)',
    inputs: ['new_signups'],
    unit: 'count',
    display_format: '0,0'
  },
  
  // === NELLY-SPECIFIC METRICS ===
  {
    id: 'total_actual_mrr',
    name: 'Total Actual MRR',
    business_models: ['saas', 'fintech'],
    category: 'Growth',
    description: 'Total monthly recurring revenue across all products.',
    formula: 'sum(product_mrr)',
    inputs: ['product_mrr'],
    unit: 'currency',
    display_format: '€0,0'
  },
  {
    id: 'actual_saas_mrr',
    name: 'SaaS MRR',
    business_models: ['saas'],
    category: 'Growth',
    description: 'Monthly recurring revenue from SaaS subscriptions.',
    formula: 'saas_subscriptions * avg_price',
    inputs: ['saas_subscriptions', 'avg_price'],
    unit: 'currency',
    display_format: '€0,0'
  },
  {
    id: 'saas_customers',
    name: 'SaaS Customers',
    business_models: ['saas'],
    category: 'Customers',
    description: 'Number of active SaaS customers.',
    formula: 'count(saas_subscriptions)',
    inputs: ['saas_subscriptions'],
    unit: 'count',
    display_format: '0,0'
  }
];

// Cache for loaded metrics
let metricsCache: MetricDefinition[] | null = null;

export function loadCommonMetrics(): MetricDefinition[] {
  if (metricsCache) {
    return metricsCache;
  }
  
  // Use embedded metrics (works in serverless)
  metricsCache = COMMON_METRICS;
  console.log(`[Metrics] Loaded ${metricsCache.length} common metrics (embedded)`);
  return metricsCache;
}

export function getMetricById(id: string): MetricDefinition | undefined {
  const metrics = loadCommonMetrics();
  return metrics.find((m) => m.id === id);
}

export function getMetricsByBusinessModel(model: string): MetricDefinition[] {
  const metrics = loadCommonMetrics();
  return metrics.filter((m) => m.business_models.includes(model));
}

export function getMetricsByCategory(category: string): MetricDefinition[] {
  const metrics = loadCommonMetrics();
  return metrics.filter((m) => m.category === category);
}
