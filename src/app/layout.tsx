import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isDemo } from "@/server/env";

export const metadata: Metadata = {
  title: "ניהול נדרים לבית הכנסת",
  description: "ניהול נדרים, תשלומים ותזכורות",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh">
        {isDemo() && (
          <div role="note" className="bg-amber-300 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
            אתר הדגמה – נתוני דמו בלבד, ללא כסף אמיתי וללא הודעות אמיתיות ·{" "}
            <a href="/dev/inbox" className="underline">
              תיבת הודעות וקודים
            </a>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
