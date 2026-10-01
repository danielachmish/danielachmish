import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./helpers";
import { bootstrapAdmin } from "@/server/admin/bootstrap";
import { prisma } from "@/server/db/client";

const resetMails = async (to: string) =>
  (await prisma.devFakeRecord.findMany({ where: { kind: "email" } })).filter((r) => (r.data as { to: string }).to === to).length;

beforeEach(truncateAll);

describe("first admin of a new deployment (ADMIN_EMAIL)", () => {
  it("creates a verified admin once and e-mails a link to choose a password", async () => {
    expect(await bootstrapAdmin("Owner@Example.test")).toBe("created");
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.test" } });
    expect(u).toMatchObject({ platformRole: "admin", emailVerified: true });
    expect(await resetMails("owner@example.test")).toBe(1);
    // every later deploy: nothing changes, no more mail
    expect(await bootstrapAdmin("owner@example.test")).toBe("unchanged");
    expect(await resetMails("owner@example.test")).toBe(1);
  });

  it("promotes an existing account with that address", async () => {
    await bootstrapAdmin("x@example.test");
    await prisma.user.update({ where: { email: "x@example.test" }, data: { platformRole: "none" } });
    expect(await bootstrapAdmin("x@example.test")).toBe("promoted");
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "x@example.test" } })).platformRole).toBe("admin");
  });
});
