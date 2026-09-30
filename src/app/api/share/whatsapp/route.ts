import { z } from "zod";
import { gabbaiSession } from "@/server/auth/session";
import { shareReminderViaWhatsApp } from "@/server/reminders/share";
import { DomainError } from "@/server/errors";

// Form POST (opened in a new tab) → prepares the reminder and redirects to the gabbai's own WhatsApp.
// A real form submission (not fetch) keeps the navigation synchronous, so phones do not block it as a popup.
function page(message: string, status = 400) {
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>שליחה מהוואטסאפ</title><body style="font-family:system-ui,Arial;padding:24px;line-height:1.6">
<p>${message.replace(/[<>&]/g, "")}</p><p><a href="javascript:window.close()">סגירה</a></p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  // CSRF: only accept submissions from our own pages. With "Referrer-Policy: no-referrer" browsers send
  // "Origin: null" on form navigations, so the Fetch Metadata header is the primary check.
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const base = process.env.APP_BASE_URL;
  const sameOrigin = site === "same-origin" || (!!origin && origin !== "null" && !!base && new URL(base).origin === origin);
  if (!sameOrigin) return page("הבקשה נדחתה.", 403);
  const g = await gabbaiSession();
  if (!g) return page("נדרשת התחברות מחדש.", 401);
  const form = await req.formData();
  const id = z.uuid().safeParse(form.get("congregantId"));
  if (!id.success) return page("בקשה לא תקינה.");
  try {
    const { url } = await shareReminderViaWhatsApp(g.ctx, id.data, g.userId);
    return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return page(e.userMessage, e.status);
    console.error(JSON.stringify({ level: "error", where: "whatsapp-share", error: (e as Error).name }));
    return page("אירעה תקלה. נסו שוב.", 500);
  }
}
