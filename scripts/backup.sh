#!/usr/bin/env bash
# Full logical backup (schema + data + grants/RLS) with the owner role. Output: backups/<timestamp>.dump
set -euo pipefail
source <(grep -E '^MIGRATION_DATABASE_URL=' .env)
mkdir -p backups
out="backups/$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --dbname="$MIGRATION_DATABASE_URL" --file="$out"
echo "$out"
