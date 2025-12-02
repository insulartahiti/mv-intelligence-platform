-- Company Insights Table for Qualitative Data
-- Captures narrative/qualitative information from portfolio company documents

create table if not exists company_insights (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) not null,
    period text not null,  -- YYYY-MM or YYYY-QN format
    
    -- Insight content
    category text not null,  -- key_highlight, risk_factor, strategic_initiative, etc.
    title text not null,
    content text not null,
    sentiment text,  -- positive, neutral, negative, mixed
    
    -- Extraction metadata
    confidence numeric default 0.8,
    extracted_by text default 'llm',  -- 'llm' or 'manual'
    llm_model text,
    
    -- Audit trail
    source_file_id uuid references dim_source_files(id),
    source_location jsonb,  -- { page: 5, section: "CEO Letter", slide_number: 3 }
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists idx_company_insights_company on company_insights(company_id);
create index if not exists idx_company_insights_period on company_insights(company_id, period);
create index if not exists idx_company_insights_category on company_insights(category);

-- Add period_type to fact_financials if not exists
-- This helps distinguish monthly vs quarterly vs annual data
alter table fact_financials 
add column if not exists period_type text default 'month';

-- Add extraction metadata to fact_financials
alter table fact_financials
add column if not exists extracted_by text default 'rule';  -- 'rule', 'llm', 'manual'

alter table fact_financials
add column if not exists extraction_confidence numeric default 1.0;

-- Comments for documentation
comment on table company_insights is 'Qualitative insights extracted from portfolio company documents (board decks, reports)';
comment on column company_insights.category is 'Insight type: key_highlight, risk_factor, strategic_initiative, market_observation, management_commentary, customer_update, product_update, team_update, fundraising, regulatory, other';
comment on column company_insights.sentiment is 'Sentiment classification: positive, neutral, negative, mixed';
comment on column company_insights.confidence is 'LLM confidence score (0-1) for automated extractions';

