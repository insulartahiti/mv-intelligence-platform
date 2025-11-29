#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Deploying Knowledge Graph Edge Functions..."

# Check if we're in the right directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check for required environment variables
if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
    echo "❌ Error: SUPABASE_PROJECT_REF environment variable is required"
    exit 1
fi

if [ -z "${AFFINITY_API_KEY:-}" ]; then
    echo "❌ Error: AFFINITY_API_KEY environment variable is required"
    exit 1
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "❌ Error: OPENAI_API_KEY environment variable is required"
    exit 1
fi

echo "📦 Deploying Edge Functions..."

# Deploy sync-affinity-data function
echo "  → sync-affinity-data"
supabase functions deploy sync-affinity-data --project-ref "$SUPABASE_PROJECT_REF"

# Deploy process-affinity-files function
echo "  → process-affinity-files"
supabase functions deploy process-affinity-files --project-ref "$SUPABASE_PROJECT_REF"

# Deploy hybrid-search function
echo "  → hybrid-search"
supabase functions deploy hybrid-search --project-ref "$SUPABASE_PROJECT_REF"

echo "🔐 Setting secrets..."

# Set required secrets
supabase secrets set \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  AFFINITY_API_KEY="$AFFINITY_API_KEY" \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  MV_WEBHOOK_SECRET="${MV_WEBHOOK_SECRET:-}" \
  --project-ref "$SUPABASE_PROJECT_REF"

echo "📊 Running database migration..."

# Apply the knowledge graph schema migration
supabase db push --project-ref "$SUPABASE_PROJECT_REF"

echo "✅ Knowledge Graph deployment completed!"
echo ""
echo "🎯 Next steps:"
echo "1. Visit /knowledge-graph in your web app"
echo "2. Click 'Sync All' to import data from Affinity"
echo "3. Click 'Process Files' to extract text and generate embeddings"
echo "4. Start searching your knowledge graph!"
echo ""
echo "📚 Available functions:"
echo "  - sync-affinity-data: Sync organizations, persons, interactions, and files"
echo "  - process-affinity-files: Extract text and generate embeddings"
echo "  - hybrid-search: Search across documents, contacts, and companies"
echo ""
echo "🔗 API endpoints:"
echo "  - POST /api/affinity/sync - Sync Affinity data"
echo "  - POST /api/knowledge-graph/search - Search knowledge graph"
echo "  - POST /api/knowledge-graph/process-files - Process files for embeddings"
