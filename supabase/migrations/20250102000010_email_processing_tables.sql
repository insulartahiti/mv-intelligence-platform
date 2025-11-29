-- Create email_analysis table for storing processed email data
CREATE TABLE IF NOT EXISTS email_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT,
  email_date TIMESTAMPTZ,
  analysis_data JSONB NOT NULL,
  company_links JSONB DEFAULT '[]'::jsonb,
  extracted_kpis JSONB DEFAULT '[]'::jsonb,
  insights JSONB DEFAULT '[]'::jsonb,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email_inbox table for managing the unified inbox
CREATE TABLE IF NOT EXISTS email_inbox (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  email_date TIMESTAMPTZ NOT NULL,
  content TEXT,
  html_content TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  portfolio_relevant BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email_attachments table for storing attachment data
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT NOT NULL,
  attachment_name TEXT NOT NULL,
  attachment_type TEXT NOT NULL,
  file_size BIGINT,
  content TEXT,
  extracted_text TEXT,
  analysis_data JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email_insights table for storing generated insights
CREATE TABLE IF NOT EXISTS email_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  actionable BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id),
  source TEXT DEFAULT 'email_analysis',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_analysis_email_id ON email_analysis(email_id);
CREATE INDEX IF NOT EXISTS idx_email_analysis_processed_at ON email_analysis(processed_at);
CREATE INDEX IF NOT EXISTS idx_email_analysis_company_links ON email_analysis USING GIN(company_links);

CREATE INDEX IF NOT EXISTS idx_email_inbox_status ON email_inbox(status);
CREATE INDEX IF NOT EXISTS idx_email_inbox_priority ON email_inbox(priority);
CREATE INDEX IF NOT EXISTS idx_email_inbox_portfolio_relevant ON email_inbox(portfolio_relevant);
CREATE INDEX IF NOT EXISTS idx_email_inbox_email_date ON email_inbox(email_date);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_type ON email_attachments(attachment_type);

CREATE INDEX IF NOT EXISTS idx_email_insights_email_id ON email_insights(email_id);
CREATE INDEX IF NOT EXISTS idx_email_insights_company_id ON email_insights(company_id);
CREATE INDEX IF NOT EXISTS idx_email_insights_priority ON email_insights(priority);
CREATE INDEX IF NOT EXISTS idx_email_insights_actionable ON email_insights(actionable);

-- Create RLS policies
ALTER TABLE email_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_insights ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_analysis
CREATE POLICY "Users can view email analysis" ON email_analysis
  FOR SELECT USING (true);

CREATE POLICY "Users can insert email analysis" ON email_analysis
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update email analysis" ON email_analysis
  FOR UPDATE USING (true);

-- RLS policies for email_inbox
CREATE POLICY "Users can view email inbox" ON email_inbox
  FOR SELECT USING (true);

CREATE POLICY "Users can insert email inbox" ON email_inbox
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update email inbox" ON email_inbox
  FOR UPDATE USING (true);

-- RLS policies for email_attachments
CREATE POLICY "Users can view email attachments" ON email_attachments
  FOR SELECT USING (true);

CREATE POLICY "Users can insert email attachments" ON email_attachments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update email attachments" ON email_attachments
  FOR UPDATE USING (true);

-- RLS policies for email_insights
CREATE POLICY "Users can view email insights" ON email_insights
  FOR SELECT USING (true);

CREATE POLICY "Users can insert email insights" ON email_insights
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update email insights" ON email_insights
  FOR UPDATE USING (true);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_analysis_updated_at 
  BEFORE UPDATE ON email_analysis 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_inbox_updated_at 
  BEFORE UPDATE ON email_inbox 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to process email queue
CREATE OR REPLACE FUNCTION process_email_queue()
RETURNS TABLE(processed_count INTEGER) AS $$
DECLARE
  email_record RECORD;
  processed_count INTEGER := 0;
BEGIN
  -- Process pending emails
  FOR email_record IN 
    SELECT * FROM email_inbox 
    WHERE status = 'pending' 
    ORDER BY priority DESC, created_at ASC 
    LIMIT 10
  LOOP
    -- Update status to processing
    UPDATE email_inbox 
    SET status = 'processing', updated_at = NOW()
    WHERE id = email_record.id;
    
    -- Here you would call the email processing API
    -- For now, just mark as processed
    UPDATE email_inbox 
    SET status = 'processed', processed_at = NOW(), updated_at = NOW()
    WHERE id = email_record.id;
    
    processed_count := processed_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT processed_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get portfolio-relevant emails
CREATE OR REPLACE FUNCTION get_portfolio_emails(limit_count INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID,
  subject TEXT,
  from_email TEXT,
  email_date TIMESTAMPTZ,
  priority TEXT,
  portfolio_relevant BOOLEAN,
  insights_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ei.id,
    ei.subject,
    ei.from_email,
    ei.email_date,
    ei.priority,
    ei.portfolio_relevant,
    COALESCE(COUNT(eins.id), 0)::INTEGER as insights_count
  FROM email_inbox ei
  LEFT JOIN email_insights eins ON ei.email_id = eins.email_id
  WHERE ei.portfolio_relevant = true
  GROUP BY ei.id, ei.subject, ei.from_email, ei.email_date, ei.priority, ei.portfolio_relevant
  ORDER BY ei.email_date DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;






