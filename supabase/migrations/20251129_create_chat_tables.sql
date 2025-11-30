-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CONVERSATIONS TABLE
-- Stores top-level conversation metadata
CREATE TABLE IF NOT EXISTS graph.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT, -- Auto-generated or user-set title
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Optional if auth is enabled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb -- For storing workspace state, active filters, etc.
);

-- 2. MESSAGES TABLE
-- Stores individual turns in the conversation
CREATE TABLE IF NOT EXISTS graph.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES graph.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- RAG & Graph Context
    -- Stores the IDs of nodes that were cited/relevant for this turn
    relevant_node_ids TEXT[] DEFAULT ARRAY[]::TEXT[], 
    
    -- Stores the JSON structure of the graph slice shown for this turn
    -- (Optional: can be large, maybe store ref or lightweight version)
    graph_state_snapshot JSONB, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user ON graph.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON graph.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON graph.messages(created_at);

-- RLS Policies (Basic placeholder - assume authenticated user can access their own)
ALTER TABLE graph.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.messages ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (Development Mode) or refine based on your auth setup
CREATE POLICY "Enable all access for dev" ON graph.conversations FOR ALL USING (true);
CREATE POLICY "Enable all access for dev" ON graph.messages FOR ALL USING (true);

