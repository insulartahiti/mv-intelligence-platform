import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PortcoGuide, PortcoMetadata, MappingRules } from './types';

// Try multiple possible locations for the portcos directory
// This handles differences between local dev, Vercel, and other environments
function getPortcosDir(): string {
  const candidates = [
    path.join(process.cwd(), 'lib/financials/portcos'),           // Local dev (Next.js)
    path.join(process.cwd(), 'mv-intel-web/lib/financials/portcos'), // If running from repo root
    path.join(__dirname, '.'),                                      // Relative to this file
  ];
  
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  
  // Default to first candidate (will fail with descriptive error if not found)
  return candidates[0];
}

const PORTCOS_DIR = getPortcosDir();

/**
 * Normalizes different YAML guide formats into the standard PortcoGuide interface.
 * Supports both:
 * - Standard format: { company_metadata, mapping_rules, source_docs }
 * - Extended format (Nelly-style): { company, metrics_mapping, document_structure, ... }
 */
function normalizeGuide(rawGuide: any): PortcoGuide {
  // Handle company_metadata vs company
  let company_metadata: PortcoMetadata;
  if (rawGuide.company_metadata) {
    company_metadata = rawGuide.company_metadata;
  } else if (rawGuide.company) {
    // Nelly-style format: company: { name, currency, business_models, ... }
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

  // Handle mapping_rules vs metrics_mapping/document_structure
  let mapping_rules: MappingRules = { line_items: {} };
  
  if (rawGuide.mapping_rules?.line_items) {
    // Standard format
    mapping_rules = rawGuide.mapping_rules;
  } else if (rawGuide.document_structure || rawGuide.metrics_mapping) {
    // Nelly-style format: Extract line_items from document_structure tables
    // Build mapping from document_structure.*.kpi_tables.*.metric_rows
    const lineItems: Record<string, any> = {};
    
    // Extract from document_structure
    if (rawGuide.document_structure) {
      for (const [templateKey, template] of Object.entries(rawGuide.document_structure as Record<string, any>)) {
        if (template && typeof template === 'object') {
          // Handle kpi_tables structure
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
          // Handle direct metrics like key_operating_metrics
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
    
    // Also extract from line_item_mapping if present
    if (rawGuide.line_item_mapping) {
      for (const [lineItemId, config] of Object.entries(rawGuide.line_item_mapping as Record<string, any>)) {
        if (config?.patterns) {
          lineItems[lineItemId] = {
            source: 'pdf',
            label_match: config.patterns[0], // Use first pattern as primary
            patterns: config.patterns
          };
        }
      }
    }
    
    mapping_rules = { line_items: lineItems };
  }

  // Handle source_docs - normalize different formats
  let source_docs = rawGuide.source_docs || [];
  // The Nelly format has more detailed source_docs that are compatible

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
  
  if (!fs.existsSync(guidePath)) {
    throw new Error(`Guide not found for portco: ${slug} at ${guidePath}`);
  }

  try {
    const fileContent = fs.readFileSync(guidePath, 'utf-8');
    const rawGuide = yaml.load(fileContent) as any;
    return normalizeGuide(rawGuide);
  } catch (error) {
    console.error(`Failed to load guide for ${slug}:`, error);
    throw new Error(`Invalid YAML guide for ${slug}`);
  }
}

export function listConfiguredPortcos(): string[] {
  if (!fs.existsSync(PORTCOS_DIR)) return [];
  
  return fs.readdirSync(PORTCOS_DIR).filter(file => {
    return fs.statSync(path.join(PORTCOS_DIR, file)).isDirectory();
  });
}


