-- Extension Integration Tables
-- This migration creates tables for Supabase-based extension communication

-- Extension status table (single row)
CREATE TABLE IF NOT EXISTS extension_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  connected BOOLEAN DEFAULT FALSE,
  version TEXT,
  capabilities TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capture requests table
CREATE TABLE IF NOT EXISTS capture_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  title TEXT,
  organization_id INTEGER,
  deal_id INTEGER,
  user_id TEXT DEFAULT 'anonymous',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capture results table
CREATE TABLE IF NOT EXISTS capture_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES capture_requests(id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
  slide_count INTEGER DEFAULT 0,
  file_url TEXT,
  analysis_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_capture_requests_status ON capture_requests(status);
CREATE INDEX IF NOT EXISTS idx_capture_requests_created_at ON capture_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_capture_results_request_id ON capture_results(request_id);

-- Insert initial extension status
INSERT INTO extension_status (id, connected, version, capabilities) 
VALUES (1, FALSE, '0.1.0', '{"deck_capture", "slide_extraction", "pdf_generation"}')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE extension_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_results ENABLE ROW LEVEL SECURITY;

-- Create policies for extension status (public read, service role write)
CREATE POLICY "Extension status is publicly readable" ON extension_status
  FOR SELECT USING (true);

CREATE POLICY "Service role can update extension status" ON extension_status
  FOR ALL USING (auth.role() = 'service_role');

-- Create policies for capture requests (public read/write for extension)
CREATE POLICY "Capture requests are publicly accessible" ON capture_requests
  FOR ALL USING (true);

-- Create policies for capture results (public read/write for extension)
CREATE POLICY "Capture results are publicly accessible" ON capture_results
  FOR ALL USING (true);
