#!/usr/bin/env bash
# Load reference data (cities, areas, venues) into Supabase.
#
#   bash supabase/seed.sh
#
# Every seed file is idempotent, so re-running only adds what is missing.
# Run this AFTER supabase/push.sh has created the schema.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  echo "✗ .env not found." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source "$ROOT/.env"; set +a

if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL}" = "TODO" ]; then
  echo "✗ DATABASE_URL is not set in .env." >&2
  echo "  Supabase dashboard -> Connect -> Transaction pooler (port 6543)." >&2
  exit 1
fi

for f in "$ROOT"/supabase/seed/*.sql; do
  echo "→ $(basename "$f")"
  npx --yes supabase@latest db execute --db-url "$DATABASE_URL" --file "$f" 2>/dev/null \
    || psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo
echo "✓ seed complete"
echo
echo "  Live cities (offered during onboarding):"
psql "$DATABASE_URL" -tAc \
  "select '   · ' || name || ', ' || state from cities where is_live order by name;" \
  2>/dev/null || echo "   (install psql to print a summary, or check the dashboard)"
