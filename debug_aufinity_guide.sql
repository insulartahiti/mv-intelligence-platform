
-- Check for Aufinity entity and any associated guides
WITH aufinity AS (
  SELECT id, name, slug 
  FROM graph.entities 
  WHERE name ILIKE '%aufinity%' OR slug ILIKE '%aufinity%'
  LIMIT 1
)
SELECT 
  e.name as company_name,
  e.id as company_id,
  g.id as guide_id,
  g.type,
  g.updated_at,
  substring(g.content_yaml from 1 for 50) as yaml_preview
FROM aufinity e
LEFT JOIN portfolio_guides g ON g.company_id = e.id;
