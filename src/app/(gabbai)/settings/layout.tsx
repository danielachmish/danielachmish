import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

// Each settings topic is its own tab (sub-page) instead of one long page.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="הגדרות" icon={Settings2} subtitle="כל מה שקורה במערכת – אתם מחליטים אם, מתי ואיך." />
      <SettingsTabs />
      {children}
    </>
  );
}
