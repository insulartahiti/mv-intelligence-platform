
-- Fix Nelly Solutions visibility
-- The merge preserved 'Nelly Solutions' but it might not have been marked as a portfolio company.
-- We explicitly set it to true.

UPDATE graph.entities 
SET is_portfolio = true 
WHERE name ILIKE 'Nelly Solutions';

