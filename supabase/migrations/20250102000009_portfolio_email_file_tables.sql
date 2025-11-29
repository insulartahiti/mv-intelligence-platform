-- Create portfolio_emails table
CREATE TABLE IF NOT EXISTS portfolio_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  google_workspace_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT,
  email_date TIMESTAMPTZ,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'forwarded' CHECK (status IN ('forwarded', 'pending', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create portfolio_files table
CREATE TABLE IF NOT EXISTS portfolio_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_portfolio_emails_company_id ON portfolio_emails(company_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_emails_google_workspace_id ON portfolio_emails(google_workspace_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_emails_created_at ON portfolio_emails(created_at);

CREATE INDEX IF NOT EXISTS idx_portfolio_files_company_id ON portfolio_files(company_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_files_file_type ON portfolio_files(file_type);
CREATE INDEX IF NOT EXISTS idx_portfolio_files_uploaded_at ON portfolio_files(uploaded_at);

-- Create RLS policies
ALTER TABLE portfolio_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for portfolio_emails
CREATE POLICY "Users can view portfolio emails for their companies" ON portfolio_emails
  FOR SELECT USING (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can insert portfolio emails" ON portfolio_emails
  FOR INSERT WITH CHECK (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can update portfolio emails" ON portfolio_emails
  FOR UPDATE USING (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can delete portfolio emails" ON portfolio_emails
  FOR DELETE USING (true); -- Adjust based on your auth requirements

-- RLS policies for portfolio_files
CREATE POLICY "Users can view portfolio files for their companies" ON portfolio_files
  FOR SELECT USING (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can insert portfolio files" ON portfolio_files
  FOR INSERT WITH CHECK (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can update portfolio files" ON portfolio_files
  FOR UPDATE USING (true); -- Adjust based on your auth requirements

CREATE POLICY "Users can delete portfolio files" ON portfolio_files
  FOR DELETE USING (true); -- Adjust based on your auth requirements

-- Create storage bucket for portfolio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio-files', 'portfolio-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for portfolio-files bucket
CREATE POLICY "Users can view portfolio files" ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolio-files');

CREATE POLICY "Users can upload portfolio files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'portfolio-files');

CREATE POLICY "Users can update portfolio files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'portfolio-files');

CREATE POLICY "Users can delete portfolio files" ON storage.objects
  FOR DELETE USING (bucket_id = 'portfolio-files');

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_portfolio_emails_updated_at 
  BEFORE UPDATE ON portfolio_emails 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_files_updated_at 
  BEFORE UPDATE ON portfolio_files 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
