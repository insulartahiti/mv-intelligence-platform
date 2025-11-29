-- Create organization and user with proper JWT claims
DO $$
DECLARE
  org_id uuid;
  user_id uuid;
BEGIN
  -- Create organization
  INSERT INTO organizations (id, name) 
  VALUES (gen_random_uuid(), 'MV Intelligence') 
  RETURNING id INTO org_id;
  
  -- Create user (this will be done through Supabase Auth, but we need to set up the profile)
  -- For now, we'll create a placeholder that you can replace with your actual user
  
  -- Create member record for existing user (replace 'your-email@domain.com' with actual email)
  -- This assumes you already created a user through the dashboard
  
  -- Update the user's JWT claims to include org_id
  -- You'll need to do this through the Supabase dashboard or API
  -- For now, let's create a test user with proper setup
  
  RAISE NOTICE 'Organization created with ID: %', org_id;
  RAISE NOTICE 'Please create a user through Supabase Auth and then update their JWT claims to include org_id: %', org_id;
END $$;
