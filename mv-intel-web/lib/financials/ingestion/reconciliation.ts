import { LocalFactRecord, ChangeLogEntry as StorageChangeLogEntry } from '../local/storage';
import { VarianceExplanation } from './unified_extractor';

// Re-export for convenience
export type ChangeLogEntry = StorageChangeLogEntry;

export interface ConflictEntry {
  metric_id: string;
  period: string;
  scenario: string;
  existingValue: number;
  newValue: number;
  existingSource: string;
  newSource: string;
  existingExplanation?: string;
  newExplanation?: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: 'use_new' | 'keep_existing' | 'manual_review';
}

export interface ReconciliationResult {
  finalFacts: LocalFactRecord[]; // The consolidated list of facts to save
  changes: ChangeLogEntry[];     // Log of what changed
  conflicts: ConflictEntry[];    // Unresolved conflicts
  summary: {
    inserted: number;
    updated: number;
    ignored: number;
    conflicts: number;
  };
}

// Priority Definitions (Higher is better)
const PRIORITY_MAP: Record<string, number> = {
  'board_deck': 100,
  'investor_report': 80,
  'budget_file': 60,
  'financial_model': 40,
  'raw_export': 20,
  'unknown': 10
};

// Explanation types that should boost priority (these indicate authoritative corrections)
const PRIORITY_BOOST_EXPLANATIONS: Record<string, number> = {
  'restatement': 50,    // Restatements are highly authoritative
  'correction': 40,     // Corrections should override
  'one_time': 10,       // One-time items are informational
  'forecast_revision': 20, // Forecast updates are moderately important
  'commentary': 0,      // Commentary doesn't change priority
  'other': 0
};

/**
 * Determine file priority based on filename patterns
 */
export function getFilePriority(filename: string, scenario: string): number {
  const lowerName = filename.toLowerCase();
  
  // Board Decks are gold standard for Actuals
  if (lowerName.includes('board') || lowerName.includes('deck') || lowerName.includes('presentation')) {
    return PRIORITY_MAP['board_deck'];
  }
  
  // Investor Reports are next best for Actuals
  if (lowerName.includes('investor') || lowerName.includes('report') || lowerName.includes('monthly')) {
    return PRIORITY_MAP['investor_report'];
  }
  
  // Budget files are gold standard for Budget scenario
  if (lowerName.includes('budget') || lowerName.includes('plan') || lowerName.includes('forecast')) {
    if (scenario === 'budget') return 120; // Higher than board deck for budget numbers
    return PRIORITY_MAP['budget_file'];
  }
  
  if (lowerName.includes('model') || lowerName.includes('financials')) {
    return PRIORITY_MAP['financial_model'];
  }
  
  return PRIORITY_MAP['unknown'];
}

/**
 * Calculate priority boost from variance explanation
 * Restatements and corrections can elevate a lower-priority file
 */
export function getExplanationPriorityBoost(explanation?: VarianceExplanation): number {
  if (!explanation) return 0;
  return PRIORITY_BOOST_EXPLANATIONS[explanation.explanation_type] || 0;
}

/**
 * Detect file type from filename for categorization
 */
export function detectFileType(filename: string): string {
  const lowerName = filename.toLowerCase();
  
  if (lowerName.includes('board') || lowerName.includes('deck')) return 'board_deck';
  if (lowerName.includes('investor') || lowerName.includes('report')) return 'investor_report';
  if (lowerName.includes('budget') || lowerName.includes('plan') || lowerName.includes('forecast')) return 'budget_file';
  if (lowerName.includes('model') || lowerName.includes('financials')) return 'financial_model';
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) return 'raw_export';
  
  return 'unknown';
}

/**
 * Reconcile new facts against existing facts
 * 
 * Priority Logic:
 * 1. Base priority from file type (Board Deck > Investor Report > Budget File > etc.)
 * 2. Explanation boost: Restatements/Corrections can elevate priority
 * 3. Scenario-specific: Budget files get higher priority for budget scenario
 * 
 * Decision Matrix:
 * - New Priority > Existing Priority → Update (overwrite)
 * - New Priority < Existing Priority → Ignore (keep existing)
 * - Equal Priority + Explanation → Use explanation to decide
 * - Equal Priority + No Explanation + >1% variance → Flag conflict
 */
export function reconcileFacts(
  newFacts: LocalFactRecord[],
  existingFacts: LocalFactRecord[],
  explanations?: VarianceExplanation[]
): ReconciliationResult {
  const finalFactsMap = new Map<string, LocalFactRecord>();
  const changes: ChangeLogEntry[] = [];
  const conflicts: ConflictEntry[] = [];
  
  let inserted = 0, updated = 0, ignored = 0;
  
  // Build explanation lookup
  const explanationMap = new Map<string, VarianceExplanation>();
  if (explanations) {
    for (const exp of explanations) {
      explanationMap.set(exp.metric_id, exp);
    }
  }
  
  // Index existing facts
  // Key: line_item_id + period + scenario
  for (const fact of existingFacts) {
    const key = `${fact.line_item_id}|${fact.date}|${fact.scenario}`;
    finalFactsMap.set(key, fact);
  }
  
  // Process new facts
  for (const newFact of newFacts) {
    const key = `${newFact.line_item_id}|${newFact.date}|${newFact.scenario}`;
    const existingFact = finalFactsMap.get(key);
    
    // Get explanation for this metric (if any)
    const explanation = explanationMap.get(newFact.line_item_id);
    const explanationBoost = getExplanationPriorityBoost(explanation);
    
    // Calculate effective priority
    const basePriority = getFilePriority(newFact.source_file, newFact.scenario);
    const newEffectivePriority = basePriority + explanationBoost;
    
    // Attach explanation to fact for storage
    const enrichedNewFact: LocalFactRecord = {
      ...newFact,
      priority: newEffectivePriority,
      explanation: explanation?.explanation,
      snippet_url: newFact.snippet_url
    };
    
    if (!existingFact) {
      // New Data (Insert)
      // Initialize changelog
      enrichedNewFact.changelog = [{
        timestamp: new Date().toISOString(),
        oldValue: null,
        newValue: newFact.amount,
        reason: 'Initial import',
        source_file: newFact.source_file,
        explanation: explanation?.explanation,
        view_source_url: newFact.snippet_url
      }];
      
      finalFactsMap.set(key, enrichedNewFact);
      changes.push({
        timestamp: new Date().toISOString(),
        oldValue: null,
        newValue: newFact.amount,
        reason: 'New Data',
        source_file: newFact.source_file,
        explanation: explanation?.explanation,
        view_source_url: newFact.snippet_url
      });
      inserted++;
      continue;
    }
    
    // Values are the same - no action needed
    if (existingFact.amount === newFact.amount) {
      continue;
    }
    
    // Calculate existing effective priority
    const existingBasePriority = existingFact.priority || getFilePriority(existingFact.source_file, existingFact.scenario);
    const existingEffectivePriority = existingBasePriority;
    
    // Decision logic
    let shouldUpdate = false;
    let reason = '';
    let conflictSeverity: 'high' | 'medium' | 'low' | null = null;
    
    if (newEffectivePriority > existingEffectivePriority) {
      // Higher priority wins
      shouldUpdate = true;
      if (explanationBoost > 0) {
        reason = `${explanation?.explanation_type?.toUpperCase() || 'EXPLANATION'} from ${detectFileType(newFact.source_file)} (priority ${newEffectivePriority} > ${existingEffectivePriority})`;
      } else {
        reason = `Higher Priority Source: ${detectFileType(newFact.source_file)} (${newEffectivePriority} > ${existingEffectivePriority})`;
      }
    } else if (newEffectivePriority < existingEffectivePriority) {
      // Lower priority - ignore but log if there's an explanation
      shouldUpdate = false;
      ignored++;
      
      // If the lower-priority file has an explanation, flag it as informational
      if (explanation) {
        conflictSeverity = 'low';
        reason = `Lower priority but has explanation: ${explanation.explanation}`;
      }
    } else {
      // Equal priority - need tie-breaker
      const variance = existingFact.amount !== 0 
        ? Math.abs((newFact.amount - existingFact.amount) / existingFact.amount)
        : 1; // If existing is 0, treat any change as significant
      
      if (variance > 0.01) { // > 1% difference
        // Check if new fact has explanation (gives it edge)
        if (explanation && (explanation.explanation_type === 'restatement' || explanation.explanation_type === 'correction')) {
          shouldUpdate = true;
          reason = `Equal priority but ${explanation.explanation_type.toUpperCase()} takes precedence`;
          conflictSeverity = 'medium'; // Still flag for visibility
        } else {
          // Significant variance without explanation - flag conflict
          shouldUpdate = true; // Optimistic update (newest wins)
          reason = 'Equal Priority - Newest file (NEEDS REVIEW)';
          conflictSeverity = 'high';
        }
      } else {
        // Minor difference (likely rounding), update silently
        shouldUpdate = true;
        reason = 'Minor update (rounding)';
      }
    }
    
    if (shouldUpdate) {
      // Preserve changelog history
      const existingChangelog = existingFact.changelog || [];
      enrichedNewFact.changelog = [
        ...existingChangelog,
        {
          timestamp: new Date().toISOString(),
          oldValue: existingFact.amount,
          newValue: newFact.amount,
          reason,
          source_file: newFact.source_file,
          explanation: explanation?.explanation,
          view_source_url: newFact.snippet_url
        }
      ];
      
      finalFactsMap.set(key, enrichedNewFact);
      changes.push({
        timestamp: new Date().toISOString(),
        oldValue: existingFact.amount,
        newValue: newFact.amount,
        reason,
        source_file: newFact.source_file,
        explanation: explanation?.explanation,
        view_source_url: newFact.snippet_url
      });
      updated++;
    }
    
    // Record conflict if flagged
    if (conflictSeverity) {
      conflicts.push({
        metric_id: newFact.line_item_id,
        period: newFact.date,
        scenario: newFact.scenario,
        existingValue: existingFact.amount,
        newValue: newFact.amount,
        existingSource: existingFact.source_file,
        newSource: newFact.source_file,
        existingExplanation: existingFact.explanation,
        newExplanation: explanation?.explanation,
        severity: conflictSeverity,
        recommendation: conflictSeverity === 'high' ? 'manual_review' : 
                       conflictSeverity === 'medium' ? 'use_new' : 'keep_existing'
      });
    }
  }
  
  return {
    finalFacts: Array.from(finalFactsMap.values()),
    changes,
    conflicts,
    summary: {
      inserted,
      updated,
      ignored,
      conflicts: conflicts.length
    }
  };
}

