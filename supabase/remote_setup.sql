-- Remote database setup script for MV Intelligence Platform
-- Run this in the Supabase Dashboard SQL Editor

-- Create simple schema without org requirements
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  source_url text,
  storage_path text,
  title text,
  created_by uuid,
  status text DEFAULT 'CAPTURING',
  slide_count integer,
  pdf_path text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  image_url text,
  text_content text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS artifacts_created_by_idx ON artifacts(created_by);
CREATE INDEX IF NOT EXISTS slides_artifact_id_idx ON slides(artifact_id);

-- Enable RLS on tables
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (allow all authenticated users)
CREATE POLICY artifacts_all ON artifacts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY slides_all ON slides FOR ALL USING (auth.uid() IS NOT NULL);

-- Create test user for authentication
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

-- Create test artifacts
INSERT INTO artifacts (id, kind, source_url, title, status, slide_count, created_at) VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'deck_capture', 'https://example.com/deck1', 'TechCorp Series A Pitch Deck', 'COMPLETED', 10, now()),
  ('550e8400-e29b-41d4-a716-446655440002', 'deck_capture', 'https://example.com/deck2', 'InnovateLabs Product Demo', 'COMPLETED', 8, now());

-- Create test slides
INSERT INTO slides (id, artifact_id, slide_number, image_url, text_content, created_at) VALUES 
  ('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 1, 'https://storage.example.com/slide1.jpg', 'Welcome to TechCorp Series A', now()),
  ('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 2, 'https://storage.example.com/slide2.jpg', 'Market Opportunity: $10B TAM', now()),
  ('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', 1, 'https://storage.example.com/slide2.jpg', 'InnovateLabs Product Overview', now());
