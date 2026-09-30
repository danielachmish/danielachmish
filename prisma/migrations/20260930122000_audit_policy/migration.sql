-- Platform admin and system jobs may WRITE audit rows about a tenant (onboarding, gabbai replacement,
-- subscription changes), but reading a tenant's audit trail still requires that tenant's context.
DROP POLICY audit_rw ON "AuditLog";
CREATE POLICY audit_read ON "AuditLog" FOR SELECT
  USING ("tenantId" = app_tenant_id() OR ("tenantId" IS NULL AND (app_is_platform_admin() OR app_is_system())));
CREATE POLICY audit_insert ON "AuditLog" FOR INSERT
  WITH CHECK ("tenantId" = app_tenant_id() OR app_is_platform_admin() OR app_is_system());
