export const TASK_LABEL: Record<string, string> = {
  inquiry: "בירור חוב",
  external_payment: "דיווח תשלום לאישור",
  provider_exception: "חריג סליקה / הודעות",
  reconciliation: "הבדל בהתאמה",
  receipt_failed: "קבלה שנכשלה",
};
export const MSG_STATUS: Record<string, string> = {
  scheduled: "מתוזמנת",
  skipped: "לא נשלחה",
  sending: "בשליחה",
  accepted: "התקבלה אצל הספק",
  delivered: "נמסרה",
  read: "נקראה",
  failed: "נכשלה",
  unknown: "מצב לא ידוע",
  handed_off: "נפתחה בוואטסאפ של הגבאי",
};
export const SKIP_REASON: Record<string, string> = {
  no_debt: "אין חוב",
  no_phone: "אין טלפון",
  no_consent: "אין הסכמה",
  opted_out: "ביקש להפסיק",
  open_inquiry_or_report: "בירור או דיווח פתוח",
  pending_external_payment: "תשלום ממתין לאישור",
  open_payment_request: "בקשת תשלום פתוחה",
  messaging_not_connected: "וואטסאפ לא מחובר",
  quota_exhausted: "המכסה נוצלה",
  subscription_inactive: "המנוי אינו פעיל",
};
