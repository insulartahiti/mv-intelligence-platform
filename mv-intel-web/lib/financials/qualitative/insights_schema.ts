/**
 * Qualitative Insights Schema
 * 
 * Captures narrative/qualitative information from portfolio company documents
 * that supplements the quantitative financial data.
 * 
 * This is designed to be:
 * - Standardized across all portfolio companies
 * - Auditable (linked to source documents)
 * - Temporally versioned (tracks changes over time)
 */

export interface CompanyInsight {
  id: string;
  company_id: string;
  period: string;  // YYYY-MM or YYYY-QN
  category: InsightCategory;
  title: string;
  content: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;  // 0-1 scale from LLM
  source_file_id?: string;
  source_location?: {
    page?: number;
    section?: string;
    slide_number?: number;
  };
  extracted_at: string;
  extracted_by: 'llm' | 'manual';
  llm_model?: string;
}

export type InsightCategory = 
  | 'key_highlight'        // Major achievements, milestones
  | 'risk_factor'          // Identified risks or concerns
  | 'strategic_initiative' // New projects, pivots, expansions
  | 'market_observation'   // Industry trends, competitive landscape
  | 'management_commentary'// CEO/CFO narrative
  | 'customer_update'      // Customer wins, churn, feedback
  | 'product_update'       // New features, roadmap items
  | 'team_update'          // Hiring, departures, org changes
  | 'fundraising'          // Capital raises, runway
  | 'regulatory'           // Compliance, legal matters
  | 'other';

export const INSIGHT_CATEGORIES: Record<InsightCategory, { label: string; description: string }> = {
  key_highlight: {
    label: 'Key Highlight',
    description: 'Major achievements, milestones, or positive developments'
  },
  risk_factor: {
    label: 'Risk Factor',
    description: 'Identified risks, concerns, or challenges'
  },
  strategic_initiative: {
    label: 'Strategic Initiative',
    description: 'New projects, pivots, market expansions, or strategic changes'
  },
  market_observation: {
    label: 'Market Observation',
    description: 'Industry trends, competitive landscape, market dynamics'
  },
  management_commentary: {
    label: 'Management Commentary',
    description: 'CEO/CFO narrative, outlook, or strategic vision'
  },
  customer_update: {
    label: 'Customer Update',
    description: 'Customer wins, churn, NPS, feedback, or case studies'
  },
  product_update: {
    label: 'Product Update',
    description: 'New features, roadmap items, technical milestones'
  },
  team_update: {
    label: 'Team Update',
    description: 'Hiring, departures, organizational changes'
  },
  fundraising: {
    label: 'Fundraising',
    description: 'Capital raises, runway, investor updates'
  },
  regulatory: {
    label: 'Regulatory',
    description: 'Compliance, legal matters, regulatory changes'
  },
  other: {
    label: 'Other',
    description: 'Miscellaneous insights not fitting other categories'
  }
};

/**
 * Prompt template for LLM insight extraction
 */
export const INSIGHT_EXTRACTION_PROMPT = `You are analyzing a portfolio company document (board deck, financial report, or investor update).

Extract structured qualitative insights from the following text. For each insight, provide:
- category: One of: key_highlight, risk_factor, strategic_initiative, market_observation, management_commentary, customer_update, product_update, team_update, fundraising, regulatory, other
- title: A brief (5-10 word) title summarizing the insight
- content: The full insight text (1-3 sentences)
- sentiment: positive, neutral, negative, or mixed
- confidence: Your confidence in this extraction (0.0-1.0)

Return a JSON array of insights. Focus on actionable, investment-relevant information.

Document text:
{document_text}

Return only valid JSON array, no markdown formatting.`;

/**
 * Prompt template for period extraction from filename/content
 */
export const PERIOD_EXTRACTION_PROMPT = `Extract the reporting period from this financial document.

Filename: {filename}
First 500 characters of content: {content_preview}

Determine:
1. The period type: 'month', 'quarter', or 'year'
2. The period start date in YYYY-MM-DD format (first day of the period)

Examples:
- "Q3 2024" → { "period_type": "quarter", "period_date": "2024-07-01" }
- "September 2024" → { "period_type": "month", "period_date": "2024-09-01" }
- "FY2024" → { "period_type": "year", "period_date": "2024-01-01" }

If you cannot determine the period, return { "period_type": "unknown", "period_date": null }

Return only valid JSON, no markdown formatting.`;

