#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
FUNC_DIR="$ROOT/supabase/functions"

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Set SUPABASE_PROJECT_REF first (see .env.example)."
  exit 1
fi

# Prepare secrets for the project
echo "🔐 Setting Supabase Function secrets (project: $SUPABASE_PROJECT_REF)"
# Build secrets list only from set vars
secrets=(
  "SUPABASE_URL=$SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
  "OPENAI_API_KEY=$OPENAI_API_KEY"
  "MV_WEBHOOK_SECRET=${MV_WEBHOOK_SECRET:-}"
)
# Optionals if set
if [[ -n "${AFFINITY_API_KEY:-}" ]]; then secrets+=("AFFINITY_API_KEY=$AFFINITY_API_KEY"); fi
if [[ -n "${AFFINITY_BASE_URL:-}" ]]; then secrets+=("AFFINITY_BASE_URL=$AFFINITY_BASE_URL"); fi

# Join with space
joined=""
for s in "${secrets[@]}"; do
  joined+="$s "
done
supabase secrets set $joined --project-ref "$SUPABASE_PROJECT_REF"

echo "🚀 Deploying functions from $FUNC_DIR"
shopt -s nullglob
for f in "$FUNC_DIR"/*; do
  name="$(basename "$f")"
  if [[ -d "$f" ]]; then
    echo "→ supabase functions deploy $name"
    supabase functions deploy "$name" --project-ref "$SUPABASE_PROJECT_REF"
  fi
done
echo "✅ Functions deployed."
