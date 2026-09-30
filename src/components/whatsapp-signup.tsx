"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { completeWhatsappSignupAction } from "@/app/(gabbai)/actions";
import { adminCompleteWhatsappSignupAction } from "@/app/admin/actions";
import { Alert, Button } from "./ui";

type FB = {
  init: (o: object) => void;
  login: (cb: (r: { authResponse?: { code?: string } }) => void, o: object) => void;
};
declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

function loadSdk(appId: string, version: string): Promise<FB> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("sdk"));
    document.body.appendChild(s);
  });
}

/**
 * "Connect WhatsApp in one click" (Meta Embedded Signup). The synagogue logs in to Meta in a popup and picks
 * or creates its own WhatsApp Business account and number; we receive a code + account ids and finish on the server.
 */
export function WhatsAppSignupButton({
  config,
  target,
}: {
  config: { appId: string; configId: string; version: string };
  target: { type: "gabbai" } | { type: "admin"; tenantId: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string; code?: string }>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          session.current.wabaId = data.data?.waba_id;
          session.current.phoneNumberId = data.data?.phone_number_id;
          void maybeFinish();
        } else if (data.event === "CANCEL") {
          setBusy(false);
          setMsg({ ok: false, text: "החיבור בוטל לפני שהסתיים." });
        }
      } catch {
        /* not ours */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybeFinish() {
    const { wabaId, phoneNumberId, code } = session.current;
    if (!wabaId || !phoneNumberId || !code) return;
    session.current = {};
    const input = { wabaId, phoneNumberId, code };
    const r = await (target.type === "admin" ? adminCompleteWhatsappSignupAction(target.tenantId, input) : completeWhatsappSignupAction(input)).catch(() => ({
      ok: false as const,
      error: "אין חיבור לשרת. נסו שוב.",
    }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const failed = r.data?.templates.filter((t) => t.outcome === "failed") ?? [];
    setMsg({ ok: failed.length === 0, text: failed.length ? `וואטסאפ חובר, אך ${failed.length} תבניות לא נוצרו – ניתן לנסות שוב.` : r.message! });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={busy}
        className="bg-[#1f8f4e] hover:bg-[#187a42]"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const FB = await loadSdk(config.appId, config.version);
            FB.login(
              (resp) => {
                if (!resp.authResponse?.code) {
                  setBusy(false);
                  return setMsg({ ok: false, text: "החיבור לא הושלם בחלון של Meta." });
                }
                session.current.code = resp.authResponse.code;
                void maybeFinish();
              },
              { config_id: config.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } },
            );
          } catch {
            setBusy(false);
            setMsg({ ok: false, text: "לא ניתן לטעון את חלון החיבור של Meta. בדקו חסימת פרסומות/עוגיות ונסו שוב." });
          }
        }}
      >
        {busy ? "ממתין לסיום בחלון של Meta…" : "חיבור וואטסאפ עסקי בלחיצה"}
      </Button>
      <p className="text-xs text-slate-500">ייפתח חלון של Meta: נכנסים עם פייסבוק, בוחרים או יוצרים חשבון עסקי ומספר של בית הכנסת. החשבון והחיוב על ההודעות שייכים לבית הכנסת.</p>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
