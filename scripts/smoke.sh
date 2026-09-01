#!/usr/bin/env bash
# End to end smoke test against a running instance.
#   BASE=http://localhost:3000 ADMIN_PASSWORD=... ./scripts/smoke.sh
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

say() { printf '\n== %s\n' "$1"; }

say 'health'
curl -fsS "$BASE/api/health"

say 'landing page carries the creed'
curl -fsS "$BASE/" | grep -q "Il camper é il miglior amico dell'uomo"
curl -fsS "$BASE/" | grep -q "Il camper é sacro"
echo 'ok'

say 'the API rejects anonymous callers'
test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/vehicles")" = 401
test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/users")" = 401
echo 'ok'

say 'admin login'
curl -fsS -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE/api/auth/login"

say 'admin can list users and campers'
curl -fsS -b "$JAR" "$BASE/api/admin/users" > /dev/null
curl -fsS -b "$JAR" "$BASE/api/vehicles"

say 'the to-do list and the destinations answer'
curl -fsS -b "$JAR" "$BASE/api/tasks" > /dev/null
curl -fsS -b "$JAR" "$BASE/api/destinations" > /dev/null
echo 'ok'

say 'the new views are served'
for view in tasks destinations; do
  test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$view")" = 200
done
echo 'ok'

echo
echo 'Smoke test passed.'
