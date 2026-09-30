#!/usr/bin/env bash
# Concatenates every migration plus the seed into supabase/ALL_IN_ONE.sql,
# so the whole database can be set up with a single paste into the Supabase
# SQL Editor.
#
#   bash supabase/build-all-in-one.sh
#
# Re-run this after changing anything under supabase/migrations or
# supabase/seed, or ALL_IN_ONE.sql goes stale.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/ALL_IN_ONE.sql"

{
  cat <<'HEADER'
-- ═══════════════════════════════════════════════════════════════════════════
-- GarbaTaal — COMPLETE DATABASE SETUP
--
-- Paste this WHOLE file into the Supabase SQL Editor and press Run. Once.
--
--   https://supabase.com/dashboard/project/ufnnymmxocwdlnzmhcpv/sql/new
--
-- Contains every migration plus the location seed, already in order:
--   0001 schema · 0002 RLS · 0003 functions · 0004 grants · seed cities/areas
--
-- Safe to re-run: enums are guarded, tables and indexes use IF NOT EXISTS,
-- policies and triggers are dropped first, and the seed uses ON CONFLICT.
--
-- GENERATED FILE — do not edit. Change supabase/migrations/* and run
--   bash supabase/build-all-in-one.sh
-- ═══════════════════════════════════════════════════════════════════════════
HEADER

  for f in "$ROOT"/supabase/migrations/*.sql "$ROOT"/supabase/seed/*.sql; do
    printf '\n\n-- #########################################################################\n'
    printf -- '-- ## %s\n' "$(basename "$f")"
    printf -- '-- #########################################################################\n\n'
    cat "$f"
  done
} > "$OUT"

echo "✓ $(wc -l < "$OUT") lines -> supabase/ALL_IN_ONE.sql"
