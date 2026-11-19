#!/usr/bin/env bash
# Testa as migrações + RLS num Postgres local descartável (sem Supabase).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
dir="$(mktemp -d)"; port=54329
if [ "$(id -u)" = 0 ]; then
  chown postgres "$dir"; run() { su postgres -c "$*"; }
  cp "$here"/../migrations/*.sql "$here"/*.sql "$dir/" && chmod 644 "$dir"/*.sql
else run() { bash -c "$*"; }; fi
trap 'run "$PGBIN/pg_ctl -D $dir/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
run "$PGBIN/initdb -D $dir/data -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $dir/data -o '-p $port -k $dir' -l $dir/log -w start >/dev/null"
psqlc() { run "psql -X -q -h $dir -p $port -d postgres -v ON_ERROR_STOP=1 $*"; }
src="$here/.."; [ "$(id -u)" = 0 ] && src="$dir"
psqlc "-f $src/stub.sql"
for f in 0001_schema 0002_functions 0003_security; do psqlc "-f $src/$f.sql" || { echo "FALHA em $f"; exit 1; }; done
[ "$(id -u)" = 0 ] || src="$here"
psqlc "-f $src/rls.sql" 2>&1 | grep -E "NOTICE|ERROR|FALHOU|DEVERIA|ERRO" | sed 's/^psql:[^ ]* //'
