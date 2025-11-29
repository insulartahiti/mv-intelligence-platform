-- Create a test user for authentication
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  gen_random_uuid(),
  'test@mvintel.com',
  crypt('testpassword123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Test User"}',
  false,
  '',
  '',
  '',
  ''
);

-- Create an organization
INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'MV Intelligence Test Org');

-- Get the user and org IDs
DO $$
DECLARE
  user_id uuid;
  org_id uuid;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = 'test@mvintel.com';
  SELECT id INTO org_id FROM organizations WHERE name = 'MV Intelligence Test Org';
  
  -- Create a member record
  INSERT INTO members (user_id, org_id, role) VALUES (user_id, org_id, 'admin');
  
  -- Update the user's JWT claims to include org_id
  UPDATE auth.users 
  SET raw_app_meta_data = jsonb_set(
    raw_app_meta_data, 
    '{org_id}', 
    to_jsonb(org_id)
  )
  WHERE id = user_id;
END $$;
