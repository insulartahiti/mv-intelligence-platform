import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PortcoGuide, PortcoMetadata, MappingRules } from './types';

// Embedded Nelly guide for serverless environments where YAML files aren't bundled
const NELLY_GUIDE_EMBEDDED = {
  company: {
    name: "Nelly Solutions GmbH",
    slug: "nelly",
    business_models: ["saas", "factoring_private", "factoring_public", "pos"],
    currency: "EUR",
    fiscal_year_end_month: 12
  },
  metrics_mapping: {
    total_actual_mrr: { labels: ["Total actual MRR"], unit: "EUR_k" },
    actual_saas_mrr: { labels: ["Actual SaaS MRR"], unit: "EUR_k" },
    actual_finos_mrr: { labels: ["Actual FinOS MRR"], unit: "EUR_k" },
    total_booked_revenue: { labels: ["Booked revenue Total"], unit: "EUR_m" },
    saas_customers: { labels: ["SaaS Customers"], unit: "count" },
    private_factoring_customers: { labels: ["Priv. Factoring Customers*"], unit: "count" },
    pos_customers: { labels: ["POS Customers"], unit: "count" },
    monthly_burn_net: { labels: ["Monthly burn (net)"], unit: "EUR_m" },
    cash_balance_os: { labels: ["Cash balance"], unit: "EUR_m" },
    runway_months: { labels: ["Runway*"], unit: "months" },
    total_employees_fte: { labels: ["Total employees (FTEs)"], unit: "count" },
    intl_actual_mrr: { labels: ["Total MRR/MR", "Actual MRR"], unit: "EUR_k" }
  },
  line_item_mapping: {
    revenue_total: { patterns: ["Total Revenue", "Total actual revenue"] },
    revenue_saas: { patterns: ["SaaS", "SaaS Revenue"] },
    revenue_factoring_private: { patterns: ["Private Factoring"] },
    revenue_factoring_public: { patterns: ["Public Factoring"] },
    revenue_pos: { patterns: ["POS"] },
    cogs_total: { patterns: ["Cost of Sales", "COGS"] },
    ebitda: { patterns: ["EBITDA", "Operating result"] }
  },
  document_structure: {
    monthly_investor_report_template_2025: {
      kpi_tables: {
        actual_and_booked_revenue: {
          anchor_text: ["Actual revenue KPIs", "Booked revenue KPIs"],
          metric_rows: {
            total_actual_mrr: "Total actual MRR",
            actual_saas_mrr: "Actual SaaS MRR",
            actual_finos_mrr: "Actual FinOS MRR",
            total_booked_revenue: "Booked revenue Total",
            total_actual_revenue: "Total actual revenue"
          }
        },
        other_kpis: {
          anchor_text: ["Other KPIs"],
          metric_rows: {
            saas_customers: "SaaS Customers",
            private_factoring_customers: "Priv. Factoring Customers*",
            public_factoring_customers: "Pub. Factoring Customers",
            pos_customers: "POS Customers",
            total_employees_fte: "Total employees (FTEs)"
          }
        },
        financials: {
          anchor_text: ["Nelly Solutions GmbH", "Nelly Finance GmbH"],
          metric_rows: {
            monthly_burn_net: "Monthly burn (net)",
            cash_balance_os: "Cash balance",
            runway_months: "Runway*"
          }
        }
      }
    }
  }
};

// Try multiple possible locations for the portcos directory
function getPortcosDir(): string {
  const candidates = [
    path.join(process.cwd(), 'lib/financials/portcos'),
    path.join(process.cwd(), 'mv-intel-web/lib/financials/portcos'),
  ];
  
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        // Verify we can actually read from it
        const testPath = path.join(dir, 'nelly', 'guide.yaml');
        if (fs.existsSync(testPath)) {
          return dir;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }
  
  return candidates[0]; // Will use embedded fallback
}

const PORTCOS_DIR = getPortcosDir();

/**
 * Normalizes different YAML guide formats into the standard PortcoGuide interface.
 */
function normalizeGuide(rawGuide: any): PortcoGuide {
  let company_metadata: PortcoMetadata;
  if (rawGuide.company_metadata) {
    company_metadata = rawGuide.company_metadata;
  } else if (rawGuide.company) {
    company_metadata = {
      name: rawGuide.company.name,
      domain: rawGuide.company.domain || rawGuide.company.website,
      aliases: rawGuide.company.aliases || [],
      currency: rawGuide.company.currency || 'USD',
      fiscal_year_end: rawGuide.company.fiscal_year_end_month 
        ? `12-${String(rawGuide.company.fiscal_year_end_month).padStart(2, '0')}`
        : undefined,
      business_models: rawGuide.company.business_models || []
    };
  } else {
    throw new Error('Guide must have either company_metadata or company field');
  }

  let mapping_rules: MappingRules = { line_items: {} };
  
  if (rawGuide.mapping_rules?.line_items) {
    mapping_rules = rawGuide.mapping_rules;
  } else if (rawGuide.document_structure || rawGuide.metrics_mapping) {
    const lineItems: Record<string, any> = {};
    
    if (rawGuide.document_structure) {
      for (const [templateKey, template] of Object.entries(rawGuide.document_structure as Record<string, any>)) {
        if (template && typeof template === 'object') {
          if (template.kpi_tables) {
            for (const [tableKey, tableConfig] of Object.entries(template.kpi_tables as Record<string, any>)) {
              if (tableConfig?.metric_rows) {
                for (const [metricKey, label] of Object.entries(tableConfig.metric_rows)) {
                  lineItems[metricKey] = {
                    source: 'pdf',
                    label_match: label as string,
                    anchor_text: tableConfig.anchor_text,
                    table_key: tableKey
                  };
                }
              }
            }
          }
          if (template.metrics) {
            for (const [metricKey, label] of Object.entries(template.metrics as Record<string, any>)) {
              lineItems[metricKey] = {
                source: 'pdf',
                label_match: label as string,
                slide: template.slide
              };
            }
          }
        }
      }
    }
    
    if (rawGuide.line_item_mapping) {
      for (const [lineItemId, config] of Object.entries(rawGuide.line_item_mapping as Record<string, any>)) {
        if (config?.patterns) {
          lineItems[lineItemId] = {
            source: 'pdf',
            label_match: config.patterns[0],
            patterns: config.patterns
          };
        }
      }
    }
    
    mapping_rules = { line_items: lineItems };
  }

  let source_docs = rawGuide.source_docs || [];

  return {
    company_metadata,
    source_docs,
    mapping_rules,
    business_logic_overrides: rawGuide.business_logic_overrides || rawGuide.custom_logic?.definitions_overrides ? 
      Object.entries(rawGuide.custom_logic?.definitions_overrides || {}).map(([id, note]) => ({ metric_id: id, note: note as string })) : 
      undefined,
    validation_rules: rawGuide.validation_rules || rawGuide.data_quality_and_reconciliation?.checks?.map((c: any) => ({
      check: c.name,
      tolerance: 0.05
    }))
  };
}

export function loadPortcoGuide(slug: string): PortcoGuide {
  const guidePath = path.join(PORTCOS_DIR, slug, 'guide.yaml');
  
  // Try to load from filesystem first
  try {
    if (fs.existsSync(guidePath)) {
      const fileContent = fs.readFileSync(guidePath, 'utf-8');
      const rawGuide = yaml.load(fileContent) as any;
      console.log(`[Loader] Loaded guide from filesystem: ${guidePath}`);
      return normalizeGuide(rawGuide);
    }
  } catch (err) {
    console.warn(`[Loader] Failed to load guide from filesystem: ${err}`);
  }
  
  // Fallback to embedded guides for serverless environments
  if (slug === 'nelly') {
    console.log(`[Loader] Using embedded Nelly guide (filesystem not available)`);
    return normalizeGuide(NELLY_GUIDE_EMBEDDED);
  }
  
  throw new Error(`Guide not found for portco: ${slug}. Filesystem path tried: ${guidePath}`);
}

export function listConfiguredPortcos(): string[] {
  // Always include nelly since it's embedded
  const embedded = ['nelly'];
  
  try {
    if (fs.existsSync(PORTCOS_DIR)) {
      const fromFs = fs.readdirSync(PORTCOS_DIR).filter(file => {
        try {
          return fs.statSync(path.join(PORTCOS_DIR, file)).isDirectory();
        } catch {
          return false;
        }
      });
      return [...new Set([...embedded, ...fromFs])];
    }
  } catch {
    // Filesystem not available
  }
  
  return embedded;
}
