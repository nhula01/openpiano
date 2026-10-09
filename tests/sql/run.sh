#!/usr/bin/env bash
# Runs every Supabase migration and verification script against a throwaway local
# PostgreSQL database with a small Supabase stand-in (tests/sql/supabase-stub.sql).
# Usage: PGHOST=/path/to/socket PGPORT=54329 PGUSER=postgres tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=openpiano_sqltest_$$
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
run(){ echo "· $1"; PGOPTIONS="-c client_min_messages=warning" psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null; }
run tests/sql/supabase-stub.sql
for f in supabase-setup supabase-community supabase-community-catalog supabase-profiles \
         supabase-profile-photos supabase-note-addons supabase-addon-layers supabase-social; do
  [ -f "scripts/$f.sql" ] && run "scripts/$f.sql"
done
for f in scripts/*-verify.sql; do run "$f"; done
echo "All SQL checks passed."
