import { test, expect } from "@playwright/test";
import { ownerQuery } from "./helpers";
import { createHmac } from "node:crypto";

test("inbound WhatsApp '1' from the shared number is answered per synagogue account by the worker", async ({ request }) => {
  const send = async (account: string, id: string) => {
    const raw = JSON.stringify({ account, messages: [{ from: "+972501111111", text: "1", id }] });
    const sig = createHmac("sha256", "dev-messaging-secret").update(raw).digest("hex");
    return request.post("/api/providers/messaging/fake/webhook", { data: raw, headers: { "content-type": "application/json", "x-fake-signature": sig } });
  };
  expect((await send("wa-demo-1", `e2e-${Date.now()}-a`)).status()).toBe(200);
  expect((await send("wa-demo-2", `e2e-${Date.now()}-b`)).status()).toBe(200);
  await expect
    .poll(async () => (await ownerQuery<{ n: number }>(`SELECT count(*)::int n FROM "DevFakeRecord" WHERE kind='message' AND data->>'to'='+972501111111'`))[0]!.n, { timeout: 60_000 })
    .toBe(2);
  const msgs = await ownerQuery<{ text: string; from: string }>(`SELECT data->>'text' text, data->>'from' "from" FROM "DevFakeRecord" WHERE kind='message' AND data->>'to'='+972501111111'`);
  expect(msgs.find((m) => m.from === "wa-demo-1")!.text).toContain("180");
  expect(msgs.find((m) => m.from === "wa-demo-2")!.text).toContain("360");
});

test("unsigned webhook is rejected", async ({ request }) => {
  const r = await request.post("/api/providers/messaging/fake/webhook", { data: { account: "wa-demo-1", messages: [] } });
  expect(r.status()).toBe(401);
});
