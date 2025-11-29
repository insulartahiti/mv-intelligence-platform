-- MV Intelligence Platform - Production Seed Data
-- This file contains only essential data for production use
-- No dummy/mock data included

-- Create production organization
INSERT INTO orgs (id, name, created_at) VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'Master Ventures', now())
ON CONFLICT (id) DO NOTHING;

-- Create production user profile
INSERT INTO profiles (id, org_id, email, full_name, created_at) VALUES 
  ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'admin@masterventures.com', 'Admin User', now())
ON CONFLICT (id) DO NOTHING;

-- Note: Companies, contacts, and other data will be populated through:
-- 1. Affinity API integration
-- 2. Email processing system
-- 3. User interactions
-- 4. Real data imports