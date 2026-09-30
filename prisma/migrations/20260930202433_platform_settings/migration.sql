-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

GRANT SELECT, INSERT, UPDATE ON "PlatformSetting" TO synagogue_app;
ALTER TABLE "PlatformSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_setting_rw ON "PlatformSetting"
  USING (app_is_platform_admin() OR app_is_system()) WITH CHECK (app_is_platform_admin());

-- Operational health per synagogue: counts only, never names, phones or amounts.
CREATE OR REPLACE FUNCTION platform_health()
RETURNS TABLE (tenant_id uuid, pending_events bigint, exception_events bigint, stale_attempts bigint,
               unknown_messages bigint, failed_messages bigint, open_exception_tasks bigint, last_event_at timestamp)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id,
    (SELECT count(*) FROM "ProviderEvent" e WHERE e."tenantId" = t.id AND e.status = 'received' AND e."receivedAt" < now() - interval '10 minutes'),
    (SELECT count(*) FROM "ProviderEvent" e WHERE e."tenantId" = t.id AND e.status = 'exception' AND e."receivedAt" > now() - interval '30 days'),
    (SELECT count(*) FROM "PaymentAttempt" a WHERE a."tenantId" = t.id AND a.status = 'open' AND a."createdAt" < now() - interval '1 hour'),
    (SELECT count(*) FROM "OutboundMessage" m WHERE m."tenantId" = t.id AND m.status = 'unknown' AND m."createdAt" > now() - interval '7 days'),
    (SELECT count(*) FROM "OutboundMessage" m WHERE m."tenantId" = t.id AND m.status = 'failed' AND m."createdAt" > now() - interval '7 days'),
    (SELECT count(*) FROM "Task" k WHERE k."tenantId" = t.id AND k.status = 'open' AND k.kind IN ('provider_exception', 'reconciliation', 'receipt_failed')),
    (SELECT max(e."receivedAt") FROM "ProviderEvent" e WHERE e."tenantId" = t.id)
  FROM "Tenant" t
$$;
REVOKE ALL ON FUNCTION platform_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_health() TO synagogue_app;
