import type { Tx } from "./db/client";
import type { Actor } from "./db/context";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(
  tx: Tx,
  tenantId: string | null,
  actor: Actor,
  action: string,
  entity?: { type: string; id: string },
  data?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: { tenantId, actorType: actor.type, actorId: actor.id, action, entityType: entity?.type, entityId: entity?.id, data },
  });
}
