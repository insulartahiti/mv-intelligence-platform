
-- Add type column to portfolio_guides to support 'financial' and 'legal' guides
-- Default to 'financial' for existing records

ALTER TABLE portfolio_guides 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'financial';

-- Drop the existing unique constraint on company_id
ALTER TABLE portfolio_guides 
DROP CONSTRAINT IF EXISTS portfolio_guides_company_id_key;

-- Add new unique constraint on (company_id, type)
ALTER TABLE portfolio_guides 
ADD CONSTRAINT portfolio_guides_company_id_type_key UNIQUE (company_id, type);

-- Add constraint to check valid types
ALTER TABLE portfolio_guides 
ADD CONSTRAINT portfolio_guides_type_check CHECK (type IN ('financial', 'legal'));

-- Comment
COMMENT ON COLUMN portfolio_guides.type IS 'Type of guide: "financial" for ingestion mapping, "legal" for analysis preferences';

