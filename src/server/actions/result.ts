import { DomainError } from "../errors";

// Uniform result for server actions. Unexpected errors are logged without personal data
// and shown to the user as a generic, actionable message.
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.userMessage };
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error(JSON.stringify({ level: "error", where: "action", error: (e as Error)?.name, message: (e as Error)?.message?.slice(0, 200) }));
    return { ok: false, error: "אירעה תקלה והפעולה לא נשמרה. נסו שוב, ואם זה חוזר פנו לתמיכה." };
  }
}
