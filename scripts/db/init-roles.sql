-- Creates the two database roles used by the application.
-- synagogue_owner: owns the schema and runs migrations.
-- synagogue_app:   runtime role. NOT superuser, NOT owner, NO BYPASSRLS.
-- Passwords here are for local development only; production passwords come from the secret store.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synagogue_owner') THEN
    CREATE ROLE synagogue_owner LOGIN PASSWORD 'owner_dev_password' NOSUPERUSER NOBYPASSRLS CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synagogue_app') THEN
    CREATE ROLE synagogue_app LOGIN PASSWORD 'app_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
