#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres+PostGIS container.
#
# WHY: 850 lines of SQL with enums, PostGIS, RLS policies, triggers and
# plpgsql functions will not be right first time. Finding a syntax error here
# costs 30 seconds; finding it in a live Supabase project mid-festival costs
# a lot more.
#
# Requires Docker Desktop to be RUNNING (not just installed).
#   bash supabase/test/verify-migrations.sh

set -euo pipefail

NAME=gt-sqltest
PORT=55432
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ starting postgres+postgis…"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "$PORT":5432 \
  postgis/postgis:16-3.4 >/dev/null

echo -n "→ waiting for readiness"
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo " ok"

run() {
  echo "→ applying $(basename "$1")"
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$1"
}

run "$ROOT/supabase/test/00_auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f"; done

echo
echo "→ sanity checks"
docker exec -i "$NAME" psql -U postgres -d postgres -q <<'SQL'
\echo '  tables:'
select '    ' || count(*) || ' tables' from pg_tables where schemaname = 'public';
\echo '  RLS coverage (any row here is a table with RLS OFF — must be empty):'
select '    ' || tablename from pg_tables
 where schemaname = 'public'
   and tablename not in (select relname from pg_class where relrowsecurity);
\echo '  bitmask helper:'
select '    shared_nights(0b111000000, 0b011000000) = ' || shared_nights(448, 192);
\echo '  contact detection:'
select '    "call me 9876543210" -> ' || looks_like_contact('call me 9876543210');
select '    "nine eight seven"   -> ' || looks_like_contact('nine eight seven');
select '    "pay 500 advance"    -> ' || mentions_money('pay 500 advance');
SQL

echo
echo "✓ all migrations applied cleanly"
