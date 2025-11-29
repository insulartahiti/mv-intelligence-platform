-- Create a simple test user for authentication (no org required)
-- This script should be run against the local database

-- First, ensure the auth schema exists and has the users table
CREATE SCHEMA IF NOT EXISTS auth;

-- Create the users table if it doesn't exist
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  encrypted_password text NOT NULL,
  email_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  raw_app_meta_data jsonb DEFAULT '{}',
  raw_user_meta_data jsonb DEFAULT '{}',
  is_super_admin boolean DEFAULT false,
  confirmation_token text DEFAULT '',
  email_change text DEFAULT '',
  email_change_token_new text DEFAULT '',
  recovery_token text DEFAULT ''
);

-- Insert test user
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
) ON CONFLICT (email) DO NOTHING;

-- Note: No org_id or member records needed with simple schema
-- The user can authenticate and use the system directly
