-- Get the organization UUID
SELECT 
  id as org_uuid,
  name as org_name,
  created_at
FROM organizations 
ORDER BY created_at DESC 
LIMIT 1;
