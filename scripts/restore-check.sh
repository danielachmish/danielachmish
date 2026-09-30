#!/usr/bin/env bash
# Restores a backup into a scratch database and proves that transactions, allocations and balances match.
# Usage: scripts/restore-check.sh backups/<file>.dump   (requires a role allowed to CREATE DATABASE)
set -euo pipefail
dump="$1"
source <(grep -E '^MIGRATION_DATABASE_URL=' .env)
src="$MIGRATION_DATABASE_URL"
dst="${src%/*}/synagogue_restore_check"
psql "$src" -qc "DROP DATABASE IF EXISTS synagogue_restore_check" -c "CREATE DATABASE synagogue_restore_check"
pg_restore --no-owner --exit-on-error --dbname="$dst" "$dump"

# Fingerprint: row counts, money sums and every card's computed debt/credit – straight from the ledger tables.
read -r -d '' Q <<'SQL' || true
WITH p AS (
  SELECT pl."congregantId" c, sum(pl."amountAgorot" + coalesce((SELECT sum("deltaAgorot") FROM "Adjustment" a WHERE a."pledgeId" = pl.id), 0)) eff
  FROM "Pledge" pl GROUP BY 1),
al AS (SELECT "congregantId" c, sum("amountAgorot") s FROM "Allocation" GROUP BY 1),
pay AS (SELECT "congregantId" c, sum("amountAgorot" - coalesce((SELECT sum(r."amountAgorot") FROM "Refund" r WHERE r."paymentId" = py.id), 0)) net
        FROM "Payment" py WHERE status = 'confirmed' GROUP BY 1)
SELECT md5(string_agg(line, '|' ORDER BY line)) FROM (
  SELECT 'counts:' || (SELECT count(*) FROM "Payment") || ',' || (SELECT count(*) FROM "Allocation") || ',' || (SELECT count(*) FROM "Pledge") || ',' || (SELECT count(*) FROM "Refund") line
  UNION ALL
  SELECT 'card:' || c.id || ':' || (coalesce(p.eff,0) - coalesce(al.s,0)) || ':' || (coalesce(pay.net,0) - coalesce(al.s,0))
  FROM "Congregant" c LEFT JOIN p ON p.c = c.id LEFT JOIN al ON al.c = c.id LEFT JOIN pay ON pay.c = c.id
) x;
SQL
a=$(psql "$src" -Atc "$Q"); b=$(psql "$dst" -Atc "$Q")
echo "source:   $a"; echo "restored: $b"
psql "$src" -qc "DROP DATABASE synagogue_restore_check"
[ "$a" = "$b" ] && echo "RESTORE OK – ledger fingerprint matches" || { echo "RESTORE MISMATCH"; exit 1; }
