-- Platform owner dashboard: aggregates per synagogue and per month. Counts and dates only –
-- never names, phones, amounts or any congregant field. SECURITY DEFINER because the admin has no
-- tenant context; access is limited to these fixed queries, and each returns nothing unless the
-- transaction runs in the platform-admin context.

CREATE OR REPLACE FUNCTION platform_tenant_stats()
RETURNS TABLE (tenant_id uuid, congregants bigint, pledges bigint, confirmed_payments bigint,
               first_pledge_at timestamp, first_payment_at timestamp, last_activity_at timestamp, messages_30d bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id,
    (SELECT count(*) FROM "Congregant" c WHERE c."tenantId" = t.id),
    (SELECT count(*) FROM "Pledge" p WHERE p."tenantId" = t.id),
    (SELECT count(*) FROM "Payment" y WHERE y."tenantId" = t.id AND y.status = 'confirmed'),
    (SELECT min(p."createdAt") FROM "Pledge" p WHERE p."tenantId" = t.id),
    (SELECT min(y."createdAt") FROM "Payment" y WHERE y."tenantId" = t.id AND y.status = 'confirmed'),
    (SELECT max(a."createdAt") FROM "AuditLog" a WHERE a."tenantId" = t.id),
    (SELECT count(*) FROM "OutboundMessage" m WHERE m."tenantId" = t.id AND m.status NOT IN ('scheduled', 'skipped')
       AND m."createdAt" > now() - interval '30 days')
  FROM "Tenant" t
  WHERE app_is_platform_admin()
$$;

CREATE OR REPLACE FUNCTION platform_monthly(p_months int)
RETURNS TABLE (month text, new_tenants bigint, confirmed_payments bigint, messages bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT to_char(d, 'YYYY-MM') AS ym
    FROM generate_series(date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1), date_trunc('month', now()), interval '1 month') d
  )
  SELECT m.ym,
    (SELECT count(*) FROM "Tenant" t WHERE to_char(t."createdAt", 'YYYY-MM') = m.ym),
    (SELECT count(*) FROM "Payment" y WHERE y.status = 'confirmed' AND to_char(y."createdAt", 'YYYY-MM') = m.ym),
    (SELECT count(*) FROM "OutboundMessage" o WHERE o.status NOT IN ('scheduled', 'skipped') AND to_char(o."createdAt", 'YYYY-MM') = m.ym)
  FROM m WHERE app_is_platform_admin() ORDER BY m.ym
$$;

-- What the platform admin did, across synagogues (the tenant-scoped audit policy hides it otherwise).
CREATE OR REPLACE FUNCTION platform_admin_activity(p_limit int)
RETURNS TABLE (id uuid, tenant_id uuid, actor_id text, action text, created_at timestamp)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a."tenantId", a."actorId", a.action, a."createdAt" FROM "AuditLog" a
  WHERE app_is_platform_admin() AND (a."actorType" = 'platform_admin' OR a.action = 'tenant.onboard')
  ORDER BY a."createdAt" DESC LIMIT least(greatest(p_limit, 1), 500)
$$;

REVOKE ALL ON FUNCTION platform_tenant_stats(), platform_monthly(int), platform_admin_activity(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_tenant_stats(), platform_monthly(int), platform_admin_activity(int) TO synagogue_app;
