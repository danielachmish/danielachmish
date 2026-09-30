-- The narrow SECURITY DEFINER routing functions run as the schema owner and must see rows across
-- tenants. FORCE ROW LEVEL SECURITY would apply policies to the owner as well, so it is removed.
-- RLS remains ENABLED and fully applies to the runtime role synagogue_app (not owner, no BYPASSRLS).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
