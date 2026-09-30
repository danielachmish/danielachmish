#!/bin/sh
# Creates roles and the dev/test databases on first start of the postgres container.
set -e
psql -v ON_ERROR_STOP=1 -U postgres -f /docker-entrypoint-initdb.d/init-roles.sql.inc
for db in synagogue synagogue_test; do
  psql -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE $db OWNER synagogue_owner"
  psql -v ON_ERROR_STOP=1 -U postgres -d $db -c "REVOKE ALL ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO synagogue_owner; GRANT USAGE ON SCHEMA public TO synagogue_app;"
done
