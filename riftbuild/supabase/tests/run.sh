#!/usr/bin/env bash
# Runs migrations + RLS tests on a throwaway database.
# Local: uses the Postgres 16 cluster (pg_ctlcluster). CI: set PGHOST/PGUSER/PGPASSWORD for the service container.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${PGHOST:-}" ]]; then
  if command -v pg_ctlcluster >/dev/null && ! pg_lsclusters | grep -q "16 *main.*online"; then
    pg_ctlcluster 16 main start
  fi
  PSQL=(sudo -u postgres psql)
  [[ "$(id -un)" == "postgres" ]] && PSQL=(psql)
  command -v sudo >/dev/null || PSQL=(su postgres -c psql --)
else
  PSQL=(psql)
fi

DB="riftbuild_test_$$"
run() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -q "$@"; }
run -d postgres -c "create database $DB"
trap 'run -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

run -d "$DB" -f tests/stubs.sql
for migration in migrations/*.sql; do
  run -d "$DB" -f "$migration"
done
run -d "$DB" -f tests/rls.test.sql
