#!/usr/bin/env bash
# Apply migrations to the real Supabase project. No Docker, nothing installed.
#
#   bash supabase/push.sh              # apply anything not yet applied
#   bash supabase/push.sh --dry-run    # show what WOULD be applied
#
# This is the everyday path. Verification happens in CI (GitHub runs Postgres
# for us); supabase/test/verify-migrations.sh is an OPTIONAL local pre-flight
# for when you want to check a risky migration before pushing.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="ufnnymmxocwdlnzmhcpv"

if [ ! -f "$ROOT/.env" ]; then
  echo "✗ .env not found. Copy .env.example and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source "$ROOT/.env"; set +a

if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL}" = "TODO" ]; then
  echo "✗ DATABASE_URL is not set in .env." >&2
  echo "  Supabase dashboard → Connect → Transaction pooler (port 6543)." >&2
  exit 1
fi

case "${DATABASE_URL}" in
  *:6543*) ;;
  *) echo "⚠ DATABASE_URL is not on port 6543." >&2
     echo "  Use the Supavisor pooler; the direct port exhausts the connection limit." >&2 ;;
esac

if [ "${1:-}" = "--dry-run" ]; then
  echo "Would apply, in order:"
  for f in "$ROOT"/supabase/migrations/*.sql; do echo "  · $(basename "$f")"; done
  echo
  echo "Against project: $PROJECT_REF"
  exit 0
fi

echo "→ linking to $PROJECT_REF"
npx --yes supabase@latest link --project-ref "$PROJECT_REF"

echo "→ pushing migrations"
npx --yes supabase@latest db push

echo
echo "✓ schema is live on $PROJECT_REF"
echo "  Next: bash supabase/seed.sh to load cities, areas and venues."
