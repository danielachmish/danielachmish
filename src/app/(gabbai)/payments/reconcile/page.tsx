import { Scale } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ReconcileReport } from "@/components/gabbai/csv-tools";

export default function ReconcilePage() {
  return (
    <>
      <PageHeader
        title="התאמה מול דוח חברת הסליקה"
        icon={Scale}
        subtitle="מורידים מממשק חברת הסליקה דוח עסקאות (CSV) לתקופה, מעלים אותו כאן, והמערכת משווה לעסקאות שנקלטו. הבדלים נפתחים כמשימה. היתרות אינן משתנות מהדוח."
      />
      <ReconcileReport />
    </>
  );
}
