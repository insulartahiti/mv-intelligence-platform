import { createClient } from '@supabase/supabase-js';
import { loadCommonMetrics, getMetricById } from './loader';
import { MetricDefinition } from './types';

// Simple type for our input dictionary
type FinancialInputs = Record<string, number>;

/**
 * Safe evaluator for simple math formulas.
 * Uses Function constructor but with restricted scope variables.
 */
function evaluateFormula(formula: string, inputs: FinancialInputs): number | null {
  try {
    const args = Object.keys(inputs);
    const values = Object.values(inputs);
    // Create a function that takes the input keys as arguments and returns the result of the formula
    const func = new Function(...args, `return ${formula};`);
    const result = func(...values);
    
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      return null;
    }
    return result;
  } catch (error) {
    // console.warn(`Formula evaluation failed for: ${formula}`, error);
    return null;
  }
}

interface ComputedMetricResult {
  metric_id: string;
  value: number;
  period: string; // YYYY-MM-DD
  inputs: FinancialInputs;
  calculation_version: string;
}

/**
 * Computes metrics for a company based on their normalized financial data.
 * @param companyId The UUID of the company
 * @param period The date string for the period start (e.g. '2023-10-01')
 * @param facts A dictionary of line_item_id -> amount for this period
 */
export function computeMetricsForPeriod(
  companyId: string,
  period: string,
  facts: Record<string, number>
): ComputedMetricResult[] {
  const allMetrics = loadCommonMetrics();
  const results: ComputedMetricResult[] = [];

  for (const metric of allMetrics) {
    // 1. Check if we have all required inputs
    const requiredInputs = metric.inputs;
    const availableInputs: FinancialInputs = {};
    let missingInput = false;

    for (const inputKey of requiredInputs) {
      if (facts[inputKey] === undefined) {
        // We could treat missing as 0, but usually for strict financial metrics, missing input = null result
        missingInput = true;
        break;
      }
      availableInputs[inputKey] = facts[inputKey];
    }

    if (missingInput) continue;

    // 2. Evaluate
    const value = evaluateFormula(metric.formula, availableInputs);

    if (value !== null) {
      results.push({
        metric_id: metric.id,
        value,
        period,
        inputs: availableInputs,
        calculation_version: '1.0'
      });
    }
  }

  return results;
}

/**
 * Persists computed metrics to Supabase.
 */
export async function saveMetricsToDb(
  results: ComputedMetricResult[],
  companyId: string,
  supabaseClient: any
) {
  if (results.length === 0) return;

  const rows = results.map(r => ({
    company_id: companyId,
    period: r.period,
    metric_id: r.metric_id,
    value: r.value,
    inputs: r.inputs,
    calculation_version: r.calculation_version,
    created_at: new Date().toISOString()
  }));

  const { error } = await supabaseClient
    .from('fact_metrics')
    // Use explicit constraint name for robust upsert behavior
    .upsert(rows, { onConflict: 'fact_metrics_company_period_metric_key' });

  if (error) {
    console.error('Error saving metrics to DB:', error);
    throw error;
  }
}


