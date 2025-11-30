-- Verification: Check if search_entities function exists
SELECT routine_name, routine_type, routine_schema
FROM information_schema.routines 
WHERE routine_name = 'search_entities';

-- If it exists, show its parameters
SELECT 
  p.parameter_name,
  p.parameter_mode,
  p.data_type,
  p.ordinal_position
FROM information_schema.parameters p
WHERE p.specific_name IN (
  SELECT r.specific_name
  FROM information_schema.routines r
  WHERE r.routine_name = 'search_entities'
)
ORDER BY p.ordinal_position;
