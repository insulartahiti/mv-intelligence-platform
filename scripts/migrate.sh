#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL first (see .env.example)."
  exit 1
fi

echo "📦 Applying migrations from $MIG_DIR"
shopt -s nullglob
for file in "$MIG_DIR"/*.sql; do
  echo "→ Running $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done
echo "✅ Migrations complete."
