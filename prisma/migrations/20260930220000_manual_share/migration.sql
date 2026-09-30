-- Reminders the gabbai sends from his own WhatsApp (wa.me hand-off) are recorded with trigger 'manual_share'.
ALTER TABLE "OutboundMessage" DROP CONSTRAINT outbound_trigger;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT outbound_trigger CHECK (trigger IN ('auto', 'manual', 'manual_bulk', 'manual_share'));
