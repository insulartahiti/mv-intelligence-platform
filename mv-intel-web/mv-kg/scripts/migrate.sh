#!/usr/bin/env bash
set -euo pipefail
echo "Applying SQL migrations..."
for f in supabase/migrations/*.sql; do
  echo "-> $f"
  psql "$DATABASE_URL" -v "ON_ERROR_STOP=1" -f "$f"
done
echo "Done."
