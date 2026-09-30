// Providers a synagogue can connect. Each synagogue connects ITS OWN receiving account – money goes straight
// to the synagogue; the platform never holds congregant money.
// status: available = adapter implemented · unverified = implemented but not verified against the provider's
// docs/sandbox (see docs/PROVIDER_SETUP.md) · planned = needs an adapter (send us the provider's API docs).

export type ProviderField = { key: string; label: string; secret: boolean };
export type ProviderDef = {
  id: string;
  kind: "payment" | "messaging";
  name: string;
  status: "available" | "unverified" | "planned";
  modes: ("fake" | "sandbox" | "live")[];
  accountLabel: string; // label of the routing id (terminal / phone number id)
  fields: ProviderField[];
  note?: string;
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "fake",
    kind: "payment",
    name: "סליקת דמה (בדיקות)",
    status: "available",
    modes: ["fake"],
    accountLabel: "מזהה חשבון דמה",
    fields: [{ key: "webhookSecret", label: "סוד חתימה (דמה)", secret: true }],
  },
  {
    id: "payplus",
    kind: "payment",
    name: "PayPlus",
    status: "unverified",
    modes: ["sandbox", "live"],
    accountLabel: "מזהה מסוף (Terminal UID)",
    fields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "paymentPageUid", label: "Payment page UID", secret: false },
    ],
    note: "המתאם נכתב אך טרם אומת מול התיעוד וסביבת הבדיקות של PayPlus.",
  },
  { id: "tranzila", kind: "payment", name: "Tranzila", status: "planned", modes: ["sandbox", "live"], accountLabel: "שם מסוף", fields: [] },
  { id: "cardcom", kind: "payment", name: "Cardcom", status: "planned", modes: ["sandbox", "live"], accountLabel: "מספר מסוף", fields: [] },
  { id: "grow", kind: "payment", name: "Grow (משולם)", status: "planned", modes: ["sandbox", "live"], accountLabel: "מזהה עמוד", fields: [] },
  { id: "nedarim_plus", kind: "payment", name: "נדרים פלוס", status: "planned", modes: ["sandbox", "live"], accountLabel: "מזהה מוסד", fields: [] },
  {
    id: "fake",
    kind: "messaging",
    name: "וואטסאפ דמה (בדיקות)",
    status: "available",
    modes: ["fake"],
    accountLabel: "מזהה חשבון דמה",
    fields: [],
  },
  {
    id: "whatsapp_cloud",
    kind: "messaging",
    name: "WhatsApp Business (Cloud API)",
    status: "unverified",
    modes: ["sandbox", "live"],
    accountLabel: "Phone number ID",
    fields: [{ key: "accessToken", label: "Access token", secret: true }],
    note: "שליחה אמיתית כבויה עד אישור תבניות ההודעה ב-Meta.",
  },
];

export function providersFor(kind: "payment" | "messaging", mode: string) {
  return PROVIDERS.filter((p) => p.kind === kind && (p.status === "planned" || p.modes.includes(mode as "fake")));
}

export function providerDef(kind: string, id: string) {
  return PROVIDERS.find((p) => p.kind === kind && p.id === id);
}
