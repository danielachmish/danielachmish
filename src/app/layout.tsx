import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { isDemo } from "@/server/env";

export const metadata: Metadata = {
  title: "ניהול נדרים לבית הכנסת",
  description: "ניהול נדרים, תשלומים ותזכורות",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "נדרים", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1b2b58" };

const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-rubik", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-dvh">
        {isDemo() && (
          <div role="note" className="bg-gold-300 px-4 py-1.5 text-center text-xs font-medium text-slate-900 sm:text-sm">
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
