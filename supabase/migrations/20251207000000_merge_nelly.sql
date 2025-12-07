
-- Merge duplicate 'Nelly' entity into 'Nelly Solutions'
-- Handles re-linking of foreign keys for financial and legal data

DO $$
DECLARE
  keep_id UUID;
  merge_id UUID;
BEGIN
  -- 1. Identify the Keeper (Nelly Solutions)
  SELECT id INTO keep_id 
  FROM graph.entities 
  WHERE name ILIKE 'Nelly Solutions' 
  LIMIT 1;

  -- 2. Identify the Duplicate (Nelly)
  -- We exclude 'Nelly Solutions' explicitly to match just 'Nelly'
  SELECT id INTO merge_id 
  FROM graph.entities 
  WHERE name ILIKE 'Nelly' 
  AND name NOT ILIKE 'Nelly Solutions' 
  LIMIT 1;

  RAISE NOTICE 'Keeper ID: %, Merge ID: %', keep_id, merge_id;

  IF keep_id IS NOT NULL AND merge_id IS NOT NULL THEN
    
    -- 3. Update references in related tables
    
    -- Legal Analyses
    UPDATE legal_analyses SET company_id = keep_id WHERE company_id = merge_id;
    
    -- Portfolio Guides (handle unique constraint)
    BEGIN
        UPDATE portfolio_guides SET company_id = keep_id WHERE company_id = merge_id;
    EXCEPTION WHEN unique_violation THEN
        -- If keeper already has a guide, delete the duplicate's guide (or we could manually merge YAML content, but simpler to drop)
        RAISE NOTICE 'Guide conflict: dropping guide for merge_id';
        DELETE FROM portfolio_guides WHERE company_id = merge_id;
    END;

    -- Financial Facts
    UPDATE fact_financials SET company_id = keep_id WHERE company_id = merge_id;
    
    -- Metrics
    UPDATE fact_metrics SET company_id = keep_id WHERE company_id = merge_id;
    
    -- Source Files
    UPDATE dim_source_files SET company_id = keep_id WHERE company_id = merge_id;
    
    -- Insights
    UPDATE company_insights SET company_id = keep_id WHERE company_id = merge_id;

    -- 4. Delete the duplicate entity
    DELETE FROM graph.entities WHERE id = merge_id;
    
    RAISE NOTICE 'Successfully merged Nelly into Nelly Solutions';
    
  ELSE
    RAISE NOTICE 'Skipping merge: One or both entities not found';
  END IF;
END $$;

