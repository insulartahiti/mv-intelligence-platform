#!/usr/bin/env bash
set -euo pipefail

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' .env | xargs)
fi

REQ_VARS=(
  DATABASE_URL
  SUPABASE_PROJECT_REF
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY
  AFFINITY_API_KEY
  MV_WEBHOOK_SECRET
)

missing=0
for v in "${REQ_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "❌ Missing required env var: $v"
    missing=1
  fi
done

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql not found. Install PostgreSQL client (psql)."
  missing=1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ supabase CLI not found. See: https://supabase.com/docs/guides/cli"
  missing=1
fi

if [[ $missing -ne 0 ]]; then
  echo "Aborting due to missing requirements."
  exit 1
fi

echo "✅ Environment and tooling look good."
