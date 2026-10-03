export const SUB_LABEL: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "תקופת חסד", suspended: "מושעה", cancelled: "מבוטל" };
export const subTone = (s?: string | null) => (s === "active" ? "green" : s === "trial" ? "blue" : s === "suspended" || s === "cancelled" ? "red" : "amber") as "green" | "blue" | "red" | "amber";
export const ADMIN_ACTION: Record<string, string> = {
  "tenant.onboard": "בית כנסת הצטרף",
  "tenant.replace_head_gabbai": "הוחלף גבאי ראשי",
  "subscription.status": "שונה מצב מנוי",
  "subscription.manual_payment": "נרשם תשלום מנוי ידני",
  "integration.connect": "חובר חשבון",
  "integration.replace": "הוחלף חשבון",
  "integration.disconnect": "נותק חשבון",
  "support.view_ledger": "צפייה בנתונים בהרשאת תמיכה",
  "platform.settings": "שונו הגדרות מערכת",
};
const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const shortMonth = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
