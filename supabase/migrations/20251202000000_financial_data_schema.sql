-- Financial Data Ingestion Schema

-- Dimension: Standardized Line Items (Accounts)
create table if not exists dim_line_item (
    id text primary key, -- e.g. 'revenue_recurring', 'cogs_total'
    name text not null,
    category text, -- 'Revenue', 'COGS', 'OpEx', 'Balance Sheet'
    description text,
    created_at timestamptz default now()
);

-- Dimension: Source Files (Track ingested files)
create table if not exists dim_source_files (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id),
    filename text not null,
    storage_path text, -- Path in blob storage
    file_type text, -- 'pdf', 'xlsx', 'csv'
    ingested_at timestamptz default now(),
    ingestion_status text default 'success', -- 'success', 'failed', 'pending_review'
    metadata jsonb -- Any extra file metadata
);

-- Fact: Financial Line Items (Raw normalized data)
create table if not exists fact_financials (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) not null,
    date date not null, -- First day of the period
    period_type text default 'month', -- 'month', 'quarter', 'year'
    scenario text default 'Actual', -- 'Actual', 'Budget', 'Forecast'
    
    line_item_id text references dim_line_item(id),
    amount numeric not null,
    currency text default 'USD',
    
    source_file_id uuid references dim_source_files(id),
    source_location jsonb, -- { sheet: "P&L", cell: "B5", page: 3, coordinates: [...] }
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Fact: Computed Metrics (KPIs)
create table if not exists fact_metrics (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) not null,
    period date not null, -- First day of period
    period_type text default 'month',
    
    metric_id text not null, -- e.g. 'arr_growth_yoy', matches common_metrics.json ID
    value numeric not null,
    unit text, -- 'percentage', 'usd', 'count', 'multiple'
    
    calculation_version text, -- e.g. 'v1.0'
    inputs jsonb, -- Snapshot of input values used { "arr_current": 100, "arr_last_year": 80 }
    
    created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_fact_financials_company_date on fact_financials(company_id, date);
create index if not exists idx_fact_metrics_company_period on fact_metrics(company_id, period);
create index if not exists idx_dim_source_files_company on dim_source_files(company_id);


