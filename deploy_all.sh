#!/usr/bin/env bash
set -euo pipefail

# MV Intelligence Platform deploy script
# Applies migrations and deploys Supabase Edge Functions

echo "==> Running migrations"
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  supabase db push --file "$f" || psql "$SUPABASE_DB_URL" -f "$f"
done

echo "==> Deploying functions"
for d in supabase/functions/*; do
  if [ -d "$d" ]; then
    fn=$(basename "$d")
    echo "Deploying function $fn"
    supabase functions deploy "$fn"
  fi
done

echo "==> Done."
