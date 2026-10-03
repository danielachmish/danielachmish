"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

const ITEMS = [
  { href: "/settings", label: "פרטים ומנוי" },
  { href: "/settings/reminders", label: "תזכורות" },
  { href: "/settings/behaviour", label: "התנהגות המערכת" },
  { href: "/settings/integrations", label: "חיבורים" },
  { href: "/settings/export", label: "ייצוא" },
  { href: "/settings/support", label: "תמיכה" },
];

export function SettingsTabs() {
  return <Tabs items={ITEMS} active={usePathname()} />;
}
