-- CreateTable
CREATE TABLE "CongregantAccount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "inviteId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "CongregantAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppInvite" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentToEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CongregantAccount_tenantId_congregantId_idx" ON "CongregantAccount"("tenantId", "congregantId");

-- CreateIndex
CREATE INDEX "CongregantAccount_userId_idx" ON "CongregantAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppInvite_tokenHash_key" ON "AppInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AppInvite_tenantId_congregantId_idx" ON "AppInvite"("tenantId", "congregantId");

-- AddForeignKey
ALTER TABLE "CongregantAccount" ADD CONSTRAINT "CongregantAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────── app accounts for congregants: grants, invariants, RLS ─────────
GRANT SELECT, INSERT, UPDATE ON "CongregantAccount", "AppInvite" TO synagogue_app;

-- One active link per (card, user); a revoked link can be re-created by a new invitation.
CREATE UNIQUE INDEX congregant_account_active ON "CongregantAccount" ("congregantId", "userId") WHERE "revokedAt" IS NULL;
ALTER TABLE "CongregantAccount" ADD CONSTRAINT "CongregantAccount_card_fkey"
  FOREIGN KEY ("tenantId", "congregantId") REFERENCES "Congregant"("tenantId", "id");
ALTER TABLE "AppInvite" ADD CONSTRAINT "AppInvite_card_fkey"
  FOREIGN KEY ("tenantId", "congregantId") REFERENCES "Congregant"("tenantId", "id");

ALTER TABLE "CongregantAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppInvite" ENABLE ROW LEVEL SECURITY;

-- Gabbai (tenant context) sees the links of his cards; portal context only its own cards;
-- a signed-in user (user context) sees only his own links, across synagogues, to pick a synagogue.
CREATE POLICY congregant_account_tenant ON "CongregantAccount"
  USING ("tenantId" = app_tenant_id() AND app_card_visible("congregantId"))
  WITH CHECK ("tenantId" = app_tenant_id() AND app_card_visible("congregantId"));
CREATE POLICY congregant_account_self ON "CongregantAccount" FOR SELECT
  USING (app_tenant_id() IS NULL AND "userId" = app_user_id());

CREATE POLICY tenant_isolation ON "AppInvite" USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Routing before the tenant is known (invitation landing page): ids only, never business data.
CREATE OR REPLACE FUNCTION resolve_app_invite(p_token_hash text)
RETURNS TABLE (invite_id uuid, tenant_id uuid, congregant_id uuid, expires_at timestamp, used_at timestamp, revoked_at timestamp)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i."tenantId", i."congregantId", i."expiresAt", i."usedAt", i."revokedAt" FROM "AppInvite" i WHERE i."tokenHash" = p_token_hash
$$;
REVOKE ALL ON FUNCTION resolve_app_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_app_invite(text) TO synagogue_app;
