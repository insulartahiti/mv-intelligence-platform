
-- Find Aufinity ID
SELECT id, name, slug FROM graph.entities 
WHERE name ILIKE '%aufinity%' OR slug ILIKE '%aufinity%';
