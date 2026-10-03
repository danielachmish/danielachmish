import { SlidersHorizontal } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { parseSettings } from "@/server/settings";
import { Card } from "@/components/ui";
import { BehaviourForm } from "@/components/gabbai/policy-forms";

export default async function SettingsBehaviour() {
  const g = await requireGabbai();
  const t = await withContext(g.ctx, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId }, select: { settings: true } }));
  return (
    <Card title="התנהגות המערכת" icon={SlidersHorizontal}>
      <BehaviourForm initial={parseSettings(t.settings)} />
    </Card>
  );
}
