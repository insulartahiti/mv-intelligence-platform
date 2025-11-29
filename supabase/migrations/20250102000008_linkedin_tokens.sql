-- Create LinkedIn tokens table for OAuth management
CREATE TABLE IF NOT EXISTS linkedin_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_linkedin_tokens_contact_id ON linkedin_tokens(contact_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_tokens_expires_at ON linkedin_tokens(expires_at);

-- Enable RLS
ALTER TABLE linkedin_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy for linkedin_tokens
CREATE POLICY "linkedin_tokens_all" ON linkedin_tokens
  FOR ALL USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION trigger_update_linkedin_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_linkedin_tokens_updated_at
  BEFORE UPDATE ON linkedin_tokens
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_linkedin_tokens_updated_at();
