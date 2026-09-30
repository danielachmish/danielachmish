-- CreateTable
CREATE TABLE "DevFakeRecord" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevFakeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevFakeRecord_kind_createdAt_idx" ON "DevFakeRecord"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevFakeRecord_kind_key_key" ON "DevFakeRecord"("kind", "key");
GRANT SELECT, INSERT, UPDATE ON "DevFakeRecord" TO synagogue_app;
