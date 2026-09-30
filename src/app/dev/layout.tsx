import { notFound } from "next/navigation";
import { fakeAllowed } from "@/server/providers/guard";

// Development-only tools. 404 in production or when real providers are configured.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!fakeAllowed()) notFound();
  return (
    <div className="min-h-dvh">
      <div className="bg-amber-400 px-4 py-1 text-center text-sm font-semibold text-amber-950">סביבת פיתוח – ספקי דמה, ללא כסף אמיתי וללא הודעות אמיתיות</div>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}
