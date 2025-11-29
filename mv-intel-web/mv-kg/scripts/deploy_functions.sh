#!/usr/bin/env bash
set -euo pipefail
echo "Deploying Supabase Edge Functions..."
for d in supabase/functions/*; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  [[ "$name" == "_shared" ]] && continue
  echo "-> $name"
  supabase functions deploy "$name" --project-ref "$SUPABASE_PROJECT_REF"
done
echo "Setting secrets..."
supabase secrets set   SUPABASE_URL="$SUPABASE_URL"   SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"   SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"   OPENAI_API_KEY="$OPENAI_API_KEY"   --project-ref "$SUPABASE_PROJECT_REF"
echo "Done."
