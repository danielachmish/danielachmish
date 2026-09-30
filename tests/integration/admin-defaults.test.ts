import { beforeEach, describe, expect, it } from "vitest";
import { makeCongregant, truncateAll } from "./helpers";
import { withContext } from "@/server/db/context";
import { saveReminderDefaults, saveSettingsDefaults, BUILTIN_REMINDER_DEFAULTS } from "@/server/admin/defaults";
import { onboardTenant, adminOverview } from "@/server/admin/tenants";
import { prisma } from "@/server/db/client";

const admin = { type: "platform_admin" as const, id: "admin-1" };
const asAdmin = <T>(fn: Parameters<typeof withContext<T>>[1]) => withContext({ kind: "platform_admin", userId: "admin-1" }, fn);
let n = 0;
const newGabbai = async () => {
  const id = `g-${++n}`;
  await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  return id;
};

beforeEach(truncateAll);

describe("platform defaults for new synagogues", () => {
  it("new synagogues start from the owner's defaults; existing ones are untouched", async () => {
    const before = await onboardTenant(admin, { name: "ישן", headGabbaiUserId: await newGabbai() });
    await asAdmin((tx) => saveReminderDefaults(tx, "admin-1", { ...BUILTIN_REMINDER_DEFAULTS, days: [1, 3], hour: 19, minute: 30, template: "שלום {שם}, {סכום}: {קישור}" }));
    await asAdmin((tx) => saveSettingsDefaults(tx, "admin-1", { portalPartialPayment: false, personalLinkDays: 14 }));
    const after = await onboardTenant(admin, { name: "חדש", headGabbaiUserId: await newGabbai() });
    const [a, b] = await asAdmin((tx) => Promise.all([tx.tenant.findUniqueOrThrow({ where: { id: before.id } }), tx.tenant.findUniqueOrThrow({ where: { id: after.id } })]));
    expect(a.reminderHour).toBe(10);
    expect(b).toMatchObject({ reminderDays: [1, 3], reminderHour: 19, reminderMinute: 30, reminderTemplate: "שלום {שם}, {סכום}: {קישור}" });
    expect(b.settings).toMatchObject({ portalPartialPayment: false, personalLinkDays: 14 });
  });

  it("invalid defaults are refused; only the platform admin can write them", async () => {
    await expect(asAdmin((tx) => saveReminderDefaults(tx, "a", { ...BUILTIN_REMINDER_DEFAULTS, template: "בלי קישור {שם}" }))).rejects.toMatchObject({ code: "bad_template" });
    await expect(
      withContext({ kind: "system" }, (tx) => tx.platformSetting.create({ data: { key: "x", value: {} } })),
    ).rejects.toThrow();
  });

  it("health view returns counts only, no congregant data", async () => {
    const t = await onboardTenant(admin, { name: "בריאות", headGabbaiUserId: await newGabbai() });
    await makeCongregant(t.id, { firstName: "פרטי" });
    const o = await adminOverview("admin-1");
    expect(o.health.find((h) => h.tenantId === t.id)).toMatchObject({ pendingEvents: 0, openExceptionTasks: 0 });
    expect(JSON.stringify(o)).not.toContain("פרטי");
  });
});
