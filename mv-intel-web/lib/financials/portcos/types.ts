export interface PortcoMetadata {
  name: string;
  currency: string;
  fiscal_year_end?: string;
  business_models: string[];
}

export interface SourceDocConfig {
  type: 'board_deck' | 'financials' | 'bank_export' | 'other';
  format: 'pdf' | 'xlsx' | 'csv' | 'txt';
  pattern: string;
  frequency?: string;
}

export interface LineItemMapping {
  source: string; // e.g. "financials"
  sheet?: string;
  range_start?: string; // e.g. "B5"
  label_match?: string; // e.g. "Subscription Revenue"
  // For CSV or flat files maybe column names
  column?: string;
}

export interface MappingRules {
  line_items: Record<string, LineItemMapping>;
}

export interface BusinessLogicOverride {
  metric_id: string;
  note: string;
  custom_formula?: string;
}

export interface ValidationRule {
  check: string; // e.g. "revenue_recurring + revenue_services == revenue_total"
  tolerance?: number;
}

export interface PortcoGuide {
  company_metadata: PortcoMetadata;
  source_docs: SourceDocConfig[];
  mapping_rules: MappingRules;
  business_logic_overrides?: BusinessLogicOverride[];
  validation_rules?: ValidationRule[];
}



