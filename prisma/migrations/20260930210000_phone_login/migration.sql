-- Congregant login by phone number: find the cards (and synagogue names) registered with a phone.
-- Used server-side only: before verification nothing is revealed to the browser; after a verified code
-- the names are shown so the congregant can choose a synagogue.
CREATE OR REPLACE FUNCTION find_cards_by_phone(p_phone text)
RETURNS TABLE (tenant_id uuid, tenant_name text, congregant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c."tenantId", t.name, c.id
  FROM "Congregant" c JOIN "Tenant" t ON t.id = c."tenantId"
  WHERE c.phone = p_phone
  ORDER BY t.name, c."createdAt"
$$;
REVOKE ALL ON FUNCTION find_cards_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_cards_by_phone(text) TO synagogue_app;
