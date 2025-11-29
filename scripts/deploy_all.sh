#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

source "$DIR/verify_env.sh"
"$DIR/migrate.sh"
"$DIR/deploy_functions.sh"

echo "🎉 All done. Next: start the web app in mv-intel-web with your .env vars set."
