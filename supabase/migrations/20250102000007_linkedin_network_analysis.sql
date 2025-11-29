-- Create LinkedIn network analysis table
CREATE TABLE IF NOT EXISTS linkedin_network_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_linkedin_analysis_contact_id ON linkedin_network_analysis(contact_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_analysis_created_at ON linkedin_network_analysis(created_at DESC);

-- Enable RLS
ALTER TABLE linkedin_network_analysis ENABLE ROW LEVEL SECURITY;

-- Create policy for linkedin_network_analysis
CREATE POLICY "linkedin_network_analysis_all" ON linkedin_network_analysis
  FOR ALL USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION trigger_update_linkedin_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_linkedin_analysis_updated_at
  BEFORE UPDATE ON linkedin_network_analysis
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_linkedin_analysis_updated_at();

-- Add LinkedIn profile fields to contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS linkedin_profile_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS linkedin_profile_url TEXT,
ADD COLUMN IF NOT EXISTS linkedin_connections_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS linkedin_last_synced TIMESTAMP WITH TIME ZONE;

-- Create indexes for LinkedIn fields
CREATE INDEX IF NOT EXISTS idx_contacts_linkedin_profile_id ON contacts(linkedin_profile_id);
CREATE INDEX IF NOT EXISTS idx_contacts_linkedin_connections_count ON contacts(linkedin_connections_count);

-- Create LinkedIn connections table for storing connection data
CREATE TABLE IF NOT EXISTS linkedin_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  connection_profile_id VARCHAR(255) NOT NULL,
  connection_name VARCHAR(255) NOT NULL,
  connection_title VARCHAR(255),
  connection_company VARCHAR(255),
  connection_industry VARCHAR(255),
  connection_location VARCHAR(255),
  connection_profile_url TEXT,
  connection_picture_url TEXT,
  mutual_connections_count INTEGER DEFAULT 0,
  connection_strength DECIMAL(3,2) DEFAULT 0.5,
  is_affinity_contact BOOLEAN DEFAULT FALSE,
  affinity_contact_id UUID REFERENCES contacts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, connection_profile_id)
);

-- Create indexes for LinkedIn connections
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_contact_id ON linkedin_connections(contact_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_profile_id ON linkedin_connections(connection_profile_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_affinity_contact ON linkedin_connections(affinity_contact_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_strength ON linkedin_connections(connection_strength DESC);
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_mutual ON linkedin_connections(mutual_connections_count DESC);

-- Enable RLS for LinkedIn connections
ALTER TABLE linkedin_connections ENABLE ROW LEVEL SECURITY;

-- Create policy for linkedin_connections
CREATE POLICY "linkedin_connections_all" ON linkedin_connections
  FOR ALL USING (true);

-- Create trigger for updated_at on LinkedIn connections
CREATE TRIGGER trigger_update_linkedin_connections_updated_at
  BEFORE UPDATE ON linkedin_connections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_linkedin_analysis_updated_at();

-- Create LinkedIn mutual connections table
CREATE TABLE IF NOT EXISTS linkedin_mutual_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  target_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  mutual_connection_profile_id VARCHAR(255) NOT NULL,
  mutual_connection_name VARCHAR(255) NOT NULL,
  mutual_connection_title VARCHAR(255),
  mutual_connection_company VARCHAR(255),
  mutual_connection_industry VARCHAR(255),
  mutual_connection_profile_url TEXT,
  connection_strength DECIMAL(3,2) DEFAULT 0.5,
  is_affinity_contact BOOLEAN DEFAULT FALSE,
  affinity_contact_id UUID REFERENCES contacts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, target_contact_id, mutual_connection_profile_id)
);

-- Create indexes for mutual connections
CREATE INDEX IF NOT EXISTS idx_mutual_connections_contact_id ON linkedin_mutual_connections(contact_id);
CREATE INDEX IF NOT EXISTS idx_mutual_connections_target_contact_id ON linkedin_mutual_connections(target_contact_id);
CREATE INDEX IF NOT EXISTS idx_mutual_connections_profile_id ON linkedin_mutual_connections(mutual_connection_profile_id);
CREATE INDEX IF NOT EXISTS idx_mutual_connections_strength ON linkedin_mutual_connections(connection_strength DESC);

-- Enable RLS for mutual connections
ALTER TABLE linkedin_mutual_connections ENABLE ROW LEVEL SECURITY;

-- Create policy for mutual connections
CREATE POLICY "linkedin_mutual_connections_all" ON linkedin_mutual_connections
  FOR ALL USING (true);

-- Create trigger for updated_at on mutual connections
CREATE TRIGGER trigger_update_mutual_connections_updated_at
  BEFORE UPDATE ON linkedin_mutual_connections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_linkedin_analysis_updated_at();
