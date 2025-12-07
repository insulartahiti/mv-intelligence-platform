
-- Rename Nelly Solutions to Nelly
UPDATE graph.entities 
SET name = 'Nelly' 
WHERE name = 'Nelly Solutions';

-- Update Nelly metadata to ensure it appears in the correct fund group
-- Nelly is a portfolio company in MVF2
UPDATE graph.entities
SET 
    fund = 'MVF2', 
    pipeline_stage = 'Portfolio MVF2'
WHERE name = 'Nelly' 
  AND is_portfolio = true 
  AND (fund IS NULL OR pipeline_stage IS NULL);
