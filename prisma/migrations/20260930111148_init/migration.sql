-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "platformRole" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "reminderFirstDelayDays" INTEGER NOT NULL DEFAULT 7,
    "reminderIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'head_gabbai',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportGrant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Congregant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "externalRef" TEXT,
    "notes" TEXT,
    "messagingOptOut" BOOLEAN NOT NULL DEFAULT false,
    "messagingOptOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Congregant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPermission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'self',
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ContactPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pledge" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pledge',
    "amountAgorot" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "pledgeDate" DATE NOT NULL,
    "dueDate" DATE,
    "category" TEXT,
    "description" TEXT,
    "internalNote" TEXT,
    "clientOpId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pledgeId" UUID NOT NULL,
    "deltaAgorot" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "encryptedSecrets" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "integrationAccountId" UUID NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "pledgeIds" UUID[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdVia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentRequestId" UUID NOT NULL,
    "providerPageRef" TEXT NOT NULL,
    "paymentUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastProviderStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "provider" TEXT,
    "providerEnvironment" TEXT,
    "providerAccountId" TEXT,
    "providerTransactionId" TEXT,
    "integrationAccountId" UUID,
    "paymentRequestId" UUID,
    "reportedBy" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "clientOpId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "pledgeId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "provider" TEXT,
    "providerEnvironment" TEXT,
    "providerAccountId" TEXT,
    "providerRefundId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "integrationAccountId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "authenticated" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resultNote" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnroutedEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnroutedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "skipReason" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "body" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "congregantId" UUID,
    "paymentId" UUID,
    "providerEventId" UUID,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "pausesReminders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalLink" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "congregantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaaSSubscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "planCode" TEXT NOT NULL DEFAULT 'standard',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "messagesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaaSSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaaSInvoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "status" TEXT NOT NULL DEFAULT 'open',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaaSInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaaSCharge" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerChargeId" TEXT NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "recordedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaaSCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "SupportGrant_tenantId_idx" ON "SupportGrant"("tenantId");

-- CreateIndex
CREATE INDEX "SupportGrant_granteeUserId_idx" ON "SupportGrant"("granteeUserId");

-- CreateIndex
CREATE INDEX "Congregant_tenantId_phone_idx" ON "Congregant"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Congregant_tenantId_lastName_idx" ON "Congregant"("tenantId", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Congregant_tenantId_id_key" ON "Congregant"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Congregant_tenantId_externalRef_key" ON "Congregant"("tenantId", "externalRef");

-- CreateIndex
CREATE INDEX "ContactPermission_tenantId_phone_idx" ON "ContactPermission"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "ContactPermission_tenantId_congregantId_idx" ON "ContactPermission"("tenantId", "congregantId");

-- CreateIndex
CREATE INDEX "Consent_tenantId_congregantId_channel_createdAt_idx" ON "Consent"("tenantId", "congregantId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "Pledge_tenantId_congregantId_pledgeDate_idx" ON "Pledge"("tenantId", "congregantId", "pledgeDate");

-- CreateIndex
CREATE UNIQUE INDEX "Pledge_tenantId_id_key" ON "Pledge"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Pledge_tenantId_congregantId_id_key" ON "Pledge"("tenantId", "congregantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Pledge_tenantId_clientOpId_key" ON "Pledge"("tenantId", "clientOpId");

-- CreateIndex
CREATE INDEX "Adjustment_tenantId_pledgeId_idx" ON "Adjustment"("tenantId", "pledgeId");

-- CreateIndex
CREATE INDEX "IntegrationAccount_tenantId_kind_status_idx" ON "IntegrationAccount"("tenantId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccount_tenantId_id_key" ON "IntegrationAccount"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenantId_congregantId_status_idx" ON "PaymentRequest"("tenantId", "congregantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_tenantId_id_key" ON "PaymentRequest"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_tenantId_idempotencyKey_key" ON "PaymentRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_paymentRequestId_idx" ON "PaymentAttempt"("tenantId", "paymentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_tenantId_providerPageRef_key" ON "PaymentAttempt"("tenantId", "providerPageRef");

-- CreateIndex
CREATE INDEX "Payment_tenantId_congregantId_status_idx" ON "Payment"("tenantId", "congregantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_id_key" ON "Payment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_congregantId_id_key" ON "Payment"("tenantId", "congregantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerEnvironment_providerAccountId_prov_key" ON "Payment"("provider", "providerEnvironment", "providerAccountId", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_clientOpId_key" ON "Payment"("tenantId", "clientOpId");

-- CreateIndex
CREATE INDEX "Allocation_tenantId_paymentId_idx" ON "Allocation"("tenantId", "paymentId");

-- CreateIndex
CREATE INDEX "Allocation_tenantId_pledgeId_idx" ON "Allocation"("tenantId", "pledgeId");

-- CreateIndex
CREATE INDEX "Refund_tenantId_paymentId_idx" ON "Refund"("tenantId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_provider_providerEnvironment_providerAccountId_provi_key" ON "Refund"("provider", "providerEnvironment", "providerAccountId", "providerRefundId");

-- CreateIndex
CREATE INDEX "ProviderEvent_tenantId_status_idx" ON "ProviderEvent"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_tenantId_provider_dedupeKey_key" ON "ProviderEvent"("tenantId", "provider", "dedupeKey");

-- CreateIndex
CREATE INDEX "Outbox_status_availableAt_idx" ON "Outbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_tenantId_congregantId_kind_createdAt_idx" ON "OutboundMessage"("tenantId", "congregantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_tenantId_status_scheduledFor_idx" ON "OutboundMessage"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_tenantId_idempotencyKey_key" ON "OutboundMessage"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_congregantId_status_idx" ON "Task"("tenantId", "congregantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalLink_tokenHash_key" ON "PersonalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalLink_tenantId_congregantId_idx" ON "PersonalLink"("tenantId", "congregantId");

-- CreateIndex
CREATE INDEX "OtpChallenge_tenantId_linkId_createdAt_idx" ON "OtpChallenge"("tenantId", "linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_tenantId_kind_fileHash_key" ON "ImportBatch"("tenantId", "kind", "fileHash");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaaSSubscription_tenantId_key" ON "SaaSSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SaaSInvoice_subscriptionId_periodStart_key" ON "SaaSInvoice"("subscriptionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "SaaSCharge_provider_providerChargeId_key" ON "SaaSCharge"("provider", "providerChargeId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_tenantId_congregantId_fkey" FOREIGN KEY ("tenantId", "congregantId") REFERENCES "Congregant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_tenantId_pledgeId_fkey" FOREIGN KEY ("tenantId", "pledgeId") REFERENCES "Pledge"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_tenantId_congregantId_fkey" FOREIGN KEY ("tenantId", "congregantId") REFERENCES "Congregant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_tenantId_integrationAccountId_fkey" FOREIGN KEY ("tenantId", "integrationAccountId") REFERENCES "IntegrationAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tenantId_paymentRequestId_fkey" FOREIGN KEY ("tenantId", "paymentRequestId") REFERENCES "PaymentRequest"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_congregantId_fkey" FOREIGN KEY ("tenantId", "congregantId") REFERENCES "Congregant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tenantId_congregantId_paymentId_fkey" FOREIGN KEY ("tenantId", "congregantId", "paymentId") REFERENCES "Payment"("tenantId", "congregantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tenantId_congregantId_pledgeId_fkey" FOREIGN KEY ("tenantId", "congregantId", "pledgeId") REFERENCES "Pledge"("tenantId", "congregantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_tenantId_paymentId_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "Payment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSSubscription" ADD CONSTRAINT "SaaSSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSInvoice" ADD CONSTRAINT "SaaSInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SaaSSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaaSInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
