-- Add LinkedIn connections table
CREATE TABLE IF NOT EXISTS graph.linkedin_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_entity_id uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
    linkedin_profile_url text NOT NULL,
    connection_date timestamp with time zone,
    mutual_connections text[],
    connection_strength float DEFAULT 1.0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_person_entity_id 
    ON graph.linkedin_connections(person_entity_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_connections_linkedin_url 
    ON graph.linkedin_connections(linkedin_profile_url);

-- Add linkedin_first_degree flag to entities table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'linkedin_first_degree'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN linkedin_first_degree boolean DEFAULT false;
    END IF;
END $$;

-- Add linkedin_url to entities table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'linkedin_url'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN linkedin_url text;
    END IF;
END $$;

-- Add enrichment fields to entities table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'enrichment_data'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN enrichment_data jsonb DEFAULT '{}';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'employment_history'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN employment_history jsonb DEFAULT '[]';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'publications'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN publications jsonb DEFAULT '[]';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'areas_of_expertise'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN areas_of_expertise text[] DEFAULT '{}';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'enriched'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN enriched boolean DEFAULT false;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'graph' 
        AND table_name = 'entities' 
        AND column_name = 'last_enriched_at'
    ) THEN
        ALTER TABLE graph.entities 
        ADD COLUMN last_enriched_at timestamp with time zone;
    END IF;
END $$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_linkedin_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_linkedin_connections_updated_at
    BEFORE UPDATE ON graph.linkedin_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_linkedin_connections_updated_at();

-- Add RLS policies
ALTER TABLE graph.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for service role" ON graph.linkedin_connections
    FOR ALL USING (true);

-- Grant permissions
GRANT ALL ON graph.linkedin_connections TO service_role;
GRANT ALL ON graph.linkedin_connections TO authenticated;
