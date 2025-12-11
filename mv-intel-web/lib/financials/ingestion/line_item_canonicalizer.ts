/**
 * Line Item Canonicalizer
 * 
 * Hybrid approach:
 * 1. Check static mapping first (fast, free)
 * 2. For unknown items, call LLM to suggest canonical name
 * 3. Store suggestion in database for review
 * 4. Return suggested canonical name for immediate use
 */

import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Static mapping for known synonyms (fast path)
const STATIC_MAPPINGS: Record<string, string> = {
  // MRR variations
  'total_actual_mrr': 'mrr',
  'actual_mrr': 'mrr',
  'monthly_recurring_revenue': 'mrr',
  'monthly_revenue': 'mrr',
  'total_mrr': 'mrr',
  'mrr_total': 'mrr',
  
  // ARR variations
  'annual_recurring_revenue': 'arr',
  'total_arr': 'arr',
  'actual_arr': 'arr',
  'arr_total': 'arr',
  'annualized_revenue': 'arr',
  'annualized_recurring_revenue': 'arr',
  
  // Customer variations
  'customer_count': 'customers',
  'total_customers': 'customers',
  'active_customers': 'customers',
  'paying_customers': 'customers',
  'merchants': 'customers',
  'active_users': 'users',
  'total_users': 'users',
  'registered_users': 'users',
  
  // Cash/Runway
  'cash': 'cash_balance',
  'cash_position': 'cash_balance',
  'bank_balance': 'cash_balance',
  'available_cash': 'cash_balance',
  'runway': 'runway_months',
  'cash_runway': 'runway_months',
  'months_runway': 'runway_months',
  
  // Burn
  'burn': 'burn_rate',
  'monthly_burn': 'burn_rate',
  'net_burn': 'burn_rate',
  'cash_burn': 'burn_rate',
  
  // Growth
  'mrr_growth': 'mrr_growth_mom',
  'arr_growth': 'arr_growth_yoy',
  'revenue_growth': 'revenue_growth_mom',
  
  // Retention
  'net_revenue_retention': 'nrr',
  'net_retention': 'nrr',
  'gross_revenue_retention': 'grr',
  'gross_retention': 'grr',
  'churn': 'churn_rate',
  'customer_churn': 'churn_rate',
  'logo_churn': 'churn_rate',
  'monthly_churn': 'churn_rate',
  
  // Revenue
  'total_revenue': 'revenue',
  'net_revenue': 'revenue',
  'gross_revenue': 'revenue',
  
  // Costs
  'cost_of_goods_sold': 'cogs',
  'cost_of_sales': 'cogs',
  'cos': 'cogs',
  'cost_of_revenue': 'cogs',
  'operating_expenses': 'opex',
  'operational_expenses': 'opex',
  'total_opex': 'opex',
  
  // Profitability
  'adjusted_ebitda': 'ebitda',
  'ebitda_adjusted': 'ebitda',
  'gross_profit_margin': 'gross_margin',
  'gm': 'gross_margin',
  'gpm': 'gross_margin',
  'gross_income': 'gross_profit',
  'net_profit': 'net_income',
  'profit': 'net_income',
  'bottom_line': 'net_income',
  
  // ARPU
  'average_revenue_per_user': 'arpu',
  'revenue_per_user': 'arpu',
  'avg_revenue_per_customer': 'arpu',
  
  // LTV/CAC
  'lifetime_value': 'ltv',
  'customer_lifetime_value': 'ltv',
  'clv': 'ltv',
  'customer_acquisition_cost': 'cac',
  'acquisition_cost': 'cac',
};

// Known canonical names (for validation)
const CANONICAL_NAMES = new Set([
  // Revenue
  'arr', 'mrr', 'revenue', 'arpu', 'nrr', 'grr', 'acv', 'tcv', 'bookings', 'gmv', 'tpv',
  // Customers
  'customers', 'users', 'accounts', 'merchants', 'churn_rate', 'ltv', 'cac', 'payback_months',
  // Cash
  'cash_balance', 'runway_months', 'burn_rate', 'working_capital',
  // Costs
  'cogs', 'opex', 'capex', 'personnel_costs', 'marketing_spend', 'sales_costs',
  // Profitability
  'ebitda', 'ebit', 'gross_profit', 'gross_margin', 'net_income', 'contribution_margin',
  // Growth
  'mrr_growth_mom', 'arr_growth_yoy', 'revenue_growth_mom', 'customer_growth_mom',
]);

interface CanonicalizationResult {
  originalName: string;
  canonicalName: string;
  source: 'static' | 'database' | 'llm';
  confidence?: number;
  reasoning?: string;
  isNew: boolean;
}

let openaiClient: OpenAI | null = null;
let supabaseClient: SupabaseClient | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getSupabase(): SupabaseClient | null {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabaseClient = createClient(url, key);
    }
  }
  return supabaseClient;
}

/**
 * Normalize a line item name to snake_case
 */
function normalizeToSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Check if a name is already canonical or maps to a known canonical
 */
function getStaticCanonical(name: string): string | null {
  const normalized = normalizeToSnakeCase(name);
  
  // Already a canonical name
  if (CANONICAL_NAMES.has(normalized)) {
    return normalized;
  }
  
  // Check static mapping
  if (STATIC_MAPPINGS[normalized]) {
    return STATIC_MAPPINGS[normalized];
  }
  
  return null;
}

/**
 * Check database for existing mapping suggestion
 */
async function getDatabaseMapping(companyId: string, originalName: string): Promise<CanonicalizationResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  const normalized = normalizeToSnakeCase(originalName);
  
  const { data, error } = await supabase
    .from('line_item_mapping_suggestions')
    .select('*')
    .eq('company_id', companyId)
    .eq('original_name', normalized)
    .in('status', ['approved', 'auto_approved'])
    .single();
  
  if (error || !data) return null;
  
  return {
    originalName: normalized,
    canonicalName: data.suggested_canonical,
    source: 'database',
    confidence: data.confidence,
    reasoning: data.reasoning,
    isNew: false
  };
}

/**
 * Call LLM to suggest a canonical name for an unknown line item
 */
async function getLLMSuggestion(
  originalName: string,
  context?: { companyName?: string; otherMetrics?: string[] }
): Promise<{ canonical: string; confidence: number; reasoning: string } | null> {
  try {
    const openai = getOpenAI();
    
    const systemPrompt = `You are a financial metrics expert. Given a line item name from a financial report, suggest the most appropriate canonical metric ID.

Available canonical metrics:
- Revenue: arr, mrr, revenue, arpu, nrr, grr, acv, tcv, bookings, gmv, tpv
- Customers: customers, users, accounts, merchants, churn_rate, ltv, cac, payback_months
- Cash: cash_balance, runway_months, burn_rate, working_capital
- Costs: cogs, opex, capex, personnel_costs, marketing_spend, sales_costs
- Profitability: ebitda, ebit, gross_profit, gross_margin, net_income, contribution_margin
- Growth: mrr_growth_mom, arr_growth_yoy, revenue_growth_mom, customer_growth_mom

If the metric is a subcategory (e.g., "Customers Factoring Private"), use format: {canonical}_{subcategory}
Example: "Customers Factoring Private" → "customers_factoring_private" (keeps detail but maps to customers category)

Respond with JSON: {"canonical": "metric_id", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

    const userPrompt = `Line item to canonicalize: "${originalName}"
${context?.companyName ? `Company: ${context.companyName}` : ''}
${context?.otherMetrics?.length ? `Other metrics in same file: ${context.otherMetrics.slice(0, 10).join(', ')}` : ''}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 200
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const result = JSON.parse(content);
    return {
      canonical: normalizeToSnakeCase(result.canonical || originalName),
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || ''
    };
  } catch (err) {
    console.error('[Canonicalizer] LLM error:', err);
    return null;
  }
}

/**
 * Store a new mapping suggestion in the database
 */
async function storeSuggestion(
  companyId: string,
  originalName: string,
  suggestedCanonical: string,
  confidence: number,
  reasoning: string,
  sourceFileId?: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  
  const normalized = normalizeToSnakeCase(originalName);
  
  // Auto-approve if confidence is high enough
  const status = confidence >= 0.9 ? 'auto_approved' : 'pending';
  
  const { error } = await supabase
    .from('line_item_mapping_suggestions')
    .upsert({
      company_id: companyId,
      original_name: normalized,
      suggested_canonical: suggestedCanonical,
      confidence,
      reasoning,
      status,
      source_file_id: sourceFileId
    }, {
      onConflict: 'company_id,original_name',
      ignoreDuplicates: false
    });
  
  if (error) {
    console.error('[Canonicalizer] Failed to store suggestion:', error);
  } else {
    console.log(`[Canonicalizer] Stored suggestion: ${normalized} → ${suggestedCanonical} (${status})`);
  }
}

/**
 * Main canonicalization function
 * 
 * @param lineItemName - Original line item name from extraction
 * @param companyId - UUID of the portfolio company
 * @param options - Additional context and options
 */
export async function canonicalizeLineItem(
  lineItemName: string,
  companyId: string,
  options?: {
    companyName?: string;
    otherMetrics?: string[];
    sourceFileId?: string;
    skipLLM?: boolean;
  }
): Promise<CanonicalizationResult> {
  const normalized = normalizeToSnakeCase(lineItemName);
  
  // 1. Check static mapping (fast path)
  const staticCanonical = getStaticCanonical(normalized);
  if (staticCanonical) {
    return {
      originalName: normalized,
      canonicalName: staticCanonical,
      source: 'static',
      confidence: 1.0,
      isNew: false
    };
  }
  
  // 2. Check database for existing approved mapping
  const dbMapping = await getDatabaseMapping(companyId, normalized);
  if (dbMapping) {
    return dbMapping;
  }
  
  // 3. If skipLLM, return as-is
  if (options?.skipLLM) {
    return {
      originalName: normalized,
      canonicalName: normalized,
      source: 'static',
      confidence: 0.5,
      isNew: false
    };
  }
  
  // 4. Call LLM for suggestion
  const llmResult = await getLLMSuggestion(normalized, {
    companyName: options?.companyName,
    otherMetrics: options?.otherMetrics
  });
  
  if (llmResult) {
    // Store suggestion for review
    await storeSuggestion(
      companyId,
      normalized,
      llmResult.canonical,
      llmResult.confidence,
      llmResult.reasoning,
      options?.sourceFileId
    );
    
    return {
      originalName: normalized,
      canonicalName: llmResult.canonical,
      source: 'llm',
      confidence: llmResult.confidence,
      reasoning: llmResult.reasoning,
      isNew: true
    };
  }
  
  // 5. Fallback: return normalized original
  return {
    originalName: normalized,
    canonicalName: normalized,
    source: 'static',
    confidence: 0.3,
    isNew: false
  };
}

/**
 * Batch canonicalize multiple line items (more efficient)
 */
export async function canonicalizeLineItems(
  lineItemNames: string[],
  companyId: string,
  options?: {
    companyName?: string;
    sourceFileId?: string;
  }
): Promise<Map<string, CanonicalizationResult>> {
  const results = new Map<string, CanonicalizationResult>();
  const unknowns: string[] = [];
  
  // First pass: check static mappings
  for (const name of lineItemNames) {
    const normalized = normalizeToSnakeCase(name);
    const staticCanonical = getStaticCanonical(normalized);
    
    if (staticCanonical) {
      results.set(name, {
        originalName: normalized,
        canonicalName: staticCanonical,
        source: 'static',
        confidence: 1.0,
        isNew: false
      });
    } else {
      unknowns.push(name);
    }
  }
  
  // Second pass: check database for unknowns
  const stillUnknown: string[] = [];
  for (const name of unknowns) {
    const dbMapping = await getDatabaseMapping(companyId, name);
    if (dbMapping) {
      results.set(name, dbMapping);
    } else {
      stillUnknown.push(name);
    }
  }
  
  // Third pass: LLM for remaining unknowns
  if (stillUnknown.length > 0) {
    const knownMetrics = Array.from(results.values()).map(r => r.canonicalName);
    
    for (const name of stillUnknown) {
      const result = await canonicalizeLineItem(name, companyId, {
        companyName: options?.companyName,
        otherMetrics: [...knownMetrics, ...stillUnknown.filter(n => n !== name)],
        sourceFileId: options?.sourceFileId
      });
      results.set(name, result);
    }
  }
  
  return results;
}

/**
 * Get pending suggestions for a company (for review UI)
 */
export async function getPendingSuggestions(companyId: string): Promise<any[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('line_item_mapping_suggestions')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Canonicalizer] Failed to get pending suggestions:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Update suggestion status (approve/reject)
 */
export async function updateSuggestionStatus(
  suggestionId: string,
  status: 'approved' | 'rejected',
  reviewedBy?: string,
  updatedCanonical?: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  const updateData: any = {
    status,
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString()
  };
  
  if (updatedCanonical) {
    updateData.suggested_canonical = updatedCanonical;
  }
  
  const { error } = await supabase
    .from('line_item_mapping_suggestions')
    .update(updateData)
    .eq('id', suggestionId);
  
  if (error) {
    console.error('[Canonicalizer] Failed to update suggestion:', error);
    return false;
  }
  
  return true;
}
