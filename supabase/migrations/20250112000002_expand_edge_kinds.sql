-- Expand the edges_kind_check constraint to allow more relationship types
-- This enables comprehensive relationship extraction from Affinity data

-- Drop the existing constraint
ALTER TABLE graph.edges DROP CONSTRAINT IF EXISTS edges_kind_check;

-- Add the new constraint with expanded relationship types
ALTER TABLE graph.edges ADD CONSTRAINT edges_kind_check 
CHECK (kind IN (
  'colleague',           -- Peer relationships
  'contact',             -- General contact relationships
  'deal_team',           -- Deal team members
  'founder',             -- Founder relationships (CRITICAL)
  'owner',               -- Ownership relationships
  'works_at',            -- Employment relationships
  'introduced_by',       -- Introduction relationships
  'invests_in',          -- Investment relationships
  'portfolio_company_of', -- Portfolio company relationships
  'manages_fund',        -- Fund management relationships
  'advisor',             -- Advisory relationships
  'board_member',        -- Board relationships
  'investor',            -- Investor relationships
  'mentor',              -- Mentorship relationships
  'partner',             -- Partnership relationships
  'supplier',            -- Supplier relationships
  'customer',            -- Customer relationships
  'competitor',          -- Competitor relationships
  'acquired_by',         -- Acquisition relationships
  'acquired'             -- Acquisition relationships (reverse)
));

-- Add a comment explaining the relationship types
COMMENT ON CONSTRAINT edges_kind_check ON graph.edges IS 
'Defines allowed relationship types for the knowledge graph. Includes professional, business, and investment relationships.';




