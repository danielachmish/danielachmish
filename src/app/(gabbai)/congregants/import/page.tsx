import { FileUp } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/gabbai/import-wizard";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="ייבוא מתפללים מקובץ CSV"
        icon={FileUp}
        subtitle="בוחרים קובץ, ממפים עמודות, בודקים תצוגה מקדימה ורק אז מייבאים. שורות לא נמזגות לפי שם; מזהה חיצוני מונע ייבוא כפול. יתרת פתיחה נרשמת כתנועה."
      />
      <ImportWizard />
    </>
  );
}
