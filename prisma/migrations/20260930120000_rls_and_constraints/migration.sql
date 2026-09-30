-- Tenant isolation, privileges and money invariants.
-- The runtime role synagogue_app is not the owner and has no BYPASSRLS, so these policies always apply to it.
-- Context is set per transaction with set_config(..., true) (transaction-local) by src/server/db/context.ts.

-- ───────── context helpers ─────────
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '') $$;
CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on' $$;
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;
-- When set (portal context), restricts rows to the congregant cards the verified phone may see.
CREATE OR REPLACE FUNCTION app_portal_congregants() RETURNS uuid[] LANGUAGE sql STABLE AS
$$ SELECT CASE WHEN coalesce(current_setting('app.portal_congregants', true), '') = '' THEN NULL
               ELSE string_to_array(current_setting('app.portal_congregants', true), ',')::uuid[] END $$;
CREATE OR REPLACE FUNCTION app_card_visible(c uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_portal_congregants() IS NULL OR c = ANY(app_portal_congregants()) $$;

-- ───────── privileges ─────────
GRANT USAGE ON SCHEMA public TO synagogue_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification", "rateLimit" TO synagogue_app;
GRANT SELECT, INSERT, UPDATE ON "Tenant", "Membership", "SupportGrant", "Congregant", "ContactPermission",
  "IntegrationAccount", "PaymentRequest", "PaymentAttempt", "ProviderEvent", "Outbox", "OutboundMessage", "Task",
  "PersonalLink", "OtpChallenge", "PortalSession", "SaaSSubscription", "SaaSInvoice", "SupportCase" TO synagogue_app;
-- Append-only ledger & audit tables: no UPDATE / DELETE for the runtime role.
GRANT SELECT, INSERT ON "Consent", "Adjustment", "Allocation", "Refund", "ImportBatch", "AuditLog", "UnroutedEvent", "SaaSCharge" TO synagogue_app;
-- Pledge amounts never change in place (use Adjustment). Only descriptive columns are updatable.
GRANT SELECT, INSERT ON "Pledge" TO synagogue_app;
GRANT UPDATE ("category", "description", "internalNote", "dueDate") ON "Pledge" TO synagogue_app;
-- Payments: only the approval workflow columns are updatable; amount/provider identity are immutable.
GRANT SELECT, INSERT ON "Payment" TO synagogue_app;
GRANT UPDATE ("status", "approvedBy", "approvedAt", "rejectedReason") ON "Payment" TO synagogue_app;
-- Portal sessions / OTP rows may be deleted on logout / cleanup.
GRANT DELETE ON "PortalSession", "OtpChallenge" TO synagogue_app;

-- ───────── invariants ─────────
ALTER TABLE "Pledge" ADD CONSTRAINT pledge_amount_positive CHECK ("amountAgorot" > 0),
  ADD CONSTRAINT pledge_currency CHECK (currency = 'ILS'),
  ADD CONSTRAINT pledge_kind CHECK (kind IN ('pledge', 'opening_balance'));
ALTER TABLE "Adjustment" ADD CONSTRAINT adjustment_nonzero CHECK ("deltaAgorot" <> 0),
  ADD CONSTRAINT adjustment_reason CHECK (length(trim(reason)) > 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amountAgorot" > 0),
  ADD CONSTRAINT payment_currency CHECK (currency = 'ILS'),
  ADD CONSTRAINT payment_method CHECK (method IN ('card', 'cash', 'transfer', 'check')),
  ADD CONSTRAINT payment_status CHECK (status IN ('confirmed', 'pending_approval', 'rejected')),
  ADD CONSTRAINT payment_card_identity CHECK (method <> 'card' OR ("provider" IS NOT NULL AND "providerEnvironment" IS NOT NULL AND "providerAccountId" IS NOT NULL AND "providerTransactionId" IS NOT NULL));
ALTER TABLE "Allocation" ADD CONSTRAINT allocation_nonzero CHECK ("amountAgorot" <> 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_amount_positive CHECK ("amountAgorot" > 0);
ALTER TABLE "PaymentRequest" ADD CONSTRAINT request_amount_positive CHECK ("amountAgorot" > 0),
  ADD CONSTRAINT request_currency CHECK (currency = 'ILS');
ALTER TABLE "IntegrationAccount" ADD CONSTRAINT integration_env CHECK (environment IN ('fake', 'sandbox', 'live'));

CREATE UNIQUE INDEX membership_one_active_head ON "Membership" ("tenantId") WHERE active AND role = 'head_gabbai';
CREATE UNIQUE INDEX integration_route_unique ON "IntegrationAccount" (kind, provider, environment, "externalAccountId") WHERE status <> 'replaced';

-- Allocation -> Pledge/Payment use composite (tenantId, congregantId, id) FKs declared in schema.prisma,
-- so a payment can only be allocated to a pledge of the same tenant and the same card.

-- ───────── row level security ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['SupportGrant','ContactPermission','Consent','Congregant','Pledge','Adjustment','IntegrationAccount',
    'PaymentRequest','PaymentAttempt','Payment','Allocation','Refund','ProviderEvent','Outbox','OutboundMessage','Task',
    'PersonalLink','OtpChallenge','PortalSession','ImportBatch','AuditLog','Membership','Tenant','SaaSSubscription',
    'SaaSInvoice','SaaSCharge','SupportCase','UnroutedEvent']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Plain tenant-scoped tables (no congregant card dimension).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['SupportGrant','PaymentAttempt','ProviderEvent','Outbox','PersonalLink','OtpChallenge','PortalSession','ImportBatch']
  LOOP
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id())', t);
  END LOOP;
END $$;

-- Card-scoped tables: tenant + (in portal context) the authorised card(s) only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Congregant','ContactPermission','Consent','Pledge','Payment','PaymentRequest','OutboundMessage','Allocation']
  LOOP
    EXECUTE format('CREATE POLICY tenant_card_isolation ON %I USING ("tenantId" = app_tenant_id() AND app_card_visible(%s)) WITH CHECK ("tenantId" = app_tenant_id() AND app_card_visible(%s))',
      t, CASE WHEN t = 'Congregant' THEN 'id' ELSE '"congregantId"' END, CASE WHEN t = 'Congregant' THEN 'id' ELSE '"congregantId"' END);
  END LOOP;
END $$;

CREATE POLICY tenant_card_isolation ON "Adjustment"
  USING ("tenantId" = app_tenant_id() AND EXISTS (SELECT 1 FROM "Pledge" p WHERE p.id = "Adjustment"."pledgeId"))
  WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY tenant_card_isolation ON "Refund"
  USING ("tenantId" = app_tenant_id() AND EXISTS (SELECT 1 FROM "Payment" p WHERE p.id = "Refund"."paymentId"))
  WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY tenant_isolation ON "Task"
  USING ("tenantId" = app_tenant_id() AND ("congregantId" IS NULL OR app_card_visible("congregantId")))
  WITH CHECK ("tenantId" = app_tenant_id());

-- Tenant: members see their own tenant; platform admin sees tenant metadata (no congregant data – separate tables).
CREATE POLICY tenant_read ON "Tenant" FOR SELECT
  USING (id = app_tenant_id() OR app_is_platform_admin()
         OR EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = "Tenant".id AND m."userId" = app_user_id() AND m.active));
CREATE POLICY tenant_write ON "Tenant" FOR INSERT WITH CHECK (app_is_platform_admin());
CREATE POLICY tenant_update ON "Tenant" FOR UPDATE USING (id = app_tenant_id() OR app_is_platform_admin());

CREATE POLICY membership_read ON "Membership" FOR SELECT
  USING ("tenantId" = app_tenant_id() OR "userId" = app_user_id() OR app_is_platform_admin());
CREATE POLICY membership_write ON "Membership" FOR INSERT WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id());
CREATE POLICY membership_update ON "Membership" FOR UPDATE USING (app_is_platform_admin() OR "tenantId" = app_tenant_id());

-- Integration accounts: tenant context, or platform admin (status monitoring; secrets are encrypted).
CREATE POLICY integration_admin_read ON "IntegrationAccount" FOR SELECT USING (app_is_platform_admin());
CREATE POLICY integration_tenant ON "IntegrationAccount" USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- SaaS billing: visible to the tenant (its own subscription) and to the platform admin; written by admin/system.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['SaaSSubscription','SaaSInvoice','SaaSCharge']
  LOOP
    EXECUTE format('CREATE POLICY saas_read ON %I FOR SELECT USING ("tenantId" = app_tenant_id() OR app_is_platform_admin() OR app_is_system())', t);
    EXECUTE format('CREATE POLICY saas_insert ON %I FOR INSERT WITH CHECK (app_is_platform_admin() OR app_is_system())', t);
    EXECUTE format('CREATE POLICY saas_update ON %I FOR UPDATE USING (app_is_platform_admin() OR app_is_system() OR "tenantId" = app_tenant_id())', t);
  END LOOP;
END $$;

CREATE POLICY support_case ON "SupportCase"
  USING (app_is_platform_admin() OR app_is_system() OR "tenantId" = app_tenant_id())
  WITH CHECK (app_is_platform_admin() OR app_is_system() OR "tenantId" = app_tenant_id());
CREATE POLICY audit_rw ON "AuditLog"
  USING ("tenantId" = app_tenant_id() OR ("tenantId" IS NULL AND (app_is_platform_admin() OR app_is_system())))
  WITH CHECK ("tenantId" = app_tenant_id() OR ("tenantId" IS NULL AND (app_is_platform_admin() OR app_is_system())));
CREATE POLICY unrouted_rw ON "UnroutedEvent"
  USING (app_is_system() OR app_is_platform_admin()) WITH CHECK (app_is_system());

-- ───────── narrow SECURITY DEFINER lookups (routing before a tenant is known) ─────────
-- These return only routing identifiers, never business data.
CREATE OR REPLACE FUNCTION resolve_integration_account(p_kind text, p_provider text, p_environment text, p_external_id text)
RETURNS TABLE (id uuid, tenant_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i."tenantId", i.status FROM "IntegrationAccount" i
  WHERE i.kind = p_kind AND i.provider = p_provider AND i.environment = p_environment AND i."externalAccountId" = p_external_id
  ORDER BY (i.status = 'replaced'), i."createdAt" DESC
$$;

CREATE OR REPLACE FUNCTION resolve_personal_link(p_token_hash text)
RETURNS TABLE (link_id uuid, tenant_id uuid, congregant_id uuid, expires_at timestamp, revoked_at timestamp)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l."tenantId", l."congregantId", l."expiresAt", l."revokedAt" FROM "PersonalLink" l WHERE l."tokenHash" = p_token_hash
$$;

CREATE OR REPLACE FUNCTION resolve_portal_session(p_token_hash text)
RETURNS TABLE (session_id uuid, tenant_id uuid, link_id uuid, phone text, expires_at timestamp)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s."tenantId", s."linkId", s.phone, s."expiresAt" FROM "PortalSession" s WHERE s."tokenHash" = p_token_hash
$$;

-- Worker fan-out: list tenant ids only.
CREATE OR REPLACE FUNCTION list_tenant_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM "Tenant" ORDER BY id $$;

REVOKE ALL ON FUNCTION resolve_integration_account(text, text, text, text), resolve_personal_link(text),
  resolve_portal_session(text), list_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_integration_account(text, text, text, text), resolve_personal_link(text),
  resolve_portal_session(text), list_tenant_ids(), app_tenant_id(), app_user_id(), app_is_platform_admin(),
  app_is_system(), app_portal_congregants(), app_card_visible(uuid) TO synagogue_app;
