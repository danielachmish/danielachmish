import { afterEach, describe, expect, it } from "vitest";
import { asTenant, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { issuePersonalLink, requestOtp } from "@/server/portal/links";
import { prisma } from "@/server/db/client";

afterEach(() => {
  process.env.OTP_CHANNEL = "fake";
});

describe("verification code through the synagogue's WhatsApp", () => {
  it("sends the code via the synagogue's messaging account", async () => {
    await truncateAll();
    process.env.OTP_CHANNEL = "whatsapp";
    const t = await makeTenant();
    const c = await makeCongregant(t, { phone: "+972541234567" });
    await asTenant(t, (tx) => tx.integrationAccount.create({ data: { tenantId: t, kind: "messaging", provider: "fake", environment: "fake", externalAccountId: "wa-otp" } }));
    const { token } = await asTenant(t, (tx) => issuePersonalLink(tx, t, c.id, gabbai().id));
    await requestOtp(token);
    const msg = await prisma.devFakeRecord.findFirstOrThrow({ where: { kind: "message" } });
    expect((msg.data as { to: string; text: string }).to).toBe("+972541234567");
    expect((msg.data as { text: string }).text).toMatch(/קוד האימות שלך: \d{6}/);
  });

  it("without a WhatsApp connection the request fails clearly (no silent success)", async () => {
    await truncateAll();
    process.env.OTP_CHANNEL = "whatsapp";
    const t = await makeTenant();
    const c = await makeCongregant(t, { phone: "+972541234568" });
    const { token } = await asTenant(t, (tx) => issuePersonalLink(tx, t, c.id, gabbai().id));
    await expect(requestOtp(token)).rejects.toThrow(/no active WhatsApp/);
  });
});
