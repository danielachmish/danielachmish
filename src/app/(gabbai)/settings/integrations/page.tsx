import { MessageCircle, Wallet } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { integrationStatus } from "@/server/integrations/connect";
import { providersFor } from "@/server/integrations/catalog";
import { modeFor } from "@/server/env";
import { embeddedSignupConfig } from "@/server/integrations/whatsapp-signup";
import { Card } from "@/components/ui";
import { IntegrationPanel } from "@/components/integration-panel";

export default async function SettingsIntegrations() {
  const g = await requireGabbai();
  const current = await withContext(g.ctx, (tx) => integrationStatus(tx));
  return (
    <>
      <Card title="חיבור סליקה (החשבון של בית הכנסת)" icon={Wallet}>
        <IntegrationPanel kind="payment" providers={providersFor("payment", modeFor("payment"))} current={current.payment} target={{ type: "gabbai" }} />
      </Card>
      <Card title="חיבור וואטסאפ רשמי" icon={MessageCircle}>
        <IntegrationPanel kind="messaging" providers={providersFor("messaging", modeFor("messaging"))} current={current.messaging} target={{ type: "gabbai" }} embeddedSignup={embeddedSignupConfig()} />
      </Card>
    </>
  );
}
