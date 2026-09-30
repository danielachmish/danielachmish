-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "overrideSoft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'auto';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "reminderDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4]::INTEGER[],
ADD COLUMN     "reminderHour" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "reminderMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminderSkipHolidays" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderTemplate" TEXT,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Tenant" ADD CONSTRAINT tenant_reminder_hour CHECK ("reminderHour" BETWEEN 0 AND 23),
  ADD CONSTRAINT tenant_reminder_minute CHECK ("reminderMinute" BETWEEN 0 AND 59),
  ADD CONSTRAINT tenant_reminder_days CHECK ("reminderDays" <@ ARRAY[0,1,2,3,4,5,6]),
  ADD CONSTRAINT tenant_reminder_delays CHECK ("reminderFirstDelayDays" BETWEEN 0 AND 365 AND "reminderIntervalDays" BETWEEN 1 AND 365);
ALTER TABLE "OutboundMessage" ADD CONSTRAINT outbound_trigger CHECK (trigger IN ('auto', 'manual', 'manual_bulk'));
ALTER TABLE "Tenant" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';
